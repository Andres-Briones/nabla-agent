// DAEMON-01 SC #3 (D-13): drift-detection for the systemd / launchd
// install templates that satisfy "daemon survives terminal close as a
// long-lived host process." Closes 01-REVIEWS.md HIGH-1.
//
// Each assertion below is a contracted directive. Removing any of them
// fails the test — a future PR cannot silently weaken DAEMON-01's
// contract without tripping CI.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const INSTALL_DIR = "scripts/install";
const SERVICE = readFileSync(join(INSTALL_DIR, "nabla-daemon.service"), "utf8");
const PLIST = readFileSync(join(INSTALL_DIR, "sh.nabla.daemon.plist"), "utf8");
const README = readFileSync(join(INSTALL_DIR, "INSTALL.md"), "utf8");

describe("DAEMON-01 SC #3 — install templates (D-13)", () => {
  describe("systemd unit (nabla-daemon.service)", () => {
    test("Type=simple matches D-12 foreground daemon", () => {
      expect(SERVICE).toMatch(/^Type=simple$/m);
    });

    test("After=docker.service orders unit after docker.sock perms", () => {
      // Addresses HIGH-1 mitigation: avoids race where daemon starts
      // before docker.sock has correct perms.
      expect(SERVICE).toMatch(/^After=docker\.service$/m);
    });

    test("Wants=docker.service expresses soft dependency on docker", () => {
      expect(SERVICE).toMatch(/^Wants=docker\.service$/m);
    });

    test("Restart=on-failure preserves clean-exit UX", () => {
      // Restart=always would fight `nabla daemon stop` (Phase 6).
      expect(SERVICE).toMatch(/^Restart=on-failure$/m);
    });

    test("TimeoutStopSec=10s matches docker stop grace window", () => {
      expect(SERVICE).toMatch(/^TimeoutStopSec=10s$/m);
    });

    test("KillSignal=SIGTERM is explicit (not implicit default)", () => {
      expect(SERVICE).toMatch(/^KillSignal=SIGTERM$/m);
    });

    test("ExecStart points to ~/.local/bin/nabla-daemon", () => {
      expect(SERVICE).toMatch(/^ExecStart=%h\/\.local\/bin\/nabla-daemon$/m);
    });

    test("WantedBy=default.target enables `systemctl --user enable`", () => {
      expect(SERVICE).toMatch(/^WantedBy=default\.target$/m);
    });
  });

  describe("launchd plist (sh.nabla.daemon.plist)", () => {
    test("Label is sh.nabla.daemon (matches `launchctl print gui/$UID/...` path)", () => {
      expect(PLIST).toMatch(/<key>Label<\/key>\s*<string>sh\.nabla\.daemon<\/string>/);
    });

    test("KeepAlive dict form (Crashed=true) restarts on crash, not on clean exit", () => {
      expect(PLIST).toContain("<key>KeepAlive</key>");
      expect(PLIST).toContain("<key>Crashed</key>");
      expect(PLIST).toMatch(/<key>SuccessfulExit<\/key>\s*<false\/>/);
    });

    test("ExitTimeOut=10 matches docker stop grace window", () => {
      expect(PLIST).toMatch(/<key>ExitTimeOut<\/key>\s*<integer>10<\/integer>/);
    });

    test("ProcessType=Background tells macOS this is a background daemon", () => {
      expect(PLIST).toMatch(/<key>ProcessType<\/key>\s*<string>Background<\/string>/);
    });

    test("RunAtLoad=true so `launchctl bootstrap` starts immediately", () => {
      expect(PLIST).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    });

    test("ProgramArguments references /usr/local/bin/nabla-daemon", () => {
      expect(PLIST).toMatch(/<string>\/usr\/local\/bin\/nabla-daemon<\/string>/);
    });
  });

  describe("INSTALL.md runbook", () => {
    test("documents both OS install sections", () => {
      expect(README).toContain("## Linux (systemd user unit)");
      expect(README).toContain("## macOS (launchd LaunchAgent)");
    });

    test("documents systemctl install command", () => {
      expect(README).toMatch(/systemctl --user enable.*nabla-daemon/);
    });

    test("documents launchctl install command", () => {
      expect(README).toMatch(/launchctl bootstrap gui\/\$UID/);
    });

    test("ships uninstall steps for both OSes", () => {
      // Drift-detection: a docs PR that drops the uninstall blocks
      // breaks user reversibility.
      const uninstallBlocks = README.match(/^### Uninstall/gm) ?? [];
      expect(uninstallBlocks.length).toBeGreaterThanOrEqual(2);
    });

    test("references the docker stop 10s grace window contract", () => {
      // Future readers must understand WHY both templates set 10s.
      expect(README).toMatch(/9\.5s|TimeoutStopSec|ExitTimeOut/);
    });
  });
});
