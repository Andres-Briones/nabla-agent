// In-memory registry of active container handles. Phase 2 (PERSIST-01)
// replaces this with a bun:sqlite-backed implementation; the consumer
// surface (Map-like Iterable) does not change. Used by shutdown.ts (plan 05)
// via `handles: () => activeHandles.values()`.
import type { ContainerHandle } from "@nabla/shared";

export const activeHandles = new Map<string, ContainerHandle>();
