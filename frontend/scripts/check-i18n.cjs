'use strict';
/**
 * i18n conformity check — CI gate.
 *
 * Compares all keys between fr.json and en.json recursively.
 * Exits 1 if any key is present in one locale but missing in the other,
 * blocking the merge.
 *
 * Usage: node scripts/check-i18n.cjs
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'locales');
const FR_FILE = path.join(LOCALES_DIR, 'fr.json');
const EN_FILE = path.join(LOCALES_DIR, 'en.json');

/** Recursively extract all dot-notation keys from a nested object. */
function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

if (!fs.existsSync(FR_FILE) || !fs.existsSync(EN_FILE)) {
  console.error('[i18n-check] ❌ Locale files not found.');
  console.error(`  Expected: ${FR_FILE}`);
  console.error(`  Expected: ${EN_FILE}`);
  process.exit(1);
}

const fr = JSON.parse(fs.readFileSync(FR_FILE, 'utf8'));
const en = JSON.parse(fs.readFileSync(EN_FILE, 'utf8'));

const frKeys = new Set(flattenKeys(fr));
const enKeys = new Set(flattenKeys(en));

const missingInEn = [...frKeys].filter(k => !enKeys.has(k));
const missingInFr = [...enKeys].filter(k => !frKeys.has(k));

console.log(`[i18n-check] fr.json: ${frKeys.size} keys`);
console.log(`[i18n-check] en.json: ${enKeys.size} keys`);

let hasErrors = false;

if (missingInEn.length > 0) {
  console.error(`\n[i18n-check] ❌ ${missingInEn.length} key(s) in fr.json but MISSING in en.json:`);
  missingInEn.forEach(k => console.error(`  - ${k}`));
  hasErrors = true;
}

if (missingInFr.length > 0) {
  console.error(`\n[i18n-check] ❌ ${missingInFr.length} key(s) in en.json but MISSING in fr.json:`);
  missingInFr.forEach(k => console.error(`  - ${k}`));
  hasErrors = true;
}

if (hasErrors) {
  console.error('\n[i18n-check] ❌ i18n check FAILED — fix missing keys before merging.');
  process.exit(1);
}

console.log('\n[i18n-check] ✅ All keys are in sync across fr and en locales.');
