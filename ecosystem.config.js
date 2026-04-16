// PM2 process config — run with `pm2 start ecosystem.config.js --env production`
module.exports = {
  apps: [{
    name: 'onsective-careers',
    script: 'src/server.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
