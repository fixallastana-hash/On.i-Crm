(function(){
if(window.__oniRvInjected)return;
window.__oniRvInjected=true;
window.__oniRvData={sections:[{name:"Описание",value:""}],photos:[],lastTarget:"Описание"};
window.__oniRvOpen=false;
var css=document.getElementById("oni-rv-style");
if(!css){css=document.createElement("style");css.id="oni-rv-style";
css.textContent="#oni-rv-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:none;}#oni-rv-overlay.open{display:block;}#oni-rv-sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:20px 20px 0 0;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 -6px 24px rgba(0,0,0,0.25);}#oni-rv-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;}#oni-rv-head>div{font-size:16px;font-weight:700;color:#1D2130;}#oni-rv-close{width:32px;height:32px;background:transparent;border:0;font-size:18px;color:#7A8291;cursor:pointer;border-radius:8px;}#oni-rv-body{padding:14px 20px 20px 20px;overflow-y:auto;flex:1;}#oni-rv-langs{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 0 12px 0;border-bottom:1px solid #F0F0F0;margin-bottom:12px;}.oni-rv-lang{padding:6px 12px;border:1px solid #E2E5EA;background:#fff;color:#7A8291;font-size:12px;font-weight:600;cursor:pointer;border-radius:16px;}.oni-rv-lang.active{background:#2F6FED;color:#fff;border-color:#2F6FED;}#oni-rv-body>label{display:block;font-size:12px;font-weight:700;color:#7A8291;margin:16px 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;}.oni-rv-sect{margin-bottom:12px;border:1px solid #E2E5EA;border-radius:12px;padding:10px;background:#FAFBFC;}.oni-rv-sect-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px;}.oni-rv-sect-name{font-size:13px;font-weight:700;color:#1D2130;border:0;background:transparent;outline:none;flex:1;padding:4px 0;}.oni-rv-sect-del{width:24px;height:24px;border-radius:50%;background:#FFE5E5;color:#E1503F;border:0;font-size:14px;cursor:pointer;padding:0;}.oni-rv-sect textarea{display:block;width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #E2E5EA;border-radius:8px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.4;color:#1D2130;background:#fff;resize:vertical;outline:none;min-height:60px;}#oni-rv-add-section{margin-top:6px;padding:8px 14px;background:#E8EFFE;color:#2F6FED;border:1px dashed #2F6FED;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;width:100%;}#oni-rv-photos{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px;}.oni-rv-photo{position:relative;width:88px;height:88px;border-radius:10px;overflow:hidden;background:#F5F6F8;}.oni-rv-del{position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.7);color:#fff;border:0;font-size:13px;cursor:pointer;padding:0;}#oni-rv-actions{display:flex;gap:8px;margin-top:20px;}#oni-rv-actions>button{flex:1;min-height:44px;padding:10px 12px;border-radius:12px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;border:none;}#oni-rv-clean{background:#FFF3E0;color:#8B4513;border:1px solid #FFCC80;}#oni-rv-reset{background:#F5F6F8;color:#1D2130;border:1px solid #E2E5EA;}#oni-rv-apply{background:#2F6FED;color:#fff;}#oni-rv-toast{position:fixed;left:50%;bottom:100px;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:10px 16px;border-radius:20px;font-size:13px;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity 0.2s;}#oni-rv-toast.show{opacity:1;}#oni-rv-popup{position:fixed;left:0;right:0;bottom:0;background:#fff;border-radius:16px 16px 0 0;padding:16px 20px 20px 20px;box-shadow:0 -4px 16px rgba(0,0,0,0.2);z-index:2147483647;display:none;}#oni-rv-popup.open{display:block;}#oni-rv-popup-title{font-size:14px;font-weight:700;color:#1D2130;margin-bottom:10px;}#oni-rv-popup-btns{display:flex;flex-wrap:wrap;gap:8px;}#oni-rv-popup-btns>button{padding:10px 14px;border-radius:20px;border:1px solid #E2E5EA;background:#fff;color:#1D2130;font-size:13px;font-weight:600;cursor:pointer;}#oni-rv-popup-btns>button.primary{background:#2F6FED;color:#fff;border-color:#2F6FED;}#oni-rv-popup-btns>button.danger{background:#FFF3F3;color:#E1503F;border-color:#FFB3B3;}";
document.head.appendChild(css);}
if(!document.getElementById("oni-rv-overlay")){
  var _w=document.createElement("div");
  _w.innerHTML="<div id=\"oni-rv-overlay\"><div id=\"oni-rv-sheet\"><div id=\"oni-rv-head\"><div>Что взять из товара</div><button id=\"oni-rv-close\">X</button></div><div id=\"oni-rv-body\"><div id=\"oni-rv-langs\"><span style=\"font-size:12px;font-weight:700;color:#7A8291;margin-right:8px;\">ЯЗЫК:</span><button class=\"oni-rv-lang\" data-lang=\"auto\">Авто</button><button class=\"oni-rv-lang\" data-lang=\"ru\">RU</button><button class=\"oni-rv-lang active\" data-lang=\"kz\">KZ</button><button class=\"oni-rv-lang\" data-lang=\"both\">RU+KZ</button></div><div id=\"oni-rv-sections\"></div><button id=\"oni-rv-add-section\">+ Добавить секцию</button><label style=\"margin-top:20px;\">ФОТО (<span id=\"oni-rv-count\">0</span>)</label><div id=\"oni-rv-photos\"></div><div id=\"oni-rv-actions\"><button id=\"oni-rv-clean\">Очистить</button><button id=\"oni-rv-reset\">Сброс</button><button id=\"oni-rv-apply\">Применить</button></div></div></div></div><div id=\"oni-rv-toast\"></div><div id=\"oni-rv-popup\"><div id=\"oni-rv-popup-title\">Куда добавить текст?</div><div id=\"oni-rv-popup-btns\"></div></div>";
  while(_w.firstChild)document.body.appendChild(_w.firstChild);
}
function toast(msg){var t=document.getElementById("oni-rv-toast");if(!t)return;t.textContent=msg;t.classList.add("show");clearTimeout(window.__oniRvToastTimer);window.__oniRvToastTimer=setTimeout(function(){t.classList.remove("show");},1800);}
window.__oniRvToast=toast;
function renderSections(){
  var box=document.getElementById("oni-rv-sections");if(!box)return;
  var h="";
  for(var i=0;i<window.__oniRvData.sections.length;i++){
    var s=window.__oniRvData.sections[i];var canDel=i>0;
    h+="<div class=\"oni-rv-sect\"><div class=\"oni-rv-sect-head\"><input class=\"oni-rv-sect-name\" data-i=\""+i+"\" value=\""+String(s.name).replace(/\"/g,"&quot;")+"\""+(canDel?"":" readonly")+">"+(canDel?"<button class=\"oni-rv-sect-del\" data-i=\""+i+"\">X</button>":"")+"</div><textarea data-i=\""+i+"\" placeholder=\"Текст...\">"+String(s.value||"").replace(/</g,"&lt;")+"</textarea></div>";
  }
  box.innerHTML=h;
  var areas=box.querySelectorAll("textarea");
  for(var j=0;j<areas.length;j++){(function(a){a.oninput=function(){var idx=parseInt(a.getAttribute("data-i"),10);window.__oniRvData.sections[idx].value=a.value;};})(areas[j]);}
  var names=box.querySelectorAll(".oni-rv-sect-name");
  for(var k=0;k<names.length;k++){(function(n){n.oninput=function(){var idx=parseInt(n.getAttribute("data-i"),10);window.__oniRvData.sections[idx].name=n.value;};})(names[k]);}
  var dels=box.querySelectorAll(".oni-rv-sect-del");
  for(var d=0;d<dels.length;d++){(function(b){b.onclick=function(ev){ev.stopPropagation();var i=parseInt(b.getAttribute("data-i"),10);window.__oniRvData.sections.splice(i,1);renderSections();};})(dels[d]);}
}
function renderPhotos(){
  var box=document.getElementById("oni-rv-photos");var cnt=document.getElementById("oni-rv-count");
  if(cnt)cnt.textContent=window.__oniRvData.photos.length;
  if(!box)return;
  if(!window.__oniRvData.photos.length){box.innerHTML="<div style=\"color:#888;font-size:13px;\">Двойной тап по фото на сайте</div>";return;}
  var h="";
  for(var i=0;i<window.__oniRvData.photos.length;i++){var p=window.__oniRvData.photos[i];h+="<div class=\"oni-rv-photo\"><img src=\""+String(p).replace(/\"/g,"&quot;")+"\" referrerpolicy=\"no-referrer\" style=\"width:100%;height:100%;object-fit:cover;display:block;\"><button class=\"oni-rv-del\" data-i=\""+i+"\">X</button></div>";}
  box.innerHTML=h;
  var dels=box.querySelectorAll(".oni-rv-del");
  for(var j=0;j<dels.length;j++){(function(btn){btn.onclick=function(ev){ev.stopPropagation();var i=parseInt(btn.getAttribute("data-i"),10);window.__oniRvData.photos.splice(i,1);renderPhotos();};})(dels[j]);}
}
window.__oniRvShow=function(){window.__oniRvOpen=true;var ov=document.getElementById("oni-rv-overlay");if(!ov)return;ov.classList.add("open");renderSections();renderPhotos();};
window.__oniRvHide=function(){window.__oniRvOpen=false;var ov=document.getElementById("oni-rv-overlay");if(ov)ov.classList.remove("open");};
function detectSection(el){var cur=el,_d=0;while(cur&&cur!==document.body&&_d<10){var t=(cur.innerText||"").toLowerCase();if(t.indexOf("характеристик")>=0||t.indexOf("сипаттамалар")>=0||t.indexOf("specification")>=0)return "Характеристики";if(t.indexOf("применени")>=0||t.indexOf("қолдану")>=0||t.indexOf("application")>=0)return "Применение";if(t.indexOf("состав")>=0||t.indexOf("құрам")>=0||t.indexOf("ingredient")>=0)return "Состав";if(t.indexOf("описани")>=0||t.indexOf("сипаттама")>=0||t.indexOf("description")>=0)return "Описание";cur=cur.parentElement;_d++;}return null;}
function addToSection(name,text){
  if(name==="Описание"){var s0=window.__oniRvData.sections[0];s0.value=s0.value?(s0.value+"\n\n"+text):text;return;}
  for(var i=1;i<window.__oniRvData.sections.length;i++){if(window.__oniRvData.sections[i].name===name){var sec=window.__oniRvData.sections[i];sec.value=sec.value?(sec.value+"\n\n"+text):text;return;}}
  window.__oniRvData.sections.push({name:name,value:text});
}
function showPopupForText(txt){
  var pop=document.getElementById("oni-rv-popup");var btns=document.getElementById("oni-rv-popup-btns");
  if(!pop||!btns)return;
  var names=["Описание","Применение","Состав","Характеристики"];
  var html="";
  for(var i=0;i<names.length;i++){html+="<button data-name=\""+names[i]+"\">"+names[i]+"</button>";}
  html+="<button class=\"primary\" data-name=\"__new__\">+ Новое</button>";
  html+="<button class=\"danger\" data-name=\"__cancel__\">Отмена</button>";
  btns.innerHTML=html;
  pop.classList.add("open");
  var all=btns.querySelectorAll("button");
  for(var j=0;j<all.length;j++){(function(b){b.onclick=function(ev){ev.stopPropagation();var n=b.getAttribute("data-name");pop.classList.remove("open");if(n==="__cancel__")return;if(n==="__new__"){var nn=window.prompt("Название секции:");if(!nn||!nn.trim())return;n=nn.trim();}addToSection(n,txt);window.__oniRvData.lastTarget=n;toast("→ "+n);if(window.__oniRvOpen)renderSections();};})(all[j]);}
}
function handleTap(el){
  if(!el)return;
  if(el.tagName==="IMG"){var src=el.currentSrc||el.src;if(!src){toast("Фото без URL");return;}for(var i=0;i<window.__oniRvData.photos.length;i++){if(window.__oniRvData.photos[i]===src){toast("Уже добавлено");return;}}window.__oniRvData.photos.push(src);toast("Фото "+window.__oniRvData.photos.length+": "+String(src).substring(0,60));if(window.__oniRvOpen)renderPhotos();return;}
  var cur=el,txt="";while(cur&&cur!==document.body){var t=(cur.innerText||"").replace(/\s+/g," ").trim();if(t.length>=30&&t.length<=5000){txt=t;break;}cur=cur.parentElement;}
  if(!txt){toast("Тут нет текста");return;}
  var detected=detectSection(el);
  if(detected){addToSection(detected,txt);window.__oniRvData.lastTarget=detected;toast("→ "+detected);if(window.__oniRvOpen)renderSections();return;}
  if(window.__oniRvData.lastTarget&&window.__oniRvData.lastTarget!=="Описание"){addToSection(window.__oniRvData.lastTarget,txt);toast("→ "+window.__oniRvData.lastTarget);if(window.__oniRvOpen)renderSections();return;}
  showPopupForText(txt);
}
var _lastTapTime=0,_lastTapX=0,_lastTapY=0;
var _lpTimer=null,_lpTarget=null,_lpX=0,_lpY=0,_lpFired=false;
document.addEventListener("touchstart",function(ev){
var t=ev.target;if(!t)return;
if(t.closest&&(t.closest("#oni-rv-overlay")||t.closest("#oni-rv-popup")))return;
if(t.tagName!=="IMG")return;
_lpTarget=t;_lpX=ev.touches[0].clientX;_lpY=ev.touches[0].clientY;_lpFired=false;
if(_lpTimer)clearTimeout(_lpTimer);
_lpTimer=setTimeout(function(){_lpTimer=null;_lpFired=true;handleTap(_lpTarget);},600);
},{passive:true});
document.addEventListener("touchmove",function(ev){
if(!_lpTimer)return;
var dx=Math.abs(ev.touches[0].clientX-_lpX);var dy=Math.abs(ev.touches[0].clientY-_lpY);
if(dx>10||dy>10){clearTimeout(_lpTimer);_lpTimer=null;}
},{passive:true});
document.addEventListener("touchend",function(ev){
if(_lpTimer){clearTimeout(_lpTimer);_lpTimer=null;}
if(_lpFired){_lpFired=false;ev.preventDefault();return;}
},{passive:false});
document.addEventListener("touchcancel",function(){if(_lpTimer){clearTimeout(_lpTimer);_lpTimer=null;}},{passive:true});
document.addEventListener("contextmenu",function(ev){ev.preventDefault();return false;},true);
var _style=document.createElement("style");_style.textContent="img,a{-webkit-touch-callout:none !important;-webkit-user-select:none !important;user-select:none !important;}";document.head.appendChild(_style);
var _linkBlockTimer=null;
document.addEventListener("click",function(ev){
var a=ev.target&&ev.target.closest?ev.target.closest("a[href]"):null;
if(!a)return;
if(a.closest("#oni-rv-overlay")||a.closest("#oni-rv-popup"))return;
var now=Date.now();
if(now-_lastTapTime<400){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();return false;}
ev.preventDefault();ev.stopPropagation();
if(_linkBlockTimer)clearTimeout(_linkBlockTimer);
var href=a.href;var target=a.target;
_linkBlockTimer=setTimeout(function(){_linkBlockTimer=null;try{if(target==="_blank"){window.open(href,"_blank");}else{window.location.href=href;}}catch(e){}},400);
return false;
},true);
document.addEventListener("touchend",function(ev){
  var t=ev.target;if(!t)return;
  if(t.closest&&(t.closest("#oni-rv-overlay")||t.closest("#oni-rv-popup")||t.closest("#oni-rv-toast")))return;
  var now=Date.now();var x=ev.changedTouches[0].clientX;var y=ev.changedTouches[0].clientY;
  if(t.tagName==="IMG")return;
if(now-_lastTapTime<350&&Math.abs(x-_lastTapX)<30&&Math.abs(y-_lastTapY)<30){_lastTapTime=0;handleTap(t);return;}
  _lastTapTime=now;_lastTapX=x;_lastTapY=y;
},{passive:true});
document.addEventListener("click",function(ev){
  var t=ev.target;if(!t)return;
  if(t.id==="oni-rv-close"){window.__oniRvHide();return;}
if(t.className&&String(t.className).indexOf("oni-rv-lang")>=0){var _l=t.getAttribute("data-lang");if(_l){var _all=document.querySelectorAll(".oni-rv-lang");for(var _i=0;_i<_all.length;_i++)_all[_i].classList.remove("active");t.classList.add("active");if(window.AndroidWV&&window.AndroidWV.setReviewLang)window.AndroidWV.setReviewLang(_l);toast("Язык: "+_l.toUpperCase());}return;}
  if(t.id==="oni-rv-add-section"){window.__oniRvData.sections.push({name:"Новая секция",value:""});renderSections();return;}
  if(t.id==="oni-rv-clean"){var bad=/kaspi\.kz|wildberries|ozon\.ru|Откроется в новом окне|Действуют Условия|Политика конфиденциальности|Общайтесь с Gemini|Теперь в Google Play/i;for(var i=0;i<window.__oniRvData.sections.length;i++){var lines=String(window.__oniRvData.sections[i].value||"").split("\n").filter(function(x){return x.trim()&&!bad.test(x);});window.__oniRvData.sections[i].value=lines.join("\n").trim();}renderSections();toast("Очищено");return;}
  if(t.id==="oni-rv-reset"){window.__oniRvData={sections:[{name:"Описание",value:""}],photos:[],lastTarget:"Описание"};renderSections();renderPhotos();return;}
  if(t.id==="oni-rv-apply"){
    var out="";
    for(var j=0;j<window.__oniRvData.sections.length;j++){var s=window.__oniRvData.sections[j];var v=String(s.value||"").trim();if(!v)continue;if(j===0){out+=v;}else{out+="\n\n["+s.name.toUpperCase()+"]\n"+v;}}
    var photosJson=JSON.stringify(window.__oniRvData.photos);
    try{if(window.AndroidWV&&window.AndroidWV.onExtracted)window.AndroidWV.onExtracted(out,"",location.href);if(window.__oniRvData.photos.length&&window.AndroidWV&&window.AndroidWV.onPhotosExtracted)window.AndroidWV.onPhotosExtracted(photosJson);}catch(e){console.error("oni-rv-apply",e);}
    window.__oniRvHide();return;
  }
});
if(window.AndroidWV&&window.AndroidWV.toast)window.AndroidWV.toast("inject v2 ready");
})();