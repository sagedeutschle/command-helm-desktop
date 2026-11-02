#!/usr/bin/env python3
"""Read-only validation of a Command Helm preview against this source checkout.

Checks bundle identity, the complete product overlay, preserved engine hashes,
exact original-extension contents, licenses, deep signatures and native Team IDs.
This does not establish notarization, runtime behavior or vulnerability freedom.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import plistlib
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.143.17232'
UPSTREAM_SHA256 = 'ade8f5e0ebf47e5ea9e2478844f150c68e43def192b6f8be05d0329d25ec0917'
PRESERVED = {'out/main.js', 'out/vs/workbench/workbench.desktop.main.js',
             'LICENSE.txt', 'ThirdPartyNotices.txt'}
EXTENSIONS = {'command-helm.helm-tasks', 'command-helm.helm-welcome', 'command-helm.vexillum'}
MACHO = {b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def relative(value):
    require(isinstance(value, str) and value and '\\' not in value, 'Invalid manifest path')
    path = PurePosixPath(value)
    require(not path.is_absolute() and '..' not in path.parts and path.as_posix() == value,
            'Unsafe or noncanonical manifest path')
    return Path(value)


def sha(path):
    require(path.is_file() and not path.is_symlink(), 'Missing or linked file: ' + path.name)
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def signature_details(path):
    result = subprocess.run(['/usr/bin/codesign', '-dv', '--verbose=4', str(path)],
                            text=True, capture_output=True, timeout=30, check=True)
    match = re.search(r'^TeamIdentifier=(.+)$', result.stderr, re.MULTILINE)
    require(match is not None and match[1] != 'not set', 'Missing persistent signing team')
    return match[1]


def identity(info, name, identifier):
    require(info.get('CFBundleName') == name and info.get('CFBundleDisplayName') == name
            and info.get('CFBundleExecutable') == name
            and info.get('CFBundleIdentifier') == identifier, 'Bundle identity mismatch: ' + name)


def verify(app):
    require(app.is_dir() and not app.is_symlink(), 'Expected a regular app directory')
    contents = app / 'Contents'
    resources = contents / 'Resources'
    engine = resources / 'app'
    info = plistlib.loads((contents / 'Info.plist').read_bytes())
    identity(info, 'Command Helm', 'xyz.prismet.command-helm')
    require(info.get('CFBundleShortVersionString') == VERSION, 'Unexpected bundle engine version')
    schemes = [scheme for item in info.get('CFBundleURLTypes', [])
               for scheme in item.get('CFBundleURLSchemes', [])]
    require(schemes == ['command-helm'], 'Unexpected URL handler')
    require((contents / 'MacOS/Command Helm').is_file(), 'Missing main executable')
    require((engine / 'bin/command-helm').is_file(), 'Missing Command Helm CLI')
    require(not (engine / 'bin/codium').exists(), 'Unrenamed CLI remains')
    require(sha(resources / 'Command Helm.icns') == sha(ROOT / 'branding/command-helm.icns'),
            'Branding differs from source')

    product = json.loads((engine / 'product.json').read_text())
    overlay = json.loads((ROOT / 'config/product.overlay.json').read_text())
    for key, value in overlay.items():
        require(key in product and type(product[key]) is type(value) and product[key] == value,
                'Product overlay mismatch: ' + key)

    receipt = json.loads((resources / 'command-helm-package.json').read_text())
    require(receipt.get('schema') == 1 and receipt.get('release') == '0.1.0-preview.1',
            'Unsupported package provenance')
    require(receipt.get('engineRebuilt') is False and receipt.get('engineVersion') == VERSION
            and product.get('version') == VERSION, 'Engine provenance mismatch')
    require(receipt.get('upstreamArchiveSHA256') == UPSTREAM_SHA256
            and receipt.get('upstreamURL') == f'https://github.com/VSCodium/vscodium/releases/tag/{VERSION}',
            'Upstream archive provenance mismatch')
    require(receipt.get('engineCommit') == product.get('commit')
            and re.fullmatch(r'[0-9a-f]{40}', str(receipt.get('engineCommit'))),
            'Engine commit mismatch')
    require(receipt.get('signing') == 'Apple Development; not notarized', 'Unexpected signing claim')
    preserved = receipt.get('preservedEngineFiles', {})
    require(set(preserved) == PRESERVED, 'Incomplete preserved engine/license manifest')
    for name, expected in preserved.items():
        require(sha(engine / relative(name)) == expected, 'Preserved engine/license changed: ' + name)

    entries = receipt.get('extensions', [])
    require(isinstance(entries, list) and len(entries) == len(EXTENSIONS)
            and {item['id'] for item in entries} == EXTENSIONS, 'Original extension inventory mismatch')
    require({p.name for p in (engine / 'extensions').glob('command-helm.*')} == EXTENSIONS,
            'Unexpected or missing Command Helm extension directory')
    file_count = 0
    for item in entries:
        source = ROOT / 'extensions' / item['id'].split('.', 1)[1]
        installed = engine / 'extensions' / item['id']
        require(installed.is_dir() and not installed.is_symlink(), 'Linked or missing original extension')
        manifest = json.loads((installed / 'package.json').read_text())
        require(manifest.get('publisher') + '.' + manifest['name'] == item['id']
                and manifest['version'] == item['version'] and manifest.get('license') == 'MIT',
                'Original extension metadata mismatch')
        records = item['files']
        names = [entry['path'] for entry in records]
        require(len(names) == len(set(names)) and 'LICENSE' in names, 'Duplicate paths or missing license')
        actual = set()
        for path in installed.rglob('*'):
            require(not path.is_symlink(), 'Linked original extension content')
            if path.is_file():
                actual.add(path.relative_to(installed).as_posix())
        require(actual == set(names), 'Unexpected/missing original extension files: ' + item['id'])
        for entry in records:
            path = relative(entry['path'])
            require(sha(installed / path) == entry['sha256'] == sha(source / path),
                    'Original extension differs from manifest/source: ' + item['id'] + '/' + str(path))
            file_count += 1

    require((resources / 'Command Helm Attribution.txt').is_file(), 'Missing attribution')
    for role, suffix in [('', '.helper'), (' (GPU)', '.helper.GPU'),
                         (' (Plugin)', '.helper.Plugin'), (' (Renderer)', '.helper.Renderer')]:
        name = 'Command Helm Helper' + role
        helper = contents / 'Frameworks' / (name + '.app')
        identity(plistlib.loads((helper / 'Contents/Info.plist').read_bytes()), name,
                 'xyz.prismet.command-helm' + suffix)
        require((helper / 'Contents/MacOS' / name).is_file(), 'Missing helper executable')

    subprocess.run(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(app)],
                   check=True, timeout=120, capture_output=True, text=True)
    team = signature_details(app)
    native_count = 0
    for path in app.rglob('*'):
        if path.is_symlink() or not path.is_file():
            continue
        with path.open('rb') as stream:
            magic = stream.read(4)
        if magic in MACHO:
            require(signature_details(path) == team, 'Native dependency signing team mismatch: ' + path.name)
            native_count += 1
    return {'verified': True, 'engineVersion': VERSION, 'originalExtensions': len(entries),
            'originalFiles': file_count, 'nativeTeamChecks': native_count,
            'deepStrictSignature': True, 'notarizationClaimed': False, 'runtimeTested': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.app), sort_keys=True))
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as error:
        print('Package verification failed: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
