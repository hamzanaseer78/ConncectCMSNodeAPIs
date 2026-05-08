#!/usr/bin/env node

/**
 * Production Cleanup Script
 * Removes unnecessary files for deployment
 * Run: npm run pre-deploy
 */

const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();

// Files/directories that are safe to remove for production
const productionCleanup = [
  // Documentation files (optional - keep README.md, DEPLOYMENT_GUIDE.md)
  'QUICK_START.md',
  'API_ARCHITECTURE.md',
  'IMPLEMENTATION_SUMMARY.md',
  'OPTIMIZATION_REPORT.md',
  'FEATURES_GUIDE.md',
  'DEPLOYMENT_CHECKLIST.md',
  
  // Development files
  'test-api.js',
  'nodemon.json',
  'setup.js',
  
  // Development directories
  '__tests__',
  'examples',
  'docs',
  
  // IDE
  '.vscode',
  '.idea'
];

console.log('\n[CLEANUP] Starting production cleanup...\n');

let removedCount = 0;
let skippedCount = 0;

productionCleanup.forEach(item => {
  const fullPath = path.join(rootDir, item);
  
  if (fs.existsSync(fullPath)) {
    try {
      if (fs.lstatSync(fullPath).isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fullPath);
      }
      console.log(`[CLEANUP] ✓ Removed: ${item}`);
      removedCount++;
    } catch (err) {
      console.warn(`[CLEANUP] ⚠ Failed to remove ${item}: ${err.message}`);
      skippedCount++;
    }
  } else {
    skippedCount++;
  }
});

console.log(`\n[CLEANUP] Cleanup complete: ${removedCount} removed, ${skippedCount} skipped\n`);

// Create .npmrc for production installs
const npmrcContent = `audit=false
fund=false
legacy-peer-deps=false
`;

fs.writeFileSync(path.join(rootDir, '.npmrc'), npmrcContent);
console.log('[CLEANUP] ✓ Created .npmrc for optimized npm installs\n');

// Create logs directory if it doesn't exist
const logsDir = path.join(rootDir, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log('[CLEANUP] ✓ Created logs directory\n');
}

console.log('[CLEANUP] ✓ Production cleanup finished\n');
process.exit(0);
