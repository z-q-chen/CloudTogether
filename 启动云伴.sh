#!/bin/sh
set -eu
base=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
image="$base/CloudTogether-0.1.0.AppImage"
runtime="$base/.cloudtogether-runtime-0.1.0"
fingerprint=$(sha256sum "$image" | cut -d ' ' -f 1)
if [ ! -x "$runtime/cloudtogether" ] || [ ! -f "$runtime/.image-hash" ] || [ "$(cat "$runtime/.image-hash")" != "$fingerprint" ]; then
  staging=$(mktemp -d "$base/.cloudtogether-extract.XXXXXX")
  trap 'rm -rf -- "$staging"' EXIT HUP INT TERM
  (cd "$staging" && "$image" --appimage-extract >/dev/null)
  if [ -d "$runtime" ]; then mv -- "$runtime" "$staging/old-runtime"; fi
  mv -- "$staging/squashfs-root" "$runtime"
  printf '%s\n' "$fingerprint" > "$runtime/.image-hash"
  rm -rf -- "$staging"
  trap - EXIT HUP INT TERM
fi
exec "$runtime/cloudtogether" "$@"
