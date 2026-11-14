'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const {spawn} = require('node:child_process');
const {mkdtempSync,rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const crypto = require('node:crypto');
const path = require('node:path');
const net = require('node:net');
const sleep = ms => new Promise(r => setTimeout(r,ms));

async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const n=server.address().port;await new Promise(r=>server.close(r));return n;}

test('Upgrade von V0.4 bewahrt Nutzer, Logins, Events und Meldungen', {timeout:30000}, async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nomercy-upgrade-'));
 let child;
 try{
  const db=new DatabaseSync(path.join(dir,'hub.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON;
  CREATE TABLE users(id INTEGER PRIMARY KEY,handle TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,salt TEXT NOT NULL,created_at TEXT NOT NULL,mc_name TEXT NOT NULL DEFAULT '',bio TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT 'member');
  CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
  CREATE TABLE events(id INTEGER PRIMARY KEY,creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,title TEXT NOT NULL,type TEXT NOT NULL,dimension TEXT NOT NULL,mc_host TEXT NOT NULL,note TEXT NOT NULL,max_players INTEGER NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,is_demo INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE registrations(event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL,PRIMARY KEY(event_id,user_id));
  CREATE TABLE reports(id INTEGER PRIMARY KEY,event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,reason TEXT NOT NULL,details TEXT NOT NULL,evidence_url TEXT,status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,reviewed_at TEXT,moderator_note TEXT NOT NULL DEFAULT '',UNIQUE(event_id,reporter_id));
  CREATE TABLE moderation_log(id INTEGER PRIMARY KEY,moderator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,event_id INTEGER,report_id INTEGER,action TEXT NOT NULL,previous_value TEXT,new_value TEXT,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
  CREATE INDEX idx_events_dates ON events(ends_at,starts_at);CREATE INDEX idx_reports_status ON reports(status);CREATE INDEX idx_moderation_log_date ON moderation_log(created_at);`);
  const salt='0123456789abcdef0123456789abcdef';
  const pass='another-strong-test-password';
  const hash=crypto.pbkdf2Sync(pass,Buffer.from(salt,'hex'),210000,32,'sha256').toString('hex');
  const t=new Date().toISOString(),future=new Date(Date.now()+7200000).toISOString();
  db.prepare('INSERT INTO users(id,handle,password_hash,salt,created_at,mc_name,role) VALUES(?,?,?,?,?,?,?)').run(77,'ExistingUser',hash,salt,t,'ExistingMC','member');
  db.prepare('INSERT INTO events(id,creator_id,title,type,dimension,mc_host,note,max_players,starts_at,ends_at,status,created_at,is_demo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)').run(51,77,'Altes FFA bleibt erhalten','FFA','Overworld','ExistingMC','Bewahrtes Event',20,t,future,'open',t);
  db.prepare('INSERT INTO reports(id,event_id,reporter_id,reason,details,status,created_at) VALUES(?,?,?,?,?,?,?)').run(44,51,77,'Verdacht auf TPA-Trap','Alte Meldung bleibt gespeichert','open',t);
  db.close();
  const p=await port(),url=`http://127.0.0.1:${p}`;
  child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(p),HOST:'127.0.0.1',DATA_DIR:dir,NODE_ENV:'development',SITE_PREVIEW_LOCK:'0'},stdio:['ignore','pipe','pipe']});
  let log='';child.stderr.on('data',b=>log+=b.toString());
  let started=false;
  for(let i=0;i<70;i++){try{if((await fetch(url+'/healthz')).ok){started=true;break}}catch{}await sleep(120)}
  assert.equal(started,true,'V1.0 startet nicht nach Migration: '+log);
  const login=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'ExistingUser',password:pass})});
  assert.equal(login.status,200,'Alte Login-Daten gültig');
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const me=await (await fetch(url+'/api/me',{headers:{Cookie:cookie}})).json();
  assert.equal(me.user.handle,'ExistingUser');
  assert.equal(me.user.mc_name,'ExistingMC');
  assert.equal((await fetch(url+'/api/events/51')).status,200,'Altes Event weiterhin sichtbar');
  assert.equal((await fetch(url+'/api/hq/market')).status,200,'Neue Markttabellen bereit');
  await new Promise(r=>{child.once('exit',r);child.kill('SIGTERM')});child=null;
  const check=new DatabaseSync(path.join(dir,'hub.sqlite'));
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM users WHERE id=77').get().n,1);
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM events WHERE id=51').get().n,1);
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM reports WHERE id=44').get().n,1);
  assert.equal(check.prepare('SELECT balance_milli FROM clan_bank_account WHERE id=1').get().balance_milli,0);
  check.close();
 }finally{
  if(child){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1200)])}
  rmSync(dir,{recursive:true,force:true});
 }
});
