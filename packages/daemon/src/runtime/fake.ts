// CONT-02 (interface admits drop-in replacement -- this is the proof);
// Phase 0 D-08 shared types boundary. Test-only: NEVER imported from
// production code paths (gated by file basename `.fake.` is too magical;
// keep import-site discipline instead).
//
// Phase 1 plan 10 (closes 01-REVIEWS.md HIGH-5): wait() and stdout are
// gated on stdin.end(). DockerRuntime's stdout only emits after stdin
// closes (the hijacked stream's TCP-style behaviour); FakeRuntime now
// mirrors that. A consumer that forgets to end stdin will HANG on
// readAll(stdout) AND on wait() — same failure mode as DockerRuntime.
import { PassThrough } from "node:stream";
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

    // The contract: stdout emits the envelope AFTER stdin closes,
    // and wait() resolves AFTER stdin closes. This is the same
    // observable behaviour DockerRuntime exposes (the hijacked
    // stream only flushes the demux after stdin TCP-half-close).
    let resolveStdinClosed!: () => void;
    const stdinClosed = new Promise<void>((r) => {
      resolveStdinClosed = r;
    });

    const stdin = new PassThrough();
    stdin.on("finish", () => resolveStdinClosed());
    stdin.on("end", () => resolveStdinClosed());

    const envelope = `${JSON.stringify({
      status: "ok",
      filesChanged: [],
      decisions: [],
      blockers: [],
      summary: "fake-runtime echo",
    })}\n`;

    // Drive the stdout PassThrough only after stdin closes.
    const stdout = new PassThrough();
    void stdinClosed.then(() => {
      stdout.write(envelope);
      stdout.end();
    });

    const stderr = new PassThrough();
    // Empty stderr; close it on the same cue so consumers iterating
    // stderr don't hang either.
    void stdinClosed.then(() => stderr.end());

    return {
      stdin: stdin as NodeJS.WritableStream,
      stdout: stdout as NodeJS.ReadableStream,
      stderr: stderr as NodeJS.ReadableStream,
      wait: async (): Promise<{ exitCode: number }> => {
        await stdinClosed;
        return { exitCode: 0 };
      },
    };
  }

  async stop(h: ContainerHandle, _opts?: { timeout?: number }): Promise<void> {
    const c = this.getContainer(h);
    if (c.state === "destroyed") return;
    c.state = "stopped";
  }

  async destroy(h: ContainerHandle): Promise<void> {
    // Idempotent: don't throw if already destroyed.
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
