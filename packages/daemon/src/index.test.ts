import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { resolveDaemonHost } from "./index";

const ORIG = process.env.NABLA_DAEMON_HOST;

beforeEach(() => {
  delete process.env.NABLA_DAEMON_HOST;
});

afterEach(() => {
  if (ORIG !== undefined) process.env.NABLA_DAEMON_HOST = ORIG;
  else delete process.env.NABLA_DAEMON_HOST;
});

describe("resolveDaemonHost (ADR-0003 invariant #9)", () => {
  test("defaults to 127.0.0.1 when NABLA_DAEMON_HOST is unset", () => {
    expect(resolveDaemonHost()).toBe("127.0.0.1");
  });

  test("returns NABLA_DAEMON_HOST when set", () => {
    process.env.NABLA_DAEMON_HOST = "0.0.0.0";
    expect(resolveDaemonHost()).toBe("0.0.0.0");
  });

  test("propagates an arbitrary hostname (e.g., a v2 internal DNS name)", () => {
    process.env.NABLA_DAEMON_HOST = "nabla.internal";
    expect(resolveDaemonHost()).toBe("nabla.internal");
  });
});
