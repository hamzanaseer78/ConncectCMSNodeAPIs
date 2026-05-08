# ConnectCMS Node.js API

A production-ready REST and GraphQL API built with Node.js, Express, and PostgreSQL.

## Features

✅ **REST API** - Comprehensive CRUD operations with role-based access control (RBAC)  
✅ **GraphQL** - Query language for flexible data retrieval  
✅ **Authentication** - JWT-based authentication with token expiration  
✅ **Multi-tenancy** - Tenant and branch-scoped data isolation  
✅ **Database** - PostgreSQL with Prisma ORM  
✅ **Documentation** - Swagger/OpenAPI and GraphQL playground  
✅ **Security** - CORS, compression, rate limiting ready  
✅ **Docker** - Container-ready with docker-compose support  
✅ **Production Ready** - PM2 configuration, graceful shutdown, health checks  

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 12+
- npm 9+

### Installation

```bash
# Clone and install
git clone <repo-url>
cd ConnectCMSNodeAPIs
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database and JWT settings

# Generate Prisma client
npm run db:generate

# Start development
npm run dev

# Or production
npm start
```

### Environment Setup

```bash
# Required variables in .env
DATABASE_URL=postgresql://user:pass@localhost/connectcms
JWT_SECRET=your-secret-key-change-this
NODE_ENV=development
PORT=3000
```

## API Endpoints

### Health Checks
- `GET /health` - Service health status
- `GET /ready` - Service readiness

### Documentation
- `GET /api-docs` - Swagger UI
- `GET /graphql/playground` - GraphQL Playground

### REST API Routes
- `POST /api/auth/signin` - Authentication
- `GET/POST /api/{resource}` - Generic CRUD operations
- `GET /api/jobs-*` - Job-specific endpoints
- `GET /api/dropdowns` - Dropdown data

### GraphQL API

Access the GraphQL playground at: `http://localhost:3000/graphql/playground`

**Features**:
- ✅ Full schema introspection and exploration
- ✅ Auto-complete and syntax highlighting  
- ✅ Interactive schema explorer (right panel)
- ✅ Query history and documentation
- ✅ Built-in error handling and logging

**Available Queries**:
- `dashboardSummary` - Get dashboard metrics (users, customers, products, policies)
- `resourceReport(resource)` - Get count for specific resource
- `reports` - Get reports for all accessible resources

**Example Request**:
```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{
    "query": "{ dashboardSummary { tenantid branchid users customers } }"
  }'
```

See [GRAPHQL_SCHEMA.md](./GRAPHQL_SCHEMA.md) for detailed query documentation.

### GraphQL Queries
```graphql
{
  dashboardSummary {
    tenantid
    branchid
    users
    customers
    products
    activePolicies
  }
  resourceReport(resource: "customers") {
    resource
    total
  }
  reports {
    resource
    total
  }
}
```


## Project Structure

```
src/
├── app.js                 # Express app configuration
├── server.js              # Server entry point
├── config/                # Configuration files
│   ├── jwt.js            # JWT utilities
│   ├── resources.js      # Resource definitions
│   └── swagger.js        # Swagger configuration
├── controllers/           # Request handlers
├── routes/                # API routes
├── services/              # Business logic
├── bll/                   # Business logic layer
├── dataaccess/            # Data access layer
├── database/              # Database connection
├── graphql/               # GraphQL implementation
├── middlewares/           # Express middlewares
├── utils/                 # Utility functions
└── viewmodels/            # Data view models
```

## Development

### Available Scripts

```bash
npm run dev              # Start with nodemon (development)
npm run start            # Start server
npm run build            # Build for production
npm run check            # Syntax check
npm run db:generate      # Generate Prisma client
npm run db:pull          # Pull schema from database
npm run optimize         # Run optimization checks
npm run lint             # Check syntax
```

### Database

```bash
# Pull schema from existing database
npm run db:pull

# Generate Prisma client after schema changes
npm run db:generate

# Run migrations (if using migrate workflow)
npx prisma migrate deploy
```

### Testing GraphQL

#### Interactive Testing (Recommended)

1. **Start the server**:
   ```bash
   npm run dev
   ```

2. **Get a JWT token** from `/api/auth/signin`:
   ```bash
   curl -X POST http://localhost:3000/api/auth/signin \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password"}'
   ```

3. **Open GraphQL Playground**:
   - Navigate to: `http://localhost:3000/graphql/playground`
   - Paste your JWT token in the "Bearer Token" field
   - Use the schema explorer to browse available queries
   - Write and execute queries with autocomplete

#### Automated Testing

Run the example queries:
```bash
# Edit graphql-examples.js and set TOKEN variable with your JWT
node graphql-examples.js
```

This runs 10 test queries including:
- Dashboard summary
- Resource reports
- Schema introspection
- Error handling tests

#### Using cURL

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"query":"{ dashboardSummary { users customers products } }"}'
```

See [GRAPHQL_SCHEMA.md](./GRAPHQL_SCHEMA.md) for more queries and examples.

## Production Deployment

### Docker

```bash
# Build image
docker build -t connect-cms-api .

# Run with docker-compose
docker-compose up -d

# View logs
docker logs -f container-name
```

### Direct Server

```bash
# Build
npm run build

# Install production dependencies
npm ci --only=production

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit
```

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for detailed instructions.

## Configuration

### JWT Settings
```bash
JWT_SECRET=your-secure-secret-key
JWT_EXPIRES_IN=7d
SIGNUP_TOKEN_EXPIRES_MINUTES=30
```

### CORS
```bash
CORS_ORIGIN=http://localhost:3000
```

### Database
```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

## Security

- ✅ JWT authentication on all protected routes
- ✅ Role-based access control (RBAC)
- ✅ Tenant and branch data scoping
- ✅ Input validation and sanitization
- ✅ CORS configuration
- ✅ Compression and rate limiting
- ✅ Security headers (X-Frame-Options, X-XSS-Protection, etc.)

See [SECURITY_BEST_PRACTICES.md](./SECURITY_BEST_PRACTICES.md) for more details.

## API Documentation

### Swagger UI
Navigate to `http://localhost:3000/api-docs` in your browser.

### GraphQL Playground
Navigate to `http://localhost:3000/graphql/playground` in your browser.

## Performance

- Gzip compression enabled
- Request logging
- Database connection pooling (Prisma)
- GraphQL query optimization
- Payload size limits (10KB)

## Monitoring

### Health Endpoints
```bash
# Health check
curl http://localhost:3000/health

# Readiness check
curl http://localhost:3000/ready
```

### Logs
- Development: Console output
- Production: `./logs/` directory (with PM2)

## Troubleshooting

### Port Already in Use
Change PORT in .env or use `lsof -i :3000` to find and kill process.

### Database Connection Error
Check DATABASE_URL format and ensure PostgreSQL is running.

### JWT Token Issues
Ensure JWT_SECRET is set and token hasn't expired.

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for more troubleshooting.

## License

ISC

## Support

For issues or questions, contact the development team.
