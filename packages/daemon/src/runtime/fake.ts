// CONT-02 (interface admits drop-in replacement -- this is the proof);
// Phase 0 D-08 shared types boundary. Test-only: NEVER imported from
// production code paths (gated by file basename `.fake.` is too magical;
// keep import-site discipline instead).
import type { ContainerHandle, ContainerSpec, ExecHandle } from "@nabla/shared";
import type { IContainerRuntime } from "./interface";

interface FakeContainer {
  id: string;
  name: string;
  state: "created" | "started" | "executed" | "stopped" | "destroyed";
  spec: ContainerSpec;
}

export class FakeRuntime implements IContainerRuntime {
  private containers = new Map<string, FakeContainer>();

  async create(spec: ContainerSpec): Promise<ContainerHandle> {
    const id = crypto.randomUUID();
    const name = spec.network ?? `fake-net-${id}`;
    const handle: ContainerHandle = { id, name };
    this.containers.set(id, { id, name, state: "created", spec });
    return handle;
  }

  async start(h: ContainerHandle): Promise<void> {
    const c = this.getContainer(h);
    if (c.state !== "created") {
      throw new Error(`cannot start container in state: ${c.state}`);
    }
    c.state = "started";
  }

  async exec(
    h: ContainerHandle,
    _cmd: string[],
    _opts?: { env?: Record<string, string> },
  ): Promise<ExecHandle> {
    const c = this.getContainer(h);
    if (c.state !== "started") {
      throw new Error(`cannot exec on container in state: ${c.state}`);
    }
    c.state = "executed";

    const waitPromise = Promise.resolve({ exitCode: 0 });

    return {
      stdin: {
        end: (data?: string) => {
          // Simulate writing data and resolving immediately
          if (data) {
            // Echo a fake summary to stdout would happen here
          }
        },
      } as unknown as NodeJS.WritableStream,
      stdout: {
        on: (_event: string, _handler: Function) => {},
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(
            JSON.stringify({
              status: "ok",
              filesChanged: [],
              decisions: [],
              blockers: [],
              summary: "fake-runtime echo",
            }) + "\n",
          );
        },
      } as unknown as NodeJS.ReadableStream,
      stderr: {
        on: (_event: string, _handler: Function) => {},
      } as unknown as NodeJS.ReadableStream,
      wait: async () => waitPromise,
    };
  }

  async stop(h: ContainerHandle, _opts?: { timeout?: number }): Promise<void> {
    const c = this.getContainer(h);
    if (c.state === "destroyed") return;
    c.state = "stopped";
  }

  async destroy(h: ContainerHandle): Promise<void> {
    // Idempotent: don't throw if already destroyed
    if (this.containers.has(h.id)) {
      this.containers.delete(h.id);
    }
  }

  private getContainer(h: ContainerHandle): FakeContainer {
    const c = this.containers.get(h.id);
    if (!c) throw new Error(`container not found: ${h.id}`);
    return c;
  }
}
