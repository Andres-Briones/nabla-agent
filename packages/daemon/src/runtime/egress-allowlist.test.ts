// D-06 file-shape audit: v1 ships an empty allow-list. Phase 4 will
// populate it; until then, audit asserts version=1 and allow.length=0
// so a drift PR has to update both the file AND this test. Phase 4 will
// extend this test to assert in-effect iptables rules match the file.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("D-06 egress-allowlist.json (CONT-03 prop #7)", () => {
  test("v1 file shape: version=1, $schema set, allow=[]", () => {
    const raw = readFileSync("packages/daemon/src/runtime/egress-allowlist.json", "utf8");
    const parsed = JSON.parse(raw) as { version: number; $schema?: string; allow: unknown[] };
    expect(parsed.version).toBe(1);
    expect(parsed.$schema).toBeTruthy();
    expect(Array.isArray(parsed.allow)).toBe(true);
    expect(parsed.allow.length).toBe(0);
  });
});
