'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const crypto=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {initDiscordAuth}=require('../discord-auth');
const clientId='123456789012345678',discordId='987654321098765432';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
function fixture(options={}){
 const db=new DatabaseSync(':memory:');
 db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT);INSERT INTO users VALUES(1,'member'),(2,'member');
  CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER,expires_at INTEGER);`);
 let time=Date.now();
 const sids=['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)];
 for(const [i,sid]of sids.entries())db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(sid),i===1?2:1,time+3600000);
 const req=i=>({method:'GET',headers:{cookie:'sid='+sids[i||0]}});
 const cookieGet=r=>r.headers.cookie?.slice(4)||'';
 const currentUser=r=>db.prepare('SELECT users.id,users.role FROM users JOIN sessions ON sessions.user_id=users.id WHERE sessions.token_hash=? AND expires_at>?').get(sha(cookieGet(r)),time)||null;
 const errors=(status,message)=>Object.assign(Error(message),{status});
 const requests=[];
 const defaultFetch=async(url,opts)=>{
  requests.push({url,opts});
  return {ok:true,json:async()=>url.endsWith('/token')?{access_token:'TEST-ACCESS-DO-NOT-PERSIST',refresh_token:'TEST-REFRESH-DO-NOT-PERSIST',token_type:'Bearer',scope:'identify'}:{id:discordId,username:'known_member',global_name:'Clan Member'}};
 };
 const service=initDiscordAuth({db,errors,requireUser:r=>{const u=currentUser(r);if(!u)throw errors(401,'Login required');return u;},currentUser,cookieGet,checkRate:()=>{},
  json:(res,status,data)=>Object.assign(res,{status,data}),clock:()=>time,fetchImpl:options.fetchImpl||defaultFetch,
  env:options.env||{NOMERCY_DISCORD_CLIENT_ID:clientId}});
 async function call(route,method='GET',i=0){const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(){}};const request=req(i);request.method=method;await service.api(request,res,new URL(route,'https://nomercy-mc.net'));return res;}
 async function start(i=0){const res=await call('/api/discord/start','POST',i);return new URL(res.data.url);}
 const callback=(state,extra='code=TEST-CODE')=>'/api/discord/callback?state='+state+'&'+extra;
 return {db,service,req,call,start,callback,requests,sids,advance:ms=>time+=ms};
}
test('Discord PKCE binds only the authenticated account and persists only identity; no role grants',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const authorize=await f.start();
 assert.equal(authorize.origin,'https://discord.com');assert.equal(authorize.searchParams.get('scope'),'identify');
 assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');
 assert.equal(authorize.searchParams.get('redirect_uri'),'https://nomercy-mc.net/api/discord/callback');
 const state=authorize.searchParams.get('state');
 assert.match(state,/^[\w-]{43}$/);
 const res=await f.call(f.callback(state));assert.equal(res.headers.Location,'/?discord=linked#apply');assert.equal(res.headers['Cache-Control'],'no-store');
 const tokenRequest=f.requests[0];assert.equal(tokenRequest.url,'https://discord.com/api/oauth2/token');
 const body=new URLSearchParams(tokenRequest.opts.body);assert.equal(body.get('client_id'),clientId);assert.equal(body.get('code'),'TEST-CODE');
 assert.equal(crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url'),authorize.searchParams.get('code_challenge'));
 assert.equal(body.has('client_secret'),false);assert.equal(tokenRequest.opts.redirect,'error');
 assert.equal(f.requests[1].url,'https://discord.com/api/v10/users/@me');assert.equal(f.requests[1].opts.headers.Authorization,'Bearer TEST-ACCESS-DO-NOT-PERSIST');
 const status=(await f.call('/api/discord/status')).data;assert.equal(status.identity.id,discordId);assert.equal(status.identity.username,'known_member');
 assert.equal((await f.call('/api/discord/status','GET',1)).data.identity,null);
 assert.equal(f.db.prepare('SELECT role FROM users WHERE id=1').get().role,'member');
 const stored=JSON.stringify(f.db.prepare('SELECT * FROM discord_links').all());assert.doesNotMatch(stored,/TEST-ACCESS|TEST-REFRESH|TEST-CODE/);
 assert.equal((await f.call(f.callback(state))).headers.Location,'/?discord=expired#apply');assert.equal(f.requests.length,2);
 await assert.rejects(f.start(),{status:409});
});
test('Discord state rejects another account, another session, logout, expiry and replacement',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const state=(await f.start()).searchParams.get('state');
 for(const i of [1,2])assert.equal((await f.call(f.callback(state),'GET',i)).headers.Location,'/?discord=expired#apply');
 assert.equal(f.requests.length,0);
 const replacement=(await f.start()).searchParams.get('state');
 assert.equal((await f.call(f.callback(state))).headers.Location,'/?discord=expired#apply');
 f.advance(600001);assert.equal((await f.call(f.callback(replacement))).headers.Location,'/?discord=expired#apply');
 const next=(await f.start()).searchParams.get('state');f.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(f.sids[0]));
 assert.equal((await f.call(f.callback(next))).headers.Location,'/?discord=expired#apply');assert.equal(f.requests.length,0);
});
test('A Discord ID cannot be claimed by a second Hub account or supplied in a status request',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const first=(await f.start()).searchParams.get('state');await f.call(f.callback(first));
 const second=(await f.start(1)).searchParams.get('state');
 assert.equal((await f.call(f.callback(second),'GET',1)).headers.Location,'/?discord=in_use#apply');
 assert.equal(f.service.identity(2),null);assert.equal(f.service.identity(1).id,discordId);
 assert.equal((await f.call('/api/discord/status?user_id=1','GET',1)).data.identity,null);
 await assert.rejects(f.call('/api/discord/callback','POST'),{status:405});
});
test('Cancellation, wrong issuer and malformed state never call Discord or create links',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 for(const [extra,result]of [['error=access_denied','cancelled'],['code=TEST&iss=https://evil.example','failed'],['','failed']]){
  const state=(await f.start()).searchParams.get('state');assert.equal((await f.call(f.callback(state,extra))).headers.Location,'/?discord='+result+'#apply');
 }
 assert.equal((await f.call(f.callback('invalid'))).headers.Location,'/?discord=expired#apply');
 assert.equal(f.requests.length,0);assert.equal(f.service.identity(1),null);
});
test('Discord errors and invalid provider data do not leak tokens or link an account',async()=>{
 for(const response of [{ok:false,json:async()=>({error:'SECRET'})},{ok:true,json:async()=>({access_token:'SECRET',token_type:'Bearer',scope:'email'})},{ok:true,json:async()=>{throw Error('SECRET');}}]){
  const f=fixture({fetchImpl:async()=>response});
  try{const state=(await f.start()).searchParams.get('state');const res=await f.call(f.callback(state));assert.equal(res.headers.Location,'/?discord=failed#apply');assert.doesNotMatch(JSON.stringify(res),/SECRET/);assert.equal(f.service.identity(1),null);}finally{f.db.close();}
 }
 const f=fixture({fetchImpl:async url=>({ok:true,json:async()=>url.endsWith('/token')?{access_token:'TOKEN',token_type:'Bearer',scope:'identify'}:{id:'invalid',username:'fake'}})});
 try{const state=(await f.start()).searchParams.get('state');assert.equal((await f.call(f.callback(state))).headers.Location,'/?discord=failed#apply');assert.equal(f.service.identity(1),null);}finally{f.db.close();}
});
test('In-flight callbacks are single-use; disconnect cancels an outstanding exchange',async t=>{
 let release;const blocked=new Promise(r=>release=r);let calls=0;
 const f=fixture({fetchImpl:async url=>{calls++;if(url.endsWith('/token'))await blocked;return {ok:true,json:async()=>url.endsWith('/token')?{access_token:'TOKEN',token_type:'Bearer',scope:'identify'}:{id:discordId,username:'member'}};}});t.after(()=>f.db.close());
 const state=(await f.start()).searchParams.get('state');const inflight=f.call(f.callback(state));
 assert.equal((await f.call(f.callback(state))).headers.Location,'/?discord=expired#apply');assert.equal(calls,1);
 await f.call('/api/discord/disconnect','POST');release();assert.equal((await inflight).headers.Location,'/?discord=expired#apply');assert.equal(f.service.identity(1),null);
});
test('Discord is unavailable until configured and endpoints require a Hub session',async t=>{
 const f=fixture({env:{}});t.after(()=>f.db.close());
 assert.equal((await f.call('/api/discord/status')).data.available,false);await assert.rejects(f.start(),{status:503});
 f.db.exec('DELETE FROM sessions');await assert.rejects(f.call('/api/discord/status'),{status:401});await assert.rejects(f.call('/api/discord/disconnect','POST'),{status:401});
});
test('Unlink removes only the current user identity and permits a new explicit connection',async t=>{
 const f=fixture();t.after(()=>f.db.close());
 const state=(await f.start()).searchParams.get('state');await f.call(f.callback(state));
 await f.call('/api/discord/disconnect','POST',1);assert.equal(f.service.identity(1).id,discordId);
 await f.call('/api/discord/disconnect','POST');assert.equal(f.service.identity(1),null);
 const next=(await f.start()).searchParams.get('state');assert.equal((await f.call(f.callback(next))).headers.Location,'/?discord=linked#apply');
 f.db.prepare('DELETE FROM users WHERE id=1').run();assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM discord_links').get().n,0);
});
test('Verified Discord display escapes provider names; typed names remain explicitly unverified',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/hq.js'),'utf8');
 const context={document:{addEventListener(){}},setTimeout,clearTimeout};vm.createContext(context);vm.runInContext(source,context);
 context.identity={id:discordId,username:'<img src=x onerror=alert(1)>',display_name:'<script>bad</script>',linked_at:new Date().toISOString()};
 const html=vm.runInContext('verifiedDiscordHTML(identity)',context);assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/987654321098765432/);
 assert.match(source,/Discord \(unverifiziert\)/);
});
