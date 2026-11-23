'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:760},locale:'ru-RU'});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  await page.locator('#familyOpen').click();
  const form=page.locator('#cloudBody form').filter({hasText:'Войти в LifeSims'});
  const button=form.getByRole('button',{name:'Войти',exact:true});
  const username=form.locator('input[autocomplete="username"]');
  const password=form.locator('input[autocomplete="current-password"]');
  const feedback=form.locator('.cloud-login-feedback');
  assert.equal(await button.isEnabled(),true);
  assert.equal(await button.evaluate(el=>getComputedStyle(el).pointerEvents),'auto');

  // Blank fields must not silently prevent a button click.
  await button.click();
  await feedback.getByText(/Укажи email взрослого аккаунта/).waitFor();
  assert.equal(await username.evaluate(el=>document.activeElement===el),true);

  await username.fill('qa-user@example.test');
  await button.click();
  await feedback.getByText(/Введи пароль/).waitFor();
  assert.equal(await password.evaluate(el=>document.activeElement===el),true);

  let calls=0;
  await page.route('http://127.0.0.1:8766/v1/auth/login',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{
    'Access-Control-Allow-Origin':'http://127.0.0.1:8765',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type'}});
   calls++;
   await new Promise(resolve=>setTimeout(resolve,250));
   await route.fulfill({status:401,headers:{
    'Access-Control-Allow-Origin':'http://127.0.0.1:8765','Content-Type':'application/json'},
    body:JSON.stringify({error:'Неверный логин или пароль'})});
  });
  await password.fill('IncorrectPassword!123');
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#cloudBody form button[disabled]')?.textContent==='Вход…');
  await form.locator('button').evaluate(el=>el.click());
  await feedback.getByText(/Неверный логин или пароль/).waitFor();
  assert.equal(calls,1,'Must not submit duplicate sign-in requests');
  assert.equal(await button.isEnabled(),true,'Retry remains possible');

  await page.unroute('http://127.0.0.1:8766/v1/auth/login');
  await page.route('http://127.0.0.1:8766/v1/auth/login',async route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{
    'Access-Control-Allow-Origin':'http://127.0.0.1:8765',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type'}});
   await route.fulfill({status:429,headers:{
    'Access-Control-Allow-Origin':'http://127.0.0.1:8765','Content-Type':'application/json'},
    body:JSON.stringify({error:'Много попыток входа — попробуйте позже'})});
  });
  await button.click();
  await feedback.getByText(/Слишком много попыток входа/).waitFor();

  // Valid browser click target in horizontal mobile mode.
  await page.setViewportSize({width:891,height:411});
  await form.scrollIntoViewIfNeeded();
  const tapTarget=await button.evaluate(el=>{
   const r=el.getBoundingClientRect();
   return {x:r.left+r.width/2,y:r.top+r.height/2,visible:r.width>0&&r.height>=40};
  });
  assert.ok(tapTarget.visible,'Landscape login button must remain visible');
  await button.click();
  await feedback.getByText(/Слишком много попыток входа/).waitFor();

  assert.deepEqual(errors,[],'Unexpected page errors');
  console.log('LOGIN FORM: PASS (empty, missing password, 401, 429, no duplicates, mobile landscape)');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
