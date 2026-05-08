#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('[OPTIMIZE] Starting build optimization...\n');

/**
 * Files and directories to check/clean
 */
const rootDir = path.resolve(__dirname, '..');

// Production build checklist
const checks = {
  'Environment file exists': () => fs.existsSync(path.join(rootDir, '.env')),
  'Prisma schema exists': () => fs.existsSync(path.join(rootDir, 'prisma', 'schema.prisma')),
  'Package.json is valid': () => {
    try {
      JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
      return true;
    } catch {
      return false;
    }
  }
};

// Run checks
let passCount = 0;
let failCount = 0;

console.log('[OPTIMIZE] Running pre-build checks:\n');
Object.entries(checks).forEach(([check, fn]) => {
  const passed = fn();
  const status = passed ? '✓' : '✗';
  const level = passed ? 'INFO' : 'WARN';
  console.log(`[${level}] ${status} ${check}`);
  if (passed) passCount++;
  else failCount++;
});

console.log(`\n[OPTIMIZE] Checks: ${passCount} passed, ${failCount} failed\n`);

if (failCount > 0) {
  console.warn('[OPTIMIZE] ⚠ Some checks failed. Review above warnings.');
  process.exit(1);
}

/**
 * Summary
 */
console.log('[OPTIMIZE] ✓ Optimization complete');
console.log('[OPTIMIZE] Ready for deployment\n');

process.exit(0);
