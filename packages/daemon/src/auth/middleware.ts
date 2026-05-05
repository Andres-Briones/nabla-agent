// DAEMON-04: bearer-auth middleware emitting D-04 envelope on rejection.
// Pitfall C: must mount BEFORE error handlers (caller responsibility -- see
// packages/daemon/src/index.ts where this is mounted as the FIRST middleware).
// Pitfall E: timingSafeEqual throws on unequal-length buffers, so we
// length-check first -- length is not secret.
//
// D-04 uniformity: the project's rejection contract is "401 + WWW-Authenticate:
// Bearer + envelope" for ALL four DAEMON-04 branches (missing / malformed /
// wrong / short). RFC 6750 actually says malformed -> 400 and Hono's stock
// bearer-auth follows the RFC; we deliberately re-throw 400 as 401 here so
// the CLI sees ONE error path for "your bearer is bad" instead of two. The
// envelope code remains "unauthorized" across all branches per D-04.
import { timingSafeEqual } from "node:crypto";

import type { Context, MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { HTTPException } from "hono/http-exception";

const errorEnvelope = (code: string, message: string) => ({
  error: { code, message },
});

const constantTimeEqual = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
};

const MALFORMED_ENVELOPE = errorEnvelope(
  "unauthorized",
  "Invalid Authorization header format. Expected 'Bearer <token>'.",
);

export const makeAuthMiddleware = (token: string): MiddlewareHandler => {
  const inner = bearerAuth({
    verifyToken: async (provided, _c) => constantTimeEqual(provided, token),
    noAuthenticationHeaderMessage: (_c: Context) =>
      errorEnvelope("unauthorized", "Missing Authorization header. Expected 'Bearer <token>'."),
    invalidAuthenticationHeaderMessage: (_c: Context) => MALFORMED_ENVELOPE,
    invalidTokenMessage: (_c: Context) => errorEnvelope("unauthorized", "Invalid bearer token."),
  });

  // Wrap to rewrite Hono's RFC-correct 400 (malformed Authorization) into
  // our project-uniform 401, preserving the envelope. Missing-header (401)
  // and wrong-token (401) paths flow through unchanged.
  return async (c, next) => {
    try {
      return await inner(c, next);
    } catch (err) {
      if (err instanceof HTTPException && err.status === 400) {
        throw new HTTPException(401, {
          res: new Response(JSON.stringify(MALFORMED_ENVELOPE), {
            status: 401,
            headers: {
              "WWW-Authenticate": 'Bearer error="invalid_request"',
              "content-type": "application/json",
            },
          }),
        });
      }
      throw err;
    }
  };
};
