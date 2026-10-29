// verify_claims.js -- Phase 4a, sanity check
const admin = require("firebase-admin");
const fs = require("fs");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync("C:/Users/arman/sa.json","utf8"))) });
(async () => {
  let total = 0, withClaims = 0, without = 0, shopsSum = 0, pageToken;
  do {
    const r = await admin.auth().listUsers(1000, pageToken);
    for (const u of r.users) {
      total++;
      const shops = (u.customClaims && u.customClaims.shops) || {};
      const n = Object.keys(shops).length;
      if (n > 0) { withClaims++; shopsSum += n; console.log(u.uid, JSON.stringify(shops)); }
      else without++;
    }
    pageToken = r.pageToken;
  } while (pageToken);
  console.log("done:", { total, withClaims, without, shopsSum });
  process.exit(0);
})();