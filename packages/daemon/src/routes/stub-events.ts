// RED stub -- typed scaffold so lefthook's `tsc -b` gate passes while the
// runtime tests in stub-events.test.ts genuinely fail. Real implementation
// lands in the GREEN commit (DAEMON-02: 200 + text/event-stream + single
// `event: not-implemented` SSE frame via streamSSE; status is 200 because
// streamSSE does NOT preserve c.status -- not-implemented is in-band).
import { Hono } from "hono";

export const stubEventsRoute: Hono = new Hono();
