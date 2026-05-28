import { toast, downloadJSON } from './core.js';
import { esc } from './forms.js';
import {
  deleteReleaseRecord,
  exportReleaseRecordPayload,
  listReleaseRecords
} from './release_store.js';

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  } catch (_) {
    return String(ts || '');
  }
}

function countsSummary(record) {
  const c = record.counts || {};
  return [
    `行动 ${c.actions || 0}`,
    `事件 ${c.events || 0}`,
    `对话 ${c.dialogues || 0}`,
    `地点 ${c.locations || 0}`,
    `NPC ${c.npcs || 0}`,
  ].join(' / ');
}

function gateLabel(status) {
  if (status === 'pass') return '通过';
  if (status === 'warning') return '有警告';
  if (status === 'blocked') return '阻断';
  return status || '未知';
}

function renderReleaseRows(records) {
  if (!records.length) {
    return '<p style="color:var(--text2);text-align:center;padding:48px 16px;background:var(--bg2);">还没有本地发布记录。</p>';
  }

  let html = '<table><thead><tr><th>时间</th><th>版本</th><th>操作者</th><th>门禁</th><th>快照</th><th>内容</th><th></th></tr></thead><tbody>';
  records.forEach(record => {
    html += `<tr>
      <td>${esc(formatTime(record.created_at))}</td>
      <td>${esc(record.version)}</td>
      <td>${esc(record.user || '')}</td>
      <td>${esc(gateLabel(record.gate_status))}</td>
      <td style="font-size:0.75rem;">${esc(record.snapshot_id || '')}</td>
      <td style="font-size:0.75rem;">${esc(countsSummary(record))}</td>
      <td style="white-space:nowrap;">
        <button class="btn-sm" data-release-export="${record.id}">导出记录</button>
        <button class="btn-sm btn-danger" data-release-delete="${record.id}">删除</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  return html;
}

export function renderReleases() {
  const records = listReleaseRecords();
  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>发布记录</span>
    <span class="hint">本机保留最近 ${records.length} / 20 条发布记录</span>`;

  const ct = document.getElementById('content');
  ct.innerHTML = `<div style="padding:12px 0;">
    ${renderReleaseRows(records)}
  </div>`;

  ct.querySelectorAll('[data-release-export]').forEach(btn => {
    btn.addEventListener('click', function() {
      const record = listReleaseRecords().find(item => item.id === this.dataset.releaseExport);
      if (!record) return;
      downloadJSON(`band_release_${record.version}.json`, exportReleaseRecordPayload(record));
    });
  });

  ct.querySelectorAll('[data-release-delete]').forEach(btn => {
    btn.addEventListener('click', function() {
      if (!confirm('确定删除这条本地发布记录？')) return;
      if (deleteReleaseRecord(this.dataset.releaseDelete)) {
        toast('已删除发布记录');
        renderReleases();
      }
    });
  });
}
