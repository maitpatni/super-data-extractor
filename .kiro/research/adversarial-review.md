# Adversarial code review — v2.0

Source: subagent stage `adversarial_review`, May 2026.

## Critical (3)

1. **SSRF DNS-rebinding (TOCTOU).** `assertSafeUrl` resolves once for validation; `fetch()` re-resolves at connect time — attacker controlling DNS can pass validation and still reach 169.254.169.254. _Fix landed in v3.0: undici Agent pins to validated IP._
2. **IPv6 mapped-address bypass.** `[::ffff:127.0.0.1]`, hex form `[::ffff:7f00:1]`, and zone IDs (`fe80::1%eth0`) slipped past the regex. _Fix landed in v3.0: BlockList + custom V6 expansion + mapped-V4 extractor._
3. **Apollo full-DB scrape.** `searchProfiles` with all-empty filters returned the entire Apollo DB paginated. _Fix landed in v3.0: ValidationError when no filter is set._

## High (5)

4. **Mid-run spend abort missing.** Daily INR ceiling was pre-flight only. _Fix landed: `costCeilingInr` threaded into `runMapsSearch`, abort on overrun._
5. **Bulk job resume re-runs from scratch.** _Fix landed: `completedIndices` persisted in `progressJson`._
6. **Login timing oracle.** Missing-user path skipped bcrypt entirely. _Fix landed: dummy bcrypt against random hash._
7. **Webhook delivery is persistent SSRF.** Triggered by job completion. _Fix landed via #1: webhooks now use the same `safeFetch`._
8. **`MASTER_KEY` cache never invalidates.** Operator key rotation silently used old key. _Fix landed: cache removed; decode every call._

## Medium (9)

9. Grid `capped` semantics under-subdivided. _Fixed._
10. Density-aware grid races with `places.length >= requested` — wasted in-flight calls. _Partial: spendAborted now breaks the outer loop; in-flight cells still complete their current page._
11. `__SET__` settings sentinel collision (theoretical). _Acceptable risk; documented._
12. Geocode billed at Essentials tier despite PRO field mask. _Fixed in `lib/cost.js`._
13. No 429 / Retry-After handling for Apollo. _Fixed: exponential backoff up to 3 retries._
14. Progress session GC closes long-running SSE. _Mitigated: every `update()` extends TTL; long enrichment without progress remains a risk._
15. `enrichment.js withDomainSlot` Map cleanup race. _Acceptable as long as concurrent calls to the same host are serialized; documented._
16. SQLite single-writer effectively serializes "parallel" jobs. _Documented; not a true bug._
17. `/api/settings` shape change with `__SET__` sentinel. _Frontend handles unchanged because key field is opaque._

## Low (13)

18. bcrypt rounds = 10 (acceptable; OWASP recommends 12+).
19. No sliding session expiry (deferred — listed as planned in roadmap).
20. `0.0.0.0` blocked but not unit-tested. _Test added._
21. No CSRF (acceptable: Bearer-only, never cookies).
22. Upstream error messages leak through `UpstreamError`. _Acceptable; can sanitize later._
23. `getExtractionHistoryByUser` loads all results per row (perf, not correctness).
24. Autocomplete SKU not counted in cost meter.
25. `q_organization_industry_keywords` may be deprecated upstream.
26. Test coverage gaps: enrichment, bulk resume, webhook signing, rate limiting.
27. README claimed "per-cell retry"; code only has isolation. _README updated to reflect reality._
28. Migration 0002 idempotency relies on `enc:v1:` prefix (negligible collision risk).
29. AES-GCM nonce reuse risk irrelevant at our volume.
30. `/api/check-url` per-target-domain rate limit absent (per-user limit covers it).
