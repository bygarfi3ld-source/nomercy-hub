'use strict';
// Legal notice data is NEVER written to Git: configure through private hosting variables.
// A missing field or missing explicit approval refuses to publish an incomplete notice.
const fs=require('node:fs');
const path=require('node:path');
const VALID_PAGES=new Map([['/impressum.html','impressum.html'],['/datenschutz.html','datenschutz.html']]);
const htmlEscape=x=>String(x).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function legalConfig(env=process.env){
 const values={
  LEGAL_NAME:env.NOMERCY_LEGAL_NAME,
  LEGAL_STREET:env.NOMERCY_LEGAL_STREET,
  LEGAL_CITY:env.NOMERCY_LEGAL_CITY,
  LEGAL_EMAIL:env.NOMERCY_LEGAL_EMAIL
 };
 if(env.NOMERCY_LEGAL_PUBLISH!=='1'||Object.values(values).some(v=>typeof v!=='string'||v.trim().length<3))return null;
 if(Object.values(values).some(v=>v.length>200||/[\r\n\0]/.test(v)))return null;
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(values.LEGAL_EMAIL))return null;
 return Object.fromEntries(Object.entries(values).map(([k,v])=>[k,htmlEscape(v.trim())]));
}
function legalPage(urlPath,env=process.env,base=path.join(__dirname,'public')){
 const filename=VALID_PAGES.get(urlPath);
 if(!filename)return null;
 const values=legalConfig(env);if(!values)return null;
 const source=fs.readFileSync(path.join(base,filename),'utf8');
 // Never publish draft warnings or unreviewed placeholders.
 if(source.includes('ENTWURF – NOCH NICHT VERÖFFENTLICHEN.')||source.includes('class="todo"'))return null;
 let body=source;
 for(const [name,value] of Object.entries(values))body=body.replaceAll('{{'+name+'}}',value);
 if(/{{LEGAL_[A-Z_]+}}/.test(body))return null;
 return body;
}
module.exports={legalConfig,legalPage,htmlEscape};
