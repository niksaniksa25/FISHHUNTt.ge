(function(){
  const memory = new Map();

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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="#07110c"/></linearGradient></defs><rect width="1200" height="760" fill="url(#g)"/><circle cx="960" cy="150" r="130" fill="${fg}" opacity=".06"/><path d="M0 600L190 460L360 560L590 350L780 520L1010 390L1200 510V760H0Z" fill="#07130d" opacity=".6"/><path d="M0 590C220 520 380 680 620 590S990 510 1200 575" fill="none" stroke="${fg}" stroke-opacity=".14" stroke-width="12"/><text x="60" y="90" fill="${fg}" font-family="Arial,sans-serif" font-size="28" font-weight="700">GEONATURE</text><text x="60" y="670" fill="#f4f8f5" font-family="Arial,sans-serif" font-size="40" font-weight="700">${safe}</text></svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  async function json(url){
    const r = await fetch(url, {headers:{Accept:'application/json'}});
    if(!r.ok) throw new Error('request failed');
    return r.json();
  }

  function validImage(src){
    return typeof src === 'string' && /^https?:\/\//i.test(src);
  }

  async function wikipediaImage(title){
    if(!title) return '';
    const urls = [
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
      `https://ka.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    ];
    for(const url of urls){
      try{
        const data = await json(url);
        const src = data?.thumbnail?.source || data?.originalimage?.source || '';
        if(validImage(src)) return src;
      }catch(_){ /* try next */ }
    }
    return '';
  }

  function scoreCommonsTitle(title, terms){
    const normalized = String(title || '').toLowerCase();
    let score = 0;
    for(const term of terms){
      const t = String(term || '').toLowerCase().trim();
      if(!t) continue;
      if(normalized.includes(t)) score += t.length >= 6 ? 8 : 3;
    }
    if(/\.svg$/i.test(normalized)) score -= 20;
    if(/map|logo|icon|flag|diagram/i.test(normalized)) score -= 15;
    return score;
  }

  async function commonsImage(queries, terms){
    const queryList = Array.isArray(queries) ? queries : [queries];
    let best = null;
    for(const q of queryList){
      if(!q) continue;
      try{
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url&iiurlwidth=1000&format=json&origin=*`;
        const data = await json(url);
        const pages = Object.values(data?.query?.pages || {});
        for(const page of pages){
          const src = page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || '';
          if(!validImage(src)) continue;
          const score = scoreCommonsTitle(page?.title, terms) + (page?.index ? Math.max(0, 12 - page.index) : 0);
          if(!best || score > best.score) best = {src, score};
        }
        if(best && best.score >= 12) return best.src;
      }catch(_){ /* next query */ }
    }
    return best && best.score >= 6 ? best.src : '';
  }

  async function resolveSpeciesImage(name, scientific, english){
    const key = `species:${scientific || english || name}`;
    if(memory.has(key)) return memory.get(key);
    const titles = [scientific, english, name].filter(Boolean);
    let src = await wikipediaImage(scientific || english || name);
    if(!src && english && english !== scientific) src = await wikipediaImage(english);
    if(!src){
      const terms = [scientific, english, name].filter(Boolean);
      src = await commonsImage([scientific, `${english || ''} ${scientific || ''}`.trim(), name], terms);
    }
    if(!src) src = placeholder(name, name && /თევზ|კობრი|კალმახი|ლოქო|ფარგა|ქარიყლაპია/i.test(name) ? 'fish' : 'nature');
    memory.set(key, src);
    return src;
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
    if(memory.has(key)) return memory.get(key);
    const title = PLACE_WIKI[name] || '';
    let src = '';

    // Prefer an exact Wikipedia article we explicitly mapped.
    if(title){
      try { src = await wikipediaImage(title); } catch(_) { src = ''; }
    }

    // Only use Commons when the result title contains the exact place tokens.
    if(!src && title){
      const terms = PLACE_EXACT_TERMS[name] || title.split(/\s+/).filter(Boolean);
      src = await commonsImage([title, `${title} Georgia`], terms);
    }

    // Never query Wikipedia by the raw Georgian name here: that can resolve to a
    // different city, person or generic article and causes visually wrong photos.
    if(!src) src = placeholder(`${name} • ${region || ''}`, kind === 'მდინარე' || kind === 'ზღვა' ? 'water' : 'nature');
    memory.set(key, src);
    return src;
  }

  async function resolveNatureImage(name, english){
    const key=`nature:${name}:${english||''}`;
    if(memory.has(key)) return memory.get(key);
    let src='';
    const title=english||name;
    try{src=await wikipediaImage(title)}catch(_){}
    if(!src){
      try{
        const terms=[english,name].filter(Boolean);
        src=await commonsImage([english||name,`${english||name} Georgia`],terms);
      }catch(_){}
    }
    if(!src)src=placeholder(name,'nature');
    memory.set(key,src);
    return src;
  }

  async function resolveSpeciesGallery(name, scientific, english){
    const queries=[scientific,english,`${english||''} ${scientific||''}`.trim(),name].filter(Boolean), terms=[scientific,english,name].filter(Boolean).map(String), out=[], seen=new Set();
    for(const q of queries){try{const u=`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url&iiurlwidth=1200&format=json&origin=*`;const d=await json(u);for(const pg of Object.values(d?.query?.pages||{})){const title=String(pg?.title||''),src=pg?.imageinfo?.[0]?.thumburl||pg?.imageinfo?.[0]?.url||'';if(!validImage(src)||seen.has(src))continue;let score=scoreCommonsTitle(title,terms);if(/map|logo|icon|flag|diagram|coat of arms/i.test(title))score-=30;if(score<3)continue;seen.add(src);out.push({src,score})}}catch(_){}if(out.length>=8)break}out.sort((a,b)=>b.score-a.score);return out.slice(0,6).map(x=>x.src);
  }
  window.GeoImage = {placeholder, resolveSpeciesImage, resolveSpeciesGallery, resolvePlaceImage, resolveNatureImage, esc};
})();
