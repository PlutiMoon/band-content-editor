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
import { renderHealth } from './js/health.js';
import { renderSnapshots, createManualSnapshot } from './js/snapshots.js';
import { createSnapshot } from './js/snapshot_store.js';
import { renderReferences } from './js/references.js';
import { renderGraph } from './js/graph.js';
import { renderSearch } from './js/search.js';
import { renderReleases } from './js/releases.js';
import { createReleaseRecord } from './js/release_store.js';
import { renderAudit } from './js/audit.js';
import { recordAuditEntry } from './js/audit_store.js';
import { buildPublishGate, formatPublishGateMessage } from './js/publish_gate.js';
import { buildImportPreview, formatImportPreview } from './js/import_preview.js';
import {
  validateAction,
  validateEvent,
  validateLocation,
  validateNPC,
  validateMap,
  validateGameConfig,
  validateDialogueNode,
  validateMessage,
  esc
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
    case 'health': renderHealth(); break;
    case 'snapshots': renderSnapshots(); break;
    case 'references': renderReferences(); break;
    case 'graph': renderGraph(); break;
    case 'search': renderSearch(); break;
    case 'releases': renderReleases(); break;
    case 'audit': renderAudit(); break;
  }
}
window._switchTab = switchTab;

// ════════════════════════════════════════════
// EXPOSE TO WINDOW (for HTML onclick handlers)
// ════════════════════════════════════════════
window.pullFromDB = pullFromDB;
window._createManualSnapshot = function() {
  createManualSnapshot();
};

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

function importOperationLabel(operation) {
  if (operation === 'create') return '新增';
  if (operation === 'overwrite') return '覆盖';
  if (operation === 'replace') return '替换';
  return '错误';
}

function importOperationColor(operation) {
  if (operation === 'create') return 'var(--ok)';
  if (operation === 'overwrite') return 'var(--warn)';
  if (operation === 'replace') return 'var(--accent2)';
  return 'var(--danger)';
}

function showImportPreviewModal(preview) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = 'import-preview-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,0.58);display:flex;align-items:center;justify-content:center;padding:16px;';
    const rows = (preview.items || []).map(item => {
      const label = importOperationLabel(item.operation);
      const color = importOperationColor(item.operation);
      const detail = item.error || item.id || '';
      return `<tr>
        <td style="color:${color};font-weight:700;">${esc(label)}</td>
        <td>${esc(item.fileName)}</td>
        <td>${esc(detail)}</td>
      </tr>`;
    }).join('');
    overlay.innerHTML = `<div style="width:min(720px,96vw);max-height:86vh;overflow:auto;background:var(--bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 18px 60px rgba(0,0,0,0.35);">
      <div style="padding:14px 16px;border-bottom:1px solid var(--border);">
        <div style="font-size:1.05rem;font-weight:700;color:var(--accent2);">导入预览</div>
        <div class="hint" style="margin-top:4px;white-space:pre-line;">${esc(formatImportPreview(preview).split('\n').slice(0, 2).join('\n'))}</div>
      </div>
      <div style="padding:12px 16px;">
        <table><thead><tr><th>操作</th><th>文件</th><th>ID / 错误</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid var(--border);">
        <button id="import-preview-cancel">取消</button>
        <button class="btn-ok" id="import-preview-confirm">确认导入</button>
      </div>
    </div>`;
    const close = value => {
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector('#import-preview-cancel').onclick = () => close(false);
    overlay.querySelector('#import-preview-confirm').onclick = () => close(true);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close(false);
    });
    document.body.appendChild(overlay);
  });
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

    const entries = [];
    for (const file of files) {
      try {
        entries.push({ fileName: file.name, payload: JSON.parse(await file.text()) });
      } catch(e) {
        entries.push({ fileName: file.name, error: 'JSON 解析失败' });
      }
    }

    const preview = buildImportPreview(type, entries, data);
    if (!preview.importableCount) {
      toast('没有可导入的有效文件', true);
      return;
    }
    if (!(await showImportPreviewModal(preview))) return;

    createSnapshot(data, { source: 'import', label: `导入前：${type} (${preview.importableCount} 项 / ${files.length} 个文件)` });
    toast('已自动创建导入前快照');

    let imported = 0;
    for (const entry of entries) {
      try {
        const fileName = entry.fileName;
        if (entry.error) {
          toast('解析失败：'+fileName, true);
          continue;
        }
        const obj = entry.payload;
        if (type === 'dialogues') {
          const id = obj.dialogue_id || fileName.replace('.json','');
          obj.dialogue_id = id;
          if (!validateImportPayload(type, obj, fileName)) continue;
          if (await saveDoc('dialogues/'+id, 'dialogues', obj)) {
            setData({ ...data, dialogues: { ...data.dialogues, [id]: obj } });
            imported++;
          }
        } else if (type === 'game_config') {
          if (!validateImportPayload(type, obj, fileName)) continue;
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
          if (!validateImportPayload(type, target, fileName)) continue;
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
      } catch(e) { toast('导入失败：'+entry.fileName, true); }
    }
    switchTab(currentTab, true);
    if (imported) toast(`已导入 ${imported} 个文件`);
  };
  input.click();
}
window._importJSON = importJSON;

window.exportAll = function() {
  const gate = buildPublishGate(data);
  if (gate.status === 'blocked') {
    toast(formatPublishGateMessage(gate), true);
    switchTab('health');
    return;
  }
  if (gate.status === 'warning' && !confirm(formatPublishGateMessage(gate) + '\n\n继续导出？')) {
    switchTab('health');
    return;
  }
  const files = [
    'actions.json',
    'events.json',
    ...Object.keys(data.dialogues || {}).map(id => id + '.json'),
    'maps.json',
    'phone_chat.json',
  ];
  const releaseSnapshot = createSnapshot(data, { source: 'release', label: '发布导出前快照' });
  const releaseRecord = createReleaseRecord({
    snapshot: releaseSnapshot,
    gate,
    user: userName,
    files,
    data,
  });
  recordAuditEntry({
    action: 'release_export',
    doc_id: releaseRecord.version,
    doc_type: 'release',
    user: userName,
    summary: `files:${files.length}; snapshot:${releaseSnapshot.id}`,
  });
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
  toast(`全部导出完成：${releaseRecord.version}`);
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
