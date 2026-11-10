'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {mkdtempSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const net = require('node:net');

function freePort() {
  return new Promise((resolve,reject) => {
    const server=net.createServer();
    server.once('error', reject);
    server.listen(0,'127.0.0.1', () => {
      const port=server.address().port;
      server.close(() => resolve(port));
    });
  });
}
function delay(ms) {return new Promise(resolve => setTimeout(resolve,ms));}

test('privater Hub: Zugangsschutz, keine Demo-Events, Accounts und Events', {timeout:30000}, async () => {
  const dir=mkdtempSync(path.join(tmpdir(),'nomercy-test-'));
  const port=await freePort();
  const url=`http://127.0.0.1:${port}`;
  const auth='Basic '+Buffer.from('nomercy:only-for-the-automated-test').toString('base64');
  const server=spawn(process.execPath,['server.js'], {
    cwd:path.resolve(__dirname,'..'),
    env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,TEST_ACCESS_USER:'nomercy',TEST_ACCESS_PASSWORD:'only-for-the-automated-test',SITE_PREVIEW_LOCK:'1',NODE_ENV:'production'},
    stdio:['ignore','pipe','pipe']
  });
  let log='';server.stderr.on('data',b=>{log+=b.toString()});
  const req=(route,opts={})=>fetch(url+route,{...opts,headers:{Authorization:auth,...opts.headers}});
  async function json(route,body,cookie){return req(route,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});}
  try{
    let ready=false;
    for(let i=0;i<75;i++){
      if(server.exitCode!==null)break;
      try{const r=await fetch(url+'/healthz');if(r.ok){ready=true;break}}catch{}
      await delay(120);
    }
    assert.equal(ready,true,'Server startet nicht: '+log);
    assert.equal((await fetch(url+'/')).status,401,'Anonyme Besucher dürfen die Testseite nicht sehen');
    assert.equal((await fetch(url+'/api/events')).status,401,'Auch die API muss geschützt sein');
    assert.equal((await req('/')).status,200,'Mit gültigem Testzugang ist die Homepage sichtbar');
    assert.equal((await req('/api/health')).status,200);
    assert.equal((await req('/healthz')).status,200);
    const stats=await (await req('/api/stats')).json();
    assert.equal(stats.events,0,'Keine erfundenen Events');
    assert.equal(stats.users,0);
    const bad=await json('/api/register',{handle:'x',password:'short'});
    assert.equal(bad.status,400);
    const registration=await json('/api/register',{handle:'Tester_01',password:'a-strong-temporary-test-password'});
    assert.equal(registration.status,201,'Registrierung: '+await registration.clone().text());
    const cookie=registration.headers.get('set-cookie').split(';')[0];
    const me=await (await req('/api/me',{headers:{Cookie:cookie}})).json();
    assert.equal(me.user.handle,'Tester_01');
    const upcoming=new Date(Date.now()+3600000).toISOString();
    const created=await json('/api/events',{
      title:'Offenes Overworld FFA',type:'FFA',dimension:'Overworld',mc_host:'ByGarfi3ld',note:'PvP ist erlaubt und Items können verloren gehen.',max_players:20,starts_at:upcoming,duration_minutes:90
    },cookie);
    assert.equal(created.status,201,'Event erstellen: '+await created.clone().text());
    const createdId=(await created.json()).id;
    const events=await (await req('/api/events',{headers:{Cookie:cookie}})).json();
    assert.equal(events.events.length,1);
    assert.equal(events.events[0].is_demo,false);
    const joined=await json(`/api/events/${createdId}/join`,{},cookie);
    assert.equal(joined.status,200);
    assert.equal((await joined.json()).joined,true);
    const report=await json(`/api/events/${createdId}/report`,{
      reason:'Verdacht auf TPA-Trap',details:'Dies ist eine ausreichend lange Testmeldung für den Report.',confirm_truth:true
    },cookie);
    assert.equal(report.status,201,'Report: '+await report.clone().text());
    assert.equal((await json(`/api/events/${createdId}/report`,{reason:'Verdacht auf TPA-Trap',details:'Zweite Meldung mit genug Zeichen',confirm_truth:true},cookie)).status,409);
    assert.equal((await json(`/api/events/${createdId}/close`,{},cookie)).status,200);
    const after=await (await req('/api/stats')).json();
    assert.equal(after.events,0);
    assert.equal((await req('/api/admin/reports')).status,403,'Admin-Daten bleiben ohne Secret geheim');
  }finally{
    server.kill('SIGTERM');
    await new Promise(resolve=>{if(server.exitCode!==null)resolve();else {server.once('exit',resolve);setTimeout(resolve,1000);}});
    rmSync(dir,{recursive:true,force:true});
  }
});

test('öffentlicher Hub: Lesen ohne Login, Schreiben nur mit Hub-Konto', {timeout:30000}, async () => {
 const dir=mkdtempSync(path.join(tmpdir(),'nomercy-public-test-'));
 const port=await freePort();
 const url=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['server.js'], {
  cwd:path.resolve(__dirname,'..'),
  env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,NODE_ENV:'production',
   TEST_ACCESS_PASSWORD:'unused-but-still-set-preview-password',SITE_PREVIEW_LOCK:'0'},
  stdio:['ignore','pipe','pipe']
 });
 let log='';server.stderr.on('data',b=>{log+=b.toString()});
 const post=(route,body,cookie)=>fetch(url+route,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 try {
  let ready=false;
  for(let i=0;i<75;i++){
   if(server.exitCode!==null)break;
   try{const res=await fetch(url+'/healthz');if(res.ok){ready=true;break;}}catch{}
   await delay(120);
  }
  assert.equal(ready,true,'Server startet nicht: '+log);
  const homepage=await fetch(url+'/');
  assert.equal(homepage.status,200,'Startseite muss ohne Anmeldung sichtbar sein');
  assert.match(await homepage.text(),/NoMercy Hub/);
  assert.equal((await fetch(url+'/api/events')).status,200,'Events müssen öffentlich lesbar sein');
  assert.equal((await fetch(url+'/api/stats')).status,200,'Statistiken müssen öffentlich sein');
  assert.deepEqual((await (await fetch(url+'/api/me')).json()).user,null);
  const upcoming=new Date(Date.now()+3600000).toISOString();
  const event={title:'Öffentliches Community-FFA',type:'FFA',dimension:'Overworld',mc_host:'ByGarfi3ld',note:'Das ist ein Event für den öffentlichen Test.',max_players:20,starts_at:upcoming,duration_minutes:90};
  assert.equal((await post('/api/events',event)).status,401,'Event erstellen erfordert Login');
  assert.equal((await post('/api/events/1/join',{})).status,404,'Unbekannte Event-ID gibt 404 zurück');
  const register=await post('/api/register',{handle:'PublicTester',password:'strong-test-password-2026'});
  assert.equal(register.status,201,'Konto muss angelegt werden können');
  const cookie=register.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/events',event,cookie)).status,201,'Account darf Event erstellen');
  assert.equal((await fetch(url+'/api/events')).status,200,'Auch nach Erstellung öffentlich lesbar');
  assert.equal((await post('/api/events/1/join',{})).status,401,'Teilnahme benötigt Konto');
  assert.equal((await post('/api/events/1/report',{reason:'Irreführendes Event',details:'Hinreichend langer Hinweistext',confirm_truth:true})).status,401,'Meldung benötigt Konto');
  assert.equal((await fetch(url+'/api/admin/reports')).status,403,'Moderation bleibt geschützt');
 }finally{
  server.kill('SIGTERM');
  await new Promise(resolve=>{if(server.exitCode!==null)resolve();else{server.once('exit',resolve);setTimeout(resolve,1000);}});
  rmSync(dir,{recursive:true,force:true});
 }
});
