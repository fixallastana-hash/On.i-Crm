/* app-storage.js - extracted from index.html (SENIOR-PATCH-b1-storage) */
/* ===================== STORAGE ===================== */
/*
  Надёжное сохранение данных:
  1) Сначала используем встроенное window.storage, если оно доступно.
  2) Если оно недоступно/не работает — используем localStorage браузера.
  Это предотвращает сброс товаров после обновления страницы.
*/
const IDB_NAME='sklad_crm_db_v3';
const IDB_STORE='kv';
const BACKUP_KEY='__full_backup__';
const BACKUP_TS_KEY='__backup_ts__';
var _idbPromise=null;
var _saveTimer=null;
var _saveBusy=false;
var _excelOutsideClickHandler=null;
var _backupFailCount=0;
var _backupQueued=false;

// P1-1: namespaced localStorage keys.
// tombstones belong to the shop, carts belong to the user.
function _lsShopId(){
  try{ return (typeof FB_SHOP_ID !== 'undefined' && FB_SHOP_ID) ? FB_SHOP_ID : 'default'; }
  catch(e){ return 'default'; }
}
function _lsUserId(){
  try{ return (typeof activeUser !== 'undefined' && activeUser && activeUser.id) ? activeUser.id : '_anon'; }
  catch(e){ return '_anon'; }
}
function _lsTombKey(){ return 'sklad_crm_' + _lsShopId() + '_recent_deletes'; }
function _lsUserDelKey(){ return 'sklad_crm_' + _lsShopId() + '_user_deletes'; }
function _lsTombSyncedKey(){ return 'sklad_crm_' + _lsShopId() + '_tombstones_synced'; }
function _lsCartKey(){ return 'oni_carts_' + _lsUserId(); }
function _migrateP11Keys(){
  try{
    var newTomb = _lsTombKey();
    var oldTomb = 'sklad_crm_recent_deletes';
    if(!localStorage.getItem(newTomb) && localStorage.getItem(oldTomb)){
      localStorage.setItem(newTomb, localStorage.getItem(oldTomb));
    }
    var newSync = _lsTombSyncedKey();
    var oldSync = 'sklad_crm_tombstones_synced';
    if(!localStorage.getItem(newSync) && localStorage.getItem(oldSync)){
      localStorage.setItem(newSync, localStorage.getItem(oldSync));
    }
    var newCart = _lsCartKey();
    var oldCart = 'oni_carts';
    if(!localStorage.getItem(newCart) && localStorage.getItem(oldCart)){
      localStorage.setItem(newCart, localStorage.getItem(oldCart));
    }
  }catch(e){}
}


const CRM_BACKUP_VERSION=6;



window.addEventListener('pagehide',()=>{ try{ saveUiState(); }catch(e){} });
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'){ try{ saveUiState(); }catch(e){} } });

/* end app-storage.js (SENIOR-PATCH-b1-storage) */
