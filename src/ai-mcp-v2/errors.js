class AiMcpError extends Error {
  constructor(message, status = 500, code = "error", details = {}) {
    super(message);
    this.name = "AiMcpError";
    this.status = status;
    this.code = code;
    this.details = details && typeof details === "object" ? details : {};
  }
}

module.exports = {
  AiMcpError
};
