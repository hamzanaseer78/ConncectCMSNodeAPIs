class AiMcpError extends Error {
  constructor(message, status = 500, code = "error") {
    super(message);
    this.name = "AiMcpError";
    this.status = status;
    this.code = code;
  }
}

module.exports = {
  AiMcpError
};
