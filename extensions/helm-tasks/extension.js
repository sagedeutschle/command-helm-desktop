'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const { BridgeClient } = require('./lib/client');
const { devicesFromJSON, localTarget, localPath, prepareSubmission } = require('./lib/model');
const { html } = require('./lib/webview');

class TasksView {
  constructor(context) {
    this.disposed = false;
    this.context = context; this.machine = localTarget(vscode.workspace.getConfiguration('commandHelm.tasks').get('localDeviceId', '')); this.view = undefined; this.timer = undefined;
    this.state = { tasks: [], workers: [], devices: [], connected: false, refreshedAt: 0, error: '', submitting: false,
      localTarget: this.machine, pending: context.globalState.get('pendingTask'),
      draft: { target: this.machine || '', prompt: '', workspace: '' } };
  }
  client() {
    return new BridgeClient({ url: vscode.workspace.getConfiguration('commandHelm.tasks').get('bridgeUrl', 'https://127.0.0.1:8746') });
  }
  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = html();
    view.webview.onDidReceiveMessage(message => this.handle(message).catch(() => {
      this.state.error = 'Task action failed. Check the private bridge and retry the same request.'; this.send();
    }));
    view.onDidChangeVisibility(() => this.visibility());
    view.onDidDispose(() => { this.stop(); this.view = undefined; });
    this.visibility();
  }
  send(extra = {}) { if (this.view) this.view.webview.postMessage({ type: 'state', state: this.state, ...extra }); }
  stop() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
  visibility() { this.stop(); if (this.view?.visible) this.refresh(); }
  async refresh() {
    if (this.refreshing || this.disposed) return;
    this.refreshing = true; this.stop();
    try {
      const client = this.client();
      const [snapshot, inventory] = await Promise.all([client.snapshot(), client.call('GET', '/v1/devices')]);
      const devices = devicesFromJSON(inventory);
      if (this.disposed) return;
      this.state.devices = devices;
      this.state.tasks = snapshot.tasks.sort((a, b) => b.createdAt - a.createdAt);
      this.state.workers = snapshot.workers; this.state.connected = true; this.state.refreshedAt = Date.now() / 1000;
      if (!this.state.pending) this.state.error = '';
    } catch (error) { this.state.connected = false; this.state.error = error.message; }
    finally {
      this.refreshing = false; this.send();
      if (!this.disposed && this.view?.visible) this.timer = setTimeout(() => this.refresh(), 5000);
    }
  }
  async submit(draft) {
    if (this.state.submitting || this.disposed) return;
    this.state.submitting = true;
    try {
      if (!this.state.pending && (!this.state.connected || !this.state.devices.some(d => d.id === draft?.target))) throw new Error('Connect to the bridge and choose a configured device.');
      const payload = prepareSubmission(draft, this.state.pending);
      this.state.pending = payload;
      // Persist before making the request: a timeout or editor restart must reuse its UUID.
      await this.context.globalState.update('pendingTask', payload);
      this.state.error = ''; this.send();
      const task = await this.client().submit(payload);
      await this.context.globalState.update('pendingTask', undefined);
      this.state.pending = undefined; this.state.draft = { target: payload.target, prompt: '', workspace: '' };
      this.state.tasks = [task, ...this.state.tasks.filter(t => t.id !== task.id)];
      this.state.connected = true; this.send({ resetDraft: true, select: task.id });
    } catch (error) { this.state.error = error.message; }
    finally { this.state.submitting = false; this.send(); }
  }
  async newTask(prefill = false) {
    if (this.state.submitting) return;
    if (this.state.pending) {
      const answer = await vscode.window.showWarningMessage('The previous request may already be queued. Starting another task abandons its retry ID; sending the same work again could duplicate it.', { modal: true }, 'Start another task');
      if (answer !== 'Start another task') return;
      await this.context.globalState.update('pendingTask', undefined); this.state.pending = undefined;
    }
    const first = vscode.workspace.workspaceFolders?.[0]?.uri;
    this.state.draft = { target: this.machine || '', prompt: '',
      workspace: prefill && vscode.workspace.isTrusted && this.machine && first?.scheme === 'file' ? first.fsPath : '' };
    this.state.error = ''; this.send({ resetDraft: true });
  }
  async open(id, kind) {
    const task = this.state.tasks.find(t => t.id === id);
    const file = localPath(task, kind, this.machine);
    if (!file) throw new Error('This task path belongs to another destination or is unavailable.');
    let stat;
    try { stat = await fs.stat(file); } catch { throw new Error('This local delivery path does not exist yet.'); }
    if (kind === 'report') {
      if (!stat.isFile()) throw new Error('The local report is not a file.');
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(file)));
    } else {
      if (!stat.isDirectory()) throw new Error('The local delivery path is not a folder.');
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(file), { forceNewWindow: true });
    }
  }
  async handle(message) {
    if (!message || typeof message !== 'object') return;
    switch (message.type) {
      case 'ready': this.send({ resetDraft: true }); break;
      case 'draft':
        if (!this.state.pending && !this.state.submitting && this.state.devices.some(d => d.id === message.draft?.target) &&
            typeof message.draft.prompt === 'string' && typeof message.draft.workspace === 'string') {
          this.state.draft = { target: message.draft.target, prompt: message.draft.prompt.slice(0, 8000), workspace: message.draft.workspace.slice(0, 4096) };
        }
        break;
      case 'submit': await this.submit(message.draft); break;
      case 'new': await this.newTask(); break;
      case 'refresh': if (this.view?.visible) await this.refresh(); break;
      case 'open':
        try { await this.open(message.id, message.kind); } catch (error) { this.state.error = error.message; this.send(); }
        break;
    }
  }
  dispose() { this.disposed = true; this.stop(); this.view = undefined; }
}

function activate(context) {
  const provider = new TasksView(context);
  const open = async () => {
    await vscode.commands.executeCommand('workbench.view.extension.commandHelm');
    await vscode.commands.executeCommand('commandHelm.tasks.focus');
  };
  context.subscriptions.push(provider,
    vscode.window.registerWebviewViewProvider('commandHelm.tasks', provider),
    vscode.commands.registerCommand('commandHelm.openTasks', open),
    vscode.commands.registerCommand('commandHelm.newTask', async () => { await open(); await provider.newTask(true); }));
  if (vscode.workspace.getConfiguration('commandHelm.tasks').get('openOnStartup', false)) {
    open().catch(() => vscode.window.showErrorMessage('Command Helm Tasks could not open. Use Command Helm: Open Tasks.'));
  }
}
module.exports = { activate, TasksView };
