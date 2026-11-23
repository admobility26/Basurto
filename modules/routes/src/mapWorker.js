import {setWorkerUrl} from 'maplibre-gl';
import workerSource from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';
// WKWebView cannot import a module worker through the app's custom URL scheme.
// Use the bundled source, never a remote script; one URL per document lifetime.
const workerUrl=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
setWorkerUrl(workerUrl);
