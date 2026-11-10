import {registerAutosave} from './autosave.js';
import {MAX_GPX_BYTES} from './gpxParser.js';
export function parseGpxFile(file){
 if(!file?.size)return Promise.reject(Error('Selecciona un GPX con contenido.'));
 if(file.size>MAX_GPX_BYTES)return Promise.reject(Error('El GPX supera 256 MB.'));
 return new Promise((resolve,reject)=>{const off=registerAutosave('gpx-file-import',{busy:()=>true,finish:()=>{throw Error('Espera a que termine de importar el GPX.')}});const worker=new Worker(new URL('./gpxWorker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{worker.terminate();off();data.error?reject(Error(data.error)):resolve(data.result)};worker.onerror=()=>{worker.terminate();off();reject(Error('No se pudo leer el GPX.'))};worker.postMessage(file)});
}
