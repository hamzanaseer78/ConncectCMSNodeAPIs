const express = require("express");
const resources = require("../config/resources");
const createGenericController = require("../controllers/generic.controller");
const authenticateJwt = require("../middlewares/auth.middleware");
const { authorizeResourceAction } = require("../middlewares/authorization.middleware");

function createResourceRouter(resourceName) {
  if (!resources[resourceName]) {
    throw new Error(`Unknown resource: ${resourceName}`);
  }

  const controller = createGenericController(resourceName);
  const router = express.Router();

  // Dropdown endpoint - authentication only, no rights required
  router.get("/dropdown", authenticateJwt, controller.list);

  // Standard CRUD endpoints with authorization
  router.use(authenticateJwt);
  router.get("/", authorizeResourceAction(resourceName, "view"), controller.list);
  router.get("/:id", authorizeResourceAction(resourceName, "view"), controller.get);
  router.post("/", authorizeResourceAction(resourceName, "add"), controller.create);
  router.put("/:id", authorizeResourceAction(resourceName, "update"), controller.update);
  router.delete("/:id", authorizeResourceAction(resourceName, "delete"), controller.delete);

  return router;
}

module.exports = createResourceRouter;
