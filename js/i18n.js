(function(){'use strict';
function walk(node, map, toEnglish){
  if(node.nodeType===Node.TEXT_NODE){const raw=node.nodeValue;const t=raw.replace(/\s+/g,' ').trim();if(!t)return;let key=t;if(toEnglish && map[key]){node.nodeValue=raw.replace(t,map[key]);} else if(!toEnglish && node.parentElement&&node.parentElement.dataset.gnKa){node.nodeValue=raw.replace(t,node.parentElement.dataset.gnKa)}return;}
  if(node.nodeType!==Node.ELEMENT_NODE || ['SCRIPT','STYLE','NOSCRIPT'].includes(node.tagName))return;
  [...node.childNodes].forEach(n=>walk(n,map,toEnglish));
}
function addToggle(){if(document.getElementById('gnLangToggle'))return;const header=document.querySelector('#nav')||document.querySelector('.header-inner');if(!header)return;const b=document.createElement('button');b.id='gnLangToggle';b.className='gn-lang-toggle';b.type='button';b.textContent=(localStorage.getItem('gn_lang')==='en'?'ქართულად':'EN');b.setAttribute('aria-label','Language');b.onclick=()=>{const en=localStorage.getItem('gn_lang')!=='en';localStorage.setItem('gn_lang',en?'en':'ka');location.reload()};header.appendChild(b);}
function translate(){const en=localStorage.getItem('gn_lang')==='en';const map=window.GN_TRANSLATIONS||{};document.documentElement.lang=en?'en':'ka';
  if(en){const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(n=>{const t=n.nodeValue.replace(/\s+/g,' ').trim();if(map[t] && !n.parentElement.dataset.gnKa){n.parentElement.dataset.gnKa=t;n.nodeValue=n.nodeValue.replace(t,map[t])}})}
  else{document.querySelectorAll('[data-gn-ka]').forEach(el=>{el.childNodes.forEach(n=>{if(n.nodeType===3 && n.nodeValue.trim()===map[el.dataset.gnKa])n.nodeValue=n.nodeValue.replace(map[el.dataset.gnKa],el.dataset.gnKa)})});}
  addToggle();
}
document.addEventListener('DOMContentLoaded',translate);
})();