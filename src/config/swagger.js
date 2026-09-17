const swaggerJsdoc = require("swagger-jsdoc");
const resources = require("./resources");
const {
  getListFilterFields,
  getListScalarFields,
  getModel,
  getScalarFields,
  getWritableFields,
  hasCreatedByField,
  toOpenApiType
} = require("../utils/prisma-metadata");
const { listFilterDescription, getCreatedByFilterMeta } = require("../utils/list-filter");

function createdByQueryParameters({ includeName = false } = {}) {
  return getCreatedByFilterMeta({ includeName }).map((filter) => ({
    in: "query",
    name: filter.field,
    schema: filter.type === "Int" ? { type: "integer" } : { type: "string" },
    description: filter.description
  }));
}

const publicResources = Object.fromEntries(
  Object.entries(resources).filter(([, config]) => !config.backendOnly)
);

const JOBS_TAG = "Jobs";
const ALL_JOBS_TAG = "All Jobs";
const MY_JOBS_TAG = "My Jobs";
const TEAM_JOBS_TAG = "Team Jobs";
const DASHBOARD_TAG = "Dashboard";

const CP_AIR_RECEIVE_STATUS_ENUM = ["pending", "partially_received", "all_received"];
const CP_AIR_ISSUE_STATUS_ENUM = ["pending", "partially_issued", "issued"];

function buildJobCpairSummaryQueryParameters(extra = []) {
  return [
    { in: "query", name: "page", schema: { type: "integer", default: 1 } },
    { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } },
    { in: "query", name: "limit", schema: { type: "integer" }, description: "Alias for pageSize" },
    {
      in: "query",
      name: "sortBy",
      schema: {
        type: "string",
        enum: [
          "date",
          "createdAt",
          "jobId",
          "customerName",
          "technicianName",
          "totalCpairQty",
          "totalQtyReceived",
          "totalIssueQty",
          "receiveStatus",
          "issueStatus"
        ]
      }
    },
    { in: "query", name: "sortOrder", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
    { in: "query", name: "summaryId", schema: { type: "integer" }, description: "C-pair summary id" },
    { in: "query", name: "jobId", schema: { type: "integer" } },
    { in: "query", name: "technicianId", schema: { type: "integer" } },
    { in: "query", name: "technicianName", schema: { type: "string" } },
    { in: "query", name: "customerId", schema: { type: "integer" } },
    { in: "query", name: "customerName", schema: { type: "string" } },
    { in: "query", name: "customerPhone", schema: { type: "string" } },
    { in: "query", name: "customerEmail", schema: { type: "string" } },
    { in: "query", name: "faultId", schema: { type: "integer" } },
    { in: "query", name: "faultName", schema: { type: "string" } },
    {
      in: "query",
      name: "receiveStatus",
      schema: { type: "string", enum: CP_AIR_RECEIVE_STATUS_ENUM },
      description: "Summary-level receive status"
    },
    {
      in: "query",
      name: "issueStatus",
      schema: { type: "string", enum: CP_AIR_ISSUE_STATUS_ENUM },
      description: "Summary-level issue status"
    },
    { in: "query", name: "from", schema: { type: "string", format: "date-time" }, description: "Summary created from" },
    { in: "query", name: "to", schema: { type: "string", format: "date-time" }, description: "Summary created to" },
    { in: "query", name: "search", schema: { type: "string" }, description: "Job code or manual job number" },
    ...createdByQueryParameters(),
    ...extra
  ];
}

function buildJobCpairOverviewQueryParameters() {
  const base = buildJobCpairSummaryQueryParameters().filter((param) => param.name !== "sortBy");
  return [
    ...base,
    {
      in: "query",
      name: "sortBy",
      schema: {
        type: "string",
        enum: [
          "createdAt",
          "jobNo",
          "jobId",
          "partName",
          "customerName",
          "technicianName",
          "qty",
          "lineQtyReceived",
          "lineIssueQty",
          "receiveStatus",
          "issueStatus",
          "summaryReceiveStatus",
          "summaryIssueStatus"
        ]
      }
    },
    { in: "query", name: "productId", schema: { type: "integer" } },
    { in: "query", name: "jobProductId", schema: { type: "integer" } },
    { in: "query", name: "partName", schema: { type: "string" } },
    {
      in: "query",
      name: "lineReceiveStatus",
      schema: { type: "string", enum: CP_AIR_RECEIVE_STATUS_ENUM },
      description: "Per-part receive status (alias: partReceiveStatus)"
    },
    {
      in: "query",
      name: "lineIssueStatus",
      schema: { type: "string", enum: CP_AIR_ISSUE_STATUS_ENUM },
      description: "Per-part issue status (alias: partIssueStatus)"
    }
  ];
}

function schemaName(resourceName, suffix = "") {
  return `${resourceName}${suffix}`;
}

function buildObjectSchema(resourceName, fields, required = []) {
  return {
    type: "object",
    properties: Object.fromEntries(
      fields.map((field) => [
        field.name,
        {
          ...toOpenApiType(field),
          nullable: !field.isRequired
        }
      ])
    ),
    required
  };
}

function buildResourceSchemas() {
  const schemas = {};

  Object.entries(publicResources).forEach(([name, config]) => {
    schemas[schemaName(name)] = buildObjectSchema(name, getScalarFields(name));
    schemas[schemaName(name, "ListItem")] = buildListItemSchema(name, config);
    schemas[schemaName(name, "CreateInput")] = buildObjectSchema(
      name,
      getWritableFields(name, config, "create"),
      config.requiredOnCreate || []
    );
    schemas[schemaName(name, "UpdateInput")] = buildObjectSchema(
      name,
      getWritableFields(name, config, "update"),
      config.requiredOnUpdate || []
    );
    schemas[schemaName(name, "ListResponse")] = {
      type: "object",
      properties: {
        data: {
          type: "array",
          items: { $ref: `#/components/schemas/${schemaName(name, "ListItem")}` }
        },
        pagination: { $ref: "#/components/schemas/Pagination" },
        filters: {
          type: "array",
          items: { $ref: "#/components/schemas/AvailableFilter" }
        }
      }
    };
  });

  return schemas;
}

/** Paged list wrapper used by generic CRUD resources. */
function buildListResponseSchema(resourceName) {
  return {
    type: "object",
    properties: {
      data: {
        type: "array",
        items: { $ref: `#/components/schemas/${schemaName(resourceName, "ListItem")}` }
      },
      pagination: { $ref: "#/components/schemas/Pagination" },
      filters: {
        type: "array",
        items: { $ref: "#/components/schemas/AvailableFilter" }
      }
    }
  };
}

/**
 * OpenAPI for lookup tables when Prisma client DMMF is stale (e.g. before `npx prisma generate`).
 */
function buildLookupTableSchemas(resourceName, config, { withSymbol = false } = {}) {
  const properties = {
    recno: { type: "integer", readOnly: true },
    tenantid: { type: "integer", readOnly: true, description: "Set from JWT on create" },
    name: { type: "string" },
    isactive: { type: "boolean", nullable: true },
    sort: { type: "integer", nullable: true },
    createdby: { type: "integer", readOnly: true, nullable: true },
    createdat: { type: "string", format: "date-time", readOnly: true, nullable: true },
    lastupdatedby: { type: "integer", readOnly: true, nullable: true },
    lastupdatedat: { type: "string", format: "date-time", readOnly: true, nullable: true }
  };
  if (withSymbol) {
    properties.symbol = {
      type: "string",
      maxLength: 20,
      nullable: true,
      description: "Short label e.g. Pcs, Kg, Hr"
    };
  }

  const listItem = {
    recno: properties.recno,
    name: properties.name,
    isactive: properties.isactive,
    sort: properties.sort
  };
  if (withSymbol) listItem.symbol = properties.symbol;

  const writable = {
    name: properties.name,
    isactive: properties.isactive,
    sort: properties.sort
  };
  if (withSymbol) writable.symbol = properties.symbol;

  return {
    [schemaName(resourceName)]: { type: "object", properties },
    [schemaName(resourceName, "ListItem")]: { type: "object", properties: listItem },
    [schemaName(resourceName, "CreateInput")]: {
      type: "object",
      properties: writable,
      required: config.requiredOnCreate || []
    },
    [schemaName(resourceName, "UpdateInput")]: {
      type: "object",
      properties: writable
    },
    [schemaName(resourceName, "ListResponse")]: buildListResponseSchema(resourceName)
  };
}

function buildJobSourceSchemas(config) {
  const resourceName = "jobsources";
  const properties = {
    recno: { type: "integer", readOnly: true },
    tenantid: { type: "integer", readOnly: true, description: "Set from JWT on create" },
    name: { type: "string", description: "Job source name" },
    description: { type: "string", nullable: true, description: "Optional description" },
    isactive: { type: "boolean", nullable: true },
    sort: { type: "integer", nullable: true },
    createdby: { type: "integer", readOnly: true, nullable: true },
    createdat: { type: "string", format: "date-time", readOnly: true, nullable: true },
    lastupdatedby: { type: "integer", readOnly: true, nullable: true },
    lastupdatedat: { type: "string", format: "date-time", readOnly: true, nullable: true }
  };

  const listItem = {
    recno: properties.recno,
    name: properties.name,
    description: properties.description,
    isactive: properties.isactive,
    sort: properties.sort
  };

  const writable = {
    name: properties.name,
    description: properties.description,
    isactive: properties.isactive,
    sort: properties.sort
  };

  return {
    [schemaName(resourceName)]: { type: "object", properties },
    [schemaName(resourceName, "ListItem")]: { type: "object", properties: listItem },
    [schemaName(resourceName, "CreateInput")]: {
      type: "object",
      properties: writable,
      required: config.requiredOnCreate || []
    },
    [schemaName(resourceName, "UpdateInput")]: {
      type: "object",
      properties: writable
    },
    [schemaName(resourceName, "ListResponse")]: buildListResponseSchema(resourceName)
  };
}

/** Manual schemas when DMMF lacks migrated models/columns (run `npx prisma generate` to refresh auto schemas). */
function buildManualResourceSchemas() {
  const manual = {};

  if (!getModel("units") && publicResources.units) {
    Object.assign(manual, buildLookupTableSchemas("units", publicResources.units, { withSymbol: true }));
  }

  if (!getModel("deliverytypes") && publicResources.deliverytypes) {
    Object.assign(manual, buildLookupTableSchemas("deliverytypes", publicResources.deliverytypes));
  }

  if (!getModel("expensetypes") && publicResources.expensetypes) {
    Object.assign(manual, buildLookupTableSchemas("expensetypes", publicResources.expensetypes));
  }

  if (!getModel("jobtypes") && publicResources.jobtypes) {
    Object.assign(manual, buildLookupTableSchemas("jobtypes", publicResources.jobtypes));
  }

  if (!getModel("jobsources") && publicResources.jobsources) {
    Object.assign(manual, buildJobSourceSchemas(publicResources.jobsources));
  }

  if (!getModel("brands") && publicResources.brands) {
    Object.assign(manual, buildLookupTableSchemas("brands", publicResources.brands));
  }

  const productScalars = getScalarFields("products");
  const missingProductFields = publicResources.products && productScalars.length
    ? {
        ...(!productScalars.some((f) => f.name === "unitid")
          ? { unitid: { type: "integer", nullable: true, description: "FK to units.recno" } }
          : {}),
        ...(!productScalars.some((f) => f.name === "brandid")
          ? { brandid: { type: "integer", nullable: true, description: "FK to brands.recno" } }
          : {}),
        ...(!productScalars.some((f) => f.name === "producttype")
          ? {
              producttype: {
                type: "string",
                enum: ["inventory", "service"],
                nullable: true,
                description: "inventory = stock item; service = non-stock service line"
              }
            }
          : {}),
        ...(!productScalars.some((f) => f.name === "enablecpairreceive")
          ? {
              enablecpairreceive: {
                type: "boolean",
                default: false,
                description: "Allow this catalog product in C-pair receive workflow"
              },
              enableCPairReceive: {
                type: "boolean",
                default: false,
                description: "CamelCase alias for enablecpairreceive"
              }
            }
          : {
              enableCPairReceive: {
                type: "boolean",
                description: "CamelCase alias for enablecpairreceive"
              }
            })
      }
    : {};
  if (publicResources.products && productScalars.length && Object.keys(missingProductFields).length) {
    const productExtras = missingProductFields;
    const cfg = publicResources.products;
    const full = buildObjectSchema("products", productScalars);
    full.properties = { ...full.properties, ...productExtras };

    const listItem = buildListItemSchema("products", cfg);
    listItem.properties = { ...listItem.properties, ...productExtras };

    const createInput = buildObjectSchema("products", getWritableFields("products", cfg, "create"), cfg.requiredOnCreate || []);
    createInput.properties = { ...createInput.properties, ...productExtras };

    const updateInput = buildObjectSchema("products", getWritableFields("products", cfg, "update"));
    updateInput.properties = { ...updateInput.properties, ...productExtras };

    manual.products = full;
    manual.productsListItem = listItem;
    manual.productsCreateInput = createInput;
    manual.productsUpdateInput = updateInput;
    manual.productsListResponse = buildListResponseSchema("products");
  }

  if (publicResources.customers) {
    const cfg = publicResources.customers;
    const customerAddressWriteEntry = {
      type: "object",
      properties: {
        recno: {
          type: "integer",
          nullable: true,
          description: "Existing additional address ID (required when updating/deleting via PUT)"
        },
        country: { type: "integer", nullable: true, description: "Country ID (countries.recno)" },
        city: { type: "integer", nullable: true, description: "City ID (cities.recno)" },
        area: { type: "integer", nullable: true, description: "Area ID (areas.recno)" },
        address: { type: "string", nullable: true }
      }
    };
    const customerAddressResponseEntry = {
      type: "object",
      properties: {
        ...customerAddressWriteEntry.properties,
        countryId: { type: "integer", nullable: true },
        cityId: { type: "integer", nullable: true },
        areaId: { type: "integer", nullable: true },
        countryname: { type: "string", nullable: true },
        cityname: { type: "string", nullable: true },
        areaname: { type: "string", nullable: true }
      }
    };
    const responseExtras = {
      defaultAddress: {
        ...customerAddressResponseEntry,
        description: "Default address stored on the customers table"
      },
      additionalAddresses: {
        type: "array",
        items: customerAddressResponseEntry,
        description: "Additional customer addresses (excluding default)"
      }
    };
    const writeExtras = {
      additionalAddresses: {
        type: "array",
        items: customerAddressWriteEntry,
        description:
          "Additional customer addresses. Omit entries not sent on PUT to delete them. " +
          "Default address uses country/city/area/address on the customer body."
      }
    };

    const full = buildObjectSchema("customers", getScalarFields("customers"));
    full.properties = { ...full.properties, ...responseExtras };

    const listItem = buildListItemSchema("customers", cfg);
    listItem.properties = { ...listItem.properties, ...responseExtras };

    const createInput = buildObjectSchema(
      "customers",
      getWritableFields("customers", cfg, "create"),
      cfg.requiredOnCreate || []
    );
    createInput.properties = { ...createInput.properties, ...writeExtras };

    const updateInput = buildObjectSchema(
      "customers",
      getWritableFields("customers", cfg, "update"),
      cfg.requiredOnUpdate || []
    );
    updateInput.properties = { ...updateInput.properties, ...writeExtras };

    manual.customers = full;
    manual.customersListItem = listItem;
    manual.customersCreateInput = createInput;
    manual.customersUpdateInput = updateInput;
    manual.customersListResponse = buildListResponseSchema("customers");
  }

  return manual;
}

function buildListItemSchema(resourceName, config) {
  const properties = Object.fromEntries(
    getListScalarFields(resourceName, config).map((field) => [
      field.name,
      {
        ...toOpenApiType(field),
        nullable: !field.isRequired
      }
    ])
  );

  Object.values(config.listRelations || {}).forEach((relationConfig) => {
    properties[relationConfig.output] = {
      type: "string",
      nullable: true
    };
  });

  return {
    type: "object",
    properties
  };
}

function getSortableListColumns(resourceName, config) {
  return [
    ...getListFilterFields(resourceName, config).map((field) => field.name),
    ...Object.values(config.listRelations || {}).map((relationConfig) => relationConfig.output)
  ];
}

function paginationParameters(resourceName, config) {
  return [
    {
      in: "query",
      name: "page",
      schema: { type: "integer", default: 1, minimum: 1 },
      description: "Page number"
    },
    {
      in: "query",
      name: "pageSize",
      schema: { type: "integer", default: 25, minimum: 1, maximum: 100 },
      description: "Records per page"
    },
    {
      in: "query",
      name: "sortBy",
      schema: {
        type: "string",
        enum: getSortableListColumns(resourceName, config)
      },
      description: "Sort by any returned list column (defaults to createdat desc when omitted)"
    },
    {
      in: "query",
      name: "sortOrder",
      schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
      description: "Sort direction (default desc — newest created first when sortBy is omitted)"
    }
  ];
}

function jobListQueryParameters() {
  const pagination = [
    { in: "query", name: "page", schema: { type: "integer", default: 1, minimum: 1 } },
    {
      in: "query",
      name: "pageSize",
      schema: { type: "integer", default: 25, minimum: 1, maximum: 100 },
      description: "Alias: limit"
    },
    {
      in: "query",
      name: "sortBy",
      schema: {
        type: "string",
        enum: [
          "recno",
          "code",
          "date",
          "assignedto",
          "followupby",
          "followUpById",
          "city",
          "area",
          "serviceId",
          "categoryId",
          "faultId",
          "customerid",
          "statusid",
          "priority",
          "deliverytype",
          "jobTypeId",
          "jobTypeName",
          "jobSourceId",
          "jobSourceName",
          "quotationStatus",
          "quotationStatusName",
          "manualjobno",
          "complaintBy",
          "iscompleted",
          "isresolved",
          "customerName",
          "assignedToName",
          "followUpByName",
          "statusName",
          "serviceName",
          "faultName"
        ]
      }
    },
    { in: "query", name: "sortOrder", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } }
  ];

  const filters = [
    { in: "query", name: "recno", schema: { type: "integer" }, description: "Job id" },
    { in: "query", name: "code", schema: { type: "string" } },
    { in: "query", name: "search", schema: { type: "string" }, description: "Contains match on code or manualjobno" },
    { in: "query", name: "manualjobno", schema: { type: "string" } },
    { in: "query", name: "statusid", schema: { type: "integer" } },
    { in: "query", name: "priority", schema: { type: "string" } },
    { in: "query", name: "serviceId", schema: { type: "integer" }, description: "Job group id (jobgroups.groupid)" },
    { in: "query", name: "categoryId", schema: { type: "integer" }, description: "Job category id (jobcategories.categoryid)" },
    { in: "query", name: "faultId", schema: { type: "integer" }, description: "Job sub category id (jobsubcategories.subcategoryid)" },
    { in: "query", name: "customerid", schema: { type: "integer" } },
    { in: "query", name: "customerName", schema: { type: "string" }, description: "Partial customer name" },
    {
      in: "query",
      name: "customerPhone",
      schema: { type: "string" },
      description: "Partial customer phone (customers.contactno)"
    },
    {
      in: "query",
      name: "customerEmail",
      schema: { type: "string" },
      description: "Partial customer email (customers.email)"
    },
    { in: "query", name: "assignedto", schema: { type: "integer" } },
    { in: "query", name: "followupby", schema: { type: "integer" }, description: "Follow-up user id (alias: followUpById)" },
    { in: "query", name: "followUpById", schema: { type: "integer" }, description: "Follow-up user id (job.followupby)" },
    { in: "query", name: "assignedToName", schema: { type: "string" }, description: "Partial assignee name" },
    { in: "query", name: "followUpByName", schema: { type: "string" }, description: "Partial follow-up user name" },
    { in: "query", name: "city", schema: { type: "integer" } },
    { in: "query", name: "area", schema: { type: "integer" } },
    { in: "query", name: "deliverytype", schema: { type: "integer" } },
    { in: "query", name: "jobTypeId", schema: { type: "integer" }, description: "FK to jobtypes.recno" },
    { in: "query", name: "jobSourceId", schema: { type: "integer" }, description: "FK to jobsources.recno" },
    {
      in: "query",
      name: "quotationStatus",
      schema: { type: "string", enum: ["created", "sent", "approved", "rejected"] },
      description: "Quotation workflow status (separate from job statusid)"
    },
    { in: "query", name: "isinwaranty", schema: { type: "boolean" } },
    { in: "query", name: "iscompleted", schema: { type: "boolean" } },
    { in: "query", name: "isresolved", schema: { type: "boolean" } },
    { in: "query", name: "isfirstresponse", schema: { type: "boolean" } },
    { in: "query", name: "isacknowledged", schema: { type: "boolean" } },
    { in: "query", name: "qualityassuerd", schema: { type: "boolean" } },
    { in: "query", name: "from", schema: { type: "string", format: "date-time" }, description: "Job date from" },
    { in: "query", name: "to", schema: { type: "string", format: "date-time" }, description: "Job date to" },
    {
      in: "query",
      name: "brandId",
      schema: { type: "integer" },
      description: "Filter by job.brandid (brands.recno)"
    },
    {
      in: "query",
      name: "invoiceNumber",
      schema: { type: "string" },
      description:
        "Partial match on job equipment invoice number (stored in jobdetails.remarks JSON). Aliases: invoiceNo"
    },
    {
      in: "query",
      name: "kpi",
      schema: {
        type: "string",
        enum: ["newJobs", "assignedJobs", "followUpJobs", "completedJobs", "cancelledJobs"]
      },
      description:
        "Filter the job list by a Job page KPI bucket. Aliases: statsKpi"
    },
    ...createdByQueryParameters({ includeName: true })
  ];

  return [...pagination, ...filters];
}

function filterParameters(resourceName) {
  const config = publicResources[resourceName];
  const scalarParameters = getListFilterFields(resourceName, config).map((field) => ({
    in: "query",
    name: field.name,
    schema: toOpenApiType(field),
    description: listFilterDescription(field)
  }));

  const relationParameters = Object.keys(config.listRelations || {}).map((sourceField) => {
    const field = getScalarFields(resourceName).find((scalarField) => scalarField.name === sourceField);

    return {
      in: "query",
      name: sourceField,
      schema: field ? toOpenApiType(field) : { type: "integer" },
      description: `Filter ${sourceField} by exact id`
    };
  });

  const createdByParameters = hasCreatedByField(resourceName)
    ? createdByQueryParameters()
    : [];

  return [
    ...scalarParameters,
    ...relationParameters,
    ...createdByParameters
  ];
}

function buildResourcePath(name, config) {
  const collectionPath = {
    get: {
      summary: `List ${name}`,
      tags: [config.tag || name],
      security: [{ bearerAuth: [] }],
      parameters: [
        ...paginationParameters(name, config),
        ...filterParameters(name)
      ],
      responses: {
        200: {
          description: "Paged records returned",
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${schemaName(name, "ListResponse")}` }
            }
          }
        }
      }
    }
  };

  if (!config.noCreate) {
    collectionPath.post = {
      summary: `Create ${name}`,
      tags: [config.tag || name],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${schemaName(name, "CreateInput")}` }
          }
        }
      },
      responses: {
        201: {
          description: "Record created",
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${schemaName(name)}` }
            }
          }
        }
      }
    };
  }

  return collectionPath;
}

function buildDropdownQueryParameters(config, resourceName) {
  const params = [];

  params.push(
    {
      in: "query",
      name: "limit",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: 50000 },
      description:
        resourceName === "products" || resourceName === "erpproducts"
          ? "Max rows to return (default 10000). Use `all` to return every matching product."
          : "Max rows to return (default 500). Use `all` to return every matching row."
    },
    {
      in: "query",
      name: "page",
      required: false,
      schema: { type: "integer", minimum: 1 },
      description: "Optional page number when paginating with limit/pageSize"
    },
    {
      in: "query",
      name: "pageSize",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: 50000 },
      description: "Alias for limit when using page-based pagination"
    },
    {
      in: "query",
      name: "includeInactive",
      required: false,
      schema: { type: "boolean", default: false },
      description:
        "When true, include inactive rows for resources that have an isactive column (default returns only active rows)."
    }
  );

  if (resourceName === "products" || resourceName === "erpproducts") {
    params.push({
      in: "query",
      name: "search",
      required: false,
      schema: { type: "string" },
      description: "Filter products by name, barcode, erp code, or HS code (aliases: q, name)"
    });
  }

  if (config.organizationScoped) {
    params.push({
      in: "query",
      name: "allBranches",
      required: false,
      schema: { type: "boolean" },
      description: "When true, include users from all branches in the organization"
    });
    params.push({
      in: "query",
      name: "branchid",
      required: false,
      schema: { type: "integer" },
      description: "Filter to a specific branch (default: JWT branch)"
    });
    params.push({
      in: "query",
      name: "userType",
      required: false,
      schema: { type: "string", enum: ["admin", "manager", "technician", "distributor"] },
      description: "Filter by user type (aliases: usertype, type)"
    });
  }

  const defs = config.dropdownFilters;
  if (!Array.isArray(defs) || !defs.length) return params;
  return params.concat(
    defs.flatMap((def) =>
      (def.params || []).map((param) => ({
        in: "query",
        name: param,
        required: false,
        schema: { type: "integer" },
        description: `Filter dropdown rows where ${def.field} equals this value`
      }))
    )
  );
}

function buildResourceItemPath(name, config) {
  return {
    get: {
      summary: `Get ${name} by ${config.id}`,
      tags: [config.tag || name],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
      responses: {
        200: {
          description: "Record returned",
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${schemaName(name)}` }
            }
          }
        },
        404: { description: "Record not found" }
      }
    },
    put: {
      summary: `Update ${name}`,
      tags: [config.tag || name],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${schemaName(name, "UpdateInput")}` }
          }
        }
      },
      responses: {
        200: {
          description: "Record updated",
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${schemaName(name)}` }
            }
          }
        }
      }
    },
    ...(config.noRemove ? {} : {delete: {
      summary: `Delete ${name}`,
      tags: [config.tag || name],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
      responses: { 200: { description: "Record deleted" } }
    }})
  };
}

const resourcePaths = Object.fromEntries(
  Object.entries(publicResources).flatMap(([name, config]) => [
    [`/api/${name}`, buildResourcePath(name, config)],
    [`/api/${name}/{id}`, buildResourceItemPath(name, config)],
    [`/api/${name}/dropdown`, {
      get: {
        summary: `Dropdown options for ${name}`,
        description: config.organizationScoped
          ? "Returns active users linked to the authenticated organization (current branch by default). Inactive and deleted users are excluded. Optional filter: `userType` (admin, manager, technician, distributor). Each item includes `userType`, and for technicians `technicianAffiliation` (`in_house`, `third_party`) with `technicianAffiliationLabel` (`In-House`, `Third-party`) plus `companyName` when third-party."
          : name === "products"
            ? "Returns active products for the tenant (default limit 10000) with sale/purchase rates, discount info, unit/brand labels, and tax info when available. Use `includeInactive=true` to include inactive catalog rows, or `search` to filter by name/code."
            : name === "erpproducts"
              ? "Returns active ERP products for the tenant (default limit 10000) with sale/purchase rates, discount info, unit/brand labels, and job group/category names. Optional filters: `groupId`, `categoryId` (aliases: `serviceId`). Excludes stock/service/tax fields. Use `includeInactive=true` or `search` like products."
              : "Returns only active rows when the resource has an isactive column (`isactive` is not false).",
        tags: [config.tag || name],
        security: [{ bearerAuth: [] }],
        parameters: buildDropdownQueryParameters(config, name),
        responses: {
          200: {
            description: "Dropdown options returned"
          }
        }
      }
    }],
    [`/api/${name}/details/{id}`, {
      get: {
        summary:
          name === "policies"
            ? "Get policy with userRights (screen names and permissions)"
            : `Get complete ${name} details with relations`,
        tags: [config.tag || name],
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        responses: {
          200: {
            description: "Detailed record returned",
            content: {
              "application/json": {
                schema:
                  name === "policies"
                    ? { $ref: "#/components/schemas/PolicyDetailsResponse" }
                    : { $ref: `#/components/schemas/${schemaName(name)}` }
              }
            }
          },
          404: { description: "Record not found" }
        }
      }
    }],
    ...(name === "policies"
      ? [
          [
            `/api/policies/{id}/rights`,
            {
              put: {
                summary: "Update policy screen rights (bulk)",
                description:
                  "Updates view/add/update/delete/others flags per screen. Use recno from GET /api/policies/details/:id or screenid+branchid.",
                tags: [config.tag || name],
                security: [{ bearerAuth: [] }],
                parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
                requestBody: {
                  required: true,
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/PolicyRightsUpdateInput" }
                    }
                  }
                },
                responses: {
                  200: {
                    description: "Policy with updated userRights",
                    content: {
                      "application/json": {
                        schema: { $ref: "#/components/schemas/PolicyDetailsResponse" }
                      }
                    }
                  },
                  400: { description: "Invalid userRights payload" },
                  403: { description: "Default admin policy cannot be changed" },
                  404: { description: "Policy or rights row not found" }
                }
              }
            }
          ]
        ]
      : [])
  ])
);

module.exports = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ConnectCMS API",
      version: "1.0.0",
      description: "API documentation for ConnectCMS Node.js application with Prisma ORM"
    },
    servers: [
      {
        url: "https://cmsapis.lightclouderp.com",
        description: "Development server"
      },
      {
        url: "http://localhost:3000",
        description: "Development server"
      },
      {
        url: "http://72.60.236.155",
        description: "Development server"
      }
    ],
    tags: [
      { name: "Auth", description: "Authentication, signup, invitations and user context" },
      { name: "User", description: "Authenticated user profile and effective screen rights" },
      { name: "Upload", description: "Multipart file uploads (stored under /uploads/general)" },
      { name: "Product Bulk Upload", description: "Bulk product import via Excel template with column mapping" },
      { name: "Category Bulk Upload", description: "Bulk job category import via Excel template with column mapping" },
      { name: "Subcategory Bulk Upload", description: "Bulk job subcategory import via Excel template with column mapping" },
      { name: "Tracking", description: "Live user GPS pings (lat/lng) scoped to tenant and branch" },
      { name: "Announcements", description: "Admin announcements for technicians and branch staff" },
      { name: "User Activity Logs", description: "Audit trail of user actions across modules (CRUD, auth, jobs, settings)" },
      { name: "Notifications", description: "Firebase FCM push notifications and device token registration" },
      { name: JOBS_TAG, description: "Job creation, workflow actions, details and child records" },
      { name: ALL_JOBS_TAG, description: "All tenant/branch jobs, dashboards and reports" },
      { name: MY_JOBS_TAG, description: "Jobs assigned to the authenticated user, dashboards and reports" },
      { name: TEAM_JOBS_TAG, description: "Jobs assigned to technicians managed by the authenticated user" },
      { name: DASHBOARD_TAG, description: "Dashboard overview metrics for the authenticated tenant and branch" },
      { name: "Dropdowns", description: "Dropdown data for frontend selectors" },
      { name: "GraphQL", description: "GraphQL reporting and dashboard endpoint" }
    ],
    paths: {
      "/api/auth/signup": {
        post: {
          summary: "Start signup",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SignupRequest" }
              }
            }
          },
          responses: { 201: { description: "Signup token sent" } }
        }
      },
      "/api/auth/signup/verify": {
        post: {
          summary: "Verify signup token",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VerifySignupRequest" }
              }
            }
          },
          responses: { 200: { description: "Signup token verified" } }
        }
      },
      "/api/auth/password": {
        post: {
          summary: "Configure password after signup verification",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConfigurePasswordRequest" }
              }
            }
          },
          responses: { 200: { description: "Password configured" } }
        }
      },
      "/api/auth/forgot-password": {
        post: {
          summary: "Request password reset email",
          description:
            "Sends a 6-digit reset code when the account exists and has a password. Always returns the same message (no email enumeration). Link uses APP_URL/reset-password?token=&email=.",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForgotPasswordRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "Generic success message",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ForgotPasswordResponse" }
                }
              }
            }
          }
        }
      },
      "/api/auth/reset-password": {
        post: {
          summary: "Reset password with email + token from forgot-password email",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResetPasswordRequest" }
              }
            }
          },
          responses: {
            200: { description: "Password updated" },
            400: { description: "Invalid or expired token" }
          }
        }
      },
      "/api/auth/organizations": {
        post: {
          summary: "Create organization using email and password",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateOrganizationRequest" }
              }
            }
          },
          responses: { 201: { description: "Organization, default branch, and default Admin/Manager/Technician policies created" } }
        }
      },
      "/api/auth/login": {
        post: {
          summary: "Login and receive tenant/branch JWT",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "JWT, user context and aggregated screen rights",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LoginResponse" }
                }
              }
            }
          }
        }
      },
      "/api/auth/profile": {
        get: {
          summary: "Get profile with refreshed token (same as login response)",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Profile returned with refreshed token",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LoginResponse" }
                }
              }
            }
          }
        },
        put: {
          summary: "Update logged-in user profile",
          description:
            "Alias of PUT /api/user/profile. Updates name, contact, gender, country, city, and/or profile image (email is read-only). Returns the same payload as GET profile (refreshed JWT + screen rights).",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateProfileRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "Profile updated; refreshed token and user object",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LoginResponse" }
                }
              }
            },
            400: { description: "Validation error, no fields to update, or email change not allowed" }
          }
        }
      },
      "/api/auth/change-password": {
        post: {
          summary: "Change password (authenticated)",
          description:
            "Requires current password. Same rules as POST /api/user/change-password (min 8 chars for new password).",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChangePasswordRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "Password updated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string", example: "Password changed successfully" }
                    }
                  }
                }
              }
            },
            400: { description: "Validation or wrong current password" },
            401: { description: "Missing or invalid JWT" }
          }
        }
      },
      "/api/auth/profile-image": {
        post: {
          summary: "Upload profile image (multipart)",
          description:
            "Alias of POST /api/user/profile-image. Multipart field `file`, or imageUrl, or remove=true. Returns refreshed JWT profile payload.",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                    imageUrl: { type: "string" },
                    remove: { type: "boolean" }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: "Profile image updated",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LoginResponse" }
                }
              }
            }
          }
        },
        put: {
          summary: "Set profile image URL",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileImageRequest" }
              }
            }
          },
          responses: { 200: { description: "Profile image updated" } }
        }
      },
      "/api/auth/switch": {
        post: {
          summary: "Switch tenant or branch",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SwitchContextRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "Same payload as GET /api/auth/profile for the selected tenant/branch",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LoginResponse" }
                }
              }
            }
          }
        }
      },
      "/api/user/profile": {
        get: {
          summary: "Get profile with refreshed token and screen rights",
          tags: ["User"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Same shape as login response",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LoginResponse" }
                }
              }
            }
          }
        },
        put: {
          summary: "Update logged-in user profile",
          description:
            "Partial update for the JWT user (email is read-only). At least one field required. Upload a file via POST /api/upload first, then pass the returned url as profileimage or imageUrl.",
          tags: ["User"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateProfileRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "Profile updated; same shape as GET /api/user/profile",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LoginResponse" }
                }
              }
            },
            400: { description: "Validation error, no fields to update, or email change not allowed" }
          }
        }
      },
      "/api/user/profile-image": {
        post: {
          summary: "Upload profile image (multipart)",
          description:
            "Multipart field `file` (JPEG/PNG/GIF/WebP, max 5MB). Or pass imageUrl in form/json. Set remove=true to delete image. Returns same payload as GET /api/user/profile.",
          tags: ["User"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                    imageUrl: { type: "string" },
                    remove: { type: "boolean" }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: "Profile with refreshed token",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LoginResponse" }
                }
              }
            },
            413: { description: "Image too large" }
          }
        },
        put: {
          summary: "Update profile image URL only",
          tags: ["User"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["imageUrl"],
                  properties: {
                    imageUrl: {
                      type: "string",
                      description: "URL from POST /api/upload or other hosted image path"
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: "Image URL saved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      profileimage: { type: "string", nullable: true }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/user/change-password": {
        post: {
          summary: "Change password (authenticated)",
          tags: ["User"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChangePasswordRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "Password updated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string", example: "Password changed successfully" }
                    }
                  }
                }
              }
            },
            400: { description: "Validation or wrong current password" }
          }
        }
      },
      "/api/user/screen-rights": {
        get: {
          summary: "Get effective screen rights for the current JWT tenant/branch",
          tags: ["User"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Aggregated rights per accessible screen",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ScreenRightsPayload" }
                }
              }
            }
          }
        }
      },
      "/api/upload": {
        post: {
          summary: "Upload a file (multipart field name: file)",
          description:
            "Saves under uploads/general/{tenantid}/{branchid}/ and returns URLs. Requires JWT with userid, tenantid, branchid.",
          tags: ["Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: { type: "string", format: "binary", description: "File to store" }
                  }
                }
              }
            }
          },
          responses: {
            201: {
              description: "File saved; url is path-relative to the API host (also served as static /uploads/...)",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FileUploadResponse" }
                }
              }
            },
            400: { description: "Missing file or wrong field name" },
            401: { description: "Missing or invalid JWT / tenant context" },
            413: { description: "File larger than UPLOAD_MAX_FILE_BYTES" }
          }
        }
      },
      "/api/products/bulk-upload/template": {
        get: {
          summary: "Download product bulk upload Excel template",
          description:
            "Returns an .xlsx template with required column headers and one sample row. Map your data to these columns or upload a custom sheet and map columns in the preview step.",
          tags: ["Product Bulk Upload"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Excel template file",
              content: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                  schema: { type: "string", format: "binary" }
                }
              }
            },
            401: { description: "Unauthorized" },
            403: { description: "Missing products view permission" }
          }
        }
      },
      "/api/products/bulk-upload/upload": {
        post: {
          summary: "Step 1 — Upload product file to temp storage",
          description:
            "Upload .xlsx, .xls, or .csv for column mapping. PDF is accepted but cannot be mapped — use Excel. File is stored under uploads/temp/products until confirm or cancel.",
          tags: ["Product Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                      description: "Excel (.xlsx, .xls, .csv) or PDF"
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: "Upload session created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductBulkUploadSession" }
                }
              }
            },
            400: { description: "Invalid or empty file" },
            401: { description: "Unauthorized" },
            403: { description: "Missing products add permission" }
          }
        }
      },
      "/api/products/bulk-upload/preview": {
        post: {
          summary: "Step 2 — Map columns and preview validation",
          description:
            "Map uploaded file columns to system fields. Returns how many rows are ready vs have problems, with per-row issue details. Optionally set dateFormat when mapping Created Date.",
          tags: ["Product Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductBulkPreviewRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "Validation preview",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductBulkPreviewResponse" }
                }
              }
            },
            400: { description: "Invalid mapping or upload session" },
            401: { description: "Unauthorized" },
            403: { description: "Missing products add permission" },
            410: { description: "Upload session expired" }
          }
        }
      },
      "/api/products/bulk-upload/confirm": {
        post: {
          summary: "Step 3 — Confirm import and create products",
          description:
            "Imports all valid rows from the uploaded file using the same columnMapping (and optional dateFormat) from preview. Invalid rows are skipped. Temp upload folder is removed after import.",
          tags: ["Product Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductBulkConfirmRequest" }
              }
            }
          },
          responses: {
            201: {
              description: "Import completed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductBulkConfirmResponse" }
                }
              }
            },
            400: { description: "No valid rows or invalid mapping" },
            401: { description: "Unauthorized" },
            403: { description: "Missing products add permission" },
            410: { description: "Upload session expired" }
          }
        }
      },
      "/api/products/bulk-upload/{uploadId}": {
        delete: {
          summary: "Cancel product bulk upload session",
          tags: ["Product Bulk Upload"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "uploadId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" }
            }
          ],
          responses: {
            200: { description: "Session cancelled and temp files removed" },
            401: { description: "Unauthorized" },
            404: { description: "Session not found" }
          }
        }
      },
      "/api/jobcategories/bulk-upload/template": {
        get: {
          summary: "Download job category bulk upload Excel template",
          tags: ["Category Bulk Upload"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Excel template (Name, Group, Color, Is Active, Created Date)",
              content: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                  schema: { type: "string", format: "binary" }
                }
              }
            }
          }
        }
      },
      "/api/jobcategories/bulk-upload/upload": {
        post: {
          summary: "Step 1 — Upload category file to temp storage",
          tags: ["Category Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: { file: { type: "string", format: "binary" } }
                }
              }
            }
          },
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductBulkUploadSession" }
                }
              }
            }
          }
        }
      },
      "/api/jobcategories/bulk-upload/preview": {
        post: {
          summary: "Step 2 — Map columns and preview category import",
          description:
            "Unknown Group names are marked for auto-create on confirm. Required mapping: name, group.",
          tags: ["Category Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductBulkPreviewRequest" }
              }
            }
          },
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductBulkPreviewResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobcategories/bulk-upload/confirm": {
        post: {
          summary: "Step 3 — Confirm and create job categories",
          tags: ["Category Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductBulkConfirmRequest" }
              }
            }
          },
          responses: {
            201: { description: "Import completed" }
          }
        }
      },
      "/api/jobcategories/bulk-upload/{uploadId}": {
        delete: {
          summary: "Cancel category bulk upload session",
          tags: ["Category Bulk Upload"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "uploadId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
          ],
          responses: { 200: { description: "Cancelled" } }
        }
      },
      "/api/jobsubcategories/bulk-upload/template": {
        get: {
          summary: "Download job subcategory bulk upload Excel template",
          tags: ["Subcategory Bulk Upload"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Excel template (Name, Category, Group, Color, Is Active, Created Date)",
              content: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                  schema: { type: "string", format: "binary" }
                }
              }
            }
          }
        }
      },
      "/api/jobsubcategories/bulk-upload/upload": {
        post: {
          summary: "Step 1 — Upload subcategory file to temp storage",
          tags: ["Subcategory Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: { file: { type: "string", format: "binary" } }
                }
              }
            }
          },
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductBulkUploadSession" }
                }
              }
            }
          }
        }
      },
      "/api/jobsubcategories/bulk-upload/preview": {
        post: {
          summary: "Step 2 — Map columns and preview subcategory import",
          description:
            "Unknown Category/Group names can be auto-created on confirm. Group is required when Category does not exist.",
          tags: ["Subcategory Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductBulkPreviewRequest" }
              }
            }
          },
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductBulkPreviewResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobsubcategories/bulk-upload/confirm": {
        post: {
          summary: "Step 3 — Confirm and create job subcategories",
          tags: ["Subcategory Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductBulkConfirmRequest" }
              }
            }
          },
          responses: {
            201: { description: "Import completed" }
          }
        }
      },
      "/api/jobsubcategories/bulk-upload/{uploadId}": {
        delete: {
          summary: "Cancel subcategory bulk upload session",
          tags: ["Subcategory Bulk Upload"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: "uploadId", in: "path", required: true, schema: { type: "string", format: "uuid" } }
          ],
          responses: { 200: { description: "Cancelled" } }
        }
      },
      "/api/erpproducts/bulk-upload/template": {
        get: {
          summary: "Download ERP product bulk upload Excel template",
          description:
            "Returns an .xlsx template with ERP product column headers and one sample row.",
          tags: ["ERP Product Bulk Upload"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Excel template file",
              content: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                  schema: { type: "string", format: "binary" }
                }
              }
            },
            401: { description: "Unauthorized" },
            403: { description: "Missing erpproducts view permission" }
          }
        }
      },
      "/api/erpproducts/bulk-upload/upload": {
        post: {
          summary: "Step 1 — Upload ERP product file to temp storage",
          description:
            "Upload .xlsx, .xls, or .csv for column mapping. File is stored under uploads/temp/erpproducts until confirm or cancel.",
          tags: ["ERP Product Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: {
                    file: {
                      type: "string",
                      format: "binary",
                      description: "Excel (.xlsx, .xls, .csv) or PDF"
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: "Upload session created",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductBulkUploadSession" }
                }
              }
            },
            400: { description: "Invalid or empty file" },
            401: { description: "Unauthorized" },
            403: { description: "Missing erpproducts add permission" }
          }
        }
      },
      "/api/erpproducts/bulk-upload/preview": {
        post: {
          summary: "Step 2 — Map columns and preview ERP product import",
          description:
            "Map uploaded file columns to ERP product fields. Unknown Unit/Brand names are marked for auto-create on confirm.",
          tags: ["ERP Product Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductBulkPreviewRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "Validation preview",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductBulkPreviewResponse" }
                }
              }
            },
            400: { description: "Invalid mapping or upload session" },
            401: { description: "Unauthorized" },
            403: { description: "Missing erpproducts add permission" },
            410: { description: "Upload session expired" }
          }
        }
      },
      "/api/erpproducts/bulk-upload/confirm": {
        post: {
          summary: "Step 3 — Confirm and create ERP products",
          description:
            "Imports all valid rows from the uploaded file using the columnMapping from preview.",
          tags: ["ERP Product Bulk Upload"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductBulkConfirmRequest" }
              }
            }
          },
          responses: {
            201: {
              description: "Import completed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ProductBulkConfirmResponse" }
                }
              }
            },
            400: { description: "No valid rows or invalid mapping" },
            401: { description: "Unauthorized" },
            403: { description: "Missing erpproducts add permission" },
            410: { description: "Upload session expired" }
          }
        }
      },
      "/api/erpproducts/bulk-upload/{uploadId}": {
        delete: {
          summary: "Cancel ERP product bulk upload session",
          tags: ["ERP Product Bulk Upload"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "uploadId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" }
            }
          ],
          responses: {
            200: { description: "Session cancelled and temp files removed" },
            401: { description: "Unauthorized" },
            404: { description: "Session not found" }
          }
        }
      },
      "/api/tracking/ping": {
        post: {
          summary: "Record user location pings (batch)",
          description:
            "Stores one row per ping for the JWT user in the current tenant/branch. Send a JSON array of ping objects, or `{ \"pings\": [...] }`. Max 100 per request. Omit `jobid` to record general technician location when not travelling to or working on a job.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrackingPingBatchRequest" }
              }
            }
          },
          responses: {
            201: {
              description: "Locations saved",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TrackingPingBatchResponse" }
                }
              }
            },
            400: { description: "Invalid coordinates or payload" },
            401: { description: "Missing JWT or tenant context" },
            403: { description: "User not in branch or branch mismatch" }
          }
        }
      },
      "/api/tracking/live": {
        get: {
          summary: "Latest location per user in this branch (live map)",
          description:
            "Most recent ping per user assigned to the branch. Use rolling `minutes` (default 30, max 1440), or filter by `date` / `dateFrom`+`dateTo` (UTC). Date filters take precedence over `minutes`.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "minutes",
              schema: { type: "integer", default: 30, minimum: 1, maximum: 1440 },
              description: "Rolling window — ignored when date/dateFrom/dateTo is set"
            },
            {
              in: "query",
              name: "date",
              schema: { type: "string", format: "date" },
              description: "Single UTC day filter (YYYY-MM-DD). Alternative to dateFrom/dateTo"
            },
            {
              in: "query",
              name: "dateFrom",
              schema: { type: "string", format: "date" },
              description: "Range start (YYYY-MM-DD). Alias: from"
            },
            {
              in: "query",
              name: "dateTo",
              schema: { type: "string", format: "date" },
              description: "Range end inclusive (YYYY-MM-DD). Alias: to"
            },
            {
              in: "query",
              name: "jobid",
              schema: { type: "integer" },
              description: "Optional — only pings for this job"
            }
          ],
          responses: {
            200: {
              description: "Latest ping per user",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TrackingLiveResponse" }
                }
              }
            },
            401: { description: "Missing JWT or tenant context" },
            403: { description: "Branch not in tenant" }
          }
        }
      },
      "/api/tracking/technicians/summary": {
        get: {
          summary: "Technician tracking summary grouped by technician",
          description:
            "Lists branch technicians with their latest location. Without date filters, returns the most recent ping ever recorded. Optional filters: `jobid`, `date`, `dateFrom`/`dateTo`, or rolling `minutes`.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "jobid",
              schema: { type: "integer" },
              description: "Optional — only consider pings for this job"
            },
            {
              in: "query",
              name: "minutes",
              schema: { type: "integer", minimum: 1, maximum: 1440 },
              description: "Rolling window when no date filter is set"
            },
            {
              in: "query",
              name: "date",
              schema: { type: "string", format: "date" },
              description: "Single UTC day (YYYY-MM-DD)"
            },
            {
              in: "query",
              name: "dateFrom",
              schema: { type: "string", format: "date" },
              description: "Range start. Alias: from"
            },
            {
              in: "query",
              name: "dateTo",
              schema: { type: "string", format: "date" },
              description: "Range end inclusive. Alias: to"
            }
          ],
          responses: {
            200: {
              description: "Technicians with last location and counts",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TrackingTechniciansSummaryResponse" }
                }
              }
            }
          }
        }
      },
      "/api/tracking/technicians/{userid}/detail": {
        get: {
          summary: "Full tracking trail for one technician",
          description:
            "Paginated chronological pings for a technician. Defaults to today (UTC) when no date range is provided. Max range 31 days. Filters: `jobid`, `date`, `dateFrom`/`dateTo`, `page`, `pageSize`.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "userid", required: true, schema: { type: "integer" } },
            {
              in: "query",
              name: "jobid",
              schema: { type: "integer" },
              description: "Optional — only pings for this job"
            },
            {
              in: "query",
              name: "date",
              schema: { type: "string", format: "date" },
              description: "Single UTC day (YYYY-MM-DD)"
            },
            {
              in: "query",
              name: "dateFrom",
              schema: { type: "string", format: "date" },
              description: "Range start. Alias: from"
            },
            {
              in: "query",
              name: "dateTo",
              schema: { type: "string", format: "date" },
              description: "Range end inclusive. Alias: to"
            },
            {
              in: "query",
              name: "page",
              schema: { type: "integer", minimum: 1, default: 1 }
            },
            {
              in: "query",
              name: "pageSize",
              schema: { type: "integer", minimum: 1, maximum: 500, default: 100 },
              description: "Alias: limit"
            }
          ],
          responses: {
            200: {
              description: "Tracking trail",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TrackingTechnicianDetailResponse" }
                }
              }
            },
            404: { description: "Technician not found in branch" }
          }
        }
      },
      "/api/tracking/attendance/me": {
        get: {
          summary: "Current user attendance status",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "presence: active | idle | out" } }
        }
      },
      "/api/tracking/attendance/me/history": {
        get: {
          summary: "List own attendance sessions",
          description:
            "Paginated history of the JWT user's attendance sessions for the current tenant/branch. Filter by single `date` (YYYY-MM-DD), `dateFrom`/`dateTo` range, and/or session `status`.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "date",
              schema: { type: "string", format: "date" },
              description: "Single UTC day filter (alternative to dateFrom/dateTo)"
            },
            {
              in: "query",
              name: "dateFrom",
              schema: { type: "string", format: "date" },
              description: "Range start (YYYY-MM-DD). Alias: from"
            },
            {
              in: "query",
              name: "dateTo",
              schema: { type: "string", format: "date" },
              description: "Range end inclusive (YYYY-MM-DD). Alias: to"
            },
            {
              in: "query",
              name: "status",
              schema: {
                type: "string",
                enum: ["checked_in", "on_break", "checked_out"]
              },
              description: "Filter by final/current session status"
            },
            { in: "query", name: "page", schema: { type: "integer", default: 1 } },
            { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } }
          ],
          responses: {
            200: {
              description: "Attendance session list with durationMinutes per row",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MyAttendanceHistoryResponse" }
                }
              }
            }
          }
        }
      },
      "/api/tracking/attendance/check-in": {
        post: {
          summary: "Check in (start work session)",
          description:
            "Requires latitude, longitude, and address. Pass `method: \"face\"` after face approval is granted (face recognition is handled by your external module; this API only verifies approval status).",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AttendanceLocationBody" } }
            }
          },
          responses: { 200: { description: "Checked in (presence: active)" } }
        }
      },
      "/api/tracking/attendance/check-out": {
        post: {
          summary: "Check out (end work session)",
          description:
            "Requires latitude, longitude, and address. Pass `method: \"face\"` when using approved face attendance.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AttendanceLocationBody" } }
            }
          },
          responses: { 200: { description: "Checked out (presence: out)" } }
        }
      },
      "/api/tracking/attendance/break-in": {
        post: {
          summary: "Start break (idle)",
          description: "Must be checked in. Requires latitude, longitude, and address.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AttendanceLocationBody" } }
            }
          },
          responses: { 200: { description: "On break (presence: idle)" } }
        }
      },
      "/api/tracking/attendance/break-out": {
        post: {
          summary: "End break (back to active)",
          description: "Must be on break. Requires latitude, longitude, and address.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AttendanceLocationBody" } }
            }
          },
          responses: { 200: { description: "Break ended (presence: active)" } }
        }
      },
      "/api/tracking/face-approval/settings": {
        get: {
          summary: "Get branch face approval settings",
          description:
            "Requires Face Approval view permission on the caller's assigned policy. Returns whether face approval requests are enabled for the branch.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Branch face approval settings",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalBranchSettings" }
                }
              }
            },
            403: { description: "Admin or manager required" }
          }
        },
        put: {
          summary: "Save branch face approval settings",
          description:
            "Requires Face Approval update permission on the caller's assigned policy. Enable or disable face approval requests for the branch.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["isEnabled"],
                  properties: {
                    isEnabled: { type: "boolean", description: "Master switch for face approval requests" }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: "Updated settings",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalBranchSettings" }
                }
              }
            },
            403: { description: "Admin or manager required" }
          }
        }
      },
      "/api/tracking/face-approval/users/{userid}/settings": {
        get: {
          summary: "Get user face approval settings",
          description:
            "Requires Face Approval view permission on the caller's assigned policy. Per-user flags for requesting and using face attendance.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "userid", required: true, schema: { type: "integer" } }
          ],
          responses: {
            200: {
              description: "User face settings",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalUserSettings" }
                }
              }
            },
            403: { description: "Admin or manager required" }
          }
        },
        put: {
          summary: "Update user face approval settings",
          description:
            "Requires Face Approval update permission on the caller's assigned policy. Set `allowFaceApprovalRequest` to allow the user to submit face approval requests. Set `faceAttendanceEnabled` to manually grant or revoke face check-in/out (normally set automatically when a request is approved). Do not set both to true before the user submits unless you are bypassing the approval workflow. Disabling `allowFaceApprovalRequest` also disables face attendance.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "userid", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    allowFaceApprovalRequest: { type: "boolean" },
                    faceAttendanceEnabled: { type: "boolean" }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: "Updated user settings",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalUserSettings" }
                }
              }
            },
            403: { description: "Admin or manager required" }
          }
        }
      },
      "/api/tracking/face-approval/me": {
        get: {
          summary: "My face approval status",
          description:
            "Returns branch settings, user flags, whether the user can submit a request, and any pending/latest request.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Face approval status for authenticated user",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalMyStatusResponse" }
                }
              }
            }
          }
        }
      },
      "/api/tracking/face-approval/requests": {
        get: {
          summary: "List face approval requests",
          description:
            "Requires Face Approval view permission on the caller's assigned policy. Each row includes the submitted face image and the user's profile image.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "status",
              schema: { type: "string", enum: ["pending", "approved", "rejected"] }
            },
            { in: "query", name: "userid", schema: { type: "integer" } },
            { in: "query", name: "page", schema: { type: "integer", default: 1 } },
            { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } }
          ],
          responses: {
            200: {
              description: "Paged face approval requests",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalRequestListResponse" }
                }
              }
            },
            403: { description: "Admin or manager required" }
          }
        },
        post: {
          summary: "Submit face approval request",
          description:
            "Users may submit when branch face approval is enabled, the user has `allowFaceApprovalRequest`, and there is no pending request. Submitting a new request revokes `faceAttendanceEnabled` until a user with Face Approval update permission approves again. Requires a profile image and the new face image URL from your face recognition module.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FaceApprovalSubmitBody" }
              }
            }
          },
          responses: {
            201: {
              description: "Request submitted",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalSubmitResponse" }
                }
              }
            },
            400: { description: "Validation error or pending request exists" }
          }
        }
      },
      "/api/tracking/face-approval/requests/pending": {
        get: {
          summary: "List pending face approval requests",
          description:
            "Requires Face Approval view permission on the caller's assigned policy. Shortcut for status=pending.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "page", schema: { type: "integer", default: 1 } },
            { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } }
          ],
          responses: {
            200: {
              description: "Pending requests",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalRequestListResponse" }
                }
              }
            },
            403: { description: "Admin or manager required" }
          }
        }
      },
      "/api/tracking/face-approval/requests/{requestId}": {
        get: {
          summary: "Get face approval request",
          description: "Requires Face Approval view permission on the caller's assigned policy.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "requestId", required: true, schema: { type: "integer" } }
          ],
          responses: {
            200: {
              description: "Request details",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalRequestItem" }
                }
              }
            },
            404: { description: "Not found" }
          }
        }
      },
      "/api/tracking/face-approval/requests/{requestId}/approve": {
        post: {
          summary: "Approve face approval request",
          description:
            "Requires Face Approval update permission on the caller's assigned policy. Enables face attendance for the user.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "requestId", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reviewRemarks: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: "Approved",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalActionResponse" }
                }
              }
            },
            403: { description: "Admin or manager required" }
          }
        }
      },
      "/api/tracking/face-approval/requests/{requestId}/reject": {
        post: {
          summary: "Reject face approval request",
          description:
            "Requires Face Approval update permission on the caller's assigned policy. Requires reviewRemarks.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "requestId", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reviewRemarks"],
                  properties: {
                    reviewRemarks: { type: "string" }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: "Rejected",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/FaceApprovalActionResponse" }
                }
              }
            },
            403: { description: "Admin or manager required" }
          }
        }
      },
      "/api/tracking/attendance/users": {
        get: {
          summary: "Branch users with attendance presence and last location",
          description:
            "Lists branch members with `presence`: **active** (checked in), **idle** (on break), **out** (not checked in). Filter by any response field: userid, name, email, search, usertype, isactive, presence, attendanceStatus, sessionId, hasLocation. Applied filters are echoed in `filters`. Summary counts reflect the filtered list.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "branchid",
              schema: { type: "integer" },
              description: "Defaults to JWT branchid"
            },
            {
              in: "query",
              name: "userid",
              schema: { type: "integer" },
              description: "Exact user id"
            },
            {
              in: "query",
              name: "name",
              schema: { type: "string" },
              description: "Partial match on user name (case-insensitive)"
            },
            {
              in: "query",
              name: "email",
              schema: { type: "string" },
              description: "Partial match on user email (case-insensitive)"
            },
            {
              in: "query",
              name: "search",
              schema: { type: "string" },
              description: "Search name or email (aliases: q)"
            },
            {
              in: "query",
              name: "usertype",
              schema: { $ref: "#/components/schemas/UserType" },
              description: "Filter by user type (aliases: userType, type)"
            },
            {
              in: "query",
              name: "isactive",
              schema: { type: "boolean" },
              description: "Filter active/inactive users (alias: isActive, active)"
            },
            {
              in: "query",
              name: "presence",
              schema: { type: "string", enum: ["active", "idle", "out"] },
              description: "Attendance presence bucket"
            },
            {
              in: "query",
              name: "attendanceStatus",
              schema: {
                type: "string",
                enum: ["checked_in", "on_break", "checked_out", "none"]
              },
              description:
                "Open session status. Use `none` for users with no open session (same as presence=out). Alias: attendancestatus, status."
            },
            {
              in: "query",
              name: "sessionId",
              schema: { type: "integer" },
              description: "Filter by open attendance session id"
            },
            {
              in: "query",
              name: "hasLocation",
              schema: { type: "boolean" },
              description: "True when lastLocation is present (alias: haslocation, location)"
            }
          ],
          responses: {
            200: {
              description: "User list with summary counts",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AttendanceBranchUsersResponse" }
                }
              }
            }
          }
        }
      },
      "/api/tracking/attendance/logs": {
        get: {
          summary: "Attendance action history",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "userid", schema: { type: "integer" } },
            { in: "query", name: "sessionId", schema: { type: "integer" } },
            { in: "query", name: "limit", schema: { type: "integer", default: 50 } }
          ],
          responses: { 200: { description: "Log entries newest first" } }
        }
      },
      "/api/user-activity-logs": {
        get: {
          summary: "List user activity logs",
          description:
            "Admins and managers see all branch activity. Other users see only their own logs. Sorted by time descending (newest first).",
          tags: ["User Activity Logs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "page", schema: { type: "integer", default: 1 } },
            { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } },
            { in: "query", name: "module", schema: { type: "string" }, description: "Module/resource (e.g. jobs, products, users, auth)" },
            {
              in: "query",
              name: "action",
              schema: {
                type: "string",
                enum: [
                  "create",
                  "update",
                  "delete",
                  "assign",
                  "unassign",
                  "status_change",
                  "login",
                  "logout",
                  "password_changed",
                  "settings_updated",
                  "invite",
                  "activate",
                  "deactivate",
                  "block",
                  "unblock",
                  "approve",
                  "reject",
                  "complete",
                  "resolve",
                  "submit",
                  "upload",
                  "other"
                ]
              },
              description: "Nature of action (alias: nature)"
            },
            { in: "query", name: "nature", schema: { type: "string" }, description: "Alias for action" },
            { in: "query", name: "userid", schema: { type: "integer" }, description: "Filter by actor user id" },
            { in: "query", name: "jobid", schema: { type: "integer" }, description: "Filter by related job id" },
            { in: "query", name: "entityid", schema: { type: "integer" }, description: "Filter by affected record id" },
            { in: "query", name: "entitycode", schema: { type: "string" }, description: "Partial match on code (alias: code)" },
            { in: "query", name: "entityname", schema: { type: "string" }, description: "Partial match on name" },
            { in: "query", name: "search", schema: { type: "string" }, description: "Search name, code, summary, or module" },
            { in: "query", name: "from", schema: { type: "string", format: "date-time" }, description: "Activity time from (inclusive)" },
            { in: "query", name: "to", schema: { type: "string", format: "date-time" }, description: "Activity time to (inclusive)" },
            { in: "query", name: "branchid", schema: { type: "integer" }, description: "Branch scope (defaults to current branch)" }
          ],
          responses: {
            200: {
              description: "Paginated activity log list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UserActivityLogListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/announcements": {
        get: {
          summary: "List announcements for current user",
          description:
            "Technicians see active announcements for their branch (audience `technician` or `all`). Admins may pass `adminView=true` and `includeInactive=true` to manage all rows.",
          tags: ["Announcements"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "adminView",
              schema: { type: "boolean", default: false },
              description: "Admin only — include inactive / scheduled filtering options"
            },
            {
              in: "query",
              name: "includeInactive",
              schema: { type: "boolean", default: false },
              description: "Admin only — include deactivated announcements"
            },
            {
              in: "query",
              name: "audience",
              schema: {
                type: "string",
                enum: ["all", "technician", "manager", "admin"]
              },
              description: "Admin filter by audience"
            }
          ],
          responses: { 200: { description: "Announcement list" } }
        },
        post: {
          summary: "Create announcement (admin only)",
          tags: ["Announcements"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AnnouncementInput" } }
            }
          },
          responses: {
            201: { description: "Created" },
            403: { description: "Admin policy required" }
          }
        }
      },
      "/api/announcements/{id}": {
        get: {
          summary: "Get announcement by id",
          tags: ["Announcements"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Announcement" }, 404: { description: "Not found" } }
        },
        put: {
          summary: "Update announcement (admin only)",
          tags: ["Announcements"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/AnnouncementInput" } }
            }
          },
          responses: { 200: { description: "Updated" }, 403: { description: "Admin required" } }
        },
        delete: {
          summary: "Delete announcement (admin only)",
          tags: ["Announcements"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Deleted" } }
        }
      },
      "/api/announcements/{id}/deactivate": {
        patch: {
          summary: "Deactivate announcement (admin only)",
          tags: ["Announcements"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Deactivated (isactive=false)" } }
        }
      },
      "/api/notifications": {
        get: {
          summary: "List notifications for current user (Firebase Firestore inbox)",
          description:
            "Returns paginated notifications stored in Firestore for the JWT user, tenant, and branch. New push events are saved to Firestore when sent. Use `cursor` from `pagination.nextCursor` for the next page. Requires Firestore composite indexes (see firestore.indexes.json); until indexes are built, returns 503 with indexUrl.",
          tags: ["Notifications"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "pageSize",
              schema: { type: "integer", default: 25, maximum: 100 }
            },
            {
              in: "query",
              name: "limit",
              schema: { type: "integer" },
              description: "Alias for pageSize"
            },
            {
              in: "query",
              name: "cursor",
              schema: { type: "string" },
              description: "Firestore document id to start after (from pagination.nextCursor)"
            },
            {
              in: "query",
              name: "unreadOnly",
              schema: { type: "boolean", default: false }
            },
            {
              in: "query",
              name: "type",
              schema: { type: "string" },
              description: "Filter by notification type (e.g. job_assigned, announcement, attendance)"
            },
            {
              in: "query",
              name: "includeUnreadCount",
              schema: { type: "boolean", default: false }
            }
          ],
          responses: {
            200: {
              description: "User notification list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UserNotificationListResponse" }
                }
              }
            },
            503: {
              description:
                "Firebase not configured, or Firestore composite index still building (response may include indexUrl)"
            }
          }
        }
      },
      "/api/notifications/mark-all-read": {
        post: {
          summary: "Mark all notifications as read",
          description:
            "Sets `read=true` and `readAt` on every unread notification for the JWT user in the current tenant and branch.",
          tags: ["Notifications"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Notifications marked as read",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MarkAllNotificationsReadResponse" }
                }
              }
            },
            503: {
              description: "Firebase Firestore not configured or index required"
            }
          }
        }
      },
      "/api/notifications/status": {
        get: {
          summary: "Firebase push notification configuration status",
          tags: ["Notifications"],
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "{ configured: true|false }" } }
        }
      },
      "/api/notifications/device-token": {
        post: {
          summary: "Register FCM device token for current user",
          description: "Mobile app calls this after obtaining the FCM token (on login or token refresh).",
          tags: ["Notifications"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/DeviceTokenInput" } }
            }
          },
          responses: { 200: { description: "Token registered or updated" } }
        },
        delete: {
          summary: "Remove FCM device token (e.g. on logout)",
          tags: ["Notifications"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/DeviceTokenInput" } }
            }
          },
          responses: { 200: { description: "Token removed" } }
        }
      },
      "/api/notifications/test": {
        post: {
          summary: "Send test push notification (admin only)",
          tags: ["Notifications"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/PushTestInput" } }
            }
          },
          responses: { 200: { description: "FCM send result" }, 403: { description: "Admin required" } }
        }
      },
      "/api/auth/invite": {
        post: {
          summary: "Create user — random password emailed",
          description:
            "Requires Users add permission on the caller's assigned policy for the current JWT tenant+branch. User type is not checked. Creates user (or updates existing), assigns org membership and policy, sends login credentials by email. Alias: POST /api/auth/users/create and POST /api/user/admin/create",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InviteUserRequest" }
              }
            }
          },
          responses: {
            201: { description: "User created/invited; password emailed when applicable" },
            403: { description: "Users add permission required" }
          }
        }
      },
      "/api/auth/users/create": {
        post: {
          summary: "Create user (alias of /api/auth/invite)",
          description: "Requires Users add permission on the caller's assigned policy.",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InviteUserRequest" }
              }
            }
          },
          responses: { 201: { description: "User created" }, 403: { description: "Users add permission required" } }
        }
      },
      "/api/user/admin/create": {
        post: {
          summary: "Create user (alias of /api/auth/invite)",
          description: "Requires Users add permission on the caller's assigned policy.",
          tags: ["User Profile"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InviteUserRequest" }
              }
            }
          },
          responses: { 201: { description: "User created" }, 403: { description: "Users add permission required" } }
        }
      },
      "/api/user/admin/update": {
        post: {
          summary: "Update organization user",
          description:
            "Requires Users update permission on the caller's assigned policy for the current JWT tenant+branch. Update profile fields, active/blocked flags, branch membership, policy assignment, face approval flags, and optional password reset/email. User type is not checked on the caller.",
          tags: ["User Profile"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AdminUpdateUserRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "User updated",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AdminUserDetailResponse" }
                }
              }
            },
            403: { description: "Users update permission required" },
            404: { description: "User not found in org branch" }
          }
        }
      },
      "/api/user/admin/users": {
        get: {
          summary: "List users in organization with policies",
          description:
            "Requires Users view permission on the caller's assigned policy. User type is not checked on the caller. Each user includes `presence` (active | idle | out), `attendanceStatus`, and `lastLocation` when branch context is set.",
          tags: ["User Profile"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "includeRights",
              schema: { type: "boolean", default: false },
              description: "Include full screenRights per user (slower)"
            },
            {
              in: "query",
              name: "allBranches",
              schema: { type: "boolean", default: false },
              description: "List users across all branches in tenant"
            },
            {
              in: "query",
              name: "branchid",
              schema: { type: "integer" },
              description: "Branch filter (default JWT branch)"
            },
            {
              in: "query",
              name: "name",
              schema: { type: "string" },
              description: "Partial match on user name (case-insensitive)"
            }
          ],
          responses: {
            200: {
              description: "Users with policies and branch membership",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AdminUserListResponse" }
                }
              }
            },
            403: { description: "Users view permission required" }
          }
        }
      },
      "/api/user/admin/users/{id}": {
        get: {
          summary: "User detail with policies and screen rights",
          description:
            "Requires Users view permission on the caller's assigned policy. User type is not checked on the caller.",
          tags: ["User Profile"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "integer" }
            },
            {
              in: "query",
              name: "branchid",
              schema: { type: "integer" },
              description: "Branch context for rights (default JWT branch)"
            }
          ],
          responses: {
            200: {
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AdminUserDetailResponse" }
                }
              }
            },
            403: { description: "Users view permission required" },
            404: { description: "User not found in org" }
          }
        }
      },
      "/api/user/admin/users/{id}/active": {
        patch: {
          summary: "Activate or deactivate user",
          description:
            "Requires Users update permission on the caller's assigned policy. User type is not checked on the caller.",
          tags: ["User Profile"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["isactive"],
                  properties: { isactive: { type: "boolean" } }
                }
              }
            }
          },
          responses: { 200: { description: "User active flag updated" }, 403: { description: "Users update permission required" } }
        }
      },
      "/api/user/admin/users/{id}/blocked": {
        patch: {
          summary: "Block or unblock user for a branch",
          description:
            "Requires Users update permission on the caller's assigned policy. User type is not checked on the caller.",
          tags: ["User Profile"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["isblocked"],
                  properties: {
                    isblocked: { type: "boolean" },
                    branchid: { type: "integer", description: "Defaults to JWT branch" }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: "Branch block flag updated" },
            403: { description: "Users update permission required" }
          }
        }
      },
      "/api/auth/mail/test": {
        post: {
          summary: "Send SMTP test email (admin only)",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    email: { type: "string", format: "email" }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: "Test email sent" },
            403: { description: "Admin policy required" }
          }
        }
      },
      "/api/auth/addOrganization": {
        post: {
          summary: "Create organization using email and password",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateOrganizationRequest" }
              }
            }
          },
          responses: { 201: { description: "Organization, default branch, and default Admin/Manager/Technician policies created" } }
        }
      },
      "/api/jobs/approval/settings": {
        get: {
          summary: "Get job approval settings for current branch",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Settings with up to 4 named levels and approvers" } }
        },
        put: {
          summary: "Save job approval settings (admin only, max 4 levels)",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobApprovalSettingsInput" }
              }
            }
          },
          responses: { 200: { description: "Settings saved" }, 403: { description: "Admin required" } }
        }
      },
      "/api/jobs/quotation/settings": {
        get: {
          summary: "Get branch default quotation notes and terms & conditions",
          description:
            "Returns default text applied to new jobs/quotations for the JWT branch when per-job values are not set.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Branch quotation defaults",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobQuotationSettings" }
                }
              }
            }
          }
        },
        put: {
          summary: "Save branch default quotation notes and terms & conditions (admin only)",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobQuotationSettingsInput" }
              }
            }
          },
          responses: {
            200: {
              description: "Settings saved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      settings: { $ref: "#/components/schemas/JobQuotationSettings" }
                    }
                  }
                }
              }
            },
            403: { description: "Admin required" }
          }
        }
      },
      "/api/jobs/form/settings": {
        get: {
          summary: "Get complaint form field settings",
          description:
            "Returns per-branch field visibility and mandatory rules for the Create Complaint form. Defaults (before any branch save): admin shows all fields; distributor hides most of the assignment panel and service/parts tables, except ERP Product and Product Model remain visible. Query param formType: admin or distributor.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "formType",
              required: false,
              schema: { type: "string", enum: ["admin", "distributor"], default: "admin" },
              description: "Which form variant to load (admin or distributor)"
            }
          ],
          responses: {
            200: {
              description: "Form field settings",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobFormSettings" }
                }
              }
            }
          }
        },
        put: {
          summary: "Save complaint form field settings (admin only)",
          description:
            "Configure mandatory/show rules per field. Non-hideable fields (customer phone, customer name, job category, job sub category, fault/complaint) always remain visible. Only system administrators can change isHideable when allowHideableChanges is true.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobFormSettingsInput" }
              }
            }
          },
          responses: {
            200: {
              description: "Settings saved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      settings: { $ref: "#/components/schemas/JobFormSettings" }
                    }
                  }
                }
              }
            },
            403: { description: "Admin required" }
          }
        }
      },
      "/api/jobs/erp-products/dropdown": {
        get: {
          summary: "ERP products dropdown for job quotation lines",
          description:
            "Returns active ERP catalog products for the tenant with id, name, brandId, sku, barcode, oldErpCode, saleRate, and purchaseRate. Response includes useERPProducts from branch job quotation settings.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: buildDropdownQueryParameters(resources.erpproducts, "erpproducts"),
          responses: {
            200: {
              description: "ERP product dropdown options",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      useERPProducts: { type: "boolean" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/ErpProductDropdownItem" }
                      },
                      total: { type: "integer" },
                      returned: { type: "integer" },
                      truncated: { type: "boolean" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/jobs/cash/settings": {
        get: {
          summary: "Get branch cash collection and job expense toggles",
          description:
            "Returns whether technicians may record cash received from customers and add job expenses after completion or resolution.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Branch cash settings",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobCashSettings" }
                }
              }
            }
          }
        },
        put: {
          summary: "Save branch cash collection and expense toggles (admin only)",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobCashSettingsInput" }
              }
            }
          },
          responses: {
            200: {
              description: "Settings saved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      settings: { $ref: "#/components/schemas/JobCashSettings" }
                    }
                  }
                }
              }
            },
            403: { description: "Admin required" }
          }
        }
      },
      "/api/jobs/cash/expenses/pending": {
        get: {
          summary: "Paginated list of jobs with no expenses added",
          description:
            "Returns completed or resolved jobs that do not yet have any expense entries. Admins/managers see all branch jobs; technicians are auto-scoped to their assigned jobs unless they have branch job management rights. Returns an empty list when job expenses are disabled for the branch.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "page", schema: { type: "integer", default: 1 } },
            { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } },
            { in: "query", name: "limit", schema: { type: "integer" }, description: "Alias for pageSize" },
            {
              in: "query",
              name: "sortBy",
              schema: {
                type: "string",
                enum: [
                  "jobId",
                  "jobNo",
                  "jobDate",
                  "date",
                  "totalCost",
                  "technicianName",
                  "customerName",
                  "jobCategory",
                  "jobFault",
                  "assignedByName"
                ]
              }
            },
            { in: "query", name: "sortOrder", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
            { in: "query", name: "jobFrom", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "jobTo", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "jobId", schema: { type: "integer" } },
            { in: "query", name: "search", schema: { type: "string" }, description: "Job code or manual job number" },
            { in: "query", name: "technicianId", schema: { type: "integer" } },
            { in: "query", name: "technicianName", schema: { type: "string" } },
            { in: "query", name: "assignedBy", schema: { type: "integer" } },
            { in: "query", name: "assignedByName", schema: { type: "string" } },
            { in: "query", name: "customerId", schema: { type: "integer" } },
            { in: "query", name: "customerName", schema: { type: "string" } },
            { in: "query", name: "customerPhone", schema: { type: "string" } },
            { in: "query", name: "customerAddress", schema: { type: "string" } },
            { in: "query", name: "serviceId", schema: { type: "integer" }, description: "Job group id" },
            { in: "query", name: "categoryId", schema: { type: "integer" }, description: "Job category id" },
            { in: "query", name: "faultId", schema: { type: "integer" } },
            {
              in: "query",
              name: "minAmount",
              schema: { type: "number" },
              description: "Minimum job total cost"
            },
            {
              in: "query",
              name: "maxAmount",
              schema: { type: "number" },
              description: "Maximum job total cost"
            },
            ...createdByQueryParameters({ includeName: true })
          ],
          responses: {
            200: {
              description: "Paginated jobs pending expense entry",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobPendingExpensesListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs-my/cash/expenses/pending": {
        get: {
          summary: "Jobs with no expenses for the current technician",
          description:
            "Same response shape as GET /api/jobs/cash/expenses/pending but always scoped to jobs assigned to the authenticated user.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "page", schema: { type: "integer", default: 1 } },
            { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } },
            { in: "query", name: "search", schema: { type: "string" } },
            { in: "query", name: "customerName", schema: { type: "string" } },
            { in: "query", name: "minAmount", schema: { type: "number" } },
            { in: "query", name: "maxAmount", schema: { type: "number" } },
            ...createdByQueryParameters({ includeName: true })
          ],
          responses: {
            200: {
              description: "Technician-scoped jobs pending expense entry",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobPendingExpensesListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs/cash/collections/pending": {
        get: {
          summary: "Paginated list of jobs pending cash collection",
          description:
            "Returns completed or resolved jobs that do not yet have a cash collection entry. Each row includes `amountToCollect` / `cashToCollect` from the job total cost. Admins/managers see all branch jobs; technicians are auto-scoped to their assigned jobs unless they have branch job management rights. Returns an empty list when cash collection is disabled for the branch.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "page", schema: { type: "integer", default: 1 } },
            { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } },
            { in: "query", name: "limit", schema: { type: "integer" }, description: "Alias for pageSize" },
            {
              in: "query",
              name: "sortBy",
              schema: {
                type: "string",
                enum: [
                  "jobId",
                  "jobNo",
                  "jobDate",
                  "date",
                  "totalCost",
                  "amountToCollect",
                  "technicianName",
                  "customerName",
                  "jobCategory",
                  "jobFault",
                  "assignedByName"
                ]
              }
            },
            { in: "query", name: "sortOrder", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
            { in: "query", name: "jobFrom", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "jobTo", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "jobId", schema: { type: "integer" } },
            { in: "query", name: "search", schema: { type: "string" }, description: "Job code or manual job number" },
            { in: "query", name: "technicianId", schema: { type: "integer" } },
            { in: "query", name: "technicianName", schema: { type: "string" } },
            { in: "query", name: "assignedBy", schema: { type: "integer" } },
            { in: "query", name: "assignedByName", schema: { type: "string" } },
            { in: "query", name: "customerId", schema: { type: "integer" } },
            { in: "query", name: "customerName", schema: { type: "string" } },
            { in: "query", name: "customerPhone", schema: { type: "string" } },
            { in: "query", name: "customerAddress", schema: { type: "string" } },
            { in: "query", name: "serviceId", schema: { type: "integer" }, description: "Job group id" },
            { in: "query", name: "categoryId", schema: { type: "integer" }, description: "Job category id" },
            { in: "query", name: "faultId", schema: { type: "integer" } },
            {
              in: "query",
              name: "minAmount",
              schema: { type: "number" },
              description: "Minimum cash to collect (job.totalcost)"
            },
            {
              in: "query",
              name: "maxAmount",
              schema: { type: "number" },
              description: "Maximum cash to collect (job.totalcost)"
            },
            ...createdByQueryParameters({ includeName: true })
          ],
          responses: {
            200: {
              description: "Paginated pending cash collection jobs",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobPendingCashCollectionsListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs-my/cash/collections/pending": {
        get: {
          summary: "Pending cash collection jobs for the current technician",
          description:
            "Same response shape as GET /api/jobs/cash/collections/pending but always scoped to jobs assigned to the authenticated user.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "page", schema: { type: "integer", default: 1 } },
            { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } },
            { in: "query", name: "search", schema: { type: "string" } },
            { in: "query", name: "customerName", schema: { type: "string" } },
            { in: "query", name: "minAmount", schema: { type: "number" } },
            { in: "query", name: "maxAmount", schema: { type: "number" } },
            ...createdByQueryParameters({ includeName: true })
          ],
          responses: {
            200: {
              description: "Technician-scoped pending cash collection jobs",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobPendingCashCollectionsListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs/cash/collections": {
        get: {
          summary: "Paginated list of job cash collections by technician",
          description:
            "Returns collection rows with job, technician, customer, and assignment details. Admins/managers see all branch collections; technicians are auto-scoped to jobs assigned to them unless they have branch job management rights. Use GET /api/jobs-my/cash/collections for technician-only scope.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "page", schema: { type: "integer", default: 1 } },
            { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } },
            { in: "query", name: "limit", schema: { type: "integer" }, description: "Alias for pageSize" },
            {
              in: "query",
              name: "sortBy",
              schema: {
                type: "string",
                enum: [
                  "date",
                  "collectedAt",
                  "collectionAmount",
                  "amount",
                  "jobId",
                  "jobNo",
                  "technicianName",
                  "customerName",
                  "jobCategory",
                  "jobFault",
                  "assignedByName"
                ]
              }
            },
            { in: "query", name: "sortOrder", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
            { in: "query", name: "from", schema: { type: "string", format: "date-time" }, description: "Collection date from" },
            { in: "query", name: "to", schema: { type: "string", format: "date-time" }, description: "Collection date to" },
            { in: "query", name: "jobFrom", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "jobTo", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "jobId", schema: { type: "integer" } },
            { in: "query", name: "search", schema: { type: "string" }, description: "Job code or manual job number" },
            { in: "query", name: "technicianId", schema: { type: "integer" } },
            { in: "query", name: "technicianName", schema: { type: "string" } },
            { in: "query", name: "collectedBy", schema: { type: "integer" } },
            ...createdByQueryParameters(),
            { in: "query", name: "assignedBy", schema: { type: "integer" } },
            { in: "query", name: "assignedByName", schema: { type: "string" } },
            { in: "query", name: "customerId", schema: { type: "integer" } },
            { in: "query", name: "customerName", schema: { type: "string" } },
            { in: "query", name: "customerPhone", schema: { type: "string" } },
            { in: "query", name: "customerAddress", schema: { type: "string" } },
            { in: "query", name: "serviceId", schema: { type: "integer" }, description: "Job group id" },
            { in: "query", name: "categoryId", schema: { type: "integer" }, description: "Job category id" },
            { in: "query", name: "faultId", schema: { type: "integer" } },
            { in: "query", name: "minAmount", schema: { type: "number" } },
            { in: "query", name: "maxAmount", schema: { type: "number" } }
          ],
          responses: {
            200: {
              description: "Paginated collection list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobCashCollectionsListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs-my/cash/collections": {
        get: {
          summary: "Paginated list of cash collections for the current technician",
          description:
            "Same response shape as GET /api/jobs/cash/collections but always scoped to jobs assigned to the authenticated user.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "page", schema: { type: "integer", default: 1 } },
            { in: "query", name: "pageSize", schema: { type: "integer", default: 25 } },
            { in: "query", name: "from", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "to", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "search", schema: { type: "string" } },
            { in: "query", name: "customerName", schema: { type: "string" } },
            { in: "query", name: "minAmount", schema: { type: "number" } },
            { in: "query", name: "maxAmount", schema: { type: "number" } }
          ],
          responses: {
            200: {
              description: "Technician-scoped collection list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobCashCollectionsListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs/cpair/summaries": {
        get: {
          summary: "Paginated list of c-pair job summaries",
          description:
            "Admins/managers see all branch summaries; technicians see only their assigned jobs. Response includes `filters` and `sortableColumns` metadata.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: buildJobCpairSummaryQueryParameters(),
          responses: {
            200: {
              description: "Summary list with cumulative receive/issue status",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobCpairSummariesListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs/cpair/summaries/{summaryId}/receive": {
        post: {
          summary: "Record c-pair receive from technician (admin/manager)",
          description:
            "Creates receive log rows and rolls up summary receive status. Supports one line or `{ parts: [...] }`. Each line accepts `qtyReceived` (c-pair qty) and optional `wastageQty`. Partial receives are allowed until each line reaches its expected c-pair qty and declared wastage qty.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "summaryId", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobCpairReceiveInput" }
              }
            }
          },
          responses: {
            200: { description: "Receive saved with updated summary, parts, and logs" },
            403: { description: "Admin/manager only" },
            404: { description: "Summary not found" }
          }
        }
      },
      "/api/jobs/cpair/summaries/{summaryId}/issue": {
        post: {
          summary: "Issue received c-pair parts to store (admin/manager)",
          description:
            "Creates issue log rows after parts have been received. Issue qty per line cannot exceed received qty on that line.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "summaryId", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobCpairIssueInput" }
              }
            }
          },
          responses: {
            200: { description: "Issue saved with updated summary, parts, and logs" },
            403: { description: "Admin/manager only" },
            409: { description: "Nothing received yet for a part line" }
          }
        }
      },
      "/api/jobs/cpair/summaries/{summaryId}": {
        get: {
          summary: "C-pair summary detail with parts and logs",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "summaryId", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Summary, parts, receiveLogs (with receivedByName, handedOverByName), issueLogs (with issuedByName)" } }
        },
        delete: {
          summary: "Delete c-pair summary and all parts/logs (admin/manager)",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "summaryId", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Summary deleted" },
            403: { description: "Admin/manager only" },
            404: { description: "Summary not found" }
          }
        }
      },
      "/api/jobs/cpair/parts/{partId}": {
        delete: {
          summary: "Delete a single c-pair part line (admin/manager)",
          description:
            "Removes the part and its receive/issue logs. If it was the last part on the summary, the summary is deleted too.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "partId", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Part deleted (and summary removed when empty)" },
            403: { description: "Admin/manager only" },
            404: { description: "Part not found" }
          }
        }
      },
      "/api/jobs/cpair/overview": {
        get: {
          summary: "Flat overview of all c-pair parts across jobs",
          description:
            "One row per part line with job, customer, technician, and per-part receive/issue status. Supports summary-level and part-level filters. Response includes `filters` and `sortableColumns` metadata.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: buildJobCpairOverviewQueryParameters(),
          responses: {
            200: {
              description: "One row per part with job and per-part status",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobCpairOverviewListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs/{id}/cpair/schema": {
        get: {
          summary: "Prepare c-pair POST schema for remaining job parts",
          description:
            "Returns summary template and remaining part lines. 400 when all job parts are already converted to c-pair.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Schema ready for POST" }, 400: { description: "Nothing left to submit" } }
        }
      },
      "/api/jobs/{id}/cpair": {
        post: {
          summary: "Submit c-pair part lines for a job (technician)",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["parts"],
                  properties: {
                    parts: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["jobProductId", "qty", "wastageQty"],
                        properties: {
                          jobProductId: { type: "integer" },
                          qty: { type: "integer" },
                          wastageQty: { type: "integer" },
                          remarks: { type: "string" },
                          images: { type: "array", items: { type: "string" } }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: { 201: { description: "C-pair saved" } }
        },
        put: {
          summary: "Update submitted c-pair part lines for a job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "C-pair updated" }, 409: { description: "Receive already started" } }
        }
      },
      "/api/jobs/approval/pending": {
        get: {
          summary: "Jobs awaiting current user's approval at their level",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Pending approval queue" } }
        }
      },
      "/api/jobs/next-code": {
        get: {
          summary: "Next auto-generated job code (max + next) for the JWT organization",
          description:
            "Uses the same advisory lock + MAX(code) logic as job create. Job codes are unique per organization (tenant), shared across all branches. For production creates, omit `code` on POST /api/jobs so the code is allocated atomically with insert.",
          tags: [JOBS_TAG],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "maxCode, maxNum, nextCode, nextNum",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobNextCodeResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs": {
        post: {
          summary: "Create a job (separate from generic APIs)",
          description:
            "Optional productLines (inventory and service catalog products) and serviceLines (service catalog products only). totalCost is computed from line inclusive amounts.",
          tags: [JOBS_TAG],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobCreateRequest" }
              }
            }
          },
          responses: {
            201: {
              description: "Job created (same shape as GET /api/jobs/{id})",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobFormResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs/{id}/approval": {
        get: {
          summary: "Job approval status and history",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Approval state" } }
        }
      },
      "/api/jobs/{id}/approval/submit": {
        post: {
          summary: "Submit job for approval",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Submitted" } }
        }
      },
      "/api/jobs/{id}/approval/approve": {
        post: {
          summary: "Approve current level (assigned approvers only)",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { remarks: { type: "string" } }
                }
              }
            }
          },
          responses: { 200: { description: "Level approved or workflow completed" } }
        }
      },
      "/api/jobs/{id}/approval/reject": {
        post: {
          summary: "Reject job at current level",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { remarks: { type: "string" } }
                }
              }
            }
          },
          responses: { 200: { description: "Rejected" } }
        }
      },
      "/api/jobs/{id}": {
        get: {
          summary: "Get job by id (same schema as POST create — for edit modal)",
          tags: [JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: {
              description: "Job form payload",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobFormResponse" }
                }
              }
            },
            404: { description: "Job not found" }
          }
        },
        put: {
          summary: "Update a job (same body as POST)",
          description:
            "Same schema as POST /api/jobs. Partial updates supported. productLines and serviceLines sync all lines when sent (recno updates existing, no recno creates new, omitted lines deleted). quotationStatus may be null.",
          tags: [JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobUpdateRequest" }
              }
            }
          },
          responses: {
            200: {
              description: "Updated job (same shape as GET /api/jobs/{id})",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobFormResponse" }
                }
              }
            },
            404: { description: "Job not found" }
          }
        }
      },
      "/api/jobs-all": {
        get: {
          summary: "Get all jobs in tenant/branch (paged, filterable)",
          description:
            "Returns all branch jobs for admins and managers. Technicians only see jobs assigned to them via `/api/jobs-my`.",
          tags: [ALL_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: jobListQueryParameters(),
          responses: {
            200: {
              description: "Paged job list with filters metadata",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs-my": {
        get: {
          summary: "Get only my assigned jobs (paged, filterable)",
          tags: [MY_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: jobListQueryParameters(),
          responses: {
            200: {
              description: "Paged job list with filters metadata",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs-all/dashboard": {
        get: {
          summary: "Dashboard metrics for all jobs",
          tags: [ALL_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "All-jobs dashboard metrics returned" }
          }
        }
      },
      "/api/jobs-all/stats-kpis": {
        get: {
          summary: "Job page Stats KPIs (all jobs)",
          description:
            "Returns counts for New Jobs (no technician assigned), Assigned Jobs (technician assigned, no follow-up user), Follow-up Jobs (follow-up user assigned), Completed Jobs, and Cancelled Jobs (status title Cancelled/Cancel/Canceled). Supports the same list filters as `/api/jobs-all` (except `kpi`). Use `kpi` on the job list endpoints to drill down when a card is clicked.",
          tags: [ALL_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: jobListQueryParameters().filter(
            (param) => !["page", "pageSize", "sortBy", "sortOrder", "kpi"].includes(param.name)
          ),
          responses: {
            200: {
              description: "Job page Stats KPIs returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobStatsKpisResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs-my/dashboard": {
        get: {
          summary: "Dashboard metrics for my assigned jobs",
          tags: [MY_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "My-jobs dashboard metrics returned" }
          }
        }
      },
      "/api/jobs-my/stats-kpis": {
        get: {
          summary: "Job page Stats KPIs (my jobs)",
          description:
            "Same KPI buckets as `/api/jobs-all/stats-kpis`, scoped to jobs assigned to the authenticated user.",
          tags: [MY_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: jobListQueryParameters().filter(
            (param) => !["page", "pageSize", "sortBy", "sortOrder", "kpi"].includes(param.name)
          ),
          responses: {
            200: {
              description: "Job page Stats KPIs returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobStatsKpisResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs-team": {
        get: {
          summary: "Get team jobs (managed technicians)",
          description:
            "Returns jobs assigned to technicians whose `managerId` is the authenticated user. Example: manager A sees jobs assigned to technicians B and C when B and C have `managerId = A`. Includes `teamMembers` metadata.",
          tags: [TEAM_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: jobListQueryParameters(),
          responses: {
            200: {
              description: "Paged team job list",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TeamJobListResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs-team/stats-kpis": {
        get: {
          summary: "Job page Stats KPIs (team jobs)",
          tags: [TEAM_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: jobListQueryParameters().filter(
            (param) => !["page", "pageSize", "sortBy", "sortOrder", "kpi"].includes(param.name)
          ),
          responses: {
            200: {
              description: "Team job Stats KPIs returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TeamJobStatsKpisResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs-team/dashboard": {
        get: {
          summary: "Dashboard metrics for team jobs",
          tags: [TEAM_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Team jobs dashboard metrics returned" }
          }
        }
      },
      "/api/jobs-team/reports": {
        get: {
          summary: "Reports for team jobs",
          tags: [TEAM_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: jobListQueryParameters().filter(
            (param) => !["page", "pageSize", "sortBy", "sortOrder"].includes(param.name)
          ),
          responses: {
            200: { description: "Team jobs report returned" }
          }
        }
      },
      "/api/dashboard/section-1": {
        get: {
          summary: "Dashboard section 1 overview metrics",
          description:
            "Returns today's job totals, open/completed counts with day-over-day trend, pending approvals needing action, active technicians (traveling or on site), and unacknowledged jobs.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job-scoped metrics: `all` uses branch-wide counts for admins (technicians are auto-scoped to assigned jobs); `my` limits job metrics to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Dashboard section 1 metrics returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardSection1Response" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/job-summary": {
        get: {
          summary: "Dashboard job summary (overall and by period)",
          description:
            "Returns job counts grouped as Total, Resolved, and In-Progress for overall (all jobs in branch) and for Today, Yesterday, Last 7 days, and Last 30 days. Period buckets use `job.date` (UTC). Resolved = `job.isresolved` is true. In-Progress = `job.isresolved` is not true.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "`all` = branch-wide (admins); `my` = jobs assigned to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Job summary metrics returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardJobSummaryResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/technicians": {
        get: {
          summary: "Dashboard technician presence list",
          description:
            "Lists branch technicians grouped by activity: offline, on site (open work session), or traveling (open travel session). On-site takes priority when both sessions are open.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "status",
              schema: {
                type: "string",
                enum: ["all", "offline", "on_site", "traveling"],
                default: "all"
              },
              description: "Filter the returned technician list. Summary counts always include all technicians."
            }
          ],
          responses: {
            200: {
              description: "Technician presence list returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardTechniciansResponse" }
                }
              }
            },
            400: { description: "Invalid status filter" }
          }
        }
      },
      "/api/dashboard/technicians/stats": {
        get: {
          summary: "Technician stats summary",
          description:
            "Returns aggregate counts for all branch technicians: on site (working), traveling, break (open attendance on break), present (checked in, idle), absent (off duty), plus present now/today and absent today totals. Each technician is counted in exactly one current-state bucket using priority: on site > traveling > break > present > absent. Set `includeTechnicians=true` to include the per-technician list.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "status",
              schema: {
                type: "string",
                enum: ["all", "on_site", "traveling", "break", "idle", "absent"],
                default: "all"
              },
              description:
                "When `includeTechnicians=true`, filter the returned technician list. Summary counts always include all technicians."
            },
            {
              in: "query",
              name: "includeTechnicians",
              schema: { type: "boolean", default: false },
              description: "Include the per-technician breakdown in the response"
            }
          ],
          responses: {
            200: {
              description: "Technician stats returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardTechnicianStatsResponse" }
                }
              }
            },
            400: { description: "Invalid status filter" }
          }
        }
      },
      "/api/dashboard/technicians-live-status": {
        get: {
          summary: "All technicians live status",
          description:
            "Returns all branch technicians with live job context: on site (open work), travelling (open travel), waiting (checked in, no active session), or off duty (last active time and location). Waiting and off-duty rows include the technician's last completed job when available.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "status",
              schema: {
                type: "string",
                enum: ["all", "on_site", "travelling", "waiting", "off_duty"],
                default: "all"
              },
              description: "Filter the returned technician list. Summary counts always include all technicians."
            }
          ],
          responses: {
            200: {
              description: "Technicians live status returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardTechniciansLiveStatusResponse" }
                }
              }
            },
            400: { description: "Invalid status filter" }
          }
        }
      },
      "/api/dashboard/job-pipeline": {
        get: {
          summary: "Dashboard job status counts for today",
          description:
            "Returns today's job counts grouped by tenant-configured job statuses. The first item is always `All`; remaining items follow each status defined in job statuses (including zero counts). Jobs without a status appear under `Unassigned` when present.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job scope: `all` uses branch-wide jobs for admins (technicians are auto-scoped to assigned jobs); `my` limits to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Job status counts returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardJobPipelineResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/today-jobs": {
        get: {
          summary: "Dashboard today's jobs with quotation status filters",
          description:
            "Returns today's jobs (UTC calendar date on job.date) with summary counts for All, Pending (open/incomplete), Approved (Quotation), Rejected (Quotation), and Pending Quotations (created or sent). Use `filter` to paginate jobs for a specific bucket.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description: "Branch-wide (`all`) or assigned-to-me (`my`) job scope."
            },
            {
              in: "query",
              name: "filter",
              schema: {
                type: "string",
                enum: [
                  "all",
                  "pending",
                  "approved_quotation",
                  "rejected_quotation",
                  "pending_quotations"
                ],
                default: "all"
              },
              description:
                "Bucket for the paginated job list. Aliases: `status` query param; labels such as `approved (quotation)`, `pending quotations`."
            },
            {
              in: "query",
              name: "page",
              schema: { type: "integer", minimum: 1, default: 1 }
            },
            {
              in: "query",
              name: "pageSize",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
              description: "Alias: `limit`"
            }
          ],
          responses: {
            200: {
              description: "Today's jobs summary and filtered list returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardTodayJobsResponse" }
                }
              }
            },
            400: { description: "Invalid filter value" }
          }
        }
      },
      "/api/dashboard/activity-feed": {
        get: {
          summary: "Dashboard live technician activity feed",
          description:
            "Paginated feed of recent technician actions in the branch (travel, work, completion, resolution, acknowledgement, quotation updates). Default page size is 20.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "page",
              schema: { type: "integer", minimum: 1, default: 1 }
            },
            {
              in: "query",
              name: "pageSize",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
              description: "Alias: `limit`"
            }
          ],
          responses: {
            200: {
              description: "Activity feed returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardActivityFeedResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/jobs-by-group": {
        get: {
          summary: "Dashboard jobs by group for today",
          description:
            "Returns today's job counts per group with group name and color for chart widgets.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job scope: `all` uses branch-wide jobs for admins (technicians are auto-scoped to assigned jobs); `my` limits to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Jobs by group returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardJobsByGroupResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/location-wise-jobs": {
        get: {
          summary: "Dashboard location-wise jobs by city",
          description:
            "Returns today's job distribution by city (`job.city` → `cities`). Includes count and percentage share per city for map/chart widgets.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job scope: `all` uses branch-wide jobs for admins (technicians are auto-scoped to assigned jobs); `my` limits to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Location-wise job distribution returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardLocationWiseJobsResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/category-wise-jobs": {
        get: {
          summary: "Dashboard category-wise jobs",
          description:
            "Returns today's job distribution by category (`job.serviceid` → `jobcategories`). Includes count, percentage, group name, and color per category.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job scope: `all` uses branch-wide jobs for admins (technicians are auto-scoped to assigned jobs); `my` limits to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Category-wise job distribution returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardCategoryWiseJobsResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/top-faults": {
        get: {
          summary: "Dashboard top faults (sub-categories) for today",
          description:
            "Returns today's most frequent job faults (sub-categories) with parent category and group names, counts, and percentage share.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job scope: `all` uses branch-wide jobs for admins (technicians are auto-scoped to assigned jobs); `my` limits to the authenticated user."
            },
            {
              in: "query",
              name: "limit",
              schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
              description: "Maximum number of top faults to return"
            }
          ],
          responses: {
            200: {
              description: "Top faults returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardTopFaultsResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/technician-performance": {
        get: {
          summary: "Dashboard technician performance by completed jobs",
          description:
            "Returns today's job completion counts per technician (from jobdetails.completedby / completedat), with percentage share and rank.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Admins see all branch technicians with `all`; `my` limits to the authenticated user. Non-admins always see only their own performance."
            },
            {
              in: "query",
              name: "limit",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
              description: "Maximum number of technicians to return"
            }
          ],
          responses: {
            200: {
              description: "Technician performance returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardTechnicianPerformanceResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/manager-jobs": {
        get: {
          summary: "Manager dashboard job lists",
          description:
            "Managers only. Returns all open branch jobs grouped into awaiting response, overdue, and no first response lists.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "list",
              schema: {
                type: "string",
                enum: ["all", "awaitingResponse", "overdue", "noFirstResponse"],
                default: "all"
              },
              description: "Return all lists or a single list"
            },
            {
              in: "query",
              name: "limit",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
              description: "Maximum jobs per list"
            }
          ],
          responses: {
            200: {
              description: "Manager job lists returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardManagerJobsResponse" }
                }
              }
            },
            403: { description: "Authenticated user is not a manager" }
          }
        }
      },
      "/api/dashboard/manager-technicians": {
        get: {
          summary: "Manager my technicians overview",
          description:
            "Managers only. All branch technicians with live status, assignment/completion counts, and worked hours today across branch jobs.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Manager technicians returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardManagerTechniciansResponse" }
                }
              }
            },
            403: { description: "Authenticated user is not a manager" }
          }
        }
      },
      "/api/dashboard/manager-summary": {
        get: {
          summary: "Manager dashboard team summary",
          description:
            "Managers only. Returns a one-line team summary with technician names, open job count, today's completions, and approvals awaiting the manager's action.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: "Manager summary returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardManagerSummaryResponse" }
                }
              }
            },
            403: { description: "Authenticated user is not a manager" }
          }
        }
      },
      "/api/dashboard/active-jobs": {
        get: {
          summary: "Dashboard active jobs list with filters",
          description:
            "Returns open (not completed) jobs with optional filters for customer name, status, and fault (sub-category).",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Admins see branch-wide jobs with `all`; technicians are auto-scoped to assigned jobs. `my` limits to the authenticated user."
            },
            {
              in: "query",
              name: "customerName",
              schema: { type: "string" },
              description: "Filter by customer name (contains, case-insensitive)"
            },
            {
              in: "query",
              name: "statusId",
              schema: { type: "integer" },
              description: "Filter by job status id"
            },
            {
              in: "query",
              name: "status",
              schema: { type: "string" },
              description: "Filter by job status title (contains, case-insensitive). Alias: statusName"
            },
            {
              in: "query",
              name: "faultId",
              schema: { type: "integer" },
              description: "Filter by fault / sub-category id"
            },
            {
              in: "query",
              name: "faultName",
              schema: { type: "string" },
              description: "Filter by fault / sub-category name (contains). Alias: fault"
            },
            { in: "query", name: "page", schema: { type: "integer", minimum: 1, default: 1 } },
            {
              in: "query",
              name: "pageSize",
              schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
              description: "Alias: limit"
            }
          ],
          responses: {
            200: {
              description: "Active jobs list returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardActiveJobsResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/todays-progress": {
        get: {
          summary: "Dashboard today's progress metrics",
          description:
            "Returns today's job completion totals, first response rate, and average completion hours for jobs completed today.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job scope: `all` uses branch-wide jobs for admins (technicians are auto-scoped to assigned jobs); `my` limits to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Today's progress metrics returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardTodaysProgressResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/warranty-split": {
        get: {
          summary: "Dashboard jobs warranty split",
          description:
            "Returns today's job counts and percentages split by warranty (`isinwaranty = true`) vs non-warranty jobs.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job scope: `all` uses branch-wide jobs for admins (technicians are auto-scoped to assigned jobs); `my` limits to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Warranty split metrics returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardWarrantySplitResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/weekly-job-volume": {
        get: {
          summary: "Dashboard weekly job volume (last 8 weeks)",
          description:
            "Returns the last 8 UTC weeks (Monday–Sunday) of job volume. Each week includes highest, lowest, and medium (median) daily job counts for charting three lines.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job scope: `all` uses branch-wide jobs for admins (technicians are auto-scoped to assigned jobs); `my` limits to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Weekly job volume returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardWeeklyJobVolumeResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/avg-resolution-by-category": {
        get: {
          summary: "Dashboard average resolution time by category",
          description:
            "Returns average job resolution time in hours grouped by job category (`job.serviceid`). Resolution time is measured from assignment (or first response / job date) to `jobdetails.resolvedat`. Includes all resolved jobs in scope.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job scope: `all` uses branch-wide jobs for admins (technicians are auto-scoped to assigned jobs); `my` limits to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Average resolution time by category returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardAvgResolutionByCategoryResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dashboard/ticket-reopening-rate": {
        get: {
          summary: "Dashboard ticket reopening rate (monthly)",
          description:
            "Returns monthly ticket reopening metrics for the last 12 UTC months. A reopen is detected when job work is started again after completion (`jobworklhistory.startedat` after `jobdetails.completedat`). Reopening rate = reopened tickets / completed tickets per month.",
          tags: [DASHBOARD_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "scope",
              schema: { type: "string", enum: ["all", "my"], default: "all" },
              description:
                "Job scope: `all` uses branch-wide jobs for admins (technicians are auto-scoped to assigned jobs); `my` limits to the authenticated user."
            }
          ],
          responses: {
            200: {
              description: "Monthly ticket reopening rate returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DashboardTicketReopeningRateResponse" }
                }
              }
            }
          }
        }
      },
      "/api/jobs-all/reports": {
        get: {
          summary: "Reports for all jobs",
          tags: [ALL_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "from", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "to", schema: { type: "string", format: "date-time" } }
          ],
          responses: {
            200: { description: "All-jobs report returned" }
          }
        }
      },
      "/api/jobs-my/reports": {
        get: {
          summary: "Reports for my assigned jobs",
          tags: [MY_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "query", name: "from", schema: { type: "string", format: "date-time" } },
            { in: "query", name: "to", schema: { type: "string", format: "date-time" } }
          ],
          responses: {
            200: { description: "My-jobs report returned" }
          }
        }
      },
      "/api/jobs/{id}/details": {
        get: {
          summary: "Details page API for a job",
          description:
            "Includes `remarks` (newest first, with addedByName) and `jobcustomerremarkslog`. Complaint notes from create are stored as separate remark rows. `jobattachments` include `addedby`, `addedByName`, and `addedByEmail`.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Job details returned" }
          }
        }
      },
      "/api/jobs/{id}/remarks": {
        get: {
          summary: "List comments/remarks for a job (newest first)",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: {
              description: "remarks array with author info",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobRemarksListResponse" }
                }
              }
            }
          }
        },
        post: {
          summary: "Add one or more comments/remarks (call repeatedly to save multiple times)",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobRemarkCreateRequest" }
              }
            }
          },
          responses: { 201: { description: "Remark(s) created" } }
        }
      },
      "/api/jobs/{id}/remarks/{remarkId}": {
        put: {
          summary: "Update a remark",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "remarkId", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobRemarkCreateRequest" }
              }
            }
          },
          responses: { 200: { description: "Remark updated" } }
        },
        delete: {
          summary: "Delete a remark",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "remarkId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Remark deleted" } }
        }
      },
      "/api/jobs/quotation-statuses": {
        get: {
          summary: "List fixed quotation status options",
          description:
            "Quotation Created, Quotation Sent, Quotation Approved, Quotation Rejected. Separate from tenant jobstatuses.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: "Status options with remarksRequired flags" } }
        }
      },
      "/api/jobs/{id}/quotation": {
        get: {
          summary: "Quotation page details API for a job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Job quotation details returned" },
            404: { description: "Job not found" }
          }
        }
      },
      "/api/jobs/{id}/quotation-status": {
        get: {
          summary: "Current quotation status and history for a job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Quotation status returned" } }
        },
        post: {
          summary: "Change quotation status (remarks required for rejected)",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChangeQuotationStatusRequest" }
              }
            }
          },
          responses: {
            200: { description: "Quotation status updated" },
            400: { description: "Validation error or missing rejection remarks" }
          }
        }
      },
      "/api/jobs/{id}/quotation-status-logs": {
        get: {
          summary: "Quotation status change history for a job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Status log list returned" } }
        }
      },
      "/api/jobs/{id}/timeline": {
        get: {
          summary: "Job timeline events (created, assigned, travel, work, status, attachments)",
          description:
            "Chronological events. Each event includes display names alongside ids where applicable (`userName` with `userid`, `assignedByName` with `assignedBy`, `changedByName` with `changedby`, `fromStatusName`/`toStatusName`, `quotedByName`, `createdByName`, etc.).",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Job timeline returned" }
          }
        }
      },
      "/api/jobs/{id}/actions/assign": {
        post: {
          summary: "Assign or reassign technician",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    assignedto: { type: "integer" },
                    remarks: { type: "string" }
                  },
                  required: ["assignedto"]
                }
              }
            }
          },
          responses: { 200: { description: "Technician assigned" } }
        }
      },
      "/api/jobs/{id}/actions/assign-follow-up": {
        post: {
          summary: "Assign or clear follow-up user",
          description:
            "Admin/manager only. Sets `followUpById` on the job to the selected branch user, or clears it when `followUpById` is null.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    followUpById: {
                      type: "integer",
                      nullable: true,
                      description: "User id responsible for follow-up. Pass null to clear."
                    },
                    followupby: {
                      type: "integer",
                      nullable: true,
                      description: "Alias of followUpById"
                    },
                    remarks: { type: "string" }
                  }
                }
              }
            }
          },
          responses: { 200: { description: "Follow-up user assigned or cleared" } }
        }
      },
      "/api/jobs/{id}/actions/start-travel": {
        post: {
          summary: "Technician starts travel",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/JobLocationBody" } }
            }
          },
          responses: { 200: { description: "Travel started" } }
        }
      },
      "/api/jobs/{id}/actions/stop-travel": {
        post: {
          summary: "Technician stops travel",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/JobLocationBody" } }
            }
          },
          responses: { 200: { description: "Travel stopped" } }
        }
      },
      "/api/jobs/{id}/actions/start-job": {
        post: {
          summary: "Technician starts job work",
          description:
            "Assigned technician only. Optional `attachments` (URLs) or multipart files (`files` / `file`). Files are stored under `/uploads/jobs/{tenant}/{branch}/{jobId}/`.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/JobActionWithAttachmentsBody" } },
              "multipart/form-data": { schema: { $ref: "#/components/schemas/JobActionMultipartBody" } }
            }
          },
          responses: { 200: { description: "Job started (includes attachments when provided)" } }
        }
      },
      "/api/jobs/{id}/actions/stop-job": {
        post: {
          summary: "Technician stops job work (pause session without completing the job)",
          description:
            "Assigned technician or admin. Ends the current open work session in jobworklhistory so the technician can start again later. Does not mark the job completed. Optional attachments or multipart files.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/JobActionWithAttachmentsBody" } },
              "multipart/form-data": { schema: { $ref: "#/components/schemas/JobActionMultipartBody" } }
            }
          },
          responses: {
            200: { description: "Work session stopped" },
            409: { description: "No active work session" }
          }
        }
      },
      "/api/jobs/{id}/actions/complete-job": {
        post: {
          summary: "Technician marks job completed",
          description:
            "Assigned technician only. Optionally include `customerFeedback`, `attachments`, or multipart files (`files` / `file`).",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/JobCompleteBody" } },
              "multipart/form-data": { schema: { $ref: "#/components/schemas/JobCompleteMultipartBody" } }
            }
          },
          responses: { 200: { description: "Job completed (includes customerFeedback and attachments when provided)" } }
        }
      },
      "/api/jobs/{id}/customer-feedback": {
        get: {
          summary: "Get customer feedback for a job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Customer feedback or null" } }
        },
        put: {
          summary: "Save or update customer feedback for a job",
          description: "Upserts one feedback row per job. Records which user submitted it.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/JobCustomerFeedbackBody" } }
            }
          },
          responses: { 200: { description: "Feedback saved" } }
        }
      },
      "/api/jobs/{id}/cash/collection": {
        get: {
          summary: "Get cash collection recorded for a job",
          description:
            "Assigned technician or admin. Available after job is completed or resolved.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: {
              description: "Collection and branch settings",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobCashCollectionResponse" }
                }
              }
            }
          }
        },
        put: {
          summary: "Record or update cash collection for a job",
          description:
            "Assigned technician only. Requires branch setting allowReceiveCollection. Job must be completed or resolved.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobCashCollectionInput" }
              }
            }
          },
          responses: {
            200: { description: "Collection saved" },
            403: { description: "Feature disabled or not assigned" },
            409: { description: "Job not completed or resolved" }
          }
        }
      },
      "/api/jobs/{id}/cash/expenses": {
        get: {
          summary: "List job expenses with total",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: {
              description: "Expense lines and totalAmount",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/JobExpensesResponse" }
                }
              }
            }
          }
        },
        post: {
          summary: "Add one or more job expense lines",
          description:
            "Append expense lines to the job. Send a single line `{ description, price }` or multiple lines `{ expenses: [...] }`. Requires branch setting allowAddExpenses. Job must be completed or resolved.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobExpenseCreateInput" }
              }
            }
          },
          responses: { 201: { description: "Expense(s) added" } }
        },
        put: {
          summary: "Replace all job expense lines",
          description: "Syncs the full expense list for the job in one request.",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobExpensesSyncInput" }
              }
            }
          },
          responses: { 200: { description: "Expenses saved" } }
        }
      },
      "/api/jobs/{id}/cash/expenses/{expenseId}": {
        put: {
          summary: "Update a job expense line",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "expenseId", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobExpenseUpdateInput" }
              }
            }
          },
          responses: { 200: { description: "Expense updated" } }
        },
        delete: {
          summary: "Delete a job expense line",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "expenseId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Expense deleted" } }
        }
      },
      "/api/jobs/{id}/actions/resolve-job": {
        post: {
          summary: "Technician marks job resolved",
          description:
            "Assigned technician only. Optional `attachments` or multipart files (`files` / `file`).",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/JobActionWithAttachmentsBody" } },
              "multipart/form-data": { schema: { $ref: "#/components/schemas/JobActionMultipartBody" } }
            }
          },
          responses: { 200: { description: "Job resolved (includes attachments when provided)" } }
        }
      },
      "/api/jobs/{id}/actions/close-job": {
        post: {
          summary: "Close job after QA/acknowledgement",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Job closed" } }
        }
      },
      "/api/jobs/{id}/actions/first-response": {
        post: {
          summary: "Update first response details for job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "First response updated" } }
        }
      },
      "/api/jobs/{id}/actions/acknowledge": {
        post: {
          summary: "Mark customer acknowledgement for job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Customer acknowledgement updated" } }
        }
      },
      "/api/jobs/{id}/assignments": {
        get: {
          summary: "List assignment history for job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Assignment history returned" } }
        },
        post: {
          summary: "Add assignment entry and reassign job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    userid: { type: "integer" },
                    remarks: { type: "string" }
                  },
                  required: ["userid"]
                }
              }
            }
          },
          responses: { 201: { description: "Assignment created" } }
        }
      },
      "/api/jobs/{id}/assignments/{assignmentId}": {
        put: {
          summary: "Update assignment history entry",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "assignmentId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Assignment updated" } }
        },
        delete: {
          summary: "Delete assignment history entry",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "assignmentId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Assignment deleted" } }
        }
      },
      "/api/jobs/{id}/status-logs": {
        get: {
          summary: "List status change log for job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Status log returned" } }
        },
        post: {
          summary: "Add status change and update job status",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    fromstatus: { type: "integer" },
                    tostatus: { type: "integer" },
                    remarks: { type: "string" }
                  },
                  required: ["tostatus"]
                }
              }
            }
          },
          responses: { 201: { description: "Status log created" } }
        }
      },
      "/api/jobs/{id}/status-logs/{statusLogId}": {
        put: {
          summary: "Update status log entry",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "statusLogId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Status log updated" } }
        },
        delete: {
          summary: "Delete status log entry",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "statusLogId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Status log deleted" } }
        }
      },
      "/api/jobs/{id}/products": {
        get: {
          summary: "List job product/service lines",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Job products returned" } }
        },
        post: {
          summary: "Add product/service line to job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    productid: { type: "integer" },
                    qty: { type: "number" },
                    price: { type: "number" },
                    remarks: { type: "string" }
                  },
                  required: ["productid"]
                }
              }
            }
          },
          responses: { 201: { description: "Job product line created" } }
        }
      },
      "/api/jobs/{id}/products/{productLineId}": {
        put: {
          summary: "Update job product/service line",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "productLineId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Job product line updated" } }
        },
        delete: {
          summary: "Delete job product/service line",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "productLineId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Job product line deleted" } }
        }
      },
      "/api/jobs/{id}/services": {
        get: {
          summary: "List job service lines",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Job service lines returned" } }
        },
        post: {
          summary: "Add service line to job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobServiceLineItem" }
              }
            }
          },
          responses: { 201: { description: "Job service line created" } }
        }
      },
      "/api/jobs/{id}/services/{serviceLineId}": {
        put: {
          summary: "Update job service line",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "serviceLineId", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobServiceLineItem" }
              }
            }
          },
          responses: { 200: { description: "Job service line updated" } }
        },
        delete: {
          summary: "Delete job service line",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "serviceLineId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Job service line deleted" } }
        }
      },
      "/api/jobs/{id}/customer-remarks": {
        get: {
          summary: "List customer remarks for job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Customer remarks returned" } }
        },
        post: {
          summary: "Add customer remark for job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { remarks: { type: "string" } },
                  required: ["remarks"]
                }
              }
            }
          },
          responses: { 201: { description: "Customer remark created" } }
        }
      },
      "/api/jobs/{id}/customer-remarks/{remarkId}": {
        put: {
          summary: "Update customer remark",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "remarkId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Customer remark updated" } }
        },
        delete: {
          summary: "Delete customer remark",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "remarkId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Customer remark deleted" } }
        }
      },
      "/api/jobs/{id}/travel-history": {
        get: {
          summary: "List travel history for job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Travel history returned" } }
        }
      },
      "/api/jobs/{id}/work-history": {
        get: {
          summary: "List work history for job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Work history returned" } }
        }
      },
      "/api/jobs/{id}/attachments": {
        get: {
          summary: "List attachments for a specific job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Job attachments returned" } }
        },
        post: {
          summary: "Create attachment for a specific job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobAttachmentCreateRequest" }
              }
            }
          },
          responses: { 201: { description: "Attachment created" } }
        }
      },
      "/api/jobs/{id}/attachments/{attachmentId}": {
        get: {
          summary: "Get one attachment for a specific job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "attachmentId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Attachment returned" } }
        },
        put: {
          summary: "Update one attachment for a specific job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "attachmentId", required: true, schema: { type: "integer" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobAttachmentUpdateRequest" }
              }
            }
          },
          responses: { 200: { description: "Attachment updated" } }
        },
        delete: {
          summary: "Delete one attachment for a specific job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "integer" } },
            { in: "path", name: "attachmentId", required: true, schema: { type: "integer" } }
          ],
          responses: { 200: { description: "Attachment deleted" } }
        }
      },
      "/api/public/jobs/stats": {
        get: {
          summary: "Public job stats (no authentication)",
          description:
            "Returns open jobs and resolved job counts for a tenant branch. No JWT or policy rights required. Requires `tenantid` and `branchid` query parameters. Open jobs = `job.isresolved` is not true. Resolved counts use `jobdetails.resolvedat` in UTC.",
          tags: ["Public"],
          parameters: [
            {
              in: "query",
              name: "tenantid",
              required: true,
              schema: { type: "integer" },
              description: "Organization tenant id"
            },
            {
              in: "query",
              name: "branchid",
              required: true,
              schema: { type: "integer" },
              description: "Branch id within the tenant"
            }
          ],
          responses: {
            200: {
              description: "Job stats returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PublicJobStatsResponse" }
                }
              }
            },
            400: { description: "Missing or invalid tenantid/branchid" },
            404: { description: "Branch not found for tenant" }
          }
        }
      },
      "/api/dropdowns/overall": {
        get: {
          summary: "List public overall geo dropdown resources",
          description: "No authentication required. Use for signup and organization setup before login.",
          tags: ["Dropdowns"],
          responses: {
            200: { description: "Overall dropdown resources returned" }
          }
        }
      },
      "/api/dropdowns/overall/countries": {
        get: {
          summary: "Overall countries dropdown (public, static)",
          description:
            "Returns the full ISO 3166-1 country list built into the API. No database seed or JWT required. `value` is the ISO numeric code (e.g. 586 for Pakistan); `code` is alpha-2 (e.g. PK).",
          tags: ["Dropdowns"],
          responses: {
            200: {
              description: "Static world countries dropdown returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PublicGeoCountriesDropdownResponse" }
                }
              }
            }
          }
        }
      },
      "/api/dropdowns/overall/cities": {
        get: {
          summary: "Overall cities dropdown for a country (public, static)",
          description:
            "Returns all cities for the selected ISO country from the built-in world cities dataset (no database seed). `countryId` must match `value` from GET /overall/countries (e.g. 586 for Pakistan), or pass `countryCode` (e.g. PK).",
          tags: ["Dropdowns"],
          parameters: [
            {
              in: "query",
              name: "countryId",
              required: true,
              schema: { oneOf: [{ type: "integer" }, { type: "string" }] },
              description: "ISO 3166-1 numeric code from overall countries (aliases: countryid, country)"
            },
            {
              in: "query",
              name: "countryCode",
              schema: { type: "string", minLength: 2, maxLength: 2 },
              description: "ISO alpha-2 code (e.g. PK) instead of countryId"
            }
          ],
          responses: {
            200: {
              description: "Cities for the selected country returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PublicGeoCitiesDropdownResponse" }
                }
              }
            },
            400: { description: "countryId missing" },
            404: { description: "Country not found" }
          }
        }
      },
      "/api/dropdowns": {
        get: {
          summary: "List available dropdown resources",
          tags: ["Dropdowns"],
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: "Available dropdown resources returned" }
          }
        }
      },
      "/api/dropdowns/customer-addresses": {
        get: {
          summary: "Customer addresses dropdown",
          description:
            "Returns the customer's default address (from `customers` table) plus additional saved addresses from `customeraddresses`. Requires `customerId`. Default address uses `value: null` and `isDefault: true`. Additional addresses use `value` = `customeraddresses.recno`.",
          tags: ["Dropdowns"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "customerId",
              required: true,
              schema: { type: "integer" },
              description: "Customer id (customers.customerid). Alias: customerid"
            }
          ],
          responses: {
            200: {
              description: "Customer address dropdown returned",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CustomerAddressDropdownResponse" }
                }
              }
            },
            400: { description: "Missing or invalid customerId" },
            404: { description: "Customer not found in tenant/branch" }
          }
        }
      },
      "/api/dropdowns/{resourceName}": {
        get: {
          summary: "Get dropdown for any resource",
          description:
            "Optional parent filters (when supported): jobcategories `groupId`, jobsubcategories `categoryId`, cities `countryId`, areas `cityId`. See GET /api/dropdowns for per-resource filter list. Resources with an `isactive` column return only active rows (`isactive` is not false).",
          tags: ["Dropdowns"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "resourceName",
              required: true,
              schema: { type: "string" }
            },
            { in: "query", name: "groupId", required: false, schema: { type: "integer" } },
            { in: "query", name: "categoryId", required: false, schema: { type: "integer" } },
            { in: "query", name: "countryId", required: false, schema: { type: "integer" } },
            { in: "query", name: "cityId", required: false, schema: { type: "integer" } }
          ],
          responses: {
            200: { description: "Dropdown returned" },
            404: { description: "Unknown resource" }
          }
        }
      },
      "/graphql": {
        post: {
          summary: "GraphQL reporting and dashboard endpoint",
          tags: ["GraphQL"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      example: "{ dashboardSummary { tenantid branchid users customers products activePolicies } }"
                    },
                    variables: { type: "object" }
                  },
                  required: ["query"]
                }
              }
            }
          },
          responses: {
            200: { description: "GraphQL response returned" }
          }
        }
      },
      "/graphql/playground": {
        get: {
          summary: "GraphQL playground (Altair explorer)",
          description:
            "Enabled when NODE_ENV is not production, or when GRAPHQL_PLAYGROUND_ENABLED=true. Uses introspection against POST /graphql.",
          tags: ["GraphQL"],
          responses: {
            200: { description: "Playground UI returned" },
            404: { description: "Disabled in production unless GRAPHQL_PLAYGROUND_ENABLED=true" }
          }
        }
      },
      "/graphql/schema": {
        get: {
          summary: "GraphQL schema SDL (for Sandbox / Studio explorer)",
          description: "Returns the full GraphQL schema including all Jobs report queries.",
          tags: ["GraphQL"],
          responses: {
            200: { description: "Schema SDL text" }
          }
        }
      },
      "/graphql/studio": {
        get: {
          summary: "Embedded Apollo Sandbox (same-origin schema explorer)",
          description:
            "Apollo Sandbox UI hosted on this server so the Documentation sidebar loads all report queries. Enabled when NODE_ENV is not production, or when GRAPHQL_PLAYGROUND_ENABLED=true.",
          tags: ["GraphQL"],
          responses: {
            200: { description: "Apollo Sandbox HTML page" },
            404: { description: "Disabled in production unless GRAPHQL_PLAYGROUND_ENABLED=true" }
          }
        }
      },
      ...resourcePaths
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT"
        }
      },
      schemas: {
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer" },
            pageSize: { type: "integer" },
            total: { type: "integer" },
            totalPages: { type: "integer" }
          }
        },
        AvailableFilter: {
          type: "object",
          properties: {
            field: { type: "string" },
            type: { type: "string" },
            operators: {
              type: "array",
              items: { type: "string" }
            }
          }
        },
        SignupRequest: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
            baseUrl: { type: "string", example: "http://localhost:3000" },
            isTermsAccepted: { type: "boolean" }
          },
          required: ["name", "email"]
        },
        VerifySignupRequest: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            token: { type: "string" }
          },
          required: ["email", "token"]
        },
        ConfigurePasswordRequest: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            token: { type: "string" },
            password: { type: "string", format: "password" }
          },
          required: ["email", "token", "password"]
        },
        CreateOrganizationRequest: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", format: "password" },
            organizationname: { type: "string" },
            organizationEmail: { type: "string", format: "email" },
            phoneno: { type: "string" },
            website: { type: "string" },
            country: { type: "integer" },
            city: { type: "integer" },
            address: { type: "string" }
          },
          required: ["email", "password", "organizationname"]
        },
        LoginRequest: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", format: "password" }
          },
          required: ["email", "password"]
        },
        ChangePasswordRequest: {
          type: "object",
          properties: {
            oldPassword: { type: "string", format: "password" },
            newPassword: { type: "string", format: "password", minLength: 8 }
          },
          required: ["oldPassword", "newPassword"]
        },
        ForgotPasswordRequest: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            baseUrl: {
              type: "string",
              description: "Optional frontend base for reset link (defaults to APP_URL)"
            }
          },
          required: ["email"]
        },
        ForgotPasswordResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example:
                "If an account exists for this email, password reset instructions have been sent."
            }
          }
        },
        ResetPasswordRequest: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            token: { type: "string", description: "6-digit code from reset email" },
            password: { type: "string", format: "password", minLength: 8 }
          },
          required: ["email", "token", "password"]
        },
        ProfileImageRequest: {
          type: "object",
          properties: {
            imageUrl: { type: "string", description: "Public image URL" },
            profileimage: { type: "string", description: "Alias for imageUrl" },
            remove: { type: "boolean", description: "Set true to remove profile image" }
          }
        },
        QuotationStatusOption: {
          type: "object",
          properties: {
            value: { type: "string", enum: ["created", "sent", "approved", "rejected"] },
            label: { type: "string" },
            remarksRequired: { type: "boolean" }
          }
        },
        ChangeQuotationStatusRequest: {
          type: "object",
          properties: {
            quotationStatus: {
              type: "string",
              enum: ["created", "sent", "approved", "rejected"],
              description: "Also accepts labels e.g. Quotation Approved"
            },
            remarks: {
              type: "string",
              description: "Optional except required when quotationStatus is rejected"
            },
            quotedById: {
              type: "integer",
              description:
                "User who quoted (users.userid). Aliases: quotedBy, qoutedBy. Defaults to JWT user."
            },
            quotedDate: {
              type: "string",
              format: "date-time",
              description:
                "When the quotation was made. Aliases: quotedAt, qoutedDate. Defaults to server time."
            }
          },
          required: ["quotationStatus"]
        },
        UpdateProfileRequest: {
          type: "object",
          description: "All fields optional; send at least one. Email cannot be changed here.",
          properties: {
            name: { type: "string" },
            contactno: { type: "string", nullable: true },
            gender: { type: "string", nullable: true },
            country: { type: "integer", nullable: true, description: "countries.recno" },
            city: { type: "integer", nullable: true, description: "cities.recno" },
            profileimage: {
              type: "string",
              nullable: true,
              description: "Image URL (e.g. from POST /api/upload)"
            },
            imageUrl: {
              type: "string",
              description: "Alias for profileimage"
            }
          }
        },
        SwitchContextRequest: {
          type: "object",
          properties: {
            tenantid: { type: "integer" },
            branchid: { type: "integer" }
          },
          required: ["tenantid", "branchid"]
        },
        UserType: {
          type: "string",
          enum: ["admin", "manager", "technician", "distributor"],
          description: "User category stored on users.usertype"
        },
        TechnicianAffiliation: {
          type: "string",
          enum: ["in_house", "third_party"],
          description: "Technician employment type (users.technicianaffiliation)"
        },
        AdminUserListItem: {
          type: "object",
          properties: {
            userid: { type: "integer" },
            name: { type: "string" },
            email: { type: "string" },
            contactno: { type: "string", nullable: true },
            usertype: { $ref: "#/components/schemas/UserType", nullable: true },
            technicianAffiliation: { $ref: "#/components/schemas/TechnicianAffiliation", nullable: true },
            companyName: {
              type: "string",
              nullable: true,
              description: "Third-party company name; required when technicianAffiliation is third_party"
            },
            managerId: {
              type: "integer",
              nullable: true,
              description: "Assigned manager user id (technicians only)"
            },
            managerName: {
              type: "string",
              nullable: true,
              description: "Display name of the assigned manager"
            },
            managerUserType: {
              $ref: "#/components/schemas/UserType",
              nullable: true,
              description: "User type of the assigned manager"
            },
            isactive: { type: "boolean" },
            isdeleted: { type: "boolean" },
            isAdmin: { type: "boolean" },
            policies: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  policyid: { type: "integer" },
                  policyname: { type: "string" },
                  isAdminPolicy: { type: "boolean" },
                  branchid: { type: "integer" },
                  branchname: { type: "string" }
                }
              }
            },
            branches: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  branchid: { type: "integer" },
                  branchname: { type: "string" },
                  isblocked: { type: "boolean" }
                }
              }
            },
            presence: {
              type: "string",
              enum: ["active", "idle", "out"],
              description: "Attendance: checked in, on break, or out"
            },
            attendanceStatus: {
              type: "string",
              nullable: true,
              enum: ["checked_in", "on_break", "checked_out"]
            },
            lastLocation: { $ref: "#/components/schemas/UserLastLocation", nullable: true },
            screenRights: { type: "array", items: { type: "object" } },
            allowedScreens: { type: "array", items: { type: "object" } }
          }
        },
        AdminUserListResponse: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/AdminUserListItem" } },
            total: { type: "integer" },
            tenantid: { type: "integer" },
            branchid: { type: "integer", nullable: true },
            allBranches: { type: "boolean" }
          }
        },
        AdminUserDetailResponse: {
          type: "object",
          properties: {
            user: { type: "object" },
            policies: { type: "array", items: { type: "object" } },
            screenRights: { type: "array", items: { type: "object" } },
            allowedScreens: { type: "array", items: { type: "object" } },
            isAdmin: { type: "boolean" },
            isblocked: { type: "boolean" },
            branches: { type: "array", items: { type: "object" } }
          }
        },
        InviteUserRequest: {
          type: "object",
          properties: {
            name: { type: "string", description: "Display name" },
            email: { type: "string", format: "email" },
            usertype: {
              $ref: "#/components/schemas/UserType",
              default: "technician",
              description: "admin, manager, technician, or distributor (alias: userType, type). Accepts technition → technician."
            },
            technicianAffiliation: {
              $ref: "#/components/schemas/TechnicianAffiliation",
              description:
                "Required when usertype is technician. in_house or third_party (aliases: in-house, thirdParty, technicianType)."
            },
            companyName: {
              type: "string",
              description: "Required when technicianAffiliation is third_party"
            },
            managerId: {
              type: "integer",
              nullable: true,
              description:
                "Required for technicians when assigning a manager. Must reference an active admin or manager user in the same organization. Aliases: managerid, manager."
            },
            contactno: { type: "string", nullable: true },
            branchid: { type: "integer", description: "Defaults to JWT branchid" },
            policyid: { type: "integer", description: "Defaults to first non-admin policy for tenant" },
            isactive: { type: "boolean", default: true },
            resetPassword: {
              type: "boolean",
              default: true,
              description: "When user already exists, set new random password and email it"
            },
            sendEmail: { type: "boolean", default: true, description: "Send credentials / invitation email" }
          },
          required: ["name", "email"]
        },
        AdminUpdateUserRequest: {
          type: "object",
          required: ["userid"],
          properties: {
            userid: { type: "integer", description: "User to update" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            contactno: { type: "string", nullable: true },
            usertype: { $ref: "#/components/schemas/UserType" },
            technicianAffiliation: { $ref: "#/components/schemas/TechnicianAffiliation" },
            companyName: { type: "string", nullable: true },
            profileimage: { type: "string", nullable: true, description: "Profile image URL" },
            imageUrl: { type: "string", nullable: true, description: "Alias of profileimage" },
            gender: { type: "string", nullable: true },
            country: { type: "integer", nullable: true },
            city: { type: "integer", nullable: true },
            isactive: { type: "boolean" },
            isblocked: {
              type: "boolean",
              description: "Block or unblock user for the target branch"
            },
            allowFaceApprovalRequest: { type: "boolean" },
            faceAttendanceEnabled: { type: "boolean" },
            branchid: {
              type: "integer",
              description: "Branch context for policy/membership updates (default JWT branchid)"
            },
            policyid: {
              type: "integer",
              description: "Replace the user's policy for the target branch"
            },
            password: {
              type: "string",
              description: "Set an explicit new password"
            },
            resetPassword: {
              type: "boolean",
              default: false,
              description: "Generate a random password and optionally email it"
            },
            sendEmail: {
              type: "boolean",
              default: true,
              description: "When password is reset, email the new credentials"
            }
          }
        },
        JobCreateCustomer: {
          type: "object",
          description: "When customerid is omitted, customer is upserted by contactno/phone within tenant+branch.",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            contactno: { type: "string" },
            phone: { type: "string", description: "Alias of contactno" },
            city: { type: "integer" },
            area: { type: "integer" },
            country: { type: "integer" },
            address: { type: "string", description: "Stored on jobdetails when also sent at root as address" }
          }
        },
        JobServiceLineItem: {
          type: "object",
          description: "Legacy schema; use JobProductLineItem / productLines on job create instead.",
          properties: {
            productid: { type: "integer" },
            qty: { type: "number" },
            price: { type: "number" },
            rate: { type: "number", description: "Alias of price" },
            amount: { type: "number", description: "Alias of inclusiveamount when tax not split" },
            inclusiveamount: { type: "number" },
            totalamount: { type: "number" },
            exclusiveamount: { type: "number" },
            taxamount: { type: "number" },
            tax: { type: "number", description: "Alias of taxamount" },
            vat: { type: "number", description: "Alias of taxamount" },
            taxpercent: { type: "number" },
            taxtypeid: { type: "integer" },
            discountamount: { type: "number" },
            discountvalue: { type: "number" },
            discounttype: { type: "string" },
            lineno: { type: "integer" },
            isserviceitem: { type: "boolean" },
            remarks: { type: "string" },
            partService: { type: "string", description: "Line label when productid omitted" },
            label: { type: "string" },
            name: { type: "string" },
            modelno: { type: "string" }
          }
        },
        JobProductLineItem: {
          type: "object",
          description:
            "Product lines saved on jobproducts. productid may reference inventory or service catalog products.",
          properties: {
            recno: {
              type: "integer",
              description: "Existing jobproducts.recno — include on PUT to update; omit on POST to create"
            },
            productid: { type: "integer" },
            productname: { type: "string", readOnly: true },
            producttype: { type: "string", enum: ["inventory", "service"], nullable: true },
            modelno: { type: "string", description: "Line model / part number (jobproducts.modelno)" },
            partno: { type: "string", description: "Line serial / part no (jobproducts.partno)" },
            salerefrenceno: { type: "string", description: "Line sale reference (jobproducts.salerefrenceno)" },
            qty: { type: "number" },
            price: { type: "number" },
            rate: { type: "number", description: "Alias of price" },
            totalamount: { type: "number" },
            discounttype: { type: "string" },
            discountvalue: { type: "number" },
            discountamount: { type: "number" },
            exclusiveamount: { type: "number" },
            taxtypeid: { type: "integer" },
            taxpercent: { type: "number" },
            taxamount: { type: "number" },
            inclusiveamount: { type: "number" },
            isserviceitem: { type: "boolean" },
            unitid: { type: "integer", readOnly: true },
            unitname: { type: "string", readOnly: true },
            brandId: { type: "integer", nullable: true, readOnly: true, description: "From catalog product brands.recno" },
            lineno: { type: "integer" },
            remarks: { type: "string" },
            partService: { type: "string" },
            name: { type: "string" }
          }
        },
        JobServiceLineItem: {
          type: "object",
          description:
            "Same shape as JobProductLineItem. productid must reference a catalog product with type service (products.isservice or products.producttype = service).",
          allOf: [{ $ref: "#/components/schemas/JobProductLineItem" }]
        },
        JobRemarkItem: {
          type: "object",
          properties: {
            recno: { type: "integer" },
            jobid: { type: "integer" },
            remarks: { type: "string" },
            addedby: { type: "integer" },
            addedat: { type: "string", format: "date-time" },
            addedByName: { type: "string", nullable: true },
            addedByEmail: { type: "string", nullable: true }
          }
        },
        JobAttachmentItem: {
          type: "object",
          properties: {
            recno: { type: "integer" },
            jobid: { type: "integer" },
            attachmentname: { type: "string", nullable: true },
            url: { type: "string", nullable: true },
            remarks: { type: "string", nullable: true },
            addedby: { type: "integer", nullable: true, description: "User id who uploaded the attachment" },
            addedByName: { type: "string", nullable: true },
            addedByEmail: { type: "string", nullable: true },
            addedat: { type: "string", format: "date-time", nullable: true }
          }
        },
        JobRemarksListResponse: {
          type: "object",
          properties: {
            jobid: { type: "integer" },
            total: { type: "integer" },
            remarks: { type: "array", items: { $ref: "#/components/schemas/JobRemarkItem" } },
            data: { type: "array", items: { $ref: "#/components/schemas/JobRemarkItem" } }
          }
        },
        JobRemarkCreateRequest: {
          type: "object",
          description: "Send one remark per request, or multiple via remarks array.",
          properties: {
            remarks: {
              oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
              description: "Remark text or list of texts"
            },
            comment: { type: "string", description: "Alias of remarks" },
            remarkEntries: { type: "array", items: { type: "string" } }
          }
        },
        JobListResponse: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["all", "my"] },
            data: {
              type: "array",
              items: { type: "object", additionalProperties: true }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            },
            filters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  type: { type: "string" },
                  operators: { type: "array", items: { type: "string" } },
                  description: { type: "string" }
                }
              }
            }
          }
        },
        JobStatsKpiItem: {
          type: "object",
          properties: {
            key: {
              type: "string",
              enum: ["newJobs", "assignedJobs", "followUpJobs", "completedJobs", "cancelledJobs"]
            },
            label: { type: "string", example: "New Jobs" },
            count: { type: "integer" }
          }
        },
        JobStatsKpisResponse: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["all", "my", "team"] },
            asOf: { type: "string", format: "date-time" },
            totalJobs: {
              type: "integer",
              description: "Total jobs in scope after optional list filters (date range, search, etc.)"
            },
            statsKpis: {
              type: "array",
              items: { $ref: "#/components/schemas/JobStatsKpiItem" }
            }
          }
        },
        TeamJobMember: {
          type: "object",
          properties: {
            userid: { type: "integer" },
            name: { type: "string", nullable: true },
            email: { type: "string", nullable: true }
          }
        },
        TeamJobListResponse: {
          allOf: [
            { $ref: "#/components/schemas/JobListResponse" },
            {
              type: "object",
              properties: {
                mode: { type: "string", enum: ["team"] },
                teamMembers: {
                  type: "array",
                  items: { $ref: "#/components/schemas/TeamJobMember" }
                }
              }
            }
          ]
        },
        TeamJobStatsKpisResponse: {
          allOf: [
            { $ref: "#/components/schemas/JobStatsKpisResponse" },
            {
              type: "object",
              properties: {
                mode: { type: "string", enum: ["team"] },
                teamMembers: {
                  type: "array",
                  items: { $ref: "#/components/schemas/TeamJobMember" }
                }
              }
            }
          ]
        },
        DashboardSection1Response: {
          type: "object",
          properties: {
            section: { type: "integer", example: 1 },
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", description: "UTC calendar date used for today metrics" },
            scope: { type: "string", enum: ["all", "my"] },
            metrics: {
              type: "object",
              properties: {
                totalJobsToday: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    value: { type: "integer" },
                    trend: { type: "integer", description: "1 = up vs yesterday, -1 = down, 0 = unchanged" },
                    yesterday: { type: "integer" },
                    delta: { type: "integer" }
                  }
                },
                openJobsToday: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    value: { type: "integer" },
                    pending: { type: "integer" },
                    inProgress: { type: "integer" }
                  }
                },
                completedJobsToday: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    value: { type: "integer" },
                    trend: { type: "integer" },
                    yesterday: { type: "integer" },
                    delta: { type: "integer" }
                  }
                },
                pendingApproval: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    subtitle: { type: "string" },
                    value: { type: "integer" }
                  }
                },
                activeTechnicians: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    subtitle: { type: "string" },
                    value: { type: "integer", description: "Distinct technicians traveling or on site" },
                    traveling: { type: "integer" },
                    onSite: { type: "integer" }
                  }
                },
                unacknowledgedJobs: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    subtitle: { type: "string" },
                    value: { type: "integer" }
                  }
                }
              }
            }
          }
        },
        DashboardJobSummaryBucket: {
          type: "object",
          properties: {
            total: { type: "integer", description: "Jobs in scope for the period" },
            resolved: { type: "integer", description: "Jobs with isresolved = true" },
            inProgress: { type: "integer", description: "Jobs with isresolved not true" }
          }
        },
        DashboardJobSummaryPeriodBucket: {
          allOf: [
            { $ref: "#/components/schemas/DashboardJobSummaryBucket" },
            {
              type: "object",
              properties: {
                date: { type: "string", format: "date", nullable: true },
                period: {
                  type: "object",
                  nullable: true,
                  properties: {
                    from: { type: "string", format: "date-time" },
                    to: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          ]
        },
        DashboardJobSummaryResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            scope: { type: "string", enum: ["all", "my", "none"] },
            overall: { $ref: "#/components/schemas/DashboardJobSummaryBucket" },
            today: { $ref: "#/components/schemas/DashboardJobSummaryPeriodBucket" },
            yesterday: { $ref: "#/components/schemas/DashboardJobSummaryPeriodBucket" },
            last7Days: { $ref: "#/components/schemas/DashboardJobSummaryPeriodBucket" },
            last30Days: { $ref: "#/components/schemas/DashboardJobSummaryPeriodBucket" }
          }
        },
        DashboardTechniciansResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            filter: { type: "string", enum: ["all", "offline", "on_site", "traveling"] },
            summary: {
              type: "object",
              properties: {
                all: { type: "integer" },
                offline: { type: "integer" },
                onSite: { type: "integer" },
                traveling: { type: "integer" }
              }
            },
            technicians: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  userid: { type: "integer" },
                  name: { type: "string", nullable: true },
                  email: { type: "string", nullable: true },
                  technicianAffiliation: { $ref: "#/components/schemas/TechnicianAffiliation", nullable: true },
                  companyName: { type: "string", nullable: true },
                  status: { type: "string", enum: ["offline", "on_site", "traveling"] },
                  currentJob: {
                    type: "object",
                    nullable: true,
                    properties: {
                      jobid: { type: "integer" },
                      code: { type: "string", nullable: true },
                      manualjobno: { type: "string", nullable: true }
                    }
                  },
                  sessionStartedAt: { type: "string", format: "date-time", nullable: true },
                  lastLocation: {
                    type: "object",
                    nullable: true,
                    properties: {
                      latitude: { type: "number" },
                      longitude: { type: "number" },
                      address: { type: "string", nullable: true },
                      recordedat: { type: "string", format: "date-time", nullable: true },
                      jobid: { type: "integer", nullable: true }
                    }
                  }
                }
              }
            }
          }
        },
        DashboardTechniciansLiveJob: {
          type: "object",
          nullable: true,
          properties: {
            jobId: { type: "integer" },
            jobCode: { type: "string", nullable: true },
            manualJobNo: { type: "string", nullable: true },
            customerName: { type: "string", nullable: true },
            categoryName: { type: "string", nullable: true },
            faultName: { type: "string", nullable: true },
            sessionType: { type: "string", enum: ["work", "travel"], nullable: true },
            startedAt: { type: "string", format: "date-time", nullable: true },
            location: {
              type: "object",
              nullable: true,
              properties: {
                latitude: { type: "number", nullable: true },
                longitude: { type: "number", nullable: true },
                address: { type: "string", nullable: true }
              }
            }
          }
        },
        DashboardTechniciansLiveStatusItem: {
          type: "object",
          properties: {
            technicianId: { type: "integer" },
            technicianName: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            technicianAffiliation: { $ref: "#/components/schemas/TechnicianAffiliation", nullable: true },
            companyName: { type: "string", nullable: true },
            status: {
              type: "string",
              enum: ["on_site", "travelling", "waiting", "off_duty"]
            },
            statusLabel: {
              type: "string",
              example: "On Site",
              enum: ["On Site", "Travelling", "Waiting", "Off Duty"]
            },
            liveJob: { $ref: "#/components/schemas/DashboardTechniciansLiveJob" },
            lastCompletedJob: {
              allOf: [{ $ref: "#/components/schemas/DashboardTechniciansLiveJob" }],
              nullable: true,
              properties: {
                completedAt: { type: "string", format: "date-time", nullable: true }
              }
            },
            lastActive: {
              type: "object",
              nullable: true,
              properties: {
                at: { type: "string", format: "date-time", nullable: true },
                location: {
                  type: "object",
                  nullable: true,
                  properties: {
                    latitude: { type: "number", nullable: true },
                    longitude: { type: "number", nullable: true },
                    address: { type: "string", nullable: true }
                  }
                }
              }
            },
            onDutySince: {
              type: "string",
              format: "date-time",
              nullable: true,
              description: "Check-in time when status is waiting"
            },
            currentLocation: {
              type: "object",
              nullable: true,
              properties: {
                latitude: { type: "number", nullable: true },
                longitude: { type: "number", nullable: true },
                address: { type: "string", nullable: true },
                recordedat: { type: "string", format: "date-time", nullable: true },
                jobid: { type: "integer", nullable: true }
              }
            }
          }
        },
        DashboardTechniciansLiveStatusResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            title: { type: "string", example: "ALL TECHNICIANS — LIVE STATUS" },
            filter: {
              type: "string",
              enum: ["all", "on_site", "travelling", "waiting", "off_duty"]
            },
            summary: {
              type: "object",
              properties: {
                all: { type: "integer" },
                onSite: { type: "integer" },
                travelling: { type: "integer" },
                waiting: { type: "integer" },
                offDuty: { type: "integer" }
              }
            },
            technicians: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardTechniciansLiveStatusItem" }
            }
          }
        },
        DashboardTechnicianStatsItem: {
          type: "object",
          properties: {
            technicianId: { type: "integer" },
            technicianName: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            status: {
              type: "string",
              enum: ["on_site", "traveling", "break", "idle", "absent"]
            },
            statusLabel: { type: "string", example: "On Site" },
            attendanceStatus: {
              type: "string",
              nullable: true,
              enum: ["checked_in", "on_break", "checked_out", null]
            },
            checkedInToday: { type: "boolean" },
            onDutySince: { type: "string", format: "date-time", nullable: true },
            liveJob: {
              type: "object",
              nullable: true,
              properties: {
                jobid: { type: "integer" },
                code: { type: "string", nullable: true },
                manualjobno: { type: "string", nullable: true }
              }
            }
          }
        },
        DashboardTechnicianStatsResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", description: "UTC calendar date for present/absent today counts" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            title: { type: "string", example: "TECHNICIAN STATS" },
            filter: {
              type: "string",
              enum: ["all", "on_site", "traveling", "break", "idle", "absent"]
            },
            summary: {
              type: "object",
              properties: {
                total: { type: "integer", description: "All active branch technicians" },
                onSite: { type: "integer", description: "Open work session (on site)" },
                working: { type: "integer", description: "Alias for onSite" },
                traveling: { type: "integer", description: "Open travel session" },
                break: { type: "integer", description: "Open attendance on break" },
                present: { type: "integer", description: "Checked in, idle (no active job session)" },
                idle: { type: "integer", description: "Alias for present" },
                absent: { type: "integer", description: "Not currently checked in" },
                presentNow: {
                  type: "integer",
                  description: "Currently on duty (on site + traveling + break + present)"
                },
                presentToday: {
                  type: "integer",
                  description: "Checked in at least once today (UTC)"
                },
                absentToday: {
                  type: "integer",
                  description: "No check-in recorded today (UTC)"
                }
              }
            },
            technicians: {
              type: "array",
              description: "Included only when includeTechnicians=true",
              items: { $ref: "#/components/schemas/DashboardTechnicianStatsItem" }
            }
          }
        },
        DashboardJobPipelineStatusItem: {
          type: "object",
          properties: {
            statusId: {
              type: "integer",
              nullable: true,
              description: "Null for the aggregate `All` row or `Unassigned` jobs"
            },
            statusName: { type: "string", example: "Pending" },
            count: { type: "integer" },
            color: { type: "string", nullable: true, description: "Status color from job statuses" }
          }
        },
        PublicGeoDropdownItem: {
          type: "object",
          properties: {
            value: { type: "integer", description: "ISO 3166-1 numeric country code" },
            label: { type: "string" },
            code: { type: "string", description: "ISO alpha-2 country code", example: "PK" }
          }
        },
        PublicJobStatsResponse: {
          type: "object",
          properties: {
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            branchName: { type: "string", nullable: true },
            asOf: { type: "string", format: "date-time" },
            stats: {
              type: "object",
              properties: {
                openJobs: { type: "integer", description: "Jobs where isresolved is not true" },
                resolvedToday: { type: "integer", description: "Resolved today (UTC)" },
                resolvedLast7Days: { type: "integer", description: "Resolved in rolling last 7 UTC days" },
                resolvedLast30Days: { type: "integer", description: "Resolved in rolling last 30 UTC days" }
              }
            },
            periods: {
              type: "object",
              properties: {
                today: {
                  type: "object",
                  properties: {
                    from: { type: "string", format: "date-time" },
                    to: { type: "string", format: "date-time" }
                  }
                },
                last7Days: {
                  type: "object",
                  properties: {
                    from: { type: "string", format: "date-time" },
                    to: { type: "string", format: "date-time" }
                  }
                },
                last30Days: {
                  type: "object",
                  properties: {
                    from: { type: "string", format: "date-time" },
                    to: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          }
        },
        PublicGeoCountriesDropdownResponse: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/PublicGeoDropdownItem" }
            },
            total: { type: "integer" },
            resource: { type: "string", enum: ["countries"] },
            scope: { type: "string", enum: ["overall"] },
            source: { type: "string", enum: ["static"] }
          }
        },
        CustomerAddressDropdownItem: {
          type: "object",
          properties: {
            value: {
              type: "integer",
              nullable: true,
              description: "null for customer default address; customeraddresses.recno for additional rows"
            },
            label: { type: "string" },
            isDefault: { type: "boolean" },
            recno: { type: "integer", nullable: true },
            customerAddressId: {
              type: "integer",
              nullable: true,
              description: "Same as recno for additional addresses; null for default"
            },
            country: { type: "integer", nullable: true },
            city: { type: "integer", nullable: true },
            area: { type: "integer", nullable: true },
            address: { type: "string", nullable: true },
            countryId: { type: "integer", nullable: true },
            cityId: { type: "integer", nullable: true },
            areaId: { type: "integer", nullable: true },
            countryName: { type: "string", nullable: true },
            cityName: { type: "string", nullable: true },
            areaName: { type: "string", nullable: true }
          }
        },
        CustomerAddressDropdownResponse: {
          type: "object",
          properties: {
            customerId: { type: "integer" },
            customerName: { type: "string", nullable: true },
            defaultAddress: { $ref: "#/components/schemas/CustomerAddressDropdownItem" },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/CustomerAddressDropdownItem" }
            },
            total: { type: "integer" },
            returned: { type: "integer" },
            resource: { type: "string", enum: ["customer-addresses"] },
            filters: {
              type: "object",
              properties: {
                customerId: { type: "integer" }
              }
            }
          }
        },
        PublicGeoDropdownResponse: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/PublicGeoDropdownItem" }
            },
            total: { type: "integer" },
            resource: { type: "string", enum: ["countries"] },
            scope: { type: "string", enum: ["overall"] }
          }
        },
        PublicGeoCityDropdownItem: {
          type: "object",
          properties: {
            value: {
              type: "integer",
              description: "Stable reference id for the city (derived from country, state, name)"
            },
            label: { type: "string" },
            countryId: { type: "integer", description: "ISO 3166-1 numeric country code" },
            countryCode: { type: "string", example: "PK" },
            stateCode: { type: "string", nullable: true },
            latitude: { type: "string", nullable: true },
            longitude: { type: "string", nullable: true }
          }
        },
        PublicGeoCitiesDropdownResponse: {
          type: "object",
          properties: {
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/PublicGeoCityDropdownItem" }
            },
            total: { type: "integer" },
            resource: { type: "string", enum: ["cities"] },
            scope: { type: "string", enum: ["overall"] },
            source: { type: "string", enum: ["static"] },
            countryId: { type: "integer", description: "ISO 3166-1 numeric code" },
            countryCode: { type: "string" },
            countryName: { type: "string", nullable: true },
            filters: {
              type: "object",
              properties: {
                countryid: { type: "integer" },
                countryCode: { type: "string" }
              }
            }
          }
        },
        DashboardJobPipelineResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", description: "UTC calendar date used for today filter" },
            scope: { type: "string", enum: ["all", "my"] },
            total: { type: "integer", description: "Total jobs scheduled for today in scope" },
            statuses: {
              type: "array",
              description: "Status counts; first item is always `All`, then tenant job statuses in sort order",
              items: { $ref: "#/components/schemas/DashboardJobPipelineStatusItem" }
            }
          }
        },
        DashboardTodayJobsStatusItem: {
          type: "object",
          properties: {
            key: {
              type: "string",
              enum: [
                "all",
                "pending",
                "approved_quotation",
                "rejected_quotation",
                "pending_quotations"
              ]
            },
            label: { type: "string", example: "Approved (Quotation)" },
            count: { type: "integer" }
          }
        },
        DashboardTodayJobsRow: {
          type: "object",
          properties: {
            jobId: { type: "integer" },
            jobNo: { type: "string", nullable: true },
            customerId: { type: "integer", nullable: true },
            customerName: { type: "string", nullable: true },
            groupName: { type: "string", nullable: true },
            categoryName: { type: "string", nullable: true },
            faultName: { type: "string", nullable: true },
            technicianAssignedName: { type: "string", nullable: true },
            priority: { type: "string", nullable: true },
            priorityColor: { type: "string", nullable: true },
            status: { type: "string", nullable: true },
            statusColor: { type: "string", nullable: true },
            quotationStatus: { type: "string", nullable: true },
            quotationStatusName: { type: "string", nullable: true },
            isCompleted: { type: "boolean" }
          }
        },
        DashboardTodayJobsResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date" },
            scope: { type: "string", enum: ["all", "my", "none"] },
            filter: {
              type: "string",
              enum: [
                "all",
                "pending",
                "approved_quotation",
                "rejected_quotation",
                "pending_quotations"
              ]
            },
            summary: {
              type: "object",
              properties: {
                all: { type: "integer" },
                pending: { type: "integer", description: "Open/incomplete jobs today" },
                approvedQuotation: { type: "integer" },
                rejectedQuotation: { type: "integer" },
                pendingQuotations: {
                  type: "integer",
                  description: "Jobs with quotation status created or sent"
                }
              }
            },
            statuses: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardTodayJobsStatusItem" }
            },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardTodayJobsRow" }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            }
          }
        },
        DashboardActivityFeedItem: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: {
              type: "string",
              enum: [
                "travel_started",
                "travel_stopped",
                "work_started",
                "work_stopped",
                "job_completed",
                "job_resolved",
                "job_acknowledged",
                "quotation_status_changed"
              ]
            },
            at: { type: "string", format: "date-time", nullable: true },
            message: {
              type: "string",
              example: "Ali Khan started travelling on Job #009903"
            },
            technicianId: { type: "integer", nullable: true },
            technicianName: { type: "string", nullable: true },
            jobId: { type: "integer", nullable: true },
            jobCode: { type: "string", nullable: true },
            jobManualCode: { type: "string", nullable: true },
            remarks: { type: "string", nullable: true },
            quotationStatus: { type: "string", nullable: true },
            quotationStatusName: { type: "string", nullable: true }
          }
        },
        DashboardActivityFeedResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardActivityFeedItem" }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            }
          }
        },
        DashboardJobsByGroupItem: {
          type: "object",
          properties: {
            groupName: { type: "string", nullable: true },
            count: { type: "integer" },
            color: { type: "string", nullable: true, example: "#FF5733" }
          }
        },
        DashboardJobsByGroupResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", description: "UTC calendar date used for today filter" },
            scope: { type: "string", enum: ["all", "my"] },
            total: { type: "integer" },
            groups: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardJobsByGroupItem" }
            }
          }
        },
        DashboardLocationWiseJobsItem: {
          type: "object",
          properties: {
            cityId: { type: "integer", nullable: true },
            cityName: { type: "string", example: "Lahore" },
            count: { type: "integer" },
            percentage: {
              type: "number",
              description: "Share of today's jobs in scope (0–100, 2 decimal places)"
            }
          }
        },
        DashboardLocationWiseJobsResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", description: "UTC calendar date used for today filter" },
            scope: { type: "string", enum: ["all", "my"] },
            total: { type: "integer", description: "Total jobs scheduled for today in scope" },
            cities: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardLocationWiseJobsItem" }
            }
          }
        },
        DashboardCategoryWiseJobsItem: {
          type: "object",
          properties: {
            categoryId: { type: "integer", nullable: true },
            categoryName: { type: "string", example: "HVAC Service" },
            groupName: { type: "string", nullable: true, description: "Parent job group name" },
            count: { type: "integer" },
            percentage: {
              type: "number",
              description: "Share of today's jobs in scope (0–100, 2 decimal places)"
            },
            color: { type: "string", nullable: true, example: "#2196F3" }
          }
        },
        DashboardCategoryWiseJobsResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", description: "UTC calendar date used for today filter" },
            scope: { type: "string", enum: ["all", "my"] },
            total: { type: "integer", description: "Total jobs scheduled for today in scope" },
            categories: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardCategoryWiseJobsItem" }
            }
          }
        },
        DashboardTopFaultsItem: {
          type: "object",
          properties: {
            subCategoryName: { type: "string", nullable: true },
            categoryName: { type: "string", nullable: true },
            groupName: { type: "string", nullable: true },
            count: { type: "integer" },
            percentage: { type: "number", description: "Share of today's jobs (0–100, 2 decimal places)" }
          }
        },
        DashboardTopFaultsResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", description: "UTC calendar date used for today filter" },
            scope: { type: "string", enum: ["all", "my"] },
            total: { type: "integer", description: "Total jobs counted for percentage calculation" },
            limit: { type: "integer" },
            faults: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardTopFaultsItem" }
            }
          }
        },
        DashboardTechnicianPerformanceItem: {
          type: "object",
          properties: {
            rank: { type: "integer" },
            technicianId: { type: "integer" },
            technicianName: { type: "string", nullable: true },
            technicianAffiliation: { $ref: "#/components/schemas/TechnicianAffiliation", nullable: true },
            companyName: { type: "string", nullable: true },
            completedCount: { type: "integer", description: "Jobs completed today by this technician" },
            percentage: {
              type: "number",
              description: "Share of today's completed jobs (0–100, 2 decimal places)"
            }
          }
        },
        DashboardTechnicianPerformanceResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", description: "UTC calendar date used for today filter" },
            scope: { type: "string", enum: ["all", "my"] },
            totalCompleted: { type: "integer", description: "Total jobs completed today in scope" },
            limit: { type: "integer" },
            technicians: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardTechnicianPerformanceItem" }
            }
          }
        },
        DashboardManagerJobItem: {
          type: "object",
          properties: {
            jobId: { type: "integer" },
            jobCode: { type: "string", nullable: true },
            jobManualCode: { type: "string", nullable: true },
            jobDate: { type: "string", format: "date", nullable: true },
            customerName: { type: "string", nullable: true },
            technicianId: { type: "integer", nullable: true },
            technicianName: { type: "string", nullable: true },
            faultName: { type: "string", nullable: true },
            assignedAt: { type: "string", format: "date-time", nullable: true },
            firstResponseAt: { type: "string", format: "date-time", nullable: true },
            estimatedCompletedMinutes: { type: "integer", nullable: true },
            isOverdue: { type: "boolean" },
            isAcknowledged: { type: "boolean" },
            hasFirstResponse: { type: "boolean" }
          }
        },
        DashboardManagerJobsResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            managerId: { type: "integer" },
            list: { type: "string", enum: ["all", "awaitingResponse", "overdue", "noFirstResponse"] },
            limit: { type: "integer" },
            summary: {
              type: "object",
              properties: {
                awaitingResponse: { type: "integer" },
                overdue: { type: "integer" },
                noFirstResponse: { type: "integer" }
              }
            },
            lists: {
              type: "object",
              properties: {
                awaitingResponse: {
                  type: "array",
                  items: { $ref: "#/components/schemas/DashboardManagerJobItem" }
                },
                overdue: {
                  type: "array",
                  items: { $ref: "#/components/schemas/DashboardManagerJobItem" }
                },
                noFirstResponse: {
                  type: "array",
                  items: { $ref: "#/components/schemas/DashboardManagerJobItem" }
                }
              }
            }
          }
        },
        DashboardManagerTechnicianItem: {
          type: "object",
          properties: {
            technicianId: { type: "integer" },
            technicianName: { type: "string", nullable: true },
            technicianAffiliation: { $ref: "#/components/schemas/TechnicianAffiliation", nullable: true },
            companyName: { type: "string", nullable: true },
            status: {
              type: "string",
              enum: ["on_site", "travelling", "idle", "offline"]
            },
            code: {
              type: "string",
              nullable: true,
              description: "Active job code when on site or travelling (branch jobs)"
            },
            jobsAssigned: {
              type: "integer",
              description: "Open jobs in branch currently assigned to this technician"
            },
            jobsCompleted: {
              type: "integer",
              description: "Jobs completed today by this technician in branch"
            },
            totalWorkedHours: {
              type: "number",
              description: "Hours worked today on branch jobs (2 decimal places)"
            }
          }
        },
        DashboardManagerTechniciansResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date" },
            managerId: { type: "integer" },
            total: { type: "integer" },
            technicians: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardManagerTechnicianItem" }
            }
          }
        },
        DashboardManagerSummaryResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date" },
            managerId: { type: "integer" },
            text: {
              type: "string",
              example:
                "My Team: Hamza Naseer, Zeeshan Haider, Adnan Makki, Default User · 4 technicians · 9 open jobs · 6 completed today · 3 approvals awaiting your action"
            },
            team: {
              type: "object",
              properties: {
                total: { type: "integer" },
                members: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      userId: { type: "integer" },
                      name: { type: "string" }
                    }
                  }
                }
              }
            },
            metrics: {
              type: "object",
              properties: {
                technicians: { type: "integer", description: "Branch technicians on the manager team" },
                openJobs: { type: "integer", description: "Open (not completed) jobs in branch" },
                completedToday: {
                  type: "integer",
                  description: "Manager-scoped jobs completed today (UTC)"
                },
                pendingApprovals: {
                  type: "integer",
                  description: "Approval requests awaiting action from the authenticated manager"
                }
              }
            }
          }
        },
        DashboardActiveJobItem: {
          type: "object",
          properties: {
            jobId: { type: "integer" },
            jobNo: { type: "string", nullable: true, description: "Job code (job#)" },
            customerId: { type: "integer", nullable: true },
            customerName: { type: "string", nullable: true },
            groupName: { type: "string", nullable: true },
            categoryName: { type: "string", nullable: true },
            faultName: { type: "string", nullable: true },
            technicianAssignedName: { type: "string", nullable: true },
            priority: { type: "string", nullable: true },
            priorityColor: { type: "string", nullable: true },
            status: { type: "string", nullable: true },
            statusColor: { type: "string", nullable: true }
          }
        },
        DashboardActiveJobsResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            scope: { type: "string", enum: ["all", "my"] },
            filters: {
              type: "object",
              properties: {
                customerName: { type: "string", nullable: true },
                statusId: { type: "integer", nullable: true },
                status: { type: "string", nullable: true },
                faultId: { type: "integer", nullable: true },
                faultName: { type: "string", nullable: true }
              }
            },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardActiveJobItem" }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            }
          }
        },
        DashboardTodaysProgressResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date" },
            scope: { type: "string", enum: ["all", "my"] },
            jobs: {
              type: "object",
              properties: {
                total: { type: "integer", description: "Jobs scheduled for today" },
                completed: { type: "integer", description: "Today's jobs marked completed" },
                pending: { type: "integer", description: "Today's jobs not yet completed" },
                completionRate: {
                  type: "number",
                  description: "Completed / total today (0–100, 2 decimal places)"
                }
              }
            },
            firstResponseRate: {
              type: "object",
              properties: {
                value: { type: "number", description: "Percentage with first response (0–100)" },
                responded: { type: "integer" },
                total: { type: "integer" }
              }
            },
            avgCompletionHours: {
              type: "object",
              properties: {
                value: { type: "number", example: 2.5 },
                label: { type: "string", example: "2.5 Hours" },
                sampleSize: {
                  type: "integer",
                  description: "Number of jobs completed today used in the average"
                }
              }
            }
          }
        },
        DashboardWarrantySplitResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", description: "UTC date used for today's job filter" },
            scope: { type: "string", enum: ["all", "my"] },
            total: { type: "integer", description: "Total jobs scheduled for today in scope" },
            split: {
              type: "object",
              properties: {
                warranty: {
                  type: "object",
                  properties: {
                    label: { type: "string", example: "Warranty" },
                    count: { type: "integer" },
                    percentage: { type: "number", description: "Share of today's jobs (0–100, 2 decimal places)" }
                  }
                },
                nonWarranty: {
                  type: "object",
                  properties: {
                    label: { type: "string", example: "Non-Warranty" },
                    count: { type: "integer" },
                    percentage: { type: "number", description: "Share of today's jobs (0–100, 2 decimal places)" }
                  }
                }
              }
            }
          }
        },
        DashboardWeeklyJobVolumePoint: {
          type: "object",
          properties: {
            label: { type: "string", example: "Highest Volume" },
            value: { type: "number", description: "Job count for that metric" },
            date: {
              type: "string",
              format: "date",
              nullable: true,
              description: "Day that reached highest/lowest volume (null for medium)"
            }
          }
        },
        DashboardWeeklyJobVolumeWeek: {
          type: "object",
          properties: {
            weekStart: { type: "string", format: "date" },
            weekEnd: { type: "string", format: "date" },
            label: { type: "string", example: "Apr 7 – 13" },
            totalJobs: { type: "integer", description: "Total jobs in the week" },
            volume: {
              type: "object",
              properties: {
                highest: { $ref: "#/components/schemas/DashboardWeeklyJobVolumePoint" },
                lowest: { $ref: "#/components/schemas/DashboardWeeklyJobVolumePoint" },
                medium: { $ref: "#/components/schemas/DashboardWeeklyJobVolumePoint" }
              }
            },
            dailyBreakdown: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string", format: "date" },
                  count: { type: "integer" }
                }
              }
            }
          }
        },
        DashboardWeeklyJobVolumeSeries: {
          type: "object",
          properties: {
            key: { type: "string", enum: ["highest", "lowest", "medium"] },
            label: { type: "string" },
            values: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  weekStart: { type: "string", format: "date" },
                  label: { type: "string" },
                  value: { type: "number" }
                }
              }
            }
          }
        },
        DashboardWeeklyJobVolumeResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            scope: { type: "string", enum: ["all", "my"] },
            weekCount: { type: "integer", example: 8 },
            weeks: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardWeeklyJobVolumeWeek" }
            },
            series: {
              type: "array",
              description: "Three chart lines: highest, lowest, and medium volume per week",
              items: { $ref: "#/components/schemas/DashboardWeeklyJobVolumeSeries" }
            }
          }
        },
        DashboardAvgResolutionByCategoryItem: {
          type: "object",
          properties: {
            categoryId: { type: "integer", nullable: true },
            categoryName: { type: "string", example: "HVAC Service" },
            color: { type: "string", nullable: true },
            avgResolutionHours: {
              type: "number",
              description: "Average hours from assignment to resolution (2 decimal places)"
            },
            avgResolutionLabel: { type: "string", example: "4.5 Hours" },
            sampleSize: {
              type: "integer",
              description: "Number of resolved jobs used in the average"
            }
          }
        },
        DashboardAvgResolutionByCategoryResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            scope: { type: "string", enum: ["all", "my"] },
            overall: {
              type: "object",
              properties: {
                avgResolutionHours: { type: "number" },
                avgResolutionLabel: { type: "string", example: "3.25 Hours" },
                sampleSize: { type: "integer" }
              }
            },
            categories: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardAvgResolutionByCategoryItem" }
            }
          }
        },
        DashboardTicketReopeningRateMonth: {
          type: "object",
          properties: {
            month: { type: "string", example: "2026-06", description: "UTC year-month" },
            label: { type: "string", example: "Jun 2026" },
            completedTickets: {
              type: "integer",
              description: "Distinct tickets completed in the month"
            },
            reopenedTickets: {
              type: "integer",
              description: "Distinct tickets reopened in the month (work started after completion)"
            },
            reopenRate: {
              type: "number",
              description: "reopenedTickets / completedTickets × 100 (0–100, 2 decimal places)"
            }
          }
        },
        DashboardTicketReopeningRateResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            scope: { type: "string", enum: ["all", "my"] },
            monthCount: { type: "integer", example: 12 },
            overall: {
              type: "object",
              properties: {
                completedTickets: { type: "integer" },
                reopenedTickets: { type: "integer" },
                reopenRate: { type: "number" }
              }
            },
            months: {
              type: "array",
              items: { $ref: "#/components/schemas/DashboardTicketReopeningRateMonth" }
            },
            series: {
              type: "array",
              description: "Chart-ready monthly series for reopen rate, reopened tickets, and completed tickets",
              items: {
                type: "object",
                properties: {
                  key: { type: "string", enum: ["reopenRate", "reopenedTickets", "completedTickets"] },
                  label: { type: "string" },
                  values: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        month: { type: "string" },
                        label: { type: "string" },
                        value: { type: "number" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        JobNextCodeResponse: {
          type: "object",
          description:
            "Numeric sequence for job.code in this organization (tenant). maxNum uses only purely digit codes; nextCode is zero-padded to 6. Codes are unique per tenant, not per branch.",
          properties: {
            maxCode: {
              type: "string",
              nullable: true,
              description: "Raw MAX(code) from database for this organization (may be null or non-numeric)"
            },
            maxNum: { type: "integer", description: "Numeric max when maxCode is all digits, otherwise 0" },
            nextCode: { type: "string", example: "000042", description: "Suggested next code (pad 6)" },
            nextNum: { type: "integer", example: 42, description: "maxNum + 1" }
          }
        },
        JobSaveRequest: {
          type: "object",
          description:
            "Job create/update body (POST /api/jobs and PUT /api/jobs/{id}). productLines: include recno to update an existing line; omit recno to add. Sending productLines replaces the full set (lines not listed are removed).",
          properties: {
            code: {
              type: "string",
              description:
                "Optional. Omit or send empty to auto-assign the next 6-digit code in the same transaction as create (recommended). Must be unique within the organization (tenant). GET /api/jobs/next-code previews max/next."
            },
            date: { type: "string", format: "date-time" },
            assignedto: { type: "integer" },
            followUpById: {
              type: "integer",
              nullable: true,
              description: "User responsible for follow-up (aliases: followupby, followUpBy)"
            },
            city: { type: "integer" },
            area: { type: "integer" },
            serviceId: { type: "integer", description: "job group id (jobgroups.groupid)" },
            categoryId: { type: "integer", description: "job category id (jobcategories.categoryid)" },
            faultId: { type: "integer", description: "job sub category id (jobsubcategories.subcategoryid)" },
            erpProductId: {
              type: "integer",
              nullable: true,
              description:
                "Optional ERP catalog product on the job (job.erpproductid). Used when branch setting useERPProducts is enabled."
            },
            customerid: { type: "integer" },
            customer: { $ref: "#/components/schemas/JobCreateCustomer" },
            isinwaranty: { type: "boolean", description: "Boolean or yes/no string" },
            statusid: { type: "integer" },
            priority: { type: "string" },
            deliverytype: { type: "integer" },
            jobTypeId: {
              type: "integer",
              nullable: true,
              description: "FK to jobtypes.recno (e.g. new installation, maintenance, warranty)"
            },
            jobSourceId: {
              type: "integer",
              nullable: true,
              description: "FK to jobsources.recno (where the job lead came from)"
            },
            manualjobno: { type: "string" },
            complaintBy: {
              type: "string",
              nullable: true,
              description: "Name of the person who reported the complaint"
            },
            estimatedcompletedtime: {
              oneOf: [{ type: "integer" }, { type: "string" }],
              description: "Minutes; strings like \"60 Minutes\" use the first integer"
            },
            isacknowledged: { type: "boolean" },
            qualityassuerd: { type: "boolean" },
            description: { type: "string" },
            complaintDescription: { type: "string", description: "Alias of description on jobdetails" },
            notes: { type: "string", description: "Complaint/site notes stored on jobdetails" },
            complaintNotes: { type: "string", description: "Alias of notes on jobdetails" },
            jobNotes: {
              type: "string",
              nullable: true,
              description: "General job notes stored on job.notes"
            },
            termsAndConditions: {
              type: "string",
              nullable: true,
              description: "Job terms & conditions stored on job.termsandconditions"
            },
            detailRemarks: { type: "string", description: "Extra jobdetails.remarks text (before equipment JSON)" },
            jobdetailsRemarks: { type: "string" },
            address: { type: "string", description: "jobdetails.address (max 50 chars stored)" },
            customerAddress: { type: "string" },
            siteAddress: { type: "string" },
            latitude: { oneOf: [{ type: "string" }, { type: "number" }] },
            longitude: { oneOf: [{ type: "string" }, { type: "number" }] },
            lat: { type: "number", description: "Alias of latitude" },
            lng: { type: "number", description: "Alias of longitude" },
            brandId: {
              type: "integer",
              nullable: true,
              description: "FK to brands.recno — persisted on job.brandid"
            },
            productModel: {
              type: "string",
              description: "Job-level equipment model (not productLines); stored in jobdetails.remarks JSON"
            },
            serialNumber: {
              type: "string",
              description: "Job-level equipment serial (not productLines); stored in jobdetails.remarks JSON"
            },
            invoiceNumber: {
              type: "string",
              description: "Job-level equipment invoice (not productLines); stored in jobdetails.remarks JSON"
            },
            purchaseDate: { type: "string" },
            quotationStatus: {
              type: "string",
              nullable: true,
              enum: ["created", "sent", "approved", "rejected", null],
              description:
                "Optional quotation workflow status. Null means no quotation."
            },
            quotationNotes: {
              type: "string",
              nullable: true,
              description:
                "Per-job quotation notes. Omit on create to copy branch default from GET /api/jobs/quotation/settings."
            },
            quotationTermsAndConditions: {
              type: "string",
              nullable: true,
              description:
                "Per-job quotation terms & conditions. Aliases: quotationTerms, quotationterms."
            },
            productLines: { type: "array", items: { $ref: "#/components/schemas/JobProductLineItem" } },
            serviceLines: { type: "array", items: { $ref: "#/components/schemas/JobServiceLineItem" } },
            totalCost: {
              type: "number",
              readOnly: true,
              description: "Sum of productLines and serviceLines inclusive amounts (persisted on job.totalcost)"
            }
          }
        },
        JobCreateRequest: {
          allOf: [{ $ref: "#/components/schemas/JobSaveRequest" }],
          properties: {
            formType: {
              type: "string",
              enum: ["admin", "distributor"],
              description: "Which form settings to apply for mandatory/visibility validation (default admin)"
            }
          },
          description:
            "Create a complaint/job. Mandatory fields depend on branch form settings (GET /api/jobs/form/settings). Provide customerid OR customer (phone/contactno or name)."
        },
        PolicyUserRightItem: {
          type: "object",
          properties: {
            recno: { type: "integer", description: "userrights.recno (preferred for updates)" },
            screenid: { type: "integer", description: "Required if recno omitted" },
            branchid: { type: "integer", description: "Branch scope; defaults to JWT branchid" },
            screenname: { type: "string", readOnly: true },
            controllername: { type: "string", readOnly: true },
            view: { type: "boolean" },
            add: { type: "boolean" },
            update: { type: "boolean", description: "Edit / update permission" },
            delete: { type: "boolean" },
            others: { type: "boolean" }
          }
        },
        PolicyRightsUpdateInput: {
          type: "object",
          required: ["userRights"],
          properties: {
            userRights: {
              type: "array",
              minItems: 1,
              items: { $ref: "#/components/schemas/PolicyUserRightItem" }
            }
          }
        },
        PolicyDetailsResponse: {
          type: "object",
          properties: {
            recno: { type: "integer" },
            tenantid: { type: "integer" },
            description: { type: "string" },
            isdefaultpolicy: { type: "boolean" },
            userRights: {
              type: "array",
              items: { $ref: "#/components/schemas/PolicyUserRightItem" }
            }
          }
        },
        JobApprovalSettingsInput: {
          type: "object",
          properties: {
            isenabled: { type: "boolean" },
            levelcount: { type: "integer", minimum: 1, maximum: 4 },
            levels: {
              type: "array",
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  levelno: { type: "integer", minimum: 1, maximum: 4 },
                  levelname: { type: "string", example: "Supervisor Review" },
                  userids: {
                    type: "array",
                    items: { type: "integer" },
                    description: "User IDs who can approve at this level"
                  }
                },
                required: ["userids"]
              }
            }
          },
          required: ["levelcount", "levels"]
        },
        JobFormFieldSetting: {
          type: "object",
          properties: {
            fieldName: {
              type: "string",
              description: "API field key (e.g. customerPhone, categoryId, serviceLines, productLines)"
            },
            label: { type: "string" },
            section: {
              type: "string",
              enum: ["customer", "assignment", "lines", "notes"],
              description: "Form section grouping"
            },
            sortNo: { type: "integer" },
            isMandatory: {
              type: "boolean",
              description: "When true, field must be provided on job create (if visible)"
            },
            isShow: {
              type: "boolean",
              description: "When false, field is hidden on the form"
            },
            isHideable: {
              type: "boolean",
              description:
                "When false, branch admins cannot hide this field. Fixed for customer phone/name, job category, sub category, and fault/complaint."
            },
            formType: { type: "string", enum: ["admin", "distributor"] }
          },
          required: ["fieldName", "label", "isMandatory", "isShow", "isHideable"]
        },
        JobFormSettings: {
          type: "object",
          properties: {
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            formType: { type: "string", enum: ["admin", "distributor"] },
            fields: {
              type: "array",
              items: { $ref: "#/components/schemas/JobFormFieldSetting" }
            },
            lastUpdatedAt: { type: "string", format: "date-time", nullable: true }
          }
        },
        JobFormSettingsInput: {
          type: "object",
          required: ["formType", "fields"],
          properties: {
            formType: { type: "string", enum: ["admin", "distributor"] },
            allowHideableChanges: {
              type: "boolean",
              description: "System admin only — allows updating isHideable flags"
            },
            fields: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["fieldName"],
                properties: {
                  fieldName: { type: "string" },
                  isMandatory: { type: "boolean" },
                  isShow: { type: "boolean" },
                  isHideable: { type: "boolean" },
                  sortNo: { type: "integer" }
                }
              }
            }
          }
        },
        JobQuotationSettings: {
          type: "object",
          properties: {
            tenantid: { type: "integer", nullable: true },
            branchid: { type: "integer", nullable: true },
            defaultNotes: {
              type: "string",
              nullable: true,
              description: "Default quotation notes for new jobs in this branch"
            },
            defaultTermsAndConditions: {
              type: "string",
              nullable: true,
              description: "Default terms & conditions for quotations in this branch"
            },
            enableLineItemTax: {
              type: "boolean",
              description: "When true, tax is calculated per job line item (product/service)"
            },
            automaticCpairReceiving: {
              type: "boolean",
              description:
                "When true, completing a job auto-collects C-pair parts for quotation products with enableCPairReceive enabled (creates c-pair entries with pending receive status; admin receive is still required)"
            },
            useERPProducts: {
              type: "boolean",
              description:
                "When true, jobs may optionally reference an ERP catalog product via erpProductId on the job body"
            },
            lastUpdatedAt: { type: "string", format: "date-time", nullable: true }
          }
        },
        JobQuotationSettingsInput: {
          type: "object",
          properties: {
            defaultNotes: {
              type: "string",
              nullable: true,
              description: "Branch default quotation notes"
            },
            defaultTermsAndConditions: {
              type: "string",
              nullable: true,
              description: "Branch default terms & conditions. Aliases: termsAndConditions, terms"
            },
            enableLineItemTax: {
              type: "boolean",
              description: "Enable tax on each job quotation line item. Alias: enablelineitemtax"
            },
            automaticCpairReceiving: {
              type: "boolean",
              description:
                "Enable automatic C-pair collection on job completion (parts are collected/pending; admin receive via POST /api/jobs/cpair/summaries/{summaryId}/receive). Alias: automaticcpairreceiving"
            },
            useERPProducts: {
              type: "boolean",
              description:
                "Enable optional ERP product selection on job quotation lines. Alias: useerpproducts"
            }
          },
          description: "At least one field is required on save"
        },
        ErpProductDropdownItem: {
          type: "object",
          properties: {
            id: { type: "integer", description: "erpproducts.erpproductid" },
            value: { type: "integer", description: "Same as id (dropdown compatibility)" },
            name: { type: "string", nullable: true },
            label: { type: "string", nullable: true },
            brandId: { type: "integer", nullable: true },
            groupid: { type: "integer", nullable: true, description: "Job group id" },
            groupId: { type: "integer", nullable: true, description: "Same as groupid" },
            groupname: { type: "string", nullable: true, description: "Job group name" },
            groupName: { type: "string", nullable: true, description: "Same as groupname" },
            jobGroupName: { type: "string", nullable: true, description: "Job group display name" },
            serviceid: { type: "integer", nullable: true, description: "Job category id" },
            categoryId: { type: "integer", nullable: true, description: "Same as serviceid" },
            categoryname: { type: "string", nullable: true, description: "Job category name" },
            categoryName: { type: "string", nullable: true, description: "Same as categoryname" },
            jobCategoryName: { type: "string", nullable: true, description: "Job category display name" },
            sku: { type: "string", nullable: true, description: "SKU (stored as barcode)" },
            barcode: { type: "string", nullable: true },
            oldErpCode: { type: "string", nullable: true, description: "Legacy ERP code (erpcode)" },
            saleRate: { type: "number", nullable: true },
            purchaseRate: { type: "number", nullable: true }
          }
        },
        JobCashSettings: {
          type: "object",
          properties: {
            tenantid: { type: "integer", nullable: true },
            branchid: { type: "integer", nullable: true },
            allowReceiveCollection: {
              type: "boolean",
              description: "When true, assigned technicians can record cash received after job completion or resolution"
            },
            allowAddExpenses: {
              type: "boolean",
              description: "When true, assigned technicians can add job expenses after completion or resolution"
            },
            lastUpdatedAt: { type: "string", format: "date-time", nullable: true }
          }
        },
        JobCashSettingsInput: {
          type: "object",
          properties: {
            allowReceiveCollection: { type: "boolean" },
            allowAddExpenses: { type: "boolean" }
          },
          description: "At least one toggle is required on save"
        },
        JobCashCollection: {
          type: "object",
          nullable: true,
          properties: {
            id: { type: "integer" },
            jobId: { type: "integer" },
            amount: { type: "number" },
            remarks: { type: "string", nullable: true },
            collectedBy: { type: "integer" },
            collectedAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time", nullable: true },
            lastUpdatedAt: { type: "string", format: "date-time", nullable: true }
          }
        },
        JobCashCollectionInput: {
          type: "object",
          required: ["amount"],
          properties: {
            amount: { type: "number", minimum: 0, description: "Cash received from customer" },
            remarks: { type: "string", nullable: true }
          }
        },
        JobCashCollectionResponse: {
          type: "object",
          properties: {
            settings: { $ref: "#/components/schemas/JobCashSettings" },
            collection: { $ref: "#/components/schemas/JobCashCollection" }
          }
        },
        JobExpenseLine: {
          type: "object",
          properties: {
            id: { type: "integer" },
            jobId: { type: "integer" },
            description: { type: "string" },
            price: { type: "number", description: "Same value as amount" },
            amount: { type: "number" },
            createdAt: { type: "string", format: "date-time", nullable: true },
            lastUpdatedAt: { type: "string", format: "date-time", nullable: true }
          }
        },
        JobExpenseInput: {
          type: "object",
          required: ["description", "price"],
          properties: {
            description: { type: "string", example: "Petrol" },
            price: { type: "number", minimum: 0, example: 100 },
            amount: { type: "number", minimum: 0, description: "Alias for price" }
          }
        },
        JobExpenseCreateInput: {
          oneOf: [
            { $ref: "#/components/schemas/JobExpenseInput" },
            {
              type: "object",
              required: ["expenses"],
              properties: {
                expenses: {
                  type: "array",
                  minItems: 1,
                  items: { $ref: "#/components/schemas/JobExpenseInput" }
                },
                items: {
                  type: "array",
                  minItems: 1,
                  items: { $ref: "#/components/schemas/JobExpenseInput" },
                  description: "Alias for expenses"
                }
              }
            }
          ],
          description:
            "Single expense line or `{ expenses: [{ description, price }, ...] }` to append multiple lines"
        },
        JobExpenseUpdateInput: {
          type: "object",
          properties: {
            description: { type: "string" },
            price: { type: "number", minimum: 0 },
            amount: { type: "number", minimum: 0, description: "Alias for price" }
          },
          description: "At least one field is required"
        },
        JobExpensesSyncInput: {
          type: "object",
          required: ["expenses"],
          properties: {
            expenses: {
              type: "array",
              items: { $ref: "#/components/schemas/JobExpenseInput" }
            }
          }
        },
        JobExpensesResponse: {
          type: "object",
          properties: {
            settings: { $ref: "#/components/schemas/JobCashSettings" },
            items: { type: "array", items: { $ref: "#/components/schemas/JobExpenseLine" } },
            totalAmount: { type: "number" },
            count: { type: "integer" }
          }
        },
        JobCashCollectionListRow: {
          type: "object",
          properties: {
            collectionId: { type: "integer" },
            jobId: { type: "integer" },
            date: { type: "string", format: "date-time", description: "Collection date (collectedAt)" },
            collectedAt: { type: "string", format: "date-time" },
            jobDate: { type: "string", format: "date-time", nullable: true },
            jobNo: { type: "string", nullable: true },
            manualJobNo: { type: "string", nullable: true },
            technicianId: { type: "integer", nullable: true },
            technicianName: { type: "string", nullable: true },
            collectedBy: { type: "integer" },
            assignedBy: { type: "integer", nullable: true },
            assignedByName: { type: "string", nullable: true },
            collectionAmount: { type: "number" },
            amount: { type: "number", description: "Same as collectionAmount" },
            customerId: { type: "integer", nullable: true },
            customerName: { type: "string", nullable: true },
            customerAddress: { type: "string", nullable: true },
            jobFault: { type: "string", nullable: true },
            jobCategory: { type: "string", nullable: true },
            jobServiceId: { type: "integer", nullable: true },
            jobServiceName: { type: "string", nullable: true },
            remarks: { type: "string", nullable: true }
          }
        },
        JobPendingExpenseListRow: {
          type: "object",
          properties: {
            jobId: { type: "integer" },
            jobDate: { type: "string", format: "date", nullable: true },
            jobNo: { type: "string", nullable: true },
            manualJobNo: { type: "string", nullable: true },
            technicianId: { type: "integer", nullable: true },
            technicianName: { type: "string", nullable: true },
            assignedBy: { type: "integer", nullable: true },
            assignedByName: { type: "string", nullable: true },
            totalCost: { type: "number" },
            expenseStatus: { type: "string", enum: ["pending"] },
            jobExpenses: { type: "object", nullable: true },
            expenseCount: { type: "integer" },
            totalExpenseAmount: { type: "number" },
            customerId: { type: "integer", nullable: true },
            customerName: { type: "string", nullable: true },
            customerAddress: { type: "string", nullable: true },
            jobFault: { type: "string", nullable: true },
            jobCategory: { type: "string", nullable: true },
            jobServiceId: { type: "integer", nullable: true },
            jobServiceName: { type: "string", nullable: true },
            isCompleted: { type: "boolean" },
            isResolved: { type: "boolean" }
          }
        },
        JobPendingExpensesListResponse: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["all", "my"] },
            expensesEnabled: { type: "boolean" },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/JobPendingExpenseListRow" }
            },
            summary: {
              type: "object",
              properties: {
                totalPendingJobs: { type: "integer" },
                totalRecords: { type: "integer" }
              }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            },
            filters: { type: "array", items: { type: "object" } },
            sortableColumns: { type: "array", items: { type: "string" } }
          }
        },
        JobPendingCashCollectionListRow: {
          type: "object",
          properties: {
            jobId: { type: "integer" },
            jobDate: { type: "string", format: "date", nullable: true },
            jobNo: { type: "string", nullable: true },
            manualJobNo: { type: "string", nullable: true },
            technicianId: { type: "integer", nullable: true },
            technicianName: { type: "string", nullable: true },
            assignedBy: { type: "integer", nullable: true },
            assignedByName: { type: "string", nullable: true },
            totalCost: { type: "number" },
            amountToCollect: { type: "number", description: "Expected cash to collect (job total cost)" },
            cashToCollect: { type: "number", description: "Alias for amountToCollect" },
            collectionStatus: { type: "string", enum: ["pending"] },
            cashCollection: { type: "object", nullable: true },
            customerId: { type: "integer", nullable: true },
            customerName: { type: "string", nullable: true },
            customerAddress: { type: "string", nullable: true },
            jobFault: { type: "string", nullable: true },
            jobCategory: { type: "string", nullable: true },
            jobServiceId: { type: "integer", nullable: true },
            jobServiceName: { type: "string", nullable: true },
            isCompleted: { type: "boolean" },
            isResolved: { type: "boolean" }
          }
        },
        JobPendingCashCollectionsListResponse: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["all", "my"] },
            cashCollectionEnabled: { type: "boolean" },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/JobPendingCashCollectionListRow" }
            },
            summary: {
              type: "object",
              properties: {
                totalPendingJobs: { type: "integer" },
                totalAmountToCollect: { type: "number" },
                totalRecords: { type: "integer" }
              }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            },
            filters: { type: "array", items: { type: "object" } },
            sortableColumns: { type: "array", items: { type: "string" } }
          }
        },
        JobCashCollectionsListResponse: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["all", "my"] },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/JobCashCollectionListRow" }
            },
            summary: {
              type: "object",
              properties: {
                totalCollectionAmount: { type: "number" },
                totalRecords: { type: "integer" }
              }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            },
            filters: { type: "array", items: { type: "object" } },
            sortableColumns: { type: "array", items: { type: "string" } }
          }
        },
        JobCpairSummariesListResponse: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["all", "my"] },
            data: { type: "array", items: { type: "object" } },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            },
            filters: { type: "array", items: { type: "object" } },
            sortableColumns: { type: "array", items: { type: "string" } }
          }
        },
        JobCpairOverviewListResponse: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["all", "my"] },
            data: { type: "array", items: { type: "object" } },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            },
            filters: { type: "array", items: { type: "object" } },
            sortableColumns: { type: "array", items: { type: "string" } }
          }
        },
        JobCpairReceiveLog: {
          type: "object",
          properties: {
            id: { type: "integer" },
            partId: { type: "integer" },
            summaryId: { type: "integer" },
            qtyReceived: { type: "integer" },
            wastageQty: { type: "integer", description: "Wastage qty received from technician on this event" },
            receivedBy: { type: "integer" },
            receivedByName: { type: "string", nullable: true },
            handedOverBy: { type: "integer", nullable: true },
            handedOverByName: { type: "string", nullable: true },
            receivedDate: { type: "string", format: "date-time", nullable: true },
            remarks: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time", nullable: true }
          }
        },
        JobCpairIssueLog: {
          type: "object",
          properties: {
            id: { type: "integer" },
            partId: { type: "integer" },
            summaryId: { type: "integer" },
            issueQty: { type: "integer" },
            issuedBy: { type: "integer" },
            issuedByName: { type: "string", nullable: true },
            storeName: { type: "string", nullable: true },
            issueDate: { type: "string", format: "date-time", nullable: true },
            remarks: { type: "string", nullable: true },
            createdAt: { type: "string", format: "date-time", nullable: true }
          }
        },
        JobCpairReceiveLineInput: {
          type: "object",
          required: ["partId", "qtyReceived"],
          properties: {
            partId: { type: "integer", description: "jobcpairparts.recno" },
            qtyReceived: { type: "integer", minimum: 1, description: "C-pair qty received" },
            wastageQty: {
              type: "integer",
              minimum: 0,
              default: 0,
              description: "Wastage qty received (cannot exceed declared wastage on the part line)"
            },
            handedOverBy: { type: "integer", description: "Technician user id" },
            receivedDate: { type: "string", format: "date-time" },
            remarks: { type: "string", nullable: true }
          }
        },
        JobCpairReceiveInput: {
          oneOf: [
            { $ref: "#/components/schemas/JobCpairReceiveLineInput" },
            {
              type: "object",
              required: ["parts"],
              properties: {
                parts: {
                  type: "array",
                  minItems: 1,
                  items: { $ref: "#/components/schemas/JobCpairReceiveLineInput" }
                },
                handedOverBy: { type: "integer", description: "Default for all lines" },
                receivedDate: { type: "string", format: "date-time", description: "Default for all lines" }
              }
            }
          ]
        },
        JobCpairIssueLineInput: {
          type: "object",
          required: ["partId", "issueQty"],
          properties: {
            partId: { type: "integer" },
            issueQty: { type: "integer", minimum: 1 },
            storeName: { type: "string", nullable: true },
            issueDate: { type: "string", format: "date-time" },
            remarks: { type: "string", nullable: true }
          }
        },
        JobCpairIssueInput: {
          oneOf: [
            { $ref: "#/components/schemas/JobCpairIssueLineInput" },
            {
              type: "object",
              required: ["parts"],
              properties: {
                parts: {
                  type: "array",
                  minItems: 1,
                  items: { $ref: "#/components/schemas/JobCpairIssueLineInput" }
                },
                storeName: { type: "string", description: "Default store name for all lines" },
                issueDate: { type: "string", format: "date-time", description: "Default for all lines" }
              }
            }
          ]
        },
        JobFormResponse: {
          allOf: [
            { $ref: "#/components/schemas/JobSaveRequest" },
            {
              type: "object",
              properties: {
                recno: { type: "integer", description: "Job primary key" },
                assignedToId: { type: "integer", nullable: true },
                assignedToName: { type: "string", nullable: true, description: "Assigned technician display name" },
                assignedToAffiliation: { $ref: "#/components/schemas/TechnicianAffiliation", nullable: true },
                assignedToCompanyName: {
                  type: "string",
                  nullable: true,
                  description: "Third-party company when assigned technician is external"
                },
                followUpById: {
                  type: "integer",
                  nullable: true,
                  description: "User responsible for job follow-up"
                },
                followUpByName: {
                  type: "string",
                  nullable: true,
                  description: "Follow-up user display name"
                },
                deliveryTypeId: { type: "integer", nullable: true },
                deliveryTypeName: { type: "string", nullable: true, description: "Delivery type label from deliverytypes" },
                approval: { type: "object", description: "Job approval workflow summary" }
              },
              required: ["recno"]
            }
          ]
        },
        JobUpdateRequest: {
          $ref: "#/components/schemas/JobSaveRequest"
        },
        JobAttachmentCreateRequest: {
          type: "object",
          properties: {
            attachmentname: { type: "string" },
            url: { type: "string" },
            remarks: { type: "string" }
          }
        },
        JobAttachmentUpdateRequest: {
          type: "object",
          properties: {
            attachmentname: { type: "string" },
            url: { type: "string" },
            remarks: { type: "string" }
          }
        },
        TokenResponse: {
          type: "object",
          properties: {
            token: { type: "string" },
            tokenType: { type: "string", example: "Bearer" },
            expiresIn: { type: "string", example: "1h" }
          }
        },
        FileUploadResponse: {
          type: "object",
          properties: {
            url: {
              type: "string",
              example: "/uploads/general/1/2/1739123456789_document.pdf",
              description: "Path to use with the same origin as the API (static files)"
            },
            absoluteUrl: {
              type: "string",
              description: "Present when APP_URL is configured"
            },
            filename: { type: "string" },
            originalName: { type: "string" },
            size: { type: "integer" },
            mimetype: { type: "string" }
          }
        },
        ProductBulkColumnSpec: {
          type: "object",
          properties: {
            key: { type: "string", example: "name" },
            label: { type: "string", example: "Name" },
            type: { type: "string", example: "string" },
            required: { type: "boolean" },
            hint: { type: "string", nullable: true }
          }
        },
        ProductBulkUploadSession: {
          type: "object",
          properties: {
            uploadId: { type: "string", format: "uuid" },
            fileType: { type: "string", enum: ["excel", "pdf", "unknown"] },
            originalName: { type: "string" },
            rowCount: { type: "integer" },
            parseable: { type: "boolean" },
            message: { type: "string", nullable: true },
            requiredColumns: {
              type: "array",
              items: { $ref: "#/components/schemas/ProductBulkColumnSpec" }
            },
            availableColumns: { type: "array", items: { type: "string" } },
            targetColumns: {
              type: "array",
              items: { $ref: "#/components/schemas/ProductBulkColumnSpec" }
            },
            suggestedMapping: {
              type: "object",
              additionalProperties: { type: "string" }
            },
            dateFormatOptions: {
              type: "array",
              items: { type: "string" },
              example: ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY"]
            },
            expiresAt: { type: "string", format: "date-time" }
          }
        },
        ProductBulkPreviewRequest: {
          type: "object",
          required: ["uploadId", "columnMapping"],
          properties: {
            uploadId: { type: "string", format: "uuid" },
            columnMapping: {
              type: "object",
              additionalProperties: { type: "string" },
              example: { name: "Product Name", barcode: "Barcode", unit: "Unit" }
            },
            dateFormat: { type: "string", nullable: true, example: "DD/MM/YYYY" }
          }
        },
        ProductBulkRowProblem: {
          type: "object",
          properties: {
            row: { type: "integer" },
            issues: { type: "array", items: { type: "string" } }
          }
        },
        ProductBulkPreviewResponse: {
          type: "object",
          properties: {
            uploadId: { type: "string", format: "uuid" },
            columnMapping: { type: "object", additionalProperties: { type: "string" } },
            dateFormat: { type: "string", nullable: true },
            hasDateColumn: { type: "boolean" },
            totalRows: { type: "integer" },
            readyCount: { type: "integer" },
            problemCount: { type: "integer" },
            problems: {
              type: "array",
              items: { $ref: "#/components/schemas/ProductBulkRowProblem" }
            },
            readySample: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  row: { type: "integer" },
                  data: { type: "object" }
                }
              }
            }
          }
        },
        ProductBulkConfirmRequest: {
          type: "object",
          required: ["uploadId", "columnMapping"],
          properties: {
            uploadId: { type: "string", format: "uuid" },
            columnMapping: { type: "object", additionalProperties: { type: "string" } },
            dateFormat: { type: "string", nullable: true }
          }
        },
        ProductBulkConfirmResponse: {
          type: "object",
          properties: {
            uploadId: { type: "string", format: "uuid" },
            importedCount: { type: "integer" },
            skippedCount: { type: "integer" },
            validationProblemCount: { type: "integer" },
            insertErrorCount: { type: "integer" },
            imported: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  row: { type: "integer" },
                  productid: { type: "integer" },
                  name: { type: "string" }
                }
              }
            },
            validationProblems: {
              type: "array",
              items: { $ref: "#/components/schemas/ProductBulkRowProblem" }
            },
            insertErrors: {
              type: "array",
              items: { $ref: "#/components/schemas/ProductBulkRowProblem" }
            }
          }
        },
        JobLocationBody: {
          type: "object",
          description:
            "Optional GPS and notes for travel start/stop and job start/complete. Same shape for all job action endpoints.",
          properties: {
            latitude: { type: "number", description: "WGS84 latitude" },
            longitude: { type: "number", description: "WGS84 longitude" },
            address: { type: "string", description: "Optional human-readable location" },
            remarks: { type: "string", description: "Optional note for this action" }
          }
        },
        JobAttachmentInput: {
          type: "object",
          required: ["url"],
          properties: {
            url: {
              type: "string",
              description: "Public path e.g. from POST /api/upload or job action multipart upload"
            },
            attachmentname: { type: "string" },
            remarks: { type: "string" }
          }
        },
        JobActionWithAttachmentsBody: {
          allOf: [
            { $ref: "#/components/schemas/JobLocationBody" },
            {
              type: "object",
              properties: {
                attachments: {
                  type: "array",
                  items: { $ref: "#/components/schemas/JobAttachmentInput" },
                  description: "Optional files to link to the job with this action"
                }
              }
            }
          ]
        },
        JobActionMultipartBody: {
          type: "object",
          description: "Use with Content-Type multipart/form-data on start-job / resolve-job",
          properties: {
            latitude: { type: "number" },
            longitude: { type: "number" },
            address: { type: "string" },
            remarks: { type: "string" },
            attachments: {
              type: "string",
              description: "Optional JSON string array of JobAttachmentInput (URLs from prior upload)"
            },
            files: {
              type: "array",
              items: { type: "string", format: "binary" },
              description: "One or more files (max 20)"
            },
            file: { type: "string", format: "binary", description: "Single file alternative to files" }
          }
        },
        JobCompleteMultipartBody: {
          allOf: [
            { $ref: "#/components/schemas/JobActionMultipartBody" },
            {
              type: "object",
              properties: {
                customerFeedback: {
                  type: "string",
                  description: "JSON string: { rating, comments }"
                }
              }
            }
          ]
        },
        JobCustomerFeedbackInput: {
          type: "object",
          required: ["rating"],
          properties: {
            rating: {
              type: "integer",
              minimum: 0,
              maximum: 5,
              description: "Customer satisfaction score (0-5)"
            },
            comments: { type: "string", description: "Optional customer comments" }
          }
        },
        JobCustomerFeedbackBody: {
          type: "object",
          required: ["customerFeedback"],
          properties: {
            customerFeedback: { $ref: "#/components/schemas/JobCustomerFeedbackInput" },
            rating: {
              type: "integer",
              minimum: 0,
              maximum: 5,
              description: "Alternate top-level rating (same as customerFeedback.rating)"
            },
            comments: { type: "string", description: "Alternate top-level comments" }
          }
        },
        JobCompleteBody: {
          allOf: [
            { $ref: "#/components/schemas/JobActionWithAttachmentsBody" },
            {
              type: "object",
              properties: {
                customerFeedback: { $ref: "#/components/schemas/JobCustomerFeedbackInput" }
              }
            }
          ]
        },
        JobCustomerFeedback: {
          type: "object",
          properties: {
            recno: { type: "integer" },
            jobid: { type: "integer" },
            rating: { type: "integer", minimum: 0, maximum: 5 },
            comments: { type: "string", nullable: true },
            recordedby: { type: "integer", description: "User who entered the feedback" },
            recordedByName: { type: "string", nullable: true },
            recordedByEmail: { type: "string", nullable: true },
            recordedat: { type: "string", format: "date-time", nullable: true }
          }
        },
        DeviceTokenInput: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", description: "FCM device registration token" },
            fcmToken: { type: "string", description: "Alias for token" },
            platform: { type: "string", enum: ["android", "ios", "web"], description: "Optional client platform" }
          }
        },
        PushTestInput: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", description: "FCM token to send test message to" },
            title: { type: "string", default: "Test notification" },
            body: { type: "string", default: "Firebase push is working." }
          }
        },
        UserNotificationItem: {
          type: "object",
          properties: {
            id: { type: "string", description: "Firestore document id" },
            userid: { type: "integer" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            title: { type: "string" },
            body: { type: "string" },
            type: { type: "string", nullable: true },
            event: { type: "string", nullable: true },
            data: { type: "object", additionalProperties: { type: "string" } },
            read: { type: "boolean" },
            createdAt: { type: "string", format: "date-time", nullable: true },
            readAt: { type: "string", format: "date-time", nullable: true }
          }
        },
        UserNotificationListResponse: {
          type: "object",
          properties: {
            userid: { type: "integer" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            unreadCount: { type: "integer", nullable: true },
            filters: {
              type: "object",
              properties: {
                unreadOnly: { type: "boolean" },
                type: { type: "string", nullable: true },
                pageSize: { type: "integer" }
              }
            },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/UserNotificationItem" }
            },
            pagination: {
              type: "object",
              properties: {
                pageSize: { type: "integer" },
                hasMore: { type: "boolean" },
                nextCursor: { type: "string", nullable: true }
              }
            }
          }
        },
        MarkAllNotificationsReadResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "All notifications marked as read" },
            updated: { type: "integer", description: "Number of notifications updated" },
            unreadCount: { type: "integer", example: 0 }
          }
        },
        AnnouncementAudience: {
          type: "string",
          enum: ["all", "technician", "manager", "admin"],
          default: "technician"
        },
        AnnouncementInput: {
          type: "object",
          required: ["title", "message"],
          properties: {
            title: { type: "string" },
            message: { type: "string", description: "Announcement body text" },
            audience: { $ref: "#/components/schemas/AnnouncementAudience" },
            branchid: {
              type: "integer",
              nullable: true,
              description: "Target branch; omit or null for all branches in tenant"
            },
            isactive: { type: "boolean", default: true },
            priority: {
              type: "integer",
              default: 0,
              description: "Higher appears first in lists"
            },
            publishat: { type: "string", format: "date-time", description: "Visible from (default: now)" },
            expireat: { type: "string", format: "date-time", nullable: true }
          }
        },
        Announcement: {
          type: "object",
          properties: {
            recno: { type: "integer" },
            tenantid: { type: "integer" },
            branchid: { type: "integer", nullable: true },
            branchName: { type: "string", nullable: true },
            title: { type: "string" },
            message: { type: "string" },
            audience: { $ref: "#/components/schemas/AnnouncementAudience" },
            isactive: { type: "boolean" },
            priority: { type: "integer" },
            publishat: { type: "string", format: "date-time", nullable: true },
            expireat: { type: "string", format: "date-time", nullable: true },
            createdByName: { type: "string", nullable: true },
            createdat: { type: "string", format: "date-time", nullable: true }
          }
        },
        AttendanceLocationBody: {
          type: "object",
          required: ["latitude", "longitude", "address"],
          properties: {
            latitude: { type: "number", minimum: -90, maximum: 90 },
            longitude: { type: "number", minimum: -180, maximum: 180 },
            address: { type: "string", description: "Human-readable location (required)" },
            remarks: { type: "string", description: "Optional note for this action" },
            method: {
              type: "string",
              enum: ["standard", "face"],
              description: "Use face after face attendance is approved for the user"
            }
          }
        },
        FaceApprovalBranchSettings: {
          type: "object",
          properties: {
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            isEnabled: { type: "boolean" }
          }
        },
        FaceApprovalUserSettings: {
          type: "object",
          properties: {
            userid: { type: "integer" },
            name: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            usertype: { type: "string", nullable: true },
            profileImage: { type: "string", nullable: true },
            allowFaceApprovalRequest: { type: "boolean" },
            faceAttendanceEnabled: { type: "boolean" }
          }
        },
        FaceApprovalRequestItem: {
          type: "object",
          properties: {
            requestId: { type: "integer" },
            userid: { type: "integer" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            status: { type: "string", enum: ["pending", "approved", "rejected"] },
            requestImage: { type: "string", description: "Submitted face image URL for approval" },
            profileImage: { type: "string", nullable: true, description: "User profile image at review time" },
            profileImageSnapshot: { type: "string", nullable: true },
            remarks: { type: "string", nullable: true },
            reviewRemarks: { type: "string", nullable: true },
            submittedAt: { type: "string", format: "date-time" },
            reviewedAt: { type: "string", format: "date-time", nullable: true },
            reviewedBy: {
              type: "object",
              nullable: true,
              properties: {
                userid: { type: "integer" },
                name: { type: "string", nullable: true },
                email: { type: "string", nullable: true }
              }
            },
            user: { $ref: "#/components/schemas/FaceApprovalUserSettings" }
          }
        },
        FaceApprovalRequestListResponse: {
          type: "object",
          properties: {
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            filters: {
              type: "object",
              properties: {
                status: { type: "string", nullable: true },
                userid: { type: "integer", nullable: true }
              }
            },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/FaceApprovalRequestItem" }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            }
          }
        },
        FaceApprovalMyStatusResponse: {
          type: "object",
          properties: {
            branchSettings: { $ref: "#/components/schemas/FaceApprovalBranchSettings" },
            user: { $ref: "#/components/schemas/FaceApprovalUserSettings" },
            canSubmitRequest: { type: "boolean" },
            pendingRequest: { $ref: "#/components/schemas/FaceApprovalRequestItem", nullable: true },
            latestRequest: { $ref: "#/components/schemas/FaceApprovalRequestItem", nullable: true }
          }
        },
        FaceApprovalSubmitBody: {
          type: "object",
          required: ["requestImage"],
          properties: {
            requestImage: { type: "string", description: "Face image URL from external recognition module" },
            remarks: { type: "string" }
          }
        },
        FaceApprovalSubmitResponse: {
          type: "object",
          properties: {
            message: { type: "string" },
            request: { $ref: "#/components/schemas/FaceApprovalRequestItem" }
          }
        },
        FaceApprovalActionResponse: {
          type: "object",
          properties: {
            message: { type: "string" },
            request: { $ref: "#/components/schemas/FaceApprovalRequestItem" }
          }
        },
        MyAttendanceSessionItem: {
          type: "object",
          properties: {
            sessionId: { type: "integer" },
            userid: { type: "integer" },
            status: { type: "string", enum: ["checked_in", "on_break", "checked_out"] },
            presence: { type: "string", enum: ["active", "idle", "out"] },
            isopen: { type: "boolean" },
            checkinat: { type: "string", format: "date-time" },
            checkoutat: { type: "string", format: "date-time", nullable: true },
            lastactionat: { type: "string", format: "date-time" },
            durationMinutes: { type: "integer", nullable: true },
            lastLocation: { $ref: "#/components/schemas/UserLastLocation" }
          }
        },
        MyAttendanceHistoryResponse: {
          type: "object",
          properties: {
            userid: { type: "integer" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            filters: {
              type: "object",
              properties: {
                date: { type: "string", nullable: true },
                dateFrom: { type: "string", nullable: true },
                dateTo: { type: "string", nullable: true },
                status: { type: "string", nullable: true }
              }
            },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/MyAttendanceSessionItem" }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            }
          }
        },
        AttendanceBranchUserItem: {
          type: "object",
          properties: {
            userid: { type: "integer" },
            name: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            usertype: { $ref: "#/components/schemas/UserType", nullable: true },
            isactive: { type: "boolean" },
            presence: { type: "string", enum: ["active", "idle", "out"] },
            attendanceStatus: {
              type: "string",
              nullable: true,
              enum: ["checked_in", "on_break", "checked_out"]
            },
            session: { $ref: "#/components/schemas/MyAttendanceSessionItem", nullable: true },
            lastLocation: { $ref: "#/components/schemas/UserLastLocation", nullable: true }
          }
        },
        AttendanceBranchUsersResponse: {
          type: "object",
          properties: {
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            filters: {
              type: "object",
              properties: {
                userid: { type: "integer", nullable: true },
                name: { type: "string", nullable: true },
                email: { type: "string", nullable: true },
                search: { type: "string", nullable: true },
                usertype: { $ref: "#/components/schemas/UserType", nullable: true },
                isactive: { type: "boolean", nullable: true },
                presence: { type: "string", enum: ["active", "idle", "out"], nullable: true },
                attendanceStatus: {
                  type: "string",
                  enum: ["checked_in", "on_break", "checked_out", "none"],
                  nullable: true
                },
                sessionId: { type: "integer", nullable: true },
                hasLocation: { type: "boolean", nullable: true }
              }
            },
            summary: {
              type: "object",
              properties: {
                total: { type: "integer" },
                active: { type: "integer" },
                idle: { type: "integer" },
                out: { type: "integer" }
              }
            },
            users: {
              type: "array",
              items: { $ref: "#/components/schemas/AttendanceBranchUserItem" }
            }
          }
        },
        UserActivityLogItem: {
          type: "object",
          properties: {
            id: { type: "integer" },
            userId: { type: "integer", nullable: true },
            userName: { type: "string", nullable: true },
            userEmail: { type: "string", nullable: true },
            tenantId: { type: "integer" },
            branchId: { type: "integer" },
            module: { type: "string" },
            entityName: { type: "string", nullable: true },
            entityCode: { type: "string", nullable: true },
            jobId: { type: "integer", nullable: true },
            jobNo: { type: "string", nullable: true },
            entityId: { type: "integer", nullable: true },
            action: {
              type: "string",
              enum: [
                "create",
                "update",
                "delete",
                "assign",
                "unassign",
                "status_change",
                "login",
                "logout",
                "password_changed",
                "settings_updated",
                "invite",
                "activate",
                "deactivate",
                "block",
                "unblock",
                "approve",
                "reject",
                "complete",
                "resolve",
                "submit",
                "upload",
                "other"
              ]
            },
            nature: { type: "string", description: "Alias for action" },
            summary: { type: "string", nullable: true },
            metadata: { type: "object", nullable: true, additionalProperties: true },
            ipAddress: { type: "string", nullable: true },
            userAgent: { type: "string", nullable: true },
            recordedAt: { type: "string", format: "date-time" },
            time: { type: "string", format: "date-time", description: "Alias for recordedAt" }
          }
        },
        UserActivityLogListResponse: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["all", "my"], description: "all = branch-wide (admin/manager), my = own logs only" },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/UserActivityLogItem" }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" }
              }
            },
            filters: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string" },
                  type: { type: "string" },
                  operators: { type: "array", items: { type: "string" } },
                  description: { type: "string" }
                }
              }
            }
          }
        },
        UserLastLocation: {
          type: "object",
          properties: {
            latitude: { type: "number" },
            longitude: { type: "number" },
            address: { type: "string", nullable: true },
            recordedat: { type: "string", format: "date-time", nullable: true },
            jobid: { type: "integer", nullable: true }
          }
        },
        TrackingPingItem: {
          type: "object",
          required: ["latitude", "longitude"],
          properties: {
            jobid: {
              type: "integer",
              nullable: true,
              description:
                "Job the technician is travelling to. Omit or null for off-job location tracking."
            },
            latitude: { type: "number", minimum: -90, maximum: 90 },
            longitude: { type: "number", minimum: -180, maximum: 180 },
            address: { type: "string", description: "Optional reverse-geocoded or manual address" },
            accuracy: { type: "number", description: "Meters (GPS accuracy)" },
            altitude: { type: "number" },
            heading: { type: "number", description: "Degrees" },
            speed: { type: "number" },
            recordedAt: { type: "string", format: "date-time", description: "Device time; omit for server time" }
          }
        },
        TrackingPingBatchRequest: {
          oneOf: [
            {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: { $ref: "#/components/schemas/TrackingPingItem" }
            },
            {
              type: "object",
              required: ["pings"],
              properties: {
                pings: {
                  type: "array",
                  minItems: 1,
                  maxItems: 100,
                  items: { $ref: "#/components/schemas/TrackingPingItem" }
                }
              }
            }
          ]
        },
        TrackingPingBatchResponse: {
          type: "object",
          properties: {
            total: { type: "integer", description: "Number of pings in the request" },
            created: { type: "integer", description: "Number of rows saved" },
            data: {
              type: "array",
              items: { $ref: "#/components/schemas/TrackingLocation" }
            }
          }
        },
        TrackingUserSummary: {
          type: "object",
          properties: {
            userid: { type: "integer" },
            name: { type: "string", nullable: true },
            email: { type: "string", nullable: true }
          }
        },
        TrackingLocation: {
          type: "object",
          properties: {
            recno: { type: "integer" },
            userid: { type: "integer" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            jobid: { type: "integer", nullable: true },
            latitude: { type: "number" },
            longitude: { type: "number" },
            address: { type: "string", nullable: true },
            accuracy: { type: "number", nullable: true },
            altitude: { type: "number", nullable: true },
            heading: { type: "number", nullable: true },
            speed: { type: "number", nullable: true },
            recordedat: { type: "string", format: "date-time" },
            createdat: { type: "string", format: "date-time" },
            user: { $ref: "#/components/schemas/TrackingUserSummary", nullable: true },
            job: {
              type: "object",
              nullable: true,
              properties: {
                recno: { type: "integer" },
                code: { type: "string", nullable: true },
                manualjobno: { type: "string", nullable: true }
              }
            }
          }
        },
        TrackingLiveResponse: {
          type: "object",
          properties: {
            minutes: {
              type: "integer",
              nullable: true,
              description: "Rolling window minutes; null when date filters are used"
            },
            since: { type: "string", format: "date-time" },
            until: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", nullable: true },
            dateFrom: { type: "string", format: "date", nullable: true },
            dateTo: { type: "string", format: "date", nullable: true },
            jobid: { type: "integer", nullable: true, description: "Set when filtered by job" },
            locations: {
              type: "array",
              items: { $ref: "#/components/schemas/TrackingLocation" }
            }
          }
        },
        TrackingTechnicianSummaryItem: {
          type: "object",
          properties: {
            userid: { type: "integer" },
            name: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            pingCount: { type: "integer", description: "Pings matching filters for this technician" },
            lastLocation: {
              allOf: [{ $ref: "#/components/schemas/TrackingLocation" }],
              nullable: true
            }
          }
        },
        TrackingTechniciansSummaryResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            jobid: { type: "integer", nullable: true },
            filters: {
              type: "object",
              properties: {
                allTime: { type: "boolean" },
                minutes: { type: "integer", nullable: true },
                since: { type: "string", format: "date-time", nullable: true },
                until: { type: "string", format: "date-time", nullable: true },
                date: { type: "string", format: "date", nullable: true },
                dateFrom: { type: "string", format: "date", nullable: true },
                dateTo: { type: "string", format: "date", nullable: true }
              }
            },
            summary: {
              type: "object",
              properties: {
                totalTechnicians: { type: "integer" },
                withLocation: { type: "integer" },
                withoutLocation: { type: "integer" },
                totalPings: { type: "integer" }
              }
            },
            technicians: {
              type: "array",
              items: { $ref: "#/components/schemas/TrackingTechnicianSummaryItem" }
            }
          }
        },
        TrackingTechnicianDetailResponse: {
          type: "object",
          properties: {
            asOf: { type: "string", format: "date-time" },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            jobid: { type: "integer", nullable: true },
            filters: { type: "object" },
            technician: { $ref: "#/components/schemas/TrackingUserSummary" },
            summary: {
              type: "object",
              properties: {
                totalPings: { type: "integer" },
                firstRecordedAt: { type: "string", format: "date-time", nullable: true },
                lastRecordedAt: { type: "string", format: "date-time", nullable: true }
              }
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer" },
                pageSize: { type: "integer" },
                total: { type: "integer" },
                totalPages: { type: "integer" },
                returned: { type: "integer" }
              }
            },
            pings: {
              type: "array",
              items: { $ref: "#/components/schemas/TrackingLocation" }
            }
          }
        },
        ScreenRight: {
          type: "object",
          properties: {
            screenid: { type: "integer" },
            screenname: { type: "string", nullable: true },
            controllername: { type: "string", nullable: true },
            screengroup: { type: "string", nullable: true },
            view: { type: "boolean" },
            add: { type: "boolean" },
            update: { type: "boolean" },
            delete: { type: "boolean" },
            others: { type: "boolean" }
          }
        },
        ScreenRightsPayload: {
          type: "object",
          properties: {
            isAdmin: {
              type: "boolean",
              description: "True when the user holds the tenant default (admin) policy for this branch"
            },
            screenRights: {
              type: "array",
              items: { $ref: "#/components/schemas/ScreenRight" }
            }
          }
        },
        LoginResponse: {
          allOf: [
            { $ref: "#/components/schemas/ScreenRightsPayload" },
            {
          type: "object",
          properties: {
            token: { type: "string" },
            tokenType: { type: "string", example: "Bearer" },
            expiresIn: { type: "string", example: "7d" },
                user: {
                  type: "object",
                  properties: {
                    userid: { type: "integer" },
                    name: { type: "string" },
                    email: { type: "string" },
                    usertype: { $ref: "#/components/schemas/UserType", nullable: true },
                    country: { type: "integer", nullable: true },
                    city: { type: "integer", nullable: true },
                    countryName: { type: "string", nullable: true },
                    cityName: { type: "string", nullable: true }
                  }
                },
            tenantid: { type: "integer" },
            branchid: { type: "integer" },
            organizations: {
              type: "array",
              items: { type: "object" }
            }
          }
            }
          ]
        },
        SwitchContextResponse: {
          allOf: [
            { $ref: "#/components/schemas/ScreenRightsPayload" },
            {
              type: "object",
              properties: {
                token: { type: "string" },
                tokenType: { type: "string", example: "Bearer" },
                expiresIn: { type: "string", example: "7d" },
                tenantid: { type: "integer" },
                branchid: { type: "integer" },
                organizations: {
                  type: "array",
                  items: { type: "object" }
                }
              }
            }
          ]
        },
        ...buildResourceSchemas(),
        ...buildManualResourceSchemas()
      }
    }
  },
  apis: []
});
