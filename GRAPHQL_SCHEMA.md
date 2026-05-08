# GraphQL Schema Documentation

## Overview

The ConnectCMS GraphQL API provides a query interface for accessing dashboard metrics and resource reports. All queries require JWT authentication.

---

## Available Queries

### 1. `dashboardSummary`

**Description**: Get aggregated dashboard summary metrics for the authenticated user's tenant and branch.

**Return Type**: `DashboardSummary!`

**Fields**:
- `tenantid: Int!` - Tenant identifier
- `branchid: Int!` - Branch identifier  
- `users: Int!` - Count of users in organization
- `customers: Int!` - Count of customers
- `products: Int!` - Count of products
- `activePolicies: Int!` - Count of active policies

**Authentication**: ✅ Required (JWT Bearer token)

**Example Query**:
```graphql
query GetDashboard {
  dashboardSummary {
    tenantid
    branchid
    users
    customers
    products
    activePolicies
  }
}
```

**Example Response**:
```json
{
  "data": {
    "dashboardSummary": {
      "tenantid": 1,
      "branchid": 2,
      "users": 15,
      "customers": 250,
      "products": 45,
      "activePolicies": 8
    }
  }
}
```

---

### 2. `resourceReport`

**Description**: Get a count report for a specific resource type.

**Arguments**:
- `resource: String!` (required) - The resource name to report on

**Return Type**: `ReportItem!`

**Fields**:
- `resource: String!` - Resource name
- `total: Int!` - Count of records

**Authentication**: ✅ Required (JWT Bearer token)

**Supported Resources**:
- `customers` - Customer records
- `products` - Product records
- `users` - User records
- `areas` - Area records
- `branches` - Branch records
- `cities` - City records
- `countries` - Country records
- `jobcategories` - Job categories
- `jobgroups` - Job groups
- `jobsubcategories` - Job subcategories
- `policies` - Policies
- `jobstauses` - Job statuses

**Example Query**:
```graphql
query CustomerReport {
  resourceReport(resource: "customers") {
    resource
    total
  }
}
```

**Example Response**:
```json
{
  "data": {
    "resourceReport": {
      "resource": "customers",
      "total": 250
    }
  }
}
```

---

### 3. `reports`

**Description**: Get reports for all accessible resources in a single query.

**Return Type**: `[ReportItem!]!`

**Fields**: Array of `ReportItem` objects

**Authentication**: ✅ Required (JWT Bearer token)

**Example Query**:
```graphql
query AllReports {
  reports {
    resource
    total
  }
}
```

**Example Response**:
```json
{
  "data": {
    "reports": [
      { "resource": "customers", "total": 250 },
      { "resource": "products", "total": 45 },
      { "resource": "users", "total": 15 },
      { "resource": "areas", "total": 12 },
      { "resource": "policies", "total": 8 }
    ]
  }
}
```

---

## Authentication

All GraphQL queries require authentication via JWT Bearer token.

### How to Authenticate

1. **Get JWT Token** from `/api/auth/signin` endpoint:
```bash
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

2. **Use Token in GraphQL Request**:
```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"query":"{ dashboardSummary { tenantid branchid users } }"}'
```

3. **Or in Playground**:
   - Navigate to `http://localhost:3000/graphql/playground`
   - Paste your token in the "Bearer Token" field at the top
   - Execute queries

---

## Error Handling

### Common Error Scenarios

**1. Missing Authentication**
```json
{
  "errors": [
    {
      "message": "Missing or invalid bearer token",
      "status": 401
    }
  ]
}
```

**2. Invalid Token**
```json
{
  "errors": [
    {
      "message": "Invalid token",
      "status": 401
    }
  ]
}
```

**3. Expired Token**
```json
{
  "errors": [
    {
      "message": "Token has expired",
      "status": 401
    }
  ]
}
```

**4. Invalid Resource**
```json
{
  "errors": [
    {
      "message": "Unknown resource: invalidresource",
      "status": 400
    }
  ]
}
```

**5. Unauthorized Resource Access**
```json
{
  "errors": [
    {
      "message": "Resource customers is not accessible via GraphQL",
      "status": 403
    }
  ]
}
```

---

## Multi-Tenancy & Data Scoping

All queries automatically scope data to the authenticated user's tenant and branch:

- **Tenant Scoping**: Queries only return data for the user's assigned tenant
- **Branch Scoping**: Queries only return data for the user's assigned branch
- **No Cross-Tenant Access**: Users cannot access data from other tenants

This is enforced automatically through the JWT token payload.

---

## Using the GraphQL Playground

### Access the Playground

Navigate to: `http://localhost:3000/graphql/playground`

### Features

- **Schema Explorer** (Right Panel)
  - Browse all available types and queries
  - View field descriptions and arguments
  - See type hierarchies

- **Autocomplete**
  - Press `Ctrl+Space` to trigger autocomplete
  - Type field names to auto-complete
  - Get suggestions for arguments and types

- **Documentation**
  - Hover over fields to see inline documentation
  - Click on type names to view full type definitions
  - View field descriptions and deprecation notices

- **Query History**
  - Previous queries are stored
  - Press `Ctrl+Shift+L` to open history

- **Multiple Tabs**
  - Write multiple queries in separate tabs
  - Switch between tabs easily

### Tips

1. **Always authenticate** with a valid JWT token
2. **Use the schema explorer** to discover available fields
3. **Check inline documentation** for field descriptions
4. **Test queries** before using in production
5. **Monitor response times** for performance issues

---

## Field Descriptions

All fields include descriptions in the schema. View them by:

1. **In Playground**: Hover over field names
2. **In Query**: Use introspection queries
3. **In Code**: Check schema.js

Example with descriptions:
```graphql
query {
  dashboardSummary {
    """Get the tenant ID"""
    tenantid
    
    """Get the branch ID"""  
    branchid
    
    """Number of users in the organization"""
    users
  }
}
```

---

## Examples

### Example 1: Dashboard with All Metrics
```graphql
query DashboardMetrics {
  dashboardSummary {
    tenantid
    branchid
    users
    customers
    products
    activePolicies
  }
}
```

### Example 2: Multiple Resource Reports
```graphql
query MultipleReports {
  customers: resourceReport(resource: "customers") {
    resource
    total
  }
  products: resourceReport(resource: "products") {
    resource
    total
  }
  policies: resourceReport(resource: "policies") {
    resource
    total
  }
}
```

### Example 3: Combined Dashboard and Reports
```graphql
query DashboardAndReports {
  dashboardSummary {
    tenantid
    branchid
    users
    customers
    products
  }
  reports {
    resource
    total
  }
}
```

---

## Introspection Queries

The API supports full GraphQL introspection for schema discovery.

### Get All Types
```graphql
query AllTypes {
  __schema {
    types {
      name
      description
    }
  }
}
```

### Get Query Type Information
```graphql
query QueryType {
  __type(name: "Query") {
    name
    description
    fields {
      name
      description
      type {
        name
      }
    }
  }
}
```

### Get Dashboard Summary Type
```graphql
query DashboardType {
  __type(name: "DashboardSummary") {
    name
    description
    fields {
      name
      description
      type {
        name
        kind
      }
    }
  }
}
```

---

## Performance Considerations

1. **Batch Queries**: Combine multiple reports into one query to reduce requests
2. **Token Caching**: Cache JWT tokens to avoid repeated authentication
3. **Query Optimization**: Only request fields you need
4. **Error Handling**: Implement exponential backoff for retries

---

## Production Considerations

- **Schema Introspection**: Disabled in production for security
- **Playground**: Disabled in production
- **Rate Limiting**: May be enforced in production
- **Token Expiration**: Tokens expire after configured duration (default: 7 days)

---

## Support

For issues or questions:
1. Check [README.md](./README.md)
2. Review [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
3. Check playground console for error details
4. Review logs at `/logs/` directory
