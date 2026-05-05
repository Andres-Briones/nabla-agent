// Placeholder; refined in Phase 3 (SAFE-01..03).
import { z } from "zod";

export const BlockerSchema = z.object({
  id: z.string(),
  question: z.string(),
  policy: z.enum(["best-guess", "escalate"]),
  context: z.unknown().optional(),
});
export type Blocker = z.infer<typeof BlockerSchema>;
