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
  .

echo "OK: ${TAG} built. Image SHA:"
docker image inspect --format '{{.Id}}' "${TAG}"
