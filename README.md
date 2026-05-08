# Nabla-agent (∇)

Orchestrates a fleet of coding agents — across different models and providers — in sandboxed containers.

The named metaphor is the gradient operator: take one scalar goal, produce a vector of agent actions pointing at it.

## Status

**v1 in progress — not ready for external use.** Phase 1 (container runtime + daemon process model) is complete. Phases 2–7 (state/persistence, agent loop, providers, worktree orchestration, CLI, and team manager) are not yet implemented.

## Constraints

- **License purity.** Every direct dependency is OSI-approved (MIT / Apache-2.0 / BSD / ISC). Source-available licenses (FSL, BSL, Anthropic Commercial Terms) are rejected. Project ships under MIT.
- **Sandboxing.** No agent runs on the host. Container runtime is abstracted behind `IContainerRuntime`; Docker is the v1 implementation, Podman is a configuration swap.
- **Network shape.** Client ↔ daemon and daemon ↔ workers communicate over HTTP / structured RPC even when colocated, so a future remote-server move doesn't refactor the wire.
- **Provider neutrality.** Anthropic (direct + via Meridian), OpenRouter, and OpenAI-compatible adapters from v1; adding a new provider should be one adapter file.

## Repository layout

```
packages/
├── cli/            CLI client                (Phase 6 — not yet implemented)
├── daemon/         Orchestrator daemon       (Phase 1: container runtime + auth gate)
├── shared/         Cross-package types, schemas, ADRs
├── team-manager/   Sub-orchestrator          (Phase 5 — not yet implemented)
└── worker/         Worker process            (Phase 3 — Phase 1 ships a stub)

images/             Worker container Dockerfiles + apt manifests
scripts/            Build, audit, install scripts
.github/workflows/  Lint, typecheck, test, license-CI gate
```

## Running the Phase 1 dynamic-tier tests

Linux only — macOS Docker Desktop's iptables introspection differs from
Linux's, and the conformance tests assert against the Linux semantics.

```sh
bun install
bash scripts/build-test-image.sh                                    # builds nabla-worker:test-minimal
NABLA_TEST_DOCKER=1 bun test packages/daemon/src/runtime/            # runs the docker-leg tests
```

Static-tier checks (lint, typecheck, schema, license-CI) run on every push via `.github/workflows/ci.yml`.

## Contributing

Not yet open to outside contributions — the architecture and v1 scope are still settling. A `CONTRIBUTING.md` will appear when v1 ships.

## License

MIT. See [`LICENSE`](./LICENSE).
