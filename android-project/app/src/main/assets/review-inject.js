(function(){
if(window.__oniRvInjected)return;
window.__oniRvInjected=true;
window.__oniRvData={desc:"",specs:"",photos:[]};
window.__oniRvOpen=false;

var css=document.getElementById("oni-rv-style");
if(!css){
  css=document.createElement("style");
  css.id="oni-rv-style";
  css.textContent="#oni-rv-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483647;display:none;}#oni-rv-overlay.open{display:block;}#oni-rv-sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:20px 20px 0 0;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 -6px 24px rgba(0,0,0,0.25);}#oni-rv-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;}#oni-rv-head>div{font-size:16px;font-weight:700;color:#1D2130;}#oni-rv-close{width:32px;height:32px;background:transparent;border:0;font-size:18px;color:#7A8291;cursor:pointer;border-radius:8px;}#oni-rv-body{padding:14px 20px 20px 20px;overflow-y:auto;flex:1;}#oni-rv-body>label{display:block;font-size:12px;font-weight:700;color:#7A8291;margin:16px 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;}#oni-rv-body>label:first-child{margin-top:0;}#oni-rv-desc,#oni-rv-specs{display:block;width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #E2E5EA;border-radius:10px;font-family:system-ui,sans-serif;font-size:14px;line-height:1.45;color:#1D2130;background:#fff;resize:vertical;outline:none;min-height:80px;}#oni-rv-photos{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px;}.oni-rv-photo{position:relative;width:88px;height:88px;border-radius:10px;overflow:hidden;background:#F5F6F8;}.oni-rv-del{position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,0.7);color:#fff;border:0;font-size:13px;cursor:pointer;padding:0;}#oni-rv-actions{display:flex;gap:10px;margin-top:22px;}#oni-rv-actions>button{flex:1;min-height:48px;padding:12px 16px;border-radius:12px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;border:none;}#oni-rv-reset{background:#F5F6F8;color:#1D2130;border:1px solid #E2E5EA;}#oni-rv-apply{background:#2F6FED;color:#fff;}#oni-rv-toast{position:fixed;left:50%;bottom:100px;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:10px 16px;border-radius:20px;font-size:13px;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity 0.2s;}#oni-rv-toast.show{opacity:1;}";
  document.head.appendChild(css);
}

if(!document.getElementById("oni-rv-overlay")){
  var _w=document.createElement("div");
  _w.innerHTML="<div id=\"oni-rv-overlay\"><div id=\"oni-rv-sheet\"><div id=\"oni-rv-head\"><div>Что взять из товара</div><button id=\"oni-rv-close\">X</button></div><div id=\"oni-rv-body\"><label>ОПИСАНИЕ</label><textarea id=\"oni-rv-desc\"></textarea><label>ХАРАКТЕРИСТИКИ</label><textarea id=\"oni-rv-specs\"></textarea><label>ФОТО (<span id=\"oni-rv-count\">0</span>)</label><div id=\"oni-rv-photos\"></div><div id=\"oni-rv-actions\"><button id=\"oni-rv-reset\">Сброс</button><button id=\"oni-rv-apply\">Применить</button></div></div></div></div><div id=\"oni-rv-toast\"></div>";
  while(_w.firstChild)document.body.appendChild(_w.firstChild);
}

function toast(msg){
  var t=document.getElementById("oni-rv-toast");if(!t)return;
  t.textContent=msg;t.classList.add("show");
  clearTimeout(window.__oniRvToastTimer);
  window.__oniRvToastTimer=setTimeout(function(){t.classList.remove("show");},1800);
}
window.__oniRvToast=toast;

function renderPhotos(){
  var box=document.getElementById("oni-rv-photos");
  var cnt=document.getElementById("oni-rv-count");
  if(cnt)cnt.textContent=window.__oniRvData.photos.length;
  if(!box)return;
  if(!window.__oniRvData.photos.length){
    box.innerHTML="<div style=\"color:#888;font-size:13px;\">Долго нажми на фото на сайте</div>";
    return;
  }
  var h="";
  for(var i=0;i<window.__oniRvData.photos.length;i++){
    var p=window.__oniRvData.photos[i];
    h+="<div class=\"oni-rv-photo\"><img src=\""+String(p).replace(/\"/g,"&quot;")+"\" style=\"width:100%;height:100%;object-fit:cover;display:block;\"><button class=\"oni-rv-del\" data-i=\""+i+"\">X</button></div>";
  }
  box.innerHTML=h;
  var dels=box.querySelectorAll(".oni-rv-del");
  for(var j=0;j<dels.length;j++){
    (function(btn){btn.onclick=function(ev){ev.stopPropagation();var i=parseInt(btn.getAttribute("data-i"),10);window.__oniRvData.photos.splice(i,1);renderPhotos();};})(dels[j]);
  }
}

function fillFields(){
  var d=document.getElementById("oni-rv-desc");
  var s=document.getElementById("oni-rv-specs");
  if(d)d.value=window.__oniRvData.desc;
  if(s)s.value=window.__oniRvData.specs;
}

window.__oniRvShow=function(){
  if(window.AndroidWV&&window.AndroidWV.toast)window.AndroidWV.toast("show called");
  window.__oniRvOpen=true;
  var ov=document.getElementById("oni-rv-overlay");
  if(!ov){
    if(window.AndroidWV&&window.AndroidWV.toast)window.AndroidWV.toast("NO OVERLAY");
    return;
  }
  ov.classList.add("open");
  fillFields();
  renderPhotos();
  if(window.AndroidWV&&window.AndroidWV.toast)window.AndroidWV.toast("show OK");
};

window.__oniRvHide=function(){
  window.__oniRvOpen=false;
  var ov=document.getElementById("oni-rv-overlay");
  if(ov)ov.classList.remove("open");
};

var _lpTimer=null,_lpTarget=null,_lpX=0,_lpY=0;
document.addEventListener("touchstart",function(ev){
  var t=ev.target;if(!t)return;
  if(t.closest&&t.closest("#oni-rv-overlay"))return;
  _lpTarget=t;_lpX=ev.touches[0].clientX;_lpY=ev.touches[0].clientY;
  if(_lpTimer)clearTimeout(_lpTimer);
  _lpTimer=setTimeout(function(){_lpTimer=null;handleLP(_lpTarget);},600);
},{passive:true});
document.addEventListener("touchmove",function(ev){
  if(!_lpTimer)return;
  var dx=Math.abs(ev.touches[0].clientX-_lpX);
  var dy=Math.abs(ev.touches[0].clientY-_lpY);
  if(dx>10||dy>10){clearTimeout(_lpTimer);_lpTimer=null;}
},{passive:true});
document.addEventListener("touchend",function(){if(_lpTimer){clearTimeout(_lpTimer);_lpTimer=null;}},{passive:true});
document.addEventListener("touchcancel",function(){if(_lpTimer){clearTimeout(_lpTimer);_lpTimer=null;}},{passive:true});

function handleLP(el){
  if(!el)return;
  if(el.tagName==="IMG"){
    var src=el.currentSrc||el.src;
    if(!src){toast("Фото без URL");return;}
    for(var i=0;i<window.__oniRvData.photos.length;i++){
      if(window.__oniRvData.photos[i]===src){toast("Уже добавлено");return;}
    }
    window.__oniRvData.photos.push(src);
    toast("Фото добавлено ("+window.__oniRvData.photos.length+")");
    if(window.__oniRvOpen)renderPhotos();
    return;
  }
  var cur=el,txt="";
  while(cur&&cur!==document.body){
    var t=(cur.innerText||"").replace(/\s+/g," ").trim();
    if(t.length>=30&&t.length<=5000){txt=t;break;}
    cur=cur.parentElement;
  }
  if(!txt){toast("Тут нет текста");return;}
  var isDesc=window.confirm("Добавить в ОПИСАНИЕ?\n\nOK = Описание, Отмена = Характеристики");
  if(isDesc){
    window.__oniRvData.desc=window.__oniRvData.desc?(window.__oniRvData.desc+"\n\n"+txt):txt;
    toast("Добавлено в описание");
  }else{
    window.__oniRvData.specs=window.__oniRvData.specs?(window.__oniRvData.specs+"\n\n"+txt):txt;
    toast("Добавлено в характеристики");
  }
}

document.addEventListener("click",function(ev){
  var t=ev.target;if(!t)return;
  if(t.id==="oni-rv-close"){window.__oniRvHide();return;}
  if(t.id==="oni-rv-reset"){
    window.__oniRvData={desc:"",specs:"",photos:[]};
    fillFields();renderPhotos();return;
  }
  if(t.id==="oni-rv-apply"){
    var d=(document.getElementById("oni-rv-desc").value||"").trim();
    var s=(document.getElementById("oni-rv-specs").value||"").trim();
    var photosJson=JSON.stringify(window.__oniRvData.photos);
    try{
      if(window.AndroidWV&&window.AndroidWV.onExtracted)window.AndroidWV.onExtracted(d,s,location.href);
      if(window.__oniRvData.photos.length&&window.AndroidWV&&window.AndroidWV.onPhotosExtracted)window.AndroidWV.onPhotosExtracted(photosJson);
    }catch(e){console.error("oni-rv-apply",e);}
    window.__oniRvHide();
    return;
  }
});

if(window.AndroidWV&&window.AndroidWV.toast)window.AndroidWV.toast("inject ready");
})();