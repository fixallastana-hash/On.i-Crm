import sys
from pathlib import Path

HTML = Path(r"C:\Projects\On.i-Crm\android-project\app\src\main\assets\index.html")

PATCHES = [
    ("H-7.2b-declare",
"""    var _fbSyncPullTimer = null;
    var _fbSyncPullRunning = false;
""",
"""    var _fbSyncPullTimer = null;
    var _fbSyncPullRunning = false;
    var _lastPullAt = 0; /* H-7.2: last pull start, used for max-wait */
"""),

    ("H-7.2a-maxwait",
"""      if(!syncBusy && (Date.now() - _lastPersistAt) < 15000){ syncBusy = true; }
      if(syncBusy) return;
""",
"""      if(!syncBusy && (Date.now() - _lastPersistAt) < 15000){
        /* H-7.2: max-wait — force pull if we haven't pulled in 60s,
           so rapid save-after-save never starves synchronization. */
        if((Date.now() - _lastPullAt) < 60000) syncBusy = true;
      }
      if(syncBusy) return;
"""),

    ("H-7.2c-mark",
"""      _fbSyncPullRunning = true;
      try{
""",
"""      _fbSyncPullRunning = true;
      _lastPullAt = Date.now(); /* H-7.2: mark pull start for max-wait */
      try{
"""),

    ("H-7.3-editable",
"""      var modalRoot = document.getElementById('modal-root');
      if(modalRoot && modalRoot.innerHTML.trim().length > 0){
        var _roIds=['wh-ov','pt-ov','al-ov','analytics-ov','reports-ov','action-history-ov','preset-wizard-ov','inv-list-ov','reqs-ov','ph-ov','phub-ov','low-ov','req-detail-ov','inv-detail-ov','fiscal-ov'];
        var _ro=false;
        for(var _i=0;_i<_roIds.length;_i++){ if(modalRoot.querySelector('#'+_roIds[_i])){ _ro=true; break; } }
        if(!_ro) return;
      }
""",
"""      var modalRoot = document.getElementById('modal-root');
      if(modalRoot && modalRoot.innerHTML.trim().length > 0){
        /* H-7.3: block pull only for editable forms where user has unsaved input.
           Read-only views (reports, analytics, action history, purchase hub, etc.)
           no longer block sync. */
        var _editableSelector = '#f-name, #pu-supplier, #pu-items, #checkout, #ce-name, #emp-email, #reg-login, #inv-email';
        if(modalRoot.querySelector(_editableSelector)) return;
      }
"""),

    ("H-7.1-throttle",
"""      if(collectionName === 'products'){
        var _recentDelSync = {};
        try{ _recentDelSync = JSON.parse(localStorage.getItem('sklad_crm_recent_deletes') || '{}') || {}; }catch(e){}
        var _tombIds = Object.keys(_recentDelSync);
        if(_tombIds.length > 0){
          var _delBatch = fbDb.batch();
          for(var _ti=0; _ti<_tombIds.length; _ti++){
            var _tid = String(_tombIds[_ti]);
            var _safeTid = _tid.replace(/[\\/\\s]+/g, '_');
            var _tref = fbDb.collection('shops').doc(FB_SHOP_ID).collection(collectionName).doc(_safeTid);
            _delBatch.delete(_tref);
          }
          try{
            await _delBatch.commit();
            _log('tombstones deleted: ' + _tombIds.length);
            // tombstones НЕ удаляем - пусть живут 24 часа, чтобы pull смог их дообработать.
          }catch(e){
            _log('tombstone delete failed: ' + ((e && e.message) || e));
          }
        }
      }
""",
"""      if(collectionName === 'products'){
        var _recentDelSync = {};
        try{ _recentDelSync = JSON.parse(localStorage.getItem('sklad_crm_recent_deletes') || '{}') || {}; }catch(e){}
        /* H-7.1: skip tombstones already deleted on Firestore, so every
           persist('products') doesn't resend batch.delete for all tombstones
           from the past 24h. Retry only the ones that failed. */
        var _syncedTomb = {};
        try{ _syncedTomb = JSON.parse(localStorage.getItem('sklad_crm_tombstones_synced') || '{}') || {}; }catch(e){}
        var _tombIds = Object.keys(_recentDelSync).filter(function(k){ return !_syncedTomb[k]; });
        if(_tombIds.length > 0){
          var _delBatch = fbDb.batch();
          for(var _ti=0; _ti<_tombIds.length; _ti++){
            var _tid = String(_tombIds[_ti]);
            var _safeTid = _tid.replace(/[\\/\\s]+/g, '_');
            var _tref = fbDb.collection('shops').doc(FB_SHOP_ID).collection(collectionName).doc(_safeTid);
            _delBatch.delete(_tref);
          }
          try{
            await _delBatch.commit();
            _log('tombstones deleted: ' + _tombIds.length);
            /* Mark as synced so we don't resend on every persist() */
            var _nowSync = Date.now();
            for(var _ti2=0; _ti2<_tombIds.length; _ti2++){ _syncedTomb[String(_tombIds[_ti2])] = _nowSync; }
            /* Prune markers older than 24h to keep the map small */
            var _syncedClean = {};
            for(var _tk in _syncedTomb){ if(_nowSync - Number(_syncedTomb[_tk]) < 86400000) _syncedClean[_tk] = _syncedTomb[_tk]; }
            try{ localStorage.setItem('sklad_crm_tombstones_synced', JSON.stringify(_syncedClean)); }catch(e){}
            // tombstones НЕ удаляем - пусть живут 24 часа, чтобы pull смог их дообработать.
          }catch(e){
            _log('tombstone delete failed: ' + ((e && e.message) || e));
          }
        }
      }
"""),
]


def apply(path, patches):
    raw = path.read_bytes()
    crlf = b"\r\n" in raw
    text = raw.decode("utf-8")
    if crlf: text = text.replace("\r\n", "\n")
    applied = skipped = 0
    for name, old, new in patches:
        if old not in text:
            if new in text:
                print(f"SKIP {name} (already applied)")
                skipped += 1
                continue
            print(f"FAIL {name}: anchor not found in {path}")
            sys.exit(1)
        text = text.replace(old, new, 1)
        print(f"OK   {name}")
        applied += 1
    if crlf: text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))
    print(f"\nApplied: {applied}, Skipped: {skipped}")


if __name__ == "__main__":
    apply(HTML, PATCHES)