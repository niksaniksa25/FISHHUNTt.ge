(function(){
  function updateDeviceClass(){
    const ua=navigator.userAgent||'';
    const sw=Math.min(screen.width,screen.height);
    const vh=Math.min(window.innerWidth,window.innerHeight);
    const isIOS=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const isAndroid=/Android/i.test(ua);
    const tablet=(Math.max(screen.width,screen.height)>=600 && Math.min(screen.width,screen.height)>=600)||/Tablet|iPad/i.test(ua);
    document.body.classList.remove('device-ios','device-android','device-tablet','device-desktop');
    document.body.classList.add(isIOS?'device-ios':isAndroid?'device-android':tablet?'device-tablet':'device-desktop');
    document.body.dataset.viewport=window.innerWidth>=1025?'desktop':window.innerWidth>=769?'tablet':'phone';
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',updateDeviceClass,{once:true}); else updateDeviceClass();
  let timer=null;
  window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(updateDeviceClass,120);},{passive:true});
})();