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

exec npx tauri "$@"
