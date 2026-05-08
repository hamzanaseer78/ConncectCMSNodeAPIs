module.exports = {
  apps: [
    {
      name: 'connect-cms-api',
      script: './src/server.js',
      // Hostinger/shared hosting: prefer single instance (fork)
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Restart policies
      autorestart: true,
      max_memory_restart: '1G',
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.env'],
      
      // Graceful shutdown
      kill_timeout: 30000,
      
      // Health check
      cron_restart: '0 0 * * *', // Daily restart at midnight
      
      // Logging
      output: './logs/out.log',
      error: './logs/error.log'
    }
  ]
};
