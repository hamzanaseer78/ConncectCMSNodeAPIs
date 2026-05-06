/**
 * Service Container (Singleton Pattern)
 * Creates and manages singleton instances of services
 */
const AuthService = require('../bll/concretes/auth.service');

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
      create: async (req, res) => {
        try {
          res.status(201).json(await service.create(req.body, req.auth));
        } catch (err) {
          const status = err.message === "Record not found" ? 404 : 400;
          res.status(status).json({ error: err.message });
        }
      },
      update: async (req, res) => {
        try {
          res.status(200).json(await service.update(req.params.id, req.body, req.auth));
        } catch (err) {
          const status = err.message === "Record not found" ? 404 : 400;
          res.status(status).json({ error: err.message });
        }
      },
      delete: async (req, res) => {
        try {
          await service.delete(req.params.id, req.auth);
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
