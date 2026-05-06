// DAEMON-01: graceful shutdown contract. Two-stage drain under docker
// stop's 10s grace window:
//   t=0     server.stop(false) -- stop new requests, let in-flight finish.
//   t=0     runtime.stop(handle, { timeout: workerGraceS }) for every
//           active worker in parallel (signal forwarding is explicit,
//           D-16; daemon does NOT trust the runtime to forward SIGTERM
//           transparently).
//   t<=hardCapMs  force-reap survivors via runtime.destroy() (Pitfall 7:
//           8s SIGTERM + 1.5s slack keeps the daemon's own shutdown
//           safely under systemd's 10s TimeoutStopSec; Pitfall 8:
//           destroy() removes both container and bridge network).
//   t<10s   resolve the always-pending promise (D-15) -> process.exit(0).
//
// Re-entrant SIGTERM during shutdown is a no-op (shuttingDown guard).
// Pitfall 11: register handlers BEFORE Bun.serve so the handler is in
// place when a fast SIGTERM arrives.
// Pitfall 3 caveat in tests: run with `bun run`, not `bun --watch run`.
//
// Phase 1 plan 09 (closes 01-REVIEWS.md HIGH-4): signalSource +
// hardCapMs + workerGraceS are injectable so tests don't mutate
// process state and don't wait 9.5s of real time. Defaults preserve
// production behaviour exactly.
import type { EventEmitter } from "node:events";

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
  /**
   * Source that emits the shutdown signal. Defaults to `process`.
   * Tests pass an isolated EventEmitter to avoid mutating the real
   * process's signal handlers (closes 01-REVIEWS.md HIGH-4).
   */
  signalSource?: NodeJS.EventEmitter | EventEmitter;
  /**
   * Hard cap on the total drain window in ms. Defaults to 9_500
   * (Pitfall 7: 9.5s leaves 0.5s slack inside docker stop's 10s
   * grace). Tests override with small values (e.g. 250) to keep
   * wall-clock under 1s.
   */
  hardCapMs?: number;
  /**
   * Per-worker `docker stop --time=N` window in seconds. Defaults to
   * 8 (Pitfall 7: 8s worker grace + 1.5s daemon slack = 9.5s hard
   * cap). Tests override with 0 or 1.
   */
  workerGraceS?: number;
}

export const DEFAULT_HARD_CAP_MS = 9_500;
export const DEFAULT_WORKER_GRACE_S = 8;

export const installShutdownHandlers = (ctx: ShutdownContext): void => {
  const hardCapMs = ctx.hardCapMs ?? DEFAULT_HARD_CAP_MS;
  const workerGraceS = ctx.workerGraceS ?? DEFAULT_WORKER_GRACE_S;
  const signalSource: NodeJS.EventEmitter =
    (ctx.signalSource as NodeJS.EventEmitter | undefined) ?? process;

  let shuttingDown = false;
  const onSignal = async (sig: NodeJS.Signals | string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal: sig }, "shutdown initiated");

    // Stage 1 (t=0): stop accepting new requests; let in-flight finish.
    ctx.server.stop(/* closeActiveConnections */ false);

    // Stage 1 (t=0): docker stop every worker in parallel with grace.
    const stops = Array.from(ctx.handles()).map((h) =>
      ctx.runtime.stop(h, { timeout: workerGraceS }).catch((err: unknown) => {
        logger.warn({ err: String(err), handle: h.id }, "stop failed; will SIGKILL");
      }),
    );

    // Stage 2 (t<=hardCapMs): wait collectively, capped.
    await Promise.race([Promise.all(stops), new Promise<void>((r) => setTimeout(r, hardCapMs))]);

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

  signalSource.on("SIGTERM", (sig: NodeJS.Signals | string) => {
    void onSignal(sig);
  });
  signalSource.on("SIGINT", (sig: NodeJS.Signals | string) => {
    void onSignal(sig);
  });
};
