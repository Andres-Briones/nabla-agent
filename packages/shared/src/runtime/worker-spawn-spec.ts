// D-17, D-27 — WorkerSpawnSpec is currently a ContainerSpec; v1.x adds
// `image_profile` plan-step override. Phase 5 will add per-worker worktree
// mount entries via the inherited `mounts` field.
export {
  type ContainerSpec as WorkerSpawnSpec,
  ContainerSpecSchema as WorkerSpawnSpecSchema,
} from "./container-spec";
