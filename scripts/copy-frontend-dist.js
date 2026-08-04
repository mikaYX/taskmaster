#!/usr/bin/env node
'use strict';

/**
 * Copies the built frontend (frontend/dist) into a `client/` directory that
 * backend/src/main.ts serves as the SPA (see getClientDir() in
 * backend/src/config/app-paths.ts). Root `npm run build` builds both
 * workspaces but never performed this copy on its own — both Dockerfiles did
 * it manually as an image-build step. Cross-platform (fs.cpSync), so the
 * same script runs unchanged from `npm run build` and from the Windows
 * installer's build.ps1.
 *
 * Usage: node scripts/copy-frontend-dist.js [sourceDir] [destDir]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const source = process.argv[2] || path.join(repoRoot, 'frontend', 'dist');
const destination = process.argv[3] || path.join(repoRoot, 'client');

if (!fs.existsSync(source)) {
  console.error(`copy-frontend-dist: source not found: ${source}`);
  console.error('Run "npm run build:frontend" first.');
  process.exit(1);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });

console.log(`copy-frontend-dist: copied ${source} -> ${destination}`);
