const prisma = require("../../database/prisma");

class UserRepository {
  async getAll() {
    return await prisma.users.findMany();
  }

  async getById(id) {
    return await prisma.users.findUnique({
      where: { userid: Number(id) }
    });
  }

  async getByEmail(email) {
    return await prisma.users.findFirst({
      where: { email }
    });
  }

  async create(user) {
    return await prisma.users.create({
      data: user
    });
  }

  async update(id, user) {
    return await prisma.users.update({
      where: { userid: Number(id) },
      data: user
    });
  }

  async delete(id) {
    return await prisma.users.delete({
      where: { userid: Number(id) }
    });
  }
}

module.exports = UserRepository;
