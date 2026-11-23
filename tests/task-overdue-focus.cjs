'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsTaskBridge&&window.LifeSimsTaskActions&&window.LifeSimsFocusTimer&&window.LifeSimsTaskPremium);
  const ids=await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge,now=api.today(),yesterday=api.dateAdd(now,-2),tomorrow=api.dateAdd(now,2);
   const shared={kind:'task',repeat:'once',xp:10,completions:[],difficulty:3};
   const entries=[
    {...shared,id:'reg_phone_overdue',name:'Просроченный телефон',object:'phone',createdDate:yesterday},
    {...shared,id:'reg_phone_today',name:'Сегодня телефон',object:'phone',createdDate:now},
    {...shared,id:'reg_phone_future',name:'Будущий телефон',object:'phone',createdDate:tomorrow},
    {...shared,id:'reg_phone_inbox',name:'Без срока телефон',object:'phone',repeat:'inbox',createdDate:yesterday},
    {...shared,id:'reg_phone_english',name:'Найти экзамен по английскому',object:null,repeat:'inbox',createdDate:yesterday,priority:3},
    {...shared,id:'reg_phone_tutor',name:'Написать сафиному репетитору',object:'desk',repeat:'inbox',createdDate:yesterday,priority:3},
    {...shared,id:'reg_phone_done',name:'Уже выполненное дело',object:'phone',createdDate:yesterday,
     completions:[{date:yesterday,at:new Date().toISOString()}]},
    {...shared,id:'reg_desk_report',name:'Написать отчёт',object:'desk',createdDate:yesterday,skills:[],skill:'Астрономия'},
    {...shared,id:'reg_finance',name:'Финансовый контроль',object:null,createdDate:yesterday}
   ];
   api.read().activities.push(...entries.map(entry=>({...entry,completions:[...(entry.completions||[])]})));
   return {now,yesterday,tomorrow};
  });
  const snapshot=await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge,d=api.today();
   return ['reg_phone_overdue','reg_phone_today','reg_phone_future','reg_phone_inbox','reg_desk_report'].map(id=>[id,api.due(id,d),api.overdue(id,d)]);
  });
  assert.deepEqual(snapshot.map(x=>x[1]),[true,true,false,false,true]);
  assert.deepEqual(snapshot.map(x=>x[2]),[true,false,false,false,true]);

  await page.evaluate(()=>window.LifeSimsSkillDetail.open('Астрономия'));
  const astronomy=await page.locator('#skillDetailBody').innerText();
  assert.ok(astronomy.includes('Написать отчёт'),'Linked report missing from Astronomy skill');
  await page.locator('#skillDetailClose').click();
  await page.evaluate(()=>document.getElementById('scenePhone').click());
  const phone=await page.locator('#sheetActions').innerText();
  for(const expected of ['Просроченный телефон','Сегодня телефон','Найти экзамен по английскому',
   'Написать сафиному репетитору','Финансовый контроль','⚠ Просрочено'])assert.ok(phone.includes(expected),phone);
  for(const unexpected of ['Будущий телефон','Уже выполненное дело'])assert.ok(!phone.includes(unexpected),phone);
  assert.ok(phone.includes('Без срока'),phone);
  await page.locator('#closeSheet').click();
  await page.locator('.touchmap [data-object="desk"]').dispatchEvent('click');
  assert.ok((await page.locator('#sheetActions').innerText()).includes('Написать отчёт'));
  await page.locator('#sheetActions > button').filter({hasText:'Написать отчёт'}).evaluate(el=>el.click());
  assert.equal(await page.locator('#lifeTaskActionsDialog').evaluate(el=>el.open),true);
  await page.locator('#lifeTaskActionsFocus').click();
  assert.equal(await page.locator('#tpFocusTask').inputValue(),'reg_desk_report');
  await page.locator('#tpFocusReset').click();
  assert.equal(await page.locator('#tpFocusCompleteDialog').evaluate(el=>el.open),true);
  assert.equal((await page.evaluate(()=>window.LifeSimsTaskBridge.read().activities.find(a=>a.id==='reg_desk_report').completions.length)),0);
  await page.locator('#tpFocusCompleteNo').click();
  await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge;
   api.writeFocus({...api.read().focusTimer,mode:'focus',running:true,endAt:Date.now()-1000,remainingSec:0,taskId:'reg_desk_report'});
   window.LifeSimsFocusTimer.render();
  });
  assert.equal(await page.locator('#tpFocusCompleteDialog').evaluate(el=>el.open),true);
  await page.locator('#tpFocusCompleteYes').click();
  const result=await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge,task=api.read().activities.find(a=>a.id==='reg_desk_report');
   return {createdDate:task.createdDate,dates:task.completions.map(c=>c.date),today:api.today(),
    active:api.due(task.id,api.today()),focusEvents:api.read().events.filter(e=>e.kind==='focus'&&e.activityId===task.id).length};
  });
  assert.equal(result.createdDate,ids.yesterday);
  assert.deepEqual(result.dates,[ids.now]);
  assert.equal(result.active,true);
  assert.equal(result.focusEvents,1);
  // The overdue task is on today's calendar, not duplicated on the old date.
  const rolled=await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge;
   return {overdueDay:api.due('reg_phone_overdue',api.today()),oldDay:api.due('reg_phone_overdue',api.dateAdd(api.today(),-2))};
  });
  assert.deepEqual(rolled,{overdueDay:true,oldDay:false});
  // The PWA recalculates the carried task when tomorrow becomes today.
  await page.clock.install({time:new Date()});
  await page.clock.setFixedTime(new Date(Date.now()+86400000));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  const rollover=await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge;
   const task=api.read().activities.find(a=>a.id==='reg_phone_overdue');
   return {nextDay:api.today(),due:api.due('reg_phone_overdue',api.today()),overdue:api.overdue('reg_phone_overdue',api.today()),
    original:task?.createdDate,repeat:task?.repeat,done:api.done('reg_phone_overdue',api.today()),
    completions:task?.completions,allCount:api.read().activities.length};
  });
  assert.notEqual(rollover.nextDay,ids.now);
  assert.equal(rollover.due,true);
  assert.equal(rollover.original,ids.yesterday);
  console.log('TASK OVERDUE AND POMODORO: PASS');
 } finally {await browser.close()}
 if(errors.length)console.warn('Other page errors:',errors.slice(0,4).join(' | '));
})().catch(error=>{console.error(error);process.exit(1)});
