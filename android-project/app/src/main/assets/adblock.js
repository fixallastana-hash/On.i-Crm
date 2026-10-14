(function(){
if(window.__oniAdblockV1)return;
window.__oniAdblockV1=true;

var AD_SELECTORS=[
'ins.adsbygoogle',
'iframe[src*="doubleclick"]',
'iframe[src*="googlesyndication"]',
'iframe[src*="googleads"]',
'iframe[src*="adservice"]',
'[class*="ad-banner"]',
'[class*="ad_banner"]',
'[class*="adsbygoogle"]',
'[id*="google_ads"]',
'[data-ad-slot]',
'[class*="advertisement"]',
'[class*="advert-"]',
'[class*="advert_"]',
'[id^="advert"]',
'[id*="_advert"]',
'[class*="banner-ad"]',
'[class*="banner_ad"]',
'[class*="promo-banner"]',
'[class*="sponsored-"]',
'[class*="sponsored_"]',
'[aria-label*="Advertisement"]',
'[aria-label*="Реклама"]'
];

function stripAds(){
  for(var i=0;i<AD_SELECTORS.length;i++){
    try{
      var els=document.querySelectorAll(AD_SELECTORS[i]);
      for(var j=0;j<els.length;j++){els[j].style.display="none";}
    }catch(e){}
  }
}

stripAds();
try{
  var mo=new MutationObserver(function(){stripAds();});
  mo.observe(document.documentElement,{childList:true,subtree:true});
}catch(e){
  setInterval(stripAds,2000);
}

try{
  var host=(location.hostname||"").toLowerCase();
  var redirects={
    "fragrantica.ru":"m.fragrantica.ru",
    "www.fragrantica.ru":"m.fragrantica.ru",
    "fragrantica.com":"m.fragrantica.com",
    "www.fragrantica.com":"m.fragrantica.com"
  };
  var target=redirects[host];
  if(target){
    var newUrl=location.protocol+"//"+target+location.pathname+location.search;
    if(location.href!==newUrl){
      location.replace(newUrl);
      return;
    }
  }
}catch(e){}

})();