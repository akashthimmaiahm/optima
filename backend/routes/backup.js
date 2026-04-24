const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../database/init');

// ── Encryption config ─────────────────────────────────────────────────────────
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;  // 256 bits
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const PBKDF2_ITERATIONS = 100000;

// Derive a 256-bit key from a passphrase using PBKDF2
function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

function encrypt(buffer, passphrase) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(passphrase, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: OPTIMA_BACKUP_V1 | salt(32) | iv(16) | tag(16) | encrypted_data
  const header = Buffer.from('OPTIMA_BACKUP_V1');
  return Buffer.concat([header, salt, iv, tag, encrypted]);
}

function decrypt(buffer, passphrase) {
  const header = buffer.slice(0, 16).toString();
  if (header !== 'OPTIMA_BACKUP_V1') throw new Error('Invalid backup file format');
  const salt = buffer.slice(16, 16 + SALT_LENGTH);
  const iv = buffer.slice(16 + SALT_LENGTH, 16 + SALT_LENGTH + IV_LENGTH);
  const tag = buffer.slice(16 + SALT_LENGTH + IV_LENGTH, 16 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.slice(16 + SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// ── Backup directory ──────────────────────────────────────────────────────────
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ── Settings persistence (stored in DB) ───────────────────────────────────────
function ensureSettingsTable() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS backup_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    auto_enabled INTEGER DEFAULT 0,
    interval_hours INTEGER DEFAULT 24,
    retention_days INTEGER DEFAULT 30,
    passphrase TEXT NOT NULL DEFAULT 'optima-default-key',
    last_backup_at TEXT,
    last_backup_file TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  const row = db.prepare('SELECT id FROM backup_settings WHERE id=1').get();
  if (!row) {
    db.prepare("INSERT INTO backup_settings (id, passphrase) VALUES (1, ?)").run('optima-default-key');
  }
}

function getSettings() {
  ensureSettingsTable();
  return getDb().prepare('SELECT * FROM backup_settings WHERE id=1').get();
}

// ── Create a backup ───────────────────────────────────────────────────────────
function createBackup(passphrase) {
  const db = getDb();
  const dbPath = db.name; // better-sqlite3 exposes the file path

  // Use SQLite backup API via serialize (safe, consistent snapshot)
  const rawData = db.serialize();

  // Encrypt
  const encrypted = encrypt(rawData, passphrase);

  // Write to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const filename = `optima-backup-${timestamp}.enc`;
  const filePath = path.join(BACKUP_DIR, filename);
  fs.writeFileSync(filePath, encrypted);

  // Update settings
  ensureSettingsTable();
  db.prepare("UPDATE backup_settings SET last_backup_at=datetime('now'), last_backup_file=? WHERE id=1").run(filename);

  // Clean old backups based on retention
  cleanOldBackups();

  return { filename, size: encrypted.length, path: filePath };
}

function cleanOldBackups() {
  const settings = getSettings();
  const retentionMs = (settings.retention_days || 30) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;

  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.enc'));
    for (const file of files) {
      const stat = fs.statSync(path.join(BACKUP_DIR, file));
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
      }
    }
  } catch { /* ignore cleanup errors */ }
}

// ── Auto-backup scheduler ─────────────────────────────────────────────────────
let autoBackupTimer = null;

function startAutoBackup() {
  stopAutoBackup();
  const settings = getSettings();
  if (!settings.auto_enabled) return;

  const intervalMs = (settings.interval_hours || 24) * 60 * 60 * 1000;
  console.log(`🔄 Auto-backup enabled: every ${settings.interval_hours}h, retention ${settings.retention_days}d`);

  autoBackupTimer = setInterval(() => {
    try {
      const s = getSettings();
      const result = createBackup(s.passphrase);
      console.log(`✅ Auto-backup created: ${result.filename} (${(result.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (err) {
      console.error('❌ Auto-backup failed:', err.message);
    }
  }, intervalMs);
}

function stopAutoBackup() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
}

// Start auto-backup on module load
try { startAutoBackup(); } catch { /* DB may not be ready yet */ }

// ── API Routes ────────────────────────────────────────────────────────────────

// GET /api/backup/settings — get backup configuration
router.get('/settings', (_req, res) => {
  try {
    const settings = getSettings();
    // List existing backups
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.enc'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { name: f, size: stat.size, created: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({
      auto_enabled: !!settings.auto_enabled,
      interval_hours: settings.interval_hours,
      retention_days: settings.retention_days,
      last_backup_at: settings.last_backup_at,
      last_backup_file: settings.last_backup_file,
      backups: files,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/backup/settings — update backup configuration
router.put('/settings', (req, res) => {
  try {
    const { auto_enabled, interval_hours, retention_days, passphrase } = req.body;
    ensureSettingsTable();
    const db = getDb();

    if (passphrase !== undefined && passphrase.length < 8) {
      return res.status(400).json({ error: 'Passphrase must be at least 8 characters' });
    }

    const updates = [];
    const params = [];
    if (auto_enabled !== undefined) { updates.push('auto_enabled=?'); params.push(auto_enabled ? 1 : 0); }
    if (interval_hours !== undefined) { updates.push('interval_hours=?'); params.push(Math.max(1, interval_hours)); }
    if (retention_days !== undefined) { updates.push('retention_days=?'); params.push(Math.max(1, retention_days)); }
    if (passphrase !== undefined) { updates.push('passphrase=?'); params.push(passphrase); }
    updates.push("updated_at=datetime('now')");

    if (updates.length > 1) {
      db.prepare(`UPDATE backup_settings SET ${updates.join(', ')} WHERE id=1`).run(...params);
    }

    // Restart auto-backup with new settings
    startAutoBackup();

    res.json({ message: 'Backup settings updated', ...getSettings() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/create — create a manual backup now
router.post('/create', (req, res) => {
  try {
    const settings = getSettings();
    const passphrase = req.body.passphrase || settings.passphrase;
    if (!passphrase || passphrase.length < 8) {
      return res.status(400).json({ error: 'Passphrase must be at least 8 characters' });
    }
    const result = createBackup(passphrase);
    res.json({
      message: 'Backup created successfully',
      filename: result.filename,
      size: result.size,
      size_mb: (result.size / 1024 / 1024).toFixed(2),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/download/:filename — download an encrypted backup file
router.get('/download/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // prevent path traversal
    const filePath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Backup file not found' });
    res.download(filePath, filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/restore — restore from an encrypted backup
router.post('/restore', express.raw({ type: 'application/octet-stream', limit: '500mb' }), (req, res) => {
  try {
    const passphrase = req.headers['x-backup-passphrase'];
    if (!passphrase) return res.status(400).json({ error: 'X-Backup-Passphrase header required' });

    const encryptedData = req.body;
    if (!encryptedData || encryptedData.length === 0) {
      return res.status(400).json({ error: 'No backup data received' });
    }

    // Decrypt
    let decrypted;
    try {
      decrypted = decrypt(encryptedData, passphrase);
    } catch (err) {
      return res.status(400).json({ error: 'Decryption failed — wrong passphrase or corrupted file' });
    }

    // Validate it's a valid SQLite database (magic bytes)
    const sqliteMagic = decrypted.slice(0, 16).toString();
    if (!sqliteMagic.startsWith('SQLite format 3')) {
      return res.status(400).json({ error: 'Decrypted data is not a valid SQLite database' });
    }

    // Close current DB, write new one, reopen
    const db = getDb();
    const dbPath = db.name;

    // Create a safety backup before overwriting
    const safetyPath = dbPath + '.pre-restore.' + Date.now();
    const currentData = db.serialize();
    fs.writeFileSync(safetyPath, currentData);

    // Close WAL and release locks
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    // Write restored database
    fs.writeFileSync(dbPath, decrypted);

    // Remove WAL/SHM files (they belong to the old DB)
    try { fs.unlinkSync(dbPath + '-wal'); } catch { }
    try { fs.unlinkSync(dbPath + '-shm'); } catch { }

    res.json({
      message: 'Database restored successfully. Server will restart in 3 seconds.',
      safety_backup: path.basename(safetyPath),
    });

    // Restart the process so the new DB is loaded fresh
    setTimeout(() => process.exit(0), 3000); // PM2 will auto-restart
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/backup/:filename — delete a backup file
router.delete('/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    fs.unlinkSync(filePath);
    res.json({ message: 'Backup deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.startAutoBackup = startAutoBackup;
