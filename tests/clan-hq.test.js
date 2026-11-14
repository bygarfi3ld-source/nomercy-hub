'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const net=require('node:net');
const secret='only-for-integration-tests-not-a-real-admin-secret';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n))});});}
async function boot(data){const port=await freePort(),url=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,NODE_ENV:'development',SITE_PREVIEW_LOCK:'0',ADMIN_BOOTSTRAP_TOKEN:secret},stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',b=>error+=b.toString());
 for(let i=0;i<95;i++){if(child.exitCode!==null)break;try{const r=await fetch(url+'/healthz');if(r.ok)return {url,child};}catch{}await delay(100);}
 child.kill();throw Error('Start fehlgeschlagen: '+error);
}
async function stop(c){if(!c)return;c.child.kill('SIGTERM');await Promise.race([new Promise(r=>c.child.once('exit',r)),delay(1000)]);}
const req=(url,p,body,cookie)=>fetch(url+p,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function response(url,p,body,cookie){const r=await req(url,p,body,cookie);return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const register=async(url,handle)=>{const r=await response(url,'/api/register',{handle,password:'secure-test-password-for-hq'});assert.equal(r.status,201,JSON.stringify(r.data));return r.cookie;};

test('Clan HQ: membership, public market, private events, irreversible draw and payout', {timeout:30000}, async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nomercy-hq-'));let srv;
 try{
  srv=await boot(dir);const url=srv.url;
  const page=await fetch(url+'/');assert.equal(page.status,200);assert.match(await page.text(),/CLAN HQ/);
  const script=await fetch(url+'/hq.js');assert.equal(script.status,200);assert.match(await script.text(),/spinWinners/);
  assert.equal((await response(url,'/api/hq/market')).status,200);
  assert.deepEqual((await response(url,'/api/hq/giveaways')).data.giveaways,[]);
  const admin=await register(url,'HQAdmin'),m1=await register(url,'MemberOne'),m2=await register(url,'MemberTwo'),outsider=await register(url,'Outsider');
  assert.equal((await response(url,'/api/hq/clan/members',{handle:'Outsider',clan:'main'},outsider)).status,403);
  assert.equal((await response(url,'/api/admin/claim',{token:secret},admin)).status,200);
  assert.equal((await response(url,'/api/admin/claim',{token:secret},outsider)).status,409);
  assert.equal((await response(url,'/api/hq/giveaways',{},outsider)).status,403);
  assert.equal((await response(url,'/api/hq/giveaways',{},admin)).status,400);
  for(const [name,clan] of [['MemberOne','clan2'],['MemberTwo','clan3']]){
   assert.equal((await response(url,'/api/hq/clan/members',{handle:name,clan},admin)).status,200);
  }
  const me=await response(url,'/api/hq/me',undefined,m1);assert.equal(me.data.user.clan,'clan2');
  const listing={kind:'offer',title:'Netherite Schwerter',description:'Verkaufe drei verzauberte Schwerter auf HugoSMP.',price_millions:12,mc_contact:'MemberOne'};
  const li=await response(url,'/api/hq/market',listing,m1);assert.equal(li.status,201,JSON.stringify(li.data));const lid=li.data.id;
  const market=(await response(url,'/api/hq/market')).data.listings;assert.equal(market.length,1);assert.equal(market[0].price_millions,12);
  assert.equal((await response(url,`/api/hq/market/${lid}/report`,{reason:'Verdacht auf eine absichtlich falsche Beschreibung.'},outsider)).status,201);
  assert.equal((await response(url,'/api/hq/mod/market',undefined,outsider)).status,403);
  let reports=(await response(url,'/api/hq/mod/market',undefined,admin)).data.reports;
  assert.equal(reports.length,1);
  assert.equal((await response(url,'/api/hq/mod/market/review',{id:reports[0].id,status:'reviewed',note:'Inserat manuell geprüft.'},admin)).status,200);
  assert.equal((await response(url,`/api/hq/market/${lid}/moderate`,{status:'hidden',note:'Nach Prüfung ausgeblendet.'},admin)).status,200);
  assert.equal((await response(url,'/api/hq/market')).data.listings.length,0);
  const future=new Date(Date.now()+7200000).toISOString();
  const event={title:'NoMercy internes FFA',category:'FFA',description:'Interner fairer Kampf mit den Mitgliedern.',starts_at:future,duration_minutes:120,max_players:10};
  assert.equal((await response(url,'/api/hq/events',event,outsider)).status,403);
  const createdEvent=await response(url,'/api/hq/events',event,admin);assert.equal(createdEvent.status,201,JSON.stringify(createdEvent.data));
  assert.equal((await response(url,'/api/hq/events')).status,401);
  assert.equal((await response(url,`/api/hq/events/${createdEvent.data.id}/join`,{},m1)).status,200);
  const giveaway={title:'NoMercy Freitag Drop',description:'Ein kostenloser Gewinn für Clanmitglieder.',prize_kind:'money',prize_detail:'Ingame-Dollar',prize_amount:20,winner_count:2,ends_at:new Date(Date.now()+3600000).toISOString()};
  assert.equal((await response(url,'/api/hq/giveaways',giveaway,m1)).status,403);
  const created=await response(url,'/api/hq/giveaways',giveaway,admin);assert.equal(created.status,201,JSON.stringify(created.data));const gid=created.data.id;
  assert.equal((await response(url,'/api/hq/giveaways')).data.giveaways.length,0,'Private Giveaways bleiben verborgen');
  assert.equal((await response(url,`/api/hq/giveaways/${gid}`)).status,404,'Private Direktlinks sind geschützt');
  assert.equal((await response(url,`/api/hq/giveaways/${gid}/enter`,{},outsider)).status,403);
  assert.equal((await response(url,`/api/hq/giveaways/${gid}/enter`,{},m1)).data.entered,true);
  assert.equal((await response(url,`/api/hq/giveaways/${gid}/enter`,{},m2)).data.entered,true);
  assert.equal((await response(url,`/api/hq/giveaways/${gid}`,undefined,m1)).data.giveaway.entries,2);
  assert.equal((await response(url,`/api/hq/giveaways/${gid}/fulfill`,{note:'Die Gewinne wurden übergeben.'},admin)).status,409);
  // Time travel in isolated test SQLite only; production event deadline is never changed.
  const db=new DatabaseSync(path.join(dir,'hub.sqlite'));
  db.prepare('UPDATE clan_giveaways SET ends_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),gid);
  db.close();
  const drawn=await response(url,`/api/hq/giveaways/${gid}`,undefined,m1);
  assert.equal(drawn.status,200,JSON.stringify(drawn.data));assert.equal(drawn.data.giveaway.status,'drawn');
  assert.equal(drawn.data.giveaway.winners.length,2);
  assert.equal(new Set(drawn.data.giveaway.winners.map(w=>w.handle)).size,2);
  assert.deepEqual(new Set(drawn.data.giveaway.winners.map(w=>w.handle)),new Set(['MemberOne','MemberTwo']));
  assert.equal((await response(url,`/api/hq/giveaways/${gid}/enter`,{},m1)).status,409);
  assert.deepEqual((await response(url,`/api/hq/giveaways/${gid}`,undefined,m2)).data.giveaway.winners,drawn.data.giveaway.winners);
  assert.equal((await response(url,`/api/hq/giveaways/${gid}/fulfill`,{note:'Alle Gewinne im Spiel übergeben.'},admin)).status,200);
  assert.equal((await response(url,`/api/hq/giveaways/${gid}/fulfill`,{note:'Nicht noch einmal.'},admin)).status,409);
  assert.ok((await response(url,`/api/hq/giveaways/${gid}`,undefined,m2)).data.giveaway.fulfilled_at);
  await stop(srv);srv=await boot(dir);
  const persisted=await response(srv.url,`/api/hq/giveaways/${gid}`,undefined,m1);
  assert.equal(persisted.status,200);
  assert.deepEqual(persisted.data.giveaway.winners,drawn.data.giveaway.winners,'Auslosung bleibt nach Neustart gleich.');
  assert.equal((await response(srv.url,'/api/hq/market')).data.listings.length,0,'Moderation bleibt erhalten.');
 }finally{if(srv)await stop(srv);rmSync(dir,{force:true,recursive:true});}
});


test('Giveaway-Reveal bleibt ohne Roulette und respektiert reduzierte Bewegung', () => {
 const fs=require('node:fs');
 const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/hq.css'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/hq.js'),'utf8');
 for(const id of ['drawStage','wheelName','drawPrev','drawNext','spinStart','spinSkip','spinWinners','spinStatus','drawProgressBar']){
  assert.match(html,new RegExp(`id="${id}"`),`Element ${id} fehlt`);
 }
 assert.doesNotMatch(html,/class="wheel(?:-wrap|-ring|-arrow)?"/,'kein Roulette-Rad auf der Oberfläche');
 assert.doesNotMatch(css,/repeating-conic-gradient/,'keine Roulette-Segmente');
 assert.match(css,/prefers-reduced-motion:reduce/,'Bewegungsreduzierung unterstützt');
 assert.match(js,/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/,'reduzierte Bewegung auch im JS');
 assert.match(js,/spinSkip/,'Animationsüberspringen möglich');
 assert.match(js,/setReelName\(w\.handle/,'gespeicherter Gewinner wird angezeigt');
});

test('Öffentliche und private Giveaways: rollenabhängige Sichtbarkeit, Teilnahme und stabile Ziehung', {timeout:30000}, async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nomercy-scope-'));let srv;
 try{
  srv=await boot(dir);const url=srv.url;
  const admin=await register(url,'TestAdmin'),member=await register(url,'TestMember'),visitor=await register(url,'TestVisitor');
  assert.equal((await response(url,'/api/admin/claim',{token:secret},admin)).status,200);
  assert.equal((await response(url,'/api/hq/clan/members',{handle:'TestMember',clan:'clan2'},admin)).status,200);
  const base={title:'Giveaway zur Probe',description:'Nur erfundener Testgewinn.',prize_kind:'money',prize_detail:'Ingame-Dollar',prize_amount:20,winner_count:2,ends_at:new Date(Date.now()+3600000).toISOString()};
  const priv=await response(url,'/api/hq/giveaways',{...base,visibility:'clan'},admin);
  const pub=await response(url,'/api/hq/giveaways',{...base,title:'Öffentlicher Community-Drop',visibility:'public'},admin);
  assert.equal(priv.status,201);assert.equal(pub.status,201);
  const anonList=await response(url,'/api/hq/giveaways');
  assert.equal(anonList.status,200);
  assert.deepEqual(anonList.data.giveaways.map(g=>g.id),[pub.data.id]);
  assert.equal(anonList.data.giveaways[0].visibility,'public');
  assert.equal(anonList.data.giveaways[0].can_enter,false);
  assert.deepEqual(anonList.data.giveaways[0].participants,[],'keine Teilnehmernamen vor Ziehung');
  assert.equal((await response(url,`/api/hq/giveaways/${priv.data.id}`)).status,404);
  assert.equal((await response(url,`/api/hq/giveaways/${priv.data.id}`,undefined,visitor)).status,404);
  assert.equal((await response(url,`/api/hq/giveaways/${pub.data.id}`)).status,200);
  assert.equal((await response(url,`/api/hq/giveaways/${pub.data.id}/enter`,{})).status,401);
  assert.equal((await response(url,`/api/hq/giveaways/${priv.data.id}/enter`,{},visitor)).status,403);
  assert.equal((await response(url,`/api/hq/giveaways/${pub.data.id}/enter`,{},visitor)).data.entered,true);
  assert.equal((await response(url,`/api/hq/giveaways/${pub.data.id}/enter`,{},member)).data.entered,true);
  assert.equal((await response(url,`/api/hq/giveaways/${priv.data.id}/enter`,{},member)).data.entered,true);
  const viewVisitor=await response(url,'/api/hq/giveaways',undefined,visitor);
  assert.deepEqual(viewVisitor.data.giveaways.map(g=>g.id),[pub.data.id]);
  assert.equal(viewVisitor.data.giveaways[0].entered,true);
  const viewMember=await response(url,'/api/hq/giveaways',undefined,member);
  assert.deepEqual(new Set(viewMember.data.giveaways.map(g=>g.id)),new Set([pub.data.id,priv.data.id]));
  const invalid=await response(url,'/api/hq/giveaways',{...base,visibility:'unrestricted'},admin);
  assert.equal(invalid.status,400,'Keine ungültige Berechtigung anlegen');
  // Isolated test database: simulate deadline; real production deadlines are untouched.
  const db=new DatabaseSync(path.join(dir,'hub.sqlite'));
  db.prepare('UPDATE clan_giveaways SET ends_at=? WHERE id IN (?,?)').run(new Date(Date.now()-1000).toISOString(),pub.data.id,priv.data.id);
  db.close();
  const drawn=await response(url,`/api/hq/giveaways/${pub.data.id}`);
  assert.equal(drawn.status,200);
  assert.equal(drawn.data.giveaway.status,'drawn');
  assert.deepEqual(new Set(drawn.data.giveaway.winners.map(x=>x.handle)),new Set(['TestVisitor','TestMember']),'öffentlich zieht auch Nichtmitglieder');
  const privDrawn=await response(url,`/api/hq/giveaways/${priv.data.id}`,undefined,member);
  assert.equal(privDrawn.data.giveaway.winners.length,1);
  assert.equal(privDrawn.data.giveaway.winners[0].handle,'TestMember');
  await stop(srv);srv=await boot(dir);
  assert.deepEqual((await response(srv.url,`/api/hq/giveaways/${pub.data.id}`)).data.giveaway.winners,drawn.data.giveaway.winners);
  assert.equal((await response(srv.url,`/api/hq/giveaways/${priv.data.id}`)).status,404);
 }finally{if(srv)await stop(srv);rmSync(dir,{recursive:true,force:true});}
});

test('Upgrade von V0.7 markiert vorhandene Giveaways standardmäßig als privat', {timeout:30000}, async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nomercy-migrate-'));let srv;
 try{
  srv=await boot(dir);const url=srv.url;
  const admin=await register(url,'MigrateAdmin');
  assert.equal((await response(url,'/api/admin/claim',{token:secret},admin)).status,200);
  const base={title:'Alter Clan-Drop',description:'Dieser Drop bleibt intern.',prize_kind:'item',prize_detail:'Elytra',prize_amount:1,winner_count:1,ends_at:new Date(Date.now()+3600000).toISOString()};
  const created=await response(url,'/api/hq/giveaways',base,admin);assert.equal(created.status,201);
  const giveaway=(await response(url,`/api/hq/giveaways/${created.data.id}`,undefined,admin)).data.giveaway;
  assert.equal(giveaway.visibility,'clan');
  assert.equal((await response(url,'/api/hq/giveaways')).data.giveaways.length,0);
  await stop(srv);srv=null;
  // Simulate the exact old SQLite table structure, preserving its giveaway data.
  const db=new DatabaseSync(path.join(dir,'hub.sqlite'));
  db.exec('ALTER TABLE clan_giveaways DROP COLUMN visibility');
  assert.equal(db.prepare('PRAGMA table_info(clan_giveaways)').all().some(c=>c.name==='visibility'),false);
  db.close();
  srv=await boot(dir); // Migration adds visibility with safe default clan.
  assert.equal((await response(srv.url,'/api/hq/giveaways')).data.giveaways.length,0);
  const restored=await response(srv.url,`/api/hq/giveaways/${created.data.id}`,undefined,admin);
  assert.equal(restored.status,200);
  assert.equal(restored.data.giveaway.visibility,'clan');
 }finally{if(srv)await stop(srv);rmSync(dir,{recursive:true,force:true});}
});
