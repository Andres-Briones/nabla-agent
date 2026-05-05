import { describe, expect, test } from "bun:test";
import { ErrorEnvelopeSchema } from "@nabla/shared/protocol/error";
import { Hono } from "hono";

import { makeAuthMiddleware } from "./middleware";

const KNOWN_TOKEN = "test-token-1234567890abcdefghijklmnopqrstuvwxyzAB";

const buildApp = (): Hono => {
  const app = new Hono();
  app.use("*", makeAuthMiddleware(KNOWN_TOKEN));
  app.get("/health", (c) => c.json({ status: "ok" }));
  return app;
};

const expectUnauthorizedEnvelope = async (res: Response): Promise<void> => {
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")?.toLowerCase()).toContain("bearer");
  const body = await res.json();
  const parsed = ErrorEnvelopeSchema.parse(body);
  expect(parsed.error.code).toBe("unauthorized");
  expect(parsed.error.message.length).toBeGreaterThan(0);
};

describe("DAEMON-04 bearer-auth middleware", () => {
  test("missing Authorization header -> 401 + envelope (Branch 1)", async () => {
    const res = await buildApp().fetch(new Request("http://x/health"));
    await expectUnauthorizedEnvelope(res);
  });

  test("malformed Authorization header -> 401 + envelope (Branch 2)", async () => {
    const res = await buildApp().fetch(
      new Request("http://x/health", {
        headers: { Authorization: "Basic dXNlcjpwYXNz" },
      }),
    );
    await expectUnauthorizedEnvelope(res);
  });

  test("wrong bearer token -> 401 + envelope (Branch 3)", async () => {
    const res = await buildApp().fetch(
      new Request("http://x/health", {
        headers: { Authorization: "Bearer wrong-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      }),
    );
    await expectUnauthorizedEnvelope(res);
  });

  test("correct bearer -> 200 from /health (Branch 4)", async () => {
    const res = await buildApp().fetch(
      new Request("http://x/health", {
        headers: { Authorization: `Bearer ${KNOWN_TOKEN}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  test("short bearer (length mismatch) does NOT throw -- still 401 (Pitfall E)", async () => {
    // Pitfall E: crypto.timingSafeEqual throws RangeError on unequal-length
    // buffers. The middleware MUST length-check first.
    const res = await buildApp().fetch(
      new Request("http://x/health", {
        headers: { Authorization: "Bearer x" },
      }),
    );
    await expectUnauthorizedEnvelope(res);
  });
});
