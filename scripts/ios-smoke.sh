#!/usr/bin/env bash
set -euo pipefail
CARVRUM_SIMULATOR_ID=$(xcrun simctl list devices available -j | python3 -c 'import json,sys; devices=json.load(sys.stdin)["devices"]; print(next(d["udid"] for group in devices.values() for d in group if d.get("isAvailable") and d["name"].startswith("iPhone")))')
xcrun simctl boot "$CARVRUM_SIMULATOR_ID"
xcrun simctl bootstatus "$CARVRUM_SIMULATOR_ID" -b
xcrun simctl install "$CARVRUM_SIMULATOR_ID" ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch "$CARVRUM_SIMULATOR_ID" com.dsoncmata.carvrum
# Give the embedded web shell time to mount before the visual smoke capture.
sleep 8
mkdir -p ios/smoke
xcrun simctl io "$CARVRUM_SIMULATOR_ID" screenshot ios/smoke/carvrum-launch.png
xcrun simctl spawn "$CARVRUM_SIMULATOR_ID" launchctl list | grep -E 'com\.dsoncmata\.carvrum'
xcrun simctl shutdown "$CARVRUM_SIMULATOR_ID"
