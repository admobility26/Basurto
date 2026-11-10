use std::{collections::HashMap,fs::{File,OpenOptions},io::Write,path::PathBuf,sync::Mutex};
use tauri::{Manager,State};use serde_json::{Value,json};use base64::{Engine,engine::general_purpose::STANDARD};use rand::RngCore;
struct Pending{owner:String,file:File,partial:PathBuf,final_path:PathBuf,index:u64}
impl Drop for Pending{fn drop(&mut self){let _=std::fs::remove_file(&self.partial);}}
#[derive(Default)]pub struct MovieState(Mutex<HashMap<String,Pending>>);
fn authorized(user:&Value,owner:&str,unlocked:bool,now:u64)->bool{unlocked&&user["id"].as_str()==Some(owner)&&user["expires"].as_u64().unwrap_or(0)>now&&matches!(user["role"].as_str(),Some("admin"|"manager"))}
#[tauri::command]pub fn movie_request(app:tauri::AppHandle,input:Value,state:State<crate::AppState>,movies:State<MovieState>)->Result<Value,String>{
 let v=state.vault.lock().map_err(|_|"Error local")?;let user=v.contents.record.as_ref().and_then(|r|r.pointer("/state/user")).ok_or("Identifícate en Basurto")?;
 let owner=input["owner"].as_str().ok_or("Cuenta no válida")?;let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|"Reloj inválido")?.as_secs();
 if !authorized(user,owner,v.unlocked(),now){return Err("Solo administración y gerencia pueden exportar vídeos".into())}drop(v);
 let mut entries=movies.0.lock().map_err(|_|"Error local")?;
 match input["action"].as_str().unwrap_or(""){
 "begin"=>{
  if entries.values().any(|p|p.owner==owner){return Err("Ya hay un vídeo exportándose".into())}
  let root=app.path().download_dir().map_err(|_|"No se encuentra la carpeta Descargas")?.join("Basurto");std::fs::create_dir_all(&root).map_err(|_|"No se puede crear Descargas/Basurto")?;
  let mut bytes=[0u8;16];rand::thread_rng().fill_bytes(&mut bytes);let token=bytes.iter().map(|b|format!("{b:02x}")).collect::<String>();
  let stem=input["name"].as_str().unwrap_or("Basurto-recorrido").trim_end_matches(".mp4").chars().filter(|c|c.is_ascii_alphanumeric()||matches!(c,'-'|'_')).take(70).collect::<String>();
  let final_path=root.join(format!("{}-{}.mp4",if stem.is_empty(){"Basurto"}else{&stem},token));let partial=root.join(format!(".{token}.partial"));
  let mut options=OpenOptions::new();options.write(true).create_new(true);#[cfg(unix)]{use std::os::unix::fs::OpenOptionsExt;options.mode(0o600);}
  let file=options.open(&partial).map_err(|_|"No se puede guardar el vídeo")?;let name=final_path.to_string_lossy().to_string();entries.insert(token.clone(),Pending{owner:owner.into(),file,partial,final_path,index:0});Ok(json!({"token":token,"name":name}))
 },
 "append"=>{let token=input["token"].as_str().ok_or("Exportación inválida")?;let p=entries.get_mut(token).filter(|p|p.owner==owner).ok_or("Exportación cerrada")?;let data=input["data"].as_str().ok_or("Bloque inválido")?;if data.len()>1_400_000||input["index"].as_u64()!=Some(p.index){return Err("Bloque de vídeo fuera de orden".into())}let bytes=STANDARD.decode(data).map_err(|_|"Bloque inválido")?;if bytes.len()>1024*1024{return Err("Bloque demasiado grande".into())}p.file.write_all(&bytes).map_err(|_|"No queda espacio para guardar el vídeo")?;p.index+=1;Ok(json!(true))},
 "finish"|"abort"=>{let token=input["token"].as_str().ok_or("Exportación inválida")?;if !entries.get(token).is_some_and(|p|p.owner==owner){return Err("Exportación cerrada".into())}let p=entries.remove(token).unwrap();if input["action"]=="finish"{p.file.sync_all().map_err(|_|"No se pudo terminar de guardar")?;std::fs::rename(&p.partial,&p.final_path).map_err(|_|"No se pudo finalizar el vídeo")?;Ok(json!({"name":p.final_path.to_string_lossy()}))}else{Ok(json!(true))}},
 _=>Err("Operación de vídeo no válida".into())
 }
}

#[cfg(test)]mod tests{use super::*;
#[test]fn only_current_unlocked_office_account_can_export(){let mut user=json!({"id":"office","role":"admin","expires":200});assert!(authorized(&user,"office",true,100));assert!(!authorized(&user,"other",true,100));assert!(!authorized(&user,"office",false,100));assert!(!authorized(&user,"office",true,200));user["role"]=json!("teacher");assert!(!authorized(&user,"office",true,100));user["role"]=json!("manager");assert!(authorized(&user,"office",true,100));assert!(!authorized(&json!({}),"office",true,100));}
}
