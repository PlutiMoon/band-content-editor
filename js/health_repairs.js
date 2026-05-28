function repair(issue, action, target, description) {
  return {
    code: issue.code,
    area: issue.area,
    message: issue.message,
    action,
    target,
    description,
  };
}

function findById(items, id) {
  return (items || []).find(item => item && item.id === id);
}

function getDialogueNodes(project, dialogueId) {
  const dialogue = project.dialogues?.[dialogueId];
  if (!dialogue) return null;
  if (!Array.isArray(dialogue.nodes)) dialogue.nodes = [];
  return dialogue.nodes;
}

export function buildHealthRepairPlan(project, issues) {
  const repairable = [];
  const manual = [];

  for (const item of issues || []) {
    if (item.code === 'action_invalid_time_cost') {
      repairable.push(repair(item, 'set_action_time_cost', { actionId: item.actionId, value: 1 }, 'time_cost 设为 1'));
    } else if (item.code === 'action_invalid_max_per_day') {
      repairable.push(repair(item, 'set_action_max_per_day', { actionId: item.actionId, value: 1 }, 'max_per_day 设为 1'));
    } else if (item.code === 'map_invalid_width') {
      repairable.push(repair(item, 'set_map_width', { mapId: item.mapId, value: 960 }, '地图宽度设为 960'));
    } else if (item.code === 'map_invalid_height') {
      repairable.push(repair(item, 'set_map_height', { mapId: item.mapId, value: 270 }, '地图高度设为 270'));
    } else if (item.code === 'dialogue_missing_start') {
      repairable.push(repair(item, 'add_dialogue_start', { dialogueId: item.dialogueId }, '补 start 节点'));
    } else if (item.code === 'dialogue_missing_end') {
      repairable.push(repair(item, 'add_dialogue_end', { dialogueId: item.dialogueId }, '补 end 节点'));
    } else {
      manual.push(item);
    }
  }

  return { repairable, manual };
}

export function applyHealthRepairPlan(project, plan) {
  const docs = new Set();
  const dialogues = new Set();

  for (const item of plan?.repairable || []) {
    if (item.action === 'set_action_time_cost') {
      const action = findById(project.actions, item.target.actionId);
      if (action && action.time_cost !== item.target.value) {
        action.time_cost = item.target.value;
        docs.add('actions');
      }
    } else if (item.action === 'set_action_max_per_day') {
      const action = findById(project.actions, item.target.actionId);
      if (action && action.max_per_day !== item.target.value) {
        action.max_per_day = item.target.value;
        docs.add('actions');
      }
    } else if (item.action === 'set_map_width') {
      const map = findById(project.maps, item.target.mapId);
      if (map && map.width !== item.target.value) {
        map.width = item.target.value;
        docs.add('maps');
      }
    } else if (item.action === 'set_map_height') {
      const map = findById(project.maps, item.target.mapId);
      if (map && map.height !== item.target.value) {
        map.height = item.target.value;
        docs.add('maps');
      }
    } else if (item.action === 'add_dialogue_start') {
      const nodes = getDialogueNodes(project, item.target.dialogueId);
      if (nodes && !nodes.some(node => node && node.id === 'start')) {
        nodes.unshift({ id: 'start', speaker: '', text: '', next: 'end' });
        dialogues.add(item.target.dialogueId);
      }
    } else if (item.action === 'add_dialogue_end') {
      const nodes = getDialogueNodes(project, item.target.dialogueId);
      if (nodes && !nodes.some(node => node && node.id === 'end')) {
        nodes.push({ id: 'end', speaker: '', text: '' });
        dialogues.add(item.target.dialogueId);
      }
    }
  }

  return {
    changed: docs.size > 0 || dialogues.size > 0,
    docs: [...docs],
    dialogues: [...dialogues],
  };
}
