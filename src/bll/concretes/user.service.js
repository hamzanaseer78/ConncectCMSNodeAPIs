const UserRepository = require("../../dataaccess/concretes/user.repository");

class UserService {
  constructor() {
    this.repo = new UserRepository();
  }

  async getUsers() {
    return await this.repo.getAll();
  }

  async getUserById(id) {
    return await this.repo.getById(id);
  }

  async createUser(data) {
    // business rules (validation, calculations, etc.)
    if (!data.email) {
      throw new Error("Email required");
    }
    if (!data.name) {
      throw new Error("Name required");
    }

    return await this.repo.create(data);
  }

  async updateUser(id, data) {
    if (!await this.repo.getById(id)) {
      throw new Error("User not found");
    }

    return await this.repo.update(id, data);
  }

  async deleteUser(id) {
    if (!await this.repo.getById(id)) {
      throw new Error("User not found");
    }

    return await this.repo.delete(id);
  }
}

module.exports = UserService;