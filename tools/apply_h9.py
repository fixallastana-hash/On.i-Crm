import sys
from pathlib import Path

ROOT = Path(r"C:\Projects\On.i-Crm")
SKIP = {"node_modules", ".git", "build", ".gradle", ".idea", ".vscode"}

def find(name, prefer=None):
    matches = [p for p in ROOT.rglob(name) if not any(x in SKIP for x in p.parts)]
    if not matches:
        print(f"FAIL: {name} not found under {ROOT}")
        sys.exit(1)
    if prefer:
        for p in matches:
            if any(x in p.parts for x in prefer):
                return p
    return matches[0]

CORE = find("core.js", prefer=["assets"])
MAIN = find("MainActivity.java", prefer=["java", "oni"])
print(f"core.js: {CORE}")
print(f"MainActivity.java: {MAIN}")

JAVA_OLD = '''        @JavascriptInterface
        public void openProductWebView(final String url) {
            if (url == null || url.trim().isEmpty()) return;
            runOnUiThread(new Runnable() { public void run() {
                try { showProductWebView(url.trim()); } catch (Exception e) {
                    try { android.util.Log.e("On.i CRM", "openProductWebView failed", e); } catch (Exception ignored) {}
                }
            }});
        }

    }
'''

JAVA_NEW = '''        @JavascriptInterface
        public void openProductWebView(final String url) {
            if (url == null || url.trim().isEmpty()) return;
            runOnUiThread(new Runnable() { public void run() {
                try { showProductWebView(url.trim()); } catch (Exception e) {
                    try { android.util.Log.e("On.i CRM", "openProductWebView failed", e); } catch (Exception ignored) {}
                }
            }});
        }

        // H-9: native file backup. Works even when WebView's IndexedDB is unavailable
        // (Phone B fix disables it globally). Primary storage; IndexedDB stays as fallback.
        @JavascriptInterface
        public boolean saveBackupToFile(String json) {
            if (json == null) return false;
            try {
                File target = new File(getFilesDir(), "oni-backup.json");
                File tmp = new File(getFilesDir(), "oni-backup.json.tmp");
                try (FileOutputStream fos = new FileOutputStream(tmp)) {
                    fos.write(json.getBytes(StandardCharsets.UTF_8));
                    fos.flush();
                    fos.getFD().sync();
                }
                if (tmp.renameTo(target)) return true;
                try { if (target.exists()) target.delete(); } catch (Exception ignored) {}
                if (tmp.renameTo(target)) return true;
                return target.exists() && target.length() > 0;
            } catch (Exception e) {
                android.util.Log.e("On.i backup", "saveBackupToFile failed", e);
                return false;
            }
        }

        @JavascriptInterface
        public String loadBackupFromFile() {
            try {
                File f = new File(getFilesDir(), "oni-backup.json");
                if (!f.exists() || f.length() == 0) return null;
                try (FileInputStream fis = new FileInputStream(f)) {
                    byte[] data = new byte[(int) f.length()];
                    int total = 0;
                    while (total < data.length) {
                        int n = fis.read(data, total, data.length - total);
                        if (n < 0) break;
                        total += n;
                    }
                    return new String(data, 0, total, StandardCharsets.UTF_8);
                }
            } catch (Exception e) {
                android.util.Log.e("On.i backup", "loadBackupFromFile failed", e);
                return null;
            }
        }

    }
'''

JS_OLD_SAVE = '''async function saveFullBackupNow(){
      /* Phone B fix: IndexedDB в этом WebView отключён патчем в <head>.
         Без IDB полный бэкап хранить негде — тихо выходим, не шумим 
         ложным тостом о свободном месте. */
      if(!window.indexedDB){
        return false;
      }
      if(_saveBusy){ _backupQueued=true; return false; }
      _saveBusy=true;
      let ok=false;
      try{
        const data=makeFullBackup();
        const ts=String(Date.now());
        try{ if(await idbSet(BACKUP_KEY,data)) ok=true; }catch(e){}
        try{ await idbSet(BACKUP_TS_KEY,ts); }catch(e){}
        if(ok){
          _backupFailCount=0;
        }else{
          _backupFailCount++;
        }
        return ok;
      }catch(e){
        _backupFailCount++;
        return false;
      }finally{
        _saveBusy=false;
        if(_backupQueued){ _backupQueued=false; setTimeout(()=>saveFullBackupNow().catch(()=>{}),0); }
      }
    }
'''

JS_NEW_SAVE = '''async function saveFullBackupNow(){
      if(_saveBusy){ _backupQueued=true; return false; }
      _saveBusy=true;
      let ok=false;
      try{
        const data=makeFullBackup();
        const ts=String(Date.now());
        // H-9: primary — native Android file (survives WebView IndexedDB being broken)
        if(window.Android && typeof window.Android.saveBackupToFile === 'function'){
          try{ if(window.Android.saveBackupToFile(data)) ok=true; }catch(e){}
        }
        // H-9: secondary — IndexedDB (works on devices where the Phone B fix isn't needed)
        if(window.indexedDB){
          try{ if(await idbSet(BACKUP_KEY,data)) ok=true; }catch(e){}
          try{ await idbSet(BACKUP_TS_KEY,ts); }catch(e){}
        }
        if(ok){
          _backupFailCount=0;
        }else{
          _backupFailCount++;
        }
        return ok;
      }catch(e){
        _backupFailCount++;
        return false;
      }finally{
        _saveBusy=false;
        if(_backupQueued){ _backupQueued=false; setTimeout(()=>saveFullBackupNow().catch(()=>{}),0); }
      }
    }
'''

JS_OLD_GET = '''async function getFullBackup(){
    try{ const v=await idbGet(BACKUP_KEY); if(v) return v; }catch(e){}
    return null;
  }
'''

JS_NEW_GET = '''async function getFullBackup(){
    // H-9: try IndexedDB first (legacy stores), then native file
    if(window.indexedDB){
      try{ const v=await idbGet(BACKUP_KEY); if(v) return v; }catch(e){}
    }
    if(window.Android && typeof window.Android.loadBackupFromFile === 'function'){
      try{ const v=window.Android.loadBackupFromFile(); if(v && v.length > 0) return v; }catch(e){}
    }
    return null;
  }
'''

def patch(path, patches):
    raw = path.read_bytes()
    crlf = b"\r\n" in raw
    text = raw.decode("utf-8")
    if crlf:
        text = text.replace("\r\n", "\n")
    for name, old, new in patches:
        if old not in text:
            if new in text:
                print(f"SKIP {name} (already applied)")
                continue
            print(f"FAIL {name}: anchor not found in {path}")
            sys.exit(1)
        text = text.replace(old, new, 1)
        print(f"OK   {name}")
    if crlf:
        text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))

patch(MAIN, [("H-9-java", JAVA_OLD, JAVA_NEW)])
patch(CORE, [
    ("H-9-save", JS_OLD_SAVE, JS_NEW_SAVE),
    ("H-9-get",  JS_OLD_GET,  JS_NEW_GET),
])
print("\nAll H-9 patches applied")