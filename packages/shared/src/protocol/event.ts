// Placeholder; refined in Phase 5 (CLI-07).
import { z } from "zod";

export const EventSchema = z.object({
  type: z.string(),
  runId: z.string(),
  ts: z.string(),
  payload: z.unknown(),
});
export type Event = z.infer<typeof EventSchema>;
