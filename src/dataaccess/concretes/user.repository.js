const prisma = require("../../database/prisma");
const {
  normalizeUserEmail,
  findUserByEmail,
  assertUserEmailAvailable
} = require("../../utils/user-email");
const { createUserInTransaction } = require("../../utils/user-create");

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
    return findUserByEmail(prisma, email);
  }

  async create(user) {
    const data = { ...user };
    if (data.email != null && data.email !== "") {
      data.email = await assertUserEmailAvailable(prisma, data.email);
    }
    return prisma.$transaction(async (tx) => createUserInTransaction(tx, data));
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
