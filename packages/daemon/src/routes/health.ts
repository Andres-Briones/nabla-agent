// GET /health -- liveness probe. Lives behind the bearer-auth gate (mounted
// in index.ts), so a 200 here proves the auth gate accepted the bearer.
import { Hono } from "hono";

export const healthRoute = new Hono().get("/", (c) => c.json({ status: "ok", version: "0.0.0" }));
