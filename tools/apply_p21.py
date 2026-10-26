import sys
from pathlib import Path

ROOT = Path(r"C:\Projects\On.i-Crm")
SKIP = {"node_modules", ".git", "build", ".gradle", ".idea", ".vscode"}

def find(name, prefer=None):
    matches = [p for p in ROOT.rglob(name) if not any(x in SKIP for x in p.parts)]
    if not matches:
        print(f"FAIL: {name} not found"); sys.exit(1)
    if prefer:
        for p in matches:
            if any(x in p.parts for x in prefer): return p
    return matches[0]

CORE = find("core.js", prefer=["assets"])
HTML = find("index.html", prefer=["assets"])
print(f"core.js: {CORE}")
print(f"index.html: {HTML}")

CORE_PATCHES = [
    ("P2-1a-orig-price",
     "const preparedItems=cart.map(c=>{const p=products.find(x=>x.id===c.productId);const salePrice=Number(c.price??p.price)||0;",
     "const preparedItems=cart.map(c=>{const p=products.find(x=>x.id===c.productId);const salePrice=Number(c.price??p.price)||0;const originalPrice=Number(p.price)||0;"),

    ("P2-1b-save-orig",
     "return {productId:p.id,name:p.name,sku:p.sku,qty:c.qty,price:salePrice,cost:p.cost,emergencySale:!!c.emergencySale,isConsignment:!!activeConsignment,supplierCost:activeConsignment?.supplierCost||0,supplierName:activeConsignment?.supplierName||''};",
     "return {productId:p.id,name:p.name,sku:p.sku,qty:c.qty,price:salePrice,originalPrice,cost:p.cost,emergencySale:!!c.emergencySale,isConsignment:!!activeConsignment,supplierCost:activeConsignment?.supplierCost||0,supplierName:activeConsignment?.supplierName||''};"),
]

HTML_PATCHES = [
    ("P2-1c-cart-badge",
     '''<div class="cart-item">
              <div class="cart-item-name">${escapeHtml(l.product.name)}<span class="sku">${escapeHtml(l.product.sku)}</span></div>''',
     '''${(()=>{const _o=Number(l.product.price)||0;const _c=Number(l.price)||0;l._disc=((_o>0&&_c>0&&_c<_o)?Math.round((1-_c/_o)*100):0);})()}
            <div class="cart-item">
              <div class="cart-item-name">${escapeHtml(l.product.name)}${l._disc>0?` <span style="background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;">−${l._disc}%</span>`:''}<span class="sku">${escapeHtml(l.product.sku)}</span></div>'''),

    ("P2-1d-receipt-items",
     '''${(order.items||[]).map(it=>`<div class="receipt-row"><span>${it.emergencySale?'⚡ ':''}${escapeHtml(it.name)} ×${it.qty}</span><span>${fmtMoney(it.price*it.qty)}</span></div>`).join('')}''',
     '''${(order.items||[]).map(it=>{const _o=Number(it.originalPrice)||0;const _c=Number(it.price)||0;const _hd=(_o>0&&_c>0&&_c<_o);const _p=_hd?Math.round((1-_c/_o)*100):0;return `<div class="receipt-row"><span>${it.emergencySale?'⚡ ':''}${escapeHtml(it.name)} ×${it.qty}${_hd?` <span style="color:#B91C1C;font-size:11px;">(скидка ${_p}%)</span>`:''}</span><span>${fmtMoney(it.price*it.qty)}${_hd?` <s style="color:#9CA3AF;font-size:11px;">${fmtMoney(_o*it.qty)}</s>`:''}</span></div>`;}).join('')}'''),

    ("P2-1e-print-items",
     '''const rows=(order.items||[]).map(it=>`<tr><td>${escapeHtml(it.name)} ×${it.qty}</td><td>${fmtMoney(it.price*it.qty)}</td></tr>`).join('');''',
     '''const rows=(order.items||[]).map(it=>{const _o=Number(it.originalPrice)||0;const _c=Number(it.price)||0;const _hd=(_o>0&&_c>0&&_c<_o);const _p=_hd?Math.round((1-_c/_o)*100):0;return `<tr><td>${escapeHtml(it.name)} ×${it.qty}${_hd?` (скидка ${_p}%)`:''}</td><td>${fmtMoney(it.price*it.qty)}</td></tr>`;}).join('');'''),
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
                print(f"SKIP {name} (already applied)"); skipped += 1; continue
            print(f"FAIL {name}: anchor not found in {path.name}")
            # print context
            head = old.split("\n")[0][:80] if "\n" in old else old[:80]
            idx = text.find(head)
            if idx >= 0:
                print(f"  closest context: {repr(text[idx:idx+200])}")
            sys.exit(1)
        text = text.replace(old, new, 1)
        print(f"OK   {name}")
        applied += 1
    if crlf: text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))
    print(f"  -> {applied} applied, {skipped} skipped in {path.name}")


print("\n=== CORE ===")
apply(CORE, CORE_PATCHES)
print("\n=== HTML ===")
apply(HTML, HTML_PATCHES)
print("\nDone.")