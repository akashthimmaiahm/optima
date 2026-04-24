'use strict';
const si = require('systeminformation');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { execSync } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const AGENT_VERSION = '1.0.0';
const RUN_ONCE = process.argv.includes('--once');

// ─── Config ──────────────────────────────────────────────────────────────────
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ config.json not found. Run the installer first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
function apiRequest(serverUrl, method, endpoint, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, serverUrl);
    const body = JSON.stringify(data);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + (url.search || ''),
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': `Optima-Agent/${AGENT_VERSION}`,
      },
      rejectUnauthorized: false, // allow self-signed certs in dev
    };
    const req = lib.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('Request timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── Software collection ─────────────────────────────────────────────────────
async function getInstalledSoftware() {
  const apps = [];
  try {
    if (process.platform === 'win32') {
      // 64-bit registry
      const queryReg = (hive) => {
        try {
          const cmd = `powershell -NoProfile -Command "Get-ItemProperty '${hive}' -ErrorAction SilentlyContinue | Select-Object DisplayName,DisplayVersion,Publisher | Where-Object {$_.DisplayName} | ConvertTo-Csv -NoTypeInformation"`;
          const out = execSync(cmd, { timeout: 25000, stdio: ['pipe','pipe','pipe'] }).toString();
          const lines = out.trim().split(/\r?\n/).slice(1);
          for (const line of lines) {
            const [name, version, vendor] = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
            if (name && name !== 'NULL') apps.push({ name, version: version || '', vendor: vendor || '' });
          }
        } catch {}
      };
      queryReg('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');
      queryReg('HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');
      queryReg('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');

    } else if (process.platform === 'darwin') {
      try {
        const cmd = 'system_profiler SPApplicationsDataType -json 2>/dev/null';
        const out = execSync(cmd, { timeout: 60000 }).toString();
        const data = JSON.parse(out);
        for (const app of (data.SPApplicationsDataType || [])) {
          if (app._name) apps.push({ name: app._name, version: app.version || '', vendor: app.obtained_from || '' });
        }
      } catch {
        try {
          const out = execSync('ls /Applications 2>/dev/null', { timeout: 10000 }).toString();
          for (const line of out.split('\n').filter(l => l.endsWith('.app'))) {
            apps.push({ name: line.replace('.app', ''), version: '', vendor: '' });
          }
        } catch {}
      }
      // Homebrew
      try {
        const out = execSync('brew list --versions 2>/dev/null', { timeout: 15000 }).toString();
        for (const line of out.split('\n').filter(Boolean)) {
          const parts = line.split(' ');
          apps.push({ name: parts[0], version: parts.slice(1).join(' '), vendor: 'homebrew' });
        }
      } catch {}

    } else {
      // Linux — dpkg
      try {
        const out = execSync("dpkg-query -W -f='${Package}|${Version}|${Maintainer}\\n' 2>/dev/null", { timeout: 30000 }).toString();
        for (const line of out.split('\n').filter(Boolean)) {
          const [name, version, vendor] = line.split('|');
          if (name) apps.push({ name, version: version || '', vendor: (vendor || '').split('<')[0].trim() });
        }
      } catch {
        // rpm
        try {
          const out = execSync("rpm -qa --queryformat '%{NAME}|%{VERSION}|%{VENDOR}\\n' 2>/dev/null", { timeout: 30000 }).toString();
          for (const line of out.split('\n').filter(Boolean)) {
            const [name, version, vendor] = line.split('|');
            if (name) apps.push({ name, version: version || '', vendor: vendor || '' });
          }
        } catch {}
      }
      // Snap
      try {
        const out = execSync('snap list 2>/dev/null', { timeout: 10000 }).toString();
        for (const line of out.split('\n').slice(1).filter(Boolean)) {
          const parts = line.split(/\s+/);
          if (parts[0]) apps.push({ name: parts[0], version: parts[1] || '', vendor: 'snap' });
        }
      } catch {}
      // Flatpak
      try {
        const out = execSync('flatpak list --app --columns=name,version 2>/dev/null', { timeout: 10000 }).toString();
        for (const line of out.split('\n').filter(Boolean)) {
          const parts = line.split('\t');
          if (parts[0]) apps.push({ name: parts[0], version: parts[1] || '', vendor: 'flatpak' });
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[agent] Software scan partial error:', err.message);
  }
  // Deduplicate by name
  const seen = new Set();
  return apps.filter(a => {
    if (!a.name || seen.has(a.name.toLowerCase())) return false;
    seen.add(a.name.toLowerCase());
    return true;
  });
}

// ─── Hardware collection ─────────────────────────────────────────────────────
async function getHardwareInfo() {
  const [system, cpu, mem, disks, nets, osInfo, uuid, graphics] = await Promise.all([
    si.system().catch(() => ({})),
    si.cpu().catch(() => ({})),
    si.mem().catch(() => ({})),
    si.diskLayout().catch(() => []),
    si.networkInterfaces().catch(() => []),
    si.osInfo().catch(() => ({})),
    si.uuid().catch(() => ({})),
    si.graphics().catch(() => ({ controllers: [] })),
  ]);

  const netList = Array.isArray(nets) ? nets : [];
  return {
    hostname:     osInfo.hostname || os.hostname(),
    serial_number: system.serial || uuid.hardware || `NOSER-${os.hostname()}`,
    manufacturer: system.manufacturer || '',
    model:        system.model || '',
    os:           `${osInfo.distro || os.type()} ${osInfo.release || os.release()}`,
    os_arch:      osInfo.arch || os.arch(),
    cpu_model:    cpu.brand || cpu.manufacturer || '',
    cpu_cores:    cpu.physicalCores || os.cpus().length,
    cpu_threads:  cpu.cores || os.cpus().length,
    ram_gb:       Math.round((mem.total || 0) / 1073741824),
    disks:        disks.slice(0, 4).map(d => ({ name: d.name, size_gb: Math.round((d.size || 0) / 1073741824), type: d.type || '' })),
    network_interfaces: netList.filter(n => !n.internal && n.mac).map(n => ({ name: n.iface, mac: n.mac, ip4: n.ip4 || '' })),
    gpu:          (graphics.controllers || []).map(g => g.model).filter(Boolean).join(', '),
    platform:     process.platform,
    agent_version: AGENT_VERSION,
  };
}

// ─── Register ─────────────────────────────────────────────────────────────────
async function register(config) {
  if (config.agent_id) return config;
  console.log('[agent] Registering with property server...');
  const osInfo = await si.osInfo().catch(() => ({}));
  const res = await apiRequest(config.server_url, 'POST', '/api/agent/register', {
    property_key: config.property_key,
    hostname: osInfo.hostname || os.hostname(),
    platform: process.platform,
    os: `${osInfo.distro || os.type()} ${osInfo.release || os.release()}`,
    ip_address: Object.values(os.networkInterfaces()).flat().find(n => n.family === 'IPv4' && !n.internal)?.address || '',
    agent_version: AGENT_VERSION,
  });
  if (res.status === 200 && res.data.agent_id) {
    config.agent_id = res.data.agent_id;
    saveConfig(config);
    console.log(`[agent] ✅ Registered — agent_id: ${config.agent_id}`);
    return config;
  } else {
    throw new Error(`Registration failed: ${JSON.stringify(res.data)}`);
  }
}

// ─── Inventory ───────────────────────────────────────────────────────────────
async function collectAndReport(config) {
  const ts = new Date().toISOString();
  console.log(`[agent] ${ts} — collecting inventory...`);
  const [hardware, software] = await Promise.all([
    getHardwareInfo(),
    getInstalledSoftware(),
  ]);
  console.log(`[agent] Hardware: ${hardware.hostname} | RAM: ${hardware.ram_gb}GB | Software: ${software.length} apps`);

  const res = await apiRequest(config.server_url, 'POST', '/api/agent/inventory', {
    agent_id: config.agent_id,
    property_key: config.property_key,
    hardware,
    software,
    collected_at: ts,
  });

  if (res.status === 200) {
    console.log(`[agent] ✅ Submitted — ${res.data.software_new} new apps, hardware upserted`);
  } else {
    console.error(`[agent] ❌ Server returned ${res.status}:`, res.data);
  }
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────
function startHeartbeat(config) {
  const beat = () =>
    apiRequest(config.server_url, 'POST', '/api/agent/heartbeat', { agent_id: config.agent_id })
      .catch(() => {});
  beat();
  setInterval(beat, 5 * 60 * 1000); // every 5 min
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔍  Optima Agent v${AGENT_VERSION}`);
  console.log(`    Platform : ${process.platform}`);
  console.log(`    Node     : ${process.version}\n`);

  let config = loadConfig();
  config = await register(config);

  await collectAndReport(config);

  if (RUN_ONCE) {
    console.log('[agent] --once flag set, exiting.');
    process.exit(0);
  }

  const intervalMs = (config.interval_hours || 24) * 3600 * 1000;
  console.log(`[agent] Next scan in ${config.interval_hours || 24}h. Running as background service.`);
  startHeartbeat(config);
  setInterval(() => collectAndReport(config).catch(e => console.error('[agent]', e.message)), intervalMs);
}

main().catch(err => {
  console.error('[agent] Fatal:', err.message);
  process.exit(1);
});
