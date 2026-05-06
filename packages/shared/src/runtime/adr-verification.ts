// Phase 1 plan 08 — shared extractor for ADR ## Verification blocks.
// Single source of truth for both the Phase-0 structural verifier
// (scripts/verify-adrs.test.ts) AND the Phase-1 docker-flag audit
// (packages/daemon/src/runtime/docker-flag-audit.test.ts). Lives in
// @nabla/shared because it crosses package boundaries (PATTERNS.md S3
// + PATTERNS.md S6); the previous home in packages/daemon/src/runtime/ forced
// the script-side consumer to use a 4-..-segment relative path.
// Closes 01-REVIEWS.md HIGH-3.
export const extractVerificationItems = (body: string): string[] => {
  const lines = body.split("\n");
  let inVerification = false;
  const items: string[] = [];
  for (const line of lines) {
    if (/^##\s+Verification\s*$/.test(line)) {
      inVerification = true;
      continue;
    }
    if (inVerification && /^##\s+/.test(line)) {
      break;
    }
    if (inVerification && /^\s*[-*]\s+\S/.test(line)) {
      items.push(line);
    }
  }
  return items;
};
