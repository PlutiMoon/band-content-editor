import { data } from './state.js';
import { esc } from './forms.js';
import { saveDoc, toast } from './core.js';
import { createSnapshot } from './snapshot_store.js';
import { buildHealthRepairPlan, applyHealthRepairPlan } from './health_repairs.js';
import { buildPublishGate, formatPublishGateMessage } from './publish_gate.js';
import { openContentPath } from './content_navigation.js';
import { issueToContentPath, issueToGraphNodeKey } from './issue_navigation.js';
import { openGraphNode } from './graph.js';

function severityLabel(severity) {
  return severity === 'error' ? '错误' : '警告';
}

function severityColor(severity) {
  return severity === 'error' ? 'var(--danger)' : 'var(--warn)';
}

function severityStatusClass(severity) {
  return severity === 'error' ? 'status-error' : 'status-warning';
}

function publishStatusClass(status) {
  if (status === 'blocked') return 'status-error';
  if (status === 'warning') return 'status-warning';
  return 'status-success';
}

function renderSummary(issues) {
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  return `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
    <div class="status-notice status-error" style="min-width:120px;">
      <div style="font-size:0.75rem;color:var(--text2);">错误</div>
      <div style="font-size:1.35rem;font-weight:700;">${errors}</div>
    </div>
    <div class="status-notice status-warning" style="min-width:120px;">
      <div style="font-size:0.75rem;color:var(--text2);">警告</div>
      <div style="font-size:1.35rem;font-weight:700;">${warnings}</div>
    </div>
    <div class="status-notice status-info" style="min-width:120px;">
      <div style="font-size:0.75rem;color:var(--text2);">总计</div>
      <div style="font-size:1.35rem;font-weight:700;">${issues.length}</div>
    </div>
  </div>`;
}

function renderIssueTable(issues) {
  if (!issues.length) {
    return '<p style="color:var(--text2);text-align:center;padding:48px 16px;background:var(--bg2);">当前内容体检通过，未发现错误或警告。</p>';
  }

  let html = '<table><thead><tr><th>级别</th><th>区域</th><th>代码</th><th>问题</th><th>定位</th></tr></thead><tbody>';
  for (let i = 0; i < issues.length; i++) {
    const item = issues[i];
    const contentPath = issueToContentPath(item);
    const graphNodeKey = issueToGraphNodeKey(item);
    const openBtn = contentPath ? `<button class="btn-sm health-open-content" data-issue-idx="${i}">打开</button>` : '';
    const graphBtn = graphNodeKey ? `<button class="btn-sm health-open-graph" data-issue-idx="${i}">关系图</button>` : '';
    html += `<tr>
      <td><span class="status-badge ${severityStatusClass(item.severity)}">${severityLabel(item.severity)}</span></td>
      <td>${esc(item.area)}</td>
      <td style="font-size:0.75rem;">${esc(item.code)}</td>
      <td>${esc(item.message)}</td>
      <td style="white-space:nowrap;">${openBtn}${graphBtn}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function renderRepairPanel(plan) {
  if (!plan.repairable.length && !plan.manual.length) return '';
  const repairRows = plan.repairable.slice(0, 6).map(item =>
    `<li>${esc(item.description)} <span class="hint">${esc(item.message)}</span></li>`
  ).join('');
  const more = plan.repairable.length > 6 ? `<li class="hint">等 ${plan.repairable.length} 项</li>` : '';
  return `<div class="status-notice status-info">
    <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
      <div>
        <div style="font-weight:700;">修复计划</div>
        <div class="hint">可自动修复 ${plan.repairable.length} 项 / 需人工处理 ${plan.manual.length} 项</div>
      </div>
      ${plan.repairable.length ? '<button class="btn-ok" id="btn-health-apply-repairs">应用自动修复</button>' : ''}
    </div>
    ${plan.repairable.length ? `<ul style="margin:8px 0 0 18px;">${repairRows}${more}</ul>` : ''}
  </div>`;
}

function renderPublishGatePanel(gate) {
  const label = gate.status === 'blocked' ? '未通过' : gate.status === 'warning' ? '有警告' : '可发布';
  return `<div class="status-notice ${publishStatusClass(gate.status)}">
    <div style="font-weight:700;">发布检查：<span class="status-badge ${publishStatusClass(gate.status)}">${label}</span></div>
    <div class="hint">${esc(formatPublishGateMessage(gate))}</div>
  </div>`;
}

async function saveRepairResult(result) {
  const savers = {
    actions: () => saveDoc('actions', 'actions', data.actions || []),
    maps: () => saveDoc('maps', 'maps', data.maps || []),
  };

  for (const doc of result.docs || []) {
    const save = savers[doc];
    if (save && !(await save())) return false;
  }

  for (const dialogueId of result.dialogues || []) {
    const dialogue = data.dialogues?.[dialogueId];
    if (dialogue && !(await saveDoc('dialogues/' + dialogueId, 'dialogues', dialogue))) return false;
  }

  return true;
}

async function applyHealthRepairs(plan) {
  if (!plan.repairable.length) return;
  if (!confirm(`将应用 ${plan.repairable.length} 项低风险自动修复，并先创建快照。继续？`)) return;
  createSnapshot(data, { source: 'health_repair', label: `体检自动修复前：${plan.repairable.length} 项` });
  const result = applyHealthRepairPlan(data, plan);
  if (!result.changed) {
    toast('没有可应用的修复');
    renderHealth();
    return;
  }
  if (!(await saveRepairResult(result))) {
    toast('自动修复已应用到本地，但保存失败，请重新拉取检查', true);
    return;
  }
  toast(`已应用 ${plan.repairable.length} 项自动修复`);
  renderHealth();
}

export function renderHealth() {
  const publishGate = buildPublishGate(data);
  const issues = publishGate.issues;
  const repairPlan = publishGate.repairPlan || buildHealthRepairPlan(data, issues);
  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>内容体检</span>
    <span class="hint">错误 ${issues.filter(i => i.severity === 'error').length} / 警告 ${issues.filter(i => i.severity === 'warning').length}</span>
    <button class="btn-ok" id="btn-health-refresh">重新体检</button>`;

  const ct = document.getElementById('content');
  ct.innerHTML = `<div style="padding:12px 0;">
    ${renderSummary(issues)}
    ${renderPublishGatePanel(publishGate)}
    ${renderRepairPanel(repairPlan)}
    ${renderIssueTable(issues)}
  </div>`;

  document.getElementById('btn-health-refresh').onclick = renderHealth;
  const applyBtn = document.getElementById('btn-health-apply-repairs');
  if (applyBtn) applyBtn.onclick = () => applyHealthRepairs(repairPlan);
  ct.querySelectorAll('.health-open-content').forEach(btn => {
    btn.onclick = () => {
      const issue = issues[Number(btn.dataset.issueIdx)];
      const contentPath = issueToContentPath(issue);
      if (contentPath) openContentPath(contentPath);
    };
  });
  ct.querySelectorAll('.health-open-graph').forEach(btn => {
    btn.onclick = () => {
      const issue = issues[Number(btn.dataset.issueIdx)];
      const nodeKey = issueToGraphNodeKey(issue);
      if (nodeKey) openGraphNode(nodeKey);
    };
  });
}
