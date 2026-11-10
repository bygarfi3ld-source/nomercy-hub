'use strict';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('de-DE'):'–';
let role='member',tab='reports';
function notice(msg,kind=''){const el=$('#notice');el.textContent=msg;el.className='mod-notice '+kind;}
async function api(path,body){const options={credentials:'same-origin',headers:{}};if(body!==undefined){options.method='POST';options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
 const res=await fetch(path,options);let obj;try{obj=await res.json()}catch{throw Error('Ungültige Serverantwort')};if(!res.ok)throw Error(obj.error||'Aktion fehlgeschlagen');return obj;}
async function start(){try{const me=await api('/api/me');if(!me.user){notice('Du bist noch nicht angemeldet. Öffne die Hauptseite, melde dich mit deinem Hub-Konto an und komm hierher zurück.','error');return;}
 role=me.user.role||'member';if(['admin','moderator'].includes(role)){$('#dashboard').hidden=false;$('#teamTab').hidden=role!=='admin';notice('Angemeldet als '+me.user.handle+' · '+(role==='admin'?'Administrator':'Moderator'),'success');await refresh();return;}
 const setup=await api('/api/admin/setup');if(setup.setup_available){$('#setup').hidden=false;notice('Angemeldet als '+me.user.handle+'. Für die erstmalige Admin-Freischaltung wird der Betreiber-Code benötigt.');}else notice('Du bist mit '+me.user.handle+' angemeldet, hast aber keine Moderationsrechte. Bitte einen Administrator um Freischaltung.','error');
 }catch(e){notice(e.message,'error');}}
function reportCard(r){const id=Number(r.id),event=Number(r.event_id);
 const hasEvidence=typeof r.evidence_url==='string'&&/^https?:\/\//i.test(r.evidence_url);
 return `<article class="mod-card"><div class="mod-card-head"><h3>${esc(r.event_title)}</h3><span class="mod-tag">${esc(r.status)}</span></div><div class="mod-reason">${esc(r.reason)}</div>
 <p class="mod-text">${esc(r.details)}</p><div class="mod-meta">Event #${event} · Report #${id} · Reporter: ${esc(r.reporter)} · Veranstalter: ${esc(r.organizer_handle||'gelöscht')} · TPA: ${esc(r.mc_host)} · ${esc(date(r.created_at))}<br>Eventstatus: ${esc(r.event_status)}${r.reviewed_by_handle?` · Zuletzt geprüft von ${esc(r.reviewed_by_handle)} (${esc(date(r.reviewed_at))})`:''}</div>
 ${hasEvidence?`<p><a class="mod-evidence" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" href="${esc(r.evidence_url)}">Beweislink extern öffnen ↗</a></p>`:''}
 ${r.moderator_note?`<p><strong>Letzte Moderationsnotiz:</strong> ${esc(r.moderator_note)}</p>`:''}
 <label class="mod-meta" for="note-${id}">Begründung für Entscheidung (mind. 8 Zeichen)</label><textarea id="note-${id}" maxlength="500" placeholder="Was wurde geprüft? Warum diese Entscheidung?">${esc(r.moderator_note||'')}</textarea>
 <div class="mod-actions"><button class="btn btn-dark" data-action="review" data-id="${id}" data-status="reviewed">Als geprüft markieren</button><button class="btn btn-outlined" data-action="review" data-id="${id}" data-status="dismissed">Verwerfen</button><button class="btn btn-outlined" data-action="review" data-id="${id}" data-status="open">Wieder öffnen</button>${r.event_status==='hidden'?`<button class="btn btn-outlined" data-action="event" data-id="${event}" data-status="open" data-note="note-${id}">Event wieder anzeigen</button>`:`<button class="btn btn-red" data-action="event" data-id="${event}" data-status="hidden" data-note="note-${id}">Event ausblenden</button>`}</div></article>`;}
function eventCard(e){const id=Number(e.id);return `<article class="mod-card"><div class="mod-card-head"><h3>${esc(e.title)}</h3><span class="mod-tag">${esc(e.status)}</span></div><div class="mod-meta">Event #${id} · ${esc(e.type)} · Organisator: ${esc(e.organizer_handle||'gelöscht')} · TPA: ${esc(e.mc_host)} · ${esc(date(e.starts_at))} · ${e.report_count} Meldung(en)</div>
 <label class="mod-meta" for="enote-${id}">Begründung (mind. 8 Zeichen)</label><textarea id="enote-${id}" maxlength="500" placeholder="Grund für die Änderung dokumentieren"></textarea>
 <div class="mod-actions">${e.status!=='hidden'?`<button class="btn btn-red" data-action="event" data-id="${id}" data-status="hidden">Ausblenden</button>`:''}${e.status!=='open'?`<button class="btn btn-outlined" data-action="event" data-id="${id}" data-status="open">Wieder öffnen</button>`:''}${e.status!=='closed'?`<button class="btn btn-outlined" data-action="event" data-id="${id}" data-status="closed">Schließen</button>`:''}</div></article>`;}
async function refresh(){try{const overview=await api('/api/admin/overview');$('#stats').innerHTML=[['Offen',overview.counts.open],['Geprüft',overview.counts.reviewed],['Verworfen',overview.counts.dismissed],['Ausgeblendet',overview.hidden]].map(([label,n])=>`<div class="mod-stat"><strong>${n}</strong><span>${label}</span></div>`).join('');
 if(tab==='reports'){const {reports}=await api('/api/admin/reports?status='+encodeURIComponent($('#reportFilter').value));$('#reports').innerHTML=reports.length?reports.map(reportCard).join(''):'<div class="mod-empty">Für diesen Filter liegen keine Meldungen vor.</div>'}
 if(tab==='events'){const {events}=await api('/api/admin/events');$('#events').innerHTML=events.length?events.map(eventCard).join(''):'<div class="mod-empty">Keine Events vorhanden.</div>'}
 if(tab==='history'){const {history}=await api('/api/admin/history');$('#history').innerHTML=history.length?history.map(h=>`<article class="mod-card"><strong>${esc(h.action)}: ${esc(h.previous_value||'–')} → ${esc(h.new_value||'–')}</strong><div class="mod-meta">${esc(h.moderator_handle||'gelöscht')} · ${esc(date(h.created_at))} · Event #${h.event_id??'–'} · Report #${h.report_id??'–'}</div><p>${esc(h.note||'Keine weitere Notiz.')}</p></article>`).join(''):'<div class="mod-empty">Noch keine Moderationsaktionen.</div>'}
 if(tab==='team'&&role==='admin'){const {team}=await api('/api/admin/team');$('#team').innerHTML=team.map(u=>`<div class="mod-card"><strong>${esc(u.handle)}</strong> · ${esc(u.role)}</div>`).join('')}
 }catch(e){notice('Fehler: '+e.message,'error');}}
$('#setupForm').addEventListener('submit',async e=>{e.preventDefault();const token=$('#setupToken').value;$('#setupToken').value='';try{await api('/api/admin/claim',{token});$('#setup').hidden=true;role='admin';$('#dashboard').hidden=false;$('#teamTab').hidden=false;notice('Admin erfolgreich freigeschaltet!','success');await refresh();}catch(err){notice(err.message,'error')}});
$('#teamForm').addEventListener('submit',async e=>{e.preventDefault();const handle=$('#teamHandle').value, role=$('#teamRole').value;if(!confirm('Rolle von '+handle+' ändern?'))return;try{await api('/api/admin/team',{handle,role});$('#teamHandle').value='';notice('Teamrolle aktualisiert.','success');await refresh()}catch(err){notice(err.message,'error')}});
$('#reportFilter').addEventListener('change',refresh);
document.addEventListener('click',async e=>{const btn=e.target.closest('[data-tab],[data-action]');if(!btn)return;
 if(btn.dataset.tab){tab=btn.dataset.tab;document.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('selected',t.dataset.tab===tab));for(const name of ['reports','events','history','team'])$('#'+name+'Panel').hidden=name!==tab;await refresh();return;}
 if(btn.dataset.action==='reload'){await refresh();return;}
 const action=btn.dataset.action,id=Number(btn.dataset.id),status=btn.dataset.status;
 if(!['review','event'].includes(action))return;
 const note=(action==='review'?$('#note-'+id):$(btn.dataset.note?'#'+btn.dataset.note:'#enote-'+id))?.value.trim()||'';
 if(note.length<8){notice('Bitte mindestens 8 Zeichen Begründung eingeben.','error');return;}
 if(!confirm('Diese Moderationsentscheidung wirklich durchführen?'))return;
 btn.disabled=true;try{await api(action==='review'?'/api/admin/reports/review':'/api/admin/events/status',{id,status,note});notice('Entscheidung gespeichert und im Verlauf dokumentiert.','success');await refresh();}catch(err){notice(err.message,'error')}finally{btn.disabled=false;}
});
start();
