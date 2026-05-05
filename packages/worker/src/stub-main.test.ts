import { describe, expect, test } from "bun:test";
import { SummarySchema } from "@nabla/shared/protocol/summary";

const STUB = "packages/worker/src/stub-main.ts";

// Helper -- spawn the stub with controlled env + stdin, collect stdout/stderr/exit.
interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}
const runStub = async (
  stdin: string,
  env: Record<string, string | undefined>,
): Promise<RunResult> => {
  const proc = Bun.spawn({
    cmd: ["bun", "run", STUB],
    env: { ...env } as Record<string, string>,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin) {
    proc.stdin.write(stdin);
  }
  proc.stdin.end();
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
};

describe("D-09 / WORK-04 stub worker", () => {
  test("happy path: NABLA_WORKER_BYPASS=1 + valid JSON-RPC -> envelope + exit 0", async () => {
    const frame = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "task.run", params: { what: "stub-test" } })}\n`;
    const r = await runStub(frame, { NABLA_WORKER_BYPASS: "1", PATH: process.env.PATH ?? "" });
    expect(r.exitCode).toBe(0);
    const envelope = SummarySchema.parse(JSON.parse(r.stdout.trim()));
    expect(envelope.status).toBe("ok");
    expect(envelope.summary).toContain("phase-1 stub");
  });

  test("missing bypass: NABLA_WORKER_BYPASS unset -> exit 2", async () => {
    const r = await runStub("", { PATH: process.env.PATH ?? "" });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("NABLA_WORKER_BYPASS");
  });

  test("malformed JSON line -> exit 3", async () => {
    const r = await runStub("this is not json\n", {
      NABLA_WORKER_BYPASS: "1",
      PATH: process.env.PATH ?? "",
    });
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toContain("malformed task descriptor");
  });

  test("empty stdin (EOF immediately) -> exit 4", async () => {
    const r = await runStub("", { NABLA_WORKER_BYPASS: "1", PATH: process.env.PATH ?? "" });
    expect(r.exitCode).toBe(4);
    expect(r.stderr).toContain("no task descriptor received");
  });
});
