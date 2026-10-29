// check_user_memberof.js -- read a user doc and report memberOf keys
const admin = require("firebase-admin");
const fs = require("fs");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync("C:/Users/arman/sa.json","utf8"))) });
(async () => {
  const args = process.argv.slice(2);
  const uid = args[0];
  if (!uid) { console.error("usage: node check_user_memberof.js <uid>"); process.exit(1); }
  const snap = await admin.firestore().collection("users").doc(uid).get();
  if (!snap.exists) { console.log("users/" + uid + ": DOES NOT EXIST"); process.exit(0); }
  const d = snap.data() || {};
  const mo = d.memberOf || {};
  console.log("uid:", uid);
  console.log("memberOf keys:", Object.keys(mo));
  console.log("memberOf:", JSON.stringify(mo, null, 2));
  console.log("has evil-shop-xyz:", !!mo["evil-shop-xyz"]);
  console.log("has evil-shop:", !!mo["evil-shop"]);
  const auth = await admin.auth().getUser(uid).catch(e => null);
  console.log("auth exists:", !!auth);
  console.log("claims.shops:", auth ? JSON.stringify((auth.customClaims && auth.customClaims.shops) || {}) : "n/a");
  process.exit(0);
})();