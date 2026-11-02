'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWelcome } = require('../extension');

const builtins = ['workbench.action.files.openFolder', 'workbench.action.files.newUntitledFile', 'workbench.action.terminal.new'];
function emitter() {
  const listeners = new Set();
  return {
    event(listener) { listeners.add(listener); return { dispose() { listeners.delete(listener); } }; },
    async fire(value) { await Promise.all([...listeners].map(listener => listener(value))); },
    get size() { return listeners.size; }
  };
}

function fixture(options = {}) {
  const messages = emitter();
  const panelDisposals = emitter();
  const trust = emitter();
  const extensions = emitter();
  const folders = emitter();
  const commands = new Map();
  const calls = [];
  const panels = [];
  const errors = [];
  const external = [];
  const storage = options.storage || new Map();
  const context = { subscriptions: [], globalState: {
    get(key, fallback) { return storage.has(key) ? storage.get(key) : fallback; },
    async update(key, value) { storage.set(key, value); }
  } };
  const settings = { enabled: options.startup || false };
  const vscode = {
    ViewColumn: { One: 1 },
    Uri: { parse(value) { return value; } },
    ['env']: { async openExternal(uri) { external.push(uri); return true; } },
    workspace: {
      name: options.name,
      isTrusted: options.trusted !== false,
      getConfiguration() { return { get() { return settings.enabled; } }; },
      onDidGrantWorkspaceTrust: trust.event,
      onDidChangeWorkspaceFolders: folders.event
    },
    extensions: {
      getExtension(id) { assert.equal(id, 'command-helm.helm-tasks'); return options.tasks ? {} : undefined; },
      onDidChange: extensions.event
    },
    commands: {
      registerCommand(id, callback) { commands.set(id, callback); return { dispose() { commands.delete(id); } }; },
      async getCommands() {
        if (options.discoveryFailure) throw new Error('discovery unavailable');
        return options.commandIds || [...builtins, ...(options.tasks ? ['commandHelm.openTasks'] : [])];
      },
      async executeCommand(...args) {
        calls.push(args);
        if (options.commandFailure) throw new Error('A private host error <script>');
      }
    },
    window: {
      async showErrorMessage(message) { errors.push(message); },
      createWebviewPanel(id, title, column, config) {
        const panel = {
          id, title, column, config, reveals: 0, disposed: false,
          reveal() { this.reveals++; },
          dispose() { this.disposed = true; return panelDisposals.fire(); },
          onDidDispose: panelDisposals.event,
          webview: { html: '', onDidReceiveMessage: messages.event }
        };
        panels.push(panel);
        return panel;
      }
    }
  };
  const controller = createWelcome(vscode, context);
  return { controller, vscode, context, calls, panels, errors, external, storage, settings, commands, options,
    messages, panelDisposals, trust, extensions, folders,
    async open() { await controller.ready; await commands.get('commandHelm.welcome.open')(); return panels.at(-1); },
    dispose() { for (const subscription of context.subscriptions) subscription.dispose(); }
  };
}

test('empty editor opens manually; hostile labels are escaped with a restrictive nonce CSP', async () => {
  const f = fixture({ name: '<img src=x onerror="attack()"> & \'<script>' });
  await f.controller.ready;
  assert.equal(f.panels.length, 0);
  const panel = await f.open();
  assert.match(panel.webview.html, /&lt;img src=x onerror=&quot;attack\(\)&quot;&gt; &amp; &#39;&lt;script&gt;/);
  assert.doesNotMatch(panel.webview.html, /<img src=x/);
  assert.match(panel.webview.html, /default-src 'none'/);
  assert.match(panel.webview.html, /connect-src 'none'/);
  const nonce = panel.webview.html.match(/script-src 'nonce-([^']+)'/)[1];
  assert.ok(nonce.length >= 32);
  assert.match(panel.webview.html, new RegExp(`<script nonce="${nonce.replace(/[+]/g, '\\+')}">`));
  assert.equal(panel.config.enableCommandUris, false);
  assert.deepEqual(panel.config.localResourceRoots, []);
  assert.match(panel.webview.html, /role="status"/);
  f.dispose();
});

test('Restricted Mode allows folder and file actions, and rejects forged terminal actions', async () => {
  const f = fixture({ trusted: false });
  const panel = await f.open();
  assert.match(panel.webview.html, /data-action="terminal"[^>]* disabled/);
  await f.messages.fire({ action: 'terminal' });
  assert.deepEqual(f.calls, []);
  assert.match(panel.webview.html, /Terminal requires a trusted workspace/);
  await f.messages.fire({ action: 'openFolder' });
  await f.messages.fire({ action: 'newFile' });
  assert.deepEqual(f.calls, [[builtins[0]], [builtins[1]]]);
  f.vscode.workspace.isTrusted = true;
  await f.trust.fire();
  await f.messages.fire({ action: 'terminal' });
  assert.deepEqual(f.calls.at(-1), [builtins[2]]);
  f.dispose();
});

test('trust is rechecked after rendering before terminal execution', async () => {
  const f = fixture();
  await f.open();
  f.vscode.workspace.isTrusted = false;
  await f.messages.fire({ action: 'terminal' });
  assert.equal(f.calls.length, 0);
  f.dispose();
});

test('missing Tasks and discovered commands remain unavailable with honest setup text', async () => {
  const f = fixture({ commandIds: [...builtins, 'commandHelm.openTasks'] });
  const panel = await f.open();
  assert.doesNotMatch(panel.webview.html, /data-action="tasks"/);
  assert.match(panel.webview.html, /Remote delivery requires the Command Helm Tasks companion and a paired private bridge/);
  await f.messages.fire({ action: 'tasks' });
  assert.deepEqual(f.calls, []);
  f.options.tasks = true;
  f.options.commandIds = builtins;
  await f.extensions.fire();
  assert.match(panel.webview.html, /data-action="tasks"[^>]* disabled/);
  f.options.commandIds = [...builtins, 'commandHelm.openTasks'];
  await f.messages.fire({ action: 'refresh' });
  await f.messages.fire({ action: 'tasks' });
  assert.deepEqual(f.calls, [['commandHelm.openTasks']]);
  assert.match(panel.webview.html, /does not check bridge connectivity or pairing/);
  f.dispose();
});

test('allowlist rejects arbitrary commands and arguments; valid actions pass no supplied data', async () => {
  const f = fixture();
  await f.open();
  for (const message of [null, {}, { action: '__proto__' }, { action: 'workbench.action.terminal.new' }, { action: 'newFile', args: ['bad'] }]) {
    await f.messages.fire(message);
  }
  assert.deepEqual(f.calls, []);
  await f.messages.fire({ action: 'newFile' });
  assert.deepEqual(f.calls, [[builtins[1]]]);
  f.dispose();
});

test('command failures produce useful visible status and settle the event callback', async () => {
  const f = fixture({ commandFailure: true });
  const panel = await f.open();
  await f.messages.fire({ action: 'newFile' });
  assert.match(panel.webview.html, /Action failed. Refresh setup and try again/);
  assert.equal(f.errors.length, 1);
  assert.doesNotMatch(panel.webview.html, /A private host error/);
  f.options.commandFailure = false;
  await f.messages.fire({ action: 'refresh' });
  assert.doesNotMatch(panel.webview.html, /Action failed/);
  f.dispose();
});

test('command-discovery failure renders disabled actions and recovers on explicit refresh', async () => {
  const f = fixture({ discoveryFailure: true });
  const panel = await f.open();
  assert.match(panel.webview.html, /Could not check editor commands/);
  await f.messages.fire({ action: 'newFile' });
  assert.equal(f.calls.length, 0);
  f.options.discoveryFailure = false;
  await f.messages.fire({ action: 'refresh' });
  await f.messages.fire({ action: 'newFile' });
  assert.equal(f.calls.length, 1);
  f.dispose();
});

test('lifecycle reuses one panel, permits reopening after close and disposes all listeners', async () => {
  const f = fixture();
  const panel = await f.open();
  await f.controller.open();
  assert.equal(f.panels.length, 1);
  assert.equal(panel.reveals, 1);
  await panel.dispose();
  assert.equal(f.messages.size, 0);
  assert.equal(f.panelDisposals.size, 0);
  const second = await f.open();
  assert.equal(f.panels.length, 2);
  f.dispose();
  assert.equal(second.disposed, true);
  assert.equal(f.messages.size + f.panelDisposals.size + f.trust.size + f.extensions.size + f.folders.size, 0);
  assert.equal(f.commands.size, 0);
  await f.controller.open();
  assert.equal(f.panels.length, 2);
});

test('startup respects the configured preference and opens once per profile/version', async () => {
  const storage = new Map();
  const first = fixture({ startup: true, storage });
  await first.controller.ready;
  assert.equal(first.panels.length, 1);
  first.dispose();
  const next = fixture({ startup: true, storage });
  await next.controller.ready;
  assert.equal(next.panels.length, 0);
  await next.open();
  assert.equal(next.panels.length, 1);
  next.dispose();
  const separateProfile = fixture({ startup: true });
  await separateProfile.controller.ready;
  assert.equal(separateProfile.panels.length, 1);
  separateProfile.dispose();
});

test('disposal during asynchronous discovery never writes into a closed panel', async () => {
  const f = fixture();
  await f.controller.ready;
  let resolveCommands;
  f.vscode.commands.getCommands = () => new Promise(resolve => { resolveCommands = resolve; });
  const opening = f.controller.open();
  const panel = f.panels[0];
  f.dispose();
  resolveCommands(builtins);
  await opening;
  assert.equal(panel.disposed, true);
  assert.equal(panel.webview.html, '');
  assert.equal(f.errors.length, 0);
});

test('startup storage failure is visible without an unhandled rejection', async () => {
  const f = fixture();
  await f.controller.ready;
  f.dispose();
  const context = { subscriptions: [], globalState: { get() { return false; }, async update() { throw new Error('storage unavailable'); } } };
  f.settings.enabled = true;
  const controller = createWelcome(f.vscode, context);
  await controller.ready;
  assert.match(f.panels.at(-1).webview.html, /Startup welcome failed/);
  assert.equal(f.errors.length, 1);
  for (const subscription of context.subscriptions) subscription.dispose();
});

test('explicit packaging list contains only readable regular extension files', () => {
  const root = path.resolve(__dirname, '..');
  const files = require('../package-files.json');
  assert.equal(files.length, new Set(files).size);
  for (const file of files) {
    assert.ok(!path.isAbsolute(file) && !file.split('/').includes('..'));
    assert.ok(fs.lstatSync(path.join(root, file)).isFile());
    assert.ok(!file.startsWith('test/'));
  }
  const manifest = require('../package.json');
  assert.equal(manifest.contributes.configuration.properties['commandHelm.welcome.openOnStartup'].default, true);
  assert.equal(manifest.capabilities.untrustedWorkspaces.supported, true);
});


test('setup and release buttons open only their fixed URLs and reject supplied destinations', async () => {
  const f=fixture({trusted:false}); await f.open();
  await f.messages.fire({action:'setup',url:'https://untrusted.invalid'});
  assert.deepEqual(f.external,[]);
  await f.messages.fire({action:'setup'}); await f.messages.fire({action:'releases'});
  assert.deepEqual(f.external,[
    'https://github.com/sagedeutschle/command-helm-desktop/blob/main/docs/CONNECT.md',
    'https://github.com/sagedeutschle/command-helm-desktop/releases'
  ]);
  assert.deepEqual(f.calls,[]); f.dispose();
});
