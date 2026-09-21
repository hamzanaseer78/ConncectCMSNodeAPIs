const resources = {
  areas: {
    id: "recno",
    tenantScoped: true,
    branchScoped: false,
    noRemove: true,
    tag: "Areas",
    screenNames: ["area", "areas"],
    requiredOnCreate: ["name", "cityid"],
    listRelations: { cityid: { relation: "cities", field: "name", output: "cityname" } },
    dropdownFilters: [{ field: "cityid", params: ["cityId", "cityid"] }]
  },
  branches: { id: "branchid", tenantScoped: true, branchScoped: false,noRemove: true, tag: "Branches", screenNames: ["branch", "branches"], requiredOnCreate: ["name"] },
  cities: {
    id: "recno",
    tenantScoped: true,
    branchScoped: false,
    noRemove: true,
    tag: "Cities",
    screenNames: ["city", "cities"],
    requiredOnCreate: ["name", "countryid"],
    listRelations: { countryid: { relation: "countries", field: "name", output: "countryname" } },
    dropdownFilters: [{ field: "countryid", params: ["countryId", "countryid"] }]
  },
  countries: { id: "recno", tenantScoped: true, branchScoped: false,noRemove: true, tag: "Countries", screenNames: ["country", "countries"], requiredOnCreate: ["name"] },
  customers: { id: "customerid", tenantScoped: true, branchScoped: true,noRemove: true, tag: "Customers", screenNames: ["customer", "customers"], requiredOnCreate: ["name"], listRelations: { country: { relation: "countries", field: "name", output: "countryname" }, city: { relation: "cities", field: "name", output: "cityname" }, area: { relation: "areas", field: "name", output: "areaname" }, branchid: { relation: "branches", field: "name", output: "branchname" } } },
  deliverytypes: { id: "recno", tenantScoped: true, branchScoped: false, noRemove: true, tag: "Delivery Types", screenNames: ["deliverytype", "delivery type", "deliverytypes", "delivery types"], requiredOnCreate: ["name"] },
  expensetypes: { id: "recno", tenantScoped: true, branchScoped: false, noRemove: true, tag: "Expense Types", screenNames: ["expensetype", "expense type", "expensetypes", "expense types"], requiredOnCreate: ["name"] },
  faceapproval: {
    id: "recno",
    backendOnly: true,
    tenantScoped: true,
    branchScoped: false,
    tag: "Face Approval",
    screenNames: [
      "faceapproval",
      "face approval",
      "face-approval",
      "faceapprovalrequests",
      "face approval requests"
    ]
  },
  jobtypes: { id: "recno", tenantScoped: true, branchScoped: false, noRemove: true, tag: "Job Types", screenNames: ["jobtype", "job type", "jobtypes", "job types"], requiredOnCreate: ["name"] },
  jobsources: { id: "recno", tenantScoped: true, branchScoped: false, noRemove: true, tag: "Job Sources", screenNames: ["jobsource", "job source", "jobsources", "job sources"], requiredOnCreate: ["name"] },
  units: { id: "recno", tenantScoped: true, branchScoped: false, noRemove: true, tag: "Units", screenNames: ["unit", "units"], requiredOnCreate: ["name"] },
  brands: { id: "recno", tenantScoped: true, branchScoped: false, noRemove: true, tag: "Brands", screenNames: ["brand", "brands"], requiredOnCreate: ["name"] },
  jobcategories: {
    id: "categoryid",
    tenantScoped: true,
    branchScoped: true,
    noRemove: true,
    tag: "Job Categories",
    screenNames: ["jobcategory", "job category", "jobcategories", "job categories"],
    requiredOnCreate: ["name", "groupid"],
    listRelations: {
      groupid: { relation: "jobgroups", field: "name", output: "groupname" },
      branchid: { relation: "branches", field: "name", output: "branchname" }
    },
    dropdownFilters: [{ field: "groupid", params: ["groupId", "groupid"] }]
  },
  jobgroups: { id: "groupid", tenantScoped: true, branchScoped: true,noRemove: true, tag: "Job Groups", screenNames: ["jobgroup", "job group", "jobgroups", "job groups"], requiredOnCreate: ["name"], listRelations: { branchid: { relation: "branches", field: "name", output: "branchname" } } },
  jobstauses: { id: "recno", prismaModel: "jobstatuses", tenantScoped: true, branchScoped: false,noRemove: true, tag: "Job Statuses", screenNames: ["jobstatus", "job status", "jobstauses", "job statuses"], requiredOnCreate: ["title"] },
  jobsubcategories: {
    id: "subcategoryid",
    tenantScoped: true,
    noRemove: true,
    branchScoped: true,
    tag: "Job Subcategories",
    screenNames: ["jobsubcategory", "job subcategory", "jobsubcategories", "job subcategories"],
    requiredOnCreate: ["name", "categoryid"],
    listRelations: {
      categoryid: { relation: "jobcategories", field: "name", output: "categoryname" },
      branchid: { relation: "branches", field: "name", output: "branchname" }
    },
    dropdownFilters: [{ field: "categoryid", params: ["categoryId", "categoryid"] }]
  },
  organizations: { id: "tenantid", tenantScoped: true, branchScoped: false, noCreate: true,noRemove: true, tag: "Organizations", screenNames: ["organization", "organizations"] },
  policies: { id: "recno", tenantScoped: true, branchScoped: false,noRemove: true, tag: "Policies", screenNames: ["policy", "policies"], requiredOnCreate: ["description"] },
  products: {
    id: "productid",
    tenantScoped: true,
    branchScoped: false,
    noRemove: true,
    tag: "Products",
    screenNames: ["product", "products"],
    requiredOnCreate: ["name"],
    listRelations: {
      branchid: { relation: "branches", field: "name", output: "branchname" },
      unitid: { relation: "units", field: "name", output: "unitname" },
      brandid: { relation: "brands", field: "name", output: "brandname" }
    }
  },
  erpproducts: {
    id: "erpproductid",
    tenantScoped: true,
    branchScoped: false,
    noRemove: true,
    tag: "ERP Products",
    screenNames: ["erpproduct", "erp products", "erpproducts"],
    requiredOnCreate: ["name"],
    hiddenFields: [
      "salerate",
      "purchaserate",
      "discountvalue",
      "discounttype",
      "producttype",
      "enablecpairreceive"
    ],
    listRelations: {
      branchid: { relation: "branches", field: "name", output: "branchname" },
      unitid: { relation: "units", field: "name", output: "unitname" },
      brandid: { relation: "brands", field: "name", output: "brandname" },
      groupid: { relation: "jobgroups", field: "name", output: "groupname" },
      serviceid: { relation: "jobcategories", field: "name", output: "categoryname" }
    },
    dropdownFilters: [
      { field: "groupid", params: ["groupId", "groupid"] },
      { field: "serviceid", params: ["categoryId", "categoryid", "serviceId", "serviceid"] }
    ]
  },
  screens: { id: "screenid", tenantScoped: false, branchScoped: false, tag: "Screen Rights", screenNames: ["screen", "screens", "screen right", "screen rights"], requiredOnCreate: ["screenname", "controllername"] },
  userorganizations: { id: "recno", backendOnly: true, tenantScoped: true,noRemove: true, branchScoped: false, tag: "User Organizations", screenNames: ["userorganization", "user organization", "userorganizations", "user organizations"], requiredOnCreate: ["userid", "tenantid", "branchid"], listRelations: { userid: { relation: "users_userorganizations_useridTousers", field: "name", output: "username" }, tenantid: { relation: "organizations", field: "name", output: "organizationname" }, branchid: { relation: "branches", field: "name", output: "branchname" } } },
  userpolicies: { id: "recno",backendOnly: true, tenantScoped: true,noRemove: true, branchScoped: true, tag: "User Policies", screenNames: ["userpolicy", "user policy", "userpolicies", "user policies"], requiredOnCreate: ["userid", "policyid"], listRelations: { userid: { relation: "users_userpolicies_useridTousers", field: "name", output: "username" }, policyid: { relation: "policies", field: "description", output: "policyname" }, branchid: { relation: "branches", field: "name", output: "branchname" } } },
  userrights: { id: "recno",backendOnly: true, tenantScoped: true, branchScoped: true, tag: "User Rights", screenNames: ["userright", "user right", "userrights", "user rights"], requiredOnCreate: ["screenid", "policyid"], listRelations: { screenid: { relation: "screens", field: "screenname", output: "screenname" }, policyid: { relation: "policies", field: "description", output: "policyname" }, branchid: { relation: "branches", field: "name", output: "branchname" } } },
  users: {
    id: "userid",
    tenantScoped: false,
    organizationScoped: true,
    tag: "Users",
    noRemove: true,
    screenNames: ["user", "users"],
    requiredOnCreate: ["name", "email"]
  },
  userssignuptokenlogs: { id: "recno", tenantScoped: true, noCreate: true, backendOnly: true }
};

module.exports = resources;
