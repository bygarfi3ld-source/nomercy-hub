'use strict';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { user:null, events:[], stats:null, type:'', dimension:'', search:'', page:'events', pending:null };
const typeIcon = {FFA:'⚔',Baseraid:'💥',Turnier:'🏆',Lootdrop:'🎁',Bauevent:'🧱',Community:'✦'};
const escapeHtml = value => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastTimer;
function skeletonCards(){return Array.from({length:4},()=>`<article class="event-card skeleton-card" aria-hidden="true"><div class="skel-row"><span class="skeleton skel-icon"></span><span class="skeleton skel-short"></span><span class="skeleton skel-pill"></span></div><div class="skeleton skel-title"></div><div class="skeleton skel-line"></div><div class="skeleton skel-line thin"></div><div class="skel-footer"><span class="skeleton skel-avatar"></span><span class="skeleton skel-short"></span><span class="skeleton skel-button"></span></div></article>`).join('');}
function setLoading(loading){const grid=$('#eventsGrid');if(!grid)return;grid.setAttribute('aria-busy',String(loading));$('#refreshEvents')?.classList.toggle('is-refreshing',loading);if(loading){$('#resultsLabel').textContent='Events werden geladen …';grid.innerHTML=skeletonCards();}}
function toast(text){const e=$('#toast');e.textContent=text;e.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('visible'),3500);}
async function api(url,opts={}){
 const r=await fetch(url,{credentials:'same-origin',...opts,headers:{...(opts.body?{'Content-Type':'application/json'}:{}),...(opts.headers||{})}});
 let data;try{data=await r.json();}catch{throw Error('Serverantwort konnte nicht gelesen werden.');}
 if(!r.ok)throw Error(data.error||'Aktion fehlgeschlagen.');return data;
}
function send(url,obj){return api(url,{method:'POST',body:JSON.stringify(obj)});}
function setModal(title,eyebrow,html){$('.modal').classList.toggle('modal-wide',eyebrow==='CREATE / LIVE-VORSCHAU');$('#modalTitle').textContent=title;$('#modalEyebrow').textContent=eyebrow;$('#modalBody').innerHTML=html;$('#modalScrim').hidden=false;document.body.style.overflow='hidden';setTimeout(()=>$('#modalBody input:not([type=hidden]),#modalBody select')?.focus(),120);}
function closeModal(){ $('#modalScrim').hidden=true;document.body.style.overflow='';$('#modalBody').innerHTML=''; }
function formError(form,message,success=false){let box=form.querySelector('.form-feedback');if(!box){box=document.createElement('div');box.className='form-feedback';form.prepend(box);}box.className='form-feedback '+(success?'form-success':'form-error');box.textContent=message;}
function page(name){
 state.page=name;
 $$('.page').forEach(el=>el.classList.toggle('active',el.id==='page-'+name));
 $$('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===name));
 $('.main-nav').classList.remove('open');$('#mobileMenu').setAttribute('aria-expanded','false');
 window.scrollTo({top:0,behavior:'instant'});
 if(name==='mine')renderMine();
}
function formatDate(date){return new Date(date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
function relativeDate(date){const diff=Date.parse(date)-Date.now();if(diff<0)return 'Läuft / gestartet';if(diff<60000)return 'Startet gleich';if(diff<3600000)return `In ${Math.ceil(diff/60000)} Min.`;if(diff<86400000)return `In ${Math.floor(diff/3600000)} Std.`;return formatDate(date);}
async function fetchAll({skeleton=false}={}){
 if(skeleton)setLoading(true);
 else $('#refreshEvents')?.classList.add('is-refreshing');
 try{
  const [me,events,stats]=await Promise.all([api('/api/me'),api('/api/events'),api('/api/stats')]);
  state.user=me.user;state.events=events.events;state.stats=stats;
  $('#accountButton').textContent=state.user?state.user.handle:'Anmelden';
  $('#modLink').style.display=['admin','moderator'].includes(state.user?.role)?'inline-flex':'none';
  $('#statEvents').textContent=stats.events;$('#statPlayers').textContent=stats.participants;
  $('#eventsGrid').setAttribute('aria-busy','false');renderEvents();if(state.page==='mine')renderMine();
 }catch(e){toast(e.message);$('#eventsGrid').setAttribute('aria-busy','false');$('#eventsGrid').innerHTML='<div class="empty-state"><h3>Verbindung fehlgeschlagen</h3><p>Starte zuerst den NoMercy-Hub-Server und lade die Seite neu.</p><button class="btn btn-dark" data-action="reload">Erneut versuchen</button></div>';}finally{$('#refreshEvents')?.classList.remove('is-refreshing');}
}
function filtered(mine=false){return state.events.filter(e=>(!mine||e.is_owner)&&(!state.type||e.type===state.type)&&(!state.dimension||e.dimension===state.dimension)&&(!state.search||[e.title,e.note,e.mc_host,e.type,e.dimension].some(s=>String(s).toLowerCase().includes(state.search))));}
function renderEvents(){const ev=filtered();$('#resultsLabel').textContent=`${ev.length} ${ev.length===1?'Event':'Events'} gefunden`;
 if(!ev.length){
  const hasFilter=!!(state.search||state.type||state.dimension);
  $('#resultsLabel').textContent=hasFilter?'Keine passenden Events':'Noch keine aktiven Events';
  $('#eventsGrid').innerHTML=`<div class="empty-state-rich">
   <div class="empty-copy"><div class="empty-label"><span class="empty-dot"></span> ${hasFilter?'DEINE EVENT-SUCHE':'DIE BÜHNE IST FREI'}</div>
    <h3>${hasFilter?'Noch kein Treffer.':'Hier könnte das nächste große Event starten.'}</h3>
    <p>${hasFilter?'Mit den aktuellen Filtern finden wir gerade nichts. Probiere eine andere Kategorie oder setze deine Suche zurück.':'Noch hat niemand ein öffentliches Event eingetragen. Mach den Anfang und lade Spieler zu deinem FFA, Baseraid oder Community-Event ein.'}</p>
    <div class="empty-actions">${hasFilter?'<button class="btn btn-dark" data-action="clear-filters">Alle Filter zurücksetzen</button>':'<button class="btn btn-dark" data-action="create">＋ Erstes Event erstellen</button>'}<button class="btn btn-outlined" data-action="explore">Kategorien entdecken</button></div>
    <div class="empty-small"><span>✧</span> Keine erfundenen Events – nur echte Einträge aus der Community.</div>
   </div>
   <div class="empty-visual" aria-hidden="true"><div class="empty-ring ring-a"></div><div class="empty-ring ring-b"></div><div class="empty-center"><span class="empty-spark">✦</span><span class="empty-symbol">⚔</span><small>READY FOR EVENTS</small></div><span class="empty-float float-a">FFA</span><span class="empty-float float-b">RAIDS</span></div>
  </div>`;return;}
 $('#eventsGrid').innerHTML=ev.map(e=>{
  const tag='<span class="tag-status">◉ OFFEN</span>'; 
  return `<article class="event-card"><div class="event-top"><div class="event-category"><span class="category-icon">${typeIcon[e.type]||'✦'}</span>${escapeHtml(e.type)} <span style="color:#b9b9bc">/</span> ${escapeHtml(e.dimension)}</div>${tag}</div>
   <h3>${escapeHtml(e.title)}</h3><p class="description">${escapeHtml(e.note||'Keine weitere Beschreibung.')}</p>
   <div class="event-meta"><span>◷ <b>${escapeHtml(relativeDate(e.starts_at))}</b></span><span>♟ <b>${e.participants} / ${e.max_players}</b> Interessenten</span></div>
   <div class="event-card-foot"><div class="event-host"><div class="avatar">${escapeHtml(e.mc_host[0].toUpperCase())}</div><div><span>TPA-ZIEL · ungeprüft</span><b>${escapeHtml(e.mc_host)}</b>${e.creator_handle?`<button type="button" class="profile-link" data-action="profile" data-handle="${escapeHtml(e.creator_handle)}">Hub-Profil: ${escapeHtml(e.creator_handle)} ↗</button>`:""}</div></div><div class="event-card-actions"><button class="copy-small" aria-label="TPA-Befehl kopieren" title="/tpa kopieren" data-action="copy" data-host="${escapeHtml(e.mc_host)}">⧉</button><button class="btn btn-card" data-action="details" data-id="${e.id}">Ansehen <span class="card-chevron">→</span></button></div></div></article>`;
 }).join('');}
function renderMine(){
 const el=$('#mineContent');
 if(!state.user){el.innerHTML='<div class="empty-state"><h3>Dein Hub-Account</h3><p>Melde dich an, um deine erstellten Events zu verwalten.</p><button class="btn btn-dark" data-action="login">Anmelden / Registrieren</button></div>';return;}
 const my=state.events.filter(e=>e.is_owner);
 if(!my.length){el.innerHTML='<div class="empty-state"><h3>Deine Eventliste ist noch leer</h3><p>Erstelle dein erstes FFA, Baseraid oder Community-Event.</p><button class="btn btn-dark" data-action="create">＋ Erstes Event erstellen</button></div>';return;}
 el.innerHTML=`<div class="events-grid">${my.map(e=>`<div class="event-card"><div class="event-top"><strong>${escapeHtml(e.type)} · ${escapeHtml(e.dimension)}</strong><span class="tag-status">OFFEN</span></div><h3>${escapeHtml(e.title)}</h3><p class="description">TPA: ${escapeHtml(e.mc_host)} · ${formatDate(e.starts_at)}</p><div class="event-meta">${e.participants} / ${e.max_players} Interessenten</div><div class="event-card-foot"><button class="btn btn-outlined" data-action="details" data-id="${e.id}">Details ansehen</button><button class="danger-link" data-action="close" data-id="${e.id}">Event beenden</button></div></div>`).join('')}</div>`;
}
function ensureAuth(action){if(state.user)return action();state.pending=action;openAuth('login');}
function openAuth(tab='login') {
 const registering=tab==='register';
 setModal('Dein Hub-Account','MITMACHEN / NO MERCY',`<div class="auth-tabs"><button class="${!registering?'active':''}" data-action="auth-tab" data-tab="login">Anmelden</button><button class="${registering?'active':''}" data-action="auth-tab" data-tab="register">Registrieren</button></div>
 <form id="authForm"><div class="field"><label for="authHandle">Hub-Benutzername</label><input id="authHandle" name="handle" required minlength="3" maxlength="20" autocomplete="username" pattern="[A-Za-z0-9_]+" placeholder="DeinNickname"></div>
 <div class="field"><label for="authPassword">Passwort für den NoMercy Hub</label><input id="authPassword" name="password" required type="password" ${registering?'minlength="10"':''} autocomplete="${registering?'new-password':'current-password'}" placeholder="${registering?'Mindestens 10 Zeichen':'Dein Hub-Passwort'}"></div>
 <div class="modal-note">${registering?'Erstelle ein separates Hub-Konto.':'Melde dich bei deinem Hub-Konto an.'} <b>Bitte niemals dein Minecraft-Passwort hier eingeben.</b> Der Hub-Name ist noch kein verifizierter Minecraft-Name.</div>
 <div class="form-footer"><button type="button" class="btn btn-outlined" data-action="cancel">Abbrechen</button><button type="submit" class="btn btn-dark">${registering?'Konto erstellen':'Anmelden'} ↗</button></div></form>
 ${state.user?'<button class="link-button" data-action="logout">Abmelden</button>':''}`);
 $('#authForm').addEventListener('submit',async ev=>{
  ev.preventDefault();const form=ev.currentTarget;const b=Object.fromEntries(new FormData(form));const submit=form.querySelector('[type=submit]');submit.disabled=true;
  try{const d=await send(registering?'/api/register':'/api/login',b);state.user=d.user;$('#accountButton').textContent=d.user.handle;closeModal();toast(registering?'Hub-Konto erstellt!':'Erfolgreich angemeldet!');const pending=state.pending;state.pending=null;await fetchAll();if(pending)pending();}
  catch(e){formError(form,e.message);}finally{submit.disabled=false;}
 });
}
const localInput = minutes=>{const d=new Date(Date.now()+minutes*60000);const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
function openCreate(){ensureAuth(()=>{
 setModal('Event erstellen','CREATE / LIVE-VORSCHAU',`<div class="create-layout">
 <form id="createForm" class="create-form">
 <div class="create-steps"><span class="step-active">01 <b>Eventdetails</b></span><span>02 <b>Vorschau</b></span><span>03 <b>Veröffentlichen</b></span></div>
 <div class="field"><label for="fTitle">Wie heißt dein Event?</label><input id="fTitle" name="title" placeholder="Dein Eventtitel" minlength="5" maxlength="70" required><span class="field-hint">Ein klarer Titel hilft anderen beim Finden.</span></div>
 <div class="two-cols"><div class="field"><label for="fType">Kategorie</label><select id="fType" name="type"><option>FFA</option><option>Baseraid</option><option>Turnier</option><option>Lootdrop</option><option>Bauevent</option><option>Community</option></select></div><div class="field"><label for="fDim">Dimension</label><select id="fDim" name="dimension"><option>Overworld</option><option>Nether</option><option>End</option><option>Andere</option></select></div></div>
 <div class="two-cols"><div class="field"><label for="fHost">TPA-Ziel</label><input id="fHost" name="mc_host" placeholder="Minecraft-Name" minlength="3" maxlength="16" pattern="[A-Za-z0-9_]+" required><span class="field-hint">Nicht verifiziert.</span></div><div class="field"><label for="fPlayers">Maximale Interessenten</label><input id="fPlayers" name="max_players" type="number" value="20" min="2" max="100" required></div></div>
 <div class="two-cols"><div class="field"><label for="fStart">Startzeit</label><input id="fStart" type="datetime-local" name="starts_at" value="${localInput(10)}" required></div><div class="field"><label for="fDuration">Dauer</label><select id="fDuration" name="duration_minutes"><option value="30">30 Minuten</option><option value="60" selected>60 Minuten</option><option value="90">90 Minuten</option><option value="120">2 Stunden</option><option value="240">4 Stunden</option></select></div></div>
 <div class="field"><label for="fNote">Beschreibung & Ablauf</label><textarea id="fNote" name="note" maxlength="360" placeholder="Ausrüstung, Ort, was die Teilnehmer erwartet ..."></textarea><span class="field-hint">Bei FFA/Baseraids ist PvP normal. Keine irreführenden TPA-Ziele oder Bett-Traps.</span></div>
 <div class="modal-note">Dein Eintrag wird öffentlich. Der Hub prüft weder den Minecraft-Namen noch die Sicherheit des Teleportziels.</div>
 <div class="form-footer"><button class="btn btn-outlined" type="button" data-action="cancel">Abbrechen</button><button class="btn btn-red" type="submit">Event veröffentlichen <span aria-hidden="true">→</span></button></div>
 </form>
 <aside class="create-preview" aria-label="Live-Vorschau deines Events">
 <div class="preview-overline"><span class="preview-pulse"></span> SO SEHEN ANDERE DEIN EVENT</div>
 <div class="preview-card">
  <div class="preview-card-top"><span id="previewIcon" class="preview-event-icon">⚔</span><div><span id="previewType">FFA</span><small id="previewDimension">Overworld</small></div><span class="preview-status">VORSCHAU</span></div>
  <h3 id="previewTitle">Dein Eventtitel</h3><p id="previewNote">Beschreibe, was die Spieler erwartet.</p>
  <div class="preview-metadata"><span>◷ <b id="previewStart">Gleich</b></span><span>♟ <b id="previewCount">0 / 20</b></span></div>
  <div class="preview-bottom"><div class="preview-pixel-avatar">N</div><div><small>TPA-ZIEL · UNGEPRÜFT</small><strong id="previewHost">Spielername</strong></div></div>
 </div>
 <div class="preview-safety"><span>◈</span><p><strong>Sicherheitsinfo</strong> PvP und Itemverlust möglich. Keine Garantie gegen Fallen.</p></div>
 <p class="preview-hint">Dies ist nur eine Vorschau. Es wird noch kein Event veröffentlicht.</p>
 </aside></div>`);
 const form=$('#createForm');
 const refreshPreview=()=>{
  const fields=Object.fromEntries(new FormData(form));
  const update=(id,value)=>{const el=$('#'+id);if(el)el.textContent=value;};
  update('previewTitle',fields.title?.trim()||'Dein Eventtitel');
  update('previewType',fields.type||'FFA');update('previewDimension',fields.dimension||'Overworld');
  update('previewNote',fields.note?.trim()||'Beschreibe, was die Spieler erwartet.');
  update('previewIcon',typeIcon[fields.type]||'✦');
  update('previewHost',fields.mc_host?.trim()||'Spielername');
  update('previewCount','0 / '+(fields.max_players||20));
  update('previewStart',fields.starts_at?formatDate(new Date(fields.starts_at)): 'Gleich');
 };
 form.addEventListener('input',refreshPreview);form.addEventListener('change',refreshPreview);refreshPreview();
 $('#createForm').addEventListener('submit',async ev=>{
  ev.preventDefault();const form=ev.currentTarget;const b=Object.fromEntries(new FormData(form));b.starts_at=new Date(b.starts_at).toISOString();b.max_players=Number(b.max_players);b.duration_minutes=Number(b.duration_minutes);
  const btn=form.querySelector('[type=submit]');btn.disabled=true;
  try{await send('/api/events',b);closeModal();toast('Event ist jetzt im Hub sichtbar!');state.type='';state.dimension='';state.search='';$('#searchInput').value='';$('#dimensionFilter').value='';$$('.chip').forEach(x=>x.classList.toggle('selected',x.dataset.type===''));await fetchAll();page('events');$('#discover').scrollIntoView({behavior:'smooth'});}
  catch(e){formError(form,e.message);}finally{btn.disabled=false;}
 });
 });}
function openDetails(id){const e=state.events.find(x=>x.id===id);if(!e)return toast('Event nicht gefunden.');
 setModal('Eventdetails','LIVE / COMMUNITY EVENTS',`<h3 class="event-details-title">${escapeHtml(e.title)}</h3><div class="details-tags"><span>${escapeHtml(e.type)}</span><span>${escapeHtml(e.dimension)}</span><span>${e.participants}/${e.max_players} Interessenten</span><span>${escapeHtml(formatDate(e.starts_at))}</span>${e.is_demo?'<span>BEISPIEL</span>':''}</div>
 <p class="report-info">${escapeHtml(e.note||'Keine Beschreibung angegeben.')}</p>${e.creator_handle?`<button class="host-profile-cta" data-action="profile" data-handle="${escapeHtml(e.creator_handle)}">◈ Veranstalterprofil von ${escapeHtml(e.creator_handle)} ansehen →</button>`:""}<hr class="subtle-rule"><div class="field"><label>TPA-Ziel (vom Veranstalter angegeben, nicht verifiziert)</label><div class="detail-copy"><code>/tpa ${escapeHtml(e.mc_host)}</code><button data-action="copy" data-host="${escapeHtml(e.mc_host)}">⧉ Kopieren</button></div></div>
 <div class="risk-box"><span style="font-size:22px">⚠</span><div><b>Wichtig vor dem Teleportieren</b>PvP und Itemverlust sind möglich. Ein Event oder Profil ist keine Garantie gegen TPA-Traps. Teste den Ort vorsichtig.</div></div>
 <div class="form-footer" style="justify-content:space-between"><button class="danger-link" data-action="report" data-id="${e.id}" ${e.is_demo?'disabled':''}>⚑ Event melden</button><button class="btn btn-dark" data-action="join" data-id="${e.id}" ${e.is_demo?'disabled':''}>${e.is_demo?'Nur Vorschau':e.joined?'Anmeldung zurückziehen':'Interesse anmelden'} ↗</button></div>`);
}
function openReport(id){ensureAuth(()=>{const e=state.events.find(x=>x.id===id);if(!e)return;
 setModal('Event melden','SICHERHEIT / HINWEIS GEBEN',`<div class="report-intro"><span class="report-shield">♢</span><div><strong>Wir nehmen Meldungen ernst.</strong><p>Normales PvP und Itemverlust sind kein automatischer Verstoß. Verdächtige TPA-/Bett-Traps oder irreführende Veranstaltungsangaben kannst du melden. Ein Report sperrt niemanden automatisch.</p></div></div>
 <form id="reportForm"><div class="field"><label>Gemeldetes Event</label><input value="${escapeHtml(e.title)}" disabled></div>
 <div class="field"><label for="reason">Was möchtest du melden?</label><select name="reason" id="reason"><option>Verdacht auf TPA-Trap</option><option>Verdacht auf Bett-/Respawn-Trap</option><option>Irreführendes Event</option><option>Beleidigung/Spam</option><option>Sonstiger Verstoß</option></select></div>
 <div class="field"><label for="details">Beschreibe den Vorfall möglichst genau</label><textarea id="details" name="details" required minlength="15" maxlength="1500" placeholder="Was wurde versprochen, was ist passiert, wann? Bitte sachlich bleiben."></textarea><span class="field-hint">Wir werten überprüfbare Angaben aus, nicht die Anzahl der Reports.</span></div>
 <div class="field"><label for="evidence">Video oder Screenshot als Link (optional)</label><input type="url" name="evidence_url" id="evidence" placeholder="https://..."><span class="field-hint">Keine Passwörter, privaten Koordinaten oder personenbezogenen Daten.</span></div>
 <label class="confirm-row"><input type="checkbox" name="truth" required><span>Ich bestätige, dass meine Angaben nach bestem Wissen stimmen und mir bewusst ist, dass absichtliche Falschmeldungen Konsequenzen haben können.</span></label>
 <div class="report-footer-info"><span>🔒</span> Nur das Moderationsteam sieht die Meldung. Das Event wird nicht automatisch gesperrt.</div>
 <div class="form-footer"><button type="button" class="btn btn-outlined" data-action="cancel">Abbrechen</button><button class="btn btn-red" type="submit">Meldung zur Prüfung senden</button></div></form>`);
 $('#reportForm').addEventListener('submit',async ev=>{ev.preventDefault();const f=ev.currentTarget;const btn=f.querySelector('[type=submit]');btn.disabled=true;try{const payload=Object.fromEntries(new FormData(f));payload.confirm_truth=payload.truth==='on';delete payload.truth;const d=await send(`/api/events/${id}/report`,payload);closeModal();toast(d.notice);}catch(err){formError(f,err.message);}finally{btn.disabled=false;}});
 });}
async function joinEvent(id){ensureAuth(async()=>{try{const d=await send(`/api/events/${id}/join`,{});toast(d.joined?'Interesse angemeldet!':'Anmeldung zurückgezogen.');closeModal();await fetchAll();}catch(e){toast(e.message);}});}
async function closeEvent(id){if(!confirm('Dieses Event wirklich beenden?'))return;try{await send(`/api/events/${id}/close`,{});toast('Event beendet.');await fetchAll();}catch(e){toast(e.message);}}
async function copyCommand(host){const command='/tpa '+host;try{await navigator.clipboard.writeText(command);toast(command+' kopiert!');}catch{const t=document.createElement('textarea');t.value=command;document.body.append(t);t.select();document.execCommand('copy');t.remove();toast(command+' kopiert!');}}
// Event delegation; interpolated event strings are always escaped.
document.addEventListener('click',async ev=>{
 const target=ev.target.closest('[data-page],[data-nav],[data-action]');
 if(!target)return;
 if(target.dataset.page){page(target.dataset.page);return;}
 if(target.dataset.nav){page(target.dataset.nav);return;}
 switch(target.dataset.action){
  case 'create':openCreate();break;
  case 'clear-filters':clearFilters();break;
  case 'explore':document.querySelector('#explore')?.scrollIntoView({behavior:'smooth',block:'center'});break;
  case 'reload':fetchAll({skeleton:true});break;
  case 'login':openAuth();break;
  case 'profile':openProfile(target.dataset.handle);break;
  case 'load-skin':{const name=target.dataset.name;if(!/^[A-Za-z0-9_]{3,16}$/.test(name))break;const box=$('#publicHead');if(box){const img=document.createElement('img');img.alt='Minecraft-Skin-Vorschau (nicht verifiziert)';img.src='https://mc-heads.net/avatar/'+encodeURIComponent(name)+'/100';img.onerror=()=>img.remove();box.textContent='';box.append(img);}target.disabled=true;target.textContent='Vorschau angefordert';break;}
  case 'auth-tab':openAuth(target.dataset.tab);break;
  case 'cancel':closeModal();break;
  case 'details':openDetails(Number(target.dataset.id));break;
  case 'join':joinEvent(Number(target.dataset.id));break;
  case 'report':openReport(Number(target.dataset.id));break;
  case 'close':closeEvent(Number(target.dataset.id));break;
  case 'copy':copyCommand(target.dataset.host);break;
  case 'logout':try{await api('/api/logout',{method:'POST'});state.user=null;closeModal();await fetchAll();toast('Abgemeldet.');}catch(e){toast(e.message);}break;
 }
});
$('#mobileMenu').addEventListener('click',()=>{const menu=$('.main-nav');menu.classList.toggle('open');$('#mobileMenu').setAttribute('aria-expanded',String(menu.classList.contains('open')));});
$('#accountButton').addEventListener('click',()=>state.user?openAccount():openAuth());
function openAccount(){
 const u=state.user;if(!u)return openAuth();
 setModal('Mein Hub-Profil','ACCOUNT / EINSTELLUNGEN',`<div class="profile-header"><span class="profile-head-placeholder">${escapeHtml((u.handle||'?')[0].toUpperCase())}</span><div><h3>${escapeHtml(u.handle)}</h3><span class="unverified-pill">HUB-KONTO · MC-NAME UNGEPRÜFT</span></div></div>
 <form id="profileForm"><div class="field"><label for="profileMc">Dein Minecraft-Name (optional)</label><input id="profileMc" name="mc_name" pattern="[A-Za-z0-9_]{3,16}" maxlength="16" value="${escapeHtml(u.mc_name||'')}" placeholder="Minecraft-Spielername"><span class="field-hint">Nur Selbstauskunft. Die Angabe beweist nicht, dass dir der Account gehört.</span></div>
 <div class="field"><label for="profileBio">Kurzbeschreibung</label><textarea id="profileBio" name="bio" maxlength="160" placeholder="Was veranstaltest du?">${escapeHtml(u.bio||'')}</textarea></div>
 <div class="form-footer"><button type="button" class="btn btn-outlined" data-action="logout">Abmelden</button><button class="btn btn-red" type="submit">Profil speichern</button></div></form>`);
 $('#profileForm').addEventListener('submit',async ev=>{ev.preventDefault();const f=ev.currentTarget;const button=f.querySelector('[type=submit]');button.disabled=true;try{const d=await send('/api/profile',Object.fromEntries(new FormData(f)));state.user=d.user;closeModal();toast('Profil aktualisiert. Minecraft-Identität noch ungeprüft.');}catch(err){formError(f,err.message);}finally{button.disabled=false;}});
}
async function openProfile(handle){
 setModal('Veranstalterprofil','COMMUNITY / PLAYER',`<div class="profile-loading"><div class="skeleton skel-title"></div><div class="skeleton skel-line"></div></div>`);
 try{const {profile:p}=await api('/api/players/'+encodeURIComponent(handle));
  // The Minecraft skin is fetched only after an explicit click, never automatically.
  $('#modalBody').innerHTML=`<div class="profile-hero"><div class="profile-head-placeholder profile-large" id="publicHead">${escapeHtml(p.handle[0].toUpperCase())}</div><div><span class="profile-eyebrow">NO MERCY COMMUNITY</span><h3>${escapeHtml(p.handle)}</h3><span class="unverified-pill">MINECRAFT-IDENTITÄT NICHT VERIFIZIERT</span></div></div>
  <div class="profile-bio">${escapeHtml(p.bio||'Noch keine Beschreibung hinterlegt.')}</div>
  <div class="profile-numbers"><div><strong>${Number(p.events_total)}</strong><span>Erstellte Events</span></div><div><strong>${Number(p.events_open)}</strong><span>Aktuell offen</span></div></div>
  ${p.mc_name?`<div class="public-mc-name"><span>Hinterlegter Minecraft-Name (ungeprüft)</span><strong>${escapeHtml(p.mc_name)}</strong><button class="btn btn-outlined btn-small" data-action="load-skin" data-name="${escapeHtml(p.mc_name)}">Skin-Vorschau laden</button></div><p class="skin-disclosure">Beim Laden wird der angegebene Minecraft-Name an mc-heads.net übertragen. Ein Skin bestätigt keine Account-Inhaberschaft.</p>`:'<div class="modal-note">Kein Minecraft-Spielername hinterlegt.</div>'}
  <div class="profile-footnote">Diese Daten stammen aus dem NoMercy Hub. Die Plattform prüft noch keine Minecraft-Identitäten oder Event-Sicherheit.</div>`;
 }catch(e){$('#modalBody').innerHTML=`<div class="modal-note">${escapeHtml(e.message)}</div>`;}
}
['#topCreate','#heroCreate','#createInline','#bottomCreate'].forEach(s=>$(s).addEventListener('click',openCreate));
$('#howItWorks').addEventListener('click',()=>document.querySelector('#howHeading')?.scrollIntoView({behavior:'smooth',block:'center'}));
$('#closeModal').addEventListener('click',closeModal);
$('#modalScrim').addEventListener('click',e=>{if(e.target.id==='modalScrim')closeModal();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modalScrim').hidden)closeModal();});
function clearFilters(){state.type='';state.dimension='';state.search='';$('#searchInput').value='';$('#dimensionFilter').value='';$$('.chip').forEach(c=>c.classList.toggle('selected',c.dataset.type===''));renderEvents();}
$('#refreshEvents').addEventListener('click',()=>fetchAll({skeleton:true}));
$$('[data-category]').forEach(b=>b.addEventListener('click',()=>{const cat=b.dataset.category;state.type=cat;state.search='';state.dimension='';$('#searchInput').value='';$('#dimensionFilter').value='';$$('.chip').forEach(c=>c.classList.toggle('selected',c.dataset.type===cat));renderEvents();$('#discover').scrollIntoView({behavior:'smooth',block:'start'});}));
$('#searchInput').addEventListener('input',e=>{state.search=e.target.value.toLowerCase().trim();renderEvents();});
$('#dimensionFilter').addEventListener('change',e=>{state.dimension=e.target.value;renderEvents();});
$$('.chip').forEach(b=>b.addEventListener('click',()=>{state.type=b.dataset.type;$$('.chip').forEach(c=>c.classList.toggle('selected',c===b));renderEvents();}));
fetchAll({skeleton:true});
