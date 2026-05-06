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

  // Apply JWT authentication to all routes
  router.use(authenticateJwt);

  // Dropdown endpoint (JWT only, RBAC optional)
  router.get("/dropdown", async (req, res, next) => {
    try {
      res.status(200).json(await controller.list(req, res));
    } catch (err) {
      next(err);
    }
  });

  // RBAC protected routes
  router.get("/", authorizeResourceAction(resourceName, "view"), async (req, res, next) => {
    try {
      res.status(200).json(await controller.list(req, res));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", authorizeResourceAction(resourceName, "view"), async (req, res, next) => {
    try {
      res.status(200).json(await controller.get(req, res));
    } catch (err) {
      next(err);
    }
  });

  router.post("/", authorizeResourceAction(resourceName, "add"), async (req, res, next) => {
    try {
      res.status(201).json(await controller.create(req, res));
    } catch (err) {
      next(err);
    }
  });

  router.put("/:id", authorizeResourceAction(resourceName, "update"), async (req, res, next) => {
    try {
      res.status(200).json(await controller.update(req, res));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", authorizeResourceAction(resourceName, "delete"), async (req, res, next) => {
    try {
      await controller.delete(req, res);
      res.status(200).json({ message: "Record deleted successfully" });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createResourceRouter;