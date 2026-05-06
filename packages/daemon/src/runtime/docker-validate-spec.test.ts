// Phase 1 plan 10 — validateSpec hardening (closes 01-REVIEWS.md
// MEDIUM about docker.sock regex narrowness + missing target check).
// No Docker socket required; validateSpec throws synchronously
// before any docker call.
import { describe, expect, test } from "bun:test";
import type { ContainerSpec } from "@nabla/shared";
import { DockerRuntime } from "./docker";

const baseSpec = (mounts: ContainerSpec["mounts"]): ContainerSpec => ({
  image: "nabla-worker:test-minimal",
  env: {},
  labels: { "nabla.run_id": "vs-1", "nabla.worker_id": "vs-w" },
  mounts,
  user: "1000:1000",
  tty: false,
});

// Use a Docker stub that throws if reached — validateSpec must reject
// BEFORE any docker call.
const docker = new Proxy(
  {},
  {
    get: () => {
      throw new Error("validateSpec did not reject before docker call");
    },
  },
) as never;

const rt = new DockerRuntime(docker);

describe("validateSpec — docker.sock / podman.sock rejection (HIGH-3 MEDIUM bundle)", () => {
  test("rejects canonical /var/run/docker.sock as source", async () => {
    await expect(
      rt.create(
        baseSpec([{ source: "/var/run/docker.sock", target: "/x", readonly: false, type: "bind" }]),
      ),
    ).rejects.toThrow(/docker\/podman socket forbidden in source/);
  });

  test("rejects /var/run/docker.sock.bak as source (suffix-after-dot)", async () => {
    await expect(
      rt.create(
        baseSpec([
          { source: "/var/run/docker.sock.bak", target: "/x", readonly: false, type: "bind" },
        ]),
      ),
    ).rejects.toThrow(/docker\/podman socket forbidden in source/);
  });

  test("rejects /host/var/run/docker.sock/whatever as source (mid-path)", async () => {
    await expect(
      rt.create(
        baseSpec([
          {
            source: "/host/var/run/docker.sock/whatever",
            target: "/x",
            readonly: false,
            type: "bind",
          },
        ]),
      ),
    ).rejects.toThrow(/docker\/podman socket forbidden in source/);
  });

  test("rejects /run/podman/podman.sock as source (podman variant)", async () => {
    await expect(
      rt.create(
        baseSpec([
          {
            source: "/run/podman/podman.sock",
            target: "/x",
            readonly: false,
            type: "bind",
          },
        ]),
      ),
    ).rejects.toThrow(/docker\/podman socket forbidden in source/);
  });

  test("rejects when target contains docker.sock (even if source is benign)", async () => {
    await expect(
      rt.create(
        baseSpec([
          {
            source: "/tmp/benign",
            target: "/var/run/docker.sock",
            readonly: false,
            type: "bind",
          },
        ]),
      ),
    ).rejects.toThrow(/docker\/podman socket forbidden in target/);
  });

  test("rejects when target contains podman.sock", async () => {
    await expect(
      rt.create(
        baseSpec([
          {
            source: "/tmp/benign",
            target: "/run/podman/podman.sock",
            readonly: false,
            type: "bind",
          },
        ]),
      ),
    ).rejects.toThrow(/docker\/podman socket forbidden in target/);
  });

  test("permits ordinary mount paths (sanity check — must NOT reject)", async () => {
    // Use a stub Docker that records calls instead of throwing,
    // so we can confirm validateSpec passed and we proceeded INTO
    // the docker call (which throws a different, expected error).
    class StubDocker {
      createNetwork = async (): Promise<unknown> => {
        throw new Error("expected: passed validateSpec");
      };
      getContainer = (): never => {
        throw new Error("getContainer not expected");
      };
      modem = { demuxStream: () => {} };
    }
    const okRt = new DockerRuntime(new StubDocker() as never);
    await expect(
      okRt.create(
        baseSpec([{ source: "/tmp/work", target: "/work", readonly: false, type: "bind" }]),
      ),
    ).rejects.toThrow(/expected: passed validateSpec/);
  });
});
