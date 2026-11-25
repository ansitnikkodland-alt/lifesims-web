import {createHmac, randomBytes} from 'node:crypto';

// FatSecret Platform REST. Signed server-to-server OAuth 1.0 requests only.
// Credentials never enter URLs returned to clients, logs, or the browser.
const ENDPOINT='https://platform.fatsecret.com/rest/server.api';
const encode=s=>encodeURIComponent(String(s)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const number=s=>{
 const n=Number(s);return Number.isFinite(n)&&n>=0?n:null;
};
export class FatSecretError extends Error{
 constructor(code,message){super(message);this.name='FatSecretError';this.code=code}
}
export function fatSecretConfigured(env=process.env){
 return Boolean(String(env.FATSECRET_CONSUMER_KEY||'').trim()&&String(env.FATSECRET_CONSUMER_SECRET||'').trim());
}
export function signedFatSecretUrl(method,params={},options={}){
 const consumerKey=options.key??process.env.FATSECRET_CONSUMER_KEY;
 const consumerSecret=options.secret??process.env.FATSECRET_CONSUMER_SECRET;
 if(!consumerKey||!consumerSecret)throw new FatSecretError('not_configured','FatSecret ещё не настроен на сервере');
 const all={
  method,format:'json',...params,
  oauth_consumer_key:String(consumerKey),oauth_nonce:options.nonce||randomBytes(16).toString('hex'),
  oauth_signature_method:'HMAC-SHA1',
  oauth_timestamp:String(options.timestamp??Math.floor(Date.now()/1000)),
  oauth_version:'1.0'
 };
 const ordered=Object.entries(all).sort(([a,va],[b,vb])=>a.localeCompare(b,'en')||String(va).localeCompare(String(vb),'en'));
 const normalized=ordered.map(([k,v])=>encode(k)+'='+encode(v)).join('&');
 const base=['GET',encode(ENDPOINT),encode(normalized)].join('&');
 const signingKey=encode(consumerSecret)+'&';
 const signature=createHmac('sha1',signingKey).update(base).digest('base64');
 const url=new URL(ENDPOINT);
 for(const [k,v] of Object.entries(all))url.searchParams.set(k,String(v));
 url.searchParams.set('oauth_signature',signature);
 return url;
}
function extractApiError(data){
 const e=data?.error;
 if(!e)return null;
 const code=String(e.code??'unknown');
 const safe={
  '5':'FatSecret не принимает Consumer Key',
  '6':'Неверное время запроса FatSecret',
  '8':'FatSecret отклонил подпись OAuth 1.0',
  '11':'Достигнут лимит API FatSecret',
  '20':'FatSecret временно недоступен',
  '21':'FatSecret отклонил исходящий IP сервера. Проверь IP Restrictions',
  '101':'У запроса отсутствует обязательный параметр',
  'unknown':'FatSecret вернул ошибку'
 };
 return new FatSecretError(code,safe[code]||'FatSecret вернул ошибку '+code);
}
async function fatSecretRequest(method,params={},fetcher=fetch){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetcher(signedFatSecretUrl(method,params),{
   method:'GET',headers:{Accept:'application/json'},signal:controller.signal,
   redirect:'error',cache:'no-store'
  });
  if(!response.ok)throw new FatSecretError('http_'+response.status,
   response.status===429?'FatSecret ограничил частоту запросов':'FatSecret недоступен (HTTP '+response.status+')');
  const result=await response.json();
  const error=extractApiError(result);
  if(error)throw error;
  return result;
 }catch(error){
  if(error?.name==='AbortError')throw new FatSecretError('timeout','FatSecret не ответил за 15 секунд');
  if(error instanceof FatSecretError)throw error;
  throw new FatSecretError('network','Не удалось связаться с FatSecret');
 }finally{clearTimeout(timer)}
}
function normalizeFoodRow(x){
 const id=String(x?.food_id||'');
 if(!/^\d{1,20}$/.test(id))return null;
 const name=String(x.food_name||'').slice(0,160),brand=String(x.brand_name||'').slice(0,100);
 return {foodId:id,name,brand,title:brand?name+' · '+brand:name,
  description:String(x.food_description||'').slice(0,320),
  foodUrl:/^https:\/\/foods\.fatsecret\.com\//.test(x.food_url||'')?x.food_url:null,
  source:'FatSecret',region:'US'};
}
export async function fatSecretSearch(query,{fetcher=fetch}={}){
 const term=String(query||'').trim();
 if(term.length<2||term.length>80)throw new FatSecretError('query','Введите от 2 до 80 символов');
 const result=await fatSecretRequest('foods.search',{search_expression:term,max_results:'15',page_number:'0'},fetcher);
 const raw=result?.foods?.food;
 return (Array.isArray(raw)?raw:raw?[raw]:[]).map(normalizeFoodRow).filter(Boolean);
}
function normalizeServing(x){
 const amount=number(x?.metric_serving_amount),unit=String(x?.metric_serving_unit||'').toLowerCase();
 const usableWeight=amount>0&&(unit==='g'||unit==='ml');
 const total={kcal:number(x?.calories),protein:number(x?.protein),
  fat:number(x?.fat),carbs:number(x?.carbohydrate)};
 const per100=usableWeight?Object.fromEntries(Object.entries(total).map(([k,v])=>[k,v==null?null:Math.round(v*10000/amount)/100])):null;
 return {servingId:String(x?.serving_id||''),serving:String(x?.serving_description||'').slice(0,120),
  grams:usableWeight?amount:null,unit:unit||null,per100,
  servingNutrition:total};
}
export async function fatSecretFood(foodId,{fetcher=fetch}={}){
 const id=String(foodId||'');
 if(!/^\d{1,20}$/.test(id))throw new FatSecretError('id','Некорректный идентификатор продукта');
 const result=await fatSecretRequest('food.get',{food_id:id},fetcher);
 const item=result?.food;
 if(!item)throw new FatSecretError('missing','Продукт в FatSecret не найден');
 const raw=item?.servings?.serving;
 const servings=(Array.isArray(raw)?raw:raw?[raw]:[]).map(normalizeServing);
 const withWeight=servings.find(x=>x.per100);
 return {
  ...normalizeFoodRow(item),servings,
  per100:withWeight?.per100||null,
  gramsEstimate:withWeight?.grams||null,
  portionUnit:withWeight?.unit||null,
  confidence:'Данные FatSecret (каталог США). Проверь единицы порции и значения перед записью.'
 };
}
