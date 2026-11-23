'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({
  executablePath:'/usr/bin/google-chrome',headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage']
 });
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsScreenTimeBridge&&window.LifeSimsScreenTimeLinks);
  const test=await page.evaluate(()=>{
   const B=window.LifeSimsScreenTimeBridge;
   const day=window.LifeSimsTaskBridge.today();
   const next=window.LifeSimsTaskBridge.dateAdd(day,1);
   const base={app:'Example Time App',packageName:'com.example.timeapp',
    device:'Test Android',source:'android'};
   const row={...base,date:day,seconds:900};
   const first=B.commit([row]);
   if(!first.ok)throw Error('Initial import: '+first.error);
   const created=B.addProject('Development & Study');
   if(!created.ok)throw Error('Create project: '+created.error);
   const saved=B.saveLink(row,{mode:'work',projectId:created.id},'default');
   if(!saved.ok)throw Error('Save project default: '+saved.error);
   const initial=B.link({...row,date:next});
   if(initial.link.projectId!==created.id||initial.link.mode!=='work')
    throw Error('Project default missing before synchronization');
   const changed=B.commit([{...row,seconds:1500},{...base,date:next,seconds:3600}]);
   if(!changed.ok||changed.updated!==1||changed.added!==1)
    throw Error('Usage sync update failed: '+JSON.stringify(changed));
   const synced=B.link({...row,date:next});
   if(synced.link.projectId!==created.id||synced.link.mode!=='work')
    throw Error('Project default lost after synchronization');
   const distinct=B.addProject('One-day Exception');
   if(!distinct.ok)throw Error('Other project creation failed');
   const override=B.saveLink(row,{mode:'rest',projectId:distinct.id},'date');
   if(!override.ok)throw Error('Save per-day override failed');
   const repeat=B.commit([{...row,seconds:1650},{...base,date:next,seconds:3660}]);
   if(!repeat.ok)throw Error('Repeated sync failed: '+repeat.error);
   const today=B.link(row),tomorrow=B.link({...row,date:next});
   if(!today.overridden||today.link.projectId!==distinct.id||today.link.mode!=='rest')
    throw Error('Day-specific exception was lost');
   if(tomorrow.overridden||tomorrow.link.projectId!==created.id||tomorrow.link.mode!=='work')
    throw Error('Global project default was lost');
   return {row,day,next,projectId:created.id,oneDayId:distinct.id};
  });
  // The project and mode must survive even a browser restart, not only redraw.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsScreenTimeBridge&&window.LifeSimsScreenTimeLinks);
  const stored=await page.evaluate(({row,next,projectId,oneDayId})=>{
   const B=window.LifeSimsScreenTimeBridge;
   return {
    day:B.link(row),
    future:B.link({...row,date:next}),
    dayRecords:B.read(row.date).filter(x=>x.packageName===row.packageName).length,
    futureRecords:B.read(next).filter(x=>x.packageName===row.packageName).length,
    report:B.summary(next,next).filter(x=>x.packageName===row.packageName).map(x=>x.link),
    projectId,oneDayId
   };
  },test);
  assert.equal(stored.day.link.projectId,test.oneDayId,'Per-day override lost after reload');
  assert.equal(stored.future.link.projectId,test.projectId,'Default project lost after reload');
  assert.equal(stored.future.link.mode,'work');
  assert.equal(stored.day.link.mode,'rest');
  assert.equal(stored.dayRecords,1,'Sync duplicated earlier app records');
  assert.equal(stored.futureRecords,1,'Sync duplicated following-day app records');
  assert.equal(stored.report[0].projectId,test.projectId,'Report ignored saved default');

  // Reopening the app association editor must select the project automatically.
  await page.evaluate(row=>window.LifeSimsScreenTimeLinks.open(row),{...test.row,date:test.next,seconds:3660});
  const project=await page.locator('#sfLinkDialog').locator('label',{hasText:'Проект'}).locator('select').inputValue();
  assert.equal(project,test.projectId,'Saved app project not selected in editor');
  assert.deepEqual(errors,[],'Unexpected page errors');
  console.log('SCREEN TIME PROJECT DEFAULT: PASS (sync, override, reload, future date, report, editor)');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
