# Command Helm Desktop

An independent VSCodium-based IDE with Command Desk, the Vexillum theme, and a task console linked to your own Command Helm bridge and phone.

**[Download the macOS Apple Silicon preview](https://github.com/sagedeutschle/command-helm-desktop/releases)** · **[Connect your phone](docs/CONNECT.md)** · **[Get the iPhone/iPad app](https://apps.apple.com/app/id6829226962)**

## Install

1. Download `Command-Helm-macOS-arm64-0.1.0-preview.1.zip` and `SHA256SUMS.txt` from the release. This build is for Apple Silicon Macs, macOS 12 or later. Intel Macs, Windows and Linux installers are not included.
2. Verify the ZIP with `shasum -a 256` against the published checksum, then unzip it and move **Command Helm.app** to Applications.
3. Open Command Helm. The first-run Command Desk opens a folder, a file, a terminal, or Tasks. Workspace Trust stays enabled.
4. To use the phone and desktop together, follow [Connect your phone and computer](docs/CONNECT.md).

**Preview signing:** this package is Apple Development signed, not Developer ID notarized. macOS can block first launch. Only if you trust this exact release, use Apple's per-app Open Anyway control in System Settings → Privacy & Security after trying to open it. Do not disable Gatekeeper. A notarized stable desktop release is still pending.

The editor works without an AI account. Remote work requires your own private bridge; Codex work also requires your own installed, authenticated Codex CLI. Downloading the editor does not enroll computers or configure the phone automatically.

## What is included

- Current official VSCodium 1.143.17232 macOS arm64 engine, repackaged with Command Helm identity. The engine itself is not rebuilt or represented as original Helm code.
- Original Command Desk with project actions and phone setup/download links.
- Original Vexillum theme and clean default settings.
- Original Tasks console with configured device discovery, persistent retry identity, worker history, and reports. Optional local folder opening uses your explicit local device ID.

No personal profiles, saved sessions, provider credentials, private machine registry or third-party extension collection is included. Extensions can be installed from reviewed local VSIX files; automatic extension downloads and updates are disabled. Check this repository's Releases page for manual updates. This preview does not include the private experimental VM or machine-specific tools.

## Build and verify

The packaging script verifies the official upstream archive SHA256, verifies its signature, applies the identity overlay, copies the original extensions, preserves core engine and license hashes, and signs a new bundle. It never installs over a running app.

```sh
python3 scripts/build-macos.py --upstream-zip /path/to/VSCodium-darwin-arm64-1.143.17232.zip --output /path/to/new-output --identity 'YOUR EXISTING SIGNING IDENTITY'
node --test extensions/helm-welcome/test/*.test.js extensions/helm-tasks/test/*.test.js
```

Use a local, non-synced build directory. Download the input from the [official VSCodium release](https://github.com/VSCodium/vscodium/releases/tag/1.143.17232). Its pinned digest is in the script and release provenance. The release includes provenance and an extension inventory. See [verification and limits](docs/VERIFICATION.md).

## License and support

Original Command Helm code in this repository is MIT licensed. VSCodium, Code - OSS, Electron and bundled dependencies retain their original licenses; the application includes `LICENSE.txt`, `ThirdPartyNotices.txt`, extension licenses and an attribution file. Original icon/theme assets are included under this repository's license. This project is independent of Microsoft and VSCodium.

Use [GitHub issues](https://github.com/sagedeutschle/command-helm-desktop/issues) for bugs. Keep private paths, task content, bridge keys and certificates out of public reports. There is no update service or hosted bridge operated by this project.
