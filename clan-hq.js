'use strict';
// NoMercy Clan HQ: separate tables; no alteration/removal of legacy event data.
const crypto = require('node:crypto');

function initClanHQ({db,json,readBody,errors,requireUser,requireStaff,checkRate,now}) {
 db.exec(`CREATE TABLE IF NOT EXISTS clan_memberships (
   user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
   clan TEXT NOT NULL CHECK(clan IN ('main','clan2','clan3')),
   approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
   approved_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS clan_join_requests (
   id INTEGER PRIMARY KEY,
   user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
   mc_name TEXT NOT NULL, desired_clan TEXT NOT NULL CHECK(desired_clan IN ('main','clan2','clan3')),
   message TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
   created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
   reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
   review_note TEXT NOT NULL DEFAULT ''
 );
 CREATE INDEX IF NOT EXISTS idx_clan_requests_status ON clan_join_requests(status,updated_at);
 CREATE TABLE IF NOT EXISTS clan_events (
   id INTEGER PRIMARY KEY,creator_id INTEGER NOT NULL REFERENCES users(id),
   title TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,
   starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,max_players INTEGER NOT NULL,
   status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS clan_event_joins (
   event_id INTEGER NOT NULL REFERENCES clan_events(id) ON DELETE CASCADE,
   user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   created_at TEXT NOT NULL, PRIMARY KEY(event_id,user_id)
 );
 CREATE TABLE IF NOT EXISTS clan_giveaways (
   id INTEGER PRIMARY KEY,creator_id INTEGER NOT NULL REFERENCES users(id),
   title TEXT NOT NULL,description TEXT NOT NULL,
   prize_kind TEXT NOT NULL CHECK(prize_kind IN ('money','item')),
   prize_detail TEXT NOT NULL,prize_amount INTEGER NOT NULL DEFAULT 1,
   winner_count INTEGER NOT NULL,ends_at TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,drawn_at TEXT,
   fulfilled_at TEXT, fulfilled_by INTEGER REFERENCES users(id) ON DELETE SET NULL
 );
 CREATE TABLE IF NOT EXISTS clan_giveaway_entries (
   giveaway_id INTEGER NOT NULL REFERENCES clan_giveaways(id) ON DELETE CASCADE,
   user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   created_at TEXT NOT NULL, PRIMARY KEY(giveaway_id,user_id)
 );
 CREATE TABLE IF NOT EXISTS clan_giveaway_winners (
   giveaway_id INTEGER NOT NULL REFERENCES clan_giveaways(id) ON DELETE CASCADE,
   user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   position INTEGER NOT NULL, PRIMARY KEY(giveaway_id,position),UNIQUE(giveaway_id,user_id)
 );
 CREATE TABLE IF NOT EXISTS market_listings (
   id INTEGER PRIMARY KEY,creator_id INTEGER NOT NULL REFERENCES users(id),
   kind TEXT NOT NULL CHECK(kind IN ('offer','search','service')),
   title TEXT NOT NULL,description TEXT NOT NULL,price_millions INTEGER NOT NULL,
   mc_contact TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',
   created_at TEXT NOT NULL,updated_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS market_reports (
   id INTEGER PRIMARY KEY,listing_id INTEGER NOT NULL REFERENCES market_listings(id),
   reporter_id INTEGER NOT NULL REFERENCES users(id),reason TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'open',created_at TEXT NOT NULL,
   reviewed_by INTEGER REFERENCES users(id),review_note TEXT,
   UNIQUE(listing_id,reporter_id)
 );
 CREATE TABLE IF NOT EXISTS clan_hq_audit (
   id INTEGER PRIMARY KEY,actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
   action TEXT NOT NULL,object_id INTEGER,details TEXT NOT NULL,created_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_hq_giveaways_end ON clan_giveaways(ends_at,status);
 CREATE INDEX IF NOT EXISTS idx_hq_market_status ON market_listings(status,created_at);`);
 // Migrates existing V0.6/V0.7 giveaways safely: old entries stay clan-only.
 if(!db.prepare('PRAGMA table_info(clan_giveaways)').all().some(c=>c.name==='visibility')){
  db.exec("ALTER TABLE clan_giveaways ADD COLUMN visibility TEXT NOT NULL DEFAULT 'clan' CHECK(visibility IN ('clan','public'))");
 }
 const clean=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
 const fail=(message)=>{throw errors(400,message)};
 const runAtomic=(fn)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 const isStaff=(u)=>!!u&&['admin','moderator'].includes(u.role);
 const membership=(u)=>{
  if(!u)return null;
  const m=db.prepare('SELECT clan FROM clan_memberships WHERE user_id=?').get(u.id);
  return m?.clan|| (isStaff(u)?'staff':null);
 };
 const requireMember=(req)=>{const u=requireUser(req);if(!membership(u))throw errors(403,'Nur freigeschaltete NoMercy-Mitglieder können hier teilnehmen.');return u;};
 const audit=(u,action,id,details)=>db.prepare('INSERT INTO clan_hq_audit(actor_id,action,object_id,details,created_at) VALUES(?,?,?,?,?)').run(u.id,action,id,clean(details,400),now());
 function drawOne(id) {
  return runAtomic(()=>{
   const g=db.prepare('SELECT * FROM clan_giveaways WHERE id=?').get(id);
   if(!g || g.status!=='open'||g.ends_at>now())return false;
   const valid=db.prepare(`SELECT ce.user_id FROM clan_giveaway_entries ce
      JOIN users u ON u.id=ce.user_id LEFT JOIN clan_memberships cm ON cm.user_id=u.id
      WHERE ce.giveaway_id=? AND (?='public' OR cm.user_id IS NOT NULL OR u.role IN ('admin','moderator'))
      ORDER BY ce.user_id`).all(id,g.visibility).map(x=>x.user_id);
   const winners=Math.min(valid.length,g.winner_count);
   // Cryptographic CSPRNG with unbiased index selection. Each account can win once.
   for(let i=0;i<winners;i++) {
    const j=crypto.randomInt(i,valid.length);
    [valid[i],valid[j]]=[valid[j],valid[i]];
    db.prepare('INSERT INTO clan_giveaway_winners(giveaway_id,user_id,position) VALUES(?,?,?)').run(id,valid[i],i+1);
   }
   db.prepare("UPDATE clan_giveaways SET status='drawn',drawn_at=? WHERE id=? AND status='open'").run(now(),id);
   return true;
  });
 }
 function drawDue() {
  const ids=db.prepare("SELECT id FROM clan_giveaways WHERE status='open' AND ends_at<=? ORDER BY ends_at ASC LIMIT 100").all(now());
  for(const {id} of ids)drawOne(id);
 }
 // Also draws on a read after a process restart; no reliance on a browser for fairness.
 drawDue();
 const timer=setInterval(()=>{try{drawDue();}catch(e){console.error('Giveaway-Ziehung fehlgeschlagen:',e)}},30000);
 timer.unref?.();
 const giveawayView=(g,u)=>{
  const {creator_id,...v}=g;
  const count=db.prepare('SELECT COUNT(*) AS n FROM clan_giveaway_entries WHERE giveaway_id=?').get(g.id).n;
  const entered=u?!!db.prepare('SELECT 1 FROM clan_giveaway_entries WHERE giveaway_id=? AND user_id=?').get(g.id,u.id):false;
  const winners=g.status==='drawn'?db.prepare(`SELECT w.position,u.handle FROM clan_giveaway_winners w JOIN users u ON u.id=w.user_id
    WHERE w.giveaway_id=? ORDER BY w.position`).all(g.id):[];
  // Participant handles are only shared after the draw (for the animation), or with moderators.
  // Public giveaways never expose the private member roster while open.
  const canSeeRoster=g.status==='drawn'||isStaff(u);
  const participants=canSeeRoster?db.prepare(`SELECT u.handle FROM clan_giveaway_entries en JOIN users u ON u.id=en.user_id
    LEFT JOIN clan_memberships cm ON cm.user_id=u.id
    WHERE en.giveaway_id=? AND (?='public' OR cm.user_id IS NOT NULL OR u.role IN ('admin','moderator'))
    ORDER BY en.created_at ASC LIMIT 1000`).all(g.id,g.visibility).map(x=>x.handle):[];
  return {...v,entries:count,entered,winners,participants,can_enter:!!u&&(g.visibility==='public'||!!membership(u))};
 };
 const eventView=(e,u)=>{
  const {creator_id,...v}=e;
  return {...v,joined:!!db.prepare('SELECT 1 FROM clan_event_joins WHERE event_id=? AND user_id=?').get(e.id,u.id),
   participants:db.prepare('SELECT COUNT(*) AS n FROM clan_event_joins WHERE event_id=?').get(e.id).n};
 };
 const listingView=(e,u)=>{const {creator_id,...v}=e;return {...v,is_owner:!!u&&u.id===creator_id}};
 const safeId=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)fail('Ungültige ID');return n;};
 const future=(value,minMs,maxMs)=>{
  const timestamp=typeof value==='string'?Date.parse(value):NaN;
  if(!Number.isFinite(timestamp)||timestamp<Date.now()+minMs||timestamp>Date.now()+maxMs)fail('Ungültiger Zeitpunkt.');
  return new Date(timestamp).toISOString();
 };
 const postOnly=(method)=>{if(method!=='POST')throw errors(405,'Methode nicht erlaubt');};
 const getOnly=(method)=>{if(method!=='GET')throw errors(405,'Methode nicht erlaubt');};
 async function api(req,res,url,viewer) {
  const p=url.pathname,m=req.method;
  if(p==='/api/hq/me'){
   getOnly(m);
   return json(res,200,{user:viewer?{...viewer,clan:membership(viewer)}:null});
  }
  if(p==='/api/hq/clan/requests'){
   if(m==='GET'){
    const u=requireUser(req);
    if(u.role==='admin'){
     const requests=db.prepare(`SELECT r.id,r.user_id,u.handle,r.mc_name,r.desired_clan,r.message,
       r.status,r.created_at,r.updated_at,r.review_note,a.handle AS reviewed_by_handle
       FROM clan_join_requests r JOIN users u ON u.id=r.user_id
       LEFT JOIN users a ON a.id=r.reviewed_by
       ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.updated_at DESC LIMIT 200`).all();
     return json(res,200,{requests});
    }
    const mine=db.prepare(`SELECT id,mc_name,desired_clan,message,status,created_at,updated_at,review_note
      FROM clan_join_requests WHERE user_id=?`).get(u.id)||null;
    return json(res,200,{request:mine});
   }
   postOnly(m);
   const u=requireUser(req);checkRate(req,'hq-clan-application',4,86400000);
   if(membership(u))throw errors(409,'Du bist bereits für den Clan freigeschaltet.');
   const b=await readBody(req),mc=clean(b.mc_name,16),desired=b.desired_clan,message=clean(b.message,600);
   if(!/^[A-Za-z0-9_]{3,16}$/.test(mc)||!['main','clan2','clan3'].includes(desired)||message.length<20)
    fail('Minecraft-Name, Wunschclan und Erklärung mit mindestens 20 Zeichen angeben.');
   const previous=db.prepare('SELECT id,status,updated_at FROM clan_join_requests WHERE user_id=?').get(u.id);
   if(previous?.status==='pending')throw errors(409,'Deine Anfrage wird bereits geprüft.');
   if(previous?.status==='approved')throw errors(409,'Bereits genehmigt. Wende dich bei Fragen an die Clanleitung.');
   if(previous && Date.now()-Date.parse(previous.updated_at)<24*3600000)
    throw errors(429,'Nach einer Ablehnung kannst du nach 24 Stunden erneut anfragen.');
   runAtomic(()=>{
    if(previous)db.prepare(`UPDATE clan_join_requests SET mc_name=?,desired_clan=?,message=?,status='pending',
      updated_at=?,reviewed_by=NULL,review_note='' WHERE user_id=?`).run(mc,desired,message,now(),u.id);
    else db.prepare(`INSERT INTO clan_join_requests(user_id,mc_name,desired_clan,message,status,created_at,updated_at)
      VALUES(?,?,?,?,'pending',?,?)`).run(u.id,mc,desired,message,now(),now());
    audit(u,'clan_application',u.id,`Anfrage für ${desired}; Minecraft-Name nicht verifiziert`);
   });
   return json(res,201,{ok:true,notice:'Anfrage eingegangen. Nur die Clanleitung kann dich freischalten.'});
  }
  const applicationReview=p.match(/^\/api\/hq\/clan\/requests\/(\d+)\/review$/);
  if(applicationReview){
   postOnly(m);const admin=requireStaff(req,true);checkRate(req,'hq-clan-review',35,3600000);
   const id=safeId(applicationReview[1]),b=await readBody(req),decision=b.decision,clan=b.clan,note=clean(b.note,400);
   if(!['approve','reject'].includes(decision)||note.length<8||(decision==='approve'&&!['main','clan2','clan3'].includes(clan)))
    fail('Entscheidung, Clan und Begründung (mindestens 8 Zeichen) angeben.');
   runAtomic(()=>{
    const application=db.prepare('SELECT * FROM clan_join_requests WHERE id=?').get(id);
    if(!application||application.status!=='pending')throw errors(409,'Diese Anfrage ist nicht mehr offen.');
    const status=decision==='approve'?'approved':'rejected';
    db.prepare(`UPDATE clan_join_requests SET status=?,updated_at=?,reviewed_by=?,review_note=? WHERE id=?`)
     .run(status,now(),admin.id,note,id);
    if(decision==='approve')db.prepare(`INSERT INTO clan_memberships(user_id,clan,approved_by,approved_at) VALUES(?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET clan=excluded.clan,approved_by=excluded.approved_by,approved_at=excluded.approved_at`)
     .run(application.user_id,clan,admin.id,now());
    audit(admin,'clan_application_review',application.user_id,`Antrag #${id}: ${status}${decision==='approve'?` → ${clan}`:''}; ${note}`);
   });
   return json(res,200,{ok:true});
  }
  if(p==='/api/hq/clan/members'){
   if(m==='GET'){
    requireStaff(req,true);
    return json(res,200,{members:db.prepare(`SELECT u.handle,cm.clan,cm.approved_at FROM clan_memberships cm JOIN users u ON u.id=cm.user_id
     ORDER BY cm.approved_at DESC LIMIT 300`).all()});
   }
   postOnly(m);const staff=requireStaff(req,true);checkRate(req,'hq-members',20,3600000);
   const b=await readBody(req),handle=clean(b.handle,20),clan=b.clan;
   if(!/^[A-Za-z0-9_]{3,20}$/.test(handle)||!['main','clan2','clan3','remove'].includes(clan))fail('Hub-Benutzername und Clan auswählen.');
   const target=db.prepare('SELECT id FROM users WHERE handle=?').get(handle);
   if(!target)throw errors(404,'Hub-Konto nicht gefunden.');
   runAtomic(()=>{
    if(clan==='remove')db.prepare('DELETE FROM clan_memberships WHERE user_id=?').run(target.id);
    else db.prepare(`INSERT INTO clan_memberships(user_id,clan,approved_by,approved_at) VALUES(?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET clan=excluded.clan,approved_by=excluded.approved_by,approved_at=excluded.approved_at`).run(target.id,clan,staff.id,now());
    if(clan!=='remove')db.prepare(`UPDATE clan_join_requests SET status='approved',updated_at=?,reviewed_by=?,review_note=?
      WHERE user_id=? AND status='pending'`).run(now(),staff.id,'Manuell durch Clanleitung freigeschaltet.',target.id);
    audit(staff,'clan_member',target.id,`${handle} -> ${clan}`);
   });
   return json(res,200,{ok:true});
  }
  if(p==='/api/hq/events'){
   const u=requireMember(req);
   if(m==='GET'){
    const rows=db.prepare(`SELECT e.*,u.handle AS creator_handle FROM clan_events e JOIN users u ON u.id=e.creator_id
     WHERE e.status!='hidden' ORDER BY e.starts_at ASC LIMIT 100`).all();
    return json(res,200,{events:rows.map(e=>eventView(e,u))});
   }
   postOnly(m);const staff=requireStaff(req);checkRate(req,'hq-event-create',10,3600000);
   const b=await readBody(req),title=clean(b.title,80),description=clean(b.description,700),category=b.category,
    max=Number(b.max_players),start=future(b.starts_at,60000,30*86400000),duration=Number(b.duration_minutes);
   if(title.length<5||description.length<10||!['FFA','Baseraid','Turnier','Training','Community'].includes(category)||
    !Number.isSafeInteger(max)||max<2||max>100||!Number.isSafeInteger(duration)||duration<15||duration>480)fail('Eventdaten ungültig.');
   const id=Number(db.prepare(`INSERT INTO clan_events(creator_id,title,category,description,starts_at,ends_at,max_players,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).run(staff.id,title,category,description,start,new Date(Date.parse(start)+duration*60000).toISOString(),max,now()).lastInsertRowid);
   return json(res,201,{id});
  }
  const ev=p.match(/^\/api\/hq\/events\/(\d+)\/(join|status)$/);
  if(ev){postOnly(m);const id=safeId(ev[1]);
   if(ev[2]==='join'){
    const u=requireMember(req);checkRate(req,'hq-event-join',30);
    const outcome=runAtomic(()=>{
     const e=db.prepare('SELECT * FROM clan_events WHERE id=?').get(id);
     if(!e||e.status!=='open'||e.ends_at<=now())throw errors(404,'Event nicht verfügbar.');
     const joined=db.prepare('SELECT 1 FROM clan_event_joins WHERE event_id=? AND user_id=?').get(id,u.id);
     if(joined){db.prepare('DELETE FROM clan_event_joins WHERE event_id=? AND user_id=?').run(id,u.id);return false;}
     const n=db.prepare('SELECT COUNT(*) AS n FROM clan_event_joins WHERE event_id=?').get(id).n;
     if(n>=e.max_players)throw errors(409,'Alle Plätze vergeben.');
     db.prepare('INSERT INTO clan_event_joins(event_id,user_id,created_at) VALUES(?,?,?)').run(id,u.id,now());return true;
    });return json(res,200,{joined:outcome});
   }
   const staff=requireStaff(req);const b=await readBody(req);
   if(!['closed','hidden','open'].includes(b.status))fail('Ungültiger Status.');
   const note=clean(b.note,400);if(note.length<8)fail('Begründung mit mindestens 8 Zeichen angeben.');
   const e=db.prepare('SELECT status FROM clan_events WHERE id=?').get(id);
   if(!e)throw errors(404,'Event nicht gefunden');
   runAtomic(()=>{db.prepare('UPDATE clan_events SET status=? WHERE id=?').run(b.status,id);audit(staff,'clan_event_status',id,`${e.status} -> ${b.status}: ${note}`)});
   return json(res,200,{ok:true});
  }
  if(p==='/api/hq/giveaways'){
   if(m==='GET'){
    drawDue();const rows=db.prepare(`SELECT g.*,u.handle AS creator_handle FROM clan_giveaways g
      JOIN users u ON u.id=g.creator_id
      WHERE g.visibility='public' OR ?=1 ORDER BY g.created_at DESC LIMIT 100`).all(membership(viewer)?1:0);
    return json(res,200,{giveaways:rows.map(g=>giveawayView(g,viewer))});
   }
   postOnly(m);const staff=requireStaff(req);checkRate(req,'hq-giveaway-create',6,3600000);
   const b=await readBody(req),title=clean(b.title,80),description=clean(b.description,700),kind=b.prize_kind,
    prize=clean(b.prize_detail,100),amount=Number(b.prize_amount),count=Number(b.winner_count),end=future(b.ends_at,60000,30*86400000),visibility=b.visibility||'clan';
   if(title.length<5||description.length<10||!['money','item'].includes(kind)||prize.length<2||
     !Number.isSafeInteger(amount)||amount<1||amount>1000000000||!Number.isSafeInteger(count)||count<1||count>20||!['public','clan'].includes(visibility))fail('Giveaway-Angaben ungültig.');
   const id=Number(db.prepare(`INSERT INTO clan_giveaways(creator_id,title,description,prize_kind,prize_detail,prize_amount,winner_count,ends_at,created_at,visibility)
     VALUES(?,?,?,?,?,?,?,?,?,?)`).run(staff.id,title,description,kind,prize,amount,count,end,now(),visibility).lastInsertRowid);
   audit(staff,'giveaway_created',id,`${title} [${visibility}]`);
   return json(res,201,{id});
  }
  const gm=p.match(/^\/api\/hq\/giveaways\/(\d+)(?:\/(enter|cancel|fulfill))?$/);
  if(gm){const id=safeId(gm[1]);
   if(m==='GET'&&!gm[2]){
    drawOne(id);
    const g=db.prepare('SELECT g.*,u.handle AS creator_handle FROM clan_giveaways g JOIN users u ON u.id=g.creator_id WHERE g.id=?').get(id);
    if(!g|| (g.visibility==='clan'&&!membership(viewer)))throw errors(404,'Giveaway nicht gefunden');
    return json(res,200,{giveaway:giveawayView(g,viewer)});
   }
   postOnly(m);
   if(gm[2]==='enter'){
    const u=requireUser(req);checkRate(req,'hq-giveaway-enter',25);
    const entered=runAtomic(()=>{
     const g=db.prepare('SELECT status,ends_at,visibility FROM clan_giveaways WHERE id=?').get(id);
     if(!g||g.status!=='open'||g.ends_at<=now())throw errors(409,'Giveaway ist beendet.');
     if(g.visibility==='clan'&&!membership(u))throw errors(403,'Nur freigeschaltete NoMercy-Mitglieder dürfen bei diesem Giveaway teilnehmen.');
     if(db.prepare('SELECT 1 FROM clan_giveaway_entries WHERE giveaway_id=? AND user_id=?').get(id,u.id)){
      db.prepare('DELETE FROM clan_giveaway_entries WHERE giveaway_id=? AND user_id=?').run(id,u.id);return false;
     }
     if(db.prepare('SELECT COUNT(*) AS n FROM clan_giveaway_entries WHERE giveaway_id=?').get(id).n>=1000)throw errors(409,'Teilnehmerlimit erreicht.');
     db.prepare('INSERT INTO clan_giveaway_entries(giveaway_id,user_id,created_at) VALUES(?,?,?)').run(id,u.id,now());return true;
    });return json(res,200,{entered});
   }
   const staff=requireStaff(req);const b=await readBody(req);const note=clean(b.note,400);
   if(note.length<8)fail('Grund mit mindestens 8 Zeichen erforderlich.');
   if(gm[2]==='fulfill'){
    runAtomic(()=>{
     const g=db.prepare('SELECT status,fulfilled_at FROM clan_giveaways WHERE id=?').get(id);
     if(!g||g.status!=='drawn'||g.fulfilled_at)throw errors(409,'Gewinner müssen feststehen und dürfen noch nicht als ausgegeben markiert sein.');
     db.prepare('UPDATE clan_giveaways SET fulfilled_at=?,fulfilled_by=? WHERE id=?').run(now(),staff.id,id);
     audit(staff,'giveaway_fulfilled',id,note);
    });return json(res,200,{ok:true});
   }
   const changed=runAtomic(()=>{
    const g=db.prepare('SELECT status FROM clan_giveaways WHERE id=?').get(id);
    if(!g||g.status!=='open')throw errors(409,'Bereits beendet oder nicht vorhanden.');
    db.prepare("UPDATE clan_giveaways SET status='cancelled' WHERE id=?").run(id);
    audit(staff,'giveaway_cancel',id,note);return true;
   });return json(res,200,{ok:changed});
  }
  if(p==='/api/hq/market'){
   if(m==='GET'){
    const rows=db.prepare(`SELECT m.*,u.handle AS creator_handle FROM market_listings m JOIN users u ON u.id=m.creator_id
      WHERE m.status='open' ORDER BY m.created_at DESC LIMIT 150`).all();
    return json(res,200,{listings:rows.map(x=>listingView(x,viewer))});
   }
   postOnly(m);const u=requireUser(req);checkRate(req,'hq-market-create',8,3600000);
   const b=await readBody(req),kind=b.kind,title=clean(b.title,80),description=clean(b.description,1000),
    mc=clean(b.mc_contact,16),price=Number(b.price_millions);
   if(!['offer','search','service'].includes(kind)||title.length<5||description.length<10||
      !/^[A-Za-z0-9_]{3,16}$/.test(mc)||!Number.isSafeInteger(price)||price<0||price>1000000000)fail('Inserat unvollständig oder ungültig.');
   const id=Number(db.prepare(`INSERT INTO market_listings(creator_id,kind,title,description,price_millions,mc_contact,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?)`).run(u.id,kind,title,description,price,mc,now(),now()).lastInsertRowid);
   return json(res,201,{id});
  }
  const lm=p.match(/^\/api\/hq\/market\/(\d+)\/(close|moderate|report)$/);
  if(lm){postOnly(m);const id=safeId(lm[1]),act=lm[2],u=requireUser(req);
   if(act==='close'){
    const row=db.prepare('SELECT creator_id,status FROM market_listings WHERE id=?').get(id);
    if(!row)throw errors(404,'Inserat nicht gefunden');
    if(row.creator_id!==u.id&&!isStaff(u))throw errors(403,'Nur Ersteller oder Moderation.');
    db.prepare("UPDATE market_listings SET status='closed',updated_at=? WHERE id=? AND status='open'").run(now(),id);
    return json(res,200,{ok:true});
   }
   if(act==='moderate'){
    const staff=requireStaff(req);const b=await readBody(req),status=b.status,note=clean(b.note,400);
    if(!['hidden','open','closed'].includes(status)||note.length<8)fail('Status und Begründung erforderlich.');
    const row=db.prepare('SELECT status FROM market_listings WHERE id=?').get(id);if(!row)throw errors(404,'Inserat nicht gefunden');
    runAtomic(()=>{db.prepare('UPDATE market_listings SET status=?,updated_at=? WHERE id=?').run(status,now(),id);audit(staff,'market_status',id,`${row.status} -> ${status}: ${note}`)});
    return json(res,200,{ok:true});
   }
   checkRate(req,'hq-market-report',10,3600000);
   const b=await readBody(req),reason=clean(b.reason,500);
   if(reason.length<15)fail('Bitte den Verdacht mit mindestens 15 Zeichen erklären.');
   if(!db.prepare("SELECT 1 FROM market_listings WHERE id=? AND status='open'").get(id))throw errors(404,'Inserat nicht gefunden.');
   try{db.prepare('INSERT INTO market_reports(listing_id,reporter_id,reason,created_at) VALUES(?,?,?,?)').run(id,u.id,reason,now());}
   catch(e){if(String(e.message).includes('UNIQUE'))throw errors(409,'Dieses Inserat hast du schon gemeldet.');throw e;}
   return json(res,201,{ok:true});
  }
  if(p==='/api/hq/mod/market'){
   getOnly(m);requireStaff(req);
   return json(res,200,{reports:db.prepare(`SELECT r.*,u.handle AS reporter,m.title AS listing_title,m.status AS listing_status
      FROM market_reports r JOIN users u ON u.id=r.reporter_id JOIN market_listings m ON m.id=r.listing_id ORDER BY r.id DESC LIMIT 100`).all(),
    listings:db.prepare(`SELECT m.id,m.title,m.status,u.handle AS creator_handle FROM market_listings m
      JOIN users u ON u.id=m.creator_id WHERE m.status!='open' ORDER BY m.id DESC LIMIT 100`).all()});
  }
  if(p==='/api/hq/mod/market/review'){
   postOnly(m);const staff=requireStaff(req);checkRate(req,'hq-market-review',30,3600000);
   const b=await readBody(req),id=safeId(b.id),status=b.status,note=clean(b.note,400);
   if(!['reviewed','dismissed'].includes(status)||note.length<8)fail('Status und Notiz erforderlich.');
   const r=db.prepare('SELECT status FROM market_reports WHERE id=?').get(id);if(!r)throw errors(404,'Meldung nicht gefunden');
   runAtomic(()=>{db.prepare('UPDATE market_reports SET status=?,reviewed_by=?,review_note=? WHERE id=?').run(status,staff.id,note,id);audit(staff,'market_report_review',id,`${r.status} -> ${status}: ${note}`)});
   return json(res,200,{ok:true});
  }
  if(p==='/api/hq/mod/audit'){
   getOnly(m);requireStaff(req);
   return json(res,200,{history:db.prepare(`SELECT a.id,a.action,a.object_id,a.details,a.created_at,u.handle AS actor
     FROM clan_hq_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100`).all()});
  }
  throw errors(404,'API nicht gefunden');
 }
 return {api, membership};
}
module.exports={initClanHQ};
