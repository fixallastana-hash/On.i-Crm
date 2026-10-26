import sys
from pathlib import Path

HTML = Path(r"C:\Projects\On.i-Crm\android-project\app\src\main\assets\index.html")

HELPER_ANCHOR = '''function openCashiersModal(){'''

HELPER_INSERT = '''/* P1-3b: only users who actually belong to FB_SHOP_ID.
   - memberOf present -> must contain FB_SHOP_ID
   - no memberOf (legacy) -> keep only cashier/staff, hide admin/owner
   - phantom admin (id="admin") -> hide when a real admin exists
*/
function _relevantUsers(){
  try{
    var arr = Array.isArray(users) ? users : [];
    var hasRealAdmin = arr.some(function(x){ return x && x.id !== 'admin' && (x.role === 'admin' || x.role === 'owner'); });
    return arr.filter(function(u){
      if(!u) return false;
      if(u.id === 'admin' && u.login === 'admin' && hasRealAdmin) return false;
      if(u.memberOf && typeof u.memberOf === 'object'){
        return !!u.memberOf[FB_SHOP_ID];
      }
      if(u.role === 'admin' || u.role === 'owner') return false;
      return true;
    });
  }catch(e){ return Array.isArray(users) ? users : []; }
}

function openCashiersModal(){'''

ROWS_OLD = '''  const rows = users.map(u=>{
    const sh = shifts.find(x=>x.userId===u.id && x.status==='open');
'''
ROWS_NEW = '''  const rows = _relevantUsers().map(u=>{
    const sh = shifts.find(x=>x.userId===u.id && x.status==='open');
'''

ENSURE_OLD = '''function ensureDefaultAdmin(){
  if(!Array.isArray(users)) users=[];
  let a=users.find(u=>u&&u.role==='admin'&&u.login==='admin');
  if(!a){ users.unshift({id:'admin',name:'Администратор',login:'admin',password:'',role:'admin',active:true,createdAt:new Date().toISOString()}); }
  else { a.active=a.active!==false; a.role='admin'; }
}
'''
ENSURE_NEW = '''function ensureDefaultAdmin(){
  if(!Array.isArray(users)) users=[];
  // P1-3b: if any real admin/owner exists (Firebase Auth UID or has memberOf),
  // never create the legacy phantom admin='admin'.
  var hasRealAdmin = users.some(function(u){
    if(!u) return false;
    if(u.id === 'admin' && u.login === 'admin') return false;
    if(u.role !== 'admin' && u.role !== 'owner') return false;
    if(u.authUid || u.authEmail) return true;
    if(u.memberOf && typeof u.memberOf === 'object' && Object.keys(u.memberOf).length > 0) return true;
    return false;
  });
  if(hasRealAdmin) return;
  let a=users.find(u=>u&&u.role==='admin'&&u.login==='admin');
  if(!a){ users.unshift({id:'admin',name:'Администратор',login:'admin',password:'',role:'admin',active:true,createdAt:new Date().toISOString()}); }
  else { a.active=a.active!==false; a.role='admin'; }
}
'''

NEWUSER_OLD = '''    else  users.push({ id:uid(), name, login, password:pass, role, active:true, createdAt:nowISO() });
'''
NEWUSER_NEW = '''    else  users.push((function(){var o={ id:uid(), name:name, login:login, password:pass, role:role, active:true, createdAt:nowISO() }; o.memberOf={}; o.memberOf[FB_SHOP_ID]=role === 'admin' ? 'owner' : role; return o;})());
'''

PATCHES = [
    ("P1-3b-helper",  HELPER_ANCHOR, HELPER_INSERT),
    ("P1-3b-view",    ROWS_OLD, ROWS_NEW),
    ("P1-3b-phantom", ENSURE_OLD, ENSURE_NEW),
    ("P1-3b-newuser", NEWUSER_OLD, NEWUSER_NEW),
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