import {randomUUID} from 'node:crypto';

const PET_KEYS=['ginger','black'];
const RULES=[
 ['feed_child','Покормить','nutrition',20,[{name:'Забота',xp:8}],'Семья'],
 ['talk_child','Поговорить','mood',10,[{name:'Коммуникация',xp:8},{name:'Забота',xp:4}],'Семья'],
 ['help_child','Помочь','resource',8,[{name:'Забота',xp:8}],'Семья'],
 ['play_together','Поиграть вместе','mood',12,[{name:'Коммуникация',xp:5},{name:'Забота',xp:5}],'Семья']
];
const METRICS=['nutrition','mood','resource','hygiene','physical'];
const clean=x=>String(x||'').trim();
const uuid=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/i.test(x);
const hours=x=>x?Math.max(0,(Date.now()-Date.parse(x))/3600000):Infinity;
const score=x=>Math.max(0,Math.round(100*(1-hours(x)/12)));
const member=x=>({id:x.id,name:x.display_name,role:x.role,guardianId:x.guardian_id||null,avatar:x.avatar||null});
async function familyOwner(user){return user.role==='child'?user.guardian_id:user.id}
async function createPets(db,owner){
 await db.query("INSERT INTO house_pets(owner_id,pet_key,name) VALUES ($1,'ginger','Рыжий котик'),($1,'black','Чёрный котик') ON CONFLICT DO NOTHING",[owner]);
 await db.query('INSERT INTO house_pet_litter(owner_id) VALUES($1) ON CONFLICT DO NOTHING',[owner]);
}
async function createRules(db,owner){
 const previous=await db.query('SELECT 1 FROM house_rules WHERE owner_id=$1 LIMIT 1',[owner]);
 if(previous.rowCount)return;
 for(const [id,title,metric,gain,skills,project] of RULES)
 await db.query('INSERT INTO house_rules(owner_id,action_id,title,target_metric,target_gain,actor_skills,project) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT DO NOTHING',
 [owner,id,title,metric,gain,JSON.stringify(skills),project]);
}
async function memberRows(db,owner){
 const q=await db.query("SELECT id,display_name,role,guardian_id,avatar FROM family_accounts WHERE id=$1 OR (guardian_id=$1 AND role='child') ORDER BY created_at",[owner]);
 return q.rows.map(member);
}
async function linked(db,a,b){
 if(!uuid(b)||a===b)return false;
 const q=await db.query('SELECT 1 FROM family_connections WHERE (a=$1 AND b=$2) OR (a=$2 AND b=$1) LIMIT 1',[a,b]);
 return q.rowCount===1;
}
async function locations(db,owner){
 const q=await db.query("SELECT a.id,a.display_name,a.role,l.sharing,l.guardian_approved,p.lat,p.lon,p.accuracy_m,p.received_at FROM family_accounts a LEFT JOIN house_location_settings l ON l.account_id=a.id LEFT JOIN house_positions p ON p.account_id=a.id AND p.received_at>now()-interval '24 hours' WHERE a.id=$1 OR (a.guardian_id=$1 AND a.role='child') ORDER BY a.display_name",[owner]);
 return q.rows.map(x=>({id:x.id,name:x.display_name,role:x.role,sharing:!!x.sharing,approved:!!x.guardian_approved,
  position:x.sharing&&(x.role==='adult'||x.guardian_approved)&&x.received_at?{lat:x.lat,lon:x.lon,accuracy:x.accuracy_m,at:x.received_at}:null}));
}
function dist(lat,lon,lat2,lon2){
 const rad=x=>x*Math.PI/180;
 const a=rad(lat2-lat),b=rad(lon2-lon);
 const v=Math.sin(a/2)**2+Math.cos(rad(lat))*Math.cos(rad(lat2))*Math.sin(b/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(v)));
}
function publicEvent(x){
 return {id:x.id,actorId:x.actor_id,actorName:x.actor_name||'',recipientId:x.recipient_id||null,recipientName:x.recipient_name||null,
  type:x.event_type,subject:x.subject,action:x.action,details:x.details,at:x.created_at};
}
export function createHouseholdRoute({pool,json,send,requireOk,HttpError,hasRate}){
 return async function householdRoute({req,res,user,path,method}){
  const owner=await familyOwner(user);
  const adult=()=>requireOk(user.role==='adult',403,'Только родитель может менять настройки семьи');
  const idempotent=x=>/^[A-Za-z0-9_-]{12,100}$/.test(String(x||''));
  if(method==='GET'&&path==='/v1/household/overview'){
   await createPets(pool,owner);await createRules(pool,owner);
   const [pets,litter,rules,events,places,geoevents]=await Promise.all([
    pool.query('SELECT pet_key,name,fed_at,petted_at FROM house_pets WHERE owner_id=$1 ORDER BY pet_key',[owner]),
    pool.query('SELECT cleaned_at FROM house_pet_litter WHERE owner_id=$1',[owner]),
    pool.query('SELECT action_id,title,target_metric,target_gain,actor_skills,project FROM house_rules WHERE owner_id=$1 ORDER BY action_id',[owner]),
    pool.query('SELECT e.*,a.display_name actor_name,b.display_name recipient_name FROM house_events e JOIN family_accounts a ON a.id=e.actor_id LEFT JOIN family_accounts b ON b.id=e.recipient_id WHERE e.owner_id=$1 ORDER BY e.created_at DESC LIMIT 60',[owner]),
    pool.query('SELECT id,name,lat,lon,radius_m FROM house_places WHERE owner_id=$1 ORDER BY name',[owner]),
    pool.query("SELECT e.*,a.display_name actor_name FROM house_geo_events e JOIN family_accounts a ON a.id=e.account_id WHERE e.owner_id=$1 AND e.created_at>now()-interval '3 days' ORDER BY e.created_at DESC LIMIT 40",[owner])
   ]);
   return send(res,200,{self:member(user),members:await memberRows(pool,owner),pets:pets.rows.map(x=>({key:x.pet_key,name:x.name,fedAt:x.fed_at,pettedAt:x.petted_at,satiety:score(x.fed_at)})),
    litterCleanedAt:litter.rows[0]?.cleaned_at||null,rules:rules.rows.map(x=>({id:x.action_id,title:x.title,metric:x.target_metric,gain:x.target_gain,skills:x.actor_skills,project:x.project})),
    events:events.rows.map(publicEvent),places:places.rows.map(x=>({id:x.id,name:x.name,lat:x.lat,lon:x.lon,radius:x.radius_m})),
    locations:await locations(pool,owner),placeEvents:geoevents.rows.map(x=>({id:x.id,accountId:x.account_id,name:x.actor_name,place:x.place_name,type:x.event_type,at:x.created_at})),
    foregroundOnly:true,expires:'2026-12-23'});
  }
  if(method==='PUT'&&path==='/v1/household/pets/name'){
   adult();const data=await json(req),name=clean(data.name);
   requireOk(PET_KEYS.includes(data.pet)&&name.length>0&&name.length<=50,400,'Некорректное имя питомца');
   await createPets(pool,owner);
   await pool.query('UPDATE house_pets SET name=$1,updated_at=now() WHERE owner_id=$2 AND pet_key=$3',[name,owner,data.pet]);
   return send(res,200,{ok:true});
  }
  if(method==='POST'&&path==='/v1/household/pets/care'){
   requireOk(!hasRate('sharedpets:'+user.id,90,3600000),429,'Превышен лимит действий');
   const data=await json(req),action=data.action,pet=action==='litter'?'both':data.pet;
   requireOk(['feed','pet','litter'].includes(action)&&(action==='litter'||PET_KEYS.includes(pet))&&idempotent(data.requestId),400,'Некорректное действие');
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[owner+':sharedpets']);
    const same=await client.query('SELECT 1 FROM house_events WHERE actor_id=$1 AND request_id=$2',[user.id,data.requestId]);
    if(same.rowCount){await client.query('COMMIT');return send(res,200,{ok:true,duplicate:true})}
    await createPets(client,owner);
    if(action==='litter')await client.query('INSERT INTO house_pet_litter(owner_id,cleaned_at) VALUES ($1,now()) ON CONFLICT(owner_id) DO UPDATE SET cleaned_at=now()',[owner]);
    if(action==='feed')await client.query('UPDATE house_pets SET fed_at=now(),updated_at=now() WHERE owner_id=$1 AND pet_key=$2',[owner,pet]);
    if(action==='pet')await client.query('UPDATE house_pets SET petted_at=now(),updated_at=now() WHERE owner_id=$1 AND pet_key=$2',[owner,pet]);
    const id=randomUUID();
    await client.query("INSERT INTO house_events(id,owner_id,actor_id,event_type,subject,action,details,request_id) VALUES($1,$2,$3,'pet',$4,$5,$6::jsonb,$7)",
     [id,owner,user.id,pet,action,JSON.stringify({project:'Семья',skills:[{name:'Забота',xp:action==='litter'?10:action==='feed'?8:5}]}),data.requestId]);
    await client.query('COMMIT');
    return send(res,201,{ok:true,id,at:new Date().toISOString()});
   }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }
  if(method==='PUT'&&path==='/v1/household/rules'){
   adult();const data=await json(req),rules=data.rules;
   requireOk(Array.isArray(rules)&&rules.length>=1&&rules.length<=15,400,'Допускается от 1 до 15 действий');
   const seen=new Set();
   for(const x of rules){
    requireOk(typeof x.id==='string'&&/^[a-z][a-z0-9_]{1,36}$/.test(x.id)&&!seen.has(x.id),400,'Некорректный идентификатор');
    seen.add(x.id);
    requireOk(clean(x.title).length>0&&clean(x.title).length<=65&&METRICS.includes(x.metric)&&Number.isInteger(x.gain)&&x.gain>=0&&x.gain<=30,400,'Неверная шкала действия');
    requireOk(Array.isArray(x.skills)&&x.skills.length<=3&&x.skills.every(y=>y&&clean(y.name).length>0&&clean(y.name).length<=40&&Number.isInteger(y.xp)&&y.xp>=0&&y.xp<=30)&&clean(x.project).length<=50,400,'Некорректные навыки или проект');
   }
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    await client.query('DELETE FROM house_rules WHERE owner_id=$1',[owner]);
    for(const x of rules)await client.query('INSERT INTO house_rules(owner_id,action_id,title,target_metric,target_gain,actor_skills,project) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)',
     [owner,x.id,clean(x.title),x.metric,x.gain,JSON.stringify(x.skills),clean(x.project)]);
    await client.query('COMMIT');return send(res,200,{ok:true});
   }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }
  if(method==='POST'&&path==='/v1/household/actions'){
   requireOk(!hasRate('houseaction:'+user.id,60,3600000),429,'Превышен лимит семейных действий');
   const data=await json(req);
   requireOk(uuid(data.to)&&data.to!==user.id&&typeof data.actionId==='string'&&idempotent(data.requestId),400,'Неверные параметры действия');
   const members=await memberRows(pool,owner);
   requireOk(members.some(x=>x.id===data.to),403,'Действие возможно только с членом семьи');
   await createRules(pool,owner);
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[owner+':familyactions']);
    const same=await client.query('SELECT 1 FROM house_events WHERE actor_id=$1 AND request_id=$2',[user.id,data.requestId]);
    if(same.rowCount){await client.query('COMMIT');return send(res,200,{ok:true,duplicate:true})}
    const r=await client.query('SELECT * FROM house_rules WHERE owner_id=$1 AND action_id=$2',[owner,data.actionId]);
    requireOk(r.rowCount===1,404,'Семейное действие не найдено');
    const x=r.rows[0],details={title:x.title,targetMetric:x.target_metric,targetGain:x.target_gain,skills:x.actor_skills,project:x.project},id=randomUUID();
    await client.query("INSERT INTO house_events(id,owner_id,actor_id,recipient_id,event_type,subject,action,details,request_id) VALUES($1,$2,$3,$4,'member',$5,$6,$7::jsonb,$8)",
     [id,owner,user.id,data.to,data.to,data.actionId,JSON.stringify(details),data.requestId]);
    await client.query('COMMIT');return send(res,201,{ok:true,event:{id,actorId:user.id,recipientId:data.to,action:data.actionId,details,at:new Date().toISOString()}});
   }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }
  if(method==='GET'&&path==='/v1/household/history'){
   const q=await pool.query("SELECT * FROM house_events WHERE actor_id=$1 AND created_at>now()-interval '90 days' ORDER BY created_at DESC LIMIT 500",[user.id]);
   return send(res,200,{events:q.rows.map(publicEvent)});
  }
  if(method==='GET'&&path==='/v1/household/effects'){
   const q=await pool.query("SELECT * FROM house_events WHERE (actor_id=$1 OR recipient_id=$1) AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 100",[user.id]);
   const metrics={},skills=[],events=[];
   for(const x of q.rows){
    const d=x.details||{};
    if(x.recipient_id===user.id&&x.event_type==='member'&&METRICS.includes(d.targetMetric))
      metrics[d.targetMetric]=Math.min(60,(metrics[d.targetMetric]||0)+
       Math.round(Number(d.targetGain||0)*Math.max(0,1-hours(x.created_at)/(d.targetMetric==='nutrition'?12:24))));
    if(x.actor_id===user.id){
     for(const a of d.skills||[])skills.push({name:a.name,xp:a.xp,project:d.project,at:x.created_at,eventId:x.id});
     events.push(publicEvent(x));
    }
   }
   return send(res,200,{metrics,skills,events});
  }
  if(method==='GET'&&path==='/v1/household/chat'){
   const peer=new URL(req.url,'http://local').searchParams.get('peer');
   requireOk(await linked(pool,user.id,peer),403,'Чат разрешён только со связанным пользователем');
   const q=await pool.query('SELECT id,sender_id,recipient_id,body,created_at FROM (SELECT * FROM house_chat WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1) ORDER BY created_at DESC LIMIT 80) x ORDER BY created_at ASC',[user.id,peer]);
   return send(res,200,{messages:q.rows.map(x=>({id:x.id,from:x.sender_id,to:x.recipient_id,text:x.body,at:x.created_at}))});
  }
  if(method==='POST'&&path==='/v1/household/chat'){
   requireOk(!hasRate('housechat:'+user.id,35,3600000),429,'Слишком много сообщений');
   const data=await json(req),body=clean(data.text);
   requireOk(await linked(pool,user.id,data.to),403,'Нельзя писать этому пользователю');
   requireOk(body.length>=1&&body.length<=1000,400,'Сообщение: от 1 до 1000 символов');
   const id=randomUUID();
   await pool.query('INSERT INTO house_chat(id,sender_id,recipient_id,body) VALUES($1,$2,$3,$4)',[id,user.id,data.to,body]);
   return send(res,201,{ok:true,message:{id,from:user.id,to:data.to,text:body,at:new Date().toISOString()}});
  }
  if(method==='GET'&&path==='/v1/household/location'){
   return send(res,200,{locations:await locations(pool,owner),foregroundOnly:true});
  }
  if(method==='PUT'&&path==='/v1/household/location/approve'){
   adult();const data=await json(req);
   requireOk(uuid(data.childId)&&typeof data.approved==='boolean',400,'Укажите ребёнка и разрешение');
   const q=await pool.query("SELECT 1 FROM family_accounts WHERE id=$1 AND guardian_id=$2 AND role='child'",[data.childId,owner]);
   requireOk(q.rowCount===1,403,'Нет доступа к чужому детскому аккаунту');
   await pool.query('INSERT INTO house_location_settings(account_id,guardian_approved) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET guardian_approved=$2,sharing=CASE WHEN $2 THEN house_location_settings.sharing ELSE false END,updated_at=now()',[data.childId,data.approved]);
   if(!data.approved){
    await pool.query('DELETE FROM house_positions WHERE account_id=$1',[data.childId]);
    await pool.query('DELETE FROM house_geo_state WHERE account_id=$1',[data.childId]);
    await pool.query('DELETE FROM house_geo_events WHERE account_id=$1',[data.childId]);
   }
   return send(res,200,{ok:true,approved:data.approved});
  }
  if(method==='PUT'&&path==='/v1/household/location/sharing'){
   const data=await json(req);
   requireOk(typeof data.enabled==='boolean',400,'Укажите состояние');
   const q=await pool.query('SELECT guardian_approved FROM house_location_settings WHERE account_id=$1',[user.id]);
   requireOk(!data.enabled||user.role==='adult'||q.rows[0]?.guardian_approved===true,403,'Требуется разрешение родителя');
   await pool.query('INSERT INTO house_location_settings(account_id,guardian_approved,sharing) VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET sharing=$3,updated_at=now()',[user.id,user.role==='adult',data.enabled]);
   if(!data.enabled){
    await pool.query('DELETE FROM house_positions WHERE account_id=$1',[user.id]);
    await pool.query('DELETE FROM house_geo_state WHERE account_id=$1',[user.id]);
    await pool.query('DELETE FROM house_geo_events WHERE account_id=$1',[user.id]);
   }
   return send(res,200,{ok:true,sharing:data.enabled});
  }
  if(method==='POST'&&path==='/v1/household/location/position'){
   requireOk(!hasRate('housegeo:'+user.id,720,3600000),429,'Слишком много обновлений');
   const d=await json(req);
   requireOk([d.lat,d.lon,d.accuracy].every(Number.isFinite)&&Math.abs(d.lat)<=90&&Math.abs(d.lon)<=180&&d.accuracy>=0&&d.accuracy<=1500,400,'Неправильные координаты');
   const allowed=await pool.query('SELECT sharing,guardian_approved FROM house_location_settings WHERE account_id=$1',[user.id]);
   requireOk(allowed.rows[0]?.sharing&&(user.role==='adult'||allowed.rows[0].guardian_approved),403,'Передача геолокации не разрешена');
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    await client.query('INSERT INTO house_positions(account_id,lat,lon,accuracy_m) VALUES($1,$2,$3,$4) ON CONFLICT(account_id) DO UPDATE SET lat=$2,lon=$3,accuracy_m=$4,received_at=now()',[user.id,d.lat,d.lon,d.accuracy]);
    if(d.accuracy<=100){
     const q=await client.query('SELECT id,name,lat,lon,radius_m FROM house_places WHERE owner_id=$1',[owner]);
     for(const p of q.rows){
      const metres=dist(d.lat,d.lon,p.lat,p.lon),inside=metres<=p.radius_m;
      const prev=await client.query('SELECT inside,changed_at FROM house_geo_state WHERE account_id=$1 AND place_id=$2 FOR UPDATE',[user.id,p.id]);
      if(!prev.rowCount)await client.query('INSERT INTO house_geo_state(account_id,place_id,inside) VALUES($1,$2,$3)',[user.id,p.id,inside]);
      else if(prev.rows[0].inside!==inside&&hours(prev.rows[0].changed_at)>1/60&&Math.abs(metres-p.radius_m)>Math.max(20,d.accuracy)){
       await client.query('UPDATE house_geo_state SET inside=$3,changed_at=now() WHERE account_id=$1 AND place_id=$2',[user.id,p.id,inside]);
       await client.query('INSERT INTO house_geo_events(id,owner_id,account_id,place_name,event_type) VALUES($1,$2,$3,$4,$5)',[randomUUID(),owner,user.id,p.name,inside?'arrived':'left']);
      }
     }
    }
    await client.query("DELETE FROM house_geo_events WHERE created_at<now()-interval '3 days'");
    await client.query('COMMIT');return send(res,200,{ok:true,at:new Date().toISOString()});
   }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }
  if(method==='PUT'&&path==='/v1/household/places'){
   adult();const d=await json(req);
   requireOk(Array.isArray(d.places)&&d.places.length<=12,400,'Не более 12 мест');
   for(const p of d.places)requireOk(clean(p.name).length>0&&clean(p.name).length<=50&&[p.lat,p.lon,p.radius].every(Number.isFinite)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180&&Number.isInteger(p.radius)&&p.radius>=50&&p.radius<=1000,400,'Некорректное место');
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    await client.query('DELETE FROM house_places WHERE owner_id=$1',[owner]);
    for(const p of d.places)await client.query('INSERT INTO house_places(id,owner_id,name,lat,lon,radius_m) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),owner,clean(p.name),p.lat,p.lon,p.radius]);
    await client.query('COMMIT');return send(res,200,{ok:true});
   }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  }
  throw new HttpError(404,'Раздел семьи не найден');
 };
}
