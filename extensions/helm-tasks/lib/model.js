'use strict';
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const validTarget = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value);
const STATES = ['queued', 'running', 'completed', 'failed', 'interrupted'];

function devicesFromJSON(inventory) {
  if (!inventory || !Array.isArray(inventory.devices) || inventory.devices.length > 64) throw new Error('Bridge returned an invalid device inventory.');
  const ids = new Set();
  return inventory.devices.map(device => {
    if (!device || !validTarget(device.id) || ids.has(device.id) || typeof device.name !== 'string' || !device.name.trim() || device.name.length > 120 || /[\x00-\x1f]/.test(device.name)) {
      throw new Error('Bridge returned an invalid device inventory.');
    }
    ids.add(device.id);
    return { id: device.id, name: device.name };
  });
}

function validateDraft(draft) {
  if (!draft || !validTarget(draft.target)) throw new Error('Choose a configured device.');
  if (typeof draft.prompt !== 'string' || !draft.prompt.trim()) throw new Error('Enter a task description.');
  if (Array.from(draft.prompt).length > 8000 || draft.prompt.includes('\0')) throw new Error('Task description must be at most 8,000 characters and contain no null characters.');
  const workspace = draft.workspace === undefined ? '' : draft.workspace;
  if (typeof workspace !== 'string' || Array.from(workspace).length > 4096 || workspace.includes('\0') || (workspace && !path.posix.isAbsolute(workspace))) {
    throw new Error('Project folder must be an absolute folder path on the destination, or empty.');
  }
  return { target: draft.target, prompt: draft.prompt, workspace };
}

function prepareSubmission(draft, pending, uuid = randomUUID) {
  const value = validateDraft(draft);
  if (pending) {
    if (value.target !== pending.target || value.prompt !== pending.prompt || value.workspace !== pending.workspace) {
      throw new Error('Retry the pending task first, or explicitly start another task.');
    }
    return pending;
  }
  return { id: uuid(), ...value };
}

function taskFromJSON(task) {
  if (!task || typeof task.id !== 'string' || !validTarget(task.target) || !STATES.includes(task.state)) {
    throw new Error('Bridge returned an invalid task.');
  }
  for (const key of ['prompt', 'workspace', 'deliveryPath', 'report', 'error']) {
    if (typeof task[key] !== 'string') throw new Error('Bridge returned an invalid task.');
  }
  if (!Number.isFinite(task.createdAt) || !Number.isFinite(task.updatedAt)) throw new Error('Bridge returned invalid task times.');
  return { id: task.id, target: task.target, state: task.state, prompt: task.prompt, workspace: task.workspace,
    deliveryPath: task.deliveryPath, report: Array.from(task.report).slice(0, 24000).join(''), error: task.error, createdAt: task.createdAt, updatedAt: task.updatedAt };
}

function localTarget(deviceId = '') { return validTarget(deviceId) ? deviceId : null; }

function localPath(task, kind, machine) {
  if (!task || task.target !== machine || !['workspace', 'report'].includes(kind)) return null;
  const folder = task.deliveryPath || task.workspace;
  if (!folder || !path.posix.isAbsolute(folder) || folder.includes('\0')) return null;
  return kind === 'report' ? path.join(folder, 'REPORT.md') : folder;
}

module.exports = { validTarget, STATES, devicesFromJSON, validateDraft, prepareSubmission, taskFromJSON, localTarget, localPath };
