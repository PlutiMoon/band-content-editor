// ════════════════════════════════════════════
// DIALOGUES TAB — Desktop + Mobile
// ════════════════════════════════════════════
import { data, selectedDialogueIdx, mobileDialogueView, mobileEditingNodeIdx,
         setSelectedDialogueIdx, setData,
         setMobileDialogueView, setMobileEditingNodeIdx } from './state.js';
import { saveDoc, deleteDoc, toast, downloadJSON, buildToolbar, isMobile } from './core.js';
import {
  fld, sel, esc,
  renderStatReqs, readStatReqs,
  renderStringList, readStringList,
  renderRelDeltas, readRelDeltas,
  validateDialogueNode
} from './forms.js';
import { formatDeleteBlocker, formatReferenceSummary } from './delete_guards.js';

export function renderDialogues() {
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
  keys.forEach((k, i) => {
    const origIdx = allKeys.indexOf(k);
    html += `<div class="list-item ${origIdx===selectedDialogueIdx?'active':''}" data-di="${origIdx}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span>${esc(k)}</span>
        <button class="btn-sm btn-danger" data-dlg-del="${origIdx}" style="padding:1px 6px;font-size:0.7rem;">✕</button>
      </div>
    </div>`;
  });
  html += '</div>';

  if (selectedDialogueIdx >= 0 && selectedDialogueIdx < allKeys.length && keys.includes(allKeys[selectedDialogueIdx])) {
    const dk = allKeys[selectedDialogueIdx];
    const d = data.dialogues[dk];
    html += '<div class="split-content">';
    html += `<h4 style="color:var(--accent2);margin-bottom:4px;">${esc(dk)}</h4>`;
    html += `<div class="hint" style="margin-bottom:8px;">${esc(formatReferenceSummary('dialogue', dk, data))}</div>`;
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

  ct.querySelectorAll('.list-item').forEach(item => {
    item.addEventListener('click', function(e) {
      if (e.target.closest('button')) return;
      setSelectedDialogueIdx(parseInt(this.dataset.di));
      renderDialogues();
    });
  });
  ct.querySelectorAll('button[data-dlg-del]').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const keys = Object.keys(data.dialogues);
      deleteDialogue(keys[parseInt(this.dataset.dlgDel)]);
    });
  });

  const btnAddNode = ct.querySelector('#btn-add-node');
  if (btnAddNode) btnAddNode.onclick = addDialogueNode;
  ct.querySelectorAll('button[data-edit]').forEach(btn => {
    btn.addEventListener('click', function() { editDialogueNode(parseInt(this.dataset.edit)); });
  });
  ct.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', function() { deleteDialogueNode(parseInt(this.dataset.del)); });
  });

  document.getElementById('search-dialogue').addEventListener('input', renderDialogues);
}

// ── Dialogue CRUD ──

async function addDialogue() {
  const id = prompt('对话ID（英文下划线，如 npc_某人）：');
  if (!id) return;
  if (data.dialogues[id]) { toast('该ID已存在', true); return; }
  const obj = { dialogue_id: id, nodes: [{id:'start', speaker:'', text:''}, {id:'end', text:''}] };
  if (await saveDoc('dialogues/'+id, 'dialogues', obj)) {
    setData({ ...data, dialogues: { ...data.dialogues, [id]: obj } });
    setSelectedDialogueIdx(Object.keys(data.dialogues).indexOf(id));
    renderDialogues();
    toast('已创建：'+id);
  }
}

async function deleteDialogue(dk) {
  const blocker = formatDeleteBlocker('dialogue', dk, data);
  if (blocker) { toast(blocker, true); return; }
  if (!confirm('确定删除对话树「'+dk+'」？此操作不可恢复！')) return;
  if (await deleteDoc('dialogues/'+dk)) {
    const newDialogues = { ...data.dialogues };
    delete newDialogues[dk];
    setData({ ...data, dialogues: newDialogues });
    setSelectedDialogueIdx(-1);
    toast('已删除对话树：'+dk);
    renderDialogues();
  }
}

async function deleteDialogueNode(ni) {
  const keys = Object.keys(data.dialogues);
  const dk = keys[selectedDialogueIdx];
  if (!dk) return;
  const d = data.dialogues[dk];
  const nodes = d.nodes;
  if (nodes[ni].id === 'start' || nodes[ni].id === 'end') { toast('start 和 end 节点不可删除', true); return; }
  if (!confirm('确定删除节点「'+nodes[ni].id+'」？')) return;
  const newNodes = [...nodes];
  newNodes.splice(ni, 1);
  const updated = { ...d, nodes: newNodes };
  if (await saveDoc('dialogues/'+dk, 'dialogues', updated)) {
    setData({ ...data, dialogues: { ...data.dialogues, [dk]: updated } });
    renderDialogues();
  }
}

async function addDialogueNode() {
  const keys = Object.keys(data.dialogues);
  const dk = keys[selectedDialogueIdx];
  if (!dk) return;
  const id = prompt('节点ID（如 node_2）：');
  if (!id) return;
  const d = data.dialogues[dk];
  const newNodes = [...d.nodes, {id, speaker:'', text:'', next:''}];
  const updated = { ...d, nodes: newNodes };
  if (await saveDoc('dialogues/'+dk, 'dialogues', updated)) {
    setData({ ...data, dialogues: { ...data.dialogues, [dk]: updated } });
    renderDialogues();
  }
}

// ── Edit dialogue node (desktop) ──

function editDialogueNode(ni) {
  const keys = Object.keys(data.dialogues);
  const dk = keys[selectedDialogueIdx];
  if (!dk) return;
  const n = data.dialogues[dk].nodes[ni];
  const ct = document.getElementById('content');

  let html = '<div class="split-layout">';
  html += '<div class="split-list">';
  keys.forEach((k, i) => {
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

  ct.querySelectorAll('.list-item').forEach(item => {
    item.addEventListener('click', function() {
      setSelectedDialogueIdx(parseInt(this.dataset.di));
      renderDialogues();
    });
  });
}

// ── Import / Export ──

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
        obj.dialogue_id = id;
        if (await saveDoc('dialogues/'+id, 'dialogues', obj)) {
          setData({ ...data, dialogues: { ...data.dialogues, [id]: obj } });
          imported++;
        }
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

  setMobileDialogueView('list');
  setMobileEditingNodeIdx(-1);

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
      <button class="btn-sm btn-danger node-card-del" data-dlg-mdel="${origIdx}">✕</button>
    </div>`;
  });
  html += '</div>';
  ct.innerHTML = html;

  ct.querySelectorAll('.mobile-chat-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('button')) return;
      setSelectedDialogueIdx(parseInt(this.dataset.di));
      setMobileDialogueView('nodes');
      renderDialogues();
    });
  });
  ct.querySelectorAll('button[data-dlg-mdel]').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const keys = Object.keys(data.dialogues);
      deleteDialogue(keys[parseInt(this.dataset.dlgMdel)]);
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
    setMobileDialogueView('list');
    renderDialogues();
  };
  document.getElementById('btn-dlg-add-node').onclick = async function() {
    const id = prompt('节点ID（如 node_2）：');
    if (!id) return;
    const d2 = data.dialogues[dk];
    const newNodes = [...d2.nodes, { id, speaker: '', text: '', next: '' }];
    const updated = { ...d2, nodes: newNodes };
    if (await saveDoc('dialogues/' + dk, 'dialogues', updated)) {
      setData({ ...data, dialogues: { ...data.dialogues, [dk]: updated } });
      renderDialogues();
    }
  };
  ct.querySelectorAll('.mobile-node-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('button')) return;
      setMobileEditingNodeIdx(parseInt(this.dataset.ni));
      setMobileDialogueView('editor');
      renderDialogues();
    });
  });
  ct.querySelectorAll('.node-card-del').forEach(btn => {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      const ni = parseInt(this.dataset.ndel);
      const d2 = data.dialogues[dk];
      const node = d2.nodes[ni];
      if (node.id === 'start' || node.id === 'end') { toast('start 和 end 节点不可删除', true); return; }
      if (!confirm('确定删除节点「' + node.id + '」？')) return;
      const newNodes = [...d2.nodes];
      newNodes.splice(ni, 1);
      const updated = { ...d2, nodes: newNodes };
      if (await saveDoc('dialogues/' + dk, 'dialogues', updated)) {
        setData({ ...data, dialogues: { ...data.dialogues, [dk]: updated } });
        renderDialogues();
      }
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
    setMobileDialogueView('nodes');
    setMobileEditingNodeIdx(-1);
    renderDialogues();
  };
  document.getElementById('btn-node-cancel-m').onclick = function() {
    setMobileDialogueView('nodes');
    setMobileEditingNodeIdx(-1);
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

    const fx2 = {};
    const fm = document.getElementById('dln_fx_money_m').value; if (fm !== '') fx2.money = parseInt(fm);
    const fs = readStatReqs('dln_fx_stats_m', true); if (fs.length) fx2.stats = fs;
    const fr = readRelDeltas('dln_fx_rels_m'); if (fr.length) fx2.relationships = fr;
    const ffl = readStringList('dln_fx_flags_m'); if (ffl.length) fx2.flags = ffl;
    if (Object.keys(fx2).length) n.effects = fx2; else delete n.effects;

    if (await saveDoc('dialogues/' + dk, 'dialogues', data.dialogues[dk])) {
      toast('节点已保存');
      setMobileDialogueView('nodes');
      setMobileEditingNodeIdx(-1);
      renderDialogues();
    }
  };

  // Note: _addStat, _addStr, _addRelD are already on window from forms.js — no need to redefine
}
