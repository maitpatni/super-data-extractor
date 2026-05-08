# Structure

## Today (as of initial review)

```
super-data-extractor/
├── server.js              # 1968-line monolith — everything: routes, services, helpers
├── database.js            # SQLite layer (schema, prepared statements, helpers)
├── package.json
├── README.md
├── SPEC.md                # Original product spec (UI/UX, fields, acceptance criteria)
├── data/
│   └── sde.db             # SQLite (gitignored)
└── public/
    ├── index.html         # App shell (post-login)
    ├── landing.html       # Marketing/landing page
    ├── favicon.svg
    ├── css/
    │   └── styles.css
    └── js/
        ├── app.js         # Main app glue (~41 KB)
        ├── auth.js        # Login/register UI
        ├── googleMaps.js  # Maps extractor UI (~72 KB)
        ├── linkedin.js    # Apollo/LinkedIn UI
        ├── export.js      # XLSX/CSV download
        ├── api.js         # fetch wrapper + token handling
        ├── router.js      # hash-based router
        └── utils.js       # shared helpers
```

`server.js` is a monolith. Don't make it worse. Every new responsibility goes into the target layout below.

## Target layout (refactor goal — Tier 4)

```
super-data-extractor/
├── server.js                       # ≤ 100 lines: app bootstrap + mount routers
├── database.js                     # keep as-is (or split into db/ if it grows)
├── routes/
│   ├── auth.js                     # /api/auth/*
│   ├── maps.js                     # /api/maps/* (and the /api/google-maps/* alias, deprecated)
│   ├── linkedin.js                 # /api/linkedin/* (Apollo)
│   ├── export.js                   # /api/export/*
│   ├── history.js                  # /api/history/*
│   ├── settings.js                 # /api/settings/* (API keys, prefs)
│   └── health.js                   # /api/health, /api/check-url (hardened)
├── services/
│   ├── places.js                   # Google Places client + grid logic
│   ├── apollo.js                   # Apollo client
│   ├── enrichment.js               # website scrape fallback for emails/socials
│   └── cost.js                     # SKU-aware cost calculator
├── middleware/
│   ├── auth.js                     # Bearer token → req.user
│   ├── rate-limit.js               # express-rate-limit configs
│   └── errors.js                   # central error handler, request IDs
├── lib/
│   ├── progress.js                 # progressSessions Map, user-bound
│   ├── cache.js                    # geocode cache (SQLite-backed, TTL)
│   ├── grid.js                     # grid math: cells, density-aware subdivide
│   ├── crypto.js                   # AES-256-GCM for API keys at rest
│   └── ssrf.js                     # private-IP guard for outbound URL checks
├── jobs/
│   └── bulk-runner.js              # resumable bulk jobs (Tier 3)
├── migrations/
│   └── 0001_init.sql               # once schema_migrations exists
├── tests/
│   ├── grid.test.js
│   ├── cost.test.js
│   ├── auth.test.js
│   └── ssrf.test.js
├── public/                         # unchanged structure; consider splitting googleMaps.js
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── ecosystem.config.js             # PM2
└── .kiro/
    └── steering/                   # these files
```

## Refactor rules

- **One responsibility per file.** A route file imports services, validates input, returns JSON. A service file talks to one external API or one domain concept.
- **No circular imports.** `routes → services → lib`. Never the other direction. `database.js` is a leaf — services use it; nothing in `lib/` imports `database.js`.
- **Move, don't rewrite.** Refactoring `server.js` should be cut-and-paste with minimal logic changes per commit, then verify, then change behavior. Don't combine "split file" with "fix bug" in one commit.
- **Public API stays stable across the refactor.** All existing endpoints keep their paths and shapes. The frontend should not need to change for Tier 4.

## Frontend

- Keep vanilla JS. No bundler, no module system beyond `<script>` tags in load order.
- If `public/js/googleMaps.js` exceeds 80 KB, split by feature (form, results table, progress UI) — but only when touching it for another reason.
- CSS stays in one `public/css/styles.css`. Use the variable system already defined in `:root` (see `SPEC.md`); don't introduce a new design system.

## Where things go (quick lookup)

| You're adding… | Put it in |
|---|---|
| A new HTTP route | `routes/<domain>.js` |
| A new external API call | `services/<provider>.js` |
| A new database query | `database.js` (export a function) |
| A pure helper used in 2+ services | `lib/` |
| A new middleware | `middleware/` |
| A long-running async job | `jobs/` |
| Schema change | new file in `migrations/` |
| New config knob | `.env.example` + read in `services/config.js` (create if needed) |
