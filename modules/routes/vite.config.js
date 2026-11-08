import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({root:resolve('modules/routes'),base:'/routes/',plugins:[react()],build:{outDir:resolve('static/routes'),emptyOutDir:true,chunkSizeWarningLimit:1600}});
