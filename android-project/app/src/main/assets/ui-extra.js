(function(){
  if(window.__oniUiExtraLoaded) return;
  window.__oniUiExtraLoaded = true; try{var _hs=document.createElement('style');_hs.textContent='#product-scan-btn,#pos-scan-btn,#pp-scan{display:none!important}';var _t=document.head||document.documentElement;if(_t)_t.appendChild(_hs);}catch(e){}
  var SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align:middle;display:inline-block;"><rect x="2" y="5" width="2" height="14"/><rect x="5" y="5" width="1" height="14"/><rect x="7" y="5" width="3" height="14"/><rect x="11" y="5" width="1" height="14"/><rect x="13" y="5" width="2" height="14"/><rect x="16" y="5" width="1" height="14"/><rect x="18" y="5" width="3" height="14"/><rect x="22" y="5" width="1" height="14"/></svg>';
  window.oniClearSearch = function(id){
    try{ var i=document.getElementById(id); if(!i) return; i.value=''; if(i.oninput){try{i.oninput();}catch(e){}} try{i.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){} try{i.focus();}catch(e){} }catch(e){}
  };
  window.oniScanTo = function(id){
    try{
      var A = window.Android;
      if(!A || typeof A.scanBarcode !== 'function'){ if(typeof showToast === 'function') showToast('\u0421\u043a\u0430\u043d\u0435\u0440 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d'); return; }
      var prev = window.onBarcodeScanned;
      window.onBarcodeScanned = function(j){
        try{
          var d = typeof j === 'string' ? JSON.parse(j) : j;
          var c = String((d && (d.barcode || d.code || d.value)) || '').trim();
          if(c && id){
            var i = document.getElementById(id);
            if(i){ i.value = c; if(i.oninput){try{i.oninput();}catch(e){}} try{i.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){} }
          }
        }catch(e){}
        window.onBarcodeScanned = prev;
      };
      A.scanBarcode();
    }catch(e){}
  };
  function enrich(inputId){
    var input = document.getElementById(inputId);
    if(!input) return;
    var wrap = input.parentElement;
    if(!wrap || !wrap.classList.contains('search')) return;
    if(wrap.querySelector('.oni-scan-btn')) return;
    wrap.style.position = 'relative';
    input.style.paddingRight = '72px';
    var scan = document.createElement('button');
    scan.type = 'button';
    scan.className = 'oni-scan-btn';
    scan.title = 'Scan';
    scan.innerHTML = SVG;
    scan.style.cssText = 'position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:0;font-size:20px;padding:0;cursor:pointer;line-height:1;z-index:2;';
    scan.onclick = function(){ if(inputId === 'pp-search'){ var old=document.getElementById('pp-scan'); if(old && typeof old.onclick==='function'){ try{ old.onclick.call(old); return; }catch(e){} } scanAndPick(inputId); return; } window.oniScanTo(inputId); };
    function scanAndPick(inputId){ var A=window.Android; if(!A || typeof A.scanBarcode !== 'function'){ if(typeof showToast==='function') showToast('\u0421\u043a\u0430\u043d\u0435\u0440 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d'); return; } var prev=window.onBarcodeScanned; window.onBarcodeScanned=function(j){ try{ var d=typeof j==='string'?JSON.parse(j):j; var c=String((d&&(d.barcode||d.code||d.value))||'').trim(); if(c && typeof products !== 'undefined' && Array.isArray(products)){ var found=null; for(var k=0;k<products.length;k++){ var pp=products[k]; if(!pp.isCategoryPlaceholder && typeof productBarcodes==='function' && productBarcodes(pp).indexOf(c)>=0){ found=pp; break; } } if(found){ var ov=document.getElementById('pp-ov'); if(ov){ try{ var closeBtn=document.getElementById('pp-close'); if(closeBtn && typeof closeBtn.onclick==='function'){ closeBtn.onclick(); } else { ov.remove(); } }catch(e){} } if(window.__oniPickerOnSelect && typeof window.__oniPickerOnSelect==='function'){ try{ window.__oniPickerOnSelect(found.id); }catch(e){} } return; } else { if(typeof showToast==='function') showToast('Штрихкод не найден: '+c); } } }catch(e){} window.onBarcodeScanned=prev; }; A.scanBarcode(); }
    var clr = document.createElement('button');
    clr.type = 'button';
    clr.className = 'oni-clear-btn';
    clr.title = 'Clear';
    clr.innerHTML = '&#10005;';
    clr.style.cssText = 'position:absolute;right:38px;top:50%;transform:translateY(-50%);background:none;border:0;font-size:16px;padding:4px 6px;cursor:pointer;line-height:1;z-index:2;color:var(--muted);display:none;';
    clr.onclick = function(){ window.oniClearSearch(inputId); input.focus(); };
    wrap.appendChild(scan);
    wrap.appendChild(clr);
    var sync = function(){ clr.style.display = input.value ? 'block' : 'none'; };
    input.addEventListener('input', sync);
    sync();
  }
  var ids = ['product-search','pos-search','pp-search'];
  function enrichAll(){ for(var k=0;k<ids.length;k++){ try{ enrich(ids[k]); }catch(e){} } }
  function init(){
    enrichAll();
    if(!document.body) return;
    try{
      new MutationObserver(function(){ enrichAll(); }).observe(document.body, {childList:true, subtree:true});
    }catch(e){ console.warn('ui-extra MutationObserver:', e); }
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();