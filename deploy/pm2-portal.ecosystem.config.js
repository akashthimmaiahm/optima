/**
 * PM2 config for the Central Portal server (optima.sclera.com)
 * Placed at: /opt/optima-portal/ecosystem.config.js
 */
module.exports = {
  apps: [{
    name:       'optima-portal',
    script:     '/opt/optima-portal/optima/central-server/server.js',
    cwd:        '/opt/optima-portal/optima/central-server',
    env_file:   '/opt/optima-portal/.env',
    instances:  1,
    exec_mode:  'fork',
    autorestart: true,
    max_memory_restart: '512M',
    error_file: '/opt/optima-portal/logs/error.log',
    out_file:   '/opt/optima-portal/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    env: { NODE_ENV: 'production' },
  }],
};
