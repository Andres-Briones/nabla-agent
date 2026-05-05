// CONT-03 mechanical audit: read ADR-0001 ## Verification list and assert
// every proposition holds against a live `docker inspect` of a freshly
// spawned worker container. Reuses the Phase-0 extractor
// (scripts/adr-verification.ts) so the parser has one source of truth
// (PATTERNS.md S6).
//
// Gated on NABLA_TEST_DOCKER=1 because CI may not have a Docker socket.
// Plan 07 wires the gate flag in the GitHub Actions workflow on Linux
// runners only (macOS Docker Desktop iptables introspection is non-trivial).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { ContainerHandle } from "@nabla/shared";
import Docker from "dockerode";
import { extractVerificationItems } from "./adr-verification";
import { DockerRuntime } from "./docker";

const ADR = "docs/decisions/0001-container-threat-model.md";
const propositions = extractVerificationItems(readFileSync(ADR, "utf8"));

const guard = process.env.NABLA_TEST_DOCKER === "1" ? describe : describe.skip;

guard("ADR-0001 mechanical audit (CONT-03 / WORK-04)", () => {
  let runtime: DockerRuntime;
  let docker: Docker;
  let handle: ContainerHandle;

  beforeAll(async () => {
    runtime = new DockerRuntime();
    docker = new Docker();
    // Fixture image must be built locally before this test runs. Plan 07
    // wires `docker build -f images/worker/profiles/minimal/Dockerfile .`
    // into the CI gate; locally, run that command before `bun test`.
    handle = await runtime.create({
      image: "nabla-worker:test-minimal",
      env: {},
      labels: {
        "nabla.run_id": "audit-1",
        "nabla.worker_id": "audit-w",
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
      } catch (_e) {}
      try {
        await runtime.destroy(handle);
      } catch (_e) {}
    }
  });

  test("each ## Verification proposition is asserted", async () => {
    const inspect = await docker.getContainer(handle.id).inspect();

    // Prop 1: User non-empty, UID >= 1000
    const userField = inspect.Config.User;
    expect(userField).not.toBe("");
    const uid = parseInt(userField.split(":")[0] ?? "", 10);
    expect(uid).toBeGreaterThanOrEqual(1000);

    // Prop 2: CapDrop contains ALL, CapAdd empty/null
    expect(inspect.HostConfig.CapDrop ?? []).toContain("ALL");
    expect(inspect.HostConfig.CapAdd ?? []).toEqual([]);

    // Prop 3: no-new-privileges
    expect(inspect.HostConfig.SecurityOpt ?? []).toContain("no-new-privileges:true");

    // Prop 4: ReadonlyRootfs
    expect(inspect.HostConfig.ReadonlyRootfs).toBe(true);

    // Prop 5: no docker.sock / podman.sock mount
    for (const m of inspect.Mounts ?? []) {
      expect(m.Source).not.toMatch(/(?:^|[\\/])(docker\.sock|podman\.sock)$/);
    }

    // Prop 6: Privileged false
    expect(inspect.HostConfig.Privileged).toBe(false);

    // Prop 7: egress allow-list -- NetworkMode is custom bridge AND Internal=true
    expect(inspect.HostConfig.NetworkMode).toMatch(/^nabla-net-/);
    const networkMode = inspect.HostConfig.NetworkMode ?? "";
    const net = await docker.getNetwork(networkMode).inspect();
    expect(net.Internal).toBe(true);

    // Prop 8: AppArmor / seccomp default applied (not unconfined)
    expect(inspect.AppArmorProfile).not.toBe("");
    expect(inspect.AppArmorProfile).not.toBe("unconfined");
    const secOpt = inspect.HostConfig.SecurityOpt ?? [];
    expect(secOpt).not.toContain("seccomp=unconfined");
    expect(secOpt).not.toContain("apparmor=unconfined");

    // WORK-04 D-10: NABLA_WORKER_BYPASS=1 injected unconditionally.
    expect(inspect.Config.Env ?? []).toContain("NABLA_WORKER_BYPASS=1");

    // D-20 labels propagation sanity.
    expect(inspect.Config.Labels?.["nabla.run_id"]).toBe("audit-1");
    expect(inspect.Config.Labels?.["nabla.worker_id"]).toBe("audit-w");
  });

  test("ADR-0001 ## Verification has >= 8 propositions (audit must keep parity if ADR amended)", () => {
    expect(propositions.length).toBeGreaterThanOrEqual(8);
  });
});
