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
