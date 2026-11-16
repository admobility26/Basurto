import {normalizeTopics} from './course-format.mjs';
export function courseChunks(pages){
 const chunks=[];let text='',start=1,end=1;
 const flush=()=>{if(text){chunks.push({text,start,end});text=''}};
 for(let i=0;i<pages.length;i++){
  const source=pages[i].text.trim();if(source.length<30)throw Error(`La página ${i+1} no tiene texto legible. Este PDF necesita reconocimiento de texto (OCR) antes de generar el curso.`);
  // Split long pages without dropping text; retain the physical PDF page number.
  for(let offset=0;offset<source.length;offset+=5000){const part=`\n[PÁGINA ${i+1}]\n${source.slice(offset,offset+5000)}\n`;if(text.length+part.length>6000)flush();if(!text)start=i+1;end=i+1;text+=part;}
 }
 flush();return chunks;
}
export function validateGenerated(result,chunk){
 if(!Array.isArray(result?.topics)||!result.topics.length||result.topics.length>4)throw Error('La IA no ha generado temas válidos. Puedes reintentar este bloque.');
 return result.topics.map(t=>{
  for(const field of ['chapter','title','summary'])if(typeof t[field]!=='string'||!t[field].trim()||t[field].length>(field==='summary'?2500:160))throw Error('La IA devolvió un tema incompleto. Reintenta este bloque.');
  if(!Number.isInteger(t.page)||!Number.isInteger(t.endPage)||t.page<chunk.start||t.endPage>chunk.end||t.endPage<t.page)throw Error('La IA no ha respetado las páginas del PDF. Reintenta este bloque.');
  if(!Array.isArray(t.keyPoints)||!t.keyPoints.length||t.keyPoints.length>8||t.keyPoints.some(p=>typeof p!=='string'||!p.trim()||p.length>600))throw Error('Los puntos clave generados no son válidos. Reintenta este bloque.');
  return {id:crypto.randomUUID(),chapter:t.chapter.trim(),title:t.title.trim(),page:t.page,endPage:t.endPage,summary:t.summary.trim(),keyPoints:t.keyPoints.map(p=>p.trim())};
 });
}
export function validatePackage(c){
 if(c?.format!=='basurto-course'||c.version!==1||typeof c.title!=='string'||!c.title.trim()||c.title.length>160||typeof c.pdf!=='string'||c.pdf.length>35*1024*1024||!/^JVBERi0[A-Za-z0-9+/=\r\n]*$/.test(c.pdf)||!Array.isArray(c.topics)||!c.topics.length||c.topics.length>200)throw Error('El paquete de curso no es válido.');
 const topics=normalizeTopics(c.topics,{published:true});return {id:crypto.randomUUID(),title:c.title,filename:'manual.pdf',pdf:c.pdf,topics,completed:true,blocks:[],next:0};
}
export function portableCourse(c){if(!c.completed)throw Error('Termina de generar el curso antes de exportarlo.');return {format:'basurto-course',version:1,title:c.title,pdf:c.pdf,topics:c.topics};}
