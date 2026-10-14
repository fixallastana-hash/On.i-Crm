(function(){
  var _origExtracted = window.onProductWebViewExtracted;
  var _origPhotos = window.onProductPhotosDownloaded;
  window.onProductWebViewExtracted = function(desc, specs, url){
    if(window.__oniReviewMode){
      window.__oniReviewDesc = desc || "";
      window.__oniReviewSpecs = specs || "";
      scheduleReviewOpen();
      return;
    }
    if(_origExtracted) _origExtracted(desc, specs, url);
  };
  window.onProductPhotosDownloaded = function(photosJson){
    if(window.__oniReviewMode){
      try{ window.__oniReviewPhotos = JSON.parse(photosJson || "[]"); }catch(e){ window.__oniReviewPhotos = []; }
      window.__oniReviewMain = window.__oniReviewPhotos[0] || "";
      scheduleReviewOpen();
      return;
    }
    if(_origPhotos) _origPhotos(photosJson);
  };
  var _reviewTimer = null;
  function scheduleReviewOpen(){
    if(_reviewTimer) clearTimeout(_reviewTimer);
    _reviewTimer = setTimeout(function(){
      window.__oniReviewMode = false;
      if(typeof window.openReview === "function"){
        window.openReview({
          desc: window.__oniReviewDesc || "",
          specs: window.__oniReviewSpecs || "",
          photos: window.__oniReviewPhotos || [],
          mainPhoto: window.__oniReviewMain || ""
        });
      }
    }, 1500);
  }
  window.__oniApplyReview = function(desc, specs, photosJson){
    var d = desc || "", s = specs || "", p = [];
    try{ p = JSON.parse(photosJson || "[]"); }catch(e){}
    if(_origExtracted) _origExtracted(d, s, "");
    if(p.length && _origPhotos) _origPhotos(JSON.stringify(p));
  };
})();(function(){
var _reviewData={desc:"",specs:"",photos:[],mainPhoto:""};
window.openReview=function(data){
try{
_reviewData={desc:(data&&data.desc)||"",specs:(data&&data.specs)||"",photos:(data&&data.photos)||[],mainPhoto:(data&&data.mainPhoto)||""};
var ov=document.getElementById("review-overlay");if(!ov)return;
var d=document.getElementById("review-desc");if(d)d.value=_reviewData.desc;
var s=document.getElementById("review-specs");if(s)s.value=_reviewData.specs;
renderReviewPhotos();
ov.classList.add("open");
}catch(e){console.error("openReview",e);}
};
window.closeReview=function(){
var ov=document.getElementById("review-overlay");if(ov)ov.classList.remove("open");
};
window.renderReviewPhotos=function(){
var box=document.getElementById("review-photos");if(!box)return;
if(!_reviewData.photos.length){box.innerHTML="<div style=\"color:var(--muted);font-size:13px;\">Фото не найдено</div>";return;}
var html="";
for(var i=0;i<_reviewData.photos.length;i++){
var p=_reviewData.photos[i];
var isMain=(p===_reviewData.mainPhoto)?" main":"";
html+="<div class=\"rv-photo"+isMain+"\" data-idx=\""+i+"\" data-url=\""+String(p).replace(/\"/g,"&quot;")+"\"><img src=\""+p+"\" alt=\"\"><button type=\"button\" class=\"rv-del\" data-act=\"del\">X</button><button type=\"button\" class=\"rv-star\" data-act=\"main\">*</button></div>";
}
box.innerHTML=html;
};
window.resetReview=function(){
_reviewData={desc:"",specs:"",photos:[],mainPhoto:""};
var d=document.getElementById("review-desc");if(d)d.value="";
var s=document.getElementById("review-specs");if(s)s.value="";
renderReviewPhotos();
};
window.applyReview=function(){
try{
var descVal=document.getElementById("review-desc").value||"";
var specsVal=document.getElementById("review-specs").value||"";
var photosJson=JSON.stringify(_reviewData.photos||[]);
if(typeof window.__oniApplyReview === "function"){
window.__oniApplyReview(descVal,specsVal,photosJson);
}
closeReview();
}catch(e){console.error("applyReview",e);}
};
document.addEventListener("click",function(ev){
var t=ev.target;if(!t)return;
if(t.id==="review-close"){closeReview();return;}
if(t.id==="review-del-desc"){var d=document.getElementById("review-desc");if(d)d.value="";return;}
if(t.id==="review-del-specs"){var s=document.getElementById("review-specs");if(s)s.value="";return;}
if(t.id==="review-reset"){resetReview();return;}
if(t.id==="review-apply"){applyReview();return;}
var act=t.getAttribute&&t.getAttribute("data-act");
if(act){
var ph=t.closest?t.closest(".rv-photo"):null;if(!ph)return;
var idx=parseInt(ph.getAttribute("data-idx"),10);
var url=ph.getAttribute("data-url");
if(act==="del"){
var newArr=[];for(var k=0;k<_reviewData.photos.length;k++){if(k!==idx)newArr.push(_reviewData.photos[k]);}
_reviewData.photos=newArr;
if(_reviewData.mainPhoto===url)_reviewData.mainPhoto=(newArr[0]||"");
renderReviewPhotos();
}else if(act==="main"){
_reviewData.mainPhoto=url;
renderReviewPhotos();
}
}
});
})();