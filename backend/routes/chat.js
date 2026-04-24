const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');
const { getDb } = require('../database/init');
const { authenticate } = require('../middleware/auth');

// ── LLM provider config ──────────────────────────────────────────────────────

const PROVIDERS = [
  {
    name: 'Ollama',
    check: { host: 'localhost', port: 11434, path: '/api/tags' },
    chat: { host: 'localhost', port: 11434, path: '/api/chat' },
    buildBody: (messages, model) => JSON.stringify({
      model: model || 'llama3.2',
      messages,
      stream: false,
      options: { temperature: 0.1, num_predict: 400, stop: ['\n\n\n'] },
    }),
    extractReply: (data) => data.message?.content || '',
    models: ['llama3.2:1b', 'llama3.2', 'llama3.1', 'llama3', 'mistral', 'gemma2', 'phi3', 'deepseek-r1', 'qwen2.5'],
  },
  {
    name: 'LM Studio',
    check: { host: 'localhost', port: 1234, path: '/v1/models' },
    chat: { host: 'localhost', port: 1234, path: '/v1/chat/completions' },
    buildBody: (messages) => JSON.stringify({
      model: 'local-model',
      messages,
      temperature: 0.7,
      max_tokens: 1024,
      stream: false,
    }),
    extractReply: (data) => data.choices?.[0]?.message?.content || '',
    models: [],
  },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function httpGet(opts) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...opts, method: 'GET' }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, body: JSON.parse(d), status: res.statusCode }); }
        catch { resolve({ ok: false, body: {}, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function httpPost(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...opts, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, body: JSON.parse(d), status: res.statusCode }); }
        catch { resolve({ ok: false, body: {}, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(180000, () => { req.destroy(); reject(new Error('LLM timeout')); });
    req.write(body);
    req.end();
  });
}

// ── detect which provider + model is running ─────────────────────────────────

async function detectProvider() {
  for (const provider of PROVIDERS) {
    try {
      const r = await httpGet(provider.check);
      if (!r.ok) continue;
      // For Ollama, find first available model using full name (e.g. llama3.2:1b)
      if (provider.name === 'Ollama') {
        const ollamaModels = (r.body.models || []).map(m => m.name);
        // Match full name first, then by base name prefix
        const model = ollamaModels.find(full => {
          const base = full.split(':')[0];
          return provider.models.some(p => p === full || p === base || base === p.split(':')[0]);
        }) || ollamaModels[0];
        if (!model) continue;
        return { provider, model };
      }
      return { provider, model: 'local-model' };
    } catch { /* try next */ }
  }
  return null;
}

// ── build compact full-data context ──────────────────────────────────────────

function getLiveContext(db) {
  const lines = [];
  try {
    const sw    = db.prepare("SELECT COUNT(*) as c FROM software_assets WHERE status='active'").get();
    const hw    = db.prepare("SELECT COUNT(*) as c FROM hardware_assets WHERE status!='retired'").get();
    const users = db.prepare("SELECT COUNT(*) as c FROM users WHERE is_active=1").get();
    const lic   = db.prepare("SELECT SUM(total_licenses) as t, SUM(used_licenses) as u FROM software_assets").get();
    const expLic= db.prepare("SELECT COUNT(*) as c FROM software_assets WHERE expiry_date IS NOT NULL AND expiry_date <= date('now','+90 days') AND expiry_date >= date('now')").get();
    const wasted= db.prepare("SELECT SUM((total_licenses-used_licenses)*cost_per_license) as w FROM software_assets WHERE total_licenses>0 AND cost_per_license>0 AND (used_licenses*1.0/total_licenses)<0.7").get();
    const topW  = db.prepare("SELECT name, ROUND((total_licenses-used_licenses)*cost_per_license) as w FROM software_assets WHERE total_licenses>0 AND cost_per_license>0 AND (used_licenses*1.0/total_licenses)<0.7 ORDER BY w DESC LIMIT 5").all();
    const repair= db.prepare("SELECT name FROM hardware_assets WHERE status='in_repair'").all();
    const warExp= db.prepare("SELECT name, warranty_expiry FROM hardware_assets WHERE warranty_expiry<=date('now','+60 days') AND warranty_expiry>=date('now') AND status='active'").all();
    const actC  = db.prepare("SELECT COUNT(*) as c FROM contracts WHERE status='active'").get();
    const expC  = db.prepare("SELECT title, end_date FROM contracts WHERE end_date IS NOT NULL AND end_date<=date('now','+90 days') AND end_date>=date('now')").all();
    const oldC  = db.prepare("SELECT title FROM contracts WHERE end_date IS NOT NULL AND end_date<date('now') LIMIT 6").all();
    const vend  = db.prepare("SELECT COUNT(*) as c FROM vendors").get();
    const mdmT  = db.prepare("SELECT COUNT(*) as c FROM mdm_devices").get();
    const mdmNC = db.prepare("SELECT name, platform, assigned_user FROM mdm_devices WHERE status='non_compliant'").all();
    const mdmP  = db.prepare("SELECT COUNT(*) as c FROM mdm_devices WHERE status='pending'").get();
    const ai    = db.prepare("SELECT name, total_licenses, used_licenses FROM software_assets WHERE category='AI Platform'").all();
    const cmdb  = db.prepare("SELECT COUNT(*) as c FROM cmdb_items").get();
    const shadow= db.prepare("SELECT COUNT(*) as c FROM shadow_it").get();
    const hwSt  = db.prepare("SELECT status, COUNT(*) as c FROM hardware_assets GROUP BY status").all();

    lines.push(`software_active:${sw.c} hardware_active:${hw.c} users:${users.c} cmdb:${cmdb.c} shadow_it:${shadow.c}`);
    lines.push(`licenses_total:${lic.t||0} licenses_used:${lic.u||0} utilization:${lic.t>0?Math.round(lic.u/lic.t*100):0}% expiring_90d:${expLic.c} wasted_spend:$${Math.round(wasted.w||0)}/mo`);
    lines.push(`top_wasted: ${topW.map(l=>`${l.name}=$${l.w}/mo`).join(', ')||'none'}`);
    lines.push(`hardware_status: ${hwSt.map(s=>`${s.status}:${s.c}`).join(', ')} in_repair:${repair.map(h=>h.name).join(',')||'none'}`);
    lines.push(`warranty_expiring_soon: ${warExp.map(h=>`${h.name}(${h.warranty_expiry?.split('T')[0]})`).join(', ')||'none'}`);
    lines.push(`contracts_active:${actC.c} vendors:${vend.c}`);
    lines.push(`contracts_expiring_90d: ${expC.map(c=>`${c.title}(${c.end_date?.split('T')[0]})`).join(', ')||'none'}`);
    lines.push(`contracts_expired: ${oldC.map(c=>c.title).join(', ')||'none'}`);
    lines.push(`mdm_enrolled:${mdmT.c} mdm_pending:${mdmP.c} mdm_non_compliant(${mdmNC.length}): ${mdmNC.map(d=>`${d.name}[${d.platform},${d.assigned_user||'unassigned'}]`).join(', ')||'none'}`);
    lines.push(`ai_platforms: ${ai.map(a=>`${a.name} ${a.used_licenses}/${a.total_licenses}seats`).join(', ')||'none'}`);
  } catch(e) { lines.push('data_error:'+e.message); }
  return lines.join('\n');
}

// ── GET /api/chat/status — check if any LLM is available ────────────────────

router.get('/status', authenticate, async (req, res) => {
  const detected = await detectProvider();
  if (!detected) {
    return res.json({ available: false, message: 'No local LLM detected. Please install Ollama (ollama.ai) and run: ollama pull llama3.2' });
  }
  res.json({ available: true, provider: detected.provider.name, model: detected.model });
});

// ── POST /api/chat — send message to local LLM ───────────────────────────────

router.post('/', authenticate, async (req, res) => {
  const { messages = [], model: requestedModel } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const detected = await detectProvider();
  if (!detected) {
    return res.status(503).json({
      error: 'no_llm',
      message: 'No local LLM is running. Install Ollama from ollama.ai and run: ollama pull llama3.2\n\nOr install LM Studio from lmstudio.ai and load any model.',
    });
  }

  const { provider, model } = detected;
  const db = getDb();

  // Get full live data snapshot
  const liveData = getLiveContext(db);

  // Extract only the current (last) user question — do NOT send conversation history.
  // Sending previous assistant messages causes the model to continue from cut-off or
  // confused responses ("my previous response was incomplete…") instead of answering fresh.
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const question = lastUserMsg?.content || messages[messages.length - 1]?.content || '';

  const fullMessages = [
    {
      role: 'system',
      content: 'You are Optima AI, an asset management assistant. You have been given LIVE DATA from the Optima system. Answer using ONLY the facts provided. Always give specific names, numbers, and dates from the data. Never say you lack data or cannot access the system. Be concise.',
    },
    {
      role: 'user',
      content: `LIVE DATA FROM OPTIMA SYSTEM:\n${liveData}\n\nQuestion: ${question}\n\nAnswer (use only the live data above, be specific and concise):`,
    },
  ];

  try {
    const body = provider.buildBody(fullMessages, requestedModel || model);
    const result = await httpPost(provider.chat, body);

    if (!result.ok) {
      // Ollama model not found — try first available model
      if (provider.name === 'Ollama' && result.status === 404) {
        const tagsRes = await httpGet(provider.check);
        const firstModel = tagsRes.body.models?.[0]?.name;
        if (firstModel) {
          const body2 = provider.buildBody(fullMessages, firstModel);
          const result2 = await httpPost(provider.chat, body2);
          if (result2.ok) {
            const reply = provider.extractReply(result2.body);
            return res.json({ reply, provider: provider.name, model: firstModel });
          }
        }
      }
      return res.status(500).json({ error: 'llm_error', message: `LLM returned error: ${result.status}. Check that the model is loaded.` });
    }

    const reply = provider.extractReply(result.body);
    res.json({ reply, provider: provider.name, model });
  } catch (err) {
    if (err.message === 'LLM timeout') {
      return res.status(504).json({ error: 'timeout', message: 'LLM took too long to respond. Try a smaller/faster model.' });
    }
    res.status(500).json({ error: 'llm_error', message: err.message });
  }
});

module.exports = router;
