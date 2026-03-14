#!/usr/bin/env node
/**
 * Anti-flakiness gate for auth E2E tests.
 *
 * Runs the E2E auth test suite N times and computes a stability score.
 * Exits 1 if the test suite is detected as flaky (i.e., results differ
 * across runs), blocking the CI merge gate.
 *
 * Output: backend/flaky-report/flaky-auth-report.json
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RUNS = parseInt(process.env.FLAKY_RUNS ?? '3', 10);
const TEST_FILE = 'test/auth-flow.e2e-spec.ts';
const JEST_CONFIG = './test/jest-e2e.json';
const REPORT_DIR = path.join(__dirname, '..', 'flaky-report');
const REPORT_FILE = path.join(REPORT_DIR, 'flaky-auth-report.json');

fs.mkdirSync(REPORT_DIR, { recursive: true });

/** @type {{ run: number; status: 'PASS' | 'FAIL' }[]} */
const results = [];
let passes = 0;
let failures = 0;

console.log(`[flaky-gate] Running auth E2E suite ${RUNS} times to detect flakiness...`);

for (let i = 1; i <= RUNS; i++) {
  const cmd = `npx jest --config ${JEST_CONFIG} ${TEST_FILE} --forceExit --no-coverage 2>&1`;
  try {
    execSync(cmd, { stdio: 'pipe', cwd: path.join(__dirname, '..') });
    results.push({ run: i, status: 'PASS' });
    passes++;
    console.log(`  Run ${i}/${RUNS}: PASS`);
  } catch {
    results.push({ run: i, status: 'FAIL' });
    failures++;
    console.log(`  Run ${i}/${RUNS}: FAIL`);
  }
}

// Flaky = at least one PASS and at least one FAIL across runs
const isFlaky = passes > 0 && failures > 0;
// Consistent failure = every run failed
const isConsistentFailure = failures === RUNS;

const report = {
  totalRuns: RUNS,
  passes,
  failures,
  isFlaky,
  isConsistentFailure,
  runs: results,
  timestamp: new Date().toISOString(),
};

fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`\n[flaky-gate] Report written to ${REPORT_FILE}`);

if (isConsistentFailure) {
  console.error('[flaky-gate] ❌ CONSISTENT FAILURE — all runs failed. Blocking merge.');
  process.exit(1);
}

if (isFlaky) {
  console.error(
    `[flaky-gate] ❌ FLAKY DETECTED — ${failures}/${RUNS} runs failed. Blocking merge.`,
  );
  process.exit(1);
}

console.log(`[flaky-gate] ✅ STABLE — ${passes}/${RUNS} runs passed.`);
