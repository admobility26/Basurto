use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::{Aead, Payload}};
use argon2::{Argon2, Algorithm, Version, Params};
use rand::{RngCore, rngs::OsRng};
use serde::{Serialize, Deserialize};
use std::{fs, path::PathBuf};
use zeroize::{Zeroize, Zeroizing};
const AAD:&[u8]=b"Basurto/native-vault/v1";
#[derive(Default,Serialize,Deserialize,Clone)]
pub struct Contents {pub cookie:String,pub record:Option<serde_json::Value>}
pub struct Vault {pub path:PathBuf,key:Option<Zeroizing<[u8;32]>>,salt:[u8;16],pub contents:Contents}
impl Vault {
 pub fn new(path:PathBuf)->Self{Self{path,key:None,salt:[0;16],contents:Contents::default()}}
 pub fn unlocked(&self)->bool{self.key.is_some()}
 pub fn unlock(&mut self,mut pass:String)->Result<(),String>{
  if pass.len()<12||pass.len()>200{pass.zeroize();return Err("Usa una contraseña local de entre 12 y 200 caracteres".into())}
  let bytes=if self.path.exists(){Some(fs::read(&self.path).map_err(|_|"No se pudo leer la caja local")?)}else{None};
  if let Some(ref b)=bytes {if b.len()<48||&b[..4]!=b"BSV1"{return Err("La caja local no es válida. Conserva el archivo para recuperarlo.".into())} self.salt.copy_from_slice(&b[4..20]);}else{OsRng.fill_bytes(&mut self.salt);}
  let mut key=Zeroizing::new([0u8;32]);let params=Params::new(65536,3,1,Some(32)).map_err(|_|"Error de cifrado")?;
  let result=Argon2::new(Algorithm::Argon2id,Version::V0x13,params).hash_password_into(pass.as_bytes(),&self.salt,&mut *key);pass.zeroize();result.map_err(|_|"No se pudo derivar la clave")?;
  let contents=if let Some(b)=bytes {let c=Aes256Gcm::new_from_slice(&*key).map_err(|_|"Error de cifrado")?;let raw=Zeroizing::new(c.decrypt(Nonce::from_slice(&b[20..32]),Payload{msg:&b[32..],aad:AAD}).map_err(|_|"Contraseña local incorrecta o archivo dañado")?);serde_json::from_slice(&raw).map_err(|_|"La caja local no es válida")?}else{Contents::default()};
  self.key=Some(key);self.contents=contents;self.save()
 }
 pub fn save(&self)->Result<(),String>{let key=self.key.as_ref().ok_or("Desbloquea la caja local")?;let raw=Zeroizing::new(serde_json::to_vec(&self.contents).map_err(|_|"No se pudo guardar")?);let mut nonce=[0u8;12];OsRng.fill_bytes(&mut nonce);let c=Aes256Gcm::new_from_slice(&**key).map_err(|_|"Error de cifrado")?;let encrypted=c.encrypt(Nonce::from_slice(&nonce),Payload{msg:&raw,aad:AAD}).map_err(|_|"No se pudo cifrar")?;let mut out=b"BSV1".to_vec();out.extend(self.salt);out.extend(nonce);out.extend(encrypted);
  let temp=self.path.with_extension("tmp");let mut options=fs::OpenOptions::new();options.write(true).create(true).truncate(true);
  #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;options.mode(0o600);}
  use std::io::Write;let mut f=options.open(&temp).map_err(|_|"No se pudo guardar la caja cifrada")?;f.write_all(&out).and_then(|_|f.sync_all()).map_err(|_|"No se pudo guardar la caja cifrada")?;fs::rename(temp,&self.path).map_err(|_|"No se pudo finalizar el guardado")?;Ok(())
 }
 pub fn lock(&mut self){self.key=None;self.contents.cookie.zeroize();self.contents=Contents::default()}
}
#[cfg(test)]mod tests{use super::*;#[test]fn encrypted_restart_wrong_key_and_tamper(){let p=std::env::temp_dir().join(format!("basurto-{}.vault",rand::random::<u64>()));let mut v=Vault::new(p.clone());v.unlock("Local-test-passphrase-123".into()).unwrap();v.contents.cookie="secret-cookie".into();v.contents.record=Some(serde_json::json!({"pending":[{"note":"private-student"}]}));v.save().unwrap();let b=fs::read(&p).unwrap();assert!(!String::from_utf8_lossy(&b).contains("private-student"));let mut reopened=Vault::new(p.clone());assert!(reopened.unlock("wrong-passphrase-123".into()).is_err());reopened.unlock("Local-test-passphrase-123".into()).unwrap();assert_eq!(reopened.contents.cookie,"secret-cookie");assert!(reopened.contents.record.is_some());reopened.lock();assert!(!reopened.unlocked());assert!(reopened.save().is_err());let mut damaged=b;let end=damaged.len()-1;damaged[end]^=1;fs::write(&p,damaged).unwrap();assert!(reopened.unlock("Local-test-passphrase-123".into()).is_err());fs::remove_file(p).unwrap();}}
