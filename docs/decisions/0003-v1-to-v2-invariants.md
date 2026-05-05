---
status: accepted
date: 2026-05-04
decision-makers:
  - "@andres"
informed-by:
  - .planning/research/PITFALLS.md (Pitfall #14 v1->v2 architectural debt)
  - /workspace/CLAUDE.md (Layout B, license purity, network-shaped IPC)
  - .planning/REQUIREMENTS.md (DAEMON-02, DAEMON-04 v2-readiness)
---

# 0003 — v1 to v2 Invariants

## Context and Problem Statement

Phase 0 is built with v2 (server-deployed daemon, possibly multi-user) in
view: v1 -> v2 must be a configuration change, not a rewrite. That goal
is structurally incompatible with seductive in-process shortcuts —
direct module imports across what should be a network boundary, a
loopback-only assumption baked into URL strings, a SQLite file read
directly by the CLI, "just use this dev token" hard-codes, etc.

Each shortcut, taken once, is cheap. Aggregated across phases, they
become the wall that "just redeploy on a server" runs into.

This ADR enumerates the cross-cutting invariants every later phase must
defend. Each phase verifier reads the `## Verification` list below and
fails the phase gate if any invariant has eroded. The list is canonical;
amendments require a superseding ADR (the old ADR's `status:` field
moves to `superseded by 00NN-...`, and the body is left untouched as an
audit trail).

## Considered Options

- **Option A — Codify invariants as a single ADR with mechanical
  Verification propositions (CHOSEN).** Each later-phase verifier reads
  this list and fails on violation; the v1->v2 gate is a single
  document.
- **Option B — Spread invariants across per-phase ADRs.** Rejected: too
  easy for a later phase to forget to inherit; the cross-cutting nature
  is the point.
- **Option C — Encode invariants only as code-review heuristics.**
  Rejected: not mechanically verifiable, regresses silently the moment
  reviewer attention drifts.

## Decision Outcome

Adopt Option A. The Verification subsection below is canonical; later-
phase verifiers consume it as a contract. New invariants land via
amendment ADRs that this ADR is superseded by; an invariant cannot be
"quietly relaxed" in a phase plan.

## Consequences

- Every later PR is implicitly checked against this list. A phase plan
  whose acceptance criteria don't address a relevant invariant is
  incomplete.
- A new invariant or amendment requires a superseding ADR (status moves
  to `superseded by 00NN-...`); body of the superseded ADR is preserved
  as the audit trail.
- The license-purity policy (D-07) carries forward as an invariant: GPL
  family is OSI-approved but excluded from the default allow-list at
  `.licenses/allowed.json` (mirrors CLAUDE.md's PM2/AGPL-3.0 precedent).
  Adding a GPL dep requires a NEW ADR documenting the exception, the
  use case, and why no permissive alternative serves it.
- `@anthropic-ai/claude-agent-sdk` is forbidden by name (Anthropic
  Commercial Terms; not OSI). Direct or transitive presence is a
  v1-blocking regression.

## Verification

- Network-shaped IPC. Every cross-process boundary uses HTTP / SSE / Unix sockets / structured RPC. No `import` from `@nabla/daemon` into `@nabla/cli` or `@nabla/worker`. Verified by static check: `! grep -r 'from "@nabla/daemon"' packages/cli/ packages/worker/ packages/team-manager/`.
- Auth on every request, even loopback. No endpoint exempts itself from the bearer-auth middleware (DAEMON-04). Verified per phase by middleware tests asserting `/health` and any new endpoint reject without bearer.
- packages/shared is the single source of plan / RPC / event / summary / blocker types (D-08). No other package re-defines these shapes locally. Verified by grep: schema names appear only under `packages/shared/src/`.
- License-CI gate runs on every push and PR. The `.github/workflows/ci.yml` must include the license:check + license:audit steps; removing them is a v2-blocking regression. Verified by structural test on the workflow file.
- No hardcoded `localhost` / `127.0.0.1` in URL paths the CLI builds. Only the daemon's bind address is `127.0.0.1` (D-05 v1 default); the CLI MUST read the daemon URL from config / env so v2 can change it. Verified by `! grep -r '127\.0\.0\.1' packages/cli/src/` (excluding test fixtures).
- No filesystem assumptions across processes. A worker container does NOT read host paths outside its mounted workspace; a CLI does NOT read the daemon's SQLite file directly (must use the HTTP API). Verified per phase by integration tests.
- GPL-family deps require a superseding ADR. Adding any `GPL-*` license to `.licenses/allowed.json` is allowed only when accompanied by an ADR explaining the exception (mirrors PM2/AGPL precedent). Verified by code review on diffs of `.licenses/allowed.json`.
- `@anthropic-ai/claude-agent-sdk` is forbidden. Direct or transitive presence is a v1-blocking regression (Anthropic Commercial Terms — not OSI). Verified by license-CI gate; explicit grep in CI for the package name as a belt-and-braces guard.
- The daemon binds loopback in v1; the v2 widening is a config change, not a code change. The hostname argument is read from config / env (`NABLA_DAEMON_HOST`), defaulting to `127.0.0.1` in v1. Verified per phase by daemon entry inspection.

## Out of scope (deferred)

- TLS termination on the network bind (DAEMON-v2-01) — wires up when v2
  widens beyond loopback.
- mTLS / token rotation (v1.x or v2) — v1 ships a static token; rotation
  comes with the network widening.
- Per-user sessions (v2 multi-user) — v1 is single-operator.
