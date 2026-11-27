#!/usr/bin/env bash
set -euo pipefail

android="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$android/../.." && pwd)"
output="${1:?Output bundle path required}"
version_code="${2:?Version code required}"
version_name="${3:?Version name required}"
: "${ANDROID_JAR:?Set ANDROID_JAR}" "${ANDROID_D8:?Set ANDROID_D8}" "${AAPT2:?Set AAPT2}" "${BUNDLETOOL:?Set BUNDLETOOL}"
[[ "$version_code" =~ ^[0-9]+$ && "$version_name" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
mkdir -p "$(dirname "$output")"
output="$(realpath "$output")"

build="$(mktemp -d)"
trap 'rm -rf "$build"' EXIT
module="$build/module"
mkdir -p "$module"/{assets/romano,dex,manifest} "$build/classes"
git -C "$repo" archive HEAD | tar -x -C "$module/assets/romano" --exclude=.github --exclude=tools --exclude='index 1.html'
python3 "$repo/.github/data/build_catalog.py" "$module/assets/romano"
python3 "$android/prepare_assets.py" "$module/assets/romano"

sed -e "s/android:versionCode=\"[0-9]*\"/android:versionCode=\"$version_code\"/" \
    -e "s/android:versionName=\"[0-9.]*\"/android:versionName=\"$version_name\"/" \
    "$android/AndroidManifest.xml" > "$build/AndroidManifest.xml"
"$AAPT2" compile --dir "$android/res" -o "$build/resources.zip"
"$AAPT2" link --proto-format -I "$ANDROID_JAR" --manifest "$build/AndroidManifest.xml" \
  --rename-manifest-package de.romanoislam.app --min-sdk-version 24 --target-sdk-version 36 \
  -o "$build/resources.apk" "$build/resources.zip"
unzip -q "$build/resources.apk" -d "$build/proto"
cp "$build/proto/AndroidManifest.xml" "$module/manifest/"
cp "$build/proto/resources.pb" "$module/"
cp -r "$build/proto/res" "$module/"
java -m jdk.compiler/com.sun.tools.javac.Main -source 8 -target 8 -classpath "$ANDROID_JAR" \
  -d "$build/classes" "$android/java/de/romanoislam/app/"*.java
java -m jdk.jartool/sun.tools.jar.Main cf "$build/classes.jar" -C "$build/classes" .
"$ANDROID_D8" --min-api 24 --lib "$ANDROID_JAR" --output "$module/dex" "$build/classes.jar"
(cd "$module" && zip -q -r "$build/base.zip" .)
java -jar "$BUNDLETOOL" build-bundle --modules="$build/base.zip" --output="$output" --overwrite
java -jar "$BUNDLETOOL" validate --bundle="$output"
