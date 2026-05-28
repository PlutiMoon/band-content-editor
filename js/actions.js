// ════════════════════════════════════════════
// ACTIONS TAB
// ════════════════════════════════════════════
import { STAT_NAMES } from './config.js';
import { getLocationOptions, getLocationLabel, getNPCLabel } from './forms.js';
import { data, selectedIdx, setSelectedIdx, setData } from './state.js';
import { saveDoc, toast, downloadJSON, buildToolbar, isMobile } from './core.js';
import {
  fld, sel, esc,
  renderStatReqs, readStatReqs,
  renderStringList, readStringList,
  renderPhaseSel, readPhaseVal,
  renderDaySel, readDayVal,
  renderMoneyReq, readMoneyReq,
  renderRelDeltas, readRelDeltas,
  validateAction
} from './forms.js';
import { formatDeleteBlocker, formatReferenceSummary, rewriteContentReferences } from './delete_guards.js';
import { confirmReferenceRewrite, saveReferenceMigration } from './reference_migrations.js';
import { createActionTemplate } from './content_templates.js';

export function renderActions() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = buildToolbar({ icon: '⚡', label: '行动列表', unit: '行动', count: data.actions.length, id: 'action', addLabel: '新增', exportLabel: '导出文件' });
  tb.insertAdjacentHTML('beforeend', '<button class="btn-sm" id="btn-template-action">模板行动</button>');
  document.getElementById('btn-add-action').onclick = addAction;
  document.getElementById('btn-template-action').onclick = addActionFromTemplate;
  document.getElementById('btn-import-action').onclick = () => window._importJSON('actions');
  document.getElementById('btn-export-action').onclick = exportAction;

  const ct = document.getElementById('content');
  if (data.actions.length === 0) {
    ct.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px;">暂无行动，点击「新增」或「从数据库拉取」</p>';
    return;
  }

  const q = (document.getElementById('search-action').value || '').toLowerCase();
  const list = q ? data.actions.filter(a => (a.id+';'+a.name+';'+(a.description||'')).toLowerCase().includes(q)) : data.actions;

  if (list.length === 0) {
    ct.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px;">无匹配结果</p>';
  } else {
    let html = '<table><thead><tr><th>ID</th><th>名称</th><th>地点</th><th>耗时</th><th>上限</th><th>效果摘要</th><th></th></tr></thead><tbody>';
    list.forEach((a) => {
      const i = data.actions.indexOf(a);
      const fx = effectsSummary(a.effects || {});
      html += `<tr class="${i===selectedIdx?'selected':''}" data-idx="${i}">
        <td>${esc(a.id)}</td><td>${esc(a.name)}</td>
        <td>${getLocationLabel(a.location)}</td>
        <td>${a.time_cost ?? 1}</td><td>${a.max_per_day || '—'}</td>
        <td>${fx}</td>
        <td><button class="btn-sm btn-danger" data-del="${i}">✕</button></td></tr>`;
    });
    html += '</tbody></table>';
    ct.innerHTML = html;

    ct.querySelectorAll('tr[data-idx]').forEach(tr => {
      tr.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        setSelectedIdx(parseInt(this.dataset.idx));
        renderActions();
      });
    });
    ct.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteAction(parseInt(this.dataset.del));
      });
    });
  }

  document.getElementById('search-action').addEventListener('input', renderActions);

  if (selectedIdx >= 0 && selectedIdx < data.actions.length && list.includes(data.actions[selectedIdx])) renderActionDetail();
}

function effectsSummary(fx) {
  const parts = [];
  if (fx.money) parts.push('💰'+fx.money);
  if (fx.stats) fx.stats.forEach(s => parts.push(STAT_NAMES[s.stat]+(s.delta>0?'+':'')+s.delta));
  if (fx.relationships) fx.relationships.forEach(r => parts.push(getNPCLabel(r.npc_id)+(r.delta>0?'+':'')+r.delta));
  if (fx.flags) parts.push('🚩'+fx.flags.join(','));
  if (fx.sleep) parts.push('😴');
  if (fx.dialogue) parts.push('💬'+fx.dialogue);
  return parts.join(' ') || '—';
}

function renderActionDetail() {
  if (selectedIdx < 0) return;
  const a = data.actions[selectedIdx];
  const ct = document.getElementById('content');
  const existing = ct.querySelector('#actionDetail');
  if (existing) existing.remove();

  let html = '<div style="margin-top:16px;padding:16px;background:var(--bg2);border-radius:6px;" id="actionDetail">';
  html += '<h3 style="color:var(--accent2);margin-bottom:8px;">编辑：'+esc(a.name)+'</h3>';
  html += `<div class="hint" style="margin-bottom:8px;">${esc(formatReferenceSummary('action', a.id, data))}</div>`;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('ID','act_id',a.id);
  html += fld('名称','act_name',a.name);
  html += fld('描述','act_desc',a.description||'');
  html += sel('地点','act_loc',a.location||'', getLocationOptions());
  html += fld('消耗时段','act_tc',a.time_cost??1,'number');
  html += fld('每日上限','act_mpd',a.max_per_day??1,'number');
  html += '</div>';

  html += '<div class="section-label">条件 (requirements)</div>';
  const reqs = a.requirements || {};
  html += renderStatReqs('act_req_stats', reqs.stats||[]);
  html += renderStringList('act_req_flags', '需要 flag', reqs.flags||[]);
  html += renderStringList('act_req_notflags', '不能有 flag', reqs.not_flags||[]);
  html += renderPhaseSel('act_req_phase', '时段要求', reqs.phase);
  html += renderDaySel('act_req_day', '日期要求', reqs.day);
  html += renderMoneyReq('act_req_money', '金钱要求', reqs.money);

  html += '<div class="section-label">效果 (effects)</div>';
  const fx = a.effects || {};
  html += fld('金钱变化','act_fx_money',fx.money??'', 'number');
  html += renderStatReqs('act_fx_stats', fx.stats||[], true);
  html += renderRelDeltas('act_fx_rels', fx.relationships||[]);
  html += renderStringList('act_fx_flags', '设置 flag', fx.flags||[]);
  html += `<label><input type="checkbox" id="act_fx_sleep" ${fx.sleep?'checked':''}> 睡觉（推进到次日早晨）</label>`;

  html += '<div class="detail-actions"><button id="btn-cancel-action">取消</button><button class="btn-ok" id="btn-save-action">💾 保存到数据库</button></div>';
  html += '</div>';
  ct.insertAdjacentHTML('beforeend', html);
  document.getElementById('btn-save-action').onclick = saveActionDetail;
  document.getElementById('btn-cancel-action').onclick = () => {
    setSelectedIdx(-1);
    renderActions();
  };
}

async function saveActionDetail() {
  const a = data.actions[selectedIdx];
  const oldId = a.id;
  a.id = document.getElementById('act_id').value.trim();
  a.name = document.getElementById('act_name').value.trim();
  a.description = document.getElementById('act_desc').value.trim();
  a.location = document.getElementById('act_loc').value;
  a.time_cost = parseInt(document.getElementById('act_tc').value) || 1;
  a.max_per_day = parseInt(document.getElementById('act_mpd').value) || 1;

  const err = validateAction(a, data.actions);
  if (err) { toast(err, true); return; }
  if (!confirmReferenceRewrite('action', oldId, a.id, data)) {
    a.id = oldId;
    return;
  }

  const reqs = {};
  const rs = readStatReqs('act_req_stats'); if (rs.length) reqs.stats = rs;
  const fl = readStringList('act_req_flags'); if (fl.length) reqs.flags = fl;
  const nf = readStringList('act_req_notflags'); if (nf.length) reqs.not_flags = nf;
  const ph = readPhaseVal('act_req_phase'); if (ph !== null) reqs.phase = ph;
  const dy = readDayVal('act_req_day'); if (dy !== null) reqs.day = dy;
  const mr = readMoneyReq('act_req_money'); if (mr) reqs.money = mr;
  a.requirements = reqs;

  const fx = {};
  const mv = document.getElementById('act_fx_money').value; if (mv !== '') fx.money = parseInt(mv);
  const fs = readStatReqs('act_fx_stats', true); if (fs.length) fx.stats = fs;
  const rels = readRelDeltas('act_fx_rels'); if (rels.length) fx.relationships = rels;
  const ffl = readStringList('act_fx_flags'); if (ffl.length) fx.flags = ffl;
  if (document.getElementById('act_fx_sleep')?.checked) fx.sleep = true;
  a.effects = fx;

  const migration = rewriteContentReferences('action', oldId, a.id, data);
  if (await saveDoc('actions', 'actions', data.actions)) {
    if (!(await saveReferenceMigration(migration, data))) {
      toast('已保存行动，但同步引用失败，请重新拉取检查', true);
      return;
    }
    toast('已保存');
    renderActions();
  }
}

async function addAction() {
  const id = prompt('行动ID（英文下划线，如 practice_2）：');
  if (!id) return;
  if (data.actions.find(a => a.id === id)) { toast('该ID已存在', true); return; }
  const newArr = [...data.actions, {id, name:'新行动', description:'', location:'livehouse', time_cost:1, requirements:{}, effects:{}, max_per_day:1}];
  if (await saveDoc('actions', 'actions', newArr)) {
    setData({ ...data, actions: newArr });
    setSelectedIdx(newArr.length - 1);
    renderActions();
  }
}

async function addActionFromTemplate() {
  const id = prompt('模板行动ID（英文下划线，如 practice_2）：');
  if (!id) return;
  try {
    const item = createActionTemplate(data, { id });
    const newArr = [...data.actions, item];
    if (await saveDoc('actions', 'actions', newArr)) {
      setData({ ...data, actions: newArr });
      setSelectedIdx(newArr.length - 1);
      renderActions();
      toast('已创建模板行动：' + id);
    }
  } catch (e) {
    toast(e.message || '创建模板失败', true);
  }
}

async function deleteAction(i) {
  const action = data.actions[i];
  const blocker = formatDeleteBlocker('action', action && action.id, data);
  if (blocker) { toast(blocker, true); return; }
  if (!confirm('确定删除「'+data.actions[i].name+'」？')) return;
  const newArr = [...data.actions];
  newArr.splice(i, 1);
  if (await saveDoc('actions', 'actions', newArr)) {
    setData({ ...data, actions: newArr });
    if (selectedIdx >= newArr.length) setSelectedIdx(Math.max(0, newArr.length - 1));
    renderActions();
  }
}

function exportAction() { downloadJSON('actions.json', data.actions); toast('已导出 actions.json'); }
