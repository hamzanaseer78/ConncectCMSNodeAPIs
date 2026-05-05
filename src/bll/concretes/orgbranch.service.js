const prisma = require("../../database/prisma");
const { utcNow } = require("../../utils/date");

class OrgBranchService {
  /**
   * Update organization details
   */
  async updateOrganization(auth, organizationData) {
    if (!auth.tenantid) {
      throw new Error("Tenant ID required");
    }

    const org = await prisma.organizations.findUnique({
      where: { tenantid: auth.tenantid }
    });

    if (!org) {
      throw new Error("Organization not found");
    }

    const updateData = {};

    if (organizationData.organizationname !== undefined)
      updateData.organizationname = organizationData.organizationname;
    if (organizationData.phoneno !== undefined)
      updateData.phoneno = organizationData.phoneno;
    if (organizationData.email !== undefined)
      updateData.email = organizationData.email;
    if (organizationData.website !== undefined)
      updateData.website = organizationData.website;
    if (organizationData.country !== undefined)
      updateData.country = organizationData.country;
    if (organizationData.city !== undefined)
      updateData.city = organizationData.city;
    if (organizationData.address !== undefined)
      updateData.address = organizationData.address;
    if (organizationData.address2 !== undefined)
      updateData.address2 = organizationData.address2;
    if (organizationData.defaultcurrency !== undefined)
      updateData.defaultcurrency = organizationData.defaultcurrency;
    if (organizationData.istaxregistered !== undefined)
      updateData.istaxregistered = organizationData.istaxregistered === true;
    if (organizationData.taxno !== undefined)
      updateData.taxno = organizationData.taxno;
    if (organizationData.financialyeartype !== undefined)
      updateData.financialyeartype = organizationData.financialyeartype;
    if (organizationData.roundingdigit !== undefined)
      updateData.roundingdigit = organizationData.roundingdigit;
    if (organizationData.weektype !== undefined)
      updateData.weektype = organizationData.weektype;

    updateData.lastupdatedat = utcNow();
    updateData.lastupdatedby = auth.userid;

    const updatedOrg = await prisma.organizations.update({
      where: { tenantid: auth.tenantid },
      data: updateData
    });

    return {
      message: "Organization updated successfully",
      organization: updatedOrg
    };
  }

  /**
   * Update organization logo
   */
  async updateOrganizationLogo(auth, logoUrl) {
    if (!auth.tenantid) {
      throw new Error("Tenant ID required");
    }

    if (!logoUrl) {
      throw new Error("Logo URL is required");
    }

    const updatedOrg = await prisma.organizations.update({
      where: { tenantid: auth.tenantid },
      data: {
        logourl: logoUrl,
        lastupdatedat: utcNow(),
        lastupdatedby: auth.userid
      }
    });

    return {
      message: "Organization logo updated successfully",
      logourl: updatedOrg.logourl
    };
  }

  /**
   * Update branch details
   */
  async updateBranch(auth, branchId, branchData) {
    if (!auth.tenantid) {
      throw new Error("Tenant ID required");
    }

    const branch = await prisma.branches.findUnique({
      where: { branchid: branchId }
    });

    if (!branch || branch.tenantid !== auth.tenantid) {
      throw new Error("Branch not found or not in your organization");
    }

    const updateData = {};

    if (branchData.name !== undefined) updateData.name = branchData.name;
    if (branchData.phoneno !== undefined) updateData.phoneno = branchData.phoneno;
    if (branchData.email !== undefined) updateData.email = branchData.email;
    if (branchData.web !== undefined) updateData.web = branchData.web;
    if (branchData.country !== undefined) updateData.country = branchData.country;
    if (branchData.city !== undefined) updateData.city = branchData.city;
    if (branchData.area !== undefined) updateData.area = branchData.area;
    if (branchData.address !== undefined) updateData.address = branchData.address;
    if (branchData.address2 !== undefined) updateData.address2 = branchData.address2;

    updateData.lastupdatedat = utcNow();
    updateData.lastupdatedby = auth.userid;

    const updatedBranch = await prisma.branches.update({
      where: { branchid: branchId },
      data: updateData
    });

    return {
      message: "Branch updated successfully",
      branch: updatedBranch
    };
  }

  /**
   * Update branch logo
   */
  async updateBranchLogo(auth, branchId, logoUrl) {
    if (!auth.tenantid) {
      throw new Error("Tenant ID required");
    }

    if (!logoUrl) {
      throw new Error("Logo URL is required");
    }

    const branch = await prisma.branches.findUnique({
      where: { branchid: branchId }
    });

    if (!branch || branch.tenantid !== auth.tenantid) {
      throw new Error("Branch not found or not in your organization");
    }

    const updatedBranch = await prisma.branches.update({
      where: { branchid: branchId },
      data: {
        logourl: logoUrl,
        lastupdatedat: utcNow(),
        lastupdatedby: auth.userid
      }
    });

    return {
      message: "Branch logo updated successfully",
      logourl: updatedBranch.logourl
    };
  }
}

module.exports = OrgBranchService;
