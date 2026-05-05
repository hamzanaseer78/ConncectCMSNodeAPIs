const bcrypt = require("bcryptjs");
const prisma = require("../../database/prisma");
const { utcNow } = require("../../utils/date");

class UserProfileService {
  /**
   * Get user profile with organization and branch details
   */
  async getProfile(userId) {
    const user = await prisma.users.findUnique({
      where: { userid: userId }
    });

    if (!user) {
      throw new Error("User not found");
    }

    return this.toProfileDto(user);
  }

  /**
   * Update user profile (name, email, contactno, gender, country, city)
   */
  async updateProfile(userId, profileData) {
    const user = await prisma.users.findUnique({
      where: { userid: userId }
    });

    if (!user) {
      throw new Error("User not found");
    }

    const updateData = {};
    
    if (profileData.name !== undefined) updateData.name = profileData.name;
    if (profileData.email !== undefined) updateData.email = profileData.email;
    if (profileData.contactno !== undefined) updateData.contactno = profileData.contactno;
    if (profileData.gender !== undefined) updateData.gender = profileData.gender;
    if (profileData.country !== undefined) updateData.country = profileData.country;
    if (profileData.city !== undefined) updateData.city = profileData.city;

    updateData.lastupdatedat = utcNow();
    updateData.lastupdatedby = userId;

    const updatedUser = await prisma.users.update({
      where: { userid: userId },
      data: updateData
    });

    return {
      message: "Profile updated successfully",
      user: this.toProfileDto(updatedUser)
    };
  }

  /**
   * Change user password
   */
  async changePassword(userId, oldPassword, newPassword) {
    if (!oldPassword || !newPassword) {
      throw new Error("Old password and new password are required");
    }

    if (newPassword.length < 6) {
      throw new Error("New password must be at least 6 characters");
    }

    const user = await prisma.users.findUnique({
      where: { userid: userId }
    });

    if (!user || !user.password) {
      throw new Error("User not found");
    }

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      throw new Error("Current password is incorrect");
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
    if (!imageUrl) {
      throw new Error("Image URL is required");
    }

    const updatedUser = await prisma.users.update({
      where: { userid: userId },
      data: {
        profileimage: imageUrl,
        lastupdatedat: utcNow(),
        lastupdatedby: userId
      }
    });

    return {
      message: "Profile image updated successfully",
      profileimage: updatedUser.profileimage
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
      gender: user.gender,
      country: user.country,
      city: user.city,
      isactive: user.isactive,
      createdat: user.createdat
    };
  }
}

module.exports = UserProfileService;
