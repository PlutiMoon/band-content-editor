import { data } from './state.js';
import { esc } from './forms.js';
import { runHealthCheck } from './health_check.js';

function severityLabel(severity) {
  return severity === 'error' ? '错误' : '警告';
}

function severityColor(severity) {
  return severity === 'error' ? 'var(--danger)' : 'var(--accent3)';
}

function renderSummary(issues) {
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  return `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
    <div style="padding:10px 12px;background:var(--bg2);border-left:3px solid var(--danger);min-width:120px;">
      <div style="font-size:0.75rem;color:var(--text2);">错误</div>
      <div style="font-size:1.35rem;font-weight:700;color:var(--danger);">${errors}</div>
    </div>
    <div style="padding:10px 12px;background:var(--bg2);border-left:3px solid var(--accent3);min-width:120px;">
      <div style="font-size:0.75rem;color:var(--text2);">警告</div>
      <div style="font-size:1.35rem;font-weight:700;color:var(--accent3);">${warnings}</div>
    </div>
    <div style="padding:10px 12px;background:var(--bg2);border-left:3px solid var(--accent2);min-width:120px;">
      <div style="font-size:0.75rem;color:var(--text2);">总计</div>
      <div style="font-size:1.35rem;font-weight:700;color:var(--accent2);">${issues.length}</div>
    </div>
  </div>`;
}

function renderIssueTable(issues) {
  if (!issues.length) {
    return '<p style="color:var(--text2);text-align:center;padding:48px 16px;background:var(--bg2);">当前内容体检通过，未发现错误或警告。</p>';
  }

  let html = '<table><thead><tr><th>级别</th><th>区域</th><th>代码</th><th>问题</th></tr></thead><tbody>';
  for (const item of issues) {
    html += `<tr>
      <td style="color:${severityColor(item.severity)};font-weight:700;">${severityLabel(item.severity)}</td>
      <td>${esc(item.area)}</td>
      <td style="font-size:0.75rem;">${esc(item.code)}</td>
      <td>${esc(item.message)}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  return html;
}

export function renderHealth() {
  const issues = runHealthCheck(data);
  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>内容体检</span>
    <span class="hint">错误 ${issues.filter(i => i.severity === 'error').length} / 警告 ${issues.filter(i => i.severity === 'warning').length}</span>
    <button class="btn-ok" id="btn-health-refresh">重新体检</button>`;

  const ct = document.getElementById('content');
  ct.innerHTML = `<div style="padding:12px 0;">
    ${renderSummary(issues)}
    ${renderIssueTable(issues)}
  </div>`;

  document.getElementById('btn-health-refresh').onclick = renderHealth;
}
