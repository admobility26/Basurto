mod vault;
use tauri::{Manager, State};
use std::{sync::Mutex, time::Duration};
use serde::{Deserialize, Serialize};
use base64::{Engine, engine::general_purpose::STANDARD};
use vault::Vault;
const SERVER:&str="https://basurto.admobility26.workers.dev";
struct AppState{vault:Mutex<Vault>,client:reqwest::Client}
#[tauri::command]fn vault_status(state:State<AppState>)->Result<serde_json::Value,String>{let v=state.vault.lock().map_err(|_|"Error local")?;Ok(serde_json::json!({"exists":v.path.exists(),"unlocked":v.unlocked()}))}
#[tauri::command]fn vault_unlock(passphrase:String,state:State<AppState>)->Result<(),String>{state.vault.lock().map_err(|_|"Error local")?.unlock(passphrase)}
#[tauri::command]fn vault_read(state:State<AppState>)->Result<Option<serde_json::Value>,String>{let v=state.vault.lock().map_err(|_|"Error local")?;if !v.unlocked(){return Err("Caja local bloqueada".into())}Ok(v.contents.record.clone())}
#[tauri::command]fn vault_write(record:Option<serde_json::Value>,state:State<AppState>)->Result<(),String>{let mut v=state.vault.lock().map_err(|_|"Error local")?;if !v.unlocked(){return Err("Caja local bloqueada".into())}let old=v.contents.record.clone();v.contents.record=record;if let Err(e)=v.save(){v.contents.record=old;return Err(e)}Ok(())}
#[tauri::command]fn vault_lock(state:State<AppState>)->Result<(),String>{state.vault.lock().map_err(|_|"Error local")?.lock();Ok(())}
#[derive(Deserialize)]struct ApiInput{path:String,method:String,body:Option<String>,headers:std::collections::HashMap<String,String>}
#[derive(Serialize)]struct ApiOutput{status:u16,body:String,headers:std::collections::HashMap<String,String>}
#[tauri::command]async fn api_request(input:ApiInput,state:State<'_,AppState>)->Result<ApiOutput,String>{
 let path=input.path.split('?').next().unwrap_or("");
 if !["/api/config","/api/login","/api/logout","/api/setup","/api/recover","/api/bootstrap","/api/action","/api/incidents","/api/training","/api/training/lesson","/api/training/presentation","/api/training/file","/api/training/action","/api/training/upload"].contains(&path)||input.path.contains('#')||!matches!(input.method.as_str(),"GET"|"POST"){return Err("Solicitud no permitida".into())}
 let cookie={let v=state.vault.lock().map_err(|_|"Error local")?;if !v.unlocked(){return Err("Caja local bloqueada".into())}v.contents.cookie.clone()};
 let mut request=state.client.request(reqwest::Method::from_bytes(input.method.as_bytes()).map_err(|_|"Método inválido")?,format!("{SERVER}{}",input.path)).header("Origin",SERVER);
 if !cookie.is_empty(){request=request.header("Cookie",cookie)}
 for (k,v) in input.headers {if ["content-type","x-csrf-token","x-file-name","range"].contains(&k.to_lowercase().as_str()){request=request.header(k,v)}}
 if let Some(body)=input.body {if body.len()>36*1024*1024{return Err("Archivo demasiado grande".into())}request=request.body(STANDARD.decode(body).map_err(|_|"Contenido inválido")?)}
 let mut response=request.send().await.map_err(|_|"No se puede conectar. Tus cambios locales se conservan.")?;let status=response.status().as_u16();let cookie=response.headers().get(reqwest::header::SET_COOKIE).and_then(|v|v.to_str().ok()).map(|v|v.split(';').next().unwrap_or("").to_string());
 let mut headers=std::collections::HashMap::new();for k in ["content-type","content-range","accept-ranges"]{if let Some(v)=response.headers().get(k).and_then(|v|v.to_str().ok()){headers.insert(k.to_string(),v.to_string());}}
 let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"Descarga interrumpida")?{if bytes.len()+chunk.len()>30*1024*1024{return Err("Respuesta demasiado grande".into())}bytes.extend_from_slice(&chunk);}
 if let Some(cookie)=cookie{let mut v=state.vault.lock().map_err(|_|"Error local")?;if !v.unlocked(){return Err("Caja local bloqueada".into())}v.contents.cookie=if cookie=="basurto="{String::new()}else{cookie};v.save()?;}
 Ok(ApiOutput{status,body:STANDARD.encode(bytes),headers})
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(){tauri::Builder::default().setup(|app|{let dir=app.path().app_data_dir()?;std::fs::create_dir_all(&dir)?;
 #[cfg(unix)]{use std::os::unix::fs::PermissionsExt;std::fs::set_permissions(&dir,std::fs::Permissions::from_mode(0o700))?;}
 app.manage(AppState{vault:Mutex::new(Vault::new(dir.join("basurto.vault"))),client:reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(90)).build()?});Ok(())})
 .invoke_handler(tauri::generate_handler![vault_status,vault_unlock,vault_read,vault_write,vault_lock,api_request])
 .run(tauri::generate_context!()).expect("No se pudo iniciar Basurto");}
