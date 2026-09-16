const seqLogging = require("../config/seq-logging");

function writeConsole(level, message, properties, err) {
  const payload = properties && Object.keys(properties).length ? properties : undefined;
  if (level === "error" || level === "fatal") {
    if (err) {
      console.error(`[${level.toUpperCase()}] ${message}`, payload || "", err);
    } else {
      console.error(`[${level.toUpperCase()}] ${message}`, payload || "");
    }
    return;
  }
  if (level === "warn") {
    console.warn(`[${level.toUpperCase()}] ${message}`, payload || "");
    return;
  }
  if (level === "debug" || level === "trace") {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[${level.toUpperCase()}] ${message}`, payload || "");
    }
    return;
  }
  console.log(`[${level.toUpperCase()}] ${message}`, payload || "");
}

function log(level, message, properties = {}, err = null) {
  writeConsole(level, message, properties, err);
  if (seqLogging.isEnabled()) {
    seqLogging.enqueue(level, message, properties, err);
  }
}

const logger = {
  trace(message, properties) {
    log("trace", message, properties);
  },
  debug(message, properties) {
    log("debug", message, properties);
  },
  info(message, properties) {
    log("info", message, properties);
  },
  warn(message, properties, err) {
    log("warn", message, properties, err);
  },
  error(message, properties, err) {
    log("error", message, properties, err);
  },
  fatal(message, properties, err) {
    log("fatal", message, properties, err);
  },
  async flush() {
    await seqLogging.flush();
  },
  async close() {
    await seqLogging.flushAndClose();
  },
  isSeqEnabled() {
    return seqLogging.isEnabled();
  }
};

module.exports = logger;
