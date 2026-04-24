# Optima AWS Deployment Guide

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  User browser  →  https://optima.sclera.com             │
└─────────────────────────────┬───────────────────────────┘
                              │
              ┌───────────────▼───────────────┐
              │     CENTRAL PORTAL EC2         │
              │     optima.sclera.com          │
              │                               │
              │  central-server/ (Node.js)    │
              │  + frontend/dist/ (React SPA)  │
              │  + portal.db (SQLite)          │
              │  + Nginx + SSL (Let's Encrypt)  │
              └───────────────┬───────────────┘
                              │  JWT proxy
              ┌───────────────┴───────────────┐
              │                               │
   ┌──────────▼──────────┐   ┌───────────────▼──────────┐
   │  PROPERTY EC2 #1    │   │  PROPERTY EC2 #2           │
   │  hq.optima.sclera   │   │  acme.optima.sclera.com    │
   │                     │   │                            │
   │  backend/ (Node.js) │   │  backend/ (Node.js)        │
   │  + optima.db        │   │  + optima.db               │
   │  + EBS volume       │   │  + EBS volume              │
   │  + Nginx + SSL      │   │  + Nginx + SSL             │
   └─────────────────────┘   └────────────────────────────┘
```

## Key points

- **Frontend is served ONLY from the Central Portal** (`optima.sclera.com`)
- **Property EC2s are API-only** — they run the backend Node.js server, no static files
- All properties share the same JWT secret — the portal issues tokens valid on all properties
- Each property has its own isolated SQLite database on an EBS volume

---

## Central Portal Setup

### 1. Launch EC2
- OS: **Ubuntu 22.04 LTS** or **Amazon Linux 2023**
- Type: `t3.small` (1 vCPU, 2 GB RAM)
- Storage: 20 GB root volume
- Security group: ports 22, 80, 443

### 2. Point DNS
Create an A record: `optima.sclera.com → <PORTAL_EC2_PUBLIC_IP>`

### 3. Run setup
```bash
scp deploy/portal/setup.sh ubuntu@<PORTAL_IP>:/tmp/
ssh ubuntu@<PORTAL_IP> "sudo \
  DOMAIN=optima.sclera.com \
  JWT_SECRET=<64-char-hex-secret> \
  GIT_REPO=https://github.com/YOUR_ORG/optima.git \
  bash /tmp/setup.sh"
```

### What setup.sh does
1. Installs Node.js 20, Nginx, PM2, Certbot
2. Creates `optima` system user
3. Clones repo into `/opt/optima-portal/`
4. Installs `central-server/` deps and builds `frontend/`
5. Writes `/opt/optima-portal/central-server/.env`
6. Starts `optima-portal` process via PM2
7. Configures Nginx with HTTPS redirect and SSL cert for `optima.sclera.com`
8. Enables firewall (ports 22, 80, 443)

---

## Property Backend Setup

Repeat for each property (HQ, Acme Corp, etc.)

### 1. Launch EC2
- OS: **Ubuntu 22.04 LTS** or **Amazon Linux 2023**
- Type: `t3.small` minimum (`t3.medium` for 10K+ assets)
- Root: 20 GB; attach separate **EBS volume** (50-200 GB) for database
- Security group: ports 22, 80, 443

### 2. Point DNS
Create an A record: `hq.optima.sclera.com → <PROPERTY_EC2_PUBLIC_IP>`

### 3. Run setup
```bash
scp deploy/property/setup.sh ubuntu@<PROPERTY_IP>:/tmp/
ssh ubuntu@<PROPERTY_IP> "sudo \
  PROPERTY_ID=1 \
  PROPERTY_SLUG=headquarters \
  PROPERTY_DOMAIN=hq.optima.sclera.com \
  JWT_SECRET=<SAME-SECRET-AS-PORTAL> \
  GIT_REPO=https://github.com/YOUR_ORG/optima.git \
  bash /tmp/setup.sh"
```

### What setup.sh does
1. Installs Node.js 20, Nginx, PM2, Certbot
2. Creates `optima` system user
3. Mounts EBS volume at `/opt/optima-property/data/`
4. Clones repo (sparse - backend only) into `/opt/optima-property/`
5. Installs `backend/` deps
6. Writes `/opt/optima-property/backend/.env`
7. Starts `optima-<slug>` process via PM2
8. Configures Nginx (API-only, no static files) with HTTPS redirect + SSL
9. Enables firewall

### 4. Register in portal
After the property EC2 is running, add it to the central portal:
```
Login: https://optima.sclera.com
→ Property List → Add Property
→ Server URL: http://<PROPERTY_PRIVATE_IP>:5000   (use private IP, not public)
```

---

## Updating Code

### Update portal
```bash
ssh ubuntu@<PORTAL_IP> "bash /opt/optima-portal/deploy/portal/update.sh"
```

### Update a property backend
```bash
ssh ubuntu@<PROPERTY_IP> "bash /opt/optima-property/deploy/property/update.sh"
```

---

## File Structure After Deployment

```
Central Portal EC2 (/opt/optima-portal/)
├── central-server/       <- Node.js portal app
│   ├── server.js
│   ├── routes/
│   ├── database/
│   └── .env              <- JWT_SECRET, DB_PATH, FRONTEND_DIST
├── frontend/
│   └── dist/             <- Built React SPA (served as static files)
├── data/
│   └── portal.db         <- Users, properties registry
├── logs/
└── ecosystem.config.js   <- PM2 config

Property EC2 (/opt/optima-property/)
├── backend/              <- Node.js property API
│   ├── property-server.js
│   ├── routes/
│   ├── database/
│   └── .env              <- PROPERTY_ID, PROPERTY_SLUG, JWT_SECRET
├── data/                 <- EBS mount point
│   └── optima.db         <- Property SQLite database
├── logs/
└── ecosystem.config.js   <- PM2 config
```

---

## Environment Variables

### Central Portal (.env)
| Variable | Example | Notes |
|---|---|---|
| `PORT` | `3000` | Node.js listen port |
| `NODE_ENV` | `production` | |
| `DB_PATH` | `/opt/optima-portal/data/portal.db` | |
| `JWT_SECRET` | `<64-char hex>` | Must match all property servers |
| `ALLOWED_ORIGIN` | `https://optima.sclera.com` | CORS |
| `FRONTEND_DIST` | `/opt/optima-portal/frontend/dist` | React build path |

### Property Backend (.env)
| Variable | Example | Notes |
|---|---|---|
| `PROPERTY_ID` | `1` | Integer, unique per property |
| `PROPERTY_SLUG` | `headquarters` | Lowercase, hyphens only |
| `PORT` | `5000` | Internal only, Nginx proxies 443 to 5000 |
| `NODE_ENV` | `production` | |
| `DB_PATH` | `/opt/optima-property/data/optima.db` | On EBS |
| `JWT_SECRET` | `<same as portal>` | Shared secret |
| `ALLOWED_ORIGIN` | `https://optima.sclera.com` | Portal origin |

---

## SSL Certificates

Both setup scripts use **Let's Encrypt via Certbot** with auto-renewal.

- Portal cert: `optima.sclera.com`
- Property certs: `{slug}.optima.sclera.com` (one per property)

Certbot auto-renews every 12 hours via cron. Nginx reloads automatically after renewal.

Manual renewal (if needed):
```bash
sudo certbot renew
sudo systemctl reload nginx
```
