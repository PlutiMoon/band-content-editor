import { toast, downloadJSON } from './core.js';
import { esc } from './forms.js';
import {
  clearAuditEntries,
  deleteAuditEntry,
  exportAuditEntryPayload,
  listAuditEntries
} from './audit_store.js';

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString('zh-CN', { hour12: false });
  } catch (_) {
    return String(ts || '');
  }
}

function actionLabel(action) {
  if (action === 'save') return '保存';
  if (action === 'delete') return '删除';
  if (action === 'release_export') return '发布导出';
  return action || '未知';
}

function renderAuditRows(entries) {
  if (!entries.length) {
    return '<p style="color:var(--text2);text-align:center;padding:48px 16px;background:var(--bg2);">还没有本地操作历史。</p>';
  }

  let html = '<table><thead><tr><th>时间</th><th>动作</th><th>类型</th><th>ID</th><th>操作者</th><th>摘要</th><th></th></tr></thead><tbody>';
  entries.forEach(entry => {
    html += `<tr>
      <td>${esc(formatTime(entry.created_at))}</td>
      <td>${esc(actionLabel(entry.action))}</td>
      <td>${esc(entry.doc_type || '')}</td>
      <td style="font-size:0.75rem;">${esc(entry.doc_id || '')}</td>
      <td>${esc(entry.user || '')}</td>
      <td>${esc(entry.summary || '')}</td>
      <td style="white-space:nowrap;">
        <button class="btn-sm" data-audit-export="${entry.id}">导出</button>
        <button class="btn-sm btn-danger" data-audit-delete="${entry.id}">删除</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table>';
  return html;
}

export function renderAudit() {
  const entries = listAuditEntries();
  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>操作历史</span>
    <span class="hint">本机保留最近 ${entries.length} / 200 条</span>
    <button class="btn-danger" id="btn-clear-audit">清空历史</button>`;

  const ct = document.getElementById('content');
  ct.innerHTML = `<div style="padding:12px 0;">
    ${renderAuditRows(entries)}
  </div>`;

  document.getElementById('btn-clear-audit').onclick = () => {
    if (!confirm('确定清空本地操作历史？')) return;
    clearAuditEntries();
    toast('已清空操作历史');
    renderAudit();
  };

  ct.querySelectorAll('[data-audit-export]').forEach(btn => {
    btn.addEventListener('click', function() {
      const entry = listAuditEntries().find(item => item.id === this.dataset.auditExport);
      if (!entry) return;
      downloadJSON(`band_audit_${entry.created_at}.json`, exportAuditEntryPayload(entry));
    });
  });

  ct.querySelectorAll('[data-audit-delete]').forEach(btn => {
    btn.addEventListener('click', function() {
      if (!confirm('确定删除这条本地操作历史？')) return;
      if (deleteAuditEntry(this.dataset.auditDelete)) {
        toast('已删除操作历史');
        renderAudit();
      }
    });
  });
}
