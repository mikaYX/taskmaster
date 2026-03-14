#!/usr/bin/env node
/**
 * Context-aware prisma generate wrapper.
 *
 * Prisma generates its client to <package>/node_modules/.prisma/client by default.
 *
 * With npm workspaces, @prisma/client is hoisted to <root>/node_modules/@prisma/client.
 * It resolves the generated client via require('.prisma/client'), which maps to
 * <root>/node_modules/.prisma/client — a different location.
 *
 * This script:
 *  1. Always runs prisma generate (default output: backend/node_modules/.prisma/client).
 *  2. In workspace mode: syncs the generated client to <root>/node_modules/.prisma/client
 *     so that the hoisted @prisma/client can find it.
 *  3. In standalone mode: nothing extra needed — the default path is correct.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const backendDir = path.resolve(__dirname, '..');
const rootNodeModules = path.resolve(backendDir, '..', 'node_modules');
const isWorkspace = fs.existsSync(rootNodeModules);

// Step 1: Generate (always)
console.log('[prisma-generate] Generating Prisma client...');
try {
  execSync('npx prisma generate', { stdio: 'inherit', cwd: backendDir });
} catch (err) {
  process.exit(err.status ?? 1);
}

// Step 2: In workspace mode, sync generated client to root node_modules
if (isWorkspace) {
  const src = path.join(backendDir, 'node_modules', '.prisma', 'client');
  const dst = path.join(rootNodeModules, '.prisma', 'client');

  if (!fs.existsSync(src)) {
    console.warn('[prisma-generate] Warning: generated client not found at', src);
    process.exit(0);
  }

  console.log(`[prisma-generate] Workspace mode — syncing to ${dst}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });

  // Remove stale destination before copy
  if (fs.existsSync(dst)) {
    fs.rmSync(dst, { recursive: true, force: true });
  }

  // Recursive copy
  copyDirSync(src, dst);
  console.log('[prisma-generate] Sync complete.');
} else {
  console.log('[prisma-generate] Standalone mode — no sync needed.');
}

function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
