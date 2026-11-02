'use strict';

const { randomBytes } = require('node:crypto');
const { render } = require('./render');
const { version } = require('./package.json');

const COMMANDS = Object.freeze({
  openFolder: 'workbench.action.files.openFolder',
  newFile: 'workbench.action.files.newUntitledFile',
  terminal: 'workbench.action.terminal.new',
  tasks: 'commandHelm.openTasks'
});
const ACTIONS = new Set([...Object.keys(COMMANDS), 'refresh', 'setup', 'releases']);

function createWelcome(vscode, context) {
  let panel;
  let disposed = false;
  let panelSubscriptions = [];
  let notice = '';
  let generation = 0;

  function releasePanel() {
    generation += 1;
    for (const subscription of panelSubscriptions.splice(0)) subscription.dispose();
    panel = undefined;
  }

  async function state() {
    const installed = Boolean(vscode.extensions.getExtension('command-helm.helm-tasks'));
    let commands = [];
    let discoveryError = '';
    try {
      commands = await vscode.commands.getCommands(true);
    } catch {
      discoveryError = 'Could not check editor commands. Select Refresh setup to try again.';
    }
    const available = Object.fromEntries(Object.entries(COMMANDS).map(([action, command]) => [action, commands.includes(command)]));
    available.terminal = available.terminal && vscode.workspace.isTrusted;
    available.tasks = available.tasks && installed;
    return {
      workspace: vscode.workspace.name || 'No folder open',
      trusted: Boolean(vscode.workspace.isTrusted), installed, available,
      notice: notice || discoveryError
    };
  }

  async function refresh() {
    const target = panel;
    if (!target || disposed) return;
    const currentGeneration = ++generation;
    const snapshot = await state();
    if (target !== panel || currentGeneration !== generation || disposed) return;
    target.webview.html = render(snapshot, randomBytes(24).toString('base64'));
  }

  async function report(error, action) {
    // Command errors may contain private paths; keep diagnostics local to the editor's error UI.
    notice = `${action} failed. Refresh setup and try again.`;
    try { await refresh(); } catch { /* The notification remains available if rendering fails. */ }
    const detail = error instanceof Error ? error.message : 'The editor did not complete the action.';
    try { await vscode.window.showErrorMessage(`Command Desk: ${notice} ${detail}`); } catch { /* Host may be closing. */ }
  }

  async function handleMessage(message) {
    if (disposed || !panel) return;
    if (!message || typeof message !== 'object' || !ACTIONS.has(message.action) || Object.keys(message).some(key => key !== 'action')) {
      notice = 'That action is unavailable. Use the Command Desk buttons.';
      await refresh();
      return;
    }
    if (message.action === 'setup' || message.action === 'releases') {
      const url = message.action === 'setup' ? 'https://github.com/sagedeutschle/command-helm-desktop/blob/main/docs/CONNECT.md' : 'https://github.com/sagedeutschle/command-helm-desktop/releases';
      await vscode['env'].openExternal(vscode.Uri.parse(url));
      return;
    }
    if (message.action === 'refresh') {
      notice = '';
      await refresh();
      return;
    }
    // Recheck the host boundary on every click, even if the rendered page is stale.
    const snapshot = await state();
    if (disposed || !panel) return;
    if (!snapshot.available[message.action]) {
      notice = message.action === 'terminal' && !snapshot.trusted
        ? 'Terminal requires a trusted workspace. Review Workspace Trust in the editor, then refresh setup.'
        : 'This command is unavailable. Check the setup details, then refresh setup.';
      await refresh();
      return;
    }
    await vscode.commands.executeCommand(COMMANDS[message.action]);
    notice = message.action === 'newFile' ? 'New file opened. Save it when you are ready.' : '';
    await refresh();
  }

  async function open() {
    if (disposed) return;
    if (panel) {
      panel.reveal(vscode.ViewColumn.One);
      await refresh();
      return;
    }
    panel = vscode.window.createWebviewPanel('commandHelm.welcome', 'Command Desk', vscode.ViewColumn.One, {
      enableScripts: true,
      enableCommandUris: false,
      localResourceRoots: []
    });
    panelSubscriptions.push(panel.onDidDispose(releasePanel));
    panelSubscriptions.push(panel.webview.onDidReceiveMessage(message => handleMessage(message).catch(error => report(error, 'Action'))));
    await refresh();
  }

  const safeOpen = () => open().catch(error => report(error, 'Open Command Desk'));
  context.subscriptions.push(vscode.commands.registerCommand('commandHelm.welcome.open', safeOpen));
  context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => refresh().catch(error => report(error, 'Refresh setup'))));
  context.subscriptions.push(vscode.extensions.onDidChange(() => refresh().catch(error => report(error, 'Refresh setup'))));
  if (vscode.workspace.onDidChangeWorkspaceFolders) {
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => refresh().catch(error => report(error, 'Refresh setup'))));
  }
  const lifetime = { dispose() {
    if (disposed) return;
    disposed = true;
    const target = panel;
    releasePanel();
    if (target) target.dispose();
  } };
  context.subscriptions.push(lifetime);

  const ready = (async () => {
    const key = `commandHelm.welcome.seen.${version}`;
    if (vscode.workspace.getConfiguration('commandHelm.welcome').get('openOnStartup', false) && !context.globalState.get(key, false)) {
      await open();
      if (!disposed) await context.globalState.update(key, true);
    }
  })().catch(error => report(error, 'Startup welcome'));
  return { ready, open: safeOpen, dispose: lifetime.dispose };
}

function activate(context) { return createWelcome(require('vscode'), context); }
function deactivate() { /* All resources belong to context.subscriptions. */ }
module.exports = { activate, deactivate, createWelcome };
