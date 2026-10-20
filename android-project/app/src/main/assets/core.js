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
