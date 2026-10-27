const fs = require("fs");
const p = "functions/membership.js";
let s = fs.readFileSync(p, "utf8");

// ============ PATCH 1: ensureUser ============
const ensureRegex = /\nexports\.ensureUser = onCall\(async \(request\) => \{[\s\S]*?\n\}\);\s*$/;
if (ensureRegex.test(s)) {
  const newEnsure = `
// SENIOR-PATCH: ensureUser writes shop-scoped mirror for every shop in memberOf
exports.ensureUser = onCall(async (request) => {
  const callerUid = await requireAuth(request);
  const userRef = db().collection("users").doc(callerUid);
  const snap = await userRef.get();

  let data, isNew = false;
  if (snap.exists) {
    data = snap.data() || {};
    if (data.active === false) {
      throw new HttpsError("permission-denied", "Account disabled.");
    }
  } else {
    const auth = await admin.auth().getUser(callerUid).catch(() => null);
    const email = auth && auth.email ? auth.email : "";
    const displayName = auth && auth.displayName ? auth.displayName : (email ? email.split("@")[0] : "");
    data = {
      active: true,
      email: email,
      name: displayName,
      login: email ? email.split("@")[0] : "",
      memberOf: {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await userRef.set(data, { merge: true });
    isNew = true;
  }

  const mo = data.memberOf || {};
  for (const shopId of Object.keys(mo)) {
    const role = mo[shopId];
    const mirrorRef = db().collection("shops").doc(shopId).collection("users").doc(callerUid);
    const mirrorSnap = await mirrorRef.get();
    if (!mirrorSnap.exists) {
      await mirrorRef.set({
        id: callerUid,
        authUid: callerUid,
        email: data.email || "",
        login: data.login || "",
        name: data.name || "",
        role: role,
        memberOf: { [shopId]: role },
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      const mData = mirrorSnap.data() || {};
      const patchData = {};
      if (!mData.authUid) patchData.authUid = callerUid;
      if (!mData.memberOf || !mData.memberOf[shopId]) {
        patchData.memberOf = Object.assign({}, mData.memberOf || {}, { [shopId]: role });
      }
      if (Object.keys(patchData).length > 0) {
        await mirrorRef.set(patchData, { merge: true });
      }
    }
  }

  return { ok: true, created: isNew, memberOf: mo, uid: callerUid };
});
`;
  s = s.replace(ensureRegex, newEnsure);
  console.log("PATCHED 1: ensureUser");
} else {
  console.log("SKIP 1: ensureUser not matched (already patched or different format)");
}

// ============ PATCH 2: acceptInvite ============
const txRegex = /\n    tx\.update\(inviteRef, \{\n      used: true,\n      usedAt: admin\.firestore\.FieldValue\.serverTimestamp\(\),\n      usedBy: callerUid,\n    \}\);/;
if (txRegex.test(s)) {
  const newTx = `
    tx.update(inviteRef, {
      used: true,
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
      usedBy: callerUid,
    });

    // SENIOR-PATCH: acceptInvite writes shop-scoped mirror in same transaction
    const mirrorRef = db().collection("shops").doc(invite.shopId).collection("users").doc(callerUid);
    const _email = typeof email === "string" ? email.toLowerCase() : "";
    const _login = _email ? _email.split("@")[0] : "";
    const _name = (typeof name === "string" && name) ? name : _login;
    tx.set(mirrorRef, {
      id: callerUid,
      authUid: callerUid,
      email: _email,
      login: _login,
      name: _name,
      role: invite.role,
      memberOf: { [invite.shopId]: invite.role },
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });`;
  s = s.replace(txRegex, newTx);
  console.log("PATCHED 2: acceptInvite");
} else {
  console.log("SKIP 2: tx.update(inviteRef) not matched — покажу контекст:");
  const i = s.indexOf("tx.update(inviteRef");
  if (i >= 0) console.log(JSON.stringify(s.substring(i - 20, i + 200)));
  else console.log("(tx.update(inviteRef вообще не найден)");
}

fs.writeFileSync(p, s, "utf8");
console.log("Done.");