function textResult(data, { isError = false } = {}) {
  const text =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text", text }],
    isError
  };
}

function errorResult(err) {
  const message = err?.message || String(err);
  return textResult({ error: message }, { isError: true });
}

module.exports = {
  textResult,
  errorResult
};
