// ════════════════════════════════════════════
// EVENTS TAB
// ════════════════════════════════════════════
import { STAT_NAMES, TRIGGER_LABELS } from './config.js';
import { data, selectedIdx, setSelectedIdx, setData } from './state.js';
import { saveDoc, toast, downloadJSON, buildToolbar, isMobile } from './core.js';
import {
  fld, sel, esc,
  renderStatReqs, readStatReqs,
  renderStringList, readStringList,
  renderPhaseSel, readPhaseVal,
  renderDaySel, readDayVal,
  renderDayRange, readDayRange,
  renderMoneyReq, readMoneyReq,
  renderRelDeltas, readRelDeltas,
  renderRelReqs, readRelReqs,
  validateEvent
} from './forms.js';
import { formatDeleteBlocker, formatReferenceSummary, rewriteContentReferences } from './delete_guards.js';
import { confirmReferenceRewrite, saveReferenceMigration } from './reference_migrations.js';
import { createActionEventTemplate, createLocationEventTemplate } from './content_templates.js';

export function renderEvents() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = buildToolbar({ icon: '📋', label: '事件列表', unit: '事件', count: data.events.length, id: 'event', addLabel: '新增', exportLabel: '导出文件' });
  tb.insertAdjacentHTML('beforeend', '<button class="btn-sm" id="btn-template-action-event">行动事件模板</button><button class="btn-sm" id="btn-template-location-event">地点事件模板</button>');
  document.getElementById('btn-add-event').onclick = addEvent;
  document.getElementById('btn-template-action-event').onclick = addActionEventFromTemplate;
  document.getElementById('btn-template-location-event').onclick = addLocationEventFromTemplate;
  document.getElementById('btn-import-event').onclick = () => window._importJSON('events');
  document.getElementById('btn-export-event').onclick = exportEvent;

  const ct = document.getElementById('content');
  if (data.events.length === 0) {
    ct.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px;">暂无事件</p>';
    return;
  }

  const q = (document.getElementById('search-event').value || '').toLowerCase();
  const list = q ? data.events.filter(e => (e.id+';'+e.name).toLowerCase().includes(q)) : data.events;

  if (list.length === 0) {
    ct.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px;">无匹配结果</p>';
  } else {
    let html = '<table><thead><tr><th>ID</th><th>名称</th><th>触发类型</th><th>条件摘要</th><th>一次性</th><th></th></tr></thead><tbody>';
    list.forEach((e) => {
      const i = data.events.indexOf(e);
      const cond = conditionSummary(e.conditions||{});
      html += `<tr class="${i===selectedIdx?'selected':''}" data-idx="${i}">
        <td>${esc(e.id)}</td><td>${esc(e.name)}</td>
        <td>${TRIGGER_LABELS[e.trigger_type]||e.trigger_type}</td>
        <td>${cond}</td><td>${e.one_shot?'是':'否'}</td>
        <td><button class="btn-sm btn-danger" data-del="${i}">✕</button></td></tr>`;
    });
    html += '</tbody></table>';
    ct.innerHTML = html;

    ct.querySelectorAll('tr[data-idx]').forEach(tr => {
      tr.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        setSelectedIdx(parseInt(this.dataset.idx));
        renderEvents();
      });
    });
    ct.querySelectorAll('button[data-del]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteEvent(parseInt(this.dataset.del));
      });
    });
  }

  document.getElementById('search-event').addEventListener('input', renderEvents);

  if (selectedIdx >= 0 && selectedIdx < data.events.length && list.includes(data.events[selectedIdx])) renderEventDetail();
}

function conditionSummary(c) {
  const parts = [];
  if (c.day) parts.push('Day'+c.day);
  if (c.day_range) parts.push('D'+c.day_range[0]+'-'+c.day_range[1]);
  if (c.phase) parts.push(typeof c.phase==='string'?c.phase:c.phase.join(','));
  if (c.stats) c.stats.forEach(s => parts.push(STAT_NAMES[s.stat]+s.op+s.value));
  if (c.money) parts.push('💰'+c.money.op+c.money.value);
  return parts.join(' ') || '—';
}

function renderEventDetail() {
  if (selectedIdx < 0) return;
  const e = data.events[selectedIdx];
  const ct = document.getElementById('content');
  const existing = ct.querySelector('#eventDetail');
  if (existing) existing.remove();

  let html = '<div style="margin-top:16px;padding:16px;background:var(--bg2);border-radius:6px;" id="eventDetail">';
  html += '<h3 style="color:var(--accent2);margin-bottom:8px;">编辑：'+esc(e.name)+'</h3>';
  html += `<div class="hint" style="margin-bottom:8px;">${esc(formatReferenceSummary('event', e.id, data))}</div>`;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('ID','evt_id',e.id);
  html += fld('名称','evt_name',e.name);
  html += sel('触发类型','evt_tt',e.trigger_type, Object.entries(TRIGGER_LABELS).map(([k,v])=>[k,v]));
  html += fld('触发详情','evt_td',e.trigger_detail||'','text','仅 action_complete 时填写行动ID');
  html += '</div>';
  html += `<label><input type="checkbox" id="evt_os" ${e.one_shot?'checked':''}> 一次性</label>`;

  html += '<div class="section-label">条件</div>';
  const c = e.conditions||{};
  html += fld('日期','evt_cond_day',c.day??'','number');
  html += renderDayRange('evt_cond_dr', c.day_range||[]);
  html += renderPhaseSel('evt_cond_phase', '时段', c.phase);
  html += renderStatReqs('evt_cond_stats', c.stats||[]);
  html += renderRelReqs('evt_cond_rels', c.relationships||[]);
  html += renderMoneyReq('evt_cond_money', '金钱', c.money);
  html += renderStringList('evt_cond_flags', '需要 flag', c.flags||[]);
  html += renderStringList('evt_cond_nf', '不能有 flag', c.not_flags||[]);

  html += '<div class="section-label">效果</div>';
  const fx = e.effects||{};
  html += fld('金钱变化','evt_fx_money',fx.money??'', 'number');
  html += renderStatReqs('evt_fx_stats', fx.stats||[], true);
  html += renderRelDeltas('evt_fx_rels', fx.relationships||[]);
  html += renderStringList('evt_fx_flags', '设置 flag', fx.flags||[]);
  html += fld('触发对话ID','evt_fx_dialogue',fx.dialogue||'');

  html += '<div class="detail-actions"><button id="btn-cancel-event">取消</button><button class="btn-ok" id="btn-save-event">💾 保存到数据库</button></div>';
  html += '</div>';
  ct.insertAdjacentHTML('beforeend', html);
  document.getElementById('btn-save-event').onclick = saveEventDetail;
  document.getElementById('btn-cancel-event').onclick = () => {
    setSelectedIdx(-1);
    renderEvents();
  };
}

async function saveEventDetail() {
  const e = data.events[selectedIdx];
  const oldId = e.id;
  e.id = document.getElementById('evt_id').value.trim();
  e.name = document.getElementById('evt_name').value.trim();
  e.trigger_type = document.getElementById('evt_tt').value;
  e.trigger_detail = document.getElementById('evt_td').value.trim() || null;
  if (!e.trigger_detail) delete e.trigger_detail;
  e.one_shot = document.getElementById('evt_os')?.checked || false;

  const err = validateEvent(e, data.events);
  if (err) { toast(err, true); return; }
  if (!confirmReferenceRewrite('event', oldId, e.id, data)) {
    e.id = oldId;
    return;
  }

  const c = {};
  const cd = parseInt(document.getElementById('evt_cond_day').value); if (!isNaN(cd)) c.day = cd;
  const dr = readDayRange('evt_cond_dr'); if (dr) c.day_range = dr;
  const ph = readPhaseVal('evt_cond_phase'); if (ph !== null) c.phase = ph;
  const rs = readStatReqs('evt_cond_stats'); if (rs.length) c.stats = rs;
  const rr = readRelReqs('evt_cond_rels'); if (rr.length) c.relationships = rr;
  const mr = readMoneyReq('evt_cond_money'); if (mr) c.money = mr;
  const fl = readStringList('evt_cond_flags'); if (fl.length) c.flags = fl;
  const nf = readStringList('evt_cond_nf'); if (nf.length) c.not_flags = nf;
  e.conditions = c;

  const fx = {};
  const fm = document.getElementById('evt_fx_money').value; if (fm !== '') fx.money = parseInt(fm);
  const fs = readStatReqs('evt_fx_stats', true); if (fs.length) fx.stats = fs;
  const fr = readRelDeltas('evt_fx_rels'); if (fr.length) fx.relationships = fr;
  const ffl = readStringList('evt_fx_flags'); if (ffl.length) fx.flags = ffl;
  const fd = document.getElementById('evt_fx_dialogue').value.trim(); if (fd) fx.dialogue = fd;
  e.effects = fx;

  const migration = rewriteContentReferences('event', oldId, e.id, data);
  if (await saveDoc('events', 'events', data.events)) {
    if (!(await saveReferenceMigration(migration, data))) {
      toast('已保存事件，但同步引用失败，请重新拉取检查', true);
      return;
    }
    toast('已保存');
    renderEvents();
  }
}

async function addEvent() {
  const id = prompt('事件ID（英文下划线，如 landlord_visit）：');
  if (!id) return;
  if (data.events.find(e => e.id === id)) { toast('该ID已存在', true); return; }
  const newArr = [...data.events, {id, name:'新事件', trigger_type:'phase_start', conditions:{}, effects:{}, one_shot:true}];
  if (await saveDoc('events', 'events', newArr)) {
    setData({ ...data, events: newArr });
    setSelectedIdx(newArr.length - 1);
    renderEvents();
  }
}

async function addActionEventFromTemplate() {
  const actionId = prompt('触发行动ID：', data.actions?.[0]?.id || '');
  if (!actionId) return;
  const id = prompt('事件ID（英文下划线，如 after_' + actionId + '）：', 'after_' + actionId);
  if (!id) return;
  await addEventTemplate(() => createActionEventTemplate(data, { id, actionId }), id);
}

async function addLocationEventFromTemplate() {
  const locationId = prompt('触发地点ID：', data.locations?.[0]?.id || '');
  if (!locationId) return;
  const id = prompt('事件ID（英文下划线，如 enter_' + locationId + '）：', 'enter_' + locationId);
  if (!id) return;
  await addEventTemplate(() => createLocationEventTemplate(data, { id, locationId }), id);
}

async function addEventTemplate(createItem, id) {
  try {
    const item = createItem();
    const newArr = [...data.events, item];
    if (await saveDoc('events', 'events', newArr)) {
      setData({ ...data, events: newArr });
      setSelectedIdx(newArr.length - 1);
      renderEvents();
      toast('已创建模板事件：' + id);
    }
  } catch (e) {
    toast(e.message || '创建模板失败', true);
  }
}

async function deleteEvent(i) {
  const event = data.events[i];
  const blocker = formatDeleteBlocker('event', event && event.id, data);
  if (blocker) { toast(blocker, true); return; }
  if (!confirm('确定删除「'+data.events[i].name+'」？')) return;
  const newArr = [...data.events];
  newArr.splice(i, 1);
  if (await saveDoc('events', 'events', newArr)) {
    setData({ ...data, events: newArr });
    if (selectedIdx >= newArr.length) setSelectedIdx(-1);
    renderEvents();
  }
}

function exportEvent() { downloadJSON('events.json', data.events); toast('已导出 events.json'); }
