// ===== core.js =====
// РћР±С‰РёРµ СѓС‚РёР»РёС‚С‹, РґРѕСЃС‚СѓРїРЅС‹Рµ РІСЃРµРј РјРѕРґСѓР»СЏРј CRM.
// РЁР°Рі 2a: 9 С‡РёСЃС‚С‹С… СѓС‚РёР»РёС‚ РёР· index.html.
// РџРѕСЂСЏРґРѕРє: Firebase SDK -> XLSX -> core.js -> РѕСЃРЅРѕРІРЅРѕР№ script -> ui-extra.js
// Р¤СѓРЅРєС†РёРё РЅРµ С‡РёС‚Р°СЋС‚ СЃРѕСЃС‚РѕСЏРЅРёРµ (products, activeUser), РїРѕСЂСЏРґРѕРє Р·Р°РіСЂСѓР·РєРё Р±РµР·РѕРїР°СЃРµРЅ.
function fmtMoney(n){ return (Math.round(n*100)/100).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:0})+' ₸'; }

function fmtDate(d){ const dt=new Date(d); return dt.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}); }

function fmtDateTime(value){
  if(!value) return '';
  const s=String(value);
  if(s.length<=10){
    return fmtDate(s);
  }
  const d=new Date(s);
  if(!Number.isFinite(d.getTime())) return s;
  const day=String(d.getDate()).padStart(2,'0');
  const mon=String(d.getMonth()+1).padStart(2,'0');
  const yr=String(d.getFullYear()).slice(-2);
  const hh=String(d.getHours()).padStart(2,'0');
  const mm=String(d.getMinutes()).padStart(2,'0');
  return day+'.'+mon+'.'+yr+', '+hh+':'+mm;
}

function todayISO(){ const d=new Date(); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

function escapeHtml(value){ return String(value??'').replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch])); }

function uid(){ return (crypto.randomUUID?crypto.randomUUID():'id-'+Math.random().toString(36).slice(2)+Date.now()); }

function initials(name){ return (name||'').trim().slice(0,2).toUpperCase(); }

function nowISO(){return new Date().toISOString();}

function localDateTime(iso){return new Date(iso).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}


// ===== Step 2b: modules / roles / search / toast / saveUiState =====
function sanitizeModulesConfig(raw){
  const src=(raw && typeof raw==='object' && !Array.isArray(raw))?raw:{};
  const out={};
  Object.keys(defaultModulesConfig).forEach(function(k){
    if(CORE_MODULES.indexOf(k)>=0) return; // core не хранится
    out[k]=Object.prototype.hasOwnProperty.call(src,k)
      ? src[k]===true
      : defaultModulesConfig[k]===true;
  });
  return out;
}

function moduleOn(name){return !!(modulesConfig&&modulesConfig[name]===true);}

function isModOn(key){
  try{
    if(typeof moduleOn==='function') return !!moduleOn(key);
  }catch(e){}
  return true;
}

function viewAllowedByModules(view){
  var mod=MODULE_BY_VIEW[view];
  if(!mod) return true;
  return isModOn(mod);
}

function roleNav(role){
  var base=(ROLE_NAV&&ROLE_NAV[role])||['orders'];
  return base.filter(function(v){ return viewAllowedByModules(v); });
}

function roleAccess(role){
  var base=(ROLE_ACCESS&&ROLE_ACCESS[role])||['orders'];
  return base.filter(function(v){ return viewAllowedByModules(v); });
}

function saveUiState(){
  try{ localStorage.setItem('sklad_crm_ui_state', JSON.stringify({currentView,ordersSubView})); }catch(e){}
}

function showToast(msg){
  const root=document.getElementById('toast-root');
  root.innerHTML='<div class="toast"></div>';
  root.firstChild.textContent=String(msg);
  setTimeout(()=>{ if(root.firstChild) root.innerHTML=''; },2200);
}

function userRole(){ return (activeUser && activeUser.role) || 'cashier'; }

function canAccess(view){
  if(!activeUser) return false;
  var views=roleAccess(userRole());
  if(views.indexOf(view)<0) return false;
  if(!viewAllowedByModules(view)) return false;
  return true;
}

function requireAccess(view){
  if(canAccess(view)) return true;
  showToast('Нет доступа к разделу');
  return false;
}

function bindLiveSearch(inputId,rowSelector,normalize=s=>String(s||'').toLowerCase()){
  const input=document.getElementById(inputId);
  if(!input)return;
  const stateSet={
    'product-search':v=>productSearch=v,
    'pos-search':v=>posSearch=v,
    'debt-search':v=>debtSearch=v,
    'consignment-search':v=>consignmentSearch=v,
    'client-search':v=>clientSearch=v,
    'supplier-search':v=>supplierSearch=v
  };
  const apply=()=>{
    if(stateSet[inputId]) stateSet[inputId](input.value);
    const q=normalize(input.value.trim());
    let visible=0;
    document.querySelectorAll(rowSelector).forEach(row=>{
      const text=normalize(row.dataset.searchText||row.textContent||'');
      const words=q.split(/\s+/).filter(Boolean);
      const show=!q||words.every(w=>text.includes(w)||text.includes(w.replace(/ы$/,'')+'а')||text.includes(w.replace(/а$/,'')+'ы')||text.includes(w.replace(/и$/,'')+'а'));
      row.style.display=show?'':'none';
      if(show)visible++;
    });
    const empty=document.querySelector(`[data-live-empty=\"${inputId}\"]`);
    if(empty)empty.style.display=visible?'none':'';
  };
  input.oninput=apply;
  apply();
}

function normalizeSearchWord(value){
  return String(value??'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();
}

function searchStem(word){
  let w=normalizeSearchWord(word).replace(/\s+/g,'');
  if(w.length<=3)return w;
  const endings=['иями','ями','ами','ого','ему','ому','ыми','ими','ее','ие','ые','ое','ий','ый','ой','ем','ам','ям','ом','ов','ев','ах','ях','ы','и','а','я','о','е','у','ю'];
  for(const end of endings){ if(w.endsWith(end) && w.length-end.length>=4){ w=w.slice(0,-end.length); break; } }
  return w;
}

function searchVariants(token){
  const base=normalizeSearchWord(token); if(!base)return [];
  const out=new Set([base,searchStem(base)]);
  Object.entries(SEARCH_SYNONYMS).forEach(([key,vals])=>{
    const group=[key,...vals].map(normalizeSearchWord);
    if(group.some(v=>v===base||searchStem(v)===searchStem(base))){ group.forEach(v=>{out.add(v);out.add(searchStem(v));}); }
  });
  return [...out].filter(Boolean);
}

function smartProductSearch(text,query){
  const hay=normalizeSearchWord(text);
  if(!query.trim())return true;
  const hayWords=hay.split(' ').filter(Boolean);
  const hayStems=new Set(hayWords.map(searchStem));
  return normalizeSearchWord(query).split(' ').filter(Boolean).every(token=>{
    const variants=searchVariants(token);
    return variants.some(v=>hay.includes(v)||hayStems.has(searchStem(v)));
  });
}


// ===== Step 2c1: storage layer (IndexedDB + localStorage + native bridge) =====
function withTimeout(promise,ms=700){
  return Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve(null),ms))]);
}

function openIDB(){
  if(!('indexedDB' in window)) return Promise.resolve(null);
  if(_idbPromise) return _idbPromise;
  _idbPromise=new Promise(resolve=>{
    let done=false;
    const finish=v=>{if(!done){done=true;resolve(v)}};
    const timer=setTimeout(()=>finish(null),700);
    try{
      const req=indexedDB.open(IDB_NAME,1);
      req.onupgradeneeded=()=>{ try{ if(!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); }catch(e){} };
      req.onsuccess=()=>{clearTimeout(timer);finish(req.result)};
      req.onerror=()=>{clearTimeout(timer);finish(null)};
      req.onblocked=()=>{};
    }catch(e){clearTimeout(timer);finish(null);}
  });
  return _idbPromise;
}

async function idbGet(key){
  const db=await withTimeout(openIDB(),800); if(!db) return null;
  return withTimeout(new Promise(resolve=>{
    try{
      const tx=db.transaction(IDB_STORE,'readonly');
      const req=tx.objectStore(IDB_STORE).get(key);
      req.onsuccess=()=>resolve(req.result==null?null:String(req.result));
      req.onerror=()=>resolve(null);
      tx.onabort=()=>resolve(null);
    }catch(e){resolve(null);}
  }),800);
}

async function idbDelete(key){
  const db=await withTimeout(openIDB(),800); if(!db) return false;
  return withTimeout(new Promise(resolve=>{
    try{
      const tx=db.transaction(IDB_STORE,'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>resolve(false);
      tx.onabort=()=>resolve(false);
    }catch(e){resolve(false);}
  }),800);
}

async function idbSet(key,value){
  const db=await withTimeout(openIDB(),800); if(!db) return false;
  const result=await withTimeout(new Promise(resolve=>{
    try{
      const tx=db.transaction(IDB_STORE,'readwrite');
      tx.objectStore(IDB_STORE).put(String(value),key);
      tx.oncomplete=()=>resolve(true); tx.onerror=()=>resolve(false); tx.onabort=()=>resolve(false);
    }catch(e){resolve(false);}
  }),800);
  return result===true;
}

async function storageGet(key){
  // На телефоне/при открытии HTML как файла localStorage должен быть первым,
  // чтобы зависший IndexedDB никогда не блокировал запуск CRM.
  try{ const v=localStorage.getItem('sklad_crm_'+key); if(v!==null && String(v).trim()!=='') return v; }catch(e){}
  try{
    if(window.storage && typeof window.storage.get==='function'){
      const r=await withTimeout(window.storage.get(key,false),700);
      if(r && r.value!==undefined && r.value!==null && String(r.value).trim()!==''){
        const v=String(r.value); try{localStorage.setItem('sklad_crm_'+key,v)}catch(e){}; return v;
      }
    }
  }catch(e){}
  try{ const v=await idbGet(key); if(v!==null && String(v).trim()!=='') return v; }catch(e){}
  return null;
}

async function storageSet(key,value){
  const text=String(value); let saved=false;
  // Синхронная копия — основная для локального HTML и Android.
  try{ localStorage.setItem('sklad_crm_'+key,text); saved=true; }catch(e){}
  // Остальные хранилища — только дополнительно и никогда не должны блокировать UI.
  try{ if(window.storage && typeof window.storage.set==='function') { const r=await withTimeout(window.storage.set(key,text,false),700); saved=!!r||saved; } }catch(e){}
  try{ if(await idbSet(key,text)) saved=true; }catch(e){}
  return saved;
}


// ===== Step 2c2: persist + full backup / restore =====
function makeFullBackup(){
  return JSON.stringify({
    version:CRM_BACKUP_VERSION, savedAt:new Date().toISOString(),
    products,movements,orders,debts,consignments,contacts,suppliers,purchases,procurementRequests,giftCards,warehouses,points,meta,cashSettings,kaspiSettings,fiscalSettings,shopSettings,visualSettings,users,shifts,messages,sessions,inventorySessions,reminders,modulesConfig:sanitizeModulesConfig(modulesConfig),userPreferences,actionHistory
  });
}

async function saveFullBackupNow(){
      /* Phone B fix: IndexedDB в этом WebView отключён патчем в <head>.
         Без IDB полный бэкап хранить негде — тихо выходим, не шумим 
         ложным тостом о свободном месте. */
      if(!window.indexedDB){
        return false;
      }
      if(_saveBusy){ _backupQueued=true; return false; }
      _saveBusy=true;
      let ok=false;
      try{
        const data=makeFullBackup();
        const ts=String(Date.now());
        try{ if(await idbSet(BACKUP_KEY,data)) ok=true; }catch(e){}
        try{ await idbSet(BACKUP_TS_KEY,ts); }catch(e){}
        if(ok){
          _backupFailCount=0;
        }else{
          _backupFailCount++;
        }
        return ok;
      }catch(e){
        _backupFailCount++;
        return false;
      }finally{
        _saveBusy=false;
        if(_backupQueued){ _backupQueued=false; setTimeout(()=>saveFullBackupNow().catch(()=>{}),0); }
      }
    }

function queueFullBackup(){
  // Если бэкап уже сохраняется прямо сейчас — просто помечаем, что нужно повторить
  // после его завершения (это уже делает saveFullBackupNow/_backupQueued), и НЕ
  // трогаем debounce-таймер: иначе при частых persist() подряд (например, во время
  // импорта Excel) таймер бесконечно рестартуется и первый вызов сохранения отодвигается.
  if(_saveBusy){ _backupQueued=true; return; }
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(()=>saveFullBackupNow().catch(()=>{}),350);
}

async function getFullBackup(){
    try{ const v=await idbGet(BACKUP_KEY); if(v) return v; }catch(e){}
    return null;
  }

function downloadBackup(){
  const blob=new Blob([makeFullBackup()],{type:'application/json;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='sklad-crm-backup-'+todayISO()+'.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  showToast('Резервная копия сохранена');
}

function restoreFromText(text){
  const d=JSON.parse(text);
  if(!d || !Array.isArray(d.products) || !Array.isArray(d.movements) || !Array.isArray(d.orders)) throw new Error('Неверная резервная копия');
  const backupVersion=Number(d.version)||1;
  if(backupVersion>CRM_BACKUP_VERSION) throw new Error('Бэкап создан более новой версией CRM. Обновите приложение.');
  products=d.products||[]; movements=d.movements||[]; orders=d.orders||[]; debts=d.debts||[]; consignments=d.consignments||[]; contacts=d.contacts||[]; suppliers=d.suppliers||[]; purchases=d.purchases||[]; procurementRequests=d.procurementRequests||[]; giftCards=Array.isArray(d.giftCards)?d.giftCards:[]; warehouses=Array.isArray(d.warehouses)?d.warehouses:[]; points=Array.isArray(d.points)?d.points:[]; meta=d.meta||{orderSeq:orders.length+1}; inventorySessions=Array.isArray(d.inventorySessions)?d.inventorySessions:[]; cashSettings=Object.assign({taxRate:4,kaspiPayRate:13,kaspiRedRate:0,cashDifferenceLimit:0,sessionLockEnabled:false,sessionLockMinutes:15,sessionLogoutMinutes:120,shiftAutoCloseHours:24,bonusEnabled:false,bonusPercent:1,bonusMaxPayPercent:50},d.cashSettings||{}); kaspiSettings={...kaspiSettings,...(d.kaspiSettings||{})}; fiscalSettings={...fiscalSettings,...(d.fiscalSettings||{})}; shopSettings=d.shopSettings||shopSettings; visualSettings=d.visualSettings||visualSettings; users=Array.isArray(d.users)?d.users:users; shifts=Array.isArray(d.shifts)?d.shifts:shifts; messages=Array.isArray(d.messages)?d.messages:messages; sessions=Array.isArray(d.sessions)?d.sessions:sessions; reminders=Array.isArray(d.reminders)?d.reminders:[]; if(d.modulesConfig&&typeof d.modulesConfig==='object'&&!Array.isArray(d.modulesConfig)) modulesConfig=sanitizeModulesConfig({...modulesConfig,...d.modulesConfig}); if(d.userPreferences&&typeof d.userPreferences==='object'&&!Array.isArray(d.userPreferences)) userPreferences=d.userPreferences; migrateUserPreferences(); if(activeUser)loadUserPrefs(activeUser.id); if(Array.isArray(d.actionHistory)) actionHistory=normalizeActionHistory(d.actionHistory); ensureDefaultAdmin();
  return Promise.all(['products','movements','orders','debts','consignments','contacts','suppliers','purchases','procurementRequests','giftCards','meta','cashSettings','kaspiSettings','fiscalSettings','shopSettings','visualSettings','users','shifts','messages','sessions','inventorySessions','modulesConfig','userPreferences','actionHistory','reminders','warehouses','points'].map(persist));
}

function openBackupFile(){
  const input=document.createElement('input'); input.type='file'; input.accept='.json,application/json';
  input.onchange=()=>{ const file=input.files&&input.files[0]; if(!file) return; const r=new FileReader(); r.onload=async()=>{ try{ await restoreFromText(String(r.result)); await saveFullBackupNow(); safeRender(); showToast('База восстановлена'); }catch(e){ alert('Не удалось восстановить базу: '+e.message); } }; r.readAsText(file,'utf-8'); };
  input.click();
}

async function persist(which){
  _lastPersistAt = Date.now();
  try{
  var _ok=false;
  if(which=='products'){ _ok=await storageSet('products',JSON.stringify(products)); queueFullBackup(); }
  else if(which=='movements'){ _ok=await storageSet('movements',JSON.stringify(movements)); queueFullBackup(); }
  else if(which=='orders'){ _ok=await storageSet('orders',JSON.stringify(orders)); queueFullBackup(); }
  else if(which=='debts'){ _ok=await storageSet('debts',JSON.stringify(debts)); queueFullBackup(); }
  else if(which=='consignments'){ _ok=await storageSet('consignments',JSON.stringify(consignments)); queueFullBackup(); }
  else if(which=='contacts'){ _ok=await storageSet('contacts',JSON.stringify(contacts)); queueFullBackup(); }
  else if(which=='suppliers'){ _ok=await storageSet('suppliers',JSON.stringify(suppliers)); queueFullBackup(); }
  else if(which=='purchases'){ _ok=await storageSet('purchases',JSON.stringify(purchases)); queueFullBackup(); }
  else if(which=='procurementRequests'){ _ok=await storageSet('procurementRequests',JSON.stringify(procurementRequests)); queueFullBackup(); }
  else if(which=='giftCards'){ _ok=await storageSet('giftCards',JSON.stringify(giftCards)); queueFullBackup(); }
  else if(which=='cashSettings'){ _ok=await storageSet('cashSettings',JSON.stringify(cashSettings)); queueFullBackup(); }
  else if(which=='kaspiSettings'){ _ok=await storageSet('kaspiSettings',JSON.stringify(kaspiSettings)); queueFullBackup(); }
  else if(which=='fiscalSettings'){ _ok=await storageSet('fiscalSettings',JSON.stringify(fiscalSettings)); queueFullBackup(); }
  else if(which=='visualSettings'){ _ok=await storageSet('visualSettings',JSON.stringify(visualSettings)); queueFullBackup(); }
  else if(which=='shopSettings'){ _ok=await storageSet('shopSettings',JSON.stringify(shopSettings)); queueFullBackup(); }
  else if(which=='meta'){ _ok=await storageSet('meta',JSON.stringify(meta)); queueFullBackup(); }
  else if(which=='users'){ _ok=await storageSet('users',JSON.stringify(users)); queueFullBackup(); }
  else if(which=='shifts'){ _ok=await storageSet('shifts',JSON.stringify(shifts)); queueFullBackup(); }
  else if(which=='messages'){ _ok=await storageSet('messages',JSON.stringify(messages)); queueFullBackup(); }
  else if(which=='inventorySessions'){ _ok=await storageSet('inventorySessions',JSON.stringify(inventorySessions)); queueFullBackup(); }
  else if(which=='sessions'){ _ok=await storageSet('sessions',JSON.stringify(sessions)); }
  else if(which=='userPreferences'){ _ok=await storageSet('userPreferences',JSON.stringify(userPreferences)); queueFullBackup(); }
  else if(which=='modulesConfig'){ _ok=await storageSet('modulesConfig',JSON.stringify(modulesConfig)); queueFullBackup(); }
  else if(which=='actionHistory'){ _ok=await storageSet('actionHistory',JSON.stringify(actionHistory)); queueFullBackup(); }
  else if(which=='reminders'){ _ok=await storageSet('reminders',JSON.stringify(reminders)); queueFullBackup(); }
  else if(which=='warehouses'){ _ok=await storageSet('warehouses',JSON.stringify(warehouses)); queueFullBackup(); }
  else if(which=='points'){ _ok=await storageSet('points',JSON.stringify(points)); queueFullBackup(); }
  try{ _fbScheduleSync(which); }catch(e){}
  return _ok;
  }finally{_dataVersion++;}
}


// ===== Step 3a: product utilities (pure, no DOM) =====
function getProductPhotos(p){
  if(!p) return [];
  if(Array.isArray(p.photos) && p.photos.length) return p.photos;
  if(p.photo) return [p.photo];
  return [];
}

function getProductMainPhoto(p){
  if(!p) return '';
  const photos=getProductPhotos(p);
  if(!photos.length) return '';
  const idx=Number.isInteger(p.mainPhotoIndex)?p.mainPhotoIndex:0;
  return photos[Math.min(Math.max(0,idx),photos.length-1)]||photos[0];
}

function productIcon(p, size){
  size=size||36;
  const src=getProductMainPhoto(p);
  if(src){
    return '<img class="product-photo-list" style="width:'+size+'px;height:'+size+'px;border-radius:10px;object-fit:cover;" src="'+escapeHtml(src)+'" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
      +'<span class="product-icon-fallback" style="display:none;width:'+size+'px;height:'+size+'px;align-items:center;justify-content:center;">'+escapeHtml(initials(p&&(p.name||p.category)||''))+'</span>';
  }
  return '<span class="product-icon-fallback" style="display:flex;width:'+size+'px;height:'+size+'px;align-items:center;justify-content:center;">'+escapeHtml(initials(p&&(p.name||p.category)||''))+'</span>';
}

function productSalesQty(productId){
  let sold=0;
  orders.forEach(o=>{
    (o.items||[]).forEach(it=>{if(it.productId===productId)sold+=Number(it.qty)||0;});
  });
  movements.filter(m=>m.type==='return'&&m.productId===productId).forEach(m=>{sold-=Number(m.qty)||0;});
  return Math.max(0,sold);
}

function productAvailable(p){
  if(!p) return 0;
  return Math.max(0, (Number(p.qty)||0) - (Number(p.reserved)||0));
}

function productVatRate(p){
  if(p && p.vatRate!=null && Number.isFinite(Number(p.vatRate))){
    return Number(p.vatRate);
  }
  return Number(cashSettings&&cashSettings.taxRate)||0;
}

function productBarcodes(p){
  if(!p) return [];
  const arr = [];
  if(p.barcode) arr.push(String(p.barcode).trim());
  if(Array.isArray(p.barcodes)){
    p.barcodes.forEach(b=>{
      const v = String(b||'').trim();
      if(v && arr.indexOf(v)<0) arr.push(v);
    });
  }
  return arr;
}

function renderBarcodeList(barcodes){
  return (Array.isArray(barcodes)?barcodes:[]).map((b,i)=>`<div class="product-extra-row"><input class="form-input f-extra-barcode" data-index="${i}" value="${escapeHtml(b||'')}" inputmode="numeric" maxlength="13" placeholder="Дополнительный штрихкод"><button type="button" class="btn btn-danger-text f-remove-barcode" data-index="${i}">Удалить</button></div>`).join('');
}

function renderPackagingList(packaging){
  return (Array.isArray(packaging)?packaging:[]).map((x,i)=>{const item=x&&typeof x==='object'?x:{name:String(x||''),qty:1,unit:'шт'};return `<div class="product-extra-row packaging-row"><input class="form-input f-pack-name" data-index="${i}" value="${escapeHtml(item.name||'')}" placeholder="Название упаковки"><input class="form-input f-pack-qty" data-index="${i}" type="number" min="0" step="0.001" value="${Number(item.qty)||0}" placeholder="Кол-во"><input class="form-input f-pack-unit" data-index="${i}" value="${escapeHtml(item.unit||'шт')}" placeholder="Ед."><button type="button" class="btn btn-danger-text f-remove-packaging" data-index="${i}">Удалить</button></div>`;}).join('');
}

function salesLevel(qty){
  qty=Number(qty)||0;
  if(qty>=Number(visualSettings.salesRed)||0)return 'red';
  if(qty>=Number(visualSettings.salesOrange)||0)return 'orange';
  if(qty>=Number(visualSettings.salesYellow)||0)return 'yellow';
  return 'green';
}

function stockLevel(p){
  const qty=Number(p.qty)||0;
  const min=Math.max(0,Number(p.minStock)||0);
  if(qty<=0)return 'zero';
  const red=Math.max(0,Number(visualSettings.stockRed)||0);
  const yellow=Math.max(red+1,Number(visualSettings.stockYellow)||0);
  if(qty<=red)return 'red';
  if(qty<=yellow)return 'yellow';
  if(min>0 && qty<=min)return 'yellow';
  return 'green';
}

function salesTextColor(qty){ return `sales-text-${salesLevel(qty)}`; }

function stockTextColor(p){ return `stock-text-${stockLevel(p)}`; }

function productSearchText(p){
  return [p?.name,p?.sku,p?.category,p?.description,p?.purpose,...productBarcodes(p),
    ...(Array.isArray(p?.keywords)?p.keywords:[]),p?.ocrText,...(Array.isArray(p?.photos)?p.photos:[])].filter(v=>typeof v==='string' && !/^data:image\//i.test(v)).join(' ');
}


// ===== Step 3b: product view/bind (list UI, selection mode) =====
function enterProductSelection(initialId){
  productSelectionMode = true;
  productSelectionSet = new Set();
  if(initialId) productSelectionSet.add(initialId);
  productSearch='';
  if(navigator.vibrate) try{navigator.vibrate(30);}catch(e){}
  safeRender();
}

function exitProductSelection(){
  productSelectionMode = false;
  productSelectionSet = new Set();
  safeRender();
}

function toggleProductSelection(id){
  if(productSelectionSet.has(id)) productSelectionSet.delete(id);
  else productSelectionSet.add(id);
  try{
    var scrollY = window.scrollY || 0;
    safeRender();
    window.scrollTo(0, scrollY);
  }catch(e){}
}

function renderProductSelectionView(){
  const all=products.filter(p=>!p.isCategoryPlaceholder);
  const _q=String(productSearch||'').trim();
  const filtered=_q?all.filter(p=>smartProductSearch(productSearchText(p),_q)):all;
  const n=productSelectionSet.size;
  filtered.sort(function(a,b){var _a=productSelectionSet.has(a.id)?0:1;var _b=productSelectionSet.has(b.id)?0:1;return _a-_b;});
  return `
    <div class="panel" style="position:sticky;top:58px;z-index:45;margin-bottom:10px;">
      <div class="panel-body" style="display:flex;align-items:center;gap:8px;padding:10px 12px;">
        <button type="button" class="btn" id="ps-cancel">Отмена</button>
        <div style="flex:1;font-weight:700;font-size:13px;" data-ps-counter>Выбрано: ${n}</div>
        <button type="button" class="btn" id="ps-select-all">Все</button>
        <button type="button" class="btn btn-primary" id="ps-delete" ${n===0?'disabled':''}>Удалить</button>
      </div>
      <div style="padding:0 12px 10px;"><div class="search" style="margin:0;"><input id="ps-search" placeholder="Поиск по товару..." value="${escapeHtml(productSearch)}"></div><button type="button" id="ps-clear" style="margin-top:6px;width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;">✕ Очистить поиск и показать все</button></div>
    </div>
    <div class="panel">
      ${(filtered.length?filtered:[]).map(p=>{
        const checked=productSelectionSet.has(p.id);
        return `<div class="list-row" data-ps-row="${escapeHtml(p.id)}" style="cursor:pointer;">
          <div style="width:22px;height:22px;border-radius:6px;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;${checked?'background:var(--primary);border-color:var(--primary);color:#fff;':''}">${checked?'✓':''}</div>
          <div class="product-card-photo">${productIcon(p,42)}</div>
          <div class="row-main"><div class="row-title">${escapeHtml(p.name)}</div><div class="row-sub">${escapeHtml(p.sku||'')} · ${fmtMoney(p.price)}</div></div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function viewProducts(){
  if(productSelectionMode) return renderProductSelectionView();
  const _af=_pfCount();
  const all=_pfApplySort(_pfApplyFilters(products.filter(p=>!p.isCategoryPlaceholder)));
  return `
  <div class="products-sticky-header" style="position:sticky;top:58px;z-index:40;background:var(--bg);padding:6px 0 4px 0;"><div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
    <button class="chip" id="pf-sort-btn" type="button">${_pfSortLabel()}</button>
    <button class="chip ${_af?'active':''}" id="pf-filters-btn" type="button">⚙️ Фильтры${_af ? ' · ' + _af : ''}</button>
    <button class="chip" id="pf-cats-btn" type="button">🏷️ Категории</button>
  </div>
  <div class="search" style="position:relative;"><span class="search-icon">&#8981;</span><input id="product-search" style="padding-right:42px;" placeholder="Поиск по товару, описанию, назначению…" value="${escapeHtml(productSearch)}"><button type="button" id="product-scan-btn" onclick="oniScanToSearch()" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:0;font-size:20px;padding:0;cursor:pointer;line-height:1;z-index:2;" title="Scan">&#128247;</button></div>
  <div style="display:flex;gap:6px;margin-bottom:8px;"><button class="btn" id="pf-save-filter" type="button">💾 Сохранить</button><button class="btn" id="pf-open-filters" type="button">⭐ Мои фильтры</button></div>
  <div style="display:flex;gap:7px;margin-bottom:12px;">
    <div style="position:relative;flex:1;">
      <button class="btn" id="import-products" style="width:100%;">↓ Импорт Excel</button>
      <div id="excel-menu" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:70;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.12);padding:5px;">
        <button id="choose-excel" style="width:100%;display:flex;align-items:center;gap:9px;padding:11px;border:0;background:none;border-radius:9px;color:var(--text);font-size:13px;text-align:left;">📥 <span>Выбрать Excel</span></button>
        <button id="export-template" style="width:100%;display:flex;align-items:center;gap:9px;padding:11px;border:0;background:none;border-radius:9px;color:var(--text);font-size:13px;text-align:left;">📋 <span>Скачать шаблон</span></button>
      </div>
    </div>
    <input id="excel-file" type="file" accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,.xlsx,.xls,.csv" style="display:none;">
    <button class="btn" id="export-products" type="button" style="flex:1;">↑ Экспорт Excel</button>
  </div>
  </div>
  <div class="panel">
    ${all.length?all.map(p=>`
      <div class="list-row live-search-row" data-search-text="${escapeHtml(productSearchText(p))}" style="position:relative;">
        <button type="button" data-open="${escapeHtml(p.id)}" style="display:flex;align-items:center;gap:11px;flex:1;min-width:0;background:none;border:0;text-align:left;color:inherit;">
          <div class="product-card-photo product-list-photo" data-product-photo="${escapeHtml(p.id)}" title="Нажмите, чтобы увеличить">${productIcon(p,42)}</div>
          <div class="row-main"><div class="row-title"><span class="${salesTextColor(productSalesQty(p.id))}" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}</span></div><div class="row-sub">${escapeHtml(p.sku||'')} · ${fmtMoney(p.price)}${p.manufactureDate?' · изг. '+fmtDate(p.manufactureDate):''}</div><div class="row-note ${stockTextColor(p)}">Остаток: ${p.qty} ${escapeHtml(p.unit||'')}</div>${p.expiryDate?`<div class="row-note ${expiryInfo(p.expiryDate).cls}">${expiryInfo(p.expiryDate).text}</div>`:''}</div>
        </button>
        <div class="row-right" style="align-items:flex-end;gap:6px;"><button type="button" class="product-info-btn" data-product-info="${escapeHtml(p.id)}" aria-label="Информация о товаре">i</button><span class="badge ${p.minStock>0&&p.qty<=p.minStock?'badge-low':'badge-ok'}">${p.qty} ${escapeHtml(p.unit)}</span></div>
      </div>`).join(''):'<div class="panel-body"><div class="empty">Товаров пока нет</div></div>'}
    ${all.length?'<div class="panel-body" data-live-empty="product-search" style="display:none;"><div class="empty">Ничего не найдено</div></div>':''}
  </div>`;
}

function bindProducts(){
  if(productSelectionMode){
    const _psi=document.getElementById('ps-search');
    if(_psi){
      _psi.oninput=function(){
        productSearch=_psi.value;
        const _q=String(productSearch||'').trim();
        document.querySelectorAll('[data-ps-row]').forEach(function(row){
          const _p=products.find(function(x){return x.id===row.dataset.psRow;});
          if(!_p) return;
          const _show=!_q||smartProductSearch(productSearchText(_p),_q);
          row.style.display=_show?'':'none';
        });
      };
    }
    var _psc=document.getElementById('ps-clear');
    if(_psc){ _psc.onclick=function(){
      productSearch='';
      var _pi=document.getElementById('ps-search'); if(_pi) _pi.value='';
      document.querySelectorAll('[data-ps-row]').forEach(function(row){ row.style.display=''; });
    }; }
    const c=document.getElementById('ps-cancel'); if(c)c.onclick=exitProductSelection;
    const sa=document.getElementById('ps-select-all');
    if(sa)sa.onclick=()=>{
      const all=products.filter(p=>!p.isCategoryPlaceholder);
      if(productSelectionSet.size===all.length) productSelectionSet.clear();
      else all.forEach(p=>productSelectionSet.add(p.id));
      safeRender();
    };
    const dl=document.getElementById('ps-delete'); if(dl)dl.onclick=openMassDeleteConfirm;
    document.querySelectorAll('[data-ps-row]').forEach(b=>{
      b.onclick=()=>toggleProductSelection(b.dataset.psRow);
    });
    return;
  }

  bindLiveSearch('product-search','.live-search-row',v=>normalizeSearchWord(v));
  var pfSave=document.getElementById('pf-save-filter'); if(pfSave)pfSave.onclick=function(){openSaveFilterDialog('products');};
  var pfOpen=document.getElementById('pf-open-filters'); if(pfOpen)pfOpen.onclick=function(){openSavedFiltersDialog('products');};
  var pfSortBtn=document.getElementById('pf-sort-btn'); if(pfSortBtn)pfSortBtn.onclick=openProductSortSheet;
  var pfFiltersBtn=document.getElementById('pf-filters-btn'); if(pfFiltersBtn)pfFiltersBtn.onclick=openProductFiltersSheet;
  var pfCatsBtn=document.getElementById('pf-cats-btn'); if(pfCatsBtn)pfCatsBtn.onclick=openCategoryManager;
  const productInput=document.getElementById('product-search');
  if(productInput){ productInput.oninput=()=>{ productSearch=productInput.value; let visible=0; document.querySelectorAll('.live-search-row[data-search-text]').forEach(row=>{ const show=smartProductSearch(row.dataset.searchText||'',productInput.value); row.style.display=show?'':'none'; if(show)visible++; }); const empty=document.querySelector('[data-live-empty="product-search"]'); if(empty)empty.style.display=visible?'none':''; }; productInput.oninput(); }
  document.querySelectorAll('[data-open]').forEach(b=>{
    let lpTimer=null, lpFired=false;
    const cancel=()=>{ if(lpTimer){clearTimeout(lpTimer);lpTimer=null;} };
    const fire=()=>{ lpFired=true; cancel(); if(typeof enterProductSelection==='function'){enterProductSelection(b.dataset.open);} };
    b.addEventListener('pointerdown',e=>{
      if(e.target.closest('[data-product-photo]')) return;
      if(e.target.closest('[data-product-info]')) return;
      lpFired=false; cancel();
      lpTimer=setTimeout(fire,500);
    });
    b.addEventListener('pointerup',e=>{
      cancel();
      if(lpFired){e.preventDefault();e.stopPropagation();lpFired=false;}
    });
    b.addEventListener('pointercancel',cancel);
    b.addEventListener('contextmenu',e=>{
      if(e.target.closest('[data-product-photo]')) return;
      if(e.target.closest('[data-product-info]')) return;
      e.preventDefault(); cancel();
      if(typeof enterProductSelection==='function'){enterProductSelection(b.dataset.open);}
    });
    b.addEventListener('click',e=>{
      if(lpFired){e.preventDefault();e.stopPropagation();return;}
      openProductModal(b.dataset.open);
    });
  });
  document.querySelectorAll('[data-product-photo]').forEach(el=>el.onclick=e=>{
    e.preventDefault(); e.stopPropagation();
    const p=products.find(x=>x.id===el.dataset.productPhoto); if(!p)return;
    const src=p.mainPhoto||p.photo||(Array.isArray(p.photos)?p.photos[0]:'');
    if(src){const gallery=Array.isArray(p.photos)&&p.photos.length?p.photos:(p.photo?[p.photo]:[src]);const idx=Math.max(0,gallery.indexOf(src));openProductPhotoLightbox(src,p.name||'Фото товара',gallery,idx);}
  });
  document.querySelectorAll('[data-product-info]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openProductInfoModal(b.dataset.productInfo);});

  const importBtn=document.getElementById('import-products');
  const excelMenu=document.getElementById('excel-menu');
  const chooseExcel=document.getElementById('choose-excel');
  const fileInput=document.getElementById('excel-file');
  const closeExcelMenu=()=>{ if(excelMenu) excelMenu.style.display='none'; };
  if(importBtn && excelMenu){
    importBtn.onclick=()=>{
      excelMenu.style.display=excelMenu.style.display==='none'?'block':'none';
    };
  }
  if(chooseExcel && fileInput){
    chooseExcel.onclick=()=>{
      closeExcelMenu();
      // В Android используем нативный выбор документов: камера здесь никогда не нужна.
      if(window.Android && typeof window.Android.pickExcelFile==='function'){
        window.Android.pickExcelFile();
      }else{
        fileInput.click();
      }
    };
    fileInput.onchange=async(e)=>{
      const file=e.target.files?.[0];
      if(file) await importProductsFromExcel(file);
      e.target.value='';
    };
  }
  const templateBtn=document.getElementById('export-template');
  if(templateBtn) templateBtn.onclick=()=>{ closeExcelMenu(); downloadExcelTemplate(); };
  const exportBtn=document.getElementById('export-products');
  if(exportBtn) exportBtn.onclick=()=>exportProductsToExcel();
  if(_excelOutsideClickHandler) document.removeEventListener('click',_excelOutsideClickHandler);
  _excelOutsideClickHandler=function(e){
    const btn=document.getElementById('import-products');
    const wrap=btn&&btn.parentElement;
    if(wrap&&!wrap.contains(e.target)) closeExcelMenu();
  };
  document.addEventListener('click',_excelOutsideClickHandler);
}
