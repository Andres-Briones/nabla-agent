import { describe, expect, test } from "bun:test";
import { ErrorEnvelopeSchema } from "@nabla/shared/protocol/error";
import { Hono } from "hono";

import { makeAuthMiddleware } from "../auth/middleware";
import { stubEventsRoute } from "./stub-events";

const KNOWN_TOKEN = "stub-events-test-token-aaaaaaaaaaaaaaaaaaaaaaaaA";

const buildApp = (): Hono => {
  const app = new Hono();
  app.use("*", makeAuthMiddleware(KNOWN_TOKEN));
  app.route("/runs/_stub/events", stubEventsRoute);
  return app;
};

describe("DAEMON-02 SSE stub plumbing", () => {
  test("no bearer -> 401 envelope (auth runs before route)", async () => {
    const res = await buildApp().fetch(new Request("http://x/runs/_stub/events"));
    expect(res.status).toBe(401);
    const body = await res.json();
    const parsed = ErrorEnvelopeSchema.parse(body);
    expect(parsed.error.code).toBe("unauthorized");
  });

  test("with bearer -> 200 + text/event-stream + 'event: not-implemented' frame", async () => {
    // Hono's streamSSE does NOT preserve c.status() (verified against
    // hono/src/helper/streaming/sse.ts: only sets headers + returns
    // c.newResponse(stream.responseReadable)). The "not implemented" signal
    // is therefore carried in-band by the SSE event name, with the HTTP
    // status remaining 200 OK. The Phase 5 implementation can keep this
    // shape: the event NAME flips from "not-implemented" to "tool-call" /
    // "stream-end" / etc.; the status stays 200 across the lifetime of the
    // SSE connection (which is the SSE protocol's normal mode).
    const res = await buildApp().fetch(
      new Request("http://x/runs/_stub/events", {
        headers: { Authorization: `Bearer ${KNOWN_TOKEN}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")?.toLowerCase()).toContain("text/event-stream");
    const text = await res.text();
    // Must contain the SSE event-name line
    expect(text).toContain("event: not-implemented");
    // And a data: line whose JSON payload parses to the not_implemented error
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
    expect(dataLine).toBeDefined();
    const dataJson = JSON.parse(dataLine?.slice("data: ".length) ?? "{}");
    expect(dataJson.error.code).toBe("not_implemented");
  });
});
