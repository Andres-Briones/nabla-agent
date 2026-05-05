// Phase 1: pino instance -- the daemon's sole structured logging facade.
// T-0-04 carry-forward: redact token / authorization paths so a stray
// `logger.info({ token })` cannot leak the bearer. Phase 2 will extend
// with rotation + a structured event taxonomy (DAEMON-03 logging
// requirement).
import pino from "pino";

export const logger = pino({
  level: process.env.NABLA_LOG_LEVEL ?? "info",
  redact: {
    paths: ["token", "*.token", "authorization", "Authorization", "*.authorization"],
    censor: "[redacted]",
  },
});
