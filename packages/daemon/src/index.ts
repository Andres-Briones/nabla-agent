// Phase 0 daemon entry. v1 default bind is 127.0.0.1; v2 widening is a
// config change (NABLA_DAEMON_HOST), not a code change (ADR-0003 invariant
// #9). Auth middleware mounted FIRST -- before any route or error handler --
// so every endpoint including /health rejects without bearer (Pitfall C).
// Startup line MUST NOT log the token value (T-0-04).
import { Hono } from "hono";

import { makeAuthMiddleware } from "./auth/middleware";
import { resolveOrInitToken } from "./auth/token-init";
import { healthRoute } from "./routes/health";
import { stubEventsRoute } from "./routes/stub-events";

/**
 * Resolves the bind hostname for Bun.serve. v1 default is loopback; v2
 * widening is a config change via NABLA_DAEMON_HOST (ADR-0003 invariant #9).
 * Extracted as a pure helper so it is unit-testable without binding a real
 * socket.
 */
export const resolveDaemonHost = (): string => process.env.NABLA_DAEMON_HOST ?? "127.0.0.1";

export const buildDaemonApp = async (): Promise<Hono> => {
  const token = await resolveOrInitToken();
  const app = new Hono();
  app.use("*", makeAuthMiddleware(token));
  app.route("/health", healthRoute);
  app.route("/runs/_stub/events", stubEventsRoute);
  return app;
};

const main = async (): Promise<void> => {
  const app = await buildDaemonApp();
  const port = Number(process.env.NABLA_DAEMON_PORT ?? 7777);
  const hostname = resolveDaemonHost();
  Bun.serve({
    port,
    hostname,
    fetch: app.fetch,
  });
  // T-0-04: do NOT interpolate the token here. Token presence is logged
  // implicitly (the daemon would not start without resolveOrInitToken).
  console.log(`nabla daemon listening on http://${hostname}:${port}`);
};

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error("daemon failed to start:", err);
    process.exit(1);
  });
}
