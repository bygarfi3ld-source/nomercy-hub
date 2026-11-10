'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const net=require('node:net');
const token='moderation-secret-for-integration-tests-only-2026';
function port(){return new Promise((resolve,reject)=>{const srv=net.createServer();srv.once('error',reject);srv.listen(0,'127.0.0.1',()=>{const p=srv.address().port;srv.close(()=>resolve(p))})})}
async function boot(dir,adminToken=token){const p=await port(),url=`http://127.0.0.1:${p}`;
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(p),HOST:'127.0.0.1',DATA_DIR:dir,NODE_ENV:'development',SITE_PREVIEW_LOCK:'0',ADMIN_BOOTSTRAP_TOKEN:adminToken},stdio:['ignore','pipe','pipe']});let log='';child.stderr.on('data',s=>{log+=s.toString()});
 for(let i=0;i<90;i++){if(child.exitCode!==null)break;try{const r=await fetch(url+'/healthz');if(r.ok)return {child,url}}catch{}await new Promise(r=>setTimeout(r,100))}
 throw Error('server did not start: '+log);
}
async function stop(child){child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)resolve();else{child.once('exit',resolve);setTimeout(resolve,1500)}})}
function api(url,route,method='GET',body,cookie){return fetch(url+route,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})})}
function post(url,route,body,cookie){return api(url,route,'POST',body,cookie)}

test('Moderator-Rollen, Meldungen, Event-Status, Auditlog und dauerhafte DB-Migration', {timeout:45000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nomercy-mod-'));let instance;
 try{
  instance=await boot(dir);const {url}=instance;
  const a=await post(url,'/api/register',{handle:'OwnerNM',password:'owner-password-very-long'});
  assert.equal(a.status,201);const ac=a.headers.get('set-cookie').split(';')[0];
  const b=await post(url,'/api/register',{handle:'ModNM',password:'moderator-password-long'});
  assert.equal(b.status,201);const bc=b.headers.get('set-cookie').split(';')[0];
  const c=await post(url,'/api/register',{handle:'ReporterNM',password:'reporter-password-long'});
  assert.equal(c.status,201);const cc=c.headers.get('set-cookie').split(';')[0];
  assert.equal((await api(url,'/api/admin/reports')).status,403);
  assert.equal((await api(url,'/api/admin/reports','GET',null,ac)).status,403);
  assert.equal((await api(url,'/api/admin/overview','GET',null,bc)).status,403);
  assert.equal((await post(url,'/api/admin/claim',{token:'wrong-token'},ac)).status,403);
  assert.equal((await post(url,'/api/admin/claim',{token},ac)).status,200);
  assert.equal((await post(url,'/api/admin/claim',{token},bc)).status,409,'Only one owner bootstrap');
  assert.equal((await (await api(url,'/api/me','GET',null,ac)).json()).user.role,'admin');
  assert.equal((await post(url,'/api/admin/team',{handle:'ModNM',role:'moderator'},ac)).status,200);
  assert.equal((await (await api(url,'/api/me','GET',null,bc)).json()).user.role,'moderator');
  assert.equal((await post(url,'/api/admin/team',{handle:'ReporterNM',role:'moderator'},bc)).status,403,'Mod cannot promote');
  const e=await post(url,'/api/events',{title:'FFA Review Test',type:'FFA',dimension:'Overworld',mc_host:'ByGarfi3ld',note:'Offener Eventtest für die Moderation',max_players:12,starts_at:new Date(Date.now()+7200000).toISOString(),duration_minutes:90},ac);
  assert.equal(e.status,201);const eid=(await e.json()).id;
  const report=await post(url,`/api/events/${eid}/report`,{reason:'Verdacht auf TPA-Trap',details:'Es soll sich um eine irreführende Teleport-Falle handeln.',evidence_url:'https://example.com/evidence',confirm_truth:true},cc);
  assert.equal(report.status,201);
  assert.equal((await (await api(url,'/api/admin/reports?status=open','GET',null,bc)).json()).reports.length,1);
  assert.equal((await post(url,'/api/admin/reports/review',{id:1,status:'reviewed',note:'kurz'},bc)).status,400);
  assert.equal((await post(url,'/api/admin/reports/review',{id:1,status:'reviewed',note:'Video geprüft; Verdacht noch nicht bestätigt.'},bc)).status,200);
  assert.equal((await (await api(url,'/api/admin/reports?status=reviewed','GET',null,bc)).json()).reports[0].status,'reviewed');
  assert.equal((await post(url,'/api/admin/events/status',{id:eid,status:'hidden',note:'Aus Sicherheitsgründen vorerst ausgeblendet.'},bc)).status,200);
  const publicEvents=(await (await api(url,'/api/events')).json()).events;
  assert.equal(publicEvents.length,0,'Hidden must disappear from public list');
  assert.equal((await api(url,`/api/events/${eid}`)).status,404,'Hidden must not expose details via direct URL');
  assert.equal((await api(url,`/api/events/${eid}`,'GET',null,cc)).status,404);
  assert.equal((await api(url,`/api/events/${eid}`,'GET',null,ac)).status,200,'Organizer sees own event');
  assert.equal((await post(url,`/api/events/${eid}/join`,{},cc)).status,409,'Hidden event not joinable');
  assert.equal((await (await api(url,'/api/admin/overview','GET',null,bc)).json()).hidden,1);
  assert.ok((await (await api(url,'/api/admin/history','GET',null,bc)).json()).history.length>=4);
  assert.equal((await post(url,'/api/admin/events/status',{id:eid,status:'open',note:'Verdacht ist nach Rücksprache geklärt.'},ac)).status,200);
  assert.equal((await (await api(url,'/api/events')).json()).events.length,1);
  assert.equal((await post(url,'/api/admin/team',{handle:'ModNM',role:'member'},ac)).status,200);
  assert.equal((await api(url,'/api/admin/reports','GET',null,bc)).status,403,'Demotion takes effect on active sessions');
  assert.equal((await post(url,'/api/admin/team',{handle:'OwnerNM',role:'member'},ac)).status,403,'Admin cannot demote self');
  assert.equal((await api(url,'/api/admin/team','GET',null,cc)).status,403);
  await stop(instance.child);instance=null;
  instance=await boot(dir,'');
  assert.equal((await (await api(instance.url,'/api/me','GET',null,ac)).json()).user.role,'admin','Role survives restart');
  assert.equal((await (await api(instance.url,'/api/admin/history','GET',null,ac)).json()).history.length>=5,true);
  assert.equal((await post(instance.url,'/api/admin/claim',{token},cc)).status,403,'Claim disabled after token removed');
 }finally{if(instance)await stop(instance.child);rmSync(dir,{recursive:true,force:true})}
});
