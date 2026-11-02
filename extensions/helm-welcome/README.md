# Command Helm Welcome

An original, dependency-free Command Desk for Command Helm. Run **Command Helm: Open Command Desk** from the Command Palette. It opens in empty windows and Restricted Mode.

Choose **Open folder** or **New file** to begin. **Terminal** requires workspace trust and an available editor command. Review trust using the editor's Workspace Trust controls; this extension never grants trust. Use Tab and Shift+Tab to navigate and Enter or Space to activate controls.

The optional `command-helm.helm-tasks` companion appears only when installed. Its real `commandHelm.openTasks` command must also be available. Installation does not prove a working connection: remote delivery requires a configured companion and a paired private bridge. The desk neither reads credentials nor tests connectivity. **Refresh setup** rechecks installed extensions, commands, workspace and trust; there is no timer or background network activity.

`commandHelm.welcome.openOnStartup` defaults to `true` in the integrated app. Set it to `false` to disable the automatic desk. The automatic desk opens once per profile per extension version, tracked in extension global state; manually opening the desk remains available. It never opens a remembered personal workspace. Settings Sync keys are not registered.

Run `npm test` for focused Node built-in tests and `npm run check` for syntax checks. No dependency installation is needed. Native rendering and assistive-technology acceptance require a separate editor verification.

`package-files.json` is the explicit runtime packaging allowlist. A packager must read this array and copy exactly those relative files, rejecting missing files, symlinks and paths that escape the extension root. Tests and any incidental files are excluded. This extension does not install or package itself.

Original Command Helm extension code is MIT licensed; see `LICENSE` and `ATTRIBUTION.md`. Upstream editor and dependency licenses remain separate.

**Connect your phone & computer** opens the public setup guide. **Downloads & updates** opens the public desktop releases page. These explicit buttons open fixed HTTPS links in your browser; the webview cannot supply a destination URL.
