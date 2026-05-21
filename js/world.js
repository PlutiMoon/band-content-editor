// ════════════════════════════════════════════
// WORLD CONFIG TAB — game config, locations, NPCs
// ════════════════════════════════════════════
import { STAT_NAMES } from './config.js';
import { data, worldSection, selectedLocationIdx, selectedNPCIdx,
  setWorldSection, setSelectedLocationIdx, setSelectedNPCIdx, setData } from './state.js';
import { saveDoc, toast, downloadJSON } from './core.js';
import { fld, sel, esc } from './forms.js';

export function renderWorld() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>🌍 世界配置</span>
    <span class="hint">管理游戏参数 / 地点 / NPC</span>
    <button class="${worldSection==='config'?'btn-ok':'btn-accent'}" id="btn-sec-config">⚙ 游戏参数</button>
    <button class="${worldSection==='locations'?'btn-ok':'btn-accent'}" id="btn-sec-loc">📍 地点</button>
    <button class="${worldSection==='npcs'?'btn-ok':'btn-accent'}" id="btn-sec-npc">👤 NPC</button>`;
  document.getElementById('btn-sec-config').onclick = () => { setWorldSection('config'); setSelectedLocationIdx(-1); setSelectedNPCIdx(-1); renderWorld(); };
  document.getElementById('btn-sec-loc').onclick = () => { setWorldSection('locations'); setSelectedLocationIdx(-1); setSelectedNPCIdx(-1); renderWorld(); };
  document.getElementById('btn-sec-npc').onclick = () => { setWorldSection('npcs'); setSelectedLocationIdx(-1); setSelectedNPCIdx(-1); renderWorld(); };

  const ct = document.getElementById('content');
  switch (worldSection) {
    case 'config': renderGameConfig(ct); break;
    case 'locations': renderLocations(ct); break;
    case 'npcs': renderNPCs(ct); break;
    default: renderGameConfig(ct);
  }
}

// ════════════════════════════════════════════
// SECTION 1: GAME CONFIG
// ════════════════════════════════════════════
function renderGameConfig(ct) {
  const gc = data.game_config || {};
  let html = '<div style="padding:16px;background:var(--bg2);border-radius:6px;">';
  html += '<h3 style="color:var(--accent2);margin-bottom:12px;">⚙ 游戏参数</h3>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('一周天数','gc_max_days',gc.max_days??7,'number');
  html += fld('初始金钱','gc_starting_money',gc.starting_money??500,'number');
  html += fld('属性下限','gc_stat_min',gc.stat_min??0,'number');
  html += fld('属性上限','gc_stat_max',gc.stat_max??100,'number');
  html += sel('初始地点','gc_starting_location',gc.starting_location||'rental_room',
    (data.locations||[]).map(l => [l.id, l.name||l.id]));
  html += fld('初始X坐标','gc_spawn_x',gc.starting_spawn?.x??100,'number');
  html += fld('初始Y坐标','gc_spawn_y',gc.starting_spawn?.y??240,'number');
  html += '</div>';

  html += '<div class="section-label">初始属性值</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">';
  STAT_NAMES.forEach((name, i) => {
    html += fld(name, 'gc_stat_'+i, gc.starting_stats?.[String(i)] ?? (i===5?50:15), 'number');
  });
  html += '</div>';

  html += '<div class="detail-actions"><button class="btn-ok" id="btn-save-gc">💾 保存到数据库</button></div>';
  html += '</div>';
  ct.innerHTML = html;
  document.getElementById('btn-save-gc').onclick = saveGameConfig;
}

async function saveGameConfig() {
  const gc = {};
  gc.max_days = parseInt(document.getElementById('gc_max_days').value) || 7;
  gc.starting_money = parseInt(document.getElementById('gc_starting_money').value) || 500;
  gc.stat_min = parseInt(document.getElementById('gc_stat_min').value) || 0;
  gc.stat_max = parseInt(document.getElementById('gc_stat_max').value) || 100;
  gc.starting_location = document.getElementById('gc_starting_location').value;
  gc.starting_spawn = {
    x: parseFloat(document.getElementById('gc_spawn_x').value) || 100,
    y: parseFloat(document.getElementById('gc_spawn_y').value) || 240
  };
  gc.starting_stats = {};
  STAT_NAMES.forEach((_, i) => {
    gc.starting_stats[String(i)] = parseInt(document.getElementById('gc_stat_'+i).value) || 0;
  });

  if (await saveDoc('game_config', 'game_config', gc)) {
    setData({ ...data, game_config: gc });
    toast('已保存游戏参数');
    renderWorld();
  }
}

// ════════════════════════════════════════════
// SECTION 2: LOCATIONS
// ════════════════════════════════════════════
function renderLocations(ct) {
  const q = (document.getElementById('search-loc')?.value || '').toLowerCase();
  let html = '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
  html += '<button class="btn-ok" id="btn-add-loc">+ 新增地点</button>';
  html += '<input type="search" id="search-loc" placeholder="搜索地点..." style="width:140px;">';
  html += '<button id="btn-import-loc">📥 导入</button>';
  html += '<button id="btn-export-loc">📤 导出</button>';
  html += '</div>';

  const allLocs = data.locations || [];
  const locs = q ? allLocs.filter(l => (l.id+';'+l.name+';'+(l.scene_path||'')).toLowerCase().includes(q)) : allLocs;
  if (locs.length === 0) {
    html += '<p style="color:var(--text2);text-align:center;padding:40px;">暂无地点，点击「新增地点」</p>';
    ct.innerHTML = html;
  } else {
    html += '<table><thead><tr><th>ID</th><th>名称</th><th>场景路径</th><th>地图坐标</th><th></th></tr></thead><tbody>';
    locs.forEach((l, i) => {
      const pos = l.map_position || {};
      html += `<tr class="${i===selectedLocationIdx?'selected':''}" data-loc-idx="${i}">
        <td>${esc(l.id)}</td><td>${esc(l.name)}</td><td style="font-size:11px;">${esc(l.scene_path||'')}</td>
        <td>(${pos.x??0}, ${pos.y??0})</td>
        <td><button class="btn-sm btn-danger" data-loc-del="${i}">✕</button></td></tr>`;
    });
    html += '</tbody></table>';
    ct.innerHTML = html;

    ct.querySelectorAll('tr[data-loc-idx]').forEach(tr => {
      tr.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        setSelectedLocationIdx(parseInt(this.dataset.locIdx));
        renderLocations(ct);
      });
    });
    ct.querySelectorAll('button[data-loc-del]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteLocation(parseInt(this.dataset.locDel));
      });
    });
  }

  document.getElementById('btn-add-loc').onclick = addLocation;
  document.getElementById('btn-import-loc').onclick = () => window._importJSON('locations');
  document.getElementById('btn-export-loc').onclick = () => { downloadJSON('locations.json', data.locations); toast('已导出 locations.json'); };
  document.getElementById('search-loc').addEventListener('input', () => { setSelectedLocationIdx(-1); renderLocations(ct); });

  if (selectedLocationIdx >= 0 && selectedLocationIdx < locs.length) renderLocationDetail(ct);
}

function renderLocationDetail(ct) {
  const l = data.locations[selectedLocationIdx];
  const existing = ct.querySelector('#locDetail');
  if (existing) existing.remove();

  const pos = l.map_position || {};
  const br = l.building_rect || [];
  const lbl = l.map_label_pos || {};
  let html = '<div style="margin-top:16px;padding:16px;background:var(--bg2);border-radius:6px;" id="locDetail">';
  html += '<h3 style="color:var(--accent2);margin-bottom:8px;">编辑地点：'+esc(l.name)+'</h3>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('ID','loc_id',l.id);
  html += fld('名称','loc_name',l.name);
  html += fld('场景路径','loc_scene',l.scene_path||'');
  html += fld('触发X','loc_x',pos.x??0,'number');
  html += fld('触发Y','loc_y',pos.y??0,'number');
  html += fld('建筑X','loc_bx',br[0]??0,'number');
  html += fld('建筑Y','loc_by',br[1]??0,'number');
  html += fld('建筑W','loc_bw',br[2]??0,'number');
  html += fld('建筑H','loc_bh',br[3]??0,'number');
  html += fld('标签X','loc_lx',lbl.x??0,'number');
  html += fld('标签Y','loc_ly',lbl.y??0,'number');
  html += '</div>';
  html += '<div class="detail-actions"><button id="btn-cancel-loc">取消</button><button class="btn-ok" id="btn-save-loc">💾 保存到数据库</button></div>';
  html += '</div>';
  ct.insertAdjacentHTML('beforeend', html);
  document.getElementById('btn-save-loc').onclick = saveLocationDetail;
  document.getElementById('btn-cancel-loc').onclick = () => {
    setSelectedLocationIdx(-1);
    renderWorld();
  };
}

async function saveLocationDetail() {
  const l = data.locations[selectedLocationIdx];
  l.id = document.getElementById('loc_id').value.trim();
  l.name = document.getElementById('loc_name').value.trim();
  l.scene_path = document.getElementById('loc_scene').value.trim();
  l.map_position = {
    x: parseFloat(document.getElementById('loc_x').value) || 0,
    y: parseFloat(document.getElementById('loc_y').value) || 0
  };
  const bx = parseInt(document.getElementById('loc_bx').value) || 0;
  const by = parseInt(document.getElementById('loc_by').value) || 0;
  const bw = parseInt(document.getElementById('loc_bw').value) || 0;
  const bh = parseInt(document.getElementById('loc_bh').value) || 0;
  l.building_rect = [bx, by, bw, bh];
  l.map_label_pos = {
    x: parseFloat(document.getElementById('loc_lx').value) || 0,
    y: parseFloat(document.getElementById('loc_ly').value) || 0
  };

  if (!l.id) { toast('ID 不能为空', true); return; }
  if (await saveDoc('locations', 'locations', data.locations)) {
    toast('已保存地点');
    renderWorld();
  }
}

async function addLocation() {
  const id = prompt('地点ID（英文下划线，如 city_square）：');
  if (!id) return;
  if ((data.locations||[]).find(l => l.id === id)) { toast('该ID已存在', true); return; }
  const item = {
    id, name: '新地点', scene_path: '', map_position: { x: 0, y: 240 },
    building_rect: [0, 180, 60, 60], map_label_pos: { x: 0, y: 175 }
  };
  const newArr = [...(data.locations||[]), item];
  if (await saveDoc('locations', 'locations', newArr)) {
    setData({ ...data, locations: newArr });
    setSelectedLocationIdx(newArr.length - 1);
    renderWorld();
  }
}

async function deleteLocation(i) {
  const name = (data.locations||[])[i]?.name || '';
  if (!confirm('确定删除地点「'+name+'」？')) return;
  const newArr = [...(data.locations||[])];
  newArr.splice(i, 1);
  if (await saveDoc('locations', 'locations', newArr)) {
    setData({ ...data, locations: newArr });
    if (selectedLocationIdx >= newArr.length) setSelectedLocationIdx(Math.max(0, newArr.length - 1));
    renderWorld();
  }
}

// ════════════════════════════════════════════
// SECTION 3: NPCs
// ════════════════════════════════════════════
function renderNPCs(ct) {
  const q = (document.getElementById('search-npc')?.value || '').toLowerCase();
  let html = '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
  html += '<button class="btn-ok" id="btn-add-npc">+ 新增NPC</button>';
  html += '<input type="search" id="search-npc" placeholder="搜索NPC..." style="width:140px;">';
  html += '<button id="btn-import-npc">📥 导入</button>';
  html += '<button id="btn-export-npc">📤 导出</button>';
  html += '</div>';

  const allNpcs = data.npcs || [];
  const npcs = q ? allNpcs.filter(n => (n.id+';'+n.name+';'+(n.dialogue_id||'')).toLowerCase().includes(q)) : allNpcs;
  if (npcs.length === 0) {
    html += '<p style="color:var(--text2);text-align:center;padding:40px;">暂无NPC，点击「新增NPC」</p>';
    ct.innerHTML = html;
  } else {
    html += '<table><thead><tr><th>ID</th><th>名称</th><th>对话ID</th><th>地图坐标</th><th></th></tr></thead><tbody>';
    npcs.forEach((n, i) => {
      const pos = n.map_position || {};
      html += `<tr class="${i===selectedNPCIdx?'selected':''}" data-npc-idx="${i}">
        <td>${esc(n.id)}</td><td>${esc(n.name)}</td><td>${esc(n.dialogue_id||'')}</td>
        <td>(${pos.x??0}, ${pos.y??0})</td>
        <td><button class="btn-sm btn-danger" data-npc-del="${i}">✕</button></td></tr>`;
    });
    html += '</tbody></table>';
    ct.innerHTML = html;

    ct.querySelectorAll('tr[data-npc-idx]').forEach(tr => {
      tr.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        setSelectedNPCIdx(parseInt(this.dataset.npcIdx));
        renderNPCs(ct);
      });
    });
    ct.querySelectorAll('button[data-npc-del]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteNPC(parseInt(this.dataset.npcDel));
      });
    });
  }

  document.getElementById('btn-add-npc').onclick = addNPC;
  document.getElementById('btn-import-npc').onclick = () => window._importJSON('npcs');
  document.getElementById('btn-export-npc').onclick = () => { downloadJSON('npcs.json', data.npcs); toast('已导出 npcs.json'); };
  document.getElementById('search-npc').addEventListener('input', () => { setSelectedNPCIdx(-1); renderNPCs(ct); });

  if (selectedNPCIdx >= 0 && selectedNPCIdx < npcs.length) renderNPCDetail(ct);
}

function renderNPCDetail(ct) {
  const n = data.npcs[selectedNPCIdx];
  const existing = ct.querySelector('#npcDetail');
  if (existing) existing.remove();

  const pos = n.map_position || {};
  let html = '<div style="margin-top:16px;padding:16px;background:var(--bg2);border-radius:6px;" id="npcDetail">';
  html += '<h3 style="color:var(--accent2);margin-bottom:8px;">编辑NPC：'+esc(n.name)+'</h3>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('ID','npc_id',n.id);
  html += fld('名称','npc_name',n.name);
  html += fld('对话ID','npc_did',n.dialogue_id||'');
  html += fld('地图X','npc_x',pos.x??0,'number');
  html += fld('地图Y','npc_y',pos.y??0,'number');
  html += '</div>';
  html += '<div class="detail-actions"><button id="btn-cancel-npc">取消</button><button class="btn-ok" id="btn-save-npc">💾 保存到数据库</button></div>';
  html += '</div>';
  ct.insertAdjacentHTML('beforeend', html);
  document.getElementById('btn-save-npc').onclick = saveNPCDetail;
  document.getElementById('btn-cancel-npc').onclick = () => {
    setSelectedNPCIdx(-1);
    renderWorld();
  };
}

async function saveNPCDetail() {
  const n = data.npcs[selectedNPCIdx];
  n.id = document.getElementById('npc_id').value.trim();
  n.name = document.getElementById('npc_name').value.trim();
  n.dialogue_id = document.getElementById('npc_did').value.trim();
  n.map_position = {
    x: parseFloat(document.getElementById('npc_x').value) || 0,
    y: parseFloat(document.getElementById('npc_y').value) || 0
  };

  if (!n.id) { toast('ID 不能为空', true); return; }
  if (await saveDoc('npcs', 'npcs', data.npcs)) {
    toast('已保存NPC');
    renderWorld();
  }
}

async function addNPC() {
  const id = prompt('NPC ID（如 npc_drummer）：');
  if (!id) return;
  if ((data.npcs||[]).find(n => n.id === id)) { toast('该ID已存在', true); return; }
  const item = { id, name: '新NPC', dialogue_id: '', map_position: { x: 0, y: 240 } };
  const newArr = [...(data.npcs||[]), item];
  if (await saveDoc('npcs', 'npcs', newArr)) {
    setData({ ...data, npcs: newArr });
    setSelectedNPCIdx(newArr.length - 1);
    renderWorld();
  }
}

async function deleteNPC(i) {
  const name = (data.npcs||[])[i]?.name || '';
  if (!confirm('确定删除NPC「'+name+'」？')) return;
  const newArr = [...(data.npcs||[])];
  newArr.splice(i, 1);
  if (await saveDoc('npcs', 'npcs', newArr)) {
    setData({ ...data, npcs: newArr });
    if (selectedNPCIdx >= newArr.length) setSelectedNPCIdx(Math.max(0, newArr.length - 1));
    renderWorld();
  }
}
