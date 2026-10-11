(function(){
  'use strict';
  const EPOCH=Date.parse('2000-01-06T18:14:00Z'), SYN=29.53058867;
  function phase(dateLike){
    const d=new Date(dateLike||Date.now());
    const age=((((d.getTime()-EPOCH)/86400000)%SYN)+SYN)%SYN;
    const p=age/SYN, illum=(1-Math.cos(p*2*Math.PI))/2*100;
    let label,icon,index;
    if(age<1.8456618){label='ახალი მთვარე';icon='🌑';index=0;}
    else if(age<5.5369854){label='მზარდი ნამგალა';icon='🌒';index=1;}
    else if(age<9.2283090){label='პირველი მეოთხედი';icon='🌓';index=2;}
    else if(age<12.9196326){label='მზარდი გიბუსი';icon='🌔';index=3;}
    else if(age<16.6109562){label='სავსე მთვარე';icon='🌕';index=4;}
    else if(age<20.3022798){label='კლებადი გიბუსი';icon='🌖';index=5;}
    else if(age<23.9936034){label='ბოლო მეოთხედი';icon='🌗';index=6;}
    else {label='კლებადი ნამგალა';icon='🌘';index=7;}
    const q=SYN/4, majors=[{age:0,label:'ახალი მთვარე',icon:'🌑'},{age:q,label:'პირველი მეოთხედი',icon:'🌓'},{age:2*q,label:'სავსე მთვარე',icon:'🌕'},{age:3*q,label:'ბოლო მეოთხედი',icon:'🌗'}];
    let next=majors.find(m=>m.age>age);
    const days=next?next.age-age:SYN-age;
    if(!next) next=majors[0];
    const nextDate=new Date(d.getTime()+days*86400000);
    return {date:d,age,illum,label,icon,index,waxing:index>0&&index<4,nextLabel:next.label,nextIcon:next.icon,nextDate,daysToNext:days};
  }
  const set=(id,val)=>{const e=document.getElementById(id);if(e)e.textContent=val};
  const fmt=d=>new Date(d).toLocaleDateString('ka-GE',{day:'numeric',month:'long'});
  function render(dateLike){
    const m=phase(dateLike);
    set('homeMoonIcon',m.icon);set('homeMoonPhase',m.label);set('homeMoonIllum',`${Math.round(m.illum)}%`);
    set('homeMoonAge',`${m.age.toFixed(1)} დღე`);set('homeMoonNext',`${m.nextIcon} ${m.nextLabel} • ${fmt(m.nextDate)}`);
    set('moonMainIcon',m.icon);set('moonMainPhase',m.label);set('moonMainIllum',`${m.illum.toFixed(1)}%`);
    set('moonMainAge',`${m.age.toFixed(2)} დღე`);set('moonWaxing',m.waxing?'მზარდი':'კლებადი');
    set('moonNext',`${m.nextIcon} ${m.nextLabel} — ${fmt(m.nextDate)} (~${m.daysToNext.toFixed(1)} დღე)`);
    set('moonPhaseAngle',`${(m.age/SYN*360).toFixed(1)}°`);
    return m;
  }
  window.GeoNatureMoon={phase,render};
  document.addEventListener('DOMContentLoaded',()=>{
    render();
    setInterval(()=>render(),60000);
    const h=document.getElementById('homeSelectedTime'),d=document.getElementById('homeDateSelect');
    if(h&&d){
      const sync=()=>{const ts=h.textContent.match(/\\b(\\d{2}:\\d{2})\\b/);if(ts&&d.value)render(`${d.value}T${ts[1]}:00`);};
      new MutationObserver(sync).observe(h,{childList:true,characterData:true,subtree:true});
      d.addEventListener('change',()=>setTimeout(sync,50));
    }
  });
})();