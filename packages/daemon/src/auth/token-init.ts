// RED stub -- typed scaffold so lefthook's `tsc -b` gate passes while the
// runtime tests in token-init.test.ts genuinely fail. Real implementation
// lands in the GREEN commit (D-01 self-init, D-02 32-byte CSPRNG base64url,
// D-03 0600/0700 modes per Pitfall D).
export const resolveOrInitToken = async (): Promise<string> => {
  throw new Error("RED stub: not implemented");
};
