#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
STAGING_DIR="$PROJECT_DIR/build/dmg-root"
OUTPUT_DIR="$PROJECT_DIR/dist"
DMG_PATH="$OUTPUT_DIR/FluentScreen-1.5.0-macOS.dmg"
HELPER_BUILD="$PROJECT_DIR/FluentScreen字幕扩展（安装时选择这个）/mac-helper/build.sh"

/bin/rm -rf "$STAGING_DIR"
/bin/mkdir -p "$STAGING_DIR" "$OUTPUT_DIR"

"$HELPER_BUILD"
/usr/bin/ditto "$PROJECT_DIR/FluentScreen字幕扩展（安装时选择这个）" "$STAGING_DIR/Chrome Extension"
/usr/bin/ditto "$PROJECT_DIR/FluentScreen Vision.app" "$STAGING_DIR/FluentScreen Vision.app"
/usr/bin/osacompile -o "$STAGING_DIR/Install FluentScreen.app" "$SCRIPT_DIR/Installer.applescript"
/bin/cp "$PROJECT_DIR/docs/INSTALL.zh-CN.md" "$STAGING_DIR/安装说明.txt"
/bin/cp "$PROJECT_DIR/docs/INSTALL.md" "$STAGING_DIR/Installation Guide.txt"

/usr/bin/hdiutil create -volname "FluentScreen" -srcfolder "$STAGING_DIR" -ov -format UDZO "$DMG_PATH"
echo "Created: $DMG_PATH"

