'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'public/hq.js'),'utf8');
test('Admin sees pending and reviewed applications and explicit count',()=>{
 assert.match(html,/id="clanApplicationsPanel" hidden/);
 assert.match(html,/id="clanApplicationsHistory"/);
 assert.match(html,/id="clanApplicationsSummary"/);
 assert.match(html,/id="refreshClanApplicationsBtn"/);
 assert.match(js,/const pending=requests\.filter\(r=>r\.status==='pending'\),history=requests\.filter\(r=>r\.status!=='pending'\)/);
 assert.match(js,/\$\('#clanApplicationsHistory'\)\.innerHTML/);
 assert.match(js,/\$\('#refreshClanApplicationsBtn'\)\.onclick=\(\)=>withAction\(loadTeam\)/);
 assert.match(js,/\$\('#clanApplicationsPanel'\)\.hidden=!clanLeader\(\)/);
 assert.match(js,/Discord-Tickets werden nicht automatisch übernommen/);
});
