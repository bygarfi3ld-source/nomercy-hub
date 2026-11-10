'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3030);
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const TEST_USER = process.env.TEST_ACCESS_USER || 'nomercy';
const TEST_PASSWORD = process.env.TEST_ACCESS_PASSWORD || '';
if (process.env.NODE_ENV === 'production' && TEST_PASSWORD.length < 16) {
 console.error('TEST_ACCESS_PASSWORD benötigt: mindestens 16 Zeichen für öffentlichen Testbetrieb.');
 process.exit(1);
}
function protectedPreview(req, res) {
 if (!TEST_PASSWORD) return false; // Local development without a preview password.
 const auth = req.headers.authorization || '';
 let provided = '';
 if (auth.startsWith('Basic ')) {
  try { provided = Buffer.from(auth.slice(6), 'base64').toString('utf8'); } catch {}
 }
 const wanted = `${TEST_USER}:${TEST_PASSWORD}`;
 const aa = crypto.createHash('sha256').update(provided).digest();
 const bb = crypto.createHash('sha256').update(wanted).digest();
 if (crypto.timingSafeEqual(aa, bb)) return false;
 res.writeHead(401, {
  'WWW-Authenticate': 'Basic realm="NoMercy Hub Privat-Test", charset="UTF-8"',
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
 });
 res.end('Dieser NoMercy-Hub-Test ist passwortgeschützt.');
 return true;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'hub.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, handle TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY, creator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
 title TEXT NOT NULL, type TEXT NOT NULL, dimension TEXT NOT NULL,
 mc_host TEXT NOT NULL, note TEXT NOT NULL, max_players INTEGER NOT NULL,
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL,
 is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS registrations (
 event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL, PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS reports (
 id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reason TEXT NOT NULL, details TEXT NOT NULL, evidence_url TEXT,
 status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL,
 UNIQUE(event_id,reporter_id)
);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(ends_at, starts_at);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);`);

// Add optional public profile columns without resetting existing user databases.
for (const [name, definition] of [['mc_name',"TEXT NOT NULL DEFAULT ''"], ['bio',"TEXT NOT NULL DEFAULT ''"]]) {
 if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === name)) {
  db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
 }
}
const now = () => new Date().toISOString();
const errors = (status, message) => Object.assign(new Error(message), { status });
const eventTypes = ['FFA', 'Baseraid', 'Turnier', 'Lootdrop', 'Bauevent', 'Community'];
const dimensions = ['Overworld', 'Nether', 'End', 'Andere'];
const rateMap = new Map();
const SESSION_MS = 7 * 24 * 3600000;
function checkRate(req, key, limit=20, period=60000) {
 const id = (req.socket.remoteAddress || 'unknown') + ':' + key;
 const t = Date.now(); let a = rateMap.get(id) || [];
 a = a.filter(x => x > t - period);
 if (a.length >= limit) throw errors(429, 'Zu viele Anfragen. Bitte später erneut versuchen.');
 a.push(t); rateMap.set(id, a);
 if (rateMap.size > 5000) rateMap.clear();
}
function cookieGet(req, name) {
 const cookie = req.headers.cookie || '';
 return cookie.split(';').map(s => s.trim()).find(s => s.startsWith(name+'='))?.slice(name.length+1) || '';
}
function currentUser(req) {
 const sid = cookieGet(req,'sid'); if(!/^[a-f0-9]{64}$/.test(sid))return null;
 const hash = crypto.createHash('sha256').update(sid).digest('hex');
 return db.prepare(`SELECT users.id,users.handle FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?`).get(hash,Date.now()) || null;
}
function requireUser(req) { const u=currentUser(req); if(!u)throw errors(401,'Bitte zuerst ein Hub-Konto erstellen oder anmelden.'); return u; }
function json(res,status,data, extra={}) {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(data));}
function setSession(res,u) {
 const token=crypto.randomBytes(32).toString('hex');
 db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),u.id, Date.now()+SESSION_MS);
 return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS/1000}${(process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production') ? '; Secure' : ''}`;
}
function passwordHash(pass, salt) {return crypto.pbkdf2Sync(pass, Buffer.from(salt,'hex'),210000,32,'sha256').toString('hex');}
function bounded(v,n=200) {return typeof v==='string'? v.trim().slice(0,n):'';}
function isoInRange(x, min, max) { if(typeof x!=='string')return false;const d=Date.parse(x);return Number.isFinite(d) && d>=min && d<=max; }
async function readBody(req){return await new Promise((resolve,reject)=>{let b=''; req.on('data',c=>{b+=c;if(b.length>16384){reject(errors(413,'Anfrage zu groß'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(b||'{}'));}catch{reject(errors(400,'Ungültiges JSON'));}});req.on('error',reject);});}
function ensureOrigin(req){const origin=req.headers.origin; if(origin){try{const u=new URL(origin);if(u.host!==req.headers.host)throw errors(403,'Nicht erlaubter Ursprung');}catch{throw errors(403,'Nicht erlaubter Ursprung');}}}
const eventSelect = `SELECT e.*, u.handle AS creator_handle,
 (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id) AS participants
 FROM events e LEFT JOIN users u ON u.id=e.creator_id`;
function asEvent(e,viewerId) {const {creator_id,...rest}=e; return {...rest,is_demo:!!e.is_demo,is_owner:!!viewerId && creator_id===viewerId,joined: !!viewerId && !!db.prepare('SELECT 1 FROM registrations WHERE event_id=? AND user_id=?').get(e.id,viewerId)};}
// Older test installations may contain seeded sample events. Remove only those
// marked as demo; never touch events created by actual users.
db.prepare('DELETE FROM events WHERE is_demo=1').run();
function respondError(res,e){console.error(e.status?'':'Server error',e.status?'':e);json(res,e.status||500,{error:e.status?e.message:'Interner Serverfehler'});}
async function api(req,res,url) {
 const p=url.pathname, method=req.method, viewer=currentUser(req);
 if(method!=='GET') ensureOrigin(req);
 if(p==='/api/health'&&method==='GET')return json(res,200,{ok:true,service:'NoMercy Hub'});
 if(p==='/api/me'&&method==='GET'){
  const profile=viewer?db.prepare('SELECT mc_name,bio FROM users WHERE id=?').get(viewer.id):null;
  return json(res,200,{user:viewer?{...viewer,...profile}:null});
 }
 if(p==='/api/profile'&&method==='POST'){
  const u=requireUser(req);checkRate(req,'profile',12,600000);const b=await readBody(req);
  const mc_name=bounded(b.mc_name,16),bio=bounded(b.bio,160);
  if(mc_name && !/^[A-Za-z0-9_]{3,16}$/.test(mc_name)) throw errors(400,'Minecraft-Name: 3–16 Zeichen, nur Buchstaben, Zahlen und _.');
  db.prepare('UPDATE users SET mc_name=?,bio=? WHERE id=?').run(mc_name,bio,u.id);
  return json(res,200,{user:{...u,mc_name,bio},notice:'Profil gespeichert. Minecraft-Identität ist nicht verifiziert.'});
 }
 const playerMatch=p.match(/^\/api\/players\/([A-Za-z0-9_]{3,20})$/);
 if(playerMatch&&method==='GET'){
  const u=db.prepare('SELECT id,handle,mc_name,bio,created_at FROM users WHERE handle=?').get(playerMatch[1]);
  if(!u)throw errors(404,'Hub-Profil nicht gefunden');
  const total=db.prepare('SELECT COUNT(*) AS n FROM events WHERE creator_id=? AND is_demo=0').get(u.id).n;
  const current=db.prepare('SELECT COUNT(*) AS n FROM events WHERE creator_id=? AND status=? AND ends_at>? AND is_demo=0').get(u.id,'open',now()).n;
  return json(res,200,{profile:{handle:u.handle,mc_name:u.mc_name,bio:u.bio,created_at:u.created_at,events_total:total,events_open:current,verified:false}});
 }

 if(p==='/api/register'&&method==='POST') {
  checkRate(req,'register',5,3600000);const b=await readBody(req);
  const handle=bounded(b.handle,20),pass=typeof b.password==='string'?b.password:'';
  if(!/^[A-Za-z0-9_]{3,20}$/.test(handle))throw errors(400,'Hub-Name: 3–20 Zeichen, nur Buchstaben, Zahlen und _.');
  if(pass.length<10||pass.length>128)throw errors(400,'Passwort muss zwischen 10 und 128 Zeichen haben.');
  const salt=crypto.randomBytes(16).toString('hex');let u;
  try{const r=db.prepare('INSERT INTO users(handle,password_hash,salt,created_at) VALUES(?,?,?,?)').run(handle,passwordHash(pass,salt),salt,now());u={id:Number(r.lastInsertRowid),handle};}
  catch(e){if(e.message.includes('UNIQUE'))throw errors(409,'Dieser Hub-Name ist bereits vergeben.'); throw e;}
  return json(res,201,{user:u,notice:'Hub-Account erstellt. Minecraft-Identität ist NICHT verifiziert.'},{'Set-Cookie':setSession(res,u)});
 }
 if(p==='/api/login'&&method==='POST') {
  checkRate(req,'login',12,600000);const b=await readBody(req);const handle=bounded(b.handle,20),pass=typeof b.password==='string'?b.password:'';
  const u=db.prepare('SELECT * FROM users WHERE handle=?').get(handle);
  if(!u || !pass || !crypto.timingSafeEqual(Buffer.from(passwordHash(pass,u.salt),'hex'),Buffer.from(u.password_hash,'hex')))throw errors(401,'Ungültiger Hub-Name oder Passwort.');
  const user={id:u.id,handle:u.handle};return json(res,200,{user},{'Set-Cookie':setSession(res,user)});
 }
 if(p==='/api/logout'&&method==='POST') {
  const sid=cookieGet(req,'sid');if(sid)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(crypto.createHash('sha256').update(sid).digest('hex'));
  return json(res,200,{ok:true},{'Set-Cookie':'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
 }
 if(p==='/api/stats'&&method==='GET') {
  const r=db.prepare('SELECT COUNT(*) AS events FROM events WHERE status=? AND ends_at>? AND is_demo=0').get('open',now());
  const p=db.prepare('SELECT COUNT(*) AS participants FROM registrations r JOIN events e ON e.id=r.event_id WHERE e.status=? AND e.ends_at>? AND e.is_demo=0').get('open',now());
  return json(res,200,{events:r.events,participants:p.participants,users:db.prepare('SELECT COUNT(*) AS n FROM users').get().n});
 }
 if(p==='/api/events'&&method==='GET') {
  const type=url.searchParams.get('type')||''; const dimension=url.searchParams.get('dimension')||'';
  const search=(url.searchParams.get('q')||'').trim().slice(0,80).toLowerCase();
  const mine=url.searchParams.get('mine')==='1';
  const rows=db.prepare(`${eventSelect} WHERE e.status='open' AND e.ends_at>? AND e.is_demo=0
    ORDER BY e.is_demo ASC, e.starts_at ASC, e.created_at DESC LIMIT 200`).all(now());
  let ev=rows.filter(e=>(!type||e.type===type)&&(!dimension||e.dimension===dimension)&&(!mine||(viewer&&e.creator_id===viewer.id))&&(!search||[e.title,e.note,e.mc_host,e.dimension,e.type].some(s=>String(s).toLowerCase().includes(search))));
  return json(res,200,{events:ev.map(e=>asEvent(e,viewer?.id))});
 }
 if(p==='/api/events'&&method==='POST') {
  const u=requireUser(req);checkRate(req,'events',8,3600000);const b=await readBody(req);
  const title=bounded(b.title,70),type=b.type,dimension=b.dimension,host=bounded(b.mc_host,16),note=bounded(b.note,360),max=Number(b.max_players);
  if(title.length<5)throw errors(400,'Titel mindestens fünf Zeichen.');
  if(!eventTypes.includes(type)||!dimensions.includes(dimension))throw errors(400,'Eventart oder Dimension ungültig.');
  if(!/^[A-Za-z0-9_]{3,16}$/.test(host))throw errors(400,'TPA-Ziel muss ein gültiger Minecraft-Spielername sein.');
  if(!Number.isInteger(max)||max<2||max>100)throw errors(400,'Spielerlimit zwischen 2 und 100.');
  const t=Date.now(), start=Date.parse(b.starts_at), duration=Number(b.duration_minutes);
  if(!Number.isFinite(start)||start<t-5*60000||start>t+14*86400000)throw errors(400,'Beginn muss innerhalb der nächsten 14 Tage liegen.');
  if(!Number.isInteger(duration)||duration<15||duration>240)throw errors(400,'Eventdauer zwischen 15 und 240 Minuten.');
  const r=db.prepare('INSERT INTO events(creator_id,title,type,dimension,mc_host,note,max_players,starts_at,ends_at,status,created_at,is_demo) VALUES(?,?,?,?,?,?,?,?,?,?,?,0)').run(u.id,title,type,dimension,host,note,max,new Date(start).toISOString(),new Date(start+duration*60000).toISOString(),'open',now());
  return json(res,201,{id:Number(r.lastInsertRowid)});
 }
 const m=p.match(/^\/api\/events\/(\d+)(?:\/(join|close|report))?$/);
 if(m){
  const id=Number(m[1]),act=m[2]||'';const e=db.prepare('SELECT * FROM events WHERE id=?').get(id);
  if(!e)throw errors(404,'Event nicht gefunden');
  if(method==='GET'&&!act){const full=db.prepare(eventSelect+' WHERE e.id=?').get(id);return json(res,200,{event:asEvent(full,viewer?.id)});}
  if(method==='POST'&&act==='join'){
    const u=requireUser(req);checkRate(req,'join',25);if(e.status!=='open'||(e.ends_at<=now()&&!e.is_demo))throw errors(409,'Dieses Event ist beendet.');
    if(e.is_demo)throw errors(409,'Beispiel-Events können nicht gebucht werden.');
    const already=db.prepare('SELECT 1 FROM registrations WHERE user_id=? AND event_id=?').get(u.id,id);
    if(already){db.prepare('DELETE FROM registrations WHERE event_id=? AND user_id=?').run(id,u.id);return json(res,200,{joined:false});}
    const n=db.prepare('SELECT COUNT(*) AS n FROM registrations WHERE event_id=?').get(id).n;
    if(n>=e.max_players)throw errors(409,'Alle Plätze sind belegt.');
    db.prepare('INSERT INTO registrations(event_id,user_id,created_at) VALUES(?,?,?)').run(id,u.id,now());return json(res,200,{joined:true});
  }
  if(method==='POST'&&act==='close'){
    const u=requireUser(req);if(e.creator_id!==u.id||e.is_demo)throw errors(403,'Du bist nicht der Ersteller.');
    db.prepare('UPDATE events SET status=? WHERE id=?').run('closed',id);return json(res,200,{ok:true});
  }
  if(method==='POST'&&act==='report'){
    const u=requireUser(req);checkRate(req,'report',8,3600000);if(e.is_demo)throw errors(409,'Demo-Events können nicht gemeldet werden.');
    const b=await readBody(req);const reasons=['Verdacht auf TPA-Trap','Verdacht auf Bett-/Respawn-Trap','Irreführendes Event','Beleidigung/Spam','Sonstiger Verstoß'];
    const reason=bounded(b.reason,80),details=bounded(b.details,1500),evidence=bounded(b.evidence_url,500);
    if(!reasons.includes(reason)||details.length<15)throw errors(400,'Bitte Grund und eine Erklärung mit mindestens 15 Zeichen angeben.');
    if(b.confirm_truth!==true)throw errors(400,'Bitte bestätige, dass deine Angaben nach bestem Wissen wahr sind.');
    if(evidence){try{const x=new URL(evidence);if(!['http:','https:'].includes(x.protocol))throw Error();}catch{throw errors(400,'Beweislink muss eine gültige HTTPS-/HTTP-URL sein.');}}
    try{db.prepare('INSERT INTO reports(event_id,reporter_id,reason,details,evidence_url,status,created_at) VALUES(?,?,?,?,?,?,?)').run(id,u.id,reason,details,evidence||null,'open',now());}
    catch(err){if(err.message.includes('UNIQUE'))throw errors(409,'Du hast dieses Event bereits gemeldet.');throw err;}
    return json(res,201,{ok:true,notice:'Meldung wurde gespeichert und muss manuell geprüft werden. Kein automatischer Bann.'});
  }
 }
 // Moderation API only with explicitly configured secret; no public endpoint to list evidence.
 if(p==='/api/admin/reports' && method==='GET') {
  const token=process.env.ADMIN_TOKEN;if(!token||token.length<24||req.headers['x-admin-token']!==token)throw errors(403,'Nicht verfügbar');
  return json(res,200,{reports:db.prepare('SELECT r.*, e.title AS event_title, u.handle AS reporter FROM reports r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 200').all()});
 }
 if(p==='/api/admin/events/status'&&method==='POST'){
  const token=process.env.ADMIN_TOKEN;if(!token||token.length<24||req.headers['x-admin-token']!==token)throw errors(403,'Nicht verfügbar');
  const b=await readBody(req);const id=Number(b.id);
  if(!Number.isInteger(id)||!['open','hidden','closed'].includes(b.status))throw errors(400,'Ungültige Event-Statusänderung');
  const evt=db.prepare('SELECT * FROM events WHERE id=?').get(id);
  if(!evt||evt.is_demo)throw errors(404,'Event nicht gefunden oder nur Demo');
  const r=db.prepare('UPDATE events SET status=? WHERE id=?').run(b.status,id);
  return json(res,200,{ok:r.changes>0});
 }
 if(p==='/api/admin/reports/review'&&method==='POST'){
  const token=process.env.ADMIN_TOKEN;if(!token||token.length<24||req.headers['x-admin-token']!==token)throw errors(403,'Nicht verfügbar');
  const b=await readBody(req);if(!['dismissed','reviewed','open'].includes(b.status)||!Number.isInteger(Number(b.id)))throw errors(400,'Ungültige Statusänderung');
  const r=db.prepare('UPDATE reports SET status=? WHERE id=?').run(b.status,Number(b.id));return json(res,200,{ok:r.changes>0});
 }
 throw errors(404,'API nicht gefunden');
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon'};
function staticFile(req,res,url){
 if(req.method!=='GET')return json(res,405,{error:'Methode nicht erlaubt'});
 let p=decodeURIComponent(url.pathname); if(p==='/')p='/index.html';
 const full=path.resolve(ROOT,'public','.'+p); const base=path.resolve(ROOT,'public');
 if(!full.startsWith(base+path.sep))return json(res,403,{error:'Nicht erlaubt'});
 fs.readFile(full,(err,data)=>{if(err)return json(res,404,{error:'Datei nicht gefunden'});
  res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://mc-heads.net; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});res.end(data);
 });
}
const server=http.createServer(async(req,res)=>{try{if(req.url==='/healthz' && req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true}));}if(protectedPreview(req,res))return;const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/'))await api(req,res,u);else staticFile(req,res,u);}catch(e){respondError(res,e);}});
server.listen(PORT,HOST,()=>console.log(`NoMercy Hub: http://${HOST}:${PORT}`));