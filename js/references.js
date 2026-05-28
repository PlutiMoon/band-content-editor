import { data } from './state.js';
import { esc } from './forms.js';
import { findDeleteReferences, formatReferenceSummary } from './delete_guards.js';

const KIND_LABELS = {
  action: '行动',
  event: '事件',
  dialogue: '对话',
  location: '地点',
  map: '地图',
  npc: 'NPC',
};

let selectedKind = 'action';
let selectedId = '';

function targetsFor(kind) {
  if (kind === 'action') return (data.actions || []).map(item => [item.id, item.name || item.id]);
  if (kind === 'event') return (data.events || []).map(item => [item.id, item.name || item.id]);
  if (kind === 'dialogue') return Object.keys(data.dialogues || {}).map(id => [id, id]);
  if (kind === 'location') return (data.locations || []).map(item => [item.id, item.name || item.id]);
  if (kind === 'map') return (data.maps || []).map(item => [item.id, item.name || item.id]);
  if (kind === 'npc') return (data.npcs || []).map(item => [item.id, item.name || item.id]);
  return [];
}

function renderKindOptions() {
  return Object.entries(KIND_LABELS)
    .map(([kind, label]) => `<option value="${kind}" ${kind === selectedKind ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function renderTargetOptions(targets) {
  return targets
    .map(([id, label]) => `<option value="${esc(id)}" ${id === selectedId ? 'selected' : ''}>${esc(label)} (${esc(id)})</option>`)
    .join('');
}

function renderReferencesTable(refs) {
  if (!refs.length) {
    return '<p style="color:var(--text2);text-align:center;padding:48px 16px;background:var(--bg2);">当前对象未被其他内容引用。</p>';
  }
  let html = '<table><thead><tr><th>#</th><th>引用位置</th></tr></thead><tbody>';
  refs.forEach((ref, i) => {
    html += `<tr><td>${i + 1}</td><td>${esc(ref)}</td></tr>`;
  });
  html += '</tbody></table>';
  return html;
}

export function renderReferences() {
  const targets = targetsFor(selectedKind);
  if (!targets.some(([id]) => id === selectedId)) {
    selectedId = targets[0]?.[0] || '';
  }
  const refs = selectedId ? findDeleteReferences(selectedKind, selectedId, data) : [];
  const summary = selectedId ? formatReferenceSummary(selectedKind, selectedId, data) : '请选择对象';

  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>引用</span>
    <span class="hint">${esc(summary)}</span>`;

  const ct = document.getElementById('content');
  ct.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      <select id="ref-kind" style="width:120px;">${renderKindOptions()}</select>
      <select id="ref-id" style="min-width:240px;">${renderTargetOptions(targets)}</select>
    </div>
    <div style="padding:10px 12px;background:var(--bg2);border-left:3px solid var(--accent2);margin-bottom:12px;">
      <div style="font-size:0.75rem;color:var(--text2);">${esc(KIND_LABELS[selectedKind] || selectedKind)} / ${esc(selectedId)}</div>
      <div style="font-weight:700;color:var(--accent2);">${esc(summary)}</div>
    </div>
    ${renderReferencesTable(refs)}`;

  document.getElementById('ref-kind').onchange = function() {
    selectedKind = this.value;
    selectedId = '';
    renderReferences();
  };
  document.getElementById('ref-id').onchange = function() {
    selectedId = this.value;
    renderReferences();
  };
}
