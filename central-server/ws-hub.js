'use strict';
const WebSocket = require('ws');

// Map of property_id -> { ws, slug, lastSeen, ec2_url }
const connectedProperties = new Map();
// Set of frontend WebSocket clients listening for status updates
const frontendClients = new Set();

function initWebSocketHub(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const role = params.get('role'); // 'property' or 'frontend'

    if (role === 'property') {
      handlePropertyConnection(ws, params);
    } else {
      handleFrontendConnection(ws);
    }
  });

  // Stale check: mark properties offline if no heartbeat for 30s
  setInterval(() => {
    const now = Date.now();
    for (const [id, info] of connectedProperties) {
      if (now - info.lastSeen > 30000) {
        connectedProperties.delete(id);
        broadcastStatus();
      }
    }
  }, 10000);

  console.log('  WS Hub : property heartbeat + frontend push');
  return wss;
}

function handlePropertyConnection(ws, params) {
  const propertyId = params.get('property_id');
  const slug = params.get('slug') || '';
  const ec2Url = params.get('ec2_url') || '';

  if (!propertyId) { ws.close(4001, 'property_id required'); return; }

  connectedProperties.set(propertyId, {
    ws,
    slug,
    ec2_url: ec2Url,
    lastSeen: Date.now(),
  });

  broadcastStatus();

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'heartbeat') {
        const entry = connectedProperties.get(propertyId);
        if (entry) entry.lastSeen = Date.now();
      }
    } catch {}
  });

  ws.on('close', () => {
    connectedProperties.delete(propertyId);
    broadcastStatus();
  });

  ws.on('error', () => {
    connectedProperties.delete(propertyId);
    broadcastStatus();
  });

  // Acknowledge
  ws.send(JSON.stringify({ type: 'connected', property_id: propertyId }));
}

function handleFrontendConnection(ws) {
  frontendClients.add(ws);

  // Send current status immediately
  ws.send(JSON.stringify({ type: 'status', health: getHealthMap() }));

  ws.on('close', () => frontendClients.delete(ws));
  ws.on('error', () => frontendClients.delete(ws));
}

function getHealthMap() {
  const map = {};
  for (const [id, info] of connectedProperties) {
    map[id] = true;
  }
  return map;
}

function broadcastStatus() {
  const payload = JSON.stringify({ type: 'status', health: getHealthMap() });
  for (const client of frontendClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

module.exports = { initWebSocketHub, getHealthMap, connectedProperties };
