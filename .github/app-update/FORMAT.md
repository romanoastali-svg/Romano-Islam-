# Shared ROMANO ISLAM app snapshot — protocol 1

The APP repository publishes `https://app.romano-islam.de/app-update/manifest.json`.
The separate `www.romano-islam.de` portal is not an input or an update target.

The manifest identifies `de.romanoislam.app`, protocol, minimum compatible native
version, an immutable `app-<id>.zip`, archive length/SHA-256, file count and total
uncompressed length. `<id>` is SHA-256 of the ZIP's `romano-snapshot.json` bytes.
That inventory lists each relative public web file, its byte length and SHA-256.
HTML, JavaScript, CSS, JSON, fonts, images and other public web assets are included.
Private keys, native APK/AAB packages and development files are excluded.

A client validates the complete download and every inventory entry in a staging
directory, then atomically replaces its current-version pointer. A running reader
continues on the immutable version selected at launch. The next launch selects
the completed new snapshot. Missing/deleted paths must not fall through to a
previous snapshot. Interrupted/invalid downloads leave the saved version usable.
The bundle includes matching catalog/data and local fonts for offline use.

The Android client implements this protocol. A future native Apple client can
consume this same platform-neutral web bundle, but needs its own native download,
validation, storage and activation adapter. This change does not create an iOS
App Store app. The existing iPhone Home Screen web app keeps using the APP site.
Native platform code, permissions or a new protocol still require a store update.
