// Data-only course format: never execute HTML, JavaScript or imported expressions.
export function normalizeTopics(items,{published=false}={}){
 if(!Array.isArray(items)||!items.length||items.length>200)throw Error('El curso necesita entre 1 y 200 temas');const ids=new Set();
 const string=(v,max,required=false)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())throw Error('Texto del curso no válido');return v.trim()};
 return items.map(d=>{
  const id=string(d.id,80,true);if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id))throw Error('Identificador de tema inválido o repetido');ids.add(id);
  if(!Number.isInteger(d.page)||!Number.isInteger(d.endPage)||d.page<1||d.endPage<d.page||d.endPage>5000)throw Error('Revisa las páginas del tema');
  if(!Array.isArray(d.keyPoints)||d.keyPoints.length>8)throw Error('Revisa los puntos clave');const keyPoints=d.keyPoints.map(p=>string(p,600,true)),summary=string(d.summary??'',2500),available=d.available!==false;
  if(published&&available&&(!summary||!keyPoints.length))throw Error('Completa el resumen y al menos un punto clave de cada tema antes de publicar');
  const quiz=(d.quiz??[]);if(!Array.isArray(quiz)||quiz.length>20)throw Error('Test no válido');
  const out={id,chapter:string(d.chapter,160,true),title:string(d.title,160,true),page:d.page,endPage:d.endPage,summary,keyPoints};
  if(d.available!==undefined)out.available=available;
  if(d.number!==undefined)out.number=string(d.number,30);
  if(d.printedPage!==undefined){if(!Number.isInteger(d.printedPage)||d.printedPage<1||d.printedPage>5000)throw Error('Página impresa no válida');out.printedPage=d.printedPage}
  if(d.chapterDescription!==undefined)out.chapterDescription=string(d.chapterDescription,1000);
  if(quiz.length)out.quiz=quiz.map(q=>{if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length)throw Error('Respuestas del test no válidas');return {question:string(q.question,600,true),options:q.options.map(o=>string(o,600,true)),answer:q.answer,explanation:string(q.explanation??'',1500)}});
  return out;
 });
}
