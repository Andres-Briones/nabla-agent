import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveOrInitToken } from "./token-init";

const ORIG_ENV = {
  NABLA_TOKEN: process.env.NABLA_TOKEN,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
};

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "nabla-token-init-"));
  delete process.env.NABLA_TOKEN;
  process.env.XDG_CONFIG_HOME = workdir;
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  if (ORIG_ENV.NABLA_TOKEN !== undefined) process.env.NABLA_TOKEN = ORIG_ENV.NABLA_TOKEN;
  else delete process.env.NABLA_TOKEN;
  if (ORIG_ENV.XDG_CONFIG_HOME !== undefined)
    process.env.XDG_CONFIG_HOME = ORIG_ENV.XDG_CONFIG_HOME;
  else delete process.env.XDG_CONFIG_HOME;
});

describe("resolveOrInitToken (D-01 self-init, D-02 shape, D-03 modes)", () => {
  test("first run mints a token", async () => {
    const token = await resolveOrInitToken();
    // base64url charset: A-Z a-z 0-9 - _   (no padding)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes -> ceil(32 * 4 / 3) = 43 chars (no padding)
    expect(token.length).toBeGreaterThanOrEqual(42);
    expect(token.length).toBeLessThanOrEqual(44);
  });

  test("token file is mode 0600", async () => {
    await resolveOrInitToken();
    const path = join(workdir, "nabla", "token");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test("parent dir is mode 0700", async () => {
    await resolveOrInitToken();
    const dir = join(workdir, "nabla");
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  test("second call reads existing token without re-minting", async () => {
    const first = await resolveOrInitToken();
    const path = join(workdir, "nabla", "token");
    const mtime1 = statSync(path).mtimeMs;
    // Wait a tick to make sure mtime would change if a re-write happened
    await new Promise((r) => setTimeout(r, 10));
    const second = await resolveOrInitToken();
    const mtime2 = statSync(path).mtimeMs;
    expect(second).toBe(first);
    expect(mtime2).toBe(mtime1);
  });

  test("env override skips file mint", async () => {
    process.env.NABLA_TOKEN = "preset-token-zzz";
    const token = await resolveOrInitToken();
    expect(token).toBe("preset-token-zzz");
    // No nabla/ dir created
    let dirExists = true;
    try {
      statSync(join(workdir, "nabla"));
    } catch {
      dirExists = false;
    }
    expect(dirExists).toBe(false);
  });

  test("minted token decodes to exactly 32 raw bytes", async () => {
    const token = await resolveOrInitToken();
    // base64url -> base64 standard
    const std = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = std + "=".repeat((4 - (std.length % 4)) % 4);
    const bytes = Buffer.from(padded, "base64");
    expect(bytes.length).toBe(32);
  });
});
