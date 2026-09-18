const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../../database/prisma");
const {
  JWT_EXPIRES_IN,
  SIGNUP_TOKEN_EXPIRES_MINUTES,
  PASSWORD_RESET_EXPIRES_MINUTES,
  signToken
} = require("../../config/jwt");
const { assertPasswordStrength } = require("../../utils/password-policy");
const mailService = require("../../services/mail.service");
const { utcNow } = require("../../utils/date");
const { generateRandomPassword } = require("../../utils/password");
const {
  normalizeUserEmail,
  findUserByEmail: findUserByEmailUtil,
  assertUserEmailAvailable
} = require("../../utils/user-email");
const { resolveUserTypeFromInput, normalizeUserType } = require("../../utils/user-type");
const {
  ensureOrganizationPolicyTemplate,
  findOrganizationPolicyByDescription
} = require("../../services/default-organization-policies.service");
const { applyTechnicianAffiliationFields } = require("../../utils/technician-affiliation");
const { applyManagerFields, formatManagerFields } = require("../../utils/user-manager");
const screenRightsService = require("./screenrights.service");
const { enrichSessionProfileGeo } = require("../../utils/geo-labels");
const { syncPostgresSequence } = require("../../utils/postgres-sequence");
const { createUserInTransaction } = require("../../utils/user-create");
const { assertResourceRight } = require("../../middlewares/authorization.middleware");
const { createDefaultOrganizationPolicies } = require("../../services/default-organization-policies.service");

class AuthService {
  async signup({ name, email, baseUrl, signupIp, signupLatitude, signupLongitude, isTermsAccepted }) {
    if (!name) {
      throw new Error("Name required");
    }

    const normalizedEmail = normalizeUserEmail(email);
    if (!normalizedEmail) {
      throw new Error("Email required");
    }

    const existingUser = await this.findUserByEmail(normalizedEmail);

    if (existingUser?.password) {
      return {
        message: "User already exists. Login and create a new organization from your account.",
        userExists: true
      };
    }

    const token = this.generateCode();
    const now = utcNow();
    const user = existingUser
      ? await prisma.users.update({
          where: { userid: existingUser.userid },
          data: {
            name,
            email: normalizedEmail,
            signuptoken: token,
            istokenused: false,
            resettokengendatetime: now,
            signupip: signupIp,
            signuplatitude: signupLatitude,
            signuplongitude: signupLongitude,
            istermsaccepted: isTermsAccepted,
            lastupdatedat: now
          }
        })
      : await prisma.$transaction(async (tx) =>
          createUserInTransaction(tx, {
            name,
            email: normalizedEmail,
            isactive: true,
            isdeleted: false,
            signuptoken: token,
            istokenused: false,
            resettokengendatetime: now,
            signupip: signupIp,
            signuplatitude: signupLatitude,
            signuplongitude: signupLongitude,
            istermsaccepted: isTermsAccepted,
            createdat: now
          })
        );

    const url = `${baseUrl || "http://localhost:3000"}/api/auth/signup/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`;
    
    // Send signup verification email with template
    await mailService.sendSignupVerification(normalizedEmail, token, url, {
      name: name || 'User',
      organizationName: 'ConnectCMS'
    });

    return {
      message: "Signup verification code sent",
      userid: user.userid,
      email: normalizedEmail,
      verificationUrl: url
    };
  }

  async verifySignupToken({ email, token }) {
    if (!email || !token) {
      throw new Error("Email and token required");
    }

    const user = await this.findUserByEmail(email);

    if (!user || user.signuptoken !== token || user.istokenused===true) {
      throw new Error("Invalid signup token");
    }

    if (user.resettokengendatetime) {
      const ageMs = utcNow().getTime() - new Date(user.resettokengendatetime).getTime();
      if (ageMs > SIGNUP_TOKEN_EXPIRES_MINUTES * 60 * 1000) {
        throw new Error("Signup token expired");
      }
    }

    await prisma.users.update({
      where: { userid: user.userid },
      data: {
        istokenused: true,
        tokenusedat: utcNow()
      }
    });

    return {
      message: "Signup token verified",
      userid: user.userid,
      canConfigurePassword: true
    };
  }

  async requestPasswordReset({ email, baseUrl }) {
    const normalizedEmail = normalizeUserEmail(email);
    if (!normalizedEmail) {
      const err = new Error("Email required");
      err.status = 400;
      throw err;
    }

    const generic = {
      message:
        "If an account exists for this email, password reset instructions have been sent."
    };

    const user = await this.findUserByEmail(normalizedEmail);
    if (!user?.password) {
      return generic;
    }

    const token = this.generateCode();
    const now = utcNow();

    await prisma.users.update({
      where: { userid: user.userid },
      data: {
        resettoken: token,
        resettokengendatetime: now,
        lastupdatedat: now
      }
    });

    const appBase = (baseUrl || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
    const resetUrl = `${appBase}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`;

    await mailService.sendPasswordReset(normalizedEmail, token, resetUrl, {
      name: user.name || "User",
      organizationName: process.env.APP_NAME || "ConnectCMS"
    });

    return generic;
  }

  async resetPassword({ email, token, password }) {
    if (!email || !token || !password) {
      const err = new Error("Email, token and password required");
      err.status = 400;
      throw err;
    }

    assertPasswordStrength(password, "New password");

    const user = await this.findUserByEmail(email);
    if (!user || !user.resettoken || user.resettoken !== String(token).trim()) {
      const err = new Error("Invalid or expired reset token");
      err.status = 400;
      throw err;
    }

    if (user.resettokengendatetime) {
      const ageMs = utcNow().getTime() - new Date(user.resettokengendatetime).getTime();
      if (ageMs > PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000) {
        const err = new Error("Reset token expired");
        err.status = 400;
        throw err;
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = utcNow();

    await prisma.users.update({
      where: { userid: user.userid },
      data: {
        password: passwordHash,
        resettoken: null,
        resettokengendatetime: null,
        lastupdatedat: now
      }
    });

    return {
      message: "Password reset successfully",
      userid: user.userid
    };
  }

  async configurePassword({ email, token, password }) {
    if (!email || !token || !password) {
      throw new Error("Email, token and password required");
    }

    assertPasswordStrength(password, "Password");

    const user = await this.findUserByEmail(email);

    if (!user || user.signuptoken !== token || user.istokenused !== true) {
      throw new Error("Signup token must be verified before password configuration");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.users.update({
      where: { userid: user.userid },
      data: {
        password: passwordHash,
        lastupdatedat: utcNow()
      }
    });

    return {
      message: "Password configured successfully",
      userid: user.userid
    };
  }

  async createOrganization(input, auth = null) {
    const user = auth
      ? await prisma.users.findUnique({ where: { userid: Number(auth.userid) } })
      : await this.validateEmailPassword(input.email, input.password);

    if (!user) {
      throw new Error("User not found");
    }

    if (!input.organizationname) {
      throw new Error("Organization name required");
    }

    const now = utcNow();

    return prisma.$transaction(async (tx) => {
      const organization = await tx.organizations.create({
        data: {
          organizationname: input.organizationname,
          phoneno: input.phoneno,
          email: input.organizationEmail || input.email || user.email,
          website: input.website,
          defaultcurrency: input.defaultcurrency,
          country: input.country,
          city: input.city,
          address: input.address,
          address2: input.address2,
          logourl: input.logourl,
          istaxregistered: input.istaxregistered,
          taxno: input.taxno,
          financialyeartype: input.financialyeartype || 1,
          roundingdigit: input.roundingdigit || 2,
          weektype: input.weektype || 1,
          createdby: user.userid,
          createdat: now
        }
      });

      await syncPostgresSequence(tx, "branches", "branchid");

      const branch = await tx.branches.create({
        data: {
          tenantid: organization.tenantid,
          name: input.branchName || organization.organizationname,
          phoneno: organization.phoneno,
          email: organization.email,
          web: organization.website,
          country: organization.country,
          city: organization.city,
          address: organization.address,
          address2: organization.address2,
          logourl: organization.logourl,
          isactive: true,
          createdby: user.userid,
          createdat: now
        }
      });

      const { admin: adminPolicy, manager: managerPolicy, technician: technicianPolicy } =
        await createDefaultOrganizationPolicies(tx, {
          tenantid: organization.tenantid,
          branchid: branch.branchid,
          createdBy: user.userid
        });

      await tx.userorganizations.create({
        data: {
          userid: user.userid,
          tenantid: organization.tenantid,
          branchid: branch.branchid,
          isblocked: false,
          createdby: user.userid,
          createdat: now
        }
      });

      await tx.userpolicies.create({
        data: {
          userid: user.userid,
          tenantid: organization.tenantid,
          branchid: branch.branchid,
          policyid: adminPolicy.recno,
          createdby: user.userid,
          createdat: now
        }
      });

      await tx.users.update({
        where: { userid: user.userid },
        data: {
          createdtenantid: organization.tenantid,
          usertype: "admin",
          lastupdatedat: now
        }
      });

      await tx.userssignuptokenlogs.create({
        data: {
          userid: user.userid,
          signuptoken: user.signuptoken || this.generateCode(),
          createdtenantid: organization.tenantid,
          istokenused: true,
          tokenusedat: now,
          logcreatedat: now
        }
      });

      return {
        organization,
        branch,
        policy: adminPolicy,
        policies: {
          admin: adminPolicy,
          manager: managerPolicy,
          technician: technicianPolicy
        },
        token: this.createSessionToken(user, organization.tenantid, branch.branchid)
      };
    });
  }

  async login({ email, password}) {
    const user = await this.validateEmailPassword(email, password);
    const membership = await this.resolveMembership(user.userid, null, null);
    return this.buildSessionProfileResponse(user, membership.tenantid, membership.branchid);
  }

  async switchContext(auth, { tenantid, branchid }) {
    const membership = await this.resolveMembership(auth.userid, tenantid, branchid);
    const user = await prisma.users.findUnique({ where: { userid: Number(auth.userid) } });

    if (!user) {
      throw new Error("User not found");
    }

    return this.buildSessionProfileResponse(user, membership.tenantid, membership.branchid);
  }

  /**
   * Creates a user for the current tenant/branch when the caller has Users add permission.
   * POST /api/auth/invite | POST /api/auth/users/create | POST /api/user/admin/create
   */
  async inviteUser(auth, input = {}) {
    const email = normalizeUserEmail(input.email);
    const name = String(input.name || "").trim();

    if (!email) {
      throw new Error("Email required");
    }
    if (!name) {
      throw new Error("Name required");
    }

    await assertResourceRight(auth, "users", "add");

    const tenantid = Number(auth.tenantid);
    const targetBranchId = Number(input.branchid || auth.branchid);
    const usertype = resolveUserTypeFromInput(input, { defaultType: "technician" });
    const targetPolicyId = await this.resolveInvitePolicyId(tenantid, input.policyid, usertype, {
      branchid: targetBranchId,
      createdBy: Number(auth.userid)
    });
    const resetExisting = input.resetPassword !== false;
    const sendEmail = input.sendEmail !== false;
    const technicianFields = applyTechnicianAffiliationFields(input, usertype, { mode: "create" });
    const managerFields = await applyManagerFields(input, usertype, {
      mode: "create",
      tenantid
    });

    const [organization, inviter] = await Promise.all([
      prisma.organizations.findUnique({
        where: { tenantid },
        select: { organizationname: true }
      }),
      prisma.users.findUnique({
        where: { userid: Number(auth.userid) },
        select: { name: true, email: true }
      })
    ]);

    const organizationName =
      organization?.organizationname || process.env.APP_NAME || "ConnectCMS";
    const inviterName = inviter?.name || auth.name || "Admin";
    const loginUrl = `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/login`;

    let user = await this.findUserByEmail(email);
    const isNewUser = !user;
    let generatedPassword = generateRandomPassword(
      Number(process.env.ADMIN_USER_PASSWORD_LENGTH || 12)
    );
    const now = utcNow();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      if (!user) {
        await assertUserEmailAvailable(tx, email);
        user = await createUserInTransaction(tx, {
          name,
          email,
          contactno: input.contactno != null ? String(input.contactno).trim() : null,
          usertype,
          ...technicianFields,
          ...managerFields,
          password: passwordHash,
          isactive: input.isactive !== false,
          isdeleted: false,
          createdby: Number(auth.userid),
          createdat: now
        });
      } else {
        const updateData = {
          name,
          lastupdatedby: Number(auth.userid),
          lastupdatedat: now
        };
        if (input.contactno !== undefined) {
          updateData.contactno = input.contactno != null ? String(input.contactno).trim() : null;
        }
        if (input.isactive !== undefined) {
          updateData.isactive = input.isactive === true || input.isactive === "true" || input.isactive === 1;
        }
        if (input.usertype !== undefined || input.userType !== undefined || input.type !== undefined) {
          updateData.usertype = resolveUserTypeFromInput(input, { required: true });
        }
        const effectiveType = updateData.usertype ?? user.usertype;
        Object.assign(
          updateData,
          applyTechnicianAffiliationFields(input, effectiveType, { mode: "update" })
        );
        Object.assign(
          updateData,
          await applyManagerFields(input, effectiveType, {
            mode: "update",
            tenantid,
            technicianUserId: user.userid
          })
        );
        if (resetExisting) {
          updateData.password = passwordHash;
        } else {
          generatedPassword = null;
        }
        user = await tx.users.update({
          where: { userid: user.userid },
          data: updateData
        });
      }

      const existingMembership = await tx.userorganizations.findFirst({
        where: { userid: user.userid, tenantid, branchid: targetBranchId }
      });

      if (!existingMembership) {
        await tx.userorganizations.create({
          data: {
            userid: user.userid,
            tenantid,
            branchid: targetBranchId,
            isblocked: false,
            createdby: Number(auth.userid),
            createdat: now
          }
        });
      }

      const existingPolicy = await tx.userpolicies.findFirst({
        where: {
          userid: user.userid,
          tenantid,
          branchid: targetBranchId,
          policyid: targetPolicyId
        }
      });

      if (!existingPolicy) {
        await tx.userpolicies.create({
          data: {
            userid: user.userid,
            tenantid,
            branchid: targetBranchId,
            policyid: targetPolicyId,
            createdby: Number(auth.userid),
            createdat: now
          }
        });
      }

      return { user, isNewUser };
    });

    let emailSent = false;
    if (sendEmail && generatedPassword) {
      await mailService.sendInvitation(email, {
        name: name || result.user.name || "User",
        inviterName,
        organizationName,
        generatedPassword,
        loginUrl
      });
      emailSent = true;
    } else if (sendEmail && !generatedPassword) {
      await mailService.sendInvitation(email, {
        name: name || result.user.name || "User",
        inviterName,
        organizationName,
        generatedPassword: null,
        loginUrl,
        temporaryPassword: false
      });
      emailSent = true;
    }

    return {
      message: result.isNewUser ? "User created successfully" : "User updated and assigned to organization",
      userid: result.user.userid,
      email,
      usertype: result.user.usertype,
      technicianAffiliation: result.user.technicianaffiliation ?? null,
      companyName: result.user.companyname ?? null,
      ...formatManagerFields(result.user),
      isNewUser: result.isNewUser,
      policyid: targetPolicyId,
      branchid: targetBranchId,
      passwordEmailSent: emailSent,
      generatedPasswordSent: Boolean(generatedPassword && emailSent)
    };
  }

  /** Alias for inviteUser — admin signup/create flow. */
  async createUserByAdmin(auth, input) {
    return this.inviteUser(auth, input);
  }

  async resolveInvitePolicyId(tenantid, policyid, usertype, context = {}) {
    if (policyid !== undefined && policyid !== null && policyid !== "") {
      const id = Number(policyid);
      const policy = await prisma.policies.findFirst({
        where: { recno: id, tenantid: Number(tenantid) }
      });
      if (!policy) {
        const err = new Error("Policy not found for this organization");
        err.status = 400;
        throw err;
      }
      return id;
    }

    const normalizedType = normalizeUserType(usertype, { defaultType: null });
    const descriptionByType = {
      admin: "Admin",
      manager: "Manager",
      technician: "Technician",
      distributor: "Distributor"
    };

    if (normalizedType && descriptionByType[normalizedType]) {
      let policy = await findOrganizationPolicyByDescription(
        prisma,
        tenantid,
        descriptionByType[normalizedType]
      );

      if (!policy && normalizedType === "distributor" && context.branchid != null) {
        policy = await ensureOrganizationPolicyTemplate(
          prisma,
          {
            tenantid: Number(tenantid),
            branchid: Number(context.branchid),
            createdBy: Number(context.createdBy || 0)
          },
          "distributor"
        );
      }

      if (policy) {
        return policy.recno;
      }
    }

    const staffPolicy =
      (await findOrganizationPolicyByDescription(prisma, tenantid, "Manager")) ||
      (await prisma.policies.findFirst({
        where: {
          tenantid: Number(tenantid),
          OR: [{ isdefaultpolicy: false }, { isdefaultpolicy: null }]
        },
        orderBy: { recno: "asc" }
      }));

    if (staffPolicy) {
      return staffPolicy.recno;
    }

    const anyPolicy = await prisma.policies.findFirst({
      where: { tenantid: Number(tenantid) },
      orderBy: { recno: "asc" }
    });

    if (!anyPolicy) {
      const err = new Error("No policy found. Create at least one policy for this organization.");
      err.status = 400;
      throw err;
    }

    return anyPolicy.recno;
  }

  async validateEmailPassword(email, password) {
    if (!email || !password) {
      const err = new Error("Email and password required");
      err.status = 400;
      throw err;
    }

    const user = await this.findUserByEmail(email);

    if (!user?.password || !await bcrypt.compare(password, user.password)) {
      const err = new Error("Invalid email or password");
      err.status = 401;
      throw err;
    }

    if (user.isdeleted===true || user.isactive!==true) {
      const err = new Error("User is inactive");
      err.status = 403;
      throw err;
    }

    return user;
  }

  async findUserByEmail(email) {
    return findUserByEmailUtil(prisma, email);
  }

  async resolveMembership(userid, tenantid, branchid) {
    const where = {
      userid: Number(userid),
      isblocked: false
    };

    if (tenantid) {
      where.tenantid = Number(tenantid);
    }

    if (branchid) {
      where.branchid = Number(branchid);
    }

    const membership = await prisma.userorganizations.findFirst({
      where,
      orderBy: [
        { tenantid: "asc" },
        { branchid: "asc" },
        { recno: "asc" }
      ]
    });

    if (!membership) {
      throw new Error("User has no active organization or branch access");
    }

    return membership;
  }

  async getUserContexts(userid) {
    const memberships = await prisma.userorganizations.findMany({
      where: {
        userid: Number(userid),
        isblocked: false
      },
      include: {
        organizations: true,
        branches: true
      },
      orderBy: [
        { tenantid: "asc" },
        { branchid: "asc" },
        { recno: "asc" }
      ]
    });

    const organizationsById = new Map();

    memberships.forEach((membership) => {
      if (!membership.tenantid) {
        return;
      }

      if (!organizationsById.has(membership.tenantid)) {
        organizationsById.set(membership.tenantid, {
          ...membership.organizations,
          tenantid: membership.tenantid,
          branches: []
        });
      }

      if (membership.branchid) {
        organizationsById.get(membership.tenantid).branches.push(membership.branches || {
          branchid: membership.branchid
        });
      }
    });

    return Array.from(organizationsById.values());
  }

  async ensureAdmin(userid, tenantid, branchid) {
    const adminPolicyId = await this.getAdminPolicyId(tenantid);
    const assignment = await prisma.userpolicies.findFirst({
      where: {
        userid: Number(userid),
        tenantid: Number(tenantid),
        branchid: Number(branchid),
        policyid: adminPolicyId
      }
    });

    if (!assignment) {
      const err = new Error("Admin policy required");
      err.status = 403;
      throw err;
    }
  }

  async getAdminPolicyId(tenantid) {
    const policy = await prisma.policies.findFirst({
      where: {
        tenantid: Number(tenantid),
        isdefaultpolicy: true
      }
    });

    if (!policy) {
      throw new Error("Default admin policy not found");
    }

    return policy.recno;
  }

  createSessionToken(user, tenantid, branchid) {
    return signToken({
      sub: user.userid,
      userid: user.userid,
      tenantid,
      branchid,
      email: user.email,
      name: user.name
    });
  }

  async buildSessionProfileResponse(user, tenantid, branchid) {
    const contexts = await this.getUserContexts(user.userid);
    const rights = await screenRightsService.getScreenRights({
      userid: user.userid,
      tenantid,
      branchid
    });
    const { user: enrichedUser, organizations } = await enrichSessionProfileGeo(
      this.toUserDto(user),
      contexts
    );

    return {
      token: this.createSessionToken(user, tenantid, branchid),
      tokenType: "Bearer",
      expiresIn: JWT_EXPIRES_IN,
      user: enrichedUser,
      tenantid,
      branchid,
      organizations,
      isAdmin: rights.isAdmin,
      screenRights: rights.screenRights
    };
  }

  async getProfile(auth) {
    const user = await prisma.users.findUnique({
      where: { userid: Number(auth.userid) }
    });

    if (!user) {
      throw new Error("User not found");
    }

    const membership = await this.resolveMembership(user.userid, auth.tenantid, auth.branchid);
    return this.buildSessionProfileResponse(user, membership.tenantid, membership.branchid);
  }

  generateCode() {
    return crypto.randomInt(100000, 999999).toString();
  }

  toUserDto(user) {
    const { password, signuptoken, resettoken, ...dto } = user;
    return dto;
  }
}

module.exports = AuthService;
