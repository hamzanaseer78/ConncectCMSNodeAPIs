function buildCustomerRelationFilter(query = {}) {
  const customerFilter = {};

  const customerName = query.customerName ?? query.customername;
  if (customerName != null && String(customerName).trim() !== "") {
    customerFilter.name = { contains: String(customerName).trim(), mode: "insensitive" };
  }

  const customerPhone =
    query.customerPhone ??
    query.customerphone ??
    query.customerContactNo ??
    query.customercontactno ??
    query.contactno;
  if (customerPhone != null && String(customerPhone).trim() !== "") {
    customerFilter.contactno = { contains: String(customerPhone).trim(), mode: "insensitive" };
  }

  const customerEmail = query.customerEmail ?? query.customeremail;
  if (customerEmail != null && String(customerEmail).trim() !== "") {
    customerFilter.email = { contains: String(customerEmail).trim(), mode: "insensitive" };
  }

  return Object.keys(customerFilter).length ? customerFilter : null;
}

function buildJobDetailsInvoiceNumberFilter(query = {}) {
  const raw =
    query.invoiceNumber ??
    query.invoicenumber ??
    query.invoiceNo ??
    query.invoiceno;
  if (raw == null || String(raw).trim() === "") {
    return null;
  }

  const term = String(raw).trim();
  return {
    some: {
      remarks: {
        contains: term,
        mode: "insensitive"
      }
    }
  };
}

function buildJobDetailsRemarksContainsFilter(rawValue) {
  if (rawValue == null || String(rawValue).trim() === "") {
    return null;
  }

  const term = String(rawValue).trim();
  return {
    some: {
      remarks: {
        contains: term,
        mode: "insensitive"
      }
    }
  };
}

function buildJobDetailsEquipmentFilters(query = {}) {
  const filters = [];

  const productModel = query.productModel ?? query.productmodel;
  const productSerial =
    query.productSerial ?? query.productserial ?? query.serialNumber ?? query.serialnumber;

  const modelFilter = buildJobDetailsRemarksContainsFilter(productModel);
  if (modelFilter) filters.push(modelFilter);

  const serialFilter = buildJobDetailsRemarksContainsFilter(productSerial);
  if (serialFilter) filters.push(serialFilter);

  return filters;
}

module.exports = {
  buildCustomerRelationFilter,
  buildJobDetailsInvoiceNumberFilter,
  buildJobDetailsRemarksContainsFilter,
  buildJobDetailsEquipmentFilters
};
