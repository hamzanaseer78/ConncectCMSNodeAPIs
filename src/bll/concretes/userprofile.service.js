const bcrypt = require("bcryptjs");
const prisma = require("../../database/prisma");
const { utcNow } = require("../../utils/date");
const { assertPasswordStrength } = require("../../utils/password-policy");

const PROFILE_FIELDS = ["name", "contactno", "gender", "country", "city", "profileimage"];

function buildPublicFileUrl(relativePath, req) {
  const rel = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  const configured = process.env.APP_URL && String(process.env.APP_URL).replace(/\/$/, "");
  if (configured) {
    return `${configured}${rel}`;
  }
  if (req) {
    return `${req.protocol}://${req.get("host")}${rel}`;
  }
  return rel;
}

function clientError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

class UserProfileService {
  /**
   * Get user profile with organization and branch details
   */
  async getProfile(userId) {
    const user = await prisma.users.findUnique({
      where: { userid: userId }
    });

    if (!user) {
      throw clientError("User not found", 404);
    }

    return this.toProfileDto(user);
  }

  /**
   * Update logged-in user profile (name, contactno, gender, country, city, profileimage).
   * Email cannot be changed here (admin / signup flows only).
   */
  async updateProfile(userId, profileData = {}) {
    const user = await prisma.users.findUnique({
      where: { userid: userId }
    });

    if (!user) {
      throw clientError("User not found", 404);
    }

    const imageUrl = profileData.profileimage ?? profileData.imageUrl;
    const payload = { ...profileData };
    if (imageUrl !== undefined) {
      payload.profileimage = imageUrl;
    }

    const updateData = {};
    let hasField = false;

    for (const field of PROFILE_FIELDS) {
      if (payload[field] === undefined) {
        continue;
      }
      hasField = true;

      if (field === "country" || field === "city") {
        const raw = payload[field];
        if (raw === null || raw === "") {
          updateData[field] = null;
        } else {
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            throw clientError(`${field} must be a number`);
          }
          updateData[field] = field === "country" ? n : Math.trunc(n);
        }
        continue;
      }

      if (field === "profileimage") {
        const url = payload.profileimage == null ? null : String(payload.profileimage).trim();
        if (url === "") {
          throw clientError("profileimage cannot be empty; omit the field or pass null");
        }
        updateData.profileimage = url;
        continue;
      }

      updateData[field] = payload[field];
    }

    if (profileData.email !== undefined || profileData.Email !== undefined) {
      throw clientError("Email cannot be updated via profile. Contact an administrator.");
    }

    if (!hasField) {
      throw clientError(
        `Provide at least one of: ${PROFILE_FIELDS.join(", ")} (or imageUrl for profile image)`
      );
    }

    updateData.lastupdatedat = utcNow();
    updateData.lastupdatedby = userId;

    const updatedUser = await prisma.users.update({
      where: { userid: userId },
      data: updateData
    });

    return this.toProfileDto(updatedUser);
  }

  /**
   * Change user password
   */
  async changePassword(userId, oldPassword, newPassword) {
    if (!oldPassword || !newPassword) {
      throw clientError("Old password and new password are required");
    }

    assertPasswordStrength(newPassword, "New password");

    const user = await prisma.users.findUnique({
      where: { userid: userId }
    });

    if (!user || !user.password) {
      throw clientError("User not found", 404);
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      throw clientError("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.users.update({
      where: { userid: userId },
      data: {
        password: passwordHash,
        lastupdatedat: utcNow(),
        lastupdatedby: userId
      }
    });

    return {
      message: "Password changed successfully"
    };
  }

  /**
   * Update user profile image
   */
  async updateProfileImage(userId, imageUrl) {
    if (imageUrl === undefined || imageUrl === null || String(imageUrl).trim() === "") {
      throw clientError("Image URL is required (or upload a file via POST /api/user/profile-image)");
    }

    const updatedUser = await prisma.users.update({
      where: { userid: userId },
      data: {
        profileimage: String(imageUrl).trim(),
        lastupdatedat: utcNow(),
        lastupdatedby: userId
      }
    });

    return {
      message: "Profile image updated successfully",
      profileimage: updatedUser.profileimage,
      user: this.toProfileDto(updatedUser)
    };
  }

  /**
   * Multipart file and/or imageUrl on body; returns refreshed login-style profile when getProfile is provided.
   */
  async uploadProfileImageFromRequest(auth, req, getProfile) {
    const removeImage =
      req.body?.remove === true ||
      req.body?.remove === "true" ||
      req.body?.clear === true ||
      req.body?.clear === "true";

    if (removeImage) {
      const cleared = await this.clearProfileImage(auth.userid);
      if (typeof getProfile === "function") {
        return getProfile(auth);
      }
      return cleared;
    }

    let imageUrl = req.body?.imageUrl ?? req.body?.profileimage;
    if (req.file) {
      const relative = `/uploads/profiles/${auth.userid}/${req.file.filename}`;
      imageUrl = buildPublicFileUrl(relative, req);
    }

    const updated = await this.updateProfileImage(auth.userid, imageUrl);
    if (typeof getProfile === "function") {
      return getProfile(auth);
    }
    return updated;
  }

  async clearProfileImage(userId) {
    const updatedUser = await prisma.users.update({
      where: { userid: userId },
      data: {
        profileimage: null,
        lastupdatedat: utcNow(),
        lastupdatedby: userId
      }
    });

    return {
      message: "Profile image removed",
      profileimage: null,
      user: this.toProfileDto(updatedUser)
    };
  }

  /**
   * Format user to profile DTO
   */
  toProfileDto(user) {
    return {
      userid: user.userid,
      name: user.name,
      email: user.email,
      contactno: user.contactno,
      profileimage: user.profileimage,
      allowFaceApprovalRequest: user.allowfaceapprovalrequest === true,
      faceAttendanceEnabled: user.faceattendanceenabled === true,
      gender: user.gender,
      country: user.country,
      city: user.city,
      usertype: user.usertype,
      technicianAffiliation: user.technicianaffiliation ?? null,
      companyName: user.companyname ?? null,
      isactive: user.isactive,
      createdat: user.createdat
    };
  }
}

module.exports = UserProfileService;
