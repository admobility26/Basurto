'use strict';
window.AccessLinks={
 show(result,school,box){
  const url=new URL('/access.html','https://basurto.admobility26.workers.dev');
  url.hash=new URLSearchParams({school,token:result.token}).toString();
  box.replaceChildren();
  const note=document.createElement('p');note.textContent='Enlace para '+result.email+'. Caduca el '+new Date(result.expires*1000).toLocaleString()+' y solo se puede utilizar una vez. No se ha enviado ningún correo.';
  const label=document.createElement('label');label.textContent='Enlace privado · cópialo y compártelo solo con esa persona';
  const input=document.createElement('textarea');input.readOnly=true;input.value=url.href;input.setAttribute('aria-label','Enlace privado');label.append(input);
  const button=document.createElement('button');button.type='button';button.textContent='Seleccionar enlace';button.onclick=()=>{input.focus();input.select()};
  const help=document.createElement('p');help.textContent='La persona elige su contraseña en el navegador y después puede acceder en la web o en la aplicación instalada. No compartas tu contraseña ni la clave local del dispositivo.';
  box.append(note,label,button,help);
 }
};
