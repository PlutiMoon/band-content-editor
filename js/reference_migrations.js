import { saveDoc } from './core.js';
import { findDeleteReferences } from './delete_guards.js';

const DOC_SAVERS = {
  actions: project => saveDoc('actions', 'actions', project.actions || []),
  events: project => saveDoc('events', 'events', project.events || []),
  locations: project => saveDoc('locations', 'locations', project.locations || []),
  maps: project => saveDoc('maps', 'maps', project.maps || []),
  npcs: project => saveDoc('npcs', 'npcs', project.npcs || []),
  phone_chats: project => saveDoc('phone_chats', 'phone_chats', project.phone_chats || []),
  game_config: project => saveDoc('game_config', 'game_config', project.game_config || {}),
};

export function confirmReferenceRewrite(kind, oldId, newId, project) {
  if (!oldId || !newId || oldId === newId) return true;
  const refs = findDeleteReferences(kind, oldId, project);
  if (!refs.length) return true;

  const shown = refs.slice(0, 5).map(ref => `- ${ref}`).join('\n');
  const suffix = refs.length > 5 ? `\n- 等 ${refs.length} 处` : '';
  return confirm(`ID 将从 ${oldId} 改为 ${newId}。\n会同步更新 ${refs.length} 处引用：\n${shown}${suffix}\n\n继续保存？`);
}

export async function saveReferenceMigration(migration, project) {
  if (!migration || !migration.changed) return true;

  for (const doc of migration.docs || []) {
    const save = DOC_SAVERS[doc];
    if (save && !(await save(project))) return false;
  }

  for (const dialogueId of migration.dialogues || []) {
    const dialogue = project.dialogues?.[dialogueId];
    if (dialogue && !(await saveDoc('dialogues/' + dialogueId, 'dialogues', dialogue))) return false;
  }

  return true;
}
