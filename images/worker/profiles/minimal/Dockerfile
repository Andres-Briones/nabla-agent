# syntax=docker/dockerfile:1.7
# Phase 1 plan 02. Multi-stage build for the canonical worker image.
# - Stage 1: compile packages/worker/src/stub-main.ts into a static binary.
# - Stage 2: minimal Debian runtime + pinned apt userspace tools.
# ADR-0001 #1: USER 1000:1000. ADR-0001 #4 read-only rootfs is set by the
# runtime layer (DockerRuntime.create -- HostConfig.ReadonlyRootfs: true).
# /work scratch volume is mounted as tmpfs by the runtime (D-08).
# Reproducibility (D-25): both FROM lines pinned by sha256 digest;
# packages.list version-pins every apt entry; --no-install-recommends.
# Digests are passed via --build-arg BUN_DIGEST / --build-arg DEBIAN_DIGEST
# and resolved/pinned inside scripts/build-test-image.sh (no floating tags).

############################################################
# Stage 1: build the worker binary with Bun
############################################################
# ARG must precede the FROM that consumes it. Digest is supplied by
# scripts/build-test-image.sh (or any caller) via `--build-arg BUN_DIGEST=sha256:...`.
# No default value: missing the arg is a deliberate hard error so we
# never accidentally build against `latest`.
# Both digests are declared in GLOBAL scope (before any FROM) so each
# is visible to its respective FROM line. ARGs declared after a FROM
# are stage-local and CANNOT be used in any subsequent FROM digest.
ARG BUN_DIGEST
ARG DEBIAN_DIGEST
FROM oven/bun:1.3.13-debian@${BUN_DIGEST} AS build
WORKDIR /src

# Manifests for ALL workspaces — required so bun install --frozen-lockfile
# can resolve the locked workspace graph (D-25 reproducibility). Spelled
# out per-package (not packages/*/package.json) so a renamed workspace
# trips the build instead of silently passing.
COPY package.json bun.lock ./
COPY packages/cli/package.json          ./packages/cli/
COPY packages/daemon/package.json       ./packages/daemon/
COPY packages/shared/package.json       ./packages/shared/
COPY packages/team-manager/package.json ./packages/team-manager/
COPY packages/worker/package.json       ./packages/worker/
RUN bun install --frozen-lockfile

# Source for the worker build only — kept after install so source changes
# don't bust the deps cache layer. cli/daemon/team-manager source is not
# needed for `bun build packages/worker/src/stub-main.ts`; their package.json
# entries above are sufficient for workspace graph resolution.
COPY packages/shared ./packages/shared
COPY packages/worker ./packages/worker

RUN bun build packages/worker/src/stub-main.ts \
      --compile \
      --target=bun-linux-x64 \
      --outfile=/out/nabla-worker

############################################################
# Stage 2: runtime image (minimal profile)
############################################################
# DEBIAN_DIGEST is declared globally above (alongside BUN_DIGEST) so it
# is in scope here. No Stage-2 ARG re-declaration is needed: nothing in
# Stage 2's RUN/COPY commands reads ${DEBIAN_DIGEST}.
FROM debian:bookworm-slim@${DEBIAN_DIGEST}

# ADR-0001 #1: non-root UID:GID 1000:1000.
RUN groupadd -g 1000 nabla \
 && useradd -u 1000 -g 1000 -m -s /bin/bash nabla \
 && mkdir -p /work \
 && chown -R 1000:1000 /work

# packages.list lives in the build context and is the SOLE source of truth
# for what is installed. scripts/audit-image-licenses.ts verifies every
# entry has a matching apt-licenses.json record before this Dockerfile is
# allowed to ship.
COPY images/worker/profiles/minimal/packages.list /tmp/packages.list

RUN apt-get update \
 && xargs -a /tmp/packages.list apt-get install -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* /tmp/packages.list \
 && update-ca-certificates

COPY --from=build /out/nabla-worker /usr/local/bin/nabla-worker
RUN chmod 0755 /usr/local/bin/nabla-worker

USER 1000:1000
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/nabla-worker"]
