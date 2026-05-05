// RED stub -- typed scaffold so lefthook's `tsc -b` gate passes while the
// runtime tests in middleware.test.ts genuinely fail. Real implementation
// lands in the GREEN commit (DAEMON-04 bearer-auth + D-04 envelope; Pitfall
// C ordering + Pitfall E length-check before timingSafeEqual).
import type { bearerAuth } from "hono/bearer-auth";

export const makeAuthMiddleware = (_token: string): ReturnType<typeof bearerAuth> => {
  throw new Error("RED stub: not implemented");
};
