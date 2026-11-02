# Connect your phone and IDE

1. [Download Command Helm Desktop](https://github.com/sagedeutschle/command-helm-desktop/releases) on your Apple Silicon Mac and [Command Helm for iPhone/iPad](https://apps.apple.com/app/id6829226962) on your phone. The desktop download is a development-signed, non-notarized preview; read its release notes first.
2. On the Mac, follow the [standalone bridge setup](https://github.com/sagedeutschle/command-helm-companion/blob/main/docs/backend-setup.md). Use the standard state directory so the built-in Tasks extension can find your local pairing. Set up a worker if you want queued Codex tasks.
3. In the IDE's Settings, search for **Command Helm Tasks**. Set **Bridge URL** to the private HTTPS address of that local bridge. Set **Local Device ID** to this Mac's configured device ID if you want Open Folder/Open Report; leave it empty to disable those actions. Restart the editor after changing the local ID.
4. Open **Command Helm: Open Tasks** from the command palette or Command Desk. Your configured devices load from the bridge. Select a destination explicitly and send a small task in a disposable project. Read the resulting report.
5. Follow the [phone pairing guide](https://github.com/sagedeutschle/command-helm-companion/blob/main/docs/getting-started.md). The phone and IDE must use the same bridge to see the same task queue. Pairing credentials stay on your devices; never paste them into GitHub or a task prompt.

The local bridge can route work to other configured computers. This preview's desktop client reads credentials only from the standard bridge directory on the computer running its extension host; it has no remote enrollment or credential import UI. For a shared remote hub, use the documented bridge/worker setup and an operator-configured matching local bridge route. Do not copy a pairing file to an unrelated bridge.

The bridge uses pinned HTTPS. A changed certificate is an identity mismatch to investigate, not a reason to disable TLS checks. An offline computer's work remains queued. If a response is lost, Retry keeps the original task ID; starting a new request can duplicate work. Provider sign-in and permission policies remain on the execution computer.

For interactive terminals, use the phone Terminal tab and enable terminal support in your bridge configuration. Installing the desktop IDE alone does not enable SSH access or run a worker.
