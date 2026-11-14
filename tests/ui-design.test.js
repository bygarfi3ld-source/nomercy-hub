'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const publicDir=path.resolve(__dirname,'..','public');
const read=f=>readFileSync(path.join(publicDir,f),'utf8');

test('Design: no roulette, shell navigable and async loading placeholders present',()=>{
 const html=read('index.html'),js=read('hq.js'),css=read('hq.css');
 assert.match(html,/id="marketList"[^>]+aria-busy="true"/);
 assert.match(js,/function setSkeleton\(/);
 assert.match(js,/function finishSkeleton\(/);
 assert.match(js,/setSkeleton\('#marketList'/);
 assert.match(js,/setSkeleton\('#giveawayList'/);
 assert.match(js,/setSkeleton\('#eventList'/);
 assert.match(js,/aria-current/);
 assert.match(css,/hq-skeleton-shimmer/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(html,/id="spinDialog"/);
 assert.doesNotMatch(html,/Roulette/i);
});

test('Giveaway-Formular zeigt öffentliche/private Wahl und Login-Hinweis',()=>{
 const html=read('index.html'),js=read('hq.js');
 assert.match(js,/id="giveawayVisibility"/,'Sichtbarkeitsauswahl für Leitung fehlt');
 assert.match(js,/name="visibility"/,'Sichtbarkeit muss als Formularfeld gesendet werden');
 assert.match(js,/value="public"/);
 assert.match(js,/value="clan"/);
 assert.match(js,/Anmelden & teilnehmen/,'Öffentliche Teilnahme erfordert Login');
 assert.match(js,/g\.visibility==='public'/,'Sichtbarkeitsabzeichen fehlen');
 assert.match(html,/Öffentliche Giveaways sind für alle mit Hub-Konto/);
});
