import sys
from pathlib import Path

HTML = Path(r"C:\Projects\On.i-Crm\android-project\app\src\main\assets\index.html")

MAP_OLD = '''          {name:'warehouses',          apply:function(a){warehouses=a;},          get:function(){return warehouses;}, merge:true},
          {name:'points',              apply:function(a){points=a;},              get:function(){return points;}, merge:true}
        ];
'''

MAP_NEW = '''          {name:'warehouses',          apply:function(a){warehouses=a;},          get:function(){return warehouses;}, merge:true},
          {name:'points',              apply:function(a){points=a;},              get:function(){return points;}, merge:true},
          /* P1-3: users must be pulled back from server when local list was emptied
             or a member was added on another device. Passwords stay local. */
          {name:'users',               apply:function(a){users=a;},               get:function(){return users;}, users:true}
        ];
'''

LOOP_OLD = '''              var localItem = localById[item.id];
                if(!localItem){
                  local.push(item);
                  added++;
                  continue;
                }
                if(!m.merge) continue;
'''

LOOP_NEW = '''              var localItem = localById[item.id];
                if(!localItem){
                  local.push(item);
                  added++;
                  continue;
                }
                if(m.users){
                  // P1-3: never overwrite a local password with server value (server has none)
                  // and update other fields (name, role, active, memberOf) from server.
                  Object.keys(item).forEach(function(k){ if(k !== 'password') localItem[k] = item[k]; });
                  updated++;
                  continue;
                }
                if(!m.merge) continue;
'''

USERS_BRANCH_OLD = '''            if(!snap) continue;
            var arr = [];
            snap.forEach(function(doc){ arr.push(doc.data()); });
'''

USERS_BRANCH_NEW = '''            if(!snap) continue;
            var arr = [];
            snap.forEach(function(doc){ arr.push(doc.data()); });

            // P1-3: users are synced as full replace from server (preserve passwords).
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

PATCHES = [
    ("P1-3a-mapping",  MAP_OLD, MAP_NEW),
    ("P1-3b-loop",     LOOP_OLD, LOOP_NEW),
    ("P1-3c-fullrepl", USERS_BRANCH_OLD, USERS_BRANCH_NEW),
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