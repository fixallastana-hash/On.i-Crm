/* SENIOR-PATCH-b2-core-callsites */
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
  try{ const v=await safeStorageGet(key); if(v!==null && String(v).trim()!=='') return v; }catch(e){}
  return null;
}

async function storageSet(key,value){
  const text=String(value); let saved=false;
  // Синхронная копия — основная для локального HTML и Android.
  try{ localStorage.setItem('sklad_crm_'+key,text); saved=true; }catch(e){}
  // Остальные хранилища — только дополнительно и никогда не должны блокировать UI.
  try{ if(window.storage && typeof window.storage.set==='function') { const r=await withTimeout(window.storage.set(key,text,false),700); saved=!!r||saved; } }catch(e){}
  try{ if(await safeStorageSet(key,text)) saved=true; }catch(e){}
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
      if(_saveBusy){ _backupQueued=true; return false; }
      _saveBusy=true;
      let ok=false;
      try{
        const data=makeFullBackup();
        const ts=String(Date.now());
        // H-9: primary — native Android file (survives WebView IndexedDB being broken)
        if(window.Android && typeof window.Android.saveBackupToFile === 'function'){
          try{ if(window.Android.saveBackupToFile(data)) ok=true; }catch(e){}
        }
        // H-9: secondary — IndexedDB (works on devices where the Phone B fix isn't needed)
        if(window.indexedDB){
          try{ if(await safeStorageSet(BACKUP_KEY,data)) ok=true; }catch(e){}
          try{ await safeStorageSet(BACKUP_TS_KEY,ts); }catch(e){}
        }
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
    // H-9: try IndexedDB first (legacy stores), then native file
    if(window.indexedDB){
      try{ const v=await safeStorageGet(BACKUP_KEY); if(v) return v; }catch(e){}
    }
    if(window.Android && typeof window.Android.loadBackupFromFile === 'function'){
      try{ const v=window.Android.loadBackupFromFile(); if(v && v.length > 0) return v; }catch(e){}
    }
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


// A1: Cloud Functions called through the Android bridge (native HTTPS).
// firebase-functions-compat.js is not initialized; JS never calls CF directly.
var _cfQueue = Promise.resolve();
function callCloudFn(name, payload) {
  var exec = function() {
    return new Promise(function(resolve, reject) {
      if (!window.Android || typeof window.Android.callCloudFunction !== "function") {
        return reject(new Error("Native bridge unavailable (rebuild required)"));
      }
      var prevCb = window.__oniCfCallback;
      window.__oniCfCallback = function(raw) {
        window.__oniCfCallback = prevCb || null;
        try {
          var res = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (res && res.__error) return reject(new Error(String(res.__error)));
          resolve(res || {});
        } catch (e) { reject(e); }
      };
      try {
        window.Android.callCloudFunction(String(name), JSON.stringify(payload || {}));
      } catch (e) {
        window.__oniCfCallback = prevCb || null;
        reject(e);
      }
    });
  };
  var p = _cfQueue.then(exec, exec);
  _cfQueue = p.catch(function(){});
  return p;
}
window.callCloudFn = callCloudFn;

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
    var __catPH = products.filter(p=>p.isCategoryPlaceholder&&p.category===cat);
     products=products.filter(p=>!(p.isCategoryPlaceholder&&p.category===cat)); products.forEach(p=>{if(p.category===cat)p.category='Без категории';});
     try{ if(fbDb&&fbAuth&&fbAuth.currentUser){ for(var __ci=0;__ci<__catPH.length;__ci++){ var __ph=__catPH[__ci]; var __pid=String(__ph.id).replace(/[\/\s]+/g,'_'); try{ await fbDb.collection('shops').doc(FB_SHOP_ID).collection('products').doc(__pid).delete(); console.log('[catDelete] product doc deleted',__pid); }catch(__e){ console.warn('[catDelete] product del failed',__e&&__e.message); } try{ await fbDb.collection('shops').doc(FB_SHOP_ID).collection('productTombstones').doc(__pid).set({ id:String(__ph.id), deletedAt:Date.now(), byUser:(activeUser&&activeUser.id)||null }); console.log('[catDelete] tombstone written',__pid); }catch(__e){ console.warn('[catDelete] tombstone failed',__e&&__e.message); } } } }catch(__e){ console.error('[catDelete] firestore block error',__e&&__e.message); }
     /* SENIOR-PATCH-b2.1-category-delete */
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
      <div class="form-field"><label class="form-label">Описание товара</label><textarea class="form-input" id="f-description" rows=5 style="resize:vertical;overflow-x:hidden;min-height:100px;max-width:100%;width:100%" placeholder="Что это за товар…">${escapeHtml(editing?.description||'')}</textarea></div>
      <div class="form-field"><label class="form-label">Для чего / назначение</label><textarea class="form-input" id="f-purpose" rows=4 style="resize:vertical;overflow-x:hidden;min-height:80px;max-width:100%;width:100%" placeholder="Для чего нужен товар…">${escapeHtml(editing?.purpose||'')}</textarea></div>
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
    var _cid=(!editing&&window.__oniNewProductId)?window.__oniNewProductId:null;try{delete window.__oniNewProductId;}catch(e){}await persist('products');close();safeRender();if(_cid&&typeof options.onCreated==='function'){try{options.onCreated(_cid);}catch(e){console.error('Purchase Callback Error:',e);showToast('Ошибка возврата в закупку: '+e.message);}}updateMessagesBadge();showToast(quickMode?'Быстрый товар добавлен в чек':(editing?'Товар сохранён':'Товар добавлен'));
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
      <div class="form-field"><label class="form-label">Склад</label><select class="form-select" id="pu-warehouse">${warehouses.map(w=>`<option value="${escapeHtml(w.id)}" ${w.id===(((points.find(x=>x.id===currentPointId)||{}).warehouseId)||'wh-default')?'selected':''}>${escapeHtml(w.name||w.id)}</option>`).join('')}</select></div>
      <div class="purchase-items-head"><div class="panel-title">Товары в закупке</div><button class="btn" type="button" id="pu-add-row">＋ Товар</button><button class="btn" type="button" id="pu-add-new" style="margin-left:6px;">+ New</button></div>
      <div id="pu-items"></div><div id="pu-new-form" style="display:none; background:#f4f4f5; padding:10px; border-radius:8px; margin-top:10px; border:1px solid #e4e4e7;"><div class="form-field"><label class="form-label">Название нового товара</label><input class="form-input" id="pu-new-name" placeholder="Например: Чай черный"></div><div class="form-grid2"><div class="form-field"><label class="form-label">Закупочная цена</label><input class="form-input" id="pu-new-cost" type="number" value="0" min="0"></div><div class="form-field"><label class="form-label">Количество</label><input class="form-input" id="pu-new-qty" type="number" value="1" min="1"></div></div><div style="display:flex; gap:8px; margin-top:10px;"><button class="btn btn-primary" id="pu-new-save" type="button">Создать и добавить</button><button class="btn" id="pu-new-cancel" type="button">Отмена</button></div></div>
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
  document.getElementById('pu-add-new').onclick=function(){document.getElementById('pu-new-form').style.display='block';document.getElementById('pu-new-name').focus();};
    document.getElementById('pu-new-cancel').onclick=function(){document.getElementById('pu-new-form').style.display='none';};
    document.getElementById('pu-new-save').onclick=async function(){var name=document.getElementById('pu-new-name').value.trim();var cost=Number(document.getElementById('pu-new-cost').value)||0;var qty=Number(document.getElementById('pu-new-qty').value)||1;if(!name){showToast('Введите название товара');return;}var newId=uid();var newProduct={id:newId,name:name,sku:generateUniqueSKU(),price:0,cost:cost,qty:0,stock:{},hasPhotos:false,photos:[],photo:'',mainPhoto:'',keywords:[],createdAt:nowISO(),updatedAt:nowISO()};products.push(newProduct);await persist('products');addRow(newId);var rows=[...itemsRoot.querySelectorAll('.purchase-line')];var newRow=rows[rows.length-1];if(newRow){newRow.querySelector('.pu-qty').value=qty;newRow.querySelector('.pu-cost').value=cost;updateTotal();}document.getElementById('pu-new-name').value='';document.getElementById('pu-new-cost').value='0';document.getElementById('pu-new-qty').value='1';document.getElementById('pu-new-form').style.display='none';showToast('Товар создан и добавлен в закупку');};
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
    const whId=document.getElementById('pu-warehouse').value||'wh-default';
    lines.forEach(line=>{
      const p=products.find(x=>x.id===line.productId);
      const purchase={id:uid(),batchId,supplierId,productId:p.id,productName:p.name,productSku:p.sku,unit:p.unit,qty:line.qty,cost:line.cost,date,note,invoice,paymentStatus,paidAmount:batchTotal?paid*(line.qty*line.cost/batchTotal):0,totalAmount:line.qty*line.cost,batchTotal,batchPaid:paid,batchDebt:paymentLeft,warehouseId:whId};
      purchases.push(purchase);
      p.qty=(Number(p.qty)||0)+line.qty;
      p.stock={...(p.stock||{}),[whId]:(Number((p.stock||{})[whId])||0)+line.qty};
      p.updatedAt=nowISO();
      movements.push({id:uid(),productId:p.id,productName:p.name,productSku:p.sku,type:'in',qty:line.qty,date,note:`Закупка · ${supplierName(supplierId)}${invoice?' · накладная '+invoice:''}${note?' · '+note:''}`,purchaseId:purchase.id,batchId,warehouseId:whId});
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



// ===== Step 4e: procurement requests + WhatsApp =====
function requestMessage(r){ const s=getSupplier(r.supplierId); const lines=(r.items||[]).map(x=>`• ${x.productName} — ${x.qty} шт.`).join('\n'); return `Здравствуйте! Заявка на пополнение товара:\n\n${lines}\n\nПожалуйста, подтвердите наличие и срок поставки.`+(r.note?`\n\nКомментарий: ${r.note}`:''); }
function sendRequestWhatsApp(id){ const r=procurementRequests.find(x=>x.id===id); if(!r)return; const s=getSupplier(r.supplierId), num=whatsappNumber(s?.whatsapp||s?.phone||supplierContacts(r.supplierId)[0]?.whatsapp||supplierContacts(r.supplierId)[0]?.phone); if(!num){showToast('У поставщика нет номера WhatsApp');return;} r.status='sent'; r.sentAt=new Date().toISOString(); r.updatedAt=new Date().toISOString(); persist('procurementRequests'); const url=`https://wa.me/${num}?text=${encodeURIComponent(requestMessage(r))}`; window.open(url,'_blank'); openProcurementRequestDetail(id); }
function openProcurementRequestDetail(id){
  const root=document.getElementById('modal-root'), r=procurementRequests.find(x=>x.id===id); if(!r)return; const s=getSupplier(r.supplierId);
  root.innerHTML=`<div class="sheet-overlay" id="req-detail-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Заявка · ${escapeHtml(s?.name||'')}</div><button class="sheet-close" id="req-detail-close">✕</button></div><div class="sheet-body"><div class="info-grid"><div class="info-card"><div class="info-label">Статус</div><div class="info-value">${requestStatusLabel(r.status)}</div></div><div class="info-card"><div class="info-label">Товаров</div><div class="info-value">${(r.items||[]).length}</div></div></div><div class="panel">${(r.items||[]).map(x=>`<div class="list-row"><div class="row-icon cat">${escapeHtml(initials(x.productName))}</div><div class="row-main"><div class="row-title">${escapeHtml(x.productName)}</div><div class="row-sub">Количество: ${x.qty} шт.</div></div></div>`).join('')}</div>${r.note?`<div class="contact-box"><div class="contact-title">Комментарий</div><div class="row-sub">${escapeHtml(r.note)}</div></div>`:''}</div><div class="sheet-foot"><button class="btn" id="req-send">💬 WhatsApp</button><button class="btn" id="req-status">Статус</button><button class="btn btn-primary" id="req-buy">В закупку</button></div></div></div>`;
  const close=()=>root.innerHTML=''; document.getElementById('req-detail-close').onclick=close; document.getElementById('req-detail-ov').onclick=e=>{if(e.target.id==='req-detail-ov')close();}; document.getElementById('req-send').onclick=()=>sendRequestWhatsApp(id); document.getElementById('req-status').onclick=()=>openRequestStatusPicker(id); document.getElementById('req-buy').onclick=()=>openPurchaseFromRequest(id);
}
function openRequestStatusPicker(id){ const r=procurementRequests.find(x=>x.id===id); if(!r)return; const statuses=[['draft','Черновик'],['sent','Отправлена'],['awaiting','Ждём подтверждение'],['confirmed','Подтверждена'],['completed','Выполнена'],['cancelled','Отменена']]; const root=document.getElementById('modal-root'); root.innerHTML=`<div class="sheet-overlay" id="rs-ov"><div class="sheet"><div class="sheet-head"><div class="sheet-title">Статус заявки</div><button class="sheet-close" id="rs-close">✕</button></div><div class="sheet-body">${statuses.map(x=>`<button class="list-row" style="width:100%;background:none;border:0;text-align:left;" data-status="${x[0]}"><span class="row-main">${x[1]}</span>${r.status===x[0]?'<span class="badge badge-ok">Текущий</span>':''}</button>`).join('')}</div></div></div>`; const close=()=>root.innerHTML=''; document.getElementById('rs-close').onclick=close; document.querySelectorAll('[data-status]').forEach(b=>b.onclick=async()=>{r.status=b.dataset.status;r.updatedAt=new Date().toISOString();await persist('procurementRequests');openProcurementRequestDetail(id);}); }
function openPurchaseFromRequest(id){ const r=procurementRequests.find(x=>x.id===id); if(!r)return; const root=document.getElementById('modal-root'); root.innerHTML=''; openPurchaseModal(r.supplierId, r.items?.[0]?.productId||null, r.items||[] , id); }


// ===== Step 5a: cart infrastructure + calculations =====
function _newCartObject(){
  _cartSeq++;
  return { id:'cart-'+Date.now()+'-'+_cartSeq, name:'Чек '+_cartSeq, items:[], createdAt:(typeof nowISO==='function'?nowISO():new Date().toISOString()) };
}
function _renumberCarts(){
  var _n=1;
  for(var _i=0;_i<_carts.length;_i++){
    if(/^Чек \d+$/.test(_carts[_i].name)) _carts[_i].name='Чек '+(_n++);
  }
}
function _saveCarts(){
  _renumberCarts();
  try{ localStorage.setItem('oni_carts', JSON.stringify({carts:_carts,active:_activeCartId,seq:_cartSeq})); }catch(e){}
}
function _loadCarts(){
  try{
    var raw=localStorage.getItem('oni_carts');
    if(raw){
      var o=JSON.parse(raw);
      if(o && Array.isArray(o.carts) && o.carts.length){
        _carts=o.carts; _activeCartId=o.active; _cartSeq=o.seq||o.carts.length;
        if(!_carts.some(function(c){return c.id===_activeCartId;})) _activeCartId=_carts[0].id;
        return true;
      }
    }
  }catch(e){}
  return false;
}
function _resetCarts(){
  _carts=[]; _cartSeq=0;
  var c=_newCartObject();
  _carts.push(c);
  _activeCartId=c.id;
  _saveCarts();
}

function newCart(){
  var c=_newCartObject();
  _carts.push(c);
  _activeCartId=c.id;
  _saveCarts();
  if(typeof safeRender==='function') safeRender();
}
function switchCart(id){
  if(!_carts.some(function(c){return c.id===id;})) return;
  _activeCartId=id;
  _saveCarts();
  if(typeof renderCartBar==='function') renderCartBar();
  if(typeof safeRender==='function') safeRender();
}
function closeCart(id){
  if(_carts.length<=1) return;
  var c=_carts.find(function(x){return x.id===id;});
  if(!c) return;
  if(c.items.length>0 && !confirm('В чеке есть товары. Закрыть без продажи?')) return;
  _carts=_carts.filter(function(x){return x.id!==id;});
  if(_activeCartId===id) _activeCartId=_carts[0].id;
  _saveCarts();
  if(typeof renderCartBar==='function') renderCartBar();
  if(typeof safeRender==='function') safeRender();
}

function calcDiscount(subtotal){
  const v=Math.max(0,Number(saleDiscountValue)||0);
  if(saleDiscountType==='amount') return Math.min(subtotal,v);
  return Math.min(subtotal,subtotal*v/100);
}
function cartSubtotal(){
  return cart.reduce((s,c)=>{
    const p=products.find(x=>x.id===c.productId);
    return s+(p?(c.price??p.price)*c.qty:0);
  },0);
}
function calcSale(total){
  const discount=calcDiscount(total);
  const afterDiscount=Math.max(0,total-discount);
  const tax=Math.max(0,afterDiscount*(Number(cashSettings.taxRate)||0)/100);
  let commission=0, commissionRate=0;
  if(payMethod==='kaspi'){commissionRate=Number(cashSettings.kaspiPayRate)||0;}
  if(payMethod==='red'){commissionRate=Number(cashSettings.kaspiRedRate)||0;}
  commission=afterDiscount*commissionRate/100;
  const net=afterDiscount-tax-commission;
  return {subtotal:total,discount,afterDiscount,tax,commission,commissionRate,net};
}


// ===== Step 5b: POS view + cart UI + checkout =====
function showPosNotice(msg){
  const root=document.getElementById('pos-notice'); const text=document.getElementById('pos-notice-text');
  if(!root||!text){showToast(msg);return;}
  text.textContent=msg; root.classList.add('show'); clearTimeout(posNoticeTimer);
  posNoticeTimer=setTimeout(()=>root.classList.remove('show'),1800);
}

function viewOrders(){
  if(ordersSubView==='debts' && !isModOn('debts')) ordersSubView='pos';
  if(ordersSubView==='consignment' && !isModOn('consignment')) ordersSubView='pos';
  return `
  <div class="seg-tabs" style="margin-bottom:12px;">
    <button type="button" class="seg-tab ${ordersSubView==='pos'?'active':''}" data-orders-sub="pos">Позиция</button>
    <button type="button" class="seg-tab ${ordersSubView==='history'?'active':''}" data-orders-sub="history">История</button>
    <button type="button" class="seg-tab ${ordersSubView==='debts'?'active':''}" data-orders-sub="debts" style="display:${isModOn('debts')?'':'none'}">Долги</button>
    <button type="button" class="seg-tab ${ordersSubView==='consignment'?'active':''}" data-orders-sub="consignment" style="display:${isModOn('consignment')?'':'none'}">Реализация</button>
  </div>
  ${ordersSubView==='pos'?viewPOS():ordersSubView==='history'?viewOrdersHistory():ordersSubView==='debts'?viewDebts():viewConsignments()}
  `;
}

function viewPOS(){
  if(points && points.length>0){
    if(!currentPointId || !points.some(function(x){return x.id===currentPointId;})){
      var _savedPt = _loadSavedPoint();
      if(_savedPt && points.some(function(x){return x.id===_savedPt;})) currentPointId = _savedPt;
      else currentPointId = (points.find(function(x){return x.isDefault;})||points[0])?.id||null;
    }
  }
  const realProducts=products.filter(p=>!p.isCategoryPlaceholder);
  if(realProducts.length===0){
    return `<button class="btn btn-primary btn-block quick-product-btn" data-quick-product-btn="1" type="button">＋ Быстрый товар</button><div class="panel" style="margin-top:10px;"><div class="panel-body"><div class="empty">Сначала добавьте товары в разделе «Товары»</div></div></div>`;
  }
  const categorySet=[...new Set(realProducts.map(p=>p.category||'Без категории'))].sort((a,b)=>a.localeCompare(b,'ru',{sensitivity:'base'}));
  const categories=['Частые','Все',...categorySet];
  if(!categories.includes(posCategory)) posCategory='Частые';
  const frequentIds=new Set(getFrequentProducts(realProducts).map(p=>p.id));
  const _showCartTabs=_carts.some(function(c){return c.items && c.items.length>0;});
  return `
  <!-- shift-badge removed -->
  <div id="pos-notice" class="pos-notice"><span class="pos-notice-dot"></span><span id="pos-notice-text"></span></div>
  <div id="cart-tabs-root"></div>
  
  <div class="pos-sticky-header"><div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;">
  <div class="search" style="flex:1;margin:0;"><span class="search-icon">⌕</span><input id="pos-search" placeholder="Поиск товара…" value="${escapeHtml(posSearch)}"></div>
  <button class="btn" id="pos-scan-btn" type="button" title="Сканер штрихкода" style="min-width:44px;min-height:44px;padding:0;display:flex;align-items:center;justify-content:center;font-size:18px;">📷</button>
  <button class="btn" id="pos-problematic-btn" type="button" title="Проблемные товары" style="min-width:44px;min-height:44px;padding:0;font-size:18px;">⚠️</button>
  <button class="btn btn-primary quick-product-btn" data-quick-product-btn="1" type="button" title="Быстрый товар" style="min-height:44px;padding:0 12px;font-size:13px;white-space:nowrap;">＋ Быстрый</button>
</div>
  <!-- quick-product-btn перенесён в строку с поиском -->
  <div class="chip-row">
    <button class="chip ${posCategory==='Частые'?'active':''}" data-cat="Частые">⭐ Частые</button>
    <button class="chip ${posCategory==='Все'?'active':''}" data-cat="Все">Все</button>
    <button class="chip ${posCategory!=='Частые'&&posCategory!=='Все'?'active':''}" id="pos-category-toggle" type="button">🏷️ Категории</button>
  </div>
  <div class="chip-row" id="pos-category-list" style="display:${posCategoryOpen?'flex':'none'};margin-top:5px;">
    ${categorySet.length?categorySet.map(c=>`<button class="chip ${posCategory===c?'active':''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join(''):'<span class="form-hint">Категорий пока нет. Добавьте их в разделе «Товары».</span>'}
  </div>
  </div><div class="pos-grid" id="pos-grid">
    ${realProducts.map(p=>`
      <div class="pos-tile live-search-row" data-search-text="${escapeHtml(productSearchText(p))}" data-pos-category="${escapeHtml(p.category||'Без категории')}" data-frequent="${frequentIds.has(p.id)?'1':'0'}">
        <button type="button" class="product-info-btn pos-tile-info" data-product-info="${escapeHtml(p.id)}" aria-label="Информация о товаре">i</button>
        <button type="button" class="pos-tile-main" data-add="${escapeHtml(p.id)}" ${p.qty<=0?'disabled':''}>
          <div class="pos-tile-photo product-pos-photo" data-product-photo="${escapeHtml(p.id)}" title="Нажмите, чтобы увеличить">${productIcon(p,54)}</div>
          <div class="pos-tile-name ${salesTextColor(productSalesQty(p.id))}">${escapeHtml(p.name)}${(isModOn('consignment') && p.isConsignment) ? ' <span class="consignment-badge">реализация</span>' : ''}</div>
          <div class="pos-tile-meta"><span class="pos-tile-price">${fmtMoney(p.price)}</span><span class="pos-tile-stock">${p.qty} ${escapeHtml(p.unit||'шт')}</span></div>
        </button>
      </div>`).join('')}
  </div>
  <div class="empty" id="pos-empty" style="display:none;">Товары не найдены</div>
  `;
}

function viewOrdersHistory(){
  const sorted=[...orders].sort((a,b)=>new Date(b.date)-new Date(a.date));
  return `
  <div class="search" style="margin-bottom:10px;"><span class="search-icon">⌕</span><input id="receipt-search" placeholder="Поиск чека: номер, дата, клиент, товар, штрихкод, сумма, оплата…" value="${escapeHtml(receiptSearch)}"></div>
  <div class="form-hint" style="margin:-3px 0 10px;">Поиск выполняется только по локальной базе чеков. ИИ не используется.</div>
  <div style="display:flex;gap:6px;margin-bottom:8px;"><button class="btn" id="of-save-filter" type="button">💾 Сохранить</button><button class="btn" id="of-open-filters" type="button">⭐ Мои фильтры</button></div>
  <div class="panel">
    ${sorted.length===0?`<div class="panel-body"><div class="empty">Чеков пока нет</div></div>`:sorted.map(o=>`
      <div class="list-row receipt-history-row" data-receipt="${escapeHtml(o.id)}" data-receipt-search="${escapeHtml(receiptSearchText(o))}" style="cursor:pointer;">
        <div class="row-icon cat">${initials(o.customer)}</div>
        <div class="row-main">
          <div class="row-title">${escapeHtml(o.number)} · ${escapeHtml(o.customer)}</div>
          <div class="row-sub">${fmtDateTime(o.date)} · ${(o.items||[]).length} поз.${o.status==='Возврат'?' · возврат':''}${(o.items||[]).some(it=>it.emergencySale)?' · ⚡ быстрый товар':''}${o.pointId?' · '+escapeHtml((points.find(pt=>pt.id===o.pointId)||{}).name||''):''}</div>
        </div>
        <div class="row-right">
          <div class="row-value">${fmtMoney(o.total)}</div>
          <span class="badge ${o.status==='Возврат'?'badge-low':((o.paymentMethod==='kaspi'||o.paymentMethod==='red')?'badge-card':'badge-cash')}">${o.status==='Возврат'?'возврат':paymentLabel(o.paymentMethod)}</span>
          ${getOrderReturnTotal(o)<o.total?`<button class="return-btn" data-return="${o.id}">Возврат</button>`:''}
        </div>
      </div>`).join('')}
  </div>
  `;
}

function bindOrders(){
  document.querySelectorAll('[data-orders-sub]').forEach(function(btn){
    btn.onclick=function(){
      var next=btn.getAttribute('data-orders-sub');
      if(next==='debts'&&!isModOn('debts')){showToast('Модуль «Долги» выключен');return;}
      if(next==='consignment'&&!isModOn('consignment')){showToast('Модуль «Реализация» выключен');return;}
      ordersSubView=next;
      saveUiState();
      safeRender();
    };
  });
  var ofSave=document.getElementById('of-save-filter'); if(ofSave)ofSave.onclick=function(){openSaveFilterDialog('orders');};
  var ofOpen=document.getElementById('of-open-filters'); if(ofOpen)ofOpen.onclick=function(){openSavedFiltersDialog('orders');};
  const receiptInput=document.getElementById('receipt-search');
  const applyReceiptSearch=()=>{receiptSearch=receiptInput?.value||'';const q=receiptSearch.trim().toLowerCase();let visible=0;document.querySelectorAll('.receipt-history-row').forEach(row=>{const show=!q||smartProductSearch(String(row.dataset.receiptSearch||''),q);row.style.display=show?'':'none';if(show)visible++;});let empty=document.getElementById('receipt-search-empty');if(!empty){empty=document.createElement('div');empty.id='receipt-search-empty';empty.className='panel-body';empty.innerHTML='<div class="empty">По вашему запросу чеков не найдено</div>';document.querySelector('.panel')?.appendChild(empty);}empty.style.display=(q&&visible===0)?'':'none';};
  if(receiptInput) receiptInput.oninput=applyReceiptSearch;
  applyReceiptSearch();
  document.querySelectorAll('[data-receipt]').forEach(b=>b.onclick=e=>{
    if(e.target.closest('[data-return]')) return;
    const order=orders.find(o=>o.id===b.dataset.receipt); if(order)openReceiptModal(order);
  });
  document.querySelectorAll('[data-return]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const order=orders.find(o=>o.id===b.dataset.return); if(order)openReturnModal(order);
  });
  document.querySelectorAll('[data-debt-pay]').forEach(b=>b.onclick=()=>payDebt(b.dataset.debtPay));
  document.querySelectorAll('[data-consignment-pay]').forEach(b=>b.onclick=()=>markConsignmentSettled(b.dataset.consignmentPay));

  const applyPosFilters=()=>{
    const input=document.getElementById('pos-search');
    const q=String(input?.value||'').trim();
    posSearch=input?.value||'';
    let visible=0;
    document.querySelectorAll('#pos-grid .live-search-row').forEach(row=>{
      const text=String(row.dataset.searchText||'');
      const inCategory = posCategory==='Частые'
      ? row.dataset.frequent==='1'
      : (posCategory==='Все' ? true : row.dataset.posCategory===posCategory);
      const show=(q ? smartProductSearch(text,q) : inCategory);
      row.style.display=show?'':'none';
      if(show) visible++;
    });
    const empty=document.getElementById('pos-empty'); if(empty) empty.style.display=visible?'none':'';
    document.querySelectorAll('[data-cat]').forEach(b=>b.classList.toggle('active',b.dataset.cat===posCategory));
  };
  const posInput=document.getElementById('pos-search');
  if(posInput) posInput.oninput=applyPosFilters;
  const categoryToggle=document.getElementById('pos-category-toggle');
  if(categoryToggle) categoryToggle.onclick=()=>{posCategoryOpen=!posCategoryOpen; const list=document.getElementById('pos-category-list'); if(list) list.style.display=posCategoryOpen?'flex':'none';};
  document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{posCategory=b.dataset.cat;posCategoryOpen=posCategory!=='Частые';applyPosFilters(); const list=document.getElementById('pos-category-list'); if(list) list.style.display=posCategoryOpen?'flex':'none';});
  applyPosFilters();
  document.querySelectorAll('#pos-grid [data-product-info]').forEach(b=>b.onclick=e=>{
    e.preventDefault(); e.stopPropagation(); confirmProductInfo(b.dataset.productInfo);
  });
  document.querySelectorAll('[data-quick-product-btn]').forEach(quickProductBtn=>{quickProductBtn.onclick=()=>openProductModal(null,{quick:true,quickQty:1});});
  const posScanBtn=document.getElementById('pos-scan-btn');
  if(posScanBtn) posScanBtn.onclick=()=>{ if(window.Android&&typeof Android.scanBarcode==='function') Android.scanBarcode(); else showToast('Сканер штрихкода недоступен'); };
  const posPointSel=document.getElementById('pos-point');
  // pos-point удалён из viewPOS, onchange не нужен
  const problematicBtn=document.getElementById('pos-problematic-btn');
  if(problematicBtn) problematicBtn.onclick=()=>openProblematicScreen();

  document.querySelectorAll('[data-add]').forEach(b=>{
    let longPressTimer=null,longPressed=false;
    const cancelLongPress=()=>{if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null;}};
    const fireLongPress=()=>{longPressed=true;cancelLongPress();openFavContextMenu(b.dataset.add);};
    b.addEventListener('pointerdown',()=>{longPressed=false;cancelLongPress();longPressTimer=setTimeout(fireLongPress,550);});
    b.addEventListener('pointerup',e=>{cancelLongPress();if(longPressed){e.preventDefault();e.stopPropagation();}});
    b.addEventListener('pointercancel',cancelLongPress);
    b.addEventListener('contextmenu',e=>{e.preventDefault();cancelLongPress();openFavContextMenu(b.dataset.add);});
    b.onclick=e=>{
      if(longPressed){e.preventDefault();e.stopPropagation();longPressed=false;return;}
      const id=b.dataset.add,p=products.find(x=>x.id===id);if(!p)return;
      const line=cart.find(c=>c.productId===id);
      if(line){if(line.emergencySale || line.qty<p.qty)line.qty++;}else cart.push({productId:id,qty:1,price:p.price,emergencySale:false});
      renderCartBar();feedbackAddToCart();showPosNotice(`${p.name} добавлен в чек`);
    };
  });
  // Тап по фото в POS-плитке открывает лайтбокс, а не добавляет товар.
  document.querySelectorAll('#pos-grid [data-product-photo]').forEach(el=>{
    el.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      const p=products.find(x=>x.id===el.dataset.productPhoto); if(!p) return;
      const src=p.mainPhoto||p.photo||(Array.isArray(p.photos)?p.photos[0]:'');
      if(!src) return;
      const gallery=Array.isArray(p.photos)&&p.photos.length?p.photos:(p.photo?[p.photo]:[src]);
      const idx=Math.max(0,gallery.indexOf(src));
      openProductPhotoLightbox(src,p.name||'Фото товара',gallery,idx);
    };
  });

  // Долгий тап на плитке [data-add] в POS → контекстное меню
  document.querySelectorAll('#pos-grid [data-add]').forEach(function(btn){
    var timer=null;
    var longPressed=false;
    var cancel=function(){ if(timer){clearTimeout(timer);timer=null;} };
    var fire=function(){ longPressed=true; cancel(); openFavContextMenu(btn.dataset.add); };
    btn.addEventListener('pointerdown',function(){ longPressed=false; cancel(); timer=setTimeout(fire,550); });
    btn.addEventListener('pointerup',function(e){ cancel(); if(longPressed){e.preventDefault();e.stopPropagation();} });
    btn.addEventListener('pointercancel',cancel);
    btn.addEventListener('touchstart',function(){ if(timer)return; longPressed=false; timer=setTimeout(fire,550); },{passive:true});
    btn.addEventListener('touchend',function(e){ cancel(); if(longPressed){e.preventDefault();e.stopPropagation();} },{passive:false});
    btn.addEventListener('touchcancel',cancel);
    btn.addEventListener('contextmenu',function(e){ e.preventDefault(); cancel(); openFavContextMenu(btn.dataset.add); });
  });

  const addDebt=document.getElementById('add-debt'); if(addDebt)addDebt.onclick=()=>openDebtModal();
  const addCons=document.getElementById('add-consignment'); if(addCons)addCons.onclick=()=>openConsignmentModal();
  bindLiveSearch('debt-search','.live-search-row');
  bindLiveSearch('consignment-search','.live-search-row');
}

function renderCartTabs(){
  var root = document.getElementById('cart-tabs-root');
  if(!root) return;
  if(currentView!=='orders' || ordersSubView!=='pos'){ root.innerHTML=''; root.style.display='none'; return; }
  var _show = _carts.some(function(c){ return c.items && c.items.length > 0; });
  if(!_show){ root.innerHTML=''; root.style.display='none'; return; }
  root.style.display = 'flex';
  root.style.gap = '6px';
  root.style.overflowX = 'auto';
  root.style.marginBottom = '8px';
  root.style.paddingBottom = '2px';
  var html = _carts.map(function(c){
    var _act = c.id === _activeCartId;
    var _cnt = c.items.length ? ' · ' + c.items.length : '';
    var _x = (_carts.length > 1) ? '<span data-cart-close="' + c.id + '" style="opacity:.65;font-size:14px;line-height:1;">×</span>' : '';
    var _b = 'position:relative;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:9px;font-size:12px;font-weight:600;white-space:nowrap;flex-shrink:0;';
    _b += 'border:1px solid ' + (_act ? 'var(--primary)' : 'var(--border)') + ';';
    _b += 'background:' + (_act ? 'var(--primary)' : '#fff') + ';';
    _b += 'color:' + (_act ? '#fff' : 'var(--text)') + ';';
    return '<button type="button" class="cart-tab" data-cart-switch="' + c.id + '" style="' + _b + '">' + escapeHtml(c.name) + _cnt + _x + '</button>';
  }).join('');
  html += '<button type="button" data-cart-new style="display:inline-flex;align-items:center;padding:7px 12px;border-radius:9px;border:1px dashed var(--border);background:#fff;font-size:12px;color:var(--dim);white-space:nowrap;flex-shrink:0;">+ Чек</button>';
  root.innerHTML = html;
}

function renderCartBar(){
  renderCartTabs();
  const root=document.getElementById('cart-bar-root');
  if(currentView!=='orders' || ordersSubView!=='pos' || cart.length===0){ root.innerHTML=''; return; }
  const cartLines=cart.map(c=>{ const p=products.find(x=>x.id===c.productId); return p?{...c,product:p}:null; }).filter(Boolean);
  const total=cartLines.reduce((s,l)=>s+(l.price??l.product.price)*l.qty,0);
  const discount=calcDiscount(total);
  const finalTotal=Math.max(0,total-discount);
  root.innerHTML=`
  <div class="cart-bar-wrap">
    <div class="cart-bar" id="open-cart">
      <div>
        <div class="cart-bar-info">${cartLines.length} товар(ов) в чеке</div>
        <div class="cart-bar-total">${fmtMoney(finalTotal)}</div>
      </div>
      <button class="cart-bar-btn" id="open-cart-btn">Оформить</button>
    </div>
  </div>`;
  const openFn=()=>openCartSheet();
  document.getElementById('open-cart-btn').onclick=openFn;
  document.getElementById('open-cart').onclick=openFn;
}

function openCartSheet(){
  if(!requireAccess('orders')) return;
  const root=document.getElementById('modal-root');
  renderCartSheetContent(root);
}

function renderCartSheetContent(root){
  if(payMethod==='gift' && !isModOn('giftcards')) payMethod='cash';
  if(payMethod==='debt' && !isModOn('debts')) payMethod='cash';
  const cartLines=cart.map(c=>{ const p=products.find(x=>x.id===c.productId); return p?{...c,product:p,lineTotal:(c.price??p.price)*c.qty}:{...c,product:null,orphan:true}; });
  const total=cartLines.reduce((s,l)=>s+l.lineTotal,0);
  const calc=calcSale(total);
  root.innerHTML=`
  <div class="sheet-overlay" id="ov">
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-head"><div class="sheet-title">Текущий чек</div><button class="sheet-close" id="mc">✕</button></div>
      <div class="sheet-body">
        <div class="cart-items">
          ${cartLines.length===0?`<div class="empty">Чек пуст</div>`:cartLines.map(l=>l.orphan?`
            <div class="cart-item">
              <div class="cart-item-name" style="color:var(--danger);">Товар удалён<span class="sku">${escapeHtml(l.productId||'')}</span></div>
              <div class="cart-item-total">—</div>
              <button class="cart-item-remove" data-remove="${l.productId}">✕</button>
            </div>`:`
            <div class="cart-item">
              <div class="cart-item-name">${escapeHtml(l.product.name)}${(Number(l.product.price)>0 && Number(l.price)>0 && Number(l.price)<Number(l.product.price))?` <span style="background:#FEE2E2;color:#991B1B;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;">−${Math.round((1-Number(l.price)/Number(l.product.price))*100)}%</span>`:''}<span class="sku">${escapeHtml(l.product.sku)}</span></div>
              <div class="qty-stepper">
                <button class="qty-btn" data-dec="${l.productId}">−</button>
                <span class="qty-val">${l.qty}</span>
                <button class="qty-btn" data-inc="${l.productId}" ${l.qty>=l.product.qty?'disabled':''}>+</button>
              </div>
              <input class="price-edit" type="number" min="0" step="1" value="${l.price??l.product.price}" data-price="${l.productId}" title="Розничная цена в этом чеке">
              <div class="cart-item-total">${fmtMoney(l.lineTotal)}</div>
              <button class="cart-item-remove" data-remove="${l.productId}">✕</button>
            </div>`).join('')}
        </div>

        <div class="contact-box">
          <div class="contact-title">Клиент</div>
          <div class="form-field"><div class="search" style="margin:0 0 7px;"><span class="search-icon">⌕</span><input class="form-input" id="pos-client-search" placeholder="Поиск клиента: имя, телефон, WhatsApp…"></div><div id="pos-client-results" class="client-search-results"></div><select class="form-select" id="pos-client" style="display:none;"><option value="">Розничный клиент / новый</option>${getClientContacts().map(c=>`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name||'Без имени')}${c.whatsapp?' · '+escapeHtml(c.whatsapp):''}</option>`).join('')}</select></div>
          <button class="btn" id="pos-new-client" type="button" style="margin-bottom:8px;">+ Новый клиент</button>
          <div class="form-grid2">
            <div class="form-field"><label class="form-label">Имя клиента</label><input class="form-input" id="pos-customer" placeholder="Имя"></div>
            <div class="form-field"><label class="form-label">WhatsApp</label><input class="form-input" id="pos-whatsapp" placeholder="+7 777 123 45 67"></div>
          </div>
        </div>

        <div class="contact-box">
          <div class="contact-title">Комментарий к чеку</div>
          <textarea class="form-input" id="sale-comment" rows="2" placeholder="Комментарий к продаже…">${escapeHtml(saleComment)}</textarea>
        </div>

        <div class="pay-toggle">
          <button class="pay-btn ${payMethod==='cash'?'active':''}" data-pay="cash">Наличный</button>
          <button class="pay-btn ${payMethod==='kaspi'?'active':''}" data-pay="kaspi">Kaspi Pay</button>
          <button class="pay-btn ${payMethod==='red'?'active':''}" data-pay="red">Kaspi Red</button>
          <button class="pay-btn ${payMethod==='transfer'?'active':''}" data-pay="transfer">Перевод</button>
          <button class="pay-btn ${payMethod==='halyk'?'active':''}" data-pay="halyk">Halyk POS</button>
          ${isModOn('giftcards') ? `<button class="pay-btn ${payMethod==='gift'?'active':''}" data-pay="gift">🎁 Сертификат</button>` : ''}
          ${isModOn('debts') ? `<button class="pay-btn ${payMethod==='debt'?'active':''}" data-pay="debt">Долг</button>` : ''}
        </div>
        ${payMethod==='gift'?`<div class="contact-box" style="background:#FFF9E5;border-color:#F0E0A8;"><div class="contact-title" style="color:#8B6914;">Подарочный сертификат</div><div class="form-field" style="margin:0 0 8px;"><label class="form-label">Код сертификата</label><input class="form-input" id="sale-gift-code" placeholder="XXXX-XXXX-XXXX" style="font-family:var(--mono);text-transform:uppercase;"></div><div class="form-field" style="margin:0 0 8px;"><label class="form-label">Списать с сертификата, ₸</label><input class="form-input" id="sale-gift-amount" type="number" min="0" step="1" value="0"></div><div class="form-hint" style="margin-top:8px;color:var(--muted);" id="sale-gift-status">Введите код сертификата</div><div class="form-hint" style="margin-top:6px;color:var(--muted);" id="sale-gift-rest">Остаток к оплате другим способом: ${fmtMoney(calc.afterDiscount)}</div><div style="margin-top:10px;"><div class="form-label">Способ доплаты остатка</div><div class="pay-toggle" id="gift-rest-toggle" style="flex-wrap:wrap;"><button type="button" class="pay-btn ${giftRestMethod==='cash'?'active':''}" data-gift-rest="cash">Наличные</button><button type="button" class="pay-btn ${giftRestMethod==='kaspi'?'active':''}" data-gift-rest="kaspi">Kaspi</button><button type="button" class="pay-btn ${giftRestMethod==='red'?'active':''}" data-gift-rest="red">Kaspi Red</button><button type="button" class="pay-btn ${giftRestMethod==='transfer'?'active':''}" data-gift-rest="transfer">Перевод</button></div></div></div>`:''}

        <div class="contact-box">
          <div class="contact-title">Скидка</div>
          <div class="discount-toggle">
            <button class="discount-btn ${saleDiscountType==='percent'?'active':''}" data-discount-type="percent">Процент %</button>
            <button class="discount-btn ${saleDiscountType==='amount'?'active':''}" data-discount-type="amount">Сумма ₸</button>
          </div>
          <input class="form-input" id="sale-discount" type="number" min="0" step="0.01" value="${saleDiscountValue}" placeholder="${saleDiscountType==='percent'?'Например 10':'Например 1000'}">
        </div>

        ${payMethod==='debt'?`
        <div class="contact-box">
          <div class="contact-title">Контактные данные должника</div>
          <div class="form-grid2">
            <div class="form-field"><label class="form-label">Телефон</label><input class="form-input" id="debt-phone" placeholder="+7"></div>
            <div class="form-field"><label class="form-label">WhatsApp</label><input class="form-input" id="debt-whatsapp" placeholder="+7"></div>
          </div>
          <div class="form-grid2">
            <div class="form-field"><label class="form-label">Срок оплаты</label><input class="form-input" type="date" id="debt-due" value="${todayISO()}"></div>
            <div class="form-field"><label class="form-label">Комментарий</label><input class="form-input" id="debt-note" placeholder="Условия оплаты…"></div>
          </div>
        </div>`:''}

        <div class="calc-box">
          <div class="calc-row"><span>Товары</span><strong>${fmtMoney(calc.subtotal)}</strong></div>
          <div class="calc-row"><span>Скидка</span><strong>− ${fmtMoney(calc.discount)}</strong></div>
          <div class="calc-row"><span>После скидки</span><strong>${fmtMoney(calc.afterDiscount)}</strong></div>
          <div class="calc-row"><span>Налог ${Number(cashSettings.taxRate)||0}%</span><strong>− ${fmtMoney(calc.tax)}</strong></div>
          ${calc.commissionRate>0?`<div class="calc-row"><span>Комиссия ${paymentLabel(payMethod)} ${calc.commissionRate}%</span><strong>− ${fmtMoney(calc.commission)}</strong></div>`:''}
          <div class="calc-row final"><span>Чистыми после налога/комиссии</span><strong>${fmtMoney(calc.net)}</strong></div>
        </div>

        ${(isModOn('bonuses') && cashSettings.bonusEnabled)?`<div class="contact-box" style="background:#FFF9E5;border-color:#F0E0A8;"><div class="contact-title" style="color:#8B6914;">Бонусы клиента</div><div class="form-hint" style="color:var(--muted);margin-bottom:8px;" id="bonus-available">Выберите клиента, чтобы увидеть доступные бонусы</div><div class="form-grid2"><div class="form-field" style="margin-bottom:0;"><label class="form-label">Списать бонусов</label><input class="form-input" id="sale-bonus-use" type="number" min="0" step="1" value="0"></div><div class="form-field" style="margin-bottom:0;"><label class="form-label">Максимум</label><input class="form-input" id="sale-bonus-max" type="number" value="0" readonly></div></div></div>`:''}
        <div class="total-row"><span class="label">Итого к оплате</span><span class="value">${fmtMoney(calc.afterDiscount)}</span></div>
      </div>
      <div class="sheet-foot"><button class="btn btn-primary btn-block" id="checkout" ${cart.length===0?'disabled':''}>Оформить продажу</button></div>
    </div>
  </div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('mc').onclick=close;
  document.getElementById('ov').addEventListener('click',e=>{ if(e.target.id==='ov') close(); });
  const saleCommentInput=document.getElementById('sale-comment');
  if(saleCommentInput) saleCommentInput.oninput=e=>{ saleComment=e.target.value; };

  document.querySelectorAll('[data-inc]').forEach(b=>{
    b.onclick=()=>{ const line=cart.find(c=>c.productId===b.dataset.inc); const p=products.find(x=>x.id===b.dataset.inc);
      if(line && (line.emergencySale || line.qty<p.qty)) line.qty++; renderCartSheetContent(root); renderCartBar(); };
  });
  document.querySelectorAll('[data-dec]').forEach(b=>{
    b.onclick=()=>{ const line=cart.find(c=>c.productId===b.dataset.dec);
      if(line){ line.qty--; if(line.qty<=0) cart=cart.filter(c=>c.productId!==b.dataset.dec); }
      renderCartSheetContent(root); renderCartBar(); };
  });
  document.querySelectorAll('[data-remove]').forEach(b=>{
    b.onclick=()=>{ cart=cart.filter(c=>c.productId!==b.dataset.remove); renderCartSheetContent(root); renderCartBar(); };
  });
  document.querySelectorAll('[data-price]').forEach(input=>{
    input.onchange=()=>{
      const line=cart.find(c=>c.productId===input.dataset.price);
      const value=Math.max(0,Number(input.value)||0);
      if(line) line.price=value;
      renderCartSheetContent(root); renderCartBar();
    };
  });
  const clientSelect=document.getElementById('pos-client');
  const clientName=document.getElementById('pos-customer');
  const clientWhatsApp=document.getElementById('pos-whatsapp');
  if(clientSelect) clientSelect.onchange=()=>{
    const c=contacts.find(x=>x.id===clientSelect.value);
    if(c){if(clientName)clientName.value=c.name||'';if(clientWhatsApp)clientWhatsApp.value=c.whatsapp||c.phone||'';}
  };
  const clientSearchInput=document.getElementById('pos-client-search');
  const clientResults=document.getElementById('pos-client-results');
  const renderClientResults=()=>{
    if(!clientSearchInput||!clientResults)return;
    const q=clientSearchInput.value.trim().toLowerCase();
    const rows=getClientContacts().filter(c=>!q || `${c.name||''} ${c.phone||''} ${c.whatsapp||''} ${c.company||''}`.toLowerCase().includes(q));
    clientResults.innerHTML=rows.slice(0,30).map(c=>`<button type="button" class="list-row" style="width:100%;text-align:left;background:none;border:0;cursor:pointer;" data-pos-client-pick="${escapeHtml(c.id)}"><div class="row-icon cat">${escapeHtml(initials(c.name||c.company||''))}</div><div class="row-main"><div class="row-title">${escapeHtml(c.name||'Без имени')}</div><div class="row-sub">${escapeHtml(c.phone||c.whatsapp||c.company||'Контакт не указан')}</div></div></button>`).join('') || (q?'<div class="form-hint">Клиент не найден</div>':'<div class="form-hint">Начните вводить имя, телефон или WhatsApp</div>');
    clientResults.querySelectorAll('[data-pos-client-pick]').forEach(b=>b.onclick=()=>{
      const c=getClient(b.dataset.posClientPick); if(!c)return;
      if(clientSelect)clientSelect.value=c.id;
      if(clientName)clientName.value=c.name||'';
      if(clientWhatsApp)clientWhatsApp.value=c.whatsapp||c.phone||'';
      clientSearchInput.value=c.name||'';
      clientResults.innerHTML='';
    });
  };
  if(clientSearchInput){ clientSearchInput.oninput=renderClientResults; renderClientResults(); }
  const newClient=document.getElementById('pos-new-client'); if(newClient)newClient.onclick=()=>openClientModal();
  document.querySelectorAll('[data-pay]').forEach(b=>{
    b.onclick=()=>{ payMethod=b.dataset.pay; renderCartSheetContent(root); };
  });
  document.querySelectorAll('[data-discount-type]').forEach(b=>{
    b.onclick=()=>{saleDiscountType=b.dataset.discountType;renderCartSheetContent(root);};
  });
  const discountInput=document.getElementById('sale-discount');
  if(discountInput) discountInput.oninput=e=>{
    saleDiscountValue=Math.max(0,Number(e.target.value)||0);
    const calc=calcSale(cart.reduce((sum,l)=>sum+(Number(l.price)||0)*(Number(l.qty)||0),0));
    const box=root.querySelector('.calc-box');
    const totalRow=root.querySelector('.total-row');
    if(box){
      const rows=box.querySelectorAll('.calc-row');
      if(rows[1]) rows[1].querySelector('strong').textContent='− '+fmtMoney(calc.discount);
      if(rows[2]) rows[2].querySelector('strong').textContent=fmtMoney(calc.afterDiscount);
      const taxIndex=3; if(rows[taxIndex]) rows[taxIndex].querySelector('strong').textContent='− '+fmtMoney(calc.tax);
      const commissionIndex=calc.commissionRate>0?4:-1; if(commissionIndex>=0&&rows[commissionIndex]) rows[commissionIndex].querySelector('strong').textContent='− '+fmtMoney(calc.commission);
      const final=box.querySelector('.calc-row.final'); if(final) final.querySelector('strong').textContent=fmtMoney(calc.net);
    }
    if(totalRow) totalRow.querySelector('.value').textContent=fmtMoney(calc.afterDiscount);
    renderCartBar();
  };
  let saleBonusUse=0;
  const bonusInput=document.getElementById('sale-bonus-use');
  const bonusMaxInput=document.getElementById('sale-bonus-max');
  const bonusAvailableEl=document.getElementById('bonus-available');
  const recalcBonusMax=()=>{
    const cli=contacts.find(x=>x.id===(clientSelect?.value||''));
    const bal=cli?(Number(cli.bonusBalance)||0):0;
    const cap=Math.floor(calc.afterDiscount*Number(cashSettings.bonusMaxPayPercent||0)/100);
    const mx=Math.min(bal,cap);
    if(bonusMaxInput) bonusMaxInput.value=mx;
    if(bonusAvailableEl) bonusAvailableEl.textContent=cli?`Доступно бонусов: ${bal.toFixed(0)} (макс. к списанию ${mx})`:'Выберите клиента, чтобы увидеть доступные бонусы';
    if(bonusInput) bonusInput.max=mx;
  };
  if(clientSelect) clientSelect.addEventListener('change',recalcBonusMax);
  if(clientName) clientName.addEventListener('input',recalcBonusMax);
  if(clientWhatsApp) clientWhatsApp.addEventListener('input',recalcBonusMax);
  if(bonusInput) bonusInput.oninput=()=>{ saleBonusUse=Math.max(0,Math.min(Number(bonusInput.value)||0,Number(bonusMaxInput?.value)||0)); if(Number(bonusInput.value)!==saleBonusUse) bonusInput.value=saleBonusUse; };
  recalcBonusMax();
  if(payMethod==='gift'){
    const giftEl=document.getElementById('sale-gift-code');
    const giftAmountEl=document.getElementById('sale-gift-amount');
    const giftStatus=document.getElementById('sale-gift-status');
    const giftRestEl=document.getElementById('sale-gift-rest');
    const updateGiftInfo=()=>{
      const card=giftCardFindByCode(giftEl?.value||'');
      const maxTotal=Math.max(0,calc.afterDiscount);
      let maxSpend=0;
      if(card && giftCardStatus(card)==='active') maxSpend=Math.min(card.amount-card.used,maxTotal);
      const wanted=Number(giftAmountEl?.value)||0;
      if(giftAmountEl){ if(!giftEl?.value.trim() || !card || giftCardStatus(card)!=='active'){ giftAmountEl.value=maxSpend||0; } else if(!giftAmountEl.matches(':focus') && wanted===0){ giftAmountEl.value=maxSpend; } giftAmountEl.max=maxSpend; }
      const spend=Math.max(0,Math.min(Number(giftAmountEl?.value)||0,maxSpend));
      if(giftAmountEl && Number(giftAmountEl.value)!==spend) giftAmountEl.value=spend;
      if(giftRestEl) giftRestEl.textContent=`Остаток к оплате другим способом: ${fmtMoney(Math.max(0,maxTotal-spend))}`;
      if(!card){ giftStatus.textContent='Сертификат не найден'; giftStatus.style.color='var(--danger)'; return; }
      const st=giftCardStatus(card);
      if(st==='used'){ giftStatus.textContent='Сертификат уже использован'; giftStatus.style.color='var(--danger)'; return; }
      if(st==='expired'){ giftStatus.textContent='Срок сертификата истёк'; giftStatus.style.color='var(--danger)'; return; }
      giftStatus.textContent=`Доступно: ${fmtMoney(card.amount-card.used)}. Введите сумму к списанию до ${fmtMoney(maxTotal<card.amount-card.used?maxTotal:card.amount-card.used)}`; giftStatus.style.color='var(--primary-dark)';
    };
    if(giftEl) giftEl.oninput=updateGiftInfo;
    if(giftAmountEl) giftAmountEl.oninput=updateGiftInfo;
    document.querySelectorAll('[data-gift-rest]').forEach(b=>b.onclick=()=>{ giftRestMethod=b.dataset.giftRest; renderCartSheetContent(root); });
    updateGiftInfo();
  }
  const checkoutBtn=document.getElementById('checkout');
  if(checkoutBtn) checkoutBtn.onclick=checkoutCart;
}

async function checkoutCart(){
  if(!requireAccess('orders')) return;
  if(cart.length===0)return;

  const whId = ((points.find(x=>x.id===currentPointId)||{}).warehouseId) || 'wh-default';
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
    const salePrice=Number(c.price??p.price)||0;
    if(salePrice<0){showToast('Цена не может быть отрицательной');return;}
  }
  const customerInput=document.getElementById('pos-customer'), whatsappInput=document.getElementById('pos-whatsapp'), clientSelect=document.getElementById('pos-client');
  const selectedClient=clientSelect?.value ? contacts.find(c=>c.id===clientSelect.value) : null;
  const customer=(customerInput&&customerInput.value.trim())||selectedClient?.name||'Розничный клиент';
  const whatsapp=(whatsappInput&&whatsappInput.value.trim())||selectedClient?.whatsapp||selectedClient?.phone||'';
  let linkedClient=selectedClient;
  if(!linkedClient && (customerInput?.value.trim() || whatsapp)){linkedClient=findOrCreateContact({name:customer,phone:whatsapp,whatsapp,type:'client'});await persist('contacts');}
  const date=todayISO(),orderDate=nowISO(),number='Ч-'+String(meta.orderSeq).padStart(4,'0'),orderId=uid();
  const preparedItems=cart.map(c=>{const p=products.find(x=>x.id===c.productId);const salePrice=Number(c.price??p.price)||0;const originalPrice=Number(p.price)||0;const activeConsignment=consignments.filter(x=>x.productId===p.id&&x.status==='open').sort((a,b)=>new Date(b.date)-new Date(a.date))[0]||null;return {productId:p.id,name:p.name,sku:p.sku,qty:c.qty,price:salePrice,originalPrice,cost:p.cost,emergencySale:!!c.emergencySale,isConsignment:!!activeConsignment,supplierCost:activeConsignment?.supplierCost||0,supplierName:activeConsignment?.supplierName||''};});
  const subtotal=preparedItems.reduce((s,it)=>s+it.price*it.qty,0),calc=calcSale(subtotal);
  const bonusUse=isModOn('bonuses')&&cashSettings.bonusEnabled?Math.max(0,Math.min(Number(document.getElementById('sale-bonus-use')?.value)||0,calc.afterDiscount)):0;
  const total=Math.max(0,calc.afterDiscount-bonusUse);
  const order={id:orderId,number,date:orderDate,customer,status:payMethod==='debt'?'Долг':'Оплачен',cashierId:activeUser?.id||null,cashierName:activeUser?.name||'',shiftId:currentShiftId||null,items:preparedItems,total,subtotal,discount:calc.discount,discountType:saleDiscountType,discountValue:saleDiscountValue,taxRate:Number(cashSettings.taxRate)||0,taxAmount:calc.tax,commissionRate:calc.commissionRate,commissionAmount:calc.commission,netAmount:calc.net,paymentMethod:payMethod,returns:[],whatsapp,contactId:linkedClient?.id||null,comment:saleComment.trim(),bonusUsed:bonusUse};
  order.consignmentPayable=preparedItems.reduce((s,it)=>s+(it.isConsignment?it.supplierCost*it.qty:0),0);order.consignmentProfit=preparedItems.reduce((s,it)=>s+(it.isConsignment?(it.price-it.supplierCost)*it.qty:0),0);
  if(customer!=='Розничный клиент'||whatsapp){const contact=findOrCreateContact({name:customer,phone:whatsapp,whatsapp,type:'client'});order.contactId=contact.id;order.whatsapp=contact.whatsapp||whatsapp;}
  if(payMethod==='debt'){const phone=document.getElementById('debt-phone')?.value.trim()||'',debtWhatsapp=document.getElementById('debt-whatsapp')?.value.trim()||phone,dueDate=document.getElementById('debt-due')?.value||'',note=document.getElementById('debt-note')?.value.trim()||'';const contact=findOrCreateContact({name:customer,phone,whatsapp:debtWhatsapp,type:'client'});debts.push({id:uid(),orderId,number,customer,contactId:contact.id,phone,whatsapp:debtWhatsapp,amount:total,paid:0,remaining:total,date,dueDate,note,status:'open',payments:[]});}
  if(payMethod==='gift'){
    const code=(document.getElementById('sale-gift-code')?.value||'').trim();
    const card=giftCardFindByCode(code);
    if(!card){ showToast('Сертификат не найден'); return; }
    const st=giftCardStatus(card);
    if(st!=='active'){ showToast('Сертификат неактивен'); return; }
    const bal=card.amount-card.used;
    const wanted=Math.max(0,Number(document.getElementById('sale-gift-amount')?.value)||0);
    const spendFromCard=Math.min(bal,total,wanted);
    if(spendFromCard<=0){ showToast('Укажите сумму к списанию'); return; }
    const rest=total-spendFromCard;
    if(rest>0 && (giftRestMethod==='kaspi'||giftRestMethod==='red')){
      if(!(window.Android&&typeof window.Android.startKaspiPayment==='function')){showToast('Smart POS доступен только в Android-приложении');return;}
      if(!kaspiSettings.host||!kaspiSettings.terminalId){openKaspiSettings(true);showToast('Сначала настройте Smart POS');return;}
    }
    order.paymentSplits=[
      {method:'gift',amount:spendFromCard,cardId:card.id,cardCode:card.code},
      ...(rest>0?[{method:giftRestMethod,amount:rest}]:[])
    ];
    order.giftCardId=card.id;
    order.giftCardCode=card.code;
    order.giftCardSpent=spendFromCard;
    if(rest>0 && (giftRestMethod==='kaspi'||giftRestMethod==='red')){
      pendingKaspiSale={order,expectedMethod:giftRestMethod,restAmount:rest,giftCardId:card.id,giftCardSpent:spendFromCard};showKaspiPaymentWaiting(rest,giftRestMethod);
      window.Android.startKaspiPayment(String(rest),String(giftRestMethod),String(kaspiSettings.host),String(kaspiSettings.port||8080),String(kaspiSettings.terminalId),String(kaspiSettings.cashierName||'On.i CRM'),!!kaspiSettings.verifyCertificate);
      return;
    }
    await finalizePreparedSale(order);
    return;
  }
  if(payMethod==='kaspi'||payMethod==='red'){
    if(!(window.Android&&typeof window.Android.startKaspiPayment==='function')){showToast('Smart POS доступен только в Android-приложении');return;}
    if(!kaspiSettings.host||!kaspiSettings.terminalId){openKaspiSettings(true);showToast('Сначала укажите IP/имя Smart POS и ID терминала');return;}
    pendingKaspiSale={order,expectedMethod:payMethod};showKaspiPaymentWaiting(total,payMethod);
    window.Android.startKaspiPayment(String(total),String(payMethod),String(kaspiSettings.host),String(kaspiSettings.port||8080),String(kaspiSettings.terminalId),String(kaspiSettings.cashierName||'On.i CRM'),!!kaspiSettings.verifyCertificate);return;
  }

  if(payMethod==='halyk'){
    if(!(window.Android&&typeof window.Android.startHalykPayment==='function')){showToast('Halyk POS dostupen tolko v Android-prilozhenii');return;}
    if(!halykSettings.host||!halykSettings.terminalId){openHalykSettings(true);showToast('Nastroyte Halyk POS: IP i Terminal ID');return;}
    pendingHalykSale={order};
    if(typeof showHalykPaymentWaiting==='function') showHalykPaymentWaiting(total);
    window.Android.startHalykPayment(String(halykSettings.host),String(halykSettings.port||8080),String(total),String(halykSettings.terminalId));
    return;
  }

  await finalizePreparedSale(order);
}

async function finalizePreparedSale(order){
  const date=order.date,number=order.number,orderId=order.id;
  const snapshot={products:JSON.parse(JSON.stringify(products)),movements:JSON.parse(JSON.stringify(movements)),orders:JSON.parse(JSON.stringify(orders)),debts:JSON.parse(JSON.stringify(debts)),contacts:JSON.parse(JSON.stringify(contacts)),meta:JSON.parse(JSON.stringify(meta)),giftCards:JSON.parse(JSON.stringify(giftCards))};
  try{
    var _ptWhId=((points.find(x=>x.id===currentPointId)||{}).warehouseId)||'wh-default';
    order.pointId=currentPointId||null;
    order.warehouseId=_ptWhId;
    const _whName = (warehouses.find(w=>w.id===_ptWhId)||{}).name || _ptWhId;
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
    orders.push(order);const sh=shifts.find(x=>x.id===order.shiftId);if(sh&&!sh.orderIds.includes(order.id))sh.orderIds.push(order.id);meta.orderSeq++;
    if(order.bonusUsed>0&&order.contactId){const c=contacts.find(x=>x.id===order.contactId);if(c){if(!Array.isArray(c.bonusHistory))c.bonusHistory=[];c.bonusBalance=Math.max(0,(Number(c.bonusBalance)||0)-Number(order.bonusUsed));c.bonusHistory.push({id:uid(),type:'out',amount:order.bonusUsed,date:todayISO(),orderId:order.id,note:`Списано по чеку ${order.number}`});}}
    if(cashSettings.bonusEnabled&&order.contactId){const c=contacts.find(x=>x.id===order.contactId);if(c){if(!Array.isArray(c.bonusHistory))c.bonusHistory=[];const earned=Math.max(0,Math.round((Number(order.total||0)*Number(cashSettings.bonusPercent||0)/100)*100)/100);if(earned>0){c.bonusBalance=(Number(c.bonusBalance)||0)+earned;c.bonusHistory.push({id:uid(),type:'in',amount:earned,date:todayISO(),orderId:order.id,note:`Начислено за чек ${order.number}`});order.bonusEarned=earned;}}}
    if(order.giftCardId&&Number(order.giftCardSpent)>0){const card=giftCards.find(c=>c.id===order.giftCardId);if(!card)throw new Error('gift card not found');const available=Math.max(0,(Number(card.amount)||0)-(Number(card.used)||0));if(Number(order.giftCardSpent)>available)throw new Error('gift card balance changed');card.used=Math.min(Number(card.amount)||0,Math.max(0,Number(card.used)||0)+Number(order.giftCardSpent));if(!Array.isArray(card.history))card.history=[];card.history.push({id:uid(),type:'use',amount:Number(order.giftCardSpent),date:nowISO(),orderNumber:number||'',byUserId:activeUser?.id||null});}
    const persistResults={};
    const keysToSave=['products','movements','orders','debts','contacts','meta','giftCards'];
    for(const k of keysToSave){
      try{
        const r=await persist(k);
        persistResults[k]=(r===false?'false':'ok');
      }catch(err){
        persistResults[k]='throw:'+(err&&err.message||err);
      }
    }
    const failedKeys=Object.keys(persistResults).filter(k=>persistResults[k]!=='ok');
    if(failedKeys.length){
      throw new Error('persist failed: '+JSON.stringify(persistResults));
    }
  }catch(e){
    products=snapshot.products;movements=snapshot.movements;orders=snapshot.orders;debts=snapshot.debts;contacts=snapshot.contacts;meta=snapshot.meta;giftCards=snapshot.giftCards;
    console.error('SALE ERROR',e);
    const msg=String(e&&e.message||'');
    if(msg.indexOf('insufficient_stock:')===0){
      showToast('Недостаточно товара на складе: '+msg.slice('insufficient_stock:'.length));
    } else {
      showToast('Ошибка сохранения продажи. Данные не изменены.');
    }
    return false;
  }

  _carts=_carts.filter(function(x){return x.id!==_activeCartId;});if(_carts.length===0){_resetCarts();}else{_activeCartId=_carts[0].id;_saveCarts();}saleDiscountValue=0;saleComment='';payMethod='cash';pendingKaspiSale=null;saveUiState();safeRender();updateMessagesBadge();playCashVibration();openReceiptModal(order);return true;
}


// ===== Step 5c: favorites + problematic products =====
function openFavContextMenu(id){
  if(!requireAccess('orders'))return;
  const p=products.find(x=>x.id===id);if(!p)return;
  const root=document.getElementById('modal-root'),marked=isProblematicProduct(id);
  root.innerHTML=`<div class="sheet-overlay" id="fav-context-ov"><div class="sheet" style="max-width:420px;"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">${escapeHtml(p.name)}</div><button class="sheet-close" id="fav-context-close">✕</button></div><div class="sheet-body"><button class="btn btn-block" id="problematic-toggle">${marked?'✓ Убрать из проблемных':'⚠️ Добавить в проблемные'}</button></div></div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('fav-context-close').onclick=close;
  document.getElementById('problematic-toggle').onclick=()=>{const now=toggleProblematicProduct(id);close();showPosNotice(now?'Добавлено в проблемные':'Убрано из проблемных');safeRender();};
  document.getElementById('fav-context-ov').onclick=e=>{if(e.target.id==='fav-context-ov')close();};
}

function getProblematicProductIds(){
  try{const key='oni_problematic_products_'+String(activeUser?.id||'_default');const v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v.filter(Boolean):[];}catch(e){return [];}
}

function saveProblematicProductIds(ids){
  try{const key='oni_problematic_products_'+String(activeUser?.id||'_default');localStorage.setItem(key,JSON.stringify([...new Set(ids||[])]));return true;}catch(e){return false;}
}

function isProblematicProduct(id){return getProblematicProductIds().includes(String(id));}

function toggleProblematicProduct(id){
  const sid=String(id),ids=getProblematicProductIds(),i=ids.indexOf(sid);
  if(i>=0)ids.splice(i,1);else ids.push(sid);
  saveProblematicProductIds(ids);return i<0;
}

function openProblematicScreen(){
  if(!requireAccess('orders'))return;
  const list=getProblematicProductIds().map(id=>products.find(p=>p.id===id)).filter(Boolean);
  const root=document.getElementById('modal-root');
  root.innerHTML=`<div class="sheet-overlay" id="problematic-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Проблемные товары</div><button class="sheet-close" id="problematic-close">✕</button></div><div class="sheet-body">${list.length?list.map(p=>`<div class="list-row"><div class="row-icon">${productIcon(p,42)}</div><div class="row-main"><div class="row-title">${escapeHtml(p.name)}</div><div class="row-sub">${fmtMoney(p.price)} · остаток ${Number(p.qty)||0} ${escapeHtml(p.unit||'шт')}</div></div><button class="btn" type="button" data-problematic-remove="${escapeHtml(p.id)}">Убрать</button></div>`).join(''):'<div class="empty">Проблемных товаров пока нет.<br><span class="form-hint">Зажмите товар в кассе, чтобы добавить его.</span></div>'}</div></div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('problematic-close').onclick=close;
  document.getElementById('problematic-ov').onclick=e=>{if(e.target.id==='problematic-ov')close();};
  document.querySelectorAll('[data-problematic-remove]').forEach(b=>b.onclick=()=>{toggleProblematicProduct(b.dataset.problematicRemove);openProblematicScreen();});
}


// ===== Step 6: clients =====
function getClient(id){ return contacts.find(c=>c.id===id && c.type==='client'); }

function viewClients(){
  const rows=getClientContacts();
  const totalSpent=rows.reduce((s,c)=>s+clientOrders(c.id).reduce((a,o)=>a+(Number(o.total)||0),0),0);
  return `<div class="info-grid" style="margin-bottom:12px;">
    <div class="info-card"><div class="info-label">Клиентов</div><div class="info-value">${getClientContacts().length}</div></div>
    <div class="info-card"><div class="info-label">Продажи по базе</div><div class="info-value">${fmtMoney(totalSpent)}</div></div>
  </div>
  <div style="display:flex;gap:7px;margin-bottom:11px;">
    <div class="search" style="flex:1;margin:0;"><span class="search-icon">⌕</span><input id="client-search" placeholder="Поиск клиента: имя, телефон, WhatsApp…" value="${escapeHtml(clientSearch)}"></div>
    <button class="btn btn-primary" id="add-client">+ Клиент</button>
  </div>
  <div style="display:flex;gap:6px;margin-bottom:8px;"><button class="btn" id="cf-save-filter" type="button">💾 Сохранить</button><button class="btn" id="cf-open-filters" type="button">⭐ Мои фильтры</button></div>
  <div class="panel">
    ${getClientContacts().length?getClientContacts().map(c=>{
      const os=clientOrders(c.id), sum=os.reduce((a,o)=>a+(Number(o.total)||0),0);
      return `<div class="list-row live-search-row" data-search-text="${escapeHtml(`${c.name||''} ${c.phone||''} ${c.whatsapp||''} ${c.company||''} ${c.note||''}`)}" data-client-open="${escapeHtml(c.id)}" style="cursor:pointer;">
        <div class="row-icon cat">${escapeHtml(initials(c.name||c.company||''))}</div>
        <div class="row-main"><div class="row-title">${escapeHtml(c.name||'Без имени')}</div><div class="row-sub">${escapeHtml(c.phone||c.whatsapp||'Контакт не указан')}${c.company?' · '+escapeHtml(c.company):''}</div><div class="row-note">${os.length} продаж · ${fmtMoney(sum)}</div></div>
        <div class="row-right"><span class="badge badge-ok">${os.length}</span></div>
      </div>`;
    }).join(''):`<div class="panel-body"><div class="empty">Клиентов пока нет</div></div>`}
    ${getClientContacts().length?'<div class="panel-body" data-live-empty="client-search" style="display:none;"><div class="empty">Клиенты не найдены</div></div>':''}
  </div>`;
}

function bindClients(){
  var cfSave=document.getElementById('cf-save-filter'); if(cfSave)cfSave.onclick=function(){openSaveFilterDialog('clients');};
  var cfOpen=document.getElementById('cf-open-filters'); if(cfOpen)cfOpen.onclick=function(){openSavedFiltersDialog('clients');};
  const input=document.getElementById('client-search');
  bindLiveSearch('client-search','.live-search-row');
  const add=document.getElementById('add-client'); if(add)add.onclick=()=>openClientModal();
  document.querySelectorAll('[data-client-open]').forEach(b=>b.onclick=()=>openClientDetail(b.dataset.clientOpen));
}

function openClientModal(id){
  if(!requireAccess('clients')) return;
  const root=document.getElementById('modal-root'), editing=id?getClient(id):null;
  if(id&&!editing)return;
  const val=k=>escapeHtml(editing?.[k]||'').replace(/"/g,'&quot;');
  root.innerHTML=`<div class="sheet-overlay" id="client-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">${editing?'Изменить клиента':'Новый клиент'}</div><button class="sheet-close" id="client-close">✕</button></div>
    <div class="sheet-body">
      <div class="form-field"><label class="form-label">Имя / название</label><input class="form-input" id="cl-name" value="${val('name')}" placeholder="Например: Иван Петров"></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">Телефон</label><input class="form-input" id="cl-phone" value="${val('phone')}" placeholder="+7 777 123 45 67"></div><div class="form-field"><label class="form-label">WhatsApp</label><input class="form-input" id="cl-wa" value="${val('whatsapp')}" placeholder="+7 777 123 45 67"></div></div>
      <div class="form-field"><label class="form-label">Компания</label><input class="form-input" id="cl-company" value="${val('company')}" placeholder="Необязательно"></div>
      <div class="form-field"><label class="form-label">Комментарий</label><textarea class="form-input" id="cl-note" rows="3" placeholder="Примечание">${escapeHtml(editing?.note||'')}</textarea></div>
    </div>
    <div class="sheet-foot">${editing?'<button class="btn btn-danger-text" id="cl-del">Удалить</button>':''}<button class="btn btn-primary" id="cl-save" style="flex:1;">${editing?'Сохранить':'Добавить'}</button></div>
  </div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('client-close').onclick=close;
  document.getElementById('client-ov').onclick=e=>{if(e.target.id==='client-ov')close();};
  if(editing)document.getElementById('cl-del').onclick=async()=>{ if(clientOrders(editing.id).length){showToast('Нельзя удалить клиента: у него есть история продаж');return;} if(!confirm(`Удалить клиента «${editing.name||'Без имени'}»?`))return; contacts=contacts.filter(c=>c.id!==editing.id); await persist('contacts');close();safeRender(); };
  document.getElementById('cl-save').onclick=async()=>{
    const name=document.getElementById('cl-name').value.trim(),phone=document.getElementById('cl-phone').value.trim(),whatsapp=document.getElementById('cl-wa').value.trim()||phone,company=document.getElementById('cl-company').value.trim(),note=document.getElementById('cl-note').value.trim();
    if(!name&&!phone&&!whatsapp){showToast('Укажите имя или телефон клиента');return;}
    const normalized=normalizeWhatsApp(phone||whatsapp);
    const duplicate=contacts.find(c=>c.type==='client'&&c.id!==(editing?.id||'')&&normalized&&normalizeWhatsApp(c.phone||c.whatsapp)===normalized);
    if(duplicate){showToast('Клиент с таким номером уже есть');return;}
    if(editing)Object.assign(editing,{name,phone,whatsapp,company,note}); else contacts.push({id:uid(),name,phone,whatsapp,type:'client',company,note});
    await persist('contacts');close();safeRender();showToast(editing?'Клиент сохранён':'Клиент добавлен');
  };
}

function openClientDetail(id){
  if(!requireAccess('clients')) return;
  const root=document.getElementById('modal-root'), c=getClient(id); if(!c)return;
  const rows=clientOrders(id), sum=rows.reduce((a,o)=>a+(Number(o.total)||0),0);
  root.innerHTML=`<div class="sheet-overlay" id="client-detail-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">${escapeHtml(c.name||'Клиент')}</div><button class="sheet-close" id="client-detail-close">✕</button></div>
    <div class="sheet-body">
      <div class="info-grid"><div class="info-card"><div class="info-label">Телефон</div><div class="info-value">${escapeHtml(c.phone||'—')}</div></div><div class="info-card"><div class="info-label">WhatsApp</div><div class="info-value">${escapeHtml(c.whatsapp||c.phone||'—')}</div></div></div>
      <div class="info-grid" style="margin-top:8px;"><div class="info-card"><div class="info-label">Покупок</div><div class="info-value">${rows.length}</div></div><div class="info-card"><div class="info-label">Сумма</div><div class="info-value">${fmtMoney(sum)}</div></div></div>
      <div class="info-grid" style="margin-top:8px;"><div class="info-card"><div class="info-label">Бонусов начислено</div><div class="info-value" style="color:#8B6914;">${Math.round((c.bonusBalance||0)*100)/100}</div></div><div class="info-card"><div class="info-label">Списано бонусов</div><div class="info-value">${(c.bonusHistory||[]).filter(x=>x.type==='out').reduce((s,x)=>s+Number(x.amount||0),0).toFixed(0)}</div></div></div>
      ${c.company?`<div class="contact-box"><div class="contact-title">Компания</div><div class="row-sub">${escapeHtml(c.company)}</div></div>`:''}
      ${c.note?`<div class="contact-box"><div class="contact-title">Комментарий</div><div class="row-sub">${escapeHtml(c.note)}</div></div>`:''}
      <div class="panel"><div class="panel-head"><div class="panel-title">История покупок</div></div>
        ${rows.length?rows.map(o=>`<button class="list-row" data-client-order="${escapeHtml(o.id)}" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;"><div class="row-icon sale">ЧК</div><div class="row-main"><div class="row-title">${escapeHtml(o.number)} · ${escapeHtml(o.customer||c.name)}</div><div class="row-sub">${fmtDateTime(o.date)} · ${o.items?.length||0} поз. · ${escapeHtml(paymentLabel(o.paymentMethod))}</div></div><div class="row-right"><div class="row-value">${fmtMoney(o.total)}</div></div></button>`).join(''):`<div class="panel-body"><div class="empty">Покупок пока нет</div></div>`}
      </div>
    </div>
    <div class="sheet-foot"><button class="btn" id="client-edit" style="flex:1;">Изменить</button>${cashSettings.bonusEnabled?'<button class="btn" id="client-bonus" style="flex:1;">🎁 Бонусы</button>':''}<button class="btn btn-primary" id="client-sale" style="flex:1;">Продажа</button>${rows.length&&normalizeWhatsApp(c.whatsapp||c.phone)?'<button class="btn" id="client-last">📱 Чек</button>':''}</div>
  </div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('client-detail-close').onclick=close;
  document.getElementById('client-detail-ov').onclick=e=>{if(e.target.id==='client-detail-ov')close();};
  document.getElementById('client-edit').onclick=()=>{close();openClientModal(id);};
  document.getElementById('client-sale').onclick=()=>{close();currentView='orders';ordersSubView='pos';safeRender();};
  const last=document.getElementById('client-last'); if(last)last.onclick=()=>openReceiptWhatsApp(rows[0]);
  const cb=document.getElementById('client-bonus'); if(cb) cb.onclick=()=>openClientBonusManager(id);
  document.querySelectorAll('[data-client-order]').forEach(b=>b.onclick=()=>openReceiptModal(orders.find(o=>o.id===b.dataset.clientOrder)));
}

function openClientBonusManager(id){
  const c=getClient(id); if(!c)return;
  const root=document.getElementById('modal-root'); const hist=(c.bonusHistory||[]).slice().reverse();
  root.innerHTML=`<div class="sheet-overlay" id="cbm-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Бонусы · ${escapeHtml(c.name||'Клиент')}</div><button class="sheet-close" id="cbm-close">✕</button></div><div class="sheet-body">
      <div class="info-grid"><div class="info-card"><div class="info-label">Баланс</div><div class="info-value" style="color:#8B6914;">${Math.round((c.bonusBalance||0)*100)/100}</div></div><div class="info-card"><div class="info-label">Операций</div><div class="info-value">${hist.length}</div></div></div>
      <div class="form-grid2"><div class="form-field"><label class="form-label">Сумма</label><input class="form-input" type="number" min="0" step="1" id="cbm-amount" value="0"></div><div class="form-field"><label class="form-label">Действие</label><select class="form-select" id="cbm-type"><option value="in">Начислить</option><option value="out">Списать</option></select></div></div>
      <div class="form-field"><label class="form-label">Комментарий</label><input class="form-input" id="cbm-note" placeholder="Причина"></div><button class="btn btn-primary btn-block" id="cbm-apply">Применить</button>
      <div class="panel" style="margin-top:12px;"><div class="panel-head"><div class="panel-title">История</div></div>${hist.length?hist.slice(0,50).map(x=>`<div class="list-row"><div class="row-icon ${x.type==='in'?'in':'out'}">${x.type==='in'?'+':'−'}</div><div class="row-main"><div class="row-title">${x.type==='in'?'Начисление':'Списание'}</div><div class="row-sub">${localDateTime(x.date||todayISO())} · ${escapeHtml(x.note||'—')}</div></div><div class="row-right"><div class="row-value ${x.type==='in'?'pos':'neg'}">${Number(x.amount||0).toFixed(0)}</div></div></div>`).join(''):'<div class="panel-body"><div class="empty">История пуста</div></div>'}</div>
    </div></div></div>`;
  const close=()=>root.innerHTML=''; document.getElementById('cbm-close').onclick=close; document.getElementById('cbm-ov').onclick=e=>{if(e.target.id==='cbm-ov')close();}; document.getElementById('cbm-apply').onclick=async()=>{const amount=Math.max(0,Number(document.getElementById('cbm-amount').value)||0);const type=document.getElementById('cbm-type').value;const note=document.getElementById('cbm-note').value.trim()||'Ручное изменение';if(!amount){showToast('Введите сумму');return;}if(type==='out'&&amount>(c.bonusBalance||0)){showToast('Недостаточно бонусов');return;}if(!Array.isArray(c.bonusHistory))c.bonusHistory=[];c.bonusBalance=(Number(c.bonusBalance)||0)+(type==='in'?amount:-amount);c.bonusHistory.push({id:uid(),type,amount,date:todayISO(),note});await persist('contacts');openClientBonusManager(id);showToast(type==='in'?'Начислено':'Списано');};
}

function clientOrders(id){ return orders.filter(o=>o.contactId===id || (!o.contactId && contacts.find(c=>c.id===id && (c.name||'').trim().toLowerCase()===(o.customer||'').trim().toLowerCase()))).sort((a,b)=>new Date(b.date)-new Date(a.date)); }

function getClientContacts(){
  return contacts.filter(c=>c.type==='client' && (c.name||c.whatsapp||c.phone)).sort((a,b)=>String(a.name||a.company||'').localeCompare(String(b.name||b.company||''),'ru',{sensitivity:'base'}));
}

function findOrCreateContact(d){
  const phone=(d.phone||'').replace(/\D/g,'');
  let c=phone?contacts.find(x=>x.type===d.type&&(x.phone||'').replace(/\D/g,'')===phone):null;
  if(c){Object.assign(c,d);return c;}
  c={id:uid(),name:d.name||'',phone:d.phone||'',whatsapp:d.whatsapp||'',type:d.type||'client',company:d.company||'',note:d.note||'',bonusBalance:0,bonusHistory:[]};
  contacts.push(c);return c;
}

function normalizeWhatsApp(value){
  let n=String(value||'').replace(/\D/g,'');
  if(n.startsWith('8') && n.length===11) n='7'+n.slice(1);
  return n;
}

function openReceiptWhatsApp(order){
  const linked=order.contactId?contacts.find(c=>c.id===order.contactId):null;
  const number=normalizeWhatsApp(order.whatsapp||linked?.whatsapp||linked?.phone);
  if(!number){showToast('У клиента не указан WhatsApp');return;}
  window.open('https://wa.me/'+number+'?text='+encodeURIComponent(receiptWhatsAppText(order)),'_blank');
}

function receiptWhatsAppText(order){
  const lines=(order.items||[]).map(it=>`${it.name} ×${it.qty} — ${fmtMoney(it.price*it.qty)}`);
  return [`ЧЕК №${order.number}`,`Дата: ${fmtDate(order.date)}`,`Клиент: ${order.customer}`,'',...lines,'',`Итого: ${fmtMoney(order.total)}`,...(order.paymentMethod==='transfer'?[]:[`Оплата: ${paymentLabel(order.paymentMethod)}`]),...(order.comment?[`Комментарий: ${order.comment}`]:[]),'','Спасибо за покупку!'].join('\n');
}


// ===== Step 8: AI/product lookup + image helpers =====
function _compressImage(dataUrl, maxSize, quality){
  return new Promise(function(resolve){
    try{
      var img = new Image();
      img.onload = function(){
        try{
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if(!w || !h){ resolve(dataUrl); return; }
          var scale = Math.min(1, (maxSize||1280) / Math.max(w, h));
          var nw = Math.round(w * scale);
          var nh = Math.round(h * scale);
          var canvas = document.createElement('canvas');
          canvas.width = nw;
          canvas.height = nh;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, nw, nh);
          ctx.drawImage(img, 0, 0, nw, nh);
          var out = canvas.toDataURL('image/jpeg', quality||0.8);
          resolve(out && out.length < dataUrl.length ? out : dataUrl);
        }catch(e){ resolve(dataUrl); }
      };
      img.onerror = function(){ resolve(dataUrl); };
      img.src = dataUrl;
    }catch(e){ resolve(dataUrl); }
  });
}

function buildProductDescriptionFromLookup(data){
  const category=String(data.category||'Товар');
  const subtype=String(data.subtype||'').trim();
  const results=Array.isArray(data.results)?data.results:[];
  const f=data.fragrantica||{};
  const texts=results.map(r=>String(r.snippetRu||r.snippet||'')).filter(v=>v&&v.length>8);
  const titles=results.map(r=>String(r.titleRu||r.title||'')).filter(Boolean);
  const all=[...titles,...texts].join(' ');
  const firstMatch=(re)=>{const m=all.match(re);return m?m[1].trim():'';};
  const clean=s=>String(s||'').replace(/\s+/g,' ').replace(/^[,;:. -]+|[,;:. -]+$/g,'').trim();
  const useful=v=>{v=clean(v); if(!v||v.length<2)return ''; if(/^(отзыв|review|reviews|читать отзывы|read reviews)$/i.test(v))return ''; return v;};
  const line=(emoji,label,value)=>{value=useful(value);return value?`${emoji} ${label}: ${value}`:'';};
  const out=[];
  if(category==='Парфюм'){
    let gender=clean(f.gender||'');
    gender=/unisex|унисекс|men and women|мужчин и женщин/i.test(gender)?'унисекс':/women|женщин/i.test(gender)?'женский':/men|мужчин/i.test(gender)?'мужской':'';
    const notes=clean([f.topNotes,f.middleNotes,f.baseNotes].filter(Boolean).map((v,i)=>`${['Верхние','Средние','Базовые'][i]}: ${v}`).join('; '));
    const year=clean(f.year||'');
    // Для парфюма не используем произвольный текст выдачи как «парфюмера».
    // Парфюмер, которого нет в структурированных данных, вообще не выводим.
    const longevity=firstMatch(/(?:longevity|lasting power|lasting|стойкость|стойкость\s+аромата|tenue|kalıcılık)\s*(?:[:\-–—]|=)?\s*([^.!?]{2,100})/i);
    const sillage=firstMatch(/(?:sillage|шлейф|projection|проекция|silaj)\s*(?:[:\-–—]|=)?\s*([^.!?]{2,100})/i);
    const seasons={
      'Весна':firstMatch(/(?:весна|spring)\s*(?:[:\-–—]|=)?\s*(★{1,5}|[1-5]\s*(?:из|\/)\s*5|[^.!?]{1,40})/i),
      'Лето':firstMatch(/(?:лето|summer)\s*(?:[:\-–—]|=)?\s*(★{1,5}|[1-5]\s*(?:из|\/)\s*5|[^.!?]{1,40})/i),
      'Осень':firstMatch(/(?:осень|autumn|fall)\s*(?:[:\-–—]|=)?\s*(★{1,5}|[1-5]\s*(?:из|\/)\s*5|[^.!?]{1,40})/i),
      'Зима':firstMatch(/(?:зима|winter)\s*(?:[:\-–—]|=)?\s*(★{1,5}|[1-5]\s*(?:из|\/)\s*5|[^.!?]{1,40})/i)
    };
    out.push(line('🌸','Тип',gender?`${gender} парфюм`:'парфюм'));
    out.push(line('👃','Ноты',notes));
    out.push(line('📅','Год выпуска',year));
    out.push(line('☀️','Весна',seasons['Весна']));
    out.push(line('🌸','Лето',seasons['Лето']));
    out.push(line('🍂','Осень',seasons['Осень']));
    out.push(line('❄️','Зима',seasons['Зима']));
    out.push(line('⏱','Стойкость',longevity));
    out.push(line('💨','Шлейф',sillage));
  } else if(category==='БАД / витамины'){
    out.push(line('💊','Тип',subtype||'БАД / витамин / комплекс'));
    out.push(line('🎯','Для чего',firstMatch(/(?:benefits?|для чего|польза|supports?|поддерживает)\s*(?:[:\-–—]\s*)?([^.!?]{10,220})/i)));
    out.push(line('✨','Основные свойства',firstMatch(/(?:ingredients?|состав|properties|свойства)\s*(?:[:\-–—]\s*)?([^.!?]{10,220})/i)));
    out.push(line('🥄','Как принимать',firstMatch(/(?:how to take|directions|дозировк[аи]|как принимать|принимать|serving)\s*(?:[:\-–—]\s*)?([^.!?]{5,180})/i)));
    out.push(line('📅','Курс',firstMatch(/(?:course|курс)\s*(?:[:\-–—]\s*)?([^.!?]{3,120})/i)));
    out.push(line('⚠️','Важно',firstMatch(/(?:contraindications?|warnings?|противопоказани[яй]|предупреждени[ея])\s*(?:[:\-–—]\s*)?([^.!?]{5,220})/i)));
  } else if(category==='Книга'){
    out.push(line('📚','Жанр',firstMatch(/(?:genre|жанр)\s*(?:[:\-–—]\s*)?([^.!?]{2,100})/i)));
    out.push(line('✍️','Автор',firstMatch(/(?:author|автор|by)\s*(?:[:\-–—]\s*)?([^.!?,]{2,100})/i)));
    out.push(line('📖','О чём',firstMatch(/(?:about|synopsis|summary|о чем|о чём|содержание|сюжет)\s*(?:[:\-–—]\s*)?([^.!?]{15,260})/i)));
    out.push(line('💡','Главная тема',firstMatch(/(?:theme|main theme|главная тема)\s*(?:[:\-–—]\s*)?([^.!?]{10,180})/i)));
  } else if(category==='Косметика'){
    const kind=subtype||(/\b(шампунь|shampoo)\b/i.test(all)?'шампунь':/\b(зубн(?:ая|ую)\s+паста|toothpaste)\b/i.test(all)?'зубная паста':/\b(миноксидил|minoxidil)\b/i.test(all)?'средство для роста волос':'косметическое средство');
    out.push(line('💧','Тип',kind));
    out.push(line('🎯','Для чего',firstMatch(/(?:for|benefits?|назначение|для чего|для)\s*(?:[:\-–—]\s*)?([^.!?]{10,180})/i)));
    out.push(line('✨','Эффект',firstMatch(/(?:effect|benefits?|эффект|действие|action)\s*(?:[:\-–—]\s*)?([^.!?]{10,180})/i)));
    out.push(line('🧴','Как применять',firstMatch(/(?:how to use|directions|application|как применять|применение)\s*(?:[:\-–—]\s*)?([^.!?]{5,200})/i)));
    out.push(line('⚠️','Важно',firstMatch(/(?:contraindications?|warnings?|противопоказани[яй]|предупреждени[ея])\s*(?:[:\-–—]\s*)?([^.!?]{5,220})/i)));
  } else if(category==='Электроника'){
    out.push(line('⚙️','Характеристики',firstMatch(/(?:specifications?|характеристики)\s*(?:[:\-–—]\s*)?([^.!?]{10,260})/i)));
    out.push(line('🔋','Питание / батарея',firstMatch(/(?:battery|батаре[яи]|аккумулятор)\s*(?:[:\-–—]\s*)?([^.!?]{5,180})/i)));
  } else {
    out.push(line('📝','Описание',texts.slice(0,2).join(' ')));
  }
  return out.filter(Boolean).join('\n');
}

async function readOriginalProductImage(file){return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>resolve('');r.readAsDataURL(file);});}

async function readResizedProductImage(file,maxSide=1200,quality=0.82){
  const dataUrl=await readOriginalProductImage(file);
  if(!dataUrl)return '';
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      try{
        let w=img.naturalWidth,h=img.naturalHeight;
        if(w>maxSide||h>maxSide){
          if(w>=h){h=Math.round(h*maxSide/w);w=maxSide;}else{w=Math.round(w*maxSide/h);h=maxSide;}
        }
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d');
        if(!ctx){resolve(dataUrl);return;}
        ctx.drawImage(img,0,0,w,h);
        const out=canvas.toDataURL('image/jpeg',quality);
        resolve(out&&out.length<dataUrl.length?out:dataUrl);
      }catch(e){resolve(dataUrl);}
    };
    img.onerror=()=>resolve(dataUrl);
    img.src=dataUrl;
  });
}

function renderSearchLinks(name){
  var box=document.getElementById('f-search-links');
  if(!box) return;
  var q=String(name||'').trim();
  if(!q || q.length<2){ box.innerHTML=''; return; }
  var enc=encodeURIComponent(q);
  var links=[
    {t:'🛒 Wildberries', u:'https://www.wildberries.ru/catalog/0/search.aspx?search='+enc},
    {t:'🛍 Ozon', u:'https://www.ozon.ru/search/?text='+enc},
    {t:'🏪 Kaspi', u:'https://kaspi.kz/shop/search/?text='+enc},
    {t:'🔍 Google', u:'https://www.google.com/search?q='+enc+' описание характеристики'},
    {t:'✨ Gemini', u:'https://gemini.google.com/app'},
    {t:'🔮 Perplexity', u:'https://www.perplexity.ai/search?q='+enc+' описание характеристики'}
  ];
  box.innerHTML=links.map(function(l){
    return '<button type="button" data-wv-url="'+l.u+'" class="oni-wv-btn" style="padding:6px 10px;border:1px solid #E5E5E5;border-radius:14px;font-size:12px;color:#0A84FF;background:#FFFFFF;font-weight:600;cursor:pointer;">'+l.t+'</button>';
  }).join('');
  var btns=box.querySelectorAll('.oni-wv-btn');
  for(var i=0;i<btns.length;i++){
    (function(b){ b.onclick=function(){ (function(){var _u=b.getAttribute('data-wv-url');if(_u&&_u.indexOf('gemini.google.com')>=0){var _b=window.Android||window.AndroidWV;var _lang=(_b&&_b.getReviewLang)?_b.getReviewLang():'kz';var _p=window.__oniBuildPrompt?window.__oniBuildPrompt(_lang,q):('Товар: '+q);if(_b&&_b.saveGeminiQuery){_b.saveGeminiQuery(_p);}window.openInWV('https://gemini.google.com/app');return;}window.openInWV(_u);})(); }; })(btns[i]);
  }
}

function openAISettings(){
  if(activeUser?.role!=='admin') return;
  const root=document.getElementById('modal-root');
  let cfg={enabled:false,openaiEnabled:false,deepseekEnabled:false,model:'gpt-5.6-luna',deepseekModel:'deepseek-v4-flash',apiKeySet:false,openaiApiKeySet:false,deepseekApiKeySet:false,geminiEnabled:false,geminiModel:'gemini-3.6-flash',geminiApiKey:'',geminiApiKeySet:false};
  try{if(window.Android&&typeof window.Android.getAISettings==='function'){const x=JSON.parse(window.Android.getAISettings()||'{}');cfg=Object.assign(cfg,x);}}catch(e){}
  try{const g=JSON.parse(localStorage.getItem('oni_crm_gemini_settings')||'null');if(g&&typeof g==='object'){cfg.geminiEnabled=!!g.enabled;cfg.geminiModel=g.model||cfg.geminiModel;if(!cfg.geminiModel||/^gemini-(?:2\.|1\.)/i.test(String(cfg.geminiModel)))cfg.geminiModel='gemini-3.6-flash';cfg.geminiApiKey=g.apiKey||'';cfg.geminiApiKeySet=!!(g.apiKey&&String(g.apiKey).trim());}}catch(e){}
  const sw=(id,checked)=>`<label class="ai-switch"><input id="${id}" type="checkbox" ${checked?'checked':''}><span class="ai-switch-track"></span></label>`;
  root.innerHTML=`<div class="sheet-overlay" id="ai-settings-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">ИИ</div><button class="sheet-close" id="ai-settings-close">✕</button></div><div class="sheet-body">
    <div class="cash-settings"><div class="cash-settings-title">Провайдеры ИИ</div><div class="form-hint">Каждый провайдер можно независимо включать и отключать. Выключенный провайдер не используется для новых запросов.</div></div>
    <div class="panel" style="margin-top:10px;"><div class="panel-body" style="padding:4px 12px;">
      <div class="ai-provider-row"><div class="ai-provider-meta"><div class="ai-provider-name">OpenAI</div><div class="ai-provider-state" id="openai-state">${cfg.openaiApiKeySet||cfg.apiKeySet?'Ключ сохранён':'Ключ не задан'}</div></div>${sw('ai-openai-enabled',!!(cfg.openaiEnabled||cfg.enabled))}</div>
      <div class="ai-provider-row"><div class="ai-provider-meta"><div class="ai-provider-name">DeepSeek</div><div class="ai-provider-state" id="deepseek-state">${cfg.deepseekApiKeySet?'Ключ сохранён':'Ключ не задан'}</div></div>${sw('ai-deepseek-enabled',!!cfg.deepseekEnabled)}</div>
      <div class="ai-provider-row"><div class="ai-provider-meta"><div class="ai-provider-name">Gemini</div><div class="ai-provider-state" id="gemini-state">${cfg.geminiApiKeySet?'Ключ сохранён':'Ключ не задан'}</div></div>${sw('ai-gemini-enabled',!!cfg.geminiEnabled)}</div>
    </div></div>
    <div class="form-field"><label class="form-label">Модель OpenAI</label><input class="form-input" id="ai-model" value="${escapeHtml(cfg.model||'gpt-5.6-luna')}"></div>
    <div class="form-field"><label class="form-label">OpenAI API-ключ</label><input class="form-input" id="ai-key" type="password" placeholder="${cfg.openaiApiKeySet||cfg.apiKeySet?'Ключ уже сохранён — оставьте пустым':'sk-…'}" autocomplete="off"></div>
    <div class="form-field"><label class="form-label">Модель DeepSeek</label><input class="form-input" id="deepseek-model" value="${escapeHtml(cfg.deepseekModel||'deepseek-v4-flash')}"></div>
    <div class="form-field"><label class="form-label">DeepSeek API-ключ</label><input class="form-input" id="deepseek-key" type="password" placeholder="${cfg.deepseekApiKeySet?'Ключ уже сохранён — оставьте пустым':'sk-…'}" autocomplete="off"></div>
    <div class="form-field"><label class="form-label">Модель Gemini</label><input class="form-input" id="gemini-model" value="${escapeHtml(cfg.geminiModel||'gemini-3.6-flash')}"></div>
    <div class="form-field"><label class="form-label">Gemini API-ключ</label><input class="form-input" id="gemini-key" type="password" placeholder="${cfg.geminiApiKeySet?'Ключ уже сохранён — оставьте пустым':'AIza…'}" autocomplete="off"></div>
    <div class="panel" style="margin-top:10px;"><div class="panel-head"><div class="panel-title">Состояние</div></div><div class="panel-body"><div id="ai-status" class="form-hint">${(cfg.openaiApiKeySet||cfg.apiKeySet||cfg.deepseekApiKeySet)?'Настройки сохранены в Android':'API-ключи не заданы'}</div></div></div>
    <div class="panel" style="margin-top:10px;"><div class="panel-head"><div class="panel-title">ИИ-помощник</div></div><div class="panel-body"><label style="display:flex;align-items:center;justify-content:space-between;gap:10px;"><span><b>Автоматическое применение</b><br><span class="form-hint">Выкл — ИИ только предлагает изменение. Вкл — после твоего подтверждения разрешённое изменение применяется автоматически.</span></span><input id="ai-assistant-auto" type="checkbox"></label></div></div>
    <div class="form-hint" style="margin-top:10px;">Gemini API-ключ хранится в localStorage под ключом oni_crm_gemini_settings. Ключи OpenAI/DeepSeek хранятся в Android и не попадают в резервную копию CRM.</div>
  </div><div class="sheet-foot" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><button class="btn" id="ai-test">Проверить</button><button class="btn btn-primary" id="ai-save">Сохранить</button></div></div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('ai-settings-close').onclick=close;document.getElementById('ai-settings-ov').onclick=e=>{if(e.target.id==='ai-settings-ov')close();};
  try{const a=document.getElementById('ai-assistant-auto');if(a)a.checked=!!(window.Android&&typeof window.Android.getAIAssistantAutoApply==='function'&&window.Android.getAIAssistantAutoApply());}catch(e){}
  const auto=document.getElementById('ai-assistant-auto'); if(auto) auto.onchange=()=>{try{if(window.Android&&typeof window.Android.setAIAssistantAutoApply==='function')window.Android.setAIAssistantAutoApply(!!auto.checked);}catch(e){}};
  const save=()=>{
    // Gemini: сохраняем в localStorage (Android-мост пока не поддерживает Gemini).
    // Работает и в браузере, и в Android WebView — localStorage персистентный.
    try{
      const prev=(()=>{try{return JSON.parse(localStorage.getItem('oni_crm_gemini_settings')||'null')||{};}catch(e){return {};}})();
      const newKey=document.getElementById('gemini-key').value.trim();
      const finalKey=newKey || (prev.apiKey||'');
      let geminiModel=document.getElementById('gemini-model').value.trim()||'gemini-3.6-flash';
      if(/^gemini-(?:2\.|1\.)/i.test(geminiModel))geminiModel='gemini-3.6-flash';
      localStorage.setItem('oni_crm_gemini_settings',JSON.stringify({
        enabled:!!document.getElementById('ai-gemini-enabled').checked,
        model:geminiModel,
        apiKey:finalKey
      }));
    }catch(e){ console.error('gemini save failed',e); }
    // OpenAI / DeepSeek: через Android-мост, если он есть (как было).
    if(window.Android&&typeof window.Android.saveAISettings==='function'){
      window.Android.saveAISettings('true',document.getElementById('ai-openai-enabled').checked?'true':'false',document.getElementById('ai-deepseek-enabled').checked?'true':'false',document.getElementById('ai-model').value.trim()||'gpt-5.6-luna',document.getElementById('ai-key').value.trim(),document.getElementById('deepseek-model').value.trim()||'deepseek-v4-flash',document.getElementById('deepseek-key').value.trim());
    }
    return true;
  };
  document.getElementById('ai-save').onclick=()=>{if(save()){close();showToast('Настройки ИИ сохранены');}};
  document.getElementById('ai-test').onclick=()=>{save();const st=document.getElementById('ai-status');if(st)st.textContent='Проверяю включённые провайдеры…';if(window.Android&&typeof window.Android.testAIConnection==='function')window.Android.testAIConnection();else if(st)st.textContent='Проверка доступна только в Android-приложении';};
}


// ===== Step 10: reports + cashier analytics =====
function openCashierAnalytics(){
  if(!(activeUser?.role==='admin'||activeUser?.role==='manager')){ showToast('Нет доступа'); return; }
  if(!analyticsFrom){ const d=new Date(); const f=new Date(d.getFullYear(),d.getMonth(),1); analyticsFrom=f.toISOString().slice(0,10); analyticsTo=todayISO(); }
  const root=document.getElementById('modal-root');
  const cashiers = users.filter(u=>u.role==='cashier'||u.role==='admin'||u.role==='manager');
  const rows = cashiers.map(u=>{
    const list = orders.filter(o=>o.cashierId===u.id && o.status!=='Возврат' && String(o.date||'').slice(0,10)>=analyticsFrom && String(o.date||'').slice(0,10)<=analyticsTo);
    const returns = orders.filter(o=>o.cashierId===u.id && o.status==='Возврат' && String(o.date||'').slice(0,10)>=analyticsFrom && String(o.date||'').slice(0,10)<=analyticsTo);
    const total=list.reduce((s,o)=>s+Number(o.total||0),0);
    const qty=list.reduce((s,o)=>s+(o.items||[]).reduce((a,it)=>a+Number(it.qty||0),0),0);
    const retTotal=returns.reduce((s,o)=>s+Number(o.total||0),0);
    const avg=list.length?total/list.length:0;
    return {u,total,qty,checks:list.length,avg,retTotal,retCount:returns.length};
  }).sort((a,b)=>b.total-a.total);
  const grandTotal = rows.reduce((s,r)=>s+r.total,0);
  const grandChecks = rows.reduce((s,r)=>s+r.checks,0);
  root.innerHTML=`<div class="sheet-overlay" id="analytics-ov"><div class="sheet"><div class="sheet-handle"></div>
    <div class="sheet-head"><div class="sheet-title">Аналитика кассиров</div><button class="sheet-close" id="analytics-close">✕</button></div>
    <div class="sheet-body">
      <div class="form-grid2">
        <div class="form-field"><label class="form-label">С</label><input class="form-input" type="date" id="an-from" value="${analyticsFrom}"></div>
        <div class="form-field"><label class="form-label">По</label><input class="form-input" type="date" id="an-to" value="${analyticsTo}"></div>
      </div>
      <div class="info-grid"><div class="info-card"><div class="info-label">Выручка</div><div class="info-value">${fmtMoney(grandTotal)}</div></div><div class="info-card"><div class="info-label">Чеков</div><div class="info-value">${grandChecks}</div></div></div>
      <div class="panel"><div class="panel-head"><div class="panel-title">Кассиры</div></div>
        ${rows.length?rows.map(r=>`<div class="list-row">
          <div class="row-icon cat">${escapeHtml(initials(r.u.name||''))}</div>
          <div class="row-main"><div class="row-title">${escapeHtml(r.u.name||'—')} · ${roleLabel(r.u.role)}</div>
          <div class="row-sub">${r.checks} чек(ов) · ${r.qty} товар(ов) · средний ${fmtMoney(r.avg)}</div>
          ${r.retCount?`<div class="row-note" style="color:var(--danger)">Возвратов: ${r.retCount} на ${fmtMoney(r.retTotal)}</div>`:''}</div>
          <div class="row-right"><div class="row-value">${fmtMoney(r.total)}</div></div></div>`).join(''):'<div class="panel-body"><div class="empty">Нет данных за период</div></div>'}
      </div>
    </div>
    <div class="sheet-foot"><button class="btn btn-primary btn-block" id="an-apply">Применить период</button></div>
  </div></div>`;
  const close=()=>root.innerHTML='';
  document.getElementById('analytics-close').onclick=close;
  document.getElementById('analytics-ov').onclick=e=>{if(e.target.id==='analytics-ov')close();};
  document.getElementById('an-apply').onclick=()=>{ const f=document.getElementById('an-from').value||todayISO(); const t=document.getElementById('an-to').value||todayISO(); if(f>t){ showToast('Дата «С» не может быть позже даты «По»'); return; } analyticsFrom=f; analyticsTo=t; openCashierAnalytics(); };
}

function reportsDefaultPeriod(){ const d=new Date(); const f=new Date(d.getFullYear(),d.getMonth(),1); return {from:f.toISOString().slice(0,10),to:todayISO()}; }

function reportsFilteredOrders(){ const {from,to}=reportsState; return orders.filter(o=>{ const d=String(o.date||'').slice(0,10); return d>=from&&d<=to; }); }

function statusLabel(s){
  return {dead:'Мёртвый сток',slow:'Медленный',normal:'Норма',fast:'Ходовой'}[s]||'—';
}

function statusLabelShort(s){
  return {dead:'🔴 Мёртвый',slow:'🟡 Медленный',normal:'🟢 Норма',fast:'🔵 Ходовой'}[s]||'—';
}

function statusLabelColor(s){
  return {dead:'var(--danger)',slow:'#B84A00',normal:'var(--primary-dark)',fast:'var(--blue)'}[s]||'var(--muted)';
}

function reportsTurnover(){
  const {from,to}=reportsState;
  const cacheKey=`${from}|${to}|${_dataVersion}`;
  if(_turnoverCache && _turnoverCache.key===cacheKey) return _turnoverCache.rows;
  const fromDate=new Date(from+'T00:00:00');
  const toDate=new Date(to+'T23:59:59');
  const daysInPeriod=Math.max(1, Math.round((toDate-fromDate)/86400000));
  const sold={};
  const lastSale={};
  const periodOrders=orders.filter(o=>o.status!=='Возврат');
  periodOrders.forEach(o=>{
    const d=String(o.date||'').slice(0,10);
    const inPeriod=d>=from && d<=to;
    (o.items||[]).forEach(it=>{
      const pid=it.productId;
      if(!pid) return;
      if(!lastSale[pid] || d>lastSale[pid]) lastSale[pid]=d;
      if(!inPeriod) return;
      if(!sold[pid]) sold[pid]={soldQty:0,revenue:0,cost:0};
      sold[pid].soldQty+=Number(it.qty)||0;
      sold[pid].revenue+=(Number(it.price)||0)*(Number(it.qty)||0);
      sold[pid].cost+=(Number(it.cost)||0)*(Number(it.qty)||0);
    });
  });
  orders.forEach(o=>{
    const d=String(o.date||'').slice(0,10);
    if(d<from || d>to) return;
    (o.returns||[]).forEach(r=>{
      (r.items||[]).forEach(it=>{
        const pid=it.productId;
        if(!pid || !sold[pid]) return;
        sold[pid].soldQty=Math.max(0, sold[pid].soldQty-(Number(it.qty)||0));
        sold[pid].revenue=Math.max(0, sold[pid].revenue-(Number(it.price)||0)*(Number(it.qty)||0));
      });
    });
  });
  const now=Date.now();
  const rows=[];
  products.filter(p=>!p.isCategoryPlaceholder).forEach(p=>{
    const s=sold[p.id]||{soldQty:0,revenue:0,cost:0};
    const currentStock=Number(p.qty)||0;
    const avgStock=currentStock;
    const turnoverRatio=s.soldQty/Math.max(avgStock,1);
    const daysOfStock=s.soldQty>0?Math.round(daysInPeriod/turnoverRatio):Infinity;
    let daysSinceLastSale=Infinity;
    if(lastSale[p.id]) daysSinceLastSale=Math.floor((now-new Date(lastSale[p.id]+'T00:00:00').getTime())/86400000);
    let status;
    if(currentStock<=0) status='dead';
    else if(!isFinite(daysSinceLastSale)) status='dead';
    else if(daysSinceLastSale>60) status='dead';
    else if(daysSinceLastSale>=30) status='slow';
    else if(daysSinceLastSale>=10) status='normal';
    else status='fast';
    rows.push({productId:p.id,name:p.name||'',sku:p.sku||'',category:p.category||'Без категории',soldQty:s.soldQty,revenue:s.revenue,costSold:s.cost,currentStock,avgStock,turnoverRatio,daysOfStock,daysSinceLastSale,unitCost:Number(p.cost)||0,status,abc:null});
  });
  const sorted=[...rows].sort((a,b)=>b.revenue-a.revenue);
  const totalRevenue=sorted.reduce((s,x)=>s+x.revenue,0);
  let acc=0;
  sorted.forEach(x=>{
    if(totalRevenue<=0){x.abc='C';return;}
    acc+=x.revenue;
    const share=acc/totalRevenue;
    if(share<=0.80)x.abc='A';
    else if(share<=0.95)x.abc='B';
    else x.abc='C';
  });
  _turnoverCache={key:cacheKey,rows};
  return rows;
}

function reportsCalc(){ const list=reportsFilteredOrders(); const paid=list.filter(o=>o.status!=='Возврат'); const returns=list.filter(o=>Array.isArray(o.returns)&&o.returns.length); const total=paid.reduce((s,o)=>s+Number(o.total||0),0); const returnsTotal=returns.reduce((s,o)=>s+(o.returns||[]).reduce((a,r)=>a+Number(r.total||0),0),0); const taxTotal=paid.reduce((s,o)=>s+Number(o.taxAmount||0),0); const commissionTotal=paid.reduce((s,o)=>s+Number(o.commissionAmount||0),0); const netTotal=paid.reduce((s,o)=>s+Number(o.netAmount||o.total||0),0); const itemsAll=paid.reduce((acc,o)=>{(o.items||[]).forEach(it=>acc.push({...it,orderId:o.id,date:o.date,paymentMethod:o.paymentMethod}));return acc;},[]); const revenueCost=itemsAll.reduce((s,it)=>s+Number(it.cost||0)*Number(it.qty||0),0); const grossProfit=total-revenueCost; const qty=itemsAll.reduce((s,it)=>s+Number(it.qty||0),0); const checks=paid.length; const avg=checks?total/checks:0; return {list,paid,returns,total,returnsTotal,taxTotal,commissionTotal,netTotal,revenueCost,grossProfit,qty,checks,avg,itemsAll}; }

function reportsByCashier(){ const {paid}=reportsCalc(); const map={}; paid.forEach(o=>{const id=o.cashierId||'unknown';if(!map[id])map[id]={id,name:o.cashierName||'—',total:0,checks:0,qty:0};map[id].total+=Number(o.total||0);map[id].checks+=1;map[id].qty+=(o.items||[]).reduce((a,it)=>a+Number(it.qty||0),0);});return Object.values(map).sort((a,b)=>b.total-a.total); }

function reportsByPayment(){ const {paid,returns}=reportsCalc(); const map={}; paid.forEach(o=>{ if(Array.isArray(o.paymentSplits)&&o.paymentSplits.length){ o.paymentSplits.forEach(sp=>{ const m=sp.method||'cash'; map[m]=(map[m]||0)+Number(sp.amount||0); }); } else { const m=o.paymentMethod||'cash'; map[m]=(map[m]||0)+Number(o.total||0); } }); returns.forEach(o=>{ (o.returns||[]).forEach(r=>{ const m=r.method||'cash'; map[m]=(map[m]||0)-Number(r.total||0); }); }); return Object.entries(map).map(([method,total])=>({method,total})).filter(x=>Math.abs(x.total)>0.000001).sort((a,b)=>b.total-a.total); }

function reportsTopProducts(limit=15){ const {itemsAll}=reportsCalc(); const map={};itemsAll.forEach(it=>{const id=it.productId||it.sku||it.name;if(!map[id])map[id]={id,name:it.name||'—',sku:it.sku||'',qty:0,revenue:0,profit:0};map[id].qty+=Number(it.qty||0);map[id].revenue+=Number(it.price||0)*Number(it.qty||0);map[id].profit+=(Number(it.price||0)-Number(it.cost||0))*Number(it.qty||0);});return Object.values(map).sort((a,b)=>b.revenue-a.revenue).slice(0,limit); }

function reportsByCategory(){ const {itemsAll}=reportsCalc(); const map={};itemsAll.forEach(it=>{const p=products.find(x=>x.id===it.productId);const cat=p?.category||'Без категории';if(!map[cat])map[cat]={cat,qty:0,revenue:0,profit:0};map[cat].qty+=Number(it.qty||0);map[cat].revenue+=Number(it.price||0)*Number(it.qty||0);map[cat].profit+=(Number(it.price||0)-Number(it.cost||0))*Number(it.qty||0);});return Object.values(map).sort((a,b)=>b.revenue-a.revenue); }

function reportsByDay(){ const {paid}=reportsCalc(); const map={};paid.forEach(o=>{const d=String(o.date||'').slice(0,10);map[d]=(map[d]||0)+Number(o.total||0);});return Object.entries(map).map(([date,total])=>({date,total})).sort((a,b)=>a.date.localeCompare(b.date)); }

function reportsExportExcel(){ if(typeof XLSX==='undefined'){showToast('Excel-модуль не загружен');return;}const {from,to}=reportsState;const c=reportsCalc();const wb=XLSX.utils.book_new();const summaryRows=[['On.i CRM — Отчёт за период'],['Период',`${from} → ${to}`],['Сформирован',new Date().toLocaleString('ru-RU')],[],['Показатель','Значение'],['Продажи (оплачено)',c.total],['Возвраты',c.returnsTotal],['Налог',c.taxTotal],['Комиссия',c.commissionTotal],['Чистыми',c.netTotal],['Себестоимость проданного',c.revenueCost],['Валовая прибыль',c.grossProfit],['Чеков',c.checks],['Средний чек',c.avg],['Товаров продано',c.qty]];const wsS=XLSX.utils.aoa_to_sheet(summaryRows);wsS['!cols']=[{wch:32},{wch:20}];XLSX.utils.book_append_sheet(wb,wsS,'Сводка');const wsC=XLSX.utils.aoa_to_sheet([['Кассир','Чеков','Товаров','Выручка'],...reportsByCashier().map(x=>[x.name,x.checks,x.qty,x.total])]);wsC['!cols']=[{wch:24},{wch:10},{wch:10},{wch:14}];XLSX.utils.book_append_sheet(wb,wsC,'По кассирам');const wsP=XLSX.utils.aoa_to_sheet([['Способ оплаты','Сумма'],...reportsByPayment().map(x=>[paymentLabel(x.method),x.total])]);wsP['!cols']=[{wch:20},{wch:14}];XLSX.utils.book_append_sheet(wb,wsP,'По оплатам');const wsT=XLSX.utils.aoa_to_sheet([['Артикул','Товар','Продано','Выручка','Прибыль'],...reportsTopProducts(50).map(x=>[x.sku,x.name,x.qty,x.revenue,x.profit])]);wsT['!cols']=[{wch:14},{wch:30},{wch:10},{wch:14},{wch:14}];XLSX.utils.book_append_sheet(wb,wsT,'Топ товаров');const wsCat=XLSX.utils.aoa_to_sheet([['Категория','Продано','Выручка','Прибыль'],...reportsByCategory().map(x=>[x.cat,x.qty,x.revenue,x.profit])]);wsCat['!cols']=[{wch:22},{wch:10},{wch:14},{wch:14}];XLSX.utils.book_append_sheet(wb,wsCat,'По категориям');const wsD=XLSX.utils.aoa_to_sheet([['Дата','Выручка'],...reportsByDay().map(x=>[x.date,x.total])]);wsD['!cols']=[{wch:14},{wch:14}];XLSX.utils.book_append_sheet(wb,wsD,'По дням');const wsTurn=XLSX.utils.aoa_to_sheet([['Артикул','Товар','Категория','Продано','Выручка','Остаток','Оборачиваемость','Дней запаса','Дней без продаж','Статус','ABC'],...reportsTurnover().map(x=>[x.sku,x.name,x.category,x.soldQty,x.revenue,x.currentStock,Number(x.turnoverRatio.toFixed(2)),isFinite(x.daysOfStock)?x.daysOfStock:'∞',isFinite(x.daysSinceLastSale)?x.daysSinceLastSale:'∞',statusLabel(x.status),x.abc||''])]);wsTurn['!cols']=[{wch:14},{wch:30},{wch:22},{wch:10},{wch:14},{wch:10},{wch:16},{wch:14},{wch:18},{wch:18},{wch:8}];wsTurn['!freeze']='A2';wsTurn['!autofilter']={ref:'A1:K1'};XLSX.utils.book_append_sheet(wb,wsTurn,'Оборачиваемость');const filename=`On-i-CRM-Отчёт-${from}_${to}.xlsx`;if(window.Android&&typeof window.Android.saveExcelTemplate==='function'){const base64=XLSX.write(wb,{bookType:'xlsx',type:'base64'});window.Android.saveExcelTemplate(base64,filename);showToast('Отчёт сохранён');return;}XLSX.writeFile(wb,filename);showToast('Отчёт сохранён'); }

function reportsPrintHtml(){ const {from,to}=reportsState;const c=reportsCalc();const cashiers=reportsByCashier();const payments=reportsByPayment();const cats=reportsByCategory();const top=reportsTopProducts(20);return `<!doctype html><html><head><meta charset="utf-8"><title>Отчёт ${from} — ${to}</title><style>@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111;max-width:190mm;margin:0 auto}h1{text-align:center;font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:16px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}.muted{text-align:center;font-size:11px;color:#666;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{padding:4px 6px;border-bottom:1px solid #eee;text-align:left}th{background:#f5f5f5;font-size:11px}td:last-child,th:last-child{text-align:right}.kv{display:flex;justify-content:space-between;font-size:12px;line-height:1.9;border-bottom:1px dashed #ccc}.kv strong{font-family:monospace}.total{font-weight:700;font-size:13px;color:#0E8A4B}</style></head><body><h1>Отчёт за период</h1><div class="muted">${escapeHtml(shopSettings.name||'On.i Store')} · ${from} → ${to} · сформирован ${new Date().toLocaleString('ru-RU')}</div><h2>Показатели</h2><div class="kv"><span>Продажи (оплачено)</span><strong>${fmtMoney(c.total)}</strong></div><div class="kv"><span>Возвраты</span><strong>− ${fmtMoney(c.returnsTotal)}</strong></div><div class="kv"><span>Итого к сдаче</span><strong>${fmtMoney(c.total-c.returnsTotal)}</strong></div><div class="kv"><span>Налог</span><strong>${fmtMoney(c.taxTotal)}</strong></div><div class="kv"><span>Комиссия</span><strong>${fmtMoney(c.commissionTotal)}</strong></div><div class="kv total"><span>Чистыми</span><strong>${fmtMoney(c.netTotal)}</strong></div><div class="kv"><span>Себестоимость проданного</span><strong>${fmtMoney(c.revenueCost)}</strong></div><div class="kv total"><span>Валовая прибыль</span><strong>${fmtMoney(c.grossProfit)}</strong></div><div class="kv"><span>Чеков</span><strong>${c.checks}</strong></div><div class="kv"><span>Средний чек</span><strong>${fmtMoney(c.avg)}</strong></div><div class="kv"><span>Товаров продано</span><strong>${c.qty}</strong></div><h2>По кассирам</h2><table><thead><tr><th>Кассир</th><th>Чеков</th><th>Товаров</th><th>Выручка</th></tr></thead><tbody>${cashiers.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${x.checks}</td><td>${x.qty}</td><td>${fmtMoney(x.total)}</td></tr>`).join('')||'<tr><td colspan="4">Нет данных</td></tr>'}</tbody></table><h2>По способам оплаты</h2><table><thead><tr><th>Способ</th><th>Сумма</th></tr></thead><tbody>${payments.map(x=>`<tr><td>${escapeHtml(paymentLabel(x.method))}</td><td>${fmtMoney(x.total)}</td></tr>`).join('')||'<tr><td colspan="2">Нет данных</td></tr>'}</tbody></table><h2>По категориям</h2><table><thead><tr><th>Категория</th><th>Продано</th><th>Выручка</th><th>Прибыль</th></tr></thead><tbody>${cats.map(x=>`<tr><td>${escapeHtml(x.cat)}</td><td>${x.qty}</td><td>${fmtMoney(x.revenue)}</td><td>${fmtMoney(x.profit)}</td></tr>`).join('')||'<tr><td colspan="4">Нет данных</td></tr>'}</tbody></table><h2>Топ-20 товаров</h2><table><thead><tr><th>Артикул</th><th>Товар</th><th>Продано</th><th>Выручка</th><th>Прибыль</th></tr></thead><tbody>${top.map(x=>`<tr><td>${escapeHtml(x.sku)}</td><td>${escapeHtml(x.name)}</td><td>${x.qty}</td><td>${fmtMoney(x.revenue)}</td><td>${fmtMoney(x.profit)}</td></tr>`).join('')||'<tr><td colspan="5">Нет данных</td></tr>'}</tbody></table><h2>Оборачиваемость (ABC)</h2><table><thead><tr><th>ABC</th><th>Товар</th><th>Продано</th><th>Остаток</th><th>Без продаж, дней</th><th>Статус</th></tr></thead><tbody>${(()=>{const t=reportsTurnover().slice(0,80);if(!t.length)return '<tr><td colspan="6">Нет данных</td></tr>';return t.map(x=>`<tr><td>${x.abc||''}</td><td>${escapeHtml(x.name)}</td><td>${x.soldQty}</td><td>${x.currentStock}</td><td>${isFinite(x.daysSinceLastSale)?x.daysSinceLastSale:'∞'}</td><td>${statusLabel(x.status)}</td></tr>`).join('');})()}</tbody></table></body></html>`; }

function reportsPrint(){ const html=reportsPrintHtml();try{if(window.Android&&typeof window.Android.printReceipt==='function'){window.Android.printReceipt(html);return;}}catch(e){}const w=window.open('about:blank','_blank');if(!w){showToast('Не удалось открыть отчёт');return;}w.document.open();w.document.write(html);w.document.close(); }

function openReports(){ if(!(activeUser?.role==='admin'||activeUser?.role==='manager')){showToast('Нет доступа');return;}if(!reportsState.from){const d=reportsDefaultPeriod();reportsState.from=d.from;reportsState.to=d.to;}reportsTurnoverFilter='all';reportsRender(); }

function reportsTurnoverHtml(){
  const rows=reportsTurnover();
  const groups={dead:[],slow:[],normal:[],fast:[]};
  rows.forEach(x=>(groups[x.status]||(groups[x.status]=[])).push(x));
  const deadValue=groups.dead.reduce((s,x)=>s+x.currentStock*x.unitCost,0);
  const slowValue=groups.slow.reduce((s,x)=>s+x.currentStock*x.unitCost,0);
  const filtered=reportsTurnoverFilter==='all'?rows:rows.filter(x=>x.status===reportsTurnoverFilter);
  const list=filtered.slice().sort((a,b)=>{const av=isFinite(a.daysSinceLastSale)?a.daysSinceLastSale:1e9;const bv=isFinite(b.daysSinceLastSale)?b.daysSinceLastSale:1e9;return bv-av;}).slice(0,200);
  const card=(label,count,value)=>`<div class="stat-card"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${count}</div><div class="stat-note">${fmtMoney(value)}</div></div>`;
  return `<div class="stat-grid">${card('Мёртвый сток',groups.dead.length,deadValue)}${card('Медленный',groups.slow.length,slowValue)}${card('Норма',groups.normal.length,groups.normal.reduce((s,x)=>s+x.currentStock*x.unitCost,0))}${card('Ходовой',groups.fast.length,groups.fast.reduce((s,x)=>s+x.currentStock*x.unitCost,0))}</div><div class="chip-row" style="margin-bottom:10px;"><button class="chip ${reportsTurnoverFilter==='all'?'active':''}" data-turnover-filter="all">Все</button><button class="chip ${reportsTurnoverFilter==='dead'?'active':''}" data-turnover-filter="dead">${statusLabelShort('dead')}</button><button class="chip ${reportsTurnoverFilter==='slow'?'active':''}" data-turnover-filter="slow">${statusLabelShort('slow')}</button><button class="chip ${reportsTurnoverFilter==='normal'?'active':''}" data-turnover-filter="normal">${statusLabelShort('normal')}</button><button class="chip ${reportsTurnoverFilter==='fast'?'active':''}" data-turnover-filter="fast">${statusLabelShort('fast')}</button></div><div class="panel">${list.length?list.map(x=>`<div class="list-row"><div class="row-icon cat">${escapeHtml(x.abc||'—')}</div><div class="row-main"><div class="row-title">${escapeHtml(x.name)}</div><div class="row-sub">${escapeHtml(x.sku||'')} · продано ${x.soldQty} · остаток ${x.currentStock}</div><div class="row-note" style="color:${statusLabelColor(x.status)}">${statusLabel(x.status)} · ${isFinite(x.daysSinceLastSale)?x.daysSinceLastSale+' дн. без продаж':'нет продаж'}</div></div><div class="row-right"><div class="row-value">${fmtMoney(x.revenue)}</div></div></div>`).join(''):'<div class="panel-body"><div class="empty">Нет данных</div></div>'}</div>`;
}

function reportsRender(){ const root=document.getElementById('modal-root');const {from,to,tab}=reportsState;const c=reportsCalc();const today=todayISO();const yesterday=(()=>{const d=new Date();d.setDate(d.getDate()-1);return d.toISOString().slice(0,10)})();const weekAgo=(()=>{const d=new Date();d.setDate(d.getDate()-6);return d.toISOString().slice(0,10)})();const monthStart=(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10)})();const yearStart=(()=>{const d=new Date();return new Date(d.getFullYear(),0,1).toISOString().slice(0,10)})();const quickBtn=(label,f,t)=>`<button type="button" class="chip ${from===f&&to===t?'active':''}" data-reports-period="${label}" style="min-height:32px;padding:6px 12px;">${label}</button>`;let body='';if(tab==='summary'){const kpi=(l,v,n='')=>`<div class="stat-card"><div class="stat-label">${escapeHtml(l)}</div><div class="stat-value">${v}</div>${n?`<div class="stat-note">${escapeHtml(n)}</div>`:''}</div>`;body=`<div class="stat-grid">${kpi('Продажи',fmtMoney(c.total),`${c.checks} чек(ов)`)}${kpi('Валовая прибыль',fmtMoney(c.grossProfit),`себестоимость ${fmtMoney(c.revenueCost)}`)}${kpi('Средний чек',fmtMoney(c.avg),`${c.qty} товар(ов)`)}${kpi('Возвраты',fmtMoney(c.returnsTotal))}</div><div class="calc-box"><div class="calc-row"><span>Продажи</span><strong>${fmtMoney(c.total)}</strong></div><div class="calc-row"><span>Возвраты</span><strong>− ${fmtMoney(c.returnsTotal)}</strong></div><div class="calc-row final"><span>Итого к сдаче</span><strong>${fmtMoney(c.total-c.returnsTotal)}</strong></div><div class="calc-row"><span>Налог</span><strong>${fmtMoney(c.taxTotal)}</strong></div><div class="calc-row"><span>Комиссия</span><strong>${fmtMoney(c.commissionTotal)}</strong></div><div class="calc-row final"><span>Чистыми</span><strong>${fmtMoney(c.netTotal)}</strong></div></div><div class="panel"><div class="panel-head"><div class="panel-title">Динамика по дням</div></div><div class="panel-body">${(()=>{const days=reportsByDay();if(!days.length)return '<div class="empty">Нет данных</div>';const max=Math.max(1,...days.map(x=>x.total));return days.map(d=>`<div class="bar-row"><div class="bar-label">${escapeHtml(fmtDate(d.date))}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4,d.total/max*100)}%"></div></div><div class="bar-val">${fmtMoney(d.total)}</div></div>`).join('');})()}</div></div>`;}else if(tab==='cashiers'){const rows=reportsByCashier();body=`<div class="panel">${rows.length?rows.map(r=>`<div class="list-row"><div class="row-icon cat">${escapeHtml(initials(r.name))}</div><div class="row-main"><div class="row-title">${escapeHtml(r.name)}</div><div class="row-sub">${r.checks} чек(ов) · ${r.qty} товар(ов) · средний ${fmtMoney(r.checks?r.total/r.checks:0)}</div></div><div class="row-right"><div class="row-value">${fmtMoney(r.total)}</div></div></div>`).join(''):'<div class="panel-body"><div class="empty">Нет данных</div></div>'}</div>`;}else if(tab==='payments'){const rows=reportsByPayment();body=`<div class="panel">${rows.length?rows.map(r=>`<div class="list-row"><div class="row-icon sale">${escapeHtml(paymentLabel(r.method).slice(0,2).toUpperCase())}</div><div class="row-main"><div class="row-title">${escapeHtml(paymentLabel(r.method))}</div><div class="row-sub">${c.total?((r.total/c.total*100).toFixed(1)):0}% от общей суммы</div></div><div class="row-right"><div class="row-value">${fmtMoney(r.total)}</div></div></div>`).join(''):'<div class="panel-body"><div class="empty">Нет данных</div></div>'}</div>`;}else if(tab==='products'){const top=reportsTopProducts(30);body=`<div class="panel">${top.length?top.map(r=>`<div class="list-row"><div class="row-icon cat">${escapeHtml(initials(r.name))}</div><div class="row-main"><div class="row-title">${escapeHtml(r.name)}</div><div class="row-sub">${escapeHtml(r.sku||'')} · продано ${r.qty}</div><div class="row-note profit-value">прибыль ${fmtMoney(r.profit)}</div></div><div class="row-right"><div class="row-value">${fmtMoney(r.revenue)}</div></div></div>`).join(''):'<div class="panel-body"><div class="empty">Нет продаж</div></div>'}</div>`;}else if(tab==='categories'){const rows=reportsByCategory();body=`<div class="panel">${rows.length?rows.map(r=>`<div class="list-row"><div class="row-icon cat">${escapeHtml(initials(r.cat))}</div><div class="row-main"><div class="row-title">${escapeHtml(r.cat)}</div><div class="row-sub">${r.qty} товар(ов) · прибыль ${fmtMoney(r.profit)}</div></div><div class="row-right"><div class="row-value">${fmtMoney(r.revenue)}</div></div></div>`).join(''):'<div class="panel-body"><div class="empty">Нет данных</div></div>'}</div>`;}else if(tab==='turnover'){ body = reportsTurnoverHtml(); }root.innerHTML=`<div class="sheet-overlay" id="reports-ov"><div class="sheet"><div class="sheet-handle"></div><div class="sheet-head"><div class="sheet-title">Отчёты за период</div><button class="sheet-close" id="reports-close">✕</button></div><div class="sheet-body"><div class="form-grid2"><div class="form-field"><label class="form-label">С</label><input class="form-input" type="date" id="reports-from" value="${from}"></div><div class="form-field"><label class="form-label">По</label><input class="form-input" type="date" id="reports-to" value="${to}"></div></div><div class="chip-row" style="margin-bottom:10px;">${quickBtn('Сегодня',today,today)}${quickBtn('Вчера',yesterday,yesterday)}${quickBtn('7 дней',weekAgo,today)}${quickBtn('Месяц',monthStart,today)}${quickBtn('Год',yearStart,today)}</div><div class="seg-tabs"><button class="seg-tab ${tab==='summary'?'active':''}" data-reports-tab="summary">Сводка</button><button class="seg-tab ${tab==='cashiers'?'active':''}" data-reports-tab="cashiers">Кассиры</button><button class="seg-tab ${tab==='payments'?'active':''}" data-reports-tab="payments">Оплаты</button><button class="seg-tab ${tab==='products'?'active':''}" data-reports-tab="products">Товары</button><button class="seg-tab ${tab==='categories'?'active':''}" data-reports-tab="categories">Категории</button><button class="seg-tab ${tab==='turnover'?'active':''}" data-reports-tab="turnover">Оборачиваемость</button></div>${body}</div><div class="sheet-foot" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><button class="btn" id="reports-print">🖨️ Печать</button><button class="btn btn-primary" id="reports-excel">📊 Excel</button></div></div></div>`;const close=()=>root.innerHTML='';document.getElementById('reports-close').onclick=close;document.getElementById('reports-ov').onclick=e=>{if(e.target.id==='reports-ov')close();};const fromEl=document.getElementById('reports-from');const toEl=document.getElementById('reports-to');const applyDates=()=>{const f=fromEl.value||today;const t=toEl.value||today;if(f>t){showToast('Дата «С» не может быть позже даты «По»');return;}reportsState.from=f;reportsState.to=t;reportsRender();};if(fromEl)fromEl.onchange=applyDates;if(toEl)toEl.onchange=applyDates;document.querySelectorAll('[data-reports-period]').forEach(b=>b.onclick=()=>{const label=b.dataset.reportsPeriod;let f=today,t=today;if(label==='Вчера'){f=t=yesterday;}else if(label==='7 дней'){f=weekAgo;}else if(label==='Месяц'){f=monthStart;}else if(label==='Год'){f=yearStart;}reportsState.from=f;reportsState.to=t;reportsRender();});document.querySelectorAll('[data-reports-tab]').forEach(b=>b.onclick=()=>{reportsState.tab=b.dataset.reportsTab;reportsRender();});document.querySelectorAll('[data-turnover-filter]').forEach(b=>b.onclick=()=>{reportsTurnoverFilter=b.dataset.turnoverFilter;reportsRender();});document.getElementById('reports-print').onclick=reportsPrint;document.getElementById('reports-excel').onclick=reportsExportExcel; }
