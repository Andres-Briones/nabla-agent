// RED stub -- typed scaffold so lefthook's `tsc -b` gate passes while the
// runtime tests in index.test.ts genuinely fail (resolveDaemonHost does not
// yet read NABLA_DAEMON_HOST). Real implementation lands in the GREEN commit:
// auth FIRST, env-driven host with 127.0.0.1 fallback (ADR-0003 invariant #9),
// SSE stub mounted, /health route mounted, T-0-04 startup line does NOT log
// the token.
import type { Hono } from "hono";

export const resolveDaemonHost = (): string => {
  throw new Error("RED stub: not implemented");
};

export const buildDaemonApp = async (): Promise<Hono> => {
  throw new Error("RED stub: not implemented");
};
