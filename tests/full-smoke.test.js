'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync,readFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const net=require('node:net');
const path=require('node:path');
const token='only-for-full-smoke-testing-do-not-use-in-production-2026';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(dir, extraEnv={}){
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
 const port=probe.address().port;await new Promise(r=>probe.close(r));
 const url='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,NODE_ENV:'development',SITE_PREVIEW_LOCK:'0',ADMIN_BOOTSTRAP_TOKEN:token,...extraEnv},stdio:['ignore','pipe','pipe']});
 let logs='';child.stderr.on('data',x=>logs+=x);
 for(let i=0;i<100;i++){if(child.exitCode!==null)break;try{const r=await fetch(url+'/healthz');if(r.ok)return {url,child};}catch{}await sleep(100);}
 child.kill();throw Error('Test server did not start: '+logs);
}
async function request(url,endpoint,body,cookie){
 const r=await fetch(url+endpoint,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function register(url,handle){
 const r=await request(url,'/api/register',{handle,password:'long-unique-test-password-'+handle});
 assert.equal(r.status,201,JSON.stringify(r.data));return r.cookie;
}
test('Full isolated NoMercy smoke test: signup, existing Main, roles, giveaways, events and bank', {timeout:60000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nomercy-complete-smoke-'));let server;
 try{
  server=await boot(dir);const {url}=server;
  const admin=await register(url,'SmokeOwner'),member=await register(url,'SmokeMain'),mod=await register(url,'SmokeMod'),eventTeam=await register(url,'SmokeEvents'),outsider=await register(url,'SmokeGuest');
  assert.equal((await request(url,'/api/hq/clan/roster')).status,200);
  assert.equal((await request(url,'/api/admin/team',undefined,outsider)).status,403);
  assert.equal((await request(url,'/api/admin/claim',{token},admin)).status,200);
  assert.equal((await request(url,'/api/admin/team',{handle:'SmokeMod',role:'moderator'},admin)).status,200);
  assert.equal((await request(url,'/api/admin/team',{handle:'SmokeEvents',role:'event_manager'},admin)).status,200);
  assert.equal((await request(url,'/api/admin/team',{handle:'SmokeMain',role:'moderator'},outsider)).status,403);
  const team=(await request(url,'/api/admin/team',undefined,admin)).data.team;
  assert.ok(team.some(t=>t.handle==='SmokeMod'&&t.role==='moderator'));
  assert.ok(team.some(t=>t.handle==='SmokeEvents'&&t.role==='event_manager'));

  const apply={mc_name:'SmokeMain',desired_clan:'main',message:'x',request_type:'existing'};
  assert.equal((await request(url,'/api/hq/clan/requests',apply,member)).status,201);
  assert.equal((await request(url,'/api/hq/bank',undefined,member)).status,403);
  const pending=(await request(url,'/api/hq/clan/requests',undefined,admin)).data.requests;
  const id=pending.find(x=>x.handle==='SmokeMain')?.id;
  assert.ok(id);
  assert.equal((await request(url,'/api/hq/clan/requests/'+id+'/review',{decision:'approve',clan:'main',note:'x'},admin)).status,409,'Main still requires verification');
  assert.equal((await request(url,'/api/hq/clan/requests/'+id+'/review',{decision:'approve',clan:'main',note:'x',verified_existing:true},admin)).status,200);
  assert.equal((await request(url,'/api/hq/me',undefined,member)).data.user.clan,'main');
  const roster=(await request(url,'/api/hq/clan/roster')).data.members;
  assert.ok(roster.some(m=>m.handle==='SmokeMain'&&m.clan==='main'));
  assert.ok(!roster.some(m=>m.handle==='SmokeGuest'));

  const end=new Date(Date.now()+3600000).toISOString();
  const giveaway={title:'G',description:'X',prize_kind:'item',prize_detail:'X',prize_amount:1,winner_count:1,ends_at:end,visibility:'clan'};
  assert.equal((await request(url,'/api/hq/giveaways',giveaway,eventTeam)).status,403);
  assert.equal((await request(url,'/api/hq/giveaways',giveaway,outsider)).status,403);
  const g=await request(url,'/api/hq/giveaways',giveaway,mod);
  assert.equal(g.status,201,JSON.stringify(g.data));
  const gid=g.data.id;
  assert.equal((await request(url,'/api/hq/giveaways',undefined,outsider)).data.giveaways.length,0);
  assert.equal((await request(url,'/api/hq/giveaways/'+gid+'/enter',{},outsider)).status,403);
  assert.equal((await request(url,'/api/hq/giveaways/'+gid+'/enter',{},member)).data.entered,true);
  const db=new DatabaseSync(path.join(dir,'hub.sqlite'));
  db.prepare('UPDATE clan_giveaways SET ends_at=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),gid);
  db.close();
  const drawn=await request(url,'/api/hq/giveaways/'+gid,undefined,member);
  assert.equal(drawn.status,200);assert.equal(drawn.data.giveaway.status,'drawn');
  assert.equal(drawn.data.giveaway.winners[0].handle,'SmokeMain');
  assert.equal((await request(url,'/api/hq/giveaways/'+gid+'/fulfill',{note:'x'},mod)).status,200);
  assert.equal((await request(url,'/api/hq/giveaways/'+gid+'/fulfill',{note:'x'},mod)).status,409);

  const event={title:'E',description:'X',category:'FFA',starts_at:new Date(Date.now()+7200000).toISOString(),duration_minutes:15,max_players:2};
  const ev=await request(url,'/api/hq/events',event,eventTeam);
  assert.equal(ev.status,201,JSON.stringify(ev.data));
  assert.equal((await request(url,'/api/hq/events',undefined,outsider)).status,403);
  assert.equal((await request(url,'/api/hq/events/'+ev.data.id+'/join',{},member)).status,200);
  assert.equal((await request(url,'/api/hq/events/'+ev.data.id+'/status',{status:'closed',note:'x'},eventTeam)).status,200);

  assert.equal((await request(url,'/api/hq/bank/transactions',{kind:'deposit',amount:'20',note:'x'},mod)).status,403);
  assert.equal((await request(url,'/api/hq/bank/transactions',{kind:'deposit',amount:'20',note:'x'},admin)).status,201);
  const br=await request(url,'/api/hq/bank/requests',{title:'B',reason:'x',amount:'1'},member);
  assert.equal(br.status,201,JSON.stringify(br.data));
  assert.equal((await request(url,'/api/hq/bank/requests/'+br.data.id+'/review',{decision:'approve',note:'x'},mod)).status,403);
  assert.equal((await request(url,'/api/hq/bank/requests/'+br.data.id+'/review',{decision:'approve',note:'x'},admin)).status,200);
  assert.equal((await request(url,'/api/hq/bank/requests/'+br.data.id+'/payout',{note:'x'},admin)).status,200);
  assert.equal((await request(url,'/api/hq/bank/requests/'+br.data.id+'/payout',{note:'x'},admin)).status,409);
  const bank=await request(url,'/api/hq/bank',undefined,admin);
  assert.equal(bank.data.balance_milli,19000);
  assert.ok(bank.data.ledger.length>=2);

  assert.equal((await request(url,'/api/admin/team',{handle:'SmokeMod',role:'member'},admin)).status,200);
  assert.equal((await request(url,'/api/hq/mod/market',undefined,mod)).status,403);
 } finally {
  if(server){server.child.kill('SIGTERM');await Promise.race([new Promise(r=>server.child.once('exit',r)),sleep(1500)]);}
  rmSync(dir,{recursive:true,force:true});
 }
});
test('UX smoke: existing-member CTA, quiet transitions, skeletons and no arbitrary text min length',()=>{
 const root=path.join(__dirname,'..');
 const html=readFileSync(path.join(root,'public/index.html'),'utf8');
 const js=readFileSync(path.join(root,'public/hq.js'),'utf8');
 const css=readFileSync(path.join(root,'public/hq.css'),'utf8');
 assert.match(html,/id="existingAccessBtn"/);
 assert.match(js,/showClanApplication\('existing'\)/);
 assert.match(js,/setSkeleton\('#rosterList',4,'row'\)/);
 assert.match(js,/setSkeleton\('#teamRoleList',2,'row'\)/);
 assert.match(js,/setSkeleton\('#clanApplications',2\)/);
 assert.match(js,/settleLoading\(started,150\)/);
 assert.match(css,/\.skeleton-row\{/);
 assert.match(css,/\.tab-panel \.sectionhead.*animation:none!important/);
 assert.doesNotMatch(html,/<textarea[^>]*minlength=/);
 assert.doesNotMatch(js,/<textarea[^>]*minlength=/);
});

