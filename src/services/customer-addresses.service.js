const prisma = require("../database/prisma");
const { utcNow } = require("../utils/date");
const { resolveGeoHierarchy } = require("../utils/generic-payload");
const {
  addressesEqual,
  defaultAddressFromCustomer,
  extractAdditionalAddressesInput,
  extractJobCustomerAddress,
  formatAddressDto,
  formatCustomerAddressDropdownRow,
  hasAddressContent,
  normalizeAddressRecord,
  normalizeAddressText,
  toNullableInt
} = require("../utils/customer-address");

const CUSTOMER_ADDRESS_INCLUDE = {
  countries: { select: { recno: true, name: true } },
  cities: { select: { recno: true, name: true } },
  areas: { select: { recno: true, name: true } }
};

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

async function resolveAddressGeo(item, auth, tenantid) {
  const geo = await resolveGeoHierarchy(
    "customers",
    {
      country: item.country ?? item.countryId ?? item.countryid,
      city: item.city ?? item.cityId ?? item.cityid,
      area: item.area ?? item.areaId ?? item.areaid,
      countryname: item.countryname ?? item.countryName,
      cityname: item.cityname ?? item.cityName,
      areaname: item.areaname ?? item.areaName
    },
    { tenantid: Number(tenantid), userid: auth?.userid }
  );

  return normalizeAddressRecord({
    country: geo.country,
    city: geo.city,
    area: geo.area,
    address: item.address
  });
}

function isDuplicateAgainstKnown(address, knownAddresses = []) {
  return knownAddresses.some((known) => addressesEqual(address, known));
}

async function normalizeAdditionalAddressItems(items, auth, tenantid, defaultAddress) {
  const normalizedItems = [];
  const known = [defaultAddress];

  for (const item of items || []) {
    if (!item || typeof item !== "object") {
      clientError("Each additionalAddresses entry must be an object");
    }

    const resolved = await resolveAddressGeo(item, auth, tenantid);
    if (
      !resolved.country &&
      !resolved.city &&
      !resolved.area &&
      !resolved.address
    ) {
      clientError("Each additional address requires country, city, area, or address");
    }

    if (isDuplicateAgainstKnown(resolved, known)) {
      continue;
    }

    known.push(resolved);
    normalizedItems.push({
      recno: toNullableInt(item.recno ?? item.id),
      ...resolved
    });
  }

  return normalizedItems;
}

async function syncAdditionalAddresses(tx, options = {}) {
  const {
    customerid,
    tenantid,
    branchid,
    items,
    defaultAddress,
    auth
  } = options;

  const normalizedItems = await normalizeAdditionalAddressItems(
    items,
    auth,
    tenantid,
    defaultAddress
  );
  const uid = Number(auth.userid);
  const now = utcNow();

  const existingRows = await tx.customeraddresses.findMany({
    where: { customerid: Number(customerid), tenantid: Number(tenantid) },
    select: { recno: true }
  });
  const existingIds = new Set(existingRows.map((row) => row.recno));
  const keepIds = new Set();

  for (const item of normalizedItems) {
    if (item.recno && existingIds.has(item.recno)) {
      await tx.customeraddresses.update({
        where: { recno: item.recno },
        data: {
          country: item.country,
          city: item.city,
          area: item.area,
          address: item.address,
          branchid: Number(branchid),
          lastupdatedby: uid,
          lastupdatedat: now
        }
      });
      keepIds.add(item.recno);
      continue;
    }

    if (item.recno && !existingIds.has(item.recno)) {
      clientError(`Additional address recno ${item.recno} was not found for this customer`, 404);
    }

    const created = await tx.customeraddresses.create({
      data: {
        customerid: Number(customerid),
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        country: item.country,
        city: item.city,
        area: item.area,
        address: item.address,
        createdby: uid,
        createdat: now,
        lastupdatedby: uid,
        lastupdatedat: now
      }
    });
    keepIds.add(created.recno);
  }

  const deleteIds = existingRows
    .map((row) => row.recno)
    .filter((recno) => !keepIds.has(recno));

  if (deleteIds.length) {
    await tx.customeraddresses.deleteMany({
      where: { recno: { in: deleteIds } }
    });
  }
}

async function loadAdditionalAddressRows(db, customerid, tenantid) {
  return db.customeraddresses.findMany({
    where: {
      customerid: Number(customerid),
      tenantid: Number(tenantid)
    },
    include: CUSTOMER_ADDRESS_INCLUDE,
    orderBy: { recno: "asc" }
  });
}

async function resolveJobCustomerAddress(data = {}, payload = {}, auth, tenantid) {
  const extracted = extractJobCustomerAddress(data, payload);
  const hasGeo =
    extracted.country ||
    extracted.city ||
    extracted.area ||
    extracted.address ||
    data.countryname ||
    data.cityname ||
    data.areaname ||
    data.customer?.countryname ||
    data.customer?.cityname ||
    data.customer?.areaname;

  if (!hasGeo) {
    return null;
  }

  return resolveAddressGeo(
    {
      ...extracted,
      countryname:
        data.customer?.countryname ??
        data.customer?.countryName ??
        data.countryname ??
        data.countryName,
      cityname:
        data.customer?.cityname ??
        data.customer?.cityName ??
        data.cityname ??
        data.cityName,
      areaname:
        data.customer?.areaname ??
        data.customer?.areaName ??
        data.areaname ??
        data.areaName
    },
    auth,
    tenantid
  );
}

async function ensureCustomerAddressFromJob(tx, options = {}) {
  const { customerid, tenantid, branchid, addressInput, auth } = options;
  const address = normalizeAddressRecord(addressInput);

  if (
    !address.country &&
    !address.city &&
    !address.area &&
    !address.address
  ) {
    return null;
  }

  const customer = await tx.customers.findFirst({
    where: {
      customerid: Number(customerid),
      tenantid: Number(tenantid),
      branchid: Number(branchid)
    },
    select: {
      customerid: true,
      country: true,
      city: true,
      area: true,
      address: true
    }
  });

  if (!customer) {
    return null;
  }

  const defaultAddress = defaultAddressFromCustomer(customer);
  if (addressesEqual(address, defaultAddress)) {
    return null;
  }

  const additionalRows = await loadAdditionalAddressRows(tx, customerid, tenantid);
  const known = [defaultAddress, ...additionalRows.map((row) => normalizeAddressRecord(row))];
  if (isDuplicateAgainstKnown(address, known)) {
    return null;
  }

  const uid = Number(auth.userid);
  const now = utcNow();
  return tx.customeraddresses.create({
    data: {
      customerid: Number(customerid),
      tenantid: Number(tenantid),
      branchid: Number(branchid),
      country: address.country,
      city: address.city,
      area: address.area,
      address: address.address,
      createdby: uid,
      createdat: now,
      lastupdatedby: uid,
      lastupdatedat: now
    }
  });
}

function attachCustomerAddressFields(dto, row) {
  const defaultAddress = formatAddressDto(
    {
      country: dto.country,
      city: dto.city,
      area: dto.area,
      address: dto.address
    },
    {
      countries: row.countries,
      cities: row.cities,
      areas: row.areas
    }
  );

  dto.defaultAddress = defaultAddress;
  dto.additionalAddresses = (row.customeraddresses || []).map((entry) =>
    formatAddressDto(entry, entry)
  );
  return dto;
}

async function listCustomerAddressDropdown(auth, query = {}) {
  const customerId = toNullableInt(query.customerId ?? query.customerid);
  if (!customerId || customerId <= 0) {
    clientError("customerId is required and must be a positive integer");
  }

  const tenantid = Number(auth.tenantid);
  const branchid = Number(auth.branchid);

  const customer = await prisma.customers.findFirst({
    where: {
      customerid: customerId,
      tenantid,
      branchid
    },
    include: {
      countries: { select: { recno: true, name: true } },
      cities: { select: { recno: true, name: true } },
      areas: { select: { recno: true, name: true } }
    }
  });

  if (!customer) {
    clientError("Customer not found for this tenant and branch", 404);
  }

  const defaultDto = formatAddressDto(
    {
      country: customer.country,
      city: customer.city,
      area: customer.area,
      address: customer.address
    },
    customer
  );

  const additionalRows = await loadAdditionalAddressRows(prisma, customerId, tenantid);
  const branchRows = additionalRows.filter(
    (row) => row.branchid == null || Number(row.branchid) === branchid
  );

  const data = [];

  if (hasAddressContent(defaultDto)) {
    data.push(
      formatCustomerAddressDropdownRow(defaultDto, {
        value: null,
        isDefault: true
      })
    );
  }

  branchRows.forEach((row) => {
    const dto = formatAddressDto(row, row);
    data.push(
      formatCustomerAddressDropdownRow(dto, {
        value: row.recno,
        isDefault: false
      })
    );
  });

  return {
    customerId: customer.customerid,
    customerName: customer.name ?? null,
    defaultAddress: {
      ...formatCustomerAddressDropdownRow(defaultDto, {
        value: null,
        isDefault: true
      })
    },
    data,
    total: data.length,
    returned: data.length,
    resource: "customer-addresses",
    filters: { customerId: customer.customerid }
  };
}

module.exports = {
  CUSTOMER_ADDRESS_INCLUDE,
  extractAdditionalAddressesInput,
  extractJobCustomerAddress,
  resolveJobCustomerAddress,
  syncAdditionalAddresses,
  loadAdditionalAddressRows,
  ensureCustomerAddressFromJob,
  attachCustomerAddressFields,
  listCustomerAddressDropdown,
  normalizeAdditionalAddressItems,
  resolveAddressGeo
};
