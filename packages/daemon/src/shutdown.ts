// DAEMON-01: graceful shutdown contract. Two-stage drain under docker
// stop's 10s grace window:
//   t=0     server.stop(false) -- stop new requests, let in-flight finish.
//   t=0     runtime.stop(handle, { timeout: 8 }) for every active worker
//           in parallel (signal forwarding is explicit, D-16; daemon does
//           NOT trust the runtime to forward SIGTERM transparently).
//   t<=9.5s force-reap survivors via runtime.destroy() (Pitfall 7: 8s
//           SIGTERM + 1.5s slack keeps the daemon's own shutdown safely
//           under systemd's 10s TimeoutStopSec; Pitfall 8: destroy()
//           removes both container and bridge network).
//   t<10s   resolve the always-pending promise (D-15) -> process.exit(0).
//
// Re-entrant SIGTERM during shutdown is a no-op (shuttingDown guard).
// Pitfall 11: register handlers BEFORE Bun.serve so the handler is in
// place when a fast SIGTERM arrives.
// Pitfall 3 caveat in tests: run with `bun run`, not `bun --watch run`.
import type { ContainerHandle } from "@nabla/shared";

import { logger } from "./log";
import type { IContainerRuntime } from "./runtime/interface";

export interface ShutdownServer {
  stop: (closeActiveConnections: boolean) => void;
}

export interface ShutdownContext {
  server: ShutdownServer;
  runtime: IContainerRuntime;
  handles: () => Iterable<ContainerHandle>;
  shutdownResolver: () => void;
}

const HARD_CAP_MS = 9_500;
const WORKER_GRACE_S = 8;

export const installShutdownHandlers = (ctx: ShutdownContext): void => {
  let shuttingDown = false;
  const onSignal = async (sig: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal: sig }, "shutdown initiated");

    // Stage 1 (t=0): stop accepting new requests; let in-flight finish.
    ctx.server.stop(/* closeActiveConnections */ false);

    // Stage 1 (t=0): docker stop every worker in parallel with 8s grace.
    const stops = Array.from(ctx.handles()).map((h) =>
      ctx.runtime.stop(h, { timeout: WORKER_GRACE_S }).catch((err: unknown) => {
        logger.warn({ err: String(err), handle: h.id }, "stop failed; will SIGKILL");
      }),
    );

    // Stage 2 (t<=9.5s): wait collectively, capped.
    await Promise.race([Promise.all(stops), new Promise<void>((r) => setTimeout(r, HARD_CAP_MS))]);

    // Stage 3: force-reap survivors. Phase 1 stub reaper.
    for (const h of ctx.handles()) {
      try {
        await ctx.runtime.destroy(h);
      } catch (err: unknown) {
        logger.error({ err: String(err), handle: h.id }, "force-reap failed");
      }
    }

    // Stage 4: state flush hook (Phase 1 has nothing; Phase 2 inserts
    // SQLite WAL flush here).

    logger.info("shutdown complete");
    ctx.shutdownResolver();
  };

  process.on("SIGTERM", (sig) => {
    void onSignal(sig);
  });
  process.on("SIGINT", (sig) => {
    void onSignal(sig);
  });
};
