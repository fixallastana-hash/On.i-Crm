// ===== core.js =====
// Shared utilities available to all CRM modules.
// Step 2a: 9 clean utils extracted from index.html.
// Load order: Firebase SDK -> XLSX -> core.js -> main inline script -> ui-extra.js
// Functions do not read state (products, activeUser) at load time; safe ordering.
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


// ===== Step 3c1: product sort/filter helpers + state =====
/* ===================== PRODUCT SORT / FILTER ===================== */
var productSort = {field:'createdAt', dir:'desc'};
var productFilters = {categories:[], priceMin:null, priceMax:null, costMin:null, costMax:null, qtyMin:null, qtyMax:null, belowMin:false, noBarcode:false, noPhoto:false, showArchived:false};
function _pfNum(v){ if(v===null||v===undefined||v==='')return null; var n=Number(v); return isFinite(n)?n:null; }
function _pfSave(){ try{ localStorage.setItem('sklad_crm_product_sf', JSON.stringify({sort:productSort,filters:productFilters})); }catch(e){} }
function _pfLoad(){ try{ var r=localStorage.getItem('sklad_crm_product_sf'); if(!r)return; var o=JSON.parse(r); if(o&&o.sort&&o.sort.field)productSort=o.sort; if(o&&o.filters&&typeof o.filters==='object')productFilters=Object.assign(productFilters,o.filters); }catch(e){} }
_pfLoad();
function _pfCount(){
  var n=0, F=productFilters;
  if(F.categories&&F.categories.length)n++;
  if(_pfNum(F.priceMin)!==null||_pfNum(F.priceMax)!==null)n++;
  if(_pfNum(F.costMin)!==null||_pfNum(F.costMax)!==null)n++;
  if(_pfNum(F.qtyMin)!==null||_pfNum(F.qtyMax)!==null)n++;
  if(F.belowMin)n++; if(F.noBarcode)n++; if(F.noPhoto)n++; if(F.showArchived)n++;
  return n;
}
function _pfApplyFilters(list){
  var F=productFilters;
  return list.filter(function(p){
    if(!p||!p.id)return false;
    if(!F.showArchived&&p.archived)return false;
    if(F.categories&&F.categories.length&&F.categories.indexOf(p.category||'')<0)return false;
    var price=_pfNum(p.price)||0, cost=_pfNum(p.cost)||0, qty=_pfNum(p.qty)||0;
    var a=_pfNum(F.priceMin); if(a!==null&&price<a)return false;
    var b=_pfNum(F.priceMax); if(b!==null&&price>b)return false;
    a=_pfNum(F.costMin); if(a!==null&&cost<a)return false;
    b=_pfNum(F.costMax); if(b!==null&&cost>b)return false;
    a=_pfNum(F.qtyMin); if(a!==null&&qty<a)return false;
    b=_pfNum(F.qtyMax); if(b!==null&&qty>b)return false;
    if(F.belowMin){ var ms=_pfNum(p.minStock)||0; if(ms<=0||qty>ms)return false; }
    if(F.noBarcode){
      var hb=!!(p.barcode&&String(p.barcode).trim());
      if(!hb&&Array.isArray(p.barcodes)) hb=p.barcodes.some(function(x){return x&&String(x).trim();});
      if(hb)return false;
    }
    if(F.noPhoto){
      var hp=!!p.photo;
      if(!hp&&Array.isArray(p.photos)&&p.photos.length)hp=true;
      if(hp)return false;
    }
    return true;
  });
}
function _pfApplySort(list){
  var arr=list.slice(), s=productSort, f=s.field, d=s.dir==='asc'?1:-1;
  function n(v){var x=Number(v);return isFinite(x)?x:0;}
  arr.sort(function(a,b){
    switch(f){
      case 'createdAt': return ((Date.parse(a.createdAt||a.addedAt||a.updatedAt||0)||0)-(Date.parse(b.createdAt||b.addedAt||b.updatedAt||0)||0))*d;
      case 'name': return String(a.name||'').toLowerCase().localeCompare(String(b.name||'').toLowerCase(),'ru')*d;
      case 'category': return String(a.category||'').toLowerCase().localeCompare(String(b.category||'').toLowerCase(),'ru')*d;
      case 'price': return (n(a.price)-n(b.price))*d;
      case 'cost': return (n(a.cost)-n(b.cost))*d;
      case 'margin': return ((n(a.price)-n(a.cost))-(n(b.price)-n(b.cost)))*d;
      case 'qty': return (n(a.qty)-n(b.qty))*d;
      default: return 0;
    }
  });
  return arr;
}
function _pfSortLabel(){
  var s=productSort;
  var m={'createdAt_desc':'↓ Дата (новые)','createdAt_asc':'↑ Дата (старые)','name_asc':'А-Я Название','name_desc':'Я-А Название','category_asc':'А-Я Категория','category_desc':'Я-А Категория','price_asc':'↑ Цена','price_desc':'↓ Цена','cost_asc':'↑ Себестоимость','cost_desc':'↓ Себестоимость','margin_asc':'↑ Маржа','margin_desc':'↓ Маржа','qty_asc':'↑ Остаток','qty_desc':'↓ Остаток'};
  return m[s.field+'_'+s.dir]||'↓ Дата (новые)';
}
function openProductSortSheet(){
  var root=document.getElementById('modal-root'); if(!root)return;
  var opts=[
    ['createdAt','desc','↓ Дата добавления (новые)'],
    ['createdAt','asc','↑ Дата добавления (старые)'],
    ['name','asc','А-Я Название'],
    ['name','desc','Я-А Название'],
    ['category','asc','А-Я Категория'],
    ['category','desc','Я-А Категория'],
    ['price','asc','↑ Цена продажи'],
    ['price','desc','↓ Цена продажи'],
    ['cost','asc','↑ Себестоимость'],
    ['cost','desc','↓ Себестоимость'],
    ['margin','asc','↑ Маржа'],
    ['margin','desc','↓ Маржа'],
    ['qty','asc','↑ Остаток'],
    ['qty','desc','↓ Остаток']
  ];
  var rows=opts.map(function(o){
    var act=productSort.field===o[0]&&productSort.dir===o[1];
    return '<button type="button" class="list-row" data-pf-sort="'+o[0]+'_'+o[1]+'" style="width:100%;text-align:left;border:none;background:'+(act?'var(--primary-soft,#eef5ff)':'#fff')+';cursor:pointer;"><div class="row-main"><div class="row-title">'+o[2]+'</div></div>'+(act?'<div class="row-right" style="color:var(--primary);font-weight:700;">✓</div>':'')+'</button>';
  }).join('');
  root.innerHTML='<div class="sheet-overlay" id="pf-sort-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Сортировка</div><button class="sheet-close" id="pf-sort-x">✕</button></div><div class="sheet-body"><div class="panel"><div class="panel-body" style="padding:0;">'+rows+'</div></div></div></div></div>';
  var close=function(){root.innerHTML='';};
  document.getElementById('pf-sort-x').onclick=close;
  document.getElementById('pf-sort-ov').onclick=function(e){if(e.target.id==='pf-sort-ov')close();};
  root.querySelectorAll('[data-pf-sort]').forEach(function(b){
    b.onclick=function(){
      var parts=b.dataset.pfSort.split('_');
      productSort={field:parts[0],dir:parts[1]};
      _pfSave(); close(); safeRender();
    };
  });
}
function openProductFiltersSheet(){
  var root=document.getElementById('modal-root'); if(!root)return;
  var cats=[...new Set(products.filter(function(p){return p&&!p.isCategoryPlaceholder&&p.category;}).map(function(p){return p.category;}))].sort(function(a,b){return a.localeCompare(b,'ru');});
  var catChips=cats.map(function(c){
    var on=productFilters.categories.indexOf(c)>=0;
    return '<button type="button" class="chip '+(on?'active':'')+'" data-pf-cat="'+escapeHtml(c)+'">'+escapeHtml(c)+'</button>';
  }).join('');
  var F=productFilters;
  var val=function(v){return v===null||v===undefined?'':String(v);};
  root.innerHTML='<div class="sheet-overlay" id="pf-flt-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Фильтры</div><button class="sheet-close" id="pf-flt-x">✕</button></div><div class="sheet-body">'
    +'<div class="contact-title">Категории</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">'+catChips+'</div>'
    +'<div class="contact-title">Цена продажи</div><div style="display:flex;gap:6px;margin-bottom:12px;"><input class="form-input" id="pf-price-min" type="number" placeholder="от" value="'+val(F.priceMin)+'"><input class="form-input" id="pf-price-max" type="number" placeholder="до" value="'+val(F.priceMax)+'"></div>'
    +'<div class="contact-title">Себестоимость</div><div style="display:flex;gap:6px;margin-bottom:12px;"><input class="form-input" id="pf-cost-min" type="number" placeholder="от" value="'+val(F.costMin)+'"><input class="form-input" id="pf-cost-max" type="number" placeholder="до" value="'+val(F.costMax)+'"></div>'
    +'<div class="contact-title">Остаток</div><div style="display:flex;gap:6px;margin-bottom:12px;"><input class="form-input" id="pf-qty-min" type="number" placeholder="от" value="'+val(F.qtyMin)+'"><input class="form-input" id="pf-qty-max" type="number" placeholder="до" value="'+val(F.qtyMax)+'"></div>'
    +'<div class="panel" style="margin-bottom:12px;"><div class="panel-body" style="padding:0;">'
    +'<button type="button" class="list-row" data-pf-tog="belowMin" style="width:100%;text-align:left;border:none;background:#fff;cursor:pointer;"><div class="row-main"><div class="row-title">Только ниже минимума</div></div><div class="row-right">'+(F.belowMin?'✓':'')+'</div></button>'
    +'<button type="button" class="list-row" data-pf-tog="noBarcode" style="width:100%;text-align:left;border:none;background:#fff;cursor:pointer;"><div class="row-main"><div class="row-title">Только без штрихкода</div></div><div class="row-right">'+(F.noBarcode?'✓':'')+'</div></button>'
    +'<button type="button" class="list-row" data-pf-tog="noPhoto" style="width:100%;text-align:left;border:none;background:#fff;cursor:pointer;"><div class="row-main"><div class="row-title">Только без фото</div></div><div class="row-right">'+(F.noPhoto?'✓':'')+'</div></button>'
    +'<button type="button" class="list-row" data-pf-tog="showArchived" style="width:100%;text-align:left;border:none;background:#fff;cursor:pointer;"><div class="row-main"><div class="row-title">Показывать архив</div></div><div class="row-right">'+(F.showArchived?'✓':'')+'</div></button>'
    +'</div></div>'
    +'</div><div class="sheet-foot"><button class="btn" id="pf-flt-reset">Сбросить</button><button class="btn btn-primary" id="pf-flt-apply">Применить</button></div></div></div>';
  var close=function(){root.innerHTML='';};
  document.getElementById('pf-flt-x').onclick=close;
  document.getElementById('pf-flt-ov').onclick=function(e){if(e.target.id==='pf-flt-ov')close();};
  var tmp={categories:F.categories.slice(),belowMin:F.belowMin,noBarcode:F.noBarcode,noPhoto:F.noPhoto,showArchived:F.showArchived};
  root.querySelectorAll('[data-pf-cat]').forEach(function(b){
    b.onclick=function(){
      var i=tmp.categories.indexOf(b.dataset.pfCat);
      if(i>=0)tmp.categories.splice(i,1); else tmp.categories.push(b.dataset.pfCat);
      b.classList.toggle('active');
    };
  });
  root.querySelectorAll('[data-pf-tog]').forEach(function(b){
    b.onclick=function(){
      var k=b.dataset.pfTog; tmp[k]=!tmp[k];
      var r=b.querySelector('.row-right'); if(r)r.textContent=tmp[k]?'✓':'';
    };
  });
  document.getElementById('pf-flt-reset').onclick=function(){
    productFilters={categories:[],priceMin:null,priceMax:null,costMin:null,costMax:null,qtyMin:null,qtyMax:null,belowMin:false,noBarcode:false,noPhoto:false,showArchived:false};
    _pfSave(); close(); safeRender();
  };
  document.getElementById('pf-flt-apply').onclick=function(){
    productFilters.categories=tmp.categories.slice();
    productFilters.belowMin=tmp.belowMin;
    productFilters.noBarcode=tmp.noBarcode;
    productFilters.noPhoto=tmp.noPhoto;
    productFilters.showArchived=tmp.showArchived;
    var v=function(id){var el=document.getElementById(id);if(!el)return null;var x=_pfNum(el.value);return x;};
    productFilters.priceMin=v('pf-price-min'); productFilters.priceMax=v('pf-price-max');
    productFilters.costMin=v('pf-cost-min'); productFilters.costMax=v('pf-cost-max');
    productFilters.qtyMin=v('pf-qty-min'); productFilters.qtyMax=v('pf-qty-max');
    _pfSave(); close(); safeRender();
  };
}


// ===== Step 3c2a: product info modal + photo lightbox + category manager + delete =====
function openProductInfoModal(id){
  if(!requireAccess('products')) return;
  const p=products.find(x=>x.id===id); if(!p)return;
  const root=document.getElementById('modal-root');
  const photos=Array.isArray(p.photos)&&p.photos.length?p.photos:(p.photo?[p.photo]:[]);
  const main=p.mainPhoto||p.photo||photos[0]||'';
  const available=productAvailable(p);
  const barcodes=productBarcodes(p);
  const packaging=Array.isArray(p.packaging)?p.packaging:[];
  const infoRows=[];
  if(p.country) infoRows.push(['Страна',p.country]);
  if(Number(p.weight)>0) infoRows.push(['Вес',`${p.weight} ${p.isWeighted?'г':'г'}`]);
  if(Number(p.volume)>0) infoRows.push(['Объём',String(p.volume)]);
  if(p.supplierSku) infoRows.push(['Артикул поставщика',p.supplierSku]);
  root.innerHTML=`<div class="sheet-overlay product-info-modal" id="pinfo-ov"><div class="sheet"><div class="sheet-head"><div class="sheet-title">Информация о товаре</div><button class="sheet-close" id="pinfo-close">✕</button></div><div class="sheet-body product-info-scroll">
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;"><div class="product-card-photo product-info-photo" id="pinfo-photo" style="width:82px;height:82px;border-radius:14px;" title="Увеличить фото">${productIcon({...p,photo:main},82)}</div><div style="min-width:0;"><div style="font-size:16px;font-weight:800;line-height:1.25;">${escapeHtml(p.name)}</div><div class="row-sub">${escapeHtml(p.sku||'—')}${p.supplierSku?` · ${escapeHtml(p.supplierSku)}`:''}</div>${p.archived?'<span class="badge badge-low" style="display:inline-block;margin-top:5px;">Архив</span>':''}</div></div>
    ${photos.length>1?`<div class="contact-box"><div class="contact-title">Фото товара</div><div class="product-photo-swipe" id="pinfo-gallery">${photos.map((src,i)=>`<button type="button" class="product-photo-thumb ${src===main?'main':''}" data-pg="${i}" title="${src===main?'Главное фото':'Открыть фото'}"><img src="${escapeHtml(src)}" alt=""><span class="product-photo-main-label">${src===main?'Главное':''}</span></button>`).join('')}</div></div>`:''}
    <div class="contact-box"><div class="contact-title">Остатки</div><div class="info-grid"><div class="info-card"><div class="info-label">На складе</div><div class="info-value">${Number(p.qty)||0} ${escapeHtml(p.unit||'')}</div></div><div class="info-card"><div class="info-label">Зарезервировано</div><div class="info-value">${Number(p.reserved)||0}</div></div><div class="info-card"><div class="info-label">Ожидается</div><div class="info-value">${Number(p.expected)||0}</div></div><div class="info-card"><div class="info-label">Доступно</div><div class="info-value">${available}</div></div></div></div>
    ${(function(){var st=p.stock&&typeof p.stock==='object'&&!Array.isArray(p.stock)?p.stock:null;if(!st)return '';var ids=Object.keys(st);if(!ids.length)return '';var rows=ids.map(function(wid){var w=warehouses.find(function(x){return x.id===wid;});var nm=w?(w.name||wid):wid;return '<div class="row-sub" style="margin-top:5px;">'+escapeHtml(nm)+': <b>'+(Number(st[wid])||0)+'</b> '+escapeHtml(p.unit||'шт')+'</div>';}).join('');return '<div class="contact-box"><div class="contact-title">Остатки по складам</div>'+rows+'</div>';})()}
    <div class="contact-box"><div class="contact-title">Цены</div><div class="row-sub">Продажа: <b>${fmtMoney(p.price)}</b> · Себестоимость: ${fmtMoney(p.cost)}</div>${Number(p.minPrice)>0?`<div class="row-sub">Минимальная цена: ${fmtMoney(p.minPrice)}</div>`:''}<div class="row-sub">НДС: ${p.vatRate==null?'по настройкам кассы':`${Number(p.vatRate)||0}%`}</div></div>
    ${infoRows.length?`<div class="contact-box"><div class="contact-title">Дополнительная информация</div>${infoRows.map(r=>`<div class="row-sub" style="margin-top:5px;">${escapeHtml(r[0])}: ${escapeHtml(r[1])}</div>`).join('')}</div>`:''}
    ${barcodes.length?`<div class="contact-box"><div class="contact-title">Штрихкоды</div>${barcodes.map(b=>`<div class="row-sub" style="margin-top:5px;font-family:var(--mono);">${escapeHtml(b)}</div>`).join('')}</div>`:''}
    ${packaging.length?`<div class="contact-box"><div class="contact-title">Упаковка</div>${packaging.map(x=>{const q=Number(x?.qty)||0;return `<div class="row-sub" style="margin-top:5px;">${escapeHtml(x?.name||'Упаковка')}${q?` · ${q} ${escapeHtml(x?.unit||'шт')}`:''}</div>`;}).join('')}</div>`:''}
    ${p.description?`<div class="contact-box"><div class="contact-title">Описание товара</div><div style="font-size:13px;line-height:1.55;white-space:pre-wrap;margin-top:7px;">${escapeHtml(p.description)}</div></div>`:''}
    ${p.purpose?`<div class="contact-box"><div class="contact-title">Для чего / назначение</div><div style="font-size:13px;line-height:1.55;white-space:pre-wrap;margin-top:7px;">${escapeHtml(p.purpose)}</div></div>`:''}
  </div><div class="sheet-foot"><button class="btn" id="pinfo-edit" style="flex:1;">Изменить</button><button class="btn btn-primary" id="pinfo-save" style="flex:1;">Сохранить</button></div></div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('pinfo-close').onclick=close;
  initProductInfoSwipeClose(root.querySelector('#pinfo-ov .sheet'));
  document.getElementById('pinfo-ov').onclick=e=>{if(e.target.id==='pinfo-ov')close();};
  document.getElementById('pinfo-edit').onclick=()=>{close();openProductModal(id);};
  document.getElementById('pinfo-save').onclick=async()=>{await persist('products');close();showToast('Данные товара сохранены');};
  const photoBtn=document.getElementById('pinfo-photo');
  if(photoBtn && main) photoBtn.onclick=e=>{e.preventDefault();e.stopPropagation();const mi=Math.max(0,photos.indexOf(main));openProductPhotoLightbox(main,p.name||'Фото товара',photos,mi);};
  document.querySelectorAll('#pinfo-gallery .product-photo-thumb').forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();const idx=Number(btn.dataset.pg),src=photos[idx];if(src)openProductPhotoLightbox(src,p.name||'Фото товара',photos,idx);});
}

function openProductPhotoLightbox(src,alt,gallery,index){
  if(!src)return;
  alt=alt||'';
  const items=Array.isArray(gallery)&&gallery.length?gallery:[src];
  let current=Math.max(0,Math.min(Number(index)||0,items.length-1));
  const box=document.createElement('div');
  box.className='product-photo-lightbox'+(items.length>1?' has-gallery':'');
  box.id='product-photo-lightbox';
  box.innerHTML='<button type="button" class="product-photo-lightbox-close" aria-label="Close">\u2715</button>'
    + '<img src="'+escapeHtml(items[current])+'" alt="'+escapeHtml(alt)+'" draggable="false">'
    + (items.length>1?'<button type="button" class="product-photo-lightbox-arrow prev" aria-label="Prev">\u2039</button><button type="button" class="product-photo-lightbox-arrow next" aria-label="Next">\u203a</button>':'')
    + '<div class="product-photo-lightbox-zoom">'
    + '<button type="button" data-zl="out" aria-label="Zoom out">\u2212</button>'
    + '<span class="zl-scale" data-zl-scale>100%</span>'
    + '<button type="button" data-zl="in" aria-label="Zoom in">+</button>'
    + '<button type="button" data-zl="reset" aria-label="Reset">\u27f2</button>'
    + '</div>';
  document.body.appendChild(box);
  const image=box.querySelector('img');
  const scaleEl=box.querySelector('[data-zl-scale]');
  let scale=1,tx=0,ty=0;
  const MIN=1,MAX=5,SWIPE=55;
  let closing=false;
  const historyKey='oni-product-photo-lightbox';
  let onBack=null;
  function apply(anim){
    image.style.transition=anim===false?'none':'transform .18s ease-out';
    image.style.transform='translate3d('+tx+'px,'+ty+'px,0) scale('+scale+')';
    scaleEl.textContent=Math.round(scale*100)+'%';
  }
  function clamp(){
    if(scale<=1){tx=0;ty=0;return;}
    const w=image.clientWidth||image.naturalWidth||1;
    const h=image.clientHeight||image.naturalHeight||1;
    const maxX=Math.max(0,(w*scale-window.innerWidth)/2);
    const maxY=Math.max(0,(h*scale-window.innerHeight)/2);
    tx=Math.max(-maxX,Math.min(maxX,tx));
    ty=Math.max(-maxY,Math.min(maxY,ty));
  }
  function setScale(s){ scale=Math.max(MIN,Math.min(MAX,s)); clamp(); apply(true); }
  function zoomIn(){ setScale(scale*1.5); }
  function zoomOut(){ setScale(scale/1.5); }
  function reset(){ scale=1; tx=0; ty=0; apply(true); }
  function render(){ image.src=items[current]; reset(); }
  function close(){
    if(closing)return; closing=true;
    window.removeEventListener('popstate',onBack);
    document.removeEventListener('keydown',onKey);
    box.remove();
    if(history.state&&history.state.oniLightbox===historyKey)history.back();
  }
  history.pushState({...((history.state)||{}),oniLightbox:historyKey},'');
  box.querySelector('.product-photo-lightbox-close').onclick=close;
  box.querySelector('[data-zl="in"]').onclick=function(){ zoomIn(); };
  box.querySelector('[data-zl="out"]').onclick=function(){ zoomOut(); };
  box.querySelector('[data-zl="reset"]').onclick=function(){ reset(); };
  const bPrev=box.querySelector('.product-photo-lightbox-arrow.prev');
  const bNext=box.querySelector('.product-photo-lightbox-arrow.next');
  if(bPrev)bPrev.onclick=function(e){ e.stopPropagation(); current=(current-1+items.length)%items.length; render(); };
  if(bNext)bNext.onclick=function(e){ e.stopPropagation(); current=(current+1)%items.length; render(); };
  box.onclick=function(e){ if(e.target===box) close(); };
  const pointers=new Map();
  let isDragging=false,wasSingle=false;
  let pStartX=0,pStartY=0,pStartTx=0,pStartTy=0;
  let pinchStart=0,pinchScale=1;
  let lastTap=0,swipeStartX=0,swipeStartY=0;
  image.addEventListener('pointerdown',function(e){
    try{ image.setPointerCapture(e.pointerId); }catch(_){}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){
      isDragging=false; wasSingle=true;
      pStartX=e.clientX; pStartY=e.clientY;
      pStartTx=tx; pStartTy=ty;
      swipeStartX=e.clientX; swipeStartY=e.clientY;
      if(scale>1){ isDragging=true; image.classList.add('dragging'); }
    } else if(pointers.size===2){
      wasSingle=false;
      const pts=Array.from(pointers.values());
      pinchStart=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)||1;
      pinchScale=scale;
      isDragging=false; image.classList.remove('dragging');
    }
  });
  image.addEventListener('pointermove',function(e){
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2 && pinchStart>0){
      const pts=Array.from(pointers.values());
      const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
      const ns=Math.max(MIN,Math.min(MAX,pinchScale*(d/pinchStart)));
      if(ns!==scale){ scale=ns; clamp(); apply(false); }
      return;
    }
    if(pointers.size===1 && isDragging && scale>1){
      tx=pStartTx+(e.clientX-pStartX);
      ty=pStartTy+(e.clientY-pStartY);
      clamp(); apply(false);
    }
  });
  function endPointer(e){
    const had=pointers.has(e.pointerId);
    pointers.delete(e.pointerId);
    if(!had)return;
    if(pointers.size===0){
      if(isDragging){ isDragging=false; image.classList.remove('dragging'); apply(true); }
      if(wasSingle && scale<=1.05 && items.length>1){
        const dx=e.clientX-swipeStartX, dy=e.clientY-swipeStartY;
        if(Math.abs(dx)>SWIPE && Math.abs(dx)>Math.abs(dy)){
          current=(current+(dx<0?1:-1)+items.length)%items.length;
          render(); wasSingle=false; return;
        }
      }
      if(wasSingle && scale<=1.05){
        const now=Date.now();
        if(now-lastTap<300){ setScale(2.5); lastTap=0; } else { lastTap=now; }
      }
      wasSingle=false;
    }
  }
  image.addEventListener('pointerup',endPointer);
  image.addEventListener('pointercancel',endPointer);
  box.addEventListener('wheel',function(e){
    e.preventDefault();
    const f=e.deltaY<0?1.15:1/1.15;
    setScale(scale*f);
  },{passive:false});
  function onKey(e){
    if(e.key==='Escape') close();
    else if(e.key==='+'||e.key==='=') zoomIn();
    else if(e.key==='-') zoomOut();
    else if(e.key==='0') reset();
    else if(e.key==='ArrowLeft' && items.length>1){ current=(current-1+items.length)%items.length; render(); }
    else if(e.key==='ArrowRight' && items.length>1){ current=(current+1)%items.length; render(); }
  }
  document.addEventListener('keydown',onKey);
  onBack=function(){
    if(document.getElementById('product-photo-lightbox')===box){
      closing=true;
      document.removeEventListener('keydown',onKey);
      box.remove();
    }
    window.removeEventListener('popstate',onBack);
  };
  window.addEventListener('popstate',onBack);
  apply(false);
}

function initProductInfoSwipeClose(sheet){/* отключено — закрытие только через ✕ */
  return;
  if(!sheet||sheet.dataset.productSwipeClose==='1')return;
  sheet.dataset.productSwipeClose='1';
  let active=false,locked=false,startX=0,startY=0,dx=0,dy=0,startTime=0;
  const reset=()=>{active=false;locked=false;dx=0;dy=0;sheet.style.transition='';sheet.style.transform='';};
  sheet.addEventListener('touchstart',e=>{
    if(e.touches.length!==1||e.target.closest('.product-photo-swipe'))return;
    const t=e.touches[0]; if(!t)return;
    active=true;locked=false;startX=t.clientX;startY=t.clientY;dx=0;dy=0;startTime=Date.now();sheet.style.transition='none';
  },{passive:true});
  sheet.addEventListener('touchmove',e=>{
    if(!active||e.touches.length!==1)return;
    const t=e.touches[0]; if(!t)return;
    dx=t.clientX-startX;dy=t.clientY-startY;
    if(!locked){
      if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)){reset();return;}
      if(dy<-12&&Math.abs(dy)>=Math.abs(dx)*0.5)locked=true;
      else if(Math.abs(dy)>12){reset();return;}
      else return;
    }
    if(locked&&dy<0){e.preventDefault();sheet.style.transform='translate3d('+dx+'px,'+dy+'px,0)';}
  },{passive:false});
  const finish=()=>{
    if(!active)return;
    const elapsed=Date.now()-startTime,shouldClose=locked&&dy<-110&&Math.abs(dy)>=Math.abs(dx)*0.5&&elapsed<900;
    active=false;locked=false;
    if(shouldClose){
      const overlay=sheet.closest('.product-info-modal');
      sheet.style.transition='transform .22s ease-out';sheet.style.transform='translate3d('+dx+'px,-110vh,0)';
      setTimeout(()=>{if(overlay)overlay.remove();},230);return;
    }
    sheet.style.transition='transform .2s ease-out';sheet.style.transform='translate3d(0,0,0)';
    setTimeout(()=>{sheet.style.transition='';sheet.style.transform='';},220);
  };
  sheet.addEventListener('touchend',finish,{passive:true});
  sheet.addEventListener('touchcancel',()=>{if(!active)return;active=false;locked=false;sheet.style.transition='transform .2s ease-out';sheet.style.transform='translate3d(0,0,0)';setTimeout(()=>{sheet.style.transition='';sheet.style.transform='';},220);},{passive:true});
}

function confirmProductInfo(id){
  if(!requireAccess('products')) return;
  const p=products.find(x=>x.id===id); if(!p)return;
  const root=document.getElementById('modal-root');
  root.innerHTML=`<div class="sheet-overlay product-info-confirm" id="pinfo-confirm-ov"><div class="sheet"><div class="sheet-head"><div class="sheet-title">Информация о товаре</div></div><div class="sheet-body"><div style="font-size:14px;line-height:1.45;text-align:center;padding:8px 4px 4px;">Открыть информацию о товаре?</div><div style="font-size:12px;color:var(--muted);text-align:center;margin-top:4px;">${escapeHtml(p.name)}</div></div><div class="sheet-foot"><button class="btn" id="pinfo-no" style="flex:1;">Нет</button><button class="btn btn-primary" id="pinfo-yes" style="flex:1;">Да</button></div></div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('pinfo-no').onclick=close;
  document.getElementById('pinfo-yes').onclick=()=>{close();openProductInfoModal(id);};
  document.getElementById('pinfo-confirm-ov').onclick=e=>{if(e.target.id==='pinfo-confirm-ov')close();};
}

function openCategoryManager(){
  if(!requireAccess('products')) return;
  const root=document.getElementById('modal-root');
  const cats=[...new Set(products.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  root.innerHTML=`<div class="sheet-overlay" id="cat-ov"><div class="sheet"><div class="sheet-handle"></div>
    <div class="sheet-head"><div class="sheet-title">Категории</div><button class="sheet-close" id="cat-close">✕</button></div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Новая категория</label><div style="display:flex;gap:7px;"><input class="form-input" id="cat-new" placeholder="Например: Чай" style="flex:1;"><button class="btn btn-primary" id="cat-add">Добавить</button></div></div>
      <div class="panel" style="margin-top:10px;"><div class="panel-body">
        ${cats.length?cats.map(c=>{const count=products.filter(p=>p.category===c && !p.isCategoryPlaceholder).length;return `<div class="category-list-row"><div style="flex:1;font-size:12.5px;font-weight:600;">${c}</div><span class="category-count">${count} товар(ов)</span><button class="move-action" data-cat-edit="${c.replace(/"/g,'&quot;')}">Изм.</button><button class="move-action delete" data-cat-del="${c.replace(/"/g,'&quot;')}">Удалить</button></div>`}).join(''):`<div class="empty">Категорий пока нет</div>`}
      </div></div>
    </div></div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('cat-close').onclick=close;
  document.getElementById('cat-ov').onclick=e=>{if(e.target.id==='cat-ov')close();};
  document.getElementById('cat-add').onclick=async()=>{
    const input=document.getElementById('cat-new'), name=input.value.trim();
    if(!name){showToast('Введите название категории');return;}
    if(cats.some(c=>c.toLowerCase()===name.toLowerCase())){showToast('Такая категория уже есть');return;}
    // Categories are represented by lightweight placeholder records and are hidden from the product catalog.
    products.push({id:uid(),sku:'__CAT__'+uid().slice(0,8),name:'',category:name,unit:'шт',qty:0,minStock:0,price:0,cost:0,isCategoryPlaceholder:true});
    await persist('products');
    openCategoryManager(); showToast('Категория добавлена');
  };
  document.querySelectorAll('[data-cat-edit]').forEach(b=>b.onclick=async()=>{
    const old=b.dataset.catEdit, next=prompt('Новое название категории:',old);
    if(next===null)return; const n=next.trim(); if(!n||n===old)return;
    if(cats.some(c=>c.toLowerCase()===n.toLowerCase())){showToast('Такая категория уже есть');return;}
    products.forEach(p=>{if(p.category===old)p.category=n;});
    await persist('products'); openCategoryManager(); safeRender(); showToast('Категория изменена');
  });
  document.querySelectorAll('[data-cat-del]').forEach(b=>b.onclick=async()=>{
    const cat=b.dataset.catDel;
    const affected=products.filter(p=>p.category===cat);
    if(affected.length && !confirm(`В категории ${affected.length} товар(ов). Удалить категорию и перенести товары в «Без категории»?`))return;
    products=products.filter(p=>!(p.isCategoryPlaceholder&&p.category===cat)); products.forEach(p=>{if(p.category===cat)p.category='Без категории';});
    await persist('products'); openCategoryManager(); safeRender(); showToast('Категория удалена');
  });
}

async function deleteProduct(id){
  try{ console.log('[deleteProduct] START id=', id, 'fbDb=', !!fbDb, 'user=', (fbAuth && fbAuth.currentUser) ? fbAuth.currentUser.uid : null); }catch(_){}
  if(!requireAccess('products')) return;
  const p=products.find(x=>x.id===id);
  if(!p){ showToast('Товар не найден'); return; }
  if(p.isCategoryPlaceholder){ showToast('Это категория, а не товар. Используйте управление категориями.'); return; }
  if(!confirm('Удалить товар? История движений сохранится.')) return;

  const before = products.length;
  await deleteProductPhotos(id);
  products = products.filter(p=>p.id!==id);

  if(products.length === before){
    showToast('Товар не найден');
    return;
  }

  try{
    var _rd = JSON.parse(localStorage.getItem('sklad_crm_recent_deletes') || '{}') || {};
    _rd[String(id)] = Date.now();
    var _now = Date.now();
    Object.keys(_rd).forEach(function(k){ if(_now - Number(_rd[k]) > 86400000) delete _rd[k]; });
    localStorage.setItem('sklad_crm_recent_deletes', JSON.stringify(_rd));
    try{
      if(fbDb && fbAuth && fbAuth.currentUser){
        var _safeTid = String(id).replace(/[\/\s]+/g, '_');
        await fbDb.collection('shops').doc(FB_SHOP_ID).collection('productTombstones').doc(_safeTid).set({
          id: String(id),
          deletedAt: Date.now(),
          byUser: (activeUser && activeUser.id) || null
        });
        console.log('[deleteProduct] TOMBSTONE OK');
      } else {
        console.log('[deleteProduct] SKIP tombstone: fbDb=', !!fbDb, 'user=', (fbAuth && fbAuth.currentUser));
      }
    }catch(e){
      console.error('[deleteProduct] TOMBSTONE FAILED:', e);
      try{ showToast('Tombstone error: ' + ((e && e.message) || e)); }catch(_){}
    }
    // Прямое удаление документа из products в Firestore — не ждём pull
    try{
      if(fbDb && fbAuth && fbAuth.currentUser){
        var _safePid = String(id).replace(/[\/\s]+/g, '_');
        await fbDb.collection('shops').doc(FB_SHOP_ID).collection('products').doc(_safePid).delete();
        console.log('[deleteProduct] PRODUCTS DOC DELETED:', _safePid);
      }
    }catch(e){
      console.error('[deleteProduct] PRODUCTS DELETE FAILED:', e);
      try{ showToast('Delete error: ' + ((e && e.message) || e)); }catch(_){}
    }
  }catch(e){}

  const saved = await persist('products');

  safeRender();
  showToast(saved === false ? 'Товар удалён, но проверьте сохранение' : 'Товар удалён');
}


// ===== Step 3c2b: openProductModal (product form) =====
function openProductModal(id,options={}){
  if(!requireAccess('products')) return;
  _lookupCategoryAuto=false;
  _lookupDescriptionAuto=false;
  _lookupCandidateData=null; if(!id && window.Android && typeof window.Android.resetReview==="function"){ try{ window.Android.resetReview(); }catch(e){} }
  const quickMode=!!options.quick;
  const quickQtyDefault=Math.max(1,Number(options.quickQty)||1);
  const editing = id ? products.find(p=>p.id===id) : null;
  const generatedSku = editing ? editing.sku : generateUniqueSKU();
  const root=document.getElementById('modal-root');
  const initialPhotos=Array.isArray(editing?.photos)?editing.photos.slice():(editing?.photo?[editing.photo]:[]);
  if(editing?.mainPhoto && !initialPhotos.includes(editing.mainPhoto)) initialPhotos.unshift(editing.mainPhoto);
  let photos=initialPhotos; let mainPhoto=editing?.mainPhoto||editing?.photo||photos[0]||'';
  let extraBarcodes=productBarcodes(editing).slice(1);
  let packaging=Array.isArray(editing?.packaging)?editing.packaging.map(x=>typeof x==='object'?{name:x.name||'',qty:Number(x.qty)||0,unit:x.unit||'шт'}:{name:String(x||''),qty:1,unit:'шт'}):[];
  root.innerHTML=`
  <div class="sheet-overlay" id="ov"><div class="sheet"><div class="sheet-handle"></div>
    <div class="sheet-head"><div class="sheet-title">${quickMode?'Быстрый товар':(editing?'Изменить товар':'Новый товар')}</div><button class="sheet-close" id="mc">✕</button></div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Фотографии товара</label>
        <div class="product-photo-box"><div class="product-photo-preview" id="f-photo-preview">${mainPhoto?`<img src="${escapeHtml(mainPhoto)}" alt="">`:'Фото'}</div>
          <div><input class="product-photo-input" id="f-photo" type="file" accept="image/*" capture="environment" multiple><input class="product-photo-input" id="f-photo-gallery" type="file" accept="image/*" multiple style="display:none;">
            <div class="product-photo-actions"><button type="button" class="btn" id="choose-photo">📷 Камера</button><button type="button" class="btn" id="choose-gallery">📁 Галерея</button></div>
            <div class="form-hint" style="color:var(--muted);margin-top:6px;margin-bottom:0;">Можно добавить несколько фото. Нажмите на фото ниже, чтобы сделать его главным.</div>
          </div></div>
        <div class="product-photo-gallery" id="f-photo-gallery-list"></div>
      </div>
      <div class="form-field"><label class="form-label">Название</label><div style="display:flex;gap:7px;align-items:stretch;"><input class="form-input" style="flex:1;min-width:0;" id="f-name" value="${editing?escapeHtml(editing.name):''}" placeholder="Например: JANNAH AKSA"><button type="button" class="btn" id="name-lookup" title="Найти информацию о товаре в интернете">🌐</button></div><div id="name-lookup-status" class="form-hint" style="margin-top:6px;"></div><div id="f-search-links" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;"></div></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">SKU / артикул</label><input class="form-input" id="f-sku" value="${generatedSku}" ${editing?'':'readonly'}></div><div class="form-field"><label class="form-label">Категория</label><div style="display:flex;gap:7px;align-items:stretch;"><input class="form-input" id="f-category" list="f-category-list" value="${editing?escapeHtml(editing.category):''}" placeholder="Например: Косметика" style="flex:1;min-width:0;"><button type="button" class="btn btn-primary" id="f-category-add" title="Добавить категорию">＋</button></div><datalist id="f-category-list">${categoryDatalistOptions(editing?editing.category:'')}</datalist></div></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">Тип товара</label><select class="form-select" id="f-product-type"><option value="piece" ${editing?.productType==='piece'||!editing?.productType?'selected':''}>Штучный</option><option value="weight" ${editing?.productType==='weight'?'selected':''}>Весовой</option><option value="volume" ${editing?.productType==='volume'?'selected':''}>Объёмный</option><option value="service" ${editing?.productType==='service'?'selected':''}>Услуга</option></select></div><div class="form-field"><label class="form-label">Единица</label><select class="form-select" id="f-unit">${unitOptions(editing?editing.unit:'шт')}</select></div></div>
      <div class="form-field"><label class="form-label">Описание товара</label><textarea class="form-input" id="f-description" rows=3 placeholder="Что это за товар…">${escapeHtml(editing?.description||'')}</textarea></div>
      <div class="form-field"><label class="form-label">Для чего / назначение</label><textarea class="form-input" id="f-purpose" rows=2 placeholder="Для чего нужен товар…">${escapeHtml(editing?.purpose||'')}</textarea></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">Остаток</label><input class="form-input" type="number" min="0" id="f-qty" value="${quickMode?0:(editing?editing.qty:0)}" ${quickMode?'readonly':''}></div><div class="form-field"><label class="form-label">Мин. остаток</label><input class="form-input" type="number" min="0" id="f-min" value="${editing?editing.minStock:0}"></div></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">Зарезервировано</label><input class="form-input" type="number" min="0" id="f-reserved" value="${editing?editing.reserved:0}"></div><div class="form-field"><label class="form-label">Ожидается</label><input class="form-input" type="number" min="0" id="f-expected" value="${editing?editing.expected:0}"></div></div>
      <div class="form-field"><label class="form-label">Доступно</label><input class="form-input" id="f-available" value="${productAvailable(editing)}" readonly></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">Цена продажи, ₸</label><input class="form-input" type="number" min="0" id="f-price" value="${editing?editing.price:0}"></div><div class="form-field"><label class="form-label">Минимальная цена, ₸</label><input class="form-input" type="number" min="0" id="f-min-price" value="${editing?editing.minPrice:0}"></div></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">Себестоимость, ₸</label><input class="form-input" type="number" min="0" id="f-cost" value="${editing?editing.cost:0}"></div><div class="form-field"><label class="form-label">НДС, %</label><input class="form-input" type="number" min="0" step="0.01" id="f-vat" value="${editing?.vatRate==null?'':editing.vatRate}" placeholder="По настройкам кассы"></div></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">Страна</label><input class="form-input" id="f-country" value="${escapeHtml(editing?.country||'')}" placeholder="Казахстан"></div><div class="form-field"><label class="form-label">Артикул поставщика</label><input class="form-input" id="f-supplier-sku" value="${escapeHtml(editing?.supplierSku||'')}"></div></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">Вес</label><input class="form-input" type="number" min="0" step="0.001" id="f-weight" value="${editing?editing.weight:0}"></div><div class="form-field"><label class="form-label">Объём</label><input class="form-input" type="number" min="0" step="0.001" id="f-volume" value="${editing?editing.volume:0}"></div></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">Дата изготовления</label><input class="form-input" type="date" id="f-manufacture" value="${editing?.manufactureDate||''}"></div><div class="form-field"><label class="form-label">Срок годности</label><input class="form-input" type="date" id="f-expiry" value="${editing?.expiryDate||''}"></div></div>
      <div class="contact-box"><div class="contact-title">Штрихкоды</div><div class="form-field"><label class="form-label">Основной штрихкод</label><input class="form-input" id="f-barcode" value="${escapeHtml(editing?.barcode||productBarcodes(editing)[0]||'')}" inputmode="numeric" maxlength="13" placeholder="EAN-13"></div><div id="f-extra-barcodes">${renderBarcodeList(extraBarcodes)}</div><button type="button" class="btn" id="f-add-barcode" style="margin-top:7px;">＋ Добавить штрихкод</button></div>
      <div class="contact-box"><div class="contact-title">Упаковка</div><div id="f-packaging">${renderPackagingList(packaging)}</div><button type="button" class="btn" id="f-add-packaging" style="margin-top:7px;">＋ Добавить упаковку</button></div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;"><label style="display:flex;gap:8px;align-items:center;font-size:13px;"><input type="checkbox" id="f-weighted" ${editing?.isWeighted?'checked':''}> Весовой товар</label><label style="display:flex;gap:8px;align-items:center;font-size:13px;"><input type="checkbox" id="f-archived" ${editing?.archived?'checked':''}> Архивный товар</label></div>
      ${quickMode?`<div class="panel" style="margin-top:10px;"><div class="panel-body"><div class="form-field" style="margin:0;"><label class="form-label">Количество в чек</label><input class="form-input" type="number" min="1" step="1" id="f-quick-qty" value="${quickQtyDefault}"></div><div class="form-hint" style="margin-top:7px;margin-bottom:0;">Товар сохранится в каталоге с остатком 0 и сразу попадёт в текущий чек.</div></div></div>`:''}
      <div class="form-hint" id="f-err" style="display:none;"></div>
    </div><div class="sheet-foot"><button class="btn btn-primary" id="save" style="flex:1;">${editing?'Сохранить':'Добавить'}</button></div>
  </div></div>`;
  if(options.fromPurchase){try{var _pe=document.getElementById('f-price');if(_pe&&_pe.parentElement&&_pe.parentElement.parentElement){_pe.parentElement.parentElement.style.display='none';}}catch(e){}}
  const close=()=>root.innerHTML=''; document.getElementById('mc').onclick=close; document.getElementById('ov').onclick=e=>{if(e.target.id==='ov')close();};
  const refreshAvailable=()=>{const q=Number(document.getElementById('f-qty')?.value)||0,r=Number(document.getElementById('f-reserved')?.value)||0;const a=document.getElementById('f-available');if(a)a.value=Math.max(0,q-r);};
  document.getElementById('f-qty').oninput=refreshAvailable; document.getElementById('f-reserved').oninput=refreshAvailable;
  const extraRoot=document.getElementById('f-extra-barcodes');
  document.getElementById('f-add-barcode').onclick=()=>{extraBarcodes.push('');extraRoot.innerHTML=renderBarcodeList(extraBarcodes);bindExtraBarcodes();};
  function bindExtraBarcodes(){extraRoot.querySelectorAll('.f-remove-barcode').forEach(b=>b.onclick=()=>{extraBarcodes.splice(Number(b.dataset.index),1);extraRoot.innerHTML=renderBarcodeList(extraBarcodes);bindExtraBarcodes();});}
  bindExtraBarcodes();
  const packRoot=document.getElementById('f-packaging');
  document.getElementById('f-add-packaging').onclick=()=>{packaging.push({name:'',qty:1,unit:'шт'});packRoot.innerHTML=renderPackagingList(packaging);bindPackaging();};
  function bindPackaging(){packRoot.querySelectorAll('.f-remove-packaging').forEach(b=>b.onclick=()=>{packaging.splice(Number(b.dataset.index),1);packRoot.innerHTML=renderPackagingList(packaging);bindPackaging();});}
  bindPackaging();
  renderSearchLinks((editing&&editing.name)||'');
  document.getElementById('name-lookup').onclick=()=>{ const q=document.getElementById('f-name').value.trim(); const st=document.getElementById('name-lookup-status'); const type=document.getElementById('f-category')?.value.trim()||''; const description=document.getElementById('f-description')?.value.trim()||''; if(!q){st.textContent='Сначала введите название товара';return;} if(window.Android && typeof window.Android.lookupProductByAI==='function'){ st.textContent='ИИ определяет товар…'; window.Android.lookupProductByAI(q,type,description); } else { st.textContent='Интернет-поиск доступен только в приложении Android'; } };
  document.getElementById('f-name').addEventListener('input',()=>{ renderSearchLinks(document.getElementById('f-name').value); if(window._lookupCategoryAuto){const c=document.getElementById('f-category');if(c)c.value='';window._lookupCategoryAuto=false;} if(window._lookupDescriptionAuto){const d=document.getElementById('f-description');if(d)d.value='';window._lookupDescriptionAuto=false;} });
  document.getElementById('f-category-add').onclick=async()=>{ const input=document.getElementById('f-category'); const name=input.value.trim(); if(!name){showToast('Введите название категории');return;} const exists=products.some(p=>p.category&&String(p.category).trim().toLowerCase()===name.toLowerCase()); if(exists){input.value=products.find(p=>p.category&&String(p.category).trim().toLowerCase()===name.toLowerCase()).category; showToast('Категория уже есть'); return;} products.push({id:uid(),sku:'__CAT__'+uid().slice(0,8),name:'',category:name,unit:'шт',qty:0,minStock:0,price:0,cost:0,isCategoryPlaceholder:true}); await persist('products'); input.value=name; const dl=document.getElementById('f-category-list'); if(dl){const o=document.createElement('option');o.value=name;dl.appendChild(o);} showToast('Категория добавлена'); };
  const preview=document.getElementById('f-photo-preview'), list=document.getElementById('f-photo-gallery-list');
window.__oniAddExternalPhotos = function(list0){
  try{
    if(!Array.isArray(list0)) return;
    var added = 0;
    for(var i=0;i<list0.length;i++){
      var u = String(list0[i]||'');
      if(!u) continue;
      if(photos.indexOf(u) >= 0) continue;
      photos.push(u);
      if(!mainPhoto) mainPhoto = u;
      added++;
    }
    if(added > 0){
      drawPhotos();
      var st = document.getElementById('name-lookup-status');
      if(st) st.textContent = '✓ Добавлено фото: ' + added;
    }
  }catch(e){ console.warn('[wv] addPhotos', e); }
};
  const drawPhotos=()=>{preview.innerHTML=mainPhoto?`<img src="${escapeHtml(mainPhoto)}" alt="">`:'Фото';preview.onclick=mainPhoto?()=>openProductPhotoLightbox(mainPhoto,editing?.name||'Фото товара',photos,Math.max(0,photos.indexOf(mainPhoto))):null;list.innerHTML=photos.map((src,i)=>`<button type="button" class="product-photo-thumb ${src===mainPhoto?'main':''}" data-i="${i}" title="${src===mainPhoto?'Главное фото — нажмите для увеличения':'Сделать главным'}"><img src="${escapeHtml(src)}" alt=""><span class="photo-delete" data-del-photo="${i}" aria-label="Удалить фото">×</span></button>`).join('');list.querySelectorAll('.product-photo-thumb').forEach(b=>b.onclick=e=>{if(e.target.closest('[data-del-photo]'))return;const i=Number(b.dataset.i),src=photos[i];if(e.target.closest('img')){e.preventDefault();e.stopPropagation();openProductPhotoLightbox(src,editing?.name||'Фото товара',photos,i);return;}mainPhoto=src;drawPhotos();});list.querySelectorAll('[data-del-photo]').forEach(b=>b.onclick=e=>{e.stopPropagation();const i=Number(b.dataset.delPhoto);if(!confirm('Удалить это фото?'))return;const was=photos[i]===mainPhoto;photos.splice(i,1);if(was)mainPhoto=photos[0]||'';drawPhotos();});};
  drawPhotos();
  let visionTriggered=false;const addFiles=async files=>{for(const file of [...(files||[])]){if(!file.type.startsWith('image/'))continue;const src=await readOriginalProductImage(file);if(!src)continue;photos.push(src);if(!mainPhoto)mainPhoto=src;drawPhotos();const st=document.getElementById('name-lookup-status');let visionStarted=false;try{if(!visionTriggered&&window.Android&&typeof window.Android.recognizeProductPhoto==='function'){visionStarted=true;visionTriggered=true;if(st)st.textContent='Читаю текст с фото…';window.Android.recognizeProductPhoto(src,'eng+rus');}}catch(e){console.error('product photo recognition failed',e);}if(!visionStarted&&!visionTriggered&&st)st.textContent='Фото добавлено. Распознавание ИИ недоступно в этой сборке.';}};
  document.getElementById('choose-photo').onclick=()=>document.getElementById('f-photo').click(); document.getElementById('choose-gallery').onclick=()=>document.getElementById('f-photo-gallery').click();
  document.getElementById('f-photo').onchange=e=>{addFiles(e.target.files);e.target.value='';}; document.getElementById('f-photo-gallery').onchange=e=>{addFiles(e.target.files);e.target.value='';};
  document.getElementById('save').onclick=async()=>{
    const name=document.getElementById('f-name').value.trim();
    const originalName=editing?(editing.originalName||editing.name):name;
    const sku=(editing?document.getElementById('f-sku').value.trim():generatedSku),category=document.getElementById('f-category').value||'Без категории',description=document.getElementById('f-description').value.trim(),purpose=document.getElementById('f-purpose').value.trim(),unit=document.getElementById('f-unit').value.trim()||'шт',qty=Math.max(0,Number(document.getElementById('f-qty').value)||0),minStock=Math.max(0,Number(document.getElementById('f-min').value)||0),reserved=Math.max(0,Number(document.getElementById('f-reserved').value)||0),expected=Math.max(0,Number(document.getElementById('f-expected').value)||0),price=Math.max(0,Number(document.getElementById('f-price').value)||0),minPrice=Math.max(0,Number(document.getElementById('f-min-price').value)||0),cost=Math.max(0,Number(document.getElementById('f-cost').value)||0),vatRaw=document.getElementById('f-vat').value.trim(),vatRate=vatRaw===''?null:Math.max(0,Number(vatRaw)||0),country=document.getElementById('f-country').value.trim(),weight=Math.max(0,Number(document.getElementById('f-weight').value)||0),volume=Math.max(0,Number(document.getElementById('f-volume').value)||0),supplierSku=document.getElementById('f-supplier-sku').value.trim(),productType=document.getElementById('f-product-type').value||'piece',isWeighted=!!document.getElementById('f-weighted').checked,archived=!!document.getElementById('f-archived').checked,manufactureDate=document.getElementById('f-manufacture').value||'',expiryDate=document.getElementById('f-expiry').value||'',err=document.getElementById('f-err');
    if(!name||!sku){err.textContent='Укажите название и SKU';err.style.display='block';return;} if(expiryDate&&manufactureDate&&expiryDate<manufactureDate){err.textContent='Срок годности не может быть раньше даты изготовления';err.style.display='block';return;} if(minPrice>0&&price>0&&price<minPrice){err.textContent='Цена продажи не может быть ниже минимальной цены';err.style.display='block';return;} if(reserved>qty){err.textContent='Резерв не может быть больше остатка';err.style.display='block';return;}
    const mainBarcode=document.getElementById('f-barcode').value.trim();
    const collected=[mainBarcode,...[...document.querySelectorAll('#f-extra-barcodes .f-extra-barcode')].map(x=>x.value.trim())].filter(Boolean);
    const barcodes=[];collected.forEach(v=>{if(barcodes.indexOf(v)<0)barcodes.push(v);});
    const savedPackaging=[...document.querySelectorAll('#f-packaging .packaging-row')].map(row=>({name:row.querySelector('.f-pack-name')?.value.trim()||'',qty:Math.max(0,Number(row.querySelector('.f-pack-qty')?.value)||0),unit:row.querySelector('.f-pack-unit')?.value.trim()||'шт'})).filter(x=>x.name);
    const finalBarcode=barcodes[0]||'';
    const fields={name,originalName,sku,category,description,purpose,unit,qty:quickMode?0:qty,minStock,reserved,expected,price,minPrice,cost,vatRate,country,weight,volume,supplierSku,productType,isWeighted,archived,manufactureDate,expiryDate,barcode:finalBarcode,barcodes,packaging};
    const quickQty=Math.max(1,Number(document.getElementById('f-quick-qty')?.value)||1);
    const hasPhotos=photos.length>0;
    const mainPhotoIndex=Math.max(0,photos.indexOf(mainPhoto));
    if(editing){
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
      editing.hasPhotos=hasPhotos;
      editing.mainPhotoIndex=mainPhotoIndex;
      var _urlsEdit = await saveProductPhotos(editing.id, photos);
      editing.photos = _urlsEdit;
      editing.photo = _urlsEdit[0] || '';
      editing.mainPhoto = _urlsEdit[mainPhotoIndex] || _urlsEdit[0] || '';
      editing.hasPhotos = _urlsEdit.length > 0;
    }
    else {
      const newProduct={id:uid(),...fields,stock:{'wh-default':Number(fields.qty)||0},hasPhotos:false,mainPhotoIndex:mainPhotoIndex,photos:[],photo:'',mainPhoto:'',keywords:[],createdAt:nowISO(),updatedAt:nowISO()};
      try{ window.__oniNewProductId = newProduct.id; }catch(e){}
      products.push(newProduct);
      var _urlsNew = await saveProductPhotos(newProduct.id, photos);
      newProduct.photos = _urlsNew;
      newProduct.photo = _urlsNew[0] || '';
      newProduct.mainPhoto = _urlsNew[mainPhotoIndex] || _urlsNew[0] || '';
      newProduct.hasPhotos = _urlsNew.length > 0;
      if(quickMode){const line=cart.find(c=>c.productId===newProduct.id);if(line){line.qty+=quickQty;line.price=newProduct.price;line.emergencySale=true;}else cart.push({productId:newProduct.id,qty:quickQty,price:newProduct.price,emergencySale:true});}
    }
    var _cid=(!editing&&window.__oniNewProductId)?window.__oniNewProductId:null;try{delete window.__oniNewProductId;}catch(e){}await persist('products');close();safeRender();if(_cid&&typeof options.onCreated==='function'){try{options.onCreated(_cid);}catch(e){}}updateMessagesBadge();showToast(quickMode?'Быстрый товар добавлен в чек':(editing?'Товар сохранён':'Товар добавлен'));
  };
}


// ===== Step 4a: purchases/suppliers utilities =====
function getSupplier(id){ return suppliers.find(s=>s.id===id); }

function supplierName(id){ return getSupplier(id)?.name || 'Поставщик не указан'; }

function purchaseProductName(id){
  const p=products.find(x=>x.id===id);
  return p?.name || 'Товар удалён';
}

function supplierPurchaseRows(supplierId){
  return purchases.filter(x=>x.supplierId===supplierId).sort((a,b)=>new Date(b.date)-new Date(a.date));
}

function productPurchaseRows(productId){
  return purchases.filter(x=>x.productId===productId).sort((a,b)=>new Date(b.date)-new Date(a.date));
}

function requestStatusLabel(st){ return ({draft:'Черновик',sent:'Отправлена',awaiting:'Ждём подтверждение',confirmed:'Подтверждена',completed:'Выполнена',cancelled:'Отменена'}[st]||st||'Черновик'); }

function requestStatusClass(st){ return st==='completed'||st==='confirmed'?'badge-ok':st==='cancelled'?'badge-low':'badge-card'; }

function whatsappNumber(v){ return String(v||'').replace(/[^\d]/g,''); }

function supplierContacts(supplierId){
  return contacts.filter(c=>c.type==='supplier' && c.supplierId===supplierId);
}


// ===== Step 4b: suppliers + purchases view/bind =====
function viewSuppliers(){
  const total=purchases.reduce((sum,x)=>sum+(Number(x.qty)||0)*(Number(x.cost)||0),0);
  const recent=[...purchases].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  return `
    <div class="supplier-hero"><div><div class="supplier-hero-title">Поставщики и закупки</div><div class="supplier-hero-sub">Здесь добавляются поставщики и оформляется приход товара.</div></div></div>
    <div class="info-grid supplier-stat">
      <div class="info-card"><div class="info-label">Поставщиков</div><div class="info-value">${suppliers.length}</div></div>
      <div class="info-card"><div class="info-label">Закупок</div><div class="info-value">${purchases.length}</div></div>
      <div class="info-card"><div class="info-label">Закуплено всего</div><div class="info-value">${fmtMoney(total)}</div></div>
    </div>
    <div style="display:flex;gap:7px;margin-bottom:11px;"><div class="search" style="flex:1;margin:0;"><span class="search-icon">⌕</span><input id="supplier-search" placeholder="Поиск поставщика…" value="${escapeHtml(supplierSearch)}"></div><button class="btn btn-primary" id="supplier-add-inline">＋ Добавить</button></div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Список поставщиков</div></div>
      ${suppliers.length?suppliers.map(x=>{
        const ps=supplierPurchaseRows(x.id), sum=ps.reduce((a,r)=>a+(Number(r.qty)||0)*(Number(r.cost)||0),0);
        return `<button type="button" class="list-row live-search-row" data-search-text="${escapeHtml(`${x.name||''} ${x.phone||''} ${x.whatsapp||''} ${x.note||''}`)}" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;" data-supplier-open="${escapeHtml(x.id)}">
          <div class="row-icon cat">${escapeHtml(initials(x.name||''))}</div><div class="row-main"><div class="row-title">${escapeHtml(x.name||'Без названия')}</div><div class="row-sub">${escapeHtml(x.phone||'Телефон не указан')}${x.whatsapp?' · WhatsApp: '+escapeHtml(x.whatsapp):''}</div><div class="purchase-meta">${ps.length} закупок · ${fmtMoney(sum)}</div></div><div class="row-right"><span class="badge badge-ok">Открыть</span></div>
        </button>`;
      }).join(''):'<div class="panel-body"><div class="empty">Поставщиков пока нет</div></div>'}
      ${suppliers.length?'<div class="panel-body" data-live-empty="supplier-search" style="display:none;"><div class="empty">Поставщики не найдены</div></div>':''}
    </div>
    <div class="panel"><div class="panel-head"><div class="panel-title">Последние закупки</div></div>
      ${recent.length?recent.map(r=>`<div class="list-row"><div class="row-icon in">IN</div><div class="row-main"><div class="row-title">${escapeHtml(purchaseProductName(r.productId))}</div><div class="row-sub">${escapeHtml(supplierName(r.supplierId))} · ${fmtDate(r.date)} · ${r.qty} ${escapeHtml(r.unit||'шт')}</div><div class="purchase-meta">${fmtMoney((Number(r.qty)||0)*(Number(r.cost)||0))}</div></div><div class="row-right"><div class="row-value">${fmtMoney(r.cost)} / ед.</div></div></div>`).join(''):'<div class="panel-body"><div class="empty">Закупок пока нет</div></div>'}
    </div>`;
}

function bindSuppliers(){
  bindLiveSearch('supplier-search','.live-search-row');
  document.getElementById('supplier-add-inline')?.addEventListener('click',()=>openSupplierModal());
  document.querySelectorAll('[data-supplier-open]').forEach(b=>b.onclick=()=>openSupplierDetail(b.dataset.supplierOpen));
}

function openPurchasesHub(){
  if(!requireAccess('suppliers')) return;
  const root=document.getElementById('modal-root');
  root.innerHTML=`<div class="sheet-overlay" id="purchases-hub-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Закупки</div><button class="sheet-close" id="purchases-hub-close">✕</button></div><div class="sheet-body">
    <div class="panel">
      <button type="button" class="list-row" id="ph-low" style="width:100%;border:0;background:none;text-align:left;cursor:pointer;padding:13px 15px;">
        <div class="row-icon out" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17h.01"/></svg></div>
        <div class="row-main"><div class="row-title">Что нужно пополнить?</div><div class="row-sub">Товары ниже минимального остатка</div></div>
        <div class="row-right" style="color:var(--dim);font-size:20px;line-height:1;">›</div>
      </button>
      <button type="button" class="list-row" id="ph-new" style="width:100%;border:0;background:none;text-align:left;cursor:pointer;padding:13px 15px;">
        <div class="row-icon in" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>
        <div class="row-main"><div class="row-title">Новая закупка</div><div class="row-sub">Создать поступление товара</div></div>
        <div class="row-right" style="color:var(--dim);font-size:20px;line-height:1;">›</div>
      </button>
      <button type="button" class="list-row" id="ph-req" style="width:100%;border:0;background:none;text-align:left;cursor:pointer;padding:13px 15px;">
        <div class="row-icon sale" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></svg></div>
        <div class="row-main"><div class="row-title">Закупки на заявку</div><div class="row-sub">Работа с заявками поставщикам</div></div>
        <div class="row-right" style="color:var(--dim);font-size:20px;line-height:1;">›</div>
      </button>
      <button type="button" class="list-row" id="ph-history" style="width:100%;border:0;background:none;text-align:left;cursor:pointer;padding:13px 15px;">
        <div class="row-icon cat" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/><path d="M4 12H2.5"/></svg></div>
        <div class="row-main"><div class="row-title">История закупок</div><div class="row-sub">Все прошлые закупки</div></div>
        <div class="row-right" style="color:var(--dim);font-size:20px;line-height:1;">›</div>
      </button>
    </div>
  </div></div></div>`;
  const close=()=>root.innerHTML=''; document.getElementById('purchases-hub-close').onclick=close; document.getElementById('purchases-hub-ov').onclick=e=>{if(e.target.id==='purchases-hub-ov')close();};
  document.getElementById('ph-low').onclick=()=>{close();openLowStockScreen();}; document.getElementById('ph-new').onclick=()=>{close();openPurchaseModal();}; document.getElementById('ph-req').onclick=()=>{close();openProcurementRequestsScreen();}; document.getElementById('ph-history').onclick=()=>{close();openPurchaseHistoryScreen();};
}

function openPurchaseHistoryScreen(){
  const root=document.getElementById('modal-root'); const rows=[...purchases].sort((a,b)=>new Date(b.date)-new Date(a.date));
  root.innerHTML=`<div class="sheet-overlay" id="ph-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">История закупок</div><button class="sheet-close" id="ph-close">✕</button></div><div class="sheet-body">${rows.length?rows.map(r=>`<div class="list-row"><div class="row-icon in">IN</div><div class="row-main"><div class="row-title">${escapeHtml(purchaseProductName(r.productId))}</div><div class="row-sub">${escapeHtml(supplierName(r.supplierId))} · ${fmtDate(r.date)} · ${r.qty} ${escapeHtml(r.unit||'шт')}</div></div><div class="row-right"><div class="row-value">${fmtMoney((Number(r.qty)||0)*(Number(r.cost)||0))}</div></div></div>`).join(''):`<div class="empty">История закупок пуста.</div>`}</div></div></div>`; document.getElementById('ph-close').onclick=()=>root.innerHTML=''; document.getElementById('ph-ov').onclick=e=>{if(e.target.id==='ph-ov')root.innerHTML='';};
}

function openLowStockScreen(){
  const root=document.getElementById('modal-root'), low=lowStockProducts();
  if(!suppliers.length){showToast('Сначала добавьте поставщика');openSupplierModal();return;}
  const options=suppliers.map(s=>`<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
  root.innerHTML=`<div class="sheet-overlay" id="low-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Что нужно пополнить</div><button class="sheet-close" id="low-close">✕</button></div><div class="sheet-body">
    ${low.length?`<div class="form-hint">Выберите товары, количество и поставщика. Из выбранных позиций будет создана заявка.</div><div id="low-list">${low.map((p,i)=>`<div class="purchase-line low-line" data-product="${escapeHtml(p.id)}"><label style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;"><input type="checkbox" class="low-check" ${i<3?'checked':''}><span class="row-main"><span class="row-title">${escapeHtml(p.name)}</span><span class="row-sub">Остаток ${p.qty} ${escapeHtml(p.unit||'шт')} · минимум ${p.minStock}</span></span></label><input class="form-input low-qty" type="number" min="1" step="1" value="${Math.max(1,Number(p.minStock)-Number(p.qty))}" style="width:82px;"></div>`).join('')}</div>
    <div class="form-field"><label class="form-label">Поставщик</label><select class="form-select" id="low-supplier">${options}</select></div>
    <div class="form-field"><label class="form-label">Комментарий</label><textarea class="form-input" id="low-note" rows="2" placeholder="Например: срочно пополнить до конца недели"></textarea></div>`:`<div class="empty">Критически низких остатков нет.</div>`}
  </div><div class="sheet-foot">${low.length?`<button class="btn btn-primary btn-block" id="low-create">Создать заявку</button>`:''}</div></div></div>`;
  const close=()=>root.innerHTML=''; document.getElementById('low-close').onclick=close; document.getElementById('low-ov').onclick=e=>{if(e.target.id==='low-ov')close();};
  const create=document.getElementById('low-create'); if(create) create.onclick=async()=>{ const supplierId=document.getElementById('low-supplier').value; const items=[]; document.querySelectorAll('.low-line').forEach(row=>{if(row.querySelector('.low-check')?.checked){const p=products.find(x=>x.id===row.dataset.product);const qty=Number(row.querySelector('.low-qty')?.value)||0;if(p&&qty>0)items.push({productId:p.id,productName:p.name,qty});}}); if(!items.length){showToast('Выберите хотя бы один товар');return;} const r={id:uid(),supplierId,items,status:'draft',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),note:document.getElementById('low-note').value.trim()}; procurementRequests.unshift(r); await persist('procurementRequests'); close(); openProcurementRequestDetail(r.id); };
}

function openProcurementRequestsScreen(){
  const root=document.getElementById('modal-root'); const rows=[...procurementRequests].sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt));
  root.innerHTML=`<div class="sheet-overlay" id="reqs-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Заявки на закупку</div><button class="sheet-close" id="reqs-close">✕</button></div><div class="sheet-body">${rows.length?rows.map(r=>`<button type="button" class="list-row" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;" data-req-open="${escapeHtml(r.id)}"><div class="row-icon sale">RQ</div><div class="row-main"><div class="row-title">${escapeHtml(supplierName(r.supplierId))}</div><div class="row-sub">${(r.items||[]).length} поз. · ${fmtDate(r.createdAt)}</div></div><div class="row-right"><span class="badge ${requestStatusClass(r.status)}">${requestStatusLabel(r.status)}</span></div></button>`).join(''):`<div class="empty">Заявок пока нет. Создайте её через «Что нужно пополнить».</div>`}</div><div class="sheet-foot"><button class="btn btn-primary btn-block" id="reqs-new">＋ Создать заявку</button></div></div></div>`;
  const close=()=>root.innerHTML=''; document.getElementById('reqs-close').onclick=close; document.getElementById('reqs-ov').onclick=e=>{if(e.target.id==='reqs-ov')close();}; document.querySelectorAll('[data-req-open]').forEach(b=>b.onclick=()=>openProcurementRequestDetail(b.dataset.reqOpen)); document.getElementById('reqs-new').onclick=()=>openLowStockScreen();
}


// ===== Step 4c: suppliers modal/detail/contact =====
function openSupplierModal(id){
  if(!requireAccess('suppliers')) return;
  const root=document.getElementById('modal-root');
  const editing=id?getSupplier(id):null;
  root.innerHTML=`<div class="sheet-overlay" id="supplier-ov"><div class="sheet">
    <div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">${editing?'Изменить поставщика':'Новый поставщик'}</div><button class="sheet-close" id="supplier-close">✕</button></div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Поставщик / компания</label><input class="form-input" id="s-name" value="${escapeHtml(editing?.name||'')}" placeholder="Название"></div>
      <div class="form-grid2">
        <div class="form-field"><label class="form-label">Телефон</label><input class="form-input" id="s-phone" value="${escapeHtml(editing?.phone||'')}" placeholder="+7"></div>
        <div class="form-field"><label class="form-label">WhatsApp</label><input class="form-input" id="s-wa" value="${escapeHtml(editing?.whatsapp||'')}" placeholder="+7"></div>
      </div>
      <div class="form-field"><label class="form-label">Адрес</label><input class="form-input" id="s-address" value="${escapeHtml(editing?.address||'')}" placeholder="Адрес поставщика"></div>
      <div class="form-field"><label class="form-label">Комментарий</label><input class="form-input" id="s-note" value="${escapeHtml(editing?.note||'')}" placeholder="Условия, контакты…"></div>
    </div>
    <div class="sheet-foot">${editing?'<button class="btn btn-danger-text" id="s-del">Удалить</button>':''}<button class="btn btn-primary" id="s-save" style="flex:1;">${editing?'Сохранить':'Добавить'}</button></div>
  </div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('supplier-close').onclick=close;
  document.getElementById('supplier-ov').onclick=e=>{if(e.target.id==='supplier-ov')close();};
  if(editing) document.getElementById('s-del').onclick=async()=>{
    if(purchases.some(p=>p.supplierId===editing.id)){showToast('Нельзя удалить: у поставщика есть история закупок');return;}
    if(!confirm(`Удалить поставщика «${editing.name}»?`))return;
    suppliers=suppliers.filter(x=>x.id!==editing.id); contacts=contacts.filter(c=>!(c.type==='supplier' && c.supplierId===editing.id)); await Promise.all([persist('suppliers'),persist('contacts')]); close(); safeRender();
  };
  document.getElementById('s-save').onclick=async()=>{
    const name=document.getElementById('s-name').value.trim();
    const phone=document.getElementById('s-phone').value.trim();
    const whatsapp=document.getElementById('s-wa').value.trim()||phone;
    const address=document.getElementById('s-address').value.trim();
    const note=document.getElementById('s-note').value.trim();
    if(!name){showToast('Укажите поставщика');return;}
    if(editing) Object.assign(editing,{name,phone,whatsapp,address,note});
    else suppliers.push({id:uid(),name,phone,whatsapp,address,note});
    await persist('suppliers');close();safeRender();showToast(editing?'Поставщик сохранён':'Поставщик добавлен');
  };
}

function openSupplierDetail(id){
  if(!requireAccess('suppliers')) return;
  const root=document.getElementById('modal-root'), s=getSupplier(id);
  if(!s)return;
  const rows=supplierPurchaseRows(id);
  const total=rows.reduce((a,r)=>a+(Number(r.qty)||0)*(Number(r.cost)||0),0);
  const sc=supplierContacts(id);
  root.innerHTML=`<div class="sheet-overlay" id="supplier-detail-ov"><div class="sheet">
    <div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">${escapeHtml(s.name)}</div><button class="sheet-close" id="supplier-detail-close">✕</button></div>
    <div class="sheet-body">
      <div class="info-grid">
        <div class="info-card"><div class="info-label">Телефон</div><div class="info-value">${escapeHtml(s.phone||'—')}</div></div>
        <div class="info-card"><div class="info-label">WhatsApp</div><div class="info-value">${escapeHtml(s.whatsapp||'—')}</div></div>
        <div class="info-card"><div class="info-label">Адрес</div><div class="info-value">${escapeHtml(s.address||'—')}</div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Контакты</div><button class="btn" id="supplier-contact-add">+ Контакт</button></div>
        ${sc.length?sc.map(c=>`<div class="list-row">
          <div class="row-icon cat">${initials(c.name||'К')}</div><div class="row-main"><div class="row-title">${escapeHtml(c.name||'Без имени')}</div><div class="row-sub">${escapeHtml(c.role||'Контакт')} · ${escapeHtml(c.phone||c.whatsapp||'Телефон не указан')}</div>${c.note?`<div class="purchase-meta">${escapeHtml(c.note)}</div>`:''}</div>
          <div class="row-right"><button class="move-action" data-sc-edit="${c.id}">Изменить</button></div>
        </div>`).join(''):`<div class="panel-body"><div class="empty">Контактов пока нет</div></div>`}
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Закупки</div><div class="purchase-total">${fmtMoney(total)}</div></div>
        ${rows.length?rows.map(r=>`<div class="list-row">
          <div class="row-icon in">IN</div><div class="row-main"><div class="row-title">${escapeHtml(purchaseProductName(r.productId))}</div><div class="row-sub">${fmtDate(r.date)} · ${r.qty} ${escapeHtml(r.unit||products.find(p=>p.id===r.productId)?.unit||'шт')} · ${fmtMoney(r.cost)} за ед.</div>${r.note?`<div class="purchase-meta">${escapeHtml(r.note)}</div>`:''}</div>
          <div class="row-right"><div class="row-value">${fmtMoney((Number(r.qty)||0)*(Number(r.cost)||0))}</div><button class="move-action delete" data-purchase-detail-del="${r.id}">Удалить</button></div>
        </div>`).join(''):`<div class="panel-body"><div class="empty">Закупок пока нет</div></div>`}
      </div>
      ${s.note?`<div class="contact-box"><div class="contact-title">Комментарий</div><div class="row-sub">${escapeHtml(s.note)}</div></div>`:''}
    </div>
    <div class="sheet-foot"><button class="btn" id="supplier-edit" style="flex:1;">Изменить</button><button class="btn btn-primary" id="supplier-buy" style="flex:1;">+ Закупка</button></div>
  </div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('supplier-detail-close').onclick=close;
  document.getElementById('supplier-detail-ov').onclick=e=>{if(e.target.id==='supplier-detail-ov')close();};
  document.getElementById('supplier-contact-add').onclick=()=>openSupplierContactModal(id);
  document.querySelectorAll('[data-sc-edit]').forEach(b=>b.onclick=()=>openSupplierContactModal(id,b.dataset.scEdit));
  document.querySelectorAll('[data-purchase-detail-del]').forEach(b=>b.onclick=async()=>{await deletePurchase(b.dataset.purchaseDetailDel); if(getSupplier(id)) openSupplierDetail(id);});
  document.getElementById('supplier-edit').onclick=()=>{close();openSupplierModal(id);};
  document.getElementById('supplier-buy').onclick=()=>{close();openPurchaseModal(null,id);};
}

function openSupplierContactModal(supplierId, contactId=null){
  if(!requireAccess('suppliers')) return;
  const root=document.getElementById('modal-root');
  const editing=contacts.find(c=>c.id===contactId && c.type==='supplier');
  root.innerHTML=`<div class="sheet-overlay" id="sc-ov"><div class="sheet">
    <div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">${editing?'Изменить контакт':'Новый контакт'}</div><button class="sheet-close" id="sc-close">✕</button></div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Имя</label><input class="form-input" id="sc-name" value="${escapeHtml(editing?.name||'').replace(/"/g,'&quot;')}" placeholder="Имя контакта"></div>
      <div class="form-grid2">
        <div class="form-field"><label class="form-label">Должность</label><input class="form-input" id="sc-role" value="${escapeHtml(editing?.role||'').replace(/"/g,'&quot;')}" placeholder="Менеджер"></div>
        <div class="form-field"><label class="form-label">Телефон</label><input class="form-input" id="sc-phone" value="${escapeHtml(editing?.phone||'').replace(/"/g,'&quot;')}" placeholder="+7"></div>
      </div>
      <div class="form-field"><label class="form-label">WhatsApp</label><input class="form-input" id="sc-wa" value="${escapeHtml(editing?.whatsapp||'').replace(/"/g,'&quot;')}" placeholder="+7"></div>
      <div class="form-field"><label class="form-label">Комментарий</label><input class="form-input" id="sc-note" value="${escapeHtml(editing?.note||'').replace(/"/g,'&quot;')}" placeholder="Дополнительная информация"></div>
    </div>
    <div class="sheet-foot">${editing?'<button class="btn btn-danger-text" id="sc-del">Удалить</button>':''}<button class="btn btn-primary" id="sc-save" style="flex:1;">${editing?'Сохранить':'Добавить'}</button></div>
  </div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('sc-close').onclick=close;
  document.getElementById('sc-ov').onclick=e=>{if(e.target.id==='sc-ov')close();};
  if(editing) document.getElementById('sc-del').onclick=async()=>{
    if(!confirm(`Удалить контакт «${editing.name||'Без имени'}»?`))return;
    contacts=contacts.filter(c=>c.id!==editing.id); await persist('contacts'); close(); openSupplierDetail(supplierId);
  };
  document.getElementById('sc-save').onclick=async()=>{
    const name=document.getElementById('sc-name').value.trim();
    const role=document.getElementById('sc-role').value.trim();
    const phone=document.getElementById('sc-phone').value.trim();
    const whatsapp=document.getElementById('sc-wa').value.trim()||phone;
    const note=document.getElementById('sc-note').value.trim();
    if(!name){showToast('Укажите имя контакта');return;}
    if(editing) Object.assign(editing,{name,role,phone,whatsapp,note,supplierId,type:'supplier'});
    else contacts.push({id:uid(),name,role,phone,whatsapp,note,supplierId,type:'supplier'});
    await persist('contacts'); close(); openSupplierDetail(supplierId); showToast(editing?'Контакт сохранён':'Контакт добавлен');
  };
}


// ===== Step 4d: picker + purchase form + delete + history =====
function openProductPickerSheet(options){options=options||{};var root=document.getElementById('modal-root');var ov=document.createElement('div');ov.className='sheet-overlay';ov.id='pp-ov';ov.style.zIndex='110';ov.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0442\u043e\u0432\u0430\u0440</div><button class="sheet-close" id="pp-close">&#10005;</button></div><div class="sheet-body"><div class="search" style="margin:0;"><span class="search-icon">&#8981;</span><input id="pp-search" placeholder="\u041f\u043e\u0438\u0441\u043a: \u0438\u043c\u044f, SKU, \u0448\u0442\u0440\u0438\u0445\u043a\u043e\u0434"><button type="button" id="pp-scan" style="background:none;border:0;font-size:20px;padding:0 6px;cursor:pointer;">&#128247;</button></div><div id="pp-list" style="margin-top:8px;"></div></div></div>';root.appendChild(ov);function close(){ov.remove();}try{window.__oniPickerOnSelect=(typeof options.onSelect==='function'?options.onSelect:null);window.__oniPickerClose=close;}catch(e){}document.getElementById('pp-close').onclick=close;ov.onclick=function(e){if(e.target.id==='pp-ov')close();};var listRoot=document.getElementById('pp-list');var searchInput=document.getElementById('pp-search');function render(q){q=String(q||'').trim().toLowerCase();var all=products.filter(function(p){return !p.isCategoryPlaceholder;});var list=q?all.filter(function(p){var h=((p.name||'')+' '+(p.sku||'')+' '+productBarcodes(p).join(' ')).toLowerCase();return h.indexOf(q)>=0;}):all.slice(0,100);if(!list.length){listRoot.innerHTML='<div class="empty">\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e</div>';return;}listRoot.innerHTML=list.map(function(p){var bc=productBarcodes(p);var sub=[p.sku||'',bc.join(', ')].filter(Boolean).join(' \u00b7 ');return '<button type="button" class="list-row" data-pick="'+escapeHtml(p.id)+'" style="width:100%;background:none;border:0;text-align:left;cursor:pointer;"><div class="row-icon cat">'+escapeHtml(initials(p.name))+'</div><div class="row-main"><div class="row-title">'+escapeHtml(p.name)+'</div><div class="row-sub">'+escapeHtml(sub)+'</div></div><div class="row-right">+</div></button>';}).join('');listRoot.querySelectorAll('[data-pick]').forEach(function(b){b.onclick=function(){var pid=b.dataset.pick;close();if(typeof options.onSelect==='function'){options.onSelect(pid);}};});}searchInput.oninput=function(){render(searchInput.value);};render('');try{searchInput.focus();}catch(e){}document.getElementById('pp-scan').onclick=function(){if(!(window.Android&&typeof Android.scanBarcode==='function')){showToast('\u0421\u043a\u0430\u043d\u0435\u0440 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d');return;}var prev=window.onBarcodeScanned;window.onBarcodeScanned=function(json){try{var d=typeof json==='string'?JSON.parse(json):json;var code=String((d&&(d.barcode||d.code||d.value))||'').trim();if(code){var found=null;for(var i=0;i<products.length;i++){var pp=products[i];if(!pp.isCategoryPlaceholder&&productBarcodes(pp).indexOf(code)>=0){found=pp;break;}}if(found){close();if(typeof options.onSelect==='function'){options.onSelect(found.id);}}else{showToast('\u0428\u0442\u0440\u0438\u0445\u043a\u043e\u0434 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d: '+code);}}}catch(e){}window.onBarcodeScanned=prev;};Android.scanBarcode();};};function openPurchaseModal(presetSupplierId=null,presetProductId=null,presetLines=null,requestId=null,presetState=null){
  if(!requireAccess('suppliers')) return;
  const root=document.getElementById('modal-root');
  const realProducts=products.filter(p=>!p.isCategoryPlaceholder);
  if(!suppliers.length){showToast('Сначала добавьте поставщика');openSupplierModal();return;}
  if(!realProducts.length){showToast('Сначала добавьте товар');return;}
  const supplierOptions=suppliers.map(x=>`<option value="${escapeHtml(x.id)}" ${x.id===presetSupplierId?'selected':''}>${escapeHtml(x.name)}</option>`).join('');
  const productOptions=realProducts.map(p=>`<option value="${escapeHtml(p.id)}" ${p.id===presetProductId?'selected':''} data-search="${escapeHtml((p.name||'')+' '+(p.sku||'')+' '+productBarcodes(p).join(' '))}">${escapeHtml(p.name)} — ${escapeHtml(p.sku||'')}</option>`).join('');
  root.innerHTML=`<div class="sheet-overlay" id="purchase-ov"><div class="sheet">
    <div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Новая закупка</div><button class="sheet-close" id="purchase-close">✕</button></div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Поставщик</label><select class="form-select" id="pu-supplier">${supplierOptions}</select></div>
      <div class="purchase-items-head"><div class="panel-title">Товары в закупке</div><button class="btn" type="button" id="pu-add-row">＋ Товар</button><button class="btn" type="button" id="pu-add-new" style="margin-left:6px;">+ New</button></div>
      <div id="pu-items"></div>
      <div class="total-row"><span class="label">Итого закупка</span><span class="value" id="pu-total">${fmtMoney(0)}</span></div>
      <div class="form-grid2">
        <div class="form-field"><label class="form-label">Статус оплаты</label><select class="form-select" id="pu-payment"><option value="paid">Оплачено</option><option value="partial">Частично</option><option value="debt">Долг</option></select></div>
        <div class="form-field"><label class="form-label">Оплачено, ₸</label><input class="form-input" type="number" min="0" step="0.01" id="pu-paid" value="0"></div>
      </div>
      <div class="form-grid2">
        <div class="form-field"><label class="form-label">Дата закупки</label><input class="form-input" type="date" id="pu-date" value="${todayISO()}"></div>
        <div class="form-field"><label class="form-label">Номер накладной</label><input class="form-input" id="pu-invoice" placeholder="Необязательно"></div>
      </div>
      <div class="form-field"><label class="form-label">Комментарий</label><textarea class="form-input" id="pu-note" rows="2" placeholder="Партия, условия, примечание…"></textarea></div>
      <div class="form-hint" style="color:var(--muted);">Все товары из этой формы будут приняты на склад одним приходом и привязаны к выбранному поставщику.</div>
    </div>
    <div class="sheet-foot"><button class="btn btn-primary btn-block" id="pu-save">Принять закупку</button></div>
  </div></div>`;
  const itemsRoot=document.getElementById('pu-items');
  let rowSeq=0;
  const addRow=(productId='')=>{
    const id='pu-row-'+(++rowSeq);
    const defaultProduct=productId || (realProducts.length?realProducts[0].id:'');
    const row=document.createElement('div');
    row.className='purchase-line'; row.dataset.row=id;
    row.innerHTML=`<div class="purchase-line-product"><input type="hidden" class="pu-product" value=""><button type="button" class="form-input pu-product-btn" style="text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">\u0412\u044b\u0431\u0440\u0430\u0442\u044c</button></div><input class="form-input pu-qty" type="number" min="0.001" step="0.001" value="1" placeholder="Кол-во"><input class="form-input pu-cost" type="number" min="0" step="0.01" value="0" placeholder="Цена"><button type="button" class="move-action delete pu-remove" title="Удалить">✕</button>`;
    itemsRoot.appendChild(row);
    var _setProduct=function(pid){var _pp=products.find(function(x){return x.id===pid;});row.querySelector('.pu-product').value=pid||'';var _pb=row.querySelector('.pu-product-btn');if(_pb)_pb.textContent=_pp?_pp.name:'\u0412\u044b\u0431\u0440\u0430\u0442\u044c';updateTotal();};if(defaultProduct)_setProduct(defaultProduct);row.querySelector('.pu-product-btn').onclick=function(){if(typeof openProductPickerSheet==='function'){openProductPickerSheet({onSelect:_setProduct});}};
    row.querySelectorAll('input,select').forEach(el=>el.oninput=updateTotal);
    row.querySelector('.pu-remove').onclick=()=>{  row.remove(); updateTotal(); };
    updateTotal();
  };
  const updateTotal=()=>{
    let total=0;
    itemsRoot.querySelectorAll('.purchase-line').forEach(row=>{ total+=(Number(row.querySelector('.pu-qty')?.value)||0)*(Number(row.querySelector('.pu-cost')?.value)||0); });
    const el=document.getElementById('pu-total'); if(el)el.textContent=fmtMoney(total);
    const payment=document.getElementById('pu-payment'), paid=document.getElementById('pu-paid');
    if(payment&&paid){ if(payment.value==='paid') paid.value=total.toFixed(2); else if(payment.value==='debt') paid.value='0'; }
    return total;
  };
  if(Array.isArray(presetLines)&&presetLines.length){ presetLines.forEach(x=>addRow(x.productId||'')); const rows=[...itemsRoot.querySelectorAll('.purchase-line')]; presetLines.forEach((x,i)=>{ if(rows[i]){ rows[i].querySelector('.pu-qty').value=x.qty||1; if(x.cost!==undefined&&x.cost!==null)rows[i].querySelector('.pu-cost').value=x.cost; } }); updateTotal(); } else if(presetProductId) addRow(presetProductId);
  document.getElementById('pu-add-row').onclick=()=>{if(typeof openProductPickerSheet==='function'){openProductPickerSheet({onSelect:function(pid){addRow(pid);}});}else{addRow('');}};
var _puSearch=document.getElementById('pu-search');if(_puSearch)_puSearch.oninput=function(){var q=this.value.trim().toLowerCase();itemsRoot.querySelectorAll('select.pu-product').forEach(function(sel){Array.from(sel.options).forEach(function(opt){if(!q){opt.hidden=false;return;}var hay=(opt.getAttribute('data-search')||opt.text||'').toLowerCase();opt.hidden=hay.indexOf(q)<0;});});};
var _puScan=document.getElementById('pu-scan');if(_puScan)_puScan.onclick=function(){if(!(window.Android&&typeof Android.scanBarcode==='function')){showToast('\u0421\u043a\u0430\u043d\u0435\u0440 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d');return;}var prev=window.onBarcodeScanned;window.onBarcodeScanned=function(json){try{var d=typeof json==='string'?JSON.parse(json):json;var code=String((d&&(d.barcode||d.code||d.value))||'').trim();if(!code)return;var found=null;for(var i=0;i<realProducts.length;i++){var pp=realProducts[i];if(productBarcodes(pp).indexOf(code)>=0){found=pp;break;}}if(found){var existing=null;itemsRoot.querySelectorAll('.purchase-line').forEach(function(row){if(row.querySelector('.pu-product').value===found.id)existing=row;});if(existing){var q=Number(existing.querySelector('.pu-qty').value)||0;existing.querySelector('.pu-qty').value=q+1;}else{addRow(found.id);}updateTotal();showToast('\u0414\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e: '+found.name);}else{showToast('\u041d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e: '+code);}}catch(e){console.error('scan-purchase',e);}window.onBarcodeScanned=prev;};Android.scanBarcode();};
  document.getElementById('pu-payment').onchange=updateTotal;
    const close=()=>root.innerHTML='';
  document.getElementById('purchase-close').onclick=close;
  document.getElementById('purchase-ov').onclick=e=>{if(e.target.id==='purchase-ov')close();};
  if(presetState){try{if(presetState.date)document.getElementById('pu-date').value=presetState.date;if(presetState.invoice)document.getElementById('pu-invoice').value=presetState.invoice;if(presetState.note)document.getElementById('pu-note').value=presetState.note;if(presetState.payment)document.getElementById('pu-payment').value=presetState.payment;if(presetState.paid!==undefined)document.getElementById('pu-paid').value=presetState.paid;}catch(e){}}
  document.getElementById('pu-add-new').onclick=function(){try{var _stLines=[];itemsRoot.querySelectorAll('.purchase-line').forEach(function(r){_stLines.push({productId:r.querySelector('.pu-product').value,qty:Number(r.querySelector('.pu-qty').value)||0,cost:Number(r.querySelector('.pu-cost').value)||0});});var _st={supplierId:document.getElementById('pu-supplier').value,date:document.getElementById('pu-date').value||'',invoice:document.getElementById('pu-invoice').value.trim(),note:document.getElementById('pu-note').value.trim(),payment:document.getElementById('pu-payment').value,paid:Number(document.getElementById('pu-paid').value)||0,lines:_stLines};var _sc=_st.supplierId;close();openProductModal(null,{fromPurchase:true,onCreated:function(newId){try{var _lines=_st.lines.slice();_lines.push({productId:newId,qty:1,cost:0});openPurchaseModal(_sc,null,_lines,null,_st);}catch(e){console.error('purchase-new',e);}}});}catch(e){console.error(e);}};
  document.getElementById('pu-save').onclick=async()=>{
    const supplierId=document.getElementById('pu-supplier').value;
    const date=document.getElementById('pu-date').value||todayISO();
    const invoice=document.getElementById('pu-invoice').value.trim();
    const note=document.getElementById('pu-note').value.trim();
    const paymentStatus=document.getElementById('pu-payment').value;
    const total=updateTotal();
    let paid=Number(document.getElementById('pu-paid').value)||0;
    paid=Math.max(0,Math.min(total,paid));
    const lines=[];
    itemsRoot.querySelectorAll('.purchase-line').forEach(row=>{
      const productId=row.querySelector('.pu-product').value;
      const qty=Number(row.querySelector('.pu-qty').value)||0;
      const cost=Number(row.querySelector('.pu-cost').value)||0;
      if(productId&&qty>0&&cost>=0) lines.push({productId,qty,cost});
    });
    if(!supplierId||!lines.length){showToast('Выберите поставщика и добавьте хотя бы один товар');return;}
    if(lines.some(x=>!products.find(p=>p.id===x.productId))){showToast('Один из товаров больше не существует');return;}
    const batchId=uid();
    const batchTotal=lines.reduce((s,x)=>s+x.qty*x.cost,0);
    if(paymentStatus==='paid') paid=batchTotal;
    if(paymentStatus==='debt') paid=0;
    if(paymentStatus==='partial' && (paid<=0 || paid>=batchTotal)){showToast('Для частичной оплаты укажите сумму меньше итога');return;}
    const paymentLeft=Math.max(0,batchTotal-paid);
    lines.forEach(line=>{
      const p=products.find(x=>x.id===line.productId);
      const purchase={id:uid(),batchId,supplierId,productId:p.id,productName:p.name,productSku:p.sku,unit:p.unit,qty:line.qty,cost:line.cost,date,note,invoice,paymentStatus,paidAmount:batchTotal?paid*(line.qty*line.cost/batchTotal):0,totalAmount:line.qty*line.cost,batchTotal,batchPaid:paid,batchDebt:paymentLeft};
      purchases.push(purchase);
      p.qty=(Number(p.qty)||0)+line.qty;p.stock={...(p.stock||{}),'wh-default':(Number((p.stock||{})['wh-default'])||0)+line.qty};p.updatedAt=nowISO();
      movements.push({id:uid(),productId:p.id,productName:p.name,productSku:p.sku,type:'in',qty:line.qty,date,note:`Закупка · ${supplierName(supplierId)}${invoice?' · накладная '+invoice:''}${note?' · '+note:''}`,purchaseId:purchase.id,batchId});
    });
    await Promise.all([persist('products'),persist('movements'),persist('purchases')]);
    if(requestId){ const rr=procurementRequests.find(x=>x.id===requestId); if(rr){ rr.status='completed'; rr.updatedAt=new Date().toISOString(); await persist('procurementRequests'); } }
    close();safeRender();showToast(`Закупка принята: ${lines.length} товар(а), ${fmtMoney(batchTotal)}`);
  };
}

async function deletePurchase(id){
  if(!requireAccess('suppliers')) return;
  const r=purchases.find(x=>x.id===id); if(!r)return;
  if(!confirm(`Удалить закупку «${purchaseProductName(r.productId)}» (${r.qty} ${r.unit||''})? Остаток будет уменьшен.`))return;
  const p=products.find(x=>x.id===r.productId);
  if(p){
    if((Number(p.qty)||0)<(Number(r.qty)||0)){showToast('Нельзя удалить: текущего остатка меньше количества этой закупки');return;}
    p.qty-=Number(r.qty)||0;p.stock={...(p.stock||{}),'wh-default':Math.max(0,(Number((p.stock||{})['wh-default'])||0)-(Number(r.qty)||0))};p.updatedAt=nowISO();
  }
  purchases=purchases.filter(x=>x.id!==id);
  const move=movements.find(x=>x.purchaseId===id);
  if(move)movements=movements.filter(x=>x.id!==move.id);
  await Promise.all([persist('products'),persist('movements'),persist('purchases')]);
  safeRender();showToast('Закупка удалена');
}

function openProductPurchaseHistory(productId){
  if(!requireAccess('products')) return;
  const p=products.find(x=>x.id===productId); if(!p)return;
  const rows=productPurchaseRows(productId);
  const root=document.getElementById('modal-root');
  root.innerHTML=`<div class="sheet-overlay" id="pph-ov"><div class="sheet">
    <div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Закупки · ${escapeHtml(p.name||'')}</div><button class="sheet-close" id="pph-close">✕</button></div>
    <div class="sheet-body">
      <div class="info-grid"><div class="info-card"><div class="info-label">Остаток</div><div class="info-value">${p.qty} ${escapeHtml(p.unit||'')}</div></div><div class="info-card"><div class="info-label">Закупок</div><div class="info-value">${rows.length}</div></div></div>
      <div class="panel">${rows.length?rows.map(r=>`<div class="list-row"><div class="row-icon in">IN</div><div class="row-main"><div class="row-title">${escapeHtml(supplierName(r.supplierId)||'')}</div><div class="row-sub">${fmtDate(r.date)} · ${r.qty} ${escapeHtml(r.unit||p.unit||'')}</div><div class="purchase-meta">Цена закупки: ${fmtMoney(r.cost)}${r.note?' · '+escapeHtml(r.note||''):''}</div></div><div class="row-right"><div class="row-value">${fmtMoney((Number(r.qty)||0)*(Number(r.cost)||0))}</div></div></div>`).join(''):`<div class="panel-body"><div class="empty">Истории закупок нет</div></div>`}</div>
    </div>
    <div class="sheet-foot"><button class="btn btn-primary btn-block" id="pph-buy">+ Новая закупка</button></div>
  </div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('pph-close').onclick=close;
  document.getElementById('pph-ov').onclick=e=>{if(e.target.id==='pph-ov')close();};
  document.getElementById('pph-buy').onclick=()=>{close();openPurchaseModal(null,productId);};
}

