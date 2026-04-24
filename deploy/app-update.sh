#!/bin/bash
# ============================================================================
# Optima App Update Script
# Run this on an EXISTING EC2 instance to deploy code updates.
# Zero-downtime: PM2 reload keeps accepting requests during restart.
#
# Usage (on the EC2 itself):
#   bash /opt/optima/optima/deploy/app-update.sh
#
# Or remotely from your laptop:
#   ssh ubuntu@EC2_IP "bash /opt/optima/optima/deploy/app-update.sh"
# ============================================================================

set -euo pipefail

APP_DIR="/opt/optima"
GIT_BRANCH="${GIT_BRANCH:-main}"

echo "🔄 Updating Optima..."

# ── Pull latest code ─────────────────────────────────────────────────────────
echo "[1/4] Pulling latest code..."
cd "${APP_DIR}"
git pull origin "${GIT_BRANCH}"

# ── Backend dependencies ─────────────────────────────────────────────────────
echo "[2/4] Installing backend dependencies..."
cd "${APP_DIR}/optima/backend"
npm ci --omit=dev

# ── Rebuild frontend ─────────────────────────────────────────────────────────
echo "[3/4] Building frontend..."
cd "${APP_DIR}/optima/frontend"
npm ci
npm run build

# ── Reload backend (zero-downtime via PM2) ────────────────────────────────────
echo "[4/4] Reloading backend (zero-downtime)..."
cd "${APP_DIR}"
pm2 reload ecosystem.config.js --update-env

# Test health endpoint
sleep 2
SLUG=$(grep PROPERTY_SLUG "${APP_DIR}/.env" | cut -d= -f2)
if curl -sf http://localhost:5000/api/health > /dev/null; then
    echo ""
    echo "✅  Update complete! Backend is healthy."
    echo "    pm2 status   → view process"
    echo "    pm2 logs optima-${SLUG}  → tail logs"
else
    echo "⚠️  Health check failed — check: pm2 logs"
    exit 1
fi
