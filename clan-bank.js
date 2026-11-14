'use strict';
// A manually managed, private ledger for in-game clan money (never real money).
// All amounts are stored in thousandths of one million to avoid float rounding.
function initClanBank({db,json,readBody,errors,requireUser,checkRate,now}) {
 db.exec(`CREATE TABLE IF NOT EXISTS clan_bank_account (
  id INTEGER PRIMARY KEY CHECK(id=1), balance_milli INTEGER NOT NULL DEFAULT 0 CHECK(balance_milli>=0), updated_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS clan_bank_requests (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, reason TEXT NOT NULL, amount_milli INTEGER NOT NULL CHECK(amount_milli>0),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','approved','rejected','paid')),
  created_at TEXT NOT NULL, decided_at TEXT, decided_by INTEGER REFERENCES users(id),
  decision_note TEXT, paid_at TEXT, paid_by INTEGER REFERENCES users(id), payout_note TEXT
 );
 CREATE TABLE IF NOT EXISTS clan_bank_ledger (
  id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('deposit','withdrawal','balance_set','request_payout')),
  delta_milli INTEGER NOT NULL, before_milli INTEGER NOT NULL, after_milli INTEGER NOT NULL CHECK(after_milli>=0),
  request_id INTEGER REFERENCES clan_bank_requests(id), note TEXT NOT NULL, created_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS idx_bank_requests_date ON clan_bank_requests(id DESC);
 CREATE INDEX IF NOT EXISTS idx_bank_ledger_date ON clan_bank_ledger(id DESC);`);
 db.prepare('INSERT OR IGNORE INTO clan_bank_account(id,balance_milli,updated_at) VALUES(1,0,?)').run(now());
 const bad=(message)=>{throw errors(400,message)};
 const trim=(v,max)=>typeof v==='string'?v.trim().slice(0,max+1):'';
 const atomic=(fn)=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
 const isOwner=(u)=>u.role==='admin';
 const member=(u)=>!!db.prepare('SELECT 1 FROM clan_memberships WHERE user_id=?').get(u.id);
 const access=(req)=>{const u=requireUser(req);if(!isOwner(u)&&!member(u))throw errors(403,'Clanbank nur für von der Leitung freigeschaltete NoMercy-Mitglieder.');return u;};
 const admin=(req)=>{const u=requireUser(req);if(!isOwner(u))throw errors(403,'Nur die Clanleitung darf die Clanbank verwalten.');return u;};
 const amount=(raw,allowZero=false)=>{
  // JSON numbers are converted without floating point arithmetic by parsing their string representation.
  const v=typeof raw==='string'?raw.trim():typeof raw==='number'?String(raw):'';
  if(!/^(?:0|[1-9]\d{0,8})(?:[.,]\d{1,3})?$/.test(v))bad('Betrag in Mio. mit höchstens drei Nachkommastellen eingeben.');
  const [whole,decimal='']=v.replace(',','.').split('.');
  const milli=Number(whole)*1000+Number(decimal.padEnd(3,'0'));
  if(!Number.isSafeInteger(milli)||(!allowZero&&milli===0))bad('Betrag muss größer als null sein.');
  return milli;
 };
 const validateNote=(v)=>{const s=trim(v,400);if(s.length<8||s.length>400)bad('Eine Begründung mit 8 bis 400 Zeichen ist erforderlich.');return s;};
 const validateId=(v)=>{const id=Number(v);if(!Number.isSafeInteger(id)||id<1)bad('Ungültige Antragsnummer.');return id;};
 const balance=()=>db.prepare('SELECT balance_milli FROM clan_bank_account WHERE id=1').get().balance_milli;
 const logAction=(u,action,id,details)=>db.prepare('INSERT INTO clan_hq_audit(actor_id,action,object_id,details,created_at) VALUES(?,?,?,?,?)').run(u.id,action,id,details,now());
 const move=(actor,kind,value,note,requestId=null)=>{
  const before=balance();const after=kind==='balance_set'?value:before+(kind==='deposit'?value:-value);
  if(!Number.isSafeInteger(after)||after<0)throw errors(409,'Nicht genug Guthaben in der Clanbank.');
  db.prepare('UPDATE clan_bank_account SET balance_milli=?,updated_at=? WHERE id=1').run(after,now());
  const id=Number(db.prepare(`INSERT INTO clan_bank_ledger(actor_id,kind,delta_milli,before_milli,after_milli,request_id,note,created_at)
   VALUES(?,?,?,?,?,?,?,?)`).run(actor.id,kind,after-before,before,after,requestId,note,now()).lastInsertRowid);
  logAction(actor,'clan_bank_'+kind,id,note);
  return {id,balance_milli:after};
 };
 async function api(req,res,url) {
  const p=url.pathname,m=req.method;
  if(p==='/api/hq/bank'){
   if(m!=='GET')throw errors(405,'Methode nicht erlaubt');
   const u=access(req);
   const rows=db.prepare(`SELECT r.*,u.handle AS requester,d.handle AS decided_by_handle,p.handle AS paid_by_handle
    FROM clan_bank_requests r JOIN users u ON u.id=r.user_id
    LEFT JOIN users d ON d.id=r.decided_by LEFT JOIN users p ON p.id=r.paid_by
    ORDER BY r.id DESC LIMIT 200`).all();
   const ledger=db.prepare(`SELECT l.id,l.kind,l.delta_milli,l.before_milli,l.after_milli,l.note,l.created_at,
    l.request_id,u.handle AS actor FROM clan_bank_ledger l JOIN users u ON u.id=l.actor_id
    ORDER BY l.id DESC LIMIT 100`).all();
   return json(res,200,{balance_milli:balance(),is_admin:isOwner(u),requests:rows.map(({user_id,decided_by,paid_by,...r})=>r),ledger});
  }
  if(m!=='POST')throw errors(405,'Methode nicht erlaubt');
  if(p==='/api/hq/bank/requests'){
   const u=access(req);checkRate(req,'bank-request',8,3600000);
   const b=await readBody(req),title=trim(b.title,100),reason=trim(b.reason,600),value=amount(b.amount);
   if(title.length<5||title.length>100||reason.length<15||reason.length>600)bad('Titel (5–100 Zeichen) und Begründung (15–600 Zeichen) erforderlich.');
   const id=Number(db.prepare('INSERT INTO clan_bank_requests(user_id,title,reason,amount_milli,created_at) VALUES(?,?,?,?,?)').run(u.id,title,reason,value,now()).lastInsertRowid);
   return json(res,201,{id,status:'open'});
  }
  if(p==='/api/hq/bank/transactions'){
   const u=admin(req);checkRate(req,'bank-transaction',30,3600000);
   const b=await readBody(req),kind=b.kind,note=validateNote(b.note),value=amount(b.amount,kind==='balance_set');
   if(!['deposit','withdrawal','balance_set'].includes(kind))bad('Ungültige Buchungsart.');
   const result=atomic(()=>move(u,kind,value,note));
   return json(res,201,result);
  }
  const match=p.match(/^\/api\/hq\/bank\/requests\/(\d+)\/(review|payout)$/);
  if(match){const u=admin(req);checkRate(req,'bank-review',30,3600000);
   const id=validateId(match[1]),action=match[2],b=await readBody(req),note=validateNote(b.note);
   if(action==='review'){
    if(!['approve','reject'].includes(b.decision))bad('Genehmigen oder ablehnen auswählen.');
    const result=atomic(()=>{
     const row=db.prepare('SELECT status FROM clan_bank_requests WHERE id=?').get(id);
     if(!row)throw errors(404,'Antrag nicht gefunden.');
     if(!(['open','approved'].includes(row.status))||(row.status==='approved'&&b.decision==='approve'))throw errors(409,'Der Antrag kann nicht erneut so entschieden werden.');
     const status=b.decision==='approve'?'approved':'rejected';
     db.prepare('UPDATE clan_bank_requests SET status=?,decided_at=?,decided_by=?,decision_note=? WHERE id=?').run(status,now(),u.id,note,id);
     logAction(u,'clan_bank_request_'+status,id,note);return {id,status};
    });return json(res,200,result);
   }
   const result=atomic(()=>{
    const row=db.prepare('SELECT status,amount_milli FROM clan_bank_requests WHERE id=?').get(id);
    if(!row)throw errors(404,'Antrag nicht gefunden.');
    if(row.status!=='approved')throw errors(409,'Nur genehmigte, noch nicht ausgezahlte Anträge können verbucht werden.');
    const transfer=move(u,'request_payout',row.amount_milli,note,id);
    db.prepare('UPDATE clan_bank_requests SET status=?,paid_at=?,paid_by=?,payout_note=? WHERE id=?').run('paid',now(),u.id,note,id);
    return {id,status:'paid',balance_milli:transfer.balance_milli};
   });return json(res,200,result);
  }
  throw errors(404,'API nicht gefunden.');
 }
 return {api};
}
module.exports={initClanBank};
