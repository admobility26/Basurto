// Render readable attribution in exported video; map UI attribution remains separate.
export function drawVideoCredits(ctx,text,width,height){
 ctx.save();const size=Math.max(11,Math.min(14,Math.round(width/100))),pad=8,max=width-40;ctx.font=`500 ${size}px sans-serif`;const lines=[];let line='';for(const word of text.split(' ')){if(line&&ctx.measureText(line+' '+word).width>max){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);const lineHeight=size+4,boxHeight=lines.length*lineHeight+2*pad;ctx.fillStyle='rgba(255,255,255,0.95)';ctx.fillRect(10,height-boxHeight-10,width-20,boxHeight);ctx.fillStyle='#263c31';lines.forEach((s,n)=>ctx.fillText(s,10+pad,height-boxHeight-10+pad+size+n*lineHeight,max));ctx.restore();
}
