'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 page.setDefaultTimeout(70000);
 try{
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
   const finder=window.LifeSimsMealPhoto;
   if(!finder?.productByBarcode)throw Error('Missing product lookup');
   const item=await finder.productByBarcode('3017620422003');
   return {name:item.title,source:item.source,barcode:item.barcode,kcal:item.per100?.kcal};
  });
  assert.equal(result.barcode,'3017620422003');
  assert.equal(result.source,'Open Food Facts');
  assert.ok(result.name.length>0);
  console.log('LIVE CATALOG BARCODE FETCH PASS:',JSON.stringify(result));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
