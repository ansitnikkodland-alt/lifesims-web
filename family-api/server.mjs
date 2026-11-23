import http from 'node:http';
import {randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';

const scrypt=promisify(scryptCallback);
const ORIGIN='https://ansitnikkodland-alt.github.io';
const PORT=Number(process.env.PORT||10000);
const SESSION_MS=14*86400*1000;
const bodyLimit=2900000;
const dbUrl=process.env.DATABASE_URL;
if(!dbUrl)throw Error('DATABASE_URL is required');
const pool=new Pool({connectionString:dbUrl,max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:10000});
const timers=new Map();
const sha=x=>createHash('sha256').update(x).digest('hex');
function hasRate(key,max,ms){
 const now=Date.now();const old=timers.get(key)||[];
 const recent=old.filter(t=>now-t<ms);
 if(recent.length>=max){timers.set(key,recent);return true}
 recent.push(now);timers.set(key,recent);
 if(timers.size>10000)timers.clear();
 return false;
}
async function hashPass(p){
 const salt=randomBytes(16).toString('hex');
 const key=await scrypt(p,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return 'scrypt32768:'+salt+':'+key.toString('hex');
}
async function verifyPass(p,stored){
 try{
  const [algo,salt,expected]=String(stored||'').split(':');
  if(algo!=='scrypt32768'||!/^[0-9a-f]{32}$/.test(salt)||!/^[0-9a-f]{128}$/.test(expected))return false;
  const key=await scrypt(p,Buffer.from(salt,'hex'),64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return timingSafeEqual(key,Buffer.from(expected,'hex'));
 }catch(_){return false}
}
const validPassword=p=>typeof p==='string'&&p.length>=12&&p.length<=128;
const cleanName=p=>typeof p==='string'?p.trim().slice(0,60):'';
const cleanEmail=p=>typeof p==='string'?p.trim().toLowerCase().slice(0,190):'';
const validEmail=e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)&&e.length<=190;
const safeRole=u=>({id:u.id,displayName:u.display_name,role:u.role,guardianId:u.guardian_id||null,login:u.role==='child'?u.login:null,avatar:u.avatar||null});
function send(res,status,obj,headers={}){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'",...headers});
 res.end(JSON.stringify(obj));
}
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
const requireOk=(condition,status,message)=>{if(!condition)throw new HttpError(status,message)};
async function json(req){
 let chunks=[],size=0;
 for await(const part of req){
  size+=part.length;
  if(size>bodyLimit)throw new HttpError(413,'Слишком большой запрос');
  chunks.push(part);
 }
 try{const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));requireOk(parsed&&typeof parsed==='object'&&!Array.isArray(parsed),400,'Ожидался JSON-объект');return parsed}
 catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,'Неправильный JSON')}
}
async function sessionFor(req){
 const auth=req.headers.authorization||'';
 const token=auth.startsWith('Bearer ')?auth.slice(7):'';
 requireOk(/^[A-Za-z0-9_-]{40,100}$/.test(token),401,'Требуется вход в аккаунт');
 const q=await pool.query(
  'SELECT a.* FROM family_sessions s JOIN family_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()',
  [sha(token)]
 );
 requireOk(q.rows.length===1,401,'Сеанс завершился — войдите снова');
 return {user:q.rows[0],tokenHash:sha(token)};
}
async function startSession(accountId){
 const token=randomBytes(32).toString('base64url');
 await pool.query('INSERT INTO family_sessions(token_hash,account_id,expires_at) VALUES ($1,$2,$3)',
 [sha(token),accountId,new Date(Date.now()+SESSION_MS)]);
 return token;
}
function ipOf(req){return String(req.socket.remoteAddress||'unknown')}
function validImage(uri,max){
 if(typeof uri!=='string'||uri.length>max*1.45+50)return false;
 if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(uri))return false;
 const payload=uri.slice('data:image/jpeg;base64,'.length);
 const bytes=Buffer.from(payload,'base64');
 return bytes.length>20&&bytes.length<=max&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
}
async function ownsChild(user,target){
 if(user.role!=='adult')return false;
 const q=await pool.query("SELECT id FROM family_accounts WHERE id=$1 AND guardian_id=$2 AND role='child'",[target,user.id]);
 return q.rowCount===1;
}
function connectionRow(row,uid){
 const isA=row.a===uid;return {id:row.id,kind:row.kind,peer:{id:isA?row.b:row.a,displayName:isA?row.b_name:row.a_name,role:isA?row.b_role:row.a_role}};
}
async function route(req,res){
 const origin=req.headers.origin;
 if(origin && origin!==ORIGIN && origin!=='http://localhost:8765' && origin!=='http://127.0.0.1:8765')throw new HttpError(403,'Источник запроса не разрешён');
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
 res.setHeader('Vary','Origin');
 res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
 const url=new URL(req.url,'http://lifesims.invalid');
 const path=url.pathname;
 const method=req.method;
 if(method==='GET'&&path==='/health'){
  await pool.query('SELECT 1');
  return send(res,200,{ok:true,service:'lifesims-family-test',stage:'prototype',persistent:false});
 }
 requireOk(path.startsWith('/v1/'),404,'Маршрут не найден');
 if(method==='POST'&&path==='/v1/auth/register'){
  requireOk(!hasRate('register:'+ipOf(req),5,3600000),429,'Попробуйте зарегистрироваться позже');
  const data=await json(req),email=cleanEmail(data.email),name=cleanName(data.displayName);
  requireOk(validEmail(email)&&validPassword(data.password)&&name.length>=1,400,'Укажите email, имя и пароль от 12 символов');
  const id=randomUUID(),pass=await hashPass(data.password);
  let found;
  try{found=await pool.query(
   "INSERT INTO family_accounts(id,email,display_name,password_hash,role) VALUES ($1,$2,$3,$4,'adult') RETURNING id,display_name,role,guardian_id,email,avatar",
   [id,email,name,pass]
  )}catch(e){if(e.code==='23505')throw new HttpError(409,'Этот email уже зарегистрирован');throw e}
  const token=await startSession(id);
  return send(res,201,{token,account:safeRole(found.rows[0]),emailVerified:false,warning:'Тестовая регистрация без подтверждения email; не загружайте медицинские сведения детей'});
 }
 if(method==='POST'&&path==='/v1/auth/login'){
  requireOk(!hasRate('login:'+ipOf(req),30,15*60000),429,'Много попыток входа — попробуйте позже');
  const data=await json(req),login=String(data.login||'').trim().toLowerCase();
  requireOk(login.length>=3&&login.length<=190&&typeof data.password==='string',400,'Введите логин и пароль');
  const found=await pool.query('SELECT * FROM family_accounts WHERE email=$1 OR login=$1 LIMIT 1',[login]);
  const valid=found.rows.length===1&&await verifyPass(data.password,found.rows[0].password_hash);
  requireOk(valid,401,'Неверный логин или пароль');
  const account=found.rows[0],token=await startSession(account.id);
  return send(res,200,{token,account:safeRole(account),emailVerified:false});
 }
 const {user,tokenHash}=await sessionFor(req);
 if(method==='POST'&&path==='/v1/auth/logout'){
  await pool.query('DELETE FROM family_sessions WHERE token_hash=$1',[tokenHash]);
  return send(res,200,{ok:true});
 }
 if(method==='GET'&&path==='/v1/me'){
  return send(res,200,{account:safeRole(user),prototype:true});
 }
 if(method==='DELETE'&&path==='/v1/me/sessions'){
  await pool.query('DELETE FROM family_sessions WHERE account_id=$1',[user.id]);
  return send(res,200,{ok:true});
 }
 if(method==='GET'&&path==='/v1/children'){
  requireOk(user.role==='adult',403,'Доступно только родителю');
  const q=await pool.query("SELECT id,display_name,role,guardian_id,login,avatar FROM family_accounts WHERE guardian_id=$1 AND role='child' ORDER BY created_at",[user.id]);
  return send(res,200,{children:q.rows.map(safeRole)});
 }
 if(method==='POST'&&path==='/v1/children'){
  requireOk(user.role==='adult',403,'Только родитель может создавать детские аккаунты');
  requireOk(!hasRate('children:'+user.id,20,86400000),429,'Лимит создания аккаунтов достигнут');
  const data=await json(req),name=cleanName(data.displayName);
  requireOk(name&&validPassword(data.password),400,'Нужно имя и пароль минимум 12 символов');
  const id=randomUUID(),login='kid_'+randomBytes(8).toString('hex');
  const pass=await hashPass(data.password);
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query("INSERT INTO family_accounts(id,login,display_name,password_hash,role,guardian_id) VALUES ($1,$2,$3,$4,'child',$5)",[id,login,name,pass,user.id]);
   await client.query("INSERT INTO family_connections(id,a,b,kind) VALUES ($1,$2,$3,'parent')",[randomUUID(),user.id,id]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  return send(res,201,{child:{id,login,displayName:name,role:'child',guardianId:user.id},warning:'Сохраните логин ребёнка. Пароль показывается только при вводе.'});
 }
 if(method==='POST'&&path==='/v1/children/password'){
  requireOk(user.role==='adult',403,'Только родитель');
  const data=await json(req);
  requireOk(typeof data.childId==='string'&&validPassword(data.newPassword),400,'Неверные параметры');
  requireOk(await ownsChild(user,data.childId),403,'Это не ваш детский аккаунт');
  requireOk(await verifyPass(String(data.yourPassword||''),user.password_hash),401,'Неверный пароль родителя');
  const hashed=await hashPass(data.newPassword);
  await pool.query('UPDATE family_accounts SET password_hash=$1 WHERE id=$2 AND guardian_id=$3',[hashed,data.childId,user.id]);
  await pool.query('DELETE FROM family_sessions WHERE account_id=$1',[data.childId]);
  return send(res,200,{ok:true});
 }
 if(method==='GET'&&path==='/v1/me/save'){
  const q=await pool.query('SELECT revision,payload,updated_at FROM family_saves WHERE account_id=$1',[user.id]);
  return send(res,200,q.rowCount?{revision:Number(q.rows[0].revision),payload:q.rows[0].payload,updatedAt:q.rows[0].updated_at}:{revision:0,payload:null,updatedAt:null});
 }
 if(method==='PUT'&&path==='/v1/me/save'){
  const data=await json(req);
  const expected=data.revision,payload=data.payload;
  requireOk(Number.isSafeInteger(expected)&&expected>=0,400,'Неизвестная ревизия сохранения');
  requireOk(payload&&payload.schema===2&&payload.days&&typeof payload.days==='object'&&!Array.isArray(payload.days)&&Array.isArray(payload.activities)&&Array.isArray(payload.events),400,'Недопустимый формат сохранения LifeSims');
  requireOk(Buffer.byteLength(JSON.stringify(payload),'utf8')<=2200000,413,'Сохранение превышает 2.2 МБ');
  const q=await pool.query(
   "INSERT INTO family_saves(account_id,revision,payload) VALUES ($1,1,$2::jsonb) ON CONFLICT(account_id) DO UPDATE SET revision=family_saves.revision+1,payload=EXCLUDED.payload,updated_at=now() WHERE family_saves.revision=$3 RETURNING revision,updated_at",
   [user.id,JSON.stringify(payload),expected]
  );
  requireOk(q.rowCount===1,409,'В другом устройстве уже сохранены более новые данные. Сначала загрузите их.');
  return send(res,200,{revision:Number(q.rows[0].revision),updatedAt:q.rows[0].updated_at});
 }
 if(method==='PUT'&&path==='/v1/me/avatar'){
  const data=await json(req);
  requireOk(data.avatar===null||validImage(data.avatar,160000),400,'Портрет должен быть JPEG до 160 КБ');
  await pool.query('UPDATE family_accounts SET avatar=$1 WHERE id=$2',[data.avatar,user.id]);
  return send(res,200,{ok:true});
 }
 if(method==='GET'&&path==='/v1/me/room'){
  const q=await pool.query('SELECT image_data,markers,updated_at FROM family_rooms WHERE account_id=$1',[user.id]);
  return send(res,200,{room:q.rowCount?{image:q.rows[0].image_data,markers:q.rows[0].markers,updatedAt:q.rows[0].updated_at}:null});
 }
 if(method==='PUT'&&path==='/v1/me/room'){
  const data=await json(req);
  requireOk(data.image===null||validImage(data.image,850000),400,'Фото комнаты должно быть JPEG до 850 КБ');
  const markers=data.markers||{};
  requireOk(markers&&typeof markers==='object'&&!Array.isArray(markers)&&Object.keys(markers).length<=25&&JSON.stringify(markers).length<5000,400,'Некорректное расположение предметов');
  for(const pos of Object.values(markers))requireOk(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)&&pos.x>=0&&pos.x<=100&&pos.y>=0&&pos.y<=100,400,'Некорректная позиция');
  await pool.query('INSERT INTO family_rooms(account_id,image_data,markers) VALUES($1,$2,$3::jsonb) ON CONFLICT(account_id) DO UPDATE SET image_data=EXCLUDED.image_data,markers=EXCLUDED.markers,updated_at=now()',
   [user.id,data.image,JSON.stringify(markers)]);
  return send(res,200,{ok:true});
 }
 if(method==='GET'&&path==='/v1/connections'){
  const q=await pool.query(
   'SELECT c.*,a.display_name a_name,a.role a_role,b.display_name b_name,b.role b_role FROM family_connections c JOIN family_accounts a ON a.id=c.a JOIN family_accounts b ON b.id=c.b WHERE c.a=$1 OR c.b=$1 ORDER BY c.created_at DESC',
   [user.id]
  );
  return send(res,200,{connections:q.rows.map(row=>connectionRow(row,user.id))});
 }
 if(method==='POST'&&path==='/v1/invites'){
  requireOk(user.role==='adult',403,'Приглашения создаются только взрослыми');
  requireOk(!hasRate('invite:'+user.id,20,86400000),429,'Слишком много приглашений');
  const data=await json(req),subject=data.fromAccountId||user.id;
  requireOk(['friend','relative','colleague'].includes(data.kind),400,'Неверный тип связи');
  requireOk(subject===user.id||await ownsChild(user,subject),403,'Нет прав приглашать от имени этого ребёнка');
  const token=randomBytes(24).toString('base64url');
  await pool.query("INSERT INTO family_invites(secret_hash,from_account,created_by,kind,expires_at) VALUES ($1,$2,$3,$4,now()+interval '2 days')",
    [sha(token),subject,user.id,data.kind]);
  return send(res,201,{code:token,kind:data.kind,expiresInHours:48});
 }
 if(method==='POST'&&path==='/v1/invites/accept'){
  requireOk(user.role==='adult',403,'Принимать приглашения может взрослый от себя или ребёнка');
  const data=await json(req),subject=data.forChildId||user.id,code=String(data.code||'');
  requireOk(/^[A-Za-z0-9_-]{30,60}$/.test(code),400,'Неверный код приглашения');
  requireOk(subject===user.id||await ownsChild(user,subject),403,'Нет прав принять приглашение за ребёнка');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   const invite=await client.query('SELECT * FROM family_invites WHERE secret_hash=$1 FOR UPDATE',[sha(code)]);
   requireOk(invite.rowCount===1&&!invite.rows[0].accepted_at&&new Date(invite.rows[0].expires_at)>new Date(),404,'Приглашение отсутствует, истекло или использовано');
   const src=invite.rows[0];
   requireOk(src.from_account!==subject,400,'Нельзя связать аккаунт с самим собой');
   await client.query('INSERT INTO family_connections(id,a,b,kind) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [randomUUID(),src.from_account,subject,src.kind]);
   await client.query('UPDATE family_invites SET accepted_at=now() WHERE secret_hash=$1',[sha(code)]);
   await client.query('COMMIT');
   return send(res,200,{ok:true,kind:src.kind});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 if(method==='POST'&&path==='/v1/care'){
  requireOk(!hasRate('care:'+user.id,100,3600000),429,'Слишком много действий');
  const data=await json(req),to=data.to,requestId=String(data.requestId||'');
  requireOk(typeof to==='string'&&to!==user.id&&['time','help','support','home'].includes(data.action)&&/^[0-9a-zA-Z_-]{12,100}$/.test(requestId),400,'Некорректные параметры заботы');
  const connection=await pool.query('SELECT 1 FROM family_connections WHERE (a=$1 AND b=$2) OR (a=$2 AND b=$1) LIMIT 1',[user.id,to]);
  requireOk(connection.rowCount===1,403,'Можно заботиться только о связанных аккаунтах');
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user.id+':'+to]);
   const already=await client.query('SELECT id FROM family_care WHERE from_account=$1 AND request_id=$2',[user.id,requestId]);
   if(already.rowCount){await client.query('COMMIT');return send(res,200,{ok:true,duplicate:true})}
   const recent=await client.query("SELECT count(*)::int AS cnt FROM family_care WHERE from_account=$1 AND to_account=$2 AND created_at >= date_trunc('day', now())",[user.id,to]);
   requireOk(recent.rows[0].cnt<3,429,'Сегодня уже записаны три действия заботы');
   await client.query('INSERT INTO family_care(id,from_account,to_account,action,request_id) VALUES ($1,$2,$3,$4,$5)',
    [randomUUID(),user.id,to,data.action,requestId]);
   await client.query('COMMIT');return send(res,201,{ok:true,recipientBonus:5,caregiverBonus:3});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
 if(method==='GET'&&path==='/v1/me/effects'){
  const q=await pool.query("SELECT from_account,to_account,created_at FROM family_care WHERE (from_account=$1 OR to_account=$1) AND created_at>now()-interval '24 hours'",[user.id]);
  let n=0;for(const a of q.rows)n+=a.from_account===user.id?3:5;
  return send(res,200,{resourceBonus:Math.min(18,n),validForHours:24});
 }
 if(method==='DELETE'&&path==='/v1/connections'){
  const data=await json(req);
  requireOk(typeof data.connectionId==='string',400,'Укажите связь');
  const result=await pool.query('DELETE FROM family_connections WHERE id=$1 AND (a=$2 OR b=$2) AND kind<>$3',[data.connectionId,user.id,'parent']);
  requireOk(result.rowCount===1,404,'Связь не найдена или является родительской');
  return send(res,200,{ok:true});
 }
 throw new HttpError(404,'Маршрут не найден');
}
let ready=false;
const server=http.createServer(async(req,res)=>{
 try{
  if(!ready){return send(res,503,{error:'База данных ещё не готова'})}
  await route(req,res);
 }catch(e){
  if(e instanceof HttpError)return send(res,e.status,{error:e.message});
  if(e.code==='22P02')return send(res,400,{error:'Неверный идентификатор'});
  console.error('API error:',String(e?.code||e?.name||'unknown'));
  if(!res.headersSent)send(res,500,{error:'Внутренняя ошибка сервера'});
  else res.end();
 }
});
(async()=>{
 await pool.query(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 ready=true;
 server.listen(PORT,'0.0.0.0',()=>console.log('LifeSims family test API ready on port '+PORT));
})().catch(err=>{console.error('Cannot initialize DB schema',err.code||err.message);process.exitCode=1;pool.end()});
