// D-17 (IContainerRuntime spawn spec), D-08 (mounts), D-20 (labels schema).
// CapDrop/SecurityOpt/ReadonlyRootfs flags live in DockerRuntime, not here --
// the spec is the *requested* shape; ADR-0001 hardening is enforcement.
import { z } from "zod";

import { MountSchema } from "./mount";

export const ContainerSpecSchema = z.object({
  image: z.string(),
  cmd: z.array(z.string()).optional(),
  // entrypoint override; tests use this to keep a container alive past its production ENTRYPOINT
  entrypoint: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).default({}),
  labels: z.record(z.string(), z.string()).default({}),
  mounts: z.array(MountSchema).default([]),
  network: z.string().optional(),
  user: z.string().default("1000:1000"),
  workdir: z.string().optional(),
  tty: z.boolean().default(false),
});
export type ContainerSpec = z.infer<typeof ContainerSpecSchema>;

export interface ContainerHandle {
  id: string;
  name: string;
}
export interface ExecHandle {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  wait: () => Promise<{ exitCode: number }>;
}
