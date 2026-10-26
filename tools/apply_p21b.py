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

# C1: remove duplicated `const originalPrice` (breaks parse)
C1_OLD = 'const salePrice=Number(c.price??p.price)||0;const originalPrice=Number(p.price)||0;const originalPrice=Number(p.price)||0;const activeConsignment='
C1_NEW = 'const salePrice=Number(c.price??p.price)||0;const originalPrice=Number(p.price)||0;const activeConsignment='

# C2: discount badge in cart line (no leading whitespace, matches anywhere)
C2_OLD = '''<div class="cart-item-name">${escapeHtml(l.product.name)}<span class="sku">${escapeHtml(l.product.sku)}</span></div>'''
C2_NEW = '''<div class="cart-item-name">${escapeHtml(l.product.name)}${(Number(l.product.price)>0 && Number(l.price)>0 && Number(l.price)<Number(l.product.price))?` <span style="background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;">−${Math.round((1-Number(l.price)/Number(l.product.price))*100)}%</span>`:''}<span class="sku">${escapeHtml(l.product.sku)}</span></div>'''

# H1: receipt modal — show discount per row
H1_OLD = '''${(order.items||[]).map(it=>`<div class="receipt-row"><span>${it.emergencySale?'⚡ ':''}${escapeHtml(it.name)} ×${it.qty}</span><span>${fmtMoney(it.price*it.qty)}</span></div>`).join('')}'''
H1_NEW = '''${(order.items||[]).map(it=>{const _o=Number(it.originalPrice)||0;const _c=Number(it.price)||0;const _hd=(_o>0&&_c>0&&_c<_o);const _p=_hd?Math.round((1-_c/_o)*100):0;return `<div class="receipt-row"><span>${it.emergencySale?'⚡ ':''}${escapeHtml(it.name)} ×${it.qty}${_hd?` <span style="color:#B91C1C;font-size:11px;">(скидка ${_p}%)</span>`:''}</span><span>${fmtMoney(it.price*it.qty)}${_hd?` <s style="color:#9CA3AF;font-size:11px;">${fmtMoney(_o*it.qty)}</s>`:''}</span></div>`;}).join('')}'''

# H2: printable receipt — same per-row discount
H2_OLD = '''const rows=(order.items||[]).map(it=>`<tr><td>${escapeHtml(it.name)} ×${it.qty}</td><td>${fmtMoney(it.price*it.qty)}</td></tr>`).join('');'''
H2_NEW = '''const rows=(order.items||[]).map(it=>{const _o=Number(it.originalPrice)||0;const _c=Number(it.price)||0;const _hd=(_o>0&&_c>0&&_c<_o);const _p=_hd?Math.round((1-_c/_o)*100):0;return `<tr><td>${escapeHtml(it.name)} ×${it.qty}${_hd?` (скидка ${_p}%)`:''}</td><td>${fmtMoney(it.price*it.qty)}</td></tr>`;}).join('');'''


def apply(path, patches):
    raw = path.read_bytes()
    crlf = b"\r\n" in raw
    text = raw.decode("utf-8")
    if crlf: text = text.replace("\r\n", "\n")
    applied = skipped = 0
    for name, old, new in patches:
        if old in text:
            text = text.replace(old, new, 1)
            print(f"OK   {name}")
            applied += 1
        elif new in text:
            print(f"SKIP {name} (already applied)")
            skipped += 1
        else:
            print(f"FAIL {name}: anchor not found")
            head = old.split("\n")[0][:100] if "\n" in old else old[:100]
            idx = text.find(head)
            if idx >= 0:
                print(f"  context: {repr(text[max(0,idx-100):idx+200])}")
            else:
                print(f"  no partial match for: {repr(head)}")
            sys.exit(1)
    if crlf: text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))
    print(f"  -> {applied} applied, {skipped} skipped in {path.name}")


print("\n=== CORE ===")
apply(CORE, [
    ("P2-1a-dedupe", C1_OLD, C1_NEW),
    ("P2-1c-badge",  C2_OLD, C2_NEW),
])

print("\n=== HTML ===")
apply(HTML, [
    ("P2-1d-receipt", H1_OLD, H1_NEW),
    ("P2-1e-print",   H2_OLD, H2_NEW),
])

print("\nDone.")