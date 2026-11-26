'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync}=require('node:fs');
const path=require('node:path');
const {tmpdir}=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
const {settings,encrypt,decrypt,backupSlot,objectUrl,backupDb,restoreToNewFile}=require('../backup');
const key=crypto.randomBytes(32),keyHex=key.toString('hex');
test('Encrypted backups authenticate data and cannot silently decrypt with wrong keys',()=>{
 const plain=Buffer.from('owner password hashes / clan bank / roles should stay encrypted');
 const cipher=encrypt(plain,key);
 assert.ok(!cipher.includes(plain));
 assert.deepEqual(decrypt(cipher,key),plain);
 assert.throws(()=>decrypt(cipher,crypto.randomBytes(32)),/authenticat|decrypt|bad/i);
 const tampered=Buffer.from(cipher);tampered[tampered.length-1]^=16;
 assert.throws(()=>decrypt(tampered,key),/authenticat|decrypt|bad/i);
});
test('No backup without complete valid HTTPS-only configuration',()=>{
 assert.equal(settings({}),null);
 const e={NODE_ENV:'production',NOMERCY_BACKUP_ENDPOINT:'http://example.com/',NOMERCY_BACKUP_BUCKET:'demo-bucket',
  NOMERCY_BACKUP_ACCESS_KEY_ID:'x',NOMERCY_BACKUP_SECRET_ACCESS_KEY:'y',NOMERCY_BACKUP_REGION:'auto',NOMERCY_BACKUP_KEY:keyHex};
 assert.throws(()=>settings(e),/HTTPS/);
 assert.ok(settings({...e,NOMERCY_BACKUP_ENDPOINT:'https://t3.storageapi.dev/'}));
 assert.throws(()=>settings({...e,NOMERCY_BACKUP_KEY:'wrong'}),/encryption key/);
 assert.match(backupSlot(new Date('2026-11-26T05:00:00.000Z')),/a\.sqlite\.gz\.gcm$/);
 assert.match(backupSlot(new Date('2026-11-26T17:00:00.000Z')),/b\.sqlite\.gz\.gcm$/);
 const c=settings({...e,NOMERCY_BACKUP_ENDPOINT:'https://t3.storageapi.dev/',NOMERCY_BACKUP_STYLE:'virtual-host'});
 assert.match(objectUrl(c,'day/test.sqlite').href,/^https:\/\/demo-bucket\.t3\.storageapi\.dev\/day\/test\.sqlite$/);
});
test('Whole database backup survives remote upload/download and restores in isolation, never overwrites', {timeout:30000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nm-offsite-test-'));
 const storage=new Map();
 const http=createServer(async(req,res)=>{
  try{
   assert.match(req.headers.authorization,/AWS4-HMAC-SHA256 Credential=/);
   assert.match(req.headers['x-amz-content-sha256'],/^[a-f0-9]{64}$/);
   const obj=req.url;
   if(req.method==='PUT'){
    const parts=[];for await(const chunk of req)parts.push(chunk);
    const bytes=Buffer.concat(parts);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),req.headers['x-amz-content-sha256']);
    storage.set(obj,bytes);res.writeHead(200);return res.end();
   }
   if(req.method==='GET'&&storage.has(obj)){res.writeHead(200,{'Content-Length':storage.get(obj).length});return res.end(storage.get(obj));}
   res.writeHead(404);res.end();
  }catch(e){res.writeHead(500);res.end(e.message);}
 });
 let addr;
 try{
  const file=path.join(dir,'hub.sqlite');
  const db=new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(id INTEGER PRIMARY KEY,handle TEXT UNIQUE);CREATE TABLE records(id INTEGER PRIMARY KEY,owner_id INTEGER REFERENCES users(id),data TEXT);');
  db.prepare('INSERT INTO users(handle) VALUES(?)').run('Owner');
  db.prepare('INSERT INTO records(owner_id,data) VALUES(?,?)').run(1,'test bank state and clan membership must survive');
  db.close();
  await new Promise(r=>http.listen(0,'127.0.0.1',r));addr=http.address();
  const env={NODE_ENV:'test',NOMERCY_BACKUP_ENDPOINT:'http://127.0.0.1:'+addr.port+'/',NOMERCY_BACKUP_BUCKET:'mission-backups',
   NOMERCY_BACKUP_STYLE:'path',NOMERCY_BACKUP_ACCESS_KEY_ID:'test-access-key',NOMERCY_BACKUP_SECRET_ACCESS_KEY:'test-secret',
   NOMERCY_BACKUP_REGION:'auto',NOMERCY_BACKUP_KEY:keyHex};
  const result=await backupDb(file,env);
  assert.equal(result.users,1);
  assert.equal(result.verified,true);
  assert.equal(storage.size,1);
  const [obj,encrypted]=[...storage.entries()][0];
  assert.ok(obj.startsWith('/mission-backups/nomercy-hq/rolling/'));
  assert.ok(!encrypted.includes(Buffer.from('Owner')));
  const restoredFile=path.join(dir,'restored.sqlite');
  assert.deepEqual(restoreToNewFile(encrypted,keyHex,restoredFile),{users:1});
  assert.throws(()=>restoreToNewFile(encrypted,keyHex,restoredFile),/overwrite/);
  const restored=new DatabaseSync(restoredFile,{readOnly:true});
  assert.equal(restored.prepare('SELECT data FROM records').get().data,'test bank state and clan membership must survive');
  restored.close();
  const original=new DatabaseSync(file,{readOnly:true});
  assert.equal(original.prepare('SELECT COUNT(*) AS n FROM users').get().n,1,'Live DB left untouched');
  original.close();
  const empty=path.join(dir,'empty.sqlite');const e=new DatabaseSync(empty);e.exec('CREATE TABLE users(id INTEGER PRIMARY KEY)');e.close();
  await assert.rejects(backupDb(empty,env),/empty user database/);
  assert.equal(storage.size,1,'Empty database must never overwrite the last known good backup');
  assert.equal(existsSync(path.join(dir,'missing.sqlite')),false);
 }finally{
  await new Promise(r=>http.close(r));
  rmSync(dir,{recursive:true,force:true});
 }
});
