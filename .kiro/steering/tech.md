# Tech

## Runtime & language

- **Node.js** (Express 4). CommonJS (`require`), not ESM. Don't migrate to ESM unless explicitly asked — it would touch every file.
- **Vanilla JavaScript** on the frontend. No framework. No build step. Files are served straight from `public/`.
- **No TypeScript.** Don't introduce it without explicit request — the project's value is being trivially auditable.

## Current dependencies (`package.json`)

- `express ^4.18.2` — HTTP server
- `cors ^2.8.5` — currently wide open; must be tightened (see security.md)
- `better-sqlite3 ^12.9.0` — synchronous SQLite, fast, fine for single-instance
- `bcryptjs ^3.0.3` — password hashing (slow pure-JS; acceptable, but argon2 is the long-term target)
- `dotenv ^16.3.1` — **listed but never `require`d**; wiring it up is a Tier-2 task
- `xlsx ^0.18.5` — **has known prototype-pollution CVEs**; replace with `exceljs` or pinned patched fork as part of Tier 2

## Dependencies we will add (planned, not yet present)

- `helmet` — security headers
- `express-rate-limit` — login/search/API rate limits
- `node-fetch` is already builtin via global `fetch` in modern Node; prefer global `fetch`
- `exceljs` — replace `xlsx`
- `pino` + `pino-http` — structured logging
- `vitest` — tests
- `eslint` + `prettier` — linting/formatting

Don't add anything else without justification. Every dependency is a future CVE.

## Scripts

```bash
npm install
npm start      # node server.js — production
npm run dev    # currently identical to start; add nodemon if introducing reload
```

Server listens on **port 3000** (hardcoded today; must read `process.env.PORT` once dotenv is wired).

## External services (the only outbound calls allowed)

- `https://places.googleapis.com/v1/...` — Google Places API (New)
- `https://api.apollo.io/api/v1/...` — Apollo people search & health check

If you find yourself adding another outbound host, stop and ask. Keeping the egress surface small is a feature.

## Storage

- SQLite file at `./data/sde.db`, WAL mode, foreign keys ON.
- Tables: `users`, `sessions`, `extractions`, `extraction_results`, `activity_logs`, plus settings/keys storage. See `database.js` for source of truth.
- Migrations: none yet. Adding a `schema_migrations` table is a Tier-4 task. Until then, additive-only schema changes guarded by `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN` with try/catch.

## Auth

- Bearer tokens in `sessions` table. Sent as `Authorization: Bearer <token>`.
- bcryptjs for password hashing.
- No JWTs, no OAuth, no SSO. Don't add them without a real reason.

## Real-time progress

- **SSE** on `/api/maps/search/progress/:sessionId`.
- Sessions are currently global Maps; they MUST be bound to userId (see security.md).
- WebSocket migration is Tier-3 and optional.

## Node version

Target Node 18+ (for global `fetch`, `AbortController`, structuredClone).

## Platform notes

- Development on Windows; production targets Linux. Avoid `path.sep` assumptions; use `path.join`.
- Don't shell out to platform-specific binaries. Pure JS only.
