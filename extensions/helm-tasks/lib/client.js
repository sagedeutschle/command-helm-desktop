'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { X509Certificate, timingSafeEqual } = require('node:crypto');
const { taskFromJSON, validTarget } = require('./model');

function stateDirectory(platform = process.platform, home = os.homedir()) {
  if (platform === 'darwin') return path.join(home, 'Library/Application Support/Command Helm Remote');
  if (platform === 'linux') return path.join(home, '.local/state/command-helm-remote');
  throw new Error('Tasks supports macOS and Linux desktops.');
}

function bridgeURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Set a valid private HTTPS bridge URL in Command Helm settings.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Bridge URL must be HTTPS with no credentials, path, query or fragment.');
  }
  return url;
}

function pinCertificate(pem) {
  const expected = new X509Certificate(pem).raw;
  return (_hostname, certificate) => {
    if (!certificate.raw || certificate.raw.length !== expected.length || !timingSafeEqual(certificate.raw, expected)) {
      return new Error('Bridge certificate does not match the locally paired certificate.');
    }
    return undefined; // Exact certificate identity permits the configured private interface name.
  };
}

async function readPairing(directory) {
  try {
    const [token, certificate] = await Promise.all([
      fs.readFile(path.join(directory, 'phone-token'), 'utf8'),
      fs.readFile(path.join(directory, 'bridge-cert.pem'), 'utf8')
    ]);
    const bearer = token.trim();
    if (!bearer || /\s/.test(bearer)) throw new Error('invalid token');
    pinCertificate(certificate);
    return { token: bearer, certificate };
  } catch {
    throw new Error('Local bridge pairing is unavailable. Set up Command Helm Remote on this computer; its phone-token and bridge-cert.pem must already exist.');
  }
}

class BridgeClient {
  constructor({ url, directory = stateDirectory(), request = https.request, pairing = readPairing }) {
    this.url = bridgeURL(url); this.directory = directory; this.request = request; this.pairing = pairing;
  }
  async call(method, endpoint, body) {
    const { token, certificate } = await this.pairing(this.directory);
    const payload = body ? JSON.stringify(body) : undefined;
    return new Promise((resolve, reject) => {
      const request = this.request(new URL(endpoint, this.url), {
        method, agent: false, ca: certificate, rejectUnauthorized: true, minVersion: 'TLSv1.2',
        checkServerIdentity: pinCertificate(certificate),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(payload ? {
          'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload)
        } : {}) }
      }, response => {
        const chunks = []; let length = 0;
        response.on('data', chunk => {
          length += chunk.length;
          if (length > 32 * 1024 * 1024) request.destroy(new Error('oversize'));
          else chunks.push(chunk);
        });
        response.on('error', () => reject(new Error('Bridge response was interrupted. Retry using the same task ID.')));
        response.on('end', () => {
          if (response.statusCode !== 200) {
            const status = response.statusCode;
            reject(new Error(status === 401 ? 'Bridge authentication failed. Check this computer’s existing pairing.' :
              status === 409 ? 'This task ID already belongs to a different request. Refresh and inspect the existing task before changing it.' :
              `Bridge returned HTTP ${status || 'error'}. Submission may have arrived; retry keeps the same task ID.`));
            return;
          }
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch { reject(new Error('Bridge returned invalid JSON. Submission may have arrived; retry keeps the same task ID.')); }
        });
      });
      request.setTimeout(15000, () => request.destroy(new Error('timeout')));
      request.on('error', () => reject(new Error('Bridge connection or pinned TLS check failed. Submission may have arrived; retry keeps the same task ID.')));
      request.end(payload);
    });
  }
  async snapshot() {
    const value = await this.call('GET', '/v1/tasks');
    if (!Array.isArray(value.tasks) || !Array.isArray(value.workers)) throw new Error('Bridge returned an invalid task snapshot.');
    return { tasks: value.tasks.map(taskFromJSON), workers: value.workers.filter(w => w && validTarget(w.target) && Number.isFinite(w.seen)).map(w => ({ target: w.target, seen: w.seen, state: w.state, taskId: w.taskId })) };
  }
  async submit(payload) {
    const value = await this.call('POST', '/v1/tasks', payload);
    const task = taskFromJSON(value.task);
    if (task.id !== payload.id || task.target !== payload.target || task.prompt !== payload.prompt || task.workspace !== payload.workspace) {
      throw new Error('Bridge returned a different task. Retry keeps the same task ID.');
    }
    return task;
  }
}
module.exports = { BridgeClient, stateDirectory, bridgeURL, pinCertificate, readPairing };
