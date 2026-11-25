'use strict';
(async()=>{
 const params=new URLSearchParams(location.hash.slice(1)),school=params.get('school'),token=params.get('token');
 history.replaceState(null,'',location.pathname);
 const result=document.querySelector('#result'),form=document.querySelector('#accessForm');
 if(!/^[a-z0-9][a-z0-9-]{1,47}$/.test(school||'')||!/^[a-f0-9]{64}$/.test(token||'')){result.textContent='Abre el enlace completo que te ha facilitado administración.';return}
 try{const response=await fetch('/api/config?school='+encodeURIComponent(school));const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo comprobar el centro');document.querySelector('#schoolName').textContent=data.school.name;form.hidden=false;}
 catch(error){result.textContent=error.message;return}
 form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button'),password=form.elements.password.value,confirmation=form.elements.confirmation.value;if(password!==confirmation){result.textContent='Las contraseñas no coinciden.';return}button.disabled=true;result.textContent='Guardando…';try{const r=await fetch('/api/access-accept?school='+encodeURIComponent(school),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password,confirmation})});const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo configurar el acceso');form.reset();form.hidden=true;result.textContent='Contraseña guardada. Tu usuario es '+data.email+'. Entra con tu cuenta personal.';const next=document.querySelector('#continue');next.hidden=false;next.href='/?school='+encodeURIComponent(school);}catch(error){result.textContent=error.message;button.disabled=false}};
})();
