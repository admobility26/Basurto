import {createCourseDraft} from './course-content.mjs';
export async function prepareCoursePdf(file,onProgress=()=>{},extractOnly=false){
 const pdfjs=await import('/vendor/pdfjs/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/build/pdf.worker.mjs';
 const loading=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,enableXfa:false,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'});const doc=await loading.promise;
 try{if(doc.numPages>1000)throw Error('La preparación automática admite hasta 1.000 páginas. Puedes crear los temas manualmente o dividir el PDF.');const pages=[],outline=[];
  async function walk(items,chapter=''){for(const item of items||[]){try{const dest=typeof item.dest==='string'?await doc.getDestination(item.dest):item.dest;if(dest?.length){const page=(typeof dest[0]==='number'?dest[0]:await doc.getPageIndex(dest[0]))+1;outline.push({title:item.title,chapter:chapter||item.title,page});}}catch{}await walk(item.items,chapter||item.title)}}
  await walk(await doc.getOutline());
  for(let i=1;i<=doc.numPages;i++){onProgress(`Leyendo página ${i} de ${doc.numPages}…`);const page=await doc.getPage(i),content=await page.getTextContent(),lines=[];let line='';for(const item of content.items){if(!('str'in item))continue;line+=(line?' ':'')+item.str;if(item.hasEOL){lines.push({text:line});line='';}}if(line)lines.push({text:line});const text=lines.map(l=>l.text).join('\n');if(extractOnly&&text.length>60000)throw Error(`La página ${i} contiene demasiado texto. Divide el documento para generar el curso sin perder contenido.`);pages.push({lines,text:text.slice(0,60000)});page.cleanup();await new Promise(resolve=>setTimeout(resolve,0));}
  if(extractOnly)return {pages,outline};
  const topics=createCourseDraft(pages,outline),scanned=pages.filter(p=>p.text.trim().length<30).length;
  return {topics,pageCount:doc.numPages,note:`${outline.length?'Índice obtenido de los marcadores del PDF.':'Índice propuesto a partir del texto; revisa los capítulos y sus páginas.'} Resúmenes y puntos clave extraídos del documento: revisa y adapta el borrador antes de publicarlo.${scanned?' '+scanned+' páginas tienen poco texto o son imágenes; completa esos temas manualmente.':''}`};
 }finally{await loading.destroy()}
}
