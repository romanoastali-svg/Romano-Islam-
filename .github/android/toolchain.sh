#!/usr/bin/env bash
set -euo pipefail

tools="$RUNNER_TEMP/romano-android"
mkdir -p "$tools"
sdkmanager 'platforms;android-36' 'build-tools;36.0.0'
aapt2_version=8.12.3-13700139
aapt2_base=https://dl.google.com/android/maven2/com/android/tools/build/aapt2
curl --fail --silent --show-error --location --retry 3 \
  "$aapt2_base/$aapt2_version/aapt2-$aapt2_version-linux.jar" -o "$tools/aapt2.jar"
unzip -p "$tools/aapt2.jar" aapt2 > "$tools/aapt2"
chmod +x "$tools/aapt2"
curl --fail --silent --show-error --location --retry 3 \
  https://github.com/google/bundletool/releases/download/1.18.2/bundletool-all-1.18.2.jar -o "$tools/bundletool.jar"
echo "378b5434cd1378bef6b2bc527b8c7f0ff2584b273830335bce54d6d0813c8584  $tools/bundletool.jar" | sha256sum --check
{
  echo "ANDROID_JAR=$ANDROID_HOME/platforms/android-36/android.jar"
  echo "ANDROID_D8=$ANDROID_HOME/build-tools/36.0.0/d8"
  echo "AAPT2=$tools/aapt2"
  echo "BUNDLETOOL=$tools/bundletool.jar"
} >> "$GITHUB_ENV"
