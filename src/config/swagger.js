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

const JOBS_TAG = "Jobs";
const ALL_JOBS_TAG = "All Jobs";
const MY_JOBS_TAG = "My Jobs";

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

function jobListQueryParameters() {
  return [
    { in: "query", name: "statusid", schema: { type: "integer" }, description: "Filter by job status id" },
    { in: "query", name: "priority", schema: { type: "string" }, description: "Filter by job priority" },
    { in: "query", name: "from", schema: { type: "string", format: "date-time" }, description: "Filter jobs from this date/time" },
    { in: "query", name: "to", schema: { type: "string", format: "date-time" }, description: "Filter jobs up to this date/time" }
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
    [`/api/${name}/{id}`, buildResourceItemPath(name, config)],
    [`/api/${name}/dropdown`, {
      get: {
        summary: `Dropdown options for ${name}`,
        tags: [config.tag || name],
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Dropdown options returned"
          }
        }
      }
    }],
    [`/api/${name}/details/{id}`, {
      get: {
        summary: `Get complete ${name} details with relations`,
        tags: [config.tag || name],
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        responses: {
          200: {
            description: "Detailed record returned",
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/${schemaName(name)}` }
              }
            }
          },
          404: { description: "Record not found" }
        }
      }
    }]
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
      { name: "Tracking", description: "Live user GPS pings (lat/lng) scoped to tenant and branch" },
      { name: JOBS_TAG, description: "Job creation, workflow actions, details and child records" },
      { name: ALL_JOBS_TAG, description: "All tenant/branch jobs, dashboards and reports" },
      { name: MY_JOBS_TAG, description: "Jobs assigned to the authenticated user, dashboards and reports" },
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
        }
      },
      "/api/auth/change-password": {
        post: {
          summary: "Change password (authenticated)",
          description:
            "Requires current password. Same rules as POST /api/user/change-password (min 6 chars for new password).",
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
              description: "New JWT, organizations list and screen rights for the selected context",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SwitchContextResponse" }
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
      "/api/tracking/ping": {
        post: {
          summary: "Record current user location (live ping)",
          description:
            "Stores one row per call for the JWT user in the current tenant/branch. Optional device time via recordedAt (ISO).",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrackingPingRequest" }
              }
            }
          },
          responses: {
            201: {
              description: "Location saved",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TrackingLocation" }
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
            "Most recent ping within `minutes` (default 30, max 1440) for each user assigned to the branch.",
          tags: ["Tracking"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "minutes",
              schema: { type: "integer", default: 30, minimum: 1, maximum: 1440 },
              description: "How far back to look for recent pings"
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
          responses: { 201: { description: "Organization, default branch and admin policy created" } }
        }
      },
      "/api/jobs": {
        post: {
          summary: "Create a job (separate from generic APIs)",
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
            201: { description: "Job created" }
          }
        }
      },
      "/api/jobs/{id}": {
        put: {
          summary: "Update a job (separate from generic APIs)",
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
            200: { description: "Job updated" }
          }
        }
      },
      "/api/jobs-all": {
        get: {
          summary: "Get all jobs in tenant/branch",
          tags: [ALL_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: jobListQueryParameters(),
          responses: {
            200: { description: "All jobs returned" }
          }
        }
      },
      "/api/jobs-my": {
        get: {
          summary: "Get only my assigned jobs",
          tags: [MY_JOBS_TAG],
          security: [{ bearerAuth: [] }],
          parameters: jobListQueryParameters(),
          responses: {
            200: { description: "My jobs returned" }
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
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Job details returned" }
          }
        }
      },
      "/api/jobs/{id}/quotation": {
        get: {
          summary: "Quotation page details API for a job",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: {
            200: { description: "Job quotation details returned" }
          }
        }
      },
      "/api/jobs/{id}/timeline": {
        get: {
          summary: "Job timeline events (created, assigned, travel, work, status)",
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
      "/api/jobs/{id}/actions/start-travel": {
        post: {
          summary: "Technician starts travel",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Travel started" } }
        }
      },
      "/api/jobs/{id}/actions/stop-travel": {
        post: {
          summary: "Technician stops travel",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Travel stopped" } }
        }
      },
      "/api/jobs/{id}/actions/start-job": {
        post: {
          summary: "Technician starts job work",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Job started" } }
        }
      },
      "/api/jobs/{id}/actions/complete-job": {
        post: {
          summary: "Technician marks job completed",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Job completed" } }
        }
      },
      "/api/jobs/{id}/actions/resolve-job": {
        post: {
          summary: "Mark job resolved",
          tags: ["Jobs"],
          security: [{ bearerAuth: [] }],
          parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
          responses: { 200: { description: "Job resolved" } }
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
      "/api/dropdowns/{resourceName}": {
        get: {
          summary: "Get dropdown for any resource",
          tags: ["Dropdowns"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "resourceName",
              required: true,
              schema: { type: "string" }
            }
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
          summary: "GraphQL playground (development only)",
          tags: ["GraphQL"],
          responses: {
            200: { description: "Playground UI returned" },
            404: { description: "Disabled in production" }
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
            newPassword: { type: "string", format: "password", minLength: 6 }
          },
          required: ["oldPassword", "newPassword"]
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
          description: "Saved as jobaddonproducts (complaint service/parts grid).",
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
          description: "Saved as jobproducts.",
          properties: {
            productid: { type: "integer" },
            modelno: { type: "string" },
            productModel: { type: "string", description: "Alias of modelno" },
            partno: { type: "string" },
            serialNumber: { type: "string", description: "Alias of partno" },
            salerefrenceno: { type: "string" },
            invoiceNumber: { type: "string", description: "Alias of salerefrenceno" },
            lineno: { type: "integer" },
            remarks: { type: "string" },
            partService: { type: "string" },
            name: { type: "string" }
          }
        },
        JobCreateRequest: {
          type: "object",
          description:
            "Create a complaint/job. Required: serviceid. Provide customerid OR customer (phone/contactno or name).",
          properties: {
            code: { type: "string" },
            date: { type: "string", format: "date-time" },
            assignedto: { type: "integer" },
            city: { type: "integer" },
            area: { type: "integer" },
            serviceid: { type: "integer" },
            faultid: { type: "integer" },
            customerid: { type: "integer" },
            customer: { $ref: "#/components/schemas/JobCreateCustomer" },
            isinwaranty: { type: "boolean", description: "Boolean or yes/no string" },
            statusid: { type: "integer" },
            priority: { type: "string" },
            deliverytype: { type: "integer" },
            manualjobno: { type: "string" },
            estimatedcompletedtime: {
              oneOf: [{ type: "integer" }, { type: "string" }],
              description: "Minutes; strings like \"60 Minutes\" use the first integer"
            },
            isacknowledged: { type: "boolean" },
            qualityassuerd: { type: "boolean" },
            description: { type: "string" },
            complaintDescription: { type: "string", description: "Alias of description on jobdetails" },
            notes: { type: "string" },
            complaintNotes: { type: "string", description: "Alias of notes on jobdetails" },
            detailRemarks: { type: "string", description: "Extra jobdetails.remarks text (before equipment JSON)" },
            jobdetailsRemarks: { type: "string" },
            address: { type: "string", description: "jobdetails.address (max 50 chars stored)" },
            customerAddress: { type: "string" },
            siteAddress: { type: "string" },
            latitude: { oneOf: [{ type: "string" }, { type: "number" }] },
            longitude: { oneOf: [{ type: "string" }, { type: "number" }] },
            lat: { type: "number", description: "Alias of latitude" },
            lng: { type: "number", description: "Alias of longitude" },
            brand: { type: "string", description: "Stored in jobdetails.remarks JSON equipment.*" },
            productModel: { type: "string" },
            serialNumber: { type: "string" },
            invoiceNumber: { type: "string" },
            purchaseDate: { type: "string" },
            parts: { type: "array", items: { $ref: "#/components/schemas/JobProductLineItem" } },
            productLines: { type: "array", items: { $ref: "#/components/schemas/JobProductLineItem" } },
            serviceLines: { type: "array", items: { $ref: "#/components/schemas/JobServiceLineItem" } },
            lineItems: { type: "array", items: { $ref: "#/components/schemas/JobServiceLineItem" } },
            addonLines: { type: "array", items: { $ref: "#/components/schemas/JobServiceLineItem" } }
          },
          required: ["serviceid"]
        },
        JobUpdateRequest: {
          type: "object",
          properties: {
            code: { type: "string" },
            date: { type: "string", format: "date-time" },
            assignedto: { type: "integer" },
            city: { type: "integer" },
            area: { type: "integer" },
            serviceid: { type: "integer" },
            faultid: { type: "integer" },
            customerid: { type: "integer" },
            isinwaranty: { type: "boolean" },
            statusid: { type: "integer" },
            priority: { type: "string" },
            deliverytype: { type: "integer" },
            manualjobno: { type: "string" },
            estimatedcompletedtime: { oneOf: [{ type: "integer" }, { type: "string" }] },
            isacknowledged: { type: "boolean" },
            qualityassuerd: { type: "boolean" }
          }
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
        TrackingPingRequest: {
          type: "object",
          required: ["latitude", "longitude"],
          properties: {
            latitude: { type: "number", minimum: -90, maximum: 90 },
            longitude: { type: "number", minimum: -180, maximum: 180 },
            accuracy: { type: "number", description: "Meters (GPS accuracy)" },
            altitude: { type: "number" },
            heading: { type: "number", description: "Degrees" },
            speed: { type: "number" },
            recordedAt: { type: "string", format: "date-time", description: "Device time; omit for server time" }
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
            latitude: { type: "number" },
            longitude: { type: "number" },
            accuracy: { type: "number", nullable: true },
            altitude: { type: "number", nullable: true },
            heading: { type: "number", nullable: true },
            speed: { type: "number", nullable: true },
            recordedat: { type: "string", format: "date-time" },
            createdat: { type: "string", format: "date-time" },
            user: { $ref: "#/components/schemas/TrackingUserSummary", nullable: true }
          }
        },
        TrackingLiveResponse: {
          type: "object",
          properties: {
            minutes: { type: "integer" },
            since: { type: "string", format: "date-time" },
            locations: {
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
                user: { type: "object" },
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
        ...buildResourceSchemas()
      }
    }
  },
  apis: []
});
