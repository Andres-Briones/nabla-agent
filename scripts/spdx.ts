// SPDX expression parser for license audits (D-26 + PATTERNS.md S5).
// Reused by both scripts/license-audit.ts (npm side) and
// scripts/audit-image-licenses.ts (image-content side).
// DO NOT re-implement — import from this file.

export const isAllowed = (license: string, allowed: Set<string>): boolean => {
  // Reject "SEE LICENSE IN ..." (unclassifiable from package.json alone)
  if (/^SEE LICENSE/i.test(license)) return false;
  // Accept simple identifier
  if (allowed.has(license)) return true;
  // Strip parentheses for expression parsing
  const stripped = license.replace(/[()]/g, "").trim();
  // Accept SPDX expressions of shape "(A AND B)" if EVERY clause is allowed
  // (conservative; AND means the package is licensed under BOTH)
  if (/\bAND\b/i.test(stripped)) {
    const parts = stripped.split(/\s+AND\s+/i).map((s) => s.trim());
    return parts.every((p) => allowed.has(p));
  }
  // Accept SPDX expressions of shape "(A OR B)" if ANY clause is allowed
  if (/\bOR\b/i.test(stripped)) {
    const parts = stripped.split(/\s+OR\s+/i).map((s) => s.trim());
    return parts.some((p) => allowed.has(p));
  }
  // Accept "Apache-2.0 WITH LLVM-exception" style if base is allowed
  const withMatch = stripped.match(/^(\S+)\s+WITH\s+\S+$/i);
  if (withMatch?.[1] && allowed.has(withMatch[1])) return true;
  return false;
};
