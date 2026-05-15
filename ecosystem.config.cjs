/**
 * PM2 — graceful shutdown relies on SIGTERM → server.close → Socket.IO close (see server.js).
 * Restart: pm2 reload pts-api   (zero-downtime friendly with instances > 1; fork mode uses restart).
 */
module.exports = {
  apps: [
    {
      name: "pts-api",
      script: "./server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 10_000,
      listen_timeout: 10_000,
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
