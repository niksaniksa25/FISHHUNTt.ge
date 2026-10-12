(function(){
  'use strict';
  const MONTHS=['იანვარი','თებერვალი','მარტი','აპრილი','მაისი','ივნისი','ივლისი','აგვისტო','სექტემბერი','ოქტომბერი','ნოემბერი','დეკემბერი'];
  const rules=window.GeoWildlifeRules;
  const today=rules?rules.today():new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tbilisi'});
  const currentMonth=Number(today.slice(5,7));
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
    {id:'sturgeon',name:'ზუთხი',months:[],peak:[],group:'წესები იხილე ბარათში',caution:true,note:'ზუთხისებრთა მოპოვების წესები მოცემულია ოფიციალური წყაროს ბმულით.'},
    {id:'salmon',name:'შავი ზღვის ორაგული',months:[],peak:[],group:'წესები იხილე ბარათში',caution:true,note:'შავი ზღვის ორაგულზე მოქმედებს განსაკუთრებული დაცვის რეჟიმი.'},
    {id:'european eel',name:'ევროპული გველთევზა',months:[],peak:[],group:'წესები იხილე ბარათში',caution:true,note:'კონსერვაციის მხრივ მოწყვლადი სახეობაა; მოქმედი სტატუსი და მოპოვების შეზღუდვები ოფიციალურად გადაამოწმე.'}
  ];
  let mode='fish',selectedMonth='all',searchText='',selectedDate=today,fishMethod='rod',huntArea='unknown';
  function ruleContext(){return {date:selectedDate,method:fishMethod,area:huntArea,compact:true};}
  function legalMarkup(value,kind){return rules?rules.markup(value,Object.assign({kind},ruleContext())):'<p class="season-card-note">წესების ჩატვირთვა ვერ მოხერხდა. გადაამოწმე ოფიციალური წყარო ან დარეკე 153-ზე.</p>';}
  function contextControls(){
    const control=$('seasonRuleContext'),label=$('seasonRuleContextLabel');
    label.firstChild.textContent=mode==='fish'?'ჭერის მეთოდი':'მუნიციპალიტეტის ჯგუფი';
    control.innerHTML=mode==='fish'?'<option value="rod">სამოყვარულო ჭერა</option><option value="release">გაშვებით რეკრეაციული ჭერა</option><option value="other">სხვა მეთოდი</option>':'<option value="unknown">ჯერ არ არის დაზუსტებული</option><option value="standard">სხვა მუნიციპალიტეტები</option><option value="highland">ახალქალაქი / ნინოწმინდა / წალკა / დმანისი</option>';
    control.value=mode==='fish'?fishMethod:huntArea;
  }
  function monthLabel(n){return MONTHS[n-1]||'';}
  function monthTags(months,peak){
    if(!months.length)return '<span class="season-month-tag">თვეები მითითებული არ არის</span>';
    return months.map(n=>'<span class="season-month-tag'+(peak.includes(n)?' peak':'')+'">'+esc(monthLabel(n))+'</span>').join('');
  }
  function fishCard(f){
    const month=selectedMonth==='all'?currentMonth:Number(selectedMonth),active=f.months.includes(month);
    const headline=!f.months.length?'აქტივობის თვეები დაზუსტებული არ არის':active?'არჩეულ თვეში აქტიურობა მოსალოდნელია':'არჩეულ თვეში აქტივობა შედარებით დაბალია';
    const row=(window.FISHES||[]).find(row=>row[0]===f.id)||Object.assign({kind:'fish'},f);
    return '<article class="season-card"><div class="season-card-top"><div><h3>'+esc(f.name)+'</h3><div class="season-latin">'+esc(f.group)+'</div></div><span class="season-type-badge">🎣 თევზი</span></div>'+legalMarkup(row,'fish')+'<div class="season-status"><strong>'+esc(headline)+'</strong>ზოგადი ბუნებრივი აქტივობა; ამინდი და წყალსატევი შედეგს ცვლის.</div><div><div class="season-card-label">ზოგადი აქტივობის თვეები</div><div class="season-months">'+monthTags(f.months,f.peak)+'</div></div><p class="season-card-note">'+esc(f.note)+'</p><a class="btn ghost" href="species.html?id='+encodeURIComponent(f.id)+'">სახეობის პროფილი →</a></article>';
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
    const month=selectedMonth==='all'?currentMonth:Number(selectedMonth);
    const headline=months.includes(month)?'არჩეულ თვეში ხილვადობა/აქტივობა მოსალოდნელია':'არჩეულ თვეში სეზონური აქტივობა შედარებით დაბალია';
    return '<article class="season-card"><div class="season-card-top"><div><h3>'+esc(row[1])+'</h3><div class="season-latin">'+esc(row[2]||'')+' '+(row[3]?'• '+esc(row[3]):'')+'</div></div><span class="season-type-badge">🦌 '+esc(type)+'</span></div>'+legalMarkup(row)+'<div class="season-status"><strong>'+esc(headline)+'</strong>ეს შეფასება ბუნებრივ აქტივობას აღწერს. მოპოვების წესი ზემოთ, გასვლის ზუსტი თარიღით მოწმდება.</div><div><div class="season-card-label">ბუნებაში ხილვადობა / სეზონური აქტივობა</div><div class="season-months">'+monthTags(months,[])+'</div></div><p class="season-card-note"><b>ბუნებრივი აქტივობა:</b> '+esc(season)+'.</p><p class="season-card-note">'+esc(row[5]||'ჰაბიტატი გადაამოწმე სახეობის პროფილში.')+'</p><a class="btn ghost" href="species.html?id='+encodeURIComponent(row[1])+'">სახეობის პროფილი →</a></article>';
  }
  function render(){
    const search=searchText.trim().toLocaleLowerCase('ka');
    let cards=[],heading,eyebrow,subheading;
    if(mode==='fish'){
      heading='თევზები — შეზღუდვები და აქტივობა';
      eyebrow='FISHING WINDOWS';
      subheading='თვეები არის ზოგადი აქტივობის ორიენტირი და არა კანონიერი თევზჭერის კალენდარი.';
      const records=(window.FISHES||[]).length?(window.FISHES||[]).map(row=>fish.find(f=>f.id===row[0])||{id:row[0],name:row[1],months:[],peak:[],group:row[3],note:row[4]}):fish;
      const rows=records.filter(f=>{
        const text=(f.name+' '+f.group+' '+f.note).toLocaleLowerCase('ka');
        if(search&&!text.includes(search))return false;
        return true;
      });
      cards=rows.map(fishCard);
    }else{
      heading='ნადირობის ვადები და სახეობის დაცვა';
      eyebrow='WILDLIFE SEASONALITY';
      subheading='თვეები აღწერს ზოგად ხილვადობას/აქტივობას; სანადირო სახეობის დაშვება და კანონიერი ვადა ცალკე მოწმდება.';
      const rows=(window.HUNTING_WILDLIFE||[]).filter(row=>{
        const text=[row[1],row[2],row[3],row[4],row[5],row[6],row[7]].join(' ').toLocaleLowerCase('ka');
        if(search&&!text.includes(search))return false;
        return true;
      }).sort((a,b)=>{
        const priority=row=>rules&&rules.evaluate(row,ruleContext()).status==='prohibited'?0:1;
        const ar=priority(a),br=priority(b);
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
    $('seasonToday').textContent=monthLabel(currentMonth)+' • '+today.split('-').reverse().join('.');
    $('seasonRuleDate').value=selectedDate;
    contextControls();
    $('seasonRuleDate').addEventListener('change',e=>{selectedDate=e.target.value;render();});
    $('seasonRuleContext').addEventListener('change',e=>{if(mode==='fish')fishMethod=e.target.value;else huntArea=e.target.value;render();});
    $('seasonActiveMonth').textContent='მიმდინარე თვე: '+monthLabel(currentMonth);
    const monthSelect=$('seasonMonth');
    MONTHS.forEach((name,i)=>{const option=document.createElement('option');option.value=String(i+1);option.textContent=name;monthSelect.appendChild(option);});
    const strip=$('seasonMonthStrip');
    strip.innerHTML='<button type="button" class="season-month-pill active" data-month="all">ყველა თვე</button>'+MONTHS.map((name,i)=>'<button type="button" class="season-month-pill" data-month="'+(i+1)+'">'+esc(name)+'</button>').join('');
    document.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{mode=btn.dataset.mode;contextControls();render();}));
    monthSelect.addEventListener('change',()=>{selectedMonth=monthSelect.value;render();});
    $('seasonSearch').addEventListener('input',e=>{searchText=e.target.value||'';render();});
    strip.addEventListener('click',e=>{const btn=e.target.closest('[data-month]');if(!btn)return;selectedMonth=btn.dataset.month;monthSelect.value=selectedMonth;render();});
    $('seasonReset').addEventListener('click',()=>{selectedMonth='all';searchText='';monthSelect.value='all';$('seasonSearch').value='';mode='fish';selectedDate=today;fishMethod='rod';huntArea='unknown';$('seasonRuleDate').value=today;contextControls();render();window.scrollTo({top:$('seasonControls')?$('seasonControls').offsetTop:0,behavior:'smooth'});});
    render();
  }
  document.addEventListener('DOMContentLoaded',setup);
})();
