const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../public/hq.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/hq.css'),'utf8');
test('direct #apply URL applies selected page before network loading',()=>{
 assert.match(js,/showSection\(initialTab\); \/\/ Apply deep links before any network request/);
 assert.match(js,/if\(initialTab!=='market'\)await setTab\(initialTab/);
 assert.match(js,/window\.addEventListener\('popstate',syncHistory\)/);
});
test('non-home tabs get page indicator and hide the home hero',()=>{
 assert.match(js,/hero\.hidden=!home/);assert.match(js,/stats\.hidden=!home/);
 assert.match(js,/marker\.hidden=home/);assert.match(css,/\.section-marker\{/);
 assert.match(js,/history\.pushState/);assert.match(js,/window\.scrollTo/);
});

test('navigation initializes all buttons without calling forEach on one element',()=>{
 assert.match(js,/\$\$\('\.nav \[data-tab\]'\)\.forEach/);
 assert.doesNotMatch(js,/(^|\n)\s\$\('\.nav \[data-tab\]'\)\.forEach/);
});
