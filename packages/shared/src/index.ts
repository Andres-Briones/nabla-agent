// @nabla/shared root export -- re-exports all sub-modules so consumers can
// either deep-import from "@nabla/shared/auth/token" (preferred for tree-
// shaking) or pull from the root for convenience.

export {
  APP_DIR,
  defaultConfigDir,
  defaultTokenPath,
  resolveToken,
  TOKEN_FILENAME,
} from "./auth/token";
export { type Blocker, BlockerSchema } from "./protocol/blocker";
export { type ErrorEnvelope, ErrorEnvelopeSchema } from "./protocol/error";
export { type Event, EventSchema } from "./protocol/event";
export { type Plan, PlanSchema } from "./protocol/plan";
export { type JsonRpcRequest, JsonRpcRequestSchema } from "./protocol/rpc";
export { type Summary, SummarySchema } from "./protocol/summary";
export {
  type ContainerHandle,
  type ContainerSpec,
  ContainerSpecSchema,
  type ExecHandle,
} from "./runtime/container-spec";
export { wireStdio } from "./runtime/jsonrpc-stdio";
export { type Mount, MountSchema } from "./runtime/mount";
export { type WorkerSpawnSpec, WorkerSpawnSpecSchema } from "./runtime/worker-spawn-spec";
export { PROTOCOL_VERSION } from "./version";
