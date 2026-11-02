'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { devicesFromJSON, prepareSubmission, validateDraft, taskFromJSON, localTarget, localPath } = require('../lib/model');
const { html, escapeHTML, destinationSelection } = require('../lib/webview');
const fixture = { id: 'fake-id', target: 'spellbook', prompt: 'Do work', workspace: '', state: 'queued', createdAt: 10, updatedAt: 11, deliveryPath: '', report: '', error: '' };

test('literal prompts and folder names are carried unchanged, including shell metacharacters', () => {
  const draft = { target: 'spelltower', prompt: 'Write $HOME; $(touch /tmp/no) `uname`\n</script><script>alert(1)</script>', workspace: '/home/example/a project;$(echo no)' };
  assert.deepEqual(prepareSubmission(draft, undefined, () => 'id'), { id: 'id', ...draft });
  assert.equal(validateDraft({ target: 'spellbook', prompt: '  Keep my spacing\n', workspace: '' }).prompt, '  Keep my spacing\n');
});

test('lost-response retry preserves UUID and immutable payload; edited retry is rejected', () => {
  const draft = { target: 'spellbook', prompt: 'Test', workspace: '' };
  const first = prepareSubmission(draft, null, () => 'first');
  assert.strictEqual(prepareSubmission(draft, first, () => 'second'), first);
  assert.throws(() => prepareSubmission({ ...draft, prompt: 'Changed' }, first), /Retry the pending/);
});

test('input validates destination, prompt and absolute folder without silently normalizing', () => {
  const good = { target: 'spellbook', prompt: 'Test', workspace: '' };
  for (const draft of [{ ...good, target: '../other' }, { ...good, prompt: ' ' }, { ...good, prompt: 'x'.repeat(8001) }, { ...good, workspace: '~/folder' }, { ...good, workspace: 'relative' }, { ...good, workspace: '/bad\0path' }, { ...good, workspace: '/'+'x'.repeat(4096) }]) {
    assert.throws(() => validateDraft(draft));
  }
  assert.deepEqual(validateDraft({ target: 'spellbook', prompt: 'Test' }), good);
});

test('each contract state is accepted and unknown states cannot imply success', () => {
  for (const state of ['queued', 'running', 'completed', 'failed', 'interrupted']) assert.equal(taskFromJSON({ ...fixture, state }).state, state);
  assert.throws(() => taskFromJSON({ ...fixture, state: 'success' }), /invalid task/);
  assert.throws(() => taskFromJSON({ ...fixture, report: null }), /invalid task/);
  assert.equal(taskFromJSON({ ...fixture, report: 'x'.repeat(25000) }).report.length, 24000);
});

test('local open requires verified host and matching destination plus absolute path', () => {
  assert.equal(localTarget('my-laptop'), 'my-laptop');
  assert.equal(localTarget(''), null);
  assert.equal(localTarget('../invalid'), null);
  const task = { ...fixture, deliveryPath: '/Users/example/CommandHelm/Deliveries/id' };
  assert.equal(localPath(task, 'report', 'spellbook'), task.deliveryPath + '/REPORT.md');
  assert.equal(localPath(task, 'workspace', 'spelltower'), null);
  assert.equal(localPath({ ...task, deliveryPath: 'relative' }, 'workspace', 'spellbook'), null);
  assert.equal(localPath(task, 'other', 'spellbook'), null);
});

test('webview has nonce CSP, no network access, and renders task content with textContent', () => {
  const page = html();
  const nonce = page.match(/script-src 'nonce-([^']+)'/)[1];
  assert.ok(page.includes(`<script nonce="${nonce}">`));
  assert.ok(page.includes("connect-src 'none'"));
  assert.ok(page.includes("default-src 'none'"));
  assert.ok(!page.includes('innerHTML'));
  assert.ok(page.includes("$('report').textContent=task.report"));
  new vm.Script(page.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1]);
  assert.equal(escapeHTML('</script> & "\''), '&lt;/script&gt; &amp; &quot;&#39;');
  assert.notEqual(html(), page);
});

test('arbitrary device IDs survive task parsing and submission', () => {
  assert.equal(taskFromJSON({...fixture,target:'lab-workstation'}).target,'lab-workstation');
  assert.equal(prepareSubmission({target:'lab-workstation',prompt:'Check project',workspace:''},null,()=> 'id').target,'lab-workstation');
});


test('device registry rejects duplicate, malformed and unbounded identities', () => {
  for (const devices of [[null],[{id:'../host',name:'Host'}],[{id:'host',name:'Host'},{id:'host',name:'Other'}],[{id:'host',name:''}],Array.from({length:65},(_,i)=>({id:'host'+i,name:'Host'}))]) {
    assert.throws(()=>devicesFromJSON({devices}),/invalid device inventory/);
  }
  assert.deepEqual(devicesFromJSON({devices:[{id:'my-lab',name:'My lab',capabilities:{tasks:true}}]}),[{id:'my-lab',name:'My lab'}]);
});


test('refresh never redirects a selected destination when it disappears or the inventory reorders', () => {
  const devices=[{id:'first',name:'First'},{id:'chosen',name:'Chosen'}];
  assert.equal(destinationSelection(devices,'chosen').target,'chosen');
  const missing=destinationSelection([{id:'first',name:'First'}],'chosen');
  assert.equal(missing.target,'chosen'); assert.equal(missing.eligible,false);
  assert.equal(missing.options.at(-1).unavailable,true);
  assert.equal(destinationSelection([...devices].reverse(),'first').target,'first');
  assert.equal(destinationSelection([],'chosen').target,'chosen');
  assert.equal(destinationSelection(devices,'').target,'first');
});
