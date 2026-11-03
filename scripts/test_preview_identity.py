"""Exercise preview packaging with a tiny engine fixture; never signs or launches code."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import plistlib
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PreviewIdentityTests(unittest.TestCase):
    def test_default_storage_does_not_reuse_the_legacy_profile(self):
        product = json.loads((ROOT / 'config/product.overlay.json').read_text())
        # These product fields select macOS Chromium/workbench state, extensions,
        # and shared state respectively. A separate VS Code --profile is insufficient.
        home = Path('/fixture/home')
        self.assertEqual(home / 'Library/Application Support' / product['nameShort'],
                         home / 'Library/Application Support/Command Helm Preview')
        self.assertEqual(home / product['dataFolderName'] / 'extensions',
                         home / '.command-helm-preview/extensions')
        self.assertEqual(home / product['sharedDataFolderName'],
                         home / '.command-helm-preview-shared')

    def test_packaged_preview_paths_and_verifier_agree(self):
        builder = load_script('build-macos')
        verifier = load_script('verify-package')
        with tempfile.TemporaryDirectory(prefix='helm-identity-test-') as directory:
            work = Path(directory)
            upstream = work / 'VSCodium.app'
            engine = upstream / 'Contents/Resources/app'
            engine.mkdir(parents=True)
            (engine / 'product.json').write_text(json.dumps({
                'version': '1.143.17232', 'commit': 'a' * 40}))
            for name in ('out/main.js', 'out/vs/workbench/workbench.desktop.main.js',
                         'LICENSE.txt', 'ThirdPartyNotices.txt'):
                file = engine / name
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text('fixture engine or notice\n')
            (engine / 'extensions').mkdir()
            (engine / 'bin').mkdir()
            (engine / 'bin/codium').write_text("VSCodium 'codium'\n")
            for name in ('VSCodium', 'VSCodium Helper', 'VSCodium Helper (GPU)',
                         'VSCodium Helper (Plugin)', 'VSCodium Helper (Renderer)'):
                bundle = upstream if name == 'VSCodium' else upstream / 'Contents/Frameworks' / (name + '.app')
                (bundle / 'Contents/MacOS').mkdir(parents=True, exist_ok=True)
                (bundle / 'Contents/MacOS' / name).write_text('fixture executable\n')
                (bundle / 'Contents/Info.plist').write_bytes(plistlib.dumps({
                    'CFBundleName': name, 'CFBundleDisplayName': name,
                    'CFBundleExecutable': name, 'CFBundleIdentifier': 'com.fixture.' + name,
                    'CFBundleShortVersionString': '1.143.17232'}))
            archive = work / 'fixture.zip'
            archive.write_bytes(b'fixture archive')
            output = work / 'output'

            def external_run(*args):
                if args[0] == '/usr/bin/ditto':
                    shutil.copytree(upstream, Path(args[-1]) / 'VSCodium.app')
                elif args[0] != '/usr/bin/codesign':
                    raise AssertionError('Unexpected external operation: ' + str(args))

            with patch.object(builder, 'UPSTREAM_SHA256', builder.digest(archive)), \
                 patch.object(builder, 'run', external_run), \
                 patch.object(builder, 'clear_finder_metadata'), \
                 patch.object(sys, 'argv', ['build-macos.py', '--upstream-zip', str(archive),
                                          '--output', str(output), '--identity', 'fixture']), \
                 contextlib.redirect_stdout(io.StringIO()):
                builder.main()

            app = output / 'Command Helm Preview.app'
            self.assertTrue(app.is_dir(), 'Preview must have its own app bundle path')
            info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
            self.assertEqual(info['CFBundleIdentifier'], 'xyz.prismet.command-helm.preview')
            self.assertEqual(info['CFBundleURLTypes'][0]['CFBundleURLSchemes'], ['command-helm-preview'])
            self.assertTrue((app / 'Contents/MacOS/Command Helm Preview').is_file())
            packaged = app / 'Contents/Resources/app'
            cli = packaged / 'bin/command-helm-preview'
            self.assertTrue(cli.is_file(), 'CLI name must match applicationName')
            self.assertEqual(cli.read_text(), "Command Helm Preview 'command-helm-preview'\n")
            product = json.loads((packaged / 'product.json').read_text())
            self.assertEqual(product['applicationName'], 'command-helm-preview')
            self.assertEqual(product['urlProtocol'], 'command-helm-preview')
            receipt = json.loads((app / 'Contents/Resources/command-helm-package.json').read_text())
            self.assertEqual(receipt['release'], '0.1.0-preview.2')

            # Signature trust is covered by the real candidate verification, not
            # this nonnative fixture. All file/identity/provenance checks remain real.
            with patch.object(verifier, 'UPSTREAM_SHA256', builder.digest(archive)), \
                 patch.object(verifier.subprocess, 'run'), \
                 patch.object(verifier, 'signature_details', return_value='fixture-team'):
                self.assertTrue(verifier.verify(app)['verified'])
                for role, suffix in [('', '.helper'), (' (GPU)', '.helper.GPU'),
                                     (' (Plugin)', '.helper.Plugin'), (' (Renderer)', '.helper.Renderer')]:
                    helper = app / 'Contents/Frameworks' / ('Command Helm Preview Helper' + role + '.app')
                    helper_info = plistlib.loads((helper / 'Contents/Info.plist').read_bytes())
                    self.assertEqual(helper_info['CFBundleIdentifier'],
                                     'xyz.prismet.command-helm.preview' + suffix)
                info['CFBundleIdentifier'] = 'xyz.prismet.command-helm'
                (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(info))
                with self.assertRaisesRegex(ValueError, 'Bundle identity mismatch'):
                    verifier.verify(app)


if __name__ == '__main__':
    unittest.main()
