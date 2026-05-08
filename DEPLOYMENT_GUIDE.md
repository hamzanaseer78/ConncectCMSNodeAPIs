# Deployment Guide - ConnectCMS Node APIs

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Production Build](#production-build)
3. [Docker Deployment](#docker-deployment)
4. [Direct Server Deployment](#direct-server-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **PostgreSQL**: v12 or higher
- **Docker** (optional, for containerized deployment)
- **PM2** (optional, for process management)

---

## Production Build

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Build Process
```bash
npm run build
```

This will:
- Generate Prisma client
- Check syntax
- Optimize assets
- Validate environment configuration

### 3. Verify Build
```bash
npm run check
```

---

## Docker Deployment

### 1. Build Docker Image
```bash
docker build -t connect-cms-api:latest .
```

### 2. Run with Docker Compose
```bash
docker-compose up -d
```

This creates:
- API container (port 3000)
- PostgreSQL container (port 5432)
- Persistent volume for database

### 3. Verify Container
```bash
docker ps
docker logs connect-cms-api_app_1
```

### 4. Stop Services
```bash
docker-compose down
```

---

## Direct Server Deployment

### 1. Setup on Server

```bash
# Clone repository
git clone <repo-url>
cd ConnectCMSNodeAPIs

# Install dependencies
npm ci --omit=dev

# Generate Prisma client
npx prisma generate

# Create required directories
mkdir -p logs
```

### 2. Configure Environment
```bash
# Copy and edit .env
cp .env.example .env
nano .env  # Edit with production values
```

### 3. Run Database Migration (if needed)
```bash
npx prisma migrate deploy
```

### 4. Start with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# Save PM2 config for restart
pm2 save

# Setup auto-start on system reboot
pm2 startup

# Monitor
pm2 monit
pm2 logs
```

### 5. Start Directly (No PM2)
```bash
NODE_ENV=production node src/server.js
```

---

## Hostinger (Node.js Hosting)

See `HOSTINGER_DEPLOYMENT.md` for a Hostinger-focused checklist and the recommended start command.

---

## Environment Configuration

### Required Variables (.env)

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/connectcms

# JWT
JWT_SECRET=your-secure-random-secret-key-change-this
JWT_EXPIRES_IN=7d
SIGNUP_TOKEN_EXPIRES_MINUTES=30

# Server
PORT=3000
NODE_ENV=production

# CORS
CORS_ORIGIN=https://yourdomain.com

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Generate Secure JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Verification

### Health Checks

```bash
# Basic health check
curl http://localhost:3000/health

# Readiness check
curl http://localhost:3000/ready

# Expected response
{ "status": "ok", "timestamp": "2024-05-07T10:30:00.000Z" }
```

### API Documentation
- Swagger: `http://localhost:3000/api-docs`
- GraphQL: `http://localhost:3000/graphql/playground`

### Database Connection
```bash
# Check Prisma connection
npx prisma db execute --stdin < /dev/null
```

---

## Performance Tuning

### 1. Database Optimization
```sql
-- Create indexes for common queries
CREATE INDEX idx_tenantid ON users(tenantid);
CREATE INDEX idx_branchid ON users(branchid);
CREATE INDEX idx_userid ON userorganizations(userid);
```

### 2. Compression
Already enabled in `app.js`:
- Gzip compression (level 6)
- Payload size limit: 10KB

### 3. Caching Headers
```bash
# Add to nginx/reverse proxy configuration
add_header Cache-Control "public, max-age=3600";
```

---

## Monitoring

### PM2 Monitoring
```bash
pm2 monit                    # Real-time monitoring
pm2 logs                     # View logs
pm2 logs --lines 100         # Last 100 lines
pm2 save && pm2 startup      # Enable auto-restart
```

### Docker Monitoring
```bash
docker stats              # Container resource usage
docker logs -f app_name   # Follow container logs
```

### Health Monitoring
```bash
# Setup uptime monitoring
# Use /health endpoint with external monitoring service
# Example: UptimeRobot, Healthchecks.io
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change PORT in .env
PORT=3001
```

### Database Connection Failed
```bash
# Check DATABASE_URL format
postgresql://user:password@localhost:5432/dbname

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### JWT Secret Not Set
```bash
# Generate and set JWT_SECRET
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo $JWT_SECRET
```

### Prisma Client Issues
```bash
# Regenerate Prisma client
npx prisma generate

# Clear Prisma cache
rm -rf node_modules/.prisma

# Reinstall
npm ci
```

### Out of Memory
```bash
# Increase memory limit
NODE_OPTIONS=--max-old-space-size=2048 node src/server.js

# Or in PM2
pm2 start ecosystem.config.js --max-memory-restart=2G
```

---

## Logs Location

- **PM2 Logs**: `./logs/`
- **Docker Logs**: `docker logs <container-id>`
- **System Logs**: `/var/log/` (system-wide)

---

## Rollback Procedure

```bash
# Stop current version
pm2 stop connect-cms-api

# Switch to previous version
git checkout <previous-commit>

# Reinstall and rebuild
npm ci
npm run build

# Restart
pm2 start ecosystem.config.js
```

---

## Security Checklist

- [ ] JWT_SECRET is strong (32+ characters)
- [ ] DATABASE_URL has strong password
- [ ] CORS_ORIGIN is set to production domain
- [ ] NODE_ENV=production
- [ ] SSL/TLS certificate configured on reverse proxy
- [ ] Firewall rules restrict access
- [ ] Database backups enabled
- [ ] Logs are monitored

---

## Support

For issues or questions, contact the development team or check logs at `./logs/`
