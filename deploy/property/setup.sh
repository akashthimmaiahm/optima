#!/bin/bash
# =============================================================================
# Optima Property Backend — EC2 Bootstrap
# One instance per property (e.g. hq.optima.sclera.com, acme.optima.sclera.com)
# What runs here: backend/property-server.js (Node.js API only — NO frontend)
# The frontend is served by the Central Portal at optima.sclera.com
#
# Supports: Ubuntu 22.04/24.04 and Amazon Linux 2023
#
# Usage:
#   sudo PROPERTY_ID=1 PROPERTY_SLUG=headquarters \
#        PROPERTY_DOMAIN=hq.optima.sclera.com \
#        JWT_SECRET=<shared_secret> GIT_REPO=<repo> \
#        bash setup.sh
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
PROPERTY_ID="${PROPERTY_ID:-1}"
PROPERTY_SLUG="${PROPERTY_SLUG:-headquarters}"
PROPERTY_DOMAIN="${PROPERTY_DOMAIN:-hq.optima.sclera.com}"
GIT_REPO="${GIT_REPO:-https://github.com/YOUR_ORG/optima.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
# IMPORTANT: Must be the SAME JWT_SECRET used on the central portal!

APP_DIR="/opt/optima-property"
DATA_DIR="${APP_DIR}/data"
LOG_DIR="${APP_DIR}/logs"
APP_PORT="5000"
APP_USER="optima"
NODE_VERSION="20"

echo "=================================================================="
echo "  Optima Property Backend Setup"
echo "  Property : ${PROPERTY_SLUG} (id=${PROPERTY_ID})"
echo "  Domain   : ${PROPERTY_DOMAIN}"
echo "  App dir  : ${APP_DIR}"
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

# ── 1. System packages ────────────────────────────────────────────────────────
echo "[1/8] Installing system packages..."
if is_ubuntu; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get upgrade -y -qq
    apt-get install -y -qq git curl wget nginx certbot python3-certbot-nginx \
        build-essential python3 htop ufw fail2ban
elif is_amzn; then
    dnf update -y -q
    dnf install -y git curl wget nginx htop firewalld
    pip3 install certbot certbot-nginx --quiet
    systemctl enable --now firewalld
fi

# ── 2. Node.js ────────────────────────────────────────────────────────────────
echo "[2/8] Installing Node.js ${NODE_VERSION}..."
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
echo "[3/8] Installing PM2..."
npm install -g pm2 --silent

# ── 4. App user & directories ─────────────────────────────────────────────────
echo "[4/8] Creating app user and directories..."
id "${APP_USER}" &>/dev/null || useradd -r -m -s /bin/bash "${APP_USER}"
mkdir -p "${APP_DIR}" "${DATA_DIR}" "${LOG_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

# ── 5. EBS data volume ────────────────────────────────────────────────────────
echo "[5/8] Configuring EBS data volume..."
EBS_DEVICE="/dev/xvdb"
if [ -b "${EBS_DEVICE}" ]; then
    if ! blkid "${EBS_DEVICE}" &>/dev/null; then
        echo "  Formatting ${EBS_DEVICE} as ext4..."
        mkfs -t ext4 "${EBS_DEVICE}"
    fi
    if ! grep -q "${EBS_DEVICE}" /etc/fstab; then
        echo "${EBS_DEVICE}  ${DATA_DIR}  ext4  defaults,nofail  0  2" >> /etc/fstab
    fi
    mount -a
    echo "  EBS mounted at ${DATA_DIR}"
else
    echo "  No EBS at ${EBS_DEVICE} — using root volume (OK for dev/test)"
fi
chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}"

# ── 6. Clone / pull backend code only ────────────────────────────────────────
echo "[6/8] Deploying backend code..."
if [ -d "${APP_DIR}/.git" ]; then
    cd "${APP_DIR}" && sudo -u "${APP_USER}" git pull origin "${GIT_BRANCH}"
else
    # Sparse checkout — only backend folder (saves space, faster clone)
    sudo -u "${APP_USER}" git clone \
        --no-checkout --filter=blob:none \
        --branch "${GIT_BRANCH}" "${GIT_REPO}" "${APP_DIR}"
    cd "${APP_DIR}"
    sudo -u "${APP_USER}" git sparse-checkout init --cone
    sudo -u "${APP_USER}" git sparse-checkout set backend
    sudo -u "${APP_USER}" git checkout "${GIT_BRANCH}"
fi

# Install backend dependencies
cd "${APP_DIR}/backend"
sudo -u "${APP_USER}" npm ci --omit=dev

# ── 7. Write .env ─────────────────────────────────────────────────────────────
echo "[7/8] Writing environment config..."
cat > "${APP_DIR}/backend/.env" <<EOF
PROPERTY_ID=${PROPERTY_ID}
PROPERTY_SLUG=${PROPERTY_SLUG}
PORT=${APP_PORT}
NODE_ENV=production
DB_PATH=${DATA_DIR}/optima.db
JWT_SECRET=${JWT_SECRET}
ALLOWED_ORIGIN=https://optima.sclera.com
EOF
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/backend/.env"
chmod 600 "${APP_DIR}/backend/.env"

# ── 8. PM2 + Nginx + SSL ──────────────────────────────────────────────────────
echo "[8/8] Setting up PM2, Nginx, and SSL..."

# PM2 ecosystem
cat > "${APP_DIR}/ecosystem.config.js" <<PMEOF
module.exports = {
  apps: [{
    name:               'optima-${PROPERTY_SLUG}',
    script:             'property-server.js',
    cwd:                '${APP_DIR}/backend',
    env_file:           '${APP_DIR}/backend/.env',
    instances:          1,
    exec_mode:          'fork',
    autorestart:        true,
    max_restarts:       10,
    restart_delay:      2000,
    max_memory_restart: '512M',
    kill_timeout:       5000,
    wait_ready:         true,
    listen_timeout:     8000,
    error_file:         '${LOG_DIR}/error.log',
    out_file:           '${LOG_DIR}/out.log',
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

# Nginx — API-only reverse proxy (no static files, property serves backend only)
cat > /etc/nginx/sites-available/optima-property <<NGXEOF
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name ${PROPERTY_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${PROPERTY_DOMAIN};

    # SSL — managed by Certbot
    ssl_certificate     /etc/letsencrypt/live/${PROPERTY_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${PROPERTY_DOMAIN}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    # Gzip
    gzip on;
    gzip_types application/json;

    # ── Backend API ────────────────────────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 180s;   # allow LLM queries up to 3 min
        proxy_send_timeout 180s;
    }

    # Health check (no auth)
    location = /health {
        proxy_pass http://127.0.0.1:${APP_PORT}/api/health;
    }

    # Block all other paths — this EC2 is API-only
    location / {
        return 404 '{"error":"This is an API-only endpoint"}';
        add_header Content-Type application/json;
    }
}
NGXEOF

if is_ubuntu; then
    ln -sf /etc/nginx/sites-available/optima-property /etc/nginx/sites-enabled/optima-property
    rm -f /etc/nginx/sites-enabled/default
elif is_amzn; then
    cp /etc/nginx/sites-available/optima-property /etc/nginx/conf.d/optima-property.conf
fi

systemctl enable --now nginx
nginx -t && systemctl reload nginx

# SSL certificate
certbot certonly --nginx -d "${PROPERTY_DOMAIN}" \
    --non-interactive --agree-tos \
    --email "admin@sclera.com" \
    --no-eff-email

nginx -t && systemctl reload nginx

# Auto-renew
if is_ubuntu; then
    echo "0 12 * * * root certbot renew --quiet --post-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew
elif is_amzn; then
    echo "0 12 * * * root certbot renew --quiet --post-hook 'systemctl reload nginx'" >> /var/spool/cron/root
fi

# Firewall — only ports 22, 80, 443 open
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
echo "  ✅  Property backend setup complete!"
echo "  API    : https://${PROPERTY_DOMAIN}/api/health"
echo "  Logs   : pm2 logs optima-${PROPERTY_SLUG}"
echo "  Reload : pm2 reload optima-${PROPERTY_SLUG}"
echo ""
echo "  ⚠️  Register this EC2 in the central portal:"
echo "  EC2 URL: http://$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4):${APP_PORT}"
echo "=================================================================="
