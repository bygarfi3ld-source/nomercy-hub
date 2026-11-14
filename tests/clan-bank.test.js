'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const net=require('node:net');
const secret='only-for-bank-integration-tests-not-real-admin';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n))})})}
async function boot(dir){const port=await freePort(),url=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,NODE_ENV:'development',ADMIN_BOOTSTRAP_TOKEN:secret,SITE_PREVIEW_LOCK:'0'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',d=>errors+=d.toString());
 for(let i=0;i<95;i++){if(child.exitCode!==null)break;try{const r=await fetch(url+'/healthz');if(r.ok)return {url,child}}catch{}await delay(100)}
 child.kill();throw Error('Bank-Testserver nicht gestartet: '+errors);
}
async function stop(s){s.child.kill('SIGTERM');await Promise.race([new Promise(r=>s.child.once('exit',r)),delay(1200)]);}
async function call(url,p,body,cookie){const r=await fetch(url+p,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function register(url,handle){const r=await call(url,'/api/register',{handle,password:'some-very-secure-test-password'});assert.equal(r.status,201,JSON.stringify(r.data));return r.cookie;}
test('Clanbank: Mitgliederfreigabe, nachvollziehbares Ledger, genehmigte Auszahlung und Neustart', {timeout:40000}, async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nomercy-bank-'));let srv;
 try{
  srv=await boot(dir);let url=srv.url;
  const admin=await register(url,'BankAdmin'),member=await register(url,'BankMember'),stranger=await register(url,'Stranger');
  assert.equal((await call(url,'/api/hq/bank')).status,401);
  assert.equal((await call(url,'/api/hq/bank',undefined,stranger)).status,403);
  assert.equal((await call(url,'/api/hq/bank',undefined,member)).status,403);
  assert.equal((await call(url,'/api/hq/bank/requests',{title:'Preisgeld anfordern',amount:'1',reason:'Etwas Geld für unseren Clan'},member)).status,403);
  assert.equal((await call(url,'/api/admin/claim',{token:secret},admin)).status,200);
  assert.equal((await call(url,'/api/hq/clan/members',{handle:'BankMember',clan:'clan3'},admin)).status,200);
  const empty=await call(url,'/api/hq/bank',undefined,member);assert.equal(empty.status,200);
  assert.equal(empty.data.balance_milli,0,'Keine erfundenen Gelder');
  assert.deepEqual(empty.data.ledger,[]);assert.deepEqual(empty.data.requests,[]);
  assert.equal((await call(url,'/api/hq/bank/transactions',{kind:'deposit',amount:'5',note:'Versuch einer fremden Buchung'},member)).status,403);
  assert.equal((await call(url,'/api/hq/bank/transactions',{kind:'deposit',amount:'50.250',note:'Startbestand von Clankasse'},stranger)).status,403);
  assert.equal((await call(url,'/api/hq/bank/transactions',{kind:'deposit',amount:'50.250',note:'Startbestand von Clankasse'},admin)).status,201);
  assert.equal((await call(url,'/api/hq/bank',undefined,member)).data.balance_milli,50250);
  const badAmount=await call(url,'/api/hq/bank/requests',{title:'Ungültiger Antrag',amount:'1.0005',reason:'Vier Nachkommastellen nicht erlaubt'},member);
  assert.equal(badAmount.status,400);
  const request=await call(url,'/api/hq/bank/requests',{title:'Turnier-Preisgelder',amount:'25,5',reason:'Wir planen ein faires Turnier für die drei Clans und benötigen Preisgeld.'},member);
  assert.equal(request.status,201,JSON.stringify(request.data));const id=request.data.id;
  assert.equal((await call(url,`/api/hq/bank/requests/${id}/review`,{decision:'approve',note:'Clan-Turnier macht Sinn.'},member)).status,403);
  assert.equal((await call(url,`/api/hq/bank/requests/${id}/payout`,{note:'Ich gebe hiermit Geld aus.'},stranger)).status,403);
  assert.equal((await call(url,`/api/hq/bank/requests/${id}/review`,{decision:'approve',note:'Gutes Turnier für die drei Clans.'},admin)).status,200);
  let report=await call(url,'/api/hq/bank',undefined,admin);
  assert.equal(report.data.requests[0].status,'approved');
  assert.equal(report.data.balance_milli,50250,'Genehmigung allein verändert nicht die Kasse');
  assert.equal((await call(url,`/api/hq/bank/requests/${id}/payout`,{note:'25,5 Mio. Ingame-Geld dem Organisator übergeben.'},admin)).status,200);
  assert.equal((await call(url,`/api/hq/bank/requests/${id}/payout`,{note:'Ein zweites Mal ausgezahlt.'},admin)).status,409,'Keine doppelte Auszahlung');
  report=await call(url,'/api/hq/bank',undefined,member);
  assert.equal(report.data.balance_milli,24750);
  assert.equal(report.data.requests[0].status,'paid');
  assert.equal(report.data.ledger.length,2);
  assert.equal(report.data.ledger[0].delta_milli,-25500);
  assert.equal(report.data.ledger[0].before_milli,50250);
  assert.equal(report.data.ledger[0].after_milli,24750);
  assert.equal(report.data.ledger[0].request_id,id);
  assert.equal((await call(url,'/api/hq/bank/transactions',{kind:'withdrawal',amount:'100',note:'Mehr ausgeben als in der Kasse'},admin)).status,409);
  assert.equal((await call(url,'/api/hq/bank',undefined,admin)).data.balance_milli,24750);
  const second=await call(url,'/api/hq/bank/requests',{title:'Eine neue Kiste',amount:'0.5',reason:'Brauchen die Ressourcen für einen neuen gemeinsamen Clanbau.'},member);
  assert.equal(second.status,201);
  assert.equal((await call(url,`/api/hq/bank/requests/${second.data.id}/review`,{decision:'reject',note:'Der Antrag wird vorerst zurückgestellt.'},admin)).status,200);
  assert.equal((await call(url,`/api/hq/bank/requests/${second.data.id}/payout`,{note:'Trotz Ablehnung auszahlen.'},admin)).status,409);
  assert.equal((await call(url,'/api/hq/bank/transactions',{kind:'balance_set',amount:'10',note:'Inventur der tatsächlichen Clankasse.'},admin)).status,201);
  const after=(await call(url,'/api/hq/bank',undefined,admin)).data;
  assert.equal(after.balance_milli,10000);assert.equal(after.ledger[0].kind,'balance_set');assert.equal(after.ledger[0].delta_milli,-14750);
  assert.equal((await call(url,'/api/hq/clan/members',{handle:'BankMember',clan:'remove'},admin)).status,200);
  assert.equal((await call(url,'/api/hq/bank',undefined,member)).status,403,'Entzogene Mitgliedschaft bedeutet keinen Bankzugriff');
  await stop(srv);srv=await boot(dir);url=srv.url;
  const restored=(await call(url,'/api/hq/bank',undefined,admin)).data;
  assert.equal(restored.balance_milli,10000,'Saldo bleibt nach Neustart gespeichert');
  assert.equal(restored.ledger.length,3);
  assert.equal(restored.requests.length,2);
  assert.equal((await call(url,'/api/hq/bank',undefined,member)).status,403);
 }finally{if(srv)await stop(srv);rmSync(dir,{force:true,recursive:true});}
});
test('Clanbank-Oberfläche: eigene Navigation, Formulare und Pixel-Item auf der Unterseite',()=>{
 const fs=require('node:fs');const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/hq.js'),'utf8');const css=fs.readFileSync(path.join(__dirname,'../public/hq.css'),'utf8');
 for(const el of ['bankPanel','bankGate','bankRequestBtn','bankTransactionBtn','bankBalance','bankRequestList','bankTransactionList']) assert.match(html,new RegExp(`id="${el}"`));
 assert.match(html,/data-tab="bank"/);assert.match(html,/nm-pixel-emerald/);assert.match(js,/showBankRequestForm/);assert.match(js,/loadBank/);
 assert.match(css,/\.bank-hero/);assert.match(css,/prefers-reduced-motion:reduce/);
});
