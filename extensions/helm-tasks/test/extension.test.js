'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const load = Module._load;
const vscode = { workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'bridgeUrl' ? 'https://127.0.0.1:8746' : fallback }) } };
Module._load = function (id, ...args) { return id === 'vscode' ? vscode : load.call(this, id, ...args); };
const { TasksView, activate } = require('../extension');
Module._load = load;
const draft = { target: 'spellbook', prompt: 'Build a literal $HOME fixture', workspace: '' };
const taskFor = payload => ({ ...payload, state: 'queued', createdAt: 1, updatedAt: 1, deliveryPath: '', report: '', error: '' });
function context(initial) {
  let saved = initial;
  return { globalState: { get: () => saved, update: async (_key, value) => { saved = value; } }, getSaved: () => saved };
}

test('provider persists before dispatch and recovers same ID after lost response and reactivation', async () => {
  const ctx = context();
  let first;
  const provider = new TasksView(ctx);
  provider.state.connected = true; provider.state.devices = [{ id: 'spellbook', name: 'Test laptop' }];
  provider.client = () => ({ submit: async payload => {
    assert.equal(ctx.getSaved().id, payload.id); first = payload;
    throw new Error('Lost response. Retry same request.');
  } });
  await provider.submit(draft);
  assert.equal(provider.state.pending.id, first.id);
  const recovered = new TasksView(ctx);
  recovered.client = () => ({ submit: async payload => { assert.deepEqual(payload, first); return taskFor(payload); } });
  await recovered.submit(draft);
  assert.equal(ctx.getSaved(), undefined);
  assert.equal(recovered.state.tasks[0].id, first.id);
  assert.equal(recovered.state.pending, undefined);
});

test('double click while persistence is pending cannot produce two submissions', async () => {
  const ctx = context(); let release; let sends = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const update = ctx.globalState.update;
  ctx.globalState.update = async (...args) => { if (args[1]) await gate; await update(...args); };
  const provider = new TasksView(ctx);
  provider.state.connected = true; provider.state.devices = [{ id: 'spellbook', name: 'Test laptop' }];
  provider.client = () => ({ submit: async payload => { sends++; return taskFor(payload); } });
  const first = provider.submit(draft);
  await provider.submit(draft); release(); await first;
  assert.equal(sends, 1);
});

test('hidden view does not poll and closing during refresh never schedules another poll', async () => {
  const provider = new TasksView(context()); let reads = 0; let finish;
  provider.view = { visible: false, webview: { postMessage() {} } };
  provider.client = () => ({ call: async () => ({ devices: [] }), snapshot: async () => { reads++; return new Promise(resolve => { finish = resolve; }); } });
  provider.visibility(); assert.equal(reads, 0);
  provider.view.visible = true;
  const refresh = provider.refresh(); assert.equal(reads, 1);
  provider.view = undefined;
  finish({ tasks: [], workers: [] }); await refresh;
  assert.equal(provider.timer, undefined);
});

test('disconnected snapshots retain history with stale connection status', async () => {
  const provider = new TasksView(context()); const task = taskFor({ id: 'saved', ...draft });
  provider.state.tasks = [task]; provider.state.refreshedAt = 50;
  provider.client = () => ({ call: async () => ({ devices: [] }), snapshot: async () => { throw new Error('Connection unavailable'); } });
  await provider.refresh();
  assert.equal(provider.state.connected, false);
  assert.equal(provider.state.refreshedAt, 50);
  assert.deepEqual(provider.state.tasks, [task]);
});

test('empty draft input is retained without sending or exposing host pairing', async () => {
  const provider = new TasksView(context());
  await provider.handle({ type: 'draft', draft: { target: 'spellbook', prompt: '', workspace: '' } });
  assert.equal(provider.state.draft.prompt, '');
  assert.ok(!JSON.stringify(provider.state).includes('phone-token'));
  assert.ok(!JSON.stringify(provider.state).includes('bridge-cert'));
});

test('project prefilling requires workspace trust; manual destination input remains available', async () => {
  const oldWorkspace = vscode.workspace;
  const folder = '/Users/fixture/an-untrusted-project';
  try {
    vscode.workspace = { ...oldWorkspace, isTrusted: false, workspaceFolders: [{ uri: { scheme: 'file', fsPath: folder } }] };
    const provider = new TasksView(context());
    provider.machine = 'spellbook';
    provider.state.devices = [{id:'spellbook',name:'Laptop'},{id:'spelltower',name:'Workstation'}];
    await provider.newTask(true);
    assert.deepEqual(provider.state.draft, { target: 'spellbook', prompt: '', workspace: '' });
    await provider.handle({ type: 'draft', draft: { target: 'spelltower', prompt: 'Explicit manual task', workspace: '/home/fixture/selected' } });
    assert.equal(provider.state.draft.workspace, '/home/fixture/selected');
    vscode.workspace.isTrusted = true;
    await provider.newTask(true);
    assert.equal(provider.state.draft.workspace, folder);
    await provider.newTask(false);
    assert.equal(provider.state.draft.workspace, '');
  } finally { vscode.workspace = oldWorkspace; }
});

test('dedicated-workspace startup flag opens the Tasks container and view', async () => {
  const calls = [];
  const oldWorkspace = vscode.workspace;
  vscode.workspace = { getConfiguration: () => ({ get: key => key === 'openOnStartup' }) };
  vscode.commands = { registerCommand: () => ({ dispose() {} }), executeCommand: async command => { calls.push(command); } };
  vscode.window = { registerWebviewViewProvider: () => ({ dispose() {} }), showErrorMessage: message => { throw new Error(message); } };
  const ctx = context(); ctx.subscriptions = [];
  activate(ctx);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['workbench.view.extension.commandHelm', 'commandHelm.tasks.focus']);
  ctx.subscriptions.forEach(item => item.dispose());
  vscode.workspace = oldWorkspace;
});


test('configured devices populate destinations and reject unlisted submissions before dispatch', async () => {
  const provider = new TasksView(context()); let sends = 0;
  provider.client = () => ({
    snapshot: async () => ({tasks:[],workers:[]}),
    call: async (method, endpoint) => { assert.equal(method,'GET'); assert.equal(endpoint,'/v1/devices'); return {devices:[{id:'analyst-laptop',name:'Analyst laptop',privateField:'not for view'}]}; },
    submit: async payload => { sends++; return taskFor(payload); }
  });
  await provider.refresh();
  assert.deepEqual(provider.state.devices,[{id:'analyst-laptop',name:'Analyst laptop'}]);
  await provider.submit({...draft,target:'unlisted'});
  assert.equal(sends,0); assert.equal(provider.state.pending,undefined);
  await provider.submit({...draft,target:'analyst-laptop'});
  assert.equal(sends,1); assert.equal(provider.state.tasks[0].target,'analyst-laptop');
});

test('invalid inventory marks connection stale without partially replacing history', async () => {
  const provider = new TasksView(context());
  provider.state.tasks = [taskFor({id:'saved',...draft})];
  provider.client = () => ({snapshot:async()=>({tasks:[],workers:[]}),call:async()=>({devices:[null]})});
  await provider.refresh();
  assert.equal(provider.state.connected,false);
  assert.equal(provider.state.tasks[0].id,'saved');
  assert.match(provider.state.error,/invalid device inventory/);
});

test('disposal during inventory refresh cannot restart polling', async () => {
  const provider = new TasksView(context()); let finish;
  provider.view={visible:true,webview:{postMessage(){throw new Error('disposed view');}}};
  provider.client=()=>({snapshot:async()=>({tasks:[],workers:[]}),call:()=>new Promise(resolve=>{finish=resolve;})});
  const refreshing=provider.refresh(); provider.dispose(); finish({devices:[]}); await refreshing;
  assert.equal(provider.timer,undefined); assert.equal(provider.state.connected,false);
});
