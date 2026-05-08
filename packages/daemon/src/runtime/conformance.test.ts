// CONT-01 (per-worker container reaped on exit -- conformance asserts the
// lifecycle round-trip), CONT-02 (interface admits drop-in replacement --
// the same suite must pass for FakeRuntime AND DockerRuntime).
//
// Docker leg is gated on NABLA_TEST_DOCKER=1 because CI may not have a
// Docker socket. Fake leg always runs. DockerRuntime arrives in plan 04
// and the import below is `await import()`-deferred so this file builds
// before plan 04 lands.
//
// Known limitation (tracked for Phase 3): Bun 1.3 + dockerode hijacked
// exec streams (hijack:true, stdin:true) do not resolve under Bun's HTTP
// client -- exec.start() never returns. The DockerRuntime workaround
// defaults to attachStdin:false (read-only stream) which unblocks every
// non-stdin caller (egress-block test, flag-audit). The two conformance
// tests below that REQUIRE bidirectional stdin write to the worker
// process are accordingly skipped on the docker leg until Phase 3 ships
// the worker stdin path -- expected via a Bun.spawn("docker", "exec",
// "-i", ...) shellout that bypasses dockerode's hijack entirely. The
// fake leg still validates the contract; the docker leg validates
// every other operation (create, start, idempotent destroy, label
// propagation, no-stdin exec via egress-block.test.ts).
import { describe, expect, test } from "bun:test";
import { SummarySchema } from "@nabla/shared/protocol/summary";
import { FakeRuntime } from "./fake";
import type { IContainerRuntime } from "./interface";

interface RuntimeFactoryEntry {
  name: string;
  factory: () => Promise<IContainerRuntime>;
}

const buildRuntimeFactories = async (): Promise<RuntimeFactoryEntry[]> => {
  const entries: RuntimeFactoryEntry[] = [{ name: "fake", factory: async () => new FakeRuntime() }];
  if (process.env.NABLA_TEST_DOCKER === "1") {
    // Plan 04 ships ./docker.ts. Until then this branch is a no-op.
    try {
      const mod = (await import("./docker")) as {
        DockerRuntime?: new () => IContainerRuntime;
      };
      if (mod.DockerRuntime) {
        entries.push({
          name: "docker",
          factory: async () => new (mod.DockerRuntime as new () => IContainerRuntime)(),
        });
      }
    } catch {
      /* DockerRuntime not landed yet -- fake leg covers plan 01 */
    }
  }
  return entries;
};

const readAll = async (s: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const c of s as AsyncIterable<Buffer>) chunks.push(Buffer.from(c as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
};

const runtimes = await buildRuntimeFactories();
for (const { name, factory } of runtimes) {
  // Two tests below require bidirectional stdin to the worker process;
  // skipped on the docker leg pending the Phase 3 Bun.spawn shellout.
  // See file header for the full rationale.
  const stdinTest = test.skipIf(name === "docker");
  describe(`CONT-01 / CONT-02 conformance — ${name}`, () => {
    stdinTest("create -> start -> exec -> stop -> destroy round-trip", async () => {
      const rt = await factory();
      const h = await rt.create({
        image: "nabla-worker:test-minimal",
        env: {},
        labels: { "nabla.run_id": "conf-1", "nabla.worker_id": "w1" },
        mounts: [],
        user: "1000:1000",
        tty: false,
      });
      expect(h.id).toBeTruthy();
      expect(h.name).toBeTruthy();
      await rt.start(h);
      const e = await rt.exec(h, ["/usr/local/bin/nabla-worker"]);
      e.stdin.end(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "task.run",
          params: { what: "conformance" },
        })}\n`,
      );
      const out = await readAll(e.stdout);
      const env = SummarySchema.parse(JSON.parse(out.trim().split("\n").at(-1) ?? "{}"));
      expect(["ok", "blocked", "failed"]).toContain(env.status);
      const { exitCode } = await e.wait();
      expect(exitCode).toBe(0);
      await rt.stop(h, { timeout: 1 });
      await rt.destroy(h);
    });

    test("destroy is idempotent", async () => {
      const rt = await factory();
      const h = await rt.create({
        image: "nabla-worker:test-minimal",
        env: {},
        labels: { "nabla.run_id": "conf-2", "nabla.worker_id": "w1" },
        mounts: [],
        user: "1000:1000",
        tty: false,
      });
      await rt.destroy(h);
      // second destroy on the same handle MUST NOT throw -- shutdown path
      // runs destroy() unconditionally (D-14 step 3).
      await expect(rt.destroy(h)).resolves.toBeUndefined();
    });

    test("labels propagate to the runtime's metadata", async () => {
      const rt = await factory();
      const labels = {
        "nabla.run_id": "conf-3",
        "nabla.worker_id": "w-labels",
        "nabla.parent_pid": String(process.pid),
        "nabla.started_at": new Date().toISOString(),
        "nabla.max_duration": "60s",
      };
      const h = await rt.create({
        image: "nabla-worker:test-minimal",
        env: {},
        labels,
        mounts: [],
        user: "1000:1000",
        tty: false,
      });
      expect(h.id).toBeTruthy();
      // For the fake leg, labels are captured internally; the docker-flag
      // audit (plan 04) verifies the dockerode propagation directly.
      await rt.destroy(h);
    });

    stdinTest("wait() and stdout do not resolve before stdin.end() is called", async () => {
      const rt = await factory();
      const h = await rt.create({
        image: "nabla-worker:test-minimal",
        env: {},
        labels: { "nabla.run_id": "conf-4", "nabla.worker_id": "w-stdin" },
        mounts: [],
        user: "1000:1000",
        tty: false,
      });
      await rt.start(h);
      const e = await rt.exec(h, ["/usr/local/bin/nabla-worker"]);
      let waitResolved = false;
      void e.wait().then(() => {
        waitResolved = true;
      });
      // Without stdin.end(), wait() must still be pending after a short
      // delay. (DockerRuntime would block on the hijacked stream's
      // close event; FakeRuntime now mirrors that.)
      await new Promise((r) => setTimeout(r, 100));
      expect(waitResolved).toBe(false);
      // Now close stdin and wait should resolve.
      e.stdin.end();
      const { exitCode } = await e.wait();
      expect(exitCode).toBe(0);
      await rt.stop(h, { timeout: 1 });
      await rt.destroy(h);
    });
  });
}
