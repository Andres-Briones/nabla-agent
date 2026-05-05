// DAEMON-02: SSE plumbing locked on Day 1. Real /runs/{id}/events lands in
// Phase 5; this stub returns a single "not-implemented" SSE event but proves
// the streaming pipeline + auth gate work end-to-end so v1 protocol shape is
// identical to v2.
//
// IMPORTANT -- HTTP status semantics:
//   Hono's streamSSE calls c.newResponse(stream.responseReadable) and does
//   NOT preserve a prior c.status(...) value (see node_modules/hono source).
//   Therefore the HTTP response status is 200, and the "not implemented"
//   signal is carried IN-BAND via the SSE event NAME ("not-implemented")
//   plus a structured payload in `data`. This is also the natural shape for
//   real SSE streams in Phase 5: the connection opens with status 200 and
//   lives for the duration of the run, with semantics carried by event
//   types, not by HTTP status codes.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

export const stubEventsRoute = new Hono().get("/", async (c) => {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "not-implemented",
      data: JSON.stringify({
        error: {
          code: "not_implemented",
          message: "Streaming arrives in Phase 5.",
        },
      }),
    });
  });
});
