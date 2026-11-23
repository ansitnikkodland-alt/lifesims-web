'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsOuraBridge&&window.LifeSimsTaskBridge&&window.LifeSimsLiveMetrics);
  const today=await page.evaluate(()=>window.LifeSimsTaskBridge.today());
  const importSleep=hours=>page.evaluate(async h=>{
   const date=window.LifeSimsTaskBridge.today();
   window.LifeSimsOuraBridge.importDays([{date,metrics:{sleepHours:h},scores:{readiness:80,activity:80}}]);
  },hours);
  const sleepDisplay=()=>page.evaluate(()=>{
   const card=[...document.querySelectorAll('#needsGrid .meter')].find(x=>x.textContent.includes('Сон'));
   if(!card)throw Error('Sleep meter not found');
   return {color:card.querySelector('.bar b')?.style.getPropertyValue('--meter-color'),
    crystal:document.getElementById('sceneCrystalTint').style.getPropertyValue('--crystal-hue')};
  });
  await importSleep(6);
  let meter=await sleepDisplay();
  assert.equal(meter.color,'#efb954','Six-hour sleep must not be green');
  assert.notEqual(meter.crystal,'-55deg','Insufficient sleep must influence crystal color');
  await page.locator('svg.touchmap [data-object="bed"]').dispatchEvent('click');
  const make=page.locator('#sheetActions > button').filter({hasText:'Заправить кровать'});
  await make.click();
  let synced=await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge,habit=api.read().activities.find(a=>a.id==='bed_make');
   return {count:api.habitAmount('bed_make',api.today()),logged:(habit?.completions||[]).filter(c=>c.date===api.today()).length};
  });
  assert.equal(synced.count,1);
  assert.equal(synced.logged,1);
  await page.locator('svg.touchmap [data-object="bed"]').dispatchEvent('click');
  assert.equal((await page.locator('#sheetActions').innerText()).includes('✓ Кровать заправлена'),true);
  await page.locator('#closeSheet').click();
  const repeat=await page.evaluate(()=>{
   const a=window.LifeSimsTaskBridge.read().activities.find(x=>x.id==='bed_make');
   return a.completions.filter(c=>c.date===window.LifeSimsTaskBridge.today()).length;
  });
  assert.equal(repeat,1,'Bed action should not award a second completion');

  await importSleep(7.5);
  meter=await sleepDisplay();
  assert.equal(meter.color,'#43d68b','Seven-and-a-half-hour sleep must be green');
  await importSleep(8.5);
  meter=await sleepDisplay();
  assert.notEqual(meter.color,'#43d68b','Over eight hours is outside requested green range');

  // Test the exact new decay curve with a pure food item and no manual overrides.
  const satiety=await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge,items=api.read().foodMeals;
   items.splice(0);
   const sample=hoursAgo=>{
    const d=new Date(Date.now()-hoursAgo*3600000),date=
     d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const time=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    items.splice(0,items.length,{id:'satiety-regression',date,time,title:'Омлет',protein:100,fat:0,carbs:0});
    return window.LifeSimsLiveMetrics.inspect().value;
   };
   return {zero:sample(0),two:sample(2),four:sample(4),sixteen:sample(16)};
  });
  assert.ok(satiety.zero>=98&&satiety.zero<=100,JSON.stringify(satiety));
  assert.ok(satiety.two>=58&&satiety.two<=61,JSON.stringify(satiety));
  assert.ok(satiety.four>=19&&satiety.four<=21,JSON.stringify(satiety));
  assert.equal(satiety.sixteen,0,JSON.stringify(satiety));
  // Simulate a prior bed action with an unsynchronized tracker entry, then load the saved state.
  await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge,date=api.today();
   const saved=JSON.parse(localStorage.getItem('lifesims-visual-v1'));
   saved.room.bedMadeOn=date;
   saved.room.bedHabitSyncOn=null;
   const habit=saved.activities.find(a=>a.id==='bed_make');
   habit.completions=habit.completions.filter(c=>c.date!==date);
   saved.events=saved.events.filter(e=>!(e.kind==='complete'&&e.activityId==='bed_make'&&e.date===date));
   localStorage.setItem('lifesims-visual-v1',JSON.stringify(saved));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsTaskBridge&&window.LifeSimsHabitGrid);
  const repaired=await page.evaluate(()=>{
   const api=window.LifeSimsTaskBridge;
   return {count:api.habitAmount('bed_make',api.today()),
    events:api.read().events.filter(e=>e.kind==='complete'&&e.activityId==='bed_make'&&e.date===api.today()).length};
  });
  assert.deepEqual(repaired,{count:1,events:1});
  if(errors.length)console.warn('PAGE ERRORS:',errors.slice(0,5).join(' | '));
  console.log('BED HABIT, SLEEP COLORS, SATIETY CURVE: PASS',JSON.stringify(satiety));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
