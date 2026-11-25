'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({
  executablePath:'/usr/bin/google-chrome',headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage']
 });
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
 page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsFoodBridge&&window.LifeSimsFood?.open);
  const base=await page.evaluate(()=>{
   const B=window.LifeSimsFoodBridge,date=B.today();
   return B.upsert({
    date,time:'08:15',title:'Творог тестовый',ingredients:'молоко, закваска',
    grams:250,kcal:350,protein:40,fat:15,carbs:10,
    method:'catalog',estimate:false,photoSource:'Open Food Facts',
    barcode:'4601234567890'
   });
  });
  await page.evaluate(date=>window.LifeSimsFood.open(date),base.date);
  const editButton=page.getByRole('button',{name:'Изменить время приёма пищи: Творог тестовый'});
  await editButton.click();
  assert.equal(await page.locator('#mealChatTime').inputValue(),'08:15');
  assert.equal(await page.locator('#mealChatInput').inputValue(),'Творог тестовый: молоко, закваска');
  await page.locator('#mealChatTime').fill('09:45');
  await page.locator('#mealChatSend').click();
  const changed=await page.evaluate(id=>{
   const matches=window.LifeSimsFoodBridge.list().filter(m=>m.id===id);
   return {count:matches.length,item:matches[0]};
  },base.id);
  assert.equal(changed.count,1,'Time change cannot duplicate a meal');
  assert.equal(changed.item.id,base.id);
  assert.equal(changed.item.time,'09:45');
  for(const k of ['title','ingredients','kcal','protein','fat','carbs','grams','photoSource','barcode','method','estimate','createdAt'])
   assert.deepEqual(changed.item[k],base[k],'Time-only edit changed '+k);
  assert.match(await page.locator('#mealChatStatus').innerText(),/Калории и БЖУ не изменились/);
  assert.equal(await page.locator('#mealChatTime').inputValue().then(v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v)),true);

  // The ordinary "Изменить" action must expose the same clock control.
  await page.locator('.meal-chat-actions button').filter({hasText:'Изменить'}).first().click();
  assert.equal(await page.locator('#mealChatTime').inputValue(),'09:45');
  await page.locator('#mealChatTime').fill('10:05');
  await page.locator('#mealChatSend').click();
  const second=await page.evaluate(id=>window.LifeSimsFoodBridge.list().find(m=>m.id===id),base.id);
  assert.equal(second.time,'10:05');
  assert.equal(second.kcal,base.kcal);

  // The new-entry clock must also accept times earlier than the current one.
  await page.locator('#mealChatTime').fill('06:20');
  await page.locator('#mealChatInput').fill('Яйца');
  await page.locator('#mealChatSend').click();
  const created=await page.evaluate(()=>window.LifeSimsFoodBridge.list().find(m=>m.title==='Яйца'));
  assert.ok(created,'New meal must save');
  assert.equal(created.time,'06:20');
  assert.equal(await page.locator('.meal-chat-entry').count(),2);

  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsFoodBridge&&window.LifeSimsFood?.open);
  const persisted=await page.evaluate(({oldId,newId})=>{
   const records=window.LifeSimsFoodBridge.list();
   return {old:records.filter(m=>m.id===oldId),fresh:records.filter(m=>m.id===newId)};
  },{oldId:base.id,newId:created.id});
  assert.equal(persisted.old.length,1);
  assert.equal(persisted.old[0].time,'10:05');
  assert.equal(persisted.old[0].kcal,350);
  assert.equal(persisted.fresh.length,1);
  assert.equal(persisted.fresh[0].time,'06:20');
  assert.deepEqual(errors,[],'Uncaught errors in food logging');
  console.log('MEAL TIME EDIT: PASS (existing time, separate clock, unchanged nutrition, no duplicates, new time, reload)');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
