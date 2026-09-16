/**
 * Service Container (Singleton Pattern)
 * Creates and manages singleton instances of services
 */
const AuthService = require('../bll/concretes/auth.service');
const AdminUsersService = require('../bll/concretes/admin-users.service');
const resources = require('../config/resources');
const userActivityLogService = require('../services/user-activity-log.service');
const { pickEntityName, pickEntityCode } = require('../utils/user-activity-log');

function logGenericCrud(resourceName, req, action, result, extras = {}) {
  const config = resources[resourceName];
  if (!config || !result) {
    return;
  }
  userActivityLogService.logSafe(
    req.auth,
    {
      module: resourceName,
      action,
      entityName: pickEntityName(result),
      entityCode: pickEntityCode(result),
      entityId: result?.[config.id] ?? result?.id ?? null,
      ...extras
    },
    req
  );
}

class ServiceContainer {
  constructor() {
    this.services = {};
  }

  getAuthService() {
    if (!this.services.authService) {
      this.services.authService = new AuthService();
    }
    return this.services.authService;
  }

  getAdminUsersService() {
    if (!this.services.adminUsersService) {
      this.services.adminUsersService = new AdminUsersService(this.getAuthService());
    }
    return this.services.adminUsersService;
  }

  // Generic service factory
  getGenericService(resourceName) {
    const key = `genericService_${resourceName}`;
    if (!this.services[key]) {
      const GenericService = require('../bll/concretes/generic.service');
      this.services[key] = new GenericService(resourceName);
    }
    return this.services[key];
  }

  // Get generic controller with singleton service
  getGenericController(resourceName) {
    const service = this.getGenericService(resourceName);
    return {
      list: async (req, res) => {
        try {
          res.status(200).json(await service.list(req.auth, req.query));
        } catch (err) {
          const status = err.message === "Record not found" ? 404 : 400;
          res.status(status).json({ error: err.message });
        }
      },
      get: async (req, res) => {
        try {
          res.status(200).json(await service.get(req.params.id, req.auth));
        } catch (err) {
          const status = err.message === "Record not found" ? 404 : 400;
          res.status(status).json({ error: err.message });
        }
      },
      getDetails: async (req, res) => {
        try {
          res.status(200).json(await service.getDetails(req.params.id, req.auth));
        } catch (err) {
          const status = err.message === "Record not found" ? 404 : 400;
          res.status(status).json({ error: err.message });
        }
      },
      create: async (req, res) => {
        try {
          const result = await service.create(req.body, req.auth);
          logGenericCrud(resourceName, req, "create", result);
          res.status(201).json(result);
        } catch (err) {
          const status = err.message === "Record not found" ? 404 : 400;
          res.status(status).json({ error: err.message });
        }
      },
      update: async (req, res) => {
        try {
          const result = await service.update(req.params.id, req.body, req.auth);
          logGenericCrud(resourceName, req, "update", result);
          res.status(200).json(result);
        } catch (err) {
          const status = err.status || (err.message === "Record not found" ? 404 : 400);
          res.status(status).json({ error: err.message });
        }
      },
      updatePolicyRights:
        resourceName === "policies"
          ? async (req, res) => {
              try {
                const result = await service.updatePolicyRights(req.params.id, req.auth, req.body);
                logGenericCrud(resourceName, req, "settings_updated", result, {
                  summary: `Updated policy rights for ${pickEntityName(result) || "policy"}`,
                  entityId: Number(req.params.id)
                });
                res.status(200).json(result);
              } catch (err) {
                const status = err.status || (err.message === "Record not found" ? 404 : 400);
                res.status(status).json({ error: err.message });
              }
            }
          : undefined,
      delete: async (req, res) => {
        try {
          const existing = await service.get(req.params.id, req.auth);
          await service.delete(req.params.id, req.auth);
          logGenericCrud(resourceName, req, "delete", existing);
          res.status(200).json({ message: "Record deleted successfully" });
        } catch (err) {
          const status = err.message === "Record not found" ? 404 : 400;
          res.status(status).json({ error: err.message });
        }
      }
    };
  }

  clear() {
    this.services = {};
  }
}

module.exports = new ServiceContainer();
