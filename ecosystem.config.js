// ecosystem.config.js
module.exports = {
  apps: [
    // Production app (uses production block in config.yaml)
    {
      name: 'pts-backend-prod',
      script: 'server.js',                 // root server.js
      cwd: '/var/www/pts-backend-prod',    // folder for your prod branch/clone
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        // Optionally keep secrets *out* of YAML:
        // APP_SECRET: '***',
      },
      error_file: '/var/log/pts-backend-prod.err.log',
      out_file: '/var/log/pts-backend-prod.out.log',
      time: true,
    },

    // Development app (uses development block in config.yaml)
    {
      name: 'pts-backend-dev',
      script: 'server.js',
      cwd: '/var/www/pts-backend-dev',     // folder for your dev branch/clone
      instances: 1,
      autorestart: true,
      watch: false,                        // set true if you want reload
      env: {
        NODE_ENV: 'development',
      },
      error_file: '/var/log/pts-backend-dev.err.log',
      out_file: '/var/log/pts-backend-dev.out.log',
      time: true,
    },
  ],
};
