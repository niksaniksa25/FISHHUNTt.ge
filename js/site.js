document.addEventListener('DOMContentLoaded', function(){
  const menu=document.getElementById('menuBtn');
  const nav=document.getElementById('nav');
  if(menu && nav){ menu.addEventListener('click',()=>nav.classList.toggle('open')); }
  function addTopLink(href,text,afterHref){
    if(!nav||nav.querySelector(`a[href="${href}"]`))return;
    const link=document.createElement('a'); link.href=href; link.textContent=text;
    if(location.pathname.endsWith(href)) link.className='active';
    const after=nav.querySelector(`a[href="${afterHref}"]`);
    if(after) after.insertAdjacentElement('afterend',link); else nav.appendChild(link);
  }
  addTopLink('hunting.html','🦌 ნადირობა','fishing.html');
  addTopLink('forests.html','🌲 ტყეები','hunting.html');
  addTopLink('red-book.html','📕 წითელი წიგნი','forests.html');
  addTopLink('donate.html','❤️ დონაცია','red-book.html');
  if(nav && !nav.querySelector('a[href="dashboard.html"]')){
    const link=document.createElement('a'); link.href='dashboard.html'; link.textContent='👤 ჩემი GeoNature';
    if(location.pathname.endsWith('dashboard.html')) link.className='active';
    nav.appendChild(link);
  }
  const more=document.getElementById('moreMenu');
  if(more){
    const title=more.querySelector('.more-group-title');
    function addMore(href,icon,label,sub){if(more.querySelector(`a[href="${href}"]`))return;const a=document.createElement('a');a.className='more-item';a.href=href;a.innerHTML=`<span class="mi">${icon}</span><span class="mt">${label}<small>${sub}</small></span>`;if(title)title.after(a);else more.prepend(a);}
    addMore('forests.html','🌲','ტყეების Explorer','ტყე → ბინადრები');
    addMore('red-book.html','📕','წითელი წიგნი','დაცული სახეობების ცნობარი');
  }
});
