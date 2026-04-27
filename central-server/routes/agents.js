'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const AGENT_DIR = path.join(__dirname, '../../deploy/agent');
const DIST_DIR = path.join(AGENT_DIR, 'dist');
const CONFIG_MARKER = '---OPTIMA-CONFIG---';

// ── Helper: build a self-extracting shell installer ─────────────────────────
// Works for both Linux and macOS. The script embeds the config and binary.
function buildShellInstaller(binaryPath, propertyKey, serverUrl, platform) {
  const binaryData = fs.readFileSync(binaryPath);
  const binarySize = binaryData.length;

  const script = `#!/bin/bash
# ============================================================================
#  Optima Agent Installer — ${platform === 'linux' ? 'Linux' : 'macOS'}
#  Property key is embedded. Just run: sudo bash ${platform === 'linux' ? 'optima-agent-installer.run' : 'optima-agent-installer.command'}
# ============================================================================
set -e

PROPERTY_KEY="${propertyKey}"
SERVER_URL="${serverUrl}"
BINARY_SIZE=${binarySize}

echo ""
echo "  Optima Agent Installer"
echo "  ======================"
echo ""

# Check root
if [ "$(id -u)" -ne 0 ]; then
  echo "  This installer requires root privileges."
  echo "  Please run: sudo bash $0"
  exit 1
fi

# Extract binary from end of this script
SCRIPT_LINES=$(awk '/^__BINARY_PAYLOAD__$/{print NR; exit}' "$0")
SKIP_BYTES=$(head -n "$SCRIPT_LINES" "$0" | wc -c)
TEMP_DIR=$(mktemp -d)
TEMP_BIN="$TEMP_DIR/optima-agent"

tail -c "$BINARY_SIZE" "$0" > "$TEMP_BIN"
chmod +x "$TEMP_BIN"

echo "  Extracted agent binary."
echo "  Installing with property key..."
echo ""

# Run the agent's built-in install command
"$TEMP_BIN" --install --key="$PROPERTY_KEY" --server="$SERVER_URL"

# Clean up temp files
rm -rf "$TEMP_DIR"

exit 0
__BINARY_PAYLOAD__
`;

  const scriptBuffer = Buffer.from(script, 'utf8');
  return Buffer.concat([scriptBuffer, binaryData]);
}

// ── Serve agent installer per platform ──────────────────────────────────────
// GET /api/agents/:platform/download?key=<property_key>
router.get('/:platform/download', (req, res) => {
  const { platform } = req.params;
  const propertyKey = req.query.key || '';
  const proto = req.get('X-Forwarded-Proto') || req.protocol;
  const serverUrl = `${proto}://${req.get('host')}`;

  // Windows: Inno Setup exe with config appended via marker
  if (platform === 'windows') {
    const filePath = path.join(DIST_DIR, 'optima-agent-setup.exe');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Agent installer not built for Windows.' });
    }

    const binaryData = fs.readFileSync(filePath);
    const configJson = JSON.stringify({
      property_key: propertyKey,
      server_url: serverUrl,
    });
    const payload = Buffer.from(CONFIG_MARKER + configJson);
    const result = Buffer.concat([binaryData, payload]);

    res.setHeader('Content-Type', 'application/x-msdownload');
    res.setHeader('Content-Disposition', 'attachment; filename="optima-agent-setup.exe"');
    res.setHeader('Content-Length', result.length);
    return res.send(result);
  }

  // Linux: self-extracting .run installer
  if (platform === 'linux') {
    const binaryPath = path.join(DIST_DIR, 'optima-agent-linux');
    if (!fs.existsSync(binaryPath)) {
      return res.status(404).json({ error: 'Agent installer not built for Linux.' });
    }

    const installer = buildShellInstaller(binaryPath, propertyKey, serverUrl, 'linux');

    res.setHeader('Content-Type', 'application/x-shellscript');
    res.setHeader('Content-Disposition', 'attachment; filename="optima-agent-installer.run"');
    res.setHeader('Content-Length', installer.length);
    return res.send(installer);
  }

  // macOS: self-extracting .command installer
  if (platform === 'mac') {
    const binaryPath = path.join(DIST_DIR, 'optima-agent-macos');
    if (!fs.existsSync(binaryPath)) {
      return res.status(404).json({ error: 'Agent installer not built for macOS.' });
    }

    const installer = buildShellInstaller(binaryPath, propertyKey, serverUrl, 'macos');

    res.setHeader('Content-Type', 'application/x-shellscript');
    res.setHeader('Content-Disposition', 'attachment; filename="optima-agent-installer.command"');
    res.setHeader('Content-Length', installer.length);
    return res.send(installer);
  }

  return res.status(400).json({ error: 'Unknown platform. Use: windows, linux, mac' });
});

// ── Serve agent.js and package.json (legacy / dev) ──────────────────────────
router.get('/agent.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(AGENT_DIR, 'agent.js'));
});

router.get('/package.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(AGENT_DIR, 'package.json'));
});

module.exports = router;
