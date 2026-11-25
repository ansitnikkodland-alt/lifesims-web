'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844},locale:'ru-RU'});
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 const cors={'Content-Type':'application/json','Access-Control-Allow-Origin':'*'};
 let apiCalls=0;
 await page.route('https://world.openfoodfacts.org/**',async route=>route.fulfill({
  status:200,headers:cors,body:JSON.stringify({products:[]})
 }));
 await page.route('https://lifesims-family-test-api.onrender.com/v1/food/fatsecret/**',async route=>{
  apiCalls++;
  const url=route.request().url();
  const search=url.includes('/search?');
  const food=search?{provider:'FatSecret',region:'US',foods:[{
   foodId:'50953',name:'Whole Grain Cereal',brand:'Example',title:'Whole Grain Cereal · Example',
   source:'FatSecret',description:'Per 1 serving - Calories: 100kcal | Fat: 2g | Carbs: 20g | Protein: 3g'}]}:
   {provider:'FatSecret',region:'US',food:{
    foodId:'50953',name:'Whole Grain Cereal',brand:'Example',title:'Whole Grain Cereal · Example',
    source:'FatSecret',per100:{kcal:333.33,protein:10,fat:6.67,carbs:66.67},
    gramsEstimate:30,portionUnit:'g',servings:[{servingId:'100',serving:'1 cup',grams:30}],
    confidence:'Данные FatSecret (каталог США). Проверь единицы порции и значения перед записью.'}};
  await route.fulfill({status:200,headers:cors,body:JSON.stringify(food)});
 });
 try{
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsFoodExplorer&&window.LifeSimsFoodBridge);
  await page.evaluate(()=>window.LifeSimsFood.open());
  await page.locator('#mealChat .fs-food-launch').click();
  await page.locator('#fsFeSearch').fill('cereal');
  await page.locator('#fsFeFind').click();
  const result=page.locator('#fsFeResults .fs-fe-pick').filter({hasText:'Whole Grain Cereal'});
  await result.waitFor();
  assert.ok((await result.innerText()).includes('FatSecret'));
  assert.ok((await result.innerText()).includes('FatSecret'), 'FatSecret attribution must be visible on the selected row');
  await result.click();
  await page.locator('#mealLookupNutrition').waitFor({state:'visible'});
  assert.ok((await page.locator('#mealLookupSource').innerText()).includes('FatSecret'));
  assert.equal(await page.locator('#mealLookupGrams').inputValue(),'30');
  assert.ok(Math.abs(Number(await page.locator('#mealLookupKcal').inputValue())-333.33)<0.01);
  await page.locator('#mealChatSend').click();
  const meal=await page.evaluate(()=>window.LifeSimsFoodBridge.list().find(x=>x.title.includes('Whole Grain Cereal')));
  assert.ok(meal,'Chosen food must create a meal');
  assert.equal(meal.grams,30);
  assert.equal(meal.kcal,100);
  assert.equal(meal.photoSource,'FatSecret (каталог США)');
  assert.ok(apiCalls>=2,'A search and food detail request are required');
  assert.deepEqual(pageErrors,[]);
  console.log('FATSECRET UI: PASS (separate source, protected backend, serving normalization, user confirmed meal)');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
