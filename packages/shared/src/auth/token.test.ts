import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defaultConfigDir, defaultTokenPath, resolveToken } from "./token";

const ORIG_ENV = {
  NABLA_TOKEN: process.env.NABLA_TOKEN,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
  HOME: process.env.HOME,
};

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "nabla-token-test-"));
  delete process.env.NABLA_TOKEN;
  delete process.env.XDG_CONFIG_HOME;
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
  if (ORIG_ENV.NABLA_TOKEN !== undefined) process.env.NABLA_TOKEN = ORIG_ENV.NABLA_TOKEN;
  else delete process.env.NABLA_TOKEN;
  if (ORIG_ENV.XDG_CONFIG_HOME !== undefined)
    process.env.XDG_CONFIG_HOME = ORIG_ENV.XDG_CONFIG_HOME;
  else delete process.env.XDG_CONFIG_HOME;
});

describe("resolveToken (D-03 precedence)", () => {
  test("env wins over file", async () => {
    process.env.NABLA_TOKEN = "env-token-xyz";
    process.env.XDG_CONFIG_HOME = workdir;
    mkdirSync(join(workdir, "nabla"), { recursive: true });
    writeFileSync(join(workdir, "nabla", "token"), "file-token-abc");

    expect(await resolveToken()).toBe("env-token-xyz");
  });

  test("XDG file path used when env unset", async () => {
    process.env.XDG_CONFIG_HOME = workdir;
    mkdirSync(join(workdir, "nabla"), { recursive: true });
    writeFileSync(join(workdir, "nabla", "token"), "xdg-token-123");

    expect(await resolveToken()).toBe("xdg-token-123");
  });

  test("returns null when neither env nor file present (no minting)", async () => {
    process.env.XDG_CONFIG_HOME = workdir;
    expect(await resolveToken()).toBeNull();
  });

  test("env empty string falls through to file lookup", async () => {
    process.env.NABLA_TOKEN = "";
    process.env.XDG_CONFIG_HOME = workdir;
    mkdirSync(join(workdir, "nabla"), { recursive: true });
    writeFileSync(join(workdir, "nabla", "token"), "fallback-token");
    expect(await resolveToken()).toBe("fallback-token");
  });

  test("whitespace-only file content treated as missing", async () => {
    process.env.XDG_CONFIG_HOME = workdir;
    mkdirSync(join(workdir, "nabla"), { recursive: true });
    writeFileSync(join(workdir, "nabla", "token"), "   \n");
    expect(await resolveToken()).toBeNull();
  });
});

describe("defaultConfigDir / defaultTokenPath", () => {
  test("defaultConfigDir honors XDG_CONFIG_HOME", () => {
    process.env.XDG_CONFIG_HOME = "/x";
    expect(defaultConfigDir()).toBe("/x/nabla");
  });

  test("defaultConfigDir falls back to homedir/.config/nabla when XDG unset", () => {
    delete process.env.XDG_CONFIG_HOME;
    const dir = defaultConfigDir();
    expect(dir.endsWith("/.config/nabla")).toBe(true);
  });

  test("defaultTokenPath joins config dir with TOKEN_FILENAME", () => {
    process.env.XDG_CONFIG_HOME = "/x";
    expect(defaultTokenPath()).toBe("/x/nabla/token");
  });
});
