const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const api = window.optimizer;
const labels = { competitive: 'Competitive', balanced: 'Balanced', potato: 'Maximum FPS' };
const defaults = { competitive: 100, balanced: 100, potato: 70 };
let options = { preset: 'competitive', fpsCap: 280, scale: 100, fortnite: true, capture: true, gameMode: true, power: false };
let status = { supported: false, configFound: false, backup: null };
let busy = false;
let confirmAction = null;
let toastTimer;

function notice(message, type = '') {
  $('#notice').textContent = message;
  $('#notice').className = `notice ${type}`;
  $('#notice').hidden = !message;
}
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500);
}
async function call(method, ...args) {
  if (!api) throw new Error('This is an interface preview. Download and run the Windows app to use this action.');
  const result = await api[method](...args);
  if (!result.ok) throw new Error(result.error || 'The operation could not be completed.');
  return result.data;
}
function page(name) {
  if (!['overview', 'settings', 'latency', 'recovery'].includes(name)) return;
  $$('.page').forEach(el => { el.hidden = el.id !== `page-${name}`; });
  $$('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === name);
    if (el.dataset.page === name) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  $('#breadcrumb-page').textContent = { overview: 'OVERVIEW', settings: 'GAME SETTINGS', latency: 'INPUT LATENCY', recovery: 'BACKUP & RESTORE' }[name];
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function renderOptions() {
  $$('[data-preset]').forEach(el => {
    const selected = el.dataset.preset === options.preset;
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', String(selected));
    el.disabled = busy;
  });
  $('#fps-cap').value = options.fpsCap;
  $('#resolution-scale').value = options.scale;
  $('#scale-value').textContent = `${options.scale}%`;
  $('#render-resolution').textContent = `${Math.round(1920 * options.scale / 100)} × ${Math.round(1080 * options.scale / 100)} internal rendering at your 1080p output.`;
  $('#selected-preset-label').textContent = labels[options.preset];
  for (const [id, key] of [['fortnite-toggle','fortnite'],['game-mode-toggle','gameMode'],['capture-toggle','capture'],['power-toggle','power']]) {
    $(`#${id}`).checked = options[key];
    $(`#${id}`).disabled = busy;
  }
  $('#fps-cap').disabled = busy || !options.fortnite;
  $('#resolution-scale').disabled = busy || !options.fortnite;
  $('#action-title').textContent = busy ? 'Working on your settings…' : status.backup ? 'Your original settings are saved' : `${labels[options.preset]} preset selected`;
  $('#action-subtitle').textContent = busy ? 'Keep this window open until the operation completes.' : status.backup ? 'Restore your backup before applying another preset.' : status.supported ? 'Backup first. Then optimize.' : 'Windows app required to apply changes.';
  $('#review-apply').disabled = busy || !status.supported || Boolean(status.backup);
  $('#restore').disabled = busy || !status.supported || !status.backup;
  $('#scan').disabled = busy;
}
function renderStatus() {
  const badge = $('#connection-badge');
  badge.classList.toggle('preview', !status.supported);
  badge.replaceChildren();
  const dot = document.createElement('span'); dot.className = 'status-dot';
  badge.append(dot, document.createTextNode(status.supported ? 'Windows connected' : 'Preview · Windows required'));
  $('#open-display').disabled = !status.supported;
  $('#open-backups').disabled = !api;
  $('#minimize').disabled = !api;
  $('#close').disabled = !api || busy;
  if (status.backup) {
    const backup = status.backup;
    $('#backup-badge').textContent = backup.state === 'applied' ? 'BACKUP AVAILABLE' : 'RECOVERY NEEDED';
    $('#backup-heading').textContent = backup.state === 'applied' ? 'Your originals are safe.' : 'Let’s recover your settings.';
    $('#backup-description').textContent = `${labels[backup.preset] || backup.preset} · ${new Date(backup.createdAt).toLocaleString()}\n${backup.applied} of ${backup.total} changes recorded as applied. Close Fortnite before restoring. Backups remain on this PC.`;
  } else {
    $('#backup-badge').textContent = 'NO ACTIVE BACKUP';
    $('#backup-heading').textContent = 'A fresh starting point.';
    $('#backup-description').textContent = 'Apply a preset to create a backup of the settings it changes. There are no active changes recorded by this app.';
  }
  renderOptions();
}
async function refreshStatus() {
  if (api) status = await call('status');
  renderStatus();
}
async function scan() {
  if (busy) return;
  $('#scan').disabled = true;
  try {
    const data = await call('scan');
    status = { supported: data.supported, configFound: data.configFound, backup: data.backup };
    if (data.hardware) {
      const hw = data.hardware;
      $('#cpu-value').textContent = hw.cpu;
      $('#cpu-detail').textContent = hw.os;
      $('#gpu-value').textContent = hw.gpu;
      $('#gpu-detail').textContent = 'Detected by Windows';
      $('#ram-value').textContent = `${hw.ramGB} GB RAM`;
      $('#ram-detail').textContent = `${hw.freeGB} GB free of ${hw.totalGB} GB · system drive`;
      $('#hardware-source').textContent = 'DETECTED ON THIS PC';
      if (!status.configFound) notice('Fortnite settings not found. Launch the game once, close it, then scan again. You can still apply Windows-only options.');
      else notice('PC scanned. Fortnite settings found. Close the game before applying or restoring settings.', 'success');
    } else toast('Preview mode uses the PC specs you supplied. Real detection is available in the Windows app.');
  } catch (error) { notice(error.message, 'error'); }
  finally { renderStatus(); }
}
function showDialog(mode) {
  const applying = mode === 'apply';
  if (busy || (applying && (!status.supported || status.backup)) || (!applying && !status.backup)) return;
  $('#dialog-title').textContent = applying ? 'Review your changes' : 'Restore your original settings?';
  $('#dialog-description').textContent = applying ? 'Close Fortnite first. These are the changes the app will apply to this Windows user.' : 'Close Fortnite first. Settings changed outside this app are protected; any conflicts will be reported.';
  const changes = [];
  if (applying) {
    if (options.fortnite) changes.push(`${labels[options.preset]} Fortnite preset · ${options.scale}% 3D resolution · ${options.fpsCap || 'Unlimited'} FPS${options.fpsCap ? ' cap' : ''}`, 'V-Sync off · motion blur off · dynamic resolution off · FPS counter on');
    if (options.gameMode) changes.push('Enable Windows Game Mode');
    if (options.capture) changes.push('Disable Windows Game DVR capture (recording clips will stop)');
    if (options.power) changes.push('Select the existing High performance power plan (may increase heat and power use)');
    if (!changes.length) { notice('Select at least one optimization in Game settings.'); page('settings'); return; }
    if (options.fortnite && !status.configFound) { notice('Launch Fortnite once and close it, then Scan PC to locate its settings.'); return; }
  } else changes.push('Restore the Fortnite values and Windows options changed by this app', 'Keep unrelated settings and archived backup files');
  $('#change-list').replaceChildren(...changes.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  $('#dialog-note-text').textContent = applying ? 'Original values are saved locally before any changes. Rendering mode and AMD driver options are manual steps.' : 'Backup files stay available after restoring. Newer changes to the same settings may require manual review.';
  $('#dialog-confirm').textContent = applying ? 'Back up & apply' : 'Restore backup';
  const snapshot = structuredClone(options);
  confirmAction = () => runOperation(mode, snapshot);
  $('#confirm-dialog').showModal();
}
async function runOperation(mode, snapshot) {
  if (busy) return;
  busy = true; document.body.classList.add('busy'); renderOptions();
  $('#close').disabled = true;
  notice(mode === 'apply' ? 'Saving your originals and applying settings. Keep this window open…' : 'Restoring your original settings. Keep this window open…');
  try {
    const result = await call(mode, ...(mode === 'apply' ? [snapshot] : []));
    notice(result.message, 'success'); toast(result.message);
  } catch (error) { notice(error.message, 'error'); page('recovery'); }
  finally {
    busy = false; document.body.classList.remove('busy');
    try { await refreshStatus(); } catch (error) {
      // A missing recovery status is not permission to start another mutation.
      notice(error.message, 'error');
      $('#review-apply').disabled = true;
      $('#restore').disabled = true;
    }
  }
}
$$('[data-page]').forEach(el => el.addEventListener('click', () => page(el.dataset.page)));
$$('[data-go]').forEach(el => el.addEventListener('click', () => page(el.dataset.go)));
$('.brand').addEventListener('click', event => { event.preventDefault(); page('overview'); });
$$('[data-preset]').forEach(el => el.addEventListener('click', () => { options.preset = el.dataset.preset; options.scale = defaults[options.preset]; renderOptions(); }));
$('#fps-cap').addEventListener('change', event => { options.fpsCap = Number(event.target.value); renderOptions(); });
$('#resolution-scale').addEventListener('input', event => { options.scale = Number(event.target.value); renderOptions(); });
for (const [id, key] of [['fortnite-toggle','fortnite'],['game-mode-toggle','gameMode'],['capture-toggle','capture'],['power-toggle','power']]) $(`#${id}`).addEventListener('change', event => { options[key] = event.target.checked; renderOptions(); });
$('#scan').addEventListener('click', scan);
$('#review-apply').addEventListener('click', () => showDialog('apply'));
$('#restore').addEventListener('click', () => showDialog('restore'));
for (const id of ['dialog-close','dialog-cancel']) $(`#${id}`).addEventListener('click', () => $('#confirm-dialog').close());
$('#dialog-confirm').addEventListener('click', () => { $('#confirm-dialog').close(); confirmAction?.(); });
for (const [id, method] of [['open-backups','openBackups'],['open-display','openDisplay'],['minimize','minimize'],['close','close']]) $(`#${id}`).addEventListener('click', async () => { try { await call(method); } catch (error) { toast(error.message); } });
function checklistProgress() { $('#checklist-progress').textContent = `${$$('[data-check]:checked').length} of 5 completed · saved on this device`; }
$$('[data-check]').forEach(input => {
  try { input.checked = localStorage.getItem(`dropzone-check-${input.dataset.check}`) === 'true'; } catch { /* Storage may be restricted. */ }
  input.addEventListener('change', () => { try { localStorage.setItem(`dropzone-check-${input.dataset.check}`, String(input.checked)); } catch { /* The checklist still works without persistence. */ } checklistProgress(); });
});
checklistProgress();
refreshStatus().then(() => { if (status.supported) scan(); }).catch(error => { notice(error.message, 'error'); renderStatus(); $('#review-apply').disabled = true; });
