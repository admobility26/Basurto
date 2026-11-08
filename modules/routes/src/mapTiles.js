// SPDX-FileCopyrightText: 2026 Aitor Delgado Martínez · AD Mobility
// SPDX-License-Identifier: LicenseRef-RutasAD-Educational-NonCommercial-1.0
const geoBase='https://www.geo.euskadi.eus/geoeuskadi/rest/services/U11/WMTS_ORTO/MapServer/WMTS/tile/1.0.0/U11_WMTS_ORTO/default/GoogleMapsCompatible';
export const rasterTileUrl=(provider,z,x,y)=>{
 const native=typeof window!=='undefined'&&window.elorrietaDesktop&&location.protocol==='basurto-routes:';
 if(provider==='osm')return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
 if(provider==='pnoa')return native?`basurto-routes://app/__pnoa/tiles/${z}/${y}/${x}`:`https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=OI.OrthoimageCoverage&STYLE=default&FORMAT=image%2Fjpeg&TILEMATRIXSET=GoogleMapsCompatible&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`;
 return `${native?'basurto-routes://app/__geo/tiles':geoBase}/${z}/${y}/${x}`;
};
export const geoTileUrl=(z,x,y)=>rasterTileUrl('geoEuskadi',z,x,y);
export const rasterName=provider=>provider==='osm'?'OpenStreetMap':provider==='pnoa'?'PNOA · IGN':'geoEuskadi';
export const rasterLabel=provider=>provider==='osm'?'Mapa OpenStreetMap':`Ortofoto ${rasterName(provider)}`;
export const offlineAllowed=provider=>['geoEuskadi','pnoa'].includes(provider);
export const rasterAttribution=provider=>provider==='osm'?'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors · ODbL</a>':provider==='pnoa'?'PNOA · IGN / SCNE · <a href="https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf" target="_blank" rel="noopener">CC BY 4.0 scne.es</a>':'© <a href="https://www.geo.euskadi.eus/webgeo00-content/es/" target="_blank" rel="noopener">Eusko Jaurlaritza / Gobierno Vasco. geoEuskadi</a>';
export const rasterExportCredit=provider=>provider==='osm'?'© OpenStreetMap contributors · ODbL · https://www.openstreetmap.org/copyright':provider==='pnoa'?'Obra derivada de PNOA máxima actualidad · IGN / SCNE · CC BY 4.0 scne.es':'© Eusko Jaurlaritza / Gobierno Vasco. geoEuskadi · geo.euskadi.eus';
export function mapExportCredit(map){const source=map.getStyle()?.sources?.['basemap-source'],data=JSON.stringify(source||{});return rasterExportCredit(/openstreetmap/i.test(data)?'osm':/pnoa|ign\.es|SCNE/i.test(data)?'pnoa':'geoEuskadi')+' · Anotaciones didácticas añadidas';}

export const rasterCache=provider=>provider==='pnoa'?'ortofoto-pnoa-v1':'ortofoto-euskadi-v1';
export const rasterSource=provider=>({type:'raster',tiles:[provider==='osm'?rasterTileUrl(provider,'{z}','{x}','{y}'):rasterTileUrl(provider,'{z}','{x}','{y}').replace('https://','basurto-map://')],maxzoom:provider==='osm'?19:20,tileSize:256,attribution:rasterAttribution(provider)});
