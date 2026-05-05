#!/usr/bin/env bun
// D-26: license-CI gate extension to image content. Mirrors the structure
// of scripts/license-audit.ts (npm side); reuses scripts/spdx.ts for SPDX
// expression handling. Exits 1 on any violation.
//
// Walks images/worker/profiles/*/ and asserts:
//   1. Every packages.list line has a matching apt-licenses.json entry
//      with the same version (no orphans either way).
//   2. Every apt-licenses.json license is allowed by allowed-image.json.
//
// The npm-side allow-list (.licenses/allowed.json) is NOT consulted -- the
// image-content carve-out (RESEARCH A1) is intentional.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { isAllowed } from "./spdx";

interface AllowedImage { licenses: string[] }
interface AptLicensesPackages { [pkg: string]: { version: string; license: string } }
interface AptLicensesFile { packages: AptLicensesPackages }

const ALLOW_LIST_PATH = process.env["NABLA_AUDIT_ALLOW_LIST"] ?? "images/worker/.licenses/allowed-image.json";
const PROFILES_DIR    = process.env["NABLA_AUDIT_PROFILES_DIR"] ?? "images/worker/profiles";

const allowed = JSON.parse(readFileSync(ALLOW_LIST_PATH, "utf8")) as AllowedImage;
const allowedSet = new Set(allowed.licenses);

interface Violation { profile: string; pkg: string; reason: string }
const violations: Violation[] = [];

const parsePackagesList = (raw: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) {
      violations.push({ profile: "", pkg: trimmed, reason: "no '=<version>' suffix" });
      continue;
    }
    out.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return out;
};

for (const profile of readdirSync(PROFILES_DIR)) {
  const dir = join(PROFILES_DIR, profile);
  if (!statSync(dir).isDirectory()) continue;
  const pkgListPath = join(dir, "packages.list");
  const aptLicPath  = join(dir, "apt-licenses.json");
  let pkgList: Map<string, string>;
  let aptLic: AptLicensesPackages;
  try {
    pkgList = parsePackagesList(readFileSync(pkgListPath, "utf8"));
    aptLic  = (JSON.parse(readFileSync(aptLicPath, "utf8")) as AptLicensesFile).packages ?? {};
  } catch (err) {
    violations.push({ profile, pkg: "(profile)", reason: String(err) });
    continue;
  }

  // Forward check: every packages.list entry has matching apt-licenses entry.
  for (const [name, version] of pkgList) {
    const lic = aptLic[name];
    if (!lic) {
      violations.push({ profile, pkg: name, reason: "missing apt-licenses.json entry" });
      continue;
    }
    if (lic.version !== version) {
      violations.push({ profile, pkg: name, reason: `version mismatch (packages.list=${version} vs apt-licenses.json=${lic.version})` });
    }
    if (!isAllowed(lic.license, allowedSet)) {
      violations.push({ profile, pkg: name, reason: `license '${lic.license}' not in allowed-image.json` });
    }
  }
  // Reverse check: every apt-licenses entry has matching packages.list entry.
  for (const name of Object.keys(aptLic)) {
    if (!pkgList.has(name)) {
      violations.push({ profile, pkg: name, reason: "stale apt-licenses.json entry (no matching packages.list line)" });
    }
  }
}

if (violations.length > 0) {
  console.error(`Image-license audit FAILED: ${violations.length} violation(s)`);
  for (const v of violations) {
    console.error(`  - [${v.profile}] ${v.pkg}: ${v.reason}`);
  }
  process.exit(1);
}
console.log(`Image-license audit OK (${allowedSet.size} allowed identifiers).`);
