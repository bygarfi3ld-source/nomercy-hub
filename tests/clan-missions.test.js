'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const net=require('node:net');
const path=require('node:path');
const token='only-for-missions-integration-tests-2026';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(dir){
 const n=net.createServer();await new Promise(r=>n.listen(0,'127.0.0.1',r));
 const port=n.address().port;await new Promise(r=>n.close(r));const url='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{
  ...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,NODE_ENV:'development',
  SITE_PREVIEW_LOCK:'0',ADMIN_BOOTSTRAP_TOKEN:token
 },stdio:['ignore','pipe','pipe']});
 let logs='';child.stderr.on('data',d=>logs+=d.toString());
 for(let i=0;i<105;i++){if(child.exitCode!==null)break;try{if((await fetch(url+'/healthz')).ok)return {url,child};}catch{}await sleep(100);}
 child.kill();throw Error('Mission test server did not start: '+logs);
}
async function stop(s){if(!s)return;s.child.kill('SIGTERM');await Promise.race([new Promise(r=>s.child.once('exit',r)),sleep(1300)]);}
async function request(url,endpoint,body,cookie){
 const r=await fetch(url+endpoint,{method:body===undefined?'GET':'POST',
  headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function register(url,handle){
 const r=await request(url,'/api/register',{handle,password:'unique-local-mission-test-'+handle});
 assert.equal(r.status,201,JSON.stringify(r.data));return r.cookie;
}
test('Clan-Aufträge: access, scope, member workflow, leader review, rights, audit and persistence', {timeout:60000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nm-missions-'));let svc;
 try{
  svc=await boot(dir);let url=svc.url;
  // 5 registrations stay under the public signup rate-limit.
  const owner=await register(url,'MissionOwner');
  const lead=await register(url,'MissionLead');
  const mod=await register(url,'MissionMod');
  const member=await register(url,'MissionMember');
  const stranger=await register(url,'MissionGuest');
  assert.equal((await request(url,'/api/admin/claim',{token},owner)).status,200);
  assert.equal((await request(url,'/api/hq/clan/members',{handle:'MissionLead',clan:'clan2'},owner)).status,200);
  assert.equal((await request(url,'/api/hq/clan/members',{handle:'MissionMember',clan:'clan3'},owner)).status,200);
  assert.equal((await request(url,'/api/admin/team',{handle:'MissionLead',role:'coleader'},owner)).status,200);
  assert.equal((await request(url,'/api/admin/team',{handle:'MissionMod',role:'moderator'},owner)).status,200);
  const base={title:'3 Stacks Obsidian sammeln',description:'Bringe drei Stacks zur Clanbasis und melde die Übergabe.',
    clan_scope:'clan3',slots:2,due_at:null};
  const api='/api/hq/missions';
  assert.equal((await request(url,api)).status,401,'Public cannot view missions');
  assert.equal((await request(url,api,undefined,stranger)).status,403);
  assert.equal((await request(url,api,{...base},member)).status,403,'Only staff can create');
  assert.equal((await request(url,api,{...base,title:'x'},owner)).status,400,'Reject invalid title');
  assert.equal((await request(url,api,{...base,clan_scope:'evil'},owner)).status,400,'No arbitrary scope');
  assert.equal((await request(url,api,{...base,slots:31},owner)).status,400,'Limit participants');
  assert.equal((await request(url,api,{...base,due_at:new Date(Date.now()-60000).toISOString()},owner)).status,400,'Deadline in future only');
  const created=await request(url,api,base,mod);
  assert.equal(created.status,201,JSON.stringify(created.data));
  const id=created.data.id;const item=api+'/'+id;
  assert.equal((await request(url,api,undefined,stranger)).status,403);
  assert.equal((await request(url,api,undefined,member)).data.missions[0].title,base.title);
  assert.equal((await request(url,api,undefined,lead)).data.missions[0].clan_scope,'clan3','Staff can oversee different clans');
  assert.equal((await request(url,item+'/join',{},owner)).status,403,'Nonmember owner cannot self-join');
  assert.equal((await request(url,item+'/join',{},lead)).status,403,'Clan2 user cannot take Clan3 task');
  assert.equal((await request(url,item+'/join',{},stranger)).status,403);
  assert.equal((await request(url,item+'/submit',{note:'Already finished'},member)).status,409,'Must accept before submitting');
  assert.equal((await request(url,item+'/join',{},member)).status,200);
  assert.equal((await request(url,item+'/join',{},member)).status,409);
  assert.equal((await request(url,item+'/submit',{note:'no'},member)).status,400);
  assert.equal((await request(url,item+'/submit',{note:'Die drei Stacks am Clanhub abgeliefert.'},member)).status,200);
  assert.equal((await request(url,item+'/submit',{note:'Noch einmal'},member)).status,409,'No repeated completion');
  assert.equal((await request(url,item+'/review',{user_id:4,decision:'approve',note:'Alles geprüft'},member)).status,403,'Member cannot review');
  const me=(await request(url,api,undefined,member)).data.missions[0];
  assert.equal(me.my_status,'submitted');
  assert.equal(me.claims,undefined,'Other member evidence is not exposed');
  const staffView=(await request(url,api,undefined,lead)).data.missions[0];
  assert.equal(staffView.claims.length,1);
  const target=staffView.claims[0].user_id;
  assert.equal((await request(url,item+'/review',{user_id:target,decision:'revise',note:'Bitte Übergabe bestätigen lassen'},lead)).status,200);
  assert.equal((await request(url,api,undefined,member)).data.missions[0].my_status,'joined');
  assert.match((await request(url,api,undefined,member)).data.missions[0].my_review_note,/Übergabe/);
  assert.equal((await request(url,item+'/submit',{note:'Übergabe ist bestätigt.'},member)).status,200);
  assert.equal((await request(url,item+'/review',{user_id:target,decision:'approve',note:'Prüfung ok'},owner)).status,200);
  assert.equal((await request(url,item+'/review',{user_id:target,decision:'approve',note:'Noch mal'},owner)).status,409);
  const done=(await request(url,api,undefined,member)).data.missions[0];
  assert.equal(done.my_status,'approved');
  assert.equal(done.completed,1);
  assert.equal((await request(url,item+'/leave',{},member)).status,409,'Approved completion stays intact');
  assert.equal((await request(url,item+'/join',{},member)).status,409);

  const all=await request(url,api,{...base,title:'Clanbasis reparieren',clan_scope:'all',slots:1},lead);
  assert.equal(all.status,201,JSON.stringify(all.data));const other=api+'/'+all.data.id;
  assert.equal((await request(url,other+'/join',{},lead)).status,200);
  assert.equal((await request(url,other+'/join',{},member)).status,409,'Limited mission slots enforced');
  assert.equal((await request(url,other+'/leave',{},lead)).status,200);
  assert.equal((await request(url,other+'/join',{},member)).status,200,'Slot freed by leaving');
  assert.equal((await request(url,other+'/close',{note:'Auftrag zurückgezogen'},mod)).status,200);
  assert.equal((await request(url,other+'/submit',{note:'Hiermit abgeschlossen'},member)).status,409,'Closed missions cannot be submitted');
  assert.equal((await request(url,other+'/close',{note:'Nochmal'},owner)).status,409);
  const db=new DatabaseSync(path.join(dir,'hub.sqlite'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM clan_missions').get().n,2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM clan_mission_claims WHERE status=\'approved\'').get().n,1);
  db.close();
  assert.equal((await request(url,'/api/hq/clan/members',{handle:'MissionMember',clan:'remove'},owner)).status,200);
  assert.equal((await request(url,api,undefined,member)).status,403,'Removed member loses mission data');
  assert.equal((await request(url,other+'/join',{},member)).status,403);
  const afterDeparture=(await request(url,api,undefined,owner)).data.missions;
  assert.equal(afterDeparture.find(x=>x.id===all.data.id).participants,0,'Unfinished participation withdrawn on departure');
  const audit=(await request(url,'/api/hq/mod/audit',undefined,owner)).data.history;
  assert.ok(audit.some(a=>a.action==='clan_mission_approved'));
  assert.ok(audit.some(a=>a.action==='clan_mission_created'));
  assert.ok(audit.some(a=>a.action==='clan_mission_closed'));
  await stop(svc);svc=null;
  svc=await boot(dir);url=svc.url;
  assert.equal((await request(url,api,undefined,owner)).data.missions.find(x=>x.id===id).completed,1,'Completion survives restart');
  assert.equal((await request(url,api,undefined,member)).status,403);
 }finally{if(svc)await stop(svc);rmSync(dir,{recursive:true,force:true});}
});
test('Clan-Aufträge page is reachable and provides accessible mission controls',()=>{
 const root=path.join(__dirname,'..');
 const html=readFileSync(path.join(root,'public/index.html'),'utf8');
 const js=readFileSync(path.join(root,'public/hq.js'),'utf8');
 const css=readFileSync(path.join(root,'public/hq.css'),'utf8');
 const backend=readFileSync(path.join(root,'clan-hq.js'),'utf8');
 for(const id of ['missionsPanel','missionsTitle','missionList','missionGate','missionSummary','missionFilter','missionReload','newMissionBtn'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/data-tab="missions"/);
 for(const anchor of ['function showMissionForm','async function loadMissions','function renderMissions','function showMissionSubmitForm','data-mission="join"'])
  assert.ok(js.includes(anchor),anchor);
 assert.match(js,/esc\(m\.description\)/);
 assert.match(css,/\.mission-card/);
 assert.match(backend,/clan_missions/);
 assert.match(backend,/clan_mission_claims/);
});
