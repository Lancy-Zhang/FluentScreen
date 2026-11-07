#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
APP_EXECUTABLE="$SCRIPT_DIR/../../FluentScreen Vision.app/Contents/MacOS/FluentScreenVision"
HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_FILE="$HOST_DIR/local.fluentscreen.vision.json"

mkdir -p "$HOST_DIR"
printf '%s\n' \
  '{' \
  '  "name": "local.fluentscreen.vision",' \
  '  "description": "FluentScreen local Apple Vision OCR helper",' \
  "  \"path\": \"$APP_EXECUTABLE\"," \
  '  "type": "stdio",' \
  '  "allowed_origins": ["chrome-extension://fldehhbddibfdmdljofeogofgaeopigd/"]' \
  '}' > "$HOST_FILE"

echo "Installed: $HOST_FILE"
