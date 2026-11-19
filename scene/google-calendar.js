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
    '<p class="hint">События выбранных календарей Google → LifeSims. Вариант двусторонней записи изменяет только основной календарь. Удалений нет, без интернета местные записи остаются.</p>' +
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
    '<div id="gcChanges"></div><p class="hint">Синхронизация выполняется только по кнопке, пока действует разрешение Google. ' +
    'Окно просмотра: от 365 дней назад до 400 дней вперёд. Повторяющиеся события загружаются по отдельным датам, с изменёнными экземплярами; ' +
    'целодневные события поддерживаются. Для списка календарей Google запрашивает отдельное разрешение на чтение названий календарей. ' +
    'Перед первой синхронизацией скачай резервную копию JSON.</p>';
  // Google sync stays inside the unified LifeSims calendar.
  section.append(panel);
  const el = id => document.getElementById(id);
  // Always use the verified project client; an obsolete localStorage value could prevent login.
  el('gcClient').value = DEFAULT_CLIENT_ID;

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
    availableCalendars=list.filter(c=>c.id&&c.accessRole!=='none'&&c.accessRole!=='freeBusyReader').map(c=>({
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
      event.repeat === 'weekly' ? 'weekly' : 'none',
      event.repeat === 'weekly' ? [...(event.weekdays || [])].map(Number).sort((a, b) => a - b) : []
    ];
    // Keep legacy timed-event signatures compatible with previously synced data.
    if(event.allDay)values.push('all-day');
    return JSON.stringify(values);
  }
  function project(event) {
    if (!event || event.status === 'cancelled' || (event.eventType && event.eventType !== 'default')) return null;
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
    return { title: event.summary || 'Без названия', startsAt, endsAt, repeat, weekdays, allDay };
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
      start: event.allDay ? {date:dateOnly(start)} : {dateTime:start.toISOString(),timeZone:tz},
      end: event.allDay ? {date:dateOnly(end)} : {dateTime:end.toISOString(),timeZone:tz}
    };
    if (event.repeat === 'weekly') payload.recurrence = ['RRULE:FREQ=WEEKLY;BYDAY=' +
      [...new Set(event.weekdays)].map(n => weekdayCodes[n - 1]).join(',')];
    else payload.recurrence = [];
    return payload;
  }
  async function listRemote() {
    const min = new Date(Date.now() - 365 * DAY).toISOString();
    const max = new Date(Date.now() + 400 * DAY).toISOString();
    let pageToken = '', page = 0;
    const instances = [], masterIds = new Set(), exceptions = new Set();
    do {
      if (++page > 6) throw Error('Слишком много событий Google (больше 15 000). Синхронизация остановлена, чтобы не использовать неполный список.');
      const qs = new URLSearchParams({
        timeMin: min, timeMax: max, maxResults: '2500', singleEvents: 'true', orderBy: 'startTime', showDeleted: 'false'
      });
      if (pageToken) qs.set('pageToken', pageToken);
      const data = await api('GET', '?' + qs.toString());
      for (const event of data.items || []) {
        if (event.recurringEventId) {
          masterIds.add(event.recurringEventId);
          const original=event.originalStartTime?.dateTime||event.originalStartTime?.date;
          const actual=event.start?.dateTime||event.start?.date;
          if(original&&actual&&(event.originalStartTime?.date?original!==actual:new Date(original).getTime()!==new Date(actual).getTime())){
            exceptions.add(event.recurringEventId);
          }
        } else instances.push(event);
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    const masters = [];
    if (masterIds.size > 100) throw Error('Найдено более 100 серий повторяющихся событий. Синхронизация не выполнена; нужна пакетная обработка.');
    for (const id of masterIds) {
      if (exceptions.has(id)) continue;
      try { masters.push(await api('GET', '/' + encodeURIComponent(id))); }
      catch (error) { if (/404|410/.test(error.message)) continue; throw error; }
    }
    const events = [...instances, ...masters];
    const supported = [];
    let skipped = exceptions.size;
    for (const event of events) {
      const normalized = project(event);
      if (normalized) supported.push({ id: event.id, etag: event.etag || '', normalized });
      else skipped++;
    }
    return { supported, skipped, visible: events.length };
  }
  function calendarMeta(remote, base) {
    return { id: remote.id, calendarId: 'primary', etag: remote.etag, base };
  }
  function summarize(changes, skipped, conflicts, orphaned) {
    const types = { import: 0, pull: 0, link: 0, create: 0, push: 0 };
    for (const c of changes) types[c.type]++;
    return 'Из Google в LifeSims: ' + (types.import + types.pull) + '; без дубликатов привязать: ' + types.link +
      '; создать в Google: ' + types.create + '; обновить в Google: ' + types.push +
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
      const labels = { import: 'Импорт', pull: 'Обновить LifeSims', link: 'Связать', create: 'Создать в Google', push: 'Обновить Google' };
      for (const ch of data.changes.slice(0, 15)) {
        const row = document.createElement('li');
        row.textContent = labels[ch.type] + ': ' + ch.title;
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
      warning.textContent = 'Конфликтующие записи и события Google вне окна просмотра не перезаписываются. Отмены отдельных дат повторяющихся событий пока не поддерживаются.';
      box.append(warning);
    }
  }
  function makePlan(remoteData, mode, locals) {
    const changes = [], claimed = new Set(), remoteIds = new Set();
    let conflicts = 0, orphaned = 0;
    const mapped = new Map(locals.filter(x => x.google?.id && x.google.calendarId === 'primary').map(x => [x.google.id, x]));
    for (const remote of remoteData.supported) {
      remoteIds.add(remote.id);
      const sig = signature(remote.normalized);
      const linked = mapped.get(remote.id);
      if (linked) {
        claimed.add(linked.id);
        const base = linked.google?.base;
        const localChanged = base !== signature(linked);
        const remoteChanged = base !== sig;
        if (!base || (localChanged && remoteChanged)) { conflicts++; continue; }
        if (remoteChanged) changes.push({ type: 'pull', title: remote.normalized.title, remote, local: linked });
        else if (localChanged && mode === 'both') changes.push({ type: 'push', title: linked.title, local: linked, remote });
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
    for (const local of locals) {
      if (local.google?.id && local.google.calendarId === 'primary' && !remoteIds.has(local.google.id)) orphaned++;
    }
    return { mode, changes, conflicts, orphaned, skipped: remoteData.skipped, snapshot: JSON.stringify(locals) };
  }
  async function withBusy(task) {
    if (busy) return;
    busy = true; ready();
    try { await task(); } catch (e) { status('⚠ ' + e.message); }
    finally { busy = false; ready(); }
  }
  el('gcPreview').addEventListener('click', () => withBusy(async () => {
    invalidatePreview();
    if (!bridge.canWrite()) throw Error('Локальные данные недоступны для записи. Сначала восстанови сохранение LifeSims.');
    status('Читаю события основного Google Календаря…');
    const remote = await listRemote();
    const mode = el('gcMode').value;
    const locals = bridge.getSchedule();
    preview = makePlan(remote, mode, locals);
    renderPreview(preview);
    status(preview.changes.length ? 'Проверь список и нажми «Применить изменения», чтобы события появились в «Истории».' : 'Новых изменений нет. Сохранённых Google-мероприятий в LifeSims: ' + bridge.getSchedule().filter(e=>e.google).length + '. Их можно посмотреть в «Календаре».');
  }));
  el('gcApply').addEventListener('click', () => withBusy(async () => {
    if (!preview || !preview.changes.length) return;
    if (preview.snapshot !== JSON.stringify(bridge.getSchedule())) {
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
    for (const change of plan.changes) {
      status('Синхронизация Google: ' + applied + ' / ' + plan.changes.length + '…');
      const remote = change.remote;
      if (['import', 'pull', 'link'].includes(change.type)) {
        const local = change.local || { id: 'google:' + remote.id };
        const normalized = change.type === 'link' ? local : remote.normalized;
        bridge.upsert([{ ...local, ...normalized, google: calendarMeta(remote, signature(normalized)) }]);
      } else if (change.type === 'create') {
        const created = await api('POST', '', toGoogle(change.local));
        const normalized = project(created) || change.local;
        bridge.upsert([{ ...change.local, ...normalized, google: calendarMeta(created, signature(normalized)) }]);
      } else if (change.type === 'push') {
        const updated = await api('PATCH', '/' + encodeURIComponent(remote.id),
          toGoogle(change.local), remote.etag);
        const normalized = project(updated) || change.local;
        bridge.upsert([{ ...change.local, ...normalized, google: calendarMeta(updated, signature(normalized)) }]);
      }
      applied++;
    }
    invalidatePreview();
    status('✓ Синхронизировано ' + applied + ' мероприятий. В «Календаре» отображаются сохранённые события по датам. Ничего не удалено; можно скачать резервную копию JSON.');
  }));
  ready();
  window.LifeSimsGoogleCalendarVersion = 'inline-v9';
  el('gcConnect').dataset.authHandler = 'inline-v9';
})();