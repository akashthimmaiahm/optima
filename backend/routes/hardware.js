const express = require('express');
const router = express.Router();
const http = require('http');
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// ── Idempotent EOL migration ───────────────────────────────────────────────
;(function() {
  const db = getDb()
  try { db.exec("ALTER TABLE hardware_assets ADD COLUMN is_eol INTEGER DEFAULT 0") } catch(e){}
  try { db.exec("ALTER TABLE hardware_assets ADD COLUMN eol_date TEXT") } catch(e){}
  try { db.exec("ALTER TABLE hardware_assets ADD COLUMN eol_replacement TEXT") } catch(e){}
  try { db.exec("ALTER TABLE hardware_assets ADD COLUMN eol_notes TEXT") } catch(e){}
})()

// ── GET /api/hardware ─────────────────────────────────────────────────────
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { search, type, status, warranty } = req.query;
  const today = new Date().toISOString().split('T')[0];

  let query = 'SELECT * FROM hardware_assets WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (name LIKE ? OR asset_tag LIKE ? OR serial_number LIKE ? OR assigned_to LIKE ? OR manufacturer LIKE ? OR model LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (type)   { query += ' AND type = ?';   params.push(type); }
  if (status) { query += ' AND status = ?'; params.push(status); }

  // Warranty filters
  if (warranty === 'in')  { query += ' AND warranty_expiry IS NOT NULL AND warranty_expiry > ?';  params.push(today); }
  if (warranty === 'out') { query += ' AND warranty_expiry IS NOT NULL AND warranty_expiry <= ?'; params.push(today); }
  if (warranty === 'eol') { query += ' AND is_eol = 1'; }

  query += ' ORDER BY created_at DESC';
  const hardware = db.prepare(query).all(...params);
  res.json({ data: hardware, total: hardware.length });
});

router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const asset = db.prepare('SELECT * FROM hardware_assets WHERE id = ?').get(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const maintenance = db.prepare('SELECT * FROM maintenance_records WHERE hardware_id = ? ORDER BY date DESC').all(req.params.id);
  // Loan history
  const loans = db.prepare('SELECT * FROM asset_loans WHERE asset_type=? AND asset_id=? ORDER BY checkout_date DESC').all('hardware', req.params.id);
  const active_loan = loans.find(l => l.status === 'checked_out') || null;
  // Relationships
  const relationships = db.prepare(
    'SELECT * FROM asset_relationships WHERE (source_type=? AND source_id=?) OR (target_type=? AND target_id=?) ORDER BY created_at DESC'
  ).all('hardware', req.params.id, 'hardware', req.params.id);
  // Type-specific fields
  const type_fields = db.prepare('SELECT * FROM asset_type_fields WHERE asset_type=? ORDER BY sort_order').all(asset.type);
  // Parse custom_fields JSON
  let custom_fields = {};
  try { custom_fields = asset.custom_fields ? JSON.parse(asset.custom_fields) : {}; } catch { }
  res.json({ ...asset, custom_fields, maintenance, loans, active_loan, relationships, type_fields });
});

router.post('/', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  const { asset_tag, name, type, manufacturer, model, serial_number, status, condition, location, assigned_to, department, purchase_date, purchase_cost, warranty_expiry, ip_address, mac_address, os, processor, ram, storage, notes, is_eol, eol_date, eol_replacement, eol_notes, custom_fields } = req.body;
  if (!name || !asset_tag || !type) return res.status(400).json({ error: 'Name, asset_tag, and type are required' });
  const customJson = custom_fields ? JSON.stringify(custom_fields) : null;
  const result = db.prepare(`
    INSERT INTO hardware_assets
      (asset_tag, name, type, manufacturer, model, serial_number, status, condition, location, assigned_to, department, purchase_date, purchase_cost, warranty_expiry, ip_address, mac_address, os, processor, ram, storage, notes, is_eol, eol_date, eol_replacement, eol_notes, custom_fields)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(asset_tag, name, type, manufacturer, model, serial_number, status||'active', condition||'good', location, assigned_to, department, purchase_date, purchase_cost||0, warranty_expiry, ip_address, mac_address, os, processor, ram, storage, notes, is_eol||0, eol_date||null, eol_replacement||null, eol_notes||null, customJson);
  db.prepare(`INSERT INTO audit_logs (user_id, user_name, action, resource_type, resource_id, details) VALUES (?, ?, 'create', 'hardware', ?, ?)`).run(req.user.id, req.user.name, result.lastInsertRowid, `Created hardware asset: ${name}`);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Hardware asset added successfully' });
});

router.put('/:id', authenticate, authorize('super_admin', 'it_admin', 'it_manager', 'asset_manager'), (req, res) => {
  const db = getDb();
  const { name, type, manufacturer, model, serial_number, status, condition, location, assigned_to, department, purchase_date, purchase_cost, warranty_expiry, ip_address, mac_address, os, processor, ram, storage, notes, is_eol, eol_date, eol_replacement, eol_notes, custom_fields } = req.body;
  const customJson = custom_fields ? JSON.stringify(custom_fields) : null;
  db.prepare(`
    UPDATE hardware_assets SET
      name=?, type=?, manufacturer=?, model=?, serial_number=?, status=?, condition=?, location=?, assigned_to=?, department=?,
      purchase_date=?, purchase_cost=?, warranty_expiry=?, ip_address=?, mac_address=?, os=?, processor=?, ram=?, storage=?, notes=?,
      is_eol=?, eol_date=?, eol_replacement=?, eol_notes=?, custom_fields=?, updated_at=datetime('now')
    WHERE id=?
  `).run(name, type, manufacturer, model, serial_number, status, condition, location, assigned_to, department, purchase_date, purchase_cost, warranty_expiry, ip_address, mac_address, os, processor, ram, storage, notes, is_eol||0, eol_date||null, eol_replacement||null, eol_notes||null, customJson, req.params.id);
  res.json({ message: 'Hardware asset updated successfully' });
});

router.delete('/:id', authenticate, authorize('super_admin', 'it_admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM hardware_assets WHERE id = ?').run(req.params.id);
  res.json({ message: 'Hardware asset deleted successfully' });
});

router.post('/:id/maintenance', authenticate, authorize('super_admin', 'it_admin', 'it_manager'), (req, res) => {
  const db = getDb();
  const { type, description, performed_by, cost, date, next_date, status } = req.body;
  const result = db.prepare(`INSERT INTO maintenance_records (hardware_id, type, description, performed_by, cost, date, next_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(req.params.id, type, description, performed_by, cost||0, date, next_date, status||'completed');
  if (next_date) db.prepare(`UPDATE hardware_assets SET next_maintenance=?, last_maintenance=?, updated_at=datetime('now') WHERE id=?`).run(next_date, date, req.params.id);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Maintenance record added' });
});

// ── POST /api/hardware/eol-check — AI-powered EOL lookup ─────────────────
function llmRequest(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...opts, method: 'POST' }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, body: JSON.parse(d) }); }
        catch { resolve({ ok: false, body: {} }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('LLM timeout')));
    req.write(body);
    req.end();
  });
}

router.post('/eol-check', authenticate, async (req, res) => {
  const { manufacturer, model, name } = req.body;
  const product = [manufacturer, model, name].filter(Boolean).join(' ').trim();
  if (!product) return res.status(400).json({ error: 'Provide manufacturer, model, or name' });

  const systemPrompt = `You are a hardware lifecycle analyst with knowledge of IT product end-of-life dates.
Return ONLY valid JSON. No markdown, no explanation.`;

  const userPrompt = `Check end-of-life status for: "${product}"

Return exactly this JSON structure:
{
  "is_eol": true or false,
  "eol_date": "YYYY-MM-DD or null",
  "support_end_date": "YYYY-MM-DD or null",
  "replacement": "recommended replacement product name or null",
  "vendor_url": "official EOL/support page URL or null",
  "notes": "one sentence explanation",
  "confidence": "high, medium, or low"
}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // Try Ollama then LM Studio
  const providers = [
    {
      opts: { host: 'localhost', port: 11434, path: '/api/chat', headers: { 'Content-Type': 'application/json', 'Content-Length': 0 } },
      body: () => {
        const b = JSON.stringify({ model: 'llama3.2', messages, stream: false, options: { temperature: 0.1, num_predict: 300 } });
        return b;
      },
      extract: d => d.message?.content || '',
    },
    {
      opts: { host: 'localhost', port: 1234, path: '/v1/chat/completions', headers: { 'Content-Type': 'application/json', 'Content-Length': 0 } },
      body: () => JSON.stringify({ model: 'local-model', messages, temperature: 0.1, max_tokens: 300, stream: false }),
      extract: d => d.choices?.[0]?.message?.content || '',
    },
  ];

  for (const p of providers) {
    try {
      const bodyStr = p.body();
      p.opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      const result = await llmRequest(p.opts, bodyStr);
      if (!result.ok) continue;

      const text = p.extract(result.body).trim();
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);
      return res.json({ product, ...parsed });
    } catch { /* try next */ }
  }

  // Fallback: rule-based heuristics based on purchase/model age patterns
  return res.json({
    product,
    is_eol: null,
    eol_date: null,
    support_end_date: null,
    replacement: null,
    vendor_url: null,
    notes: 'Could not reach AI service. Check manually on the vendor EOL page.',
    confidence: 'none',
  });
});

module.exports = router;
