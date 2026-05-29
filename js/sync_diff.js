function diffArray(oldData, newData, idKey) {
  const oldMap = new Map((oldData || []).map(item => [item[idKey] || item.id, item]));
  const newMap = new Map((newData || []).map(item => [item[idKey] || item.id, item]));
  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const [key] of newMap) {
    if (!oldMap.has(key)) added++;
    else if (JSON.stringify(oldMap.get(key)) !== JSON.stringify(newMap.get(key))) changed++;
  }
  for (const [key] of oldMap) {
    if (!newMap.has(key)) removed++;
  }
  return { added, removed, changed, total: newMap.size };
}

function diffDialogueDict(oldData, newData) {
  const oldKeys = Object.keys(oldData || {});
  const newKeys = Object.keys(newData || {});
  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const key of newKeys) {
    if (!oldKeys.includes(key)) added++;
    else if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) changed++;
  }
  for (const key of oldKeys) {
    if (!newKeys.includes(key)) removed++;
  }
  return { added, removed, changed, total: newKeys.length };
}

function formatDiff(diff) {
  const parts = [];
  if (diff.added) parts.push(`+${diff.added}`);
  if (diff.removed) parts.push(`-${diff.removed}`);
  if (diff.changed) parts.push(`~${diff.changed}`);
  return parts.length ? `${diff.total}(${parts.join('/')})` : `${diff.total}(+0)`;
}

function buildProjectDiff(oldProject, newProject) {
  return {
    actions: diffArray(oldProject && oldProject.actions, newProject && newProject.actions, 'id'),
    events: diffArray(oldProject && oldProject.events, newProject && newProject.events, 'id'),
    phone_chats: diffArray(oldProject && oldProject.phone_chats, newProject && newProject.phone_chats, 'chat_id'),
    maps: diffArray(oldProject && oldProject.maps, newProject && newProject.maps, 'id'),
    locations: diffArray(oldProject && oldProject.locations, newProject && newProject.locations, 'id'),
    npcs: diffArray(oldProject && oldProject.npcs, newProject && newProject.npcs, 'id'),
    dialogues: diffDialogueDict(oldProject && oldProject.dialogues, newProject && newProject.dialogues),
    game_config: JSON.stringify((oldProject && oldProject.game_config) || {}) === JSON.stringify((newProject && newProject.game_config) || {})
      ? 'unchanged'
      : 'changed',
  };
}

module.exports = {
  diffArray,
  diffDialogueDict,
  formatDiff,
  buildProjectDiff,
};
