'use strict';
const http = require('node:http');
const {URL} = require('node:url');
const PORT=Number(process.env.PORT||10000);
const ORIGIN='https://ansitnikkodland-alt.github.io';
const COLLECTIONS=new Set(['sleep','daily_activity','daily_sleep','daily_readiness','heartrate','workout','enhanced_tag','session','daily_spo2','daily_stress','daily_resilience','daily_cardiovascular_age','vo2_max','sleep_time','rest_mode_period','ring_battery_level','ring_configuration']);
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const limits=new Map();
function response(res,status,data){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(JSON.stringify(data));
}
function origin(req,res){
 if(req.headers.origin!==ORIGIN)return false;
 res.setHeader('Access-Control-Allow-Origin',ORIGIN);
 res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Authorization');
 res.setHeader('Access-Control-Max-Age','600');
 res.setHeader('Vary','Origin');
 return true;
}
function queryOK(collection,search){
 const allowed=collection==='ring_configuration'?new Set(['next_token']):new Set(['start_date','end_date','start_datetime','end_datetime','next_token']);
 for(const key of search.keys())if(!allowed.has(key)||search.getAll(key).length!==1)return false;
 const cursor=search.get('next_token');
 if(cursor&&(cursor.length>512||!/^[a-zA-Z0-9_=+/-]+$/.test(cursor)))return false;
 if(collection==='ring_configuration')return true;
 let a,b;
 if(DATE.test(search.get('start_date')||'')&&DATE.test(search.get('end_date')||'')&&!search.has('start_datetime')&&!search.has('end_datetime')){
  a=Date.parse(search.get('start_date')+'T00:00:00Z');b=Date.parse(search.get('end_date')+'T00:00:00Z');
 }else if(ISO.test(search.get('start_datetime')||'')&&ISO.test(search.get('end_datetime')||'')&&!search.has('start_date')&&!search.has('end_date')){
  a=Date.parse(search.get('start_datetime'));b=Date.parse(search.get('end_datetime'));
 }else return false;
 return Number.isFinite(a)&&Number.isFinite(b)&&b>=a&&b-a<=10*86400000;
}
function limited(req){
 const key=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0];
 const now=Date.now();let item=limits.get(key);
 if(!item||now-item.start>60000){limits.set(key,{start:now,n:1});return false}
 return ++item.n>45;
}
async function handle(req,res){
 res.setHeader('Referrer-Policy','no-referrer');
 const validOrigin=origin(req,res);
 if(req.method==='OPTIONS'){if(!validOrigin)return response(res,403,{error:'Origin not allowed'});res.writeHead(204);res.end();return}
 if(req.method!=='GET')return response(res,405,{error:'Method not allowed'});
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/health')return response(res,200,{ok:true,service:'LifeSims Oura bridge',version:'v1'});
 if(!validOrigin)return response(res,403,{error:'Origin not allowed'});
 const m=/^\/v1\/oura\/([a-z_]+)$/.exec(url.pathname);
 if(!m||!COLLECTIONS.has(m[1]))return response(res,404,{error:'Unknown collection'});
 if(!queryOK(m[1],url.searchParams))return response(res,400,{error:'Invalid date range'});
 if(limited(req))return response(res,429,{error:'Rate limit exceeded'});
 const bearer=req.headers.authorization||'';
 if(!/^Bearer [A-Za-z0-9._~+/-]{16,4096}$/.test(bearer))return response(res,401,{error:'Bearer token required'});
 let result;
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   const target=new URL('https://api.ouraring.com/v2/usercollection/'+m[1]);
   target.search=url.searchParams.toString();
   result=await fetch(target,{headers:{Authorization:bearer,'User-Agent':'LifeSims-Oura-Bridge/1.0',Accept:'application/json'},signal:controller.signal,redirect:'error'});
  }finally{clearTimeout(timer)}
 }catch(_){return response(res,502,{error:'Oura unavailable or timeout'})}
 if(!(result.headers.get('content-type')||'').includes('json'))return response(res,502,{error:'Unexpected Oura response'});
 if(Number(result.headers.get('content-length')||0)>4000000)return response(res,502,{error:'Response too large'});
 let body;
 try{body=await result.text()}catch(_){return response(res,502,{error:'Oura response unreadable'})}
 if(body.length>4000000)return response(res,502,{error:'Response too large'});
 res.writeHead(result.status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(body);
}
http.createServer((req,res)=>handle(req,res).catch(()=>response(res,500,{error:'Internal bridge error'})))
 .listen(PORT,'0.0.0.0',()=>console.info('LifeSims Oura bridge ready'));
