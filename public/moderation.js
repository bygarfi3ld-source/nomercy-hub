'use strict';
const keyInput=document.getElementById('adminKey');
const grid=document.getElementById('reportGrid');
const summary=document.getElementById('summary');
let key='';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function call(p,body){const r=await fetch(p,{method:body?'POST':'GET',headers:{'x-admin-token':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});let data=await r.json();if(!r.ok)throw Error(data.error||'Serverfehler');return data;}
async function reload(){try{const {reports}=await call('/api/admin/reports');summary.textContent=`${reports.length} Meldungen insgesamt · ${reports.filter(r=>r.status==='open').length} offen`;
 grid.innerHTML=reports.length?reports.map(r=>`<article class="report-card"><div class="report-top"><h3>${esc(r.event_title)}</h3><span class="tag-demo">${esc(r.status.toUpperCase())}</span></div><span class="report-reason">${esc(r.reason)}</span><p class="report-text">${esc(r.details)}</p><div class="report-meta">Event-ID: ${r.event_id} · Report-ID: ${r.id} · gemeldet von Hub-Account ${esc(r.reporter)} · ${new Date(r.created_at).toLocaleString('de-DE')}</div>${r.evidence_url?`<p><a class="report-link" href="${esc(r.evidence_url)}" target="_blank" rel="noopener noreferrer">Beweislink öffnen ↗</a></p>`:''}
 <div class="report-actions"><button class="btn btn-outlined" data-op="dismissed" data-id="${r.id}">Meldung verwerfen</button><button class="btn btn-dark" data-op="reviewed" data-id="${r.id}">Als geprüft markieren</button><button class="btn btn-red" data-op="hide" data-event="${r.event_id}">Event ausblenden</button></div></article>`).join(''):'<article class="report-card">Keine Meldungen vorhanden.</article>';
 }catch(e){summary.textContent='Fehler: '+e.message;grid.innerHTML='';}}
document.getElementById('keyForm').addEventListener('submit',ev=>{ev.preventDefault();key=keyInput.value;keyInput.value='';reload();});
grid.addEventListener('click',async ev=>{const b=ev.target.closest('[data-op]');if(!b)return;const op=b.dataset.op;if(!confirm(op==='hide'?'Event wirklich aus der öffentlichen Liste ausblenden?':'Meldungsstatus wirklich ändern?'))return;
 try{b.disabled=true;if(op==='hide')await call('/api/admin/events/status',{id:Number(b.dataset.event),status:'hidden'});else await call('/api/admin/reports/review',{id:Number(b.dataset.id),status:op});await reload();}catch(e){alert(e.message);b.disabled=false;}});