(function(){
  const memory = new Map();
  const pending = new Map();
  const requestQueue = [];
  const MAX_REQUESTS = 4, REQUEST_TIMEOUT = 8000, LOOKUP_TIMEOUT = 16000;
  let activeRequests = 0;

  function cachedLookup(key, lookup, fallback){
    const cached=memory.get(key);
    if(cached&&cached.expires>Date.now())return Promise.resolve(cached.value);
    if(pending.has(key))return pending.get(key);
    const deadline=Date.now()+LOOKUP_TIMEOUT;
    const work=Promise.resolve().then(()=>lookup(deadline)).catch(()=>fallback()).then(value=>{
      const success=Array.isArray(value)?value.length>0:validImage(value);
      memory.set(key,{value,expires:Date.now()+(success?6*60*60*1000:60*1000)});
      return value;
    }).finally(()=>pending.delete(key));
    pending.set(key,work);
    return work;
  }

  function queuedJson(url, signal){
    return new Promise((resolve,reject)=>{
      const abort=()=>{
        const index=requestQueue.indexOf(start);
        if(index>=0)requestQueue.splice(index,1);
        reject(new Error('Image lookup timed out'));
      };
      const start=()=>{
        if(signal.aborted){abort();return;}
        activeRequests++;
        Promise.resolve().then(()=>fetch(url,{headers:{Accept:'application/json'},signal})).then(response=>{
          if(!response.ok)throw new Error('Image lookup unavailable');
          return response.json();
        }).then(resolve,reject).finally(()=>{
          signal.removeEventListener('abort',abort);
          activeRequests--;
          requestQueue.shift()?.();
        });
      };
      signal.addEventListener('abort',abort,{once:true});
      if(signal.aborted){abort();signal.removeEventListener('abort',abort);return;}
      if(activeRequests<MAX_REQUESTS)start();else requestQueue.push(start);
    });
  }

  function esc(value){
    return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function placeholder(label, kind='nature'){
    const palette = {
      fish:['#10251a','#b5ee70'],
      bird:['#10232b','#7fd4ff'],
      animal:['#241a12','#e7bd72'],
      water:['#0b2630','#78d7ee'],
      nature:['#13261a','#b5ee70']
    };
    const [bg, fg] = palette[kind] || palette.nature;
    const safe = esc(label).slice(0, 34);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="#07110c"/></linearGradient></defs><rect width="1200" height="760" fill="url(#g)"/><circle cx="960" cy="150" r="130" fill="${fg}" opacity=".06"/><path d="M0 600L190 460L360 560L590 350L780 520L1010 390L1200 510V760H0Z" fill="#07130d" opacity=".6"/><path d="M0 590C220 520 380 680 620 590S990 510 1200 575" fill="none" stroke="${fg}" stroke-opacity=".14" stroke-width="12"/><text x="60" y="90" fill="${fg}" font-family="Arial,sans-serif" font-size="28" font-weight="700">FishHunt</text><text x="60" y="670" fill="#f4f8f5" font-family="Arial,sans-serif" font-size="40" font-weight="700">${safe}</text></svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  async function json(url, deadline=Date.now()+REQUEST_TIMEOUT){
    const remaining=Math.min(REQUEST_TIMEOUT,deadline-Date.now());
    if(remaining<=0)throw new Error('Image lookup timed out');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),remaining);
    try{return await queuedJson(url,controller.signal);}
    finally{clearTimeout(timer);}
  }

  function validImage(src){
    return typeof src === 'string' && /^https?:\/\//i.test(src);
  }

  async function wikipediaImage(title, deadline){
    if(!title) return '';
    const urls = [
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      `https://ka.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    ];
    for(const url of urls){
      try{
        const data = await json(url,deadline);
        const src = data?.thumbnail?.source || data?.originalimage?.source || '';
        if(validImage(src)) return src;
      }catch(_){ /* try next */ }
    }
    return '';
  }

  function normalizeImageTitle(value){
    return String(value||'').toLowerCase()
      .replace(/[_-]+/g,' ')
      .replace(/[^\p{L}\p{N}\s]/gu,' ')
      .replace(/\s+/g,' ').trim();
  }

  function scoreCommonsTitle(title, terms){
    const normalized=normalizeImageTitle(title);
    let score=0;
    for(const term of terms||[]){
      const t=normalizeImageTitle(term);
      if(t.length<3) continue;
      if(normalized.includes(t)) score+=t.includes(' ')?12:(t.length>=6?8:3);
    }
    if(/\.svg$/i.test(String(title||''))) score-=20;
    if(/map|logo|icon|flag|diagram|coat of arms|crest/i.test(String(title||''))) score-=25;
    return score;
  }

  async function commonsImage(queries, terms, strictTitleMatch=false, deadline){
    const queryList=Array.isArray(queries)?queries:[queries];
    let best=null;
    const fullTitle=normalizeImageTitle((terms||[])[0]||'');
    const distinctive=(terms||[]).slice(1).map(normalizeImageTitle).filter(t=>t.length>=5);
    for(const q of queryList){
      if(!q)continue;
      try{
        const url='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch='+encodeURIComponent(q)+'&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url&iiurlwidth=1000&format=json&origin=*';
        const data=await json(url,deadline);
        const pages=Object.values(data?.query?.pages||{});
        for(const page of pages){
          const src=page?.imageinfo?.[0]?.thumburl||page?.imageinfo?.[0]?.url||'';
          if(!validImage(src))continue;
          const filename=normalizeImageTitle(page?.title||'');
          const relevance=scoreCommonsTitle(page?.title,terms);
          // Forest photos must match the full place title or all the distinctive
          // place-name tokens. A match on only "forest" or "Georgia" is not enough.
          if(strictTitleMatch){
            const matched=distinctive.filter(t=>filename.includes(t)).length;
            const minimum=distinctive.length>=2?2:1;
            if(!(fullTitle&&filename.includes(fullTitle))&&matched<minimum)continue;
          }
          // Search order is not proof that an image depicts the requested place/species.
          if(relevance<3)continue;
          const score=relevance+(page?.index?Math.max(0,4-page.index)*0.25:0);
          if(!best||score>best.score)best={src,score,relevance};
        }
        if(best&&best.relevance>=12) return best.src;
      }catch(_){ /* try next query */ }
    }
    return best&&best.relevance>=3?best.src:'';
  }

  async function resolveSpeciesImage(name, scientific, english){
    const key = `species:${scientific || english || name}`;
    const fallback=()=>placeholder(name,name&&/თევზ|კობრი|კალმახი|ლოქო|ფარგა|ქარიყლაპია/i.test(name)?'fish':'nature');
    return cachedLookup(key,async deadline=>{
      let src=await wikipediaImage(scientific||english||name,deadline);
      if(!src&&english&&english!==scientific)src=await wikipediaImage(english,deadline);
      if(!src){
        const terms=[scientific,english,name].filter(Boolean);
        src=await commonsImage([scientific,`${english||''} ${scientific||''}`.trim(),name],terms,false,deadline);
      }
      return src||fallback();
    },fallback);
  }

  const PLACE_WIKI = {
    'თბილისის ზღვა':'Tbilisi Sea',
    'ლისის ტბა':'Lisi Lake',
    'ბაზალეთის ტბა':'Lake Bazaleti',
    'ჟინვალის წყალსაცავი':'Zhinvali Reservoir',
    'სიონის წყალსაცავი':'Sioni Reservoir',
    'შაორის წყალსაცავი':'Shaori Reservoir',
    'ტაბაწყურის ტბა':'Lake Tabatskuri',
    'ფარავნის ტბა':'Paravani Lake',
    'ალგეთის წყალსაცავი':'Algeti Reservoir',
    'ხრამის მდინარე':'Khrami River',
    'მტკვარი':'Kura River',
    'ალაზანი':'Alazani River',
    'იორი':'Iori River',
    'რიონი':'Rioni River',
    'ცხენისწყალი':'Tskhenistsqali River',
    'ენგური':'Enguri River',
    'ჭოროხი':'Chorokhi River',
    'სუფსა':'Supsa River',
    'ურეკის სანაპირო':'Ureki, Georgia',
    'ქობულეთის სანაპირო':'Kobuleti',
    'ბათუმის სანაპირო':'Batumi',
    'ანაკლიის სანაპირო':'Anaklia',
    'ფოთის სანაპირო':'Poti',
    'კუმისის ტბა':'Kumisi Lake',
    'კარწახის ტბა':'Lake Kartsakhi',
    'მადათაფის ტბა':'Lake Madatapa',
    'ხანჩალის ტბა':'Lake Khanchali',
    'ტყიბულის წყალსაცავი':'Tkibuli Reservoir',
    'ბორჯომი':'Borjomi', 'ახალციხე':'Akhaltsikhe', 'თელავი':'Telavi', 'ლაგოდეხი':'Lagodekhi', 'მესტია':'Mestia', 'ამბროლაური':'Ambrolauri', 'ქუთაისი':'Kutaisi', 'ბათუმი':'Batumi', 'ფოთი':'Poti', 'რუსთავი':'Rustavi', 'თბილისი':'Tbilisi'
  };

  // For entries that are regional or synthetic labels (for example "Ozurgeti waters"),
  // we intentionally do NOT borrow an unrelated city/riverside photo. A named fallback
  // is safer than showing a wrong place photo.
  const PLACE_EXACT_TERMS = {
    'თბილისის ზღვა':['Tbilisi Sea'], 'ლისის ტბა':['Lisi Lake'], 'ბაზალეთის ტბა':['Bazaleti'],
    'ჟინვალის წყალსაცავი':['Zhinvali'], 'სიონის წყალსაცავი':['Sioni'], 'შაორის წყალსაცავი':['Shaori'],
    'ტაბაწყურის ტბა':['Tabatskuri'], 'ფარავნის ტბა':['Paravani'], 'ალგეთის წყალსაცავი':['Algeti'],
    'ხრამის მდინარე':['Khrami'], 'მტკვარი':['Kura','Mtkvari'], 'ალაზანი':['Alazani'], 'იორი':['Iori'],
    'რიონი':['Rioni'], 'ცხენისწყალი':['Tskhenistsqali'], 'ენგური':['Enguri'], 'ჭოროხი':['Chorokhi'],
    'სუფსა':['Supsa'], 'კუმისის ტბა':['Kumisi'], 'კარწახის ტბა':['Kartsakhi'], 'მადათაფის ტბა':['Madatapa'],
    'ხანჩალის ტბა':['Khanchali'], 'ტყიბულის წყალსაცავი':['Tkibuli']
  };

  async function resolvePlaceImage(name, region, kind){
    const key = `place:${name}`;
    const fallback=()=>placeholder(`${name} • ${region||''}`,kind==='მდინარე'||kind==='ზღვა'?'water':'nature');
    return cachedLookup(key,async deadline=>{
    const title = PLACE_WIKI[name] || '';
    let src = '';

    // Prefer an exact Wikipedia article we explicitly mapped.
    if(title){
      try { src = await wikipediaImage(title,deadline); } catch(_) { src = ''; }
    }

    // Only use Commons when the result title contains the exact place tokens.
    if(!src && title){
      const terms = PLACE_EXACT_TERMS[name] || title.split(/\s+/).filter(Boolean);
      src = await commonsImage([title, `${title} Georgia`], terms,false,deadline);
    }

    // Never query Wikipedia by the raw Georgian name here: that can resolve to a
    // different city, person or generic article and causes visually wrong photos.
    return src||fallback();
    },fallback);
  }

  async function wikipediaImageExact(title,deadline){
    const wanted=normalizeImageTitle(title);
    if(!wanted)return '';
    const urls=[
      'https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title),
      'https://ka.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title)
    ];
    for(const url of urls){
      try{
        const data=await json(url,deadline);
        const resolved=normalizeImageTitle(data?.title||'');
        const src=data?.thumbnail?.source||data?.originalimage?.source||'';
        // Do not accept a redirect to a different article as a photo for this forest.
        if(resolved===wanted&&validImage(src))return src;
      }catch(_){}
    }
    return '';
  }

  async function resolveNatureImage(name, english){
    const key='nature:'+name+':'+(english||'');
    const fallback=()=>placeholder(name,'nature');
    return cachedLookup(key,async deadline=>{
    const title=String(english||name||'').trim();
    let src='';
    // Prefer the exact English Wikipedia page for the named habitat/park.
    try{src=await wikipediaImageExact(title,deadline)}catch(_){}
    if(!src&&title){
      const stop=new Set(['national','park','parks','protected','areas','managed','reserve','reserves','forest','forests','zone','belt','mountain','mountains','valley','valleys','rainy','rainforest','state','the','and','of','georgia','nature','woodland']);
      const distinctive=title.split(/[^A-Za-z0-9]+/).filter(w=>w.length>=5&&!stop.has(w.toLowerCase()));
      // Commons must match the location name in the actual image title; first search
      // result alone is not enough, which was causing forests to show mixed-up photos.
      const terms=[title,...distinctive];
      const queries=[title,title+' Georgia',...distinctive.map(w=>w+' forest Georgia')];
      try{src=await commonsImage(queries,terms,true,deadline)}catch(_){}
    }
    return src||fallback();
    },fallback);
  }

  async function resolveSpeciesGallery(name, scientific, english){
    const key=`gallery:${scientific||english||name}`;
    return cachedLookup(key,async deadline=>{
    const queries=[scientific,english,`${english||''} ${scientific||''}`.trim(),name].filter(Boolean), terms=[scientific,english,name].filter(Boolean).map(String), out=[], seen=new Set();
    for(const q of queries){try{const u=`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json&origin=*`;const d=await json(u,deadline);for(const pg of Object.values(d?.query?.pages||{})){const title=String(pg?.title||''),src=pg?.imageinfo?.[0]?.thumburl||pg?.imageinfo?.[0]?.url||'';if(!validImage(src)||seen.has(src))continue;let score=scoreCommonsTitle(title,terms);if(/map|logo|icon|flag|diagram|coat of arms/i.test(title))score-=30;if(score<3)continue;seen.add(src);out.push({src,score})}}catch(_){}if(out.length>=8)break}out.sort((a,b)=>b.score-a.score);return out.slice(0,6).map(x=>x.src);
    },()=>[]);
  }
  window.GeoImage = {placeholder, resolveSpeciesImage, resolveSpeciesGallery, resolvePlaceImage, resolveNatureImage, esc};
})();
