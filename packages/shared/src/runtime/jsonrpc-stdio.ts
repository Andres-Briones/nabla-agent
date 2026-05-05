// D-11: JSON-RPC framing library = `json-rpc-2.0` 1.7.1 (MIT). Newline-
// delimited stdio is the daemon ↔ worker transport per RESEARCH §3 Pattern 2.
// Phase 3 will instantiate JSONRPCServerAndClient against this wire helper.

import { createInterface } from "node:readline";
import type { JSONRPCServerAndClient } from "json-rpc-2.0";

export const wireStdio = (
  serverAndClient: JSONRPCServerAndClient,
  stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
): void => {
  const rl = createInterface({ input: stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      void serverAndClient.receiveAndSend(JSON.parse(line));
    } catch (_err) {
      // Malformed line: emit a JSON-RPC error response per the spec.
      const payload = JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      stdout.write(`${payload}\n`);
    }
  });
};
