# ConnectCMS PostgreSQL — ER Diagram

Source: `prisma/schema.prisma` (PostgreSQL)

**Interactive HTML (full browser width):**

| Diagram | File |
|--------|------|
| With column attributes | [`database-er-diagram.html`](database-er-diagram.html) |
| Tables & relations only | [`database-er-diagram-overview.html`](database-er-diagram-overview.html) |

Regenerate: `node scripts/generate-er-html.js`

## Overview (tenant hub)

```mermaid
erDiagram
  organizations ||--o{ branches : has
  organizations ||--o{ users : via_membership
  organizations ||--o{ customers : has
  organizations ||--o{ job : has
  organizations ||--o{ products : has
  organizations ||--o{ policies : has

  branches ||--o{ job : scoped
  branches ||--o{ customers : scoped
  branches ||--o{ userorganizations : membership
  branches ||--o{ userpolicies : assigns

  users ||--o{ userorganizations : member_of
  users ||--o{ userpolicies : has_policy
  users ||--o{ job : assigned
```

## Geography

```mermaid
erDiagram
  organizations ||--o{ countries : tenant
  countries ||--o{ cities : contains
  cities ||--o{ areas : contains

  countries ||--o{ customers : country
  cities ||--o{ customers : city
  areas ||--o{ customers : area

  cities ||--o{ job : city
  areas ||--o{ job : area
```

## Job taxonomy (group → category → subcategory)

```mermaid
erDiagram
  organizations ||--o{ jobgroups : tenant
  branches ||--o{ jobgroups : branch

  jobgroups ||--o{ jobcategories : has
  jobcategories ||--o{ jobsubcategories : has

  jobgroups ||--o{ job : groupid
  jobcategories ||--o{ job : serviceid_category
  jobsubcategories ||--o{ job : faultid_subcategory

  organizations ||--o{ jobstatuses : tenant
  jobstatuses ||--o{ job : status
  brands ||--o{ job : brand
```

**`job` hierarchy columns**

| API field   | DB column  | References              |
|------------|------------|-------------------------|
| serviceId  | groupid    | jobgroups.groupid       |
| categoryId | serviceid  | jobcategories.categoryid |
| faultId    | faultid    | jobsubcategories.subcategoryid |

## Core `job` entity

```mermaid
erDiagram
  job {
    int recno PK
    int tenantid FK
    int branchid FK
    string code
    date date
    int assignedto FK
    int groupid FK
    int serviceid FK
    int faultid FK
    int customerid FK
    int statusid FK
    int city FK
    int area FK
    int brandid FK
    int deliverytype
    boolean iscompleted
    boolean isresolved
  }

  organizations ||--o{ job : tenant
  branches ||--o{ job : branch
  customers ||--o{ job : customer
  users ||--o{ job : assignedto
  jobgroups ||--o{ job : groupid
  jobcategories ||--o{ job : serviceid
  jobsubcategories ||--o{ job : faultid
  jobstatuses ||--o{ job : statusid
  cities ||--o{ job : city
  areas ||--o{ job : area
  brands ||--o{ job : brandid
```

## Job child tables (1:N from `job`)

```mermaid
erDiagram
  job ||--o{ jobdetails : details
  job ||--o{ jobproducts : product_lines
  job ||--o{ jobaddonproducts : addon_lines
  job ||--o{ jobattachments : attachments
  job ||--o{ jobcustomerremarkslog : remarks
  job ||--o{ jobassignmentlog : assignments
  job ||--o{ jobstatuslog : status_history
  job ||--o{ jobtravelhistory : travel
  job ||--o{ jobworklhistory : work
  job ||--o{ jobapprovalrequests : approvals
  job ||--o{ userlocations : tracking

  jobproducts }o--|| products : productid
  jobproducts }o--o| taxtypes : taxtypeid
  jobaddonproducts }o--|| products : productid
  jobaddonproducts }o--o| taxtypes : taxtypeid

  jobstatuslog }o--o| jobstatuses : fromstatus
  jobstatuslog }o--o| jobstatuses : tostatus
  users ||--o{ jobassignmentlog : userid
  users ||--o{ jobstatuslog : changedby
  users ||--o{ jobtravelhistory : traveledby
  users ||--o{ jobworklhistory : workedby
```

## Job approval workflow

```mermaid
erDiagram
  organizations ||--o{ jobapprovalsettings : tenant
  branches ||--o{ jobapprovalsettings : branch

  jobapprovalsettings ||--o{ jobapprovallevels : levels
  jobapprovallevels ||--o{ jobapprovallevelusers : approvers
  jobapprovallevelusers }o--|| users : userid

  job ||--o{ jobapprovalrequests : requests
  jobapprovalrequests ||--o{ jobapprovalactions : actions
  jobapprovalactions }o--|| users : userid
```

## Products & catalog

```mermaid
erDiagram
  organizations ||--o{ products : tenant
  organizations ||--o{ units : tenant
  organizations ||--o{ brands : tenant
  organizations ||--o{ taxtypes : tenant
  organizations ||--o{ deliverytypes : tenant

  branches ||--o{ products : branch
  units ||--o{ products : unitid
  brands ||--o{ products : brandid

  products ||--o{ jobproducts : used_in
  products ||--o{ jobaddonproducts : used_in
```

## Users, policies & screen rights

```mermaid
erDiagram
  users ||--o{ userorganizations : org_branch
  userorganizations }o--|| organizations : tenantid
  userorganizations }o--|| branches : branchid

  users ||--o{ userpolicies : policy_assign
  userpolicies }o--|| policies : policyid
  userpolicies }o--|| organizations : tenant
  userpolicies }o--|| branches : branch

  policies ||--o{ userrights : rights
  screens ||--o{ userrights : screenid
  userrights }o--|| organizations : tenant
  userrights }o--o| branches : branch

  users ||--o{ userssignuptokenlogs : signup_logs
  users ||--o{ userlocations : gps_pings
```

## Entity list (40 tables)

| Domain | Tables |
|--------|--------|
| Tenancy | organizations, branches |
| Geo | countries, cities, areas |
| Customers | customers |
| Job taxonomy | jobgroups, jobcategories, jobsubcategories, jobstatuses |
| Jobs | job, jobdetails, jobproducts, jobaddonproducts, jobattachments, jobcustomerremarkslog, jobassignmentlog, jobstatuslog, jobtravelhistory, jobworklhistory |
| Approval | jobapprovalsettings, jobapprovallevels, jobapprovallevelusers, jobapprovalrequests, jobapprovalactions |
| Catalog | products, units, brands, taxtypes, deliverytypes |
| Auth/RBAC | users, userorganizations, userpolicies, policies, screens, userrights, userssignuptokenlogs |
| Tracking | userlocations |
