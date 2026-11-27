"""Exercise the real Python publisher and Java update store on the desktop JVM."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import warnings
import zipfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
spec = importlib.util.spec_from_file_location('publish_update', REPO / '.github/app-update/build_update.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


def pack(destination, files, transform=None):
    destination.mkdir()
    entries = [{'path': name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in sorted(files.items())]
    metadata = publisher.canonical({'app': 'de.romanoislam.app', 'protocol': 1, 'files': entries})
    identifier = hashlib.sha256(metadata).hexdigest()
    name = 'app-' + identifier + '.zip'
    members = [(publisher.META, metadata)] + list(sorted(files.items()))
    if transform:
        members = transform(members)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', UserWarning)
        with zipfile.ZipFile(destination / name, 'w', zipfile.ZIP_DEFLATED) as z:
            for path, data in members:
                z.writestr(path, data)
    raw = (destination / name).read_bytes()
    manifest = {'protocol': 1, 'app': 'de.romanoislam.app', 'minimum_native_code': 11,
                'id': identifier, 'archive': name, 'archive_size': len(raw),
                'archive_sha256': hashlib.sha256(raw).hexdigest(),
                'file_count': len(files), 'uncompressed_size': sum(map(len, files.values()))}
    (destination / 'manifest.json').write_bytes(publisher.canonical(manifest))
    return manifest


def run(json_jar):
    with tempfile.TemporaryDirectory(prefix='romano-update-tests-') as tmp:
        root = Path(tmp)
        source = root / 'source'; source.mkdir()
        first = {'index.html': b'FIRST', 'assets/romano-pages.js': b'old-js', 'obsolete.js': b'old-js', 'style.css': b'old-css'}
        second = {'index.html': b'SECOND', 'assets/romano-pages.js': b'new-js', 'style.css': b'new-css',
                  'images/test.png': b'new-image', 'fonts/test.ttf': b'new-font', 'data/test.json': b'new-json',
                  'readers/new.html': 'nova-rubrika'.encode()}
        for path, data in first.items():
            p = source / path; p.parent.mkdir(exist_ok=True, parents=True); p.write_bytes(data)
        one = publisher.build(source, root / 'v1')
        again = publisher.build(source, root / 'same')
        assert one == again and (root / 'v1' / one['archive']).read_bytes() == (root / 'same' / again['archive']).read_bytes()
        for p in source.rglob('*'):
            if p.is_file(): p.unlink()
        for path, data in second.items():
            p = source / path; p.parent.mkdir(exist_ok=True, parents=True); p.write_bytes(data)
        home = root / 'source-home.html'; home.write_bytes(b'SOURCE-HOME')
        native_home = publisher.build(source, root / 'source-home-package', source_home=home)
        with zipfile.ZipFile(root / 'source-home-package' / native_home['archive']) as archive:
            assert archive.read('index.html') == b'SOURCE-HOME'
        two = publisher.build(source, root / 'v2')
        assert one['id'] != two['id']
        pack(root / 'bad-file', second, lambda rows: [(p, b'wrong' if p == 'style.css' else b) for p, b in rows])
        pack(root / 'traversal', {**second, '../escape': b'escape'})
        pack(root / 'missing-file', second, lambda rows: [(p, b) for p, b in rows if p != 'style.css'])
        pack(root / 'duplicate-file', second, lambda rows: rows + [('style.css', b'new-css')])
        pack(root / 'extra-file', second, lambda rows: rows + [('undeclared.js', b'extra')])
        for fixture in ['bad-hash', 'bad-size', 'wrong-app', 'native-too-new', 'invalid-json']:
            shutil.copytree(root / 'v2', root / fixture)
        for fixture, key, value in [('bad-hash', 'archive_sha256', '0' * 64), ('bad-size', 'archive_size', two['archive_size'] - 1),
                                    ('wrong-app', 'app', 'wrong.app'), ('native-too-new', 'minimum_native_code', 99)]:
            value_path = root / fixture / 'manifest.json'; obj = json.loads(value_path.read_text()); obj[key] = value
            value_path.write_bytes(publisher.canonical(obj))
        (root / 'invalid-json/manifest.json').write_text('{broken')
        private = source / 'private.jks'; private.write_bytes(b'must not be published')
        try:
            publisher.build(source, root / 'must-not-publish')
            raise AssertionError('Publisher accepted a private keystore')
        except ValueError:
            pass
        private.unlink()
        (source / 'linked.js').symlink_to(source / 'style.css')
        try:
            publisher.build(source, root / 'must-not-follow')
            raise AssertionError('Publisher accepted a symlink')
        except ValueError:
            pass
        classes = root / 'classes'; classes.mkdir()
        subprocess.run(['java', '-m', 'jdk.compiler/com.sun.tools.javac.Main', '-source', '8', '-target', '8',
                        '-classpath', str(json_jar), '-d', str(classes),
                        str(REPO / '.github/android/java/de/romanoislam/app/AppUpdateStore.java'),
                        str(HERE / 'AppUpdateStoreTest.java')], check=True)
        subprocess.run(['java', '-cp', str(classes) + ':' + str(json_jar), 'AppUpdateStoreTest', str(root)], check=True)
        print('PASS: deterministic publisher, content-version changes, complete inventory, and private/symlink exclusion.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--json-jar', type=Path, required=True)
    run(parser.parse_args().json_jar.resolve())
