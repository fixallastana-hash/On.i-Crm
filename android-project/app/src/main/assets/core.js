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
