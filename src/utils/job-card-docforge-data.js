function text(value) {
  if (value == null) return "";
  const next = String(value).trim();
  return next;
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function printTimestamp(date = new Date()) {
  const printedDate = date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  const printedTime = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
  return `${printedDate} at ${printedTime}`;
}

function mapDeliveryType(name) {
  const raw = text(name).toLowerCase();
  if (!raw) return "";
  if (raw.includes("pickup")) return "pickup";
  if (raw.includes("self")) return "self_bring";
  if (raw.includes("visit") || raw.includes("home")) return "visit_home";
  if (raw.includes("deliver")) return "delivery";
  return text(name);
}

function publicImageUrl(path, baseUrl) {
  const src = text(path);
  if (!src) return "";
  if (/^https:\/\//i.test(src) || /^data:image\//i.test(src)) return src;
  const base = text(baseUrl).replace(/\/+$/, "");
  if (!base) return src.startsWith("/") ? src : `/${src}`;
  const suffix = src.startsWith("/") ? src : `/${src}`;
  return `${base}${suffix}`;
}

function mapLine(line, fallbackType) {
  const row = line && typeof line === "object" ? line : {};
  const qty = number(row.qty);
  const price = number(row.price ?? row.rate);
  const discount = number(row.discountamount ?? row.discount);
  const lineTotal = number(row.inclusiveamount ?? row.amount ?? row.totalamount ?? qty * price - discount);
  return {
    service: text(row.productname ?? row.remarks ?? row.name) || "Item",
    type: text(row.producttype) || fallbackType,
    description: text(row.remarks ?? row.productname),
    qty,
    price,
    discount,
    lineTotal
  };
}

function mapJobCardDocForgeData({
  job,
  organization,
  branch,
  collection,
  imageBaseUrl,
  now
}) {
  const record = job && typeof job === "object" ? job : {};
  const customer = record.customer && typeof record.customer === "object" ? record.customer : {};
  const org = organization && typeof organization === "object" ? organization : {};
  const loc = branch && typeof branch === "object" ? branch : {};
  const productLines = Array.isArray(record.productLines) ? record.productLines : [];
  const serviceLines = Array.isArray(record.serviceLines) ? record.serviceLines : [];
  const services = [
    ...productLines.map((line) => mapLine(line, "parts")),
    ...serviceLines.map((line) => mapLine(line, "service"))
  ];
  const subtotal = services.reduce((sum, line) => sum + number(line.qty) * number(line.price), 0);
  const discountAmount = services.reduce((sum, line) => sum + number(line.discount), 0);
  const grandTotal = number(
    record.totalCost ?? record.totalcost ?? services.reduce((sum, line) => sum + number(line.lineTotal), 0)
  );
  const collected = number(collection?.amount);
  const outstanding = Math.max(grandTotal - collected, 0);
  const logo = publicImageUrl(loc.logourl || org.logourl, imageBaseUrl);
  const warranty =
    record.isinwaranty === true ? "Under Warranty" : record.isinwaranty === false ? "Out of Warranty" : "";

  return {
    company: {
      name: text(org.organizationname || loc.name),
      logo,
      region: text([org.address, loc.name].filter(Boolean).join(" · ")),
      phone: text(org.phoneno || loc.phoneno),
      email: text(org.email || loc.email),
      web: text(org.website || loc.web)
    },
    branch: {
      name: text(loc.name),
      phone: text(loc.phoneno),
      email: text(loc.email)
    },
    customer: {
      name: text(customer.name),
      phone: text(customer.contactno || customer.phone),
      email: text(customer.email),
      address: text(record.customerAddress || record.address)
    },
    job: {
      title: "Job Card",
      number: text(record.manualjobno || record.code),
      date: isoDate(record.date),
      deliveryType: mapDeliveryType(record.deliveryTypeName),
      country: text(record.countryName),
      city: text(record.cityName),
      area: text(record.areaName),
      customerName: text(customer.name),
      contact: text(customer.contactno || customer.phone),
      email: text(customer.email),
      address: text(record.customerAddress || record.address),
      invoiceDate: isoDate(record.purchaseDate),
      warrantyStatus: warranty,
      invoiceNumber: text(record.invoiceNumber || record.invoiceno),
      modelNo: text(record.modelno || record.productModel),
      serial: text(record.serialNumber || record.serialno),
      product: text(record.product || record.productname || record.brandName),
      brand: text(record.brandName),
      category: text(record.categoryName || record.serviceName),
      technician: text(record.assignedToName),
      status: text(record.statusName),
      problem: text(record.complaintDescription || record.description || record.faultName),
      services,
      subtotal,
      discountAmount,
      grandTotal,
      amountCollected: collected,
      outstanding,
      terms: text(record.termsAndConditions || record.quotationTermsAndConditions)
    },
    print: {
      timestamp: printTimestamp(now)
    }
  };
}

module.exports = {
  text,
  number,
  isoDate,
  printTimestamp,
  mapDeliveryType,
  publicImageUrl,
  mapJobCardDocForgeData
};
