const express = require("express");

const JSON_LIMIT = process.env.JSON_BODY_LIMIT || "256kb";
const jsonParser = express.json({ limit: JSON_LIMIT });

/**
 * Parse JSON bodies; tolerate empty JSON on POST/PUT/PATCH and skip parse on GET/HEAD.
 */
function parseJsonBody(req, res, next) {
  if (req.url === "/logs" || req.url.startsWith("/logs/")) {
    return next();
  }

  const method = req.method.toUpperCase();
  const contentType = String(req.headers["content-type"] || "");
  const isJson = contentType.toLowerCase().includes("application/json");

  if (!isJson) {
    return next();
  }

  if (method === "GET" || method === "HEAD") {
    req.body = req.body || {};
    return next();
  }

  const contentLength = req.headers["content-length"];
  if (contentLength === "0" || contentLength === "") {
    req.body = {};
    return next();
  }

  return jsonParser(req, res, (err) => {
    if (!err) {
      return next();
    }
    if (err.type === "entity.parse.failed") {
      const friendly = new Error(formatJsonParseError(err));
      friendly.status = 400;
      friendly.type = "entity.parse.failed";
      return next(friendly);
    }
    return next(err);
  });
}

function formatJsonParseError(err) {
  const detail = String(err.message || "").trim();

  if (/unexpected end of json input/i.test(detail)) {
    return (
      "Request body is empty but Content-Type is application/json. " +
      "Send a valid JSON object (example below) or remove the Content-Type header when there is no body.\n" +
      'Example: {"name":"Zeeshan Haider","email":"a@b.com","contactno":"033345124124","isactive":true,"countryname":"Pakistan","cityname":"Samundari","areaname":"Chak No 192 GB"}'
    );
  }

  if (detail) {
    return `Invalid JSON: ${detail}. Use double quotes for keys and strings; no trailing commas or comments.`;
  }

  return "Invalid JSON body.";
}

module.exports = parseJsonBody;
