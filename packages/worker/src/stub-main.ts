// D-09: Phase 1 stub worker. Reads ONE newline-delimited JSON-RPC 2.0
// request from stdin, emits a WORK-03 envelope (SummarySchema) on stdout,
// exits 0. NO agent loop, NO provider call, NO project access. Phase 3
// supersedes with the real loop in `packages/worker/src/loop.ts`.
//
// D-10 defence-in-depth: refuse to start unless NABLA_WORKER_BYPASS is "1".
// The runtime layer (plan 04) unconditionally sets this env on container
// create; missing => runtime-config bug. Worker-side check is belt-and-
// braces, not a substitute for the runtime contract.
import { createInterface } from "node:readline";

import { JsonRpcRequestSchema } from "@nabla/shared/protocol/rpc";
import { type Summary, SummarySchema } from "@nabla/shared/protocol/summary";

export const main = async (): Promise<void> => {
  if (process.env.NABLA_WORKER_BYPASS !== "1") {
    process.stderr.write(
      `${JSON.stringify({
        error: "NABLA_WORKER_BYPASS env not set; refusing to start",
      })}\n`,
    );
    process.exit(2);
  }

  const rl = createInterface({ input: process.stdin });
  let received: unknown = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      received = JsonRpcRequestSchema.parse(JSON.parse(line));
      break;
    } catch (err) {
      process.stderr.write(
        `${JSON.stringify({
          error: "malformed task descriptor",
          err: String(err),
        })}\n`,
      );
      process.exit(3);
    }
  }
  if (received === null) {
    process.stderr.write(
      `${JSON.stringify({
        error: "no task descriptor received on stdin",
      })}\n`,
    );
    process.exit(4);
  }

  const envelope: Summary = SummarySchema.parse({
    status: "ok",
    filesChanged: [],
    decisions: [],
    blockers: [],
    summary: "phase-1 stub: received task descriptor, returning empty envelope",
  });
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
  process.exit(0);
};

if (import.meta.main) {
  main().catch((err: unknown) => {
    process.stderr.write(`${JSON.stringify({ error: "unhandled", err: String(err) })}\n`);
    process.exit(1);
  });
}
