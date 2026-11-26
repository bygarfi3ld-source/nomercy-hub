'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('German legal pages carry statutory disclosures and private runtime placeholders',()=>{
 const imprint=read('public/impressum.html');
 const privacy=read('public/datenschutz.html');
 for(const html of [imprint,privacy]){
  assert.match(html,/lang="de"/);
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.match(html,/rel="stylesheet" href="\/legal.css"/);
  assert.match(html,/{{LEGAL_NAME}}/);
  assert.match(html,/{{LEGAL_STREET}}/);
  assert.match(html,/{{LEGAL_CITY}}/);
  assert.match(html,/{{LEGAL_EMAIL}}/);
  assert.ok(!html.includes('NOCH NICHT VERÖFFENTLICHEN'));
  assert.ok(!html.includes('class="todo"'));
 }
 assert.match(imprint,/§ 18 Abs\. 1/);
 assert.match(imprint,/§ 5/);
 for(const phrase of [/Art\. 12 und 13/,/Art\. 6 Abs\. 1/,/Art\. 15/,/Art\. 17/,/Art\. 22/,/Art\. 77/,/§ 25 Abs\. 2/,/Railway/,/Bewerbung/,/Clanbank/,/Monatssteuern/,/Clan-Aufträge/,/42 wechselnde Slots/,/sieben Tage/]){
  assert.match(privacy,phrase);
 }
 assert.match(privacy,/Schriftarten des Endgeräts/);
 assert.match(privacy,/USA/);
});
test('Website links to legal pages directly but discreetly in footer on desktop and mobile',()=>{
 const main=read('public/index.html'),js=read('public/hq.js'),moderation=read('public/moderation.html');
 const legacy=read('public/legacy.html'),legacyJS=read('public/app.js');
 for(const route of ['/impressum.html','/datenschutz.html']){
  assert.ok(main.includes(route));
  assert.ok(moderation.includes(route));
  assert.ok(legacy.includes(route));
 }
 assert.ok(js.includes('/datenschutz.html'));
 assert.ok(legacyJS.includes('/datenschutz.html'));
 assert.match(main,/Datenschutzhinweise ansehen/);
 assert.match(main,/<nav class="footer-legal wrap" aria-label="Rechtliche Informationen">/);
 assert.ok(!main.includes('data-tab="impressum"'));
 assert.match(read('public/hq.css'),/\.footer-legal a:focus-visible/);
});
test('No external Google font request and Docker production build includes all imported modules',()=>{
 for(const page of ['public/index.html','public/legacy.html','public/moderation.html']){
  assert.ok(!/fonts\.(?:googleapis|gstatic)\.com/.test(read(page)),page);
 }
 assert.ok(!/@import\s+url\([^)]*fonts\.(?:googleapis|gstatic)\.com/.test(read('public/hq.css')));
 const docker=read('Dockerfile'),server=read('server.js');
 assert.match(server,/require\('\.\/legal-pages'\)/);
 assert.match(docker,/COPY legal-pages\.js \.\/legal-pages\.js/);
 const checklist=read('LAUNCH-LEGAL-RECOVERY.md');
 assert.match(checklist,/NOMERCY_BACKUP_KEY/);
 assert.match(checklist,/Railway-2FA/);
});
