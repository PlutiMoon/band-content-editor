function parseRowData(row) {
  return typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
}

function createEmptyProject() {
  return {
    actions: [],
    events: [],
    dialogues: {},
    phone_chats: [],
    maps: [],
    locations: [],
    npcs: [],
    game_config: {},
  };
}

function rowsToProject(rows) {
  const project = createEmptyProject();
  for (const row of rows || []) {
    if (!row || !row.type) continue;
    const data = parseRowData(row);
    if (row.type === 'dialogues') {
      project.dialogues[String(row.id || '').replace('dialogues/', '')] = data;
    } else if (row.type === 'phone_chats') {
      project.phone_chats = data;
    } else if (Object.prototype.hasOwnProperty.call(project, row.type)) {
      project[row.type] = data;
    }
  }
  return project;
}

function projectToAssetFiles(project) {
  const data = project || createEmptyProject();
  const files = [
    { filename: 'actions.json', data: data.actions || [] },
    { filename: 'events.json', data: data.events || [] },
    { filename: 'phone_chat.json', data: data.phone_chats || [] },
    { filename: 'maps.json', data: data.maps || [] },
    { filename: 'locations.json', data: data.locations || [] },
    { filename: 'npcs.json', data: data.npcs || [] },
    { filename: 'game_config.json', data: data.game_config || {} },
  ];

  for (const [id, dialogue] of Object.entries(data.dialogues || {})) {
    files.push({ filename: `dialogues/${id}.json`, data: dialogue });
  }
  return files;
}

module.exports = {
  createEmptyProject,
  parseRowData,
  rowsToProject,
  projectToAssetFiles,
};
