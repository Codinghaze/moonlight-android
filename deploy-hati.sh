#!/usr/bin/env bash
# Build, install, and launch the Hati debug build on the Thor.
#   ./deploy-hati.sh
# Updates in place (adb install -r) so your paired hosts, settings, and ThorPad
# layouts survive every deploy. Falls back to a clean reinstall only if the signing
# key changed. (Launcher Activity is still com.limelight.PcView; only the
# applicationId was rebranded to dev.codinghaze.hati.)
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

# Insurance: snapshot on-device layouts before touching anything. Only actually
# needed on the rare clean-reinstall path below, but it's cheap.
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

# Prefer an IN-PLACE update (-r): it keeps ALL app data — your paired hosts, pairing
# certs, stream settings, and ThorPad layouts. Only fall back to a destructive clean
# reinstall if the update is rejected (which only happens when the signing key changes,
# e.g. deploying from a different machine).
echo "==> Installing $APK (in-place; keeps your paired hosts + settings)..."
if "$ADB" install -r "$APK" 2>/tmp/hati_install_err.log; then
    echo "    updated in place — pairing + settings preserved ✓"
else
    echo "    !! in-place update rejected:"
    sed 's/^/       /' /tmp/hati_install_err.log
    echo "    !! Doing a CLEAN reinstall. This wipes app data — you'll need to RE-PAIR your"
    echo "    !! host. ThorPad layouts will be restored automatically; pairing cannot be."
    "$ADB" uninstall "$PKG" >/dev/null 2>&1 || true
    "$ADB" install "$APK"
    "$ADB" shell mkdir -p "$PAD_DIR" >/dev/null 2>&1
    for f in "$BACKUP_DIR"/*.json; do
        [ -e "$f" ] || continue
        "$ADB" push "$f" "$PAD_DIR/" >/dev/null 2>&1 && echo "    restored $(basename "$f") (your device copy)"
    done
fi

# Seed canonical repo layouts the device is MISSING (covers a fresh install) without
# ever clobbering a layout you've edited on the handheld.
echo "==> Seeding any missing layouts from repo..."
"$ADB" shell mkdir -p "$PAD_DIR" >/dev/null 2>&1
for f in "$LAYOUTS_DIR"/*.json; do
    [ -e "$f" ] || continue
    name=$(basename "$f")
    exists=$("$ADB" shell "[ -f '$PAD_DIR/$name' ] && echo YES" 2>/dev/null | tr -d '\r')
    if [ "$exists" = "YES" ]; then
        echo "    kept $name (already on device)"
    else
        "$ADB" push "$f" "$PAD_DIR/" >/dev/null 2>&1 && echo "    seeded $name (from repo)"
    fi
done

echo "==> Launching Hati ($PKG/com.limelight.PcView) ..."
"$ADB" shell am start -n "$PKG/com.limelight.PcView" >/dev/null 2>&1

echo "==> Done. Pair it with your Apollo/Sunshine/Lumen host on the PC."
