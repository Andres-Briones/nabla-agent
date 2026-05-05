// D-14 stub reaper (Phase 1 only).
//
// Two activation points:
//   1. on graceful shutdown -- shutdown.ts iterates activeHandles after
//      the t=8 cap and calls reapHandle() on each.
//   2. on per-task exit -- the runtime layer's caller (Phase 3 worker
//      dispatcher) calls reapHandle() when exec.wait() resolves so the
//      container does not linger after the worker emits its envelope.
//
// Phase 2 (DAEMON-03) replaces this with a timer-based scanning reaper
// that queries `docker ps --filter='label=nabla.run_id=...'` and reaps
// orphans whose `nabla.parent_pid` is no longer alive. Phase 1 only
// handles the in-process cases; orphan-after-daemon-crash is Phase 2.
import type { ContainerHandle } from "@nabla/shared";
import { logger } from "../log";
import type { IContainerRuntime } from "./interface";
import { activeHandles } from "./registry";

export const reapHandle = async (
  runtime: IContainerRuntime,
  handle: ContainerHandle,
): Promise<void> => {
  activeHandles.delete(handle.id);
  try {
    await runtime.destroy(handle);
    logger.debug({ handle: handle.id }, "container reaped");
  } catch (err) {
    logger.warn({ err: String(err), handle: handle.id }, "reap failed (idempotent; logging only)");
  }
};
