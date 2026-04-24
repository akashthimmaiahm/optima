const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');

// GET /api/mdm/devices
router.get('/devices', authenticate, (req, res) => {
  const db = getDb();
  const devices = db.prepare('SELECT * FROM mdm_devices ORDER BY created_at DESC').all();
  res.json(devices.map(d => ({
    ...d,
    encrypted: !!d.encrypted,
    passcode: !!d.passcode,
  })));
});

// POST /api/mdm/devices
router.post('/devices', authenticate, (req, res) => {
  const db = getDb();
  const { name, platform, os, user, department, serial, status, encrypted, passcode } = req.body;
  if (!name || !platform) return res.status(400).json({ error: 'name and platform are required' });

  const stmt = db.prepare(`
    INSERT INTO mdm_devices (name, platform, os, assigned_user, department, serial, status, encrypted, passcode, last_sync)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Just enrolled')
  `);
  const result = stmt.run(name, platform, os || '', user || '', department || '', serial || '', status || 'pending', encrypted ? 1 : 0, passcode ? 1 : 0);
  const device = db.prepare('SELECT * FROM mdm_devices WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...device, encrypted: !!device.encrypted, passcode: !!device.passcode });
});

// PUT /api/mdm/devices/:id
router.put('/devices/:id', authenticate, (req, res) => {
  const db = getDb();
  const { name, platform, os, user, department, serial, status, encrypted, passcode } = req.body;
  const existing = db.prepare('SELECT id FROM mdm_devices WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Device not found' });

  db.prepare(`
    UPDATE mdm_devices SET name=?, platform=?, os=?, assigned_user=?, department=?, serial=?, status=?, encrypted=?, passcode=?, updated_at=datetime('now')
    WHERE id=?
  `).run(name, platform, os || '', user || '', department || '', serial || '', status || 'pending', encrypted ? 1 : 0, passcode ? 1 : 0, req.params.id);

  const device = db.prepare('SELECT * FROM mdm_devices WHERE id = ?').get(req.params.id);
  res.json({ ...device, encrypted: !!device.encrypted, passcode: !!device.passcode });
});

// DELETE /api/mdm/devices/:id
router.delete('/devices/:id', authenticate, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM mdm_devices WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Device not found' });
  db.prepare('DELETE FROM mdm_devices WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/mdm/devices/sync — mark all as last_sync = now
router.post('/devices/sync', authenticate, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE mdm_devices SET last_sync = 'Just now', updated_at = datetime('now')").run();
  res.json({ success: true });
});

// GET /api/mdm/stats — platform breakdown
router.get('/stats', authenticate, (req, res) => {
  const db = getDb();
  const platforms = db.prepare(`
    SELECT platform,
      COUNT(*) as enrolled,
      SUM(CASE WHEN status='compliant' THEN 1 ELSE 0 END) as compliant
    FROM mdm_devices GROUP BY platform
  `).all();
  res.json(platforms);
});

module.exports = router;
