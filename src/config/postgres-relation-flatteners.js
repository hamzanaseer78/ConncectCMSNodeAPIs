/**
 * Map Prisma relation `connect` writes to scalar FK columns for unchecked creates.
 * Used when explicit primary keys must be supplied alongside FK data.
 */
const RELATION_CONNECT_FLATTENERS = {
  job: {
    organizations: (connect) => ({ tenantid: connect.tenantid }),
    branches: (connect) => ({ branchid: connect.branchid }),
    customers: (connect) => ({ customerid: connect.customerid }),
    users: (connect) => ({ assignedto: connect.userid }),
    followupbyuser: (connect) => ({ followupby: connect.userid }),
    cities: (connect) => ({ city: connect.recno }),
    areas: (connect) => ({ area: connect.recno }),
    jobcategories: (connect) => ({ serviceid: connect.categoryid }),
    jobsubcategories: (connect) => ({ faultid: connect.subcategoryid }),
    jobstatuses: (connect) => ({ statusid: connect.recno }),
    brands: (connect) => ({ brandid: connect.recno }),
    jobgroups: (connect) => ({ groupid: connect.groupid }),
    jobtypes: (connect) => ({ jobtypeid: connect.recno }),
    jobsources: (connect) => ({ jobsourceid: connect.recno }),
    erpproducts: (connect) => ({ erpproductid: connect.erpproductid })
  }
};

function hasRelationWriteData(data) {
  if (!data || typeof data !== "object") {
    return false;
  }

  return Object.values(data).some((value) => {
    if (!value || typeof value !== "object") {
      return false;
    }
    return Boolean(value.connect || value.create || value.connectOrCreate);
  });
}

function flattenConnectCreateData(modelName, data) {
  const flatteners = RELATION_CONNECT_FLATTENERS[modelName];
  if (!flatteners || !data) {
    return data;
  }

  const flat = {};
  let flattenedAny = false;

  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && value.connect && flatteners[key]) {
      Object.assign(flat, flatteners[key](value.connect));
      flattenedAny = true;
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      (value.connect || value.create || value.connectOrCreate)
    ) {
      continue;
    }

    flat[key] = value;
  }

  return flattenedAny ? flat : data;
}

module.exports = {
  RELATION_CONNECT_FLATTENERS,
  hasRelationWriteData,
  flattenConnectCreateData
};
