'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const net=require('node:net');
const path=require('node:path');
const token='only-for-tax-coleader-integration-tests-2026';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function start(dir){
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
 const port=probe.address().port;await new Promise(r=>probe.close(r));
 const url='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{
  ...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,NODE_ENV:'development',
  SITE_PREVIEW_LOCK:'0',ADMIN_BOOTSTRAP_TOKEN:token
 },stdio:['ignore','pipe','pipe']});
 let logs='';child.stderr.on('data',d=>logs+=d.toString());
 for(let i=0;i<100;i++){if(child.exitCode!==null)break;try{const r=await fetch(url+'/healthz');if(r.ok)return {url,child};}catch{}await sleep(100);}
 child.kill();throw Error('Tax test server failed: '+logs);
}
async function stop(s){if(!s)return;s.child.kill('SIGTERM');await Promise.race([new Promise(r=>s.child.once('exit',r)),sleep(1300)]);}
async function call(url,endpoint,body,cookie){
 const r=await fetch(url+endpoint,{method:body===undefined?'GET':'POST',
  headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function register(url,handle){
 const r=await call(url,'/api/register',{handle,password:'test-password-for-'+handle+'-2026'});
 assert.equal(r.status,201,JSON.stringify(r.data));return r.cookie;
}
function monthNow(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 return parts.find(x=>x.type==='year').value+'-'+parts.find(x=>x.type==='month').value;
}
test('Co-Leader and Mods manage monthly taxes and giveaways, never the treasury or team rights', {timeout:60000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nm-clan-taxes-'));let srv;
 try{
  srv=await start(dir);let url=srv.url;
  const owner=await register(url,'TaxOwner');
  const coleader=await register(url,'TaxCoLead');
  const mod=await register(url,'TaxMod');
  const member=await register(url,'TaxMember');
  const event=await register(url,'TaxEvent');
  assert.equal((await call(url,'/api/admin/claim',{token},owner)).status,200);

  assert.equal((await call(url,'/api/admin/team',{handle:'TaxCoLead',role:'coleader'},owner)).status,409,'Co-leaders must be confirmed clan members');
  assert.equal((await call(url,'/api/hq/clan/members',{handle:'TaxCoLead',clan:'clan2'},owner)).status,200);
  assert.equal((await call(url,'/api/hq/clan/members',{handle:'TaxMember',clan:'clan3'},owner)).status,200);
  assert.equal((await call(url,'/api/admin/team',{handle:'TaxCoLead',role:'coleader'},owner)).status,200);
  assert.equal((await call(url,'/api/admin/team',{handle:'TaxMod',role:'moderator'},owner)).status,200);
  assert.equal((await call(url,'/api/admin/team',{handle:'TaxEvent',role:'event_manager'},owner)).status,200);
  assert.equal((await call(url,'/api/admin/team',{handle:'TaxMember',role:'coleader'},mod)).status,403);
  assert.equal((await call(url,'/api/admin/team',{handle:'TaxMember',role:'coleader'},coleader)).status,403);
  assert.ok((await call(url,'/api/admin/team',undefined,owner)).data.team.some(x=>x.handle==='TaxCoLead'&&x.role==='coleader'));
  assert.equal((await call(url,'/api/admin/team',undefined,coleader)).status,403);

  const taxPath='/api/hq/bank/taxes';
  assert.equal((await call(url,taxPath)).status,401);
  for(const cookie of [member,event])assert.equal((await call(url,taxPath,undefined,cookie)).status,403);
  for(const cookie of [owner,coleader,mod])assert.equal((await call(url,taxPath,undefined,cookie)).status,200);
  assert.equal((await call(url,'/api/hq/bank',undefined,mod)).status,403,'Unapproved moderator cannot browse treasury');
  assert.equal((await call(url,'/api/hq/bank',undefined,coleader)).status,200);
  const taxes=(await call(url,taxPath,undefined,mod)).data;
  assert.equal(taxes.month,monthNow());
  assert.deepEqual(taxes.rows.map(x=>x.handle).sort(),['TaxCoLead','TaxMember']);
  assert.equal(taxes.paid,0);
  assert.equal(taxes.unpaid,2);
  const id=taxes.rows.find(x=>x.handle==='TaxMember').user_id;
  assert.equal((await call(url,taxPath,{month:taxes.month,user_id:id,paid:true},member)).status,403);
  assert.equal((await call(url,taxPath,{month:'2099-12',user_id:id,paid:true},owner)).status,400);
  assert.equal((await call(url,taxPath,{month:taxes.month,user_id:id,paid:'yes'},owner)).status,400);
  assert.equal((await call(url,taxPath,{month:taxes.month,user_id:9999999,paid:true},owner)).status,404);
  const paid=await call(url,taxPath,{month:taxes.month,user_id:id,paid:true},mod);
  assert.equal(paid.status,200,JSON.stringify(paid.data));
  assert.equal(paid.data.paid,1);
  assert.equal(paid.data.unpaid,1);
  assert.equal(paid.data.rows.find(x=>x.user_id===id).updated_by,'TaxMod');
  assert.equal((await call(url,taxPath,{month:taxes.month,user_id:id,paid:true},mod)).data.unchanged,true);
  const bankBefore=(await call(url,'/api/hq/bank',undefined,owner)).data.balance_milli;
  assert.equal(bankBefore,0,'Checking paid must never generate a bank deposit');
  assert.equal((await call(url,taxPath,{month:taxes.month,user_id:id,paid:false},coleader)).status,200);
  assert.equal((await call(url,taxPath,{month:taxes.month,user_id:id,paid:true},coleader)).status,200);
  assert.equal((await call(url,'/api/hq/bank',undefined,owner)).data.balance_milli,bankBefore);
  assert.equal((await call(url,'/api/hq/bank/transactions',{kind:'deposit',amount:'1',note:'Not allowed'},coleader)).status,403);
  assert.equal((await call(url,'/api/hq/bank/transactions',{kind:'deposit',amount:'1',note:'Not allowed'},mod)).status,403);

  const giveaway={
   title:'Co-Leader Giveaway',description:'Giveaway by a Co-Leader',
   prize_kind:'item',prize_detail:'Diamond',prize_amount:1,
   winner_count:1,visibility:'clan',ends_at:new Date(Date.now()+3600000).toISOString()
  };
  assert.equal((await call(url,'/api/hq/giveaways',giveaway,member)).status,403);
  const g=await call(url,'/api/hq/giveaways',giveaway,coleader);
  assert.equal(g.status,201,JSON.stringify(g.data));
  assert.equal((await call(url,'/api/hq/giveaways/'+g.data.id+'/enter',{},member)).status,200);
  const db=new DatabaseSync(path.join(dir,'hub.sqlite'));
  db.prepare('UPDATE clan_giveaways SET ends_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),g.data.id);
  db.close();
  assert.equal((await call(url,'/api/hq/giveaways/'+g.data.id,undefined,member)).data.giveaway.status,'drawn');
  assert.equal((await call(url,'/api/hq/giveaways/'+g.data.id+'/fulfill',{note:'Übergabe bestätigt'},coleader)).status,200);
  const g2=await call(url,'/api/hq/giveaways',{...giveaway,title:'Cancel this one'},coleader);
  assert.equal(g2.status,201);
  assert.equal((await call(url,'/api/hq/giveaways/'+g2.data.id+'/cancel',{note:'Abgebrochen'},coleader)).status,200);

  assert.equal((await call(url,'/api/hq/clan/members',{handle:'TaxOwner',clan:'remove'},coleader)).status,403);
  assert.equal((await call(url,'/api/hq/clan/members',{handle:'TaxCoLead',clan:'remove'},coleader)).status,403);
  assert.equal((await call(url,'/api/hq/clan/members',{handle:'TaxMember',clan:'remove'},coleader)).status,200);
  const historical=(await call(url,taxPath,undefined,owner)).data.rows.find(x=>x.user_id===id);
  assert.equal(historical.paid,1);
  assert.equal(historical.still_member,0,'History survives leaving the clan');
  const audit=(await call(url,'/api/hq/mod/audit',undefined,owner)).data.history;
  assert.ok(audit.some(x=>x.action==='clan_tax_paid'));
  assert.ok(audit.some(x=>x.action==='clan_tax_unpaid'));
  assert.equal((await call(url,taxPath+'?month=2026-01',undefined,owner)).status,200);

  await stop(srv);srv=null;
  srv=await start(dir);url=srv.url;
  assert.equal((await call(url,taxPath,undefined,owner)).data.rows.find(x=>x.user_id===id).paid,1,'Tax check persists across server restart');
  assert.equal((await call(url,'/api/hq/bank',undefined,owner)).data.balance_milli,0);
 }finally{if(srv)await stop(srv);rmSync(dir,{recursive:true,force:true});}
});
test('Clanbank monthly tax subpage, owner Co-Leader UI, and permission restrictions present',()=>{
 const root=path.join(__dirname,'..');
 const html=readFileSync(path.join(root,'public/index.html'),'utf8');
 const js=readFileSync(path.join(root,'public/hq.js'),'utf8');
 const css=readFileSync(path.join(root,'public/hq.css'),'utf8');
 const backend=readFileSync(path.join(root,'clan-bank.js'),'utf8');
 for(const id of ['bankTaxPanel','bankTaxList','bankTaxMonth','bankTaxSummary','bankTaxRefresh','bankTaxJump'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/value="coleader"/);
 assert.match(html,/Co-Leader · Clanleitung \+ Giveaways \+ Steuern/);
 assert.match(js,/function renderMonthlyTaxes/);
 assert.match(js,/Steuern Mainclan/);
 assert.match(js,/Steuern 2\. Clan/);
 assert.match(js,/Steuern 3\. Clan/);
 assert.match(js,/data-tax-clan/);
 assert.match(js,/data-tax-check/);
 assert.match(js,/role==='admin'/);
 assert.match(css,/\.bank-tax-row/);
 assert.match(css,/\.bank-tax-group\{/);
 assert.match(backend,/canManageTaxes/);
 assert.match(backend,/month TEXT NOT NULL/);
});
