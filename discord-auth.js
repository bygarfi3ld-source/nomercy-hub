'use strict';
const crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const snowflake=value=>typeof value==='string'&&/^[0-9]{17,22}$/.test(value);
// Only identify is requested. OAuth tokens and PKCE verifiers never enter the database.
function initDiscordAuth({db,json,errors,requireUser,currentUser,cookieGet,checkRate,env=process.env,fetchImpl=fetch,clock=Date.now}){
 db.exec(`CREATE TABLE IF NOT EXISTS discord_links (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL,
  display_name TEXT NOT NULL, linked_at TEXT NOT NULL
 );`);
 const pending=new Map(),ttl=10*60000;
 const clientId=env.NOMERCY_DISCORD_CLIENT_ID||'';
 const redirectUri=env.NOMERCY_DISCORD_REDIRECT_URI||'https://nomercy-mc.net/api/discord/callback';
 let configured=false;
 try{const u=new URL(redirectUri);configured=snowflake(clientId)&&u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/api/discord/callback';}catch{}
 const identity=userId=>{
  const row=db.prepare('SELECT discord_id,username,display_name,linked_at FROM discord_links WHERE user_id=?').get(userId);
  return row?{id:row.discord_id,username:row.username,display_name:row.display_name,linked_at:row.linked_at}:null;
 };
 function clearUser(userId){for(const [key,value]of pending)if(value.userId===userId)pending.delete(key);}
 function redirect(res,result){res.writeHead(303,{'Location':'/?discord='+result+'#apply','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end();}
 async function discordJSON(url,options){
  const response=await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Discord request failed');
  return response.json();
 }
 async function api(req,res,url){
  const p=url.pathname;
  if(p==='/api/discord/status'&&req.method==='GET'){
   const user=requireUser(req);return json(res,200,{available:configured,identity:identity(user.id)});
  }
  if(p==='/api/discord/start'&&req.method==='POST'){
   const user=requireUser(req);checkRate(req,'discord-start',10,600000);
   if(!configured)throw errors(503,'Die Discord-Verbindung wird noch eingerichtet. Bitte prüfe deine Identität vorerst mit der Clanleitung.');
   if(identity(user.id))throw errors(409,'Dieses Hub-Konto hat bereits eine Discord-Verbindung.');
   for(const [key,value]of pending)if(value.expires<=clock())pending.delete(key);
   clearUser(user.id);
   if(pending.size>=1000)throw errors(503,'Bitte versuche die Discord-Verbindung später erneut.');
   const state=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(32).toString('base64url');
   const stateHash=hash(state);
   pending.set(stateHash,{userId:user.id,session:hash(cookieGet(req,'sid')),verifier,expires:clock()+ttl,processing:false});
   const expiry=setTimeout(()=>pending.delete(stateHash),ttl);expiry.unref();
   const authorize=new URL('https://discord.com/oauth2/authorize');
   authorize.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:'identify',
    state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'consent'}).toString();
   return json(res,200,{url:authorize.href});
  }
  if(p==='/api/discord/disconnect'&&req.method==='POST'){
   const user=requireUser(req);checkRate(req,'discord-disconnect',10,600000);clearUser(user.id);
   db.prepare('DELETE FROM discord_links WHERE user_id=?').run(user.id);
   return json(res,200,{ok:true});
  }
  if(p==='/api/discord/callback'&&req.method==='GET'){
   const state=url.searchParams.get('state')||'';
   if(!/^[A-Za-z0-9_-]{43}$/.test(state))return redirect(res,'expired');
   const key=hash(state),entry=pending.get(key),user=currentUser(req);
   if(!configured||!entry||entry.processing||entry.expires<=clock()||!user||entry.userId!==user.id||entry.session!==hash(cookieGet(req,'sid')))return redirect(res,'expired');
   entry.processing=true; // Consume before the first await; callbacks cannot be replayed.
   try{
    if(url.searchParams.has('error'))return redirect(res,'cancelled');
    if(url.searchParams.has('iss')&&url.searchParams.get('iss')!=='https://discord.com')return redirect(res,'failed');
    const code=url.searchParams.get('code')||'';
    if(!code||code.length>2048)return redirect(res,'failed');
    const token=await discordJSON('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
     body:new URLSearchParams({client_id:clientId,grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:entry.verifier}).toString()});
    if(typeof token.access_token!=='string'||token.access_token.length>4096||!token.access_token||token.token_type?.toLowerCase()!=='bearer'||!String(token.scope||'').split(' ').includes('identify'))throw Error('Invalid token');
    const discord=await discordJSON('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+token.access_token}});
    if(!snowflake(discord.id)||typeof discord.username!=='string'||!discord.username||discord.username.length>100||discord.bot)throw Error('Invalid identity');
    // Logout, unlink, another start or expiry during network requests cancels this attempt.
    const active=currentUser(req);
    if(pending.get(key)!==entry||entry.expires<=clock()||active?.id!==entry.userId)return redirect(res,'expired');
    const existing=db.prepare('SELECT user_id FROM discord_links WHERE discord_id=?').get(discord.id);
    if(existing&&existing.user_id!==entry.userId)return redirect(res,'in_use');
    if(identity(entry.userId))return redirect(res,'already_linked');
    const display=typeof discord.global_name==='string'?discord.global_name.slice(0,100):discord.username;
    db.prepare('INSERT INTO discord_links(user_id,discord_id,username,display_name,linked_at) VALUES(?,?,?,?,?)')
     .run(entry.userId,discord.id,discord.username,display,new Date(clock()).toISOString());
    return redirect(res,'linked');
   }catch{
    // Never log provider responses, authorization codes or access/refresh tokens.
    return redirect(res,'failed');
   }finally{pending.delete(key);}
  }
  throw errors(405,'Methode nicht erlaubt');
 }
 return {api,identity};
}
module.exports={initDiscordAuth};
