const express = require('express');
const router = express.Router();
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');

// Ensure table exists + seed sample data
function ensureTable(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS procurement_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pr_number TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      request_type TEXT NOT NULL DEFAULT 'Other',
      category TEXT,
      description TEXT,
      requester_id INTEGER,
      requester_name TEXT,
      department TEXT,
      vendor_id INTEGER,
      vendor_name TEXT,
      estimated_cost REAL DEFAULT 0,
      approved_cost REAL,
      quantity REAL DEFAULT 1,
      unit TEXT DEFAULT 'units',
      justification TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      priority TEXT NOT NULL DEFAULT 'medium',
      approver_id INTEGER,
      approver_name TEXT,
      approval_notes TEXT,
      approved_at TEXT,
      po_number TEXT,
      po_issued_at TEXT,
      received_at TEXT,
      received_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  // Seed sample data if table is empty
  const count = db.prepare('SELECT COUNT(*) as c FROM procurement_requests').get();
  if (count.c > 0) return;

  const seed = [
    { pr: 'PR-2026-0001', title: 'Dell Laptops for New Hires Q2', type: 'HAM', category: 'Laptop', dept: 'Engineering', vendor_id: 2, vendor: 'Dell Technologies', cost: 28500, qty: 15, unit: 'units', priority: 'high', status: 'po_issued', po: 'PO-2026-0001', justification: 'Q2 hiring plan requires 15 developer laptops for new engineering staff.', approver: 'Admin User', approval_notes: 'Approved within budget. Proceed with Dell preferred pricing.', approved_cost: 27000 },
    { pr: 'PR-2026-0002', title: 'Microsoft 365 E3 License Expansion', type: 'SAM', category: 'Microsoft 365', dept: 'IT', vendor_id: 1, vendor: 'Microsoft', cost: 14400, qty: 40, unit: 'licenses', priority: 'medium', status: 'approved', po: null, justification: 'Current M365 E3 pool exhausted. 40 additional seats needed for Q2 headcount growth.', approver: 'Admin User', approval_notes: 'Standard renewal. Approved.', approved_cost: 14400 },
    { pr: 'PR-2026-0003', title: 'Cisco Catalyst 9300 Switch Stack', type: 'HAM', category: 'Network Switch', dept: 'Infrastructure', vendor_id: 4, vendor: 'Cisco', cost: 38000, qty: 4, unit: 'units', priority: 'critical', status: 'pending_approval', po: null, justification: 'Core switch stack in Building A is EOL. Replacement required to maintain network SLA.', approver: null, approval_notes: null, approved_cost: null },
    { pr: 'PR-2026-0004', title: 'Adobe Creative Cloud Teams', type: 'SAM', category: 'Creative Software', dept: 'Marketing', vendor_id: 5, vendor: 'Adobe', cost: 7920, qty: 12, unit: 'licenses', priority: 'medium', status: 'received', po: 'PO-2026-0002', justification: 'Marketing team requires Adobe CC for design, video, and web assets.', approver: 'Admin User', approval_notes: 'Approved. Marketing budget confirmed.', approved_cost: 7920 },
    { pr: 'PR-2026-0005', title: 'Ergonomic Workstations — Remote Staff', type: 'HAM', category: 'Peripherals', dept: 'HR', vendor_id: 2, vendor: 'Dell Technologies', cost: 12000, qty: 20, unit: 'units', priority: 'low', status: 'draft', po: null, justification: 'Remote employee ergonomic program — monitors, keyboards, and standing desk adapters.', approver: null, approval_notes: null, approved_cost: null },
    { pr: 'PR-2026-0006', title: 'AWS Reserved Instances (1yr)', type: 'Service', category: 'Cloud Compute', dept: 'DevOps', vendor_id: 8, vendor: 'Amazon Web Services', cost: 54000, qty: 1, unit: 'years', priority: 'high', status: 'pending_approval', po: null, justification: 'Convert on-demand EC2 fleet to 1-year reserved instances to reduce cloud spend by ~35%.', approver: null, approval_notes: null, approved_cost: null },
    { pr: 'PR-2026-0007', title: 'Salesforce Sales Cloud Seats', type: 'SAM', category: 'CRM', dept: 'Sales', vendor_id: 6, vendor: 'Salesforce', cost: 18000, qty: 10, unit: 'licenses', priority: 'high', status: 'rejected', po: null, justification: 'Expand Salesforce Sales Cloud to new sales team members in APAC region.', approver: 'Admin User', approval_notes: 'Rejected — evaluate Salesforce Starter tier first to reduce per-seat cost. Resubmit with revised SKU.', approved_cost: null },
    { pr: 'PR-2026-0008', title: 'Network Security Audit — External', type: 'Service', category: 'Security', dept: 'IT Security', vendor_id: null, vendor: 'SecureOps Ltd', cost: 22500, qty: 1, unit: 'months', priority: 'critical', status: 'draft', po: null, justification: 'Annual third-party penetration test and security audit mandated by compliance policy.', approver: null, approval_notes: null, approved_cost: null },
  ];

  const insert = db.prepare(`
    INSERT INTO procurement_requests
      (pr_number, title, request_type, category, requester_id, requester_name, department,
       vendor_id, vendor_name, estimated_cost, approved_cost, quantity, unit, justification,
       status, priority, approver_name, approval_notes, approved_at, po_number, po_issued_at, received_at)
    VALUES (?,?,?,?,1,'Admin User',?,?,?,?,?,?,?,?,'?',?,?,?,?,?,?,?)
  `);

  for (const r of seed) {
    db.prepare(`
      INSERT INTO procurement_requests
        (pr_number, title, request_type, category, requester_id, requester_name, department,
         vendor_id, vendor_name, estimated_cost, approved_cost, quantity, unit, justification,
         status, priority, approver_name, approval_notes, approved_at, po_number, po_issued_at, received_at)
      VALUES (?,?,?,?,1,'Admin User',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      r.pr, r.title, r.type, r.category, r.dept,
      r.vendor_id, r.vendor, r.cost, r.approved_cost ?? null,
      r.qty, r.unit, r.justification, r.status, r.priority,
      r.approver ?? null, r.approval_notes ?? null,
      r.approver ? "2026-04-01T09:00:00" : null,
      r.po ?? null,
      r.po ? "2026-04-05T10:00:00" : null,
      r.status === 'received' ? "2026-04-15T14:00:00" : null
    );
  }
}

// Generate next PR number: PR-YYYY-NNNN
function generatePrNumber(db) {
  const year = new Date().getFullYear();
  const prefix = `PR-${year}-`;
  const last = db.prepare(
    `SELECT pr_number FROM procurement_requests WHERE pr_number LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`${prefix}%`);
  if (!last) return `${prefix}0001`;
  const lastNum = parseInt(last.pr_number.split('-')[2], 10);
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
}

// Generate next PO number: PO-YYYY-NNNN
function generatePoNumber(db) {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const last = db.prepare(
    `SELECT po_number FROM procurement_requests WHERE po_number LIKE ? ORDER BY id DESC LIMIT 1`
  ).get(`${prefix}%`);
  if (!last) return `${prefix}0001`;
  const lastNum = parseInt(last.po_number.split('-')[2], 10);
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
}

// GET / - list with filters
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  ensureTable(db);

  const { status, type, search } = req.query;
  let query = `SELECT * FROM procurement_requests WHERE 1=1`;
  const params = [];

  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }
  if (type) {
    query += ` AND request_type = ?`;
    params.push(type);
  }
  if (search) {
    query += ` AND (title LIKE ? OR pr_number LIKE ? OR requester_name LIKE ? OR vendor_name LIKE ? OR category LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }

  query += ` ORDER BY created_at DESC`;

  const rows = db.prepare(query).all(...params);
  res.json({ data: rows, total: rows.length });
});

// POST / - create
router.post('/', authenticate, (req, res) => {
  const db = getDb();
  ensureTable(db);

  const {
    title, request_type, category, description,
    department, vendor_id, vendor_name, estimated_cost,
    quantity, unit, justification, priority
  } = req.body;

  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (!request_type) return res.status(400).json({ error: 'Request type is required' });

  const pr_number = generatePrNumber(db);
  const requester_id = req.user?.id || req.user?.userId || null;
  const requester_name = req.user?.name || req.user?.email || 'Unknown';

  const result = db.prepare(`
    INSERT INTO procurement_requests
      (pr_number, title, request_type, category, description, requester_id, requester_name,
       department, vendor_id, vendor_name, estimated_cost, quantity, unit, justification, priority, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(
    pr_number, title, request_type, category || null, description || null,
    requester_id, requester_name, department || null,
    vendor_id || null, vendor_name || null,
    estimated_cost || 0, quantity || 1, unit || 'units',
    justification || null, priority || 'medium'
  );

  const created = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json({ data: created, message: 'Procurement request created successfully' });
});

// GET /:id - single item
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  ensureTable(db);
  const row = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Procurement request not found' });
  res.json({ data: row });
});

// PUT /:id - update general fields
router.put('/:id', authenticate, (req, res) => {
  const db = getDb();
  ensureTable(db);

  const row = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Procurement request not found' });

  const {
    title, request_type, category, description,
    department, vendor_id, vendor_name, estimated_cost,
    quantity, unit, justification, priority
  } = req.body;

  db.prepare(`
    UPDATE procurement_requests SET
      title = ?, request_type = ?, category = ?, description = ?,
      department = ?, vendor_id = ?, vendor_name = ?,
      estimated_cost = ?, quantity = ?, unit = ?, justification = ?,
      priority = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title ?? row.title,
    request_type ?? row.request_type,
    category ?? row.category,
    description ?? row.description,
    department ?? row.department,
    vendor_id ?? row.vendor_id,
    vendor_name ?? row.vendor_name,
    estimated_cost ?? row.estimated_cost,
    quantity ?? row.quantity,
    unit ?? row.unit,
    justification ?? row.justification,
    priority ?? row.priority,
    req.params.id
  );

  const updated = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  res.json({ data: updated, message: 'Procurement request updated successfully' });
});

// POST /:id/submit - draft → pending_approval
router.post('/:id/submit', authenticate, (req, res) => {
  const db = getDb();
  ensureTable(db);

  const row = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Procurement request not found' });
  if (row.status !== 'draft') return res.status(400).json({ error: 'Only draft requests can be submitted' });

  db.prepare(`UPDATE procurement_requests SET status = 'pending_approval', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  const updated = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  res.json({ data: updated, message: 'Request submitted for approval' });
});

// POST /:id/approve - pending_approval → approved
router.post('/:id/approve', authenticate, (req, res) => {
  const db = getDb();
  ensureTable(db);

  const row = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Procurement request not found' });
  if (row.status !== 'pending_approval') return res.status(400).json({ error: 'Only pending requests can be approved' });

  const { approval_notes, approved_cost } = req.body;
  const approver_id = req.user?.id || req.user?.userId || null;
  const approver_name = req.user?.name || req.user?.email || 'Unknown';

  db.prepare(`
    UPDATE procurement_requests SET
      status = 'approved', approver_id = ?, approver_name = ?,
      approval_notes = ?, approved_cost = ?, approved_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(approver_id, approver_name, approval_notes || null, approved_cost || row.estimated_cost, req.params.id);

  const updated = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  res.json({ data: updated, message: 'Request approved successfully' });
});

// POST /:id/reject - pending_approval → rejected
router.post('/:id/reject', authenticate, (req, res) => {
  const db = getDb();
  ensureTable(db);

  const row = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Procurement request not found' });
  if (row.status !== 'pending_approval') return res.status(400).json({ error: 'Only pending requests can be rejected' });

  const { approval_notes } = req.body;
  const approver_id = req.user?.id || req.user?.userId || null;
  const approver_name = req.user?.name || req.user?.email || 'Unknown';

  db.prepare(`
    UPDATE procurement_requests SET
      status = 'rejected', approver_id = ?, approver_name = ?,
      approval_notes = ?, approved_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(approver_id, approver_name, approval_notes || null, req.params.id);

  const updated = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  res.json({ data: updated, message: 'Request rejected' });
});

// POST /:id/issue-po - approved → po_issued
router.post('/:id/issue-po', authenticate, (req, res) => {
  const db = getDb();
  ensureTable(db);

  const row = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Procurement request not found' });
  if (row.status !== 'approved') return res.status(400).json({ error: 'Only approved requests can have a PO issued' });

  const po_number = generatePoNumber(db);

  db.prepare(`
    UPDATE procurement_requests SET
      status = 'po_issued', po_number = ?, po_issued_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(po_number, req.params.id);

  const updated = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  res.json({ data: updated, message: `PO issued: ${po_number}` });
});

// POST /:id/receive - po_issued → received
router.post('/:id/receive', authenticate, (req, res) => {
  const db = getDb();
  ensureTable(db);

  const row = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Procurement request not found' });
  if (row.status !== 'po_issued') return res.status(400).json({ error: 'Only PO-issued requests can be marked as received' });

  const { received_notes } = req.body;

  db.prepare(`
    UPDATE procurement_requests SET
      status = 'received', received_at = datetime('now'),
      received_notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(received_notes || null, req.params.id);

  const updated = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  res.json({ data: updated, message: 'Request marked as received' });
});

// DELETE /:id - only if status=draft
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  ensureTable(db);

  const row = db.prepare(`SELECT * FROM procurement_requests WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Procurement request not found' });
  if (row.status !== 'draft') return res.status(400).json({ error: 'Only draft requests can be deleted' });

  db.prepare(`DELETE FROM procurement_requests WHERE id = ?`).run(req.params.id);
  res.json({ message: 'Procurement request deleted successfully' });
});

module.exports = router;
