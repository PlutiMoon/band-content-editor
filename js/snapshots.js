import { data, setData } from './state.js';
import { saveDoc, deleteDoc, toast, downloadJSON } from './core.js';
import { esc } from './forms.js';
import {
  createSnapshot,
  deleteSnapshot,
  exportSnapshotPayload,
  listSnapshots
} from './snapshot_store.js';

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
        <button class="btn-sm" data-snap-export="${snapshot.id}">导出</button>
        <button class="btn-sm btn-ok" data-snap-restore="${snapshot.id}">恢复</button>
        <button class="btn-sm btn-danger" data-snap-delete="${snapshot.id}">删除</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  return html;
}

export function renderSnapshots() {
  const snapshots = listSnapshots();
  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>快照</span>
    <span class="hint">本机保留最近 ${snapshots.length} / 10 个快照</span>
    <button class="btn-ok" id="btn-create-snapshot">创建快照</button>`;

  const ct = document.getElementById('content');
  ct.innerHTML = `<div style="padding:12px 0;">
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
