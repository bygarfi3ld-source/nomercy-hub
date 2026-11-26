'use strict';
// Public notice-and-action channel for potentially unlawful user content.
// Contact details stay accessible only to authorized staff.
function initLegalNotices({db,json,readBody,errors,requireStaff,checkRate,now}){
 db.exec('CREATE TABLE IF NOT EXISTS legal_content_notices('+
  'id INTEGER PRIMARY KEY,content_url TEXT NOT NULL,'+
  "category TEXT NOT NULL CHECK(category IN ('listing','event','giveaway','profile','other')),"+
  'reporter_name TEXT NOT NULL,reporter_email TEXT NOT NULL,reason TEXT NOT NULL,'+
  "status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed')),"+
  'created_at TEXT NOT NULL,updated_at TEXT NOT NULL,'+
  'reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,'+
  "review_note TEXT NOT NULL DEFAULT '');"+
  'CREATE INDEX IF NOT EXISTS idx_legal_notice_status ON legal_content_notices(status,created_at)');
 const fail=message=>{throw errors(400,message)};
 const trim=(value,max)=>typeof value==='string'?value.trim().slice(0,max+1):'';
 function ownContentUrl(value,req){
  if(typeof value!=='string'||value.length<2||value.length>350)return null;
  try{
   const site=new URL('https://'+req.headers.host);
   const parsed=new URL(value,site);
   if(parsed.origin!==site.origin||!/^\/(?!\/)/.test(parsed.pathname))return null;
   if(parsed.username||parsed.password||/[\r\n]/.test(value))return null;
   return parsed.pathname+parsed.search+parsed.hash;
  }catch{return null;}
 }
 async function api(req,res,url){
  const p=url.pathname,m=req.method;
  if(p==='/api/content-notices'){
   if(m!=='POST')throw errors(405,'Nur POST erlaubt.');
   checkRate(req,'legal-content-notice',3,3600000);
   const body=await readBody(req);
   const link=ownContentUrl(body.content_url,req);
   const name=trim(body.reporter_name,80),email=trim(body.reporter_email,160),reason=trim(body.reason,1600);
   const category=body.category;
   if(!link||!['listing','event','giveaway','profile','other'].includes(category)||
      name.length<2||name.length>80||!(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/).test(email)||email.length>160||
      reason.length<30||reason.length>1600||body.good_faith!==true)fail('Bitte Link, Name, E-Mail, Sachverhalt und Erklärung vollständig angeben.');
   const id=Number(db.prepare('INSERT INTO legal_content_notices(content_url,category,reporter_name,reporter_email,reason,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
     .run(link,category,name,email,reason,now(),now()).lastInsertRowid);
   return json(res,201,{ok:true,reference:'NM-'+id});
  }
  if(p==='/api/admin/content-notices'){
   if(m!=='GET')throw errors(405,'Nur GET erlaubt.');
   requireStaff(req);
   return json(res,200,{notices:db.prepare('SELECT n.id,n.content_url,n.category,n.reporter_name,n.reporter_email,n.reason,n.status,n.created_at,n.updated_at,n.review_note,u.handle AS reviewed_by FROM legal_content_notices n LEFT JOIN users u ON u.id=n.reviewed_by ORDER BY CASE WHEN n.status=\'open\' THEN 0 ELSE 1 END,n.id DESC LIMIT 100').all()});
  }
  if(p==='/api/admin/content-notices/review'){
   if(m!=='POST')throw errors(405,'Nur POST erlaubt.');
   const staff=requireStaff(req);
   checkRate(req,'legal-content-review',40,3600000);
   const b=await readBody(req),id=Number(b.id),status=b.status,note=trim(b.note,500);
   if(!Number.isSafeInteger(id)||id<1||!['reviewed','dismissed'].includes(status)||
      note.length<10||note.length>500)fail('Aktennummer, Entscheidung und ausführliche Begründung erforderlich.');
   db.exec('BEGIN IMMEDIATE');
   try{
    const current=db.prepare('SELECT status FROM legal_content_notices WHERE id=?').get(id);
    if(!current)throw errors(404,'Meldung nicht gefunden.');
    if(current.status!=='open')throw errors(409,'Meldung bereits bearbeitet.');
    db.prepare('UPDATE legal_content_notices SET status=?,reviewed_by=?,review_note=?,updated_at=? WHERE id=?')
     .run(status,staff.id,note,now(),id);
    db.prepare('INSERT INTO clan_hq_audit(actor_id,action,object_id,details,created_at) VALUES(?,?,?,?,?)')
     .run(staff.id,'legal_content_notice_review',id,'Notice '+id+': '+status,now());
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   return json(res,200,{ok:true});
  }
  throw errors(404,'API nicht gefunden');
 }
 return {api};
}
module.exports={initLegalNotices};
