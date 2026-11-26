'use strict';
document.addEventListener('DOMContentLoaded',()=>{
 const form=document.getElementById('legalReportForm');
 const output=document.getElementById('reportResponse');
 const button=document.getElementById('sendLegalReport');
 const path=new URLSearchParams(location.search).get('link');
 if(path&&path.length<=350&&path.startsWith('/')&&!path.startsWith('//'))form.elements.content_url.value=path;
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();button.disabled=true;output.textContent='Meldung wird übertragen…';
  const data=new FormData(form);
  const payload={category:data.get('category'),content_url:data.get('content_url'),
    reporter_name:data.get('reporter_name'),reporter_email:data.get('reporter_email'),
    reason:data.get('reason'),good_faith:data.get('good_faith')==='on'};
  try{
   const res=await fetch('/api/content-notices',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const reply=await res.json();
   if(!res.ok)throw Error(reply.error||'Meldung fehlgeschlagen.');
   output.textContent='Eingegangen. Deine Vorgangsnummer: '+reply.reference+'. Bitte notiere sie für eventuelle Rückfragen.';
   form.reset();
  }catch(e){output.textContent='Nicht gesendet: '+e.message;}
  finally{button.disabled=false;}
 });
});