/* Motivate Clock-inspired LifeSims Work/Rest/Projects usage report. */
(()=>{'use strict';
const B=window.LifeSimsScreenTimeBridge,editor=window.LifeSimsScreenTimeLinks;
const history=document.getElementById('history'),importer=document.getElementById('sfImport');
if(!B||!history)return;
const el=(tag,cls,text)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const fmt=s=>{
 const seconds=Math.round(s||0),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
 return hours?hours+' ч '+minutes+' мин':minutes?minutes+' мин':seconds+' сек';
};
const offset=(day,n)=>{
 const d=new Date(day+'T12:00:00');
 if(Number.isNaN(d.getTime()))return day;
 d.setDate(d.getDate()+n);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
const modes=[
 {id:'work',title:'Работа',icon:'💼',color:'#4db9a0'},
 {id:'rest',title:'Отдых',icon:'☕',color:'#eca766'},
 {id:'other',title:'Другое',icon:'◌',color:'#9ca7d2'},
 {id:'',title:'Не распределено',icon:'?',color:'#8290aa'}
];
let period='day',filter='all';
const root=el('details','sf-time-report');root.id='sfTimeReport';root.open=true;
root.append(el('summary','sf-report-head','⏱ Учёт времени · Work / Rest · Проекты'));
const body=el('div','sf-report-content');root.append(body);
if(importer)history.insertBefore(root,importer);else history.append(root);
const controls=el('div','sf-report-controls');
const dayBtn=el('button','sf-report-tab','День'),weekBtn=el('button','sf-report-tab','7 дней');
for(const b of [dayBtn,weekBtn])b.type='button';
const date=el('input','sf-report-date');date.type='date';date.setAttribute('aria-label','Дата отчёта');
const sync=el('button','sf-report-refresh','Обновить');sync.type='button';
controls.append(dayBtn,weekBtn,date,sync);body.append(controls);
const summary=el('div','sf-report-summary'),breakdown=el('div','sf-report-breakdown');
const tabs=el('div','sf-report-filters'),projects=el('div','sf-report-projects'),apps=el('div','sf-report-apps');
const hint=el('p','sf-hint','Как в Motivate Clock: назначь приложению работу, отдых и проект. Правило по умолчанию применяется к следующей синхронизации. Без правила время остаётся нераспределённым.');
body.append(summary,breakdown,tabs,projects,apps,hint);
for(const mode of [{id:'all',title:'Все'},...modes]){
 const b=el('button','sf-report-filter',mode.title);b.type='button';b.dataset.mode=mode.id;
 b.addEventListener('click',()=>{filter=mode.id;render()});tabs.append(b);
}
function selected(){
 const fromCalendar=document.getElementById('historyDate')?.value;
 if(/^\d{4}-\d\d-\d\d$/.test(fromCalendar||''))return fromCalendar;
 const today=new Date();
 return [today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
}
dayBtn.onclick=()=>{period='day';render()};
weekBtn.onclick=()=>{period='week';render()};
date.onchange=()=>{
 const target=date.value;
 const calendarDate=document.getElementById('historyDate');
 if(calendarDate){calendarDate.value=target;B.refresh()}else render();
};
sync.onclick=()=>{window.LifeSimsAndroidUsageSync?.sync?.(true).then(render).catch(render)};
function combinedRows(raw){
 const map=new Map();
 for(const row of raw){
  const key=(row.packageName||row.app).trim().toLocaleLowerCase('ru');
  const current=map.get(key);
  if(current){current.seconds+=row.seconds;current.instances.push(row)}
  else map.set(key,{...row,instances:[row]});
 }
 return [...map.values()].sort((a,b)=>b.seconds-a.seconds);
}
function card(label,value,detail,cls){
 const node=el('article','sf-report-metric '+cls);
 node.append(el('span','sf-report-metric-label',label),el('strong','',value),el('small','',detail));
 return node;
}
function render(){
 const day=selected(),from=period==='week'?offset(day,-6):day;
 if(date.value!==day)date.value=day;
 dayBtn.classList.toggle('active',period==='day');
 weekBtn.classList.toggle('active',period==='week');
 const rows=B.summary(from,day),total=rows.reduce((sum,r)=>sum+r.seconds,0);
 const totals=Object.fromEntries(modes.map(m=>[m.id,0]));
 for(const row of rows){
  const mode=modes.some(m=>m.id===row.link.mode)?row.link.mode:'';
  totals[mode]+=row.seconds;
 }
 const work=totals.work,rest=totals.rest;
 summary.replaceChildren();
 const donut=el('div','sf-report-donut');
 const p=total?100*work/total:0,q=total?100*rest/total:0,r=total?100*totals.other/total:0;
 donut.style.background=total?'conic-gradient(#4db9a0 0% '+p+'%,#eca766 '+p+'% '+(p+q)+'%,#9ca7d2 '+(p+q)+'% '+(p+q+r)+'%,#8290aa '+(p+q+r)+'% 100%)':'conic-gradient(#52627e 0% 100%)';
 donut.setAttribute('role','img');
 donut.setAttribute('aria-label','Работа '+fmt(work)+', отдых '+fmt(rest)+', другое '+fmt(totals.other)+', не распределено '+fmt(totals['']));
 const center=el('span','sf-report-donut-center');
 center.append(el('strong','',fmt(total)),el('small','',period==='week'?'за 7 дней':'за день'));
 donut.append(center);summary.append(donut);
 const metrics=el('div','sf-report-metrics');
 metrics.append(
  card('💼 Работа',fmt(work),total?Math.round(100*work/total)+'%':'—','work'),
  card('☕ Отдых',fmt(rest),total?Math.round(100*rest/total)+'%':'—','rest'),
  card('◌ Остальное',fmt(totals.other+totals['']),total?'Без распределения: '+fmt(totals['']):'—','unknown')
 );
 summary.append(metrics);
 breakdown.replaceChildren();
 for(const mode of modes){
  const line=el('div','sf-report-mode-row'),bar=el('div','sf-report-mode-bar');
  const fill=el('span','sf-report-mode-fill');
  fill.style.width=(total?100*totals[mode.id]/total:0).toFixed(1)+'%';fill.style.background=mode.color;
  bar.append(fill);
  line.append(el('span','sf-report-mode-label',mode.icon+' '+mode.title),bar,el('strong','',fmt(totals[mode.id])));
  breakdown.append(line);
 }
 for(const tab of tabs.querySelectorAll('button'))tab.classList.toggle('active',tab.dataset.mode===filter);
 const filtered=filter==='all'?rows:rows.filter(row=>(row.link.mode||'')===filter);
 projects.replaceChildren();apps.replaceChildren();
 projects.append(el('h4','','📂 Проекты · распределение времени'));
 if(filtered.length){
  const groups=new Map(),known=B.options(day).projects;
  for(const row of filtered){
   const id=row.link.projectId||'';
   const name=known.find(x=>x.id===id)?.name||'Без проекта';
   groups.set(name,(groups.get(name)||0)+row.seconds);
  }
  for(const [name,seconds] of [...groups].sort((a,b)=>b[1]-a[1])){
   const line=el('div','sf-report-project-line');
   line.append(el('span','',name),el('strong','',fmt(seconds)));projects.append(line);
  }
 }else projects.append(el('p','sf-hint','Пока нечего распределять.'));
 apps.append(el('h4','','📱 Приложения · '+(period==='week'?'за 7 дней':'за день')));
 if(!filtered.length){
  apps.append(el('p','sf-hint','Нет данных по этому фильтру. Нажми на приложение, чтобы выбрать Work / Rest и проект.'));
  return;
 }
 for(const row of combinedRows(filtered)){
  const action=el('button','sf-report-app-row');action.type='button';
  const image=editor?.icon?.(row)||el('span','sf-app-icon','📱');
  const info=el('span','sf-report-app-info');
  info.append(el('strong','',row.app),el('small','',B.label(row)||'Без классификации · нажми для назначения'));
  action.append(image,info,el('span','sf-report-app-duration',fmt(row.seconds)));
  action.setAttribute('aria-label',row.app+' '+fmt(row.seconds)+' — настроить классификацию');
  action.onclick=()=>editor?.open?.(row.instances[0]||row);
  apps.append(action);
 }
}
window.LifeSimsScreenTimeReport={render};
render();
})();
