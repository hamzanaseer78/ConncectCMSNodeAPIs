/**
 * Prisma models whose primary key is a PostgreSQL serial/identity column.
 * Used to allocate explicit IDs when sequences drift behind MAX(pk).
 */
const POSTGRES_AUTOINCREMENT_MODELS = {
  areas: { table: "areas", column: "recno" },
  branches: { table: "branches", column: "branchid" },
  cities: { table: "cities", column: "recno" },
  countries: { table: "countries", column: "recno" },
  customers: { table: "customers", column: "customerid" },
  customeraddresses: { table: "customeraddresses", column: "recno" },
  jobcategories: { table: "jobcategories", column: "categoryid" },
  jobgroups: { table: "jobgroups", column: "groupid" },
  jobsubcategories: { table: "jobsubcategories", column: "subcategoryid" },
  organizations: { table: "organizations", column: "tenantid" },
  policies: { table: "policies", column: "recno" },
  products: { table: "products", column: "productid" },
  erpproducts: { table: "erpproducts", column: "erpproductid" },
  screens: { table: "screens", column: "screenid" },
  userorganizations: { table: "userorganizations", column: "recno" },
  userpolicies: { table: "userpolicies", column: "recno" },
  userrights: { table: "userrights", column: "recno" },
  users: { table: "users", column: "userid" },
  userdevicetokens: { table: "userdevicetokens", column: "recno" },
  announcements: { table: "announcements", column: "recno" },
  userattendancesession: { table: "userattendancesession", column: "recno" },
  userattendancelog: { table: "userattendancelog", column: "recno" },
  faceapprovalsettings: { table: "faceapprovalsettings", column: "recno" },
  jobquotationsettings: { table: "jobquotationsettings", column: "recno" },
  jobcashsettings: { table: "jobcashsettings", column: "recno" },
  jobformsettings: { table: "jobformsettings", column: "recno" },
  jobcodesettings: { table: "jobcodesettings", column: "recno" },
  jobcollections: { table: "jobcollections", column: "recno" },
  jobexpenses: { table: "jobexpenses", column: "recno" },
  jobcpairsummary: { table: "jobcpairsummary", column: "recno" },
  jobcpairparts: { table: "jobcpairparts", column: "recno" },
  jobcpairreceivelog: { table: "jobcpairreceivelog", column: "recno" },
  jobcpairissuelog: { table: "jobcpairissuelog", column: "recno" },
  faceapprovalrequests: { table: "faceapprovalrequests", column: "recno" },
  userssignuptokenlogs: { table: "userssignuptokenlogs", column: "recno" },
  userlocations: { table: "userlocations", column: "recno" },
  job: { table: "job", column: "recno" },
  jobapprovalsettings: { table: "jobapprovalsettings", column: "recno" },
  jobapprovallevels: { table: "jobapprovallevels", column: "recno" },
  jobapprovallevelusers: { table: "jobapprovallevelusers", column: "recno" },
  jobapprovalrequests: { table: "jobapprovalrequests", column: "recno" },
  jobapprovalactions: { table: "jobapprovalactions", column: "recno" },
  jobaddonproducts: { table: "jobaddonproducts", column: "recno" },
  jobassignmentlog: { table: "jobassignmentlog", column: "recno" },
  jobattachments: { table: "jobattachments", column: "recno" },
  jobcustomerremarkslog: { table: "jobcustomerremarkslog", column: "recno" },
  jobcustomerfeedback: { table: "jobcustomerfeedback", column: "recno" },
  jobdetails: { table: "jobdetails", column: "recno" },
  jobproducts: { table: "jobproducts", column: "recno" },
  jobservices: { table: "jobservices", column: "recno" },
  jobstatuslog: { table: "jobstatuslog", column: "recno" },
  jobquotationstatuslog: { table: "jobquotationstatuslog", column: "recno" },
  jobtravelhistory: { table: "jobtravelhistory", column: "recno" },
  jobworklhistory: { table: "jobworklhistory", column: "recno" },
  taxtypes: { table: "taxtypes", column: "recno" },
  jobtypes: { table: "jobtypes", column: "recno" },
  jobsources: { table: "jobsources", column: "recno" },
  deliverytypes: { table: "deliverytypes", column: "recno" },
  expensetypes: { table: "expensetypes", column: "recno" },
  brands: { table: "brands", column: "recno" },
  units: { table: "units", column: "recno" },
  reportcolumnpreferences: { table: "reportcolumnpreferences", column: "recno" },
  useractivitylogs: { table: "useractivitylogs", column: "recno" }
};

function getAutoincrementConfig(modelName) {
  return POSTGRES_AUTOINCREMENT_MODELS[modelName] ?? null;
}

function listAutoincrementModels() {
  return Object.entries(POSTGRES_AUTOINCREMENT_MODELS).map(([modelName, config]) => ({
    modelName,
    ...config
  }));
}

module.exports = {
  POSTGRES_AUTOINCREMENT_MODELS,
  getAutoincrementConfig,
  listAutoincrementModels
};
