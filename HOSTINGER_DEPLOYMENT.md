# Hostinger Deployment (Node.js + PostgreSQL)

This project is a Node/Express API (REST + GraphQL) using Prisma + PostgreSQL.

## 1) Hostinger prerequisites
- A Hostinger plan that supports **Node.js apps**
- A **PostgreSQL database** (Hostinger DB or external)
- Node version **18+** (project requirement)

## 2) Environment variables (Hostinger Panel)
Set these in Hostinger (do not commit a `.env`):

- `NODE_ENV=production`
- `PORT` (Hostinger usually sets this automatically; if they require a value, use the port given by Hostinger)
- `DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME`
- `JWT_SECRET=...` (strong secret)
- `CORS_ORIGIN=https://your-frontend-domain.com`

Email (only if used in your flows):
- `EMAIL_PROVIDER=smtp`
- `SMTP_HOST=...`
- `SMTP_PORT=...`
- `SMTP_SECURE=false|true`
- `SMTP_USER=...`
- `SMTP_PASSWORD=...`
- `SMTP_FROM=...`

## 3) Deploy steps (typical)
Upload the repository (Git deploy or file manager), then run:

```bash
npm ci
npm run db:generate
npm run db:deploy
npm start
```

If you don’t use migrations (DB-first workflow), skip `db:deploy`.

## 4) Start command
Use one of these (depending on Hostinger UI):

- `npm start`
- or `node src/server.js`

## 5) Optional: PM2 (if Hostinger supports it)
If you can use PM2 on your plan:

```bash
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save
```

## 6) Verification
- `GET /health`
- `GET /ready`
- Swagger: `/api-docs`
- GraphQL UI: `/graphql/playground`

