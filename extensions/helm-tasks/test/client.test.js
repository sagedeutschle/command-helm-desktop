'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const { X509Certificate } = require('node:crypto');
const { BridgeClient, stateDirectory, bridgeURL, pinCertificate, readPairing } = require('../lib/client');
let directory, cert, key;
const token = 'fixture-private-token-never-real';
const task = { id: 'test-id', target: 'spellbook', prompt: 'literal $HOME; $(false)\n`pwd`', workspace: '', state: 'queued', createdAt: 1, updatedAt: 1, report: '', deliveryPath: '', error: '' };
test.before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'helm-extension-test-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(directory, 'key.pem'), '-out', path.join(directory, 'bridge-cert.pem'), '-days', '1', '-subj', '/CN=fixture-private-bridge'], { stdio: 'ignore' });
  cert = await fs.readFile(path.join(directory, 'bridge-cert.pem'), 'utf8');
  key = await fs.readFile(path.join(directory, 'key.pem'), 'utf8');
  await fs.writeFile(path.join(directory, 'phone-token'), token, { mode: 0o600 });
});
test.after(async () => { await fs.rm(directory, { recursive: true, force: true }); });
async function server(handler) {
  const instance = https.createServer({ key, cert }, handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  return { instance, url: `https://127.0.0.1:${instance.address().port}` };
}

test('only fixed platform pairing directories and credential-free HTTPS origins are accepted', () => {
  assert.equal(stateDirectory('darwin', '/home/test'), '/home/test/Library/Application Support/Command Helm Remote');
  assert.equal(stateDirectory('linux', '/home/test'), '/home/test/.local/state/command-helm-remote');
  assert.throws(() => stateDirectory('win32', '/home/test'));
  for (const url of ['http://127.0.0.1:8746', 'https://user:password@host', 'https://host/path', 'https://host/?token=x', 'https://host/#secret']) assert.throws(() => bridgeURL(url));
});

test('exact certificate pin accepts only paired raw certificate', () => {
  const check = pinCertificate(cert);
  assert.equal(check('any-configured-private-interface', { raw: new X509Certificate(cert).raw }), undefined);
  assert.ok(check('same-host', { raw: Buffer.from('different certificate') }) instanceof Error);
});

test('pairing load errors are generic and do not echo token or file contents', async () => {
  const pairing = await readPairing(directory);
  assert.equal(pairing.token, token);
  await assert.rejects(readPairing(path.join(directory, 'missing')), error => !error.message.includes(directory) && !error.message.includes(token));
});

test('real pinned HTTPS transports literal JSON and bearer; sanitizes response objects', async t => {
  let received;
  const { instance, url } = await server((req, res) => {
    assert.equal(req.url, '/v1/tasks');
    assert.equal(req.headers.authorization, 'Bearer ' + token);
    let body = ''; req.on('data', chunk => { body += chunk; });
    req.on('end', () => { received = JSON.parse(body); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ task: { ...task, secretUnexpectedField: token } })); });
  });
  t.after(() => new Promise(resolve => instance.close(resolve)));
  const client = new BridgeClient({ url, directory });
  const payload = { id: task.id, target: task.target, prompt: task.prompt, workspace: task.workspace };
  const result = await client.submit(payload);
  assert.deepEqual(received, payload);
  assert.ok(!JSON.stringify(result).includes(token));
});

test('lost HTTPS response followed by retry sends the identical ID and input', async t => {
  const inputs = [];
  const { instance, url } = await server((req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => {
      inputs.push(JSON.parse(body));
      if (inputs.length === 1) { req.socket.destroy(); return; }
      res.end(JSON.stringify({ task }));
    });
  });
  t.after(() => new Promise(resolve => instance.close(resolve)));
  const client = new BridgeClient({ url, directory });
  const payload = { id: task.id, target: task.target, prompt: task.prompt, workspace: '' };
  await assert.rejects(client.submit(payload), /same task ID/);
  assert.equal((await client.submit(payload)).id, task.id);
  assert.deepEqual(inputs, [payload, payload]);
});

test('HTTP authorization/conflict errors never expose response body', async t => {
  let status = 401;
  const { instance, url } = await server((_req, res) => { res.writeHead(status); res.end(token); });
  t.after(() => new Promise(resolve => instance.close(resolve)));
  const client = new BridgeClient({ url, directory });
  await assert.rejects(client.snapshot(), error => /authentication/.test(error.message) && !error.message.includes(token));
  status = 409;
  await assert.rejects(client.snapshot(), /different request/);
});

test('valid history larger than two MiB remains readable', async t => {
  const tasks = Array.from({ length: 100 }, (_, i) => ({ ...task, id: `task-${i}`, report: 'a'.repeat(24000) }));
  const body = JSON.stringify({ tasks, workers: [] });
  assert.ok(Buffer.byteLength(body) > 2 * 1024 * 1024);
  const { instance, url } = await server((_req, res) => res.end(body));
  t.after(() => new Promise(resolve => instance.close(resolve)));
  const value = await new BridgeClient({ url, directory }).snapshot();
  assert.equal(value.tasks.length, 100);
  assert.equal(value.tasks[99].report.length, 24000);
});

test('oversize history is rejected without exposing response content', async t => {
  const body = 'a'.repeat(33 * 1024 * 1024);
  const { instance, url } = await server((_req, res) => res.end(body));
  t.after(() => new Promise(resolve => instance.close(resolve)));
  await assert.rejects(new BridgeClient({ url, directory }).snapshot(), /Bridge (connection|response)/);
});
