'use strict';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const date=x=>new Date(x).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const state={user:null,market:[],events:[],giveaways:[],members:[],roster:[],teamRoles:[],reports:[],bank:null,tab:'market'};
let toastTimeout,spinCancelled=false,spinActive=false,spinSkip=false;
const staff=()=>['admin','moderator'].includes(state.user?.role);
const eventCreator=()=>staff()||state.user?.role==='event_manager';
const member=()=>!!state.user?.clan;
const eventMember=()=>member()||state.user?.role==='event_manager';
const bankEligible=()=>state.user?.role==='admin'||['main','clan2','clan3'].includes(state.user?.clan);
const money=x=>(Number(x)/1000).toLocaleString('de-DE',{maximumFractionDigits:3});
const labelClan={main:'👑 Main Clan',clan2:'⚔ Clan 2',clan3:'🛡 Clan 3',staff:'🛡 Clan-Team'};
function toast(msg){clearTimeout(toastTimeout);$('#toast').textContent=msg;$('#toast').classList.add('show');toastTimeout=setTimeout(()=>$('#toast').classList.remove('show'),4200);}
async function api(path,body){const opt={credentials:'same-origin',headers:{}};if(body!==undefined){opt.method='POST';opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
 const res=await fetch(path,opt);let data;try{data=await res.json();}catch{throw Error('Serverantwort ungültig.');}if(!res.ok)throw Error(data.error||`Fehler ${res.status}`);return data;}
function formToObj(form){return Object.fromEntries(new FormData(form).entries());}
function localISO(raw){const d=new Date(raw);if(!raw||!Number.isFinite(+d))throw Error('Bitte eine gültige Endzeit angeben.');return d.toISOString();}
function localDefault(minutes){const d=new Date(Date.now()+minutes*60000);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);}
function formError(err){$('#dialogError').hidden=false;$('#dialogError').textContent=err.message;}
function modal(title,body,kicker='NOMERCY HQ'){$('#dialogTitle').textContent=title;$('#dialogKicker').textContent=kicker;$('#dialogBody').innerHTML=body;$('#dialogError').hidden=true;$('#dialog').showModal();}
function closeModal(){$('#dialog').close();}
const authHTML=(register=false)=>`<form class="form" id="authForm">
 <label>Hub-Benutzername<input name="handle" autocomplete="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" required placeholder="Dein Hub-Name"></label>
 <label>Passwort<input type="password" name="password" autocomplete="${register?'new-password':'current-password'}" minlength="${register?10:1}" maxlength="128" required placeholder="${register?'Mindestens 10 Zeichen':'Dein Passwort'}"></label>
 <button class="btn primary full">${register?'Konto erstellen':'Anmelden'}</button>
 <button class="textlink" type="button" id="switchAuth">${register?'Schon ein Konto? Anmelden':'Neu hier? Hub-Konto erstellen'}</button>
 <small>Eigenes Hub-Passwort verwenden – niemals Minecraft- oder Microsoft-Zugangsdaten. Minecraft-Namen sind nicht verifiziert.</small></form>`;
function showAuth(register=false){modal(register?'Konto erstellen':'Anmelden',authHTML(register),'HUB ACCOUNT');$('#switchAuth').onclick=()=>showAuth(!register);
 $('#authForm').onsubmit=async e=>{e.preventDefault();const b=formToObj(e.currentTarget);try{await api(register?'/api/register':'/api/login',b);closeModal();await refreshUser();await Promise.all([loadMarket(),loadPrivate()]);if(state.tab==='bank')await loadBank();if(state.tab==='apply')await loadApplication();toast(register?'Willkommen im NoMercy Hub!':'Erfolgreich angemeldet.');}catch(err){formError(err);}};}
function syncHeader(){const u=state.user;$('#accountBtn').textContent=u?`${u.handle} ↗`:'Anmelden';
 $$('.staff-action').forEach(x=>x.hidden=!staff());$$('.event-action').forEach(x=>x.hidden=!eventCreator());$('#moderationNav').hidden=!staff();$('#membersNav').hidden=!staff();
 $('#memberManagement').hidden=u?.role!=='admin';$('#approvedMembersPanel').hidden=u?.role!=='admin';$('#teamRolesPanel').hidden=u?.role!=='admin';$('#clanApplicationsPanel').hidden=u?.role!=='admin';
 $('#membersPanel').setAttribute('aria-label','Clan-Team – nur für berechtigte Teammitglieder');
 $('#bankTransactionBtn').hidden=u?.role!=='admin';$('#bankRequestBtn').hidden=!bankEligible();
 $('#memberbar').textContent=!u?'Marktplatz für alle · Öffentliche Giveaways mit Hub-Konto · Clan-Events nur mit Freigabe.':
 u.clan?`${u.handle} · ${labelClan[u.clan]||u.clan} · Clan-Zugang aktiv. Gewinne werden manuell ingame übergeben.`:
 u.role==='event_manager'?`${u.handle} · Event-Team aktiv. Du kannst Clan-Events planen und eigene Events schließen, aber keine Giveaways oder Clanbank verwalten.`:
 `${u.handle} · Öffentliche Giveaways sind für dich offen. Für Clan-Events und private Giveaways muss die Leitung dich freischalten.`;
 }
async function refreshUser(){state.user=(await api('/api/hq/me')).user;syncHeader();}
// An admin can approve a member while their browser is open. Keep access state fresh
// when returning to the tab or navigating; no page reload or logout is necessary.
let accessRefreshInFlight=null;
async function syncApprovedAccess(){
 if(!state.user)return;
 if(accessRefreshInFlight)return accessRefreshInFlight;
 accessRefreshInFlight=(async()=>{
  const oldClan=state.user?.clan,oldRole=state.user?.role;
  await refreshUser();
  if(oldClan!==state.user?.clan||oldRole!==state.user?.role){
   await loadPrivate();
   if(state.tab==='apply')await loadApplication();
   if(state.tab==='bank')await loadBank();
   if(!oldClan&&state.user?.clan)toast('✓ Dein Clan-Zugang ist jetzt freigeschaltet!');
  }
 })();
 try{await accessRefreshInFlight}finally{accessRefreshInFlight=null;}
}
const skeletonCard=()=>`<article class="skeleton-card" aria-hidden="true">
  <span class="skeleton-line sm"></span>
  <span class="skeleton-line lg"></span>
  <span class="skeleton-line md"></span>
  <span class="skeleton-line short"></span>
  <span class="skeleton-block"></span>
 </article>`;
function setSkeleton(selector,count=3){const list=$(selector);if(!list)return;list.setAttribute('aria-busy','true');list.innerHTML=Array.from({length:count},skeletonCard).join('');}
function finishSkeleton(selector){$(selector)?.setAttribute('aria-busy','false');}
// Fast API responses still get a brief visual loading state so transitions are legible.
// Reduced-motion or background tabs never wait artificially.
const prefersReducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
async function settleLoading(started,minimum=340){
 if(prefersReducedMotion()||document.visibilityState==='hidden')return;
 const remaining=minimum-(performance.now()-started);
 if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
}
function loadingError(selector,message){finishSkeleton(selector);$(selector).innerHTML=`<div class="empty"><strong>Gerade nicht erreichbar.</strong>${esc(message)}<p class="muted">Bitte versuche es gleich noch einmal.</p></div>`;}
async function loadMarket(){const started=performance.now();setSkeleton('#marketList');try{const {listings}=await api('/api/hq/market');await settleLoading(started,390);state.market=listings;$('#statMarket').textContent=listings.length;renderMarket();finishSkeleton('#marketList');}catch(e){loadingError('#marketList',e.message);throw e;}}
function renderMarket(){const q=$('#marketSearch').value.trim().toLowerCase(),filter=$('#marketFilter').value;
 const list=state.market.filter(x=>(filter==='all'||x.kind===filter)&&(!q||[x.title,x.description,x.mc_contact].join(' ').toLowerCase().includes(q)));
 $('#marketList').innerHTML=list.length?list.map(x=>{
 const pill=x.kind==='offer'?'VERKAUF':x.kind==='search'?'SUCHE':'SERVICE';
 return `<article class="tile"><div class="tile-top"><span class="pill ${x.kind==='offer'?'red':''}">${pill}</span><span class="meta">#${x.id}</span></div><h3>${esc(x.title)}</h3><p class="desc">${esc(x.description)}</p><div class="price">${x.price_millions?esc(x.price_millions.toLocaleString('de-DE'))+' Mio.':'VB'}</div><div class="meta">Kontakt ingame: <b>${esc(x.mc_contact)}</b><br>Erstellt von ${esc(x.creator_handle)} · ${date(x.created_at)}</div><div class="actions">
  <button class="btn outline" data-market="copy" data-id="${x.id}">Kontakt kopieren</button>${x.is_owner?`<button class="btn outline" data-market="close" data-id="${x.id}">Erledigt</button>`:''}${state.user&&!x.is_owner?`<button class="btn outline" data-market="report" data-id="${x.id}">Melden</button>`:''}</div></article>`;
 }).join(''):'<div class="empty"><strong>Keine Anzeigen gefunden.</strong>Noch ist es hier ruhig. Erstelle die erste echte Anzeige für die HugoSMP-Community.</div>';
}
async function loadPrivate(){const started=performance.now();setSkeleton('#giveawayList',2);if(eventMember())setSkeleton('#eventList',2);
 try{const ga=await api('/api/hq/giveaways');state.giveaways=ga.giveaways;$('#statGiveaways').textContent=ga.giveaways.length;
  if(eventMember()){const ev=await api('/api/hq/events');state.events=ev.events;$('#statEvents').textContent=ev.events.filter(e=>e.status==='open').length;}
  else{state.events=[];$('#statEvents').textContent='–';}
  await settleLoading(started,360);renderPrivate();finishSkeleton('#giveawayList');finishSkeleton('#eventList');}
 catch(e){loadingError('#giveawayList',e.message);loadingError('#eventList',e.message);throw e;}}
let applicationMode='application';
async function showClanApplication(mode='application'){applicationMode=mode==='existing'?'existing':'application';await setTab('apply');}
function renderApplicationMode(){
 const existing=applicationMode==='existing';
 $('#applyForm').hidden=existing;$('#accessForm').hidden=!existing;
 $('#applyModeNew').classList.toggle('selected',!existing);$('#applyModeExisting').classList.toggle('selected',existing);
 $('#applyModeNew').setAttribute('aria-pressed',String(!existing));$('#applyModeExisting').setAttribute('aria-pressed',String(existing));
 $('#applyHeading').textContent=existing?'Du bist schon NoMercy-Mitglied?':'Neu bei NoMercy bewerben.';
}
async function loadCommunityLinks(){
 try{const links=await api('/api/community-links');
  const inv=$('#discordInviteLink'),ticket=$('#discordTicketLink');
  inv.hidden=!links.invite_url;ticket.hidden=!links.ticket_url;
  if(links.invite_url)inv.href=links.invite_url;
  if(links.ticket_url)ticket.href=links.ticket_url;
  $('#discordLinksPending').hidden=!!(links.invite_url||links.ticket_url);
  $('#discordLinksHint').hidden=!(links.invite_url||links.ticket_url);
 }catch{$('#discordLinksPending').textContent='Discord ist gerade nicht erreichbar. Bitte später erneut versuchen.';}
}
async function loadApplication(){
 const form=$('#applyForm'),accessForm=$('#accessForm'),gate=$('#applyGate'),status=$('#applyStatus'),switcher=$('#applyModeSwitcher');
 form.hidden=true;accessForm.hidden=true;switcher.hidden=true;gate.hidden=!!state.user;status.hidden=true;
 if(!state.user)return;
 const started=performance.now();status.hidden=false;
 status.innerHTML='<div class="apply-loading" aria-label="Antragsstatus lädt"><span class="skeleton-line lg"></span><span class="skeleton-line md"></span><span class="skeleton-line short"></span></div>';
 try{
  const {request}=await api('/api/hq/clan/requests');
  await settleLoading(started,320);
  if(member()||request?.status==='approved'){
   status.innerHTML='<div class="apply-info is-approved"><strong>✓ Dein Hub-Clanzugang ist bereits freigeschaltet.</strong><p>Deinen bestätigten Clanrang siehst du oben in deinem Konto.</p></div>';return;
  }
  if(request?.status==='pending'){
   const kind=request.request_type==='existing'?'Zugangsprüfung für bestehende Mitglieder':'Clan-Bewerbung';
   status.innerHTML=`<div class="apply-info"><strong>⏳ ${kind} läuft.</strong><p>Dein Antrag für ${esc(labelClan[request.desired_clan]||request.desired_clan)} liegt der Clanleitung vor. Der Zugang wird erst nach manueller Prüfung vergeben.</p></div>`;return;
  }
  if(request?.status==='rejected'){
   status.innerHTML=`<div class="apply-info is-rejected"><strong>Letzter Antrag abgelehnt.</strong><p>${esc(request.review_note||'Bitte kontaktiere die Clanleitung.')}</p><small>Ein erneuter Antrag ist nach 24 Stunden möglich.</small></div>`;
  }else status.hidden=true;
  switcher.hidden=false;
  if(request?.mc_name){form.elements.mc_name.value=request.mc_name;accessForm.elements.mc_name.value=request.mc_name;}
  if(['clan2','clan3'].includes(request?.desired_clan))form.elements.desired_clan.value=request.desired_clan;
  if(['main','clan2','clan3'].includes(request?.desired_clan))accessForm.elements.desired_clan.value=request.desired_clan;
  renderApplicationMode();
 }catch(e){status.hidden=false;status.innerHTML=`<div class="apply-info is-rejected">Antragsstatus konnte nicht geladen werden: ${esc(e.message)}</div>`;}
}
async function submitApplication(e){
 e.preventDefault();const form=e.currentTarget,fields=formToObj(form);
 const message=`Spielstil: ${fields.playstyle}\nOnline: ${fields.availability}\nDiscord (unverifiziert): ${fields.discord_name?.trim()||'Nicht angegeben'}\nMotivation: ${fields.message.trim()}`;
 if(!fields.playstyle||!fields.availability||message.length>600){toast('Bitte überprüfe deine Angaben (max. 600 Zeichen insgesamt).');return;}
 const button=$('#applySubmit');button.disabled=true;
 try{await api('/api/hq/clan/requests',{mc_name:fields.mc_name,desired_clan:fields.desired_clan,message,request_type:'application'});form.reset();await loadApplication();toast('Bewerbung abgeschickt! Die Clanleitung prüft sie.');}
 catch(err){toast(err.message)}finally{button.disabled=false;}
}
async function submitExistingAccess(e){
 e.preventDefault();const form=e.currentTarget,fields=formToObj(form);
 const message=`Bereits Mitglied: ${fields.desired_clan}\nDiscord (unverifiziert): ${fields.discord_name?.trim()||'Nicht angegeben'}\nHinweise zur Prüfung: ${fields.message.trim()}`;
 const button=$('#accessSubmit');button.disabled=true;
 try{await api('/api/hq/clan/requests',{mc_name:fields.mc_name,desired_clan:fields.desired_clan,message,request_type:'existing'});form.reset();await loadApplication();toast('Zugangsprüfung angefragt! Die Clanleitung bestätigt deinen Rang.');}
 catch(err){toast(err.message)}finally{button.disabled=false;}
}
function privateEmpty(feature){return `<div class="empty"><strong>🔒 ${feature} sind nur für Clanmitglieder.</strong>Dieser Bereich ist für freigeschaltete NoMercy-Mitglieder reserviert. Lass dich von der Clanleitung freischalten.<div class="empty-action"><button class="btn primary" data-action="login">${state.user?'Bestehenden Clan-Zugang beantragen':'Hub-Account anmelden'}</button></div></div>`;}
function timeLeft(raw){const d=Date.parse(raw)-Date.now();if(d<=0)return 'Abgelaufen';const total=Math.floor(d/1000);const days=Math.floor(total/86400),hours=Math.floor(total%86400/3600),minutes=Math.floor(total%3600/60),secs=total%60;return (days?days+'T ':'')+String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0')+':'+String(secs).padStart(2,'0');}
function giveawayPrize(g){return g.prize_kind==='money'?`${Number(g.prize_amount).toLocaleString('de-DE')} Mio. Ingame-Geld pro Gewinner`:`${Number(g.prize_amount).toLocaleString('de-DE')}× ${esc(g.prize_detail)} pro Gewinner`;}
function renderPrivate(){
 $('#giveawayList').innerHTML=state.giveaways.length?state.giveaways.map(g=>{
 const open=g.status==='open'&&Date.parse(g.ends_at)>Date.now();const drawn=g.status==='drawn';
 return `<article class="tile"><div class="tile-top"><span class="pill ${open?'red':'dark'}">${open?'● LIVE':drawn?'✓ AUSGELOST':g.status==='cancelled'?'ABGEBROCHEN':'ZIEHUNG'}</span><span class="pill ${g.visibility==='public'?'public':'private'}">${g.visibility==='public'?'🌍 Öffentlich':'🔒 Nur NoMercy'}</span></div>
 <h3>🎁 ${esc(g.title)}</h3><p class="desc">${esc(g.description)}</p><div class="price">${giveawayPrize(g)}</div><div class="meta">${g.winner_count} Gewinner · ${g.entries} Teilnahmen${g.fulfilled_at?' · ✓ Übergeben':''}<br>Ende: ${date(g.ends_at)} Uhr</div>
 <div class="countdown" data-countdown="${esc(g.ends_at)}">${timeLeft(g.ends_at)}</div><div class="progress"><div></div></div><div class="actions">${open?`<button class="btn ${g.entered?'outline':'primary'}" data-giveaway="enter" data-id="${g.id}">${g.entered?'✓ Teilnahme zurückziehen':!state.user?'Anmelden & teilnehmen':'Jetzt teilnehmen'}</button>`:drawn?`<button class="btn primary" data-giveaway="spin" data-id="${g.id}">Gewinner-Reveal ansehen ↗</button>`:`<button class="btn outline" disabled>${g.status==='cancelled'?'Abgebrochen':'Auslosung läuft'}</button>`}
 ${staff()&&open?`<button class="btn outline" data-giveaway="cancel" data-id="${g.id}">Abbrechen</button>`:''}${staff()&&drawn&&!g.fulfilled_at?`<button class="btn outline" data-giveaway="fulfill" data-id="${g.id}">Als übergeben markieren</button>`:''}</div></article>`;
 }).join(''):`<div class="empty"><strong>Noch keine öffentlichen Giveaways.</strong>${member()?'Auch private Clan-Drops sind momentan nicht geplant.':'Private Clan-Drops sind nur für freigeschaltete Mitglieder sichtbar.'}</div>`;
 if(!eventMember()){$('#eventList').innerHTML=privateEmpty('Clan-Events');return;}
 $('#eventList').innerHTML=state.events.length?state.events.map(e=>{
 const live=e.status==='open'&&Date.parse(e.ends_at)>Date.now();return `<article class="tile"><div class="tile-top"><span class="pill red">${esc(e.category)}</span><span class="meta">#${e.id}</span></div><h3>⚔ ${esc(e.title)}</h3><p class="desc">${esc(e.description)}</p><div class="meta">Start: ${date(e.starts_at)} Uhr<br>${e.participants}/${e.max_players} Mitglieder · von ${esc(e.creator_handle)}</div>
 <div class="actions">${live?`<button class="btn ${e.joined?'outline':'primary'}" data-event="join" data-id="${e.id}">${e.joined?'✓ Abmelden':'Teilnehmen'}</button>`:'<button class="btn outline" disabled>Beendet</button>'}${(staff()||(state.user?.role==='event_manager'&&e.is_owner))&&live?`<button class="btn outline" data-event="close" data-id="${e.id}">Schließen</button>`:''}</div></article>`;
 }).join(''):'<div class="empty"><strong>Noch keine Clan-Events geplant.</strong>Noch keine Termine eingetragen.</div>';
}
const sectionNames={market:'Marktplatz',giveaways:'Giveaways',events:'Clan-Events',roster:'Mitglieder',apply:'Bewerben',bank:'Clanbank',members:'Clan-Team'};
// A real navigation state: the large home hero must not obscure inner pages.
function showSection(tab){
 if(!Object.hasOwn(sectionNames,tab))tab='market';
 state.tab=tab;document.body.dataset.section=tab;
 const home=tab==='market';
 const hero=$('.hero'),stats=$('.stats');if(hero)hero.hidden=!home;if(stats)stats.hidden=!home;
 const brandSubtitle=$('.logo small');if(brandSubtitle)brandSubtitle.textContent=`CLAN HQ / ${sectionNames[tab].toUpperCase()}`;
 let marker=$('#sectionMarker');
 if(!marker){marker=document.createElement('div');marker.id='sectionMarker';marker.className='section-marker';
  marker.innerHTML='<span class="section-marker-eyebrow">DU BIST HIER</span><strong class="section-marker-name"></strong><span class="section-marker-identity">NO MERCY / CLAN HQ</span>';
  $('.topbar').insertAdjacentElement('afterend',marker);}
 marker.hidden=home;marker.querySelector('.section-marker-name').textContent=sectionNames[tab];
 $$('.nav [data-tab]').forEach(x=>{const selected=x.dataset.tab===tab;x.classList.toggle('active',selected);x.setAttribute('aria-current',selected?'page':'false');x.setAttribute('aria-pressed',String(selected));if(selected&&typeof x.scrollIntoView==='function'&&document.readyState==='complete')x.scrollIntoView({behavior:'auto',block:'nearest',inline:'nearest'});});
 $$('.tab-panel').forEach(x=>{const visible=x.id===tab+'Panel';x.hidden=!visible;x.classList.remove('panel-enter');if(visible&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){void x.offsetWidth;x.classList.add('panel-enter');}});
 document.title=`${sectionNames[tab]} · NoMercy Clan HQ`;
}
async function setTab(tab,{historyMode='push',resetScroll=true}={}){
 if(!Object.hasOwn(sectionNames,tab))tab='market';
 if(tab==='members'&&!staff())tab='roster';
 if(tab===state.tab&&historyMode==='push')return;
 showSection(tab);
 if(historyMode==='push'&&location.hash!=='#'+tab)history.pushState(null,'','#'+tab);
 // Reset the viewport immediately; users should never remain above an invisible subpage.
 if(resetScroll)window.scrollTo({top:0,behavior:'instant'});
 await syncApprovedAccess();
 if(tab==='members'&&staff())await loadTeam();if(tab==='roster')await loadRoster();if(tab==='apply')await loadApplication();if(tab==='bank')await loadBank();if(['events','giveaways'].includes(tab))await loadPrivate();
}
async function loadRoster(){
 const {members}=await api('/api/hq/clan/roster');state.roster=Array.isArray(members)?members:[];renderRoster();
}
function renderRoster(){
 const search=($('#rosterSearch').value||'').trim().toLocaleLowerCase('de-DE');
 const filter=$('#rosterFilter').value;
 const members=state.roster.filter(u=>(filter==='all'||u.clan===filter)&&String(u.handle).toLocaleLowerCase('de-DE').includes(search));
 const counts=Object.fromEntries(['main','clan2','clan3'].map(x=>[x,state.roster.filter(u=>u.clan===x).length]));
 $('#rosterSummary').innerHTML='<span><strong>'+state.roster.length+'</strong> Mitglieder</span>'+['main','clan2','clan3'].map(x=>'<span><strong>'+counts[x]+'</strong> '+esc(labelClan[x])+'</span>').join('');
 $('#rosterCount').textContent=members.length+' von '+state.roster.length+' bestätigten Mitgliedern';
 $('#rosterList').innerHTML=members.length?members.map(u=>'<article class="roster-person"><span class="roster-avatar" aria-hidden="true">'+esc(u.handle.slice(0,1).toUpperCase())+'</span><span class="roster-person-info"><strong>'+esc(u.handle)+'</strong><small>Bestätigtes Hub-Clanmitglied</small></span><span class="roster-rank rank-'+esc(u.clan)+'">'+esc(labelClan[u.clan]||u.clan)+'</span></article>').join(''):'<div class="empty"><strong>Keine passenden Mitglieder.</strong>'+ (state.roster.length?'Versuche einen anderen Suchbegriff oder Clan.':'Noch keine Mitglieder im Hub bestätigt.') +'</div>';
}
async function loadTeamRoles(){
 if(state.user?.role!=='admin')return;
 const {team}=await api('/api/admin/team');state.teamRoles=Array.isArray(team)?team:[];
 $('#teamRoleList').innerHTML=state.teamRoles.length?state.teamRoles.map(u=>'<div class="team-role-item"><span><strong>'+esc(u.handle)+'</strong><small>'+esc(({admin:'Administrator',moderator:'Moderator · Giveaways & Moderation',event_manager:'Event-Team · nur Events'})[u.role]||u.role)+'</small></span><span class="pill '+(u.role==='admin'?'red':'dark')+'">'+esc(u.role==='admin'?'OWNER':u.role==='moderator'?'MOD':'EVENT')+'</span></div>').join(''):'<p class="muted">Noch keine Teamrollen vergeben.</p>';
}
async function loadTeam(){if(!staff())return;
 if(state.user.role==='admin'){
  await loadTeamRoles();
  const {members}=await api('/api/hq/clan/members');state.members=members;
  const applications=await api('/api/hq/clan/requests');
  const requests=Array.isArray(applications.requests)?applications.requests:[];
  const pending=requests.filter(r=>r.status==='pending'),history=requests.filter(r=>r.status!=='pending');
  $('#clanApplicationsSummary').textContent=`${pending.length} offen · ${history.length} bearbeitet · ${requests.length} angezeigt`;
  $('#clanApplications').innerHTML=pending.length?pending.map(r=>`<article class="tile clan-application">
   <div class="tile-top"><span class="pill red">${r.request_type==='existing'?'● ZUGANGSPRÜFUNG':'● NEUBEWERBUNG'}</span><span class="meta">#${r.id}</span></div>
   <h3>${esc(r.handle)}</h3><p class="desc">Minecraft: <b>${esc(r.mc_name)}</b> (unverifiziert) · Wunsch: ${esc(labelClan[r.desired_clan]||r.desired_clan)}</p>
   <p class="desc">${esc(r.message)}</p><div class="meta">Eingereicht: ${date(r.created_at)}</div>
   <label>Clanleitung entscheidet: <select id="join-clan-${r.id}">${r.request_type==='existing'?`<option value="main" ${r.desired_clan==='main'?'selected':''}>👑 Bestehenden Mainrang bestätigen</option>`:''}<option value="clan3" ${r.desired_clan==='clan3'?'selected':''}>Clan 3</option><option value="clan2" ${r.desired_clan==='clan2'?'selected':''}>Clan 2</option></select></label>
    ${r.request_type==='existing'?'<p class="desc">⚠ Identität und echten Clanrang außerhalb des Hubs prüfen. Main nur nach ausdrücklicher Bestätigung.</p>':''}
   <label>Begründung <textarea id="join-note-${r.id}" maxlength="400" minlength="8" placeholder="Prüfung, Entscheidung und Trustfactor …"></textarea></label>
   <div class="actions"><button class="btn outline" data-clan-review="reject" data-id="${r.id}">Ablehnen</button><button class="btn primary" data-clan-review="approve" data-id="${r.id}">Freischalten</button></div>
   </article>`).join(''):`<div class="empty"><strong>Keine offenen Bewerbungen.</strong>${history.length?'Bereits bearbeitete Anträge findest du direkt darunter.':'Hier ist aktuell kein Bewerbungsantrag gespeichert. Bitte den Spieler die Hub-Bewerbung abschicken lassen. Discord-Tickets werden nicht automatisch übernommen.'}</div>`;
  const reviewedLabel={approved:'✓ GENEHMIGT',rejected:'✕ ABGELEHNT'};
  $('#clanApplicationsHistory').innerHTML=history.length?history.map(r=>`<article class="tile clan-application is-reviewed">
   <div class="tile-top"><span class="pill ${r.status==='approved'?'approved':'rejected'}">${esc(reviewedLabel[r.status]||r.status)} · ${r.request_type==='existing'?'ZUGANG':'BEWERBUNG'}</span><span class="meta">#${r.id}</span></div>
   <h3>${esc(r.handle)}</h3><p class="desc">Minecraft: <b>${esc(r.mc_name)}</b> (unverifiziert) · Wunsch: ${esc(labelClan[r.desired_clan]||r.desired_clan)}</p>
   <p class="desc">${esc(r.message)}</p>
   <div class="meta">Eingereicht: ${date(r.created_at)} · Bearbeitet: ${date(r.updated_at)}${r.reviewed_by_handle?' · von '+esc(r.reviewed_by_handle):''}</div>
   ${r.review_note?`<p class="desc">Entscheidung: ${esc(r.review_note)}</p>`:''}
   </article>`).join(''):'<div class="empty">Noch keine bearbeiteten Clan-Bewerbungen.</div>';
  $('#memberList').innerHTML=members.length?members.map(u=>`<div class="tile"><b>${esc(u.handle)}</b><span class="tag">${labelClan[u.clan]||esc(u.clan)}</span><small>${date(u.approved_at)}</small>${u.clan==='clan3'?`<button type="button" class="btn outline" data-clan-promote="clan2" data-handle="${esc(u.handle)}">⬆ Zu Clan 2 befördern</button>`:u.clan==='clan2'?`<button type="button" class="btn primary" data-clan-promote="main" data-handle="${esc(u.handle)}">👑 In den Mainclan befördern</button>`:''}</div>`).join(''):'<div class="empty">Noch keine Clanmitglieder freigeschaltet.</div>';
 }
 const data=await api('/api/hq/mod/market');state.reports=data.reports;
 $('#marketReports').innerHTML=data.reports.filter(r=>r.status==='open').length?data.reports.filter(r=>r.status==='open').map(r=>`<div class="tile mod-report-card"><strong>${esc(r.listing_title)} · #${r.listing_id}</strong><p class="desc">${esc(r.reason)}</p><small>Von ${esc(r.reporter)} · ${date(r.created_at)}</small><label class="tag">Begründung (mind. 8 Zeichen)<textarea id="report-note-${r.id}" maxlength="400"></textarea></label><div class="actions"><button class="btn outline" data-review="dismissed" data-id="${r.id}">Verwerfen</button><button class="btn primary" data-review="reviewed" data-id="${r.id}">Prüfung speichern</button><button class="btn outline" data-hide-listing="${r.listing_id}" data-note-id="report-note-${r.id}">Inserat ausblenden</button></div></div>`).join(''):'<p class="muted">Keine offenen Markt-Meldungen.</p>';
}
function bankLocked(){
 $('#bankGate').hidden=false;$('#bankContent').hidden=true;
 $('#bankGateLogin').textContent=state.user?'Freigabe bei der Clanleitung anfragen':'Hub-Konto anmelden';
}
async function loadBank(){
 if(!bankEligible()){state.bank=null;bankLocked();return;}
 $('#bankGate').hidden=true;$('#bankContent').hidden=false;
 const started=performance.now();setSkeleton('#bankRequestList',2);setSkeleton('#bankTransactionList',2);
 try{state.bank=await api('/api/hq/bank');await settleLoading(started,320);renderBank();}catch(e){
  if([401,403].includes(e.status)){bankLocked();return;}
  loadingError('#bankRequestList',e.message);loadingError('#bankTransactionList',e.message);throw e;
 }
}
function renderBank(){const b=state.bank;if(!b)return;
 $('#bankBalance').textContent=money(b.balance_milli);
 $('#bankOpenRequests').textContent=b.requests.filter(x=>x.status==='open').length;
 $('#bankLedgerCount').textContent=b.ledger.length;
 $('#bankTransactionBtn').hidden=!b.is_admin;
 const statusName={open:'Offen',approved:'Genehmigt',rejected:'Abgelehnt',paid:'Ausgezahlt'};
 $('#bankRequestList').innerHTML=b.requests.length?b.requests.map(r=>`<article class="bank-request">
 <div class="bank-request-top"><span class="bank-status ${esc(r.status)}">${statusName[r.status]||'Unbekannt'}</span><span class="bank-money">${money(r.amount_milli)} <small>Mio.</small></span></div>
 <h4>${esc(r.title)}</h4><p>${esc(r.reason)}</p>
 <div class="bank-request-meta">Von ${esc(r.requester)} · ${date(r.created_at)}</div>
 ${r.decision_note?`<p class="bank-note">Entscheidung: ${esc(r.decision_note)}${r.decided_by_handle?' · '+esc(r.decided_by_handle):''}</p>`:''}
 ${r.payout_note?`<p class="bank-note">Ausgezahlt: ${esc(r.payout_note)}${r.paid_by_handle?' · '+esc(r.paid_by_handle):''}</p>`:''}
 ${b.is_admin&&['open','approved'].includes(r.status)?`<div class="bank-request-actions">${r.status==='open'?`<button class="btn primary" data-bank-decision="approve" data-id="${r.id}">Genehmigen</button><button class="btn outline" data-bank-decision="reject" data-id="${r.id}">Ablehnen</button>`:`<button class="btn primary" data-bank-decision="payout" data-id="${r.id}">Tatsächliche Auszahlung buchen</button><button class="btn outline" data-bank-decision="reject" data-id="${r.id}">Zurückziehen</button>`}</div>`:''}
 </article>`).join(''):'<div class="bank-empty"><strong>Noch keine Anträge.</strong><p>Der erste Vorschlag aus dem Clan kann hier eingereicht werden.</p></div>';
 $('#bankTransactionList').innerHTML=b.ledger.length?b.ledger.map(x=>`<article class="bank-ledger-entry"><span class="bank-ledger-icon ${x.delta_milli>=0?'plus':'minus'}">${x.delta_milli>=0?'↙':'↗'}</span><div class="bank-ledger-info"><b>${esc({deposit:'Einzahlung',withdrawal:'Auszahlung',balance_set:'Bestand korrigiert',request_payout:'Antrag ausgezahlt'}[x.kind]||x.kind)}</b><p>${esc(x.note)}</p><small>${esc(x.actor)} · ${date(x.created_at)}${x.request_id?' · Antrag #'+x.request_id:''}</small></div><strong class="bank-ledger-amount ${x.delta_milli>=0?'plus':'minus'}">${x.delta_milli>0?'+':''}${money(x.delta_milli)} Mio.</strong></article>`).join(''):'<div class="bank-empty"><strong>Noch keine Buchungen.</strong><p>Die Clanleitung kann den Anfangsbestand eintragen.</p></div>';
 finishSkeleton('#bankRequestList');finishSkeleton('#bankTransactionList');
}
function showBankRequestForm(){if(!bankEligible())return !state.user?showAuth():toast('Bitte zuerst durch die Clanleitung freischalten lassen.');
 modal('Geld für den Clan beantragen',`<form id="bankRequestForm" class="form"><label>Wofür wird das Geld benötigt?<input name="title" required minlength="5" maxlength="100" placeholder="z. B. Preisgeld fürs nächste Turnier"></label><label>Betrag in Millionen Ingame-Dollar<input name="amount" type="number" inputmode="decimal" required min="0.001" max="999999999" step="0.001" placeholder="z. B. 12,5"></label><label>Warum soll die Clanbank das unterstützen?<textarea name="reason" required minlength="15" maxlength="600" placeholder="Beschreibe deine Idee und was der Clan davon hat …"></textarea></label><div class="banner">Der Antrag wird zunächst geprüft. Eine Genehmigung ist noch keine Auszahlung.</div><button class="btn primary full">Antrag an die Clanleitung senden</button></form>`,'CLANBANK / REQUEST');
 $('#bankRequestForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/hq/bank/requests',formToObj(e.currentTarget));closeModal();await loadBank();toast('Dein Antrag wurde eingereicht.');}catch(err){formError(err);}};
}
function showBankTransactionForm(){if(state.user?.role!=='admin')return toast('Nur der Admin kann die Clanbank buchen.');
 modal('Clanbank buchen',`<form id="bankTransactionForm" class="form"><label>Buchungsart<select name="kind"><option value="deposit">Einzahlung</option><option value="withdrawal">Auszahlung ohne Antrag</option><option value="balance_set">Bestand manuell festlegen / korrigieren</option></select></label><label>Betrag in Mio. Ingame-Dollar<input name="amount" type="number" required min="0" max="999999999" step="0.001" placeholder="z. B. 25"></label><label>Begründung (sichtbar im Verlauf)<textarea name="note" minlength="8" maxlength="400" required placeholder="z. B. Spende von einem Clanmitglied eingegangen"></textarea></label><div class="banner">Jede Buchung wird dauerhaft mit deinem Hub-Namen und dem bisherigen und neuen Stand protokolliert.</div><button class="btn primary full">Buchung speichern</button></form>`,'CLANBANK / LEDGER');
 $('#bankTransactionForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/hq/bank/transactions',formToObj(e.currentTarget));closeModal();await loadBank();toast('Buchung dokumentiert.');}catch(err){formError(err);}};
}
function showBankDecisionForm(id,decision){if(state.user?.role!=='admin'||!state.bank?.is_admin)return toast('Nur die Clanleitung entscheidet.');
 const r=state.bank.requests.find(x=>x.id===id);if(!r)return;
 const payout=decision==='payout';const label=payout?'Tatsächliche Auszahlung buchen':decision==='approve'?'Antrag genehmigen':'Antrag ablehnen';
 modal(label,`<form class="form" id="bankDecisionForm"><p><strong>${esc(r.title)}</strong> · ${money(r.amount_milli)} Mio. Ingame-$</p><label>Begründung / Übergabenotiz<textarea name="note" required minlength="8" maxlength="400" placeholder="${payout?'Bestätige, wem das Geld ingame übergeben wurde.':'Begründe deine Entscheidung nachvollziehbar.'}"></textarea></label><div class="banner">${payout?'Nur bestätigen, wenn das Geld wirklich im Spiel ausgezahlt wurde. Der Betrag wird dann von der Kasse abgezogen.':'Eine Genehmigung zieht noch kein Geld von der Clanbank ab.'}</div><button class="btn primary full">${label}</button></form>`,'CLANBANK / REVIEW');
 $('#bankDecisionForm').onsubmit=async e=>{e.preventDefault();try{const b=formToObj(e.currentTarget);if(payout)await api(`/api/hq/bank/requests/${id}/payout`,b);else await api(`/api/hq/bank/requests/${id}/review`,{note:b.note,decision});closeModal();await loadBank();toast('Entscheidung dokumentiert.');}catch(err){formError(err);}};
}
function showListingForm(){if(!state.user)return showAuth();modal('Anzeige erstellen',`<form id="listingForm" class="form"><label>Art<select name="kind"><option value="offer">Ich verkaufe</option><option value="search">Ich suche</option><option value="service">Ich biete einen Service</option></select></label><label>Titel<input required name="title" minlength="5" maxlength="80" placeholder="z. B. Verkaufe Elytra"></label><label>Beschreibung<textarea required name="description" minlength="10" maxlength="1000" placeholder="Was genau wird angeboten oder gesucht?"></textarea></label><label>Preis in Millionen Ingame-Dollar (0 = VB)<input name="price_millions" type="number" min="0" max="1000000000" value="0" step="1" required></label><label>Kontakt-Minecraft-Name (nicht verifiziert)<input name="mc_contact" required minlength="3" maxlength="16" pattern="[A-Za-z0-9_]{3,16}" placeholder="Dein Minecraft-Name"></label><div class="banner">Nur Handel mit <b>HugoSMP-Ingame-Items / -Währung</b>. Kein Echtgeld. Identitäten und Angebote sind nicht verifiziert; sichere Übergabe vorher absprechen.</div><button class="btn primary full">Anzeige veröffentlichen</button></form>`,'MARKET / CREATE');
 $('#listingForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/hq/market',formToObj(e.currentTarget));closeModal();await loadMarket();toast('Anzeige veröffentlicht.');}catch(err){formError(err);}};}
function showGiveawayForm(){if(!staff())return toast('Nur Clanleitung/Moderation kann Giveaways starten.');modal('Neues Giveaway',`<form id="giveawayForm" class="form"><label>Titel<input name="title" required minlength="5" maxlength="80" placeholder="Freitags-Drop"></label><label>Beschreibung<textarea name="description" required minlength="10" maxlength="700" placeholder="Wie können Mitglieder teilnehmen? Die Teilnahme erfolgt über den Button."></textarea></label><label>Teilnahmeberechtigung<select name="visibility" id="giveawayVisibility"><option value="clan">🔒 Privat – nur freigeschaltete NoMercy-Mitglieder</option><option value="public">🌍 Öffentlich – alle mit Hub-Konto</option></select></label><label>Gewinnart<select name="prize_kind" id="prizeKind"><option value="money">Ingame-Geld</option><option value="item">Minecraft-Item</option></select></label><label>Item / Bezeichnung<input name="prize_detail" id="prizeDetail" required minlength="2" maxlength="100" value="Ingame-Dollar"></label><label id="prizeAmountLabel">Gewinn pro Gewinner in Millionen<input name="prize_amount" type="number" required min="1" max="1000000000" value="20" step="1"></label><label>Anzahl Gewinner (1–20)<input name="winner_count" type="number" min="1" max="20" step="1" value="1" required></label><label>Ende am (lokale Zeit)<input type="datetime-local" name="ends_at" value="${localDefault(1440)}" required></label><div class="banner">Öffentlich: alle mit Hub-Konto dürfen teilnehmen. Privat: nur von der Clanleitung freigeschaltete Mitglieder. Die Gewinner werden <b>automatisch und zufällig auf dem Server</b> nach Ablauf gewählt. Pro Hub-Konto höchstens ein Gewinn. Items/Geld müsst ihr danach selbst im Spiel übergeben.</div><button class="btn primary full">Giveaway starten</button></form>`,'CLAN / GIVEAWAYS');
 $('#prizeKind').onchange=e=>{const item=e.target.value==='item';$('#prizeAmountLabel').firstChild.textContent=item?'Item-Menge pro Gewinner':'Gewinn pro Gewinner in Millionen';$('#prizeDetail').value=item?'':'Ingame-Dollar';};
 $('#giveawayForm').onsubmit=async e=>{e.preventDefault();try{const b=formToObj(e.currentTarget);b.ends_at=localISO(b.ends_at);await api('/api/hq/giveaways',b);closeModal();await loadPrivate();toast('Giveaway ist gestartet!');}catch(err){formError(err);}};}
function showEventForm(){if(!eventCreator())return toast('Nur das Event-Team und die Clanleitung können Events erstellen.');modal('Clan-Event erstellen',`<form id="eventForm" class="form"><label>Event-Titel<input name="title" required minlength="5" maxlength="80" placeholder="NoMercy Clan-War"></label><label>Eventtyp<select name="category"><option>FFA</option><option>Baseraid</option><option>Turnier</option><option>Training</option><option>Community</option></select></label><label>Infos<textarea name="description" required minlength="10" maxlength="700" placeholder="Ort, Regeln, Ablauf"></textarea></label><label>Beginn<input type="datetime-local" name="starts_at" required value="${localDefault(120)}"></label><label>Dauer in Minuten<input name="duration_minutes" type="number" min="15" max="480" value="90" required></label><label>Max. Teilnehmer<input name="max_players" type="number" min="2" max="100" value="20" required></label><button class="btn primary full">Event eintragen</button></form>`,'CLAN / EVENTS');
 $('#eventForm').onsubmit=async e=>{e.preventDefault();try{const b=formToObj(e.currentTarget);b.starts_at=localISO(b.starts_at);await api('/api/hq/events',b);closeModal();await loadPrivate();toast('Event erstellt.');}catch(err){formError(err);}};}
function showReportForm(id){modal('Anzeige melden',`<form id="reportForm" class="form"><label>Warum ist dieses Inserat verdächtig?<textarea name="reason" required minlength="15" maxlength="500" placeholder="Bitte einen konkreten Grund angeben. Normale Handelspreise sind nicht automatisch Betrug."></textarea></label><button class="btn primary full">An Moderation melden</button></form>`,'MARKET / SAFETY');$('#reportForm').onsubmit=async e=>{e.preventDefault();try{await api(`/api/hq/market/${id}/report`,formToObj(e.currentTarget));closeModal();toast('Meldung an Moderation gesendet.');}catch(err){formError(err);}};}
async function withAction(task){try{await task()}catch(e){toast(e.message)}}
function askNote(question){const note=window.prompt(question);if(note===null)return null;if(note.trim().length<8)throw Error('Bitte eine Begründung mit mindestens 8 Zeichen eingeben.');return note.trim();}
// An original, gentle pixel-firework cue synthesized with Web Audio.
// No Minecraft audio files are copied or loaded; audio starts only after a user tap.
let revealSoundEnabled=true, revealAudio=null;
function audioForReveal(){
 if(!revealSoundEnabled)return null;
 const Engine=window.AudioContext||window.webkitAudioContext;
 if(!Engine)return null;
 try{
  if(!revealAudio)revealAudio=new Engine();
  if(revealAudio.state==='suspended')revealAudio.resume().catch(()=>{});
  return revealAudio;
 }catch{return null;}
}
function revealTone(ctx,{at=0,from=400,to=600,duration=.2,volume=.035,wave='sine'}={}){
 try{
  const start=ctx.currentTime+at,osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type=wave;osc.frequency.setValueAtTime(from,start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30,to),start+duration);
  gain.gain.setValueAtTime(.0001,start);
  gain.gain.exponentialRampToValueAtTime(volume,start+.012);
  gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(gain);gain.connect(ctx.destination);
  osc.start(start);osc.stop(start+duration+.015);
  osc.onended=()=>{osc.disconnect();gain.disconnect();};
 }catch{}
}
function revealNoise(ctx,at=0,duration=.16,volume=.018,frequency=1400){
 try{
  const start=ctx.currentTime+at,sample=ctx.sampleRate,
   buffer=ctx.createBuffer(1,Math.ceil(sample*duration),sample),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  const node=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  node.buffer=buffer;filter.type='highpass';filter.frequency.value=frequency;
  gain.gain.setValueAtTime(volume,start);
  gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
  node.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
  node.start(start);node.stop(start+duration+.005);
  node.onended=()=>{node.disconnect();filter.disconnect();gain.disconnect();};
 }catch{}
}
function playRevealCue(kind){
 const ctx=audioForReveal();if(!ctx||ctx.state!=='running')return;
 if(kind==='launch'){
  revealTone(ctx,{from:260,to:960,duration:.40,volume:.018,wave:'triangle'});
  revealNoise(ctx,.08,.26,.004,2200);
 }else{
  revealNoise(ctx,0,.23,.029,900);
  revealTone(ctx,{from:580,to:250,duration:.22,volume:.029,wave:'triangle'});
  [1047,1319,1568,2093].forEach((note,i)=>revealTone(ctx,{at:.065+i*.055,from:note,to:note*.81,duration:.27,volume:.014,wave:'sine'}));
 }
}
function syncRevealAudioButton(){
 const b=$('#drawSoundToggle');if(!b)return;
 b.textContent=revealSoundEnabled?'🔊 Ton an':'🔇 Ton aus';
 b.setAttribute('aria-pressed',String(revealSoundEnabled));
 b.setAttribute('aria-label',revealSoundEnabled?'Gewinner-Sound ausschalten':'Gewinner-Sound einschalten');
}
// The reveal is deliberately presentation-only. Drawn winners come from the server;
// ticker values are never sent to the backend and cannot change the winner list.
const drawSleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const drawCounter=(current,total)=>`${String(current).padStart(2,'0')} / ${String(total).padStart(2,'0')}`;
function setReelName(name,prev,next){
 $('#wheelName').textContent=name;
 $('#drawPrev').textContent=prev??'–';
 $('#drawNext').textContent=next??'–';
}
function renderWinner(w){
 const card=document.createElement('div');card.className='winner-entry';
 const rank=document.createElement('span');rank.className='winner-rank';rank.textContent=String(w.position).padStart(2,'0');
 const handle=document.createElement('strong');handle.textContent=w.handle;
 const badge=document.createElement('span');badge.className='winner-check';badge.textContent='✓ GEZOGEN';
 card.append(rank,handle,badge);$('#spinWinners').append(card);
}
function startSpin(g){
 if(!g||g.status!=='drawn')return;
 spinCancelled=false;spinActive=false;spinSkip=false;
 const winners=Array.isArray(g.winners)?g.winners:[];
 const participants=Array.isArray(g.participants)&&g.participants.length?g.participants:winners.map(w=>w.handle);
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const stage=$('#drawStage'),start=$('#spinStart'),skip=$('#spinSkip');
 stage.classList.remove('rolling','revealed','draw-complete');
 $('#spinWinners').replaceChildren();$('#drawWinnersHead').hidden=true;
 $('#drawWinnerCount').textContent=`0 / ${winners.length}`;
 $('#drawCounter').textContent=drawCounter(1,Math.max(1,winners.length));
 $('#drawProgressBar').style.width='0%';
 $('#drawPrize').textContent=`${g.title} · ${g.prize_kind==='money'?`${Number(g.prize_amount).toLocaleString('de-DE')} Mio. pro Gewinner`:`${Number(g.prize_amount).toLocaleString('de-DE')}× ${g.prize_detail} pro Gewinner`}`;
 $('#drawStageHint').textContent='ERGEBNISSE BEREITS AUF DEM SERVER FESTGELEGT';
 setReelName('READY','NOMERCY','GOOD LUCK');
 $('#spinStatus').textContent=winners.length?`${winners.length} ${winners.length===1?'Gewinner wartet':'Gewinner warten'} auf die Enthüllung.`:'Keine gültigen Teilnahmen – keine Gewinner.';
 start.hidden=false;start.disabled=!winners.length;start.textContent='Gewinner enthüllen ↗';skip.hidden=true;
 syncRevealAudioButton();
 $('#spinDialog').showModal();
 start.focus({preventScroll:true});
 skip.onclick=()=>{spinSkip=true;skip.hidden=true;};
 start.onclick=async()=>{
  if(spinActive||spinCancelled)return;
  spinActive=true;start.hidden=true;skip.hidden=reduced||winners.length===0;
  const audio=audioForReveal();if(audio?.state==='suspended')await audio.resume().catch(()=>{});
  $('#drawWinnersHead').hidden=false;
  for(const [index,w] of winners.entries()){
   if(spinCancelled)break;
   stage.classList.remove('revealed','draw-complete');
   stage.classList.add('rolling');
   if(!reduced&&!spinSkip)playRevealCue('launch');
   $('#drawCounter').textContent=drawCounter(index+1,winners.length);
   $('#drawStageHint').textContent=`GEWINNER ${index+1} / ${winners.length}`;
   $('#spinStatus').textContent=`Gewinner ${index+1} von ${winners.length} wird enthüllt …`;
   // Slow down the name ticker near the end rather than using a casino-style wheel.
   if(!reduced&&!spinSkip){
    const steps=index===0?28:18;
    for(let step=0;step<steps&&!spinCancelled&&!spinSkip;step++){
     const next=participants[Math.floor(Math.random()*participants.length)];
     const prev=participants[Math.floor(Math.random()*participants.length)];
     const after=participants[Math.floor(Math.random()*participants.length)];
     setReelName(next,prev,after);
     const name=$('#wheelName');name.classList.remove('draw-tick');void name.offsetWidth;name.classList.add('draw-tick');
     await drawSleep(43+Math.round(140*(step/(steps-1))**2));
    }
   }
   if(spinCancelled)break;
   const name=$('#wheelName');name.classList.remove('draw-tick');
   setReelName(w.handle,'','');
   stage.classList.remove('rolling');
   // Restart the reveal animation for every winner.
   void stage.offsetWidth;
   stage.classList.add('revealed');
   if(!spinSkip)playRevealCue('win');
   $('#drawStageHint').textContent='GEWINNER BESTÄTIGT';
   $('#spinStatus').textContent=`Gewinner #${index+1}: ${w.handle}`;
   renderWinner(w);
   $('#drawWinnerCount').textContent=`${index+1} / ${winners.length}`;
   $('#drawProgressBar').style.width=`${Math.round((index+1)/winners.length*100)}%`;
   if(!reduced&&!spinSkip)await drawSleep(550);
  }
  spinActive=false;
  if(!spinCancelled){
   stage.classList.add('draw-complete');skip.hidden=true;
   $('#spinStatus').textContent=winners.length===1?'Der Gewinner steht fest!':`Alle ${winners.length} Gewinner stehen fest!`;
   $('#drawStageHint').textContent='OFFIZIELLES ERGEBNIS · UNVERÄNDERLICH';
  }
 };
}
async function handleClick(e){const tab=e.target.closest('[data-tab]');if(tab){await withAction(()=>setTab(tab.dataset.tab));return;}
 const login=e.target.closest('[data-action="login"]');if(login){if(!state.user)showAuth();else showClanApplication('existing');return;}
 const market=e.target.closest('[data-market]');if(market){const id=Number(market.dataset.id),x=state.market.find(m=>m.id===id);if(!x)return;
  if(market.dataset.market==='copy'){try{await navigator.clipboard.writeText(`/msg ${x.mc_contact} Hallo, ich interessiere mich für ${x.title}.`);toast('Kontaktbefehl kopiert.')}catch{toast('Minecraft-Name: '+x.mc_contact)}}
  if(market.dataset.market==='report')showReportForm(id);
  if(market.dataset.market==='close')await withAction(async()=>{if(!confirm('Inserat als erledigt schließen?'))return;await api(`/api/hq/market/${id}/close`,{});await loadMarket();toast('Inserat geschlossen.');});return;
 }
 const giveaway=e.target.closest('[data-giveaway]');if(giveaway){const id=Number(giveaway.dataset.id),g=state.giveaways.find(x=>x.id===id);if(!g)return;
  if(giveaway.dataset.giveaway==='spin')startSpin(g);
  if(giveaway.dataset.giveaway==='enter'){if(!state.user)return showAuth();await withAction(async()=>{await api(`/api/hq/giveaways/${id}/enter`,{});await loadPrivate();toast('Teilnahme aktualisiert.');});}
  if(giveaway.dataset.giveaway==='fulfill')await withAction(async()=>{const note=askNote('Erst nach echter Übergabe: Welche Gewinne wurden im Spiel ausgehändigt?');if(!note)return;await api(`/api/hq/giveaways/${id}/fulfill`,{note});await loadPrivate();toast('Übergabe dokumentiert.');});
  if(giveaway.dataset.giveaway==='cancel')await withAction(async()=>{const note=askNote('Warum soll dieses Giveaway abgebrochen werden?');if(!note)return;await api(`/api/hq/giveaways/${id}/cancel`,{note});await loadPrivate();toast('Giveaway abgebrochen.');});return;
 }
 const ev=e.target.closest('[data-event]');if(ev){const id=Number(ev.dataset.id);
  if(ev.dataset.event==='join')await withAction(async()=>{await api(`/api/hq/events/${id}/join`,{});await loadPrivate();toast('Event-Teilnahme aktualisiert.');});
  if(ev.dataset.event==='close')await withAction(async()=>{const note=askNote('Warum das Event schließen?');if(!note)return;await api(`/api/hq/events/${id}/status`,{status:'closed',note});await loadPrivate();toast('Event geschlossen.');});return;
 }
 const promote=e.target.closest('[data-clan-promote]');if(promote){
  if(!confirm(`${promote.dataset.handle} wirklich befördern? Diese Entscheidung wird protokolliert.`))return;
  await withAction(async()=>{await api('/api/hq/clan/members',{handle:promote.dataset.handle,clan:promote.dataset.clanPromote});await loadTeam();toast('Beförderung gespeichert. Willkommen in der nächsten Clan-Stufe!');});return;
 }
 const clanReview=e.target.closest('[data-clan-review]');if(clanReview){
  await withAction(async()=>{const id=Number(clanReview.dataset.id),decision=clanReview.dataset.clanReview;
   const note=$(`#join-note-${id}`).value,clan=$(`#join-clan-${id}`).value;
   const verifiedExisting=decision==='approve'&&clan==='main';
    if(verifiedExisting&&!confirm('Hast du persönlich geprüft, dass dieses Hub-Konto einem bestehenden Mainclan-Mitglied gehört? Ohne Prüfung NICHT bestätigen.'))return;
    await api(`/api/hq/clan/requests/${id}/review`,{decision,clan,note,verified_existing:verifiedExisting});await loadTeam();toast(decision==='approve'?'Clan-Mitglied freigeschaltet.':'Anfrage abgelehnt.');});return;
 }
 const bankDecision=e.target.closest('[data-bank-decision]');if(bankDecision){showBankDecisionForm(Number(bankDecision.dataset.id),bankDecision.dataset.bankDecision);return;}
 const review=e.target.closest('[data-review]');if(review)await withAction(async()=>{const id=Number(review.dataset.id),note=$(`#report-note-${id}`).value;await api('/api/hq/mod/market/review',{id,status:review.dataset.review,note});await loadTeam();toast('Meldung bearbeitet.');});
 const hide=e.target.closest('[data-hide-listing]');if(hide)await withAction(async()=>{const note=$('#'+hide.dataset.noteId).value;await api(`/api/hq/market/${hide.dataset.hideListing}/moderate`,{status:'hidden',note});await loadTeam();await loadMarket();toast('Inserat ausgeblendet.');});
}
async function init(){
 const initialTab=Object.hasOwn(sectionNames,location.hash.slice(1))?location.hash.slice(1):'market';
 showSection(initialTab); // Apply deep links before any network request, with no home-hero flash.
 const syncHistory=()=>{const next=Object.hasOwn(sectionNames,location.hash.slice(1))?location.hash.slice(1):'market';if(next!==state.tab)void withAction(()=>setTab(next,{historyMode:'none'}));};
 window.addEventListener('popstate',syncHistory);window.addEventListener('hashchange',syncHistory);
 window.addEventListener('focus',()=>{if(state.user)void withAction(syncApprovedAccess);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user)void withAction(syncApprovedAccess);});
 setSkeleton('#marketList',3);setSkeleton('#giveawayList',2);setSkeleton('#eventList',2);document.addEventListener('click',handleClick);$('#accountBtn').onclick=async()=>{
 if(state.user)await withAction(syncApprovedAccess);
 if(!state.user)return showAuth();modal('Dein Hub-Konto',`<div class="form"><p><b>${esc(state.user.handle)}</b> · ${esc(labelClan[state.user.clan]||(state.user.role==='event_manager'?'Event-Team':'Noch keine Clan-Freischaltung'))}</p><p class="muted">Für interne Giveaways und Events muss dich die Clanleitung freischalten.</p><button class="btn outline" id="logoutBtn">Abmelden</button></div>`);
 if(!member()){$('#logoutBtn').insertAdjacentHTML('beforebegin','<button class="btn primary" id="applyFromAccount">Bestehenden Clan-Zugang bestätigen lassen</button>');$('#applyFromAccount').onclick=()=>{closeModal();void showClanApplication('existing');};}
 $('#logoutBtn').onclick=async()=>{await withAction(async()=>{await api('/api/logout',{});closeModal();await refreshUser();await loadPrivate();await loadMarket();await setTab('market');toast('Abgemeldet.');});};};
 $('#dialogClose').onclick=closeModal;$('#spinClose').onclick=()=>$('#spinDialog').close();
 $('#drawSoundToggle').onclick=()=>{revealSoundEnabled=!revealSoundEnabled;syncRevealAudioButton();if(revealSoundEnabled)audioForReveal();};
 $('#spinDialog').addEventListener('close',()=>{spinCancelled=true;spinSkip=true;$('#drawStage').classList.remove('rolling');revealAudio?.suspend().catch(()=>{});});
 $('#bankGateLogin').onclick=()=>!state.user?showAuth():showClanApplication('existing');
 $('#applyLoginBtn').onclick=()=>showAuth();$('#applyForm').onsubmit=submitApplication;
 $('#accessForm').onsubmit=submitExistingAccess;
 $('#applyModeNew').onclick=()=>{applicationMode='application';renderApplicationMode();};
 $('#applyModeExisting').onclick=()=>{applicationMode='existing';renderApplicationMode();};
 $('#bankRequestBtn').onclick=showBankRequestForm;$('#bankTransactionBtn').onclick=showBankTransactionForm;
 $('#newListingBtn').onclick=showListingForm;$('#newGiveawayBtn').onclick=showGiveawayForm;$('#newEventBtn').onclick=showEventForm;
 $('#marketFilter').onchange=renderMarket;$('#marketSearch').oninput=renderMarket;$('#marketReload').onclick=()=>withAction(loadMarket);
 $('#refreshClanApplicationsBtn').onclick=()=>withAction(loadTeam);
 $('#rosterSearch').oninput=renderRoster;$('#rosterFilter').onchange=renderRoster;$('#rosterRefresh').onclick=()=>withAction(loadRoster);
 $('#teamRoleForm').onsubmit=async e=>{e.preventDefault();await withAction(async()=>{
  const payload=formToObj(e.currentTarget);
  if(!confirm('Hub-Konto '+payload.handle+' wirklich die Rolle "'+payload.role+'" geben? Diese Rolle steuert echte Moderationsrechte.'))return;
  await api('/api/admin/team',payload);
  e.currentTarget.reset();await loadTeamRoles();toast('Team-Rechte aktualisiert.');
 });};
 $('#memberForm').onsubmit=async e=>{e.preventDefault();await withAction(async()=>{await api('/api/hq/clan/members',formToObj(e.currentTarget));e.currentTarget.reset();await loadTeam();toast('Clan-Zugriff aktualisiert.');});};
 try{await Promise.all([refreshUser(),loadMarket(),loadCommunityLinks()]);await loadPrivate();if(initialTab!=='market')await setTab(initialTab,{historyMode:'none',resetScroll:false});}catch(e){toast('Laden fehlgeschlagen: '+e.message);}
 setInterval(async()=>{$$('[data-countdown]').forEach(x=>x.textContent=timeLeft(x.dataset.countdown));if(state.tab==='giveaways'&&state.giveaways.some(g=>g.status==='open'&&Date.parse(g.ends_at)<=Date.now()))await withAction(loadPrivate);},1000);
}
document.addEventListener('DOMContentLoaded',init);
