import { describe, expect, test } from "bun:test";

import { assertImageMatchesVersion, expectedImageTag } from "./version-check";

describe("D-03 image-version coupling", () => {
  test("expectedImageTag composes 'nabla-worker:<version>-<profile>'", () => {
    expect(expectedImageTag("0.0.1", "minimal")).toBe("nabla-worker:0.0.1-minimal");
  });

  test("matching tag: returns void without throwing", () => {
    expect(() =>
      assertImageMatchesVersion("0.0.1", "minimal", "nabla-worker:0.0.1-minimal"),
    ).not.toThrow();
  });

  test("version mismatch: throws with code 'version-mismatch'", () => {
    try {
      assertImageMatchesVersion("0.0.1", "minimal", "nabla-worker:0.0.2-minimal");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as { code?: string }).code).toBe("version-mismatch");
      expect(String(err)).toContain("0.0.1");
      expect(String(err)).toContain("0.0.2");
    }
  });

  test("profile mismatch: throws with code 'version-mismatch'", () => {
    expect(() =>
      assertImageMatchesVersion("0.0.1", "minimal", "nabla-worker:0.0.1-node"),
    ).toThrow();
  });
});
