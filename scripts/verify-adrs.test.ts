// Structural verifier for the three Phase-0 ADRs.
//
// RESEARCH.md Pitfall F: ADRs treated as documentation, not contract.
// This test asserts presence + format so later-phase verifiers (Phase 1
// docker-flag audit reading ADR-0001, Phase 4 Meridian-disabled gate
// reading ADR-0002, every-later-phase invariant gate reading ADR-0003)
// can rely on a stable shape.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { extractVerificationItems } from "@nabla/shared/runtime/adr-verification";

const DECISIONS_DIR = "docs/decisions";
const expectedKeywords = ["container-threat-model", "meridian-risk", "v1-to-v2-invariants"];

const adrFiles = (): string[] =>
  readdirSync(DECISIONS_DIR)
    .filter((f) => /^000[1-9]-.+\.md$/.test(f))
    .sort();

describe("Phase 0 SC#5 — ADRs present and verifiable", () => {
  test("exactly three ADR files exist", () => {
    expect(adrFiles().length).toBe(3);
  });

  test("ADR filenames cover container/meridian/v1-to-v2 topics", () => {
    const names = adrFiles().map((f) => f.toLowerCase());
    for (const keyword of expectedKeywords) {
      expect(names.some((n) => n.includes(keyword))).toBe(true);
    }
  });

  test("each ADR has MADR 4.0 front matter (status, date)", () => {
    for (const f of adrFiles()) {
      const body = readFileSync(join(DECISIONS_DIR, f), "utf8");
      expect(body.startsWith("---\n")).toBe(true);
      const parts = body.split(/^---\s*$/m);
      // parts[0] is "" (before opening fence), parts[1] is the front matter,
      // parts[2..] is the body. Front matter must declare status and date.
      const frontMatter = parts[1] ?? "";
      expect(/^\s*status:/m.test(frontMatter)).toBe(true);
      expect(/^\s*date:/m.test(frontMatter)).toBe(true);
    }
  });

  test("each ADR has a ## Verification heading with >=3 bulleted items", () => {
    for (const f of adrFiles()) {
      const body = readFileSync(join(DECISIONS_DIR, f), "utf8");
      expect(body.includes("## Verification")).toBe(true);
      const items = extractVerificationItems(body);
      expect(items.length).toBeGreaterThanOrEqual(3);
    }
  });

  test("docs/decisions/README.md references all three ADR filenames", () => {
    const readme = readFileSync(join(DECISIONS_DIR, "README.md"), "utf8");
    for (const f of adrFiles()) {
      expect(readme.includes(f)).toBe(true);
    }
  });
});
