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

### `memberOf` client-writable (accepted until Phase 4)
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
