const prisma = require("../../database/prisma");

class GenericRepository {
  constructor(modelName, idField) {
    this.modelName = modelName;
    this.idField = idField;
    this.model = prisma[modelName];
  }

  findMany({ where = {}, skip = 0, take = 25, orderBy = undefined, include = undefined } = {}) {
    return this.model.findMany({
      where,
      skip,
      take,
      orderBy,
      include
    });
  }

  count(where = {}) {
    return this.model.count({ where });
  }

  findOne(id, where = {}) {
    return this.model.findFirst({
      where: {
        ...where,
        [this.idField]: Number(id)
      }
    });
  }

  findOneWithInclude(id, where = {}, include = undefined) {
    return this.model.findFirst({
      where: {
        ...where,
        [this.idField]: Number(id)
      },
      include
    });
  }

  create(data) {
    return this.model.create({ data });
  }

  update(id, data) {
    return this.model.update({
      where: { [this.idField]: Number(id) },
      data
    });
  }

  delete(id) {
    return this.model.delete({
      where: { [this.idField]: Number(id) }
    });
  }
}

module.exports = GenericRepository;
