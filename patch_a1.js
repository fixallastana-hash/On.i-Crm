const fs = require("fs");

function read(p) { return fs.readFileSync(p, "utf8"); }
function write(p, s) { fs.writeFileSync(p, s, "utf8"); }

// --- 1. Append to functions/index.js ---
let idx = read("functions/index.js");
if (!idx.includes('require("./membership")')) {
  idx += '\n// A1: memberOf is writable ONLY through these callables.\nObject.assign(exports, require("./membership"));\n';
  write("functions/index.js", idx);
  console.log("PATCHED functions/index.js");
} else {
  console.log("SKIP functions/index.js (already)");
}

// --- 2. Patch MainActivity.java ---
const javaPath = "android-project/app/src/main/java/com/oni/crm/MainActivity.java";
let java = read(javaPath);

if (!java.includes("private String doCallCloudFunction")) {
  const anchor = "private String callSelectedProvider(String input, boolean webSearch) throws Exception {";
  if (!java.includes(anchor)) {
    console.error("FAIL: callSelectedProvider anchor not found");
  } else {
    const method = `    private String doCallCloudFunction(String name, String argsJson) throws Exception {
        if (aiIdToken == null || aiIdToken.isEmpty()) {
            throw new IOException("Нет авторизации");
        }
        if (name == null || !name.matches("^[a-zA-Z][a-zA-Z0-9_]{0,63}$")) {
            throw new IOException("Некорректное имя функции");
        }
        String urlStr = "https://us-central1-oni-crm-b4975.cloudfunctions.net/" + name;
        URL url = new URL(urlStr);
        HttpsURLConnection c = (HttpsURLConnection) url.openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(20000);
        c.setReadTimeout(60000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");
        c.setRequestProperty("Authorization", "Bearer " + aiIdToken);

        JSONObject data;
        try { data = new JSONObject(argsJson == null || argsJson.isEmpty() ? "{}" : argsJson); }
        catch (Exception e) { data = new JSONObject(); }
        JSONObject body = new JSONObject();
        body.put("data", data);

        try (OutputStream os = c.getOutputStream()) {
            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }

        int code = c.getResponseCode();
        InputStream is = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
        String response = MainActivity.readAll(is);

        JSONObject r;
        try { r = new JSONObject(response == null || response.isEmpty() ? "{}" : response); }
        catch (Exception e) { r = new JSONObject(); }

        if (code < 200 || code >= 300) {
            String errMsg = "HTTP " + code;
            JSONObject errorObj = r.optJSONObject("error");
            if (errorObj != null) {
                String m = errorObj.optString("message", "");
                if (m != null && !m.isEmpty()) errMsg = m;
            }
            throw new IOException(errMsg);
        }
        JSONObject result = r.optJSONObject("result");
        return result == null ? "{}" : result.toString();
    }

`;
    java = java.replace(anchor, method + anchor);
    console.log("PATCHED MainActivity.java: doCallCloudFunction");
  }
} else {
  console.log("SKIP MainActivity.java: doCallCloudFunction (already)");
}

if (!java.includes("public void callCloudFunction(final String name")) {
  const idx1 = java.indexOf("public void scanBarcode() {");
  if (idx1 < 0) {
    console.error("FAIL: scanBarcode anchor not found");
  } else {
    const idx2 = java.indexOf("@JavascriptInterface", idx1 + 30);
    if (idx2 < 0) {
      console.error("FAIL: next @JavascriptInterface not found");
    } else {
      const lineStart = java.lastIndexOf("\n", idx2) + 1;
      const method = `        @JavascriptInterface
        public void callCloudFunction(final String name, final String argsJson) {
            new Thread(new Runnable() { public void run() {
                String js;
                try {
                    String result = doCallCloudFunction(name, argsJson);
                    js = "window.__oniCfCallback && window.__oniCfCallback(" + JSONObject.quote(result) + ")";
                } catch (Exception e) {
                    String msg = e.getMessage() == null ? "Cloud Function failed" : e.getMessage();
                    JSONObject err = new JSONObject();
                    try { err.put("__error", msg); } catch (Exception ignored) {}
                    js = "window.__oniCfCallback && window.__oniCfCallback(" + JSONObject.quote(err.toString()) + ")";
                }
                final String fjs = js;
                runOnUiThread(new Runnable() { public void run() {
                    try { webView.evaluateJavascript(fjs, null); } catch (Exception ignored) {}
                }});
            }}).start();
        }

`;
      java = java.slice(0, lineStart) + method + java.slice(lineStart);
      console.log("PATCHED MainActivity.java: callCloudFunction");
    }
  }
} else {
  console.log("SKIP MainActivity.java: callCloudFunction (already)");
}
write(javaPath, java);

// --- 3. Patch core.js: callCloudFn helper ---
const corePath = "android-project/app/src/main/assets/core.js";
let core = read(corePath);
if (!core.includes("function callCloudFn(")) {
  const anchor = "// ===== Step 3a: product utilities";
  if (!core.includes(anchor)) {
    console.error("FAIL: core.js anchor 'Step 3a' not found");
  } else {
    const helper = `// A1: Cloud Functions called through the Android bridge (native HTTPS).
// firebase-functions-compat.js is not initialized; JS never calls CF directly.
var _cfQueue = Promise.resolve();
function callCloudFn(name, payload) {
  var exec = function() {
    return new Promise(function(resolve, reject) {
      if (!window.Android || typeof window.Android.callCloudFunction !== "function") {
        return reject(new Error("Native bridge unavailable (rebuild required)"));
      }
      var prevCb = window.__oniCfCallback;
      window.__oniCfCallback = function(raw) {
        window.__oniCfCallback = prevCb || null;
        try {
          var res = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (res && res.__error) return reject(new Error(String(res.__error)));
          resolve(res || {});
        } catch (e) { reject(e); }
      };
      try {
        window.Android.callCloudFunction(String(name), JSON.stringify(payload || {}));
      } catch (e) {
        window.__oniCfCallback = prevCb || null;
        reject(e);
      }
    });
  };
  var p = _cfQueue.then(exec, exec);
  _cfQueue = p.catch(function(){});
  return p;
}
window.callCloudFn = callCloudFn;

`;
    core = core.replace(anchor, helper + anchor);
    write(corePath, core);
    console.log("PATCHED core.js: callCloudFn");
  }
} else {
  console.log("SKIP core.js (already)");
}

// --- 4. Patch index.html: 3 replacements ---
const htmlPath = "android-project/app/src/main/assets/index.html";
let html = read(htmlPath);

// 4a. deleteEmployee
const oldA = `  try{
    if(fbDb && uid){
      try{ await fbDb.collection('users').doc(uid).delete(); }catch(e){ console.warn('[delete user fb]', e && e.message); }
      // Also delete from shop-scoped users collection so pull won't see it.
      try{
        var _safeId = String(u.id).replace(/[\\/\\s]+/g, '_');
        await fbDb.collection('shops').doc(FB_SHOP_ID).collection('users').doc(_safeId).delete();
      }catch(e){ console.warn('[delete user fb shop]', e && e.message); }
    }
  }catch(e){}`;
const newA = `  try{
    if(fbDb && uid && fbAuth && fbAuth.currentUser){
      try{
        await callCloudFn('removeUserFromShop', {
          targetUid: uid,
          shopId: FB_SHOP_ID,
          localId: u.id
        });
      }catch(e){
        console.warn('[delete user cf]', e && e.message);
        if(typeof showToast==='function') showToast('Не удалось удалить на сервере: '+((e&&e.message)||e));
      }
    }
  }catch(e){}`;
if (html.includes(newA)) {
  console.log("SKIP index.html deleteEmployee (already)");
} else if (html.includes(oldA)) {
  html = html.replace(oldA, newA);
  console.log("PATCHED index.html: deleteEmployee");
} else {
  console.error("FAIL: deleteEmployee anchor not found");
}

// 4b. softDeleteShop
const oldB = `  try{
    var uid=fbAuth.currentUser.uid;
    await fbDb.collection('users').doc(uid).update({ memberOf: {} });
  }catch(e){ console.warn('[soft delete] memberOf clear failed', e && e.message); }`;
const newB = `  try{
    await callCloudFn('deleteShop', { shopId: FB_SHOP_ID });
  }catch(e){
    console.warn('[soft delete] cf failed', e && e.message);
    if(typeof showToast==='function') showToast('Ошибка сервера: '+((e&&e.message)||e));
    return;
  }`;
if (html.includes(newB)) {
  console.log("SKIP index.html softDeleteShop (already)");
} else if (html.includes(oldB)) {
  html = html.replace(oldB, newB);
  console.log("PATCHED index.html: softDeleteShop");
} else {
  console.error("FAIL: softDeleteShop anchor not found");
}

// 4c. registerAsEmployee
const oldC = `    var mo = {}; mo[inv.shopId] = inv.role;
    await fbDb.collection('users').doc(uid).set({
      email: emailLower,
      name: display,
      memberOf: mo,
      inviteCode: code
    });
    try{
      await fbDb.collection('invites').doc(code).update({used:true, usedAt: nowISO(), usedBy: uid});
    }catch(e){ console.warn('[invite] mark used failed:', e && e.message); }`;
const newC = `    try{
      await callCloudFn('acceptInvite', {
        inviteCode: code,
        email: emailLower,
        name: display
      });
    }catch(e){
      try{ await fbAuth.currentUser.delete(); }catch(_){}
      var _m = (e && e.message) || 'invite-failed';
      if(_m.indexOf('already used')>=0) return {ok:false, reason:'used'};
      if(_m.indexOf('not found')>=0) return {ok:false, reason:'bad-code'};
      return {ok:false, reason:'network', error:_m};
    }`;
if (html.includes(newC)) {
  console.log("SKIP index.html registerAsEmployee (already)");
} else if (html.includes(oldC)) {
  html = html.replace(oldC, newC);
  console.log("PATCHED index.html: registerAsEmployee");
} else {
  console.error("FAIL: registerAsEmployee anchor not found");
}

write(htmlPath, html);
console.log("Done.");