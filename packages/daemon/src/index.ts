// Phase 0 + Phase 1 daemon entry. v1 default bind is 127.0.0.1; v2
// widening is a config change (NABLA_DAEMON_HOST), not a code change
// (ADR-0003 invariant #9). Auth middleware mounted FIRST -- before
// any route or error handler -- so every endpoint including /health
// rejects without bearer (Pitfall C).
// Startup line MUST NOT log the token value (T-0-04).
//
// Phase 1 additions:
// - DockerRuntime instantiated and held by the entry (consumed by future
//   route handlers that spawn workers; Phase 1 has no such route).
// - Always-pending promise (D-15) -- DO NOT REMOVE EVEN IF IT LOOKS
//   UNUSED. Bun.serve alone may not keep the loop hot
//   (Pitfall #11 / Bun issue #1657); the promise is the documented fix.
//   The shutdown handler resolves it after two-stage drain (D-14).
// - installShutdownHandlers wires SIGTERM/SIGINT for graceful shutdown
//   within docker stop's 10s grace window (Pitfall 7 -- t=8 worker stop
//   leaves 1.5s slack for the daemon's own exit).
import { Hono } from "hono";

import { makeAuthMiddleware } from "./auth/middleware";
import { resolveOrInitToken } from "./auth/token-init";
import { healthRoute } from "./routes/health";
import { stubEventsRoute } from "./routes/stub-events";
import { DockerRuntime } from "./runtime/docker";
import { activeHandles } from "./runtime/registry";
import { installShutdownHandlers } from "./shutdown";

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
  const server = Bun.serve({ port, hostname, fetch: app.fetch });
  const runtime = new DockerRuntime();

  // D-15: always-pending promise keeps event loop alive -- do NOT remove
  // even if it looks unused. Bun.serve alone may not keep the loop hot
  // (Pitfall #11 / Bun issue #1657). The shutdown handler resolves it.
  let shutdownResolver!: () => void;
  const stayAlive = new Promise<void>((r) => {
    shutdownResolver = r;
  });

  installShutdownHandlers({
    server: { stop: (close) => server.stop(close) },
    runtime,
    handles: () => activeHandles.values(),
    shutdownResolver,
  });

  // T-0-04: do NOT interpolate the token here. Token presence is logged
  // implicitly (the daemon would not start without resolveOrInitToken).
  console.log(`nabla daemon listening on http://${hostname}:${port}`);
  await stayAlive;
  process.exit(0);
};

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error("daemon failed to start:", err);
    process.exit(1);
  });
}
