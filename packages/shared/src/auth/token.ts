// RED-phase stub: shape only, no behavior. Real D-03 resolver lands in the
// GREEN-phase commit. Symbols are exported with the right types so the
// project-wide pre-commit typecheck (tsc -b) can pass while runtime tests
// still fail.
export const TOKEN_FILENAME = "token";
export const APP_DIR = "nabla";

export const defaultConfigDir = (): string => {
  throw new Error("RED stub: not implemented");
};

export const defaultTokenPath = (): string => {
  throw new Error("RED stub: not implemented");
};

export const resolveToken = async (): Promise<string | null> => {
  throw new Error("RED stub: not implemented");
};
