import { afterEach, beforeEach, describe, expect, test } from "bun:test";

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
        await new Promise((r) => setTimeout(r, 200));
        return;
      }
      // "never": resolves never (the t=9.5s cap fires).
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

const ORIG_LISTENERS = { term: process.listeners("SIGTERM"), int: process.listeners("SIGINT") };

beforeEach(() => {
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
});
afterEach(() => {
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
  for (const l of ORIG_LISTENERS.term) process.on("SIGTERM", l as never);
  for (const l of ORIG_LISTENERS.int) process.on("SIGINT", l as never);
});

describe("DAEMON-01 two-stage shutdown (D-14, D-15, D-16)", () => {
  test("fast workers: shutdownResolver fires within 1s and destroys all", async () => {
    const runtime = makeRuntime("fast");
    const server = makeServer();
    const hs = handles(["a", "b", "c"]);
    let resolved = false;
    const ctx: ShutdownContext = {
      server,
      runtime,
      handles: () => hs,
      shutdownResolver: () => {
        resolved = true;
      },
    };
    installShutdownHandlers(ctx);
    const start = Date.now();
    process.emit("SIGTERM" as never);
    await new Promise((r) => setTimeout(r, 200));
    const elapsed = Date.now() - start;
    expect(resolved).toBe(true);
    expect(elapsed).toBeLessThan(1_000);
    expect(runtime.stops.sort()).toEqual(["a", "b", "c"]);
    expect(runtime.destroys.sort()).toEqual(["a", "b", "c"]);
    expect(server.lastClose).toBe(false); // graceful drain (D-14 step 1)
  });

  test("never-resolving stop(): hard cap at 9.5s, force-reap fires", async () => {
    const runtime = makeRuntime("never");
    const server = makeServer();
    const hs = handles(["stuck"]);
    let resolved = false;
    const ctx: ShutdownContext = {
      server,
      runtime,
      handles: () => hs,
      shutdownResolver: () => {
        resolved = true;
      },
    };
    installShutdownHandlers(ctx);
    const start = Date.now();
    process.emit("SIGTERM" as never);
    // Wait up to 11s for the resolver to fire after the 9.5s cap.
    for (let i = 0; i < 220 && !resolved; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const elapsed = Date.now() - start;
    expect(resolved).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(9_400);
    expect(elapsed).toBeLessThan(11_000);
    expect(runtime.destroys).toContain("stuck"); // force-reap fired
  }, 15_000);

  test("re-entrant SIGTERM: stop() called once per handle", async () => {
    const runtime = makeRuntime("slow-resolve");
    const server = makeServer();
    const hs = handles(["a"]);
    const ctx: ShutdownContext = {
      server,
      runtime,
      handles: () => hs,
      shutdownResolver: () => {},
    };
    installShutdownHandlers(ctx);
    process.emit("SIGTERM" as never);
    process.emit("SIGTERM" as never);
    await new Promise((r) => setTimeout(r, 400));
    expect(runtime.stops).toEqual(["a"]);
  });
});
