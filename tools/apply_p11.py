import sys, re
from pathlib import Path

HTML = Path(r"C:\Projects\On.i-Crm\android-project\app\src\main\assets\index.html")

HELPERS_ANCHOR = '''var _idbPromise=null;
var _saveTimer=null;
var _saveBusy=false;
var _excelOutsideClickHandler=null;
var _backupFailCount=0;
var _backupQueued=false;
'''

HELPERS = '''var _idbPromise=null;
var _saveTimer=null;
var _saveBusy=false;
var _excelOutsideClickHandler=null;
var _backupFailCount=0;
var _backupQueued=false;

// P1-1: namespaced localStorage keys.
// tombstones belong to the shop, carts belong to the user.
function _lsShopId(){
  try{ return (typeof FB_SHOP_ID !== 'undefined' && FB_SHOP_ID) ? FB_SHOP_ID : 'default'; }
  catch(e){ return 'default'; }
}
function _lsUserId(){
  try{ return (typeof activeUser !== 'undefined' && activeUser && activeUser.id) ? activeUser.id : '_anon'; }
  catch(e){ return '_anon'; }
}
function _lsTombKey(){ return 'sklad_crm_' + _lsShopId() + '_recent_deletes'; }
function _lsTombSyncedKey(){ return 'sklad_crm_' + _lsShopId() + '_tombstones_synced'; }
function _lsCartKey(){ return 'oni_carts_' + _lsUserId(); }
function _migrateP11Keys(){
  try{
    var newTomb = _lsTombKey();
    var oldTomb = 'sklad_crm_recent_deletes';
    if(!localStorage.getItem(newTomb) && localStorage.getItem(oldTomb)){
      localStorage.setItem(newTomb, localStorage.getItem(oldTomb));
    }
    var newSync = _lsTombSyncedKey();
    var oldSync = 'sklad_crm_tombstones_synced';
    if(!localStorage.getItem(newSync) && localStorage.getItem(oldSync)){
      localStorage.setItem(newSync, localStorage.getItem(oldSync));
    }
    var newCart = _lsCartKey();
    var oldCart = 'oni_carts';
    if(!localStorage.getItem(newCart) && localStorage.getItem(oldCart)){
      localStorage.setItem(newCart, localStorage.getItem(oldCart));
    }
  }catch(e){}
}
'''

# P1-1 replacements: turn every hardcoded string into a namespaced helper call.
# Order matters: tombstones_synced first (longer), then recent_deletes, then carts.
REPLACEMENTS = [
    ("localStorage.getItem('sklad_crm_tombstones_synced')", "localStorage.getItem(_lsTombSyncedKey())"),
    ("localStorage.setItem('sklad_crm_tombstones_synced'", "localStorage.setItem(_lsTombSyncedKey()"),
    ("localStorage.getItem('sklad_crm_recent_deletes')", "localStorage.getItem(_lsTombKey())"),
    ("localStorage.setItem('sklad_crm_recent_deletes'", "localStorage.setItem(_lsTombKey()"),
    ("localStorage.getItem('oni_carts')", "localStorage.getItem(_lsCartKey())"),
    ("localStorage.setItem('oni_carts'", "localStorage.setItem(_lsCartKey()"),
]


def apply(path):
    raw = path.read_bytes()
    crlf = b"\r\n" in raw
    text = raw.decode("utf-8")
    if crlf: text = text.replace("\r\n", "\n")

    if '_migrateP11Keys' in text:
        print("SKIP P1-1 (already applied)")
        return

    if HELPERS_ANCHOR not in text:
        print("FAIL P1-1: helpers anchor not found")
        sys.exit(1)

    # Count occurrences to sanity-check we replace what we expect.
    for old, _new in REPLACEMENTS:
        n = text.count(old)
        print(f"  replace '{old[:60]}...': {n} occurrence(s)")

    # Insert helpers after the anchor block.
    text = text.replace(HELPERS_ANCHOR, HELPERS, 1)

    # Replace all namespaced keys.
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)

    # Run migration once at startup, right after document ready / init start.
    if '_migrateP11Keys();' not in text:
        # Insert into init() before any storage.get happens.
        init_anchor = 'async function init(){'
        if init_anchor not in text:
            print("FAIL P1-1: init() not found")
            sys.exit(1)
        text = text.replace(
            init_anchor,
            init_anchor + '\n  _migrateP11Keys();',
            1
        )

    if crlf: text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))
    print("OK P1-1 applied")


apply(HTML)