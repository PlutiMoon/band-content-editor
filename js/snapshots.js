import { data, setData } from './state.js';
import { saveDoc, deleteDoc, toast, downloadJSON } from './core.js';
import { esc } from './forms.js';
import {
  createSnapshot,
  deleteSnapshot,
  exportSnapshotPayload,
  listSnapshots
} from './snapshot_store.js';
import { diffContent, formatDiffSummary } from './content_diff.js';

let selectedCompareSnapshotId = '';
let selectedCompareKind = 'all';
let selectedCompareOperation = 'all';
const expandedDiffKeys = new Set();

const DIFF_KIND_OPTIONS = [
  ['all', '全部类型'],
  ['action', '行动'],
  ['event', '事件'],
  ['dialogue', '对话'],
  ['phone', '手机聊天'],
  ['map', '地图'],
  ['location', '地点'],
  ['npc', 'NPC'],
  ['game_config', '配置'],
];

const DIFF_OPERATION_OPTIONS = [
  ['all', '全部变化'],
  ['added', '新增'],
  ['removed', '删除'],
  ['modified', '修改'],
];

function snapshotLabel(snapshot) {
  return snapshot.label || (snapshot.source === 'import' ? '导入前快照' : '手动快照');
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  } catch (_) {
    return String(ts || '');
  }
}

function countSummary(snapshot) {
  const d = snapshot.data || {};
  return [
    `行动 ${(d.actions || []).length}`,
    `事件 ${(d.events || []).length}`,
    `对话 ${Object.keys(d.dialogues || {}).length}`,
    `地点 ${(d.locations || []).length}`,
  ].join(' / ');
}

function operationLabel(operation) {
  if (operation === 'added') return '新增';
  if (operation === 'removed') return '删除';
  return '修改';
}

function operationColor(operation) {
  if (operation === 'added') return 'var(--ok)';
  if (operation === 'removed') return 'var(--danger)';
  return 'var(--warn)';
}

function renderDiffOptions(options, selected) {
  return options
    .map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function formatFieldValue(value) {
  if (value === undefined) return '(无)';
  if (typeof value === 'string') return value || '(空)';
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function normalizedData(source) {
  const d = source || {};
  return {
    actions: Array.isArray(d.actions) ? d.actions : [],
    events: Array.isArray(d.events) ? d.events : [],
    dialogues: d.dialogues || {},
    phone_chats: Array.isArray(d.phone_chats) ? d.phone_chats : [],
    maps: Array.isArray(d.maps) ? d.maps : [],
    locations: Array.isArray(d.locations) ? d.locations : [],
    npcs: Array.isArray(d.npcs) ? d.npcs : [],
    game_config: d.game_config || {},
  };
}

export function createManualSnapshot(label) {
  const snapshot = createSnapshot(data, {
    source: 'manual',
    label: label || '手动快照',
  });
  toast('已创建快照');
  return snapshot;
}

async function restoreSnapshot(snapshot) {
  if (!confirm(`确定恢复快照「${snapshotLabel(snapshot)}」？这会覆盖当前数据库内容。`)) return;
  const nextData = normalizedData(snapshot.data);

  const writes = [
    ['actions', 'actions', nextData.actions],
    ['events', 'events', nextData.events],
    ['phone_chats', 'phone_chats', nextData.phone_chats],
    ['locations', 'locations', nextData.locations],
    ['maps', 'maps', nextData.maps],
    ['npcs', 'npcs', nextData.npcs],
    ['game_config', 'game_config', nextData.game_config],
  ];

  for (const [id, type, payload] of writes) {
    if (!(await saveDoc(id, type, payload))) return;
  }

  const nextDialogueIds = new Set(Object.keys(nextData.dialogues));
  for (const currentId of Object.keys(data.dialogues || {})) {
    if (!nextDialogueIds.has(currentId)) {
      if (!(await deleteDoc('dialogues/' + currentId))) return;
    }
  }
  for (const [id, dialogue] of Object.entries(nextData.dialogues)) {
    if (!(await saveDoc('dialogues/' + id, 'dialogues', dialogue))) return;
  }

  setData(nextData);
  toast('已恢复快照');
  renderSnapshots();
}

function renderSnapshotRows(snapshots) {
  if (!snapshots.length) {
    return '<p style="color:var(--text2);text-align:center;padding:48px 16px;background:var(--bg2);">还没有本地快照。</p>';
  }

  let html = '<table><thead><tr><th>时间</th><th>来源</th><th>说明</th><th>内容</th><th></th></tr></thead><tbody>';
  snapshots.forEach(snapshot => {
    html += `<tr>
      <td>${esc(formatTime(snapshot.created_at))}</td>
      <td>${snapshot.source === 'import' ? '导入前' : '手动'}</td>
      <td>${esc(snapshotLabel(snapshot))}</td>
      <td style="font-size:0.75rem;">${esc(countSummary(snapshot))}</td>
      <td style="white-space:nowrap;">
        <button class="btn-sm" data-snap-compare="${snapshot.id}">对比当前</button>
        <button class="btn-sm" data-snap-export="${snapshot.id}">导出</button>
        <button class="btn-sm btn-ok" data-snap-restore="${snapshot.id}">恢复</button>
        <button class="btn-sm btn-danger" data-snap-delete="${snapshot.id}">删除</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  return html;
}

function renderComparePanel(snapshots) {
  if (!selectedCompareSnapshotId) return '';
  const snapshot = snapshots.find(item => item.id === selectedCompareSnapshotId);
  if (!snapshot) return '';
  const diff = diffContent(snapshot.data || {}, data);
  if (!diff.items.length) {
    return `<div style="padding:12px;background:var(--bg2);border-left:3px solid var(--ok);margin-bottom:12px;">
      <div style="font-weight:700;color:var(--ok);">对比当前：无差异</div>
      <div class="hint">${esc(snapshotLabel(snapshot))}</div>
    </div>`;
  }
  const visibleItems = diff.items.filter(item => {
    if (selectedCompareKind !== 'all' && item.kind !== selectedCompareKind) return false;
    if (selectedCompareOperation !== 'all' && item.operation !== selectedCompareOperation) return false;
    return true;
  });
  const filters = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:0 0 8px;">
    <select id="snapshot-filter-kind" style="width:140px;">${renderDiffOptions(DIFF_KIND_OPTIONS, selectedCompareKind)}</select>
    <select id="snapshot-filter-operation" style="width:120px;">${renderDiffOptions(DIFF_OPERATION_OPTIONS, selectedCompareOperation)}</select>
  </div>`;
  if (!visibleItems.length) {
    return `<div style="margin-bottom:12px;">
      <div style="padding:12px;background:var(--bg2);border-left:3px solid var(--accent2);margin-bottom:8px;">
        <div style="font-weight:700;color:var(--accent2);">对比当前：${esc(formatDiffSummary(diff))}</div>
        <div class="hint">${esc(snapshotLabel(snapshot))}</div>
      </div>
      ${filters}
      <p style="color:var(--text2);text-align:center;padding:28px 16px;background:var(--bg2);">当前筛选下没有差异。</p>
    </div>`;
  }
  let rows = '';
  for (const item of visibleItems) {
    const diffKey = `${item.kind}:${item.id}:${item.operation}`;
    const canExpand = item.operation === 'modified' && item.changes && item.changes.length;
    const isExpanded = expandedDiffKeys.has(diffKey);
    const detailButton = canExpand
      ? `<button class="btn-sm" data-diff-toggle="${esc(diffKey)}">${isExpanded ? '收起字段' : `字段 ${item.changes.length}`}</button>`
      : '';
    rows += `<tr>
      <td style="color:${operationColor(item.operation)};font-weight:700;">${operationLabel(item.operation)}</td>
      <td>${esc(item.kindLabel)}</td>
      <td><code>${esc(item.id)}</code></td>
      <td>${detailButton}</td>
    </tr>`;
    rows += renderFieldChanges(item, diffKey);
  }
  return `<div style="margin-bottom:12px;">
    <div style="padding:12px;background:var(--bg2);border-left:3px solid var(--accent2);margin-bottom:8px;">
      <div style="font-weight:700;color:var(--accent2);">对比当前：${esc(formatDiffSummary(diff))}</div>
      <div class="hint">${esc(snapshotLabel(snapshot))}</div>
    </div>
    ${filters}
    <table><thead><tr><th>变化</th><th>类型</th><th>ID</th><th>字段</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

function renderFieldChanges(item, diffKey) {
  if (!expandedDiffKeys.has(diffKey) || !item.changes || !item.changes.length) return '';
  const rows = item.changes.map(change => `<tr>
    <td><code>${esc(change.path)}</code></td>
    <td style="max-width:260px;white-space:normal;word-break:break-word;">${esc(formatFieldValue(change.before))}</td>
    <td style="max-width:260px;white-space:normal;word-break:break-word;">${esc(formatFieldValue(change.after))}</td>
  </tr>`).join('');
  return `<tr>
    <td colspan="4" style="background:rgba(83,168,182,0.08);padding:8px 10px;">
      <table style="margin:0;"><thead><tr><th>字段路径</th><th>快照中</th><th>当前</th></tr></thead><tbody>${rows}</tbody></table>
    </td>
  </tr>`;
}

export function renderSnapshots() {
  const snapshots = listSnapshots();
  if (selectedCompareSnapshotId && !snapshots.some(item => item.id === selectedCompareSnapshotId)) {
    selectedCompareSnapshotId = '';
  }
  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>快照</span>
    <span class="hint">本机保留最近 ${snapshots.length} / 10 个快照</span>
    <button class="btn-ok" id="btn-create-snapshot">创建快照</button>`;

  const ct = document.getElementById('content');
  ct.innerHTML = `<div style="padding:12px 0;">
    ${renderComparePanel(snapshots)}
    ${renderSnapshotRows(snapshots)}
  </div>`;

  document.getElementById('btn-create-snapshot').onclick = () => {
    createManualSnapshot();
    renderSnapshots();
  };

  ct.querySelectorAll('[data-snap-export]').forEach(btn => {
    btn.addEventListener('click', function() {
      const snapshot = listSnapshots().find(item => item.id === this.dataset.snapExport);
      if (!snapshot) return;
      downloadJSON(`band_snapshot_${snapshot.created_at}.json`, exportSnapshotPayload(snapshot));
    });
  });

  ct.querySelectorAll('[data-snap-compare]').forEach(btn => {
    btn.addEventListener('click', function() {
      selectedCompareSnapshotId = this.dataset.snapCompare;
      expandedDiffKeys.clear();
      renderSnapshots();
    });
  });

  const kindFilter = document.getElementById('snapshot-filter-kind');
  if (kindFilter) {
    kindFilter.onchange = function() {
      selectedCompareKind = this.value;
      renderSnapshots();
    };
  }
  const operationFilter = document.getElementById('snapshot-filter-operation');
  if (operationFilter) {
    operationFilter.onchange = function() {
      selectedCompareOperation = this.value;
      renderSnapshots();
    };
  }
  ct.querySelectorAll('[data-diff-toggle]').forEach(btn => {
    btn.addEventListener('click', function() {
      const key = this.dataset.diffToggle;
      if (expandedDiffKeys.has(key)) expandedDiffKeys.delete(key);
      else expandedDiffKeys.add(key);
      renderSnapshots();
    });
  });

  ct.querySelectorAll('[data-snap-restore]').forEach(btn => {
    btn.addEventListener('click', function() {
      const snapshot = listSnapshots().find(item => item.id === this.dataset.snapRestore);
      if (snapshot) restoreSnapshot(snapshot);
    });
  });

  ct.querySelectorAll('[data-snap-delete]').forEach(btn => {
    btn.addEventListener('click', function() {
      if (!confirm('确定删除这个本地快照？')) return;
      if (deleteSnapshot(this.dataset.snapDelete)) {
        toast('已删除快照');
        renderSnapshots();
      }
    });
  });
}
