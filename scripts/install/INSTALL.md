# Manual Install — Nabla-agent Daemon

Phase 1 ships templates for systemd (Linux) and launchd (macOS). The
`nabla daemon install` / `nabla daemon foreground` CLI verbs that
automate this are scheduled for Phase 6 (CLI surface phase) per
CONTEXT D-13. Until then, follow the manual steps below.

The daemon binary is the compiled `bun build --compile` output of
`packages/daemon/src/index.ts`. Build it first:

```bash
cd nabla-agent
bun build packages/daemon/src/index.ts \
  --compile --target=bun-linux-x64 \
  --outfile=dist/nabla-daemon          # macOS: --target=bun-darwin-x64
```

## Linux (systemd user unit)

```bash
# 1) place the binary
install -m 0755 dist/nabla-daemon ~/.local/bin/nabla-daemon

# 2) place the unit
mkdir -p ~/.config/systemd/user
cp scripts/install/nabla-daemon.service ~/.config/systemd/user/

# 3) reload, enable, start
systemctl --user daemon-reload
systemctl --user enable --now nabla-daemon.service

# 4) verify
systemctl --user status nabla-daemon
journalctl --user -u nabla-daemon -f
```

### Uninstall (Linux)

```bash
systemctl --user disable --now nabla-daemon.service
rm ~/.config/systemd/user/nabla-daemon.service
rm ~/.local/bin/nabla-daemon
systemctl --user daemon-reload
```

## macOS (launchd LaunchAgent)

```bash
# 1) place the binary
sudo install -m 0755 dist/nabla-daemon /usr/local/bin/nabla-daemon

# 2) place the plist (substitute USERNAME for $USER)
mkdir -p ~/Library/LaunchAgents
sed "s/USERNAME/$USER/g" scripts/install/sh.nabla.daemon.plist \
  > ~/Library/LaunchAgents/sh.nabla.daemon.plist

# 3) bootstrap into the GUI session
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/sh.nabla.daemon.plist

# 4) verify
launchctl print gui/$UID/sh.nabla.daemon | head -20
tail -f ~/Library/Logs/nabla-daemon.out.log
```

### Uninstall (macOS)

```bash
launchctl bootout gui/$UID ~/Library/LaunchAgents/sh.nabla.daemon.plist
rm ~/Library/LaunchAgents/sh.nabla.daemon.plist
sudo rm /usr/local/bin/nabla-daemon
```

## Notes

- The daemon's two-stage shutdown (D-14) hard-caps at 9.5s. Both
  templates set `TimeoutStopSec=10s` (systemd) / `ExitTimeOut=10`
  (launchd) so `systemctl stop` / `launchctl bootout` give the daemon
  enough room to drain workers via `docker stop --time=8`.
- `EnvironmentFile=-%h/.config/nabla/daemon.env` (systemd) / the
  `EnvironmentVariables` dict (launchd) accept overrides for
  `NABLA_DAEMON_HOST`, `NABLA_DAEMON_PORT`, `NABLA_LOG_LEVEL`.
- The systemd unit declares `After=docker.service` / `Wants=docker.service`
  so the daemon does not start before docker.sock has correct perms.
  On macOS, Docker Desktop manages its own VM lifecycle — no analogous
  ordering directive exists.
