import {cp,mkdir} from 'node:fs/promises';
const dest='static/vendor/pdfjs';await mkdir(dest,{recursive:true});
for(const file of ['build/pdf.mjs','build/pdf.worker.mjs','build/pdf.renderer.mjs','cmaps','standard_fonts','wasm','LICENSE'])await cp('node_modules/pdfjs-dist/'+file,dest+'/'+file,{recursive:true});
