import sys
from pathlib import Path

ROOT = Path(r"C:\Projects\On.i-Crm")
SKIP_DIRS = {"node_modules", ".git", "build", ".gradle", ".idea", ".vscode"}

def find_core_js(root):
    candidates = []
    for p in root.rglob("core.js"):
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        candidates.append(p)
    if not candidates:
        return None
    for p in candidates:
        if "assets" in p.parts:
            return p
    return candidates[0]

CORE = find_core_js(ROOT)
if CORE is None:
    print(f"FAIL: core.js not found under {ROOT}")
    print("Run in PowerShell: Get-ChildItem -Recurse -Filter core.js -File | Select-Object FullName")
    sys.exit(1)
print(f"core.js: {CORE}")

PATCHES = [
    ("H-5.1",
"""  for(const c of cart){
    const p=products.find(x=>x.id===c.productId);
    if(!p){
      showToast('Товар "' + (c.name || 'неизвестный') + '" удалён из каталога. Удалите его из чека.');
      return;
    }
    if(!c.emergencySale && c.qty>p.qty){
      showToast('Недостаточно товара на складе: ' + p.name);
      return;
    }
""",
"""  const whId = ((points.find(x=>x.id===currentPointId)||{}).warehouseId) || 'wh-default';
  for(const c of cart){
    const p=products.find(x=>x.id===c.productId);
    if(!p){
      showToast('Товар "' + (c.name || 'неизвестный') + '" удалён из каталога. Удалите его из чека.');
      return;
    }
    if(!c.emergencySale){
      const whStock = Number((p.stock||{})[whId]) || 0;
      if(c.qty > whStock){
        const whName = (warehouses.find(w=>w.id===whId)||{}).name || whId;
        showToast(`Недостаточно на складе «${whName}»: ${p.name} (нужно ${c.qty}, есть ${whStock})`);
        return;
      }
    }
"""),

    ("H-5.2a",
"""    order.items=(order.items||[]).map(it=>{const p=products.find(x=>x.id===it.productId);if(p&&!it.emergencySale){var _st={...(p.stock||{})};_st[_ptWhId]=Math.max(0,(Number(_st[_ptWhId])||0)-it.qty);p.stock=_st;p.qty=Object.keys(_st).reduce(function(s,k){return s+(Number(_st[k])||0);},0);p.updatedAt=nowISO();movements.push({id:uid(),productId:p.id,productName:p.name,productSku:p.sku,type:'sale',qty:it.qty,date,note:`Чек ${number}`,orderId,warehouseId:_ptWhId});}return it;});
""",
"""    const _whName = (warehouses.find(w=>w.id===_ptWhId)||{}).name || _ptWhId;
    order.items=(order.items||[]).map(it=>{
      const p=products.find(x=>x.id===it.productId);
      if(p && !it.emergencySale){
        const _st={...(p.stock||{})};
        const _cur=Number(_st[_ptWhId])||0;
        if(_cur < it.qty){
          throw new Error(`insufficient_stock:${p.name}:need=${it.qty},have=${_cur},wh=${_whName}`);
        }
        _st[_ptWhId]=_cur-it.qty;
        p.stock=_st;
        p.qty=Object.keys(_st).reduce(function(s,k){return s+(Number(_st[k])||0);},0);
        p.updatedAt=nowISO();
        movements.push({id:uid(),productId:p.id,productName:p.name,productSku:p.sku,type:'sale',qty:it.qty,date,note:`Чек ${number}`,orderId,warehouseId:_ptWhId});
      }
      return it;
    });
"""),

    ("H-5.2b",
"""    console.error('SALE ERROR',e);
    showToast('Ошибка сохранения продажи. Данные не изменены.');
    return false;
  }
""",
"""    console.error('SALE ERROR',e);
    const msg=String(e&&e.message||'');
    if(msg.indexOf('insufficient_stock:')===0){
      showToast('Недостаточно товара на складе: '+msg.slice('insufficient_stock:'.length));
    } else {
      showToast('Ошибка сохранения продажи. Данные не изменены.');
    }
    return false;
  }
"""),

    ("H-5.3a",
"""      <div class="form-field"><label class="form-label">Поставщик</label><select class="form-select" id="pu-supplier">${supplierOptions}</select></div>
""",
"""      <div class="form-field"><label class="form-label">Поставщик</label><select class="form-select" id="pu-supplier">${supplierOptions}</select></div>
      <div class="form-field"><label class="form-label">Склад</label><select class="form-select" id="pu-warehouse">${warehouses.map(w=>`<option value="${escapeHtml(w.id)}" ${w.id===(((points.find(x=>x.id===currentPointId)||{}).warehouseId)||'wh-default')?'selected':''}>${escapeHtml(w.name||w.id)}</option>`).join('')}</select></div>
"""),

    ("H-5.3b",
"""    lines.forEach(line=>{
      const p=products.find(x=>x.id===line.productId);
      const purchase={id:uid(),batchId,supplierId,productId:p.id,productName:p.name,productSku:p.sku,unit:p.unit,qty:line.qty,cost:line.cost,date,note,invoice,paymentStatus,paidAmount:batchTotal?paid*(line.qty*line.cost/batchTotal):0,totalAmount:line.qty*line.cost,batchTotal,batchPaid:paid,batchDebt:paymentLeft};
      purchases.push(purchase);
      p.qty=(Number(p.qty)||0)+line.qty;p.stock={...(p.stock||{}),'wh-default':(Number((p.stock||{})['wh-default'])||0)+line.qty};p.updatedAt=nowISO();
      movements.push({id:uid(),productId:p.id,productName:p.name,productSku:p.sku,type:'in',qty:line.qty,date,note:`Закупка · ${supplierName(supplierId)}${invoice?' · накладная '+invoice:''}${note?' · '+note:''}`,purchaseId:purchase.id,batchId});
    });
""",
"""    const whId=document.getElementById('pu-warehouse').value||'wh-default';
    lines.forEach(line=>{
      const p=products.find(x=>x.id===line.productId);
      const purchase={id:uid(),batchId,supplierId,productId:p.id,productName:p.name,productSku:p.sku,unit:p.unit,qty:line.qty,cost:line.cost,date,note,invoice,paymentStatus,paidAmount:batchTotal?paid*(line.qty*line.cost/batchTotal):0,totalAmount:line.qty*line.cost,batchTotal,batchPaid:paid,batchDebt:paymentLeft,warehouseId:whId};
      purchases.push(purchase);
      p.qty=(Number(p.qty)||0)+line.qty;
      p.stock={...(p.stock||{}),[whId]:(Number((p.stock||{})[whId])||0)+line.qty};
      p.updatedAt=nowISO();
      movements.push({id:uid(),productId:p.id,productName:p.name,productSku:p.sku,type:'in',qty:line.qty,date,note:`Закупка · ${supplierName(supplierId)}${invoice?' · накладная '+invoice:''}${note?' · '+note:''}`,purchaseId:purchase.id,batchId,warehouseId:whId});
    });
"""),

    ("H-5.4",
"""    if(editing){
      var _oldQty=Number(editing.qty)||0;
      Object.assign(editing,fields);
      var _newQty=Number(editing.qty)||0;
      var _qDiff=_newQty-_oldQty;
      if(_qDiff!==0){
        var _stE={...(editing.stock||{})};
        _stE['wh-default']=Math.max(0,(Number(_stE['wh-default'])||0)+_qDiff);
        editing.stock=_stE;
      }
      editing.updatedAt=nowISO();
""",
"""    if(editing){
      var _oldQty=Number(editing.qty)||0;
      var _newQty=Number(fields.qty)||0;
      var _qDiff=_newQty-_oldQty;
      var _stockDelta=null;
      if(_qDiff!==0){
        var _editWhId=((points.find(x=>x.id===currentPointId)||{}).warehouseId)||'wh-default';
        var _stE={...(editing.stock||{})};
        var _curEdit=Number(_stE[_editWhId])||0;
        if(_curEdit+_qDiff<0){
          err.textContent='Остаток на выбранном складе не может быть отрицательным';
          err.style.display='block';
          showToast('Недостаточно остатка на складе для такого изменения');
          return;
        }
        _stE[_editWhId]=_curEdit+_qDiff;
        _stockDelta=_stE;
      }
      Object.assign(editing,fields);
      if(_stockDelta) editing.stock=_stockDelta;
      editing.updatedAt=nowISO();
"""),
]


def apply(path, patches):
    raw = path.read_bytes()
    has_crlf = b"\r\n" in raw
    text = raw.decode("utf-8")
    if has_crlf:
        text = text.replace("\r\n", "\n")
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
    if has_crlf:
        text = text.replace("\n", "\r\n")
    path.write_bytes(text.encode("utf-8"))
    print(f"\nApplied: {applied}, Skipped: {skipped}")


if __name__ == "__main__":
    apply(CORE, PATCHES)