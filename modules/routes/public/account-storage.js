// Synchronous application facade backed by the unlocked in-memory encrypted vault.
window.installRutasAccount=function(user,vault=window.parent!==window?window.parent.rutasVault:window.rutasVault){
 if(window.rutasAccount)return;
 if(!vault||vault.userId!==user.id)throw Error('Desbloquea los datos privados de esta cuenta.');
 window.rutasAccount=user;window.rutasVault=vault;window.rutasReload=async()=>{await vault.flush();location.reload();};
 const nativeLocal=window.localStorage,legacyOwner=nativeLocal.getItem('basurto-routes-legacy-owner');
 window.rutasLegacyAvailable=user.role==='admin'&&!legacyOwner&&Object.keys(nativeLocal).some(k=>k.startsWith('basurto-routes-')&&!k.startsWith('basurto-routes-account:'));
 window.claimRutasLegacy=()=>vault.claimLegacy();
 const facades=new WeakMap();
 const maps={local:vault.local,session:vault.session};
 for(const method of ['getItem','setItem','removeItem','key','clear']){
  const original=Storage.prototype[method];Storage.prototype[method]=function(...args){
   const kind=facades.get(this);if(!kind)return original.apply(this,args);const map=maps[kind];
   if(method==='getItem')return map.get(String(args[0]))??null;
   if(method==='setItem')return vault.setItem(kind,...args);
   if(method==='removeItem')return vault.removeItem(kind,...args);
   if(method==='key')return [...map.keys()][Number(args[0])]??null;
   for(const key of [...map.keys()])vault.removeItem(kind,key);
  };
 }
 function scoped(kind){const map=maps[kind],proxy=new Proxy({}, {
  get(_target,key){if(key==='length')return map.size;if(['getItem','setItem','removeItem','key','clear'].includes(key))return Storage.prototype[key];if(typeof key==='symbol')return undefined;return map.get(String(key));},
  set(_target,key,value){Storage.prototype.setItem.call(proxy,key,value);return true;},deleteProperty(_target,key){Storage.prototype.removeItem.call(proxy,key);return true;},ownKeys(){return [...map.keys()];},getOwnPropertyDescriptor(_target,key){if(map.has(key))return {configurable:true,enumerable:true,writable:true,value:map.get(key)};}
 });facades.set(proxy,kind);return proxy;}
 Object.defineProperty(window,'localStorage',{value:scoped('local'),configurable:true});Object.defineProperty(window,'sessionStorage',{value:scoped('session'),configurable:true});
};
