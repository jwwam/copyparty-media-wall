#!/bin/sh
# Builds the double-clickable macOS launcher and zips it into dist/.
# Needs macOS (osacompile, codesign, ditto) and network access to fetch copyparty.
set -e
cd "$(dirname "$0")/.."
NAME=copyparty-media-wall
OUT=dist
APP="$OUT/$NAME/Copyparty.app"
rm -rf "$OUT"
mkdir -p "$OUT/$NAME"
osacompile -o "$APP" macos/Copyparty.applescript
# the official single-file copyparty release (MIT), bundled unmodified
curl -fsSL -o "$APP/Contents/Resources/copyparty-sfx.py" \
  https://github.com/9001/copyparty/releases/latest/download/copyparty-sfx.py
mkdir "$APP/Contents/Resources/wall"
cp web/index.html web/app.js web/app.css "$APP/Contents/Resources/wall/"
# the setup helper and its page: everything after the double-click happens in the browser
cp macos/wall-helper.py macos/setup.html "$APP/Contents/Resources/"
cp macos/使用说明.txt "$OUT/$NAME/"
xattr -cr "$APP"
codesign --force --deep -s - "$APP"
codesign --verify --deep --strict "$APP"
(cd "$OUT" && ditto -c -k --keepParent "$NAME" "$NAME-macos.zip")
echo "built $OUT/$NAME-macos.zip"
