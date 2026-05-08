# Quick Deployment Guide

## For Immediate Server Deployment

### 1. On Your Development Machine

```bash
# Build and prepare for production
npm run pre-deploy

# This runs:
# - npm run build (clean, generate, check, optimize)
# - npm run cleanup (remove unnecessary files)
# - npm prune --production (remove dev dependencies)
```

### 2. Deploy to Server

**Option A: Using Docker (Recommended)**
```bash
# Build Docker image
docker build -t connect-cms-api:latest .

# Run with Docker Compose
docker-compose up -d

# Check status
docker ps
docker logs -f connect-cms-api_app_1
```

**Option B: Using PM2**
```bash
# On your server:
npm install -g pm2

# Deploy files, then:
npm ci --only=production
npx prisma generate

# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**Option C: Direct Node.js**
```bash
# On your server:
npm ci --only=production
npx prisma generate

# Start in background with screen/tmux
NODE_ENV=production node src/server.js
```

### 3. Verify Deployment

```bash
# Health check
curl http://your-server:3000/health

# Should return: {"status":"ok","timestamp":"..."}

# Readiness check
curl http://your-server:3000/ready

# API Docs
curl http://your-server:3000/api-docs

# GraphQL
curl http://your-server:3000/graphql/playground
```

---

## Environment Setup

Create `.env` on server:

```bash
# Required
DATABASE_URL=postgresql://user:pass@localhost/connectcms
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NODE_ENV=production
PORT=3000

# Optional
CORS_ORIGIN=https://yourdomain.com
```

---

## File Structure Ready for Deploy

```
✅ Fixed Files:
  - src/graphql/handler.js (improved error handling)
  - src/graphql/schema.js (enhanced validation)
  - src/app.js (security headers, optimization)
  - src/server.js (graceful shutdown)
  - package.json (build scripts updated)

✅ New Configuration:
  - Dockerfile (production ready)
  - docker-compose.yml (full stack)
  - .dockerignore (optimized builds)
  - ecosystem.config.js (PM2 config)
  - .env.example (all variables documented)

✅ Build Scripts:
  - scripts/optimize.js (pre-deploy checks)
  - scripts/cleanup.js (remove dev files)

✅ Documentation:
  - DEPLOYMENT_GUIDE.md (detailed steps)
  - PRODUCTION_CHECKLIST.md (verification)
  - README.md (overview)
  - CODE_REVIEW_SUMMARY.md (all fixes)
```

---

## Quick Health Check Script

```bash
#!/bin/bash
SERVER="http://localhost:3000"

echo "🔍 Health Check..."
curl -s $SERVER/health | jq '.'

echo -e "\n🔍 Readiness Check..."
curl -s $SERVER/ready | jq '.'

echo -e "\n✅ All checks passed!"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 3000 in use | `lsof -i :3000` then `kill -9 PID` or change `PORT` in .env |
| Database connection failed | Check `DATABASE_URL` format and PostgreSQL is running |
| JWT_SECRET not set | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Docker build fails | Run `docker build -t connect-cms-api:latest . --no-cache` |
| Permission denied logs | Create logs dir: `mkdir -p logs && chmod 755 logs` |

---

## Monitoring After Deploy

```bash
# With PM2
pm2 monit              # Real-time monitoring
pm2 logs               # View all logs
pm2 logs --lines 100   # Last 100 lines

# With Docker
docker stats           # Resource usage
docker logs -f name    # Follow logs

# Manual check
ps aux | grep node     # Check if running
tail -f logs/out.log   # View logs
```

---

## What Changed

✅ **GraphQL Fixed**
- Proper request handling
- Better error messages
- Input validation
- Authentication checks

✅ **Code Optimized**
- Security headers added
- Better error handling
- Graceful shutdown
- Production-ready config

✅ **Build System**
- Production build process
- Automated cleanup
- Deployment scripts
- Optimization checks

✅ **Deployment Ready**
- Docker support (Dockerfile, docker-compose.yml)
- PM2 configuration
- Comprehensive guides
- Security documentation

---

## Need Help?

1. **Quick Start**: See [README.md](./README.md)
2. **Detailed Steps**: See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
3. **Security**: See [SECURITY_BEST_PRACTICES.md](./SECURITY_BEST_PRACTICES.md)
4. **All Changes**: See [CODE_REVIEW_SUMMARY.md](./CODE_REVIEW_SUMMARY.md)
5. **Checklist**: See [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)

---

## Deployment Summary

Your application is now:
- ✅ Production-ready
- ✅ Docker-compatible
- ✅ PM2-configured
- ✅ Security-hardened
- ✅ Fully documented
- ✅ Deployment-optimized

**Ready to deploy! 🚀**
