/* LifeSims Google Calendar sync. OAuth tokens remain in memory; no background writes. */
(function () {
  'use strict';
  const bridge = window.LifeSimsCalendarBridge;
  const section = document.getElementById('googleCalendarMount');
  if (!bridge || !section) return;

  const READ_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
  const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
  const ROOT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const API_ROOT = 'https://www.googleapis.com/calendar/v3';
  const LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';
  const CAL_CHOICE_KEY = 'lifesims-google-calendar-selection';
  const eventsUrl=id=>API_ROOT+'/calendars/'+encodeURIComponent(id)+'/events';
  const CLIENT_KEY = 'lifesims-google-oauth-client-id';
  const DEFAULT_CLIENT_ID = '431544105696-rvvpicrjlrff400pafjb8tp3805lpqj8.apps.googleusercontent.com'; // Public OAuth client ID, not a secret.
  const DAY = 86400000;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const weekdayCodes = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const panel = document.createElement('div');
  panel.className = 'card';
  panel.id = 'googleCalendarPanel';
  panel.innerHTML =
    '<h3>📅 Google Календарь</h3>' +
    '<p class="hint">События выбранных календарей Google → LifeSims. Двусторонний режим позволяет создавать и редактировать события в основном календаре. Удаление в Google доступно только по отдельному подтверждению из редактора события.</p>' +
    '<p class="hint">После входа нажми «Проверить изменения», затем «Применить изменения». Иначе события не появятся в «Календаре». По умолчанию Google доступен только для чтения.</p>' +
    '<details><summary>Технические настройки (обычно не нужны)</summary>' +
    '<label class="field">OAuth Client ID<input id="gcClient" type="text" spellcheck="false" autocomplete="off" value="431544105696-rvvpicrjlrff400pafjb8tp3805lpqj8.apps.googleusercontent.com"></label>' +
    '<p class="hint">Публичный идентификатор приложения. Изменять не требуется.</p></details>' +
    '<div class="row"><button type="button" class="primary" id="gcConnect">Подключить Google</button>' +
    '<button type="button" class="secondary" id="gcDisconnect" disabled>Завершить сеанс</button></div>' +
    '<details id="gcCalendars" open><summary>Какие календари импортировать</summary><div id="gcCalendarList" class="hint">Подключи Google, чтобы загрузить список календарей.</div></details>' +
    '<label class="field">Направление синхронизации<select id="gcMode">' +
    '<option value="pull">Google → LifeSims (без записи в Google)</option>' +
    '<option value="both">Двусторонняя (с записью в Google)</option></select></label>' +
    '<div class="row"><button type="button" class="secondary" id="gcPreview" disabled>Проверить изменения</button>' +
    '<button type="button" class="primary" id="gcApply" disabled>Применить изменения</button></div>' +
    '<p id="gcStatus" class="hint" role="status" aria-live="polite">Google не подключён.</p>' +
    '<div id="gcChanges"></div>' +
    '<details id="gcHiddenPanel"><summary>Скрытые из LifeSims события Google</summary><div id="gcHiddenList"></div></details>' +
    '<p class="hint">Синхронизация выполняется только по кнопке, пока действует разрешение Google. ' +
    'Окно просмотра: от 365 дней назад до 400 дней вперёд. Повторяющиеся события загружаются по отдельным датам, с изменёнными экземплярами; ' +
    'целодневные события поддерживаются. Для списка календарей Google запрашивает отдельное разрешение на чтение названий календарей. ' +
    'Перед первой синхронизацией скачай резервную копию JSON.</p>';
  // Google sync stays inside the unified LifeSims calendar.
  section.append(panel);
  const el = id => document.getElementById(id);
  // Always use the verified project client; an obsolete localStorage value could prevent login.
  el('gcClient').value = DEFAULT_CLIENT_ID;
  renderHidden();

  let token = '', expiry = 0, preview = null, busy = false, authorizedMode = '';
  let availableCalendars = [];
  let calendarListLoaded = false;
  const getChosen=()=>availableCalendars.filter(c=>c.checked);
  function updateSelection(){
    const chosen=getChosen().map(c=>c.id);
    try{localStorage.setItem(CAL_CHOICE_KEY,JSON.stringify(chosen))}catch(_){}
    invalidatePreview();
  }
  let googleLibraryReady = false;
  function status(message) { el('gcStatus').textContent = message; }
  function renderHidden(){
    const target=el('gcHiddenList');target.replaceChildren();
    const hidden=bridge.getHidden?.()||[];
    if(!hidden.length){target.textContent='Скрытых событий нет.';return}
    for(const item of hidden){
      const line=document.createElement('div');line.className='gc-hidden-row';
      const title=document.createElement('span');
      title.textContent=(item.title||'Событие')+' · '+(item.calendarId==='primary'?'Основной календарь':'Другой календарь');
      const button=document.createElement('button');button.type='button';button.className='secondary';
      button.textContent='Восстановить';button.onclick=()=>{
        try{
          bridge.restoreHidden(item.calendarId,item.id);
          invalidatePreview();renderHidden();
          status('Событие разрешено к повторному импорту. Нажми «Проверить изменения» и «Применить изменения».');
        }catch(error){status('⚠ '+error.message)}
      };
      line.append(title,button);target.append(line);
    }
  }
  function ready() {
    const authenticated = !!token && Date.now() < expiry - 30000;
    if (!authenticated) { token = ''; expiry = 0; }
    el('gcConnect').disabled = busy;
    el('gcDisconnect').disabled = busy || !authenticated;
    el('gcPreview').disabled = busy || !authenticated || !calendarListLoaded || !getChosen().length;
    el('gcApply').disabled = busy || !authenticated || !preview || !preview.changes.length;
    el('gcMode').disabled = busy;
    for(const control of el('gcCalendarList').querySelectorAll('input[type=checkbox]'))control.disabled=busy;
  }
  function invalidatePreview() { preview = null; el('gcChanges').replaceChildren(); ready(); }
  function loadIdentityLibrary() {
    if (window.google?.accounts?.oauth2) {
      googleLibraryReady = true;
      status('✓ Google готов. Нажми «Подключить Google».');
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      googleLibraryReady = !!window.google?.accounts?.oauth2;
      if (googleLibraryReady) status('✓ Google готов. Нажми «Подключить Google».');
      else status('Google не загрузил службу авторизации. Открой приложение через Chrome и попробуй ещё раз.');
    };
    script.onerror = () => { googleLibraryReady = false; status('Google Identity Services недоступен. Проверь интернет и блокировку скриптов.'); };
    document.head.append(script);
  }
  status('Модуль LifeSims загружен. Загружаю авторизацию Google…');
  loadIdentityLibrary();
  el('gcClient').addEventListener('change', () => {
    token = ''; expiry = 0; authorizedMode = '';
    invalidatePreview();
    try { localStorage.setItem(CLIENT_KEY, el('gcClient').value.trim()); } catch (_) {}
  });
  el('gcMode').addEventListener('change', () => {
    invalidatePreview();
    if (token && el('gcMode').value === 'both' && authorizedMode !== 'both') {
      token = ''; expiry = 0; ready();
      status('Для двусторонней синхронизации снова нажми «Подключить Google», чтобы разрешить запись.');
    }
  });
  el('gcConnect').addEventListener('click', () => {
    const clientId = el('gcClient').value.trim();
    if (location.protocol !== 'https:') return status('Для Google OAuth открой опубликованный HTTPS-сайт LifeSims, а не локальный HTML.');
    if (!/^[0-9]+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      return status('Укажи OAuth Client ID типа Web application из Google Cloud (не Client Secret).');
    }
    if (!googleLibraryReady || !window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      return status('Авторизация Google ещё загружается. Повтори нажатие, когда есть интернет.');
    }
    try {
      try { localStorage.setItem(CLIENT_KEY, clientId); } catch (_) { /* OAuth must still work if local storage is unavailable */ }
      status('Открываю окно входа Google… Если оно не появилось, открой LifeSims в Chrome, а не во встроенном браузере.');
      const oauth = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: (el('gcMode').value === 'both' ? WRITE_SCOPE : READ_SCOPE)+' '+LIST_SCOPE,
        callback: result => {
          if (result.error || !result.access_token) {
            status('Google не выдал доступ: ' + (result.error || 'операция отменена'));
            return;
          }
          token = result.access_token;
          authorizedMode = el('gcMode').value;
          expiry = Date.now() + Number(result.expires_in || 3600) * 1000;
          invalidatePreview();
          status('Google подключён. Загружаю список календарей…');
          loadCalendars().catch(err=>{calendarListLoaded=false;status('⚠ '+err.message);ready();});
          ready();
        },
        error_callback: result => { status('Не удалось открыть Google: ' + (result.type === 'popup_failed_to_open' ? 'всплывающее окно заблокировано. Открой LifeSims в Chrome.' : result.type === 'popup_closed' ? 'окно входа закрыто. Нажми «Подключить Google» ещё раз.' : (result.type || 'неизвестная ошибка'))); }
      });
      oauth.requestAccessToken(); // GIS defaults to an account chooser; consent is requested if necessary.
    } catch (error) { status('Авторизация Google: ' + error.message); }
  });
  el('gcDisconnect').addEventListener('click', () => {
    if (token && window.google?.accounts?.oauth2?.revoke) window.google.accounts.oauth2.revoke(token, () => {});
    token = ''; expiry = 0; authorizedMode = ''; calendarListLoaded = false; availableCalendars = []; el('gcCalendarList').textContent='Подключи Google для выбора календарей.'; invalidatePreview();
    status('Сеанс завершён. Локальные записи не удалены.');
  });

  async function api(method, path, body, etag) {
    if (!token || Date.now() >= expiry - 30000) {
      token = ''; ready(); throw Error('Сеанс Google истёк. Подключи Google ещё раз.');
    }
    const headers = { Authorization: 'Bearer ' + token };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (etag) headers['If-Match'] = etag;
    let response;
    try {
      response = await fetch(path.startsWith(API_ROOT) ? path : ROOT + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    } catch (_) { throw Error('Нет связи с Google Calendar API. Проверь интернет.'); }
    if (response.status === 401) { token = ''; expiry = 0; ready(); throw Error('Авторизация Google истекла. Подключи аккаунт повторно.'); }
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      if (response.status === 412) throw Error('Google изменил мероприятие после проверки. Заново проверь изменения.');
      throw Error('Google Calendar API: ' + response.status + ' ' + String(data.error?.message || response.statusText).slice(0, 180));
    }
    return data;
  }
  async function loadCalendars(){
    calendarListLoaded=false;
    const list=[];
    let next='';
    do {
      const args=new URLSearchParams({maxResults:'250'});
      if(next)args.set('pageToken',next);
      let data;
      try{data=await api('GET',API_ROOT+'/users/me/calendarList?'+args.toString())}
      catch(err){if(/403|insufficient|scope/i.test(err.message))throw Error('Для выбора всех календарей нужно разрешение Google на просмотр списка календарей. Подключи Google повторно и подтверди оба разрешения. '+err.message);throw err;}
      list.push(...(data.items||[]));
      next=data.nextPageToken||'';
    }while(next&&list.length<500);
    if(next)throw Error('Список календарей слишком большой; импорт остановлен, чтобы не пропустить часть.');
    if(!list.length)throw Error('Google не вернул ни одного доступного календаря.');
    let saved;
    try{const stored=JSON.parse(localStorage.getItem(CAL_CHOICE_KEY));if(Array.isArray(stored))saved=new Set(stored)}catch(_){}
    availableCalendars=list.filter(c=>c.id&&c.accessRole!=='none').map(c=>({
      id:c.id,name:c.summary||'Календарь',primary:!!c.primary,role:c.accessRole||'reader',
      checked:saved?saved.has(c.id):true,color:/^#[0-9a-f]{6}$/i.test(c.backgroundColor||'')?c.backgroundColor:'#4285f4'
    }));
    if(!availableCalendars.length)throw Error('Нет календарей с правом чтения мероприятий.');
    const target=el('gcCalendarList');target.replaceChildren();
    for(const cal of availableCalendars){
      const line=document.createElement('label');
      line.className='gc-calendar-option';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=cal.checked;
      checkbox.addEventListener('change',()=>{cal.checked=checkbox.checked;updateSelection()});
      const dot=document.createElement('span');dot.className='gc-calendar-color';dot.style.background=cal.color;
      const title=document.createElement('span');title.textContent=cal.name+(cal.primary?' · основной':'');
      line.append(checkbox,dot,title);target.append(line);
    }
    calendarListLoaded=true;
    status('Найдено календарей: '+availableCalendars.length+'. Выбрано: '+getChosen().length+'. Нажми «Проверить изменения».');
    ready();
  }
  function localDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const p = x => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function signature(event) {
    const values=[
      String(event.title || ''), String(event.startsAt || ''), String(event.endsAt || ''),
      ['daily','weekly','monthly','yearly'].includes(event.repeat) ? event.repeat : 'none',
      event.repeat === 'weekly' ? [...(event.weekdays || [])].map(Number).sort((a, b) => a - b) : []
    ];
    // Keep legacy timed-event signatures compatible with previously synced data.
    if(event.allDay)values.push('all-day');
    if(event.location||event.description)values.push([String(event.location||''),String(event.description||'')]);
    return JSON.stringify(values);
  }
  function project(event) {
    if (!event || event.status === 'cancelled') return null;
    const allDay=!!event.start?.date&&!event.start?.dateTime;
    if(allDay){
      if(!/^\d{4}-\d\d-\d\d$/.test(event.start.date)||!/^\d{4}-\d\d-\d\d$/.test(event.end?.date||''))return null;
    } else if (!event.start?.dateTime || !event.end?.dateTime) return null;
    let repeat = 'none', weekdays = [];
    if (event.recurrence && event.recurrence.length) {
      if (event.recurrence.length !== 1) return null;
      const rule = event.recurrence[0];
      if (!rule.startsWith('RRULE:')) return null;
      const opts = Object.fromEntries(rule.slice(6).split(';').map(s => s.split('=')));
      if (opts.FREQ !== 'WEEKLY' || (opts.INTERVAL && opts.INTERVAL !== '1') ||
          opts.UNTIL || opts.COUNT || Object.keys(opts).some(k => !['FREQ', 'INTERVAL', 'BYDAY', 'WKST'].includes(k))) return null;
      if (event.start.timeZone && event.start.timeZone !== tz) return null;
      repeat = 'weekly';
      if (opts.BYDAY) {
        weekdays = opts.BYDAY.split(',').map(x => weekdayCodes.indexOf(x) + 1);
        if (weekdays.some(x => x < 1)) return null;
      } else {
        const date = new Date(allDay ? event.start.date+'T12:00:00' : event.start.dateTime);
        weekdays = [((date.getDay() + 6) % 7) + 1];
      }
    }
    const startsAt=allDay?event.start.date+'T00:00':localDate(event.start.dateTime);
    const endsAt=allDay?event.end.date+'T00:00':localDate(event.end.dateTime);
    if (!startsAt || !endsAt || endsAt <= startsAt) return null;
    return { title:event.summary||'Без названия',startsAt,endsAt,repeat,weekdays,allDay,
      location:event.location||'',description:event.description||'' };
  }
  function toGoogle(event) {
    const start = new Date(event.startsAt), end = new Date(event.endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw Error('Неверные даты у «' + event.title + '».');
    if (event.repeat === 'weekly') {
      const days = [...new Set((event.weekdays || []).map(Number))].sort((a, b) => a - b);
      if (!days.length || days.some(n => n < 1 || n > 7)) throw Error('Выбери дни недели для «' + event.title + '».');
      const day = ((start.getDay() + 6) % 7) + 1;
      if (!days.includes(day)) {
        for (let ahead = 1; ahead < 8; ahead++) {
          if (days.includes(((day + ahead - 1) % 7) + 1)) {
            start.setDate(start.getDate() + ahead);
            end.setDate(end.getDate() + ahead);
            break;
          }
        }
      }
    }
    const dateOnly=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    const payload = {
      summary: event.title,
      location: event.location || '',
      description: event.description || '',
      start: event.allDay ? {date:dateOnly(start)} : {dateTime:start.toISOString(),timeZone:tz},
      end: event.allDay ? {date:dateOnly(end)} : {dateTime:end.toISOString(),timeZone:tz}
    };
    if (event.repeat === 'weekly') payload.recurrence = ['RRULE:FREQ=WEEKLY;BYDAY=' +
      [...new Set(event.weekdays)].map(n => weekdayCodes[n - 1]).join(',')];
    else if(event.repeat==='daily')payload.recurrence=['RRULE:FREQ=DAILY'];
    else if(event.repeat==='monthly')payload.recurrence=['RRULE:FREQ=MONTHLY;BYMONTHDAY='+start.getDate()];
    else if(event.repeat==='yearly')payload.recurrence=['RRULE:FREQ=YEARLY;BYMONTH='+(start.getMonth()+1)+';BYMONTHDAY='+start.getDate()];
    else payload.recurrence = [];
    return payload;
  }
  async function listRemote(){
    const from=new Date(Date.now()-365*DAY).toISOString();
    const to=new Date(Date.now()+400*DAY).toISOString();
    const supported=[];
    const chosen=getChosen();
    if(!chosen.length)throw Error('Выбери хотя бы один календарь Google.');
    let skipped=0,total=0;
    for(const calendar of chosen){
      status('Читаю «'+calendar.name+'» ('+(chosen.indexOf(calendar)+1)+'/'+chosen.length+')…');
      const id=calendar.primary?'primary':calendar.id;
      let next='',pages=0;
      do{
        if(++pages>6)throw Error('В календаре «'+calendar.name+'» слишком много событий. Для безопасности частичный импорт отменён.');
        const qs=new URLSearchParams({
          timeMin:from,timeMax:to,maxResults:'2500',singleEvents:'true',
          showDeleted:'false',orderBy:'startTime'
        });
        if(next)qs.set('pageToken',next);
        const data=await api('GET',eventsUrl(id)+'?'+qs.toString());
        for(const event of data.items||[]){
          total++;
          if(total>12000)throw Error('Больше 12 000 событий. Импорт прерван до применения изменений, чтобы не переполнить память браузера.');
          const normalized=project(event);
          if(!normalized){skipped++;continue;}
          supported.push({
            id:event.id,calendarId:id,etag:event.etag||'',
            normalized,sourceName:calendar.name,color:calendar.color,
            seriesId:event.recurringEventId||'',
            eventType:event.eventType||'default',
            writable:calendar.primary
          });
        }
        next=data.nextPageToken||'';
      }while(next);
    }
    return {supported,skipped,visible:total,from:from.slice(0,10),to:to.slice(0,10),chosenCount:chosen.length};
  }
  function calendarMeta(remote,base){
    return {
      id:remote.id,calendarId:remote.calendarId,etag:remote.etag,base,
      sourceName:remote.sourceName,color:remote.color,
      seriesId:remote.seriesId||'',eventType:remote.eventType||'default'
    };
  }
  const eventKey=(calendarId,id)=>calendarId+'::'+id;
  function summarize(changes, skipped, conflicts, orphaned) {
    const types = { import: 0, pull: 0, link: 0, create: 0, push: 0, supersede: 0 };
    for (const c of changes) types[c.type]++;
    return 'Из Google в LifeSims: ' + (types.import + types.pull) + '; без дубликатов привязать: ' + types.link +
      '; создать в Google: ' + types.create + '; обновить в Google: ' + types.push + '; заменить устаревшие серии в отображении: '+types.supersede +
      '; конфликтов (пропущены): ' + conflicts + '; неподдерживаемых событий/исключений: ' + skipped +
      '; не найдено в окне просмотра: ' + orphaned + '. Ничего не удаляется.';
  }
  function renderPreview(data) {
    const box = el('gcChanges'); box.replaceChildren();
    const intro = document.createElement('p');
    intro.className = 'hint';
    intro.textContent = summarize(data.changes, data.skipped, data.conflicts, data.orphaned);
    box.append(intro);
    if (data.changes.length) {
      const list = document.createElement('ul');
      const labels = { import: 'Импорт', pull: 'Обновить LifeSims', link: 'Связать', create: 'Создать в Google', push: 'Обновить Google', supersede: 'Убрать дубль старой серии' };
      for (const ch of data.changes.slice(0, 15)) {
        const row = document.createElement('li');
        row.textContent = labels[ch.type] + ': ' + ch.title + (ch.remote?' · '+ch.remote.sourceName:'');
        list.append(row);
      }
      box.append(list);
      if (data.changes.length > 15) {
        const note = document.createElement('p');
        note.className = 'hint'; note.textContent = 'И ещё ' + (data.changes.length - 15) + ' изменений.';
        box.append(note);
      }
    }
    if (data.conflicts || data.orphaned) {
      const warning = document.createElement('p');
      warning.className = 'hint';
      warning.textContent = 'Конфликтующие и отсутствующие в текущем диапазоне записи не удаляются. Изменённые экземпляры повторов импортируются отдельно, а ранее импортированные серии сохраняются в резервной копии.';
      box.append(warning);
    }
  }
  function makePlan(remoteData, mode, locals) {
    const changes = [], claimed = new Set(), remoteIds = new Set();
    const selectedIds=new Set(getChosen().map(c=>c.primary?'primary':c.id));
    const migrated=new Set();
    const hidden=new Set((bridge.getHidden?.()||[]).map(x=>eventKey(x.calendarId,x.id)));
    let conflicts = 0, orphaned = 0;
    const mapped=new Map(locals.filter(x=>x.google?.id).map(x=>[eventKey(x.google.calendarId||'primary',x.google.id),x]));
    const legacySeries=new Map(locals.filter(x=>x.google?.id&&x.repeat&&x.repeat!=='none')
      .map(x=>[eventKey(x.google.calendarId||'primary',x.google.id),x]));
    for (const remote of remoteData.supported) {
      const key=eventKey(remote.calendarId,remote.id);
      remoteIds.add(key);
      if(hidden.has(key))continue; // User explicitly hid this event locally; don't re-import it.
      if(remote.seriesId){
        const prior=legacySeries.get(eventKey(remote.calendarId,remote.seriesId));
        if(prior&&!migrated.has(prior.id)&&!prior.google?.supersededRange){
          changes.push({type:'supersede',title:prior.title,local:prior});
          migrated.add(prior.id);
        }
      }
      const sig = signature(remote.normalized);
      const linked = mapped.get(key);
      if (linked) {
        claimed.add(linked.id);
        const base = linked.google?.base;
        const localChanged = base !== signature(linked);
        const remoteChanged = base !== sig;
        if (!base || (localChanged && remoteChanged)) { conflicts++; continue; }
        if (remoteChanged) changes.push({ type: 'pull', title: remote.normalized.title, remote, local: linked });
        else if (localChanged && mode === 'both' && remote.calendarId==='primary') changes.push({ type: 'push', title: linked.title, local: linked, remote });
      } else {
        const matches = locals.filter(x => !x.google?.id && !claimed.has(x.id) && signature(x) === sig);
        if (matches.length === 1) {
          claimed.add(matches[0].id);
          changes.push({ type: 'link', title: matches[0].title, local: matches[0], remote });
        } else if (matches.length > 1) {
          // Ambiguous duplicates: do not import or push; wait for manual resolution.
          conflicts++;
          for (const match of matches) claimed.add(match.id);
        } else {
          changes.push({ type: 'import', title: remote.normalized.title, remote });
        }
      }
    }
    if (mode === 'both') {
      for (const local of locals) {
        if (!local.google?.id && !claimed.has(local.id)) changes.push({ type: 'create', title: local.title, local });
      }
    }
    // Hide legacy expanded masters only after individual occurrences are safely stored.
    changes.sort((a,b)=>(a.type==='supersede'?1:0)-(b.type==='supersede'?1:0));
    for (const local of locals) {
      const cid=local.google?.calendarId||'primary';
      if(local.google?.id && selectedIds.has(cid)&&!local.google?.supersededRange&&
        !remoteIds.has(eventKey(cid,local.google.id)))orphaned++;
    }
    return { mode, changes, conflicts, orphaned, skipped: remoteData.skipped,
      snapshot: JSON.stringify(locals), hiddenSnapshot: JSON.stringify(bridge.getHidden?.()||[]),
      from: remoteData.from,to:remoteData.to,calendars:remoteData.chosenCount,seen:remoteData.visible };
  }
  async function withBusy(task) {
    if (busy) return;
    busy = true; ready();
    try { await task(); } catch (e) { status('⚠ ' + e.message); }
    finally { busy = false; ready(); }
  }
  // Remote event deletion is an explicit, authenticated operation: never a sync side effect.
  async function deleteEventInGoogle(localId){
    if(busy)throw Error('Синхронизация ещё выполняется. Заверши её перед удалением.');
    const event=bridge.getSchedule().find(x=>x.id===localId);
    if(!event?.google?.id)throw Error('Это мероприятие не связано с Google.');
    if(!bridge.canWrite())throw Error('Локальное сохранение недоступно. Удаление в Google отменено.');
    if(!token||Date.now()>expiry-30000||authorizedMode!=='both'){
      el('gcMode').value='both';
      el('calendarGoogleEditor').open=true;
      el('calendarGoogleEditor').scrollIntoView({behavior:'smooth',block:'start'});
      status('Чтобы удалить событие в Google, выбери «Двусторонняя», нажми «Подключить Google» и разреши изменение событий. Затем открой мероприятие и нажми удаление ещё раз.');
      throw Error('Требуется повторное подключение Google с правом изменения событий.');
    }
    const calendarId=event.google.calendarId||'primary';
    const cal=availableCalendars.find(x=>calendarId==='primary'?x.primary:x.id===calendarId);
    if(!cal||!['owner','writer'].includes(cal.role)){
      throw Error('Нет подтверждённого права редактирования этого календаря. Можно убрать событие только из LifeSims.');
    }
    busy=true;ready();
    try {
      const path=eventsUrl(calendarId)+'/'+encodeURIComponent(event.google.id);
      const fresh=await api('GET',path);
      if(fresh.status==='cancelled')throw Error('Событие уже отменено в Google. Удали его только из LifeSims.');
      if(event.google.etag&&fresh.etag&&event.google.etag!==fresh.etag){
        throw Error('Событие в Google изменилось после последнего импорта. Сначала обнови синхронизацию.');
      }
      const series=event.repeat&&event.repeat!=='none'&&!event.google.seriesId;
      const warning=series?' Это удалит всю серию повторяющихся мероприятий.':' Если это отдельный экземпляр повторяющегося события, будет удалён только этот экземпляр.';
      const confirmText='Удалить «'+event.title+'» из Google Календаря «'+(cal.name||'Google')+'» и из LifeSims?'+
        warning+' Участники Google могут получить уведомление. Действие нельзя автоматически отменить.';
      if(!window.confirm(confirmText))return false;
      status('Удаляю мероприятие в Google…');
      await api('DELETE',path+'?sendUpdates=all',undefined,fresh.etag||event.google.etag);
      try{bridge.removeLocalEvent(localId)}
      catch(err){
        status('⚠ В Google удалено, но в LifeSims не удалось сохранить удаление: '+err.message);
        throw Error('В Google удалено; локальную запись нужно убрать отдельно.');
      }
      invalidatePreview();
      renderHidden();
      status('✓ Удалено из Google и LifeSims: '+event.title);
      return true;
    }finally{busy=false;ready()}
  }
  window.LifeSimsGoogleCalendarActions={deleteEvent:deleteEventInGoogle,refreshHidden:renderHidden};
  el('gcPreview').addEventListener('click', () => withBusy(async () => {
    invalidatePreview();
    if (!bridge.canWrite()) throw Error('Локальные данные недоступны для записи. Сначала восстанови сохранение LifeSims.');
    status('Читаю выбранные календари Google…');
    const remote = await listRemote();
    const mode = el('gcMode').value;
    const locals = bridge.getSchedule();
    preview = makePlan(remote, mode, locals);
    renderPreview(preview);
    status('Прочитано событий: '+remote.visible+' из '+remote.chosenCount+' календарей. '+(preview.changes.length?'Изменений: '+preview.changes.length+'. Проверь список и нажми «Применить изменения».':'Изменений нет. Сохранённые мероприятия смотри в «Календаре».'));

  }));
  el('gcApply').addEventListener('click', () => withBusy(async () => {
    if (!preview || !preview.changes.length) return;
    if (preview.snapshot !== JSON.stringify(bridge.getSchedule()) ||
        preview.hiddenSnapshot !== JSON.stringify(bridge.getHidden?.()||[])) {
      invalidatePreview();
      throw Error('Мероприятия изменились после проверки. Проверь изменения заново.');
    }
    const plan = preview;
    if (!window.confirm('Применить ' + plan.changes.length + ' изменений? ' +
      (plan.mode === 'both' ? 'Это может СОЗДАТЬ или ОБНОВИТЬ события в Google Calendar. ' : 'Google Calendar останется без изменений. ') +
      'Удалений не будет.')) return;
    // Discard the plan before writing to prevent retrying a partially completed batch.
    invalidatePreview();
    let applied = 0;
    let pendingRecords = [];
    const flush=()=>{
      if(pendingRecords.length){bridge.upsert(pendingRecords);pendingRecords=[];}
    };
    for (const change of plan.changes) {
      status('Синхронизация Google: ' + applied + ' / ' + plan.changes.length + '…');
      const remote = change.remote;
      if (['import', 'pull', 'link'].includes(change.type)) {
        const local = change.local || { id: 'google:'+encodeURIComponent(remote.calendarId)+':'+remote.id };
        const normalized = change.type === 'link' ? local : remote.normalized;
        pendingRecords.push({ ...local, ...normalized, google: calendarMeta(remote, signature(normalized)) });
      } else if(change.type==='supersede'){
        const updated=JSON.parse(JSON.stringify(change.local));
        updated.google={...updated.google,supersededRange:{from:plan.from,to:plan.to}};
        pendingRecords.push(updated);
      } else if (change.type === 'create') {
        flush();
        const created = await api('POST', eventsUrl('primary'), toGoogle(change.local));
        const normalized = project(created) || change.local;
        bridge.upsert([{ ...change.local, ...normalized, google: calendarMeta({...created,calendarId:'primary',sourceName:'Основной Google',color:'#4285f4'}, signature(normalized)) }]);
      } else if (change.type === 'push') {
        flush();
        const updated = await api('PATCH', eventsUrl(remote.calendarId)+'/'+encodeURIComponent(remote.id),
          toGoogle(change.local), remote.etag);
        const normalized = project(updated) || change.local;
        bridge.upsert([{ ...change.local, ...normalized, google: calendarMeta({...remote,...updated}, signature(normalized)) }]);
      }
      applied++;
      if(pendingRecords.length>=150)flush();
    }
    flush();
    invalidatePreview();
    renderHidden();
    status('✓ Синхронизировано ' + applied + ' мероприятий. В «Календаре» отображаются сохранённые события по датам. Удалений не было; можно скачать резервную копию JSON.');
  }));
  ready();
  window.LifeSimsGoogleCalendarVersion = 'inline-v12';
  el('gcConnect').dataset.authHandler = 'inline-v12';
})();