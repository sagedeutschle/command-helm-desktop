'use strict';
const { randomBytes } = require('node:crypto');
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function destinationSelection(devices, requested) {
  const options = devices.map(device => ({id:device.id, name:device.name, unavailable:false}));
  const target = requested || options[0]?.id || '';
  const eligible = options.some(device => device.id === target);
  if (target && !eligible) options.push({id:target, name:target + ' · unavailable', unavailable:true});
  return {target, options, eligible};
}
function html() {
  const nonce = randomBytes(24).toString('base64');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'none'; form-action 'none'; base-uri 'none';">
<title>Command Helm Tasks</title><style nonce="${nonce}">
body{font:var(--vscode-font-size) var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-sideBar-background);padding:12px;line-height:1.5}
h1{font-size:19px;margin:0 0 3px;border-left:3px solid #d34747;padding-left:9px}h2{font-size:14px;margin-top:22px}p{margin:5px 0 13px}.muted{color:var(--vscode-descriptionForeground)}
label{display:block;margin-top:12px}input,textarea,select,button{box-sizing:border-box;font:inherit}input,textarea,select{width:100%;margin-top:4px;padding:7px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent)}textarea{min-height:110px;resize:vertical}
button{padding:6px 9px;margin:9px 5px 0 0;cursor:pointer;background:#a82f39;color:#fff;border:1px solid transparent}button:hover{background:#ca3d49}button:focus-visible,input:focus,select:focus,textarea:focus{outline:1px solid var(--vscode-focusBorder)}button:disabled{opacity:.5;cursor:default}
.secondary{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}.error{color:var(--vscode-errorForeground);white-space:pre-wrap}.task{display:block;width:100%;text-align:left;margin-top:7px;overflow-wrap:anywhere}.task[aria-pressed="true"]{border-color:#d34747}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:var(--vscode-editor-font-size) var(--vscode-editor-font-family);padding:8px;background:var(--vscode-textCodeBlock-background)}#path,#pending{overflow-wrap:anywhere}.status{border-top:1px solid var(--vscode-panel-border);padding-top:10px}small{display:block}
</style></head><body><h1>Command Helm</h1><p class="muted">Tasks · Codex deliveries</p>
<div id="connection" class="status" role="status">Connecting to the private bridge…</div><div id="workers" class="muted"></div><p id="error" class="error" role="alert"></p>
<h2>New task</h2><form id="form"><label>Destination<select id="target"><option value="">Connect to load your devices</option></select></label>
<label>Task description<textarea id="prompt" maxlength="8000" placeholder="Describe the completed work you want."></textarea></label>
<label>Existing project folder (optional)<input id="workspace" maxlength="4096" placeholder="/absolute/path/on/destination" autocomplete="off"></label>
<small class="muted">Leave empty to use the bridge’s configured workspace and delivery location. Existing folders belong to the selected destination.</small>
<p id="pending" class="muted"></p><button id="submit" type="submit">Send task</button><button id="new" type="button" class="secondary">New task</button></form>
<h2>History <button id="refresh" class="secondary" type="button">Refresh</button></h2><div id="history"></div>
<section id="detail" hidden><h2 id="detail-title"></h2><p id="times" class="muted"></p><pre id="description"></pre><p id="path"></p><p id="task-error" class="error"></p><button id="open-folder" type="button">Open folder</button><button id="open-report" type="button" class="secondary">Open REPORT.md</button><h2>Report</h2><pre id="report"></pre></section>
<script nonce="${nonce}">
'use strict';
${destinationSelection.toString()}
const vscode=acquireVsCodeApi(); const $=id=>document.getElementById(id);let state={tasks:[]};let selected='';let draftReady=false;
function draft(){return{target:$('target').value,prompt:$('prompt').value,workspace:$('workspace').value};}
function message(type,extra={}){vscode.postMessage({type,...extra});}
function time(value){return new Date(value*1000).toLocaleString();}
function detail(){const task=state.tasks.find(t=>t.id===selected);$('detail').hidden=!task;if(!task)return;
$('detail-title').textContent=task.target+' · '+task.state;$('times').textContent='Created '+time(task.createdAt)+' · Updated '+time(task.updatedAt);
$('description').textContent=task.prompt;$('path').textContent='Delivery: '+(task.deliveryPath||task.workspace||'Pending assignment');$('task-error').textContent=task.error;
$('report').textContent=task.report||(task.state==='queued'?'Waiting for the destination worker.':task.state==='running'?'Work is running. No final report yet.':'No report returned.');
const local=task.target===state.localTarget&&!!(task.deliveryPath||task.workspace);$('open-folder').disabled=!local;$('open-report').disabled=!local;}
function render(){ $('connection').textContent=state.connected?'Connected · refreshed '+time(state.refreshedAt):state.refreshedAt?'Disconnected · showing snapshot from '+time(state.refreshedAt):'Disconnected · no task snapshot';
$('error').textContent=state.error||'';$('workers').textContent=(state.workers||[]).map(w=>w.target+': '+(Date.now()/1000-w.seen>90?'offline or stale (last seen '+time(w.seen)+')':w.state)).join(' · ');
const previous=$('target').value;
const selection=destinationSelection(state.devices||[],state.pending?.target||(draftReady?previous:state.draft?.target||state.localTarget)||'');
$('target').replaceChildren();
for(const d of selection.options){const o=document.createElement('option');o.value=d.id;o.textContent=d.name+(d.unavailable?'':' · '+d.id);o.disabled=d.unavailable;$('target').appendChild(o);}
$('target').value=selection.target;
if(state.pending){$('target').value=state.pending.target;$('prompt').value=state.pending.prompt;$('workspace').value=state.pending.workspace;draftReady=true;}
else if(!draftReady){const d=state.draft||{};$('target').value=selection.target;$('prompt').value=d.prompt||'';$('workspace').value=d.workspace||'';draftReady=true;}
for(const id of ['target','prompt','workspace'])$(id).disabled=!!state.pending||state.submitting;
$('pending').textContent=state.pending?'Request '+state.pending.id+'. Retry preserves this ID; the request may already be queued.':'';
$('submit').disabled=state.submitting||(!state.pending&&(!state.connected||!selection.eligible));$('submit').textContent=state.submitting?'Sending…':state.pending?'Retry same task':'Send task';$('new').disabled=state.submitting;
$('history').replaceChildren();for(const task of state.tasks){const b=document.createElement('button');b.type='button';b.className='task secondary';b.setAttribute('aria-pressed',String(task.id===selected));b.textContent=task.target+' · '+task.state+' · '+task.prompt.slice(0,100);b.onclick=()=>{selected=task.id;render();};$('history').appendChild(b);}
if(!state.tasks.length)$('history').textContent='No tasks in the current snapshot.';detail();}
window.addEventListener('message',event=>{const m=event.data;if(m.type==='state'){state=m.state;if(m.resetDraft)draftReady=false;if(m.select)selected=m.select;render();}});
$('form').addEventListener('submit',event=>{event.preventDefault();message('submit',{draft:draft()});});
for(const id of ['target','prompt','workspace'])$(id).addEventListener('input',()=>message('draft',{draft:draft()}));
$('new').onclick=()=>message('new');$('refresh').onclick=()=>message('refresh');$('open-folder').onclick=()=>message('open',{id:selected,kind:'workspace'});$('open-report').onclick=()=>message('open',{id:selected,kind:'report'});message('ready');
</script></body></html>`;
}
module.exports = { html, escapeHTML, destinationSelection };
