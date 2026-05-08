# Production Deployment Checklist

## Pre-Deployment (Development Phase)

### Code Quality
- [ ] All GraphQL queries tested and working
- [ ] All REST endpoints tested
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Security vulnerabilities checked (`npm audit`)
- [ ] Code linting passed (`npm run lint`)

### Configuration
- [ ] All environment variables documented in `.env.example`
- [ ] No hardcoded secrets in code
- [ ] CORS_ORIGIN set to production domain
- [ ] JWT_SECRET generated (32+ characters)
- [ ] DATABASE_URL points to production database
- [ ] NODE_ENV set to "production"

### Database
- [ ] Schema finalized
- [ ] Migrations tested
- [ ] Backup strategy documented
- [ ] Connection pooling configured
- [ ] Indexes created for performance

### Testing
- [ ] Unit tests passing (if applicable)
- [ ] Integration tests passing
- [ ] Health endpoint responds correctly
- [ ] API endpoints tested with production data volume
- [ ] GraphQL queries tested
- [ ] Error scenarios tested

## Build & Deployment Phase

### Build Process
- [ ] Run `npm run build` without errors
- [ ] All dependencies installed correctly
- [ ] Prisma client generated
- [ ] Syntax check passed
- [ ] Optimization checks passed

### Pre-Deployment
- [ ] Database migrations run successfully
- [ ] Connection to production database verified
- [ ] All environment variables set on server
- [ ] Logs directory created and writable
- [ ] Permissions set correctly (user: nodejs, group: nodejs)

### Deployment Options

#### Docker Deployment
- [ ] Docker image built successfully
- [ ] Image tested locally
- [ ] Docker-compose file configured
- [ ] Container starts without errors
- [ ] Health check endpoint responds
- [ ] Logs accessible

#### PM2 Deployment
- [ ] PM2 installed globally on server
- [ ] `ecosystem.config.js` configured
- [ ] Startup command runs: `pm2 start ecosystem.config.js`
- [ ] Process monitoring enabled: `pm2 monit`
- [ ] Auto-restart on reboot configured: `pm2 startup`

#### Direct Node Deployment
- [ ] Node.js v18+ installed
- [ ] `npm ci --only=production` runs successfully
- [ ] `npm run db:generate` succeeds
- [ ] Manual start test: `NODE_ENV=production node src/server.js`

### Reverse Proxy Setup (Nginx/Apache)
- [ ] Proxy passes requests to `http://localhost:3000`
- [ ] SSL/TLS certificate installed
- [ ] Security headers configured
- [ ] Compression enabled at reverse proxy level
- [ ] Rate limiting configured
- [ ] CORS headers configured

## Post-Deployment

### Verification
- [ ] Server starts without errors
- [ ] Health endpoint: `curl http://localhost:3000/health`
- [ ] Readiness endpoint: `curl http://localhost:3000/ready`
- [ ] API responds to requests
- [ ] GraphQL playground accessible
- [ ] Swagger documentation accessible
- [ ] Database queries working
- [ ] JWT authentication working
- [ ] RBAC policies enforced

### Performance & Monitoring
- [ ] Response times acceptable
- [ ] No memory leaks (monitor with `pm2 monit`)
- [ ] Database connections stable
- [ ] Logs generated and readable
- [ ] Error logging working
- [ ] Request logging working
- [ ] Monitoring alerts configured

### Security Verification
- [ ] SSL/TLS working
- [ ] CORS restricts to correct domain
- [ ] JWT tokens properly validated
- [ ] Rate limiting working (if enabled)
- [ ] Security headers present
- [ ] Sensitive data not logged
- [ ] Database backups running

### Data Validation
- [ ] Multi-tenant isolation working
- [ ] Branch scoping working correctly
- [ ] User permissions enforced
- [ ] Data migrations completed
- [ ] Legacy data handled appropriately

## Monitoring & Maintenance

### Daily Tasks
- [ ] Check error logs for anomalies
- [ ] Verify server is responding (uptime monitoring)
- [ ] Check database size and growth
- [ ] Review API response times

### Weekly Tasks
- [ ] Review security logs
- [ ] Check database backups completed
- [ ] Review performance metrics
- [ ] Check for npm security updates

### Monthly Tasks
- [ ] Security audit
- [ ] Performance optimization review
- [ ] Dependency updates check
- [ ] Capacity planning review

## Rollback Plan

### If Deployment Fails
1. [ ] Identify the issue in logs
2. [ ] Stop current version: `pm2 stop connect-cms-api`
3. [ ] Switch to previous version: `git checkout <previous-commit>`
4. [ ] Reinstall: `npm ci`
5. [ ] Restart: `pm2 start ecosystem.config.js`
6. [ ] Verify health endpoint
7. [ ] Document the issue

### Database Rollback (if migration failed)
1. [ ] Stop application
2. [ ] Restore database from backup
3. [ ] Fix migration issues locally
4. [ ] Test migration in staging
5. [ ] Retry deployment

## Documentation

- [ ] Deployment guide created: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- [ ] Security best practices documented: [SECURITY_BEST_PRACTICES.md](./SECURITY_BEST_PRACTICES.md)
- [ ] README.md updated with current version
- [ ] API documentation updated
- [ ] Known issues documented
- [ ] Troubleshooting guide prepared

## Communication

- [ ] Team informed of deployment time
- [ ] Downtime window communicated (if applicable)
- [ ] Rollback plan communicated
- [ ] Post-deployment verification results shared
- [ ] Performance metrics shared

---

## Sign-Off

- **Deployed by**: _________________  
- **Date**: _________________  
- **Time**: _________________  
- **Verified by**: _________________  
- **Status**: ✓ Success / ✗ Rollback  
- **Issues/Notes**: 
  ```
  _________________________________
  _________________________________
  ```

---

**For questions or issues, refer to:**
- [README.md](./README.md)
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- [SECURITY_BEST_PRACTICES.md](./SECURITY_BEST_PRACTICES.md)
