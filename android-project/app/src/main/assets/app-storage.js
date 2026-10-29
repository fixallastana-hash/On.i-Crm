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

/* =========================================================================
 * SENIOR-PATCH-b2-storage-fallback
 * IndexedDB -> localStorage fallback. Namespace: oni_ls_*
 * ========================================================================= */
(function () {
  'use strict';
  var LS_PREFIX = 'oni_ls_';
  var _idbProbe = (function () {
    try { return typeof indexedDB !== 'undefined' && indexedDB !== null; }
    catch (e) { return false; }
  })();
  function _lsKey(k) { return LS_PREFIX + k; }
  function _notifySaveFail(key) {
    try {
      if (typeof window.oniToast === 'function') {
        window.oniToast('\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f: ' + key);
      } else if (window.console) { console.error('[safeStorageSet] failed', key); }
    } catch (_) {}
  }
  function safeStorageSet(key, value) {
    if (_idbProbe && typeof idbSet === 'function') {
      try {
        var r = idbSet(key, value);
        if (r === true) { try { localStorage.removeItem(_lsKey(key)); } catch (_) {} return true; }
        if (r && typeof r.then === 'function') {
          try { localStorage.setItem(_lsKey(key), value); } catch (_) {}
          r.then(function (ok) { if (ok === true) { try { localStorage.removeItem(_lsKey(key)); } catch (_) {} } }).catch(function () {});
          return true;
        }
      } catch (e) {}
    }
    try { localStorage.setItem(_lsKey(key), value); return true; }
    catch (e) { _notifySaveFail(key); return false; }
  }
  function safeStorageGet(key) {
    if (_idbProbe && typeof idbGet === 'function') {
      try {
        var v = idbGet(key);
        if (v !== null && v !== undefined && typeof v.then !== 'function') return v;
      } catch (e) {}
    }
    try { return localStorage.getItem(_lsKey(key)); }
    catch (e) { return null; }
  }
  function safeStorageDelete(key) {
    var ok = true;
    if (_idbProbe && typeof idbDelete === 'function') {
      try {
        var r = idbDelete(key);
        if (r === false) ok = false;
        else if (r && typeof r.then === 'function') r.catch(function () { ok = false; });
      } catch (e) { ok = false; }
    }
    try { localStorage.removeItem(_lsKey(key)); } catch (e) { ok = false; }
    return ok;
  }
  (function migrateLsToIdb() {
    if (!_idbProbe || typeof idbSet !== 'function') return;
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0) keys.push(k);
      }
    } catch (e) { return; }
    keys.forEach(function (k) {
      try {
        var rawKey = k.slice(LS_PREFIX.length);
        var val = localStorage.getItem(k);
        if (val == null) return;
        var r = idbSet(rawKey, val);
        var ack = function (ok) { if (ok === true) { try { localStorage.removeItem(k); } catch (_) {} } };
        if (r === true) ack(true);
        else if (r && typeof r.then === 'function') r.then(ack).catch(function () {});
      } catch (e) {}
    });
  })();
  if (!_idbProbe) { try { console.warn('[B.2] IndexedDB unavailable - using localStorage fallback'); } catch (_) {} }
  window.safeStorageSet    = safeStorageSet;
  window.safeStorageGet    = safeStorageGet;
  window.safeStorageDelete = safeStorageDelete;
})();
/* end SENIOR-PATCH-b2-storage-fallback */
/* end app-storage.js (SENIOR-PATCH-b1-storage) */
