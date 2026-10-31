# B.3.0 — Dependency Registry (2026-10-31)

## Inline script blocks
- Block 4: 6333 lines, 623 KB — главный (FIREBASE INIT + AUTH + SYNC + UI)
- Block 1: 24 lines, 1 KB

## Function dependencies (глобалы)

| Function | Deps | Call sites | Verdict |
|----------|------|-----------|---------|
| _fbGetCollectionData | 31 | n/a (switch 27 collections) | Lookup table, not logic — SKIP |
| persist | 28 | 182 (html 152 + core 30) | API of the project — SKIP |
| _fbPullFromFirestore | 28 | 2 (html) | Only candidate for extraction, but 28 deps |
| _fbSyncPull | 22 | 8 (html) | Contains _employeeCheck (security) — SKIP |
| stopProductsWatcher | 21 | n/a | - |
| startProductsWatcher | 20 | 3 (html) | - |
| safeRender | 10 | 68 (html 43 + core 25) | API of the project — SKIP |
| _fbRunSync | 6 | 3 (html) | Only sync-push entry, tied to _fbSync |

## _employeeCheck inside _fbSyncPull (L1636-1683)
- bAuth.signOut()
- localStorage.clear()  ← destroys ALL local data
- location.reload()

**This is security + self-destruct, NOT UI. Do NOT move to app-ui.js.**

## Verdict

- **B.3 (full sync extraction)** — DEFERRED. 28-30h + callsite rewrites (182 persist, 68 safeRender). Risk 30-45%.
- **B.4 (full UI extraction)** — DEFERRED. 35-60h. Risk 40-55%.
- **B.3a (_fbPullFromFirestore only)** — POSSIBLE. 4-6h, risk 15-25%. But not now.
- **B.2 (Firebase init)** — DEFERRED (documented in SECURITY.md B.2 section).

## Decision

Project is stable: B.1 complete, B.2 partial (documented), B.3.1-b3.5 bugfixes in origin
(10 tags). 175 photos lost in B.2 (PITR was OFF, unrecoverable), protection stack installed
(push-merge, pull-merge, PITR 7d, scheduled backups, CORS).

Do NOT refactor further without separate sprint (B.5) with DI contracts + comprehensive
regression tests on multiple devices.