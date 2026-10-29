// functions/membership.js
// Phase A1: memberOf writable ONLY through Cloud Functions.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const db = () => admin.firestore();
const OWNER_ROLES = ["owner", "admin"];
const INVITE_ROLES = ["manager", "storekeeper", "cashier", "staff"];

async function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return request.auth.uid;
}

async function readUserRole(uid, shopId) {
  if (!uid || !shopId) return null;
  const snap = await db().collection("users").doc(uid).get();
  if (!snap.exists) return null;
  return ((snap.data() || {}).memberOf || {})[shopId] || null;
}

exports.setUserMembership = onCall(async (request) => {
  const callerUid = await requireAuth(request);
  const { targetUid, shopId, role } = request.data || {};
  if (typeof targetUid !== "string" || !targetUid) throw new HttpsError("invalid-argument", "targetUid is required.");
  if (typeof shopId !== "string" || !shopId.startsWith("shop-")) throw new HttpsError("invalid-argument", "shopId must start with shop-.");
  if (!INVITE_ROLES.includes(role)) throw new HttpsError("invalid-argument", "role must be one of: " + INVITE_ROLES.join(", "));
  if (targetUid === callerUid) throw new HttpsError("permission-denied", "Cannot change your own role.");
  const callerRole = await readUserRole(callerUid, shopId);
  if (!callerRole) throw new HttpsError("permission-denied", "Caller is not a member of this shop.");
  if (!OWNER_ROLES.includes(callerRole) && callerRole !== "manager") throw new HttpsError("permission-denied", "Only owner/manager can change membership.");
  if (callerRole === "manager" && !["cashier", "staff"].includes(role)) throw new HttpsError("permission-denied", "Manager can only assign cashier/staff.");
  const targetSnap = await db().collection("users").doc(targetUid).get();
  if (targetSnap.exists && OWNER_ROLES.includes((targetSnap.data().memberOf || {})[shopId])) {
    throw new HttpsError("permission-denied", "Cannot change the shop owner's role.");
  }
  await db().collection("users").doc(targetUid).set({ memberOf: { [shopId]: role } }, { merge: true });
  return { ok: true, targetUid, shopId, role };
});

exports.removeUserFromShop = onCall(async (request) => {
  const callerUid = await requireAuth(request);
  const { targetUid, shopId, localId } = request.data || {};
  if (typeof targetUid !== "string" || !targetUid) throw new HttpsError("invalid-argument", "targetUid is required.");
  if (typeof shopId !== "string" || !shopId.startsWith("shop-")) throw new HttpsError("invalid-argument", "shopId must start with shop-.");
  const callerRole = await readUserRole(callerUid, shopId);
  if (!OWNER_ROLES.includes(callerRole) && callerRole !== "manager") throw new HttpsError("permission-denied", "Only owner/manager can remove members.");
  const targetSnap = await db().collection("users").doc(targetUid).get();
  if (targetSnap.exists) {
    const mo = Object.assign({}, targetSnap.data().memberOf || {});
    if (OWNER_ROLES.includes(mo[shopId])) throw new HttpsError("permission-denied", "Cannot remove the shop owner.");
    delete mo[shopId];
    if (Object.keys(mo).length === 0) {
      await db().collection("users").doc(targetUid).delete();
    } else {
      await db().collection("users").doc(targetUid).set({ memberOf: mo }, { merge: true });
    }
  }
  const mirrorCol = db().collection("shops").doc(shopId).collection("users");
  if (localId && typeof localId === "string") {
    await mirrorCol.doc(localId.replace(/[\/\s]+/g, "_")).delete().catch(() => {});
  }
  const mirrorSnap = await mirrorCol.where("authUid", "==", targetUid).get().catch(() => null);
  if (mirrorSnap && !mirrorSnap.empty) {
    const batch = db().batch();
    mirrorSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await admin.auth().updateUser(targetUid, { disabled: true }).catch(() => {});
  return { ok: true, targetUid, shopId };
});

exports.acceptInvite = onCall(async (request) => {
  const callerUid = await requireAuth(request);
  const { inviteCode, email, name } = request.data || {};
  if (typeof inviteCode !== "string" || !inviteCode) throw new HttpsError("invalid-argument", "inviteCode is required.");
  const result = await db().runTransaction(async (tx) => {
    const inviteRef = db().collection("invites").doc(inviteCode);
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) throw new HttpsError("not-found", "Invite not found.");
    const invite = inviteSnap.data() || {};
    if (invite.used === true) throw new HttpsError("failed-precondition", "Invite already used.");
    if (typeof invite.shopId !== "string" || !invite.shopId.startsWith("shop-")) throw new HttpsError("failed-precondition", "Invite missing valid shopId.");
    if (!INVITE_ROLES.includes(invite.role)) throw new HttpsError("failed-precondition", "Invite has invalid role.");
    const userRef = db().collection("users").doc(callerUid);
    const userSnap = await tx.get(userRef);
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    const mo = Object.assign({}, userData.memberOf || {});
    Object.keys(mo).forEach((k) => { if (k !== invite.shopId) delete mo[k]; });
    mo[invite.shopId] = invite.role;
    const patch = { memberOf: mo, inviteCode: admin.firestore.FieldValue.delete() };
    if (typeof email === "string" && email) patch.email = email.toLowerCase();
    if (typeof name === "string" && name) patch.name = name;
    tx.set(userRef, patch, { merge: true });
    tx.update(inviteRef, { used: true, usedAt: admin.firestore.FieldValue.serverTimestamp(), usedBy: callerUid });
    return { shopId: invite.shopId, role: invite.role };
  });
  return Object.assign({ ok: true }, result);
});

exports.deleteShop = onCall(async (request) => {
  const callerUid = await requireAuth(request);
  const { shopId } = request.data || {};
  if (typeof shopId !== "string" || !shopId.startsWith("shop-")) throw new HttpsError("invalid-argument", "shopId must start with shop-.");
  const callerRole = await readUserRole(callerUid, shopId);
  if (!OWNER_ROLES.includes(callerRole)) throw new HttpsError("permission-denied", "Only owner can delete the shop.");
  await db().collection("shops").doc(shopId).set({
    deleted: true,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deletedBy: callerUid,
  }, { merge: true });
  await db().collection("users").doc(callerUid).set(
    { memberOf: { [shopId]: admin.firestore.FieldValue.delete() } },
    { merge: true }
  );
  return { ok: true, shopId };
});
// SENIOR-PATCH: ensureUser creates users/{authUid} on every login.
// Guarantees usersDocExists for _employeeCheck and rules.
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

// SENIOR-PATCH: deleteEmployeePermanently (v2)
exports.deleteEmployeePermanently = onCall(async (request) => {
  const callerUid = await requireAuth(request);
  const { targetUid, shopId, localId } = request.data || {};

  if (typeof targetUid !== "string" || !targetUid) {
    throw new HttpsError("invalid-argument", "targetUid is required.");
  }
  if (typeof shopId !== "string" || !shopId.startsWith("shop-")) {
    throw new HttpsError("invalid-argument", "shopId must start with shop-.");
  }
  if (targetUid === callerUid) {
    throw new HttpsError("permission-denied", "Cannot delete yourself.");
  }

  const callerRoleRaw = await readUserRole(callerUid, shopId);
  const callerRole = typeof callerRoleRaw === "string" ? callerRoleRaw : (callerRoleRaw && callerRoleRaw.role) || null;
  if (!OWNER_ROLES.includes(callerRole)) {
    throw new HttpsError("permission-denied", "Only owner/admin can delete employees.");
  }

  const targetRef = db().collection("users").doc(targetUid);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", "Target user not found.");
  }

  const memberOf = (targetSnap.data() || {}).memberOf || {};
  const targetRoleRaw = memberOf[shopId];
  const targetRole = typeof targetRoleRaw === "string" ? targetRoleRaw : (targetRoleRaw && targetRoleRaw.role) || null;
  if (OWNER_ROLES.includes(targetRole)) {
    throw new HttpsError("permission-denied", "Cannot delete the shop owner.");
  }

  const otherShops = Object.keys(memberOf).filter(k => k !== shopId);
  if (otherShops.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      "User still belongs to other shops: " + otherShops.join(", ") + ". Use removeUserFromShop first."
    );
  }

  let mirrorDeleted = false;
  if (typeof localId === "string" && localId) {
    const mirrorRef = db().collection("shops").doc(shopId).collection("users").doc(localId);
    const mirrorSnap = await mirrorRef.get();
    if (mirrorSnap.exists) {
      await mirrorRef.delete();
      mirrorDeleted = true;
    }
  } else {
    const mirrorQuery = await db().collection("shops").doc(shopId).collection("users")
      .where("authUid", "==", targetUid).get();
    if (!mirrorQuery.empty) {
      const batch = db().batch();
      mirrorQuery.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      mirrorDeleted = true;
    }
  }

  await targetRef.delete();

  const invitesSnap = await db().collection("invites").where("usedBy", "==", targetUid).get();
  if (!invitesSnap.empty) {
    const invBatch = db().batch();
    invitesSnap.docs.forEach(d => {
      invBatch.set(d.ref, {
        invalidated: true,
        invalidatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
    await invBatch.commit();
  }

  let authDeleted = false;
  let authDeleteError = null;
  try {
    await admin.auth().deleteUser(targetUid);
    authDeleted = true;
  } catch (e) {
    if (e && e.code === "auth/user-not-found") {
      authDeleted = true;
    } else {
      authDeleteError = (e && (e.code || e.message)) || String(e);
    }
  }

  await db().collection("shops").doc(shopId).collection("actionHistory").add({
    actionType: "employee_deleted_permanently",
    targetUid,
    localId: localId || null,
    mirrorDeleted,
    deletedBy: callerUid,
    authDeleted,
    authDeleteError,
    ts: admin.firestore.FieldValue.serverTimestamp()
  });

  return { ok: true, targetUid, mirrorDeleted, authDeleted, authDeleteError };
});
