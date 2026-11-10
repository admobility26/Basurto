import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parse} from '@babel/parser';
import {gpsOptions,gpsHud,normalizeGpsFields,readGpsFields,gpsStorageKey} from '../modules/routes/src/premium/movieGps.js';
import {drawMovie} from '../modules/routes/src/premium/finalMovie.js';
const review={points:[{coordinates:[-2.9,43.2],time:1000,segment:0,speed:42,gForce:{x:.2,y:.3,z:1},rotation:{z:2},heading:90,battery:80,accuracy:1},{coordinates:[-2.899,43.201],time:3000,segment:0,speed:48}],calibration:{x:.1,y:.1,z:1}};
assert.equal(gpsHud(review,0,'es'),'42.0 km/h');
assert.equal(gpsHud(review,0,'es',{}),'');
assert.equal(gpsHud(review,0,'es',{battery:true}),'Batería 80%');
assert.equal(gpsHud(review,0,'eu',{heading:true}),'Norabidea 90°');
assert.equal(gpsHud(review,0,'es',{x:true}),'X 0.100 g');
const all=Object.fromEntries(gpsOptions.map(([key])=>[key,true]));
assert.equal(gpsHud(review,0,'es',all).split('\n').length,9);
const gap={...review,points:[review.points[0],{...review.points[1],segment:1}]};
assert.equal(gpsHud(gap,1,'es'),'— km/h');
assert.deepEqual(normalizeGpsFields(null),{speed:true});
assert.equal(normalizeGpsFields({speed:false,battery:true}).speed,false);
const previous=globalThis.localStorage;
try{
 let value=null;globalThis.localStorage={getItem:key=>{assert.equal(key,gpsStorageKey);return value;}};
 assert.deepEqual(readGpsFields(),{speed:true});
 value='{}';assert(!readGpsFields().speed,'Hide all must survive reload');
 value='{"speed":false,"accuracy":true}';assert(readGpsFields().accuracy);assert(!readGpsFields().speed);
 value='invalid';assert.deepEqual(readGpsFields(),{speed:true});
}finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;}
function render(hud){
 const boxes=[],texts=[],ctx={canvas:{width:800,height:450},fillRect(...args){boxes.push({color:this.fillStyle,args});},fillText(text){texts.push(text);},measureText(text){return {width:text.length*7};}};
 for(const key of ['drawImage','strokeRect','save','beginPath','rect','clip','translate','restore'])ctx[key]=()=>{};
 const rect={left:0,top:0,width:800,height:450};
 drawMovie(ctx,{width:320,height:180},[],0,{mapCanvas:{getBoundingClientRect:()=>rect},stageRect:()=>rect,pipRect:()=>({...rect,width:320,height:180}),hud:()=>hud,hudRect:()=>({left:600,top:20,width:200,height:260})});
 return {hud:boxes.filter(b=>b.color==='#172c25ed'),texts};
}
assert.equal(render('').hud.length,0);
const speed=render(gpsHud(review,0,'es')),full=render(gpsHud(review,0,'es',all));
assert(speed.texts.includes('42.0 km/h'));
assert(!speed.texts.some(s=>s.includes('Batería')));
assert(speed.hud[0].args[2]<full.hud[0].args[2]);
assert(speed.hud[0].args[3]<full.hud[0].args[3]);
const source=await fs.readFile(new URL('../modules/routes/src/premium/ReviewStudio.jsx',import.meta.url),'utf8');
parse(source,{sourceType:'module',plugins:['jsx']});
assert(source.includes('hud:second=>gpsHud(review,second,language,gpsFields,clock)'),'Both export modes must receive the selected telemetry');
assert(source.indexOf('hud:second=>gpsHud')>source.indexOf("composition=await fastComposition"),'Fast composition must not overwrite the selection');
assert(source.includes('disabled={exporting}><legend>'));
console.log('PASS selectable GPS: defaults, subsets, calibration, gaps, EU/ES, saved preferences, compact/hidden canvas HUD and JSX export wiring.');
