// CONT-02 (interface impl), CONT-03 (ADR-0001 hardening), CONT-01 (per-worker
// container reaped on exit -- destroy() removes container + bridge), WORK-04
// (D-10 NABLA_WORKER_BYPASS=1 injected unconditionally), D-08 (per-task /work
// tmpfs), D-20 (labels), D-05 (per-worker --internal bridge).
//
// Pitfall 1 (dockerode #462 + Bun 1.3 hijack-stream quirk): under Bun,
// stream close/end/error events on hijacked exec streams do not fire
// reliably for the first (and only) exec on a freshly-started container.
// wait() therefore POLLS exec.inspect() for Running:false (~100ms) as the
// primary mechanism and races it against the stream-event listener as a
// fast-path. We still never reuse containers (one container per worker;
// one exec per container).
// Pitfall 1b (Bun 1.3 + dockerode hijack-with-stdin): exec.start({ hijack: true,
// stdin: true }) never resolves under Bun for read-only commands; the HTTP
// upgrade dance for the bidirectional duplex hangs. Default opts.attachStdin
// is `false`, which uses { hijack: false, stdin: false } and a no-op stdin
// stub. Callers that genuinely need to write to stdin (worker JSON-RPC task
// descriptor, Phase 3) must opt in with { attachStdin: true }; that path is
// unblocked when the upstream Bun/dockerode interaction is fixed.
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
      Entrypoint: spec.entrypoint,
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
    opts?: { env?: Record<string, string>; attachStdin?: boolean },
  ): Promise<ExecHandle> {
    // Pitfall 1b: default attachStdin=false to avoid Bun's hijack-with-stdin hang.
    const attachStdin = opts?.attachStdin === true;
    const exec = await this.docker.getContainer(h.id).exec({
      Cmd: cmd,
      AttachStdin: attachStdin,
      AttachStdout: true,
      AttachStderr: true,
      Env: Object.entries(opts?.env ?? {}).map(([k, v]) => `${k}=${v}`),
    });
    const stream = await exec.start({ hijack: attachStdin, stdin: attachStdin });

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
    //
    // Pitfall 1b: when attachStdin is false the stream is read-only;
    // stdinProxy becomes a no-op stub so callers that habitually call
    // .end() (egress-block test, etc.) don't crash.
    const stdinProxy: NodeJS.WritableStream = !attachStdin
      ? ({
          write: () => true,
          end: () => stdinProxy,
          on: () => stdinProxy,
          once: () => stdinProxy,
          off: () => stdinProxy,
          emit: () => false,
          removeListener: () => stdinProxy,
          removeAllListeners: () => stdinProxy,
          addListener: () => stdinProxy,
          listenerCount: () => 0,
          listeners: () => [],
          rawListeners: () => [],
          eventNames: () => [],
          getMaxListeners: () => 0,
          setMaxListeners: () => stdinProxy,
          prependListener: () => stdinProxy,
          prependOnceListener: () => stdinProxy,
          cork: () => {},
          uncork: () => {},
          setDefaultEncoding: () => stdinProxy,
          writable: false,
          writableEnded: true,
          writableFinished: true,
        } as unknown as NodeJS.WritableStream)
      : ({
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
        } as unknown as NodeJS.WritableStream);

    const wait = async (): Promise<{ exitCode: number }> => {
      // See Pitfall note at top of file: polling exec.inspect() for
      // Running:false is the GUARANTEE; stream events are kept as a
      // fast-path that may resolve sooner with no penalty.
      let pollHandle: ReturnType<typeof setInterval> | null = null;
      let done = false;
      const finish = (resolve: () => void): void => {
        if (!done) {
          done = true;
          resolve();
        }
      };

      // Hoisted so the `finally` block can remove them when the poll wins.
      let onClose: (() => void) | undefined;
      let onEnd: (() => void) | undefined;
      let onError: (() => void) | undefined;

      const eventPromise = new Promise<void>((resolve) => {
        onClose = () => finish(resolve);
        onEnd = () => finish(resolve);
        onError = () => finish(resolve);
        stream.once("close", onClose);
        stream.once("end", onEnd);
        stream.once("error", onError);
      });

      const pollPromise = new Promise<void>((resolve) => {
        pollHandle = setInterval(() => {
          // Best-effort; swallow inspect errors and let the next tick retry.
          // A persistent failure is fine -- the eventPromise will still fire,
          // or the test's outer timeout catches a truly stuck exec.
          exec.inspect().then(
            (info) => {
              if (info.Running === false) finish(resolve);
            },
            () => {
              /* transient inspect error -- try again next tick */
            },
          );
        }, 100);
      });

      try {
        await Promise.race([eventPromise, pollPromise]);
      } finally {
        if (pollHandle) clearInterval(pollHandle);
        // Best-effort listener cleanup; if eventPromise won, the once()
        // handlers already removed themselves but off() on an absent
        // listener is a no-op.
        if (onClose) stream.off("close", onClose);
        if (onEnd) stream.off("end", onEnd);
        if (onError) stream.off("error", onError);
      }

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
