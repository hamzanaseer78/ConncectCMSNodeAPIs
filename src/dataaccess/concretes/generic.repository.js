const prisma = require("../../database/prisma");

class GenericRepository {
  constructor(modelName, idField) {
    this.modelName = modelName;
    this.idField = idField;
    this.model = prisma[modelName];
  }

  assertModel(operation) {
    if (this.model) {
      return;
    }
    const err = new Error(
      `Prisma model "${this.modelName}" is not available for ${operation}. ` +
        "On the server run: npx prisma migrate deploy && npx prisma generate, then restart the API."
    );
    err.status = 503;
    throw err;
  }

  findMany({ where = {}, skip = 0, take = 25, orderBy = undefined, include = undefined } = {}) {
    this.assertModel("list");
    return this.model.findMany({
      where,
      skip,
      take,
      orderBy,
      include
    });
  }

  count(where = {}) {
    this.assertModel("count");
    return this.model.count({ where });
  }

  findOne(id, where = {}) {
    this.assertModel("read");
    return this.model.findFirst({
      where: {
        ...where,
        [this.idField]: Number(id)
      }
    });
  }

  findOneWithInclude(id, where = {}, include = undefined) {
    this.assertModel("read");
    return this.model.findFirst({
      where: {
        ...where,
        [this.idField]: Number(id)
      },
      include
    });
  }

  create(data) {
    this.assertModel("create");
    return this.model.create({ data });
  }

  update(id, data) {
    this.assertModel("update");
    return this.model.update({
      where: { [this.idField]: Number(id) },
      data
    });
  }

  delete(id) {
    this.assertModel("delete");
    return this.model.delete({
      where: { [this.idField]: Number(id) }
    });
  }
}

module.exports = GenericRepository;
