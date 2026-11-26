'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const net=require('node:net');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(dir){
 const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));
 const url='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),
  env:{...process.env,NODE_ENV:'development',PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,SITE_PREVIEW_LOCK:'0',
   NOMERCY_BACKUP_ENDPOINT:'',NOMERCY_BACKUP_KEY:'',ADMIN_BOOTSTRAP_TOKEN:'test-security-integration-owner-token-2026'},
  stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',x=>errors+=x);
 for(let i=0;i<100;i++){if(child.exitCode!==null)break;try{if((await fetch(url+'/healthz')).ok)return {url,child};}catch{}await sleep(100);}
 child.kill();throw Error('Could not boot: '+errors);
}
async function stop(s){if(!s)return;s.child.kill('SIGTERM');await Promise.race([new Promise(r=>s.child.once('exit',r)),sleep(1000)]);}
async function call(url,endpoint,body,cookie,headers={}){
 const res=await fetch(url+endpoint,{method:body===undefined?'GET':'POST',
  headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},
  ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
 let data;try{data=await res.json()}catch{data={}};
 return {status:res.status,data,headers:res.headers,cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
test('Launch security: sessions, CSRF, invalid JSON, case-spoofed users, headers and role boundaries', {timeout:40000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nm-security-'));let svc;
 try{
  svc=await boot(dir);const url=svc.url;
  assert.equal((await call(url,'/healthz')).status,200);
  const owner=await call(url,'/api/register',{handle:'SafeOwner',password:'correct-test-owner-password-2026'});
  assert.equal(owner.status,201,JSON.stringify(owner.data));
  assert.match(owner.headers.get('set-cookie'),/HttpOnly/);
  assert.match(owner.headers.get('set-cookie'),/SameSite=Lax/);
  assert.equal(owner.headers.get('referrer-policy'),'no-referrer');
  assert.equal((await call(url,'/api/register',{handle:'safeowner',password:'another-test-password-2026'})).status,409,'Case-colliding username forbidden');
  assert.equal((await call(url,'/api/register',{handle:'SAFEOWNER',password:'another-test-password-2026'})).status,409);
  assert.equal((await call(url,'/api/login',null)).status,400,'JSON null must not crash');
  assert.equal((await call(url,'/api/login','[]')).status,400,'JSON array must not crash');
  assert.equal((await call(url,'/api/login',{handle:'SafeOwner',password:'bad'},undefined,{'Origin':'https://evil.example'})).status,403);
  assert.equal((await call(url,'/api/login',{handle:'SafeOwner',password:'bad'},undefined,{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await call(url,'/api/login',{handle:'SafeOwner',password:'bad'},undefined,{'Origin':'null'})).status,403);
  assert.equal((await call(url,'/api/login',{handle:'SafeOwner',password:'bad'},undefined,{'Origin':url})).status,401);
  assert.equal((await call(url,'/api/admin/team',{handle:'SafeOwner',role:'member'},owner.cookie)).status,403,'Not admin yet');
  assert.equal((await call(url,'/api/hq/bank/transactions',{kind:'deposit',amount:'100',note:'Test'},owner.cookie)).status,403);
  assert.equal((await call(url,'/api/hq/bank/taxes',undefined,owner.cookie)).status,403);
  const claim=await call(url,'/api/admin/claim',{token:'test-security-integration-owner-token-2026'},owner.cookie);
  assert.equal(claim.status,200);
  assert.equal((await call(url,'/api/admin/claim',{token:'test-security-integration-owner-token-2026'},owner.cookie)).status,409,'Admin one-time claim cannot repeat');
  assert.equal((await call(url,'/api/admin/team',{handle:'SafeOwner',role:'member'},owner.cookie)).status,403,'Owner cannot demote self');
  const member=await call(url,'/api/register',{handle:'OtherMember',password:'correct-test-member-password-2026'});
  assert.equal(member.status,201);
  assert.equal((await call(url,'/api/admin/team',{handle:'OtherMember',role:'coleader'},member.cookie)).status,403);
  assert.equal((await call(url,'/api/hq/missions',undefined,member.cookie)).status,403);
  assert.equal((await call(url,'/api/hq/clan/requests',undefined,member.cookie)).status,200,'Only own application exposed');
  assert.equal((await call(url,'/api/hq/clan/members',{handle:'OtherMember',clan:'clan3'},owner.cookie)).status,200);
  assert.equal((await call(url,'/api/hq/missions',undefined,member.cookie)).status,200);
  assert.equal((await call(url,'/api/hq/clan/members',{handle:'OtherMember',clan:'remove'},member.cookie)).status,403);
  assert.equal((await call(url,'/api/hq/clan/members',{handle:'OtherMember',clan:'remove'},owner.cookie)).status,200);
  assert.equal((await call(url,'/api/hq/missions',undefined,member.cookie)).status,403,'Access immediately revoked on removal');
  const noSession=await call(url,'/api/logout',{},member.cookie);
  assert.equal(noSession.status,200);
  assert.equal((await call(url,'/api/me',undefined,member.cookie)).data.user,null,'Revoked session no longer accepted');
  const invalidStatic=await fetch(url+'/%E0%A4%A');
  assert.equal(invalidStatic.status,400,'Invalid percent encoding should not cause a 500');
  assert.equal((await fetch(url+'/../server.js')).status,404,'Source inaccessible via public static route');
  assert.equal((await fetch(url+'/backup.js')).status,404,'Backup implementation inaccessible over HTTP');
  assert.equal((await call(url,'/api/hq/bank',undefined,owner.cookie)).status,200);
 }finally{await stop(svc);rmSync(dir,{recursive:true,force:true});}
});
test('Login per-IP throttle ignores spoofed X-Real-IP outside trusted Railway deployment', {timeout:30000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nm-rate-'));let svc;
 try{
  svc=await boot(dir);const url=svc.url;
  let last;
  for(let i=0;i<13;i++)last=await call(url,'/api/login',{handle:'Nonexistent',password:'wrong'},undefined,{'X-Real-IP':'203.0.113.'+(i+1)});
  assert.equal(last.status,429,'Spoofing IP via forwarded headers cannot bypass local limits');
 }finally{await stop(svc);rmSync(dir,{recursive:true,force:true});}
});
