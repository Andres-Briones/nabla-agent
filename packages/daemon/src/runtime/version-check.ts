// D-03: image-version coupling. The daemon reads the worker package's
// version (packages/worker/package.json) and the active profile name from
// its config (plan 05 wires the config), then asserts that
// `nabla-worker:<version>-<profile>` matches the configured tag. A
// mismatch is a refuse-to-spawn error -- never a warning. Prevents the
// class of bug where the image expects an env var the code no longer
// reads (RESEARCH arch §2 closing bullet).
//
// Pure helper: takes the three values as arguments so it is unit-testable
// without spinning the daemon. Plan 05 wires the call site.
export interface VersionMismatchError extends Error {
  readonly code: "version-mismatch";
}

export const expectedImageTag = (pkgVersion: string, profile: string): string =>
  `nabla-worker:${pkgVersion}-${profile}`;

export const assertImageMatchesVersion = (
  pkgVersion: string,
  profile: string,
  configuredTag: string,
): void => {
  const expected = expectedImageTag(pkgVersion, profile);
  if (configuredTag !== expected) {
    const err = new Error(
      `image tag mismatch: expected '${expected}' (worker package version=${pkgVersion}, profile=${profile}), got '${configuredTag}'. Refusing to spawn.`,
    ) as VersionMismatchError;
    (err as { code: string }).code = "version-mismatch";
    throw err;
  }
};
