const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
export function extractHighlights(text){const sentences=String(text||'').replace(/\r/g,'').split(/(?<=[.!?])\s+|\n+/).map(clean).filter(x=>x.length>=35&&x.length<=600);const unique=[...new Set(sentences)];return {summary:unique.slice(0,2).join(' ').slice(0,2500),keyPoints:unique.slice(2,7).length?unique.slice(2,7):unique.slice(0,2)};}
export function createCourseDraft(pages,outline=[]){
 let starts=outline.filter(x=>Number.isInteger(x.page)&&x.page>=1&&x.page<=pages.length&&clean(x.title)).sort((a,b)=>a.page-b.page);
 if(!starts.length)for(let i=0;i<pages.length;i++){const lines=pages[i].lines||[];const heading=lines.find(x=>/^(?:tema|cap[ií]tulo|unidad|\d{1,2}[.\s])\s*\S/i.test(x.text)&&x.text.length<150&&x.text.length>4&&!/\.{3,}/.test(x.text));if(heading)starts.push({page:i+1,title:clean(heading.text),chapter:clean(heading.text)});}
 if(!starts.length)for(let i=0;i<pages.length;i+=5)starts.push({page:i+1,title:`Páginas ${i+1}–${Math.min(i+5,pages.length)}`,chapter:'Temas por organizar'});
 starts=starts.filter((x,i,a)=>!i||x.page!==a[i-1].page||x.title!==a[i-1].title);
 if(starts.length>200)throw Error('Se han detectado más de 200 temas. Divide el manual en cursos más pequeños.');
 return starts.map((x,i)=>{const endPage=Math.max(x.page,(starts[i+1]?.page||pages.length+1)-1),text=pages.slice(x.page-1,endPage).map(p=>p.text).join('\n'),highlights=extractHighlights(text);return {id:crypto.randomUUID(),chapter:clean(x.chapter||x.title).slice(0,160),title:clean(x.title).slice(0,160),page:x.page,endPage,...highlights};});
}
