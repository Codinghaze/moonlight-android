#!/usr/bin/env bash
# Build, install, and launch the Artemis (Moonlight) nonRoot debug build on the Thor.
#   ./deploy-artemis.sh
set -e
cd "$(dirname "$0")"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
ADB=/opt/homebrew/share/android-commandlinetools/platform-tools/adb

echo "==> Checking for device..."
if ! "$ADB" get-state >/dev/null 2>&1; then
    echo "No device. Enable USB Debugging on the Thor, plug in, tap Allow."
    "$ADB" devices -l
    exit 1
fi
"$ADB" devices -l

echo "==> Building arm64 nonRoot debug APK..."
./gradlew assembleNonRoot_gameDebug -q

APK=app/build/outputs/apk/nonRoot_game/debug/app-nonRoot_game-arm64-v8a-debug.apk
echo "==> Installing $APK"
"$ADB" install -r "$APK"

echo "==> Launching Artemis (com.limelight.noirdebug/com.limelight.PcView) ..."
"$ADB" shell am start -n com.limelight.noirdebug/com.limelight.PcView >/dev/null 2>&1

echo "==> Done. Pair it with your Sunshine/Apollo host on the PC."
