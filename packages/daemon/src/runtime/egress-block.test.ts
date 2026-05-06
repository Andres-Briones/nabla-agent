// Phase 1 plan 10 — egress block sanity test (closes 01-REVIEWS.md
// MEDIUM about "no test verifies that an empty egress allow-list
// ACTUALLY blocks egress"). The audit test (docker-flag-audit.test.ts)
// checks `Internal: true` flag SHAPE; this test checks BEHAVIOUR by
// attempting an actual external connection.
//
// Gated on NABLA_TEST_DOCKER=1 because CI may not have a Docker
// socket. Linux runners only — macOS Docker Desktop iptables
// introspection differs (see 01-RESEARCH.md line 823).
//
// The test image (nabla-worker:test-minimal) ships curl per the
// minimal profile's packages.list — confirmed by audit-image-licenses.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ContainerHandle } from "@nabla/shared";
import { DockerRuntime } from "./docker";

const guard = process.env.NABLA_TEST_DOCKER === "1" ? describe : describe.skip;

guard("egress block — empty allow-list actually blocks egress (CONT-03)", () => {
  let runtime: DockerRuntime;
  let handle: ContainerHandle;

  beforeAll(async () => {
    runtime = new DockerRuntime();
    handle = await runtime.create({
      image: "nabla-worker:test-minimal",
      env: {},
      labels: {
        "nabla.run_id": "egress-1",
        "nabla.worker_id": "egress-w",
        "nabla.parent_pid": String(process.pid),
        "nabla.started_at": new Date().toISOString(),
        "nabla.max_duration": "60s",
      },
      mounts: [],
      user: "1000:1000",
      tty: false,
    });
    await runtime.start(handle);
  });

  afterAll(async () => {
    if (handle) {
      try {
        await runtime.stop(handle, { timeout: 1 });
      } catch {}
      try {
        await runtime.destroy(handle);
      } catch {}
    }
  });

  test("curl --max-time 2 https://example.com exits non-zero (egress blocked)", async () => {
    // Override the entrypoint with curl. The minimal profile ships
    // curl (packages.list line 4); a future profile that drops it
    // would fail this test loudly.
    const exec = await runtime.exec(handle, [
      "curl",
      "--silent",
      "--show-error",
      "--max-time",
      "2",
      "--output",
      "/dev/null",
      "https://example.com",
    ]);
    // No stdin needed for curl; close it immediately so wait()
    // doesn't hang.
    exec.stdin.end();
    const { exitCode } = await exec.wait();
    // curl exit codes for connectivity failures: 6 (host not
    // resolved), 7 (connect failed), 28 (timeout), 35 (ssl failed).
    // ALL OF THEM are non-zero. We accept any non-zero exit as
    // proof that egress is blocked.
    expect(exitCode).not.toBe(0);
    // Belt: explicitly reject an exit code of 0 even if the OS
    // ever changes the contract.
    expect(exitCode).toBeGreaterThan(0);
  }, 15_000); // 15s test timeout — curl --max-time is 2s but
  //            container startup + image pull cache miss can extend.
});
