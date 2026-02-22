#!/usr/bin/env bash
set -euo pipefail

# Snap-injected GTK/loader paths break bundled WebKit in AppImage builds.
# Always sanitize the runtime/build env before invoking Tauri CLI.
while IFS='=' read -r key _; do
  if [[ "$key" == SNAP* ]]; then
    unset "$key"
  fi
done < <(env)

unset LD_LIBRARY_PATH LD_PRELOAD
unset GTK_EXE_PREFIX GTK_PATH GTK_MODULES GTK_IM_MODULE_FILE
unset GDK_PIXBUF_MODULEDIR GDK_PIXBUF_MODULE_FILE
unset GIO_EXTRA_MODULES

# Ensure Linux release builds always embed a fresh backend sidecar.
if [[ "${1:-}" == "build" && "$(uname -s)" == "Linux" && "${TGC_SKIP_LINUX_SIDECAR_PREPARE:-0}" != "1" ]]; then
  if [[ -x "./scripts/prepare_linux_backend_sidecar.sh" ]]; then
    echo "Preparing Linux backend sidecar before tauri build..."
    ./scripts/prepare_linux_backend_sidecar.sh
  fi
fi

exec npx tauri "$@"
