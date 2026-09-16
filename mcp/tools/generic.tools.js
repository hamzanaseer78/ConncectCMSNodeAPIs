const { z } = require("zod");
const resources = require("../../src/config/resources");
const { container } = require("../auth-context");
const { assertResourceRight } = require("../../src/middlewares/authorization.middleware");
const { textResult, errorResult } = require("../format-result");
const { withAuth } = require("../helpers/with-auth");
const { paginationSchema, sortSchema } = require("../helpers/schemas");

function registerGenericTools(server) {
  server.registerTool(
    "cms_list_resource",
    {
      description:
        "Paginated list for a generic resource (same as GET /api/:resource). Requires view permission.",
      inputSchema: {
        resource: z.string().min(1),
        search: z.string().optional(),
        ...paginationSchema,
        ...sortSchema
      }
    },
    withAuth(async (auth, { resource, ...query }) => {
      if (!resources[resource]) {
        return errorResult(new Error(`Unknown resource: ${resource}`));
      }
      await assertResourceRight(auth, resource, "view");
      const service = container.getGenericService(resource);
      const data = await service.list(auth, query);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_get_resource",
    {
      description:
        "Get one record by id (same as GET /api/:resource/:id). Requires view permission.",
      inputSchema: {
        resource: z.string().min(1),
        id: z.union([z.string(), z.number()])
      }
    },
    withAuth(async (auth, { resource, id }) => {
      if (!resources[resource]) {
        return errorResult(new Error(`Unknown resource: ${resource}`));
      }
      await assertResourceRight(auth, resource, "view");
      const service = container.getGenericService(resource);
      const data = await service.get(id, auth);
      return textResult(data);
    })
  );

  server.registerTool(
    "cms_create_resource",
    {
      description:
        "Create a generic resource record (same as POST /api/:resource). Requires add permission.",
      inputSchema: {
        resource: z.string().min(1),
        data: z.record(z.unknown())
      }
    },
    withAuth(async (auth, { resource, data }) => {
      if (!resources[resource]) {
        return errorResult(new Error(`Unknown resource: ${resource}`));
      }
      const config = resources[resource];
      if (config.noCreate) {
        return errorResult(new Error(`Resource ${resource} cannot be created via generic API`));
      }
      await assertResourceRight(auth, resource, "add");
      const service = container.getGenericService(resource);
      const created = await service.create(data, auth);
      return textResult(created);
    })
  );

  server.registerTool(
    "cms_update_resource",
    {
      description:
        "Update a generic resource record (same as PUT /api/:resource/:id). Requires update permission.",
      inputSchema: {
        resource: z.string().min(1),
        id: z.union([z.string(), z.number()]),
        data: z.record(z.unknown())
      }
    },
    withAuth(async (auth, { resource, id, data }) => {
      if (!resources[resource]) {
        return errorResult(new Error(`Unknown resource: ${resource}`));
      }
      await assertResourceRight(auth, resource, "update");
      const service = container.getGenericService(resource);
      const updated = await service.update(id, data, auth);
      return textResult(updated);
    })
  );

  server.registerTool(
    "cms_delete_resource",
    {
      description:
        "Delete a generic resource record (same as DELETE /api/:resource/:id). Requires delete permission.",
      inputSchema: {
        resource: z.string().min(1),
        id: z.union([z.string(), z.number()])
      }
    },
    withAuth(async (auth, { resource, id }) => {
      if (!resources[resource]) {
        return errorResult(new Error(`Unknown resource: ${resource}`));
      }
      const config = resources[resource];
      if (config.noRemove) {
        return errorResult(new Error(`Resource ${resource} cannot be deleted`));
      }
      await assertResourceRight(auth, resource, "delete");
      const service = container.getGenericService(resource);
      await service.delete(id, auth);
      return textResult({ message: "Record deleted successfully", resource, id });
    })
  );
}

module.exports = {
  registerGenericTools
};
