# Statistics operations

The production Pages project uses D1 `poteto-stats`, bound as `STATS_DB`. Apply `schema.sql` once in the D1 console. All updates for an accepted submission run inside one SQLite statement and its triggers; partial totals cannot be committed. Transient submission rows are immediately removed. The latest batch ID is retained per browser; Turnstile tokens are single-use and the client never retries an ambiguous write.

Production variables:

- `TURNSTILE_SITE_KEY`: public site key for the widget restricted to `poteto.cc`, Managed mode, no pre-clearance.
- `TURNSTILE_SECRET`: encrypted Pages secret. Never put this value in source, build output, client code or a command line.
- `STATS_DB`: D1 binding. Do not bind production storage to preview deployments.

The API accepts only the production HTTPS origin. POST additionally requires same-origin JSON, a bounded 8 KiB body, 1–20 plausible completed games, and server-verified Turnstile hostname, action and batch binding. No permissive CORS headers are emitted. Query strings and other paths are rejected. Requests to the Pages preview hostname cannot update totals.

The production zone has an active rate-limiting rule matching URI paths starting with `/api/stats`, allowing 10 requests per source IP per 10 seconds, blocking for 10 seconds. This is the Free-plan rule. Keep it scoped to the statistics endpoints; game assets and controls must never depend on a challenge. A separate custom rule rejects query strings, invalid paths/methods and non-origin JSON submissions before they invoke Functions. Both rules use Block, never an interactive challenge. Preserve unrelated existing rules. If the free rule slot is already used, keep that rule and rely on the application controls until a deliberate policy change is made.

## Free-plan budget

D1 includes 5 million row reads and 100,000 row writes daily; Workers Free includes 100,000 requests daily, shared across the account. The database allows at most 4,000 accepted batches per UTC day. Each accepted batch changes six rows before bounded cleanup/index costs; a conservative budget of 16 written rows per accepted batch is 64,000 writes/day. Actual D1 row billing includes index operations. This leaves headroom, but other projects share the account limits.

Statistics GET reads one pre-aggregated row after an edge-cache miss. Edge caching reduces database reads, not Function invocation counts. There are no timers on the server, paid queues, per-game KV writes, raw event history or scheduled aggregation jobs. Browser refreshes are demand-driven, no more than every 15 minutes. After errors the last cached snapshot stays visible and is marked as stale.

The client queue is deliberately memory-only. Closing a tab, blocking verification, opting out, rate limits or quota exhaustion may omit games. These are community statistics, not a competitive leaderboard or proof of an authentic human score. A public browser client cannot prevent a determined attacker from fabricating plausible results. Origin checks alone do not authenticate non-browser clients; verification, source limits and global caps provide separate layers.

A sufficiently distributed attack can still exhaust the free request quota. Keep the Workers plan Free and `_routes.json` narrowly scoped: the static game remains available even when Functions or D1 are unavailable. Never upgrade billing automatically. Turn off collection by removing the production secret; reads can remain available. The existing static deployment is also a rollback option.

## Validation

`npm test` covers real SQLite transactions, concurrent submissions, quota boundaries, UTC rollover, verification failures, invalid/oversize requests, cached reads and privacy boundaries. It requires Node.js 22.13+ for the built-in SQLite test adapter.

For a visual-only local fixture, run `node scripts/serve.js --stats-fixture`; the fixture is served only by the loopback development server, is outside `site/`, and cannot be published by Pages. It does not submit data. Use normal `npm start` to check the unavailable API state. Never seed production with demonstration counts.

References: [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [rate-limiting plans](https://developers.cloudflare.com/waf/rate-limiting-rules/).
