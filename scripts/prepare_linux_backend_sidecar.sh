#!/usr/bin/env bash
set -euo pipefail

UI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_ROOT="${1:-${UI_ROOT}/../telegramGatherTool}"
BACKEND_BUILDER="${BACKEND_ROOT}/scripts/build_linux_sidecar.sh"
SIDECAR_OUT_DIR="${UI_ROOT}/src-tauri/resources/backend"

if [ ! -x "${BACKEND_BUILDER}" ]; then
  echo "Missing backend sidecar builder: ${BACKEND_BUILDER}"
  exit 1
fi

mkdir -p "${SIDECAR_OUT_DIR}"
"${BACKEND_BUILDER}" "${SIDECAR_OUT_DIR}"

echo "Prepared sidecar resources in ${SIDECAR_OUT_DIR}"
