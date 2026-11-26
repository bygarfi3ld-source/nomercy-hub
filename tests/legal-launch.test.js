'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>readFileSync(path.join(root,p),'utf8');

test('Legal page drafts are explicitly marked incomplete and cannot be mistaken for final legal advice',()=>{
 const imprint=read('public/impressum.html');
 const privacy=read('public/datenschutz.html');
 for(const [name,html] of [['impressum',imprint],['datenschutz',privacy]]){
  assert.match(html,/lang="de"/);
  assert.match(html,/NOCH NICHT VERÖFFENTLICHEN/);
  assert.match(html,/class="todo"/);
  assert.match(html,/rel="stylesheet" href="\/legal.css"/);
  assert.match(html,/href="\//);
  assert.match(html,/name="robots" content="noindex,nofollow"/);
  assert.ok(html.length>650,name+' draft must have substantive content');
 }
 assert.match(privacy,/Google Fonts/);
 assert.match(privacy,/Railway/);
 assert.match(privacy,/Clan-Aufträge/);
 assert.match(privacy,/sid/);
 assert.match(privacy,/Backup/);
 assert.match(privacy,/DSGVO/);
 assert.match(imprint,/DDG/);
});
test('Legal links staged for final review in site footer, registration and moderation',()=>{
 const main=read('public/index.html'),js=read('public/hq.js'),moderation=read('public/moderation.html');
 for(const route of ['/impressum.html','/datenschutz.html']){
  assert.ok(main.includes(route),'Hub footer contains '+route);
  assert.ok(moderation.includes(route),'Moderation footer contains '+route);
 }
 assert.ok(js.includes('/datenschutz.html'),'Registration links to privacy notice');
 assert.match(main,/Datenschutzhinweise ansehen/);
 assert.match(main,/<nav class="footer-legal wrap" aria-label="Rechtliche Informationen">/);
 assert.match(main,/<a href="\/impressum\.html">Impressum<\/a><a href="\/datenschutz\.html">Datenschutz<\/a>/);
 assert.ok(!main.includes('data-tab="impressum"'),'Legal is not a main-menu tab');
 assert.match(read('public/hq.css'),/\.footer-legal a:focus-visible/);
 const checklist=read('LAUNCH-LEGAL-RECOVERY.md');
 assert.match(checklist,/NOMERCY_BACKUP_KEY/);
 assert.match(checklist,/GitHub-2FA/);
 assert.match(checklist,/Railway-2FA/);
 assert.match(checklist,/nicht ausreichend/);
});
