// One clock shared by track, telemetry, video and incident placement.
export function timeline(points) {
 const timed=points.length>1&&points.at(-1).time>points[0].time&&points.every((p,i)=>Number.isFinite(p.time)&&(!i||p.time>=points[i-1].time));
 return {timed,start:timed?points[0].time:null,end:timed?points.at(-1).time:null,duration:timed?(points.at(-1).time-points[0].time)/1000:Math.max(1,points.length-1)};
}
export function pointAt(points,fraction,clock=timeline(points)) {
 if(!points.length)return {index:-1,point:null,time:null};
 const f=Math.max(0,Math.min(1,fraction));
 if(!clock.timed){const index=Math.round(f*(points.length-1));return {index,point:points[index],time:points[index].time};}
 const time=clock.start+f*(clock.end-clock.start);let lo=0,hi=points.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(points[mid].time<=time)lo=mid;else hi=mid-1;}
 const a=points[lo],b=points[lo+1];
 // Interpolate only within one continuous segment; never bridge a BLE gap.
 if(b&&a.segment===b.segment&&b.time>a.time){const f=(time-a.time)/(b.time-a.time);return {index:lo,point:{...a,time,...(Number.isFinite(a.sourceTime)&&Number.isFinite(b.sourceTime)?{sourceTime:a.sourceTime+(b.sourceTime-a.sourceTime)*f}:{}),coordinates:a.coordinates.map((v,i)=>v+(b.coordinates[i]-v)*f)},time};}
 return {index:lo,point:a,time,gap:!!b&&time>a.time&&a.segment!==b.segment};
}
export function pointFraction(points,index,c=timeline(points)) {return c.timed?(points[index].time-c.start)/(c.end-c.start):index/Math.max(1,points.length-1);}
export function speedAt(points,index) {
 const p=points[index];if(!p)return {value:null,estimated:false};if(Number.isFinite(p.speed))return {value:p.speed,estimated:false};
 const a=points[index-1],b=p;if(!a||a.segment!==b.segment||!Number.isFinite(a.time)||!Number.isFinite(b.time)||b.time<=a.time||b.time-a.time>10000)return {value:null,estimated:true};
 const rad=x=>x*Math.PI/180,dlat=rad(b.coordinates[1]-a.coordinates[1]),dlon=rad(b.coordinates[0]-a.coordinates[0]);const h=Math.sin(dlat/2)**2+Math.cos(rad(a.coordinates[1]))*Math.cos(rad(b.coordinates[1]))*Math.sin(dlon/2)**2;
 return {value:6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))/(b.time-a.time)*3600,estimated:true};
}
