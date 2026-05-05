class MailService {
  async sendSignupVerification(to, code, url) {
    console.log(`[mail] signup verification to=${to} code=${code} url=${url}`);
  }

  async sendInvitation(to, payload) {
    console.log(`[mail] invitation to=${to}`, payload);
  }
}

module.exports = new MailService();
