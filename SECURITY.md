# Security

## Known issues

### uuid <11.1.1 (moderate, GHSA-w5hq-g745-h8pq)
- Transitive dependency: firebase-admin -> @google-cloud/firestore -> google-gax -> uuid
- Vulnerable only when `buf` is passed to `v3/v5/v6` API
- Firebase Admin SDK does not call uuid this way
- Fix requires firebase-admin@14.5.0 (breaking change)
- Decision: accepted until planned firebase-admin upgrade

### ts-deepmerge <8.0.0 (moderate, GHSA-87mf-gv2c-c62c)
- Dev dependency only: firebase-functions-test
- Not in production bundle
- Decision: accepted
### AI direct-key fallback (accepted, by design)
- `MainActivity.callSelectedProvider` first tries `aiProxy` (server, keys not in APK),
  then falls back to direct calls to Gemini/OpenAI/DeepSeek/Groq using keys stored
  in `SharedPreferences` (`oni_ai`).
- Rationale: multi-provider setup with different rate limits and free tiers;
  aiProxy alone cannot cover all users/providers reliably, especially offline
  from Firebase or during Firebase outages.
- Mitigations in place:
  - `aiProxy` is always tried first when `aiIdToken` is present.
  - Keys are per-device (`SharedPreferences`, not in git, not in APK).
  - `deepseek_helpers.txt` is injected via CI, not compiled into sources.
- Residual risk: a device compromise yields the user's own LLM keys, not the
  project's server keys. Blast radius is limited to that user's quota.
- Decision: accepted until Phase 4 (App Check + EncryptedSharedPreferences).

### `memberOf` client-writable (RESOLVED in Phase 4a, 2026-10-29)
- `users.update` allows `memberOf` in `affectedKeys().hasOnly([...])`.
- A user with DevTools can self-grant `memberOf['shop-any'] = 'owner'`,
  and `isMemberOf()` / `hasRole()` will return true for that shop.
- `firestore.rules` is **validation, not authorization** until `memberOf`
  moves to Custom Claims (`request.auth.token.shops`).
- Why accepted: P0-3 removed `role` but left `memberOf`, and moving it to
  Custom Claims requires `admin.auth().setCustomUserClaims()` + re-issue of
  ID tokens + client-side role reads from JWT. That is Phase 4 work.
- Decision: accepted until Phase 4 (Custom Claims + App Check).

### Phase C complete (tag c-complete)
- CF `deleteEmployeePermanently` (v2, Node 24): guards (self, owner-role, multi-shop), mirror delete (localId or by authUid), users doc delete, invites invalidated, Auth delete with try/catch (`auth/user-not-found` -> `authDeleted: true`).
- Client `deleteEmployee`: two-step confirm ("НАВСЕГДА" / "необратимо"), CF-first, no local changes on CF failure, alert on `authDeleted === false`.
- IAM: `firebase-adminsdk-fbsvc@oni-crm-b4975` + `oni-crm-b4975@appspot` in `roles/firebaseauth.admin` (required for `admin.auth().deleteUser`).
- CI: `.github/workflows/android-build.yml` builds debug APK on push to `android-project/**`, publishes to Release `latest`.
- Runtime verified: hard delete (Auth gone, users doc gone, mirror gone, invites invalidated, actionHistory `employee_deleted_permanently`), pull does not resurrect.



## Phase 4a — Custom Claims (2026-10-29)

### Done
- `functions/claims.js`: `syncClaimsFor(uid)` + `syncClaims` onCall
- `functions/membership.js`: `syncClaimsFor` вызывается в `setUserMembership`, `removeUserFromShop`, `acceptInvite`, `ensureUser` (маркер `SENIOR-PATCH-4a`, 5 вхождений)
- `functions/index.js`: `exports.syncClaims = require("./claims").syncClaims;`
- Клиент (`index.html`): `_oniClaims`, `_oniSetClaims`, `_getRoleForShop`, `_oniRefreshClaims`; hooks: login (force=true), onIdTokenChanged, 5-min cached refresh
- `_employeeCheck`: claims-first, fallback `doc.memberOf`
- Backfill: 7/7 users with claims, 0 fail; verify: total=11 auth, withClaims=7, without=4 (orphaned auth)

### Accepted tech debt (→ 4a.1)
1. `deleteShop` не синкает claims для caller; stale `shops[deletedShopId]` до следующего re-login. Rules не страдают (читают `memberOf`). Fix: 5 строк `await syncClaimsFor(callerUid)` в `deleteShop`.
2. `_getRoleForShop` fallback на `memberOf` — снять после 1 релиза стабильности.
3. `authUid` / `password` / `authEmail` в `users.update.hasOnly` — снять после проверки, что клиент их не пишет в Firestore. `password` — legacy candidate на удаление.
4. 4 orphaned Auth-accounts без `users/{uid}` — `cleanup_orphans.js` в 4a.1.
5. `index.js` moji=7 (pre-existing mojibake в русских комментариях) — cleanup при следующем крупном рефакторинге.
6. CRLF warnings в `git diff` — добавить `.gitattributes` с `* text=auto`.
7. `deleteShop` / `deleteEmployeePermanently` не трогали — по плану 4a.

### Encoding rule (для будущих сессий)
Редактирование `index.html` и `functions/*.js`:
- Через Notepad: **Save As → UTF-8 без BOM**.
- Через PowerShell: **только** `[IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)` / `[IO.File]::WriteAllText($p, $c, (New-Object Text.UTF8Encoding($false)))`.
- **Никогда**: `Get-Content -Raw` / `Set-Content` / `Out-File` (PS 5.1 → double-encode, +50% к размеру).
- Вставляемый через PS код — **ASCII only** (комментарии по-английски).
- Проверка после патча: `moji (D0 A0)` совпадает с pre-patch.
- Инцидент 2026-10-29: первая попытка PS-патча нанесла урон (815996→1322850 chars), восстановлено `git checkout`.

### Public repo — PII guard
Репо **публичный**. `.gitignore` содержит: `*.pre4a.*`, `sa.json`, `**/sa.json`, `users.json`, `functions/users.json`. Не коммитить backup-файлы, не выкладывать service account.
## Phase B.1 — модуляризация, шаг 1

- **ARCHITECTURE DECISION:** classic `<script src>`, без bundler и build-step.
  Порядок загрузки: `app-storage.js` → `core.js` → `ui-extra.js` → inline.
  `app-storage.js` грузится **перед** `core.js`, так как `core.js` использует IDB-переменные лениво.
- **Вынесено:** STORAGE block (бывшие lines 244–302 `index.html`) → `app-storage.js` (2551 байт).
  Содержит: `IDB_NAME`, `IDB_STORE`, `BACKUP_KEY`, `_lsShopId`, `_migrateP11Keys`, `CRM_BACKUP_VERSION` и обработчики `saveUiState`.
- **Diff:** `index.html` 825 227 → 822 911 байт (−2 316). 
- **moji invariant:** sum(index.html + app-storage.js) = 39 + 0 = 39. Mojibake не появилось.
- **CI:** Успешно собран APK (commit `e7b8928`), опубликован в `latest`.
- **🚨 Выявлен баг среды (блокирует сохранение):** На устройстве Redmi 13 Pro (HyperOS, Android 14, WebView 156.0.8078.47) `indexedDB` возвращает `undefined`. Из-за этого `idbSet` и `idbDelete` падают с ошибкой `TypeError`, и данные не сохраняются после перезапуска приложения. 
- **Следующий шаг (B.2):** Реализовать архитектуру устойчивого хранилища (Fallback: IndexedDB → localStorage → Firestore). Вынести Firebase init + auth.

## B.2 - Storage fallback + Firebase alias module (`b2-complete`)

### Storage (полностью реализовано)
- `safeStorageSet/Get/Delete` в `app-storage.js`: IDB-first, `localStorage`
  fallback под `oni_ls_*` namespace. Все callsites `core.js` (5) и
  `index.html` (3) переименованы в `safeStorage*`; определения
  `idbGet/Set/Delete` сохранены для обратной совместимости.
  One-time `LS → IDB` migration через `migrateLsToIdb()` при возврате IDB.
- **Verified:** Redmi 13 Pro (HyperOS, Android 14, WebView 156,
  `indexedDB === undefined`) - товар `B2-TEST` persisted после force-stop.

### Auth (отклонение от B.2-спеки - согласовано)
- **Исходный план:** вынести `firebase.initializeApp` + `_oniPushIdToken` /
  `_oniRefreshClaims` / `loginViaFirebase` в `app-auth.js`.
- **Причина отклонения:**
  - `const firebaseConfig` используется в **8 местах** inline.
  - `let fbApp, fbDb, fbAuth` - lexical binding, на них 100+ мест inline.
  - `loginViaFirebase` мутирует 18+ глобалов `core.js` и вызывает
    `callCloudFn`, `_fbLoadActiveShop`, `startProductsWatcher`, `_fbSyncPull`.
  - `_oniPushIdToken(_tries)` - retry-loop + `window.Android.setIdToken()`.
  - `_oniRefreshClaims(force)` использует `_oniSetClaims`, `window._oniClaims`,
    `safeRender`.
  - Secondary app (`initializeApp(config,'secondary')`) + `setPersistence(LOCAL)` inline.
- **Что сделано в `app-auth.js`:** alias-модуль (~50 строк). Загружается **после**
  inline `<script>`, публикует `window.fbApp/fbAuth/fbDb` = `firebase.apps[0].*`.
  Не инициализирует Firebase, не дублирует `firebaseConfig`.
- **Script order (обязательный):**
  firebase SDK → app-storage.js → core.js → inline <script> → app-auth.js → ui-extra.js
- **Verified:** desktop Chrome (aliases, login, Custom Claims, secondary app) +
  Redmi 13 Pro (`[B.2]` + `[app-auth]` в logcat, `already exists` отсутствует).

### PII guard
- `sa.json`, `users.json`, `*.bak_b2*` - в `.gitignore`, не в коммите.
## B.2.1 - Category delete pushes to Firestore (`b2.1-category-fix`)

### Problem
Удаление категории (`__CAT__` placeholder в products) в UI удаляло только локально.
При следующем pull из Firestore запись возвращалась - категория "воскресала".

### Root cause
Функция удаления категории (в `openCategoryManager`) делала только
`products = products.filter(...)` + `persist('products')`, без Firestore delete.
Сравните: `deleteProduct(id)` (line 1146) уже имел `fbDb...doc(id).delete()` - а
удаление категории нет.

### Fix (SENIOR-PATCH-b2.1-category-delete)
В `core.js` блок удаления категории теперь:
1. Захватывает `isCategoryPlaceholder` записи до фильтра
2. Для каждой - `fbDb.collection('shops').doc(FB_SHOP_ID).collection('products').doc(id).delete()`
3. Пишет tombstone в `productTombstones` (для pull-фильтра)
4. Только потом `persist('products')`

### Verified
- logcat: `[catDelete] product doc deleted <id>` + `[catDelete] tombstone written <id>`
- Console: `products.filter(p => p.category === 'Arman').length === 0`
- Force-stop + restart: категория не вернулась, pull не воскрешает.

### Still known
- Обычная кнопка "Удалить товар" на категории **специально** блокируется
  (`if(p.isCategoryPlaceholder) return`) - это by design, категории удаляются
  только через "Управление категориями".
## B.3.5 - Dependabot CVE-2026-93753 (`deepmerge`) - Accepted risk

### Alert
- Package: `deepmerge` (npm)
- Advisory: GHSA-gcqx-w48m-w2h4 / CVE-2026-93753
- Affected: >= 4.2.0, <= 4.3.1
- **Patched version: None** (no fix available as of 2026-10-31)
- Severity: low (CVSS 4.0 - Integrity Low only)

### Why accepted
- **Transitive dev dependency**, not our code:
  `functions` -> `firebase-functions-test@3.5.0` -> `jest@30.5.2`
  -> `@jest/core@30.5.2` -> `jest-config@30.5.2` -> `deepmerge@4.3.1`
- `"dev": true` in `functions/package-lock.json` - build/test only, not runtime
- Not reachable in production Cloud Functions (no runtime import)
- No patched version exists; `npm audit fix` cannot resolve
- Cannot safely override to a fork (prototype poisoning itself is the risk)

### Mitigation
- Monitor `dependabot/4` - close when upstream releases patch
- If `deepmerge` becomes runtime-reachable (user-supplied objects to mergeObject) - revisit immediately

### Status
- Accepted as of 2026-10-31 (tag `b3.5-dependabot-accepted`)
- Re-evaluate: (1) when patched version published, (2) if deepmerge enters runtime path
## B.3.4 - Namespace cleanup: `sklad_crm_*` -> `oni_ls_*`

### Problem
After B.2 migration, localStorage had both `sklad_crm_*` (legacy) and
`oni_ls_*` (new) keys - 764 KB of duplicated data.

### Audit (dry-run, 2026-10-31)
- 26 IDENTICAL pairs (products 383KB, orders 46KB, movements 31KB,
  shifts 6KB, purchases 2KB, contacts 1KB, 20× 0KB) - byte-for-byte equal.
- 2 ACTIVE_TOMBSTONES (`_recent_deletes`, `_tombstones_synced`) - kept.
- 2 UNKNOWN active in code - kept:
  - `sklad_crm_ui_state` (core.js:82) - UI state writer
  - `sklad_crm_last_uid` (index.html:702,718) - user-change detector

### Action
Browser Console script: for each `sklad_crm_*`, verify
`skladVal === oniVal` byte-for-byte, delete only if identical.
Immediate post-delete verification: `oni_ls_*` still exists.
No backup needed - `oni_ls_*` is the identical copy.

### Result
- freed: ~468 KB (990 → 520 KB)
- deleted: 26 IDENTICAL pairs
- kept: 4 active (2 tombstones + 2 UNKNOWN)
- failed: 0, skipped: 0
- No code change, no data loss (data survived in oni_ls_*)

### Verified
- force-stop + restart: [B.2] + [app-auth], no ReferenceError
- Baraka with photo, 271 products, categories visible
- Deleted products not resurrected (tombstones intact)

### Note
Cleanup executed via browser console, NOT in code.
Tag b3.4-namespace-cleanup documents the operation (no app file changes).