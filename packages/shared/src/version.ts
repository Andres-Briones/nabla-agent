/**
 * Phase 0 protocol version.
 * Bumped MAJOR on any wire-incompatible change to plan / rpc / event /
 * summary / blocker. Bumped MINOR on additive (back-compat) field additions.
 * Phase 4 will lock the schema-versioning ADR; this constant is the
 * placeholder anchor.
 */
export const PROTOCOL_VERSION = "0.1.0" as const;
