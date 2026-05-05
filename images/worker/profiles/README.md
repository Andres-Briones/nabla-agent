# Worker Image Profile Catalog

Nabla-agent uses a **profile catalog** (inspired by claudebox's profile system) to define what tools are installed inside the worker container. The catalog is inline in the inner repo — **not a runtime dependency on claudebox**.

## `minimal` Profile (Default, Mandatory v1)

The `minimal` profile is the only mandatory profile shipped in v1 (D-24). It includes:

- `bash`, `coreutils`, `git`, `curl`, `jq`, `ca-certificates` (all version-pinned in `packages.list`)
- Compiled worker binary at `/usr/local/bin/nabla-worker`
- Runs as UID:GID `1000:1000` (ADR-0001 #1)
- Read-only rootfs set by the runtime layer (ADR-0001 #4)
- Per-task `/work` scratch volume mounted as tmpfs (D-08)

## Profile Triad

Each profile consists of three files:

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: stage1 compiles the worker binary, stage2 installs runtime deps |
| `packages.list` | Pinned apt package list (`name=version` format, one per line) |
| `apt-licenses.json` | SPDX license manifest for each package in `packages.list` |

The `scripts/audit-image-licenses.ts` script cross-checks all three files and fails CI if any drift is detected.

## Adding a New Profile

1. Create a new directory under `images/worker/profiles/<name>/`
2. Add the three files: `Dockerfile`, `packages.list`, `apt-licenses.json`
3. Run `bun run scripts/audit-image-licenses.ts` to verify
4. Commit all three files in the same PR

## v1.x Roadmap

Additional profiles (`node`, `python`, `gsd`) are deferred to v1.x. The `gsd` profile will pre-install `get-shit-done` for the WORK-v2-02 worker variant.

## GPL Image-Content Carve-Out

Image-content licenses are governed by `images/worker/.licenses/allowed-image.json`, which is **separate** from the npm-side allow-list (`.licenses/allowed.json`). The GPL family is permitted here because apt-installed packages are invoked as separate processes inside the container — no linking, no derivative work on the worker binary.

This carve-out is documented in:
- RESEARCH.md A1 (GPL rationale)
- CONTEXT.md D-26 (license-CI gate extension)
- `images/worker/.licenses/allowed-image.json` (the allow-list itself)

## apt-pin Bump Procedure

Pinned Debian package versions in `packages.list` go stale on apt-archive
churn — Debian point-releases periodically advance security-fixed packages,
after which the old version becomes unavailable from the apt index.
`docker build` then dies with `apt-get install bash=5.2.15-2+b8: not found`.

When CI fails with such an error, follow this runbook:

```bash
# 1) pull a fresh debian:bookworm-slim
docker pull debian:bookworm-slim

# 2) for each package in packages.list, ask apt-cache what the
#    current version is. Run from nabla-agent/:
docker run --rm -i debian:bookworm-slim bash -lc '
  apt-get update -qq
  while read line; do
    pkg="${line%%=*}"
    [ -z "$pkg" ] && continue
    echo "$pkg: $(apt-cache policy "$pkg" 2>/dev/null | awk "/Candidate:/ {print \$2}")"
  done
' < images/worker/profiles/minimal/packages.list

# 3) update both packages.list AND apt-licenses.json in the SAME commit
#    — the audit cross-checks them and fails if versions drift apart.

# 4) verify locally:
bun run scripts/audit-image-licenses.ts
bash scripts/build-test-image.sh

# 5) commit with a message naming the bumped packages, e.g.:
#    chore(image): bump bash 5.2.15-2+b8 -> 5.2.15-2+deb12u1 (apt-archive churn)
```

The Debian-snapshot-archive solution (deferred to v1.x per CONTEXT D-25)
would eliminate this manual step. Until then, this runbook is the
contracted recovery path.

## Inspiration (Not Dependency)

The profile catalog structure is inspired by claudebox's profile system (D-22). Nabla-agent does not invoke `claudebox` at build time; the catalog is fully inline and license-pure.
