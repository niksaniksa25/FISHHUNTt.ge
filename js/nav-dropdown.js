(function(){
  'use strict';
  function closeMenu(){
    document.querySelectorAll('.more-menu.open').forEach(m=>m.classList.remove('open'));
    document.querySelectorAll('.more-trigger.open').forEach(b=>b.classList.remove('open'));
  }
  function setupMoreMenu(){
    const trigger=document.getElementById('moreTrigger');
    const menu=document.getElementById('moreMenu');
    if(!trigger||!menu)return;
    trigger.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const open=menu.classList.toggle('open');trigger.classList.toggle('open',open)});
    menu.addEventListener('click',e=>e.stopPropagation());
    document.addEventListener('click',closeMenu);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
  }
  function setupHeaderLive(){
    const pill=document.getElementById('headerLivePill');
    if(!pill)return;
    const dot=pill.querySelector('i');
    const text=pill.querySelector('span');
    let on=true;
    setInterval(()=>{
      on=!on;
      if(dot)dot.style.opacity=on?'1':'.55';
      if(text)text.textContent=on?'LIVE':'LIVE • ამოწმებს';
      setTimeout(()=>{on=true;if(dot)dot.style.opacity='1';if(text)text.textContent='LIVE'},700);
    },5000);
  }
  document.addEventListener('DOMContentLoaded',()=>{setupMoreMenu();setupHeaderLive()});
})();
