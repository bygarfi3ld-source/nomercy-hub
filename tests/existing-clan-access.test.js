'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{mkdtempSync,rmSync,readFileSync}=require('node:fs'),{tmpdir}=require('node:os');
const {DatabaseSync}=require('node:sqlite'),path=require('node:path'),net=require('node:net');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const token='only-for-existing-clan-tests-32chars';
async function boot(dir){
 const temp=net.createServer();await new Promise(r=>temp.listen(0,'127.0.0.1',r));
 const port=temp.address().port;await new Promise(r=>temp.close(r));
 const url='http://127.0.0.1:'+port,child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_BOOTSTRAP_TOKEN:token,NODE_ENV:'development',SITE_PREVIEW_LOCK:'0'},stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',d=>stderr+=d.toString());
 for(let i=0;i<70;i++){try{if((await fetch(url+'/healthz')).ok)return {url,child};}catch{}await sleep(130);}child.kill();throw Error('Server unavailable: '+stderr);
}
async function req(url,p,body,cookie){
 const r=await fetch(url+p,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function sign(url,name){const r=await req(url,'/api/register',{handle:name,password:'safe-password-for-test-2026'});assert.equal(r.status,201,JSON.stringify(r.data));return r.cookie;}
test('Existing clan access: Main needs explicit administrator verification, and new recruits cannot bypass progression',{timeout:35000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nm-existing-'));let srv;
 try{
  srv=await boot(dir);const url=srv.url;
  const admin=await sign(url,'ClanVerifier'),existing=await sign(url,'ExistingMain'),fresh=await sign(url,'FreshRecruit');
  assert.equal((await req(url,'/api/admin/claim',{token},admin)).status,200);
  const claim={request_type:'existing',mc_name:'VerifiedPlayer',desired_clan:'main',message:'Ich bin schon Mainclan-Mitglied und möchte nur Hub-Zugang.'};
  assert.equal((await req(url,'/api/hq/clan/requests',claim,existing)).status,201);
  assert.equal((await req(url,'/api/hq/me',undefined,existing)).data.user.clan,null);
  assert.equal((await req(url,'/api/hq/events',undefined,existing)).status,403);
  const list=await req(url,'/api/hq/clan/requests',undefined,admin);
  const item=list.data.requests.find(r=>r.handle==='ExistingMain');assert.equal(item.request_type,'existing');assert.equal(item.desired_clan,'main');
  const review='/api/hq/clan/requests/'+item.id+'/review';
  const decision={decision:'approve',clan:'main',note:'Ich habe die Mitgliedschaft im Clan persönlich geprüft.'};
  assert.equal((await req(url,review,{...decision,verified_existing:true},existing)).status,403);
  assert.equal((await req(url,review,decision,admin)).status,409);
  assert.equal((await req(url,'/api/hq/clan/members',{handle:'ExistingMain',clan:'main'},admin)).status,409);
  assert.equal((await req(url,review,{...decision,verified_existing:true},admin)).status,200);
  assert.equal((await req(url,'/api/hq/me',undefined,existing)).data.user.clan,'main');
  assert.equal((await req(url,'/api/hq/clan/requests',undefined,existing)).data.request.status,'approved');
  const application={request_type:'application',mc_name:'NewMember33',desired_clan:'clan2',message:'Ich bin neu und möchte mich für Clan 2 bewerben.'};
  assert.equal((await req(url,'/api/hq/clan/requests',{...application,desired_clan:'main'},fresh)).status,400);
  assert.equal((await req(url,'/api/hq/clan/requests',application,fresh)).status,201);
  const newItem=(await req(url,'/api/hq/clan/requests',undefined,admin)).data.requests.find(r=>r.handle==='FreshRecruit');
  assert.equal(newItem.request_type,'application');
  assert.equal((await req(url,'/api/hq/clan/requests/'+newItem.id+'/review',{...decision,verified_existing:true},admin)).status,409);
  assert.equal((await req(url,'/api/hq/clan/requests/'+newItem.id+'/review',{decision:'approve',clan:'clan2',note:'Neue Bewerbung geprüft.'},admin)).status,200);
  const db=new DatabaseSync(path.join(dir,'hub.sqlite'));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM clan_hq_audit WHERE action='clan_existing_main_verified'").get().n,1);db.close();
 }finally{if(srv){srv.child.kill('SIGTERM');await Promise.race([new Promise(r=>srv.child.once('exit',r)),sleep(1000)])}rmSync(dir,{recursive:true,force:true})}
});
test('UI separates existing-member access from applying anew',()=>{
 const root=path.resolve(__dirname,'..');
 const html=readFileSync(path.join(root,'public/index.html'),'utf8'),js=readFileSync(path.join(root,'public/hq.js'),'utf8');
 for(const id of ['accessForm','accessSubmit','applyModeExisting','applyModeNew'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/showClanApplication\('existing'\)/);assert.match(js,/request_type:'existing'/);assert.match(js,/verified_existing:verifiedExisting/);
});
