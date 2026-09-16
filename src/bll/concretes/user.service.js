const UserRepository = require("../../dataaccess/concretes/user.repository");
const { normalizeUserEmail } = require("../../utils/user-email");
const { resolveUserTypeFromInput } = require("../../utils/user-type");
const { applyTechnicianAffiliationFields } = require("../../utils/technician-affiliation");
const { applyManagerFields } = require("../../utils/user-manager");

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
    if (!data?.name) {
      const err = new Error("Name required");
      err.status = 400;
      throw err;
    }

    const email = normalizeUserEmail(data.email);
    if (!email) {
      const err = new Error("Email required");
      err.status = 400;
      throw err;
    }

    const usertype = resolveUserTypeFromInput(data, { defaultType: "technician" });
    const technicianFields = applyTechnicianAffiliationFields(data, usertype, { mode: "create" });
    const managerFields = await applyManagerFields(data, usertype, {
      mode: "create",
      tenantid: Number(data.tenantid)
    });

    return this.repo.create({ ...data, email, usertype, ...technicianFields, ...managerFields });
  }

  async updateUser(id, data) {
    const existing = await this.repo.getById(id);
    if (!existing) {
      throw new Error("User not found");
    }

    const payload = { ...data };
    if (data.usertype !== undefined || data.userType !== undefined || data.type !== undefined) {
      payload.usertype = resolveUserTypeFromInput(data, { required: true });
      delete payload.userType;
      delete payload.type;
    }

    const effectiveType = payload.usertype ?? existing.usertype;
    Object.assign(
      payload,
      applyTechnicianAffiliationFields(data, effectiveType, { mode: "update" })
    );
    Object.assign(
      payload,
      await applyManagerFields(data, effectiveType, {
        mode: "update",
        tenantid: Number(existing.createdtenantid || data.tenantid),
        technicianUserId: Number(id)
      })
    );
    delete payload.technicianAffiliation;
    delete payload.technicianType;
    delete payload.companyName;
    delete payload.thirdPartyCompany;
    delete payload.managerId;
    delete payload.manager;

    return await this.repo.update(id, payload);
  }

  async deleteUser(id) {
    if (!await this.repo.getById(id)) {
      throw new Error("User not found");
    }

    return await this.repo.delete(id);
  }
}

module.exports = UserService;