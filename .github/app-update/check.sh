#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
qa="$(mktemp -d)"
trap 'rm -rf "$qa"' EXIT
curl --fail --silent --show-error --location --retry 3 \
  https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar -o "$qa/json.jar"
echo "3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed  $qa/json.jar" | sha256sum --check
python3 "$repo/.github/android/tests/test_updates.py" --json-jar "$qa/json.jar"
