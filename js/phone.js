// ════════════════════════════════════════════
// PHONE TAB — Desktop + Mobile
// ════════════════════════════════════════════
import { PHASES } from './config.js';
import { data, userName, selectedChatIdx,
         mobilePhoneView,
         setSelectedChatIdx, setData,
         setMobilePhoneView } from './state.js';
import { saveDoc, toast, downloadJSON, buildToolbar, isMobile } from './core.js';
import {
  fld, sel, esc,
  validateMessage
} from './forms.js';

export function renderPhone() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = buildToolbar({ icon: '📱', label: '手机消息', unit: '会话', count: data.phone_chats.length, id: 'chat', addLabel: '新建会话', exportLabel: '导出文件' });
  document.getElementById('btn-add-chat').onclick = addChat;
  document.getElementById('btn-import-chat').onclick = () => window._importJSON('phone');
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
      if (e.target.closest('button')) return;
      setSelectedChatIdx(parseInt(this.dataset.ci));
      renderPhone();
    });
  });
  ct.querySelectorAll('button[data-chat-del]').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      setSelectedChatIdx(parseInt(this.dataset.chatDel));
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
}

// ── Chat CRUD ──

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

async function addChat() {
  const name = prompt('会话名称（如 乐队群）：');
  if (!name) return;
  const cid = prompt('会话ID（英文下划线）：') || name;
  const newArr = [...data.phone_chats, {chat_id: cid, chat_name: name, type: 'private', messages: []}];
  if (await saveDoc('phone_chats', 'phone_chats', newArr)) {
    setData({ ...data, phone_chats: newArr });
    setSelectedChatIdx(newArr.length - 1);
    renderPhone();
  }
}

async function deleteChat() {
  if (selectedChatIdx < 0) return;
  if (!confirm('确定删除会话「'+data.phone_chats[selectedChatIdx].chat_name+'」？')) return;
  const newArr = [...data.phone_chats];
  newArr.splice(selectedChatIdx, 1);
  if (await saveDoc('phone_chats', 'phone_chats', newArr)) {
    setData({ ...data, phone_chats: newArr });
    if (selectedChatIdx >= newArr.length) setSelectedChatIdx(-1);
    renderPhone();
  }
}

async function addMessage() {
  if (selectedChatIdx < 0) return;
  const id = prompt('消息ID（如 m10）：');
  if (!id) return;
  const chat = data.phone_chats[selectedChatIdx];
  const newChats = [...data.phone_chats];
  newChats[selectedChatIdx] = { ...chat, messages: [...chat.messages, {id, sender:'', text:'', delay_day:1, delay_phase:'早晨'}] };
  if (await saveDoc('phone_chats', 'phone_chats', newChats)) {
    setData({ ...data, phone_chats: newChats });
    renderPhone();
  }
}

async function deleteMessage(mi) {
  if (selectedChatIdx < 0) return;
  const chat = data.phone_chats[selectedChatIdx];
  const newMsgs = [...chat.messages];
  newMsgs.splice(mi, 1);
  const newChats = [...data.phone_chats];
  newChats[selectedChatIdx] = { ...chat, messages: newMsgs };
  if (await saveDoc('phone_chats', 'phone_chats', newChats)) {
    setData({ ...data, phone_chats: newChats });
    renderPhone();
  }
}

// ── Edit message (desktop) ──

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
  html += '<div class="detail-actions"><button id="btn-msg-cancel">取消</button><button class="btn-ok" id="btn-msg-save">💾 保存消息</button></div>';
  html += '</div>';

  const area = document.querySelector('.split-content');
  const old = area?.querySelector('#msgEditor');
  if (old) old.remove();
  if (area) area.insertAdjacentHTML('beforeend', html);

  document.getElementById('btn-msg-cancel').onclick = renderPhone;
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

  setMobilePhoneView('list');

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
      setSelectedChatIdx(parseInt(this.dataset.ci));
      setMobilePhoneView('chat');
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
    setMobilePhoneView('list');
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

    const newChats = [...data.phone_chats];
    const newMsgs = [...chat.messages];
    if (isNew) {
      newMsgs.push(msgObj);
    } else {
      newMsgs[mi] = msgObj;
    }
    newChats[selectedChatIdx] = { ...chat, messages: newMsgs };

    if (await saveDoc('phone_chats', 'phone_chats', newChats)) {
      setData({ ...data, phone_chats: newChats });
      toast(isNew ? '消息已添加' : '消息已保存');
      closeMessageEditor();
      renderPhone();
    }
  };

  const delBtn = document.getElementById('btn-msg-delete-m');
  if (delBtn) delBtn.onclick = async function() {
    if (!confirm('确定删除消息「' + m.id + '」？')) return;
    const newChats = [...data.phone_chats];
    const newMsgs = [...chat.messages];
    newMsgs.splice(mi, 1);
    newChats[selectedChatIdx] = { ...chat, messages: newMsgs };
    if (await saveDoc('phone_chats', 'phone_chats', newChats)) {
      setData({ ...data, phone_chats: newChats });
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
    const newArr = [...data.phone_chats];
    newArr.splice(selectedChatIdx, 1);
    if (await saveDoc('phone_chats', 'phone_chats', newArr)) {
      setData({ ...data, phone_chats: newArr });
      if (selectedChatIdx >= newArr.length) setSelectedChatIdx(-1);
      toast('会话已删除');
      closeMessageEditor();
      setMobilePhoneView('list');
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
