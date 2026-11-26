'use strict';
// NoMercy Clan HQ: encrypted, independently stored SQLite backups.
// Never expose this module through an HTTP route; never restore over the live database.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const zlib=require('node:zlib');
const {DatabaseSync}=require('node:sqlite');
const MAGIC=Buffer.from('NMB1');
const hmac=(key,text)=>crypto.createHmac('sha256',key).update(text).digest();
const sha=(value)=>crypto.createHash('sha256').update(value).digest('hex');
function settings(env=process.env){
 const keys=['NOMERCY_BACKUP_ENDPOINT','NOMERCY_BACKUP_BUCKET','NOMERCY_BACKUP_ACCESS_KEY_ID','NOMERCY_BACKUP_SECRET_ACCESS_KEY','NOMERCY_BACKUP_REGION','NOMERCY_BACKUP_KEY'];
 if(!keys.every(k=>env[k]))return null;
 if(!/^[0-9a-fA-F]{64}$/.test(env.NOMERCY_BACKUP_KEY))throw Error('Invalid backup encryption key (64 hex characters required).');
 const bucket=env.NOMERCY_BACKUP_BUCKET;
 if(!/^[a-z0-9][a-z0-9.-]{2,100}$/.test(bucket))throw Error('Invalid backup bucket name.');
 const endpoint=new URL(env.NOMERCY_BACKUP_ENDPOINT);
 if(endpoint.protocol!=='https:'&&!(env.NODE_ENV==='test'&&endpoint.protocol==='http:'))throw Error('Backup S3 endpoint must use HTTPS.');
 if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/')throw Error('Unexpected backup S3 endpoint URL.');
 const style=env.NOMERCY_BACKUP_STYLE||'virtual-host';
 if(!['path','virtual-host'].includes(style))throw Error('Invalid backup S3 URL style.');
 return {
  bucket,endpoint,style,region:env.NOMERCY_BACKUP_REGION,
  accessKey:env.NOMERCY_BACKUP_ACCESS_KEY_ID,secret:env.NOMERCY_BACKUP_SECRET_ACCESS_KEY,
  key:Buffer.from(env.NOMERCY_BACKUP_KEY,'hex')
 };
}
function encrypt(bytes,key){
 const iv=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(zlib.gzipSync(bytes)),cipher.final()]);
 return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),ciphertext]);
}
function decrypt(bytes,key){
 if(bytes.length<32||!bytes.subarray(0,4).equals(MAGIC))throw Error('Unknown backup format.');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(4,16));
 decipher.setAuthTag(bytes.subarray(16,32));
 const compressed=Buffer.concat([decipher.update(bytes.subarray(32)),decipher.final()]);
 return zlib.gunzipSync(compressed);
}
function inspectSqlite(filename){
 const db=new DatabaseSync(filename,{readOnly:true});
 try{
  const integrity=db.prepare('PRAGMA integrity_check').get().integrity_check;
  if(integrity!=='ok')throw Error('Backup SQLite integrity failed.');
  const foreignKeys=db.prepare('PRAGMA foreign_key_check').all();
  if(foreignKeys.length)throw Error('Backup SQLite foreign keys failed.');
  const users=db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  // An empty restored production DB must never replace a real backup.
  if(users<1)throw Error('Refusing to archive an empty user database.');
  return {users};
 }finally{db.close();}
}
function objectUrl(cfg,key){
 const safe=key.split('/').map(encodeURIComponent).join('/');
 const url=new URL(cfg.endpoint.href);
 if(cfg.style==='virtual-host')url.hostname=cfg.bucket+'.'+url.hostname;
 url.pathname=(cfg.style==='path'?'/'+encodeURIComponent(cfg.bucket):'')+'/'+safe;
 return url;
}
async function s3(cfg,method,key,body){
 const url=objectUrl(cfg,key);
 const payload=body||Buffer.alloc(0);
 const contentHash=sha(payload);
 const timestamp=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');
 const date=timestamp.slice(0,8),scope=date+'/'+cfg.region+'/s3/aws4_request';
 const headers='host:'+url.host+'\n'+'x-amz-content-sha256:'+contentHash+'\n'+'x-amz-date:'+timestamp+'\n';
 const signedHeaders='host;x-amz-content-sha256;x-amz-date';
 const canonical=[method,url.pathname,'',headers,signedHeaders,contentHash].join('\n');
 const stringToSign=['AWS4-HMAC-SHA256',timestamp,scope,sha(canonical)].join('\n');
 let signature=hmac('AWS4'+cfg.secret,date);
 signature=hmac(signature,cfg.region);signature=hmac(signature,'s3');signature=hmac(signature,'aws4_request');
 const auth='AWS4-HMAC-SHA256 Credential='+cfg.accessKey+'/'+scope+', SignedHeaders='+signedHeaders+', Signature='+hmac(signature,stringToSign).toString('hex');
 const res=await fetch(url,{method,headers:{
  Authorization:auth,'x-amz-date':timestamp,'x-amz-content-sha256':contentHash,
  ...(method==='PUT'?{'Content-Type':'application/octet-stream'}:{})
 },...(method==='PUT'?{body:payload}:{}),signal:AbortSignal.timeout(45000)});
 if(!res.ok)throw Error('Backup storage '+method+' failed (HTTP '+res.status+').');
 if(method==='GET'){
  const length=Number(res.headers.get('content-length')||0);
  if(length>100*1024*1024)throw Error('Backup remote object too large to verify.');
  const bytes=Buffer.from(await res.arrayBuffer());
  if(bytes.length>100*1024*1024)throw Error('Backup remote object too large to verify.');
  return bytes;
 }
 await res.arrayBuffer();
 return null;
}
function backupSlot(at=new Date()){
 const half=at.getUTCHours()<12?'a':'b';
 const slot=Math.floor(at.getTime()/86400000)%21;
 return 'nomercy-hq/rolling/'+String(slot).padStart(2,'0')+'-'+half+'.sqlite.gz.gcm';
}
function verifyDecrypted(bytes){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nm-restore-check-'));
 const filename=path.join(dir,'restored.sqlite');
 try{
  fs.writeFileSync(filename,bytes,{mode:0o600,flag:'wx'});
  return inspectSqlite(filename);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
async function backupDb(filename,env=process.env){
 const cfg=settings(env);
 if(!cfg)throw Error('Backup variables are incomplete.');
 const temp=filename+'.backup-'+crypto.randomBytes(6).toString('hex')+'.sqlite';
 let stage='snapshot';
 try{
  const db=new DatabaseSync(filename,{readOnly:true});
  try{db.exec("VACUUM INTO '"+temp.replace(/'/g,"''")+"'");}finally{db.close();}
  const info=inspectSqlite(temp);
  const original=fs.readFileSync(temp);
  if(original.length>70*1024*1024)throw Error('Backup exceeds 70 MB uncompressed limit; increase backup capacity.');
  const encrypted=encrypt(original,cfg.key);
  if(encrypted.length>90*1024*1024)throw Error('Backup encrypted file too large.');
  const object=backupSlot();
  stage='upload';
  await s3(cfg,'PUT',object,encrypted);
  stage='remote verification';
  const downloaded=await s3(cfg,'GET',object);
  const restored=decrypt(downloaded,cfg.key);
  if(sha(restored)!==sha(original))throw Error('Remote backup verification checksum mismatch.');
  const verified=verifyDecrypted(restored);
  if(verified.users!==info.users)throw Error('Remote backup row count mismatch.');
  return {key:object,users:info.users,sizeBytes:encrypted.length,verified:true};
 }catch(err){throw new Error('Backup '+stage+' failed: '+err.message);}
 finally{try{fs.unlinkSync(temp)}catch{}}
}
// Offline/manual recovery ONLY. Explicit fresh output path; does not overwrite any file.
function restoreToNewFile(encrypted,keyHex,destination){
 if(!/^[0-9a-fA-F]{64}$/.test(keyHex))throw Error('Invalid backup encryption key.');
 if(fs.existsSync(destination))throw Error('Refusing to overwrite an existing file.');
 const plain=decrypt(encrypted,Buffer.from(keyHex,'hex'));
 try{
  fs.writeFileSync(destination,plain,{mode:0o600,flag:'wx'});
  return inspectSqlite(destination);
 }catch(err){try{fs.unlinkSync(destination)}catch{}throw err;}
}
module.exports={settings,encrypt,decrypt,objectUrl,backupSlot,backupDb,restoreToNewFile};
