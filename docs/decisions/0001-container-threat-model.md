---
status: accepted
date: 2026-05-04
decision-makers:
  - "@andres"
informed-by:
  - .planning/research/PITFALLS.md (Pitfall #4 container escape)
  - .planning/REQUIREMENTS.md (CONT-01, CONT-02, CONT-03, WORK-04)
---

# 0001 — Container Threat Model

## Context and Problem Statement

Workers run untrusted model output inside ephemeral containers, and the
container is the trust boundary: per WORK-04, per-call human confirmation is
unreachable at the rate the orchestrator dispatches work, so the runtime
configuration of the container — not interactive consent — has to enforce
the project's safety posture. The threat surface is concrete:

- **Container escape** — kernel exploits, mis-configured capabilities, or
  shared namespaces let an attacker reach the host kernel.
- **Lateral movement** — a compromised worker reaches another worker, the
  daemon, or other host services on the same network.
- **Unauthorized egress** — model output exfiltrates secrets, code, or
  workspace contents to an attacker-controlled endpoint.
- **Host filesystem mutation** — bind-mounted host paths give the worker
  write access to anything outside its own workspace.
- **Docker-socket credential theft** — a mounted `/var/run/docker.sock`
  promotes the worker to root-equivalent on the host (it can launch
  privileged containers, bind any path, etc.).

Phase 1 must implement an `IContainerRuntime` whose default `docker run`
flag set forecloses these threats. Phase 0 commits the contract here so a
Phase 1 audit test (`docker inspect <id>` against the propositions below)
can read the ADR mechanically (RESEARCH.md Pitfall F: ADR-as-contract).

## Considered Options

- **Option A — Strict hardening (CHOSEN).** Non-root user; `--cap-drop=ALL`;
  `--security-opt=no-new-privileges`; `--read-only` root with explicit
  `tmpfs` mounts only where strictly required; explicit egress allow-list;
  zero Docker socket mounts; AppArmor/seccomp default profile applied (not
  `unconfined`); CIS Docker Benchmark baseline as the floor.
- **Option B — Permissive default + opt-in hardening.** Rejected: defaults
  drift, and one un-hardened spawn negates the trust boundary. Once an
  insecure default ships, "I'll harden it later" becomes a maintenance
  bug rather than a structural property.
- **Option C — gVisor / Kata runtime.** Rejected for v1: deployment
  complexity (custom OCI runtime, kernel-API gating, distro-specific
  setup) exceeds the v1 threat budget. Revisit in v1.x for opt-in worker
  variants where the workload genuinely warrants a second isolation layer.

## Decision Outcome

Adopt Option A as the default flag set for every worker container. The
`IContainerRuntime` Docker implementation in Phase 1 sets these flags as a
baseline; they cannot be opted out of without a superseding ADR. Phase 1's
`docker inspect` audit test reads this ADR's `## Verification` list and
fails the build if any flag drifts (Pitfall F).

## Consequences

- Workers cannot bind-mount host paths outside the explicit project
  workspace; tooling that expects `/etc` or `/usr` access from inside a
  worker has to be redesigned, not enabled by a flag flip.
- Workers cannot access the Docker socket — nested-container or
  Docker-in-Docker patterns are out of v1 scope.
- Workers cannot egress arbitrary endpoints. The allow-list source is
  reviewed in code (committed to the inner repo, not env-only) so it
  cannot widen silently between releases.
- Phase 1 wires AppArmor/seccomp profile selection cleanly even though the
  default profile suffices, so a regression like
  `--security-opt=seccomp=unconfined` "for debugging" surfaces as an ADR
  override request rather than a quiet flag change.

## Verification

- Container runs as a non-root user: `Config.User` is non-empty and decodes to UID >= 1000 (verified via `docker inspect <id> --format '{{.Config.User}}'`).
- All Linux capabilities dropped: `HostConfig.CapDrop` contains `ALL` and `HostConfig.CapAdd` is empty or null.
- No-new-privileges: `HostConfig.SecurityOpt` contains `no-new-privileges:true`.
- Read-only root filesystem: `HostConfig.ReadonlyRootfs` is `true`.
- Zero Docker socket mounts: no entry in `Mounts` has source path `/var/run/docker.sock` (or any rootless socket equivalent).
- Privileged mode disabled: `HostConfig.Privileged` is `false`.
- Egress is governed by the configured allow-list: container's network mode is a custom bridge OR the daemon enforces the allow-list at iptables/eBPF level; the allow-list source is committed to the inner repo (not env-only).
- AppArmor / seccomp default profile applied: `AppArmorProfile` is non-empty and not `unconfined`; `SecurityOpt` does not contain `seccomp=unconfined`.

## Out of scope (deferred)

- Per-task ephemeral image pulls vs. a canonical worker image (Phase 1 Q4).
- gVisor / Kata runtime evaluation for opt-in worker variants (v1.x).
- Custom AppArmor / seccomp profile authoring (v1.x; the default profile
  is sufficient for the v1 threat model).
