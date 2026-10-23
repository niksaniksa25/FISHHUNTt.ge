(function(){
  'use strict';
  const state={data:null,lat:41.7151,lon:44.8271,city:'თბილისი',date:'',hour:'',live:true,followNow:true,timer:null,request:0,error:false,loading:false,missing:true};
  const $=id=>document.getElementById(id);
  const number=value=>value===null||value===undefined||typeof value==='boolean'||(typeof value==='string'&&!value.trim())?null:Number.isFinite(Number(value))?Number(value):null;
  const clamp=value=>{const n=number(value);return n===null?null:Math.max(0,Math.min(100,Math.round(n)));};
  const scoreBand=s=>s===null?['მონაცემი მიუწვდომელია','unknown']:s>=80?['კარგი','good']:s>=50?['საშუალო','mid']:['ცუდი','bad'];
  const format=(value,digits=0,suffix='')=>number(value)===null?'—':Number(value).toFixed(digits)+suffix;
  const setText=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
  const meta=code=>number(code)===null?['—','ამინდის მონაცემი მიუწვდომელია']:codeMeta(code);
  function rowAt(data,iso){
    if(window.GeoNatureCommon?.weatherRowAt)return window.GeoNatureCommon.weatherRowAt(data,iso);
    const i=(data?.hourly?.time||[]).indexOf(iso);if(i<0||typeof iso!=='string')return null;
    const h=data.hourly;
    return {iso,time:iso.slice(11,16),temperature:number(h.temperature_2m?.[i]),apparent_temperature:number(h.apparent_temperature?.[i]),pressure:number(h.pressure_msl?.[i]),wind:number(h.wind_speed_10m?.[i]),gust:number(h.wind_gusts_10m?.[i]),precip:number(h.precipitation?.[i]),rainProb:number(h.precipitation_probability?.[i]),humidity:number(h.relative_humidity_2m?.[i]),cloud:number(h.cloud_cover?.[i]),visibility:number(h.visibility?.[i]),code:number(h.weather_code?.[i]),is_day:number(h.is_day?.[i]),local_hour:Number(iso.slice(11,13))};
  }
  const allRows=()=> (state.data?.hourly?.time||[]).map(iso=>rowAt(state.data,iso)).filter(Boolean);
  const dateRows=date=>allRows().filter(row=>row.iso.slice(0,10)===date);
  const nowISO=()=>window.GeoNatureCommon?.zonedDateTime?.(state.data)?.iso||state.data?.current?.time||'';
  const currentDate=()=>nowISO().slice(0,10);
  const todayHour=()=>nowISO().slice(11,13)+':00';
  function stale(){
    if(state.data?.__meta?.stale)return true;
    const current=state.data?.current?.time,offset=number(state.data?.utc_offset_seconds);
    const shared=window.GeoNatureCommon?.weatherObservationTime?.(state.data);
    if(shared==null&&(!current||offset===null))return false;
    const stamp=shared??(Date.parse(current+'Z')-offset*1000);
    return !Number.isFinite(stamp)||Date.now()-stamp>90*60000||stamp-Date.now()>15*60000;
  }
  function weatherShape(row){return window.GeoNatureCommon?.conditionsFromRow?.(row)||{temperature_2m:row.temperature,apparent_temperature:row.apparent_temperature,pressure_msl:row.pressure,wind_speed_10m:row.wind,wind_gusts_10m:row.gust,precipitation:row.precip,precipitation_probability:row.rainProb,relative_humidity_2m:row.humidity,cloud_cover:row.cloud,visibility:row.visibility,weather_code:row.code,local_hour:row.local_hour,is_day:row.is_day};}
  function valid(row){return ['temperature','wind','precip','code'].every(key=>number(row?.[key])!==null);}
  function outdoorRowScore(row){
    if(!valid(row))return null;
    const scorer=window.GeoNatureCommon?.outdoorScore||window.outdoorScore;
    return typeof scorer==='function'?clamp(scorer(weatherShape(row))):null;
  }
  function fishingScore(row){return valid(row)&&typeof window.fishingEnvironmentScore==='function'?clamp(window.fishingEnvironmentScore(weatherShape(row),undefined)):null;}
  function huntingScore(row){const outdoor=outdoorRowScore(row);if(outdoor===null)return null;const activity=(row.local_hour>=5&&row.local_hour<=9)||(row.local_hour>=17&&row.local_hour<=20)?100:72;return clamp(outdoor*.82+activity*.18);}
  function rowsForBest(date){const currentHour=nowISO().slice(0,13)+':00';return dateRows(date).filter(row=>date!==currentDate()||row.iso>=currentHour);}
  function bestRow(rows){return rows.map(row=>({r:row,s:outdoorRowScore(row)})).filter(item=>item.s!==null).sort((a,b)=>b.s-a.s||a.r.iso.localeCompare(b.r.iso))[0];}
  function currentRow(hourly){
    const c=state.data?.current;if(!c?.time)return hourly;
    const shared=window.GeoNatureCommon?.currentWeatherRow?.(state.data);if(shared)return {...shared,current:true};
    // Current observations replace forecast values only while following now.
    // Rain probability and visibility remain the same hour's forecast fields.
    return {...hourly,iso:c.time,time:c.time.slice(11,16),local_hour:Number(c.time.slice(11,13)),current:true,temperature:number(c.temperature_2m),apparent_temperature:number(c.apparent_temperature),pressure:number(c.pressure_msl),wind:number(c.wind_speed_10m),gust:number(c.wind_gusts_10m),precip:number(c.precipitation),humidity:number(c.relative_humidity_2m),cloud:number(c.cloud_cover),code:number(c.weather_code),is_day:number(c.is_day)};
  }
  function setScoreCard(prefix,score){
    const [label,key]=scoreBand(score),card=$(prefix+'ScoreCard');
    setText(prefix+'Score',score??'—');setText(prefix+'ScoreValue',score??'—');
    if(card)card.dataset.level=key;
    const labelEl=$(prefix+'Band');if(labelEl){labelEl.textContent=label;labelEl.dataset.level=key;}
  }
  function selectDay(date){state.followNow=false;state.date=date;state.hour='';renderDates();renderHours();renderSelected();}
  function renderDates(){
    const dates=[...new Set(allRows().map(row=>row.iso.slice(0,10)))].filter(date=>!currentDate()||date>=currentDate()).slice(0,window.GNPremium?.maxForecastDays?.()||1);
    const sel=$('homeDateSelect');if(!sel)return;
    if(state.followNow||!dates.includes(state.date))state.date=dates.includes(currentDate())?currentDate():dates[0]||'';
    sel.innerHTML=dates.map(date=>`<option value="${date}">${date===currentDate()?'დღეს':new Date(date+'T12:00:00').toLocaleDateString('ka-GE',{weekday:'short',day:'numeric',month:'short'})}</option>`).join('');
    sel.value=state.date;sel.onchange=()=>selectDay(sel.value);
  }
  function renderHours(){
    const rows=dateRows(state.date),sel=$('homeHourSelect'),strip=$('homeHourlyStrip');if(!sel)return;
    const defaultHour=state.date===currentDate()?todayHour():rows[Math.min(12,rows.length-1)]?.time;
    if(state.followNow||!rows.some(row=>row.time===state.hour))state.hour=rows.some(row=>row.time===defaultHour)?defaultHour:rows[0]?.time||'';
    sel.innerHTML=rows.map(row=>`<option value="${row.time}">${row.time}</option>`).join('');sel.value=state.hour;
    const selectHour=time=>{state.followNow=false;state.hour=time;sel.value=time;renderSelected();};sel.onchange=()=>selectHour(sel.value);
    if(!strip)return;
    strip.innerHTML=rows.map(row=>{const outdoor=outdoorRowScore(row),fish=fishingScore(row),hunt=huntingScore(row),key=scoreBand(outdoor)[1],weather=meta(row.code);return `<button type="button" class="home-hour ${row.time===state.hour?'active':''}" data-time="${row.time}"><small>${row.time}</small><span>${weather[0]}</span><b>${format(row.temperature,0,'°')}</b><strong class="score-pill ${key}">${outdoor??'—'}</strong><em>F ${fish??'—'} • H ${hunt??'—'}</em></button>`;}).join('');
    strip.querySelectorAll('.home-hour').forEach(button=>button.onclick=()=>selectHour(button.dataset.time));
  }
  function renderSelected(){
    const hourly=dateRows(state.date).find(row=>row.time===state.hour);
    if(!hourly){renderUnavailable();return;}
    const row=state.followNow?currentRow(hourly):hourly,outdoor=outdoorRowScore(row),fish=fishingScore(row),hunt=huntingScore(row),weather=meta(row.code),key=scoreBand(outdoor)[1];
    state.missing=outdoor===null||(state.followNow&&!row.current);
    setText('homeLiveTitle',state.city);setText('homeCity',state.city);setText('homeSelectedTime',`${row.iso.slice(0,10)} • ${row.time}${row.current?' • ახლა':' • საათობრივი პროგნოზი'}`);
    setText('homeMainTemp',format(row.temperature,1,'°C'));setText('homeMainDesc',weather[1]);setText('homeMainIcon',weather[0]);setText('homeTemp',format(row.temperature,0,'°'));setText('homeDesc',weather[1]);setText('homeIcon',weather[0]);setText('homePressure',format(row.pressure,0,' hPa'));setText('homeWind',format(row.wind,0,' კმ/სთ'));setText('homeHumidity',format(row.humidity,0,'%'));setText('homeRain',format(row.precip,1,' მმ'));
    setScoreCard('outdoor',outdoor);setScoreCard('fishing',fish);setScoreCard('hunting',hunt);setText('homeScore',outdoor??'—');if($('homeGo'))$('homeGo').dataset.level=key;
    setText('homeGoSummary',outdoor===null?'შეფასებისთვის ამინდის მონაცემები არასაკმარისია':outdoor>=80?'კარგი დროა გარეთ გასასვლელად':outdoor>=50?'საშუალო პირობებია — გადაამოწმე საათი':'ცუდი პირობებია — ჯობს სხვა საათი აირჩიო');setText('homeGoScore',outdoor===null?'—':outdoor+'/100');
    const factors={Temp:[row.temperature,1,'°C'],Pressure:[row.pressure,1,' hPa'],Wind:[row.wind,1,' კმ/სთ'],Rain:[row.precip,1,' მმ'],Cloud:[row.cloud,0,'%'],Humidity:[row.humidity,0,'%'],Gust:[row.gust,1,' კმ/სთ'],RainProb:[row.rainProb,0,'%']};
    Object.entries(factors).forEach(([name,args])=>setText('homeFactor'+name,format(...args)));
    const best=bestRow(rowsForBest(state.date));setText('homeBestHour',best?`${best.r.time} • ${best.s}/100`:'—');
    document.querySelectorAll('#homeHourlyStrip .home-hour').forEach(el=>el.classList.toggle('active',el.dataset.time===state.hour));
    renderMode();
    if(window.GNLiveFactors)window.GNLiveFactors.render({data:state.data,row,subject:null,type:'weather',locationName:state.city,live:state.live,selectedCurrent:!!row.current,stale:stale(),error:state.error,missing:state.missing});
    if(window.GeoNatureExtras?.renderHome)window.GeoNatureExtras.renderHome(state.data,row,{live:state.live,current:!!row.current,stale:stale(),error:state.error,missing:state.missing});
  }
  function renderMode(){
    const unavailable=!state.data||state.error||state.missing,old=stale(),forecast=!state.followNow;
    const text=state.loading?'◌ იტვირთება…':unavailable?'○ მონაცემი მიუწვდომელია':old?'○ ძველი მონაცემი':!state.live?'○ შეჩერებულია':forecast?'○ პროგნოზი':'● LIVE';
    setText('homeLiveState',text);setText('assessmentLiveState',text);
    const toggleText=state.live?'ავტოგანახლება: ჩართულია':'ავტოგანახლება: გამორთულია';setText('homeLiveToggle',toggleText);setText('assessmentLiveToggle',toggleText);
    ['homeLiveToggle','assessmentLiveToggle'].forEach(id=>$(id)?.setAttribute?.('aria-pressed',String(state.live)));
    if($('homeNow'))$('homeNow').disabled=state.loading||state.followNow;
    document.body.dataset.live=state.live&&!state.loading&&!unavailable&&!old&&!forecast?'1':'0';
    const header=$('headerLivePill');if(header){header.dataset.live=document.body.dataset.live;const label=header.querySelector('span');if(label)label.textContent=text.replace(/^[●○◌]\s*/,'');}
    window.FishHuntDayPlan?.updateFromHome?.({data:state.data,lat:state.lat,lon:state.lon,city:state.city,loading:state.loading,error:state.error,live:state.live});
  }
  function renderUnavailable(){
    state.missing=true;
    ['homeMainTemp','homeTemp','homePressure','homeWind','homeHumidity','homeRain','homeScore','homeBestHour','homeSelectedTime','homeGoScore'].forEach(id=>setText(id,'—'));
    ['Temp','Pressure','Wind','Rain','Cloud','Humidity','Gust','RainProb'].forEach(name=>setText('homeFactor'+name,'—'));
    ['outdoor','fishing','hunting'].forEach(prefix=>setScoreCard(prefix,null));setText('homeMainIcon','—');setText('homeIcon','—');setText('homeMainDesc','ამინდის მონაცემი მიუწვდომელია');setText('homeDesc','ამინდის მონაცემი მიუწვდომელია');setText('homeGoSummary','მონაცემებს ველოდებით');
    if(window.GNLiveFactors)window.GNLiveFactors.render({data:null,row:null,type:'weather',locationName:state.city,live:state.live,error:true});
    if(window.GeoNatureExtras?.renderHome)window.GeoNatureExtras.renderHome(null,null,{error:true});
    renderMode();
  }
  function renderWeek(){
    const box=$('homeWeekStrip');if(!box)return;
    const dates=[...new Set(allRows().map(row=>row.iso.slice(0,10)))].filter(date=>!currentDate()||date>=currentDate()).slice(0,window.GNPremium?.maxForecastDays?.()||1);
    box.innerHTML=dates.map(date=>{const best=bestRow(rowsForBest(date));if(!best)return '';const [label,key]=scoreBand(best.s);return `<button class="home-day ${key}" data-date="${date}"><small>${new Date(date+'T12:00:00').toLocaleDateString('ka-GE',{weekday:'short'})}</small><b>${Number(date.slice(8,10))}</b><span>${best.s}</span><em>${label} • ${best.r.time}</em></button>`;}).join('');
    box.querySelectorAll('.home-day').forEach(button=>button.onclick=()=>selectDay(button.dataset.date));
  }
  async function load(options={}){
    const request=++state.request,lat=state.lat,lon=state.lon;
    state.loading=true;renderMode();['homeRefresh','assessmentRefresh'].forEach(id=>{if($(id))$(id).disabled=true;});
    try{
      const data=await openMeteo(lat,lon,{force:options.force===true});if(request!==state.request)return;
      if(!data?.hourly?.time?.length)throw new Error('Hourly weather unavailable');
      state.data=data;state.error=false;renderDates();renderWeek();renderHours();renderSelected();
      const stamp=data.__meta?.updatedAt;const at=number(stamp)!==null?new Date(Number(stamp)):new Date();
      const timeOptions={hour:'2-digit',minute:'2-digit'};if(data.timezone)timeOptions.timeZone=data.timezone;
      let time;try{time=at.toLocaleTimeString('ka-GE',timeOptions);}catch(_){time=at.toLocaleTimeString('ka-GE',{hour:'2-digit',minute:'2-digit'});}
      setText('homeUpdated',`${stale()?'ბოლო ხელმისაწვდომი მონაცემი':'განახლდა'} ${time} • Open-Meteo`);
    }catch(error){
      if(request!==state.request)return;state.error=true;console.warn('Home weather unavailable',error);setText('homeUpdated',state.data?'განახლება ვერ მოხერხდა • ნაჩვენებია ბოლო მონაცემი':'ამინდის მონაცემები დროებით მიუწვდომელია');if(state.data)renderSelected();else renderUnavailable();
    }finally{if(request===state.request){state.loading=false;['homeRefresh','assessmentRefresh'].forEach(id=>{if($(id))$(id).disabled=false;});renderMode();}}
  }
  function stop(){if(state.timer){clearInterval(state.timer);state.timer=null;}}
  function start(){stop();if(state.live)state.timer=setInterval(()=>{if(!document.hidden)return load();},300000);}
  function bind(){
    ['homeRefresh','assessmentRefresh'].forEach(id=>$(id)?.addEventListener('click',()=>load({force:true})));
    $('homeNow')?.addEventListener('click',()=>{state.followNow=true;state.date='';state.hour='';if(state.data){renderDates();renderHours();renderSelected();}return load({force:true});});
    const toggle=()=>{state.live=!state.live;if(state.live){state.followNow=true;state.hour='';start();load();}else{stop();renderMode();renderSelected();}};
    ['homeLiveToggle','assessmentLiveToggle'].forEach(id=>$(id)?.addEventListener('click',toggle));
    $('homeLocation')?.addEventListener('change',event=>{const [lat,lon,city]=event.target.value.split(',');if(number(lat)===null||number(lon)===null)return;state.lat=Number(lat);state.lon=Number(lon);state.city=city||'არჩეული ადგილი';state.data=null;state.error=false;state.followNow=true;state.date='';state.hour='';setText('homeCity',state.city);setText('homeLiveTitle',state.city);if($('homeHourlyStrip'))$('homeHourlyStrip').innerHTML='';if($('homeWeekStrip'))$('homeWeekStrip').innerHTML='';renderUnavailable();load({force:true});});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.live)load();});
    window.addEventListener?.('online',()=>{if(state.live)load({force:true});});
    renderMode();start();
  }
  window.GeoNatureHome={load,stop,start};
  document.addEventListener('DOMContentLoaded',async()=>{bind();await load();});
})();
