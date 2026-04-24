#!/bin/bash
# =============================================================================
# Optima Central Portal — Zero-downtime update
# Run on the portal EC2 after pushing new code to git.
# =============================================================================
set -euo pipefail

APP_DIR="/opt/optima-portal"
APP_USER="optima"
GIT_BRANCH="${GIT_BRANCH:-main}"

echo "▶  Pulling latest code..."
cd "${APP_DIR}"
sudo -u "${APP_USER}" git pull origin "${GIT_BRANCH}"

echo "▶  Installing server dependencies..."
cd "${APP_DIR}/central-server"
sudo -u "${APP_USER}" npm ci --omit=dev

echo "▶  Rebuilding frontend..."
cd "${APP_DIR}/frontend"
sudo -u "${APP_USER}" npm ci
sudo -u "${APP_USER}" npm run build
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}/frontend/dist"

echo "▶  Reloading portal (zero-downtime)..."
sudo -u "${APP_USER}" pm2 reload "${APP_DIR}/ecosystem.config.js"

echo "✅  Portal update complete. Status:"
sudo -u "${APP_USER}" pm2 status
