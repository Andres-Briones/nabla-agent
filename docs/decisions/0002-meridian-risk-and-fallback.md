---
status: accepted
date: 2026-05-04
decision-makers:
  - "@andres"
informed-by:
  - .planning/research/PITFALLS.md (Pitfall #6 Meridian ToS risk)
  - .planning/REQUIREMENTS.md (ROUTE-01..04, SAFE-04)
  - /workspace/CLAUDE.md (Meridian as Anthropic-shaped + OpenAI-shaped local proxy)
---

# 0002 — Meridian Risk and Fallback Posture

## Context and Problem Statement

Meridian is a third-party local proxy that exposes both an Anthropic-shaped
endpoint and an OpenAI-shaped endpoint at `http://127.0.0.1:3456` (per the
project's stack table, the Vercel AI SDK adapter
`@ai-sdk/openai-compatible` is the simplest match). Meridian is attractive
because it lets a developer route Anthropic-shaped traffic through a
cheaper or differently-rate-limited backend without changing client code.

The Meridian Terms of Service have been ambiguous about programmatic
agent use, and a third party's posture can change at any time. Nabla-agent
ships an autonomous execution path; if that path silently depends on
Meridian, a ToS shift turns into an outage and a legal-risk surface that
the project has no way to control.

Phase 4 must therefore (a) support Meridian as one of four provider
adapters behind `IProvider` (so the cost lever is available to operators
who want it) and (b) prove the autonomous path completes end-to-end with
Meridian explicitly disabled (so the autonomous path is structurally
independent of Meridian).

## Considered Options

- **Option A — Meridian as one of four equal adapters; phase-completion
  gate requires Meridian-disabled autonomous run (CHOSEN).** Anthropic-
  direct, Anthropic-via-Meridian, OpenAI, and OpenRouter all live as
  one-file adapters behind `IProvider`. Routing policy treats them
  symmetrically; the phase-completion gate flips
  `NABLA_MERIDIAN_DISABLED=1` and proves end-to-end success.
- **Option B — Meridian as the default Anthropic adapter (cost-driven).**
  Rejected: ties autonomous execution to a third party whose ToS can
  change, exactly the dependency Pitfall #6 warns against.
- **Option C — Reject Meridian entirely.** Rejected: the proxy is a real
  cost lever for non-autonomous (planner / interactive) usage, and a
  cost-aware router (ROUTE-03) benefits from having it as an explicit
  choice rather than pretending it does not exist.

## Decision Outcome

Adopt Option A. Meridian is one of four `IProvider` adapters; the
autonomous path's phase-completion gate is the Meridian-disabled
end-to-end run. ROUTE-01..04 are implemented to make adapter selection a
per-role / per-step config, never implicit, so a future route change
(e.g. "this role moves to Meridian for cost") is a config-shaped diff
rather than a code-shaped one.

## Consequences

- Phase 4 ships a `NABLA_MERIDIAN_DISABLED=1` config flag honored by the
  routing policy. When set, the policy filters Meridian out before any
  ranking step runs.
- The cost-aware router (ROUTE-03) ranks adapters by cost-per-token but
  filters out disabled adapters before ranking, so a disabled Meridian
  cannot accidentally win on cost.
- Adding a fifth provider remains "one new adapter file" (ROUTE-01
  invariant). The routing policy reads adapter files; new files are
  picked up without other code changes.
- Meridian ToS posture is re-checked at Phase 4 start; if the ToS has
  hardened against agent use, this ADR is superseded by an ADR that
  removes Meridian from the default adapter set.

## Verification

- The four `IProvider` adapters exist as one-file-each: `anthropic.ts`, `anthropic-via-meridian.ts`, `openai.ts`, `openrouter.ts` (file count, file size sanity).
- Setting `NABLA_MERIDIAN_DISABLED=1` causes the router policy to exclude the Meridian adapter from any role assignment; `nabla status` and the run manifest show no Meridian-routed call.
- An end-to-end synthetic task completes successfully with `NABLA_MERIDIAN_DISABLED=1` — Anthropic-direct + OpenAI + OpenRouter is sufficient for the autonomous flow.
- Cost accounting (ROUTE-04) records `provider` per call; the recorded value matches the adapter file used.
- Adding a fifth provider is verified by a synthetic test that drops a stub adapter file and asserts the router picks it up without other code changes (one-file invariant).

## Out of scope (deferred)

- Provider failover within a role (e.g. retry on a different provider on
  rate-limit) is ROUTE-v2-01.
- Meridian header-stripping per Meridian issue #278 is a Phase-4
  implementation concern, not a Phase-0 invariant.
