const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',async d=>{await d.accept()});
 try{
  await page.goto('http://127.0.0.1:8765/scene/?family-smoke=1',{waitUntil:'domcontentloaded'});
  await page.locator('#familyOpen').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.LifeSimsFamily.activeStore()),'lifesims-visual-v1');
  await page.evaluate(()=>localStorage.setItem('lifesims-visual-v1','{"original":"must-stay"}'));
  await page.locator('#familyOpen').click();
  await page.locator('#cloudDialog .cloud-legacy summary').click();
  await page.getByRole('button',{name:'Открыть старые локальные персонажи'}).click();
  await page.locator('#familyDialog').waitFor({state:'visible'});
  await page.locator('#familyBody form input').fill('Ребёнок тест');
  await page.locator('#familyBody form select').selectOption('child');
  await page.locator('#familyBody form button[type=submit]').click();
  const before=await page.evaluate(()=>window.LifeSimsFamily.read());
  assert.equal(before.people.length,2);
  assert.equal(before.links[0].type,'parent');
  const child=page.locator('#familyBody .family-card').filter({hasText:'Ребёнок тест'}).first();
  await child.getByRole('button',{name:'Открыть'}).click();
  await page.waitForFunction(()=>window.LifeSimsFamily?.activeId?.()!== 'primary');
  const saveKeys=await page.evaluate(()=>({
   active:window.LifeSimsFamily.activeStore(),
   original:localStorage.getItem('lifesims-visual-v1'),
   google:!!window.LifeSimsGoogleCalendarActions,
   oura:!!window.LifeSimsOuraSync
  }));
  assert.match(saveKeys.active,/^lifesims-family-profile-/);
  assert.equal(saveKeys.original,'{"original":"must-stay"}');
  assert.equal(saveKeys.google,false,'Parent Google OAuth must be off');
  assert.equal(saveKeys.oura,false,'Parent Oura OAuth must be off');
  assert.ok((await page.locator('.topbar .person strong').innerText()).includes('Ребёнок тест'));
  await page.locator('#familyOpen').click();
  await page.locator('#cloudDialog .cloud-legacy summary').click();
  await page.getByRole('button',{name:'Открыть старые локальные персонажи'}).click();
  await page.locator('#familyDialog').waitFor({state:'visible'});
  const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
  await page.locator('#familyBody input[type=file]').first().setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:pixel});
  await page.waitForFunction(()=>window.LifeSimsFamily.read().people.find(x=>x.id===window.LifeSimsFamily.activeId()).avatar.startsWith('data:image/jpeg'));
  await page.locator('#familyNav').getByRole('button',{name:'Связи'}).click();
  await page.getByRole('button',{name:'Записать заботу'}).click();
  const gain=await page.evaluate(()=>window.LifeSimsFamily.resourceBonus(window.LifeSimsTaskBridge.today()));
  assert.equal(gain,3);
  await page.locator('#familyNav').getByRole('button',{name:'Комната'}).click();
  await page.locator('#familyBody input[type=file]').first().setInputFiles({name:'room.png',mimeType:'image/png',buffer:pixel});
  await page.locator('#scene .family-photo-room').waitFor({state:'visible'});
  await page.locator('#familyBody select').first().selectOption('bed');
  await page.getByRole('button',{name:/Указать место предмета/}).click();
  await page.locator('#scene .family-photo-room').click({position:{x:90,y:250}});
  await page.locator('#scene .family-marker').waitFor({state:'visible'});
  assert.equal(await page.locator('#scene .family-marker').count(),1);
  await page.locator('#scene .family-marker').click();
  assert.ok(await page.locator('#sheetWrap').evaluate(x=>x.classList.contains('open')),'Room marker did not open existing object actions');
  await page.locator('#scene .family-room-tools').getByRole('button',{name:'Обычная комната'}).click();
  assert.equal(await page.locator('#scene .family-photo-room').count(),0);
  console.log('Family smoke: local profiles, child isolation, portrait, care, photographic room: PASS');
  if(errors.length)console.warn('Non-fatal page errors: '+errors.slice(0,3).join(' | '));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
