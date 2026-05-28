// ════════════════════════════════════════════
// APP ENTRY — init, tab switching, import/export
// ════════════════════════════════════════════
import { SUPABASE_URL } from './js/config.js';
import {
  data, userName, currentTab,
  selectedIdx, selectedDialogueIdx, selectedChatIdx,
  mobilePhoneView, mobileDialogueView, mobileEditingNodeIdx,
  worldSection, selectedLocationIdx, selectedNPCIdx, selectedMapIdx,
  setCurrentTab, setSelectedIdx, setSelectedDialogueIdx, setSelectedChatIdx,
  setMobilePhoneView, setMobileDialogueView, setMobileEditingNodeIdx,
  setWorldSection, setSelectedLocationIdx, setSelectedNPCIdx, setSelectedMapIdx,
  setData
} from './js/state.js';
import {
  isEditing, toast, downloadJSON,
  pullFromDB, saveDoc,
  createSupabaseClient, setupRealtimeChannel,
  doLogin, checkAutoLogin
} from './js/core.js';
import { renderActions } from './js/actions.js';
import { renderEvents } from './js/events.js';
import { renderDialogues } from './js/dialogues.js';
import { renderPhone } from './js/phone.js';
import { renderWorld } from './js/world.js';
import {
  validateAction,
  validateEvent,
  validateLocation,
  validateNPC,
  validateMap,
  validateGameConfig,
  validateDialogueNode,
  validateMessage
} from './js/forms.js';

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

  const client = createSupabaseClient();

  if (!sessionStorage.getItem('band_logged_in')) {
    sessionStorage.setItem('band_logged_in', 'true');
  }

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  window.addEventListener('beforeunload', function(e) {
    if (isEditing()) e.preventDefault();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('mobile-tab-select').addEventListener('change', function() {
    switchTab(this.value);
  });

  const dotsEl = document.getElementById('online-dots');
  if (dotsEl) {
    dotsEl.addEventListener('click', function(e) {
      e.stopPropagation();
      const namesEl = document.getElementById('online-names');
      if (namesEl) namesEl.classList.toggle('show');
      setTimeout(() => { if (namesEl) namesEl.classList.remove('show'); }, 4000);
    });
  }

  setupRealtimeChannel(client);

  await pullFromDB();
  switchTab('actions');
}
window._initApp = initApp;

// ════════════════════════════════════════════
// TAB SWITCHING
// ════════════════════════════════════════════
function switchTab(tab, silent) {
  if (isEditing() && !confirm('你有未保存的编辑，确定离开吗？')) return;
  setCurrentTab(tab);
  setSelectedIdx(-1);
  setSelectedDialogueIdx(-1);
  setSelectedChatIdx(-1);
  setMobilePhoneView('list');
  setMobileDialogueView('list');
  setMobileEditingNodeIdx(-1);
  setWorldSection('config');
  setSelectedLocationIdx(-1);
  setSelectedNPCIdx(-1);
  setSelectedMapIdx(-1);
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
    case 'world': renderWorld(); break;
  }
}
window._switchTab = switchTab;

// ════════════════════════════════════════════
// EXPOSE TO WINDOW (for HTML onclick handlers)
// ════════════════════════════════════════════
window.pullFromDB = pullFromDB;

function asArray(payload) {
  return Array.isArray(payload) ? payload : [payload];
}

function validateItems(items, validator, label) {
  for (const item of items) {
    if (!item || typeof item !== 'object') return `${label} 格式错误`;
    const err = validator(item, items);
    if (err) return `${label} ${item.id || item.chat_id || item.dialogue_id || '(unknown)'}: ${err}`;
  }
  return null;
}

function getImportValidationError(type, payload) {
  if (type === 'game_config') {
    return validateGameConfig(payload);
  }

  if (type === 'dialogues') {
    const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    if (!nodes.some(n => n.id === 'start')) return '对话缺少 start 节点';
    if (!nodes.some(n => n.id === 'end')) return '对话缺少 end 节点';
    return validateItems(nodes, validateDialogueNode, '节点');
  }

  if (type === 'phone') {
    const chats = asArray(payload);
    const seen = new Set();
    for (const chat of chats) {
      if (!chat || typeof chat !== 'object') return '手机聊天格式错误';
      if (!chat.chat_id) return '手机聊天缺少 chat_id';
      if (seen.has(chat.chat_id)) return '手机聊天ID重复：' + chat.chat_id;
      seen.add(chat.chat_id);
      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      const err = validateItems(messages, validateMessage, `聊天 ${chat.chat_id} 消息`);
      if (err) return err;
    }
    return null;
  }

  const items = asArray(payload);
  if (type === 'actions') return validateItems(items, validateAction, '行动');
  if (type === 'events') return validateItems(items, validateEvent, '事件');
  if (type === 'locations') return validateItems(items, validateLocation, '地点');
  if (type === 'maps') return validateItems(items, validateMap, '地图');
  if (type === 'npcs') return validateItems(items, validateNPC, 'NPC');
  return null;
}

function validateImportPayload(type, payload, fileName) {
  const err = getImportValidationError(type, payload);
  if (!err) return true;
  toast(`导入失败：${fileName}：${err}`, true);
  return false;
}

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
          obj.dialogue_id = id;
          if (!validateImportPayload(type, obj, file.name)) continue;
          if (await saveDoc('dialogues/'+id, 'dialogues', obj)) {
            setData({ ...data, dialogues: { ...data.dialogues, [id]: obj } });
            imported++;
          }
        } else if (type === 'game_config') {
          if (!validateImportPayload(type, obj, file.name)) continue;
          if (await saveDoc('game_config', 'game_config', obj)) {
            setData({ ...data, game_config: obj });
            imported++;
          }
        } else {
          const idKey = type === 'phone' ? 'chat_id' : 'id';
          const arr = Array.isArray(obj) ? obj : [obj];
          let target;
          if (type === 'phone') target = [...data.phone_chats];
          else if (type === 'actions') target = [...data.actions];
          else if (type === 'locations') target = [...data.locations];
          else if (type === 'maps') target = [...data.maps];
          else if (type === 'npcs') target = [...data.npcs];
          else target = [...data.events];

          arr.forEach(item => {
            const idx = target.findIndex(x => x[idKey] === item[idKey]);
            if (idx >= 0) target[idx] = item; else target.push(item);
          });

          const docId = type === 'phone' ? 'phone_chats' : type;
          const docType = type === 'phone' ? 'phone_chats' : type;
          if (!validateImportPayload(type, target, file.name)) continue;
          if (await saveDoc(docId, docType, target)) {
            if (type === 'phone') setData({ ...data, phone_chats: target });
            else if (type === 'actions') setData({ ...data, actions: target });
            else if (type === 'locations') setData({ ...data, locations: target });
            else if (type === 'maps') setData({ ...data, maps: target });
            else if (type === 'npcs') setData({ ...data, npcs: target });
            else setData({ ...data, events: target });
            imported++;
          }
        }
      } catch(e) { toast('解析失败：'+file.name, true); }
    }
    switchTab(currentTab, true);
    if (imported) toast(`已导入 ${imported} 个文件`);
  };
  input.click();
}
window._importJSON = importJSON;

window.exportAll = function() {
  downloadJSON('actions.json', data.actions);
  toast('已导出 actions.json');
  downloadJSON('events.json', data.events);
  toast('已导出 events.json');
  Object.entries(data.dialogues).forEach(([id, obj]) => downloadJSON(id+'.json', obj));
  toast('已导出 '+Object.keys(data.dialogues).length+' 个对话文件');
  downloadJSON('maps.json', data.maps || []);
  toast('已导出 maps.json');
  downloadJSON('phone_chat.json', data.phone_chats);
  toast('已导出 phone_chat.json');
  toast('全部导出完成');
};

// ════════════════════════════════════════════
// AUTO-LOGIN
// ════════════════════════════════════════════
if (checkAutoLogin()) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initApp, 50);
    });
  } else {
    setTimeout(initApp, 50);
  }
}
