/* Dedicated phone presentation; keep original controls, data and desktop nodes. */
(function () {
  'use strict';
  const compact = window.matchMedia('(max-width:767px), (max-width:1024px) and (max-height:500px)');
  let english = document.documentElement.lang === 'en';
  try { english = english || localStorage.getItem('gn_lang') === 'en'; } catch {}
  const introPages = new Set(['index.html','fishing.html','hunting.html','catalog.html','fishing-guide.html']);
  let disclosures = [];
  let lists = [];
  let heading = null;
  const phoneTitles = {'weather.html':['ამინდი','Weather'],'fishing.html':['თევზაობა','Fishing'],'hunting.html':['ნადირობა','Hunting'],'catalog.html':['სახეობების კატალოგი','Species catalog'],'fishing-guide.html':['გასვლის გზამკვლევი','Outdoor guide']};

  function updateHeading(phone) {
    if (!phone) {
      if (heading) heading.element.replaceChildren(...heading.nodes);
      heading = null;
      return;
    }
    if (heading) return;
    const title = phoneTitles[location.pathname.split('/').pop()];
    const element = document.querySelector('main h1');
    if (!title || !element || element.closest('.gn-premium-gate')) return;
    heading = {element,nodes:[...element.childNodes]};
    element.textContent = title[english ? 1 : 0];
  }

  function mountIntros() {
    if (disclosures.length) return;
    const page = location.pathname.split('/').pop() || 'index.html';
    if (!introPages.has(page)) return;
    const paragraphs = document.querySelectorAll('main .hero-copy>p:not([id]), main .fish-hero-grid>div>p:not([id]), main .page-head>.container>p:not([id]), main .fg-hero-grid>div>p:not([id])');
    const parents = new Map();
    for (const paragraph of paragraphs) {
      if (paragraph.hasAttribute('role') || paragraph.closest('[hidden],.gn-premium-gate')) continue;
      let group = parents.get(paragraph.parentElement);
      if (!group) {
        const details = document.createElement('details');
        details.className = 'gn-phone-intro';
        const summary = document.createElement('summary');
        summary.textContent = english ? 'About this page' : 'გვერდის შესახებ';
        details.appendChild(summary);
        paragraph.before(details);
        group = {details, items: []};
        parents.set(paragraph.parentElement, group);
        disclosures.push(group);
      }
      const anchor = document.createComment('phone-intro-location');
      paragraph.before(anchor);
      group.items.push({paragraph, anchor});
      group.details.appendChild(paragraph);
    }
  }

  function restoreIntros() {
    for (const group of disclosures) {
      for (const {paragraph, anchor} of group.items) {
        if (anchor.parentNode) anchor.parentNode.replaceChild(paragraph, anchor);
      }
      group.details.remove();
    }
    disclosures = [];
  }

  function mountLists() {
    if (lists.length) return;
    const grids = document.querySelectorAll('main .fish-results,main .hunt-results,main .catalog-results,main .location-grid,main .fg-grid');
    for (const grid of grids) {
      const controls = document.createElement('div');
      controls.className = 'gn-phone-list-controls';
      const count = document.createElement('p');
      count.className = 'gn-phone-list-count';
      count.setAttribute('aria-live','polite');
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn primary';
      const all = document.createElement('button');
      all.type = 'button';
      all.className = 'btn ghost';
      if (grid.id) { more.setAttribute('aria-controls',grid.id); all.setAttribute('aria-controls',grid.id); }
      controls.append(count,more,all);
      grid.after(controls);
      const state = {grid,controls,more,all,count,cards:[],limit:12,observer:null};
      function render() {
        const cards = [...grid.children].filter(node=>node.matches('.fish-card,.catalog-card,.location-card,.fg-card'));
        if (cards.length!==state.cards.length || cards.some(card=>!state.cards.includes(card))) state.limit=12;
        state.cards=cards;
        let shown=0;
        for (const [index,card] of cards.entries()) {
          const keep=index<state.limit || card.getAttribute('aria-pressed')==='true' || card.contains(document.activeElement);
          card.toggleAttribute('data-gn-phone-list-hidden',!keep);
          card.classList.add('gn-phone-list-item');
          if (keep) shown++;
        }
        controls.hidden=cards.length<=12;
        count.textContent=(english ? 'Showing ' : 'ნაჩვენებია ')+shown+' / '+cards.length;
        more.hidden=shown>=cards.length;
        all.hidden=shown>=cards.length;
        more.textContent=(english ? 'Show ' : 'კიდევ ')+Math.min(12,Math.max(0,cards.length-state.limit))+(english ? ' more' : '');
        all.textContent=(english ? 'View all (' : 'ყველას ნახვა (')+cards.length+')';
      }
      function reveal(limit,event) {
        const first=state.cards.find(card=>card.hasAttribute('data-gn-phone-list-hidden'));
        state.limit=limit;
        render();
        if (first) {
          if (event.detail===0 && typeof first.focus==='function') first.focus({preventScroll:true});
          first.scrollIntoView({block:'start',behavior:'auto'});
        }
      }
      more.addEventListener('click',event=>reveal(state.limit+12,event));
      all.addEventListener('click',event=>reveal(Infinity,event));
      state.observer=new MutationObserver(render);
      state.observer.observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed']});
      lists.push(state);
      render();
    }
  }

  function restoreLists() {
    for (const state of lists) {
      state.observer.disconnect();
      for (const card of state.cards) {
        card.removeAttribute('data-gn-phone-list-hidden');
        card.classList.remove('gn-phone-list-item');
      }
      state.controls.remove();
    }
    lists=[];
  }

  function update() {
    if (!document.body) return;
    document.body.classList.toggle('gn-phone-layout', compact.matches);
    updateHeading(compact.matches);
    if (compact.matches) { mountIntros(); mountLists(); }
    else { restoreIntros(); restoreLists(); }
  }
  if (compact.addEventListener) compact.addEventListener('change', update);
  else compact.addListener(update);
  // Deferred assets run before the existing DOMContentLoaded language setup.
  const beforeReady = document.readyState === 'loading' || (document.readyState === 'interactive' && document.currentScript?.defer);
  if (beforeReady) document.addEventListener('DOMContentLoaded', update, {once:true});
  else update();
})();
