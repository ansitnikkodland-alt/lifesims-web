import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {fatSecretConfigured,signedFatSecretUrl,fatSecretSearch,fatSecretFood,FatSecretError} from '../fatsecret.mjs';
const key='integration-fixture-consumer-key',secret='integration-fixture-secret';
const withEnv=async task=>{
 const previous=[process.env.FATSECRET_CONSUMER_KEY,process.env.FATSECRET_CONSUMER_SECRET];
 process.env.FATSECRET_CONSUMER_KEY=key;process.env.FATSECRET_CONSUMER_SECRET=secret;
 try{await task()}finally{
  for(const [i,k] of ['FATSECRET_CONSUMER_KEY','FATSECRET_CONSUMER_SECRET'].entries())
   if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];
 }
};
test('status needs both secrets but never returns them',()=>{
 assert.equal(fatSecretConfigured({FATSECRET_CONSUMER_KEY:'x'}),false);
 assert.equal(fatSecretConfigured({FATSECRET_CONSUMER_KEY:'x',FATSECRET_CONSUMER_SECRET:'y'}),true);
});
test('OAuth 1.0 signed URL matches independent RFC3986 signature verification',()=>{
 const url=signedFatSecretUrl('foods.search',{search_expression:'oat milk',max_results:'10'},
  {key,secret,nonce:'nonce-fixture',timestamp:1795584000});
 const qs=new URLSearchParams(url.search),sig=qs.get('oauth_signature');qs.delete('oauth_signature');
 const e=s=>encodeURIComponent(s).replace(/[!'()*]/g,x=>'%'+x.charCodeAt(0).toString(16).toUpperCase());
 const normal=[...qs.entries()].sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0)
  .map(([k,v])=>e(k)+'='+e(v)).join('&');
 const base='GET&'+e(url.origin+url.pathname)+'&'+e(normal);
 const expected=createHmac('sha1',e(secret)+'&').update(base).digest('base64');
 assert.equal(sig,expected);
 assert.equal(qs.get('oauth_consumer_key'),key);
 assert.equal(qs.get('oauth_signature_method'),'HMAC-SHA1');
 assert.equal(qs.get('search_expression'),'oat milk');
 assert.ok(!url.toString().includes(secret));
});
test('signed search normalizes singleton and multiple FatSecret results',async()=>{
 await withEnv(async()=>{
  const records=[];
  const fetcher=async url=>{
   records.push(url);
   return {ok:true,json:async()=>({foods:{food:[
    {food_id:'41963',food_name:'Cheeseburger',brand_name:'Example',food_description:'Per 1 serving - Calories: 320kcal'},
    {food_id:'36421',food_name:'Mushrooms',food_description:'Per 100g - Calories: 22kcal'}
   ]}})};
  };
  const result=await fatSecretSearch('mushrooms',{fetcher});
  assert.equal(result.length,2);
  assert.equal(result[1].title,'Mushrooms');
  assert.equal(result[0].brand,'Example');
  assert.equal(result[0].source,'FatSecret');
  assert.equal(records.length,1);
  assert.equal(records[0].searchParams.get('method'),'foods.search');
 });
});
test('food details convert only known gram servings to per 100g',async()=>{
 await withEnv(async()=>{
  const fetcher=async()=>({ok:true,json:async()=>({food:{
   food_id:'50953',food_name:'Cereal',brand_name:'Example',servings:{serving:[
    {serving_id:'200',serving_description:'1 cup',calories:'100',protein:'3.0',
     fat:'2',carbohydrate:'20',metric_serving_amount:'30',metric_serving_unit:'g'},
    {serving_id:'201',serving_description:'1 piece',calories:'40',protein:'1.4',
     fat:'0.5',carbohydrate:'8'}
   ]}
  }})});
  const item=await fatSecretFood('50953',{fetcher});
  assert.equal(item.foodId,'50953');
  assert.equal(item.per100.kcal,333.33);
  assert.equal(item.per100.protein,10);
  assert.equal(item.servings[1].per100,null);
 });
});
test('FatSecret error code 21 is translated without leaking credentials',async()=>{
 await withEnv(async()=>{
  const fetcher=async()=>({ok:true,json:async()=>({error:{code:'21',message:'Invalid IP'}})});
  await assert.rejects(()=>fatSecretSearch('cereal',{fetcher}),
   error=>error instanceof FatSecretError&&error.code==='21'&&error.message.includes('IP Restrictions'));
 });
});
