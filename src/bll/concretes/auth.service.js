const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../../database/prisma");
const { JWT_EXPIRES_IN, SIGNUP_TOKEN_EXPIRES_MINUTES, signToken } = require("../../config/jwt");
const mailService = require("../../services/mail.service");
const { utcNow } = require("../../utils/date");

const DEFAULT_PASSWORD_LENGTH = 12;

class AuthService {
  async signup({ name, email, baseUrl, signupIp, signupLatitude, signupLongitude, isTermsAccepted }) {
    if (!name) {
      throw new Error("Name required");
    }

    if (!email) {
      throw new Error("Email required");
    }

    const existingUser = await this.findUserByEmail(email);

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
      : await prisma.users.create({
          data: {
            name,
            email,
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
          }
        });

    const url = `${baseUrl || "http://localhost:3000"}/api/auth/signup/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    await mailService.sendSignupVerification(email, token, url);

    return {
      message: "Signup verification code sent",
      userid: user.userid,
      email,
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

  async configurePassword({ email, token, password }) {
    if (!email || !token || !password) {
      throw new Error("Email, token and password required");
    }

    const user = await this.findUserByEmail(email);

    if (!user || user.signuptoken !== token || !user.istokenused!==true) {
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

      const adminPolicy = await tx.policies.create({
        data: {
          tenantid: organization.tenantid,
          description: "Admin",
          isdefaultpolicy: true,
          createdby: user.userid,
          createdat: now
        }
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

      var rightsData = [];

      const screens = await tx.screens();

      screens.forEach(screen => {
        rightsData.push({
          screenid: screen.screenid,
          policyid: adminPolicy.recno,
          tenantid: organization.tenantid,
          branchid: branch.branchid,
          viewscreen: true,
          addscreen: true,
          updatescreen: true,
          deletescreen: true,
          others: true,
          createdby: user.userid,
          createdat: now
        });
      });

      await tx.userrights.createMany({
        data: rightsData
      });

      await tx.users.update({
        where: { userid: user.userid },
        data: {
          createdtenantid: organization.tenantid,
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
        token: this.createSessionToken(user, organization.tenantid, branch.branchid)
      };
    });
  }

  async login({ email, password, tenantid, branchid }) {
    const user = await this.validateEmailPassword(email, password);
    const membership = await this.resolveMembership(user.userid, tenantid, branchid);
    const contexts = await this.getUserContexts(user.userid);

    return {
      token: this.createSessionToken(user, membership.tenantid, membership.branchid),
      tokenType: "Bearer",
      expiresIn: JWT_EXPIRES_IN,
      user: this.toUserDto(user),
      tenantid: membership.tenantid,
      branchid: membership.branchid,
      organizations: contexts
    };
  }

  async switchContext(auth, { tenantid, branchid }) {
    const membership = await this.resolveMembership(auth.userid, tenantid, branchid);
    const user = await prisma.users.findUnique({ where: { userid: Number(auth.userid) } });
    const contexts = await this.getUserContexts(auth.userid);

    return {
      token: this.createSessionToken(user, membership.tenantid, membership.branchid),
      tokenType: "Bearer",
      expiresIn: JWT_EXPIRES_IN,
      tenantid: membership.tenantid,
      branchid: membership.branchid,
      organizations: contexts
    };
  }

  async inviteUser(auth, { name, email, branchid, policyid }) {
    if (!email) {
      throw new Error("Email required");
    }

    await this.ensureAdmin(auth.userid, auth.tenantid, auth.branchid);

    const now = utcNow();
    let user = await this.findUserByEmail(email);
    let generatedPassword = null;

    if (!user) {
      generatedPassword = crypto.randomBytes(DEFAULT_PASSWORD_LENGTH).toString("base64url").slice(0, DEFAULT_PASSWORD_LENGTH);
      user = await prisma.users.create({
        data: {
          name,
          email,
          password: await bcrypt.hash(generatedPassword, 10),
          isactive: true,
          isdeleted: false,
          createdby: Number(auth.userid),
          createdat: now
        }
      });
    }

    if (!policyid) {
      throw new Error("Policy required for invited user");
    }

    const targetBranchId = Number(branchid || auth.branchid);
    const targetPolicyId = Number(policyid);

    const existingMembership = await prisma.userorganizations.findFirst({
      where: {
        userid: user.userid,
        tenantid: Number(auth.tenantid),
        branchid: targetBranchId
      }
    });

    if (!existingMembership) {
      await prisma.userorganizations.create({
        data: {
          userid: user.userid,
          tenantid: Number(auth.tenantid),
          branchid: targetBranchId,
          isblocked: false,
          createdby: Number(auth.userid),
          createdat: now
        }
      });
    }

    const existingPolicy = await prisma.userpolicies.findFirst({
      where: {
        userid: user.userid,
        tenantid: Number(auth.tenantid),
        branchid: targetBranchId,
        policyid: targetPolicyId
      }
    });

    if (!existingPolicy) {
      await prisma.userpolicies.create({
        data: {
          userid: user.userid,
          tenantid: Number(auth.tenantid),
          branchid: targetBranchId,
          policyid: targetPolicyId,
          createdby: Number(auth.userid),
          createdat: now
        }
      });
    }

    await mailService.sendInvitation(email, {
      tenantid: auth.tenantid,
      branchid: targetBranchId,
      generatedPassword
    });

    return {
      message: "User invited successfully",
      userid: user.userid,
      generatedPasswordSent: Boolean(generatedPassword)
    };
  }

  async validateEmailPassword(email, password) {
    if (!email || !password) {
      throw new Error("Email and password required");
    }

    const user = await this.findUserByEmail(email);

    if (!user?.password || !await bcrypt.compare(password, user.password)) {
      throw new Error("Invalid email or password");
    }

    if (user.isdeleted===true || user.isactive!==true) {
      throw new Error("User is inactive");
    }

    return user;
  }

  async findUserByEmail(email) {
    return prisma.users.findFirst({ where: { email } });
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
      throw new Error("Admin policy required");
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

  async getProfile(auth) {
    const user = await prisma.users.findUnique({
      where: { userid: Number(auth.userid) }
    });

    if (!user) {
      throw new Error("User not found");
    }

    const membership = await this.resolveMembership(user.userid, auth.tenantid, auth.branchid);
    const contexts = await this.getUserContexts(user.userid);

    return {
      token: this.createSessionToken(user, membership.tenantid, membership.branchid),
      tokenType: "Bearer",
      expiresIn: JWT_EXPIRES_IN,
      user: this.toUserDto(user),
      tenantid: membership.tenantid,
      branchid: membership.branchid,
      organizations: contexts
    };
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
