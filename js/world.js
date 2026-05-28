// ════════════════════════════════════════════
// WORLD CONFIG TAB — game config, locations, NPCs
// ════════════════════════════════════════════
import { STAT_NAMES } from './config.js';
import { data, worldSection, selectedLocationIdx, selectedNPCIdx, selectedMapIdx,
  setWorldSection, setSelectedLocationIdx, setSelectedNPCIdx, setSelectedMapIdx, setData } from './state.js';
import { saveDoc, toast, downloadJSON } from './core.js';
import { fld, sel, esc, validateLocation, validateNPC, validateMap, validateGameConfig } from './forms.js';
import { formatDeleteBlocker, formatReferenceSummary, rewriteContentReferences } from './delete_guards.js';
import { confirmReferenceRewrite, saveReferenceMigration } from './reference_migrations.js';

export function renderWorld() {
  const tb = document.getElementById('toolbar');
  tb.innerHTML = `<span>🌍 世界配置</span>
    <span class="hint">管理游戏参数 / 地点 / NPC</span>
    <button class="${worldSection==='config'?'btn-ok':'btn-accent'}" id="btn-sec-config">⚙ 游戏参数</button>
    <button class="${worldSection==='locations'?'btn-ok':'btn-accent'}" id="btn-sec-loc">📍 地点</button>
    <button class="${worldSection==='npcs'?'btn-ok':'btn-accent'}" id="btn-sec-npc">👤 NPC</button>
    <button class="${worldSection==='maps'?'btn-ok':'btn-accent'}" id="btn-sec-maps">🗺 地图</button>`;
  const resetSel = () => { setSelectedLocationIdx(-1); setSelectedNPCIdx(-1); setSelectedMapIdx(-1); };
  document.getElementById('btn-sec-config').onclick = () => { setWorldSection('config'); resetSel(); renderWorld(); };
  document.getElementById('btn-sec-loc').onclick = () => { setWorldSection('locations'); resetSel(); renderWorld(); };
  document.getElementById('btn-sec-npc').onclick = () => { setWorldSection('npcs'); resetSel(); renderWorld(); };
  document.getElementById('btn-sec-maps').onclick = () => { setWorldSection('maps'); resetSel(); renderWorld(); };

  const ct = document.getElementById('content');
  switch (worldSection) {
    case 'config': renderGameConfig(ct); break;
    case 'locations': renderLocations(ct); break;
    case 'npcs': renderNPCs(ct); break;
    case 'maps': renderMaps(ct); break;
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
  html += sel('初始地图','gc_starting_map',gc.starting_map||'old_town',
    (data.maps||[]).map(m => [m.id, m.name||m.id]));
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
  gc.starting_map = document.getElementById('gc_starting_map')?.value || 'old_town';
  gc.starting_location = document.getElementById('gc_starting_location').value;
  gc.starting_spawn = {
    x: parseFloat(document.getElementById('gc_spawn_x').value) || 100,
    y: parseFloat(document.getElementById('gc_spawn_y').value) || 240
  };
  gc.starting_stats = {};
  STAT_NAMES.forEach((_, i) => {
    gc.starting_stats[String(i)] = parseInt(document.getElementById('gc_stat_'+i).value) || 0;
  });

  const err = validateGameConfig(gc);
  if (err) { toast(err, true); return; }

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
    locs.forEach((l) => {
      const i = allLocs.indexOf(l);
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

  if (selectedLocationIdx >= 0 && selectedLocationIdx < allLocs.length) renderLocationDetail(ct);
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
  html += `<div class="hint" style="margin-bottom:8px;">${esc(formatReferenceSummary('location', l.id, data))}</div>`;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('ID','loc_id',l.id);
  html += fld('名称','loc_name',l.name);
  html += sel('所属地图','loc_map_id',l.map_id||'old_town', (data.maps||[]).map(m => [m.id, m.name||m.id]));
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
  const oldId = l.id;
  l.id = document.getElementById('loc_id').value.trim();
  l.name = document.getElementById('loc_name').value.trim();
  l.map_id = document.getElementById('loc_map_id')?.value || 'old_town';
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
  const err = validateLocation(l, data.locations);
  if (err) { toast(err, true); return; }
  if (!confirmReferenceRewrite('location', oldId, l.id, data)) {
    l.id = oldId;
    return;
  }

  const migration = rewriteContentReferences('location', oldId, l.id, data);
  if (await saveDoc('locations', 'locations', data.locations)) {
    if (!(await saveReferenceMigration(migration, data))) {
      toast('已保存地点，但同步引用失败，请重新拉取检查', true);
      return;
    }
    toast('已保存地点');
    renderWorld();
  }
}

async function addLocation() {
  const id = prompt('地点ID（英文下划线，如 city_square）：');
  if (!id) return;
  if ((data.locations||[]).find(l => l.id === id)) { toast('该ID已存在', true); return; }
  const item = {
    id, name: '新地点', map_id: 'old_town', scene_path: '', map_position: { x: 0, y: 240 },
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
  const id = (data.locations||[])[i]?.id;
  const blocker = formatDeleteBlocker('location', id, data);
  if (blocker) { toast(blocker, true); return; }
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
    npcs.forEach((n) => {
      const i = allNpcs.indexOf(n);
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

  if (selectedNPCIdx >= 0 && selectedNPCIdx < allNpcs.length) renderNPCDetail(ct);
}

function renderNPCDetail(ct) {
  const n = data.npcs[selectedNPCIdx];
  const existing = ct.querySelector('#npcDetail');
  if (existing) existing.remove();

  const pos = n.map_position || {};
  let html = '<div style="margin-top:16px;padding:16px;background:var(--bg2);border-radius:6px;" id="npcDetail">';
  html += '<h3 style="color:var(--accent2);margin-bottom:8px;">编辑NPC：'+esc(n.name)+'</h3>';
  html += `<div class="hint" style="margin-bottom:8px;">${esc(formatReferenceSummary('npc', n.id, data))}</div>`;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('ID','npc_id',n.id);
  html += fld('名称','npc_name',n.name);
  html += sel('所属地图','npc_map_id',n.map_id||'old_town', (data.maps||[]).map(m => [m.id, m.name||m.id]));
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
  const oldId = n.id;
  n.id = document.getElementById('npc_id').value.trim();
  n.name = document.getElementById('npc_name').value.trim();
  n.map_id = document.getElementById('npc_map_id')?.value || 'old_town';
  n.dialogue_id = document.getElementById('npc_did').value.trim();
  n.map_position = {
    x: parseFloat(document.getElementById('npc_x').value) || 0,
    y: parseFloat(document.getElementById('npc_y').value) || 0
  };

  if (!n.id) { toast('ID 不能为空', true); return; }
  const err = validateNPC(n, data.npcs);
  if (err) { toast(err, true); return; }
  if (!confirmReferenceRewrite('npc', oldId, n.id, data)) {
    n.id = oldId;
    return;
  }

  const migration = rewriteContentReferences('npc', oldId, n.id, data);
  if (await saveDoc('npcs', 'npcs', data.npcs)) {
    if (!(await saveReferenceMigration(migration, data))) {
      toast('已保存NPC，但同步引用失败，请重新拉取检查', true);
      return;
    }
    toast('已保存NPC');
    renderWorld();
  }
}

async function addNPC() {
  const id = prompt('NPC ID（如 npc_drummer）：');
  if (!id) return;
  if ((data.npcs||[]).find(n => n.id === id)) { toast('该ID已存在', true); return; }
  const item = { id, name: '新NPC', map_id: 'old_town', dialogue_id: '', map_position: { x: 0, y: 240 } };
  const newArr = [...(data.npcs||[]), item];
  if (await saveDoc('npcs', 'npcs', newArr)) {
    setData({ ...data, npcs: newArr });
    setSelectedNPCIdx(newArr.length - 1);
    renderWorld();
  }
}

async function deleteNPC(i) {
  const name = (data.npcs||[])[i]?.name || '';
  const id = (data.npcs||[])[i]?.id;
  const blocker = formatDeleteBlocker('npc', id, data);
  if (blocker) { toast(blocker, true); return; }
  if (!confirm('确定删除NPC「'+name+'」？')) return;
  const newArr = [...(data.npcs||[])];
  newArr.splice(i, 1);
  if (await saveDoc('npcs', 'npcs', newArr)) {
    setData({ ...data, npcs: newArr });
    if (selectedNPCIdx >= newArr.length) setSelectedNPCIdx(Math.max(0, newArr.length - 1));
    renderWorld();
  }
}

// ════════════════════════════════════════════
// SECTION 4: MAPS
// ════════════════════════════════════════════

function _rgbInputs(prefix, arr, hasAlpha) {
  const n = hasAlpha ? 4 : 3;
  const labels = ['R','G','B','A'];
  let h = `<div style="display:flex;gap:4px;align-items:center;">`;
  for (let j = 0; j < n; j++) {
    h += `<input type="number" id="${prefix}_${j}" value="${arr[j]??0}" step="0.01" min="0" max="1" style="width:52px;" title="${labels[j]}">`;
  }
  h += '</div>';
  return h;
}

function _readColorArray(prefix, n) {
  const arr = [];
  for (let j = 0; j < n; j++) {
    arr.push(parseFloat(document.getElementById(prefix+'_'+j)?.value) || 0);
  }
  return arr;
}

function renderMaps(ct) {
  const q = (document.getElementById('search-map')?.value || '').toLowerCase();
  let html = '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
  html += '<button class="btn-ok" id="btn-add-map">+ 新增地图</button>';
  html += '<input type="search" id="search-map" placeholder="搜索地图..." style="width:140px;">';
  html += '<button id="btn-import-map">📥 导入</button>';
  html += '<button id="btn-export-map">📤 导出</button>';
  html += '</div>';

  const allMaps = data.maps || [];
  const maps = q ? allMaps.filter(m => (m.id+';'+m.name+';'+(m.scene_path||'')).toLowerCase().includes(q)) : allMaps;
  if (maps.length === 0) {
    html += '<p style="color:var(--text2);text-align:center;padding:40px;">暂无地图，点击「新增地图」</p>';
    ct.innerHTML = html;
  } else {
    html += '<table><thead><tr><th>ID</th><th>名称</th><th>场景路径</th><th>尺寸</th><th></th></tr></thead><tbody>';
    maps.forEach((m) => {
      const i = allMaps.indexOf(m);
      html += `<tr class="${i===selectedMapIdx?'selected':''}" data-map-idx="${i}">
        <td>${esc(m.id)}</td><td>${esc(m.name)}</td><td style="font-size:11px;">${esc(m.scene_path||'')}</td>
        <td>${m.width??960} × ${m.height??270}</td>
        <td><button class="btn-sm btn-danger" data-map-del="${i}">✕</button></td></tr>`;
    });
    html += '</tbody></table>';
    ct.innerHTML = html;

    ct.querySelectorAll('tr[data-map-idx]').forEach(tr => {
      tr.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        setSelectedMapIdx(parseInt(this.dataset.mapIdx));
        renderMaps(ct);
      });
    });
    ct.querySelectorAll('button[data-map-del]').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteMap(parseInt(this.dataset.mapDel));
      });
    });
  }

  document.getElementById('btn-add-map').onclick = addMap;
  document.getElementById('btn-import-map').onclick = () => window._importJSON('maps');
  document.getElementById('btn-export-map').onclick = () => { downloadJSON('maps.json', data.maps); toast('已导出 maps.json'); };
  document.getElementById('search-map').addEventListener('input', () => { setSelectedMapIdx(-1); renderMaps(ct); });

  if (selectedMapIdx >= 0 && selectedMapIdx < allMaps.length) renderMapDetail(ct);
}

function renderMapDetail(ct) {
  const m = data.maps[selectedMapIdx];
  const existing = ct.querySelector('#mapDetail');
  if (existing) existing.remove();

  let html = '<div style="margin-top:16px;padding:16px;background:var(--bg2);border-radius:6px;" id="mapDetail">';
  html += '<h3 style="color:var(--accent2);margin-bottom:8px;">编辑地图：'+esc(m.name)+'</h3>';
  html += `<div class="hint" style="margin-bottom:8px;">${esc(formatReferenceSummary('map', m.id, data))}</div>`;
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += fld('ID','map_id',m.id);
  html += fld('名称','map_name',m.name);
  html += fld('场景路径','map_scene',m.scene_path||'');
  html += fld('宽度','map_w',m.width??960,'number');
  html += fld('高度','map_h',m.height??270,'number');
  html += fld('地面Y','map_gy',m.ground_y??240,'number');
  html += fld('地面高度','map_gh',m.ground_h??30,'number');
  html += '</div>';

  html += '<div class="section-label">颜色</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += `<div><label>天空色</label>${_rgbInputs('map_sky', m.sky_color||[0.12,0.15,0.22], false)}</div>`;
  html += `<div><label>地面色</label>${_rgbInputs('map_gc', m.ground_color||[0.25,0.18,0.12], false)}</div>`;
  html += `<div><label>地面线色</label>${_rgbInputs('map_glc', m.ground_line_color||[0.35,0.28,0.2], false)}</div>`;
  html += `<div><label>建筑色</label>${_rgbInputs('map_bc', m.building_body_color||[0.18,0.18,0.2], false)}</div>`;
  html += `<div><label>窗户色</label>${_rgbInputs('map_wc', m.building_window_color||[1.0,0.9,0.4,0.3], true)}</div>`;
  html += '</div>';

  html += '<div class="section-label">装饰建筑</div>';
  html += `<div id="map_decor_c">`;
  const decor = m.decor_buildings || [];
  decor.forEach((b, i) => {
    html += `<div class="inline-row">
      X<input type="number" id="map_decor_${i}_0" value="${b[0]||0}" style="width:54px;">
      Y<input type="number" id="map_decor_${i}_1" value="${b[1]||0}" style="width:54px;">
      W<input type="number" id="map_decor_${i}_2" value="${b[2]||0}" style="width:54px;">
      H<input type="number" id="map_decor_${i}_3" value="${b[3]||0}" style="width:54px;">
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`;
  });
  html += `</div><button class="btn-sm" id="btn-add-decor">+ 添加装饰建筑</button>`;

  html += '<div class="detail-actions"><button id="btn-cancel-map">取消</button><button class="btn-ok" id="btn-save-map">💾 保存到数据库</button></div>';
  html += '</div>';
  ct.insertAdjacentHTML('beforeend', html);

  document.getElementById('btn-add-decor').onclick = function() {
    const c = document.getElementById('map_decor_c');
    const i = c.children.length;
    const div = document.createElement('div'); div.className = 'inline-row';
    div.innerHTML = `X<input type="number" id="map_decor_${i}_0" value="0" style="width:54px;">
      Y<input type="number" id="map_decor_${i}_1" value="0" style="width:54px;">
      W<input type="number" id="map_decor_${i}_2" value="0" style="width:54px;">
      H<input type="number" id="map_decor_${i}_3" value="0" style="width:54px;">
      <button class="btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button>`;
    c.appendChild(div);
  };

  document.getElementById('btn-save-map').onclick = saveMapDetail;
  document.getElementById('btn-cancel-map').onclick = () => {
    setSelectedMapIdx(-1);
    renderWorld();
  };
}

async function saveMapDetail() {
  const m = data.maps[selectedMapIdx];
  const oldId = m.id;
  m.id = document.getElementById('map_id').value.trim();
  m.name = document.getElementById('map_name').value.trim();
  m.scene_path = document.getElementById('map_scene').value.trim();
  m.width = parseInt(document.getElementById('map_w').value) || 960;
  m.height = parseInt(document.getElementById('map_h').value) || 270;
  m.ground_y = parseInt(document.getElementById('map_gy').value) || 240;
  m.ground_h = parseInt(document.getElementById('map_gh').value) || 30;
  m.sky_color = _readColorArray('map_sky', 3);
  m.ground_color = _readColorArray('map_gc', 3);
  m.ground_line_color = _readColorArray('map_glc', 3);
  m.building_body_color = _readColorArray('map_bc', 3);
  m.building_window_color = _readColorArray('map_wc', 4);

  const decor = [];
  const c = document.getElementById('map_decor_c');
  if (c) {
    c.querySelectorAll('.inline-row').forEach(row => {
      const inputs = row.querySelectorAll('input');
      if (inputs.length >= 4) {
        decor.push([
          parseInt(inputs[0].value) || 0,
          parseInt(inputs[1].value) || 0,
          parseInt(inputs[2].value) || 0,
          parseInt(inputs[3].value) || 0
        ]);
      }
    });
  }
  m.decor_buildings = decor;

  if (!m.id) { toast('ID 不能为空', true); return; }
  const err = validateMap(m, data.maps);
  if (err) { toast(err, true); return; }
  if (!confirmReferenceRewrite('map', oldId, m.id, data)) {
    m.id = oldId;
    return;
  }

  const migration = rewriteContentReferences('map', oldId, m.id, data);
  if (await saveDoc('maps', 'maps', data.maps)) {
    if (!(await saveReferenceMigration(migration, data))) {
      toast('已保存地图，但同步引用失败，请重新拉取检查', true);
      return;
    }
    toast('已保存地图');
    renderWorld();
  }
}

async function addMap() {
  const id = prompt('地图ID（英文下划线，如 new_town）：');
  if (!id) return;
  if ((data.maps||[]).find(m => m.id === id)) { toast('该ID已存在', true); return; }
  const item = {
    id, name: '新地图', scene_path: '', width: 960, height: 270,
    ground_y: 240, ground_h: 30,
    sky_color: [0.12, 0.15, 0.22],
    ground_color: [0.25, 0.18, 0.12],
    ground_line_color: [0.35, 0.28, 0.2],
    building_body_color: [0.18, 0.18, 0.2],
    building_window_color: [1.0, 0.9, 0.4, 0.3],
    decor_buildings: []
  };
  const newArr = [...(data.maps||[]), item];
  if (await saveDoc('maps', 'maps', newArr)) {
    setData({ ...data, maps: newArr });
    setSelectedMapIdx(newArr.length - 1);
    renderWorld();
  }
}

async function deleteMap(i) {
  const name = (data.maps||[])[i]?.name || '';
  const id = (data.maps||[])[i]?.id;
  const blocker = formatDeleteBlocker('map', id, data);
  if (blocker) { toast(blocker, true); return; }
  if (!confirm('确定删除地图「'+name+'」？')) return;
  const newArr = [...(data.maps||[])];
  newArr.splice(i, 1);
  if (await saveDoc('maps', 'maps', newArr)) {
    setData({ ...data, maps: newArr });
    if (selectedMapIdx >= newArr.length) setSelectedMapIdx(Math.max(0, newArr.length - 1));
    renderWorld();
  }
}
