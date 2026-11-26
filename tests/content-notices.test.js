'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const net=require('node:net');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(){
 const dir=mkdtempSync(path.join(tmpdir(),'nm-dsa-'));
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
 const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),
  env:{...process.env,NODE_ENV:'development',PORT:String(port),HOST:'127.0.0.1',
    DATA_DIR:dir,SITE_PREVIEW_LOCK:'0',NOMERCY_BACKUP_KEY:'',NOMERCY_BACKUP_ENDPOINT:'',
    ADMIN_BOOTSTRAP_TOKEN:'test-owner-claim-separate-legal-notices-2026'},
  stdio:['ignore','pipe','pipe']});
 const url='http://127.0.0.1:'+port;let stderr='';child.stderr.on('data',x=>stderr+=x);
 for(let i=0;i<80;i++){try{if((await fetch(url+'/healthz')).ok)return {child,url,dir};}catch{}if(child.exitCode!==null)break;await sleep(80);}
 child.kill();rmSync(dir,{recursive:true,force:true});throw Error('Failed to boot: '+stderr);
}
async function stop(s){s.child.kill('SIGTERM');await Promise.race([new Promise(r=>s.child.once('exit',r)),sleep(900)]);rmSync(s.dir,{recursive:true,force:true});}
async function call(url,path,body,cookie){
 const res=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 let data={};try{data=await res.json()}catch{}
 return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
test('Public content notices require meaningful facts; only staff can read and review private contact data',{timeout:35000},async()=>{
 const svc=await boot();
 try{
  assert.equal((await fetch(svc.url+'/melden.html')).status,200,'Public complaint page without login');
  assert.equal((await fetch(svc.url+'/nutzungsregeln.html')).status,200,'Community guidelines public');
  const payload={category:'listing',content_url:'/#market',reporter_name:'Test Meldende',
   reporter_email:'reporter@example.invalid',reason:'Angebot 12 behauptet irreführend einen Echtgeldkauf für Minecraft-Items.',
   good_faith:true};
  const empty=await call(svc.url,'/api/content-notices',{...payload,reason:'bad'});
  assert.equal(empty.status,400,'Need concrete reasoning');
  const badUrl=await call(svc.url,'/api/content-notices',{...payload,content_url:'https://evil.example/test'});
  assert.equal(badUrl.status,400,'Reject offsite URLs');
  const accepted=await call(svc.url,'/api/content-notices',payload);
  assert.equal(accepted.status,201,JSON.stringify(accepted.data));
  assert.match(accepted.data.reference,/^NM-\d+$/);
  assert.ok(!JSON.stringify(accepted.data).includes(payload.reporter_email));
  assert.equal((await call(svc.url,'/api/admin/content-notices')).status,403,'No public report access');
  const member=await call(svc.url,'/api/register',{handle:'ReportMember',password:'test-report-member-password-2026'});
  assert.equal(member.status,201);
  assert.equal((await call(svc.url,'/api/admin/content-notices',undefined,member.cookie)).status,403,'Member cannot read');
  assert.equal((await call(svc.url,'/api/admin/content-notices/review',{id:1,status:'dismissed',note:'Legal review note'},member.cookie)).status,403,'Member cannot review');
  const owner=await call(svc.url,'/api/register',{handle:'ReportOwner',password:'test-report-owner-password-2026'});
  assert.equal(owner.status,201);
  const claim=await call(svc.url,'/api/admin/claim',{token:'test-owner-claim-separate-legal-notices-2026'},owner.cookie);
  assert.equal(claim.status,200,JSON.stringify(claim.data));
  const staff=await call(svc.url,'/api/admin/content-notices',undefined,owner.cookie);
  assert.equal(staff.status,200);
  assert.equal(staff.data.notices.length,1);
  assert.equal(staff.data.notices[0].reporter_email,payload.reporter_email);
  assert.equal(staff.data.notices[0].status,'open');
  const review=await call(svc.url,'/api/admin/content-notices/review',{id:staff.data.notices[0].id,status:'reviewed',note:'Manuell geprüft. Inserat an zuständiges Team weitergeleitet.'},owner.cookie);
  assert.equal(review.status,200,JSON.stringify(review.data));
  assert.equal((await call(svc.url,'/api/admin/content-notices',undefined,owner.cookie)).data.notices[0].status,'reviewed');
  assert.equal((await call(svc.url,'/api/admin/content-notices/review',{id:staff.data.notices[0].id,status:'dismissed',note:'Noch einmal prüfen'},owner.cookie)).status,409,'No duplicate decisions');
 }finally{await stop(svc);}
});
