// Placeholder; refined in Phase 3 (WORK-03).
import { z } from "zod";

export const SummarySchema = z.object({
  status: z.enum(["ok", "blocked", "failed"]),
  filesChanged: z.array(z.string()),
  decisions: z.array(z.unknown()),
  blockers: z.array(z.unknown()),
  summary: z.string(),
});
export type Summary = z.infer<typeof SummarySchema>;
