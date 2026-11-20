/* LifeSims — true interactive 3D room. No bitmap room or CSS faux-3D objects.
 * Three.js MIT: pinned import. Existing user's data stays in the original application.
 * The old illustration is shown ONLY if WebGL or the module cannot initialize.
 */
import * as T from 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js';

const host=document.getElementById('scene');
const bridge=window.LifeSims3DBridge;
if(!host||!bridge)throw Error('LifeSims 3D requires the existing scene and data bridge');
const can=document.createElement('canvas');
can.id='life3dCanvas';can.setAttribute('aria-label','Интерактивная трёхмерная комната LifeSims');
can.setAttribute('role','application');can.tabIndex=0;
let renderer;
try{
 renderer=new T.WebGLRenderer({canvas:can,antialias:true,powerPreference:'high-performance',alpha:false});
}catch(e){throw new Error('WebGL unavailable: '+e.message)}
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.32;

const world=new T.Scene();world.background=new T.Color('#14213b');
const camera=new T.OrthographicCamera(-6.9,6.9,5.6,-5.6,.1,70);
let azimuth=.72,elevation=.83,zoom=1;
const lookAt=new T.Vector3(0,1.08,.04);
function cameraPlace(){
 const radius=19;
 camera.position.set(Math.sin(azimuth)*Math.cos(elevation)*radius,Math.sin(elevation)*radius,Math.cos(azimuth)*Math.cos(elevation)*radius);
 camera.lookAt(lookAt);camera.updateProjectionMatrix();
}
cameraPlace();

const ambient=new T.HemisphereLight(0xe0ebff,0x574335,2.25);world.add(ambient);
const sun=new T.DirectionalLight(0xffe4c8,3.1);sun.position.set(3,11,8);
sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-9;sun.shadow.camera.right=9;sun.shadow.camera.top=9;sun.shadow.camera.bottom=-9;
sun.shadow.normalBias=.035;world.add(sun);
const lamp=new T.PointLight(0xffb96f,16,8.2,2);lamp.position.set(3.5,2.6,-2.7);world.add(lamp);
const deskLamp=new T.PointLight(0xffd0a4,9,6,2);deskLamp.position.set(-3.95,1.85,-.25);world.add(deskLamp);
const allHit=[];
const shapes=new Map();
const mat=(color,roughness=.77,metalness=.05,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness,...extra});
const wood=mat('#744c39'),darkWood=mat('#4b302a'),lightWood=mat('#b68a64');
const linen=mat('#ead9c5'),linenShadow=mat('#baaa9d'),maroon=mat('#71374e');
const metal=mat('#94a5aa',.27,.7),paper=mat('#eee4d9'),glass=mat('#b5dddf',.12,.15,{transparent:true,opacity:.24,depthWrite:false,side:T.DoubleSide});
const mesh=(geometry,material,group=world,action=null)=>{
 const o=new T.Mesh(geometry,material);o.castShadow=true;o.receiveShadow=true;group.add(o);
 if(action)o.userData.action=action;return o;
};
function group(action=null,parent=world){
 const g=new T.Group();parent.add(g);if(action){g.userData.action=action;allHit.push(g)}
 return g;
}
function box(w,h,d,m,parent,x=0,y=0,z=0,action=null){
 const o=mesh(new T.BoxGeometry(w,h,d),m,parent,action);o.position.set(x,y,z);return o;
}
function cyl(r1,r2,h,m,parent,x=0,y=0,z=0,rad=12){
 const o=mesh(new T.CylinderGeometry(r1,r2,h,rad),m,parent);o.position.set(x,y,z);return o;
}
function sphere(r,m,parent,x=0,y=0,z=0,rx=1,ry=1,rz=1){
 const o=mesh(new T.SphereGeometry(r,12,10),m,parent);o.position.set(x,y,z);o.scale.set(rx,ry,rz);return o;
}
function line(points,m,parent){
 const curve=new T.CatmullRomCurve3(points.map(x=>new T.Vector3(...x)));
 const o=mesh(new T.TubeGeometry(curve,Math.max(8,points.length*4),.012,5,false),m,parent);
 o.castShadow=false;return o;
}
function mapCanvas(w,h,drawer){
 const c=document.createElement('canvas');c.width=w;c.height=h;
 drawer(c.getContext('2d'),w,h);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
 return t;
}
const floorMap=mapCanvas(512,512,(cx,w,h)=>{
 cx.fillStyle='#ac7a55';cx.fillRect(0,0,w,h);
 for(let row=0;row<9;row++){
  const y=row*h/9;
  for(let j=0;j<6;j++){
   const offset=(row%2)*w/12;const x=j*w/6-offset;
   const shade=105+Math.round((Math.sin(row*4+j*9)+1)*20);
   cx.fillStyle='rgb('+Math.min(205,shade+53)+','+(shade+15)+','+Math.max(56,shade-7)+')';
   cx.fillRect(x+1,y+1,w/6-3,h/9-3);
   cx.strokeStyle='#4c35245a';cx.strokeRect(x,y,w/6,h/9);
   cx.strokeStyle='#ffffff18';cx.beginPath();cx.moveTo(x+9,y+6);cx.lineTo(x+w/6-8,y+7);cx.stroke();
  }
 }
});
floorMap.wrapS=floorMap.wrapT=T.RepeatWrapping;floorMap.repeat.set(2.8,2.3);
const floorMat=mat('#ffffff',.91,0,{map:floorMap});
const room=group();box(11.7,.16,9,floorMat,room,0,-.10,0);
const wall=mat('#c8aaa0',.99),wallSide=mat('#ab8f8d',.99),baseboard=mat('#64463c');
box(11.7,3.55,.12,wall,room,0,1.72,-4.45);
box(.12,3.55,9,wallSide,room,-5.85,1.72,0);
box(11.7,.15,.16,baseboard,room,0,.08,-4.38);
box(.13,.15,9,baseboard,room,-5.75,.08,0);
function window3d(){
 const g=group('window');g.position.set(-5.76,2.12,-2.0);
 const sky=mat('#5376a8',.72,0,{emissive:'#2b4666',emissiveIntensity:.15,side:T.DoubleSide});
 box(.04,1.63,2.26,sky,g,-.06,0,0);
 const frame=mat('#684d43');for(const y of [-.82,.82])box(.11,.09,2.31,frame,g,0,y,0);
 for(const z of [-1.16,1.16])box(.11,1.7,.1,frame,g,0,0,z);
 box(.12,1.7,.09,frame,g,0,0,0);box(.12,.08,2.25,frame,g,0,0,0);
 const glassM=mat('#bce6ec',.05,.08,{transparent:true,opacity:.19,side:T.DoubleSide,depthWrite:false});
 box(.025,1.6,2.22,glassM,g,.06,0,0);
 const blinds=mat('#e7d5c2');for(let i=0;i<5;i++)box(.035,.07,2.28,blinds,g,.095,.55-i*.28,0);
 shapes.set('sky',sky);
}
window3d();

function carpetTexture(){
 return mapCanvas(640,460,(c,w,h)=>{
 c.fillStyle='#85394c';c.fillRect(0,0,w,h);
 c.strokeStyle='#d0a394';c.lineWidth=14;c.strokeRect(25,22,w-50,h-44);
 c.strokeStyle='#3c9ba8';c.lineWidth=16;c.strokeRect(42,38,w-84,h-76);
 c.strokeStyle='#e6cab4';c.lineWidth=4;c.strokeRect(58,52,w-116,h-104);
 for(let y=67;y<h-60;y+=31)for(let x=64;x<w-60;x+=33){
  c.save();c.translate(x,y);c.rotate(Math.PI/4);
  c.fillStyle=(x+y)%3<1?'#c9a18f':'#58b5bb';c.fillRect(-9,-9,18,18);
  c.fillStyle='#8b394c';c.fillRect(-4,-4,8,8);c.restore();
 }
 c.translate(w/2,h/2);
 for(let i=5;i>=0;i--){
  c.fillStyle=['#dfbdab','#943c51','#5eabb1','#e8c5af','#8a374e','#5bb5b9'][5-i];
  c.beginPath();const rx=53+i*23,ry=35+i*17;
  for(let k=0;k<16;k++){const a=(k/16)*Math.PI*2,scale=k%2?.78:1;
   const xx=Math.cos(a)*rx*scale,yy=Math.sin(a)*ry*scale;
   if(k===0)c.moveTo(xx,yy);else c.lineTo(xx,yy);
  }c.closePath();c.fill();
 }
 });
}
const rug=group('rug');const rugMesh=mesh(new T.PlaneGeometry(5.35,3.6),mat('#ffffff',.94,0,{map:carpetTexture()}),rug);
rugMesh.rotation.x=-Math.PI/2;rugMesh.position.set(1.05,.01,1.06);
box(5.37,.028,3.64,mat('#503342'),rug,1.05,-.006,1.06);
function legs(g,x,y,z,w=1,d=1,h=.75,m=darkWood){
 for(const dx of [-w/2+.09,w/2-.09])for(const dz of [-d/2+.09,d/2-.09])box(.12,h,.12,m,g,x+dx,y-h/2,z+dz);
}
function bed(){
 const g=group('bed');g.position.set(3.12,0,-2.13);
 const frame=mat('#64413b');const mattress=mat('#d1b9aa');
 box(3.68,.35,3.05,frame,g,0,.43,.0);legs(g,0,.4,0,3.7,3,.35);
 box(3.83,1.52,.27,frame,g,0,.94,-1.58);
 box(3.51,.31,2.88,mattress,g,0,.79,0);
 box(3.51,.18,2.88,linen,g,0,.98,0);
 for(const x of [-.93,.93])sphere(.58,paper,g,x,1.1,-1.03,1.13,.28,.63);
 const made=group(null,g),unmade=group(null,g);
 box(3.5,.14,1.49,maroon,made,0,1.11,.68);
 box(3.5,.035,.07,mat('#d7b4b5'),made,0,1.19,-.10);
 for(let i=0;i<5;i++)box(.018,.02,1.4,mat('#a9687a'),made,-1.42+i*.7,1.2,.65);
 const rumple=mat('#703b51',.86);
 const fold=box(3.43,.13,1.4,rumple,unmade,-.12,1.17,.65);fold.rotation.y=.17;fold.rotation.z=.13;
 for(let i=0;i<4;i++){
  const o=box(.8,.20,1.1,i%2?mat('#875469'):rumple,unmade,-1.1+i*.73,1.21,.48);
  o.rotation.z=(i%2?-.21:.16);
 }
 made.visible=true;unmade.visible=false;shapes.set('bedMade',made);shapes.set('bedUnmade',unmade);
}
bed();

function desk(){
 const g=group('desk');g.position.set(-4.05,0,-.7);
 box(2.1,.12,1.28,wood,g,0,.88,0);legs(g,0,.87,0,1.98,1.20,.85);
 box(.7,.72,1.08,darkWood,g,-.72,.47,0);
 for(let yy of [.30,.57]){box(.03,.02,.76,metal,g,-.35,yy,.0)}
 const computer=mat('#25303a',.5,.3);
 box(.85,.07,.57,computer,g,-.3,.98,-.29);
 const screen=box(.86,.57,.045,computer,g,-.30,1.31,-.56);screen.rotation.x=-.11;
 box(.74,.45,.01,mat('#142f42',.4,.15,{emissive:'#0a2747',emissiveIntensity:.45}),g,-.30,1.31,-.529);
 for(let r=0;r<3;r++)for(let c=0;c<6;c++)box(.068,.008,.04,metal,g,-.59+c*.112,1.025,-.28+r*.08);
 cyl(.13,.13,.12,paper,g,.57,1.05,.22);
 box(.34,.04,.46,mat('#b19dc2'),g,.58,.97,-.36);
 const deskLight=group(null,g);cyl(.13,.15,.04,metal,deskLight,.73,1.01,-.48);
 cyl(.017,.017,.63,metal,deskLight,.73,1.34,-.48);
 const shade=cyl(.24,.12,.2,mat('#e3c7a2'),deskLight,.66,1.64,-.48);
 shade.rotation.z=-.38;
}
desk();

function books(){
 const g=group('books');g.position.set(-2.65,0,-3.61);
 box(1.58,3.05,.53,darkWood,g,0,1.52,0);
 box(1.39,2.78,.47,mat('#342821'),g,0,1.56,.045);
 for(let i=0;i<4;i++)box(1.52,.09,.53,wood,g,0,.45+i*.72,.04);
 let seed=19;const random=()=>{seed=(seed*16807)%2147483647;return (seed%1000)/1000};
 const palette=['#976756','#6b8491','#be9980','#638e7e','#ac6374','#d1ab6c'];
 for(let shelf=0;shelf<4;shelf++){
  let xx=-.62;
  while(xx<.58){
   const bw=.08+random()*.085,bh=.38+random()*.19;
   const material=mat(palette[Math.floor(random()*palette.length)]);
   box(bw,bh,.3,material,g,xx,shelf*.72+.57+bh/2,.06);
   box(.015,bh*.79,.304,paper,g,xx-bw/3,shelf*.72+.57+bh/2,.06);
   xx+=bw+.018;
  }
 }
}
books();
function sofa(){
 const g=group('sofa');g.position.set(4.42,0,2.82);g.rotation.y=-.72;
 const fabric=mat('#756d81',.96),cushion=mat('#928399');
 box(2.75,.38,1.15,fabric,g,0,.52,0);legs(g,0,.42,0,2.8,1.2,.37);
 box(2.76,.81,.29,fabric,g,0,.95,.49);
 for(const x of [-.88,0,.88])box(.8,.24,.92,cushion,g,x,.77,-.10);
 for(const x of [-1.30,1.30])box(.27,.63,1.2,fabric,g,x,.86,0);
 for(const x of [-.75,.75])sphere(.25,mat('#a77f79'),g,x,1.10,.12,1.25,1,.33);
}
sofa();
function coffee(){
 const g=group('table');g.position.set(2.33,0,2.87);
 box(1.77,.10,.95,wood,g,0,.64,0);legs(g,0,.63,0,1.7,.9,.60);
 box(.44,.05,.32,paper,g,-.38,.72,-.08);
 box(.46,.07,.35,maroon,g,-.34,.80,-.09);
 const flame=mat('#ffd16f',.21,0,{emissive:'#e89230',emissiveIntensity:.92});
 cyl(.09,.1,.14,mat('#eee0cc'),g,.53,.77,-.18);
 sphere(.065,flame,g,.53,.89,-.18,.65,1.35,.65);
 const mobile=group('phone',g);
 mobile.position.set(.13,.727,.24);mobile.rotation.y=.36;
 const phoneCase=box(.33,.023,.58,mat('#223343',.33,.35),mobile,0,0,0);
 box(.29,.006,.51,mat('#284c66',.23,.25,{emissive:'#173953',emissiveIntensity:.35}),mobile,0,.016,0);
 cyl(.021,.021,.003,metal,mobile,0,.021,-.22,9);
}
coffee();

function fridge(){
 const g=group('fridge');g.position.set(-5.13,0,2.85);g.rotation.y=.05;
 const m=mat('#c8cbc3',.41,.27);
 box(.84,2.0,.83,m,g,0,1,0);
 box(.76,.035,.84,metal,g,0,1.05,.0);
 box(.025,.52,.025,metal,g,.34,1.58,.46);
 box(.025,.38,.025,metal,g,.34,.67,.46);
}
fridge();
function sink(){
 const g=group('sink');g.position.set(-3.50,0,3.52);
 box(2.35,.84,.86,mat('#c8b6a4'),g,0,.43,0);
 box(2.44,.10,.96,mat('#e3ded7',.19),g,0,.88,0);
 box(.82,.025,.57,metal,g,.10,.932,0);
 box(.67,.028,.43,mat('#37464c',.28,.3),g,.10,.941,0);
 line([[.30,.95,-.10],[.30,1.24,-.10],[.15,1.32,-.11],[.15,1.17,-.11]],metal,g);
}
sink();
function shower(){
 const g=group('shower');g.position.set(.38,0,-3.35);
 const tile=mat('#9dadae',.87);
 box(1.38,.13,1.31,tile,g,0,.08,0);
 box(.06,2.34,1.31,glass,g,-.67,1.24,0);
 box(1.37,2.34,.06,glass,g,0,1.24,.63);
 for(const x of [-.69,.69])cyl(.027,.027,2.27,metal,g,x,1.19,.62);
 for(const z of [-.65,.65])cyl(.025,.025,2.32,metal,g,-.68,1.22,z);
 cyl(.026,.026,2.07,metal,g,.36,1.28,-.54);
 const head=cyl(.15,.15,.055,metal,g,.36,2.19,-.54);head.rotation.z=Math.PI/2;
 const tap=box(.39,.07,.09,metal,g,.25,1.09,-.57);
 for(let i=0;i<11;i++){
  const droplet=sphere(.012,mat('#b8e0ef',.12,.15,{transparent:true,opacity:.37}),g,
   .19+(i%4)*.08,1.9-(i%3)*.25,-.55+(i%2)*.05,.65,1.8,.65);
  droplet.castShadow=false;
 }
}
shower();
function toilet(){
 const g=group('toilet');g.position.set(1.34,0,-3.55);g.rotation.y=.1;
 const china=mat('#e4e9e7',.18,.08);
 box(.43,.64,.31,china,g,0,.71,-.16);
 cyl(.30,.26,.42,china,g,0,.37,.31);
 const seat=cyl(.32,.30,.055,china,g,0,.61,.31);
 const water=cyl(.20,.21,.011,mat('#91c6d0',.16),g,0,.65,.31);
}
toilet();
function litter(){
 const g=group('catLitter');g.position.set(4.65,.0,1.33);
 box(.72,.23,.55,mat('#5d7890'),g,0,.12,0);
 box(.61,.034,.45,mat('#b5a392'),g,0,.25,0);
 for(let i=0;i<8;i++)sphere(.024,mat('#7f7468'),g,(i%4-.5)*.14,.277,Math.floor(i/4)*.15-.07);
}
litter();

function plants(){
 function plant(x,z,height=.8){
  const g=group(null,room);g.position.set(x,0,z);
  cyl(.32,.25,.43,mat('#9d6550'),g,0,.22,0);
  cyl(.27,.25,.04,mat('#664a3a'),g,0,.44,0);
  const leaf=mat('#47825e'),leaf2=mat('#5b9b70');
  for(let j=0;j<9;j++){
   const angle=j*Math.PI*2/9,tilt=.36+(j%3)*.12;
   const x1=Math.cos(angle)*.50,z1=Math.sin(angle)*.5;
   line([[0,.46,0],[x1*.45,.62, z1*.45],[x1,.48+height*.58,z1]],mat('#496f43'),g);
   const l=sphere(.28,j%2?leaf:leaf2,g,x1,.48+height*.58,z1,1.35,.18,.45);
   l.rotation.y=-angle;
  }
 }
 plant(-3.75,-2.62,1.1);plant(4.9,-3.68,.75);plant(.2,3.04,.82);
}
plants();

function avatar(){
 const g=group('sim');g.position.set(-1.35,0,.48);
 const pant=mat('#3f3739'),shirt=mat('#caa98d'),skin=mat('#c99177',.88),hair=mat('#4a2d29');
 for(const dx of [-.16,.16]){
  const leg=box(.29,.96,.33,pant,g,dx,.52,0);
  const shoe=sphere(.23,mat('#e9e9e4'),g,dx,.12,.08,1.05,.45,1.55);
 }
 const torso=mesh(new T.CylinderGeometry(.35,.28,.80,16),shirt,g);torso.position.y=1.44;
 const hips=mesh(new T.CylinderGeometry(.34,.32,.36,14),pant,g);hips.position.y=1.0;
 for(const dx of [-.39,.39]){
  const arm=cyl(.13,.11,.75,shirt,g,dx,1.43,0);arm.rotation.z=dx<0?.18:-.18;
  sphere(.113,skin,g,dx*1.11,.98,0,.92,1.05,.82);
 }
 cyl(.115,.115,.19,skin,g,0,1.90,0);
 const face=sphere(.34,skin,g,0,2.28,0,.87,1.18,.85);
 sphere(.335,hair,g,0,2.54,-.06,.93,.60,.96);
 sphere(.25,hair,g,-.09,2.80,-.07,1.1,1.05,1.1);
 for(const dx of [-.15,.15]){
  const eye=sphere(.027,mat('#26232a',.25),g,dx,2.32,.285);
  const ring=mesh(new T.TorusGeometry(.112,.012,7,14),metal,g);ring.position.set(dx,2.34,.29);
 }
 line([[-.035,2.35,.305],[.035,2.35,.305]],metal,g);
 sphere(.028,mat('#a86763'),g,0,2.14,.285,1.4,.42,.5);
 const gem=group('resource',g);gem.position.set(0,3.10,0);
 const gemMat=mat('#4edbb4',.18,.23,{emissive:'#216f7d',emissiveIntensity:.34});
 const top=cyl(.0,.18,.35,gemMat,gem,0,.18,0,4);
 const bottom=cyl(.18,.0,.44,gemMat,gem,0,-.21,0,4);
 top.rotation.y=Math.PI/4;bottom.rotation.y=Math.PI/4;
 gem.userData.gemMat=gemMat;
 shapes.set('gem',gem);shapes.set('gemMaterial',gemMat);
}
avatar();

const clutter=[];
function trash(name,kind,level,x,z){
 const g=group('clutter');g.userData.messId=name;g.userData.minEntropy=level;g.position.set(x,.10,z);
 const m=mat(kind==='paper'?'#e9ded0':kind==='cloth'?'#7e5566':'#a9d6e0',.8);
 if(kind==='paper'){const o=box(.46,.018,.32,m,g,0,0,0);o.rotation.y=.35;}
 else if(kind==='cloth'){const o=sphere(.20,m,g,0,.06,0,1.65,.30,1.0);}
 else{const o=cyl(.11,.11,.32,m,g,0,.11,0);o.rotation.z=.97;}
 clutter.push(g);
}
trash('clutter0','paper',22,.4,2.24);
trash('clutter1','cloth',35,-2.1,2.2);
trash('clutter2','paper',43,1.55,2.4);
trash('clutter3','cloth',55,3.1,1.92);
trash('clutter4','cloth',63,3.82,3.75);
trash('clutter5','bottle',74,-.90,2.7);
trash('clutter6','bottle',85,4.24,.42);

const ray=new T.Raycaster(),pointer=new T.Vector2();
let down=null,dragged=false,active=true;
function applySize(){
 const w=host.clientWidth||375,h=host.clientHeight||520;
 renderer.setSize(w,h,false);
 const aspect=w/h,half=5.10/zoom;
 camera.left=-half*aspect;camera.right=half*aspect;
 camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
}
const resize=new ResizeObserver(applySize);
const wrap=document.createElement('div');wrap.id='life3dControls';
const rotateBtn=document.createElement('button');rotateBtn.type='button';rotateBtn.textContent='↻ Повернуть 3D';rotateBtn.setAttribute('aria-label','Повернуть 3D-комнату');
rotateBtn.onclick=()=>{azimuth+=.36;cameraPlace()};
wrap.append(rotateBtn);
const hint=document.createElement('span');hint.textContent='Нажми на предмет · проведи вбок, чтобы повернуть';
wrap.append(hint);
function positionForHit(e){
 const r=renderer.domElement.getBoundingClientRect();
 pointer.x=((e.clientX-r.left)/r.width)*2-1;
 pointer.y=-((e.clientY-r.top)/r.height)*2+1;
 ray.setFromCamera(pointer,camera);
 const hits=ray.intersectObjects(world.children,true);
 for(const hit of hits){
  let cur=hit.object;
  while(cur&&cur!==world){
   if(cur.userData.action)return {object:cur.userData.action,part:cur};
   cur=cur.parent;
  }
 }
 return null;
}
function onPick(e){
 const hit=positionForHit(e);if(!hit)return;
 const {object,part}=hit;
 const anchor={dataset:{messId:part.userData.messId||''},
  getBoundingClientRect:()=>({left:e.clientX-10,right:e.clientX+10,top:e.clientY-10,bottom:e.clientY+10,height:20})};
 if(object==='resource')bridge.openCrystal();
 else bridge.openAction(object,anchor);
}
can.addEventListener('pointerdown',e=>{
 down={x:e.clientX,y:e.clientY,azimuth,at:performance.now()};
 dragged=false;
});
can.addEventListener('pointermove',e=>{
 if(!down)return;
 const dx=e.clientX-down.x,dy=e.clientY-down.y;
 if(Math.abs(dx)>7&&Math.abs(dx)>Math.abs(dy)*1.1){
  dragged=true;azimuth=down.azimuth+dx*.007;cameraPlace();
 }
});
can.addEventListener('pointerup',e=>{
 if(down&&!dragged&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<12)onPick(e);
 down=null;dragged=false;
});
can.addEventListener('pointercancel',()=>{down=null;dragged=false});
can.addEventListener('keydown',e=>{
 if(e.key==='ArrowLeft'){azimuth-=.19;cameraPlace();e.preventDefault()}
 if(e.key==='ArrowRight'){azimuth+=.19;cameraPlace();e.preventDefault()}
 if(e.key==='Enter'||e.key===' '){
  const r=can.getBoundingClientRect();onPick({clientX:r.left+r.width/2,clientY:r.top+r.height/2});
  e.preventDefault();
 }
});
can.addEventListener('webglcontextlost',e=>{
 e.preventDefault();active=false;host.classList.remove('scene3d-active');
 console.warn('3D context lost, original illustration restored');
});
can.addEventListener('webglcontextrestored',()=>{active=true;host.classList.add('scene3d-active')});
let lastTick=0;
function animate(time){
 requestAnimationFrame(animate);
 if(!active||document.hidden)return;
 if(time-lastTick<25)return;lastTick=time;
 const gem=shapes.get('gem');
 if(gem){gem.position.y=3.10+Math.sin(time*.0017)*.095;gem.rotation.y=time*.0005}
 renderer.render(world,camera);
}
function sync(snapshot){
 if(!snapshot)return;
 const made=!!snapshot.bedMade;
 shapes.get('bedMade').visible=made;
 shapes.get('bedUnmade').visible=!made;
 const n=Number(snapshot.resource);
 const color=!Number.isFinite(n)?'#62b8e2':n>=66?'#4de6ad':n>=36?'#e3bc50':'#e46b83';
 const gem=shapes.get('gemMaterial');gem.color.set(color);gem.emissive.set(color);
 gem.emissiveIntensity=.32;
 const disorder=Number(snapshot.entropy)||0;
 for(const o of clutter){
  const cleaned=snapshot.cleanedItems?.[o.userData.messId]===snapshot.today;
  o.visible=disorder>=o.userData.minEntropy&&!cleaned;
 }
 const hh=new Date().getHours();
 const night=hh<7||hh>19;
 sun.intensity=night?1.0:3.1;
 ambient.intensity=night?1.55:2.25;
 lamp.intensity=night?22:12;
 world.background.set(night?'#121b31':'#253751');
 const sky=shapes.get('sky');sky.color.set(night?'#2d3957':'#638bb5');
}
window.LifeSims3D={sync,rotate:()=>{azimuth+=.3;cameraPlace()},isReal3D:true};
host.append(can,wrap);
applySize();resize.observe(host);
sync(bridge.snapshot());
host.classList.add('scene3d-active');
requestAnimationFrame(animate);
