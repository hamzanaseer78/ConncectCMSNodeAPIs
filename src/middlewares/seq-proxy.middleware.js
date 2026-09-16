const httpProxy = require("http-proxy");
const logger = require("../utils/logger");

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return defaultValue;
}

function normalizeMountPath(value) {
  const raw = String(value || "/logs").trim();
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "") || "/logs";
}

function resolveMountPath() {
  if (process.env.SEQ_PUBLIC_PATH) {
    return normalizeMountPath(process.env.SEQ_PUBLIC_PATH);
  }

  const serverUrl = String(process.env.SEQ_SERVER_URL || "").trim();
  if (!serverUrl) return "/logs";

  try {
    const pathname = new URL(serverUrl).pathname.replace(/\/+$/, "");
    return normalizeMountPath(pathname || "/logs");
  } catch {
    return "/logs";
  }
}

function resolveUpstreamUrl() {
  const upstream = String(process.env.SEQ_UPSTREAM_URL || "http://127.0.0.1:5341").trim();
  return upstream.replace(/\/+$/, "");
}

function isProxyEnabled() {
  return parseBoolean(process.env.SEQ_PROXY_ENABLED, Boolean(process.env.SEQ_SERVER_URL));
}

function stripMountPrefix(url, mountPath) {
  if (url === mountPath) return "/";
  if (url.startsWith(`${mountPath}/`)) {
    const next = url.slice(mountPath.length);
    return next.startsWith("/") ? next : `/${next}`;
  }
  return url;
}

async function checkUpstreamReachable(upstreamUrl) {
  try {
    const url = new URL(upstreamUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${url.origin}/api`, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    }).catch(() => null);
    clearTimeout(timer);
    return Boolean(response && response.status < 500);
  } catch {
    return false;
  }
}

function createSeqProxy() {
  if (!isProxyEnabled()) {
    return null;
  }

  const mountPath = resolveMountPath();
  const upstreamUrl = resolveUpstreamUrl();
  const publicUrl = String(process.env.SEQ_SERVER_URL || "").trim().replace(/\/+$/, "");

  const proxy = httpProxy.createProxyServer({
    target: upstreamUrl,
    changeOrigin: true,
    ws: true,
    xfwd: true,
    cookieDomainRewrite: "",
    cookiePathRewrite: {
      "/": `${mountPath}/`
    }
  });

  proxy.on("proxyReq", (proxyReq, req) => {
    const forwardedHost = req.headers.host || (publicUrl ? new URL(publicUrl).host : undefined);
    const forwardedProto =
      req.headers["x-forwarded-proto"] ||
      (publicUrl && publicUrl.startsWith("https") ? "https" : "http");

    if (forwardedHost) {
      proxyReq.setHeader("X-Forwarded-Host", forwardedHost);
    }
    proxyReq.setHeader("X-Forwarded-Proto", forwardedProto);
    proxyReq.setHeader("X-Forwarded-Prefix", mountPath);
  });

  proxy.on("proxyRes", (proxyRes, req) => {
    const location = proxyRes.headers.location;
    if (location && location.startsWith("/") && !location.startsWith(mountPath)) {
      proxyRes.headers.location = `${mountPath}${location}`;
    }

    const cookies = proxyRes.headers["set-cookie"];
    if (Array.isArray(cookies)) {
      proxyRes.headers["set-cookie"] = cookies.map((cookie) => {
        let next = cookie;
        if (/;\s*Path=\//i.test(next) && !new RegExp(`;\\s*Path=${mountPath}/`, "i").test(next)) {
          next = next.replace(/;\s*Path=\//i, `; Path=${mountPath}/`);
        }
        return next;
      });
    }
  });

  function sendUnavailable(req, res, err) {
    if (!res || res.headersSent || res.writableEnded || typeof res.writeHead !== "function") {
      return;
    }

    const acceptsHtml = String(req?.headers?.accept || "").includes("text/html");
    if (acceptsHtml) {
      res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Seq unavailable</title></head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;">
  <h1>Seq log server is not running</h1>
  <p>The API proxy at <code>${mountPath}</code> could not reach Seq at <code>${upstreamUrl}</code>.</p>
  <p><strong>Error:</strong> ${err.message || "connection failed"}</p>
  <h2>On the server, run:</h2>
  <pre style="background:#f4f4f4;padding:1rem;overflow:auto;">docker run -d --name seq --restart unless-stopped \\
  -e ACCEPT_EULA=Y \\
  -e SEQ_API_CANONICALURI="${publicUrl}/" \\
  -v seq_data:/data \\
  -p 127.0.0.1:5341:80 \\
  datalust/seq

pm2 restart connect-cms-api</pre>
  <p>Then reload this page. Check: <code>/health</code> should show <code>upstreamReachable: true</code>.</p>
</body>
</html>`);
      return;
    }

    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Seq log server is unavailable",
        upstream: upstreamUrl,
        detail: err.message || "connection failed",
        hint: "Run: docker run -d --name seq -e ACCEPT_EULA=Y -p 127.0.0.1:5341:80 datalust/seq"
      })
    );
  }

  proxy.on("error", (err, req, res) => {
    logger.error("Seq proxy error", {
      MountPath: mountPath,
      UpstreamUrl: upstreamUrl,
      Path: req?.url || null
    }, err);
    sendUnavailable(req, res, err);
  });

  function middleware(req, res, next) {
    if (req.url !== mountPath && !req.url.startsWith(`${mountPath}/`)) {
      return next();
    }

    const originalUrl = req.url;
    req.url = stripMountPrefix(req.url, mountPath);

    proxy.web(req, res, { target: upstreamUrl }, (err) => {
      req.url = originalUrl;
      if (err) {
        sendUnavailable(req, res, err);
      }
    });
  }

  function handleUpgrade(req, socket, head) {
    if (req.url !== mountPath && !req.url.startsWith(`${mountPath}/`)) {
      return false;
    }

    req.url = stripMountPrefix(req.url, mountPath);
    proxy.ws(req, socket, head, { target: upstreamUrl });
    return true;
  }

  logger.info("Seq UI proxy enabled", {
    MountPath: mountPath,
    UpstreamUrl: upstreamUrl,
    PublicUrl: process.env.SEQ_SERVER_URL || null
  });

  return {
    mountPath,
    upstreamUrl,
    middleware,
    handleUpgrade,
    checkUpstreamReachable: () => checkUpstreamReachable(upstreamUrl)
  };
}

module.exports = {
  createSeqProxy,
  resolveMountPath,
  resolveUpstreamUrl,
  isProxyEnabled
};
