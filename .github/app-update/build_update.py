"""Publish one complete, immutable web snapshot for native app clients.

The portal is deliberately not an input: ROOT is the exported APP repository.
Existing Android asset preparation is applied only to a private snapshot copy.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile
import zipfile

PROTOCOL = 1
MAX_FILES = 4096
MAX_TOTAL = 512 * 1024 * 1024
MAX_ARCHIVE = 128 * 1024 * 1024
META = 'romano-snapshot.json'


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def safe_path(value):
    parts = PurePosixPath(value).parts
    return (value and not value.startswith('/') and '\\' not in value and ':' not in value
            and '\x00' not in value and all(p not in ('', '.', '..') for p in value.split('/'))
            and all(not p.startswith('.') for p in parts))


def build(root, output, prepare=None, source_home=None):
    root, output = Path(root).resolve(), Path(output).resolve()
    if not (root / 'index.html').is_file():
        raise ValueError('APP export must contain index.html')
    with tempfile.TemporaryDirectory(prefix='romano-app-update-') as temp:
        snapshot = Path(temp) / 'app'
        def ignored(directory, names):
            return [n for n in names if n.startswith('.') or n in ('app-update', 'tools', 'index 1.html')]
        shutil.copytree(root, snapshot, ignore=ignored, symlinks=True)
        if any(p.is_symlink() for p in snapshot.rglob('*')):
            raise ValueError('Symlinks are not app content')
        # Pages optimizes its public home into static HTML. Native app snapshots
        # retain the original APP home/loader so its controls and behavior match
        # the bundled app. The public iPhone site is left unchanged.
        if source_home:
            home = Path(source_home).resolve()
            if not home.is_file():
                raise ValueError('Missing APP source home')
            shutil.copyfile(home, snapshot / 'index.html')
        if prepare:
            subprocess.run([sys.executable, str(Path(prepare).resolve()), str(snapshot)], check=True)
        files, total = [], 0
        for path in sorted(snapshot.rglob('*')):
            if not path.is_file():
                continue
            name = path.relative_to(snapshot).as_posix()
            if not safe_path(name) or name == META:
                raise ValueError('Invalid snapshot path: ' + name)
            if path.suffix.lower() in ('.jks', '.keystore', '.p12', '.pem', '.key', '.aab', '.apk'):
                raise ValueError('Private/native package is not web app content: ' + name)
            data = path.read_bytes()
            total += len(data)
            files.append({'path': name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        if not files or len(files) > MAX_FILES or total > MAX_TOTAL:
            raise ValueError('Snapshot exceeds supported limits')
        metadata = canonical({'protocol': PROTOCOL, 'app': 'de.romanoislam.app', 'files': files})
        content_id = hashlib.sha256(metadata).hexdigest()
        output.mkdir(parents=True, exist_ok=True)
        archive_name = 'app-' + content_id + '.zip'
        archive = output / archive_name
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zipped:
            for name, data in [(META, metadata)] + [(f['path'], (snapshot / f['path']).read_bytes()) for f in files]:
                entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.external_attr = 0o100644 << 16
                zipped.writestr(entry, data)
        if archive.stat().st_size > MAX_ARCHIVE:
            raise ValueError('Archive exceeds supported download limit')
        manifest = {'protocol': PROTOCOL, 'app': 'de.romanoislam.app', 'minimum_native_code': 11,
                    'id': content_id, 'archive': archive_name, 'archive_size': archive.stat().st_size,
                    'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
                    'file_count': len(files), 'uncompressed_size': total}
        temp_manifest = output / 'manifest.json.tmp'
        temp_manifest.write_bytes(canonical(manifest))
        temp_manifest.replace(output / 'manifest.json')
        return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('root')
    parser.add_argument('output')
    parser.add_argument('--prepare')
    parser.add_argument('--source-home')
    args = parser.parse_args()
    result = build(args.root, args.output, args.prepare, args.source_home)
    print(f"APP snapshot: {result['file_count']} files, {result['archive_size']} bytes, {result['id']}")
