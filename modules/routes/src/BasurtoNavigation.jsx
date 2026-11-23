import React from 'react';
export default function BasurtoNavigation({section}){
 const select=next=>window.dispatchEvent(new CustomEvent('basurto-routes:navigate',{detail:next}));
 return <div className="basurto-navigation"><img src="/logo.png" alt="Autoescuela Basurto"/><nav aria-label="Recorridos"><button aria-pressed={section==='videos'} onClick={()=>select('videos')}>Vídeos</button><button aria-pressed={section==='editor'} onClick={()=>select('editor')}>Trazada y pizarra</button>{window.basurtoCanCreateVideos&&<button aria-pressed={section==='gpx'} onClick={()=>select('gpx')}>GPX + vídeo</button>}</nav><div className="basurto-navigation-account"><button onClick={()=>select('formation')}>Volver a Formación</button>{window.basurtoNativeMaterials&&<button onClick={()=>select('lock')}>Bloquear</button>}</div></div>
}
