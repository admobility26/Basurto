import {mapExportCredit} from './mapTiles.js';
// SPDX-FileCopyrightText: 2026 Aitor Delgado Martínez · AD Mobility
// SPDX-License-Identifier: LicenseRef-RutasAD-Educational-NonCommercial-1.0
import {vehicleSvg} from './boardModel.js';
let pdfPromise;
function pdfLibrary(){
 if(window.PDFLib)return Promise.resolve(window.PDFLib);
 if(!pdfPromise)pdfPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/routes/vendor/pdf-lib.min.js';script.onload=()=>window.PDFLib?resolve(window.PDFLib):reject(Error('No se pudo cargar el exportador PDF.'));script.onerror=()=>reject(Error('No se pudo cargar el exportador PDF.'));document.head.append(script);}).catch(e=>{pdfPromise=null;throw e;});
 return pdfPromise;
}
const imageCache=new Map();
const readImage=url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('No se pudo preparar un elemento de la pizarra.'));image.src=url;});
const loadImage=url=>{if(!imageCache.has(url)){if(imageCache.size>=128)imageCache.delete(imageCache.keys().next().value);imageCache.set(url,readImage(url).catch(e=>{imageCache.delete(url);throw e;}));}return imageCache.get(url);};
function textLines(ctx,text,width){
 const lines=[];for(const paragraph of String(text||'').split('\n')){let line='';for(const char of paragraph){if(ctx.measureText(line+char).width>width&&line){lines.push(line);line='';}line+=char;}lines.push(line);}return lines;
}
async function signal(ctx,item,kind,w,h,signalHtml){
 ctx.save();ctx.translate(w/2,h/2);const r=Math.min(w,h)*.44;ctx.lineWidth=5;ctx.strokeStyle='#c84236';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.max(12,r*.7)}px sans-serif`;
 if(kind==='traffic-light'){ctx.fillStyle='#263a30';ctx.beginPath();ctx.roundRect(-12,-38,24,76,7);ctx.fill();const phase=item.phase||'red';['#ed5347','#efba3e','#48b579'].forEach((color,n)=>{ctx.fillStyle=(phase==='red'&&n===0)||(phase==='green'&&n===2)||(['amber','blink'].includes(phase)&&n===1)?color:'#526055';ctx.beginPath();ctx.arc(0,-25+n*25,8,0,Math.PI*2);ctx.fill();});}
 else if(kind==='direction'){ctx.fillStyle='#fff';ctx.strokeStyle='#193c30';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-w/2+1,-h/2+1,w-2,h-2,4);ctx.fill();ctx.stroke();const lines=(item.destinations||[]).filter(d=>d.text?.trim()).slice(0,6);ctx.font=`bold ${Math.max(8,Math.min(13,h/(lines.length+1)))}px sans-serif`;ctx.fillStyle='#193c30';lines.forEach((d,n)=>{const arrow={left:'←',right:'→',straight:'↑','up-right':'↗','down-right':'↘'}[d.arrow]||'→';ctx.fillText(`${d.text} ${arrow}`.slice(0,38),0,-h/2+(n+1)*h/(lines.length+1),w-12);});}
 else if(kind==='speed'){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#193c30';ctx.fillText(item.speed||'—',0,1);}
 else if(kind==='stop'){ctx.fillStyle='#c84236';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();for(let n=0;n<8;n++){const a=n*Math.PI/4+Math.PI/8,x=Math.cos(a)*r,y=Math.sin(a)*r;n?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.font=`bold ${r*.58}px sans-serif`;ctx.fillText('STOP',0,0);}
 else if(kind==='yield'||kind==='warning'){ctx.beginPath();if(kind==='yield'){ctx.moveTo(-r,-r*.7);ctx.lineTo(r,-r*.7);ctx.lineTo(0,r);}else{ctx.moveTo(0,-r);ctx.lineTo(r,r*.8);ctx.lineTo(-r,r*.8);}ctx.closePath();ctx.fill();ctx.stroke();if(kind==='warning'){ctx.fillStyle='#193c30';ctx.font=`bold ${r*.55}px sans-serif`;const div=document.createElement('div');div.innerHTML=signalHtml(item);const icon=div.querySelector('svg');if(icon){icon.setAttribute('xmlns','http://www.w3.org/2000/svg');const image=await loadImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(icon)));ctx.drawImage(image,-r*.6,-r*.45,r*1.2,r);}else ctx.fillText(item.signalCode,0,6);}}
 else{ctx.fillStyle='#286c9e';ctx.fillRect(-r,-r,r*2,r*2);ctx.fillStyle='#fff';ctx.font=`bold ${r*.5}px sans-serif`;const div=document.createElement('div');div.innerHTML=signalHtml(item);const icon=div.querySelector('svg');if(icon){icon.setAttribute('xmlns','http://www.w3.org/2000/svg');const image=await loadImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(icon)));ctx.drawImage(image,-r*.8,-r*.8,r*1.6,r*1.6);}else ctx.fillText(item.signalCode,0,0);}
 ctx.restore();
}
export async function renderBoardCanvas({map,items,markers,name,step,answerVisible,showSignals,signalDefinition,signalHtml,frame=false}){
 if(!map||(frame?!map.getLayer('board-lines'):!map.loaded()))throw Error('Espera a que termine de cargar el mapa antes de exportar.');
 if(!frame)await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const source=map.getCanvas(),rect=source.getBoundingClientRect(),scale=frame?Math.min(1,1280/rect.width,540/rect.height):Math.min(2,2400/rect.width),width=Math.round(rect.width*scale),height=Math.round(rect.height*scale);
 const notes=[step.question,answerVisible?step.answer:'',...items.filter(i=>i.type==='note').map(i=>`${i.title||''}: ${i.description||''}`)].filter(Boolean).join('\n');
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height+180;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,width,height);
 for(const item of items){if(item.points||(item.type==='signal'&&!showSignals))continue;const marker=markers.find(m=>m.boardItemId===item.id);if(!marker)continue;const p=map.project(marker.getLngLat()),element=marker.getElement(),bounds=element.getBoundingClientRect(),x=p.x*scale,y=p.y*scale;
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  if(item.type==='vehicle'){const rotation=element.querySelector('.board-vehicle-body')?.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1]||0;ctx.rotate(Number(rotation)*Math.PI/180);if(item.visibility){ctx.fillStyle='#f3b73e45';ctx.strokeStyle='#f3b73e';ctx.lineWidth=2;const a=(item.visibilityAngle||70)*Math.PI/360;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,140,-Math.PI/2-a,-Math.PI/2+a);ctx.closePath();ctx.fill();ctx.stroke();}const image=await loadImage('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(vehicleSvg(item)));ctx.drawImage(image,-item.size/2,-item.size*1.15/2,item.size,item.size*1.15);}
  else if(item.type==='signal'){ctx.translate(-bounds.width/2,-bounds.height/2);await signal(ctx,item,signalDefinition(item.signalCode).kind,bounds.width,bounds.height,signalHtml);}
  else{ctx.fillStyle='#c84236';ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',0,1);}ctx.restore();
 }
 ctx.fillStyle='#fff';ctx.fillRect(0,height,width,180);ctx.fillStyle='#193e31';ctx.font='bold 20px sans-serif';ctx.fillText(String(name).slice(0,100),18,height+28);ctx.font='13px sans-serif';
 // Allocate room for all notes instead of silently clipping an explanation.
 const lines=textLines(ctx,notes,width-36);const footerHeight=frame?180:Math.max(180,lines.length*20+92);
 let output=canvas;if(footerHeight>180){output=document.createElement('canvas');output.width=width;output.height=height+footerHeight;const c=output.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,width,output.height);c.drawImage(canvas,0,0);}
 const c=output.getContext('2d');c.fillStyle='#193e31';c.font='13px sans-serif';(frame?lines.slice(0,5):lines).forEach((line,n)=>c.fillText(line,18,height+56+n*20));const end=height+56+(frame?Math.min(5,lines.length):lines.length)*20;c.fillStyle='#536e60';c.font='11px sans-serif';const attribution=mapExportCredit(map);c.fillText('Basurto Recorridos · © Aitor Delgado Martínez · '+attribution,18,Math.max(end+20,output.height-18),width-36);
 return output;
}
export async function exportBoard(options){
 const {name,format}=options,output=await renderBoardCanvas(options);
 const png=await new Promise((resolve,reject)=>{try{output.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo crear la imagen.')),'image/png');}catch{reject(Error('El mapa no permite exportar esta imagen. Prueba con GeoEuskadi y espera a que cargue.'));}});
 let blob=png;if(format==='pdf'){const {PDFDocument}=await pdfLibrary(),pdf=await PDFDocument.create(),image=await pdf.embedPng(await png.arrayBuffer()),page=pdf.addPage([841.89,595.28]),ratio=Math.min((page.getWidth()-32)/image.width,(page.getHeight()-32)/image.height);page.drawImage(image,{x:(page.getWidth()-image.width*ratio)/2,y:(page.getHeight()-image.height*ratio)/2,width:image.width*ratio,height:image.height*ratio});blob=new Blob([await pdf.save()],{type:'application/pdf'});}
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,80)||'Basurto Recorridos-pizarra')+'.'+format;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
