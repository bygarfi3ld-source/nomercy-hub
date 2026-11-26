'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const crypto=require('node:crypto');
const net=require('node:net');
const path=require('node:path');
const vm=require('node:vm');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const root=path.join(__dirname,'..');
const bootstrap='isolated-permission-matrix-owner-bootstrap-2026';
async function boot(dir){
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
 const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,
  HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,NODE_ENV:'development',SITE_PREVIEW_LOCK:'0',
  ADMIN_BOOTSTRAP_TOKEN:bootstrap},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',x=>errors+=x);
 const url='http://127.0.0.1:'+port;
 for(let i=0;i<80;i++){try{if((await fetch(url+'/healthz')).ok)return {child,url};}catch{}if(child.exitCode!==null)break;await sleep(100);}
 child.kill();throw Error('Permission test server failed: '+errors);
}
async function call(url,route,body,cookie){
 const response=await fetch(url+route,{method:body===undefined?'GET':'POST',headers:{
  ...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function stop(server){if(!server)return;server.child.kill('SIGTERM');await Promise.race([new Promise(r=>server.child.once('exit',r)),sleep(1200)]);}
test('Owner/Mod permissions: no account, member, Co-Leader, event-team or legacy bypass; removal and revocation persist', {timeout:60000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nm-permission-matrix-'));let server;
 try{
  server=await boot(dir);let url=server.url;
  const owner=(await call(url,'/api/register',{handle:'MatrixOwner',password:'isolated-owner-test-password-2026'})).cookie;
  assert.equal((await call(url,'/api/admin/claim',{token:bootstrap},owner)).status,200);
  // Seed role/session fixtures only in this temporary test database. Production is never touched.
  const db=new DatabaseSync(path.join(dir,'hub.sqlite'));
  const sessions={};
  for(const [name,role,clan] of [['Mod','moderator',null],['Account','member',null],['Member','member','clan3'],['CoLead','coleader','clan2'],['Event','event_manager','clan3']]){
   const id=Number(db.prepare('INSERT INTO users(handle,password_hash,salt,created_at,role) VALUES(?,?,?,?,?)')
    .run('Matrix'+name,'0'.repeat(64),'0'.repeat(32),new Date().toISOString(),role).lastInsertRowid);
   const token=crypto.randomBytes(32).toString('hex');
   db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),id,Date.now()+3600000);
   if(clan)db.prepare('INSERT INTO clan_memberships(user_id,clan,approved_by,approved_at) VALUES(?,?,1,?)').run(id,clan,new Date().toISOString());
   sessions[name]='sid='+token;
  }
  db.close();
  const {Mod:mod,Account:account,Member:member,CoLead:colead,Event:eventTeam}=sessions;
  const end=new Date(Date.now()+3600000).toISOString();
  const giveaway={title:'Permission giveaway',description:'Free in-game test drop',prize_kind:'item',prize_detail:'Diamond',prize_amount:1,winner_count:1,ends_at:end,visibility:'public'};
  const event={title:'Permission event',description:'Staff event only',category:'FFA',starts_at:end,duration_minutes:15,max_players:10};
  const legacy={title:'Legacy staff event',type:'FFA',dimension:'Overworld',mc_host:'MatrixOwner',note:'Legacy permission test',max_players:10,starts_at:end,duration_minutes:15};
  const listing={kind:'offer',title:'Diamond offer',description:'In-game items only',mc_contact:'MatrixAccount',price_millions:1};
  const application={mc_name:'MatrixAccount',desired_clan:'clan3',message:'Private application text'};
  assert.equal((await call(url,'/api/hq/clan/requests',application,account)).status,201);
  for(const [label,cookie] of [['guest',undefined],['account',account],['member',member],['coleader',colead],['event-team',eventTeam]]){
   for(const [route,body] of [['/api/hq/giveaways',giveaway],['/api/hq/events',event],['/api/events',legacy],['/api/hq/bank/transactions',{kind:'deposit',amount:'100',note:'Denied entry'}],['/api/hq/bank/taxes',{month:'2026-01',user_id:1,paid:true}],['/api/hq/clan/requests/1/review',{decision:'approve',clan:'clan3',note:'Denied approval'}]]){
    const response=await call(url,route,body,cookie);
    assert.ok([401,403].includes(response.status),label+' cannot write '+route+': '+response.status);
   }
   if(cookie){
    const own=(await call(url,'/api/hq/clan/requests',undefined,cookie)).data;
    assert.equal(Object.hasOwn(own,'requests'),false,label+' cannot read other applications');
    assert.equal(own.request?.message,label==='account'?application.message:undefined);
    assert.equal((await call(url,'/api/admin/team',{handle:'MatrixAccount',role:'moderator'},cookie)).status,403,label+' cannot grant roles');
   }
  }
  for(const cookie of [owner,mod]){
   const all=await call(url,'/api/hq/clan/requests',undefined,cookie);
   assert.equal(all.status,200);assert.equal(all.data.requests[0].message,application.message);
   assert.equal((await call(url,'/api/hq/giveaways',giveaway,cookie)).status,201);
   assert.equal((await call(url,'/api/hq/events',event,cookie)).status,201);
   assert.equal((await call(url,'/api/hq/bank/transactions',{kind:'deposit',amount:'10',note:'Staff deposit'},cookie)).status,201);
   const bank=(await call(url,'/api/hq/bank',undefined,cookie)).data;
   assert.equal(bank.can_manage,true);
   assert.equal(bank.is_admin,cookie===owner,'Moderator is not the Owner');
  }
  assert.equal((await call(url,'/api/hq/bank',undefined,member)).data.can_manage,false);
  const applicationId=(await call(url,'/api/hq/clan/requests',undefined,mod)).data.requests[0].id;
  assert.equal((await call(url,'/api/hq/clan/requests/'+applicationId+'/review',{decision:'approve',clan:'clan3',note:'Moderator verified identity'},mod)).status,200);
  const bankRequest=await call(url,'/api/hq/bank/requests',{title:'Resources',reason:'Clan build',amount:'1'},member);
  assert.equal(bankRequest.status,201);
  const requestPath='/api/hq/bank/requests/'+bankRequest.data.id;
  assert.equal((await call(url,requestPath+'/review',{decision:'approve',note:'Checked'},mod)).status,200);
  assert.equal((await call(url,requestPath+'/payout',{note:'Handed over in-game'},mod)).status,200);
  assert.equal((await call(url,requestPath+'/payout',{note:'Duplicate rejected'},mod)).status,409);
  const ids=[];
  for(let i=0;i<3;i++){
   const r=await call(url,'/api/hq/market',{...listing,title:'Listing '+i},account);assert.equal(r.status,201);ids.push(r.data.id);
  }
  assert.equal((await call(url,'/api/hq/market/'+ids[0]+'/close',{},member)).status,403,'Other members cannot delete an ad');
  assert.equal((await call(url,'/api/hq/market/'+ids[1]+'/close',{},mod)).status,400,'Moderation must record a reason');
  for(const [i,cookie] of [[0,account],[1,mod],[2,owner]])assert.equal((await call(url,'/api/hq/market/'+ids[i]+'/close',{note:'Checked and removed'},cookie)).status,200);
  assert.deepEqual((await call(url,'/api/hq/market')).data.listings,[],'Removed ads disappear for all visitors');
  const events=(await call(url,'/api/hq/events',undefined,member)).data.events;
  const eventId=events[0].id;
  assert.equal((await call(url,'/api/hq/events/'+eventId+'/status',{status:'hidden',note:'Denied'},eventTeam)).status,403);
  assert.equal((await call(url,'/api/hq/events/'+eventId+'/status',{status:'hidden',note:'Removed by moderation'},mod)).status,200);
  assert.ok(!(await call(url,'/api/hq/events',undefined,member)).data.events.some(e=>e.id===eventId));
  const oldEvent=await call(url,'/api/events',legacy,mod);assert.equal(oldEvent.status,201);
  assert.equal((await call(url,'/api/events/'+oldEvent.data.id+'/close',{},account)).status,403);
  assert.equal((await call(url,'/api/events/'+oldEvent.data.id+'/close',{},owner)).status,200);
  assert.equal((await call(url,'/api/admin/team',{handle:'MatrixMod',role:'member'},owner)).status,200);
  assert.equal((await call(url,'/api/hq/giveaways',giveaway,mod)).status,403,'Demotion revokes writes on the existing session');
  assert.equal((await call(url,'/api/hq/bank',undefined,mod)).status,403);
  assert.equal(Object.hasOwn((await call(url,'/api/hq/clan/requests',undefined,mod)).data,'requests'),false);
  await stop(server);server=null;server=await boot(dir);url=server.url;
  assert.deepEqual((await call(url,'/api/hq/market')).data.listings,[],'Ad removal survives restart');
  assert.ok(!(await call(url,'/api/hq/events',undefined,member)).data.events.some(e=>e.id===eventId),'Event removal survives restart');
  assert.equal((await call(url,'/api/hq/bank',undefined,owner)).data.balance_milli,19000,'Bank ledger survives restart');
  const audit=(await call(url,'/api/hq/mod/audit',undefined,owner)).data.history;
  assert.equal(audit.filter(x=>x.action==='market_removed').length,3,'Ad removal is audited');
  assert.equal((await call(url,'/api/hq/bank/transactions',{kind:'deposit',amount:'1',note:'Still denied'},mod)).status,403);
 }finally{await stop(server);rmSync(dir,{recursive:true,force:true});}
});
test('UI renders administrative controls only for Owner/Mod and exposes removal for the ad creator',()=>{
 const nodes=new Map();
 const document={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:selector==='#marketFilter'?'all':'',innerHTML:'',textContent:''});return nodes.get(selector);}};
 const context=vm.createContext({document,console,setTimeout,clearTimeout,Date});
 const source=readFileSync(path.join(root,'public/hq.js'),'utf8');
 vm.runInContext(source.slice(0,source.indexOf('async function init(){')),context);
 vm.runInContext(`state.market=[{id:1,kind:'offer',title:'<script>bad()</script>',description:'Safe rendering',price_millions:1,mc_contact:'Player',creator_handle:'Player',created_at:new Date().toISOString(),is_owner:false}];
 state.events=[{id:2,category:'FFA',title:'Test event',description:'Test',starts_at:new Date().toISOString(),ends_at:new Date(Date.now()+3600000).toISOString(),status:'open',participants:0,max_players:10,creator_handle:'Owner'}];`,context);
 for(const role of ['member','coleader','event_manager','moderator','admin']){
  vm.runInContext(`state.user={role:'${role}',clan:'clan3'};renderMarket();renderPrivate();`,context);
  const privileged=['admin','moderator'].includes(role);
  assert.equal(nodes.get('#marketList').innerHTML.includes('Anzeige entfernen'),privileged,role+' market moderation button');
  assert.equal(nodes.get('#eventList').innerHTML.includes('Event entfernen'),privileged,role+' event moderation button');
  assert.equal(vm.runInContext('eventCreator()',context),privileged);
  assert.equal(vm.runInContext('clanLeader()',context),privileged);
  assert.ok(nodes.get('#marketList').innerHTML.includes('&lt;script&gt;'),'User content remains escaped');
 }
 vm.runInContext("state.user={role:'member',clan:null};state.market[0].is_owner=true;renderMarket();",context);
 assert.ok(nodes.get('#marketList').innerHTML.includes('Anzeige entfernen'),'Ad creator sees removal without a clan membership');
});
