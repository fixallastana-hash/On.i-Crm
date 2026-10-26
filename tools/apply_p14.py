import sys
from pathlib import Path

HTML = Path(r"C:\Projects\On.i-Crm\android-project\app\src\main\assets\index.html")

# 1) helper for user tombstones key (per shop)
HELP_OLD = '''function _lsTombKey(){ return 'sklad_crm_' + _lsShopId() + '_recent_deletes'; }'''
HELP_NEW = '''function _lsTombKey(){ return 'sklad_crm_' + _lsShopId() + '_recent_deletes'; }
function _lsUserDelKey(){ return 'sklad_crm_' + _lsShopId() + '_user_deletes'; }'''

# 2) _fbRunSync: handle users like products (tombstones on server + filter outgoing)
SYNC_OLD = '''      var data = _fbGetCollectionData(collectionName);
      // P1-2: filter out anything with a tombstone so stale device can't
      // revive a deleted product by pushing its local cache to Firestore.
      if(collectionName === 'products' && Array.isArray(data)){
        var _rdFilter = {};
        try{ _rdFilter = JSON.parse(localStorage.getItem(_lsTombKey()) || '{}') || {}; }catch(e){}
        data = data.filter(function(it){ return !it || !_rdFilter[String(it.id)]; });
      }
'''

SYNC_NEW = '''      var data = _fbGetCollectionData(collectionName);
      // P1-2: filter out anything with a tombstone so stale device can't
      // revive a deleted product by pushing its local cache to Firestore.
      if(collectionName === 'products' && Array.isArray(data)){
        var _rdFilter = {};
        try{ _rdFilter = JSON.parse(localStorage.getItem(_lsTombKey()) || '{}') || {}; }catch(e){}
        data = data.filter(function(it){ return !it || !_rdFilter[String(it.id)]; });
      }

      // P1-4: users have their own tombstones. Delete on server + filter local.
      // Without this, deleteEmployee left the doc in shops/{shopId}/users and
      // the next pull resurrected the deleted member.
      if(collectionName === 'users'){
        var _ud = {};
        try{ _ud = JSON.parse(localStorage.getItem(_lsUserDelKey()) || '{}') || {}; }catch(e){}
        var _udIds = Object.keys(_ud);
        if(_udIds.length > 0){
          var _ub = fbDb.batch();
          for(var _ui=0; _ui<_udIds.length; _ui++){
            var _uid = String(_udIds[_ui]);
            var _usafe = _uid.replace(/[\\/\\s]+/g, '_');
            _ub.delete(fbDb.collection('shops').doc(FB_SHOP_ID).collection('users').doc(_usafe));
          }
          try{ await _ub.commit(); }catch(e){ _log('user tombstone delete failed: ' + ((e && e.message) || e)); }
        }
        if(Array.isArray(data)){
          data = data.filter(function(it){ return !it || !_ud[String(it.id)]; });
        }
      }
'''

# 3) _fbSyncPull: for users, filter by local + server tombstones before apply
PULL_OLD = '''            // P1-3: users are synced as full replace from server (preserve passwords).
            // Skip if server list is empty so a transient empty fetch never wipes local users.
            if(m.users && arr.length > 0){
              var _pwKeep = {};
              var _localUsers = m.get() || [];
              for(var _lu=0; _lu<_localUsers.length; _lu++){
                if(_localUsers[_lu] && _localUsers[_lu].id && _localUsers[_lu].password){
                  _pwKeep[_localUsers[_lu].id] = _localUsers[_lu].password;
                }
              }
              for(var _au=0; _au<arr.length; _au++){
                if(arr[_au] && arr[_au].id && _pwKeep[arr[_au].id]) arr[_au].password = _pwKeep[arr[_au].id];
              }
              m.apply(arr);
              changed = true;
              continue;
            }
'''

PULL_NEW = '''            // P1-3: users are synced as full replace from server (preserve passwords).
            // Skip if server list is empty so a transient empty fetch never wipes local users.
            if(m.users && arr.length > 0){
              // P1-4: drop anything in the local user tombstone list, so a deleted
              // member cannot come back through pull.
              var _udFilter = {};
              try{ _udFilter = JSON.parse(localStorage.getItem(_lsUserDelKey()) || '{}') || {}; }catch(e){}
              arr = arr.filter(function(u){ return u && u.id && !_udFilter[String(u.id)]; });
              var _pwKeep = {};
              var _localUsers = m.get() || [];
              for(var _lu=0; _lu<_localUsers.length; _lu++){
                if(_localUsers[_lu] && _localUsers[_lu].id && _localUsers[_lu].password){
                  _pwKeep[_localUsers[_lu].id] = _localUsers[_lu].password;
                }
              }
              for(var _au=0; _au<arr.length; _au++){
                if(arr[_au] && arr[_au].id && _pwKeep[arr[_au].id]) arr[_au].password = _pwKeep[arr[_au].id];
              }
              m.apply(arr);
              changed = true;
              continue;
            }
'''

# 4) deleteEmployee: write tombstone + explicit shop-delete, then persist
DEL_OLD = '''async function deleteEmployee(id){
  if(activeUser?.role!=='admin') return;
  const u=users.find(x=>x.id===id);
  if(!u){ showToast('Сотрудник не найден'); return; }
  if(u.login==='admin'){ showToast('Нельзя удалить встроенного admin'); return; }
  if(u.id===activeUser.id){ showToast('Нельзя удалить себя'); return; }
  if(!confirm('Удалить сотрудника «'+(u.name||u.login||'')+'»?\\nОн больше не сможет войти.')) return;
  const uid=u.authUid||u.id;
  try{
    if(fbDb && uid){
      try{ await fbDb.collection('users').doc(uid).delete(); }catch(e){ console.warn('[delete user fb]', e && e.message); }
    }
  }catch(e){}
  users=users.filter(x=>x.id!==id);
  await persist('users');
  showToast('Сотрудник удалён');
  openCashiersModal();
}
'''

DEL_NEW = '''async function deleteEmployee(id){
  if(activeUser?.role!=='admin') return;
  const u=users.find(x=>x.id===id);
  if(!u){ showToast('Сотрудник не найден'); return; }
  if(u.login==='admin'){ showToast('Нельзя удалить встроенного admin'); return; }
  if(u.id===activeUser.id){ showToast('Нельзя удалить себя'); return; }
  if(!confirm('Удалить сотрудника «'+(u.name||u.login||'')+'»?\\nОн больше не сможет войти.')) return;
  const uid=u.authUid||u.id;

  // P1-4: write tombstone BEFORE persist so sync + pull cannot resurrect.
  try{
    var _ud = JSON.parse(localStorage.getItem(_lsUserDelKey()) || '{}') || {};
    _ud[String(u.id)] = Date.now();
    var _now = Date.now();
    Object.keys(_ud).forEach(function(k){ if(_now - Number(_ud[k]) > 86400000) delete _ud[k]; });
    localStorage.setItem(_lsUserDelKey(), JSON.stringify(_ud));
  }catch(e){}

  try{
    if(fbDb && uid){
      try{ await fbDb.collection('users').doc(uid).delete(); }catch(e){ console.warn('[delete user fb]', e && e.message); }
      // Also delete from shop-scoped users collection so pull won't see it.
      try{
        var _safeId = String(u.id).replace(/[\\/\\s]+/g, '_');
        await fbDb.collection('shops').doc(FB_SHOP_ID).collection('users').doc(_safeId).delete();
      }catch(e){ console.warn('[delete user fb shop]', e && e.message); }
    }
  }catch(e){}
  users=users.filter(x=>x.id!==id);
  await persist('users');
  showToast('Сотрудник удалён');
  openCashiersModal();
}
'''

PATCHES = [
    ("P1-4a-key",     HELP_OLD, HELP_NEW),
    ("P1-4b-sync",    SYNC_OLD, SYNC_NEW),
    ("P1-4c-pull",    PULL_OLD, PULL_NEW),
    ("P1-4d-delete",  DEL_OLD, DEL_NEW),
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
            print(f"FAIL {name}: anchor not found")
            sys.exit(1)
        text = text.replace(old, new, 1)
        print(f"OK   {name}")
        applied += 1
    if crlf: text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))
    print(f"\nApplied: {applied}, Skipped: {skipped}")


if __name__ == "__main__":
    apply(HTML, PATCHES)