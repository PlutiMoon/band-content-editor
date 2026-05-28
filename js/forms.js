// ════════════════════════════════════════════
// FORM WIDGETS & VALIDATION
// ════════════════════════════════════════════
import { STAT_NAMES, PHASES, OPS, NPC_IDS, NPC_NAMES, LOCATION_LABELS } from './config.js';
import { data } from './state.js';

// ── Dynamic option helpers (merge hardcoded defaults with runtime data) ──
export function getLocationOptions() {
  const seen = new Set();
  const pairs = [];
  for (const l of (data.locations || [])) {
    if (l.id && !seen.has(l.id)) {
      seen.add(l.id);
      pairs.push([l.id, l.name || l.id]);
    }
  }
  for (const [id, name] of Object.entries(LOCATION_LABELS)) {
    if (!seen.has(id)) {
      seen.add(id);
      pairs.push([id, name]);
    }
  }
  return pairs;
}

export function getNPCPairs() {
  const seen = new Set();
  const pairs = [];
  for (const n of (data.npcs || [])) {
    if (n.id && !seen.has(n.id)) {
      seen.add(n.id);
      pairs.push([n.id, n.name || n.id]);
    }
  }
  for (let i = 0; i < NPC_IDS.length; i++) {
    if (!seen.has(NPC_IDS[i])) {
      seen.add(NPC_IDS[i]);
      pairs.push([NPC_IDS[i], NPC_NAMES[i]]);
    }
  }
  return pairs;
}

export function getLocationLabel(id) {
  const loc = (data.locations || []).find(l => l.id === id);
  if (loc) return loc.name || id;
  return LOCATION_LABELS[id] || id || '';
}

export function getNPCLabel(id) {
  const npc = (data.npcs || []).find(n => n.id === id);
  if (npc) return npc.name || id;
  const idx = NPC_IDS.indexOf(id);
  return idx >= 0 ? NPC_NAMES[idx] : (id || '');
}

// ── HTML escape ──
export function esc(s) { if (s === null || s === undefined) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Basic form fields ──
export function fld(label, id, value, type, placeholder, disabled) {
  return `<div><label>${label}</label><input type="${type||'text'}" id="${id}" value="${esc(value)}" placeholder="${placeholder||''}" ${disabled?'disabled':''}></div>`;
}
export function sel(label, id, value, options) {
  let h = `<div><label>${label}</label><select id="${id}">`;
  options.forEach(([v, l]) => { h += `<option value="${v}" ${v===value?'selected':''}>${l}</option>`; });
  h += '</select></div>';
  return h;
}

// ── Stat requirements / deltas ──
export function renderStatReqs(prefix, arr, isDelta) {
  let h = `<div><label>${isDelta?'属性变化':'属性要求'}</label><div id="${prefix}_c">`;
  arr.forEach((s, i) => {
    h += `<div class="inline-row">
      <select id="${prefix}_${i}_s">${STAT_NAMES.map((n,j)=>`<option value="${j}" ${j===s.stat?'selected':''}>${n}</option>`).join('')}</select>
      ${isDelta ? `<input type="number" id="${prefix}_${i}_v" value="${s.delta||0}" placeholder="变化值" style="width:80px;">` :
        `<select id="${prefix}_${i}_op" style="width:70px;">${OPS.map(o=>`<option value="${o}" ${o===s.op?'selected':''}>${o}</option>`).join('')}</select><input type="number" id="${prefix}_${i}_v" value="${s.value||0}" placeholder="值" style="width:80px;">`}
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`;
  });
  h += `</div><button class="btn-sm" onclick="window._addStat('${prefix}',${isDelta})">+ 添加</button></div>`;
  return h;
}
window._addStat = function(prefix, isDelta) {
  const c = document.getElementById(prefix+'_c'); if (!c) return;
  const i = c.children.length;
  const div = document.createElement('div'); div.className = 'inline-row';
  div.innerHTML = `<select id="${prefix}_${i}_s">${STAT_NAMES.map((n,j)=>`<option value="${j}">${n}</option>`).join('')}</select>
    ${isDelta ? `<input type="number" id="${prefix}_${i}_v" value="0" placeholder="变化值" style="width:80px;">` :
      `<select id="${prefix}_${i}_op" style="width:70px;">${OPS.map(o=>`<option value="${o}">${o}</option>`).join('')}</select><input type="number" id="${prefix}_${i}_v" value="0" placeholder="值" style="width:80px;">`}
    <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(div);
};

export function readStatReqs(prefix, isDelta) {
  const c = document.getElementById(prefix+'_c'); if (!c) return [];
  const result = [];
  c.querySelectorAll('.inline-row').forEach(row => {
    const sels = row.querySelectorAll('select'); const inp = row.querySelector('input');
    if (!sels.length || !inp) return;
    const stat = parseInt(sels[0].value);
    if (isDelta) { const d = parseInt(inp.value)||0; if (d) result.push({stat, delta:d}); }
    else { const op = sels.length>1 ? sels[1].value : '>='; const v = parseInt(inp.value)||0; result.push({stat, op, value:v}); }
  });
  return result;
}

// ── String list (flags) ──
export function renderStringList(prefix, label, arr) {
  let h = `<div><label>${label}</label><div id="${prefix}_c">`;
  arr.forEach((s,i) => { h += `<div class="inline-row"><input value="${esc(s)}" id="${prefix}_${i}"><button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`; });
  h += `</div><button class="btn-sm" onclick="window._addStr('${prefix}')">+ 添加</button></div>`;
  return h;
}
window._addStr = function(prefix) {
  const c = document.getElementById(prefix+'_c'); if (!c) return;
  const i = c.children.length;
  const div = document.createElement('div'); div.className = 'inline-row';
  div.innerHTML = `<input id="${prefix}_${i}"><button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(div);
};
export function readStringList(prefix) {
  const c = document.getElementById(prefix+'_c'); if (!c) return [];
  const result = [];
  c.querySelectorAll('input').forEach(inp => { const v = inp.value.trim(); if (v) result.push(v); });
  return result;
}

// ── Phase selector ──
export function renderPhaseSel(prefix, label, value) {
  const none = (value===undefined||value===null||value==='')?'selected':'';
  return `<div><label>${label}</label><select id="${prefix}"><option value="" ${none}>— 不限 —</option>${PHASES.map(p=>`<option value="${p}" ${value===p?'selected':''}>${p}</option>`).join('')}</select></div>`;
}
export function readPhaseVal(prefix) { const v = document.getElementById(prefix)?.value; return (!v) ? null : v; }

// ── Day selector ──
export function renderDaySel(prefix, label, value) {
  const none = (value===undefined||value===null||value==='')?'selected':'';
  return `<div><label>${label}</label><select id="${prefix}"><option value="" ${none}>— 不限 —</option>${[1,2,3,4,5,6,7].map(d=>`<option value="${d}" ${value===d?'selected':''}>第${d}天</option>`).join('')}</select></div>`;
}
export function readDayVal(prefix) { const v = document.getElementById(prefix)?.value; if (!v) return null; return parseInt(v); }

// ── Day range ──
export function renderDayRange(prefix, arr) {
  return `<div><label>日期范围</label><div class="inline-row">
    <input type="number" id="${prefix}_0" value="${arr[0]||''}" placeholder="起始" min="1" max="7" style="width:80px;">
    <span>—</span>
    <input type="number" id="${prefix}_1" value="${arr[1]||''}" placeholder="结束" min="1" max="7" style="width:80px;"></div></div>`;
}
export function readDayRange(prefix) { const a=parseInt(document.getElementById(prefix+'_0')?.value), b=parseInt(document.getElementById(prefix+'_1')?.value); if(isNaN(a)||isNaN(b)) return null; return [a,b]; }

// ── Money requirement ──
export function renderMoneyReq(prefix, label, value) {
  const v = value || {};
  return `<div><label>${label}</label><div class="inline-row">
    <select id="${prefix}_op">${OPS.map(o=>`<option value="${o}" ${o===(v.op||'>=')?'selected':''}>${o}</option>`).join('')}</select>
    <input type="number" id="${prefix}_v" value="${v.value??''}" placeholder="金额"></div></div>`;
}
export function readMoneyReq(prefix) { const op=document.getElementById(prefix+'_op')?.value, v=parseInt(document.getElementById(prefix+'_v')?.value); if(isNaN(v)) return null; return {op, value:v}; }

// ── Relationship deltas ──
function _npcOptions(selectedId) {
  return getNPCPairs().map(([id, name]) => `<option value="${id}" ${id===selectedId?'selected':''}>${esc(name)}</option>`).join('');
}

export function renderRelDeltas(prefix, arr) {
  let h = `<div><label>关系变化</label><div id="${prefix}_c">`;
  arr.forEach((r,i) => {
    h += `<div class="inline-row">
      <select id="${prefix}_${i}_n">${_npcOptions(r.npc_id)}</select>
      <input type="number" id="${prefix}_${i}_v" value="${r.delta||0}" placeholder="变化值" style="width:80px;">
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`;
  });
  h += `</div><button class="btn-sm" onclick="window._addRelD('${prefix}')">+ 添加</button></div>`;
  return h;
}
window._addRelD = function(prefix) {
  const c = document.getElementById(prefix+'_c'); if (!c) return;
  const i = c.children.length;
  const div = document.createElement('div'); div.className = 'inline-row';
  div.innerHTML = `<select id="${prefix}_${i}_n">${_npcOptions('')}</select>
    <input type="number" id="${prefix}_${i}_v" value="0" placeholder="变化值" style="width:80px;">
    <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(div);
};
export function readRelDeltas(prefix) {
  const c = document.getElementById(prefix+'_c'); if (!c) return [];
  const result = [];
  c.querySelectorAll('.inline-row').forEach(row => {
    const sel=row.querySelector('select'), inp=row.querySelector('input');
    if(!sel||!inp) return; const d=parseInt(inp.value)||0; if(d) result.push({npc_id:sel.value, delta:d});
  });
  return result;
}

// ── Relationship requirements ──
export function renderRelReqs(prefix, arr) {
  let h = `<div><label>关系要求</label><div id="${prefix}_c">`;
  arr.forEach((r,i) => {
    h += `<div class="inline-row">
      <select id="${prefix}_${i}_n">${_npcOptions(r.npc_id)}</select>
      <select id="${prefix}_${i}_op" style="width:70px;">${OPS.map(o=>`<option value="${o}" ${o===r.op?'selected':''}>${o}</option>`).join('')}</select>
      <input type="number" id="${prefix}_${i}_v" value="${r.value||0}" placeholder="值" style="width:80px;">
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`;
  });
  h += `</div><button class="btn-sm" onclick="window._addRelR('${prefix}')">+ 添加</button></div>`;
  return h;
}
window._addRelR = function(prefix) {
  const c = document.getElementById(prefix+'_c'); if (!c) return;
  const i = c.children.length;
  const div = document.createElement('div'); div.className = 'inline-row';
  div.innerHTML = `<select id="${prefix}_${i}_n">${_npcOptions('')}</select>
    <select id="${prefix}_${i}_op" style="width:70px;">${OPS.map(o=>`<option value="${o}">${o}</option>`).join('')}</select>
    <input type="number" id="${prefix}_${i}_v" value="0" placeholder="值" style="width:80px;">
    <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(div);
};
export function readRelReqs(prefix) {
  const c = document.getElementById(prefix+'_c'); if (!c) return [];
  const result = [];
  c.querySelectorAll('.inline-row').forEach(row => {
    const sels=row.querySelectorAll('select'), inp=row.querySelector('input');
    if(sels.length<2||!inp) return; result.push({npc_id:sels[0].value, op:sels[1].value, value:parseInt(inp.value)||0});
  });
  return result;
}

// ════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════
function hasDuplicateId(item, items) {
  return (items || []).filter(x => x !== item && x.id === item.id).length > 0;
}

function hasId(items, id) {
  return !id || (items || []).some(x => x.id === id);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function validateAction(a, allActions) {
  if (!a.id) return '行动ID不能为空';
  if (a.id.includes('/')) return '行动ID不能含 "/"';
  if (!a.name) return '行动名称不能为空';
  if (allActions.filter(x => x !== a && x.id === a.id).length) return '行动ID重复：' + a.id;
  if (a.time_cost < 0) return '消耗时段不能为负数';
  if (a.max_per_day < 0) return '每日上限不能为负数';
  if (!isNonNegativeInteger(a.time_cost)) return '消耗时段必须是非负整数';
  if (!isNonNegativeInteger(a.max_per_day)) return '每日上限必须是非负整数';
  if (a.location && !hasId(data.locations, a.location)) return '行动引用了不存在的地点：' + a.location;
  return null;
}

export function validateEvent(e, allEvents) {
  if (!e.id) return '事件ID不能为空';
  if (e.id.includes('/')) return '事件ID不能含 "/"';
  if (!e.name) return '事件名称不能为空';
  if (allEvents.filter(x => x !== e && x.id === e.id).length) return '事件ID重复：' + e.id;
  if (e.trigger_type === 'action_complete' && !e.trigger_detail) return '行动完成触发器需要填写行动ID';
  if (e.trigger_type === 'action_complete' && !hasId(data.actions, e.trigger_detail)) return '事件引用了不存在的行动：' + e.trigger_detail;
  if (e.trigger_type === 'location' && !e.trigger_detail) return '地点触发器需要填写地点ID';
  if (e.trigger_type === 'location' && !hasId(data.locations, e.trigger_detail)) return '事件引用了不存在的地点：' + e.trigger_detail;
  return null;
}

export function validateLocation(l, allLocations) {
  if (!l.id) return '地点ID不能为空';
  if (l.id.includes('/')) return '地点ID不能含 "/"';
  if (!l.name) return '地点名称不能为空';
  if (hasDuplicateId(l, allLocations)) return '地点ID重复：' + l.id;
  if (l.map_id && !hasId(data.maps, l.map_id)) return '地点引用了不存在的地图：' + l.map_id;
  return null;
}

export function validateNPC(n, allNPCs) {
  if (!n.id) return 'NPC ID不能为空';
  if (n.id.includes('/')) return 'NPC ID不能含 "/"';
  if (!n.name) return 'NPC名称不能为空';
  if (hasDuplicateId(n, allNPCs)) return 'NPC ID重复：' + n.id;
  if (n.map_id && !hasId(data.maps, n.map_id)) return 'NPC引用了不存在的地图：' + n.map_id;
  return null;
}

export function validateMap(m, allMaps) {
  if (!m.id) return '地图ID不能为空';
  if (m.id.includes('/')) return '地图ID不能含 "/"';
  if (!m.name) return '地图名称不能为空';
  if (hasDuplicateId(m, allMaps)) return '地图ID重复：' + m.id;
  if (!isPositiveNumber(m.width)) return '地图宽度必须大于0';
  if (!isPositiveNumber(m.height)) return '地图高度必须大于0';
  return null;
}

export function validateGameConfig(gc) {
  if (gc.starting_map && !hasId(data.maps, gc.starting_map)) return '初始地图不存在：' + gc.starting_map;
  if (gc.starting_location && !hasId(data.locations, gc.starting_location)) return '初始地点不存在：' + gc.starting_location;
  if (gc.stat_min > gc.stat_max) return '属性下限不能大于属性上限';
  return null;
}

export function validateDialogueNode(n, nodes) {
  if (n.id !== 'start' && n.id !== 'end') {
    if (!n.id) return '节点ID不能为空';
    if (nodes.filter(x => x !== n && x.id === n.id).length) return '节点ID重复：' + n.id;
  }
  if (!n.text && !n.next && !(n.choices||[]).length) return '节点至少需要文本、下一节点或选项之一';
  return null;
}

export function validateMessage(m, messages) {
  if (!m.id) return '消息ID不能为空';
  if (!m.sender) return '发送者不能为空';
  if (!m.text) return '消息内容不能为空';
  if (messages.filter(x => x !== m && x.id === m.id).length) return '消息ID重复：' + m.id;
  return null;
}
