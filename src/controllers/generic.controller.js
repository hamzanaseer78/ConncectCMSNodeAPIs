const GenericService = require("../bll/concretes/generic.service");

function handleError(res, err) {
  const status = err.message === "Record not found" ? 404 : 400;
  res.status(status).json({ error: err.message });
}

function createGenericController(resourceName) {
  const service = new GenericService(resourceName);

  return {
    list: async (req, res) => {
      try {
        res.status(200).json(await service.list(req.auth, req.query));
      } catch (err) {
        handleError(res, err);
      }
    },
    get: async (req, res) => {
      try {
        res.status(200).json(await service.get(req.params.id, req.auth));
      } catch (err) {
        handleError(res, err);
      }
    },
    create: async (req, res) => {
      try {
        res.status(201).json(await service.create(req.body, req.auth));
      } catch (err) {
        handleError(res, err);
      }
    },
    update: async (req, res) => {
      try {
        res.status(200).json(await service.update(req.params.id, req.body, req.auth));
      } catch (err) {
        handleError(res, err);
      }
    },
    delete: async (req, res) => {
      try {
        await service.delete(req.params.id, req.auth);
        res.status(200).json({ message: "Record deleted successfully" });
      } catch (err) {
        handleError(res, err);
      }
    }
  };
}

module.exports = createGenericController;
