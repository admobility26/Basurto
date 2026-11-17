import {Unzip,UnzipInflate} from './vendor/fflate/fflate.mjs';
import {validateManifest,PACKAGE_LIMIT,FILE_LIMIT,FILE_COUNT,safePath} from './package-format.mjs';
const ignored=p=>p.split('/').some(s=>s==='__MACOSX'||s.startsWith('.'));
export async function preparePackage(input,progress=()=>{}){
 let files=[];
 if(input.length===1&&/\.zip$/i.test(input[0].name)){
  const zip=input[0];if(zip.size>100*1024*1024)throw Error('El ZIP puede ocupar hasta 100 MB');let total=0,count=0,failure,active=[];
  const unzip=new Unzip(file=>{if(file.name.endsWith('/')||ignored(file.name))return;safePath(file.name);if(++count>FILE_COUNT)throw Error('Demasiados archivos en el ZIP');let size=0,parts=[];active.push(file);file.ondata=(err,data,final)=>{if(err){failure=err;return}size+=data.length;total+=data.length;if(size>FILE_LIMIT||total>PACKAGE_LIMIT){failure=Error('Curso mayor de 150 MB o archivo mayor de 25 MB');file.terminate();return}parts.push(data);if(final){files.push({path:file.name,file:new File(parts,file.name.split('/').pop())});parts=[]}};file.start()});unzip.register(UnzipInflate);
  try{for(let offset=0;offset<zip.size;offset+=8192){unzip.push(new Uint8Array(await zip.slice(offset,offset+8192).arrayBuffer()),offset+8192>=zip.size);if(failure)throw failure;if(offset%1048576===0)progress('Descomprimiendo el curso…');}}catch(e){active.forEach(f=>f.terminate());throw e}
 }else files=Array.from(input).filter(f=>!ignored(f.webkitRelativePath||f.name)).map(file=>({path:file.webkitRelativePath||file.name,file}));
 // Accept ZIPs containing a single enclosing folder without changing inner paths.
 if(!files.some(f=>f.path==='index.html')){const first=files[0]?.path.split('/')[0],prefix=first+'/';if(files.length&&files.every(f=>f.path.startsWith(prefix))&&files.some(f=>f.path===prefix+'index.html'))files=files.map(f=>({...f,path:f.path.slice(prefix.length)}));}
 let i=0;const manifest=[];for(const f of files){if(f.file.size>FILE_LIMIT)throw Error('Un archivo supera 25 MB: '+f.path);progress(`Comprobando archivo ${++i} de ${files.length}…`);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await f.file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');manifest.push({path:f.path,size:f.file.size,hash})}const checked=validateManifest(manifest);return {...checked,entries:files};
}
export async function uploadPackage({files,title,action,upload,progress}){const prepared=await preparePackage(files,progress);const created=await action({action:'package_begin',title,files:prepared.files});try{let index=0;for(const entry of prepared.entries){progress(`Subiendo ${++index} de ${prepared.entries.length}: ${entry.path}`);await upload(created.id,entry.path,entry.file)}await action({action:'package_finish',id:created.id});return created;}catch(e){throw Error('La importación ha quedado incompleta. Puedes eliminarla y volver a importar. '+e.message)}}
