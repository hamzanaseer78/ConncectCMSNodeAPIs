const swaggerJsdoc = require("swagger-jsdoc");
const resources = require("./resources");
const {
  getListFilterFields,
  getListScalarFields,
  getScalarFields,
  getWritableFields,
  toOpenApiType
} = require("../utils/prisma-metadata");

const publicResources = Object.fromEntries(
  Object.entries(resources).filter(([, config]) => !config.backendOnly)
);

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
      description: "Sort by any returned list column"
    },
    {
      in: "query",
      name: "sortOrder",
      schema: { type: "string", enum: ["asc", "desc"], default: "asc" },
      description: "Sort direction"
    }
  ];
}

function filterParameters(resourceName) {
  const config = publicResources[resourceName];
  const scalarParameters = getListFilterFields(resourceName, config).map((field) => ({
    in: "query",
    name: field.name,
    schema: toOpenApiType(field),
    description: `Filter ${field.name} by exact value`
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

  return [
    ...scalarParameters,
    ...relationParameters
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
    [`/api/${name}/{id}`, buildResourceItemPath(name, config)]
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
        url: "http://localhost:3000",
        description: "Development server"
      }
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
          responses: { 201: { description: "Organization, default branch and admin policy created" } }
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
          responses: { 200: { description: "JWT returned" } }
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
          responses: { 200: { description: "New JWT returned" } }
        }
      },
      "/api/auth/invite": {
        post: {
          summary: "Invite user to current organization",
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
          responses: { 201: { description: "User invited" } }
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
          responses: { 201: { description: "Organization, default branch and admin policy created" } }
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
        SwitchContextRequest: {
          type: "object",
          properties: {
            tenantid: { type: "integer" },
            branchid: { type: "integer" }
          },
          required: ["tenantid", "branchid"]
        },
        InviteUserRequest: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
            branchid: { type: "integer" },
            policyid: { type: "integer" }
          },
          required: ["email", "policyid"]
        },
        TokenResponse: {
          type: "object",
          properties: {
            token: { type: "string" },
            tokenType: { type: "string", example: "Bearer" },
            expiresIn: { type: "string", example: "1h" }
          }
        },
        ...buildResourceSchemas()
      }
    }
  },
  apis: []
});
