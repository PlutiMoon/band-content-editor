// ════════════════════════════════════════════
// CORE — DB, Realtime, Auth, Utilities
// ════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { recordAuditEntry } from './audit_store.js';
import {
  supabase, clientId, data, userName, editorAccessKey,
  currentTab, selectedIdx, selectedDialogueIdx, selectedChatIdx,
  mobilePhoneView, mobileDialogueView, mobileEditingNodeIdx,
  setSupabase, setData, setUserName, setCurrentTab,
  setSelectedIdx, setSelectedDialogueIdx, setSelectedChatIdx,
  setMobilePhoneView, setMobileDialogueView, setMobileEditingNodeIdx,
  setEditorAccessKey
} from './state.js';
import { esc } from './forms.js';

// ════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════

export function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : (msg.startsWith('📡') ? ' info' : ''));
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

export function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, '\t')], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function isMobile() { return window.innerWidth <= 768; }

// ── Toolbar builder ──
export function buildToolbar(cfg) {
  return `<span>${cfg.icon} ${cfg.label}</span>
    <span class="hint">共 ${cfg.count} 个${cfg.unit}</span>
    <input type="search" id="search-${cfg.id}" placeholder="搜索..." style="width:110px;">
    <button class="btn-ok" id="btn-add-${cfg.id}">+ ${cfg.addLabel}</button>
    <details class="toolbar-menu" data-toolbar-menu="${cfg.id}">
      <summary>更多</summary>
      <div class="toolbar-menu-items">
        <button id="btn-import-${cfg.id}">📥 导入文件</button>
        <button id="btn-export-${cfg.id}">📤 ${cfg.exportLabel}</button>
      </div>
    </details>`;
}

// ── Loading indicator ──
let loadingToastEl = null;
export function showLoading(msg) {
  hideLoading();
  const el = document.createElement('div');
  el.className = 'toast info';
  el.id = 'loading-toast';
  el.textContent = '⏳ ' + msg;
  document.body.appendChild(el);
  loadingToastEl = el;
}
export function hideLoading() {
  if (loadingToastEl) { loadingToastEl.remove(); loadingToastEl = null; }
  const el = document.getElementById('loading-toast');
  if (el) el.remove();
}

function isAccessKeyError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return error?.status === 403 ||
         msg.includes('invalid editor access key') ||
         msg.includes('invalid access key') ||
         msg.includes('28000');
}

function resetLoginState(message) {
  sessionStorage.removeItem('band_logged_in');
  sessionStorage.removeItem('band_user_name');
  sessionStorage.removeItem('band_access_key');
  localStorage.removeItem('band_logged_in');
  localStorage.removeItem('band_user_name');
  localStorage.removeItem('band_access_key');
  setEditorAccessKey('');

  const login = document.getElementById('login-screen');
  const app = document.getElementById('app');
  const err = document.getElementById('login-error');
  if (app) app.style.display = 'none';
  if (login) login.style.display = 'flex';
  if (err) {
    err.textContent = message || '访问口令错误或已轮换，请重新登录';
    err.style.display = 'block';
  }
  window._appInitialized = false;
}

function handleAccessError(error, fallbackPrefix) {
  hideLoading();
  if (isAccessKeyError(error)) {
    resetLoginState('访问口令错误或已轮换，请重新登录');
    return true;
  }
  toast(`${fallbackPrefix}: ${error?.message || error}`, true);
  return false;
}

// ════════════════════════════════════════════
// DATABASE OPERATIONS
// ════════════════════════════════════════════

export async function pullFromDB() {
  if (!supabase) return;
  showLoading('正在从数据库拉取...');
  try {
    const { data: rows, error } = await supabase.rpc('editor_list_documents', {
      input_key: editorAccessKey
    });
    if (error) { handleAccessError(error, '拉取失败'); return; }
    if (!rows || rows.length === 0) {
      hideLoading();
      toast('数据库为空，请先导入数据');
      return;
    }
    const newData = { actions: [], events: [], dialogues: {}, phone_chats: [], maps: [], locations: [], npcs: [], game_config: {} };
    rows.forEach(row => applyDocumentRowTo(row, newData));
    setData(newData);
    hideLoading();
    toast('已从数据库同步');
    if (window._switchTab) window._switchTab(currentTab, true);
  } catch (e) {
    handleAccessError(e, '连接失败');
  }
}

function applyDocumentRowTo(row, target) {
  switch (row.type) {
    case 'actions':
      target.actions = Array.isArray(row.data) ? row.data : JSON.parse(row.data);
      break;
    case 'events':
      target.events = Array.isArray(row.data) ? row.data : JSON.parse(row.data);
      break;
    case 'dialogues':
      target.dialogues[row.id.replace('dialogues/', '')] = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      break;
    case 'phone_chats':
      target.phone_chats = Array.isArray(row.data) ? row.data : JSON.parse(row.data);
      break;
    case 'locations':
      target.locations = Array.isArray(row.data) ? row.data : JSON.parse(row.data);
      break;
    case 'npcs':
      target.npcs = Array.isArray(row.data) ? row.data : JSON.parse(row.data);
      break;
    case 'maps':
      target.maps = Array.isArray(row.data) ? row.data : JSON.parse(row.data);
      break;
    case 'game_config':
      target.game_config = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      break;
  }
}

export function applyDocumentRow(row) {
  applyDocumentRowTo(row, data);
}

export function removeDocumentRow(row) {
  switch (row.type) {
    case 'actions': setData({ ...data, actions: [] }); break;
    case 'events': setData({ ...data, events: [] }); break;
    case 'dialogues':
      const newD = { ...data.dialogues };
      delete newD[row.id.replace('dialogues/', '')];
      setData({ ...data, dialogues: newD });
      setSelectedDialogueIdx(-1);
      break;
    case 'phone_chats': setData({ ...data, phone_chats: [] }); break;
    case 'locations': setData({ ...data, locations: [] }); break;
    case 'maps': setData({ ...data, maps: [] }); break;
    case 'npcs': setData({ ...data, npcs: [] }); break;
    case 'game_config': setData({ ...data, game_config: {} }); break;
  }
}

function summarizeDocData(docData) {
  if (Array.isArray(docData)) return `array:${docData.length}`;
  if (docData && typeof docData === 'object') return `object:${Object.keys(docData).length}`;
  return typeof docData;
}

export async function saveDoc(id, type, docData) {
  if (!supabase) { toast('未连接数据库', true); return false; }
  try {
    const { error } = await supabase.rpc('editor_upsert_document', {
      input_key: editorAccessKey,
      doc_id: id,
      doc_type: type,
      doc_data: docData,
      updater: userName
    });
    if (error) {
      handleAccessError(error, '保存失败');
      return false;
    }
    recordAuditEntry({
      action: 'save',
      doc_id: id,
      doc_type: type,
      user: userName,
      summary: summarizeDocData(docData),
    });
    return true;
  } catch (e) {
    handleAccessError(e, '保存失败');
    return false;
  }
}

// ── Supabase DELETE for dialogue removal ──
export async function deleteDoc(id) {
  if (!supabase) { toast('未连接数据库', true); return false; }
  try {
    const { error } = await supabase.rpc('editor_delete_document', {
      input_key: editorAccessKey,
      doc_id: id
    });
    if (error) {
      handleAccessError(error, '删除失败');
      return false;
    }
    recordAuditEntry({
      action: 'delete',
      doc_id: id,
      doc_type: id.startsWith('dialogues/') ? 'dialogues' : 'document',
      user: userName,
      summary: 'delete',
    });
    return true;
  } catch (e) {
    handleAccessError(e, '删除失败');
    return false;
  }
}

// ════════════════════════════════════════════
// REALTIME
// ════════════════════════════════════════════

export function isEditing() {
  return document.getElementById('actionDetail') ||
         document.getElementById('eventDetail') ||
         document.getElementById('msgEditor') ||
         document.getElementById('bottom-sheet-overlay') ||
         document.getElementById('btn-node-save') ||
         document.getElementById('btn-node-save-m') ||
         document.getElementById('locDetail') ||
         document.getElementById('npcDetail');
}

export function handleRealtimeChange(payload) {
  const row = payload.new || payload.old;
  if (!row) return;
  if (row.updated_by === userName) return;

  const action = payload.eventType === 'DELETE' ? '删除了' : '更新了';
  const who = row.updated_by || '未知';

  if (isEditing()) {
    toast(`📡 ${who} ${action}「${row.id}」— 请保存后刷新查看`, 'info');
    return;
  }

  if (payload.eventType === 'DELETE') {
    removeDocumentRow(row);
  } else {
    applyDocumentRow(row);
  }

  // Re-render current tab (needs switchTab from app.js)
  if (window._switchTab) window._switchTab(currentTab, true);
  toast(`📡 ${who} ${action}「${row.id}」`, 'info');
}

let _reconnectAttempts = 0;
let _reconnectTimer = null;

export function resetReconnectAttempts() {
  _reconnectAttempts = 0;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
}

export function updateConnStatus(status) {
  const dot = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');
  if (dot) dot.className = status;
  if (text) {
    if (status === 'online') text.textContent = '已连接';
    else if (status === 'reconnecting') text.textContent = '重连中...';
    else text.textContent = '离线';
  }
}

export function updateOnlineUsers(channel) {
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

  // Mobile: dots only
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

// ════════════════════════════════════════════
// SUPABASE CHANNEL SETUP (called from initApp)
// ════════════════════════════════════════════

export function createSupabaseClient() {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  setSupabase(client);
  return client;
}

export function setupRealtimeChannel(client) {
  const channel = client.channel('documents-changes', { config: { presence: { key: clientId } } });
  channel
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'documents' },
      payload => handleRealtimeChange(payload)
    )
    .on('presence', { event: 'sync' }, () => updateOnlineUsers(channel))
    .on('presence', { event: 'join' }, () => updateOnlineUsers(channel))
    .on('presence', { event: 'leave' }, () => updateOnlineUsers(channel))
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        resetReconnectAttempts();
        updateConnStatus('online');
        await channel.track({ name: userName, clientId: clientId });
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        updateConnStatus('reconnecting');
        scheduleReconnect(client);
      } else {
        updateConnStatus(status === 'SUBSCRIBED' ? 'online' : 'offline');
      }
    });
  return channel;
}

function scheduleReconnect(client) {
  if (_reconnectTimer) return; // already scheduling
  const delay = Math.min(1000 * Math.pow(2, _reconnectAttempts), 30000);
  _reconnectAttempts++;
  updateConnStatus('reconnecting');
  _reconnectTimer = setTimeout(async () => {
    _reconnectTimer = null;
    try {
      // Remove old channels and re-subscribe
      await client.removeAllChannels();
      setupRealtimeChannel(client);
      // Re-sync data
      if (window._switchTab) {
        await pullFromDB();
        window._switchTab(currentTab, true);
      }
    } catch (e) {
      scheduleReconnect(client);
    }
  }, delay);
}

// ════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════

export function doLogin() {
  if (window._appInitialized) return;
  const key = document.getElementById('login-key').value.trim();
  const name = document.getElementById('login-name').value.trim();
  if (!key) {
    document.getElementById('login-error').style.display = 'block';
    return;
  }
  setUserName(name || clientId);
  setEditorAccessKey(key);

  const remember = document.getElementById('login-remember')?.checked !== false;
  const store = remember ? localStorage : sessionStorage;
  store.setItem('band_logged_in', 'true');
  store.setItem('band_user_name', userName);
  store.setItem('band_access_key', key);
  if (remember) {
    sessionStorage.setItem('band_logged_in', 'true');
    sessionStorage.setItem('band_user_name', userName);
    sessionStorage.setItem('band_access_key', key);
  }

  // initApp is imported and called by app.js
  if (window._initApp) window._initApp();
}
window.doLogin = doLogin;

export function checkAutoLogin() {
  const savedKey = sessionStorage.getItem('band_access_key') || localStorage.getItem('band_access_key') || '';
  if (savedKey && (sessionStorage.getItem('band_logged_in') === 'true' ||
      localStorage.getItem('band_logged_in') === 'true')) {
    setUserName(sessionStorage.getItem('band_user_name') ||
               localStorage.getItem('band_user_name') || clientId);
    setEditorAccessKey(savedKey);
    return true;
  }
  return false;
}
