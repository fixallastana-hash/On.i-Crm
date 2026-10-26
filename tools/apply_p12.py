import sys
from pathlib import Path

HTML = Path(r"C:\Projects\On.i-Crm\android-project\app\src\main\assets\index.html")

OLD = '''          }catch(e){
            _log('tombstone delete failed: ' + ((e && e.message) || e));
          }
        }
      }

      var data = _fbGetCollectionData(collectionName);
'''

NEW = '''          }catch(e){
            _log('tombstone delete failed: ' + ((e && e.message) || e));
          }
        }

        // P1-2: pull server-side tombstones so this device doesn't re-upload
        // products deleted on another device. Fixes "deleted products come back".
        try{
          var _srvTombP12 = await fbDb.collection('shops').doc(FB_SHOP_ID).collection('productTombstones').get();
          if(_srvTombP12 && _srvTombP12.size > 0){
            var _rdP12 = {};
            try{ _rdP12 = JSON.parse(localStorage.getItem('sklad_crm_recent_deletes') || '{}') || {}; }catch(e){}
            _srvTombP12.forEach(function(doc){
              var d = doc.data() || {};
              if(d && d.id){ _rdP12[String(d.id)] = Number(d.deletedAt) || Date.now(); }
            });
            try{ localStorage.setItem('sklad_crm_recent_deletes', JSON.stringify(_rdP12)); }catch(e){}
          }
        }catch(e){ _log('P1-2 srv tombstone pull failed: ' + ((e && e.message) || e)); }
      }

      var data = _fbGetCollectionData(collectionName);
      // P1-2: filter out anything with a tombstone so stale device can't
      // revive a deleted product by pushing its local cache to Firestore.
      if(collectionName === 'products' && Array.isArray(data)){
        var _rdFilter = {};
        try{ _rdFilter = JSON.parse(localStorage.getItem('sklad_crm_recent_deletes') || '{}') || {}; }catch(e){}
        data = data.filter(function(it){ return !it || !_rdFilter[String(it.id)]; });
      }
'''

raw = HTML.read_bytes()
crlf = b"\r\n" in raw
text = raw.decode("utf-8")
if crlf: text = text.replace("\r\n", "\n")

if OLD not in text:
    if 'P1-2 srv tombstone pull failed' in text:
        print("SKIP P1-2 (already applied)")
        sys.exit(0)
    print("FAIL P1-2: anchor not found")
    print("First 300 chars around 'var data = _fbGetCollectionData':")
    idx = text.find("var data = _fbGetCollectionData")
    if idx >= 0:
        print(repr(text[max(0, idx-200):idx+80]))
    sys.exit(1)

text = text.replace(OLD, NEW, 1)
if crlf: text = text.replace("\n", "\r\n")
HTML.write_bytes(text.encode("utf-8"))
print("OK P1-2 applied")