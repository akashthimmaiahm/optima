#!/bin/bash
# ============================================================================
#  Optima Property Server — Linux Installer
#  Installs Node.js, dependencies, and the property server.
#  Prompts for property key, verifies with central server, starts as service.
# ============================================================================
set -e

INSTALL_DIR="/opt/optima-property"
SERVICE_NAME="optima-property"
NODE_MAJOR=18
PAYLOAD_SIZE=__PAYLOAD_SIZE__

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   Optima Property Server — Installer       ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Must be root
if [ "$(id -u)" -ne 0 ]; then
  echo "  This installer requires root privileges."
  echo "  Please run: sudo bash $0"
  exit 1
fi

# ── Step 1: Install Node.js if not present ──────────────────────────────────
echo "  [1/5] Checking Node.js..."
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  echo "  Node.js $NODE_VER is already installed."
else
  echo "  Installing Node.js $NODE_MAJOR.x..."
  if command -v apt-get &>/dev/null; then
    # Debian/Ubuntu
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates gnupg
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs
  elif command -v yum &>/dev/null; then
    # RHEL/CentOS/Amazon Linux
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_MAJOR}.x | bash -
    yum install -y nodejs
  elif command -v dnf &>/dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_MAJOR}.x | bash -
    dnf install -y nodejs
  else
    echo "  ERROR: Could not detect package manager. Install Node.js $NODE_MAJOR manually."
    exit 1
  fi
  echo "  Node.js $(node -v) installed."
fi

# ── Step 2: Extract payload ─────────────────────────────────────────────────
echo "  [2/5] Extracting property server..."
TEMP_DIR=$(mktemp -d)
tail -c "$PAYLOAD_SIZE" "$0" > "$TEMP_DIR/payload.tar.gz"

# Create install directory
mkdir -p "$INSTALL_DIR"

# Extract (backend/ is the top-level dir in the archive)
tar -xzf "$TEMP_DIR/payload.tar.gz" -C "$INSTALL_DIR" --strip-components=0
rm -rf "$TEMP_DIR"

echo "  Extracted to $INSTALL_DIR/backend/"

# ── Step 3: Prompt for property key ─────────────────────────────────────────
echo ""
echo "  [3/5] Property Key Setup"
echo ""
echo "  Get your property key from the Optima portal:"
echo "  https://optima.sclera.com → Properties → Your Property → Key"
echo ""

if [ -f "$INSTALL_DIR/backend/.env" ] && grep -q "PROPERTY_KEY=" "$INSTALL_DIR/backend/.env"; then
  EXISTING_KEY=$(grep "PROPERTY_KEY=" "$INSTALL_DIR/backend/.env" | cut -d= -f2)
  echo "  Existing key found: ${EXISTING_KEY:0:8}..."
  read -p "  Keep existing key? (Y/n): " KEEP_KEY
  if [ "$KEEP_KEY" = "n" ] || [ "$KEEP_KEY" = "N" ]; then
    read -p "  Enter new property key: " PROPERTY_KEY
  else
    PROPERTY_KEY="$EXISTING_KEY"
  fi
else
  read -p "  Enter property key: " PROPERTY_KEY
fi

if [ -z "$PROPERTY_KEY" ]; then
  echo "  ERROR: Property key cannot be empty."
  exit 1
fi

# ── Step 4: Verify key with central server ──────────────────────────────────
echo ""
echo "  [4/5] Verifying property key..."

VERIFY_RESULT=$(curl -s -X POST https://optima.sclera.com/api/portal/verify-key \
  -H "Content-Type: application/json" \
  -d "{\"property_key\": \"$PROPERTY_KEY\"}" 2>/dev/null || echo '{"error":"connection failed"}')

if echo "$VERIFY_RESULT" | grep -q '"valid":true'; then
  PROP_NAME=$(echo "$VERIFY_RESULT" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
  PROP_SLUG=$(echo "$VERIFY_RESULT" | grep -o '"slug":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "  ✅ Verified: $PROP_NAME ($PROP_SLUG)"
else
  echo "  ❌ Key verification failed. The server may start in offline mode."
  echo "  You can re-enter the key later by editing: $INSTALL_DIR/backend/.env"
fi

# Write .env
cat > "$INSTALL_DIR/backend/.env" <<ENVEOF
PROPERTY_KEY=$PROPERTY_KEY
CENTRAL_SERVER_URL=https://optima.sclera.com
PORT=5000
ENVEOF

echo "  Configuration saved."

# ── Step 5: Install systemd service ─────────────────────────────────────────
echo ""
echo "  [5/5] Installing system service..."

cat > /etc/systemd/system/${SERVICE_NAME}.service <<SVCEOF
[Unit]
Description=Optima Property Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=$(which node) $INSTALL_DIR/backend/property-server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME
systemctl restart $SERVICE_NAME

echo ""
echo "  ============================================"
echo "    Installation Complete!"
echo "  ============================================"
echo "  Install dir : $INSTALL_DIR/backend/"
echo "  Service     : $SERVICE_NAME (systemd)"
echo "  Port        : 5000"
echo "  Logs        : journalctl -u $SERVICE_NAME -f"
echo ""
echo "  The property server is now running."
echo ""

exit 0
__BINARY_PAYLOAD__
