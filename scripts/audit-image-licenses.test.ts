// D-26 + PATTERNS.md S5: image-license audit tests.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const runAudit = (profilesDir: string, allowListPath: string) => {
  return spawnSync("bun", ["run", "scripts/audit-image-licenses.ts"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      NABLA_AUDIT_PROFILES_DIR: profilesDir,
      NABLA_AUDIT_ALLOW_LIST: allowListPath,
    },
  });
};

describe("D-26 image-license audit", () => {
  test("passes on the committed minimal profile", () => {
    const result = runAudit(
      join(process.cwd(), "images", "worker", "profiles"),
      join(process.cwd(), "images", "worker", ".licenses", "allowed-image.json")
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Image-license audit OK");
  });

  test("fails when packages.list has entry without apt-licenses.json entry", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "nabla-test-"));
    try {
      const profileDir = join(tmpDir, "images", "worker", "profiles", "minimal");
      const workerLicDir = join(tmpDir, "images", "worker", ".licenses");
      mkdirSync(profileDir, { recursive: true });
      mkdirSync(workerLicDir, { recursive: true });

      writeFileSync(
        join(workerLicDir, "allowed-image.json"),
        readFileSync(join(process.cwd(), "images", "worker", ".licenses", "allowed-image.json"), "utf8")
      );

      writeFileSync(
        join(profileDir, "packages.list"),
        "bash=5.2.15-2+b8\ncoreutils=9.1-1\nfake=1.0\n"
      );

      writeFileSync(
        join(profileDir, "apt-licenses.json"),
        JSON.stringify({
          packages: {
            bash: { version: "5.2.15-2+b8", license: "GPL-3.0+" },
            coreutils: { version: "9.1-1", license: "GPL-3.0+" },
          },
        })
      );

      const result = runAudit(
        join(tmpDir, "images", "worker", "profiles"),
        join(tmpDir, "images", "worker", ".licenses", "allowed-image.json")
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing apt-licenses.json entry");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("fails when apt-licenses.json has license not in allowed-image.json", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "nabla-test-"));
    try {
      const profileDir = join(tmpDir, "images", "worker", "profiles", "minimal");
      const workerLicDir = join(tmpDir, "images", "worker", ".licenses");
      mkdirSync(profileDir, { recursive: true });
      mkdirSync(workerLicDir, { recursive: true });

      writeFileSync(
        join(workerLicDir, "allowed-image.json"),
        readFileSync(join(process.cwd(), "images", "worker", ".licenses", "allowed-image.json"), "utf8")
      );

      writeFileSync(
        join(profileDir, "packages.list"),
        "bash=5.2.15-2+b8\n"
      );

      writeFileSync(
        join(profileDir, "apt-licenses.json"),
        JSON.stringify({
          packages: {
            bash: { version: "5.2.15-2+b8", license: "FSL-1.1-MIT" },
          },
        })
      );

      const result = runAudit(
        join(tmpDir, "images", "worker", "profiles"),
        join(tmpDir, "images", "worker", ".licenses", "allowed-image.json")
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("not in allowed-image.json");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
