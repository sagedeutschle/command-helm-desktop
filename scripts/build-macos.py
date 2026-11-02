#!/usr/bin/env python3
"""Package the pinned official VSCodium engine with original Command Helm layers.

Only writes a new output directory. Never installs or replaces a running app.
Requires macOS, Python 3.10+, and an existing signing identity.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.143.17232'
UPSTREAM_SHA256 = 'ade8f5e0ebf47e5ea9e2478844f150c68e43def192b6f8be05d0329d25ec0917'
NAME = 'Command Helm'
IDENTIFIER = 'xyz.prismet.command-helm'

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def run(*args):
    subprocess.run(list(map(str, args)), check=True)

def plist(path, changes):
    value = plistlib.loads(path.read_bytes())
    value.update(changes)
    path.write_bytes(plistlib.dumps(value, sort_keys=False))

def clear_finder_metadata(root):
    # ditto can restore Finder information from AppleDouble records; it is not
    # application code. Do not change quarantine or other security attributes.
    for key in ('com.apple.FinderInfo', 'com.apple.ResourceFork'):
        subprocess.run(['/usr/bin/xattr', '-r', '-d', key, str(root)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upstream-zip', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--identity', required=True)
    args = parser.parse_args()
    if digest(args.upstream_zip) != UPSTREAM_SHA256:
        parser.error('Pinned official VSCodium archive checksum mismatch')
    if args.output.exists() or args.output.is_symlink():
        parser.error('Output must be a new directory')
    args.output.mkdir(parents=True)
    run('/usr/bin/ditto', '-x', '-k', args.upstream_zip, args.output)
    app = args.output / 'VSCodium.app'
    clear_finder_metadata(app)
    run('/usr/bin/codesign', '--verify', '--deep', '--strict', app)
    app.rename(args.output / (NAME + '.app'))
    app = args.output / (NAME + '.app')
    resources = app / 'Contents/Resources'
    engine = resources / 'app'
    upstream = json.loads((engine / 'product.json').read_text())
    preserved = {name: digest(engine / name) for name in ('out/main.js', 'out/vs/workbench/workbench.desktop.main.js', 'LICENSE.txt', 'ThirdPartyNotices.txt')}
    overlay = json.loads((ROOT / 'config/product.overlay.json').read_text())
    product = {**upstream, **overlay}
    (engine / 'product.json').write_text(json.dumps(product, indent=2) + '\n')
    info = app / 'Contents/Info.plist'
    plist(info, {'CFBundleName': NAME, 'CFBundleDisplayName': NAME,
        'CFBundleExecutable': NAME, 'CFBundleIdentifier': IDENTIFIER,
        'CFBundleIconFile': NAME + '.icns', 'CFBundleIconName': NAME,
        'CFBundleURLTypes': [{'CFBundleURLName': NAME, 'CFBundleURLSchemes': ['command-helm']}],
        'NSHumanReadableCopyright': 'Command Helm additions © 2026 Sage Deutschle. Includes VSCodium, Code - OSS and other open-source software; see bundled notices.'})
    (app / 'Contents/MacOS/VSCodium').rename(app / ('Contents/MacOS/' + NAME))
    shutil.copyfile(ROOT / 'branding/command-helm.icns', resources / (NAME + '.icns'))
    cli = engine / 'bin/codium'
    cli.write_text(cli.read_text().replace('VSCodium', NAME).replace("'codium'", "'command-helm'"))
    cli.rename(engine / 'bin/command-helm')
    for role, suffix in [('', '.helper'), (' (GPU)', '.helper.GPU'), (' (Plugin)', '.helper.Plugin'), (' (Renderer)', '.helper.Renderer')]:
        old = 'VSCodium Helper' + role
        new = NAME + ' Helper' + role
        helper = app / 'Contents/Frameworks' / (old + '.app')
        helper.rename(helper.with_name(new + '.app'))
        helper = helper.with_name(new + '.app')
        (helper / 'Contents/MacOS' / old).rename(helper / 'Contents/MacOS' / new)
        plist(helper / 'Contents/Info.plist', {'CFBundleName': new, 'CFBundleDisplayName': new,
            'CFBundleExecutable': new, 'CFBundleIdentifier': IDENTIFIER + suffix})
        run('/usr/bin/codesign', '--force', '--preserve-metadata=entitlements,flags,runtime', '--sign', args.identity, helper)
    extensions = []
    for source in sorted((ROOT / 'extensions').iterdir()):
        if not source.is_dir(): continue
        manifest = json.loads((source / 'package.json').read_text())
        identifier = manifest['publisher'] + '.' + manifest['name']
        destination = engine / 'extensions' / identifier
        destination.mkdir()
        included = []
        for file in sorted(source.rglob('*')):
            relative = file.relative_to(source)
            if any(p in ('node_modules', 'test', 'tests', '.git') for p in relative.parts): continue
            if file.is_symlink(): raise ValueError('Extension symlink refused: ' + str(relative))
            if not file.is_file() or file.suffix in ('.vsix', '.log'): continue
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
            included.append({'path': str(relative), 'sha256': digest(target)})
        extensions.append({'id': identifier, 'version': manifest['version'], 'files': included})
    inventory = []
    for file in sorted((engine / 'extensions').glob('*/package.json')):
        package = json.loads(file.read_text())
        inventory.append({'id': package.get('publisher', '') + '.' + package['name'], 'version': package['version'], 'license': package.get('license', 'See upstream notices')})
    receipt = {'schema': 1, 'release': '0.1.0-preview.1', 'engineVersion': VERSION,
        'engineCommit': upstream.get('commit'), 'engineRebuilt': False,
        'upstreamURL': f'https://github.com/VSCodium/vscodium/releases/tag/{VERSION}',
        'upstreamArchiveSHA256': UPSTREAM_SHA256, 'preservedEngineFiles': preserved,
        'signing': 'Apple Development; not notarized', 'extensions': extensions}
    (resources / 'command-helm-package.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (resources / 'Command Helm Attribution.txt').write_text('Command Helm Desktop public preview\n\nIndependent distribution of the official VSCodium engine with original Command Desk, Vexillum and Tasks.\nUpstream notices: app/LICENSE.txt and app/ThirdPartyNotices.txt.\nOriginal extension licenses: app/extensions/command-helm.*/LICENSE.\nDevelopment signed; not notarized. Manual updates: https://github.com/sagedeutschle/command-helm-desktop/releases\n')
    for name, expected in preserved.items():
        assert digest(engine / name) == expected, name
    # Every native dependency must share our team identity under hardened runtime.
    # Sign nested code inside-out; preserve upstream entitlements and runtime flags.
    macho = (b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf')
    for file in sorted(app.rglob('*')):
        if not file.is_file() or file.is_symlink(): continue
        with file.open('rb') as stream: magic = stream.read(4)
        if magic in macho:
            run('/usr/bin/codesign', '--force', '--preserve-metadata=entitlements,flags,runtime', '--sign', args.identity, file)
    for bundle in sorted(app.rglob('*'), key=lambda x: len(x.parts), reverse=True):
        if bundle.is_dir() and not bundle.is_symlink() and bundle.suffix in ('.app', '.framework'):
            run('/usr/bin/codesign', '--force', '--preserve-metadata=entitlements,flags,runtime', '--sign', args.identity, bundle)
    run('/usr/bin/codesign', '--force', '--preserve-metadata=entitlements,flags,runtime', '--sign', args.identity, app)
    run('/usr/bin/codesign', '--verify', '--deep', '--strict', app)
    (args.output / 'PROVENANCE.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (args.output / 'EXTENSION-INVENTORY.json').write_text(json.dumps(inventory, indent=2) + '\n')
    print('Verified candidate:', app)

if __name__ == '__main__': main()
