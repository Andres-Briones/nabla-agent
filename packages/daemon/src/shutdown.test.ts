// Phase 1 plan 09 — DAEMON-01 graceful shutdown tests.
// Closes 01-REVIEWS.md HIGH-4: tests no longer mutate the real
// process's signal handlers and no longer wait 9.5s of real wall
// time. They inject an isolated EventEmitter as `signalSource` and
// a small `hardCapMs` (250ms) for the never-resolving case.
//
// The production code path (process + DEFAULT_HARD_CAP_MS) is wired
// by packages/daemon/src/index.ts and exercised by index.test.ts.
import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";

import type { ContainerHandle } from "@nabla/shared";

import type { IContainerRuntime } from "./runtime/interface";
import { installShutdownHandlers, type ShutdownContext } from "./shutdown";

// Configurable in-memory runtime for shutdown tests. Distinct from
// FakeRuntime in that stop()/destroy() behaviour is parameterised.
interface ShutdownTestRuntime extends IContainerRuntime {
  readonly stops: string[];
  readonly destroys: string[];
}

const makeRuntime = (stopBehavior: "fast" | "slow-resolve" | "never"): ShutdownTestRuntime => {
  const stops: string[] = [];
  const destroys: string[] = [];
  return {
    stops,
    destroys,
    create: async () => ({ id: "x", name: "x" }),
    start: async () => {},
    exec: async () => ({
      stdin: null as never,
      stdout: null as never,
      stderr: null as never,
      wait: async () => ({ exitCode: 0 }),
    }),
    stop: async (h: ContainerHandle): Promise<void> => {
      stops.push(h.id);
      if (stopBehavior === "fast") return;
      if (stopBehavior === "slow-resolve") {
        await new Promise((r) => setTimeout(r, 50));
        return;
      }
      // "never": resolves never (the hardCapMs cap fires).
      await new Promise(() => {});
    },
    destroy: async (h: ContainerHandle) => {
      destroys.push(h.id);
    },
  };
};

const makeServer = (): { stop: (c: boolean) => void; lastClose: boolean | null } => {
  const state = { lastClose: null as boolean | null };
  return {
    stop: (c: boolean) => {
      state.lastClose = c;
    },
    get lastClose() {
      return state.lastClose;
    },
  } as { stop: (c: boolean) => void; lastClose: boolean | null };
};

const handles = (ids: string[]): ContainerHandle[] => ids.map((id) => ({ id, name: `n-${id}` }));

const waitFor = async (predicate: () => boolean, maxMs: number, stepMs = 5): Promise<number> => {
  const start = Date.now();
  while (!predicate() && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return Date.now() - start;
};

describe("DAEMON-01 two-stage shutdown (D-14, D-15, D-16)", () => {
  test("fast workers: shutdownResolver fires <50ms and destroys all", async () => {
    const runtime = makeRuntime("fast");
    const server = makeServer();
    const hs = handles(["a", "b", "c"]);
    const signalSource = new EventEmitter();
    let resolved = false;
    const ctx: ShutdownContext = {
      server,
      runtime,
      handles: () => hs,
      shutdownResolver: () => {
        resolved = true;
      },
      signalSource,
      hardCapMs: 1_000,
      workerGraceS: 1,
    };
    installShutdownHandlers(ctx);

    signalSource.emit("SIGTERM", "SIGTERM");
    const elapsed = await waitFor(() => resolved, 500);

    expect(resolved).toBe(true);
    expect(elapsed).toBeLessThan(500);
    expect(runtime.stops.sort()).toEqual(["a", "b", "c"]);
    expect(runtime.destroys.sort()).toEqual(["a", "b", "c"]);
    expect(server.lastClose).toBe(false); // graceful drain (D-14 step 1)
  });

  test("never-resolving stop(): hard cap fires and force-reap runs", async () => {
    const runtime = makeRuntime("never");
    const server = makeServer();
    const hs = handles(["stuck"]);
    const signalSource = new EventEmitter();
    let resolved = false;
    const ctx: ShutdownContext = {
      server,
      runtime,
      handles: () => hs,
      shutdownResolver: () => {
        resolved = true;
      },
      signalSource,
      hardCapMs: 250, // Tiny cap — production uses 9_500.
      workerGraceS: 1,
    };
    installShutdownHandlers(ctx);

    const start = Date.now();
    signalSource.emit("SIGTERM", "SIGTERM");
    const elapsed = await waitFor(() => resolved, 1_000);
    const totalElapsed = Date.now() - start;

    expect(resolved).toBe(true);
    // Cap must have fired (>=hardCapMs) but well under the 1s waitFor.
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(totalElapsed).toBeLessThan(1_000);
    expect(runtime.destroys).toContain("stuck"); // force-reap fired
  });

  test("re-entrant SIGTERM: stop() called once per handle", async () => {
    const runtime = makeRuntime("slow-resolve");
    const server = makeServer();
    const hs = handles(["a"]);
    const signalSource = new EventEmitter();
    const ctx: ShutdownContext = {
      server,
      runtime,
      handles: () => hs,
      shutdownResolver: () => {},
      signalSource,
      hardCapMs: 1_000,
      workerGraceS: 1,
    };
    installShutdownHandlers(ctx);

    signalSource.emit("SIGTERM", "SIGTERM");
    signalSource.emit("SIGTERM", "SIGTERM");
    await new Promise((r) => setTimeout(r, 200));

    expect(runtime.stops).toEqual(["a"]);
  });

  test("SIGINT also triggers shutdown (parity with SIGTERM)", async () => {
    const runtime = makeRuntime("fast");
    const server = makeServer();
    const hs = handles(["x"]);
    const signalSource = new EventEmitter();
    let resolved = false;
    const ctx: ShutdownContext = {
      server,
      runtime,
      handles: () => hs,
      shutdownResolver: () => {
        resolved = true;
      },
      signalSource,
      hardCapMs: 1_000,
      workerGraceS: 1,
    };
    installShutdownHandlers(ctx);

    signalSource.emit("SIGINT", "SIGINT");
    const elapsed = await waitFor(() => resolved, 500);

    expect(resolved).toBe(true);
    expect(elapsed).toBeLessThan(500);
    expect(runtime.destroys).toContain("x");
  });
});
