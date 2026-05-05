# Architecture Decision Records (ADRs)

This directory captures the project's architecturally significant
decisions. The template is **MADR 4.0** (https://adr.github.io/madr/) —
YAML front matter with `status`, `date`, and `decision-makers` keys,
followed by `Context and Problem Statement`, `Considered Options`,
`Decision Outcome`, and `Consequences` sections.

Per project policy (D-09 / RESEARCH.md Pitfall F: ADR-as-contract), each
ADR closes with a **`## Verification`** subsection containing testable
propositions. Later-phase verifiers read these propositions
mechanically — `scripts/verify-adrs.test.ts` enforces that the section
exists and contains at least three bulleted items per ADR.

## Index

- [0001 — Container Threat Model](./0001-container-threat-model.md) —
  Phase 1's `IContainerRuntime` Docker hardening contract; consumed
  verbatim by Phase 1 SC#5 (`docker inspect` audit reads the
  Verification list).
- [0002 — Meridian Risk and Fallback Posture](./0002-meridian-risk-and-fallback.md)
  — Meridian as one of four `IProvider` adapters; Phase 4 SC#5 enforces
  the `NABLA_MERIDIAN_DISABLED=1` autonomous-path gate.
- [0003 — v1 to v2 Invariants](./0003-v1-to-v2-invariants.md) —
  Cross-cutting invariants every later phase defends (network-shaped
  IPC, auth-on-every-request, shared-types-only-in-`packages/shared`,
  license-CI gate stays wired, env-driven daemon hostname,
  `@anthropic-ai/claude-agent-sdk` forbidden, GPL family requires an
  override ADR).

## Adding a new ADR

1. Number sequentially. The next ADR is `0004-...`. Use a lowercase
   hyphen-separated slug: `0004-short-topic.md`.
2. Use MADR 4.0 front matter — at minimum `status`, `date`, and
   `decision-makers`. Add `informed-by` for relevant research notes,
   pitfalls, requirements, or upstream decisions.
3. End the file with a `## Verification` subsection containing **at
   least three** mechanically-checkable propositions, one per bullet.
   "Mechanically checkable" means a later phase can write a script (or a
   `grep`, or a `docker inspect` walk) that reads the proposition and
   says yes/no without human judgment.
4. Run `bun test scripts/verify-adrs.test.ts` to confirm the structural
   gate stays green.
5. Update this README's Index to link the new ADR with a one-line
   description.

## Superseding

ADRs are append-only. To revise an accepted decision:

1. Write a new ADR (`00NN-...`) that states the new decision and links
   back to the one it replaces.
2. In the **superseded** ADR, change the front-matter `status:` from
   `accepted` to `superseded by 00NN-<slug>` and link the replacement
   from the body.
3. Do **not** edit the body of a superseded ADR. The original text is
   the audit trail; future readers must be able to see what the project
   used to believe and why it changed.
