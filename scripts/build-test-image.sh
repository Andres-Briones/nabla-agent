#!/usr/bin/env bash
# Phase 1 plan 07 — build the `nabla-worker:test-minimal` fixture image.
# Closes 01-REVIEWS.md HIGH-2: plans 01-01 and 01-04 ship tests that
# reference `image: "nabla-worker:test-minimal"`, but plan 01-02 only
# tags the canonical `nabla-worker:<version>-minimal`. This script
# produces the test-only alias.
#
# Run from anywhere; the script cds to nabla-agent/ first so the
# docker build context root is correct (the Dockerfile uses
# build-context-relative `COPY package.json bun.lock ./` and
# `COPY packages/...`).
#
# CI integration: `.github/workflows/ci.yml` runs this script BEFORE
# any `NABLA_TEST_DOCKER=1` test job. Locally, run it manually before
# `NABLA_TEST_DOCKER=1 bun test packages/daemon/src/runtime/`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NABLA_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${NABLA_ROOT}"

# Base-image digests (D-25 reproducibility — pinned, not floating).
# Sourced from `docker manifest inspect` on a host with Docker access.
# To refresh: `docker manifest inspect oven/bun:1.3.13-debian | jq -r '.manifests[] | select(.platform.architecture=="amd64") | .digest'`
# and `docker manifest inspect debian:bookworm-slim | jq -r '.manifests[] | select(.platform.architecture=="amd64") | .digest'`.
# Caller can override either via env (e.g. `BUN_DIGEST=sha256:abc... bash scripts/build-test-image.sh`)
# for emergency repins without editing the script.
: "${BUN_DIGEST:=sha256:RESOLVE_AT_BUILD_TIME}"
: "${DEBIAN_DIGEST:=sha256:RESOLVE_AT_BUILD_TIME}"

if [[ "${BUN_DIGEST}" == "sha256:RESOLVE_AT_BUILD_TIME" ]] || [[ "${DEBIAN_DIGEST}" == "sha256:RESOLVE_AT_BUILD_TIME" ]]; then
  # No pinned digests committed yet; resolve from the live registry.
  # This branch keeps the script working in the executor sandbox AND on
  # CI runners where `docker manifest inspect` is available; once a
  # human commits real sha256 values into BUN_DIGEST_PINNED /
  # DEBIAN_DIGEST_PINNED below, this branch is bypassed.
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker not on PATH and no pinned digests provided." >&2
    echo "       Set BUN_DIGEST and DEBIAN_DIGEST env vars, or install docker." >&2
    exit 1
  fi
  echo "Resolving base-image digests from registry (no pins committed yet)..."
  BUN_DIGEST="$(docker manifest inspect oven/bun:1.3.13-debian \
    | jq -r '.manifests[]? | select(.platform.architecture=="amd64" and .platform.os=="linux") | .digest' \
    | head -n1)"
  DEBIAN_DIGEST="$(docker manifest inspect debian:bookworm-slim \
    | jq -r '.manifests[]? | select(.platform.architecture=="amd64" and .platform.os=="linux") | .digest' \
    | head -n1)"
  if [[ -z "${BUN_DIGEST}" ]] || [[ -z "${DEBIAN_DIGEST}" ]]; then
    echo "ERROR: digest resolution failed (empty result from docker manifest inspect)." >&2
    exit 1
  fi
  echo "  BUN_DIGEST=${BUN_DIGEST}"
  echo "  DEBIAN_DIGEST=${DEBIAN_DIGEST}"
fi

DOCKERFILE="images/worker/profiles/minimal/Dockerfile"
TAG="nabla-worker:test-minimal"

if [ ! -f "${DOCKERFILE}" ]; then
  echo "ERROR: ${DOCKERFILE} not found (cwd=$(pwd))" >&2
  exit 1
fi

echo "Building ${TAG} from ${DOCKERFILE} (context=${NABLA_ROOT})..."
docker build \
  --tag "${TAG}" \
  --file "${DOCKERFILE}" \
  --build-arg "BUN_DIGEST=${BUN_DIGEST}" \
  --build-arg "DEBIAN_DIGEST=${DEBIAN_DIGEST}" \
  .

echo "OK: ${TAG} built. Image SHA:"
docker image inspect --format '{{.Id}}' "${TAG}"
