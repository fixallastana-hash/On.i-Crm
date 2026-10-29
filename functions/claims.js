// functions/claims.js
// Phase 4a: Custom Claims — shops map. memberOf = source-of-truth, claims = зеркало.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const db = () => admin.firestore();

// SENIOR-PATCH-4a: internal helper. НЕ экспортировать через Object.assign в index.js.
async function syncClaimsFor(uid) {
  if (!uid || typeof uid !== "string") throw new Error("syncClaimsFor: uid required");
  const snap = await db().collection("users").doc(uid).get();
  const memberOf = (snap.exists && (snap.data() || {}).memberOf) || {};
  const shops = {};
  for (const [shopId, raw] of Object.entries(memberOf)) {
    const role = typeof raw === "string" ? raw : (raw && raw.role) || null;
    if (role) shops[shopId] = role;
  }
  if (Object.keys(shops).length === 0) {
    await admin.auth().setCustomUserClaims(uid, null);
  } else {
    await admin.auth().setCustomUserClaims(uid, { shops });
  }
  return shops;
}

exports.syncClaimsFor = syncClaimsFor;

exports.syncClaims = onCall(async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const shops = await syncClaimsFor(request.auth.uid);
  return { ok: true, shops };
});