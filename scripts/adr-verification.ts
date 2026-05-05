// Phase 1 plan 04 -- shared extractor for ADR ## Verification blocks.
// Lifted from scripts/verify-adrs.test.ts (Phase 0 P05). Both the Phase-0
// structural verifier AND the new docker-flag audit import from here so
// the parser has one source of truth (PATTERNS.md S6, RESEARCH.md line
// 330: "don't re-implement the parser; reuse Phase 0's").
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
