export async function openMovieSink({suggestedName='Basurto Recorridos-mapa-pip.mp4'}={}){
 if(window.elorrietaDesktop?.beginMovie){const token=await window.elorrietaDesktop.beginMovie(suggestedName);if(!token)throw new DOMException('Cancelado','AbortError');return {name:token.name,write:async blob=>window.elorrietaDesktop.writeMovie(token.id,await blob.arrayBuffer()),close:()=>window.elorrietaDesktop.finishMovie(token.id),abort:()=>window.elorrietaDesktop.abortMovie(token.id)};}
 if(!window.showSaveFilePicker)return null;
 const h=await window.showSaveFilePicker({suggestedName,id:'basurto-routes-export',types:[{description:'Vídeo MP4',accept:{'video/mp4':['.mp4']}}]});const writable=await h.createWritable();return {name:h.name,handle:h,write:b=>writable.write(b),close:()=>writable.close(),abort:()=>writable.abort(),file:()=>h.getFile()};
}
