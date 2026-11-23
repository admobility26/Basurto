//! Restricted native tile transport, equivalent to the desktop adapter in Rutas.
use tauri::State;
use base64::{Engine,engine::general_purpose::STANDARD};
use serde_json::{Value,json};
fn allowed(raw:&str)->bool{
 let Ok(u)=reqwest::Url::parse(raw)else{return false};
 if u.scheme()!="https"||!u.username().is_empty()||u.password().is_some()||u.port().is_some()||u.fragment().is_some(){return false}
 match u.host_str(){
  Some("www.geo.euskadi.eus")=>u.path().starts_with("/geoeuskadi/rest/services/U11/WMTS_ORTO/MapServer/WMTS/tile/"),
  Some("www.ign.es")=>u.path()=="/wmts/pnoa-ma",
  Some("tile.openstreetmap.org")=>u.path().ends_with(".png")&&u.path().trim_start_matches('/').trim_end_matches(".png").split('/').count()==3&&u.path().trim_start_matches('/').trim_end_matches(".png").split('/').all(|n|n.parse::<u32>().is_ok()),
  _=>false,
 }
}
#[tauri::command]
pub async fn map_tile(url:String,state:State<'_,crate::AppState>)->Result<Value,String>{
 if !allowed(&url){return Err("Fuente de mapa no permitida".into())}
 {let v=state.vault.lock().map_err(|_|"Error local")?;if !v.unlocked(){return Err("Desbloquea Basurto".into())}}
 let mut response=state.client.get(url).timeout(std::time::Duration::from_secs(20)).send().await.map_err(|_|"No se pudo conectar con el proveedor del mapa")?;
 if !response.status().is_success(){return Err(format!("El proveedor del mapa respondió {}",response.status().as_u16()))}
 let mime=response.headers().get("content-type").and_then(|x|x.to_str().ok()).unwrap_or("").split(';').next().unwrap_or("").to_string();
 if !["image/jpeg","image/png","image/webp"].contains(&mime.as_str()){return Err("El proveedor no devolvió una imagen de mapa".into())}
 let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await.map_err(|_|"Descarga del mapa interrumpida")?{if bytes.len()+chunk.len()>5*1024*1024{return Err("Imagen de mapa demasiado grande".into())}bytes.extend_from_slice(&chunk)}
 Ok(json!({"mime":mime,"data":STANDARD.encode(bytes)}))
}
#[cfg(test)]mod tests{use super::*;#[test]fn restricted_tile_sources(){assert!(allowed("https://www.geo.euskadi.eus/geoeuskadi/rest/services/U11/WMTS_ORTO/MapServer/WMTS/tile/1/2/3"));assert!(allowed("https://www.ign.es/wmts/pnoa-ma?SERVICE=WMTS"));assert!(allowed("https://tile.openstreetmap.org/1/2/3.png"));for u in ["http://www.ign.es/wmts/pnoa-ma","https://example.com/tile.png","https://www.ign.es/private","https://user@www.ign.es/wmts/pnoa-ma","https://tile.openstreetmap.org/a/b/c.png","https://www.ign.es:8080/wmts/pnoa-ma"]{assert!(!allowed(u),"{u}")}}}
