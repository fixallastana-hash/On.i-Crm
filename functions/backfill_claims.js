// backfill_claims.js -- Phase 4a, one-shot, idempotent
const admin = require("firebase-admin");
const fs = require("fs");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync("C:/Users/arman/sa.json","utf8"))) });
const db = admin.firestore();
(async () => {
  const users = await db.collection("users").get();
  console.log("users:", users.size);
  let ok = 0, fail = 0, cleared = 0;
  for (const doc of users.docs) {
    const uid = doc.id;
    const memberOf = (doc.data() || {}).memberOf || {};
    const shops = {};
    for (const [s, raw] of Object.entries(memberOf)) {
      const role = typeof raw === "string" ? raw : (raw && raw.role) || null;
      if (role) shops[s] = role;
    }
    try {
      if (Object.keys(shops).length === 0) { await admin.auth().setCustomUserClaims(uid, null); console.log("CLEAR", uid); cleared++; }
      else { await admin.auth().setCustomUserClaims(uid, { shops }); console.log("OK", uid, JSON.stringify(shops)); ok++; }
    } catch (e) { console.log("FAIL", uid, e.code || e.message); fail++; }
  }
  console.log("done:", { ok, fail, cleared });
  process.exit(0);
})();