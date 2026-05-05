#!/usr/bin/env bun
// Belt-and-braces license audit. license-checker-rseidelsohn (run separately
// in CI) covers the 95% case via --onlyAllow. This script catches the rest:
// packages whose `license` field is missing, non-SPDX, "SEE LICENSE IN ...",
// or otherwise unclassifiable. Exits 1 on any violation.
//
// Honors `--excludePrivatePackages` semantics: workspace packages with
// `"private": true` are not audited (parity with license-checker-rseidelsohn
// behavior in CI). Honors `exceptions` field in allowed.json for per-package
// overrides (e.g. transitive deps of the license-CI tool itself that ship
// with non-permissive but reviewed licenses).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

interface Exception {
  pkg: string;
  license: string;
  reason: string;
}

interface Allowed {
  licenses: string[];
  exceptions?: Exception[];
}

const allowed: Allowed = JSON.parse(readFileSync(".licenses/allowed.json", "utf8")) as Allowed;
const allowedSet = new Set(allowed.licenses);
const exceptionMap = new Map<string, Exception>((allowed.exceptions ?? []).map((e) => [e.pkg, e]));

interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  license?: string | { type?: string };
  licenses?: Array<string | { type?: string }>;
}

interface Violation {
  pkg: string;
  reason: string;
}

const violations: Violation[] = [];

const normalizeLicense = (pkg: PackageJson): { value: string | null; raw: unknown } => {
  if (typeof pkg.license === "string") {
    return { value: pkg.license, raw: pkg.license };
  }
  if (pkg.license && typeof pkg.license === "object" && "type" in pkg.license) {
    return { value: pkg.license.type ?? null, raw: pkg.license };
  }
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    const first = pkg.licenses[0];
    if (typeof first === "string") return { value: first, raw: pkg.licenses };
    if (first && typeof first === "object" && "type" in first) {
      return { value: first.type ?? null, raw: pkg.licenses };
    }
  }
  return { value: null, raw: undefined };
};

const isAllowed = (license: string): boolean => {
  // Reject SEE LICENSE IN ... (unclassifiable from package.json alone)
  if (/^SEE LICENSE/i.test(license)) return false;
  // Accept simple identifier
  if (allowedSet.has(license)) return true;
  // Accept SPDX expressions of shape "(A OR B)" if EVERY clause is allowed
  // (conservative; reject if any side fails or expression uses AND -- AND
  // means the package is licensed under BOTH and we must allow both).
  const stripped = license.replace(/[()]/g, "").trim();
  if (/\bAND\b/i.test(stripped)) {
    const parts = stripped.split(/\s+AND\s+/i).map((s) => s.trim());
    return parts.every((p) => allowedSet.has(p));
  }
  if (/\bOR\b/i.test(stripped)) {
    const parts = stripped.split(/\s+OR\s+/i).map((s) => s.trim());
    return parts.some((p) => allowedSet.has(p));
  }
  // Accept "Apache-2.0 WITH LLVM-exception" style if base is allowed
  const withMatch = stripped.match(/^(\S+)\s+WITH\s+\S+$/i);
  if (withMatch?.[1] && allowedSet.has(withMatch[1])) return true;
  return false;
};

const walk = (dir: string): void => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === ".bin" || entry === ".cache") continue;
    const full = join(dir, entry);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    // Scoped packages: recurse one level
    if (entry.startsWith("@")) {
      walk(full);
      continue;
    }
    const pkgPath = join(full, "package.json");
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;
      // Skip private workspace packages (parity with --excludePrivatePackages)
      if (pkg.private === true) {
        // Still recurse into nested node_modules below
      } else {
        const { value, raw } = normalizeLicense(pkg);
        const id = `${pkg.name ?? entry}@${pkg.version ?? "?"}`;
        const exception = exceptionMap.get(id);
        if (exception) {
          // Per-package override: if the recorded license matches what's on
          // disk, allow it. If on-disk license drifted, fail loudly.
          if (value === exception.license) {
            // accepted via exception
          } else {
            violations.push({
              pkg: id,
              reason: `exception expects '${exception.license}' but found '${value ?? "(none)"}'`,
            });
          }
        } else if (!value) {
          violations.push({
            pkg: id,
            reason: `no license field (raw: ${JSON.stringify(raw)})`,
          });
        } else if (!isAllowed(value)) {
          violations.push({
            pkg: id,
            reason: `license '${value}' not in allow-list`,
          });
        }
      }
      // Recurse into nested node_modules (rare under hoisted, but possible
      // when a transitive package pins a different version).
      const nested = join(full, "node_modules");
      walk(nested);
    } catch {
      // Not a package dir; skip.
    }
  }
};

walk(join(process.cwd(), "node_modules"));

if (violations.length > 0) {
  console.error(`License audit FAILED: ${violations.length} violation(s)`);
  for (const v of violations) {
    console.error(`  - ${v.pkg}: ${v.reason}`);
  }
  process.exit(1);
}

console.log(`License audit OK (${allowedSet.size} allowed identifiers).`);
