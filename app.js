import { createClient } from '@supabase/supabase-js';

// ════════════════════════════════════════════
// CONFIG — 部署前修改这里
// ════════════════════════════════════════════
const SUPABASE_URL = 'https://vgvghwcqcedycgpcvale.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZndmdod2NxY2VkeWNncGN2YWxlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2OTU4NiwiZXhwIjoyMDk0ODQ1NTg2fQ.2XFkZEYa5VdR_2H-t-GbHuvpmoh-CSHvZJkNK4sJvds';
const ACCESS_KEY = 'band2025';                // 团队共享密钥，自己改一个
// ════════════════════════════════════════════

let supabase = null;
let clientId = sessionStorage.getItem('band_client_id') || ('u_' + Math.random().toString(36).slice(2,10));
sessionStorage.setItem('band_client_id', clientId);

// ── Constants ──
const STAT_NAMES = ['演奏力','创作力','社交力','魅力','执行力','精神状态'];
const PHASES = ['早晨','下午','傍晚','深夜'];
const LOCATIONS = ['livehouse','rehearsal_room','rental_room','bar','poster_wall'];
const LOCATION_LABELS = { livehouse:'Livehouse', rehearsal_room:'排练室', rental_room:'出租屋', bar:'酒吧', poster_wall:'海报墙' };
const TRIGGER_TYPES = ['phase_start','action_complete','location','stat_threshold','week_end'];
const TRIGGER_LABELS = { phase_start:'进入时段', action_complete:'完成行动后', location:'进入地点时', stat_threshold:'属性达标', week_end:'一周结束时' };
const OPS = ['>=','<=','>','<','==','!='];
const NPC_IDS = ['npc_xiao_ming','npc_lao_wang','npc_zhang_jie','npc_li_ge','npc_chen_lao_shi'];
const NPC_NAMES = ['小明','老王','张姐','李哥','陈老师'];

// ── State ──
let currentTab = 'actions';
let selectedIdx = -1;
let selectedDialogueIdx = -1;
let selectedChatIdx = -1;
let data = { actions: [], events: [], dialogues: {}, phone_chats: [] };
let userName = '';

// ════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════
window.doLogin = function() {
  if (window._appInitialized) return;
  const key = document.getElementById('login-key').value.trim();
  const name = document.getElementById('login-name').value.trim();
  if (key !== ACCESS_KEY) {
    document.getElementById('login-error').style.display = 'block';
    return;
  }
  userName = name || clientId;

  const remember = document.getElementById('login-remember')?.checked !== false; // default true
  const store = remember ? localStorage : sessionStorage;
  store.setItem('band_logged_in', 'true');
  store.setItem('band_user_name', userName);
  // Also set both so auto-login finds it regardless
  if (remember) {
    sessionStorage.setItem('band_logged_in', 'true');
    sessionStorage.setItem('band_user_name', userName);
  }

  initApp();
};

// ── Mobile detection ──
function isMobile() { return window.innerWidth <= 768; }

// ── Mobile navigation state ──
let mobilePhoneView = 'list';       // 'list' | 'chat'
let mobileDialogueView = 'list';    // 'list' | 'nodes' | 'editor'
let mobileEditingNodeIdx = -1;
let mobileEditingMsgIdx = -1;

// Auto-login: check sessionStorage first, then localStorage
if (sessionStorage.getItem('band_logged_in') === 'true' ||
    localStorage.getItem('band_logged_in') === 'true') {
  userName = sessionStorage.getItem('band_user_name') ||
             localStorage.getItem('band_user_name') || clientId;
  // Wait for DOM + importmap to be ready, then auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Small delay to ensure importmap module is loaded
      setTimeout(initApp, 50);
    });
  } else {
    setTimeout(initApp, 50);
  }
}

// ════════════════════════════════════════════
// APP INIT
// ════════════════════════════════════════════
async function initApp() {
  if (window._appInitialized) return;
  window._appInitialized = true;

  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    document.getElementById('login-error').textContent = 'Supabase 尚未配置，请联系开发者设置 SUPABASE_URL 和 SUPABASE_ANON_KEY';
    document.getElementById('login-error').style.display = 'block';
    return;
  }

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Persist login to both storages (one of them will have the authoritative flag)
  if (!sessionStorage.getItem('band_logged_in')) {
    sessionStorage.setItem('band_logged_in', 'true');
  }

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // Warn before leaving page with unsaved edits
  window.addEventListener('beforeunload', function(e) {
    if (isEditing()) e.preventDefault();
  });

  // Setup tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('mobile-tab-select').addEventListener('change', function() {
    switchTab(this.value);
  });

  // Mobile online dots: tap to toggle name bar
  const dotsEl = document.getElementById('online-dots');
  if (dotsEl) {
    dotsEl.addEventListener('click', function(e) {
      e.stopPropagation();
      const namesEl = document.getElementById('online-names');
      if (namesEl) namesEl.classList.toggle('show');
      setTimeout(() => { if (namesEl) namesEl.classList.remove('show'); }, 4000);
    });
  }

  // Realtime subscription + Presence
  const channel = supabase.channel('documents-changes', { config: { presence: { key: clientId } } });
  channel
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'documents' },
      payload => handleRealtimeChange(payload)
    )
    .on('presence', { event: 'sync' }, () => updateOnlineUsers(channel))
    .on('presence', { event: 'join' }, () => updateOnlineUsers(channel))
    .on('presence', { event: 'leave' }, () => updateOnlineUsers(channel))
    .subscribe(async (status) => {
      updateConnStatus(status === 'SUBSCRIBED' ? 'online' : 'offline');
      if (status === 'SUBSCRIBED') {
        await channel.track({ name: userName, clientId: clientId });
      }
    });

  await pullFromDB();
  switchTab('actions');
}

function updateConnStatus(status) {
  const dot = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');
  dot.className = status;
  text.textContent = status === 'online' ? '已连接' : status === 'offline' ? '离线' : '连接中';
}

function updateOnlineUsers(channel) {
  const state = channel.presenceState();
  const users = [];
  Object.values(state).forEach(arr => {
    if (Array.isArray(arr)) {
      arr.forEach(u => {
        if (u.clientId && !users.find(x => x.clientId === u.clientId)) {
          users.push(u);
        }
      });
    }
  });

  // Desktop: full name list in sidebar
  const desktopEl = document.getElementById('online-users-desktop');
  if (desktopEl) {
    if (users.length <= 1) {
      desktopEl.innerHTML = '<div class="online-hint">仅你在线</div>';
    } else {
      let html = '<div class="online-section-label">在线成员</div>';
      users.forEach(u => {
        html += `<div class="online-user"><span class="online-dot-color"></span>${esc(u.name || u.clientId)}</div>`;
      });
      desktopEl.innerHTML = html;
    }
  }

  // Mobile: dots only (tap to expand)
  const dotsEl = document.getElementById('online-dots');
  if (dotsEl) {
    let dotsHtml = '';
    const maxDots = Math.min(users.length, 5);
    for (let i = 0; i < maxDots; i++) {
      dotsHtml += '<span class="online-dot-color-mobile"></span>';
    }
    dotsEl.innerHTML = dotsHtml;
    dotsEl.title = users.map(u => u.name || u.clientId).join('、');
  }

  // Mobile expandable name bar
  const namesEl = document.getElementById('online-names');
  if (namesEl) {
    namesEl.innerHTML = users.map(u => `<span>${esc(u.name || u.clientId)}</span>`).join(' · ');
  }
}

function handleRealtimeChange(payload) {
  // payload: { eventType, new, old, table, schema }
  const row = payload.new || payload.old;
  if (!row) return;

  // Skip own changes (all event types)
  if (row.updated_by === userName) return;

  const action = payload.eventType === 'DELETE' ? '删除了' : '更新了';
  const who = row.updated_by || '未知';

  // Don't touch data or UI if user is editing, to avoid crashes and lost edits
  if (isEditing()) {
    toast(`📡 ${who} ${action}「${row.id}」— 请保存后刷新查看`, 'info');
    return;
  }

  if (payload.eventType === 'DELETE') {
    removeDocumentRow(row);
  } else {
    applyDocumentRow(row);
  }

  // Re-render current tab
  switchTab(currentTab, true); // silent = don't re-fetch

  toast(`📡 ${who} ${action}「${row.id}」`, 'info');
}

function isEditing() {
  return document.getElementById('actionDetail') ||
         document.getElementById('eventDetail') ||
         document.getElementById('msgEditor') ||
         document.getElementById('bottom-sheet-overlay') ||
         document.getElementById('btn-node-save') ||
         document.getElementById('btn-node-save-m');
}

function applyDocumentRow(row) {
  switch (row.type) {
    case 'actions':
      data.actions = Array.isArray(row.data) ? row.data : JSON.parse(row.data);
      break;
    case 'events':
      data.events = Array.isArray(row.data) ? row.data : JSON.parse(row.data);
      break;
    case 'dialogues':
      data.dialogues[row.id.replace('dialogues/', '')] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      break;
    case 'phone_chats':
      data.phone_chats = Array.isArray(row.data) ? row.data : JSON.parse(row.data);
      break;
  }
}

function removeDocumentRow(row) {
  switch (row.type) {
    case 'actions':
      data.actions = [];
      break;
    case 'events':
      data.events = [];
      break;
    case 'dialogues':
      delete data.dialogues[row.id.replace('dialogues/', '')];
      selectedDialogueIdx = -1;
      break;
    case 'phone_chats':
      data.phone_chats = [];
      break;
  }
}

// ════════════════════════════════════════════
// DATA OPS
// ════════════════════════════════════════════
async function pullFromDB() {
  if (!supabase) return;
  try {
    const { data: rows, error } = await supabase.from('documents').select('*');
    if (error) { toast('拉取失败: ' + error.message, true); return; }
    if (!rows || rows.length === 0) {
      toast('数据库为空，请先导入数据');
      return;
    }
    data = { actions: [], events: [], dialogues: {}, phone_chats: [] };
    rows.forEach(row => applyDocumentRow(row));
    switchTab(currentTab, true);
    toast('已从数据库同步');
  } catch (e) {
    toast('连接失败: ' + e.message, true);
  }
}
window.pullFromDB = pullFromDB;

async function saveDoc(id, type, docData) {
  if (!supabase) return toast('未连接数据库', true);
  try {
    const payload = {
      id, type,
      data: docData,
      updated_by: userName,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from('documents').upsert(payload, { onConflict: 'id' });
    if (error) { toast('保存失败: ' + error.message, true); return false; }
    return true;
  } catch (e) {
    toast('保存失败: ' + e.message, true);
    return false;
  }
}

// ════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════
function validateAction(a, allActions) {
  if (!a.id) return '行动ID不能为空';
  if (a.id.includes('/')) return '行动ID不能含 "/"';
  if (!a.name) return '行动名称不能为空';
  if (allActions.filter(x => x !== a && x.id === a.id).length) return '行动ID重复：' + a.id;
  if (a.time_cost < 0) return '消耗时段不能为负数';
  if (a.max_per_day < 0) return '每日上限不能为负数';
  return null;
}

function validateEvent(e, allEvents) {
  if (!e.id) return '事件ID不能为空';
  if (e.id.includes('/')) return '事件ID不能含 "/"';
  if (!e.name) return '事件名称不能为空';
  if (allEvents.filter(x => x !== e && x.id === e.id).length) return '事件ID重复：' + e.id;
  return null;
}

function validateDialogueNode(n, nodes) {
  if (n.id !== 'start' && n.id !== 'end') {
    if (!n.id) return '节点ID不能为空';
    if (nodes.filter(x => x !== n && x.id === n.id).length) return '节点ID重复：' + n.id;
  }
  if (!n.text && !n.next && !(n.choices||[]).length) return '节点至少需要文本、下一节点或选项之一';
  return null;
}

function validateMessage(m, messages) {
  if (!m.id) return '消息ID不能为空';
  if (!m.sender) return '发送者不能为空';
  if (!m.text) return '消息内容不能为空';
  if (messages.filter(x => x !== m && x.id === m.id).length) return '消息ID重复：' + m.id;
  return null;
}

// ════════════════════════════════════════════
// TAB SWITCHING
// ════════════════════════════════════════════
function switchTab(tab, silent) {
  if (isEditing() && !confirm('你有未保存的编辑，确定离开吗？')) return;
  currentTab = tab; selectedIdx = -1; selectedDialogueIdx = -1; selectedChatIdx = -1;
  mobilePhoneView = 'list'; mobileDialogueView = 'list'; mobileEditingNodeIdx = -1;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const sel = document.getElementById('mobile-tab-select');
  if (sel) sel.value = tab;
  document.getElementById('toolbar').innerHTML = '';
  document.getElementById('content').innerHTML = '';
  if (!silent) {
    document.getElementById('presence-bar').textContent = `当前用户：${userName}`;
  }
  switch(tab) {
    case 'actions': renderActions(); break;
    case 'events': renderEvents(); break;
    case 'dialogues': renderDialogues(); break;
    case 'phone': renderPhone(); break;
  }
}

// ── Toast ──
function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : (msg.startsWith('📡') ? ' info' : ''));
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ── Utility ──
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, '\t')], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════
// TOOLBAR BUILDER
// ════════════════════════════════════════════
function buildToolbar(cfg) {
  return `<span>${cfg.icon} ${cfg.label}</span>
    <span class="hint">共 ${cfg.count} 个${cfg.unit}</span>
    <input type="search" id="search-${cfg.id}" placeholder="搜索..." style="width:110px;">
    <button class="btn-ok" id="btn-add-${cfg.id}">+ ${cfg.addLabel}</button>
    <button id="btn-import-${cfg.id}">📥 导入文件</button>
    <button id="btn-export-${cfg.id}">📤 ${cfg.exportLabel}</button>`;
}

// ════════════════════════════════════════════
// ACTIONS TAB
// ════════════════════════════════════════════
window.renderActions = function() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = buildToolbar({ icon: '⚡', label: '行动列表', unit: '行动', count: data.actions.length, id: 'action', addLabel: '新增', exportLabel: '导出文件' });
  document.getElementById('btn-add-action').onclick = addAction;
  document.getElementById('btn-import-action').onclick = () => importJSON('actions');
  document.getElementById('btn-export-action').onclick = exportAction;

  const ct = document.getElementById('content');
  if (data.actions.length === 0) {
    ct.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px;">暂无行动，点击「新增」或「从数据库拉取」</p>';
    return;
  }

  // Filter
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
        <td>${LOCATION_LABELS[a.location]||a.location||''}</td>
        <td>${a.time_cost ?? 1}</td><td>${a.max_per_day || '—'}</td>
        <td>${fx}</td>
        <td><button class="btn-sm btn-danger" data-del="${i}">✕</button></td></tr>`;
    });
    html += '</tbody></table>';
    ct.innerHTML = html;

    // Bind events
    ct.querySelectorAll('tr[data-idx]').forEach(tr => {
      tr.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        selectedIdx = parseInt(this.dataset.idx);
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
};

function effectsSummary(fx) {
  const parts = [];
  if (fx.money) parts.push('💰'+fx.money);
  if (fx.stats) fx.stats.forEach(s => parts.push(STAT_NAMES[s.stat]+(s.delta>0?'+':'')+s.delta));
  if (fx.relationships) fx.relationships.forEach(r => parts.push((NPC_NAMES[NPC_IDS.indexOf(r.npc_id)]||r.npc_id)+(r.delta>0?'+':'')+r.delta));
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
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('ID','act_id',a.id);
  html += fld('名称','act_name',a.name);
  html += fld('描述','act_desc',a.description||'');
  html += sel('地点','act_loc',a.location||'', Object.entries(LOCATION_LABELS).map(([k,v])=>[k,v]));
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

  html += '<div class="detail-actions"><button class="btn-ok" id="btn-save-action">💾 保存到数据库</button></div>';
  html += '</div>';
  ct.insertAdjacentHTML('beforeend', html);
  document.getElementById('btn-save-action').onclick = saveActionDetail;
}

async function saveActionDetail() {
  const a = data.actions[selectedIdx];
  a.id = document.getElementById('act_id').value.trim();
  a.name = document.getElementById('act_name').value.trim();
  a.description = document.getElementById('act_desc').value.trim();
  a.location = document.getElementById('act_loc').value;
  a.time_cost = parseInt(document.getElementById('act_tc').value) || 1;
  a.max_per_day = parseInt(document.getElementById('act_mpd').value) || 1;

  const err = validateAction(a, data.actions);
  if (err) { toast(err, true); return; }

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

  if (await saveDoc('actions', 'actions', data.actions)) {
    toast('已保存');
    renderActions();
  }
}

function addAction() {
  const id = prompt('行动ID（英文下划线，如 practice_2）：');
  if (!id) return;
  if (data.actions.find(a => a.id === id)) { toast('该ID已存在', true); return; }
  data.actions.push({id, name:'新行动', description:'', location:'livehouse', time_cost:1, requirements:{}, effects:{}, max_per_day:1});
  selectedIdx = data.actions.length - 1;
  saveDoc('actions', 'actions', data.actions).then(ok => { if (ok) renderActions(); });
}

function deleteAction(i) {
  if (!confirm('确定删除「'+data.actions[i].name+'」？')) return;
  data.actions.splice(i, 1);
  if (selectedIdx >= data.actions.length) selectedIdx = Math.max(0, data.actions.length - 1);
  saveDoc('actions', 'actions', data.actions).then(ok => { if (ok) renderActions(); });
}

function exportAction() { downloadJSON('actions.json', data.actions); toast('已导出 actions.json'); }

// ════════════════════════════════════════════
// EVENTS TAB
// ════════════════════════════════════════════
window.renderEvents = function() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = buildToolbar({ icon: '📋', label: '事件列表', unit: '事件', count: data.events.length, id: 'event', addLabel: '新增', exportLabel: '导出文件' });
  document.getElementById('btn-add-event').onclick = addEvent;
  document.getElementById('btn-import-event').onclick = () => importJSON('events');
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
        selectedIdx = parseInt(this.dataset.idx);
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
};

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

  html += '<div class="detail-actions"><button class="btn-ok" id="btn-save-event">💾 保存到数据库</button></div>';
  html += '</div>';
  ct.insertAdjacentHTML('beforeend', html);
  document.getElementById('btn-save-event').onclick = saveEventDetail;
}

async function saveEventDetail() {
  const e = data.events[selectedIdx];
  e.id = document.getElementById('evt_id').value.trim();
  e.name = document.getElementById('evt_name').value.trim();
  e.trigger_type = document.getElementById('evt_tt').value;
  e.trigger_detail = document.getElementById('evt_td').value.trim() || null;
  if (!e.trigger_detail) delete e.trigger_detail;
  e.one_shot = document.getElementById('evt_os')?.checked || false;

  const err = validateEvent(e, data.events);
  if (err) { toast(err, true); return; }

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

  if (await saveDoc('events', 'events', data.events)) {
    toast('已保存');
    renderEvents();
  }
}

function addEvent() {
  const id = prompt('事件ID（英文下划线，如 landlord_visit）：');
  if (!id) return;
  if (data.events.find(e => e.id === id)) { toast('该ID已存在', true); return; }
  data.events.push({id, name:'新事件', trigger_type:'phase_start', conditions:{}, effects:{}, one_shot:true});
  selectedIdx = data.events.length-1;
  saveDoc('events', 'events', data.events).then(ok => { if (ok) renderEvents(); });
}
function deleteEvent(i) {
  if (!confirm('确定删除「'+data.events[i].name+'」？')) return;
  data.events.splice(i,1);
  if (selectedIdx>=data.events.length) selectedIdx=-1;
  saveDoc('events', 'events', data.events).then(ok => { if (ok) renderEvents(); });
}
function exportEvent() { downloadJSON('events.json', data.events); toast('已导出 events.json'); }

// ════════════════════════════════════════════
// DIALOGUES TAB
// ════════════════════════════════════════════
window.renderDialogues = function() {
  const tb = document.getElementById('toolbar');
  const allKeys = Object.keys(data.dialogues);
  tb.innerHTML = buildToolbar({ icon: '💬', label: '对话编辑器', unit: '对话', count: allKeys.length, id: 'dialogue', addLabel: '新建对话', exportLabel: '全部导出' });
  document.getElementById('btn-add-dialogue').onclick = addDialogue;
  document.getElementById('btn-import-dialogue').onclick = importDialogueFiles;
  document.getElementById('btn-export-dialogue').onclick = exportAllDialogues;

  const ct = document.getElementById('content');

  if (isMobile()) {
    renderDialoguesMobile();
    return;
  }

  if (allKeys.length === 0) {
    ct.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px;">暂无对话</p>';
    return;
  }

  const q = (document.getElementById('search-dialogue').value || '').toLowerCase();
  const keys = q ? allKeys.filter(k => k.toLowerCase().includes(q)) : allKeys;

  let html = '<div class="split-layout">';
  html += '<div class="split-list">';
  keys.forEach((k,i) => {
    const origIdx = allKeys.indexOf(k);
    html += `<div class="list-item ${origIdx===selectedDialogueIdx?'active':''}" data-di="${origIdx}">${esc(k)}</div>`;
  });
  html += '</div>';

  if (selectedDialogueIdx >= 0 && selectedDialogueIdx < allKeys.length && keys.includes(allKeys[selectedDialogueIdx])) {
    const dk = keys[selectedDialogueIdx];
    const d = data.dialogues[dk];
    html += '<div class="split-content">';
    html += `<h4 style="color:var(--accent2);margin-bottom:4px;">${esc(dk)}</h4>`;
    html += `<div style="margin-bottom:8px;"><button class="btn-sm btn-ok" id="btn-add-node">+ 添加节点</button></div>`;
    const nodes = d.nodes || [];
    if (nodes.length === 0) {
      html += '<p style="color:var(--text2);">暂无节点</p>';
    } else {
      html += '<table><thead><tr><th>节点ID</th><th>说话人</th><th>文本</th><th>下一节点</th><th>选项数</th><th></th></tr></thead><tbody>';
      nodes.forEach((n, ni) => {
        html += `<tr>
          <td>${esc(n.id)}</td><td>${esc(n.speaker||'')}</td>
          <td>${esc((n.text||'').substring(0,40))}${(n.text||'').length>40?'…':''}</td>
          <td>${n.next||'—'}</td><td>${(n.choices||[]).length||'—'}</td>
          <td>
            <button class="btn-sm" data-edit="${ni}">✎</button>
            <button class="btn-sm btn-danger" data-del="${ni}">✕</button>
          </td></tr>`;
      });
      html += '</tbody></table>';
    }
    html += '</div>';
  }
  html += '</div>';
  ct.innerHTML = html;

  // Bind list clicks
  ct.querySelectorAll('.list-item').forEach(item => {
    item.addEventListener('click', function() {
      selectedDialogueIdx = parseInt(this.dataset.di);
      renderDialogues();
    });
  });

  // Bind node buttons
  const btnAddNode = ct.querySelector('#btn-add-node');
  if (btnAddNode) btnAddNode.onclick = addDialogueNode;
  ct.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.addEventListener('click', function() { editDialogueNode(parseInt(this.dataset.edit)); });
  });
  ct.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', function() { deleteDialogueNode(parseInt(this.dataset.del)); });
  });

  document.getElementById('search-dialogue').addEventListener('input', renderDialogues);
};

function addDialogue() {
  const id = prompt('对话ID（英文下划线，如 npc_某人）：');
  if (!id) return;
  if (data.dialogues[id]) { toast('该ID已存在', true); return; }
  data.dialogues[id] = { dialogue_id: id, nodes: [{id:'start', speaker:'', text:''}, {id:'end', text:''}] };
  selectedDialogueIdx = Object.keys(data.dialogues).indexOf(id);
  saveDoc('dialogues/'+id, 'dialogues', data.dialogues[id]).then(ok => { if (ok) renderDialogues(); });
  toast('已创建：'+id);
}

function deleteDialogueNode(ni) {
  const keys = Object.keys(data.dialogues);
  const dk = keys[selectedDialogueIdx];
  if (!dk) return;
  const nodes = data.dialogues[dk].nodes;
  if (nodes[ni].id === 'start' || nodes[ni].id === 'end') { toast('start 和 end 节点不可删除', true); return; }
  if (!confirm('确定删除节点「'+nodes[ni].id+'」？')) return;
  nodes.splice(ni, 1);
  saveDoc('dialogues/'+dk, 'dialogues', data.dialogues[dk]).then(ok => { if (ok) renderDialogues(); });
}

function addDialogueNode() {
  const keys = Object.keys(data.dialogues);
  const dk = keys[selectedDialogueIdx];
  if (!dk) return;
  const id = prompt('节点ID（如 node_2）：');
  if (!id) return;
  data.dialogues[dk].nodes.push({id, speaker:'', text:'', next:''});
  saveDoc('dialogues/'+dk, 'dialogues', data.dialogues[dk]).then(ok => { if (ok) renderDialogues(); });
}

function editDialogueNode(ni) {
  const keys = Object.keys(data.dialogues);
  const dk = keys[selectedDialogueIdx];
  if (!dk) return;
  const n = data.dialogues[dk].nodes[ni];
  const ct = document.getElementById('content');

  let html = '<div class="split-layout">';
  html += '<div class="split-list">';
  keys.forEach((k,i) => {
    html += `<div class="list-item ${i===selectedDialogueIdx?'active':''}" data-di="${i}">${esc(k)}</div>`;
  });
  html += '</div>';
  html += '<div class="split-content">';
  html += `<h4 style="color:var(--accent2);">编辑节点：${esc(n.id)}</h4>`;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('节点ID','dln_id',n.id,'text','', n.id==='start'||n.id==='end');
  html += fld('说话人','dln_speaker',n.speaker||'','text','NPC名、旁白、系统');
  html += '</div>';
  html += '<label>文本</label><textarea id="dln_text" rows="2">'+esc(n.text||'')+'</textarea>';
  html += fld('下一节点','dln_next',n.next||'','text','与「选项」二选一');

  html += '<div class="section-label">玩家选项</div><div id="dln_choices">';
  (n.choices||[]).forEach((ch, ci) => {
    html += `<div class="inline-row" style="margin-bottom:4px;">
      <input placeholder="选项文本" value="${esc(ch.text||'')}" data-ci="${ci}" data-field="text" style="flex:2;">
      <input placeholder="跳转到" value="${esc(ch.next||'')}" data-ci="${ci}" data-field="next" style="flex:1;">
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`;
  });
  html += '</div><button class="btn-sm" id="btn-add-choice">+ 添加选项</button>';

  html += '<div class="section-label">节点效果</div>';
  const fx = n.effects || {};
  html += fld('金钱变化','dln_fx_money',fx.money??'', 'number');
  html += renderStatReqs('dln_fx_stats', fx.stats||[], true);
  html += renderRelDeltas('dln_fx_rels', fx.relationships||[]);
  html += renderStringList('dln_fx_flags', '设置 flag', fx.flags||[]);

  html += '<div class="detail-actions"><button id="btn-node-cancel">取消</button><button class="btn-ok" id="btn-node-save">💾 保存节点</button></div>';
  html += '</div></div>';
  ct.innerHTML = html;

  document.getElementById('btn-add-choice').onclick = function() {
    const ctr = document.getElementById('dln_choices');
    const div = document.createElement('div');
    div.className = 'inline-row';
    div.style.marginBottom = '4px';
    const ci = ctr.children.length;
    div.innerHTML = `<input placeholder="选项文本" data-ci="${ci}" data-field="text" style="flex:2;">
      <input placeholder="跳转到" data-ci="${ci}" data-field="next" style="flex:1;">
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
    ctr.appendChild(div);
  };
  document.getElementById('btn-node-cancel').onclick = renderDialogues;
  document.getElementById('btn-node-save').onclick = async function() {
    if (n.id !== 'start' && n.id !== 'end') n.id = document.getElementById('dln_id').value.trim();
    n.speaker = document.getElementById('dln_speaker').value.trim();
    n.text = document.getElementById('dln_text').value;
    n.next = document.getElementById('dln_next').value.trim() || undefined;

    const nodes = data.dialogues[dk].nodes;
    const err = validateDialogueNode(n, nodes);
    if (err) { toast(err, true); return; }

    const rows = document.querySelectorAll('#dln_choices .inline-row');
    const choices = [];
    rows.forEach(row => {
      const t = row.querySelector('[data-field="text"]')?.value || '';
      const nx = row.querySelector('[data-field="next"]')?.value || '';
      if (t || nx) choices.push({text: t, next: nx});
    });
    if (choices.length) n.choices = choices; else delete n.choices;
    if (!n.choices && !n.next) delete n.next;

    const fx = {};
    const fm = document.getElementById('dln_fx_money').value; if (fm !== '') fx.money = parseInt(fm);
    const fs = readStatReqs('dln_fx_stats', true); if (fs.length) fx.stats = fs;
    const fr = readRelDeltas('dln_fx_rels'); if (fr.length) fx.relationships = fr;
    const ffl = readStringList('dln_fx_flags'); if (ffl.length) fx.flags = ffl;
    if (Object.keys(fx).length) n.effects = fx; else delete n.effects;

    if (await saveDoc('dialogues/'+dk, 'dialogues', data.dialogues[dk])) {
      toast('节点已保存');
      renderDialogues();
    }
  };

  // Re-bind list clicks
  ct.querySelectorAll('.list-item').forEach(item => {
    item.addEventListener('click', function() {
      selectedDialogueIdx = parseInt(this.dataset.di);
      renderDialogues();
    });
  });
}

function importDialogueFiles() {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true; input.accept = '.json';
  input.onchange = async () => {
    const files = Array.from(input.files);
    if (!files.length) return;
    if (!confirm(`将导入 ${files.length} 个对话文件，确定？`)) return;
    let imported = 0;
    for (const f of files) {
      const text = await f.text();
      try {
        const obj = JSON.parse(text);
        const id = obj.dialogue_id || f.name.replace('.json','');
        data.dialogues[id] = obj;
        data.dialogues[id].dialogue_id = id;
        await saveDoc('dialogues/'+id, 'dialogues', obj);
        imported++;
      } catch(e) { toast('解析失败：'+f.name, true); }
    }
    renderDialogues();
    if (imported) toast(`已导入 ${imported} 个对话`);
  };
  input.click();
}

function exportAllDialogues() {
  Object.entries(data.dialogues).forEach(([id, obj]) => downloadJSON(id+'.json', obj));
  toast('已导出 '+Object.keys(data.dialogues).length+' 个对话文件');
}

// ════════════════════════════════════════════
// MOBILE DIALOGUES UI
// ════════════════════════════════════════════
function renderDialoguesMobile() {
  const ct = document.getElementById('content');
  const allKeys = Object.keys(data.dialogues);

  if (mobileDialogueView === 'nodes' && selectedDialogueIdx >= 0 && selectedDialogueIdx < allKeys.length) {
    renderMobileNodeList();
    return;
  }
  if (mobileDialogueView === 'editor' && selectedDialogueIdx >= 0 && mobileEditingNodeIdx >= 0) {
    renderMobileNodeEditor();
    return;
  }

  mobileDialogueView = 'list';
  mobileEditingNodeIdx = -1;

  if (allKeys.length === 0) {
    ct.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px;">暂无对话，点击「+ 新建对话」开始</p>';
    return;
  }

  const q = (document.getElementById('search-dialogue')?.value || '').toLowerCase();
  const keys = q ? allKeys.filter(k => k.toLowerCase().includes(q)) : allKeys;

  let html = '<div class="mobile-chat-list">';
  keys.forEach((k) => {
    const origIdx = allKeys.indexOf(k);
    const d = data.dialogues[k];
    const nodeCount = (d.nodes || []).length;
    html += `<div class="mobile-chat-card" data-di="${origIdx}">
      <div class="card-info">
        <div class="card-name">${esc(k)}</div>
        <div class="card-meta">${nodeCount} 个节点</div>
      </div>
      <span class="card-arrow">›</span>
    </div>`;
  });
  html += '</div>';
  ct.innerHTML = html;

  ct.querySelectorAll('.mobile-chat-card').forEach(card => {
    card.addEventListener('click', function() {
      selectedDialogueIdx = parseInt(this.dataset.di);
      mobileDialogueView = 'nodes';
      renderDialogues();
    });
  });
}

function renderMobileNodeList() {
  const ct = document.getElementById('content');
  const allKeys = Object.keys(data.dialogues);
  const dk = allKeys[selectedDialogueIdx];
  const d = data.dialogues[dk];
  const nodes = d.nodes || [];

  let html = '<div class="mobile-chat-view">';
  html += `<div class="mobile-chat-header">
    <button class="back-btn" id="btn-dlg-back">← ${esc(dk)}</button>
    <button class="btn-sm btn-ok" id="btn-dlg-add-node">+ 节点</button>
  </div>`;

  html += '<div class="mobile-node-list">';
  if (nodes.length === 0) {
    html += '<p style="color:var(--text2);text-align:center;padding:40px;">暂无节点</p>';
  } else {
    nodes.forEach((n, ni) => {
      const isSpecial = n.id === 'start' || n.id === 'end';
      html += `<div class="mobile-node-card" data-ni="${ni}">
        <div class="node-card-header">
          <span class="node-card-id ${isSpecial ? 'special' : ''}">${esc(n.id)}</span>
          <span class="node-card-speaker">${esc(n.speaker || '—')}</span>
          ${!isSpecial ? `<button class="btn-sm btn-danger node-card-del" data-ndel="${ni}">✕</button>` : ''}
        </div>
        <div class="node-card-text">${esc((n.text || '').substring(0, 60))}${(n.text || '').length > 60 ? '…' : ''}</div>
        <div class="node-card-meta">
          ${n.next ? '→ ' + esc(n.next) : ''}
          ${(n.choices || []).length ? ' · ' + n.choices.length + '个选项' : ''}
        </div>
      </div>`;
    });
  }
  html += '</div>';
  html += '</div>';
  ct.innerHTML = html;

  document.getElementById('btn-dlg-back').onclick = function() {
    mobileDialogueView = 'list';
    renderDialogues();
  };
  document.getElementById('btn-dlg-add-node').onclick = function() {
    const id = prompt('节点ID（如 node_2）：');
    if (!id) return;
    data.dialogues[dk].nodes.push({ id, speaker: '', text: '', next: '' });
    saveDoc('dialogues/' + dk, 'dialogues', data.dialogues[dk]).then(ok => { if (ok) renderDialogues(); });
  };
  ct.querySelectorAll('.mobile-node-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('button')) return;
      mobileEditingNodeIdx = parseInt(this.dataset.ni);
      mobileDialogueView = 'editor';
      renderDialogues();
    });
  });
  ct.querySelectorAll('.node-card-del').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const ni = parseInt(this.dataset.ndel);
      const node = data.dialogues[dk].nodes[ni];
      if (node.id === 'start' || node.id === 'end') { toast('start 和 end 节点不可删除', true); return; }
      if (!confirm('确定删除节点「' + node.id + '」？')) return;
      data.dialogues[dk].nodes.splice(ni, 1);
      saveDoc('dialogues/' + dk, 'dialogues', data.dialogues[dk]).then(ok => { if (ok) renderDialogues(); });
    });
  });
}

function renderMobileNodeEditor() {
  const ct = document.getElementById('content');
  const allKeys = Object.keys(data.dialogues);
  const dk = allKeys[selectedDialogueIdx];
  const nodes = data.dialogues[dk].nodes;
  const n = nodes[mobileEditingNodeIdx];
  const isSpecial = n.id === 'start' || n.id === 'end';

  let html = '<div class="mobile-chat-view">';
  html += `<div class="mobile-chat-header">
    <button class="back-btn" id="btn-node-back">← 节点列表</button>
    <span class="title">${esc(n.id)}</span>
    <span></span>
  </div>`;

  html += '<div class="mobile-editor-content">';
  if (!isSpecial) {
    html += fld('节点ID', 'dln_id_m', n.id);
  }
  html += fld('说话人', 'dln_speaker_m', n.speaker || '', 'text', 'NPC名、旁白、系统');
  html += '<label>文本</label><textarea id="dln_text_m" rows="3">' + esc(n.text || '') + '</textarea>';
  html += fld('下一节点', 'dln_next_m', n.next || '', 'text', '与「选项」二选一');

  html += '<div class="section-label">玩家选项</div><div id="dln_choices_m">';
  (n.choices || []).forEach((ch, ci) => {
    html += `<div class="inline-row" style="margin-bottom:4px;">
      <input placeholder="选项文本" value="${esc(ch.text || '')}" data-ci="${ci}" data-field="text" style="flex:2;">
      <input placeholder="跳转到" value="${esc(ch.next || '')}" data-ci="${ci}" data-field="next" style="flex:1;">
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`;
  });
  html += '</div><button class="btn-sm" id="btn-add-choice-m">+ 添加选项</button>';

  html += '<div class="section-label">节点效果</div>';
  const fx = n.effects || {};
  html += fld('金钱变化', 'dln_fx_money_m', fx.money ?? '', 'number');
  html += renderStatReqs('dln_fx_stats_m', fx.stats || [], true);
  html += renderRelDeltas('dln_fx_rels_m', fx.relationships || []);
  html += renderStringList('dln_fx_flags_m', '设置 flag', fx.flags || []);

  html += '<div class="detail-actions" style="margin-top:16px;">';
  html += '<button id="btn-node-cancel-m">取消</button>';
  html += '<button class="btn-ok" id="btn-node-save-m">💾 保存节点</button>';
  html += '</div>';
  html += '</div>';
  html += '</div>';
  ct.innerHTML = html;

  document.getElementById('btn-node-back').onclick = function() {
    mobileDialogueView = 'nodes';
    mobileEditingNodeIdx = -1;
    renderDialogues();
  };
  document.getElementById('btn-node-cancel-m').onclick = function() {
    mobileDialogueView = 'nodes';
    mobileEditingNodeIdx = -1;
    renderDialogues();
  };
  document.getElementById('btn-add-choice-m').onclick = function() {
    const ctr = document.getElementById('dln_choices_m');
    const div = document.createElement('div');
    div.className = 'inline-row';
    div.style.marginBottom = '4px';
    const ci = ctr.children.length;
    div.innerHTML = `<input placeholder="选项文本" data-ci="${ci}" data-field="text" style="flex:2;">
      <input placeholder="跳转到" data-ci="${ci}" data-field="next" style="flex:1;">
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
    ctr.appendChild(div);
  };
  document.getElementById('btn-node-save-m').onclick = async function() {
    if (!isSpecial) n.id = document.getElementById('dln_id_m').value.trim();
    n.speaker = document.getElementById('dln_speaker_m').value.trim();
    n.text = document.getElementById('dln_text_m').value;
    n.next = document.getElementById('dln_next_m').value.trim() || undefined;

    const err = validateDialogueNode(n, nodes);
    if (err) { toast(err, true); return; }

    const rows = document.querySelectorAll('#dln_choices_m .inline-row');
    const choices = [];
    rows.forEach(row => {
      const t = row.querySelector('[data-field="text"]')?.value || '';
      const nx = row.querySelector('[data-field="next"]')?.value || '';
      if (t || nx) choices.push({ text: t, next: nx });
    });
    if (choices.length) n.choices = choices; else delete n.choices;
    if (!n.choices && !n.next) delete n.next;

    const fx = {};
    const fm = document.getElementById('dln_fx_money_m').value; if (fm !== '') fx.money = parseInt(fm);
    const fs = readStatReqs('dln_fx_stats_m', true); if (fs.length) fx.stats = fs;
    const fr = readRelDeltas('dln_fx_rels_m'); if (fr.length) fx.relationships = fr;
    const ffl = readStringList('dln_fx_flags_m'); if (ffl.length) fx.flags = ffl;
    if (Object.keys(fx).length) n.effects = fx; else delete n.effects;

    if (await saveDoc('dialogues/' + dk, 'dialogues', data.dialogues[dk])) {
      toast('节点已保存');
      mobileDialogueView = 'nodes';
      mobileEditingNodeIdx = -1;
      renderDialogues();
    }
  };

  // Re-use existing global helpers for stat/rel/string list manipulation
  window._addStat = function(prefix, isDelta) {
    const c = document.getElementById(prefix + '_c'); if (!c) return;
    const i = c.children.length;
    const div = document.createElement('div'); div.className = 'inline-row';
    div.innerHTML = `<select id="${prefix}_${i}_s">${STAT_NAMES.map((n, j) => `<option value="${j}">${n}</option>`).join('')}</select>
      ${isDelta ? `<input type="number" id="${prefix}_${i}_v" value="0" placeholder="变化值" style="width:80px;">` :
        `<select id="${prefix}_${i}_op" style="width:70px;">${OPS.map(o => `<option value="${o}">${o}</option>`).join('')}</select><input type="number" id="${prefix}_${i}_v" value="0" placeholder="值" style="width:80px;">`}
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
    c.appendChild(div);
  };
  window._addStr = function(prefix) {
    const c = document.getElementById(prefix + '_c'); if (!c) return;
    const i = c.children.length;
    const div = document.createElement('div'); div.className = 'inline-row';
    div.innerHTML = `<input id="${prefix}_${i}"><button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
    c.appendChild(div);
  };
  window._addRelD = function(prefix) {
    const c = document.getElementById(prefix + '_c'); if (!c) return;
    const i = c.children.length;
    const div = document.createElement('div'); div.className = 'inline-row';
    div.innerHTML = `<select id="${prefix}_${i}_n">${NPC_IDS.map((id, j) => `<option value="${id}">${NPC_NAMES[j]}</option>`).join('')}</select>
      <input type="number" id="${prefix}_${i}_v" value="0" placeholder="变化值" style="width:80px;">
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
    c.appendChild(div);
  };
}

// ════════════════════════════════════════════
// PHONE TAB
// ════════════════════════════════════════════
window.renderPhone = function() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = buildToolbar({ icon: '📱', label: '手机消息', unit: '会话', count: data.phone_chats.length, id: 'chat', addLabel: '新建会话', exportLabel: '导出文件' });
  document.getElementById('btn-add-chat').onclick = addChat;
  document.getElementById('btn-import-chat').onclick = () => importJSON('phone');
  document.getElementById('btn-export-chat').onclick = exportPhone;

  const ct = document.getElementById('content');

  if (isMobile()) {
    renderPhoneMobile();
    return;
  }

  if (data.phone_chats.length === 0) {
    ct.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px;">暂无会话</p>';
    return;
  }

  const q = (document.getElementById('search-chat').value || '').toLowerCase();
  const list = q ? data.phone_chats.filter(c => (c.chat_name+';'+c.chat_id).toLowerCase().includes(q)) : data.phone_chats;

  let html = '<div class="split-layout">';
  html += '<div class="split-list">';
  list.forEach((c) => {
    const i = data.phone_chats.indexOf(c);
    html += `<div class="list-item ${i===selectedChatIdx?'active':''}" data-ci="${i}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span>${esc(c.chat_name)}</span>
        <button class="btn-sm btn-danger" data-chat-del="${i}" style="padding:1px 6px;font-size:0.7rem;">✕</button>
      </div>
      <div style="font-size:0.7rem;color:var(--text2);">${c.type==='group'?'群聊':'私聊'} · ${(c.messages||[]).length}条</div></div>`;
  });
  html += '</div>';

  if (selectedChatIdx >= 0 && selectedChatIdx < data.phone_chats.length && list.includes(data.phone_chats[selectedChatIdx])) {
    const chat = data.phone_chats[selectedChatIdx];
    html += '<div class="split-content">';
    html += `<h4 style="color:var(--accent2);margin-bottom:4px;">${esc(chat.chat_name)}</h4>`;
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">';
    html += fld('会话ID','ph_chat_id',chat.chat_id);
    html += fld('会话名','ph_chat_name',chat.chat_name);
    html += sel('类型','ph_chat_type',chat.type, [['group','群聊'],['private','私聊']]);
    html += '</div>';
    html += `<button class="btn-sm btn-ok" id="btn-add-msg" style="margin-bottom:8px;">+ 添加消息</button>`;
    const msgs = chat.messages || [];
    if (msgs.length === 0) {
      html += '<p style="color:var(--text2);">暂无消息</p>';
    } else {
      html += '<table><thead><tr><th>发送者</th><th>内容</th><th>定时/触发</th><th></th></tr></thead><tbody>';
      msgs.forEach((m, mi) => {
        let timing = m.trigger_event ? '事件: '+m.trigger_event : 'Day'+m.delay_day+' '+m.delay_phase;
        html += `<tr>
          <td>${esc(m.sender)}</td>
          <td>${esc((m.text||'').substring(0,30))}${(m.text||'').length>30?'…':''}</td>
          <td>${timing}</td>
          <td>
            <button class="btn-sm" data-edit="${mi}">✎</button>
            <button class="btn-sm btn-danger" data-msg-del="${mi}">✕</button>
          </td></tr>`;
      });
      html += '</tbody></table>';
    }
    html += '<div class="detail-actions"><button class="btn-ok" id="btn-save-chat">💾 保存会话</button></div>';
    html += '</div>';
  }
  html += '</div>';
  ct.innerHTML = html;

  ct.querySelectorAll('.list-item').forEach(item => {
    item.addEventListener('click', function(e) {
      if (e.target.closest('button')) return; // ignore button clicks inside list items
      selectedChatIdx = parseInt(this.dataset.ci);
      renderPhone();
    });
  });
  ct.querySelectorAll('button[data-chat-del]').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      selectedChatIdx = parseInt(this.dataset.chatDel);
      deleteChat();
    });
  });

  const btnAdd = ct.querySelector('#btn-add-msg');
  if (btnAdd) btnAdd.onclick = addMessage;
  const btnSave = ct.querySelector('#btn-save-chat');
  if (btnSave) btnSave.onclick = saveChatInfo;
  ct.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.addEventListener('click', function() { editMessage(parseInt(this.dataset.edit)); });
  });
  ct.querySelectorAll('button[data-msg-del]').forEach(btn => {
    btn.addEventListener('click', function() { deleteMessage(parseInt(this.dataset.msgDel)); });
  });

  document.getElementById('search-chat').addEventListener('input', renderPhone);
};

async function saveChatInfo() {
  const chat = data.phone_chats[selectedChatIdx];
  chat.chat_id = document.getElementById('ph_chat_id').value.trim();
  chat.chat_name = document.getElementById('ph_chat_name').value.trim();
  chat.type = document.getElementById('ph_chat_type').value;
  if (await saveDoc('phone_chats', 'phone_chats', data.phone_chats)) {
    toast('已保存');
    renderPhone();
  }
}

function addChat() {
  const name = prompt('会话名称（如 乐队群）：');
  if (!name) return;
  const cid = prompt('会话ID（英文下划线）：') || name;
  data.phone_chats.push({chat_id: cid, chat_name: name, type: 'private', messages: []});
  selectedChatIdx = data.phone_chats.length - 1;
  saveDoc('phone_chats', 'phone_chats', data.phone_chats).then(ok => { if (ok) renderPhone(); });
}

function deleteChat() {
  if (selectedChatIdx < 0) return;
  if (!confirm('确定删除会话「'+data.phone_chats[selectedChatIdx].chat_name+'」？')) return;
  data.phone_chats.splice(selectedChatIdx, 1);
  if (selectedChatIdx >= data.phone_chats.length) selectedChatIdx = -1;
  saveDoc('phone_chats', 'phone_chats', data.phone_chats).then(ok => { if (ok) renderPhone(); });
}

function addMessage() {
  if (selectedChatIdx < 0) return;
  const id = prompt('消息ID（如 m10）：');
  if (!id) return;
  data.phone_chats[selectedChatIdx].messages.push({id, sender:'', text:'', delay_day:1, delay_phase:'早晨'});
  saveDoc('phone_chats', 'phone_chats', data.phone_chats).then(ok => { if (ok) renderPhone(); });
}

function deleteMessage(mi) {
  if (selectedChatIdx < 0) return;
  data.phone_chats[selectedChatIdx].messages.splice(mi, 1);
  saveDoc('phone_chats', 'phone_chats', data.phone_chats).then(ok => { if (ok) renderPhone(); });
}

function editMessage(mi) {
  if (selectedChatIdx < 0) return;
  const chat = data.phone_chats[selectedChatIdx];
  const m = chat.messages[mi];
  const isTrigger = !!m.trigger_event;

  let html = `<div style="padding:16px;background:var(--bg2);border-radius:6px;margin-top:8px;" id="msgEditor">`;
  html += `<h4 style="color:var(--accent2);">编辑消息：${esc(m.id)}</h4>`;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('消息ID','msg_id',m.id);
  html += fld('发送者','msg_sender',m.sender);
  html += '</div>';
  html += '<label>内容</label><textarea id="msg_text" rows="2">'+esc(m.text||'')+'</textarea>';

  html += '<div class="section-label">发送方式</div>';
  html += `<label><input type="radio" name="msg_mode" value="timed" ${!isTrigger?'checked':''} onchange="window._toggleMsg()"> 定时发送</label>`;
  html += `<div id="msg_timed" style="${isTrigger?'display:none':''}">`;
  html += fld('延迟天数','msg_dd',m.delay_day??1,'number');
  html += sel('延迟时段','msg_dp',m.delay_phase||'早晨', PHASES.map(p=>[p,p]));
  html += '</div>';
  html += `<label><input type="radio" name="msg_mode" value="trigger" ${isTrigger?'checked':''} onchange="window._toggleMsg()"> 事件触发</label>`;
  html += `<div id="msg_trigger" style="${isTrigger?'':'display:none'}">`;
  html += fld('触发事件ID','msg_te',m.trigger_event||'');
  html += '</div>';
  html += '<div class="detail-actions"><button onclick="renderPhone()">取消</button><button class="btn-ok" id="btn-msg-save">💾 保存消息</button></div>';
  html += '</div>';

  const area = document.querySelector('.split-content');
  const old = area?.querySelector('#msgEditor');
  if (old) old.remove();
  if (area) area.insertAdjacentHTML('beforeend', html);

  document.getElementById('btn-msg-save').onclick = async function() {
    m.id = document.getElementById('msg_id').value.trim();
    m.sender = document.getElementById('msg_sender').value.trim();
    m.text = document.getElementById('msg_text').value;

    const msgs = data.phone_chats[selectedChatIdx].messages;
    const err = validateMessage(m, msgs);
    if (err) { toast(err, true); return; }
    const isTimed = document.querySelector('input[name="msg_mode"]:checked')?.value === 'timed';
    if (isTimed) {
      m.delay_day = parseInt(document.getElementById('msg_dd').value) || 1;
      m.delay_phase = document.getElementById('msg_dp').value;
      delete m.trigger_event;
    } else {
      m.trigger_event = document.getElementById('msg_te').value.trim() || undefined;
      delete m.delay_day;
      delete m.delay_phase;
    }
    if (await saveDoc('phone_chats', 'phone_chats', data.phone_chats)) {
      toast('消息已保存');
      renderPhone();
    }
  };
}
window._toggleMsg = function() {
  const timed = document.querySelector('input[name="msg_mode"]:checked')?.value === 'timed';
  document.getElementById('msg_timed').style.display = timed ? '' : 'none';
  document.getElementById('msg_trigger').style.display = timed ? 'none' : '';
};

// ════════════════════════════════════════════
// MOBILE PHONE UI
// ════════════════════════════════════════════
function renderPhoneMobile() {
  const ct = document.getElementById('content');

  if (mobilePhoneView === 'chat' && selectedChatIdx >= 0 && selectedChatIdx < data.phone_chats.length) {
    renderMobileChatView();
    return;
  }

  mobilePhoneView = 'list';

  if (data.phone_chats.length === 0) {
    ct.innerHTML = '<p style="color:var(--text2);text-align:center;padding:40px;">暂无会话，点击「+ 新建会话」开始</p>';
    return;
  }

  const q = (document.getElementById('search-chat')?.value || '').toLowerCase();
  const list = q ? data.phone_chats.filter(c => (c.chat_name + ';' + c.chat_id).toLowerCase().includes(q)) : data.phone_chats;

  let html = '<div class="mobile-chat-list">';
  list.forEach((c) => {
    const i = data.phone_chats.indexOf(c);
    const msgCount = (c.messages || []).length;
    const lastMsg = msgCount > 0 ? c.messages[msgCount - 1] : null;
    html += `<div class="mobile-chat-card" data-ci="${i}">
      <div class="card-info">
        <div class="card-name">${esc(c.chat_name)}</div>
        <div class="card-meta">${c.type === 'group' ? '群聊' : '私聊'} · ${msgCount}条${lastMsg ? ' · ' + esc(lastMsg.text.substring(0, 15)) : ''}</div>
      </div>
      <span class="card-arrow">›</span>
    </div>`;
  });
  html += '</div>';
  ct.innerHTML = html;

  ct.querySelectorAll('.mobile-chat-card').forEach(card => {
    card.addEventListener('click', function() {
      selectedChatIdx = parseInt(this.dataset.ci);
      mobilePhoneView = 'chat';
      renderPhone();
    });
  });
}

function renderMobileChatView() {
  const ct = document.getElementById('content');
  const chat = data.phone_chats[selectedChatIdx];
  const msgs = chat.messages || [];

  const palette = ['#e94560', '#53a8b6', '#f39c12', '#9b59b6', '#2ecc71', '#e67e22', '#3498db'];
  const senders = [...new Set(msgs.map(m => m.sender))];
  const senderColors = {};
  senders.forEach((s, i) => { senderColors[s] = palette[i % palette.length]; });

  let html = '<div class="mobile-chat-view">';
  html += `<div class="mobile-chat-header">
    <button class="back-btn" id="btn-chat-back">← 返回</button>
    <span class="title">${esc(chat.chat_name)}</span>
    <div style="display:flex;gap:4px;">
      <button class="btn-sm" id="btn-chat-edit-info">编辑</button>
      <button class="btn-sm btn-ok" id="btn-chat-add-msg">+</button>
    </div>
  </div>`;

  html += '<div class="mobile-chat-messages">';
  if (msgs.length === 0) {
    html += '<p style="color:var(--text2);text-align:center;padding:40px;">暂无消息，点击右上角 + 添加</p>';
  } else {
    msgs.forEach((m, mi) => {
      const isSelf = m.sender === '我' || m.sender === '玩家' || m.sender === userName;
      const timing = m.trigger_event ? '事件: ' + m.trigger_event : 'Day' + m.delay_day + ' ' + m.delay_phase;
      html += `<div class="chat-bubble ${isSelf ? 'self' : 'other'}" style="${isSelf ? '' : 'border-left-color:' + senderColors[m.sender]}">
        <div class="bubble-sender" style="${isSelf ? '' : 'color:' + senderColors[m.sender]}">${esc(m.sender)}</div>
        <div class="bubble-text">${esc(m.text)}</div>
        <div class="bubble-time">${timing}</div>
        <button class="bubble-edit" data-medit="${mi}">✎</button>
      </div>`;
    });
  }
  html += '</div>';
  html += '</div>';
  ct.innerHTML = html;

  document.getElementById('btn-chat-back').onclick = function() {
    mobilePhoneView = 'list';
    renderPhone();
  };
  document.getElementById('btn-chat-add-msg').onclick = function() {
    openMessageEditor(-1);
  };
  document.getElementById('btn-chat-edit-info').onclick = function() {
    openChatInfoEditor();
  };
  ct.querySelectorAll('.bubble-edit').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      openMessageEditor(parseInt(this.dataset.medit));
    });
  });
}

function openMessageEditor(mi) {
  const chat = data.phone_chats[selectedChatIdx];
  const m = mi >= 0 ? chat.messages[mi] : { id: '', sender: userName || '', text: '', delay_day: 1, delay_phase: '早晨' };
  const isNew = mi < 0;
  const isTrigger = !!m.trigger_event;

  let html = '<div class="bottom-sheet-overlay" id="bottom-sheet-overlay">';
  html += '<div class="bottom-sheet" id="bottom-sheet">';
  html += '<div class="bottom-sheet-header">';
  html += `<h4>${isNew ? '新建消息' : '编辑：' + esc(m.id)}</h4>`;
  html += '<button class="btn-sm" id="btn-sheet-close">✕</button>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('消息ID', 'msg_id_m', m.id);
  html += fld('发送者', 'msg_sender_m', m.sender);
  html += '</div>';
  html += '<label>内容</label><textarea id="msg_text_m" rows="3">' + esc(m.text || '') + '</textarea>';

  html += '<div class="section-label">发送方式</div>';
  html += `<label style="display:flex;align-items:center;gap:6px;margin-top:4px;"><input type="radio" name="msg_mode_m" value="timed" ${!isTrigger ? 'checked' : ''} onchange="window._toggleMsgM()"> 定时发送</label>`;
  html += `<div id="msg_timed_m" style="${isTrigger ? 'display:none' : ''};margin-left:16px;">`;
  html += fld('延迟天数', 'msg_dd_m', m.delay_day ?? 1, 'number');
  html += sel('延迟时段', 'msg_dp_m', m.delay_phase || '早晨', PHASES.map(p => [p, p]));
  html += '</div>';
  html += `<label style="display:flex;align-items:center;gap:6px;margin-top:4px;"><input type="radio" name="msg_mode_m" value="trigger" ${isTrigger ? 'checked' : ''} onchange="window._toggleMsgM()"> 事件触发</label>`;
  html += `<div id="msg_trigger_m" style="${isTrigger ? '' : 'display:none'};margin-left:16px;">`;
  html += fld('触发事件ID', 'msg_te_m', m.trigger_event || '');
  html += '</div>';

  html += '<div class="detail-actions" style="margin-top:16px;">';
  if (!isNew) {
    html += '<button class="btn-danger" id="btn-msg-delete-m">删除</button>';
  }
  html += '<button id="btn-msg-cancel-m">取消</button>';
  html += '<button class="btn-ok" id="btn-msg-save-m">💾 保存</button>';
  html += '</div>';
  html += '</div></div>';

  const existing = document.getElementById('bottom-sheet-overlay');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('bottom-sheet-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeMessageEditor();
  });
  document.getElementById('btn-sheet-close').onclick = closeMessageEditor;
  document.getElementById('btn-msg-cancel-m').onclick = closeMessageEditor;

  document.getElementById('btn-msg-save-m').onclick = async function() {
    const newId = document.getElementById('msg_id_m').value.trim();
    const sender = document.getElementById('msg_sender_m').value.trim();
    const text = document.getElementById('msg_text_m').value;
    if (!newId) { toast('消息ID不能为空', true); return; }
    if (!sender) { toast('发送者不能为空', true); return; }
    if (!text) { toast('消息内容不能为空', true); return; }

    const isTimed = document.querySelector('input[name="msg_mode_m"]:checked')?.value === 'timed';
    const msgObj = { id: newId, sender, text };
    if (isTimed) {
      msgObj.delay_day = parseInt(document.getElementById('msg_dd_m').value) || 1;
      msgObj.delay_phase = document.getElementById('msg_dp_m').value;
    } else {
      msgObj.trigger_event = document.getElementById('msg_te_m').value.trim() || undefined;
    }

    if (isNew) {
      chat.messages.push(msgObj);
    } else {
      chat.messages[mi] = msgObj;
    }

    if (await saveDoc('phone_chats', 'phone_chats', data.phone_chats)) {
      toast(isNew ? '消息已添加' : '消息已保存');
      closeMessageEditor();
      renderPhone();
    }
  };

  const delBtn = document.getElementById('btn-msg-delete-m');
  if (delBtn) delBtn.onclick = async function() {
    if (!confirm('确定删除消息「' + m.id + '」？')) return;
    chat.messages.splice(mi, 1);
    if (await saveDoc('phone_chats', 'phone_chats', data.phone_chats)) {
      toast('消息已删除');
      closeMessageEditor();
      renderPhone();
    }
  };
}

function openChatInfoEditor() {
  const chat = data.phone_chats[selectedChatIdx];

  let html = '<div class="bottom-sheet-overlay" id="bottom-sheet-overlay">';
  html += '<div class="bottom-sheet" id="bottom-sheet">';
  html += '<div class="bottom-sheet-header">';
  html += '<h4>编辑会话信息</h4>';
  html += '<button class="btn-sm" id="btn-sheet-close">✕</button>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('会话ID', 'ph_chat_id_m', chat.chat_id);
  html += fld('会话名', 'ph_chat_name_m', chat.chat_name);
  html += sel('类型', 'ph_chat_type_m', chat.type, [['group', '群聊'], ['private', '私聊']]);
  html += '</div>';
  html += '<div class="detail-actions" style="margin-top:16px;">';
  html += '<button class="btn-danger" id="btn-chat-delete-m">删除会话</button>';
  html += '<button id="btn-chat-cancel-m">取消</button>';
  html += '<button class="btn-ok" id="btn-chat-save-m">💾 保存</button>';
  html += '</div>';
  html += '</div></div>';

  const existing = document.getElementById('bottom-sheet-overlay');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('bottom-sheet-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeMessageEditor();
  });
  document.getElementById('btn-sheet-close').onclick = closeMessageEditor;
  document.getElementById('btn-chat-cancel-m').onclick = closeMessageEditor;

  document.getElementById('btn-chat-save-m').onclick = async function() {
    chat.chat_id = document.getElementById('ph_chat_id_m').value.trim();
    chat.chat_name = document.getElementById('ph_chat_name_m').value.trim();
    chat.type = document.getElementById('ph_chat_type_m').value;
    if (await saveDoc('phone_chats', 'phone_chats', data.phone_chats)) {
      toast('会话已保存');
      closeMessageEditor();
      renderPhone();
    }
  };

  document.getElementById('btn-chat-delete-m').onclick = async function() {
    if (!confirm('确定删除会话「' + chat.chat_name + '」？')) return;
    data.phone_chats.splice(selectedChatIdx, 1);
    if (selectedChatIdx >= data.phone_chats.length) selectedChatIdx = -1;
    if (await saveDoc('phone_chats', 'phone_chats', data.phone_chats)) {
      toast('会话已删除');
      closeMessageEditor();
      mobilePhoneView = 'list';
      renderPhone();
    }
  };
}

function closeMessageEditor() {
  const overlay = document.getElementById('bottom-sheet-overlay');
  if (overlay) overlay.remove();
}

window._toggleMsgM = function() {
  const timed = document.querySelector('input[name="msg_mode_m"]:checked')?.value === 'timed';
  const timedEl = document.getElementById('msg_timed_m');
  const triggerEl = document.getElementById('msg_trigger_m');
  if (timedEl) timedEl.style.display = timed ? '' : 'none';
  if (triggerEl) triggerEl.style.display = timed ? 'none' : '';
};

function exportPhone() { downloadJSON('phone_chat.json', data.phone_chats); toast('已导出 phone_chat.json'); }

// ════════════════════════════════════════════
// IMPORT / EXPORT ALL
// ════════════════════════════════════════════
function importJSON(type) {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true; input.accept = '.json';
  input.onchange = async () => {
    const files = Array.from(input.files);
    if (!files.length) return;
    if (!confirm(`将导入 ${files.length} 个文件，确定？`)) return;

    let imported = 0;
    for (const file of files) {
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        if (type === 'dialogues') {
          const id = obj.dialogue_id || file.name.replace('.json','');
          data.dialogues[id] = obj;
          data.dialogues[id].dialogue_id = id;
          await saveDoc('dialogues/'+id, 'dialogues', obj);
        } else {
          // Merge arrays: replace existing items by id, add new ones
          const idKey = type === 'phone' ? 'chat_id' : 'id';
          const arr = Array.isArray(obj) ? obj : [obj];
          const target = type === 'phone' ? data.phone_chats : type === 'actions' ? data.actions : data.events;
          arr.forEach(item => {
            const idx = target.findIndex(x => x[idKey] === item[idKey]);
            if (idx >= 0) target[idx] = item; else target.push(item);
          });
          const id = type === 'phone' ? 'phone_chats' : type;
          await saveDoc(id, type === 'phone' ? 'phone_chats' : type, type === 'phone' ? data.phone_chats : type === 'actions' ? data.actions : data.events);
        }
        imported++;
      } catch(e) { toast('解析失败：'+file.name, true); }
    }
    switchTab(currentTab, true);
    if (imported) toast(`已导入 ${imported} 个文件`);
  };
  input.click();
}

window.exportAll = function() {
  exportAction();
  exportEvent();
  exportAllDialogues();
  exportPhone();
  toast('全部导出完成');
};

// ════════════════════════════════════════════
// REUSABLE FORM WIDGETS
// ════════════════════════════════════════════
function esc(s) { if (s === null || s === undefined) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fld(label, id, value, type, placeholder, disabled) {
  return `<div><label>${label}</label><input type="${type||'text'}" id="${id}" value="${esc(value)}" placeholder="${placeholder||''}" ${disabled?'disabled':''}></div>`;
}
function sel(label, id, value, options) {
  let h = `<div><label>${label}</label><select id="${id}">`;
  options.forEach(([v, l]) => { h += `<option value="${v}" ${v===value?'selected':''}>${l}</option>`; });
  h += '</select></div>';
  return h;
}

function renderStatReqs(prefix, arr, isDelta) {
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

function readStatReqs(prefix, isDelta) {
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

function renderStringList(prefix, label, arr) {
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
function readStringList(prefix) {
  const c = document.getElementById(prefix+'_c'); if (!c) return [];
  const result = [];
  c.querySelectorAll('input').forEach(inp => { const v = inp.value.trim(); if (v) result.push(v); });
  return result;
}

function renderPhaseSel(prefix, label, value) {
  const none = (value===undefined||value===null||value==='')?'selected':'';
  return `<div><label>${label}</label><select id="${prefix}"><option value="" ${none}>— 不限 —</option>${PHASES.map(p=>`<option value="${p}" ${value===p?'selected':''}>${p}</option>`).join('')}</select></div>`;
}
function readPhaseVal(prefix) { const v = document.getElementById(prefix)?.value; return (!v) ? null : v; }

function renderDaySel(prefix, label, value) {
  const none = (value===undefined||value===null||value==='')?'selected':'';
  return `<div><label>${label}</label><select id="${prefix}"><option value="" ${none}>— 不限 —</option>${[1,2,3,4,5,6,7].map(d=>`<option value="${d}" ${value===d?'selected':''}>第${d}天</option>`).join('')}</select></div>`;
}
function readDayVal(prefix) { const v = document.getElementById(prefix)?.value; if (!v) return null; return parseInt(v); }

function renderDayRange(prefix, arr) {
  return `<div><label>日期范围</label><div class="inline-row">
    <input type="number" id="${prefix}_0" value="${arr[0]||''}" placeholder="起始" min="1" max="7" style="width:80px;">
    <span>—</span>
    <input type="number" id="${prefix}_1" value="${arr[1]||''}" placeholder="结束" min="1" max="7" style="width:80px;"></div></div>`;
}
function readDayRange(prefix) { const a=parseInt(document.getElementById(prefix+'_0')?.value), b=parseInt(document.getElementById(prefix+'_1')?.value); if(isNaN(a)||isNaN(b)) return null; return [a,b]; }

function renderMoneyReq(prefix, label, value) {
  const v = value || {};
  return `<div><label>${label}</label><div class="inline-row">
    <select id="${prefix}_op">${OPS.map(o=>`<option value="${o}" ${o===(v.op||'>=')?'selected':''}>${o}</option>`).join('')}</select>
    <input type="number" id="${prefix}_v" value="${v.value??''}" placeholder="金额"></div></div>`;
}
function readMoneyReq(prefix) { const op=document.getElementById(prefix+'_op')?.value, v=parseInt(document.getElementById(prefix+'_v')?.value); if(isNaN(v)) return null; return {op, value:v}; }

function renderRelDeltas(prefix, arr) {
  let h = `<div><label>关系变化</label><div id="${prefix}_c">`;
  arr.forEach((r,i) => {
    h += `<div class="inline-row">
      <select id="${prefix}_${i}_n">${NPC_IDS.map((id,j)=>`<option value="${id}" ${id===r.npc_id?'selected':''}>${NPC_NAMES[j]}</option>`).join('')}</select>
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
  div.innerHTML = `<select id="${prefix}_${i}_n">${NPC_IDS.map((id,j)=>`<option value="${id}">${NPC_NAMES[j]}</option>`).join('')}</select>
    <input type="number" id="${prefix}_${i}_v" value="0" placeholder="变化值" style="width:80px;">
    <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(div);
};
function readRelDeltas(prefix) {
  const c = document.getElementById(prefix+'_c'); if (!c) return [];
  const result = [];
  c.querySelectorAll('.inline-row').forEach(row => {
    const sel=row.querySelector('select'), inp=row.querySelector('input');
    if(!sel||!inp) return; const d=parseInt(inp.value)||0; if(d) result.push({npc_id:sel.value, delta:d});
  });
  return result;
}

function renderRelReqs(prefix, arr) {
  let h = `<div><label>关系要求</label><div id="${prefix}_c">`;
  arr.forEach((r,i) => {
    h += `<div class="inline-row">
      <select id="${prefix}_${i}_n">${NPC_IDS.map((id,j)=>`<option value="${id}" ${id===r.npc_id?'selected':''}>${NPC_NAMES[j]}</option>`).join('')}</select>
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
  div.innerHTML = `<select id="${prefix}_${i}_n">${NPC_IDS.map((id,j)=>`<option value="${id}">${NPC_NAMES[j]}</option>`).join('')}</select>
    <select id="${prefix}_${i}_op" style="width:70px;">${OPS.map(o=>`<option value="${o}">${o}</option>`).join('')}</select>
    <input type="number" id="${prefix}_${i}_v" value="0" placeholder="值" style="width:80px;">
    <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
  c.appendChild(div);
};
function readRelReqs(prefix) {
  const c = document.getElementById(prefix+'_c'); if (!c) return [];
  const result = [];
  c.querySelectorAll('.inline-row').forEach(row => {
    const sels=row.querySelectorAll('select'), inp=row.querySelector('input');
    if(sels.length<2||!inp) return; result.push({npc_id:sels[0].value, op:sels[1].value, value:parseInt(inp.value)||0});
  });
  return result;
}
