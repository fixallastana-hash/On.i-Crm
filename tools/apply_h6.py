import sys, re
from pathlib import Path

ROOT = Path(r"C:\Projects\On.i-Crm")
SKIP = {"node_modules", ".git", "build", ".gradle", ".idea", ".vscode"}

def find(name, prefer=None):
    matches = [p for p in ROOT.rglob(name) if not any(x in SKIP for x in p.parts)]
    if not matches:
        print(f"FAIL: {name} not found")
        sys.exit(1)
    if prefer:
        for p in matches:
            if any(x in p.parts for x in prefer):
                return p
    return matches[0]

HTML = find("index.html", prefer=["assets"])
CORE = find("core.js", prefer=["assets"])
UIX  = None
try: UIX = find("ui-extra.js", prefer=["assets"])
except: pass
print(f"index.html: {HTML}")
print(f"core.js: {CORE}")
if UIX: print(f"ui-extra.js: {UIX}")

# ---- H-6.2 / H-6.3a / H-6.3b in index.html ----
H62_OLD = '''    const reason=(document.getElementById('return-reason')?.value.trim())||'Возврат по чеку';

    if((returnMethod==='kaspi'||returnMethod==='red') && !(window.Android&&typeof window.Android.startKaspiRefund==='function')){
'''
H62_NEW = '''    const reason=(document.getElementById('return-reason')?.value.trim())||'Возврат по чеку';

    // H-6.2: reject bonus return early, before stock is touched
    if(returnMethod==='bonus'){
      if(!isModOn('bonuses')){ showToast('Модуль «Бонусы» выключен. Выберите другой способ возврата.'); return; }
      if(!order.contactId){ showToast('Для возврата на бонусы нужен клиент в чеке. Выберите другой способ.'); return; }
      if(!contacts.find(x=>x.id===order.contactId)){ showToast('Клиент из чека не найден в базе. Выберите другой способ.'); return; }
    }

    if((returnMethod==='kaspi'||returnMethod==='red') && !(window.Android&&typeof window.Android.startKaspiRefund==='function')){
'''

H63A_OLD = '''    if((returnMethod==='kaspi'||returnMethod==='red') && window.Android && typeof window.Android.startKaspiRefund==='function'){
      pendingKaspiReturn={order:order,selected:selected,total:total,reason:reason,returnMethod:returnMethod,snapshot:returnSnapshot,close:close};
      showKaspiRefundWaiting(total,returnMethod);
      window.Android.startKaspiRefund(String(total),String(returnMethod),String(kaspiSettings.host||''),String(kaspiSettings.port||8080),String(kaspiSettings.terminalId||''),String(kaspiSettings.cashierName||'On.i CRM'),String(order.kaspiTransactionId||''));
      return;
    }
'''
H63A_NEW = '''    if((returnMethod==='kaspi'||returnMethod==='red') && window.Android && typeof window.Android.startKaspiRefund==='function'){
      if(!order.kaspiTransactionId){ showToast('Оригинальный чек не содержит Kaspi-транзакции. Возврат Kaspi невозможен — выберите другой способ.'); return; }
      pendingKaspiReturn={order:order,selected:selected,total:total,reason:reason,returnMethod:returnMethod,snapshot:returnSnapshot,close:close};
      showKaspiRefundWaiting(total,returnMethod);
      window.Android.startKaspiRefund(String(total),String(returnMethod),String(kaspiSettings.host||''),String(kaspiSettings.port||8080),String(kaspiSettings.terminalId||''),String(kaspiSettings.cashierName||'On.i CRM'),String(order.kaspiTransactionId||''));
      return;
    }
'''

H63B_OLD = '''    if(returnMethod==='halyk' && window.Android && typeof window.Android.refundHalyk==='function'){
      if(!halykSettings.host||!halykSettings.terminalId){ openHalykSettings(true); showToast('Настройте Halyk POS: IP и Terminal ID'); return; }
      pendingHalykReturn={order:order,selected:selected,total:total,reason:reason,returnMethod:returnMethod,snapshot:returnSnapshot,close:close};
      showHalykRefundWaiting(total);
      window.Android.refundHalyk(String(halykSettings.host),String(halykSettings.port||8080),String(total),String(halykSettings.terminalId),String(order.tagRRN||''));
      return;
    }
'''
H63B_NEW = '''    if(returnMethod==='halyk' && window.Android && typeof window.Android.refundHalyk==='function'){
      if(!halykSettings.host||!halykSettings.terminalId){ openHalykSettings(true); showToast('Настройте Halyk POS: IP и Terminal ID'); return; }
      if(!order.tagRRN){ showToast('Оригинальный чек не содержит RRN Halyk. Возврат Halyk невозможен — выберите другой способ.'); return; }
      pendingHalykReturn={order:order,selected:selected,total:total,reason:reason,returnMethod:returnMethod,snapshot:returnSnapshot,close:close};
      showHalykRefundWaiting(total);
      window.Android.refundHalyk(String(halykSettings.host),String(halykSettings.port||8080),String(total),String(halykSettings.terminalId),String(order.tagRRN||''));
      return;
    }
'''

print("\n=== H-6.2 / H-6.3a / H-6.3b in index.html ===")
raw = HTML.read_bytes()
crlf = b"\r\n" in raw
text = raw.decode("utf-8")
if crlf: text = text.replace("\r\n", "\n")

results = []
for name, old, new in [("H-6.2", H62_OLD, H62_NEW), ("H-6.3a", H63A_OLD, H63A_NEW), ("H-6.3b", H63B_OLD, H63B_NEW)]:
    if old in text:
        text = text.replace(old, new, 1)
        results.append((name, "OK"))
    elif new in text:
        results.append((name, "SKIP (already applied)"))
    else:
        results.append((name, "FAIL"))

if any(status == "FAIL" for _, status in results):
    print("Aborting: at least one anchor missing. No changes written.")
    for name, status in results: print(f"  {name}: {status}")
    print("\nSee H-6.1 diagnosis below.")
else:
    if crlf: text = text.replace("\n", "\r\n")
    HTML.write_bytes(text.encode("utf-8"))
    for name, status in results: print(f"  {name}: {status}")
    print("  -> 3 patches written to index.html")

# ---- H-6.1 diagnosis ----
print("\n=== H-6.1 diagnosis (getReturnedQty across JS) ===")
targets = [CORE, HTML] + ([UIX] if UIX else [])
for p in targets:
    content = p.read_text(encoding="utf-8", errors="replace")
    hits = list(re.finditer(r"getReturnedQty|getOrderReturnTotal|function\s+.*returned|const\s+returned\b", content))
    if not hits:
        print(f"  {p.name}: no occurrences")
        continue
    for m in hits:
        line_no = content[:m.start()].count("\n") + 1
        line_end = content.find("\n", m.start())
        line = content[m.start():line_end][:180]
        print(f"  {p.name}:{line_no}: {line}")