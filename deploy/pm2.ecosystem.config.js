/**
 * PM2 Ecosystem Config — placed at /opt/optima/ecosystem.config.js on the EC2.
 * Reads property config from /opt/optima/.env
 *
 * Commands:
 *   pm2 start ecosystem.config.js
 *   pm2 reload ecosystem.config.js   ← zero-downtime reload
 *   pm2 save                          ← persist across reboots
 *   pm2 startup                       ← generate systemd unit
 *   pm2 logs optima                   ← tail logs
 *   pm2 monit                         ← live metrics
 */

require('dotenv').config({ path: '/opt/optima/.env' });

module.exports = {
  apps: [
    {
      name:          `optima-${process.env.PROPERTY_SLUG || 'app'}`,
      script:        '/opt/optima/backend/property-server.js',
      cwd:           '/opt/optima/backend',

      // Load .env from /opt/optima
      env_file:      '/opt/optima/.env',

      instances:     1,          // 1 per EC2 (SQLite doesn't support multi-process writes)
      exec_mode:     'fork',

      // Auto-restart on crash
      autorestart:   true,
      max_restarts:  10,
      restart_delay: 2000,

      // Memory guard — restart if it leaks past 512 MB
      max_memory_restart: '512M',

      // Graceful shutdown — let in-flight requests finish
      kill_timeout:  5000,
      wait_ready:    true,
      listen_timeout: 8000,

      // Logs
      error_file:  '/opt/optima/logs/error.log',
      out_file:    '/opt/optima/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:  true,

      // Node.js flags
      node_args: '--max-old-space-size=384',

      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
