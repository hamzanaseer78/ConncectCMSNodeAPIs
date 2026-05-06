# API Architecture & Features Guide

## Overview

This document describes the new features implemented:
1. **Role-Based Access Control (RBAC)** - Applied to all protected endpoints
2. **Dynamic Email Templates** - For signup verification and user invitations
3. **Dropdown Endpoints** - JWT-only, no RBAC, filtered by tenant/branch
4. **Tenant/Branch Filtering** - All responses include context

---

## 1. Role-Based Access Control (RBAC)

### How It Works

All CRUD endpoints require RBAC authorization:
- User must have valid JWT token
- User must have rights assigned for the resource and action
- Rights are checked from `userrights` table
- Super admins (with default admin policy) bypass RBAC

### Endpoint Protection

**Protected Endpoints:**
```
GET    /api/{resource}          - view rights required
GET    /api/{resource}/:id      - view rights required
POST   /api/{resource}          - add rights required
PUT    /api/{resource}/:id      - update rights required
DELETE /api/{resource}/:id      - delete rights required
```

**Unprotected Endpoints:**
```
GET    /api/dropdowns           - JWT only (no RBAC)
GET    /api/dropdowns/:resource - JWT only (no RBAC)
POST   /api/auth/*              - Public (no auth for signup/login)
```

### Rights Check Flow

```
1. Request comes in with JWT token
2. Auth middleware validates JWT
3. Authorization middleware checks:
   - Is user admin? YES → Allow
   - Does user have policy assignment? NO → Deny (403)
   - Does policy have right for this resource/action? NO → Deny (403)
   - Permission check: screenid + policyid + action → Allow or Deny
```

### Example: Checking Rights for "Add Products"

```javascript
// User context from JWT
{
  userid: 123,
  tenantid: 456,
  branchid: 789
}

// System checks:
// 1. Is user 123 admin in tenant 456, branch 789?
// 2. Get user's policies: [policyid: 10, 11, 12]
// 3. Find "products" screen: screenid 50
// 4. Check userrights where:
//    - screenid = 50
//    - policyid IN (10, 11, 12)
//    - (branchid = 789 OR branchid = null)
// 5. If any match has addscreen = true → ALLOW
```

### Response Examples

**Authorized Request:**
```bash
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer <valid-token>"

# Response: 200 OK
{
  "data": [...],
  "pagination": {...},
  "_context": {
    "tenantid": 456,
    "branchid": 789,
    "userid": 123
  }
}
```

**Unauthorized Request:**
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer <valid-token>"

# Response: 403 Forbidden
{
  "error": "Not authorized to add users",
  "status": 403
}
```

---

## 2. Email Templates & Sending

### Implemented Templates

#### A. Signup Verification Email
**When sent:** User signs up or verifies email
**Data included:**
- Verification URL
- Verification code
- Expiry time (default: 30 minutes)
- User name
- Organization name

**API Call:**
```javascript
await mailService.sendSignupVerification(
  email,
  token,
  verificationUrl,
  {
    name: 'John Doe',
    organizationName: 'ACME Corp'
  }
);
```

#### B. User Invitation Email
**When sent:** Admin invites user to organization
**Data included:**
- User's temporary password (if created)
- Inviter name
- Organization name
- Login URL
- Organization details

**API Call:**
```javascript
await mailService.sendInvitation(
  email,
  {
    name: 'Jane Smith',
    inviterName: 'John Doe',
    organizationName: 'ACME Corp',
    generatedPassword: 'abc123XYZ!@#',
    loginUrl: 'https://app.example.com/login'
  }
);
```

#### C. Password Reset Email
**When sent:** User requests password reset
**Data included:**
- Reset URL
- Reset code
- Expiry time
- User name
- Organization name

**API Call:**
```javascript
await mailService.sendPasswordReset(
  email,
  token,
  resetUrl,
  {
    name: 'John Doe',
    organizationName: 'ACME Corp'
  }
);
```

### Email Configuration

**Development Mode (Console Output):**
No SMTP configured → Emails printed to console
```
╔════════════════════════════════════════════════════════╗
║                   EMAIL PREVIEW                        ║
╠════════════════════════════════════════════════════════╣
║ TO:      user@example.com                              ║
║ SUBJECT: Welcome to ConnectCMS - Verify Your Email    ║
╠════════════════════════════════════════════════════════╣
║ TEXT:                                                  ║
...
```

**Production Mode (SMTP):**
Add to `.env`:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@yourdomain.com
```

### Email Template Structure

```
{
  subject: "Email subject",
  text: "Plain text version",
  html: "HTML formatted version"
}
```

**Features:**
- Responsive HTML design
- Professional styling
- Dynamic variable insertion
- Plain text fallback

### Using Custom Templates

You can add more templates in `src/services/email-templates.js`:

```javascript
// Add new template
myCustomTemplate: ({ name, organizationName }) => ({
  subject: `Custom subject for ${name}`,
  text: `Custom text content`,
  html: `<h1>Custom HTML</h1>`
})

// Use in mail service
async sendCustomEmail(to, data) {
  const template = emailTemplates.myCustomTemplate(data);
  return this._sendEmail(to, template);
}
```

---

## 3. Dropdown Endpoints

### Purpose

Dropdown endpoints provide lists for form selects, filters, and other UI needs:
- **No RBAC applied** - Only JWT required
- **Tenant/Branch scoped** - Returns only data for user's tenant/branch
- **Optimized for performance** - Limited to 500 items
- **Separate routes** - Kept separate from CRUD endpoints

### Available Endpoints

**List all available dropdowns:**
```bash
GET /api/dropdowns
Authorization: Bearer <token>

Response:
{
  "data": [
    {
      "resource": "countries",
      "label": "Countries",
      "url": "/api/dropdowns/countries"
    },
    {
      "resource": "cities",
      "label": "Cities",
      "url": "/api/dropdowns/cities"
    },
    ...
  ],
  "total": 15
}
```

**Get dropdown for specific resource:**
```bash
GET /api/dropdowns/{resource}
Authorization: Bearer <token>

Example:
GET /api/dropdowns/countries

Response:
{
  "data": [
    { "value": 1, "label": "United States" },
    { "value": 2, "label": "Canada" },
    { "value": 3, "label": "Mexico" }
  ],
  "total": 3,
  "resource": "countries"
}
```

### Supported Resources

All resources marked as `tenantScoped` or `branchScoped`:
- areas
- branches
- cities
- countries
- customers
- jobcategories
- jobgroups
- jobsubcategories
- organizations
- policies
- products
- userorganizations
- userpolicies
- userrights
- users

### Dropdown Format

Each item in dropdown:
```javascript
{
  value: 123,           // Primary key value
  label: "Item Name"    // Display text
}
```

**Label Selection:**
- Uses first String field as label
- Falls back to resource name + ID if no string field
- Example: "United States" or "countries #1"

### Example: Form Usage

**Frontend:**
```javascript
// Get countries dropdown
const response = await fetch('/api/dropdowns/countries', {
  headers: { 'Authorization': 'Bearer ' + token }
});

const { data } = await response.json();

// Populate select element
const select = document.getElementById('country');
data.forEach(item => {
  const option = document.createElement('option');
  option.value = item.value;
  option.textContent = item.label;
  select.appendChild(option);
});
```

---

## 4. Tenant & Branch Filtering

### What Is It?

All API responses include context about the authenticated user's tenant and branch:
```json
{
  "data": [...],
  "_context": {
    "tenantid": 456,
    "branchid": 789,
    "userid": 123
  }
}
```

### Automatic Filtering

Backend automatically filters all responses:
- **Tenant-scoped resources:** Only data with matching tenantid
- **Branch-scoped resources:** Only data with matching branchid
- **Prevents data leakage:** User can't see other tenant's data

### Example

**User Context:**
```javascript
{
  userid: 123,
  tenantid: 456,
  branchid: 789
}
```

**Request:**
```bash
GET /api/customers
Authorization: Bearer <token>
```

**Backend Query:**
```sql
SELECT * FROM customers 
WHERE tenantid = 456 AND branchid = 789
```

**Response:**
```json
{
  "data": [
    { "id": 1, "name": "ACME Corp", ... },
    { "id": 2, "name": "Tech Inc", ... }
  ],
  "_context": {
    "tenantid": 456,
    "branchid": 789,
    "userid": 123
  }
}
```

---

## API Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    HTTP Request                             │
│  (JWT Token required for protected routes)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │  Request Logger Middleware   │
        │  (Log all requests)          │
        └──────────────────┬───────────┘
                           │
                           ▼
        ┌──────────────────────────────┐
        │ Tenant/Branch Filter         │
        │ (Add context to responses)   │
        └──────────────────┬───────────┘
                           │
                    ┌──────┴──────┐
                    │             │
         ┌──────────▼──────┐  ┌───▼─────────────┐
         │  Public Routes  │  │ Protected Routes│
         │ (auth, health)  │  │                 │
         └─────────────────┘  └───┬─────────────┘
                                  │
                           ┌──────▼────────┐
                           │ Auth Middleware│
                           │ (Validate JWT) │
                           └──────┬────────┘
                                  │
                    ┌─────────────┬──────────────┐
                    │             │              │
         ┌──────────▼────┐  ┌─────▼──────┐  ┌───▼──────────┐
         │  Dropdowns    │  │  CRUD      │  │ Unprotected │
         │  (JWT only)   │  │  (RBAC)    │  │  (public)   │
         └───────────────┘  └─────┬──────┘  └─────────────┘
                                  │
                           ┌──────▼──────────────┐
                           │ Authorization       │
                           │ Middleware (RBAC)   │
                           └──────┬──────────────┘
                                  │
                           ┌──────▼──────────────┐
                           │ Controller/Service  │
                           │ (Business Logic)    │
                           └──────┬──────────────┘
                                  │
                           ┌──────▼──────────────┐
                           │ Tenant/Branch       │
                           │ Filtered Query      │
                           └──────┬──────────────┘
                                  │
                           ┌──────▼──────────────┐
                           │ Database Query      │
                           └──────┬──────────────┘
                                  │
                           ┌──────▼──────────────┐
                           │ Tenant/Branch Filter│
                           │ Adds context        │
                           └──────┬──────────────┘
                                  │
                           ┌──────▼──────────────┐
                           │ Error Handler       │
                           │ (If error)          │
                           └──────┬──────────────┘
                                  │
                           ┌──────▼──────────────┐
                           │ Response            │
                           │ (JSON + context)    │
                           └─────────────────────┘
```

---

## Implementation Checklist

- [x] RBAC middleware enforces rights
- [x] Email templates created (signup, invitation, reset)
- [x] Mail service sends emails via SMTP or console
- [x] Dropdown endpoints with JWT-only auth
- [x] Tenant/Branch filtering middleware
- [x] Global error handler for authorization
- [x] Environment configuration for email
- [x] Response context added to all responses

---

## Testing Guide

### Test RBAC

```bash
# 1. Login and get token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r '.token')

# 2. Try to access resource without rights (should fail)
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN"
# Expected: 403 Forbidden (or 200 if admin)

# 3. Check context in response
curl -X GET http://localhost:3000/api/dropdowns/countries \
  -H "Authorization: Bearer $TOKEN" | jq '._context'
```

### Test Email Templates

```bash
# Signup with logging level
NODE_ENV=development npm run dev

# In application logs, look for:
# ╔════════════════════════════════════════════════════════╗
# ║                   EMAIL PREVIEW                        ║
```

### Test Dropdown Endpoints

```bash
# List all dropdowns
curl -X GET http://localhost:3000/api/dropdowns \
  -H "Authorization: Bearer $TOKEN" \
  | jq

# Get specific dropdown
curl -X GET http://localhost:3000/api/dropdowns/countries \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data | .[0:3]'  # Show first 3
```

---

## Troubleshooting

### Issue: "Not authorized" on protected endpoint
**Solution:** Check if user has rights assigned
```sql
SELECT * FROM userpolicies 
WHERE userid = 123 AND tenantid = 456 AND branchid = 789;

SELECT * FROM userrights 
WHERE screenid = X AND policyid IN (...);
```

### Issue: Emails not sending
**Solution:** Check SMTP configuration
```bash
# Development: Should see email preview in console
# Production: Check SMTP_HOST, SMTP_USER, SMTP_PASSWORD in .env
```

### Issue: Dropdown returns empty list
**Solution:** Check tenant/branch scoping
- Resource must have `tenantScoped: true` in resources config
- Verify JWT token contains correct tenantid/branchid

---

## Related Documentation

- `SECURITY_BEST_PRACTICES.md` - Security guidelines
- `DEPLOYMENT_CHECKLIST.md` - Production deployment
- `OPTIMIZATION_REPORT.md` - Performance optimizations

---

**Last Updated:** May 6, 2026  
**Status:** ✅ All features implemented
