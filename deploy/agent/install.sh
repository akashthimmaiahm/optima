#!/usr/bin/env bash
set -euo pipefail

# ── Optima Agent Installer — Linux / macOS ────────────────────────────────────
AGENT_DIR="/opt/optima-agent"
SERVICE_NAME="optima-agent"
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "\n${CYAN}  Optima Agent Installer${NC}"
echo -e "${CYAN}  ========================${NC}\n"

# Root check
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}  Run as root: sudo bash install.sh${NC}"; exit 1
fi

# Prompt
read -p "  Enter PROPERTY KEY (from Optima portal): " PROPERTY_KEY
read -p "  Enter SERVER URL [https://optima.sclera.com]: " SERVER_URL
SERVER_URL="${SERVER_URL:-https://optima.sclera.com}"

# Validate key
echo -e "\n${YELLOW}  Validating property key...${NC}"
RESP=$(curl -sf -X POST "${SERVER_URL}/api/portal/verify-key" \
  -H "Content-Type: application/json" \
  -d "{\"property_key\":\"${PROPERTY_KEY}\"}" \
  --insecure 2>&1) || { echo -e "${RED}  Cannot reach server: $SERVER_URL${NC}"; exit 1; }

if echo "$RESP" | grep -q '"valid":true'; then
  PROP_NAME=$(echo "$RESP" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo -e "${GREEN}  Property: $PROP_NAME${NC}"
else
  echo -e "${RED}  Invalid property key${NC}"; exit 1
fi

# Install Node.js if needed
echo -e "\n${YELLOW}  Checking Node.js...${NC}"
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
    echo -e "${RED}  Cannot auto-install Node.js on this OS. Install manually.${NC}"; exit 1
  fi
fi
echo -e "${GREEN}  Node.js: $(node --version)${NC}"

# Install agent
echo -e "\n${YELLOW}  Installing to $AGENT_DIR...${NC}"
mkdir -p "$AGENT_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/agent.js"     "$AGENT_DIR/"
cp "$SCRIPT_DIR/package.json" "$AGENT_DIR/"

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
echo -e "${YELLOW}  Installing dependencies...${NC}"
cd "$AGENT_DIR" && npm install --production --silent

# ── Service setup ─────────────────────────────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  # macOS LaunchAgent
  PLIST="/Library/LaunchDaemons/com.optima.agent.plist"
  cat > "$PLIST" <<EOF
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
EOF
  launchctl load "$PLIST"
  echo -e "${GREEN}  LaunchDaemon installed${NC}"

else
  # Linux systemd
  NODE_PATH=$(which node)
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Optima HAM/SAM Monitoring Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${NODE_PATH} ${AGENT_DIR}/agent.js
WorkingDirectory=${AGENT_DIR}
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=optima-agent

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  echo -e "${GREEN}  Systemd service installed${NC}"
fi

# Run initial scan
echo -e "\n${YELLOW}  Running initial inventory scan...${NC}"
cd "$AGENT_DIR" && node agent.js --once

# Start service
if [[ "$(uname)" != "Darwin" ]]; then
  systemctl start "$SERVICE_NAME"
fi

echo -e "\n${GREEN}  ✅ Installation complete!${NC}"
echo -e "   Agent runs every 24h automatically."
if [[ "$(uname)" == "Darwin" ]]; then
  echo -e "   Logs: /var/log/optima-agent.log"
  echo -e "   Stop: sudo launchctl unload $PLIST"
else
  echo -e "   Logs: journalctl -u $SERVICE_NAME -f"
  echo -e "   Status: systemctl status $SERVICE_NAME"
fi
echo ""
