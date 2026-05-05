// Placeholder; refined in Phase 4 (PLAN-02). The package boundary locks now
// so downstream packages import from the stable path from Day 0 (D-08).
import { z } from "zod";

export const PlanSchema = z.object({
  id: z.string(),
  version: z.string(),
  steps: z.array(z.unknown()),
});
export type Plan = z.infer<typeof PlanSchema>;
