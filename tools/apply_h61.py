import sys
from pathlib import Path

HTML = Path(r"C:\Projects\On.i-Crm\android-project\app\src\main\assets\index.html")

OLD = '''function getReturnedQty(orderId, productId){
  return movements
    .filter(m=>m.type==='return' && m.orderId===orderId && m.productId===productId)
    .reduce((s,m)=>s+(Number(m.qty)||0),0);
}
'''

NEW = '''function getReturnedQty(orderId, productId){
  // H-6.1: canonical source is order.returns[]. Deleting a movement no longer
  // unlocks a second refund for the same product on the same receipt.
  // Movements remain the fallback for legacy receipts written before this change.
  const o = (typeof orders !== 'undefined' && Array.isArray(orders)) ? orders.find(x=>x.id===orderId) : null;
  if(o && Array.isArray(o.returns) && o.returns.length){
    return o.returns.reduce((s,r)=>{
      if(!Array.isArray(r.items)) return s;
      return s + r.items.filter(it=>it.productId===productId).reduce((a,it)=>a+(Number(it.qty)||0),0);
    }, 0);
  }
  return movements
    .filter(m=>m.type==='return' && m.orderId===orderId && m.productId===productId)
    .reduce((s,m)=>s+(Number(m.qty)||0),0);
}
'''

raw = HTML.read_bytes()
crlf = b"\r\n" in raw
text = raw.decode("utf-8")
if crlf: text = text.replace("\r\n", "\n")

if OLD not in text:
    if NEW in text:
        print("SKIP H-6.1 (already applied)")
        sys.exit(0)
    print("FAIL H-6.1: anchor not found")
    sys.exit(1)

text = text.replace(OLD, NEW, 1)
if crlf: text = text.replace("\n", "\r\n")
HTML.write_bytes(text.encode("utf-8"))
print("OK H-6.1 applied")