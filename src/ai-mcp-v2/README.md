# Connect CMS AI MCP v2

This is a separate read-only API. It does not replace the existing stdio MCP (`npm run mcp:start`, `mcp/server.js`, `MCP_JWT`). Leave the original server running until this API has been approved for migration.

The API is off unless `AI_MCP_V2_ENABLED=true`.

## Endpoints

Mounted at `/api/v2/ai-mcp` on the existing API process, and on the optional standalone process.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | No | Service status and which provider names have keys. No secrets. |
| GET | `/tools` | Bearer JWT | Tool names and descriptions. |
| POST | `/tools/:name` | Bearer JWT | Run one approved tool and return its structured result. |
| POST | `/ask` | Bearer JWT | Ask a question. The selected provider may call the same tools. |
| POST | `/mcp` | Bearer JWT | MCP JSON-RPC for Cursor and Claude.ai. `initialize`, `tools/list`, and `tools/call` return JSON. GET is not an event stream. |

`POST /ask` body:

```json
{ "message": "What is my total revenue and expense this month?", "provider": "openai" }
```

`provider` is optional. Supported values are `openai`, `anthropic`, and `gemini`.

The response includes the provider's explanation and the tool payloads. Use the tool payloads as the figures. Amount to collect is `SUM(job.totalcost)` for jobs whose `job.date` is in the month. Cash collected is `SUM(jobcollections.amount)` by `collectedat`. Expenses are `SUM(jobexpenses.amount)` by `createdat`. The API does not subtract those figures or call the result profit.

## Authentication

Send `Authorization: Bearer <jwt>` from the existing login flow. The token's `userid`, `tenantid`, and `branchid` are the only scope. Tenant and branch values in the question, tool arguments, or JSON body are ignored.

The existing branch-membership check still applies. A manager or organization admin sees the branch. Any other user sees jobs assigned to that user, and only their own open attendance session.

Users who belong to more than one branch choose the branch through the existing context switch, which issues a token for that branch. This API does not accept a branch override.

## Provider configuration

Provider API keys and MCP client connections are different.

- An OpenAI, Anthropic, or Gemini key lets `POST /ask` call that provider.
- Cursor and Claude.ai connect as MCP clients to `/mcp`. Saving a provider key does not connect either client.
- Only one provider key is required to test that provider.

Environment variables, all optional except the enable flag:

- `AI_MCP_V2_ENABLED`
- `AI_MCP_V2_PORT` (standalone only, default `3102`)
- `AI_MCP_V2_DEFAULT_PROVIDER`
- `AI_MCP_V2_OPENAI_API_KEY`
- `AI_MCP_V2_OPENAI_MODEL`
- `AI_MCP_V2_ANTHROPIC_API_KEY`
- `AI_MCP_V2_ANTHROPIC_MODEL`
- `AI_MCP_V2_GEMINI_API_KEY`
- `AI_MCP_V2_GEMINI_MODEL`
- `AI_MCP_V2_DATABASE_URL`
- `AI_MCP_V2_TIMEOUT_MS`
- `AI_MCP_V2_QUERY_TIMEOUT_MS`
- `AI_MCP_V2_MAX_ROWS`

Keys stay in the server environment. They are not returned, written into prompts, or logged.

## MCP clients

Cursor, in a separate client config (do not replace `.cursor/mcp.json` for the original server):

```json
{
  "mcpServers": {
    "connect-cms-ai-mcp-v2": {
      "url": "http://127.0.0.1:3102/api/v2/ai-mcp/mcp",
      "headers": {
        "Authorization": "Bearer <jwt>"
      }
    }
  }
}
```

Claude.ai custom connector: use the same HTTPS URL and send the bearer token in the connector's authorization header. The deployed URL must be reachable by Claude.ai. A provider API key is not a Claude.ai connection.

The original stdio MCP remains `npm run mcp:start`.

## Database permissions

Tools run fixed `SELECT` statements with bound parameters. The server rejects other statements before execution. Joins repeat the authenticated tenant and branch, including customer, status, expense, and collection rows.

PostgreSQL row-level security is not enabled on these tables. Isolation is enforced by the predicates in this API. The Node process can still hold a read-write `DATABASE_URL`. For a database-level guarantee, create a role that has `SELECT` on the required tables and set `AI_MCP_V2_DATABASE_URL` to that role. The application timeout stops waiting; a role-level `statement_timeout` is what cancels the query on the server.

Date ranges use UTC. Supported periods are today, yesterday, this_week, previous_week, this_month, previous_month, this_quarter, this_year, year_to_date, previous_year, all_time, and custom `from`/`to` (YYYY-MM-DD). Job lists return `totalMatched` plus a page (`limit` up to 100, `offset` for the next page). Scope is still only the JWT tenant, branch, and assigned-job rule.

## Run and test

```bash
AI_MCP_V2_ENABLED=true npm run ai-mcp-v2:start
npm run test:ai-mcp-v2
```

To serve v2 from the existing API process instead of port 3102, set `AI_MCP_V2_ENABLED=true` and start the API as usual. The route is `/api/v2/ai-mcp`.

The test suite uses fixtures. It does not write to the database.

## Rollback

Set `AI_MCP_V2_ENABLED=false` and stop the standalone process if it is running. The original MCP, its environment variables, and its routes stay in place. No migration is required to turn v2 off.

Do not remove the original MCP until this API has passed review and that removal is explicitly approved.
