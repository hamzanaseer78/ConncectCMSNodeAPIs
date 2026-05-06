# Deployment Checklist

## Pre-Deployment

### Code Quality
- [ ] All tests passing
- [ ] No console.log statements (use logger)
- [ ] No hardcoded values
- [ ] No sensitive data in code
- [ ] Code review completed
- [ ] Dependencies up to date
- [ ] No vulnerabilities: `npm audit`

### Security
- [ ] JWT_SECRET set and strong (32+ chars)
- [ ] Database credentials in environment only
- [ ] CORS configured for specific domain
- [ ] HTTPS enabled
- [ ] Rate limiting configured
- [ ] Input validation enabled
- [ ] Security headers enabled (helmet)

### Performance
- [ ] Gzip compression enabled ✅
- [ ] Database indexes verified
- [ ] N+1 queries eliminated
- [ ] Cache strategy implemented
- [ ] Load testing completed
- [ ] Memory leaks checked

### Database
- [ ] Migrations tested
- [ ] Backup strategy configured
- [ ] Connection pooling optimized
- [ ] Slow query logging enabled
- [ ] Database users created with minimal privileges

### Monitoring
- [ ] Error tracking setup (Sentry)
- [ ] Application logging configured
- [ ] Performance monitoring active
- [ ] Uptime monitoring enabled
- [ ] Alert thresholds set

---

## Deployment Steps

### 1. Prepare Environment
```bash
# Create production environment file
cp .env.example .env.production

# Edit with production values
nano .env.production
```

**Required Values:**
```
DATABASE_URL=postgresql://prod_user:strong_pass@prod_db.example.com/connectcms
JWT_SECRET=<generate-with: openssl rand -base64 32>
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://yourdomain.com
```

### 2. Install Dependencies
```bash
npm ci --only=production
```

### 3. Run Migrations
```bash
npx prisma migrate deploy
```

### 4. Build (if applicable)
```bash
npm run build
```

### 5. Start Application
```bash
NODE_ENV=production npm start
```

### 6. Verify Health
```bash
curl https://api.yourdomain.com/health
```

---

## Post-Deployment

### 1. Smoke Tests
```bash
# Test auth endpoint
curl -X POST https://api.yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# Test protected endpoint
curl https://api.yourdomain.com/api/users \
  -H "Authorization: Bearer <token>"

# Test health check
curl https://api.yourdomain.com/health
```

### 2. Monitor Logs
```bash
# Watch for errors
tail -f logs/app.log | grep ERROR

# Check startup logs
grep "SERVER" logs/app.log
grep "ENV" logs/app.log
```

### 3. Performance Baseline
- Record response times
- Monitor memory usage
- Track database queries
- Note concurrent user capacity

### 4. User Communication
- Notify users of deployment
- Provide status page
- Enable support channel

---

## Rollback Plan

If issues occur:

### 1. Immediate Rollback
```bash
# Stop current instance
pm2 stop connectcms

# Revert to previous version
git checkout <previous-tag>

# Reinstall dependencies
npm ci --only=production

# Start with previous database state
npx prisma migrate resolve --rolled-back

# Restart
pm2 start connectcms
```

### 2. Notify Team
- Update status page
- Notify affected users
- Document incident

### 3. Root Cause Analysis
- Review deployment logs
- Check error tracking
- Analyze metrics
- Plan prevention

---

## Production Environment Setup

### Using PM2 (Process Manager)
```bash
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'connectcms-api',
    script: 'src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

# Start application
pm2 start ecosystem.config.js

# Setup auto-restart
pm2 startup
pm2 save
```

### Using Docker
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t connectcms-api:latest .
docker run -d \
  --name connectcms-api \
  -p 3000:3000 \
  --env-file .env.production \
  connectcms-api:latest
```

### Using Nginx as Reverse Proxy
```nginx
upstream connectcms {
  server localhost:3000;
  server localhost:3001;
  server localhost:3002;
  # Load balance across multiple instances
}

server {
  listen 443 ssl http2;
  server_name api.yourdomain.com;

  ssl_certificate /etc/ssl/certs/yourdomain.crt;
  ssl_certificate_key /etc/ssl/private/yourdomain.key;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "DENY" always;

  # Compression
  gzip on;
  gzip_types application/json;
  gzip_min_length 1000;

  location / {
    proxy_pass http://connectcms;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
  }
}

# Redirect HTTP to HTTPS
server {
  listen 80;
  server_name api.yourdomain.com;
  return 301 https://$server_name$request_uri;
}
```

---

## Monitoring & Logging Setup

### Application Logging
```javascript
// Use structured logging (recommended)
const logger = require('pino')();

logger.info('Server started', { port: 3000, env: 'production' });
logger.error('Database error', { error: err.message });
logger.warn('High memory usage', { usage: process.memoryUsage() });
```

### Error Tracking (Sentry)
```bash
npm install @sentry/node
```

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1
});

app.use(Sentry.Handlers.errorHandler());
```

### Performance Monitoring
```javascript
const prometheus = require('prom-client');

const httpDuration = new prometheus.Histogram({
  name: 'http_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code']
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    httpDuration.labels(req.method, req.route?.path, res.statusCode).observe(duration);
  });
  next();
});
```

---

## Database Backup Strategy

### Daily Backups
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/connectcms"
DB_NAME="connectcms"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup
pg_dump $DB_NAME | gzip > "$BACKUP_DIR/backup_$TIMESTAMP.sql.gz"

# Keep only last 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

Add to crontab:
```bash
# Daily backup at 2 AM
0 2 * * * /scripts/backup.sh
```

---

## Performance Optimization Checklist

- [ ] Database indexes verified
- [ ] Slow queries optimized
- [ ] N+1 queries eliminated
- [ ] Response caching implemented
- [ ] Gzip compression enabled ✅
- [ ] CDN configured (if applicable)
- [ ] Load balancing configured
- [ ] Connection pooling optimized
- [ ] Memory leaks prevented
- [ ] CPU usage monitored

---

## Documentation Updates

Before going live:
- [ ] API documentation updated
- [ ] Deployment guide created
- [ ] Runbook for common issues
- [ ] Architecture diagram updated
- [ ] Security documentation reviewed
- [ ] Incident response plan documented

---

## Emergency Contacts

- **DevOps Lead:** [contact]
- **Database Admin:** [contact]
- **Security Officer:** [contact]
- **On-Call Support:** [contact]

---

**Last Updated:** May 6, 2026  
**Next Review:** Before each production deployment
