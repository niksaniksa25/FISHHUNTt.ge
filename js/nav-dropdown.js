(function(){
  'use strict';
  function setupMoreMenu(){
    const trigger=document.getElementById('moreTrigger');
    const menu=document.getElementById('moreMenu');
    if(!trigger||!menu||trigger.dataset.gnMoreBound)return;
    trigger.dataset.gnMoreBound='true';
    trigger.type='button';
    trigger.setAttribute('aria-controls',menu.id);
    const nav=trigger.closest('nav');
    function setOpen(open){
      menu.classList.toggle('open',open);
      trigger.classList.toggle('open',open);
      trigger.setAttribute('aria-expanded',String(open));
      menu.setAttribute('aria-hidden',String(!open));
      menu.inert=!open;
      if(open&&nav&&window.matchMedia('(max-width: 1024px)').matches){
        requestAnimationFrame(()=>{
          if(!menu.classList.contains('open'))return;
          const first=menu.querySelector('a,button');
          const bounds=nav.getBoundingClientRect();
          if(first&&first.getBoundingClientRect().bottom>bounds.bottom){
            // Reveal the expanded section inside the scrolling phone navigation.
            nav.scrollTop+=trigger.getBoundingClientRect().top-bounds.top-12;
          }
        });
      }
    }
    setOpen(menu.classList.contains('open'));
    trigger.addEventListener('click',event=>{
      event.preventDefault();
      setOpen(!menu.classList.contains('open'));
    });
    trigger.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'){
        event.preventDefault();
        setOpen(true);
        menu.querySelector('a,button')?.focus();
      }
    });
    menu.addEventListener('click',event=>{
      if(event.target.closest('a'))setOpen(false);
    });
    document.addEventListener('click',event=>{
      if(!trigger.contains(event.target)&&!menu.contains(event.target))setOpen(false);
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&menu.classList.contains('open')){
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.focus();
      }
    },true);
    if(nav){
      new MutationObserver(()=>{
        if(window.matchMedia('(max-width: 1024px)').matches&&!nav.classList.contains('open'))setOpen(false);
      }).observe(nav,{attributes:true,attributeFilter:['class']});
    }
  }
  function setupHeaderLive(){
    const pill=document.getElementById('headerLivePill');
    if(!pill||pill.dataset.gnLiveBound)return;
    pill.dataset.gnLiveBound='true';
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
  function setup(){setupMoreMenu();setupHeaderLive()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
