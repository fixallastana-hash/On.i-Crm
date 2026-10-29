/* SENIOR-PATCH-b2-auth-module */
/* Post-init alias module. Loaded AFTER the inline <script> that runs
 * firebase.initializeApp(). Does NOT initialize Firebase, does NOT duplicate
 * firebaseConfig. Only publishes window.fbApp/fbAuth/fbDb aliases pointing
 * at the same singletons the inline code already created.
 *
 * Rationale (B.2 deviation): _oniPushIdToken / _oniRefreshClaims /
 * loginViaFirebase are tightly coupled to core.js globals (products=[],
 * callCloudFn, _fbLoadActiveShop, _fbSyncPull, startProductsWatcher,
 * _oniSetClaims, window.Android.setIdToken) and cannot be safely relocated.
 * The inline Firebase init + secondary app + setPersistence stay inline too.
 */
(function () {
  'use strict';
  if (typeof firebase === 'undefined') {
    try { console.warn('[app-auth] firebase SDK not loaded'); } catch (_) {}
    return;
  }
  if (!firebase.apps || firebase.apps.length === 0) {
    try { console.warn('[app-auth] no firebase app yet — inline init must run first'); } catch (_) {}
    return;
  }
  try {
    var _app = firebase.apps[0];
    window.fbApp  = _app;
    window.fbAuth = _app.auth();
    window.fbDb   = _app.firestore();
    if (!window.auth) window.auth = window.fbAuth;
    if (!window.db)   window.db   = window.fbDb;
    try { if (window.console) console.log('[app-auth] aliases published: fbApp/fbAuth/fbDb'); } catch (_) {}
  } catch (e) {
    try { console.error('[app-auth] alias publish failed', e && e.message); } catch (_) {}
  }
})();
/* end SENIOR-PATCH-b2-auth-module */