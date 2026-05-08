# Security

This file is **mandatory reading** before touching auth, network, sessions, settings, or any endpoint that takes a URL or session ID.

The review found two 🔴 critical issues already shipping. Don't add a third.

## Non-negotiable rules

### 1. SSRF: any user-supplied URL is hostile until proven otherwise

`/api/check-url` (and any future endpoint that fetches a user-supplied URL — including the Tier-3 enrichment scraper) MUST go through a single guard:

- Resolve the hostname to its IPs (`dns.lookup` with `all: true`, both A and AAAA).
- Reject if any resolved IP is in:
  - `127.0.0.0/8`, `::1` (loopback)
  - `169.254.0.0/16`, `fe80::/10` (link-local — covers cloud metadata at `169.254.169.254`)
  - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (RFC1918 private)
  - `fc00::/7` (ULA), `fd00::/8`
  - `0.0.0.0/8`, `100.64.0.0/10` (CGNAT), `224.0.0.0/4` (multicast)
- Reject non-`http`/`https` schemes.
- Reject ports outside `{80, 443}` unless explicitly allowlisted.
- Re-check on every redirect (don't follow blindly). Use `redirect: 'manual'` and re-validate the new hostname before re-issuing.
- Apply a timeout (≤ 5s) and a max body size (≤ 1 MB) on the actual fetch.
- Put this in `lib/ssrf.js` and write tests for each rejection class.

The two outbound hosts we explicitly allow (`places.googleapis.com`, `api.apollo.io`) bypass this guard because they're constants in code, not user input.

### 2. Cross-user state isolation

`progressSessions`, `mapsSeenSessions`, and any future in-memory map keyed by a session/job ID MUST:

- Store `userId` alongside the value.
- Be looked up with the requesting user's `userId`. A mismatch is a `403`, not a "session not found".
- Have session IDs generated server-side with `crypto.randomUUID()`, not accepted from the client.

The SSE endpoint `/api/maps/search/progress/:sessionId` must verify `req.user.id === session.userId` before subscribing.

### 3. Rate limiting

- `/api/auth/login`: 5 attempts per 15 min per IP. On 6th, return 429 with `Retry-After`. Track per `email` too (slower bucket: 10 per hour) to slow credential-stuffing across IPs.
- `/api/auth/register`: 3 per hour per IP.
- `/api/maps/search`, `/api/linkedin/search`: 30 per hour per user.
- `/api/settings/validate-key` (or whatever validates Google/Apollo keys): 60 per hour per user.
- All limits configurable via env. Use `express-rate-limit` with a SQLite or memory store.

### 4. CORS and security headers

- Replace `app.use(cors())` with `cors({ origin: process.env.ALLOWED_ORIGIN?.split(',') ?? false, credentials: true })`. Default to `false` (no cross-origin), not `*`.
- `app.use(helmet())` early in the middleware chain. Configure CSP minimally — we serve our own JS only, no inline scripts where avoidable.
- HSTS only when `NODE_ENV === 'production'` AND the operator has set `FORCE_HTTPS=1`. We don't want to break local self-host.

### 5. API keys at rest

- Google + Apollo API keys are encrypted with AES-256-GCM before insert into SQLite.
- Encryption key (`MASTER_KEY`) is read from env. 32 bytes, base64 or hex.
- Per-row 12-byte IV, stored alongside ciphertext + 16-byte auth tag.
- `lib/crypto.js` exposes `encrypt(plaintext) → { ct, iv, tag }` and `decrypt({ ct, iv, tag }) → plaintext`.
- On first start after this lands, run a migration that re-encrypts existing plaintext keys. After migration, the column never holds plaintext again.
- If `MASTER_KEY` is missing, the server **refuses to start** with a clear error message (don't silently fall back to plaintext).

### 6. Passwords

- bcryptjs cost factor ≥ 10. Never lower.
- Plan to migrate to `argon2id` (Tier 4). When migrating, support both hashes during a rolling rehash on next login.
- Never log password fields. Never include the password in any error response.
- No password length cap below 128. Truncate at 1024 to avoid DoS.

### 7. Sessions / tokens

- Bearer tokens are 32 random bytes, base64url, generated server-side.
- Stored hashed (SHA-256) in `sessions.token` so a DB read doesn't grant impersonation. Compare with constant-time.
- Set an absolute expiry (default 30 days) and an idle expiry (default 7 days, refreshed on use).
- `/api/auth/logout` deletes the session row. A "log out everywhere" endpoint deletes all rows for `userId`.

### 8. Input validation reminders

- Email: validated by a strict regex AND length-capped.
- Numbers: parsed, bounded, NaN-rejected.
- File names in exports: sanitize against path traversal (`../`, drive letters, NUL, control chars).
- Anything inserted into XLSX/CSV: prefix `=`, `+`, `-`, `@` cells with a single quote to defang **CSV injection** in Excel/Sheets.

### 9. Dependencies

- `xlsx@0.18.5` is vulnerable. Replace with `exceljs` (preferred) or `@e965/xlsx` patched fork.
- Run `npm audit` in CI. Treat **high** and **critical** as build-failing.
- Pin versions in `package.json` (no caret on transitive-risk packages once we migrate). Lockfile is committed.

### 10. Logging hygiene

- Auth endpoints log: timestamp, user agent, IP, email (lowercased), outcome (`success`/`bad_password`/`unknown_user`/`rate_limited`). They do **not** log the password or the resulting token.
- Search endpoints log: userId, source, sanitized params, result count, cost. They do **not** log the API key or full response payload.
- A 500 logs the full error with a request ID, but the response body has only the request ID and a generic message.

### 11. Threat model assumption

Treat every authenticated user as a **semi-trusted attacker**. They can craft any HTTP request to any endpoint. Your job is to ensure they can only see, modify, and spend on their own data.

A self-hosted operator running this on the open internet must be safe by default. "It's only used internally" is not a defense — the live demo at `superextractor.broodle.in` makes this a real exposure today.

## Things to ask the user before doing

- Anything that exposes new outbound destinations.
- Anything that adds a new auth provider, session mechanism, or token format.
- Anything that drops a security check "to make local dev easier".
- Force-pushes or destructive DB migrations.
