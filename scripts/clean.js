#!/usr/bin/env node

/**
 * Cross-platform clean script (Windows/Linux/macOS).
 * Replaces `rm -rf ...` from package.json.
 */

const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const targets = [
  "dist",
  path.join("node_modules", ".cache"),
  ".eslintcache"
];

let removed = 0;

for (const item of targets) {
  const fullPath = path.join(rootDir, item);
  if (!fs.existsSync(fullPath)) continue;

  try {
    fs.rmSync(fullPath, { recursive: true, force: true });
    removed++;
  } catch (err) {
    // keep going; build should still proceed
    // eslint-disable-next-line no-console
    console.warn(`[CLEAN] Failed to remove ${item}: ${err.message}`);
  }
}

// eslint-disable-next-line no-console
console.log(`[CLEAN] Done. Removed ${removed}/${targets.length} targets.`);

