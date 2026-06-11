#!/usr/bin/env bash
# Build, install, and launch the Hati debug build on the Thor.
#   ./deploy-hati.sh
# (The launcher Activity class is still com.limelight.PcView — only the
#  applicationId was rebranded to dev.codinghaze.hati.)
set -e
cd "$(dirname "$0")"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
ADB=/opt/homebrew/share/android-commandlinetools/platform-tools/adb
PKG=dev.codinghaze.hati.debug
PAD_DIR=/sdcard/Android/data/$PKG/files/thorpad   # where ThorPad stores layout JSONs
LAYOUTS_DIR=layouts                               # version-controlled canonical layouts
BACKUP_DIR=.thorpad-backup                        # transient pull of on-device state (gitignored)

echo "==> Checking for device..."
if ! "$ADB" get-state >/dev/null 2>&1; then
    echo "No device. Enable USB Debugging on the Thor, plug in, tap Allow."
    "$ADB" devices -l
    exit 1
fi
"$ADB" devices -l

# Uninstalling wipes the app's external files dir (your ThorPad layouts live there),
# so snapshot whatever is on the device first and restore it after the clean install.
echo "==> Backing up on-device ThorPad layouts..."
rm -rf "$BACKUP_DIR"; mkdir -p "$BACKUP_DIR"
if "$ADB" pull "$PAD_DIR/." "$BACKUP_DIR" >/dev/null 2>&1; then
    echo "    saved $(ls "$BACKUP_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ') layout(s) from device"
else
    echo "    nothing on device yet"
fi

echo "==> Building arm64 Hati debug APK..."
./gradlew assembleNonRoot_gameDebug -q

APK=app/build/outputs/apk/nonRoot_game/debug/app-nonRoot_game-arm64-v8a-debug.apk

echo "==> Uninstalling previous $PKG (if present)..."
"$ADB" uninstall "$PKG" >/dev/null 2>&1 && echo "    removed old build" || echo "    nothing to remove"

echo "==> Installing $APK"
"$ADB" install "$APK"

# Restore layouts: seed the repo's canonical layouts first, then lay your on-device
# edits back on top so any tweaks you made on the handheld win.
echo "==> Restoring ThorPad layouts..."
"$ADB" shell mkdir -p "$PAD_DIR" >/dev/null 2>&1
for f in "$LAYOUTS_DIR"/*.json; do
    [ -e "$f" ] || continue
    "$ADB" push "$f" "$PAD_DIR/" >/dev/null 2>&1 && echo "    seeded $(basename "$f") (from repo)"
done
for f in "$BACKUP_DIR"/*.json; do
    [ -e "$f" ] || continue
    "$ADB" push "$f" "$PAD_DIR/" >/dev/null 2>&1 && echo "    restored $(basename "$f") (your device copy)"
done

echo "==> Launching Hati ($PKG/com.limelight.PcView) ..."
"$ADB" shell am start -n "$PKG/com.limelight.PcView" >/dev/null 2>&1

echo "==> Done. Pair it with your Apollo/Sunshine/Lumen host on the PC."
