// CONT-02 (interface impl), CONT-03 (ADR-0001 hardening), CONT-01 (per-worker
// container reaped on exit -- destroy() removes container + bridge), WORK-04
// (D-10 NABLA_WORKER_BYPASS=1 injected unconditionally), D-08 (per-task /work
// tmpfs), D-20 (labels), D-05 (per-worker --internal bridge).
//
// Pitfall 1 (dockerode #462): exec.start() end-event unreliable on second
// exec on same container -- we never reuse containers (one container per
// worker; one exec per container) AND wait() listens on close/end/error.
// Pitfall 2: demuxStream required when Tty=false.
// Pitfall 5: NetworkMode "bridge" string connects to default bridge with
// external connectivity; we always pass a created --internal bridge name.
// Pitfall 7: stop({ t: 8 }) leaves 2s slack for daemon shutdown grace.
// Pitfall 8: destroy() removes container AND its bridge.
import { PassThrough } from "node:stream";
import type { ContainerHandle, ContainerSpec, ExecHandle, Mount } from "@nabla/shared";
import Docker from "dockerode";
import type { IContainerRuntime } from "./interface";

// ADR-0001 #5: spec validation rejects docker.sock / podman.sock mounts
// before any docker call. Defence in depth alongside the audit.
//
// Phase 1 plan 10 (closes 01-REVIEWS.md MEDIUM): match docker.sock
// OR podman.sock at any segment boundary. Reject:
//   /var/run/docker.sock           (canonical)
//   /var/run/docker.sock.bak       (suffix-after-dot)
//   /host/var/run/docker.sock/foo  (mid-path)
//   /run/podman/podman.sock        (podman variant)
const DOCKER_SOCK_RX = /(?:^|[\\/])(?:docker\.sock|podman\.sock)(?:$|[\\/]|\.)/;

const validateSpec = (spec: ContainerSpec): void => {
  for (const m of spec.mounts) {
    if (DOCKER_SOCK_RX.test(m.source)) {
      throw new Error(
        `spec mount rejected: docker/podman socket forbidden in source (got '${m.source}')`,
      );
    }
    if (DOCKER_SOCK_RX.test(m.target)) {
      throw new Error(
        `spec mount rejected: docker/podman socket forbidden in target (got '${m.target}')`,
      );
    }
  }
};

const labelOrEmpty = (labels: Record<string, string>, key: string): string => labels[key] ?? "";

export class DockerRuntime implements IContainerRuntime {
  constructor(private readonly docker: Docker = new Docker()) {}

  async create(spec: ContainerSpec): Promise<ContainerHandle> {
    validateSpec(spec);

    // Per-worker --internal bridge (D-05). Name encodes run_id + worker_id
    // so destroy() can find it.
    const runId = labelOrEmpty(spec.labels, "nabla.run_id");
    const workerId = labelOrEmpty(spec.labels, "nabla.worker_id");
    const netName = `nabla-net-${runId}-${workerId}`;
    await this.docker.createNetwork({ Name: netName, Driver: "bridge", Internal: true });

    const container = await this.docker.createContainer({
      Image: spec.image,
      Cmd: spec.cmd,
      User: spec.user,
      Env: Object.entries({ NABLA_WORKER_BYPASS: "1", ...spec.env }).map(([k, v]) => `${k}=${v}`),
      Labels: spec.labels,
      WorkingDir: spec.workdir,
      Tty: spec.tty,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      OpenStdin: true,
      StdinOnce: true,
      HostConfig: {
        CapDrop: ["ALL"], // ADR-0001 #2
        SecurityOpt: ["no-new-privileges:true"], // ADR-0001 #3
        ReadonlyRootfs: true, // ADR-0001 #4
        Privileged: false, // ADR-0001 #6
        NetworkMode: netName, // ADR-0001 #7
        Tmpfs: { "/work": "rw,size=64m,mode=0755" }, // D-08
        Mounts: spec.mounts.map((m: Mount) => ({
          Type: m.type === "bind" ? "bind" : m.type === "volume" ? "volume" : "tmpfs",
          Source: m.source,
          Target: m.target,
          ReadOnly: m.readonly,
        })),
      },
    });

    return { id: container.id, name: netName };
  }

  async start(h: ContainerHandle): Promise<void> {
    await this.docker.getContainer(h.id).start();
  }

  async exec(
    h: ContainerHandle,
    cmd: string[],
    opts?: { env?: Record<string, string> },
  ): Promise<ExecHandle> {
    const exec = await this.docker.getContainer(h.id).exec({
      Cmd: cmd,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Env: Object.entries(opts?.env ?? {}).map(([k, v]) => `${k}=${v}`),
    });
    const stream = await exec.start({ hijack: true, stdin: true });

    // Pitfall 2: dockerode multiplexes stdout+stderr when Tty=false.
    const stdoutPass = new PassThrough();
    const stderrPass = new PassThrough();
    this.docker.modem.demuxStream(stream, stdoutPass, stderrPass);

    // 01-REVIEWS.md MEDIUM: capture the first stream error so wait()
    // can distinguish "stream broke mid-exec" from "container exited
    // with code -1." We rethrow a tagged error from wait() in the
    // former case.
    let streamError: Error | null = null;
    stream.once("error", (err: Error) => {
      if (!streamError) streamError = err;
    });

    // 01-REVIEWS.md MEDIUM: wrap stdin in a writable-only proxy. The
    // hijacked stream is bidirectional; consumers that accidentally
    // pipe FROM stdin would steal bytes destined for the demux. The
    // proxy surfaces only the WritableStream methods.
    const stdinProxy: NodeJS.WritableStream = {
      write: stream.write.bind(stream),
      end: stream.end.bind(stream),
      // Optional Writable methods consumers may call:
      cork: typeof stream.cork === "function" ? stream.cork.bind(stream) : () => {},
      uncork: typeof stream.uncork === "function" ? stream.uncork.bind(stream) : () => {},
      setDefaultEncoding:
        typeof stream.setDefaultEncoding === "function"
          ? stream.setDefaultEncoding.bind(stream)
          : () => stdinProxy,
      on: stream.on.bind(stream),
      once: stream.once.bind(stream),
      off: stream.off.bind(stream),
      emit: stream.emit.bind(stream),
      removeListener: stream.removeListener.bind(stream),
      removeAllListeners: stream.removeAllListeners.bind(stream),
      addListener: stream.addListener.bind(stream),
      listenerCount: stream.listenerCount.bind(stream),
      listeners: stream.listeners.bind(stream),
      rawListeners: stream.rawListeners.bind(stream),
      eventNames: stream.eventNames.bind(stream),
      getMaxListeners: stream.getMaxListeners.bind(stream),
      setMaxListeners: stream.setMaxListeners.bind(stream),
      prependListener: stream.prependListener.bind(stream),
      prependOnceListener: stream.prependOnceListener.bind(stream),
      // Mark as writable for type narrowing.
      get writable() {
        return stream.writable;
      },
      get writableEnded() {
        return stream.writableEnded;
      },
      get writableFinished() {
        return stream.writableFinished;
      },
    } as unknown as NodeJS.WritableStream;

    const wait = async (): Promise<{ exitCode: number }> => {
      // Pitfall 1: listen on close/end/error AND poll inspect.
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        stream.once("close", finish);
        stream.once("end", finish);
        stream.once("error", finish);
      });
      if (streamError) {
        // Distinguishable from a real -1 exit: streamError is an Error
        // instance with a message; downstream code can catch and inspect.
        throw new Error(`exec stream error: ${streamError.message}`, {
          cause: streamError,
        });
      }
      const inspect = await exec.inspect();
      return { exitCode: inspect.ExitCode ?? -1 };
    };
    return { stdin: stdinProxy, stdout: stdoutPass, stderr: stderrPass, wait };
  }

  async stop(h: ContainerHandle, opts?: { timeout?: number }): Promise<void> {
    // Pitfall 7: never use t: 10 -- leaves no slack for daemon shutdown.
    const t = opts?.timeout ?? 8;
    try {
      await this.docker.getContainer(h.id).stop({ t });
    } catch (err) {
      // Already stopped or removed -- not an error worth surfacing here;
      // destroy() runs unconditionally on the shutdown path (D-14 step 3).
      if (!/is not running|No such container/.test(String(err))) throw err;
    }
  }

  async destroy(h: ContainerHandle): Promise<void> {
    // Pitfall 8: remove BOTH container and bridge network. Idempotent.
    try {
      await this.docker.getContainer(h.id).remove({ force: true });
    } catch {
      /* idempotent */
    }
    try {
      await this.docker.getNetwork(h.name).remove();
    } catch {
      /* idempotent */
    }
  }
}
