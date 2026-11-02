# Command Helm Tasks

Send Codex work to computers configured on your private Command Helm bridge, inspect queue and worker status, and read delivery reports inside the editor. This extension is included in Command Helm Desktop. It sends work only when you press **Send task**.

## Connect your computer

1. Follow the [phone and computer guide](https://github.com/sagedeutschle/command-helm-desktop/blob/main/docs/CONNECT.md) to set up the companion bridge and a task worker on a computer you own.
2. In the editor's User settings, set `commandHelm.tasks.bridgeUrl` to that bridge's private HTTPS address. The local bridge's default address is `https://127.0.0.1:8746`.
3. Open **Command Helm: Open Tasks**. Destinations come from the paired bridge's configured device inventory; the editor never enrolls discovered computers. A task worker is required to execute queued work.
4. Optionally set `commandHelm.tasks.localDeviceId` in User settings to the configured ID for **this execution computer**, then restart the editor. Leave it blank to keep local folder/report opening disabled. Do not set it to another computer's ID.

The bridge must already be configured locally. The host reads pairing material only from the standard local companion state directory: `~/Library/Application Support/Command Helm Remote` on macOS or `~/.local/state/command-helm-remote` on Linux. Custom state directories and Windows extension hosts are not supported by this preview. When connecting to a remote hub, its trusted pairing must already be provisioned in this local directory; configuring a URL alone does not pair it. Start with the documented single-computer setup.

Credentials stay in the extension host. HTTPS requires the exact paired certificate and normal certificate validity checks, with no insecure fallback or redirects. The webview cannot access pairing material or make network requests. Setup and account sign-in are separate from opening the Tasks view.

## Send and inspect work

Choose a configured destination, describe the task, and optionally enter an absolute existing project folder on that destination. Leave the project blank to use the worker's configured default. The bridge reports the resulting delivery location; the extension does not assume a fixed folder.

**Command Helm: New Task in Current Project** prefills a local folder only when Workspace Trust is enabled and `localDeviceId` is configured. **Open folder** and **Open REPORT.md** require a task targeting that exact local device ID and an existing absolute local path of the expected type. Opening a folder uses a new editor window.

History distinguishes `queued`, `running`, `completed`, `failed`, and `interrupted`. An offline destination can retain queued work. A completed state means the worker returned successfully; read the report to understand its checks. Reports are bounded to 24,000 characters. Worker heartbeats older than 90 seconds are labeled offline or stale. Disconnected views keep the timestamp of their last successful snapshot.

A removed destination remains visibly unavailable when selected; refreshing cannot silently redirect a draft to a different computer. New submissions require a connected snapshot and a configured destination.

After an uncertain submission, **Retry same task** retains the saved UUID and exact input across editor restarts. The request may already have arrived. Starting another task explicitly warns before abandoning the pending retry identity. Pending prompts are saved locally in editor extension state; they are not registered for Settings Sync.

The view refreshes every five seconds while visible. Hiding or disposing it stops polling. Merely opening the editor does not submit work. Restricted Mode permits explicit task submission but disables current-project prefilling; virtual workspaces do not activate this extension.

## Checks

Run `npm test` and `npm run check` with Node 18 or newer. Tests use disposable HTTPS fixtures and fake pairing; OpenSSL is required. They do not read real pairing or dispatch live tasks. There are no runtime npm dependencies.

Original extension code is MIT licensed. See `LICENSE`.
