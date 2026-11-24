'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsTaskBridge?.deadlineInfo&&window.LifeSimsTaskPremium);
  const dates=await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge,today=api.today();
   return {today,tomorrow:api.dateAdd(today,1),yesterday:api.dateAdd(today,-1),
    afterTomorrow:api.dateAdd(today,2)};
  });
  await page.evaluate(()=>window.LifeSimsTaskBridge.create('task'));
  await page.locator('#taskTitle').fill('Сдать отчёт дедлайн тест');
  await page.locator('#taskDeadlineTime').fill('16:30');
  await page.locator('#taskSave').click();
  assert.equal(await page.locator('#calendarTaskPopup').evaluate(d=>d.open),true,
   'Deadline time without date must not silently save');
  const missing=await page.evaluate(()=>window.LifeSimsTaskBridge.read().activities
   .filter(a=>a.name==='Сдать отчёт дедлайн тест').length);
  assert.equal(missing,0);
  await page.locator('#taskDeadlineDate').fill(dates.tomorrow);
  await page.locator('#taskSave').click();
  let result=await page.evaluate(({tomorrow,today})=>{
   const api=window.LifeSimsTaskBridge,task=api.read().activities.find(a=>a.name==='Сдать отчёт дедлайн тест');
   return {id:task?.id,kind:task?.kind,repeat:task?.repeat,date:task?.deadlineDate,time:task?.deadlineTime,
    start:task?.createdDate,shownOnDeadline:api.due(task.id,tomorrow),shownToday:api.due(task.id,today)};
  },dates);
  assert.equal(result.kind,'task');
  assert.equal(result.repeat,'inbox');
  assert.equal(result.date,dates.tomorrow);
  assert.equal(result.time,'16:30');
  assert.equal(result.start,dates.today);
  assert.equal(result.shownOnDeadline,true);
  assert.equal(result.shownToday,false);

  const statuses=await page.evaluate(({id,tomorrow,afterTomorrow})=>{
   const api=window.LifeSimsTaskBridge,task=api.read().activities.find(a=>a.id===id);
   return {
    minuteBefore:api.deadlineInfo(task,new Date(tomorrow+'T16:29:00')).overdue,
    atDeadline:api.deadlineInfo(task,new Date(tomorrow+'T16:30:00')).overdue,
    nextDate:api.deadlineInfo(task,new Date(afterTomorrow+'T00:00:00')).overdue,
    label:api.deadlineInfo(task).label
   };
  },{id:result.id,tomorrow:dates.tomorrow,afterTomorrow:dates.afterTomorrow});
  assert.equal(statuses.minuteBefore,false);
  assert.equal(statuses.atDeadline,true);
  assert.equal(statuses.nextDate,true);
  assert.match(statuses.label,/Дедлайн.*16:30/);

  await page.evaluate(id=>window.LifeSimsTaskBridge.edit(id),result.id);
  assert.equal(await page.locator('#taskDeadlineDate').inputValue(),dates.tomorrow);
  assert.equal(await page.locator('#taskDeadlineTime').inputValue(),'16:30');
  await page.locator('#taskDeadlineDate').fill(dates.yesterday);
  await page.locator('#taskDeadlineTime').fill('');
  await page.locator('#taskSave').click();
  const overdue=await page.evaluate(id=>{
   const api=window.LifeSimsTaskBridge,task=api.read().activities.find(a=>a.id===id);
   return {status:api.deadlineInfo(task).overdue,displayToday:api.due(id,api.today())};
  },result.id);
  assert.equal(overdue.status,true);
  assert.equal(overdue.displayToday,true);

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsTaskBridge?.deadlineInfo);
  const persisted=await page.evaluate(id=>{
   const api=window.LifeSimsTaskBridge;
   const task=api.read().activities.find(a=>a.id===id);
   return {date:task.deadlineDate,time:task.deadlineTime,overdue:api.deadlineInfo(task).overdue};
  },result.id);
  assert.deepEqual(persisted,{date:dates.yesterday,time:'',overdue:true});

  await page.evaluate(id=>window.LifeSimsTaskBridge.edit(id),result.id);
  await page.locator('#taskDeadlineDate').fill('');
  await page.locator('#taskSave').click();
  const cleared=await page.evaluate(id=>{
   const api=window.LifeSimsTaskBridge,task=api.read().activities.find(a=>a.id===id);
   return {date:task.deadlineDate,time:task.deadlineTime,status:api.deadlineInfo(task).label};
  },result.id);
  assert.deepEqual(cleared,{date:'',time:'',status:''});
  await page.evaluate(()=>window.LifeSimsTaskBridge.create('habit'));
  assert.equal(await page.locator('#taskDeadlineFields').isVisible(),false,
   'Habits must not inherit task deadline');
  await page.locator('#taskKind').selectOption('task');
  assert.equal(await page.locator('#taskDeadlineFields').isVisible(),true,
   'Deadline fields must appear when switching back to task');
  assert.deepEqual(errors,[]);
  console.log('TASK DEADLINE: PASS (separate date and time, validation, overdue, schedule, reload, remove and habit toggle)');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
