/**
 * Seq structured log sink (CLEF over HTTP).
 * https://docs.datalust.co/docs/posting-raw-events
 */

const FLUSH_INTERVAL_MS = Math.max(Number(process.env.SEQ_FLUSH_INTERVAL_MS || 2000), 500);
const MAX_BATCH_SIZE = Math.max(Number(process.env.SEQ_BATCH_SIZE || 50), 1);
const FAILURE_LOG_INTERVAL_MS = 60000;

const queue = [];
let flushTimer = null;
let flushing = false;
let lastFailureLogAt = 0;

const LEVEL_MAP = {
  trace: "Verbose",
  debug: "Debug",
  info: "Information",
  warn: "Warning",
  error: "Error",
  fatal: "Fatal"
};

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return defaultValue;
}

function isEnabled() {
  if (!getIngestBaseUrl()) {
    return false;
  }
  return parseBoolean(process.env.SEQ_LOGGING_ENABLED, true);
}

/** Direct local Seq URL for ingest — avoids routing through the public /logs proxy. */
function getIngestBaseUrl() {
  const upstream = String(process.env.SEQ_UPSTREAM_URL || "").trim();
  if (upstream) {
    return upstream.replace(/\/$/, "");
  }

  const publicUrl = String(process.env.SEQ_SERVER_URL || "").trim();
  if (publicUrl) {
    return publicUrl.replace(/\/$/, "");
  }

  return null;
}

function getServerUrl() {
  return getIngestBaseUrl();
}

function normalizeProperties(properties = {}) {
  const next = {};
  Object.entries(properties).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value instanceof Error) {
      next[`${key}Message`] = value.message;
      next[`${key}Stack`] = value.stack;
      return;
    }
    next[key] = value;
  });
  return next;
}

function createClefEvent(level, message, properties = {}, err = null) {
  const event = {
    "@t": new Date().toISOString(),
    "@m": message,
    "@l": LEVEL_MAP[level] || LEVEL_MAP.info,
    Application: process.env.SEQ_APPLICATION_NAME || "ConnectCMS-API",
    Environment: process.env.NODE_ENV || "development",
    ...normalizeProperties(properties)
  };

  if (err) {
    event["@x"] = err.stack || String(err);
    event.ErrorMessage = err.message || String(err);
    if (err.code) event.ErrorCode = String(err.code);
    if (err.status || err.statusCode) event.ErrorStatus = Number(err.status || err.statusCode);
  }

  return event;
}

function scheduleFlush() {
  if (!isEnabled() || flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flush();
  }, FLUSH_INTERVAL_MS);
  if (typeof flushTimer.unref === "function") {
    flushTimer.unref();
  }
}

async function sendBatch(events) {
  if (!events.length) return;

  const url = `${getServerUrl()}/api/events/raw?clef`;
  const headers = {
    "Content-Type": "application/vnd.serilog.clef"
  };
  if (process.env.SEQ_API_KEY) {
    headers["X-Seq-ApiKey"] = process.env.SEQ_API_KEY;
  }

  const body = events.map((event) => JSON.stringify(event)).join("\n");

  const response = await fetch(url, {
    method: "POST",
    headers,
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Seq ingest failed (${response.status})${text ? `: ${text}` : ""}`);
  }
}

async function flush() {
  if (!isEnabled() || flushing || !queue.length) return;
  flushing = true;

  try {
    while (queue.length) {
      const batch = queue.splice(0, MAX_BATCH_SIZE);
      await sendBatch(batch);
    }
  } catch (err) {
    const now = Date.now();
    if (now - lastFailureLogAt >= FAILURE_LOG_INTERVAL_MS) {
      lastFailureLogAt = now;
      console.error(
        "[SEQ] Failed to send logs:",
        err.message,
        `(ingest: ${getIngestBaseUrl()}/api/events/raw — start Seq to enable)`
      );
    }
  } finally {
    flushing = false;
    if (queue.length) {
      scheduleFlush();
    }
  }
}

function enqueue(level, message, properties = {}, err = null) {
  if (!isEnabled()) return;
  queue.push(createClefEvent(level, message, properties, err));
  if (queue.length >= MAX_BATCH_SIZE) {
    flush().catch(() => {});
    return;
  }
  scheduleFlush();
}

async function flushAndClose() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flush();
}

module.exports = {
  isEnabled,
  enqueue,
  flush,
  flushAndClose,
  createClefEvent
};
