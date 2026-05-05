// D-01 (self-init), D-02 (32-byte CSPRNG base64url), D-03 (0600/0700 modes).
// Pitfall D: explicit chmod after create -- mkdir/writeFile honor umask, so
// the create call alone is not authoritative for the final mode.
import { chmod, mkdir, writeFile } from "node:fs/promises";

import { defaultConfigDir, defaultTokenPath, resolveToken } from "@nabla/shared/auth/token";

const TOKEN_BYTES = 32;

const mintTokenBase64Url = (): string => {
  const buf = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(buf);
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

/**
 * Daemon-only: resolve via shared, or mint + persist if absent.
 * The CLI MUST NOT call this -- only the daemon mints (CONTEXT.md <specifics>).
 */
export const resolveOrInitToken = async (): Promise<string> => {
  const existing = await resolveToken();
  if (existing !== null) return existing;

  const dir = defaultConfigDir();
  const path = defaultTokenPath();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const token = mintTokenBase64Url();
  await writeFile(path, token, { mode: 0o600 });
  await chmod(path, 0o600);
  return token;
};
