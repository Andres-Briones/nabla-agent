// D-17 (IContainerRuntime spawn-spec mounts), D-08 (per-task /work scratch).
// Refined in Phase 5 when worktree mounts are added.
import { z } from "zod";

export const MountSchema = z.object({
  source: z.string(), // host path or volume name
  target: z.string(), // container path
  readonly: z.boolean().default(false),
  type: z.enum(["bind", "volume", "tmpfs"]).default("bind"),
});
export type Mount = z.infer<typeof MountSchema>;
