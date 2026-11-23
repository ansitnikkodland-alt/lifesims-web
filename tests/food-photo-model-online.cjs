'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.setDefaultTimeout(240000);
 page.on('pageerror',e=>console.error('PAGE ERROR:',e.message));
 try{
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LifeSimsMealPhoto?.analyzeFood);
  const result=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=224;canvas.height=224;
   const ctx=canvas.getContext('2d');
   ctx.fillStyle='#f4edda';ctx.fillRect(0,0,224,224);
   ctx.fillStyle='#c58d42';ctx.beginPath();ctx.arc(112,112,92,0,2*Math.PI);ctx.fill();
   ctx.fillStyle='#d64336';
   for(let i=0;i<10;i++){let a=i*2*Math.PI/10;ctx.beginPath();ctx.arc(112+68*Math.cos(a),112+68*Math.sin(a),8,0,2*Math.PI);ctx.fill()}
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   const file=new File([blob],'synthetic-food.png',{type:'image/png'});
   const updates=[];
   const output=await window.LifeSimsMealPhoto.analyzeFood(file,message=>{
    if(updates.length<80)updates.push(String(message))
   });
   return {kind:output.kind,source:output.source,candidates:output.candidates,updates};
  },null,{timeout:240000});
  assert.equal(result.kind,'meal');
  assert.equal(result.candidates.length,5);
  assert.ok(result.candidates[0].score>0);
  console.log('REAL FOOD MODEL: PASS',JSON.stringify({source:result.source,candidates:result.candidates,progress:result.updates.slice(0,20)}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
