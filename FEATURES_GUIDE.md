# New Features Implementation Guide

## Overview

Three major features have been implemented:
1. **Role-Based Access Control (RBAC)** - Enforce user permissions
2. **Email Templates & Sending** - Dynamic email for signup/invitations
3. **Dropdown Endpoints** - JWT-only, no RBAC, filtered by tenant/branch

---

## 1. RBAC Implementation

### What Changed

**Before:**
- Authorization middleware existed but wasn't enforced
- Some endpoints bypassed rights checking

**After:**
- All CRUD endpoints require RBAC
- Super admins (default policy) bypass checks
- Clear 403 Forbidden responses for unauthorized users

### How RBAC Works

```
User Request
    ↓
Check JWT (required)
    ↓
Check RBAC:
  • Is user admin? → ALLOW
  • Does user have policy? → Check rights
  • Does policy have right for this action? → ALLOW or DENY
    ↓
    Error: 403 Forbidden (if denied)
    Success: Return data (filtered by tenant/branch)
```

### Testing RBAC

```bash
# 1. Create a user with limited rights
# 2. Login and get JWT token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"limited@example.com","password":"password123"}'

# 3. Try to access protected resource
curl -X GET http://localhost:3000/api/products \
  -H "Authorization: Bearer <token>"

# If user doesn't have "view" rights on products screen:
# Response: {"error": "Not authorized to view products", "status": 403}
```

### Setting Up User Rights

**SQL to grant permissions:**
```sql
-- Get the screen ID for the resource
SELECT screenid FROM screens WHERE screenname = 'products';

-- Get user's policy IDs
SELECT policyid FROM userpolicies 
WHERE userid = 123 AND tenantid = 456;

-- Grant permissions
INSERT INTO userrights (
  screenid, policyid, tenantid, branchid,
  viewscreen, addscreen, updatescreen, deletescreen,
  createdby, createdat
) VALUES (
  50, 10, 456, 789,
  true, true, true, true,
  123, NOW()
);
```

---

## 2. Email Templates & Sending

### What Changed

**Before:**
- Mail service only logged to console
- No email templates
- No actual email sending

**After:**
- 3 professional email templates created
- SMTP support for production
- Development console preview mode
- Variables dynamically inserted

### Email Templates

#### Signup Verification
```
Subject: Welcome to ConnectCMS - Verify Your Email

Sent when:
- User signs up
- User needs to verify email

Includes:
- Verification URL (clickable link)
- Verification code
- 30-minute expiry message
- Professional HTML + plain text
```

#### User Invitation
```
Subject: You've been invited to [Organization]

Sent when:
- Admin invites user
- User is added to organization

Includes:
- Temporary password (if created)
- Inviter name
- Organization name
- Login URL
- Professional HTML + plain text
```

#### Password Reset
```
Subject: Password Reset Request

Sent when:
- User requests password reset

Includes:
- Reset link
- Reset code
- 60-minute expiry
- Professional HTML + plain text
```

### Configuration

#### Development (No SMTP)
Emails appear in console:
```bash
npm run dev

# Look for:
╔════════════════════════════════════════════════════════╗
║                   EMAIL PREVIEW                        ║
╠════════════════════════════════════════════════════════╣
║ TO:      user@example.com                              ║
║ SUBJECT: Welcome to ConnectCMS - Verify Your Email    ║
```

#### Production (SMTP)
Add to `.env`:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=app-specific-password
SMTP_FROM=noreply@yourdomain.com
APP_URL=https://app.yourdomain.com
```

### Gmail Setup (Example)

1. Enable 2-factor authentication
2. Create app-specific password
3. Use app password in SMTP_PASSWORD
4. Set SMTP_USER to your Gmail address

### Testing Email

```javascript
// In any service or controller
const mailService = require('../services/mail.service');

// Send signup email
await mailService.sendSignupVerification(
  'user@example.com',
  'ABC123TOKEN',
  'http://localhost:3000/verify?token=ABC123TOKEN',
  { name: 'John Doe', organizationName: 'ACME' }
);

// Send invitation
await mailService.sendInvitation(
  'newuser@example.com',
  {
    name: 'Jane Smith',
    inviterName: 'John Admin',
    organizationName: 'ACME',
    generatedPassword: 'TempPass123!',
    loginUrl: 'http://localhost:3000/login'
  }
);

// Send password reset
await mailService.sendPasswordReset(
  'user@example.com',
  'RESETTOKEN123',
  'http://localhost:3000/reset?token=RESETTOKEN123',
  { name: 'John Doe' }
);
```

---

## 3. Dropdown Endpoints

### Purpose

Separate endpoints for form dropdowns:
- **JWT-only** - No RBAC checking
- **Tenant/Branch scoped** - Only user's data
- **Optimized** - Limited to 500 items
- **Separated** - Not mixed with CRUD routes

### Endpoints

```
GET /api/dropdowns                  - List all available dropdowns
GET /api/dropdowns/{resource}       - Get items for specific resource
```

### Examples

#### List All Available Dropdowns

```bash
curl -X GET http://localhost:3000/api/dropdowns \
  -H "Authorization: Bearer <token>"

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

#### Get Countries Dropdown

```bash
curl -X GET http://localhost:3000/api/dropdowns/countries \
  -H "Authorization: Bearer <token>"

Response:
{
  "data": [
    { "value": 1, "label": "United States" },
    { "value": 2, "label": "Canada" },
    { "value": 3, "label": "Mexico" }
  ],
  "total": 3,
  "resource": "countries",
  "_context": {
    "tenantid": 456,
    "branchid": 789,
    "userid": 123
  }
}
```

#### Get Products Dropdown

```bash
curl -X GET http://localhost:3000/api/dropdowns/products \
  -H "Authorization: Bearer <token>"

Response:
{
  "data": [
    { "value": 1, "label": "Product A" },
    { "value": 2, "label": "Product B" },
    { "value": 3, "label": "Product C" }
  ],
  "total": 3,
  "resource": "products"
}
```

### Frontend Usage

```javascript
// React example
async function loadCountries(token) {
  const response = await fetch('/api/dropdowns/countries', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  const { data } = await response.json();
  
  return data.map(item => (
    <option key={item.value} value={item.value}>
      {item.label}
    </option>
  ));
}

// Vue example
async function loadCustomers(token) {
  const { data } = await axios.get('/api/dropdowns/customers', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  this.customers = data;  // List of { value, label }
}
```

---

## Tenant & Branch Context

### What It Means

Every response includes context:
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

### Security Implications

- **Tenant isolation:** User can't access other tenant's data
- **Branch filtering:** User sees only their branch data
- **Automatic:** Applied to all queries automatically

### Example

**User belongs to:**
- Tenant: 456
- Branch: 789

**Query for customers:**
```sql
-- Backend automatically adds WHERE clause:
WHERE tenantid = 456 AND branchid = 789
```

---

## Files Modified/Created

### New Files Created (5)
| File | Purpose |
|------|---------|
| `src/services/email-templates.js` | Email HTML/text templates |
| `src/controllers/dropdown.controller.js` | Dropdown logic |
| `src/routes/dropdowns.routes.js` | Dropdown routes |
| `src/middlewares/tenant-branch-filter.middleware.js` | Context filtering |
| `API_ARCHITECTURE.md` | Complete architecture guide |

### Files Modified (8)
| File | Change |
|------|--------|
| `src/app.js` | Added dropdowns route + context filter |
| `src/services/mail.service.js` | Full email implementation |
| `src/bll/concretes/auth.service.js` | Email template calls |
| `src/middlewares/authorization.middleware.js` | Proper error throwing |
| `.env.example` | Email config added |
| `package.json` | Added nodemailer |

---

## Installation & Setup

### 1. Install Dependencies

```bash
npm install nodemailer
```

### 2. Configure Email (.env)

**Development (Console):**
```bash
# Leave SMTP_HOST empty - emails will print to console
NODE_ENV=development
```

**Production (Gmail):**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@yourdomain.com
APP_URL=https://app.yourdomain.com
```

### 3. Start Application

```bash
npm run dev
```

### 4. Test Features

```bash
# Test RBAC - try accessing protected endpoint
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer <token>"

# Test Dropdowns
curl -X GET http://localhost:3000/api/dropdowns \
  -H "Authorization: Bearer <token>"

# Test Email - look for console output
# Should see: ╔════════════════════════════════════════════════════════╗
```

---

## Migration Checklist

For existing deployments:

- [ ] Run `npm install nodemailer`
- [ ] Update `.env` with email config
- [ ] Test RBAC on protected endpoints
- [ ] Verify dropdown endpoints work
- [ ] Test email sending (in dev mode)
- [ ] Configure production SMTP (if needed)
- [ ] Update frontend to use dropdown endpoints
- [ ] Update documentation for team
- [ ] Test with real users

---

## Troubleshooting

### RBAC Issues

**Error: "Not authorized to view products"**
- Check user has policy assigned: `userpolicies` table
- Check policy has rights: `userrights` table
- Check `viewscreen = true` for the action

**Error: "JWT must include userid, tenantid and branchid"**
- Ensure JWT token was created correctly
- Check token creation in auth service includes all fields

### Email Issues

**Emails not appearing (Development)**
- Check terminal/console output
- Look for: `╔════════════════════════════════════════════════════════╗`

**Emails not sending (Production)**
- Verify SMTP credentials in `.env`
- Check SMTP_HOST is correct for your provider
- Verify app-specific password (if using Gmail)
- Check firewall allows SMTP port 587

### Dropdown Issues

**Empty dropdown list**
- Verify JWT token has tenantid and branchid
- Check data exists for user's tenant/branch
- Verify resource is configured with tenant/branch scoping

**404 on dropdown endpoint**
- Check resource name spelling (case-sensitive)
- Verify resource exists in `config/resources.js`
- Ensure resource is not marked as `backendOnly`

---

## API Response Format

### Success Response (RBAC Protected)
```json
{
  "data": [...],
  "pagination": { "page": 1, "pageSize": 25, "total": 100 },
  "_context": {
    "tenantid": 456,
    "branchid": 789,
    "userid": 123
  }
}
```

### Success Response (Dropdown)
```json
{
  "data": [
    { "value": 1, "label": "Item 1" },
    { "value": 2, "label": "Item 2" }
  ],
  "total": 2,
  "resource": "products",
  "_context": {
    "tenantid": 456,
    "branchid": 789,
    "userid": 123
  }
}
```

### Error Response (Unauthorized)
```json
{
  "error": "Not authorized to add products",
  "status": 403
}
```

### Error Response (No Rights)
```json
{
  "error": "Not authorized to view users",
  "status": 403
}
```

---

## Next Steps

1. ✅ Features implemented
2. → Test with your data
3. → Configure email for production
4. → Update frontend for dropdowns
5. → Deploy and monitor
6. → Gather user feedback

---

## Documentation

- **API_ARCHITECTURE.md** - Complete architecture details
- **SECURITY_BEST_PRACTICES.md** - Security guidelines  
- **DEPLOYMENT_CHECKLIST.md** - Production setup
- **OPTIMIZATION_REPORT.md** - Performance details

---

**Implementation Date:** May 6, 2026  
**Status:** ✅ Complete and ready for use
