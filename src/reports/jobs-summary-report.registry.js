const { parseEquipmentFromRemarks } = require("../utils/job-equipment");
const { formatTechnicianAffiliationFields } = require("../utils/technician-affiliation");

const SHARED_COUNT_COLUMNS = [
  {
    columnName: "noOfJobs",
    columnDescription: "No of Jobs",
    isShow: true,
    sortable: true,
    sortNo: 2,
    minWidth: 120,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "noOfResolved",
    columnDescription: "No of Resolved",
    isShow: true,
    sortable: true,
    sortNo: 3,
    minWidth: 130,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "noOfCompleted",
    columnDescription: "No of Completed",
    isShow: true,
    sortable: true,
    sortNo: 4,
    minWidth: 140,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  },
  {
    columnName: "noOfPendings",
    columnDescription: "No of Pendings",
    isShow: true,
    sortable: true,
    sortNo: 5,
    minWidth: 130,
    columnFieldType: "number",
    clickable: false,
    isRigtAligned: true,
    color: "",
    isMandatory: true
  }
];

const SHARED_SORT_FIELD_MAP = {
  noOfJobs: "noOfJobs",
  noOfResolved: "noOfResolved",
  noOfCompleted: "noOfCompleted",
  noOfPendings: "noOfPendings"
};

function buildNameColumn(columnName, columnDescription) {
  return {
    columnName,
    columnDescription,
    isShow: true,
    sortable: true,
    sortNo: 1,
    minWidth: 180,
    columnFieldType: "string",
    clickable: true,
    isRigtAligned: false,
    color: "",
    isMandatory: true
  };
}

function buildDefaultColumns(nameColumn) {
  return [nameColumn, ...SHARED_COUNT_COLUMNS.map((column) => ({ ...column }))];
}

function buildTechnicianSummaryColumns() {
  const countColumns = SHARED_COUNT_COLUMNS.map((column, index) => ({
    ...column,
    sortNo: 10 + index
  }));

  return [
    buildNameColumn("technicianName", "Technician"),
    {
      columnName: "technicianId",
      columnDescription: "Technician User Id",
      isShow: true,
      sortable: true,
      sortNo: 2,
      minWidth: 120,
      columnFieldType: "number",
      clickable: false,
      isRigtAligned: false,
      color: "",
      isMandatory: false
    },
    {
      columnName: "technicianEmail",
      columnDescription: "Email",
      isShow: true,
      sortable: true,
      sortNo: 3,
      minWidth: 180,
      columnFieldType: "string",
      clickable: false,
      isRigtAligned: false,
      color: "",
      isMandatory: false
    },
    {
      columnName: "technicianPhone",
      columnDescription: "Phone",
      isShow: true,
      sortable: false,
      sortNo: 4,
      minWidth: 130,
      columnFieldType: "string",
      clickable: false,
      isRigtAligned: false,
      color: "",
      isMandatory: false
    },
    {
      columnName: "userType",
      columnDescription: "User Type",
      isShow: true,
      sortable: true,
      sortNo: 5,
      minWidth: 120,
      columnFieldType: "string",
      clickable: false,
      isRigtAligned: false,
      color: "",
      isMandatory: false
    },
    {
      columnName: "technicianAffiliationLabel",
      columnDescription: "Technician Affiliation",
      isShow: true,
      sortable: true,
      sortNo: 6,
      minWidth: 150,
      columnFieldType: "string",
      clickable: false,
      isRigtAligned: false,
      color: "",
      isMandatory: false
    },
    {
      columnName: "technicianAffiliation",
      columnDescription: "Affiliation Code",
      isShow: false,
      sortable: true,
      sortNo: 7,
      minWidth: 130,
      columnFieldType: "string",
      clickable: false,
      isRigtAligned: false,
      color: "",
      isMandatory: false
    },
    {
      columnName: "companyName",
      columnDescription: "Company Name (Third-party)",
      isShow: true,
      sortable: true,
      sortNo: 8,
      minWidth: 160,
      columnFieldType: "string",
      clickable: false,
      isRigtAligned: false,
      color: "",
      isMandatory: false
    },
    {
      columnName: "isActive",
      columnDescription: "Active",
      isShow: true,
      sortable: true,
      sortNo: 9,
      minWidth: 90,
      columnFieldType: "boolean",
      clickable: false,
      isRigtAligned: false,
      color: "",
      isMandatory: false
    },
    ...countColumns
  ];
}

function bucketKey(value) {
  if (value === undefined || value === null || value === "") return "__null__";
  return String(value);
}

function aggregateJobsByGroup(jobs, extractGroupKey) {
  const buckets = new Map();

  jobs.forEach((job) => {
    const groupKey = extractGroupKey(job);
    const key = bucketKey(groupKey);
    if (!buckets.has(key)) {
      buckets.set(key, {
        groupKey: groupKey ?? null,
        jobCount: 0,
        resolvedCount: 0,
        completedCount: 0,
        pendingCount: 0
      });
    }

    const bucket = buckets.get(key);
    bucket.jobCount += 1;
    if (job.isresolved === true) bucket.resolvedCount += 1;
    if (job.iscompleted === true) bucket.completedCount += 1;
    if (job.iscompleted !== true) bucket.pendingCount += 1;
  });

  return buckets;
}

function equipmentFromJob(job) {
  const detail = Array.isArray(job.jobdetails) ? job.jobdetails[0] : job.jobdetails;
  return parseEquipmentFromRemarks(detail?.remarks);
}

const JOBS_SUMMARY_REPORT_REGISTRY = {
  jobs_by_fault_summary: {
    reportKey: "jobs_by_fault_summary",
    title: "Jobs By Fault",
    graphqlSuffix: "Fault",
    nameField: "faultName",
    defaultColumns: buildDefaultColumns(buildNameColumn("faultName", "Fault Name")),
    sortFieldMap: { ...SHARED_SORT_FIELD_MAP, faultName: "groupName" },
    jobSelect: {
      faultid: true,
      isresolved: true,
      iscompleted: true
    },
    extractGroupKey: (job) => job.faultid ?? null,
    unassignedLabel: "Unassigned",
    async loadGroupNames(auth, keys) {
      const ids = keys.filter((key) => key != null).map(Number);
      if (!ids.length) return new Map();
      const rows = await auth.__prisma.jobsubcategories.findMany({
        where: { tenantid: Number(auth.tenantid), subcategoryid: { in: ids } },
        select: { subcategoryid: true, name: true }
      });
      return new Map(rows.map((row) => [row.subcategoryid, row.name ?? null]));
    },
    buildRowExtras(groupKey) {
      return groupKey == null ? {} : { faultId: Number(groupKey) };
    },
    buildDrillDownFilter(groupKey) {
      return groupKey == null ? {} : { faultId: Number(groupKey) };
    }
  },
  jobs_by_category_summary: {
    reportKey: "jobs_by_category_summary",
    title: "Jobs By Category",
    graphqlSuffix: "Category",
    nameField: "categoryName",
    defaultColumns: buildDefaultColumns(buildNameColumn("categoryName", "Category Name")),
    sortFieldMap: { ...SHARED_SORT_FIELD_MAP, categoryName: "groupName" },
    jobSelect: {
      serviceid: true,
      isresolved: true,
      iscompleted: true
    },
    extractGroupKey: (job) => job.serviceid ?? null,
    unassignedLabel: "Unassigned",
    async loadGroupNames(auth, keys) {
      const ids = keys.filter((key) => key != null).map(Number);
      if (!ids.length) return new Map();
      const rows = await auth.__prisma.jobcategories.findMany({
        where: { tenantid: Number(auth.tenantid), categoryid: { in: ids } },
        select: { categoryid: true, name: true }
      });
      return new Map(rows.map((row) => [row.categoryid, row.name ?? null]));
    },
    buildRowExtras(groupKey) {
      return groupKey == null ? {} : { categoryId: Number(groupKey) };
    },
    buildDrillDownFilter(groupKey) {
      return groupKey == null ? {} : { categoryId: Number(groupKey) };
    }
  },
  jobs_by_sub_category_summary: {
    reportKey: "jobs_by_sub_category_summary",
    title: "Jobs By Sub Category",
    graphqlSuffix: "SubCategory",
    nameField: "subCategoryName",
    defaultColumns: buildDefaultColumns(buildNameColumn("subCategoryName", "Sub Category Name")),
    sortFieldMap: { ...SHARED_SORT_FIELD_MAP, subCategoryName: "groupName" },
    jobSelect: {
      faultid: true,
      isresolved: true,
      iscompleted: true
    },
    extractGroupKey: (job) => job.faultid ?? null,
    unassignedLabel: "Unassigned",
    async loadGroupNames(auth, keys) {
      const ids = keys.filter((key) => key != null).map(Number);
      if (!ids.length) return new Map();
      const rows = await auth.__prisma.jobsubcategories.findMany({
        where: { tenantid: Number(auth.tenantid), subcategoryid: { in: ids } },
        select: { subcategoryid: true, name: true }
      });
      return new Map(rows.map((row) => [row.subcategoryid, row.name ?? null]));
    },
    buildRowExtras(groupKey) {
      return groupKey == null ? {} : { subCategoryId: Number(groupKey), faultId: Number(groupKey) };
    },
    buildDrillDownFilter(groupKey) {
      return groupKey == null ? {} : { faultId: Number(groupKey) };
    }
  },
  jobs_by_product_model_summary: {
    reportKey: "jobs_by_product_model_summary",
    title: "Jobs By Product Model",
    graphqlSuffix: "ProductModel",
    nameField: "productModel",
    defaultColumns: buildDefaultColumns(buildNameColumn("productModel", "Product Model")),
    sortFieldMap: { ...SHARED_SORT_FIELD_MAP, productModel: "groupName" },
    jobSelect: {
      isresolved: true,
      iscompleted: true,
      jobdetails: { orderBy: { recno: "desc" }, take: 1, select: { remarks: true } }
    },
    extractGroupKey: (job) => {
      const model = equipmentFromJob(job).productModel;
      return model ? String(model).trim() : null;
    },
    unassignedLabel: "Unassigned",
    async loadGroupNames(_auth, keys) {
      return new Map(keys.filter(Boolean).map((key) => [key, key]));
    },
    buildRowExtras(groupKey) {
      return groupKey == null ? {} : { productModel: String(groupKey) };
    },
    buildDrillDownFilter(groupKey) {
      return groupKey == null ? {} : { productModel: String(groupKey) };
    }
  },
  jobs_by_product_serial_summary: {
    reportKey: "jobs_by_product_serial_summary",
    title: "Jobs By Product Serial",
    graphqlSuffix: "ProductSerial",
    nameField: "productSerial",
    defaultColumns: buildDefaultColumns(buildNameColumn("productSerial", "Product Serial")),
    sortFieldMap: { ...SHARED_SORT_FIELD_MAP, productSerial: "groupName" },
    jobSelect: {
      isresolved: true,
      iscompleted: true,
      jobdetails: { orderBy: { recno: "desc" }, take: 1, select: { remarks: true } }
    },
    extractGroupKey: (job) => {
      const serial = equipmentFromJob(job).serialNumber;
      return serial ? String(serial).trim() : null;
    },
    unassignedLabel: "Unassigned",
    async loadGroupNames(_auth, keys) {
      return new Map(keys.filter(Boolean).map((key) => [key, key]));
    },
    buildRowExtras(groupKey) {
      return groupKey == null ? {} : { productSerial: String(groupKey) };
    },
    buildDrillDownFilter(groupKey) {
      return groupKey == null ? {} : { productSerial: String(groupKey) };
    }
  },
  jobs_by_city_summary: {
    reportKey: "jobs_by_city_summary",
    title: "Jobs By City",
    graphqlSuffix: "City",
    nameField: "cityName",
    defaultColumns: buildDefaultColumns(buildNameColumn("cityName", "City Name")),
    sortFieldMap: { ...SHARED_SORT_FIELD_MAP, cityName: "groupName" },
    jobSelect: {
      city: true,
      isresolved: true,
      iscompleted: true
    },
    extractGroupKey: (job) => job.city ?? null,
    unassignedLabel: "Unassigned",
    async loadGroupNames(auth, keys) {
      const ids = keys.filter((key) => key != null).map(Number);
      if (!ids.length) return new Map();
      const rows = await auth.__prisma.cities.findMany({
        where: { tenantid: Number(auth.tenantid), recno: { in: ids } },
        select: { recno: true, name: true }
      });
      return new Map(rows.map((row) => [row.recno, row.name ?? null]));
    },
    buildRowExtras(groupKey) {
      return groupKey == null ? {} : { cityId: Number(groupKey) };
    },
    buildDrillDownFilter(groupKey) {
      return groupKey == null ? {} : { cityId: Number(groupKey) };
    }
  },
  jobs_by_area_summary: {
    reportKey: "jobs_by_area_summary",
    title: "Jobs By Area",
    graphqlSuffix: "Area",
    nameField: "areaName",
    defaultColumns: buildDefaultColumns(buildNameColumn("areaName", "Area Name")),
    sortFieldMap: { ...SHARED_SORT_FIELD_MAP, areaName: "groupName" },
    jobSelect: {
      area: true,
      isresolved: true,
      iscompleted: true
    },
    extractGroupKey: (job) => job.area ?? null,
    unassignedLabel: "Unassigned",
    async loadGroupNames(auth, keys) {
      const ids = keys.filter((key) => key != null).map(Number);
      if (!ids.length) return new Map();
      const rows = await auth.__prisma.areas.findMany({
        where: { tenantid: Number(auth.tenantid), recno: { in: ids } },
        select: { recno: true, name: true }
      });
      return new Map(rows.map((row) => [row.recno, row.name ?? null]));
    },
    buildRowExtras(groupKey) {
      return groupKey == null ? {} : { areaId: Number(groupKey) };
    },
    buildDrillDownFilter(groupKey) {
      return groupKey == null ? {} : { areaId: Number(groupKey) };
    }
  },
  jobs_by_warranty_summary: {
    reportKey: "jobs_by_warranty_summary",
    title: "Jobs By Warranty",
    graphqlSuffix: "Warranty",
    nameField: "warrantyName",
    defaultColumns: buildDefaultColumns(buildNameColumn("warrantyName", "Warranty")),
    sortFieldMap: { ...SHARED_SORT_FIELD_MAP, warrantyName: "groupName" },
    jobSelect: {
      isinwaranty: true,
      isresolved: true,
      iscompleted: true
    },
    extractGroupKey: (job) => (job.isinwaranty === true ? "true" : job.isinwaranty === false ? "false" : null),
    unassignedLabel: "Unassigned",
    async loadGroupNames(_auth, keys) {
      return new Map(
        keys
          .filter((key) => key != null)
          .map((key) => [key, key === "true" ? "In Warranty" : "Out of Warranty"])
      );
    },
    buildRowExtras(groupKey) {
      if (groupKey == null) return {};
      return { inWarranty: groupKey === "true" };
    },
    buildDrillDownFilter(groupKey) {
      if (groupKey == null) return {};
      return { isInWarranty: groupKey === "true" };
    }
  },
  jobs_by_technician_summary: {
    reportKey: "jobs_by_technician_summary",
    title: "Jobs By Technician",
    graphqlSuffix: "Technician",
    nameField: "technicianName",
    defaultColumns: buildTechnicianSummaryColumns(),
    sortFieldMap: {
      ...SHARED_SORT_FIELD_MAP,
      technicianName: "groupName",
      technicianId: "technicianId",
      technicianEmail: "technicianEmail",
      userType: "userType",
      technicianAffiliationLabel: "technicianAffiliationLabel",
      technicianAffiliation: "technicianAffiliation",
      companyName: "companyName"
    },
    jobSelect: {
      assignedto: true,
      isresolved: true,
      iscompleted: true
    },
    extractGroupKey: (job) => job.assignedto ?? null,
    unassignedLabel: "Unassigned",
    async loadGroupNames(auth, keys) {
      const ids = keys.filter((key) => key != null).map(Number);
      if (!ids.length) return new Map();
      const rows = await auth.__prisma.users.findMany({
        where: { userid: { in: ids } },
        select: { userid: true, name: true }
      });
      return new Map(rows.map((row) => [row.userid, row.name ?? null]));
    },
    async loadGroupDetails(auth, keys) {
      const ids = keys.filter((key) => key != null).map(Number);
      if (!ids.length) return new Map();

      const rows = await auth.__prisma.users.findMany({
        where: { userid: { in: ids } },
        select: {
          userid: true,
          name: true,
          email: true,
          contactno: true,
          usertype: true,
          technicianaffiliation: true,
          companyname: true,
          isactive: true
        }
      });

      return new Map(
        rows.map((row) => [
          row.userid,
          {
            technicianId: row.userid,
            technicianEmail: row.email ?? null,
            technicianPhone: row.contactno ?? null,
            userType: row.usertype ?? null,
            isActive: row.isactive !== false,
            ...formatTechnicianAffiliationFields(row)
          }
        ])
      );
    },
    buildRowExtras(groupKey) {
      if (groupKey == null) {
        return {
          technicianId: null,
          assignedToId: null
        };
      }
      const id = Number(groupKey);
      return {
        technicianId: id,
        assignedToId: id
      };
    },
    buildDrillDownFilter(groupKey) {
      return groupKey == null ? {} : { assignedToId: Number(groupKey) };
    }
  },
  jobs_by_customer_summary: {
    reportKey: "jobs_by_customer_summary",
    title: "Jobs By Customer",
    graphqlSuffix: "Customer",
    nameField: "customerName",
    defaultColumns: buildDefaultColumns(buildNameColumn("customerName", "Customer Name")),
    sortFieldMap: { ...SHARED_SORT_FIELD_MAP, customerName: "groupName" },
    jobSelect: {
      customerid: true,
      isresolved: true,
      iscompleted: true
    },
    extractGroupKey: (job) => job.customerid ?? null,
    unassignedLabel: "Unassigned",
    async loadGroupNames(auth, keys) {
      const ids = keys.filter((key) => key != null).map(Number);
      if (!ids.length) return new Map();
      const rows = await auth.__prisma.customers.findMany({
        where: { tenantid: Number(auth.tenantid), customerid: { in: ids } },
        select: { customerid: true, name: true }
      });
      return new Map(rows.map((row) => [row.customerid, row.name ?? null]));
    },
    buildRowExtras(groupKey) {
      return groupKey == null ? {} : { customerId: Number(groupKey) };
    },
    buildDrillDownFilter(groupKey) {
      return groupKey == null ? {} : { customerId: Number(groupKey) };
    }
  }
};

function getJobsSummaryReportDefinition(reportKey) {
  const definition = JOBS_SUMMARY_REPORT_REGISTRY[reportKey];
  if (!definition) {
    throw new Error(`Unknown jobs summary report: ${reportKey}`);
  }
  return definition;
}

function listJobsSummaryReportDefinitions() {
  return Object.values(JOBS_SUMMARY_REPORT_REGISTRY);
}

function mapSummaryRow(definition, groupKey, groupName, counts, detailExtras = {}) {
  const nameFieldValue =
    groupName ?? (groupKey == null ? definition.unassignedLabel : null);

  return {
    reportKey: definition.reportKey,
    groupId: groupKey == null ? null : String(groupKey),
    groupName: nameFieldValue,
    [definition.nameField]: nameFieldValue,
    noOfJobs: counts.jobCount ?? 0,
    noOfResolved: counts.resolvedCount ?? 0,
    noOfCompleted: counts.completedCount ?? 0,
    noOfPendings: counts.pendingCount ?? 0,
    drillDownFilter: definition.buildDrillDownFilter(groupKey),
    ...definition.buildRowExtras(groupKey),
    ...detailExtras
  };
}

module.exports = {
  JOBS_SUMMARY_REPORT_REGISTRY,
  getJobsSummaryReportDefinition,
  listJobsSummaryReportDefinitions,
  aggregateJobsByGroup,
  mapSummaryRow,
  SHARED_SORT_FIELD_MAP
};
