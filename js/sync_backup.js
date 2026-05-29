const fs = require('fs');
const path = require('path');

function pad(value) {
  return String(value).padStart(2, '0');
}

function buildStamp(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function buildSyncBackupName(date = new Date()) {
  return `band-online-sync-before-write-${buildStamp(date)}.json`;
}

function buildSyncBackupPayload({ createdAt = new Date(), files = [] } = {}) {
  return {
    backup_type: 'band-online-sync-before-write',
    created_at: createdAt.toISOString(),
    source: 'local assets/json before online sync',
    asset_file_count: files.length,
    files,
  };
}

function writeSyncBackup({ backupDir, files, createdAt = new Date() }) {
  fs.mkdirSync(backupDir, { recursive: true });
  const filename = buildSyncBackupName(createdAt);
  const filepath = path.join(backupDir, filename);
  const payload = buildSyncBackupPayload({ createdAt, files });
  fs.writeFileSync(filepath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return {
    filepath,
    filename,
    assetFileCount: payload.asset_file_count,
  };
}

module.exports = {
  buildSyncBackupName,
  buildSyncBackupPayload,
  writeSyncBackup,
};
