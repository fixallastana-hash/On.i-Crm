// backup_users.js -- Phase 4a, dump users collection
const admin = require("firebase-admin");
const fs = require("fs");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync("C:/Users/arman/sa.json","utf8"))) });
(async () => {
  const snap = await admin.firestore().collection("users").get();
  const out = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  const fname = "users.pre4a." + new Date().toISOString().slice(0,10) + ".json";
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log("backup written:", fname, "count:", out.length);
  process.exit(0);
})();