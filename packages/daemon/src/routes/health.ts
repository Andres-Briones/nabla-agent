// RED stub -- typed scaffold so lefthook's `tsc -b` gate passes while the
// runtime tests genuinely fail. Real implementation lands in the GREEN
// commit (GET / -> { status, version }).
import { Hono } from "hono";

export const healthRoute: Hono = new Hono();
