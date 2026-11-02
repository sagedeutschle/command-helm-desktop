# Preview verification

Release candidate checks are recorded here before publication. This is an Apple Silicon macOS preview, not a notarized stable release.

The package uses the official VSCodium 1.143.17232 archive (SHA256 `ade8f5e0ebf47e5ea9e2478844f150c68e43def192b6f8be05d0329d25ec0917`). Upstream is retained with its notices; the original Helm additions are packaged from this repository. Release provenance identifies preserved engine files and bundled extension hashes.

Verified on November 2, 2026:

- 40 Node tests passed for the original welcome and task extensions, including retry identity, removed-device selection, TLS fixtures and fixed setup links. After removing unsupported default-setting declarations, the 13 welcome tests passed again.
- `python3 scripts/verify-package.py --app /path/to/Command\ Helm.app` passed: full product overlay, all 19 original extension files, preserved engine/license digests, deep strict signature, and matching signing team on all 34 native binaries.
- The CLI reports 1.143.17232 / c072cf642cbbadabefa22f39c58cc902a8b7427f / arm64.
- Native Command Desk rendering and Tasks rendering were inspected in separate profiles. Task text entry and New task reset worked; an intentionally unreachable bridge showed disconnected state and kept Send disabled. No live agent task was dispatched by this check.
- Independent source/package review and a redacted secret scan found no blocking issue. The theme's explicit MIT license is bundled.

Physical phone-to-desktop delivery for this exact package and a clean downloaded Gatekeeper installation remain unverified. Development signing is valid; notarization is not present. Extension-host logs include an upstream Node url.parse deprecation warning; no application failure is claimed from that warning. The current engine is a pinned upstream release, not a claim of a comprehensive vulnerability audit.
