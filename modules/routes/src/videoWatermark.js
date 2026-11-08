// Uses the same client identity asset as the app; baked into every exported frame.
let logoPromise;
export function loadVideoWatermark(){
 return logoPromise||=(new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth?resolve(image):reject(Error('Logo no válido para la marca de agua.'));image.onerror=()=>reject(Error('No se pudo cargar el logo para la marca de agua.'));image.src=new URL('/logo.png',document.baseURI).href;}).catch(error=>{logoPromise=null;throw error;}));
}
export function drawVideoWatermark(ctx,logo,width,height){
 const margin=Math.max(10,Math.round(width*.012)),w=Math.min(200,Math.max(110,width*.14),width*.3),h=w*logo.naturalHeight/logo.naturalWidth,pad=6;
 ctx.save();ctx.globalAlpha=.62;ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(margin,margin,w+pad*2,h+pad*2,6);ctx.fill();ctx.globalAlpha=.58;ctx.drawImage(logo,margin+pad,margin+pad,w,h);ctx.restore();
}
