# Conventions

## JavaScript style

- 2-space indent, semicolons, single quotes for strings, backticks for templates.
- `const` by default; `let` only when reassigned; never `var`.
- Async/await over `.then()` chains. Top-level `try/catch` in every route handler.
- camelCase for variables and functions, PascalCase for classes (rare here), SCREAMING_SNAKE for module-level constants (e.g. `GOOGLE_PLACES_URL`).
- Prefer early returns over nested `if`. Keep functions ≤ ~50 lines; split when they grow.
- No `==`. Always `===` / `!==`.

## HTTP route shape

Every route handler:
1. Validates input. Reject with `400` and a `{ error: { code, message } }` shape.
2. Authenticates (via the auth middleware). Reject with `401` if missing, `403` if wrong user.
3. Calls a service function. Routes contain no business logic.
4. Wraps the call in `try/catch`; pass errors to the central error handler via `next(err)`.
5. Returns `{ data: … }` on success. Stream for SSE, otherwise JSON.

```js
// good
router.post('/search', requireAuth, async (req, res, next) => {
  const params = parseSearchParams(req.body);
  if (!params.ok) return res.status(400).json({ error: params.error });
  try {
    const result = await placesService.search(req.user.id, params.value);
    res.json({ data: result });
  } catch (err) { next(err); }
});
```

## Error handling

- One central error middleware. It logs the error with the request ID and returns a sanitized JSON body. Never leak stack traces in production.
- Throw `Error` subclasses or plain `Error` with a `.code` (string, like `'GOOGLE_QUOTA'`, `'APOLLO_BAD_KEY'`). The error middleware maps `.code` → HTTP status.
- Don't swallow errors. If you catch one, either re-throw, log + return a fallback, or propagate via `next(err)`. `catch {}` is forbidden.
- For per-cell / per-task failures inside concurrent work, **isolate** them: use `Promise.allSettled`, never `Promise.all`, when partial success is acceptable. Surface the failures in the run summary.

## Logging

- Use `pino` once introduced; until then, `console.log` / `console.error` with a JSON-ish prefix `[component]`.
- Every request gets a request ID (`req.id`, e.g. via `crypto.randomUUID()`); log it on every line related to that request.
- **Never log secrets.** Not API keys, not passwords, not Bearer tokens, not full request bodies on auth endpoints. When in doubt, log the field name with `[REDACTED]`.
- Log levels: `error` (something is broken), `warn` (degraded but recoverable), `info` (lifecycle events: server start, search start/end), `debug` (per-cell, per-page detail; off by default in prod).

## Input validation

- Validate at the route boundary. Don't trust anything downstream.
- For numbers: parse, bound-check, reject NaN. Radius `100..50000`, maxResults `1..MAX_GOOGLE_RESULTS`, etc.
- For strings: length-cap aggressively (e.g. keyword ≤ 200 chars, email ≤ 254).
- For URLs (anywhere we accept a URL from a user): see `lib/ssrf.js` once created. Hostname must resolve to a public IP.

## Concurrency

- The grid worker pool is concurrency-3. Don't crank it up casually — Google rate-limits and Places quota costs scale linearly.
- Use `AbortController` for any `fetch` that can be cancelled. Wire it to client cancel events.
- No unbounded `Promise.all` on user-supplied arrays.

## Database (`better-sqlite3`)

- `better-sqlite3` is **synchronous**. That's fine — embrace it. Don't wrap calls in `async` to make them look async.
- Always use **prepared statements** (`db.prepare(...)`). Never string-interpolate user input into SQL.
- Wrap multi-statement writes in `db.transaction(() => { ... })()`.
- All time columns are **ISO 8601 strings** in UTC. Use `new Date().toISOString()` (see `nowIso()` in `database.js`).
- Schema changes: prefer additive (`ADD COLUMN`). Nothing destructive without a migration plan.

## Frontend

- Module pattern: each file declares `window.X = { ... }` or uses an IIFE. Don't introduce ES modules without explicit request.
- DOM access: cache selectors at top of the file. Use `data-*` attributes for hooks; never depend on class names that are also styling hooks.
- All fetch calls go through `public/js/api.js`. It already handles the Bearer token; don't bypass it.
- No inline event handlers in HTML (`onclick="..."`). Bind in JS.

## Tests (once Vitest is in)

- Unit tests for pure logic (grid math, cost calc, dedupe, SSRF guard).
- Integration tests for auth + history + export round-trip.
- A test fails the build. No skipped tests in `main`.
- Mock all external HTTP. Tests must run offline.

## Git / commits

- Conventional-commit-ish prefix: `fix:`, `feat:`, `refactor:`, `chore:`, `docs:`, `test:`, `security:`.
- One concern per commit. "Refactor + fix bug" is two commits.
- Never commit secrets, `.env`, or `data/sde.db`. Verify `.gitignore` covers them (it currently does for `node_modules`; extend as needed).
- Don't push directly to `main`. Open a PR.

## Comments

- Comment **why**, not what. The code shows what.
- A `// TODO:` is fine; pair it with an issue or owner. A `// HACK:` requires a follow-up plan.
- Public service functions get a one-line JSDoc `@param`/`@returns` describing units (e.g. `radius in meters`, `cost in INR`).
