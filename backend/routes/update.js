'use strict';
const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

const CURRENT_VERSION = process.env.CLIENT_VERSION || '7.1.2';

// ── GET /api/update/check ─────────────────────────────────────────────────────
// Fetches version manifest from central server and compares to current version
router.get('/check', authenticate, async (req, res) => {
  const centralUrl = process.env.CENTRAL_SERVER_URL || 'http://localhost:3000';

  try {
    const manifest = await fetchJson(`${centralUrl}/api/version`);

    const current = versionTuple(CURRENT_VERSION);
    const latest  = versionTuple(manifest.version);
    const up_to_date = compareVersions(current, latest) >= 0;

    res.json({
      current_version: CURRENT_VERSION,
      version:         manifest.version,
      released_at:     manifest.released_at,
      mandatory:       manifest.mandatory,
      changelog:       manifest.changelog,
      up_to_date,
    });
  } catch (err) {
    res.status(502).json({ error: 'Cannot reach central server: ' + err.message });
  }
});

// ── POST /api/update/apply ────────────────────────────────────────────────────
// Triggers git pull + npm install + PM2 reload on Linux production servers
router.post('/apply', authenticate, authorize('super_admin', 'it_admin'), (req, res) => {
  if (process.platform !== 'linux') {
    return res.json({
      success: false,
      message: 'Auto-update only runs on Linux. On Windows dev, run: git pull && npm install && restart server.',
    });
  }

  const appDir = process.env.APP_DIR || '/opt/optima-property';
  const script = path.join(appDir, 'deploy/property/update.sh');

  // Respond immediately — server will restart after update
  res.json({ success: true, message: 'Update started. Server will restart automatically in ~30 seconds.' });

  // Fire and forget
  setTimeout(() => {
    exec(`bash "${script}"`, { cwd: appDir }, (err, stdout, stderr) => {
      if (err) console.error('[update] Error:', stderr);
      else console.log('[update] Done:', stdout);
    });
  }, 300);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (r) => {
      if (r.statusCode !== 200) return reject(new Error(`HTTP ${r.statusCode}`));
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function versionTuple(v = '0.0.0') {
  return String(v).split('.').map(n => parseInt(n, 10) || 0);
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

module.exports = router;
