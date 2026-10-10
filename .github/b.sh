#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

echo "=== On.i CRM: prepare ==="
echo "PROJECT_DIR=$PWD/android-project" >> "$GITHUB_ENV"

[ -d android-project ] || { echo "ERROR: android-project not found"; exit 1; }
[ -f android-project/app/src/main/assets/index.html ] || { echo "ERROR: index.html not found"; exit 1; }

echo "index.html: $(wc -c < android-project/app/src/main/assets/index.html) bytes"
echo "MainActivity: $(wc -c < android-project/app/src/main/java/com/oni/crm/MainActivity.java) bytes"

echo "=== patch: p.py ==="
python3 .github/p.py

echo "=== patch: patch_index.py ==="
python3 .github/patch_index.py

echo "=== prepare done ==="