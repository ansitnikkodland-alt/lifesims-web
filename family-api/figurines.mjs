/* Photo -> single full-body figurine. Backend-only image API: never expose keys to browser.
 * Source photos are not persisted. Results are stored only on explicit save.
 * Child generation/upload is disabled until a durable child-data deployment is approved.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE=/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const WEBP=/^data:image\/webp;base64,([A-Za-z0-9+/]+={0,2})$/;
const generationEnabled=()=>process.env.FIGURINE_GENERATION_ENABLED==='1'&&!!process.env.OPENAI_API_KEY;
const childEnabled=()=>process.env.FIGURINE_CHILD_UPLOADS_ENABLED==='1';
const safeImage=(value,re,maxBytes)=>{
 if(typeof value!=='string'||value.length>maxBytes*1.38+40)return false;
 const match=value.match(re);
 if(!match)return false;
 const bytes=Buffer.from(match[1],'base64');
 if(bytes.length<100||bytes.length>maxBytes)return false;
 if(value.startsWith('data:image/webp;'))return bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(value.startsWith('data:image/png;'))return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
};
const prompt='Create ONE premium-quality, polished, full-body stylized-realistic 3D game character figurine based on the attached reference photo. Preserve the individual facial likeness, face shape, hair and recognizable features closely without inventing identities. The subject may be a child: use natural age-appropriate proportions, modest everyday clothing and a relaxed neutral standing pose, arms slightly away from the body. Head to toe visible, feet fully inside the image. Charming high-end life-simulation game render, realistic materials and soft studio lighting, clean silhouette. Keep the appearance consistent with the reference. Single person only, straight-on 3/4 camera, no props, no text, no borders, no pedestal, no room, no other people, TRANSPARENT background. This is a single still character figurine, not an animated 3D model.';
export function createFigurineRoute({pool,json,send,requireOk,HttpError,hasRate}){
 const busy=new Set();
 async function targetFor(user,id,write=false){
  const target=id||user.id;
  requireOk(typeof target==='string'&&UUID.test(target),400,'Неверный персонаж');
  if(target===user.id){
   requireOk(!write||user.role==='adult',403,'Генерация доступна родителю');
   return {id:target,child:user.role==='child'};
  }
  requireOk(user.role==='adult',403,'Нет доступа к чужому персонажу');
  const found=await pool.query("SELECT id FROM family_accounts WHERE id=$1 AND guardian_id=$2 AND role='child'",[target,user.id]);
  requireOk(found.rowCount===1,403,'Персонаж не относится к семье');
  if(write)requireOk(childEnabled(),503,'Создание фигурок детей отключено для временного сервера до подключения постоянного защищённого хранилища');
  return {id:target,child:true};
 }
 return async function figurineRoute({req,res,user,path,method}){
  if(path==='/v1/figurines/status'&&method==='GET')
   return send(res,200,{generationEnabled:generationEnabled(),childUploadsEnabled:childEnabled(),temporaryStorage:true,sourcePhotoStored:false,model:'gpt-image-2.5-sunburst'});
  if(path==='/v1/figurines'&&method==='GET'){
   const id=new URL(req.url,'http://local').searchParams.get('accountId')||user.id;
   const target=await targetFor(user,id);
   const r=await pool.query('SELECT image_data,updated_at FROM family_figurines WHERE account_id=$1',[target.id]);
   return send(res,200,{accountId:target.id,figurine:r.rows[0]?.image_data||null,updatedAt:r.rows[0]?.updated_at||null});
  }
  if(path==='/v1/figurines'&&method==='DELETE'){
   const data=await json(req),target=await targetFor(user,data.accountId,true);
   await pool.query('DELETE FROM family_figurines WHERE account_id=$1',[target.id]);
   return send(res,200,{ok:true});
  }
  if(path==='/v1/figurines/save'&&method==='POST'){
   const data=await json(req),target=await targetFor(user,data.accountId,true);
   requireOk(data.acknowledgeTemporaryStorage===true,400,'Подтвердите временное хранение изображения');
   requireOk(safeImage(data.figurine,WEBP,2300000),400,'Ожидается готовая фигурка WebP до 2,3 МБ');
   await pool.query('INSERT INTO family_figurines(account_id,image_data) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET image_data=EXCLUDED.image_data,updated_at=now()',[target.id,data.figurine]);
   return send(res,200,{ok:true,accountId:target.id});
  }
  if(path==='/v1/figurines/generate'&&method==='POST'){
   requireOk(generationEnabled(),503,'Генератор изображений пока не подключён владельцем сервера');
   const data=await json(req),target=await targetFor(user,data.accountId,true);
   requireOk(data.consentToExternalProcessing===true,400,'Нужно согласие на передачу фото сервису генерации');
   requireOk(data.confirmGeneration===true,400,'Подтвердите запуск платной генерации');
   requireOk(safeImage(data.photo,SOURCE,1700000),400,'Загрузите фотографию JPEG, PNG или WebP до 1,7 МБ');
   requireOk(!hasRate('figurine:gen:'+user.id,3,86400000),429,'Лимит: не более трёх генераций за 24 часа');
   requireOk(!busy.has(user.id),409,'Генерация уже выполняется');
   busy.add(user.id);
   try{
    const response=await fetch('https://api.openai.com/v1/images/edits',{
     method:'POST',
     headers:{'Authorization':'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
     signal:AbortSignal.timeout(125000),
     body:JSON.stringify({
      model:'gpt-image-2.5-sunburst',
      images:[{image_url:data.photo}],
      prompt,quality:'high',size:'1024x1536',background:'transparent',
      output_format:'webp',output_compression:85,n:1,
      safety_identifier:'lifesims-'+target.id
     })
    });
    if(!response.ok){
     const fault=await response.json().catch(()=>({}));
     const err=fault?.error?.code||fault?.error?.type||'generation_failed';
     if(response.status===429)return send(res,503,{error:'Сервис генерации временно ограничил запросы'});
     if(response.status===400)return send(res,422,{error:'Генератор не смог обработать фото: '+String(err).slice(0,100)});
     return send(res,502,{error:'Сервис генерации недоступен: '+String(err).slice(0,100)});
    }
    const output=await response.json();
    const dataUrl='data:image/webp;base64,'+String(output?.data?.[0]?.b64_json||'');
    requireOk(safeImage(dataUrl,WEBP,2300000),502,'Генератор вернул неподходящее изображение');
    // Never store the original reference photograph, nor the generated image before approval.
    return send(res,200,{figurine:dataUrl,accountId:target.id,stored:false,model:'gpt-image-2.5-sunburst'});
   }catch(error){
    if(error instanceof HttpError)throw error;
    return send(res,502,{error:'Не удалось получить изображение от генератора'});
   }finally{busy.delete(user.id)}
  }
  throw new HttpError(404,'Раздел фигурок не найден');
 };
}
