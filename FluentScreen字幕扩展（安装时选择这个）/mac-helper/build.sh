#!/bin/zsh
set -euo pipefail
SCRIPT_DIR="${0:A:h}"
APP_DIR="$SCRIPT_DIR/../../FluentScreen Vision.app"
CONTENTS="$APP_DIR/Contents"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"
xcrun clang -fobjc-arc -O2 -framework AppKit -framework Vision "$SCRIPT_DIR/Sources/main.m" -o "$CONTENTS/MacOS/FluentScreenVision"
cp "$SCRIPT_DIR/Info.plist" "$CONTENTS/Info.plist"
codesign --force --deep --sign - "$APP_DIR"
echo "Built: $APP_DIR"
