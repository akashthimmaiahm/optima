'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const AGENT_DIR = path.join(__dirname, '../../deploy/agent');

// ── Serve agent.js and package.json as static files ───────────────────────
router.get('/agent.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(AGENT_DIR, 'agent.js'));
});

router.get('/package.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(AGENT_DIR, 'package.json'));
});

// ── Generate installer script per platform ────────────────────────────────
// GET /api/agents/:platform/install?key=<property_key>
// platform: windows | linux | mac
router.get('/:platform/install', (req, res) => {
  const { platform } = req.params;
  const propertyKey = req.query.key || '';

  // Build the server base URL from the request (respect X-Forwarded-Proto behind nginx)
  const proto = req.get('X-Forwarded-Proto') || req.protocol;
  const serverUrl = `${proto}://${req.get('host')}`;

  if (platform === 'windows') {
    const script = generateWindowsBat(propertyKey, serverUrl);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="optima-agent-install.bat"');
    return res.send(script);
  }

  if (platform === 'linux' || platform === 'mac') {
    const script = generateUnixScript(propertyKey, serverUrl);
    res.setHeader('Content-Type', 'application/octet-stream');
    const fname = platform === 'linux' ? 'optima-agent-install-linux.sh' : 'optima-agent-install-macos.sh';
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    return res.send(script);
  }

  res.status(400).json({ error: 'Unknown platform. Use: windows, linux, mac' });
});

// ── Windows .bat installer (uses -EncodedCommand to avoid all CMD escaping issues) ─
function generateWindowsBat(propertyKey, serverUrl) {
  // Build pure PowerShell script — no CMD escaping concerns
  var ps = [
    '$ErrorActionPreference = "Stop"',
    '$PropertyKey = "' + propertyKey + '"',
    '$ServerUrl = "' + serverUrl + '"',
    '$AgentDir = "C:\\Program Files\\Optima\\agent"',
    '',
    'Write-Host ""',
    'Write-Host "  Validating property key..." -ForegroundColor Yellow',
    'try {',
    '    $body = @{ property_key = $PropertyKey } | ConvertTo-Json',
    '    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
    '    try { $resp = Invoke-RestMethod -Uri "$ServerUrl/api/portal/verify-key" -Method POST -Body $body -ContentType "application/json" -SkipCertificateCheck -ErrorAction Stop } catch { $resp = Invoke-RestMethod -Uri "$ServerUrl/api/portal/verify-key" -Method POST -Body $body -ContentType "application/json" -ErrorAction Stop }',
    '    Write-Host "  Property: $($resp.property.name)" -ForegroundColor Green',
    '    Write-Host "  Plan    : $($resp.property.plan)" -ForegroundColor Green',
    '} catch {',
    '    Write-Host "  ERROR: Invalid property key or cannot reach server." -ForegroundColor Red',
    '    Read-Host "  Press Enter to exit"',
    '    exit 1',
    '}',
    '',
    'Write-Host ""',
    'Write-Host "  Checking Node.js..." -ForegroundColor Yellow',
    '$node = Get-Command node -ErrorAction SilentlyContinue',
    'if (-not $node) {',
    '    Write-Host "  Installing Node.js 20 LTS..." -ForegroundColor Yellow',
    '    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"',
    '    $msi = "$env:TEMP\\node-install.msi"',
    '    Invoke-WebRequest -Uri $nodeUrl -OutFile $msi -UseBasicParsing',
    '    Start-Process msiexec.exe -Wait -ArgumentList "/i $msi /quiet /norestart"',
    '    $env:PATH += ";C:\\Program Files\\nodejs"',
    '    Write-Host "  Node.js installed." -ForegroundColor Green',
    '} else {',
    '    Write-Host "  Node.js: $(node --version)" -ForegroundColor Green',
    '}',
    '',
    'Write-Host ""',
    'Write-Host "  Downloading agent files..." -ForegroundColor Yellow',
    'New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null',
    'try { Invoke-WebRequest -Uri "$ServerUrl/api/agents/agent.js" -OutFile "$AgentDir\\agent.js" -UseBasicParsing -SkipCertificateCheck } catch { Invoke-WebRequest -Uri "$ServerUrl/api/agents/agent.js" -OutFile "$AgentDir\\agent.js" -UseBasicParsing }',
    'try { Invoke-WebRequest -Uri "$ServerUrl/api/agents/package.json" -OutFile "$AgentDir\\package.json" -UseBasicParsing -SkipCertificateCheck } catch { Invoke-WebRequest -Uri "$ServerUrl/api/agents/package.json" -OutFile "$AgentDir\\package.json" -UseBasicParsing }',
    '',
    'Write-Host "  Writing configuration..." -ForegroundColor Yellow',
    '$config = @{ property_key = $PropertyKey; server_url = $ServerUrl; agent_id = $null; interval_hours = 24 } | ConvertTo-Json',
    'Set-Content -Path "$AgentDir\\config.json" -Value $config',
    '',
    'Write-Host "  Installing dependencies..." -ForegroundColor Yellow',
    'Push-Location $AgentDir',
    '$npmCmd = Get-Command npm -ErrorAction SilentlyContinue',
    'if ($npmCmd) { & npm install --production --silent 2>&1 | Out-Null } else { Write-Host "  WARNING: npm not found" -ForegroundColor Yellow }',
    'Pop-Location',
    '',
    'Write-Host "  Creating Scheduled Task..." -ForegroundColor Yellow',
    '$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source',
    'if (-not $nodePath) { $nodePath = "C:\\Program Files\\nodejs\\node.exe" }',
    '$action = New-ScheduledTaskAction -Execute $nodePath -Argument (\'"\' + $AgentDir + \'\\agent.js"\') -WorkingDirectory $AgentDir',
    '$trigger1 = New-ScheduledTaskTrigger -AtStartup',
    '$trigger2 = New-ScheduledTaskTrigger -Daily -At "03:00AM"',
    '$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)',
    '$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest',
    'Register-ScheduledTask -TaskName "OptimaAgent" -Action $action -Trigger $trigger1,$trigger2 -Settings $settings -Principal $principal -Description "Optima HAM/SAM monitoring agent" -Force | Out-Null',
    '',
    'Write-Host ""',
    'Write-Host "  Running initial inventory scan..." -ForegroundColor Yellow',
    '& $nodePath "$AgentDir\\agent.js" --once',
    '',
    'Write-Host ""',
    'Write-Host "  ============================================" -ForegroundColor Green',
    'Write-Host "    Installation complete!" -ForegroundColor Green',
    'Write-Host "  ============================================" -ForegroundColor Green',
    'Write-Host "  Agent runs daily at 03:00 and on startup." -ForegroundColor Cyan',
    'Write-Host "  Logs: $AgentDir\\agent.log" -ForegroundColor Cyan',
    'Write-Host ""',
  ].join('\r\n');

  // Encode as UTF-16LE Base64 for PowerShell -EncodedCommand
  var encoded = Buffer.from(ps, 'utf16le').toString('base64');

  var lines = [
    '@echo off',
    ':: ============================================================================',
    ':: Optima Agent Installer for Windows (Auto-generated)',
    ':: Right-click > Run as Administrator, or open CMD as Admin and run this file.',
    ':: ============================================================================',
    'NET SESSION >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    echo.',
    '    echo   [ERROR] Please run this file as Administrator.',
    '    echo   Right-click the file and select "Run as administrator".',
    '    echo.',
    '    pause',
    '    exit /b 1',
    ')',
    '',
    'echo.',
    'echo   ====================================================',
    'echo     Optima Agent Installer for Windows',
    'echo   ====================================================',
    'echo.',
    '',
    'powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ' + encoded,
    '',
    'echo.',
    'pause',
  ];
  return lines.join('\r\n') + '\r\n';
}

// ── Linux / macOS bash installer (self-contained, downloads agent from server) ─
function generateUnixScript(propertyKey, serverUrl) {
  return `#!/usr/bin/env bash
set -euo pipefail

# ── Optima Agent Installer (Auto-generated) ───────────────────────────────────
PROPERTY_KEY="${propertyKey}"
SERVER_URL="${serverUrl}"
AGENT_DIR="/opt/optima-agent"
SERVICE_NAME="optima-agent"
CYAN='\\033[0;36m'; GREEN='\\033[0;32m'; YELLOW='\\033[1;33m'; RED='\\033[0;31m'; NC='\\033[0m'

echo -e "\\n\${CYAN}  Optima Agent Installer\${NC}"
echo -e "\${CYAN}  ========================\${NC}\\n"

# Root check
if [[ $EUID -ne 0 ]]; then
  echo -e "\${RED}  Run as root: sudo bash optima-agent-install.sh\${NC}"; exit 1
fi

# Validate key
echo -e "\${YELLOW}  Validating property key...\${NC}"
RESP=$(curl -sf -X POST "$SERVER_URL/api/portal/verify-key" \\
  -H "Content-Type: application/json" \\
  -d '{"property_key":"'"$PROPERTY_KEY"'"}' \\
  --insecure 2>&1) || { echo -e "\${RED}  Cannot reach server: $SERVER_URL\${NC}"; exit 1; }

if echo "$RESP" | grep -q '"valid":true'; then
  PROP_NAME=$(echo "$RESP" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo -e "\${GREEN}  Property: $PROP_NAME\${NC}"
else
  echo -e "\${RED}  Invalid property key\${NC}"; exit 1
fi

# Install Node.js if needed
echo -e "\\n\${YELLOW}  Checking Node.js...\${NC}"
if ! command -v node &>/dev/null; then
  echo -e "  Installing Node.js 20 LTS..."
  if command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  elif command -v yum &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  elif command -v dnf &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    dnf install -y nodejs
  elif [[ "$(uname)" == "Darwin" ]]; then
    if command -v brew &>/dev/null; then brew install node@20
    else
      curl -fsSL https://nodejs.org/dist/v20.11.0/node-v20.11.0.pkg -o /tmp/node.pkg
      installer -pkg /tmp/node.pkg -target /
    fi
  else
    echo -e "\${RED}  Cannot auto-install Node.js. Install manually.\${NC}"; exit 1
  fi
fi
echo -e "\${GREEN}  Node.js: $(node --version)\${NC}"

# Download agent files from server
echo -e "\\n\${YELLOW}  Downloading agent files...\${NC}"
mkdir -p "$AGENT_DIR"
curl -fsSL "$SERVER_URL/api/agents/agent.js"     -o "$AGENT_DIR/agent.js"
curl -fsSL "$SERVER_URL/api/agents/package.json" -o "$AGENT_DIR/package.json"

# Write config
cat > "$AGENT_DIR/config.json" <<EOF
{
  "property_key":   "$PROPERTY_KEY",
  "server_url":     "$SERVER_URL",
  "agent_id":       null,
  "interval_hours": 24
}
EOF

# Install dependencies
echo -e "\${YELLOW}  Installing dependencies...\${NC}"
cd "$AGENT_DIR" && npm install --production --silent

# Service setup
if [[ "$(uname)" == "Darwin" ]]; then
  PLIST="/Library/LaunchDaemons/com.optima.agent.plist"
  cat > "$PLIST" <<PEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.optima.agent</string>
  <key>ProgramArguments</key>  <array><string>$(which node)</string><string>$AGENT_DIR/agent.js</string></array>
  <key>WorkingDirectory</key>  <string>$AGENT_DIR</string>
  <key>RunAtLoad</key>         <true/>
  <key>StartInterval</key>     <integer>86400</integer>
  <key>StandardOutPath</key>   <string>/var/log/optima-agent.log</string>
  <key>StandardErrorPath</key> <string>/var/log/optima-agent.log</string>
  <key>KeepAlive</key>         <false/>
</dict>
</plist>
PEOF
  launchctl load "$PLIST"
  echo -e "\${GREEN}  LaunchDaemon installed\${NC}"
else
  NODE_PATH=$(which node)
  cat > "/etc/systemd/system/$SERVICE_NAME.service" <<SEOF
[Unit]
Description=Optima HAM/SAM Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$NODE_PATH $AGENT_DIR/agent.js
WorkingDirectory=$AGENT_DIR
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=optima-agent

[Install]
WantedBy=multi-user.target
SEOF
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl start "$SERVICE_NAME"
  echo -e "\${GREEN}  Systemd service installed and started\${NC}"
fi

# Run initial scan
echo -e "\\n\${YELLOW}  Running initial inventory scan...\${NC}"
cd "$AGENT_DIR" && node agent.js --once

echo -e "\\n\${GREEN}  Installation complete!\${NC}"
echo -e "   Agent runs every 24h automatically."
if [[ "$(uname)" == "Darwin" ]]; then
  echo -e "   Logs: /var/log/optima-agent.log"
else
  echo -e "   Logs: journalctl -u $SERVICE_NAME -f"
  echo -e "   Status: systemctl status $SERVICE_NAME"
fi
echo ""
`;
}

module.exports = router;
