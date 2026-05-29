const fs = require('fs');
const path = require('path');
const { formatDiff } = require('./sync_diff.js');

function pad(value) {
  return String(value).padStart(2, '0');
}

function buildDateParts(date) {
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  };
}

function buildSyncOperationRecordName({ mode, createdAt = new Date() }) {
  const parts = buildDateParts(createdAt);
  const safeMode = String(mode || 'sync').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  return `${parts.day}-online-sync-${safeMode}-${parts.time}.md`;
}

function formatSyncOperationRecord({
  mode,
  createdAt = new Date(),
  fetchedCount = 0,
  healthGate = {},
  projectDiff = {},
  backupPath = '',
  writtenFiles = [],
} = {}) {
  const lines = [
    `# ${buildDateParts(createdAt).day} online sync ${mode}`,
    '',
    '## Summary',
    '',
    `- mode：\`${mode}\``,
    `- created at：\`${createdAt.toISOString()}\``,
    `- fetched documents：\`${fetchedCount}\``,
    `- health：\`${healthGate.errorCount || 0} errors / ${healthGate.warningCount || 0} warnings / ${healthGate.status || 'unknown'}\``,
    `- backup：\`${backupPath || 'none'}\``,
    `- written files：\`${writtenFiles.length}\``,
    '',
    '## Diff',
    '',
    `- actions：\`${formatDiff(projectDiff.actions || { total: 0 })}\``,
    `- events：\`${formatDiff(projectDiff.events || { total: 0 })}\``,
    `- maps：\`${formatDiff(projectDiff.maps || { total: 0 })}\``,
    `- dialogues：\`${formatDiff(projectDiff.dialogues || { total: 0 })}\``,
    `- phone_chats：\`${formatDiff(projectDiff.phone_chats || { total: 0 })}\``,
    `- locations：\`${formatDiff(projectDiff.locations || { total: 0 })}\``,
    `- npcs：\`${formatDiff(projectDiff.npcs || { total: 0 })}\``,
    `- game_config：\`${projectDiff.game_config || 'unknown'}\``,
    '',
    '## Written Files',
    '',
  ];

  if (writtenFiles.length) {
    for (const file of writtenFiles) lines.push(`- \`${file}\``);
  } else {
    lines.push('- none');
  }

  lines.push(
    '',
    '## Safety',
    '',
    '- This record does not include editor passwords, Supabase secret keys, or JWTs.',
    '- Dry-run mode does not write local JSON files.',
    ''
  );

  return lines.join('\n');
}

function writeSyncOperationRecord({ operationDir, ...record }) {
  fs.mkdirSync(operationDir, { recursive: true });
  const filename = buildSyncOperationRecordName(record);
  const filepath = path.join(operationDir, filename);
  fs.writeFileSync(filepath, formatSyncOperationRecord(record), 'utf8');
  return { filepath, filename };
}

module.exports = {
  buildSyncOperationRecordName,
  formatSyncOperationRecord,
  writeSyncOperationRecord,
};
