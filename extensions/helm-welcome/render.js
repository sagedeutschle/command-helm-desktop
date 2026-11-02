'use strict';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function render(state, nonce) {
  const escapedNonce = escapeHtml(nonce);
  const button = (action, title, detail, primary = false) => {
    if (!state.available[action] && !(action === 'terminal' && !state.trusted)) detail = 'Editor command unavailable. Refresh setup to check again.';
    return `<button type="button" data-action="${action}" class="launch${primary ? ' primary' : ''}"${state.available[action] ? '' : ' disabled'}><span>${title}</span><small>${detail}</small></button>`;
  };
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${escapedNonce}'; style-src 'nonce-${escapedNonce}'; img-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none';">
<title>Command Desk</title><style nonce="${escapedNonce}">
:root { color-scheme: dark; --desk:#242328; --paper:#f4f1f2; --muted:#ccc5c8; --red:#bc3045; --rule:#68616a; }
* { box-sizing:border-box; } body { margin:0; background:var(--desk); color:var(--paper); font-family:var(--vscode-font-family,system-ui,sans-serif); font-size:14px; line-height:1.6; }
main { max-width:1000px; padding:clamp(24px,6vw,72px); margin:auto; } header { border-left:6px solid var(--red); padding-left:24px; margin:0 0 48px; }
.brand { margin:0 0 12px; font-size:15px; font-weight:600; } h1 { font-size:clamp(36px,5vw,58px); letter-spacing:-.035em; line-height:1.08; margin:0 0 18px; font-weight:650; } p { margin:0 0 14px; max-width:65ch; }
.intro,.hint { color:var(--muted); } .layout { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:48px; } h2 { font-size:19px; margin:0 0 18px; font-weight:600; }
.actions { display:grid; gap:12px; } button { font:inherit; cursor:pointer; border:1px solid var(--rule); border-radius:4px; background:#302e34; color:var(--paper); padding:10px 14px; text-align:left; }
button:hover:enabled { border-color:var(--paper); background:#3a373f; } button:focus-visible { outline:3px solid var(--vscode-focusBorder,#f6bec7); outline-offset:4px; } button:disabled { cursor:default; color:#b9b2b6; background:#29272d; border-style:dashed; }
.launch { display:block; width:100%; padding:14px 18px; } .launch span { display:block; font-size:16px; font-weight:600; } .launch small { display:block; font-size:12px; margin-top:2px; color:var(--muted); }
.primary { background:#9f2639; border-color:#e17787; } .primary:hover:enabled { background:#b32e43; } .primary small { color:var(--paper); }
dl { margin:0; } dt { color:var(--muted); font-size:12px; margin-top:20px; } dt:first-child { margin-top:0; } dd { margin:2px 0 0; overflow-wrap:anywhere; } .setup { border-top:1px solid var(--rule); padding-top:18px; }
.refresh { margin:22px 0 12px; } .hint { font-size:12px; margin-top:18px; } .status { min-height:1.6em; margin:28px 0 0; border-left:3px solid var(--red); padding-left:12px; } .status:empty { border:0; }
footer { border-top:1px solid var(--rule); padding-top:16px; margin-top:42px; color:var(--muted); font-size:12px; }
@media(max-width:660px) { .layout { grid-template-columns:1fr; gap:32px; } header { margin-bottom:32px; } }
@media(forced-colors:active) { button,.primary { border:1px solid ButtonText; } header,.status { border-color:CanvasText; } button:focus-visible { outline-color:Highlight; } }
</style></head><body><main>
<header><p class="brand">Command Helm</p><h1>Command Desk</h1><p class="intro">Start with a folder or a blank file. Your tools are ready when you choose to use them.</p></header>
<div class="layout"><section aria-labelledby="start"><h2 id="start">Start working</h2><div class="actions">
${button('openFolder', 'Open folder', 'Choose the project you want to work on.', true)}
${button('newFile', 'New file', 'Begin with an untitled editor.')}
${button('terminal', 'Terminal', state.trusted ? 'Open a terminal in this editor.' : 'Requires a trusted workspace.')}
${state.installed ? button('tasks', 'Command Helm Tasks', 'Open the optional task companion.') : ''}
</div><p class="hint">Use Tab to move between controls. Press Enter or Space to activate a button.</p></section>
<section aria-labelledby="setup"><h2 id="setup">Your setup</h2><p>Pair the phone app and desktop with your own private bridge.</p><button type="button" data-action="setup">Connect your phone &amp; computer</button> <button type="button" data-action="releases">Downloads &amp; updates</button><div class="setup"><dl>
<dt>Workspace</dt><dd>${escapeHtml(state.workspace)}</dd>
<dt>Workspace trust</dt><dd>${state.trusted ? 'Trusted. Terminal is allowed when available.' : 'Restricted Mode. Terminal stays disabled.'}</dd>
<dt>Task companion</dt><dd>${state.installed ? (state.available.tasks ? 'Installed. Open Tasks to review its connection and pairing.' : 'Installed; its command is unavailable. Enable the companion, then refresh setup.') : 'Not installed. Remote delivery requires the Command Helm Tasks companion and a paired private bridge.'}</dd>
</dl><button type="button" class="refresh" data-action="refresh">Refresh setup</button><p class="hint">This desk does not check bridge connectivity or pairing. Remote tasks require your own configured companion and bridge.</p></div></section></div>
<p role="status" aria-live="polite" aria-atomic="true" class="status">${escapeHtml(state.notice)}</p>
<footer>Original Command Helm welcome experience. Built on the VS Code editor foundation; upstream authorship and licenses remain with their respective owners.</footer>
</main><script nonce="${escapedNonce}">
const vscode = acquireVsCodeApi();
document.querySelectorAll('button[data-action]').forEach(button => {
  button.addEventListener('click', () => vscode.postMessage({ action: button.dataset.action }));
});
</script></body></html>`;
}

module.exports = { render, escapeHtml };
