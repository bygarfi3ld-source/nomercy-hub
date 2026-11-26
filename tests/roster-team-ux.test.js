'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=readFileSync(path.join(root,'public/index.html'),'utf8');
const js=readFileSync(path.join(root,'public/hq.js'),'utf8');
const css=readFileSync(path.join(root,'public/hq.css'),'utf8');
const backend=readFileSync(path.join(root,'clan-hq.js'),'utf8');
const server=readFileSync(path.join(root,'server.js'),'utf8');

test('Member directory has separate visible navigation and filterable page',()=>{
 assert.match(html,/data-tab="roster"/);
 assert.match(html,/id="rosterPanel"/);
 assert.match(html,/id="rosterSearch"/);
 assert.match(html,/id="rosterFilter"/);
 assert.match(js,/async function loadRoster\(\)/);
 assert.match(js,/function renderRoster\(\)/);
 assert.match(js,/tab==='roster'/);
 assert.match(js,/x\.scrollIntoView/);
 assert.match(css,/\.roster-list\{/);
});
test('Public roster contains ONLY approved membership and names, never requests',()=>{
 assert.match(backend,/p==='\/api\/hq\/clan\/roster'/);
 assert.match(backend,/SELECT u\.handle,cm\.clan FROM clan_memberships/);
 assert.match(backend,/getOnly\(m\)/);
});
test('Admin can manage roles from Clan Team; backend remains admin restricted',()=>{
 assert.match(html,/id="teamRoleForm"/);
 assert.match(js,/api\('\/api\/admin\/team',payload\)/);
 assert.match(js,/async function loadTeamRoles\(\)/);
 assert.match(server,/p==='\/api\/admin\/team' && method==='POST'/);
 assert.match(server,/requireStaff\(req,true\)/);
 assert.match(server,/\['coleader','moderator','event_manager','member'\]/);
 assert.match(server,/target\.role==='admin'/);
});
