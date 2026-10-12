(function(){
  'use strict';
  const MONTHS=['იანვარი','თებერვალი','მარტი','აპრილი','მაისი','ივნისი','ივლისი','აგვისტო','სექტემბერი','ოქტომბერი','ნოემბერი','დეკემბერი'];
  const currentMonth=new Date().getMonth()+1;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fish=[
    {id:'carp',name:'კობრი',months:[3,4,5,6,7,8,9,10,11],peak:[5,6,7,8],group:'მტკნარი წყალი',note:'თბილ წყალში უფრო აქტიურია. ეძებე ტბებსა და წყალსაცავებში, ასევე მდინარის ნელ დინებაში.'},
    {id:'crucian',name:'კარასი',months:[3,4,5,6,7,8,9,10],peak:[5,6,7,8],group:'მტკნარი წყალი',note:'გაზაფხულის დათბობიდან შემოდგომამდე აქტიურობა, როგორც წესი, უფრო მაღალია.'},
    {id:'grasscarp',name:'თეთრი ამური',months:[4,5,6,7,8,9,10],peak:[5,6,7,8],group:'მტკნარი წყალი',note:'თბილ წყალსა და მცენარეულ საკვებთან დაკავშირებული სეზონური აქტივობა აქვს.'},
    {id:'silvercarp',name:'სქელშუბლა',months:[5,6,7,8,9],peak:[6,7,8],group:'მტკნარი წყალი',note:'უმეტესად თბილი სეზონის სახეობაა; შედეგი მნიშვნელოვნადაა დამოკიდებული კონკრეტულ წყალსაცავზე.'},
    {id:'bighead',name:'თავკომბალა',months:[5,6,7,8,9],peak:[6,7,8],group:'მტკნარი წყალი',note:'აქტიურობა, ჩვეულებრივ, მატულობს წყლის გათბობისას.'},
    {id:'bream',name:'კაპარჭინა',months:[3,4,5,6,7,8,9,10],peak:[4,5,6,7],group:'მტკნარი წყალი',note:'გაზაფხულიდან შემოდგომამდე შეიძლება აქტიური იყოს; ქვირითობისა და ადგილობრივი შეზღუდვების წესები ცალკე გადაამოწმე.'},
    {id:'catfish',name:'ლოქო',months:[4,5,6,7,8,9,10],peak:[5,6,7,8],group:'მტკნარი წყალი',note:'თბილ თვეებში ხშირად უფრო აქტიურია, მათ შორის საღამოსა და ღამით.'},
    {id:'zander',name:'ფარგა',months:[3,4,5,6,7,8,9,10],peak:[4,5,6,9,10],group:'მტკნარი წყალი',note:'გაზაფხულის გამრავლების პერიოდთან დაკავშირებული შეზღუდვები კონკრეტულ წყალსატევზე გადაამოწმე.'},
    {id:'pike',name:'ქარიყლაპია',months:[1,2,3,4,9,10,11,12],peak:[10,11,12,1,2,3],group:'მტკნარი წყალი',note:'გრილ წყალში ხშირად უფრო აქტიურია; ზაფხულის სიცხეში აქტივობა შესაძლოა შემცირდეს.'},
    {id:'perch',name:'ქორჭილა',months:[3,4,5,6,7,8,9,10,11],peak:[4,5,9,10],group:'მტკნარი წყალი',note:'სეზონურად აქტიურია გაზაფხულსა და შემოდგომაზე; ადგილობრივი პირობები მნიშვნელოვანია.'},
    {id:'browntrout',name:'ნაკადულის კალმახი',months:[3,4,5,6,9,10,11],peak:[4,5,9,10],group:'მთის მდინარეები',note:'ცივი, ჟანგბადით მდიდარი წყალი ურჩევნია. კალმახზე განსაკუთრებული დაცვისა და ქვირითობის შეზღუდვები წინასწარ გადაამოწმე.'},
    {id:'rainbow',name:'ცისარტყელა კალმახი',months:[3,4,5,6,7,8,9,10,11],peak:[4,5,6,9,10],group:'ცივი წყალი / ტბორები',note:'აქტიურობა დამოკიდებულია წყლის ტემპერატურასა და კონკრეტული წყალსატევის რეჟიმზე.'},
    {id:'chub',name:'ქაშაპი',months:[3,4,5,6,7,8,9,10],peak:[4,5,6,9],group:'მდინარეები',note:'ზომიერი ტემპერატურის დროს ხშირად აქტიურია; ეძებე დინების კიდეებსა და ჩრდილიან მონაკვეთებში.'},
    {id:'barbel',name:'წვერა',months:[3,4,5,6,7,8,9,10],peak:[5,6,7,9],group:'მდინარეები',note:'მდინარის ფსკერთან და ზომიერ დინებაში ეძებე; წყლის დონე და გამჭვირვალობა მნიშვნელოვანია.'},
    {id:'khramuli',name:'ხრამული',months:[4,5,6,7,8,9,10],peak:[5,6,7,8],group:'მდინარეები',note:'თბილ პერიოდში აქტივობა ხშირად მატულობს. კონკრეტული მდინარის წესები გადაამოწმე.'},
    {id:'roach',name:'ტარანი / როაჩი',months:[3,4,5,6,7,8,9,10,11],peak:[4,5,6,9,10],group:'მტკნარი წყალი',note:'ფართო სეზონი აქვს; ქარის, წყლის ტემპერატურისა და საკვების ხელმისაწვდომობის მიხედვით იცვლება.'},
    {id:'rudd',name:'წითელფარფლიანი',months:[4,5,6,7,8,9,10],peak:[5,6,7,8],group:'მტკნარი წყალი',note:'ხშირად თბილ, მცენარეულობით მდიდარ წყალშია აქტიური.'},
    {id:'bleak',name:'თეთრულა',months:[4,5,6,7,8,9],peak:[5,6,7,8],group:'მტკნარი წყალი',note:'თბილ თვეებში ზედაპირულ ფენებში ხშირად ჩანს.'},
    {id:'asp',name:'ქაშაყისებრი ასპი',months:[4,5,6,7,8,9,10],peak:[5,6,7,9],group:'მდინარეები / წყალსაცავები',note:'მტაცებელი აქტივობა ხშირად ძლიერდება შედარებით თბილ სეზონზე.'},
    {id:'ide',name:'იდი',months:[3,4,5,6,7,8,9,10],peak:[4,5,6,9],group:'მდინარეები',note:'გაზაფხულსა და შემოდგომაზე ხშირად უკეთესი პირობებია.'},
    {id:'tench',name:'ლინტი',months:[4,5,6,7,8,9],peak:[5,6,7,8],group:'ტბები და ნელი წყალი',note:'თბილ, მცენარეულობით მდიდარ წყალს ანიჭებს უპირატესობას.'},
    {id:'burbot',name:'ნალიმი',months:[10,11,12,1,2,3],peak:[11,12,1,2],group:'გრილი წყალი',note:'გრილ სეზონზე აქტივობა ხშირად მატულობს; ზამთრის უსაფრთხოება და ადგილობრივი წესები გაითვალისწინე.'},
    {id:'blacksea',name:'შავი ზღვის კეფალი',months:[4,5,6,7,8,9,10,11],peak:[6,7,8,9],group:'შავი ზღვა',note:'სანაპიროსა და შესართავებში სეზონური გადაადგილება წყლის ტემპერატურაზეა დამოკიდებული.'},
    {id:'horse',name:'სტავრიდა',months:[4,5,6,7,8,9,10,11],peak:[6,7,8,9],group:'შავი ზღვა',note:'სანაპირო აქტივობა იცვლება დინებებისა და თევზის სეზონური გადაადგილების მიხედვით.'},
    {id:'bonito',name:'ბონიტო',months:[6,7,8,9,10],peak:[7,8,9],group:'შავი ზღვა',note:'თბილ სეზონზე შეიძლება სანაპიროსთან გამოჩნდეს; ადგილობრივი პირობები გადაამოწმე.'},
    {id:'bluefish',name:'ლუფარი',months:[5,6,7,8,9,10,11],peak:[7,8,9,10],group:'შავი ზღვა',note:'მტაცებელი თევზის სანაპირო აქტივობა სეზონურ მიგრაციასა და საკვების მოძრაობას უკავშირდება.'},
    {id:'redmullet',name:'წითელი მულეტი',months:[5,6,7,8,9,10,11],peak:[6,7,8,9],group:'შავი ზღვა',note:'თბილ სეზონზე სანაპირო თევზაობის ზოგადი აქტივობა ხშირად იმატებს.'},
    {id:'sturgeon',name:'ზუთხი',months:[],peak:[],group:'განსაკუთრებული შეზღუდვის რისკი',caution:true,note:'არ დაგეგმო როგორც ჩვეულებრივი სათევზაო სახეობა. ზუთხის სახეობებს შეიძლება ვრცელდებოდეს მკაცრი დაცვისა და მოპოვების შეზღუდვები; ოფიციალურად გადაამოწმე.'},
    {id:'salmon',name:'შავი ზღვის ორაგული',months:[],peak:[],group:'განსაკუთრებული შეზღუდვის რისკი',caution:true,note:'კონსერვაციის სტატუსისა და მოპოვების წესების განსაკუთრებული გადამოწმებაა საჭირო. არ დაიჭირო/შეინახო ოფიციალური ნებართვის დადასტურების გარეშე.'},
    {id:'european eel',name:'ევროპული გველთევზა',months:[],peak:[],group:'განსაკუთრებული შეზღუდვის რისკი',caution:true,note:'კონსერვაციის მხრივ მოწყვლადი სახეობაა; მოქმედი სტატუსი და მოპოვების შეზღუდვები ოფიციალურად გადაამოწმე.'}
  ];
  const likelyProtected=new Set([
    'მურა დათვი','ფოცხვერი','კავკასიური ირემი','ჯიხვი','წავი','ევროპული ტყის კატა',
    'კავკასიური შავი როჭო','კავკასიური მთის ინდაური','ბექობის არწივი','ოქროს არწივი',
    'ქორი','ტყის ბუ','მეჭვავია','ჭვარტლიანი ბუ','დიდი ჩვამა','ორბი','წვერიანი სვავი',
    'შავი სვავი','შავი ყარყატი','თეთრი ყარყატი','ალკუნი','ოქროსფერი კვირიონი','ოფოფი',
    'ჩვეულებრივი კირკიტა','შევარდენი','დიდი ჭრელი კოდალა','კავკასიური გველგესლა',
    'ხმელთაშუაზღვის კუ','კასპიური კუ','ევროპული ჭაობის კუ','კავკასიური აგამა',
    'ზოლიანი ხვლიკი','წყლის გველი','ჩვეულებრივი გველი','მერცხალი'
  ]);
  const huntCandidateNames=new Set(['მწყერი','კაკაბი','ფაროსანა','გარეული იხვი','გარეული მტრედი','მელა','გარეული ღორი','კურდღელი','ოქროს ტურა','მგელი','ნუტრია']);
  let mode='fish',selectedMonth='all',searchText='';
  function monthLabel(n){return MONTHS[n-1]||'';}
  function monthTags(months,peak){
    if(!months.length)return '<span class="season-month-tag">თვეები მითითებული არ არის</span>';
    return months.map(n=>'<span class="season-month-tag'+(peak.includes(n)?' peak':'')+'">'+esc(monthLabel(n))+'</span>').join('');
  }
  function fishCard(f){
    const active=selectedMonth==='all'?f.months.includes(currentMonth):f.months.includes(Number(selectedMonth));
    const headline=f.caution?'შეზღუდვის განსაკუთრებული გადამოწმება':(selectedMonth==='all'?(f.months.includes(currentMonth)?'მიმდინარე თვეში აქტიურობა მოსალოდნელია':'აქტივობა სეზონზეა დამოკიდებული'):(f.months.includes(Number(selectedMonth))?'ამ თვეში სეზონური აქტივობა მოსალოდნელია':'ამ თვეში აქტივობა შედარებით დაბალია'));
    const legal=f.caution
      ?''
      :'<div class="season-status caution"><strong>კანონიერი თევზჭერა ცალკე გადაამოწმე</strong>ეს თვეები აღწერს ზოგად სეზონურ აქტივობას და არა მოპოვების ნებართვას. გაითვალისწინე ქვირითობის აკრძალვები, ზომის ლიმიტი და წყალსატევის ადგილობრივი წესი.</div>';
    return '<article class="season-card"><div class="season-card-top"><div><h3>'+esc(f.name)+'</h3><div class="season-latin">'+esc(f.group)+'</div></div><span class="season-type-badge">🎣 თევზი</span></div><div class="season-status'+(f.caution?' danger':'')+'"><strong>'+esc(headline)+'</strong>'+esc(f.caution?f.note:(active?'მიმდინარე სეზონში ზოგადი აქტივობა შეიძლება კარგი იყოს; ამინდი და ადგილი გადამწყვეტია.':'სეზონური აქტივობა, როგორც წესი, ნაკლებია ამ თვეში.'))+'</div><div><div class="season-card-label">ზოგადი აქტივობის თვეები</div><div class="season-months">'+monthTags(f.months,f.peak)+'</div></div><p class="season-card-note">'+esc(f.note)+'</p>'+legal+'</article>';
  }
  function wildlifeMonths(season){
    const text=String(season||'').toLowerCase(),out=new Set();
    if(text.includes('მთელი წელი')||text.includes('მთელი წლის'))return MONTHS.map((_,i)=>i+1);
    if(text.includes('გაზაფხული'))[3,4,5].forEach(n=>out.add(n));
    if(text.includes('ზაფხული'))[6,7,8].forEach(n=>out.add(n));
    if(text.includes('შემოდგომა'))[9,10,11].forEach(n=>out.add(n));
    if(text.includes('ზამთარი'))[12,1,2].forEach(n=>out.add(n));
    if(text.includes('მიგრაცი')||text.includes('სეზონურად'))[3,4,5,8,9,10].forEach(n=>out.add(n));
    if(!out.size) return MONTHS.map((_,i)=>i+1);
    return Array.from(out).sort((a,b)=>a-b);
  }
  function wildlifeCard(row){
    const type=row[0]==='bird'?'ფრინველი':row[0]==='mammal'?'ძუძუმწოვარი':row[0]==='reptile'?'ქვეწარმავალი':'ველური ბუნება';
    const season=String(row[7]||'სეზონურობა დაზუსტებული არ არის');
    const months=wildlifeMonths(season);
    const active=selectedMonth==='all'?months.includes(currentMonth):months.includes(Number(selectedMonth));
    const isRisk=likelyProtected.has(row[1]);
    const canCandidate=huntCandidateNames.has(row[1]);
    let statusTitle,statusText,statusClass;
    if(isRisk){statusTitle='დაცული სტატუსის რისკი მაღალია';statusText='ნუ განიხილავ სანადირო ობიექტად ოფიციალური სტატუსისა და მოქმედი წესის დადასტურების გარეშე.';statusClass='danger';}
    else if(canCandidate){statusTitle='კანონიერი ნადირობის თარიღი აქ დადასტურებული არ არის';statusText='სეზონის გახსნის თარიღი, სახეობის დაშვება და ნებართვა ოფიციალურ მოქმედ წესში გადაამოწმე; ეს ბარათი ნადირობის ნებართვას არ ნიშნავს.';statusClass='caution';}
    else{statusTitle='ნადირობის უფლება დადასტურებული არ არის';statusText='გამოიყენე ბუნებაზე დაკვირვების ცნობარად. ნუ მოიპოვებ სახეობას, სანამ მისი დაცული სტატუსი და ნადირობის დაშვება ოფიციალურად არ გადამოწმდება.';statusClass='caution';}
    return '<article class="season-card"><div class="season-card-top"><div><h3>'+esc(row[1])+'</h3><div class="season-latin">'+esc(row[2]||'')+' '+(row[3]?'• '+esc(row[3]):'')+'</div></div><span class="season-type-badge">🦌 '+esc(type)+'</span></div><div class="season-status '+statusClass+'"><strong>'+esc(statusTitle)+'</strong>'+esc(statusText)+'</div><div><div class="season-card-label">ბუნებაში ხილვადობა / სეზონური აქტივობა</div><div class="season-months">'+monthTags(months,[])+'</div></div><p class="season-card-note"><b>მონაცემთა ბაზაში მითითებულია:</b> '+esc(season)+'. აქტიურობა არ ნიშნავს, რომ ამ თვეში ნადირობა ნებადართულია.</p><p class="season-card-note">'+esc(row[5]||'ჰაბიტატი გადაამოწმე სახეობის პროფილში.')+'</p></article>';
  }
  function render(){
    const search=searchText.trim().toLocaleLowerCase('ka');
    let cards=[],heading,eyebrow,subheading;
    if(mode==='fish'){
      heading='თევზების სეზონური აქტივობა';
      eyebrow='FISHING WINDOWS';
      subheading='თვეები არის ზოგადი აქტივობის ორიენტირი და არა კანონიერი თევზჭერის კალენდარი.';
      const rows=fish.filter(f=>{
        const text=(f.name+' '+f.group+' '+f.note).toLocaleLowerCase('ka');
        if(search&&!text.includes(search))return false;
        if(selectedMonth!=='all'&&!f.months.includes(Number(selectedMonth)))return false;
        return true;
      });
      cards=rows.map(fishCard);
    }else{
      heading='ველური ბუნების სეზონურობა';
      eyebrow='WILDLIFE SEASONALITY';
      subheading='თვეები აღწერს ზოგად ხილვადობას/აქტივობას; სანადირო სახეობის დაშვება და კანონიერი ვადა ცალკე მოწმდება.';
      const rows=(window.HUNTING_WILDLIFE||[]).filter(row=>{
        const text=[row[1],row[2],row[3],row[4],row[5],row[6],row[7]].join(' ').toLocaleLowerCase('ka');
        if(search&&!text.includes(search))return false;
        const months=wildlifeMonths(row[7]);
        if(selectedMonth!=='all'&&!months.includes(Number(selectedMonth)))return false;
        return true;
      }).sort((a,b)=>{
        const ar=likelyProtected.has(a[1])?0:(huntCandidateNames.has(a[1])?1:2);
        const br=likelyProtected.has(b[1])?0:(huntCandidateNames.has(b[1])?1:2);
        return ar-br||String(a[1]).localeCompare(String(b[1]),'ka');
      });
      cards=rows.map(wildlifeCard);
    }
    $('seasonHeading').textContent=heading;
    $('seasonEyebrow').textContent=eyebrow;
    $('seasonSubheading').textContent=subheading;
    $('seasonResults').innerHTML=cards.join('');
    $('seasonResultCount').textContent=cards.length+' ჩანაწერი';
    $('seasonEmpty').hidden=cards.length>0;
    document.querySelectorAll('[data-mode]').forEach(btn=>{
      const active=btn.dataset.mode===mode;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',active?'true':'false');
    });
    document.querySelectorAll('[data-month]').forEach(btn=>{
      btn.classList.toggle('active',String(btn.dataset.month)===String(selectedMonth));
    });
  }
  function setup(){
    $('seasonToday').textContent=monthLabel(currentMonth)+' • '+new Date().toLocaleDateString('ka-GE');
    $('seasonActiveMonth').textContent='მიმდინარე თვე: '+monthLabel(currentMonth);
    const monthSelect=$('seasonMonth');
    MONTHS.forEach((name,i)=>{const option=document.createElement('option');option.value=String(i+1);option.textContent=name;monthSelect.appendChild(option);});
    const strip=$('seasonMonthStrip');
    strip.innerHTML='<button type="button" class="season-month-pill active" data-month="all">ყველა თვე</button>'+MONTHS.map((name,i)=>'<button type="button" class="season-month-pill" data-month="'+(i+1)+'">'+esc(name)+'</button>').join('');
    document.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{mode=btn.dataset.mode;render();}));
    monthSelect.addEventListener('change',()=>{selectedMonth=monthSelect.value;render();});
    $('seasonSearch').addEventListener('input',e=>{searchText=e.target.value||'';render();});
    strip.addEventListener('click',e=>{const btn=e.target.closest('[data-month]');if(!btn)return;selectedMonth=btn.dataset.month;monthSelect.value=selectedMonth;render();});
    $('seasonReset').addEventListener('click',()=>{selectedMonth='all';searchText='';monthSelect.value='all';$('seasonSearch').value='';mode='fish';render();window.scrollTo({top:$('seasonControls')?$('seasonControls').offsetTop:0,behavior:'smooth'});});
    render();
  }
  document.addEventListener('DOMContentLoaded',setup);
})();