'use strict';
const si = require('systeminformation');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { execSync, spawn } = require('child_process');

const AGENT_VERSION = '1.0.0';

// Embedded config — the server appends JSON after a marker to the end of this binary.
// Format: ...binary bytes...---OPTIMA-CONFIG---{"property_key":"...","server_url":"..."}
const CONFIG_MARKER = '---OPTIMA-CONFIG---';

function readEmbeddedConfig() {
  try {
    const data = fs.readFileSync(process.execPath);
    const markerIdx = data.indexOf(CONFIG_MARKER);
    if (markerIdx > 0) {
      const jsonStr = data.slice(markerIdx + CONFIG_MARKER.length).toString('utf8').trim();
      return JSON.parse(jsonStr);
    }
  } catch {}
  return null;
}

function getEmbeddedKey() {
  const cfg = readEmbeddedConfig();
  return cfg ? (cfg.property_key || '') : '';
}
function getEmbeddedUrl() {
  const cfg = readEmbeddedConfig();
  return cfg ? (cfg.server_url || '') : '';
}

// Determine install directory based on platform
function getInstallDir() {
  if (process.platform === 'win32') return 'C:\\Program Files\\Optima\\agent';
  if (process.platform === 'darwin') return '/opt/optima-agent';
  return '/opt/optima-agent';
}

// Config path is next to the executable (or in install dir)
function getConfigPath() {
  // When running as pkg binary, process.execPath is the binary location
  const exeDir = path.dirname(process.execPath);
  const localConfig = path.join(exeDir, 'config.json');
  if (fs.existsSync(localConfig)) return localConfig;
  // Fallback to install dir
  const installConfig = path.join(getInstallDir(), 'config.json');
  if (fs.existsSync(installConfig)) return installConfig;
  return localConfig; // default for new installs
}

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { install: false, once: false, uninstall: false, key: '', server: '' };
  for (const arg of args) {
    if (arg === '--install') parsed.install = true;
    else if (arg === '--once') parsed.once = true;
    else if (arg === '--uninstall') parsed.uninstall = true;
    else if (arg.startsWith('--key=')) parsed.key = arg.split('=')[1];
    else if (arg.startsWith('--server=')) parsed.server = arg.split('=')[1];
  }
  return parsed;
}

// --- HTTP helper ---
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
      rejectUnauthorized: false,
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

// --- Config management ---
function loadConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    console.error('ERROR: config.json not found. Run with --install first.');
    console.error('Usage: optima-agent --install --key=<property_key> --server=<server_url>');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function saveConfig(configPath, cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

// --- Software collection ---
async function getInstalledSoftware() {
  const apps = [];
  try {
    if (process.platform === 'win32') {
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
      try {
        const out = execSync('brew list --versions 2>/dev/null', { timeout: 15000 }).toString();
        for (const line of out.split('\n').filter(Boolean)) {
          const parts = line.split(' ');
          apps.push({ name: parts[0], version: parts.slice(1).join(' '), vendor: 'homebrew' });
        }
      } catch {}

    } else {
      try {
        const out = execSync("dpkg-query -W -f='${Package}|${Version}|${Maintainer}\\n' 2>/dev/null", { timeout: 30000 }).toString();
        for (const line of out.split('\n').filter(Boolean)) {
          const [name, version, vendor] = line.split('|');
          if (name) apps.push({ name, version: version || '', vendor: (vendor || '').split('<')[0].trim() });
        }
      } catch {
        try {
          const out = execSync("rpm -qa --queryformat '%{NAME}|%{VERSION}|%{VENDOR}\\n' 2>/dev/null", { timeout: 30000 }).toString();
          for (const line of out.split('\n').filter(Boolean)) {
            const [name, version, vendor] = line.split('|');
            if (name) apps.push({ name, version: version || '', vendor: vendor || '' });
          }
        } catch {}
      }
      try {
        const out = execSync('snap list 2>/dev/null', { timeout: 10000 }).toString();
        for (const line of out.split('\n').slice(1).filter(Boolean)) {
          const parts = line.split(/\s+/);
          if (parts[0]) apps.push({ name: parts[0], version: parts[1] || '', vendor: 'snap' });
        }
      } catch {}
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
  const seen = new Set();
  return apps.filter(a => {
    if (!a.name || seen.has(a.name.toLowerCase())) return false;
    seen.add(a.name.toLowerCase());
    return true;
  });
}

// --- Hardware collection ---
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

// --- Register with server ---
async function register(config, configPath) {
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
    saveConfig(configPath, config);
    console.log(`[agent] Registered - agent_id: ${config.agent_id}`);
    return config;
  } else {
    throw new Error(`Registration failed: ${JSON.stringify(res.data)}`);
  }
}

// --- Collect & report inventory ---
async function collectAndReport(config) {
  const ts = new Date().toISOString();
  console.log(`[agent] ${ts} - collecting inventory...`);
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
    console.log(`[agent] Submitted - ${res.data.software_new} new apps, hardware upserted`);
  } else {
    console.error(`[agent] Server returned ${res.status}:`, res.data);
  }
}

// --- Heartbeat ---
function startHeartbeat(config) {
  const beat = () =>
    apiRequest(config.server_url, 'POST', '/api/agent/heartbeat', { agent_id: config.agent_id })
      .catch(() => {});
  beat();
  setInterval(beat, 5 * 60 * 1000);
}

// === INSTALLATION ===
async function install(args) {
  // Use embedded values if CLI args not provided
  if (!args.key) args.key = getEmbeddedKey();
  if (!args.server) args.server = getEmbeddedUrl();

  if (!args.key || !args.server) {
    console.error('ERROR: --key and --server are required for installation.');
    console.error('Usage: optima-agent --install --key=<property_key> --server=<server_url>');
    process.exit(1);
  }

  console.log('');
  console.log('  Optima Agent Installer v' + AGENT_VERSION);
  console.log('  ========================================');
  console.log('');

  // Validate property key
  console.log('  Validating property key...');
  try {
    const res = await apiRequest(args.server, 'POST', '/api/portal/verify-key', {
      property_key: args.key,
    });
    if (res.status === 200 && res.data.valid) {
      console.log(`  Property: ${res.data.property.name}`);
      console.log(`  Plan    : ${res.data.property.plan}`);
    } else {
      console.error('  ERROR: Invalid property key or inactive property.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`  ERROR: Cannot reach server at ${args.server}`);
    console.error(`  Details: ${err.message}`);
    process.exit(1);
  }

  // Determine install directory and copy binary
  const installDir = getInstallDir();
  console.log(`\n  Install directory: ${installDir}`);

  if (!fs.existsSync(installDir)) {
    fs.mkdirSync(installDir, { recursive: true });
  }

  // Copy current executable to install directory (if not already there)
  const currentExe = process.execPath;
  const exeName = process.platform === 'win32' ? 'optima-agent.exe' : 'optima-agent';
  const targetExe = path.join(installDir, exeName);

  if (path.resolve(currentExe) !== path.resolve(targetExe)) {
    console.log('  Copying agent to install directory...');
    fs.copyFileSync(currentExe, targetExe);
    // Make executable on Unix
    if (process.platform !== 'win32') {
      fs.chmodSync(targetExe, 0o755);
    }
  }

  // Write config
  console.log('  Writing configuration...');
  const configPath = path.join(installDir, 'config.json');
  const config = {
    property_key: args.key,
    server_url: args.server,
    agent_id: null,
    interval_hours: 24,
    installed_at: new Date().toISOString(),
  };
  saveConfig(configPath, config);

  // Install as service
  console.log('  Installing as system service...');
  if (process.platform === 'win32') {
    installWindowsService(targetExe, installDir);
  } else if (process.platform === 'darwin') {
    installMacService(targetExe, installDir);
  } else {
    installLinuxService(targetExe, installDir);
  }

  console.log('');
  console.log('  ============================================');
  console.log('    Installation complete!');
  console.log('  ============================================');
  console.log(`  Agent binary: ${targetExe}`);
  console.log(`  Config:       ${configPath}`);
  if (process.platform === 'win32') {
    console.log('  Service:      OptimaAgent (Scheduled Task)');
    console.log('  Schedule:     Runs at startup + daily at 03:00');
    console.log('  Status:       Agent is now running in background.');
  } else if (process.platform === 'darwin') {
    console.log('  Service:      com.optima.agent (LaunchDaemon)');
    console.log('  Logs:         /var/log/optima-agent.log');
  } else {
    console.log('  Service:      optima-agent (systemd)');
    console.log('  Logs:         journalctl -u optima-agent -f');
  }
  console.log('');
  console.log('  This window will close automatically.');
  console.log('');

  // Give user a moment to read the output, then exit
  // The agent is already running in background via service/task
  await new Promise(resolve => setTimeout(resolve, 3000));
}

function installWindowsService(exePath, workDir) {
  try {
    // Remove old tasks if they exist
    try { execSync('schtasks /Delete /TN "OptimaAgent" /F', { stdio: 'pipe' }); } catch {}
    try { execSync('schtasks /Delete /TN "OptimaAgentStartup" /F', { stdio: 'pipe' }); } catch {}

    // Create scheduled tasks for daily run + startup
    execSync(`schtasks /Create /TN "OptimaAgent" /TR "\\"${exePath}\\"" /SC DAILY /ST 03:00 /RU SYSTEM /RL HIGHEST /F`, { stdio: 'pipe' });
    execSync(`schtasks /Create /TN "OptimaAgentStartup" /TR "\\"${exePath}\\"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F`, { stdio: 'pipe' });
    console.log('  Windows Scheduled Tasks created (daily + startup).');

    // Start agent in background immediately (detached process)
    console.log('  Starting agent in background...');
    const child = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore',
      cwd: workDir,
    });
    child.unref();
    console.log(`  Agent running in background (PID: ${child.pid}).`);
  } catch (err) {
    console.error(`  WARNING: Could not create scheduled task: ${err.message}`);
    console.error('  You may need to manually create a scheduled task for:', exePath);
  }
}

function installLinuxService(exePath, workDir) {
  const serviceContent = `[Unit]
Description=Optima HAM/SAM Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${exePath}
WorkingDirectory=${workDir}
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=optima-agent

[Install]
WantedBy=multi-user.target
`;
  try {
    fs.writeFileSync('/etc/systemd/system/optima-agent.service', serviceContent);
    execSync('systemctl daemon-reload', { stdio: 'pipe' });
    execSync('systemctl enable optima-agent', { stdio: 'pipe' });
    execSync('systemctl start optima-agent', { stdio: 'pipe' });
    console.log('  Systemd service installed and started.');
  } catch (err) {
    console.error(`  WARNING: Could not install systemd service: ${err.message}`);
  }
}

function installMacService(exePath, workDir) {
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.optima.agent</string>
  <key>ProgramArguments</key>  <array><string>${exePath}</string></array>
  <key>WorkingDirectory</key>  <string>${workDir}</string>
  <key>RunAtLoad</key>         <true/>
  <key>StartInterval</key>     <integer>86400</integer>
  <key>StandardOutPath</key>   <string>/var/log/optima-agent.log</string>
  <key>StandardErrorPath</key> <string>/var/log/optima-agent.log</string>
  <key>KeepAlive</key>         <false/>
</dict>
</plist>
`;
  const plistPath = '/Library/LaunchDaemons/com.optima.agent.plist';
  try {
    fs.writeFileSync(plistPath, plistContent);
    execSync(`launchctl load "${plistPath}"`, { stdio: 'pipe' });
    console.log('  LaunchDaemon installed.');
  } catch (err) {
    console.error(`  WARNING: Could not install LaunchDaemon: ${err.message}`);
  }
}

// === UNINSTALL ===
function uninstall() {
  console.log('\n  Optima Agent Uninstaller');
  console.log('  ========================\n');

  if (process.platform === 'win32') {
    try { execSync('schtasks /Delete /TN "OptimaAgent" /F', { stdio: 'pipe' }); } catch {}
    try { execSync('schtasks /Delete /TN "OptimaAgentStartup" /F', { stdio: 'pipe' }); } catch {}
    console.log('  Scheduled tasks removed.');
  } else if (process.platform === 'darwin') {
    try { execSync('launchctl unload /Library/LaunchDaemons/com.optima.agent.plist', { stdio: 'pipe' }); } catch {}
    try { fs.unlinkSync('/Library/LaunchDaemons/com.optima.agent.plist'); } catch {}
    console.log('  LaunchDaemon removed.');
  } else {
    try { execSync('systemctl stop optima-agent', { stdio: 'pipe' }); } catch {}
    try { execSync('systemctl disable optima-agent', { stdio: 'pipe' }); } catch {}
    try { fs.unlinkSync('/etc/systemd/system/optima-agent.service'); } catch {}
    try { execSync('systemctl daemon-reload', { stdio: 'pipe' }); } catch {}
    console.log('  Systemd service removed.');
  }

  const installDir = getInstallDir();
  if (fs.existsSync(installDir)) {
    fs.rmSync(installDir, { recursive: true, force: true });
    console.log(`  Removed: ${installDir}`);
  }

  console.log('  Uninstall complete.\n');
}

// === MAIN ===
async function main() {
  const args = parseArgs();

  if (args.uninstall) {
    uninstall();
    process.exit(0);
  }

  if (args.install) {
    await install(args);
    process.exit(0);
  }

  // Auto-detect install mode: if embedded config exists but no config.json found
  const embKey = getEmbeddedKey();
  const embUrl = getEmbeddedUrl();
  if (embKey && embUrl) {
    const configExists = fs.existsSync(path.join(getInstallDir(), 'config.json')) ||
                         fs.existsSync(path.join(path.dirname(process.execPath), 'config.json'));
    if (!configExists) {
      args.install = true;
      args.key = embKey;
      args.server = embUrl;
      await install(args);
      process.exit(0);
    }
  }

  // Normal agent run
  console.log(`\n  Optima Agent v${AGENT_VERSION}`);
  console.log(`  Platform : ${process.platform}`);
  console.log(`  PID      : ${process.pid}\n`);

  const configPath = getConfigPath();
  let config = loadConfig();
  config = await register(config, configPath);

  await collectAndReport(config);

  if (args.once) {
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
