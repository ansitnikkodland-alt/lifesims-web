'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:820},locale:'ru-RU'});
 const errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 try{
  await page.goto('http://127.0.0.1:8765/scene/',{waitUntil:'domcontentloaded'});
  await page.locator('#familyOpen').click();
  const register=page.locator('#cloudBody form').filter({hasText:'Создать взрослый аккаунт'});
  await register.locator('input[aria-label="Имя"]').fill('Тестовый пользователь');
  await register.locator('input[type="email"]').fill('sample@example.test');
  await register.locator('input[autocomplete="new-password"]').fill('ExamplePassword!2026');
  let count=0;
  await page.route('http://127.0.0.1:8766/v1/auth/register',async route=>{
   count++;
   await new Promise(resolve=>setTimeout(resolve,300));
   await route.fulfill({
    status:429,headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:8765','Content-Type':'application/json'},
    body:JSON.stringify({error:'Слишком много запросов на регистрацию с этого адреса. Повторите позже.'})
   });
  });
  const button=register.getByRole('button',{name:'Зарегистрироваться'});
  await button.click();
  await page.waitForFunction(()=>document.querySelector('#cloudBody form button[disabled]')?.textContent==='Регистрация…');
  await register.locator('button[type="submit"]').evaluate(el=>el.click()); // no second request while pending
  await register.locator('p[role="status"]').getByText(/Сервер временно ограничил/).waitFor();
  assert.equal(count,1,'Double registration request');
  assert.equal(await register.locator('button[type="submit"]').isEnabled(),true,'Button stays blocked');

  await page.unroute('http://127.0.0.1:8766/v1/auth/register');
  await page.route('http://127.0.0.1:8766/v1/auth/register',route=>route.fulfill({
   status:409,headers:{'Access-Control-Allow-Origin':'http://127.0.0.1:8765','Content-Type':'application/json'},
   body:JSON.stringify({error:'Этот email уже зарегистрирован'})
  }));
  await register.getByRole('button',{name:'Зарегистрироваться'}).click();
  await register.locator('p[role="status"]').getByText(/Попробуй войти через форму выше/).waitFor();
  assert.deepEqual(errors,[],'Unhandled browser errors');
  console.log('FAMILY REGISTRATION UI: PASS (429, 409, duplicate prevention)');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});
