'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const net=require('node:net');
const token='only-for-join-requests-integration-test-secret';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(data){const srv=net.createServer();await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;await new Promise(r=>srv.close(r));
 const url=`http://127.0.0.1:${port}`;const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:data,ADMIN_BOOTSTRAP_TOKEN:token,NODE_ENV:'development',SITE_PREVIEW_LOCK:'0'},stdio:['ignore','pipe','pipe']});let logs='';child.stderr.on('data',x=>logs+=x);
 for(let i=0;i<70;i++){try{const r=await fetch(url+'/healthz');if(r.ok)return {url,child}}catch{}await sleep(130);}child.kill();throw Error('Testserver unavailable: '+logs);
}
async function req(url,endpoint,body,cookie){const r=await fetch(url+endpoint,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function sign(url,name){const r=await req(url,'/api/register',{handle:name,password:'very-secure-test-password-2026'});assert.equal(r.status,201,JSON.stringify(r.data));return r.cookie;}
test('Clan-Beitrittsantrag: nur Admin darf freischalten, kein Namen-Spoofing', {timeout:35000}, async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nm-join-'));let service;
 try{
  service=await boot(dir);const url=service.url;
  const owner=await sign(url,'NoMercyOwner'),member=await sign(url,'NewMember'),other=await sign(url,'OtherGuy');
  assert.equal((await req(url,'/api/hq/clan/requests')).status,401);
  assert.equal((await req(url,'/api/hq/clan/requests',{})).status,401);
  assert.equal((await req(url,'/api/admin/claim',{token},owner)).status,200);
  const application={mc_name:'Unverified123',desired_clan:'clan2',message:'Ich spiele seit Wochen und helfe gern bei NoMercy-Events.'};
  assert.equal((await req(url,'/api/hq/clan/requests',{...application,message:'too short'},member)).status,400);
  assert.equal((await req(url,'/api/hq/clan/requests',application,member)).status,201);
  assert.equal((await req(url,'/api/hq/clan/requests',application,member)).status,409,'Kein doppelter Antrag');
  assert.equal((await req(url,'/api/hq/events',undefined,member)).status,403,'Noch kein Clan-Zugriff');
  const mine=await req(url,'/api/hq/clan/requests',undefined,member);
  assert.equal(mine.status,200);assert.equal(mine.data.request.mc_name,'Unverified123');assert.equal(mine.data.request.status,'pending');
  assert.equal(Object.hasOwn(mine.data,'requests'),false,'Andere Anträge nicht sichtbar');
  assert.equal((await req(url,'/api/hq/clan/requests',undefined,other)).data.request,null);
  const list=await req(url,'/api/hq/clan/requests',undefined,owner);
  assert.equal(list.data.requests.length,1);const id=list.data.requests[0].id;
  assert.equal((await req(url,`/api/hq/clan/requests/${id}/review`,{decision:'approve',clan:'main',note:'Ich möchte mich selbst freischalten.'},member)).status,403);
  assert.equal((await req(url,`/api/hq/clan/requests/${id}/review`,{decision:'approve',clan:'main',note:'Unberechtigter Admin-Versuch'},other)).status,403);
  assert.equal((await req(url,`/api/hq/clan/requests/${id}/review`,{decision:'approve',clan:'clan3',note:'Persönlich überprüft, zunächst Clan 3.'},owner)).status,200);
  assert.equal((await req(url,'/api/hq/me',undefined,member)).data.user.clan,'clan3');
  assert.equal((await req(url,'/api/hq/clan/requests',undefined,member)).data.request.status,'approved');
  assert.equal((await req(url,`/api/hq/clan/requests/${id}/review`,{decision:'reject',note:'Erneuter Versuch.'},owner)).status,409);
  assert.equal((await req(url,'/api/hq/clan/requests',application,member)).status,409,'Mitglied kann nicht erneut bewerben');
  await new Promise(resolve=>{service.child.once('exit',resolve);service.child.kill('SIGTERM')});service=null;
  service=await boot(dir);
  assert.equal((await req(service.url,'/api/hq/me',undefined,member)).data.user.clan,'clan3','Freigabe überlebt Neustart');
  const audit=new DatabaseSync(path.join(dir,'hub.sqlite'));
  assert.ok(audit.prepare("SELECT COUNT(*) AS n FROM clan_hq_audit WHERE action='clan_application_review'").get().n>0);
  audit.close();
 }finally{if(service){service.child.kill('SIGTERM');await Promise.race([new Promise(r=>service.child.once('exit',r)),sleep(1000)])}rmSync(dir,{recursive:true,force:true})}
});

test('Giveaway-Firework: WebAudio, Mute und nutzergesteuerter Start',()=>{
 const {readFileSync}=require('node:fs');const dir=path.join(__dirname,'../public');const html=readFileSync(path.join(dir,'index.html'),'utf8'),js=readFileSync(path.join(dir,'hq.js'),'utf8');
 assert.match(html,/id="drawSoundToggle"/);assert.match(html,/aria-pressed="true"/);
 assert.match(js,/window\.AudioContext\|\|window\.webkitAudioContext/);
 assert.match(js,/function revealNoise/);assert.match(js,/function playRevealCue/);
 assert.match(js,/playRevealCue\('launch'\)/);assert.match(js,/playRevealCue\('win'\)/);
 assert.match(js,/revealSoundEnabled=!revealSoundEnabled/);
 assert.match(js,/const audio=audioForReveal\(\)/);
 assert.doesNotMatch(js,/\.mp3|\.ogg/,'Feuerwerksklang wird selbst generiert');
});
