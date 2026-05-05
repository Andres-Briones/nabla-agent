// Source of truth for token path resolution. Used by both daemon (verifier)
// and CLI (sender). Resolution order per D-03:
//   1. NABLA_TOKEN env var (highest)
//   2. $XDG_CONFIG_HOME/nabla/token
//   3. $HOME/.config/nabla/token (when XDG_CONFIG_HOME unset)
// This module does NOT mint tokens. Minting is daemon-only (see
// packages/daemon/src/auth/token-init.ts) -- the CLI never writes the token.
import { homedir } from "node:os";
import { join } from "node:path";

export const TOKEN_FILENAME = "token";
export const APP_DIR = "nabla";

/** XDG-spec aware default config directory. */
export const defaultConfigDir = (): string => {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg !== undefined && xdg.length > 0) return join(xdg, APP_DIR);
  return join(homedir(), ".config", APP_DIR);
};

export const defaultTokenPath = (): string => join(defaultConfigDir(), TOKEN_FILENAME);

/**
 * Resolve the active token without minting.
 * Order: NABLA_TOKEN env > token file > null.
 * Daemon callers wrap this in mintTokenIfMissing; CLI callers do not.
 */
export const resolveToken = async (): Promise<string | null> => {
  const env = process.env.NABLA_TOKEN;
  if (env !== undefined && env.length > 0) return env;

  const path = defaultTokenPath();
  try {
    const f = Bun.file(path);
    if (await f.exists()) {
      const raw = (await f.text()).trim();
      return raw.length > 0 ? raw : null;
    }
  } catch {
    return null;
  }
  return null;
};
