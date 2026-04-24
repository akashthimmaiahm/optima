#!/bin/bash
# =============================================================================
# Optima Property Backend — Zero-downtime update
# Run on the property EC2 after pushing new code to git.
# =============================================================================
set -euo pipefail

APP_DIR="/opt/optima-property"
APP_USER="optima"
GIT_BRANCH="${GIT_BRANCH:-main}"

echo "▶  Pulling latest backend code..."
cd "${APP_DIR}"
sudo -u "${APP_USER}" git pull origin "${GIT_BRANCH}"

echo "▶  Installing/updating dependencies..."
cd "${APP_DIR}/backend"
sudo -u "${APP_USER}" npm ci --omit=dev

echo "▶  Reloading app (zero-downtime)..."
sudo -u "${APP_USER}" pm2 reload "${APP_DIR}/ecosystem.config.js"

echo "✅  Update complete. Status:"
sudo -u "${APP_USER}" pm2 status
