# Preview verification

Release candidate checks are recorded here before publication. This is an Apple Silicon macOS preview, not a notarized stable release.

The package uses the official VSCodium 1.143.17232 archive (SHA256 `ade8f5e0ebf47e5ea9e2478844f150c68e43def192b6f8be05d0329d25ec0917`). Upstream is retained with its notices; the original Helm additions are packaged from this repository. Release provenance identifies preserved engine files and bundled extension hashes.

For `0.1.0-preview.2`, two Python regression tests exercise separate default storage paths and package a small nonnative engine fixture to verify the app, executable, CLI, helper identities, URL protocol and release provenance. The fixture replaces extraction and signing operations; it does not establish a real candidate's signature or native acceptance. Run `python3 -m unittest discover -s scripts -p 'test_*.py' -v`.

Local `0.1.0-preview.2` candidate checks on November 2, 2026 passed: 2 Python regression tests and 40 Node tests; full package verification of all 19 original extension files, preserved engine/license hashes, deep strict signatures and 34 native signing-team checks. Native default-path launch beside the existing private app opened Command Desk and Tasks successfully, without loading the legacy War Room or private user extensions. Tasks read the existing same-computer bridge pairing as designed; no task was submitted. The candidate was gracefully quit and the existing app processes were preserved. This records a local candidate, not publication or a downloaded Gatekeeper acceptance test.

Its app is **Command Helm Preview.app**, bundle identifier is `xyz.prismet.command-helm.preview`, and URL protocol is `command-helm-preview`. Verify it with `python3 scripts/verify-package.py --app '/path/to/Command Helm Preview.app'`. Its default macOS user-data, shared-data and installed-extension directories are separate from the earlier private installation; no automatic profile migration is performed.

Historical `0.1.0-preview.1` checks on November 2, 2026:

- 40 Node tests passed for the original welcome and task extensions, including retry identity, removed-device selection, TLS fixtures and fixed setup links. After removing unsupported default-setting declarations, the 13 welcome tests passed again.
- `python3 scripts/verify-package.py --app /path/to/Command\ Helm.app` passed: full product overlay, all 19 original extension files, preserved engine/license digests, deep strict signature, and matching signing team on all 34 native binaries.
- The CLI reports 1.143.17232 / c072cf642cbbadabefa22f39c58cc902a8b7427f / arm64.
- Native Command Desk rendering and Tasks rendering were inspected in separate profiles. Task text entry and New task reset worked; an intentionally unreachable bridge showed disconnected state and kept Send disabled. No live agent task was dispatched by this check.
- Independent source/package review and a redacted secret scan found no blocking issue. The theme's explicit MIT license is bundled.

Physical phone-to-desktop delivery and a clean downloaded Gatekeeper installation remain unverified. The historical development signature was valid; notarization was not present. Extension-host logs included an upstream Node url.parse deprecation warning; no application failure is claimed from that warning. The current engine is a pinned upstream release, not a claim of a comprehensive vulnerability audit.

Follow-up diagnosis found that `0.1.0-preview.1` reused existing same-machine Command Helm settings, user-installed extensions, restored editors and Chromium webview state. A legacy War Room could consequently appear even though it was absent from the public extension inventory. Running the old and downloaded engines against this shared data produced a service-worker loading error; the same downloaded engine and legacy extension rendered War Room with isolated data. The new preview identity addresses that storage collision. Do not clear the existing profile or copy it wholesale into the preview to test the fix.
