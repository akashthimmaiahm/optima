#!/bin/bash
# =============================================================================
# Optima Central Portal — EC2 Bootstrap
# Hosts: optima.sclera.com
# What runs here: central-server (Node.js) + React frontend (static files)
#
# Supports: Ubuntu 22.04/24.04 and Amazon Linux 2023
#
# Usage (once DNS points to this EC2):
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/optima/main/deploy/portal/setup.sh \
#     | sudo DOMAIN=optima.sclera.com JWT_SECRET=<secret> GIT_REPO=<repo> bash
#
# Or via SSH:
#   scp deploy/portal/setup.sh ubuntu@PORTAL_IP:/tmp/
#   ssh ubuntu@PORTAL_IP "sudo DOMAIN=optima.sclera.com bash /tmp/setup.sh"
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DOMAIN="${DOMAIN:-optima.sclera.com}"
GIT_REPO="${GIT_REPO:-https://github.com/YOUR_ORG/optima.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
APP_DIR="/opt/optima-portal"
DATA_DIR="${APP_DIR}/data"
LOG_DIR="${APP_DIR}/logs"
APP_USER="optima"
NODE_VERSION="20"

echo "=================================================================="
echo "  Optima Central Portal Setup"
echo "  Domain  : ${DOMAIN}"
echo "  App dir : ${APP_DIR}"
echo "=================================================================="

# ── Detect OS ─────────────────────────────────────────────────────────────────
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID="${ID}"
else
    echo "Cannot detect OS"; exit 1
fi

is_ubuntu() { [[ "${OS_ID}" == "ubuntu" ]]; }
is_amzn()   { [[ "${OS_ID}" == "amzn" ]]; }

# ── 1. System update & packages ──────────────────────────────────────────────
echo "[1/9] Installing system packages..."
if is_ubuntu; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get upgrade -y -qq
    apt-get install -y -qq git curl wget nginx certbot python3-certbot-nginx \
        build-essential python3 htop ufw fail2ban
elif is_amzn; then
    dnf update -y -q
    dnf install -y git curl wget nginx htop firewalld
    dnf install -y augeas-libs
    # Certbot via pip on Amazon Linux
    pip3 install certbot certbot-nginx --quiet
    systemctl enable --now firewalld
fi

# ── 2. Node.js ────────────────────────────────────────────────────────────────
echo "[2/9] Installing Node.js ${NODE_VERSION}..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
    if is_ubuntu; then
        curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
        apt-get install -y nodejs
    elif is_amzn; then
        curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
        dnf install -y nodejs
    fi
fi
echo "  Node: $(node -v)  npm: $(npm -v)"

# ── 3. PM2 ────────────────────────────────────────────────────────────────────
echo "[3/9] Installing PM2..."
npm install -g pm2 --silent

# ── 4. App user & directories ─────────────────────────────────────────────────
echo "[4/9] Creating app user and directories..."
id "${APP_USER}" &>/dev/null || useradd -r -m -s /bin/bash "${APP_USER}"
mkdir -p "${APP_DIR}" "${DATA_DIR}" "${LOG_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

# ── 5. Clone / pull code ──────────────────────────────────────────────────────
echo "[5/9] Deploying code..."
if [ -d "${APP_DIR}/.git" ]; then
    cd "${APP_DIR}" && sudo -u "${APP_USER}" git pull origin "${GIT_BRANCH}"
else
    sudo -u "${APP_USER}" git clone --branch "${GIT_BRANCH}" "${GIT_REPO}" "${APP_DIR}"
fi

# ── 6. Install dependencies & build frontend ──────────────────────────────────
echo "[6/9] Installing dependencies & building frontend..."

# Central server deps
cd "${APP_DIR}/central-server"
sudo -u "${APP_USER}" npm ci --omit=dev

# Frontend build
cd "${APP_DIR}/frontend"
sudo -u "${APP_USER}" npm ci
sudo -u "${APP_USER}" npm run build
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}/frontend/dist"

# ── 7. Write .env ─────────────────────────────────────────────────────────────
echo "[7/9] Writing environment config..."
cat > "${APP_DIR}/central-server/.env" <<EOF
PORT=3000
NODE_ENV=production
DB_PATH=${DATA_DIR}/portal.db
JWT_SECRET=${JWT_SECRET}
ALLOWED_ORIGIN=https://${DOMAIN}
FRONTEND_DIST=${APP_DIR}/frontend/dist
EOF
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/central-server/.env"
chmod 600 "${APP_DIR}/central-server/.env"

# ── 8. PM2 config ─────────────────────────────────────────────────────────────
echo "[8/9] Setting up PM2..."
cat > "${APP_DIR}/ecosystem.config.js" <<'PMEOF'
module.exports = {
  apps: [{
    name:               'optima-portal',
    script:             'server.js',
    cwd:                '/opt/optima-portal/central-server',
    env_file:           '/opt/optima-portal/central-server/.env',
    instances:          1,
    exec_mode:          'fork',
    autorestart:        true,
    max_restarts:       10,
    restart_delay:      2000,
    max_memory_restart: '512M',
    kill_timeout:       5000,
    wait_ready:         true,
    listen_timeout:     8000,
    error_file:         '/opt/optima-portal/logs/error.log',
    out_file:           '/opt/optima-portal/logs/out.log',
    log_date_format:    'YYYY-MM-DD HH:mm:ss',
    merge_logs:         true,
    node_args:          '--max-old-space-size=384',
    env: { NODE_ENV: 'production' },
  }],
};
PMEOF
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/ecosystem.config.js"

sudo -u "${APP_USER}" pm2 start "${APP_DIR}/ecosystem.config.js"
sudo -u "${APP_USER}" pm2 save
pm2 startup systemd -u "${APP_USER}" --hp "/home/${APP_USER}" | tail -1 | bash

# ── 9. Nginx + SSL ────────────────────────────────────────────────────────────
echo "[9/9] Configuring Nginx and SSL..."

# Temp HTTP-only config so certbot can verify
cat > /etc/nginx/sites-available/optima-portal <<NGXEOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
NGXEOF

if is_ubuntu; then
    ln -sf /etc/nginx/sites-available/optima-portal /etc/nginx/sites-enabled/optima-portal
    rm -f /etc/nginx/sites-enabled/default
elif is_amzn; then
    cp /etc/nginx/sites-available/optima-portal /etc/nginx/conf.d/optima-portal.conf
fi

systemctl enable --now nginx
nginx -t && systemctl reload nginx

# Obtain SSL cert
certbot certonly --nginx -d "${DOMAIN}" \
    --non-interactive --agree-tos \
    --email "admin@sclera.com" \
    --no-eff-email

# Full HTTPS config
cat > /etc/nginx/sites-available/optima-portal <<NGXEOF
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    # SSL — managed by Certbot
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
    gzip_min_length 1024;

    # All traffic → central-server Node.js (port 3000)
    # Node handles: auth, portal API, proxy to property EC2s, and serves static frontend
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        'upgrade';
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
NGXEOF

if is_amzn; then
    cp /etc/nginx/sites-available/optima-portal /etc/nginx/conf.d/optima-portal.conf
fi

nginx -t && systemctl reload nginx

# Auto-renew SSL
if is_ubuntu; then
    echo "0 12 * * * root certbot renew --quiet --post-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
elif is_amzn; then
    echo "0 12 * * * root certbot renew --quiet --post-hook 'systemctl reload nginx'" >> /var/spool/cron/root
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
if is_ubuntu; then
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 'Nginx Full'
    ufw --force enable
elif is_amzn; then
    firewall-cmd --permanent --add-service=ssh
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
fi

echo ""
echo "=================================================================="
echo "  ✅  Portal setup complete!"
echo "  URL     : https://${DOMAIN}"
echo "  Health  : https://${DOMAIN}/api/health"
echo "  Logs    : pm2 logs optima-portal"
echo "  Reload  : pm2 reload optima-portal"
echo "=================================================================="
