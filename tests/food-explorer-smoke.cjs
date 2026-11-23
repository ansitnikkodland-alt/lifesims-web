'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({
  executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
 });
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://world.openfoodfacts.org/**',async route=>{
  const target=route.request().url();
  const product={code:'4601234567890',product_name_ru:'Творог тестовый',brands:'Марка',
   quantity:'260 г',nutriments:{'energy-kcal_100g':110,proteins_100g:16,fat_100g:5,carbohydrates_100g:3}};
  await route.fulfill({status:200,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},
   body:JSON.stringify(target.includes('/product/')?{status:1,product}:{products:[product]})});
 });
 try{
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsFoodExplorer&&window.LifeSimsFoodBridge&&window.LifeSimsMealPhoto);
  const seed=await page.evaluate(()=>{
   const B=window.LifeSimsFoodBridge,day=B.today();
   for(let i=0;i<3;i++)B.upsert({date:day,time:'0'+(7+i)+':30',title:'Паста Орзо',
    grams:260,kcal:416,protein:18,fat:15,carbs:46,photoSource:'Проверено вручную',
    method:'manual',remember:true,templateTitle:'Паста Орзо'});
   B.upsert({date:day,time:'12:30',title:'Омлет',
    grams:150,kcal:210,protein:13,fat:15,carbs:3,method:'manual',remember:true});
   return {day};
  });
  await page.evaluate(()=>window.LifeSimsFood.open());
  await page.locator('#mealChat .fs-food-launch').click();
  assert.equal(await page.locator('#fsFoodExplorer').isVisible(),true);
  assert.equal(await page.locator('#fsFeTabs button').count(),4);
  await page.locator('#fsFeTabs [data-view="recent"]').click();
  await page.locator('#fsFeResults').getByText('Паста Орзо').first().waitFor();
  await page.locator('#fsFeTabs [data-view="most"]').click();
  assert.ok((await page.locator('#fsFeResults .fs-fe-pick').first().innerText()).includes('Паста Орзо'));
  const pasta=page.locator('#fsFeResults .fs-fe-row').filter({hasText:'Паста Орзо'});
  await pasta.locator('.fs-fe-star').click();
  await page.locator('#fsFeTabs [data-view="saved"]').click();
  assert.ok((await page.locator('#fsFeResults').innerText()).includes('Паста Орзо'));

  await page.locator('#fsFeTabs [data-view="search"]').click();
  await page.locator('#fsFeSearch').fill('Творог');
  await page.locator('#fsFeFind').click();
  const result=page.locator('#fsFeResults .fs-fe-pick').filter({hasText:'Творог тестовый'});
  await result.waitFor();
  assert.ok((await result.innerText()).includes('Open Food Facts'));
  await result.click();
  assert.equal(await page.locator('#fsFoodExplorer').isVisible(),false);
  assert.equal(await page.locator('#mealLookupNutrition').isVisible(),true);
  assert.ok((await page.locator('#mealLookupSource').innerText()).includes('Open Food Facts'));
  assert.equal(await page.locator('#mealLookupGrams').inputValue(),'260');
  await page.locator('#mealChatSend').click();
  const entered=await page.evaluate(()=>window.LifeSimsFoodBridge.list()
   .find(m=>m.title.includes('Творог тестовый')));
  assert.equal(entered.barcode,'4601234567890');
  assert.equal(entered.photoSource,'Open Food Facts');
  assert.equal(entered.method,'catalog');
  assert.equal(entered.grams,260);
  assert.equal(entered.kcal,286);
  assert.ok((await page.locator('#mealChatContent').innerText()).includes('Источник: Open Food Facts'));

  await page.locator('#mealChat .fs-food-launch').click();
  await page.locator('#fsFeTabs [data-view="recent"]').click();
  await page.locator('#fsFeResults').getByText('Творог тестовый', {exact:false}).first().waitFor();
  const savedTemplate=await page.evaluate(()=>window.LifeSimsFoodBridge.listTemplates()
   .find(m=>m.title.includes('Творог тестовый')));
  assert.equal(savedTemplate.photoSource,'Open Food Facts');
  await page.locator('#fsFeTabs [data-view="search"]').click();

  // Test that the explicit plate-photo action actually calls the meal model,
  // without downloading 93MB into CI or inventing a real prediction.
  await page.evaluate(()=>{
   window.LifeSimsMealPhoto.analyzeFood=async()=>
    ({kind:'meal',source:'Food‑101 (распознавание на устройстве)',title:'Блины',
      candidates:[{title:'Блины',score:.85}],gramsEstimate:170,per100:null,
      confidence:'Это только предположение модели — проверь'});
  });
  const tiny=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+1ytgAAAAASUVORK5CYII=','base64');
  await page.locator('#fsFePhotoInput').setInputFiles({name:'plate.png',mimeType:'image/png',buffer:tiny});
  await page.waitForFunction(()=>document.getElementById('mealChatPhotoFeedback')?.textContent.includes('Food‑101'));
  assert.ok((await page.locator('#mealChatInput').inputValue()).includes('Блины'));
  assert.ok((await page.locator('#mealChatPhotoFeedback').innerText()).includes('Источник: Food‑101'));

  await page.locator('#mealChat .fs-food-launch').click();
  await page.evaluate(()=>{window.LifeSimsMealPhoto.startBarcodeScanner=async()=>()=>{}});
  await page.locator('#fsFeBarcode').click();
  assert.equal(await page.locator('#mealLookupScanner').isVisible(),true);
  assert.deepEqual(errors,[],'Unexpected page errors');
  console.log('FOOD EXPLORER: PASS (recent, frequent, saved, OFF source, barcode, plate photo dispatch, food log)');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
