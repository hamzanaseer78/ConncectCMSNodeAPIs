# GraphQL Playground Quick Reference

🚀 **Access**: http://localhost:3000/graphql/playground

---

## 🎯 What You'll See

| Area | Content |
|------|---------|
| **Left Panel** | Query editor with autocomplete |
| **Right Panel** | Schema explorer and docs |
| **Top Toolbar** | Bearer token input field |
| **Bottom Area** | Query results and errors |

---

## 🔐 Authentication

1. **Get Token** (one-time):
   ```bash
   curl -X POST http://localhost:3000/api/auth/signin \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password"}'
   ```

2. **Paste in Playground**:
   - Find the "Bearer Token" field at the top
   - Paste the token (with or without "Bearer " prefix)
   - Auto-included in all requests

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Space` | Autocomplete suggestions |
| `Ctrl+Shift+L` | Query history |
| `Ctrl+S` | Format query |
| `Ctrl+Enter` | Execute query |

---

## 📚 Available Queries

### 1️⃣ Dashboard Summary
```graphql
query {
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

### 2️⃣ Single Resource Report
```graphql
query {
  resourceReport(resource: "customers") {
    resource
    total
  }
}
```

### 3️⃣ All Resource Reports
```graphql
query {
  reports {
    resource
    total
  }
}
```

### 4️⃣ Multiple Resources (with aliases)
```graphql
query {
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

---

## 🔍 Schema Explorer

### How to Use
1. Open playground
2. Look at **right panel**
3. Click on types to expand
4. Hover over fields for docs
5. Click type names to drill down

### What You Can Explore
- ✓ Query type (all available queries)
- ✓ DashboardSummary type (response fields)
- ✓ ReportItem type (report structure)
- ✓ All built-in types (__Type, __Schema, etc.)

---

## 🧪 Try These Queries

### Simple Dashboard
```graphql
query Dashboard {
  dashboardSummary {
    users
    customers
  }
}
```

### Get Specific Resource Count
```graphql
query GetProductCount {
  resourceReport(resource: "products") {
    total
  }
}
```

### Schema Discovery
```graphql
query DiscoverSchema {
  __schema {
    types {
      name
      description
    }
  }
}
```

### Query Type Details
```graphql
query QueryDetails {
  __type(name: "Query") {
    fields {
      name
      description
    }
  }
}
```

---

## 💡 Tips & Tricks

✨ **Auto-complete**
- Start typing a field name
- Press `Ctrl+Space`
- Select from suggestions

📖 **Hover for Help**
- Hover over any field
- See description popup
- Learn about parameters

🔎 **Schema Explorer**
- Right-click on type names
- Expand to see fields
- Click arrows to collapse

🚀 **Run Queries**
- Click Play button (▶)
- Or press `Ctrl+Enter`
- Results appear below

---

## ❌ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Missing bearer token" | Paste JWT in token field |
| "Token has expired" | Get new token from /api/auth/signin |
| "Invalid token" | Check token is correct format |
| No schema showing | Refresh browser (F5) |
| Autocomplete not working | Press `Ctrl+Space` explicitly |

---

## 📖 Available Resources

| Resource | Purpose |
|----------|---------|
| Right Panel | Schema explorer & docs |
| Docs Tab | Inline documentation |
| History | Previous queries |
| Settings | Playground options |

---

## 🌐 Supported Resources

You can query reports for these resources:
- customers
- products
- users
- areas
- branches
- cities
- countries
- jobcategories
- jobgroups
- jobsubcategories
- policies
- jobstauses

---

## 📋 Example Workflow

```
1. Open playground
   ↓
2. Paste JWT token
   ↓
3. Type in left panel: query {
   ↓
4. Press Ctrl+Space for suggestions
   ↓
5. Select "dashboardSummary"
   ↓
6. Press Ctrl+Space again for fields
   ↓
7. Select fields you want
   ↓
8. Press Ctrl+Enter to execute
   ↓
9. See results below
```

---

## 🔗 Important URLs

| URL | Purpose |
|-----|---------|
| http://localhost:3000/graphql/playground | **← Start here** |
| http://localhost:3000/api-docs | REST API docs |
| http://localhost:3000/health | Health check |
| http://localhost:3000/ready | Readiness check |

---

## 📞 Need Help?

1. **Check schema** - Use right panel explorer
2. **See docs** - Hover over fields
3. **Try examples** - Copy queries from this file
4. **Read guide** - See GRAPHQL_SCHEMA.md
5. **Run tests** - Execute `node graphql-examples.js`

---

## ✅ Quick Test

1. Open http://localhost:3000/graphql/playground
2. Paste token in Bearer Token field
3. Copy-paste this query:
```graphql
query {
  dashboardSummary {
    tenantid
    users
  }
}
```
4. Press `▶` or `Ctrl+Enter`
5. ✅ See results below!

---

**GraphQL Playground is ready to use! 🎉**

Start exploring your API schema now!
