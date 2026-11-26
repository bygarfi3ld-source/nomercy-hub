'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const net=require('node:net');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(options={}){
 const dir=mkdtempSync(path.join(tmpdir(),'nm-legal-http-'));
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
 const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),
  env:{...process.env,NODE_ENV:'development',PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,SITE_PREVIEW_LOCK:'0',
    NOMERCY_BACKUP_ENDPOINT:'',NOMERCY_BACKUP_KEY:'',NOMERCY_LEGAL_NAME:'Test Betreiber',
    NOMERCY_LEGAL_STREET:'Beispielallee 5',NOMERCY_LEGAL_CITY:'00000 Teststadt',
    NOMERCY_LEGAL_EMAIL:'contact@example.invalid',...options},stdio:['ignore','pipe','pipe']});
 const base='http://127.0.0.1:'+port;let errors='';child.stderr.on('data',x=>errors+=x);
 for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok)return {dir,child,base};}catch{}if(child.exitCode!==null)break;await sleep(100);}
 child.kill();rmSync(dir,{recursive:true,force:true});throw new Error('Startup failed: '+errors);
}
async function stop({child,dir}){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(800)]);rmSync(dir,{recursive:true,force:true});}
test('Unapproved, missing-email and incomplete legal pages never expose personal data',{timeout:20000},async()=>{
 for(const options of [{},{NOMERCY_LEGAL_PUBLISH:'1',NOMERCY_LEGAL_EMAIL:''}]){
  const svc=await boot(options);
  try{
   for(const path of ['/impressum.html','/datenschutz.html']){
    const res=await fetch(svc.base+path);
    assert.equal(res.status,503,path+' fail closed');
    assert.ok(!(await res.text()).includes('Test Betreiber'));
   }
   assert.equal((await fetch(svc.base+'/healthz')).status,200);
  }finally{await stop(svc);}
 }
});
test('Reviewed legal pages with explicitly enabled private variables render in HTTP, not committed content',{timeout:20000},async()=>{
 const svc=await boot({NOMERCY_LEGAL_PUBLISH:'1'});
 try{
  for(const path of ['/impressum.html','/datenschutz.html']){
   const res=await fetch(svc.base+path);
   assert.equal(res.status,200,path);
   const html=await res.text();
   assert.match(html,/Test Betreiber/);
   assert.match(html,/Beispielallee 5/);
   assert.match(html,/contact@example.invalid/);
   assert.match(res.headers.get('content-security-policy'),/default-src 'self'/);
   assert.equal(res.headers.get('cache-control'),'no-store');
  }
  assert.equal((await fetch(svc.base+'/legal-pages.js')).status,404,'Internal legal module inaccessible');
 }finally{await stop(svc);}
});
