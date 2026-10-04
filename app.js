(()=>{
const originalFetch=window.fetch.bind(window);
let statsDaily=[];
let selectedDate='';
let chartTimer=null;
try{localStorage.removeItem('nutrition_access_key')}catch{}

function urlOf(input){try{return typeof input==='string'?input:input?.url||String(input)}catch{return''}}
function later(fn){requestAnimationFrame(()=>requestAnimationFrame(fn))}

window.fetch=async(...args)=>{
  const response=await originalFetch(...args);
  const url=urlOf(args[0]);
  try{
    if(url.includes('api=day&date=')&&document.getElementById('dayView')?.classList.contains('active')){
      const u=new URL(url,location.href);
      selectedDate=u.searchParams.get('date')||selectedDate;
      later(enhanceCalendar);
    }
    if(url.includes('api=stats')){
      response.clone().json().then(data=>{
        if(Array.isArray(data?.daily)){
          statsDaily=data.daily;
          clearTimeout(chartTimer);
          chartTimer=setTimeout(enhanceTrendChart,20);
        }
      }).catch(()=>{});
    }
  }catch{}
  return response;
};

function svgIcon(name){return `<span class="nav-icon"><svg><use href="#i-${name}"></use></svg></span>`}

function installSettingsNav(){
  const nav=document.querySelector('.nav-bar');
  if(!nav||document.getElementById('v51SettingsTab'))return;
  const indicator=document.createElement('span');
  indicator.className='nav-indicator';
  indicator.style.left='0px';
  nav.prepend(indicator);
  const btn=document.createElement('button');
  btn.id='v51SettingsTab';
  btn.className='nav-item nav-settings';
  btn.type='button';
  btn.setAttribute('aria-label','Настройки и цели');
  btn.innerHTML=`${svgIcon('settings')}<b>Настройки</b>`;
  btn.addEventListener('click',()=>document.getElementById('settingsBtn')?.click());
  nav.append(btn);
  const update=()=>{
    const active=nav.querySelector('.nav-item.active');
    if(!active)return;
    indicator.style.width=`${active.offsetWidth}px`;
    indicator.style.transform=`translate3d(${active.offsetLeft}px,0,0)`;
  };
  new MutationObserver(update).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
  nav.addEventListener('click',()=>later(update));
  window.addEventListener('resize',update,{passive:true});
  later(update);
}

function enhanceCalendar(){
  const grid=document.getElementById('calendarGrid');
  if(!grid)return;
  grid.querySelectorAll('.cal-day.selected').forEach(x=>x.classList.remove('selected'));
  if(!selectedDate)return;
  const match=[...grid.querySelectorAll('[data-date]')].find(x=>x.dataset.date===selectedDate);
  if(match)match.classList.add('selected');
}

function yFor(value,max,h,pad){return h-pad-(Number(value||0)/max)*(h-2*pad)}
function fmtDate(s){try{return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(new Date(`${s}T12:00:00`)).replace('.','')}catch{return s}}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}

function enhanceTrendChart(){
  const host=document.getElementById('trendChart');
  if(!host||!statsDaily.length)return;
  const signature=statsDaily.map(x=>`${x.date}:${x.entries||0}:${Math.round(Number(x.calories||0))}:${Math.round(Number(x.target||0))}`).join('|');
  if(host.dataset.v51Signature===signature&&host.querySelector('.v51-chart'))return;
  host.dataset.v51Signature=signature;

  const daily=statsDaily;
  const w=600,h=160,pad=16;
  const maxRaw=Math.max(1,...daily.map(x=>Math.max(Number(x.calories||0),Number(x.target||0))));
  const max=maxRaw*1.08;
  const dx=(w-2*pad)/Math.max(1,daily.length-1);
  const pts=daily.map((x,i)=>({
    x:pad+i*dx,
    y:yFor(x.calories,max,h,pad),
    targetY:yFor(x.target,max,h,pad),
    value:Number(x.calories||0),
    target:Number(x.target||0),
    entries:Number(x.entries||0),
    date:x.date
  }));
  const targetValues=daily.map(x=>Number(x.target||0)).filter(v=>v>0);
  const avgTarget=targetValues.length?targetValues.reduce((a,b)=>a+b,0)/targetValues.length:0;
  const bandTop=avgTarget?yFor(avgTarget*1.05,max,h,pad):0;
  const bandBottom=avgTarget?yFor(avgTarget*.9,max,h,pad):0;
  const targetPath=pts.filter(p=>p.target>0).map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.targetY.toFixed(1)}`).join(' ');

  const segments=[];
  let current=[];
  pts.forEach(p=>{
    if(p.entries>0)current.push(p);
    else if(current.length){segments.push(current);current=[]}
  });
  if(current.length)segments.push(current);
  const lines=segments.filter(s=>s.length>1).map(s=>`<path class="v51-data-line" d="${s.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>`).join('');
  const dots=pts.filter(p=>p.entries>0).map((p,i)=>`<circle class="v51-data-dot" cx="${p.x}" cy="${p.y}" r="3.7" style="animation-delay:${Math.min(i*28,220)}ms"/>`).join('');
  const zeros=pts.filter(p=>p.entries===0).map(p=>`<line class="v51-zero" x1="${p.x}" x2="${p.x}" y1="${h-pad-4}" y2="${h-pad}"/>`).join('');
  const labels=pts.map((p,i)=>{
    if(daily.length>10&&i%5!==0&&i!==daily.length-1)return'';
    const day=new Date(`${p.date}T12:00:00`).getDate();
    return `<text class="v51-label" x="${p.x}" y="${h-1}" text-anchor="middle">${day}</text>`;
  }).join('');
  const hits=pts.map((p,i)=>`<circle class="v51-hit" data-i="${i}" cx="${p.x}" cy="${p.entries?p.y:h-pad-2}" r="13"/>`).join('');
  const band=avgTarget?`<rect class="v51-goal-band" x="${pad}" y="${bandTop}" width="${w-pad*2}" height="${Math.max(2,bandBottom-bandTop)}" rx="5"/>`:'';

  host.innerHTML=`<svg class="v51-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="График калорий"><defs><linearGradient id="v51LineGradient"><stop stop-color="#67d4ff"/><stop offset="1" stop-color="#9e8cff"/></linearGradient></defs><g class="chart-grid"><line x1="${pad}" x2="${w-pad}" y1="42" y2="42"/><line x1="${pad}" x2="${w-pad}" y1="82" y2="82"/><line x1="${pad}" x2="${w-pad}" y1="122" y2="122"/></g>${band}${targetPath?`<path class="v51-target-line" d="${targetPath}"/>`:''}${zeros}${lines}${dots}${labels}<g>${hits}</g></svg><div class="chart-tooltip" role="status"></div>`;

  const tip=host.querySelector('.chart-tooltip');
  const show=(index,e)=>{
    const p=pts[index];
    if(!p||!tip)return;
    tip.innerHTML=p.entries?`<b>${esc(fmtDate(p.date))} · ${Math.round(p.value)} ккал</b><span>Цель ${Math.round(p.target||avgTarget||0)} ккал</span>`:`<b>${esc(fmtDate(p.date))}</b><span>Нет записей</span>`;
    const rect=host.getBoundingClientRect();
    const clientX=e?.clientX??(rect.left+rect.width*(p.x/w));
    const x=Math.max(62,Math.min(rect.width-62,clientX-rect.left));
    const y=Math.max(42,rect.height*(p.entries?p.y:(h-pad))/h);
    tip.style.left=`${x}px`;
    tip.style.top=`${y}px`;
    tip.classList.add('show');
  };
  host.querySelectorAll('.v51-hit').forEach(hit=>{
    const i=Number(hit.dataset.i);
    hit.addEventListener('pointerenter',e=>show(i,e));
    hit.addEventListener('pointermove',e=>show(i,e));
    hit.addEventListener('pointerdown',e=>show(i,e));
    hit.addEventListener('pointerleave',()=>tip?.classList.remove('show'));
  });
}

function initPolish(){
  installSettingsNav();
  const migration=document.getElementById('migrationBanner');
  if(migration)migration.remove();
  const calendar=document.getElementById('calendarGrid');
  if(calendar)new MutationObserver(()=>later(enhanceCalendar)).observe(calendar,{childList:true});
  const trend=document.getElementById('trendChart');
  if(trend)new MutationObserver(()=>{
    if(!trend.querySelector('.v51-chart')){
      clearTimeout(chartTimer);
      chartTimer=setTimeout(enhanceTrendChart,12);
    }
  }).observe(trend,{childList:true});
  later(()=>{enhanceCalendar();enhanceTrendChart()});
}

const legacy=document.createElement('script');
legacy.src='./app-v5.js?v=5';
legacy.onload=initPolish;
legacy.onerror=()=>console.error('Не удалось загрузить базовый v5 runtime');
document.body.appendChild(legacy);
})();
