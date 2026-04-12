/**
 * Safe JSON parsing utility.
 *
 * Prevents prototype pollution attacks where crafted JSON payloads containing
 * "__proto__", "constructor", or "prototype" keys can corrupt Object.prototype
 * and affect unrelated parts of the application.
 *
 * Usage:
 *   safeJsonParse(str)           // returns null on failure
 *   safeJsonParse(str, [])       // returns [] on failure
 */

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizingReviver(key, value) {
  if (DANGEROUS_KEYS.has(key)) {
    return undefined;
  }
  return value;
}

export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str, sanitizingReviver);
  } catch {
    return fallback;
  }
}
