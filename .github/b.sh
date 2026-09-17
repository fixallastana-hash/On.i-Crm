#!/usr/bin/env bash
set -e

echo "=== STEP 1: check repo override ==="
if [ -f android-project/app/src/main/assets/index.html ]; then
  cp android-project/app/src/main/assets/index.html /tmp/oni_index_override.html
  echo "Saved repo index.html ($(wc -c < /tmp/oni_index_override.html) bytes)"
else
  echo "No repo override found (that is ok)"
fi

echo "=== STEP 2: find and unzip ==="
Z=$(find . -maxdepth 2 -type f -name '*.zip' -not -path './.git/*' | head -1)
[ -z "$Z" ] && { echo "no-zip"; exit 1; }
echo "Found ZIP: $Z"
rm -rf work android-project
mkdir work
unzip -q "$Z" -d work
for i in 1 2 3; do
  I=$(find work -type f -name '*.zip' | head -1)
  [ -z "$I" ] && break
  unzip -q -o "$I" -d work
  rm -f "$I"
done

echo "=== STEP 3: locate index.html inside ZIP ==="
IDXFILE=$(find work -type f \( -name 'index.html' -o -name 'index.html.html' \) -path '*assets*' | head -1)
[ -z "$IDXFILE" ] && IDXFILE=$(find work -type f \( -name 'index.html' -o -name 'index.html.html' \) | head -1)
[ -z "$IDXFILE" ] && IDXFILE=$(find work -type f -name 'index.html*' ! -name '*.zip' | head -1)
echo "IDXFILE=$IDXFILE"
if [ -z "$IDXFILE" ]; then
  echo "ERROR: index.html not found anywhere in ZIP"
  find work -type f | head -80
  exit 1
fi
echo "Found index.html inside ZIP: $IDXFILE ($(wc -c < "$IDXFILE") bytes)"

echo "=== STEP 4: locate Android project files ==="
MAIN_ACT=$(find work -type f -name MainActivity.java | head -1)
if [ -z "$MAIN_ACT" ]; then
  echo "ERROR: MainActivity.java not found"
  find work -type f | head -100
  exit 1
fi
S=$(dirname "$MAIN_ACT")
echo "MainActivity dir: $S"

echo "=== STEP 5: create project skeleton ==="
mkdir -p android-project/app/src/main/java/com/oni/crm
mkdir -p android-project/app/src/main/res/values
mkdir -p android-project/app/src/main/res/xml
mkdir -p android-project/app/src/main/res/mipmap-hdpi
mkdir -p android-project/app/src/main/assets/tessdata
mkdir -p android-project/app/libs

cat > android-project/settings.gradle <<'EOF'
pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
  repositories { google(); mavenCentral() }
}
rootProject.name = "OniCRM"
include ':app'
EOF

cat > android-project/build.gradle <<'EOF'
plugins { id 'com.android.application' version '8.5.2' apply false }
EOF

cat > android-project/gradle.properties <<'EOF'
android.useAndroidX=true
android.enableJetifier=true
org.gradle.jvmargs=-Xmx3072m -Dfile.encoding=UTF-8
android.nonTransitiveRClass=false
EOF

cat > android-project/app/build.gradle <<'EOF'
plugins { id 'com.android.application' }

android {
  namespace 'com.oni.crm'
  compileSdk 34
  defaultConfig {
    applicationId "com.oni.crm"
    minSdk 24
    targetSdk 34
    versionCode 1
    versionName "1.0"
  }
  compileOptions {
    sourceCompatibility JavaVersion.VERSION_17
    targetCompatibility JavaVersion.VERSION_17
  }
  packagingOptions { jniLibs { useLegacyPackaging = true } }
  lint { abortOnError false; checkReleaseBuilds false }
}

configurations.all {
  resolutionStrategy {
    force 'org.jetbrains.kotlin:kotlin-stdlib:1.8.22'
    force 'org.jetbrains.kotlin:kotlin-stdlib-jdk7:1.8.22'
    force 'org.jetbrains.kotlin:kotlin-stdlib-jdk8:1.8.22'
  }
}

dependencies {
  implementation 'androidx.core:core:1.13.1'
  implementation 'androidx.appcompat:appcompat:1.6.1'
  implementation 'androidx.activity:activity:1.8.2'
  implementation 'com.rmtheis:tess-two:9.1.0'
  implementation 'com.journeyapps:zxing-android-embedded:4.3.0'
  implementation fileTree(dir: 'libs', include: ['*.jar'])
}
EOF

echo "=== STEP 6: copy sources from ZIP ==="
find_one() { find work -type f -name "$1" | head -1; }

MAIN_ACT=$(find_one MainActivity.java)
CRM_FILE_PROV=$(find_one CrmFileProvider.java)
GEMINI_CLIENT=$(find_one GeminiClient.java)
MANIFEST=$(find_one AndroidManifest.xml)
COLORS=$(find_one colors.xml)
STRINGS=$(find_one strings.xml)
STYLES=$(find_one styles.xml)
FILE_PATHS=$(find_one file_paths.xml)
IC_LAUNCHER=$(find_one ic_launcher.png)
PROGUARD=$(find_one proguard-rules.pro)

[ -n "$MAIN_ACT" ] && cp "$MAIN_ACT" android-project/app/src/main/java/com/oni/crm/
[ -n "$CRM_FILE_PROV" ] && cp "$CRM_FILE_PROV" android-project/app/src/main/java/com/oni/crm/
[ -n "$GEMINI_CLIENT" ] && cp "$GEMINI_CLIENT" android-project/app/src/main/java/com/oni/crm/
[ -n "$MANIFEST" ] && cp "$MANIFEST" android-project/app/src/main/
[ -n "$COLORS" ] && cp "$COLORS" android-project/app/src/main/res/values/
[ -n "$STRINGS" ] && cp "$STRINGS" android-project/app/src/main/res/values/
[ -n "$STYLES" ] && cp "$STYLES" android-project/app/src/main/res/values/
[ -n "$FILE_PATHS" ] && cp "$FILE_PATHS" android-project/app/src/main/res/xml/
[ -n "$IC_LAUNCHER" ] && cp "$IC_LAUNCHER" android-project/app/src/main/res/mipmap-hdpi/
[ -n "$PROGUARD" ] && cp "$PROGUARD" android-project/app/

if [ -z "$MANIFEST" ]; then
  echo "ERROR: AndroidManifest.xml not found in ZIP"
  find work -type f -name '*.xml' | head -40
  exit 1
fi
if [ ! -f android-project/app/src/main/AndroidManifest.xml ]; then
  echo "ERROR: AndroidManifest.xml not copied"
  exit 1
fi

if ! grep -q 'android.permission.CAMERA' android-project/app/src/main/AndroidManifest.xml; then
  sed -i 's|<uses-permission android:name="android.permission.INTERNET" />|<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />|' android-project/app/src/main/AndroidManifest.xml
  echo "  CAMERA permission added"
fi

echo "=== STEP 7: copy index.html ==="
cp "$IDXFILE" android-project/app/src/main/assets/index.html
echo "Copied: $(wc -c < android-project/app/src/main/assets/index.html) bytes"

echo "=== STEP 8: restore repo override if exists ==="
if [ -f /tmp/oni_index_override.html ]; then
  cp /tmp/oni_index_override.html android-project/app/src/main/assets/index.html
  echo "Restored repo override ($(wc -c < android-project/app/src/main/assets/index.html) bytes)"
fi

echo "=== STEP 9: final check ==="
ls -lh android-project/app/src/main/assets/index.html
echo "=============================================="

echo "=== STEP 10: download traineddata ==="
cd android-project/app/src/main/assets/tessdata
curl -sL -O "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/eng.traineddata"
curl -sL -O "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/rus.traineddata"
ls -lh
cd - > /dev/null

[ ! -f android-project/app/src/main/AndroidManifest.xml ] && { echo "no-manifest"; exit 1; }
sed -i -E 's/[[:space:]]+package="[^"]*"//g' android-project/app/src/main/AndroidManifest.xml

python3 .github/p.py
python3 .github/patch_index.py 2>/dev/null || true

echo "PROJECT_DIR=$PWD/android-project" >> "$GITHUB_ENV"
