import test from 'node:test';
import assert from 'node:assert/strict';
import {createFigurineRoute} from '../figurines.mjs';

const adult='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const child='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const avatar=Buffer.alloc(130);
avatar.write('RIFF',0,'ascii');avatar.write('WEBP',8,'ascii');
const image='data:image/webp;base64,'+avatar.toString('base64');
const sample=Buffer.alloc(150);
sample[0]=255;sample[1]=216;sample[2]=255;
const photo='data:image/jpeg;base64,'+sample.toString('base64');
const user={id:adult,role:'adult'};
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
function fixture(){
 const queries=[];
 const pool={query:async(sql,args)=>{queries.push({sql,args});return sql.includes('guardian_id=$2')?{rowCount:1,rows:[{id:child}]}:{rowCount:1,rows:[{image_data:image,updated_at:'2026-11-23T00:00:00.000Z'}]}}};
 const fn=createFigurineRoute({pool,json:async(req)=>req.payload,
  send:(_res,status,payload)=>({status,payload}),requireOk:(test,status,message)=>{if(!test)throw new HttpError(status,message)},
  HttpError,hasRate:()=>false});
 const call=(path,method='GET',payload,as=user)=>fn({req:{url:path,payload},res:{},user:as,path:path.split('?')[0],method});
 return {call,queries};
}
test('status is disabled by default and does not reveal an API key',async()=>{
 const before=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 try{
  const {call}=fixture();const result=await call('/v1/figurines/status');
  assert.equal(result.status,200);
  assert.equal(result.payload.generationEnabled,false);
  assert.equal(result.payload.sourcePhotoStored,false);
  assert.ok(!JSON.stringify(result.payload).includes('sk-'));
 }finally{if(before!==undefined)process.env.OPENAI_API_KEY=before}
});
test('parent can read only their child figure, strangers cannot',async()=>{
 const {call}=fixture();
 const yes=await call('/v1/figurines?accountId='+child);
 assert.equal(yes.status,200);assert.equal(yes.payload.figurine,image);
 await assert.rejects(call('/v1/figurines?accountId='+child,'GET',undefined,{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',role:'child'}),e=>e.status===403);
});
test('child writing is forbidden on the temporary server',async()=>{
 const before=process.env.FIGURINE_CHILD_UPLOADS_ENABLED;delete process.env.FIGURINE_CHILD_UPLOADS_ENABLED;
 try{
  const {call}=fixture();
  await assert.rejects(call('/v1/figurines/save','POST',{accountId:child,figurine:image,acknowledgeTemporaryStorage:true}),e=>e.status===503);
 }finally{if(before!==undefined)process.env.FIGURINE_CHILD_UPLOADS_ENABLED=before}
});
test('saving requires explicit approval and validates image magic bytes',async()=>{
 const {call,queries}=fixture();
 await assert.rejects(call('/v1/figurines/save','POST',{accountId:adult,figurine:image}),e=>e.status===400);
 const okay=await call('/v1/figurines/save','POST',{accountId:adult,figurine:image,acknowledgeTemporaryStorage:true});
 assert.equal(okay.status,200);
 assert.ok(queries.some(q=>q.sql.startsWith('INSERT INTO family_figurines')));
 await assert.rejects(call('/v1/figurines/save','POST',{accountId:adult,figurine:'data:image/webp;base64,YWJj',acknowledgeTemporaryStorage:true}),e=>e.status===400);
});
test('generation uses server key, sends source to API only after consent and never persists it',async()=>{
 const oldKey=process.env.OPENAI_API_KEY,oldEnabled=process.env.FIGURINE_GENERATION_ENABLED,oldFetch=globalThis.fetch;
 process.env.OPENAI_API_KEY='test-value-not-a-real-secret';process.env.FIGURINE_GENERATION_ENABLED='1';
 let calls=0;
 globalThis.fetch=async(url,params)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');
  assert.equal(params.headers.Authorization,'Bearer test-value-not-a-real-secret');
  const b=JSON.parse(params.body);
  assert.equal(b.images[0].image_url,photo);
  assert.equal(b.background,'transparent');
  assert.equal(b.model,'gpt-image-2.5-sunburst');
  return {ok:true,json:async()=>({data:[{b64_json:avatar.toString('base64')}]})};
 };
 try{
  const {call,queries}=fixture();
  await assert.rejects(call('/v1/figurines/generate','POST',{accountId:adult,photo,confirmGeneration:true}),e=>e.status===400);
  assert.equal(calls,0);
  const result=await call('/v1/figurines/generate','POST',{accountId:adult,photo,confirmGeneration:true,consentToExternalProcessing:true});
  assert.equal(result.status,200);assert.equal(result.payload.figurine,image);assert.equal(result.payload.stored,false);assert.equal(calls,1);
  assert.equal(queries.length,0);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  if(oldEnabled===undefined)delete process.env.FIGURINE_GENERATION_ENABLED;else process.env.FIGURINE_GENERATION_ENABLED=oldEnabled;
 }
});
