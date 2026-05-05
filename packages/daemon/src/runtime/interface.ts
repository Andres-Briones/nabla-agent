// CONT-02 (drop-in replacement), D-17 (interface shape locked by ROADMAP SC#1).
// This is the contract every later phase imports; keep the surface minimal
// (5 methods). Do NOT add Docker-specific shapes here.
import type { ContainerHandle, ContainerSpec, ExecHandle } from "@nabla/shared";

export interface IContainerRuntime {
  create(spec: ContainerSpec): Promise<ContainerHandle>;
  start(h: ContainerHandle): Promise<void>;
  exec(
    h: ContainerHandle,
    cmd: string[],
    opts?: { env?: Record<string, string> },
  ): Promise<ExecHandle>;
  stop(h: ContainerHandle, opts?: { timeout?: number }): Promise<void>;
  destroy(h: ContainerHandle): Promise<void>;
}
