'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {legalConfig,legalPage}=require('../legal-pages');
const sample={
 NOMERCY_LEGAL_PUBLISH:'1',
 NOMERCY_LEGAL_NAME:'Beispiel Betreiber',
 NOMERCY_LEGAL_STREET:'Beispielweg 7',
 NOMERCY_LEGAL_CITY:'00000 Musterstadt',
 NOMERCY_LEGAL_EMAIL:'contact@example.invalid'
};

test('Unapproved or incomplete personal information never publishes an Impressum',()=>{
 assert.equal(legalConfig({}),null);
 assert.equal(legalConfig({...sample,NOMERCY_LEGAL_PUBLISH:'0'}),null);
 assert.equal(legalConfig({...sample,NOMERCY_LEGAL_STREET:''}),null);
 assert.equal(legalConfig({...sample,NOMERCY_LEGAL_EMAIL:'not-an-email'}),null);
 assert.equal(legalConfig({...sample,NOMERCY_LEGAL_NAME:'X\r\nBad Header'}),null);
 assert.match(legalPage('/impressum.html',sample),/Beispiel Betreiber/,'Approved templates use private values');
 assert.match(legalPage('/datenschutz.html',sample),/contact@example.invalid/,'Approved privacy notice uses private values');
 assert.equal(legalPage('/impressum.html',{...sample,NOMERCY_LEGAL_PUBLISH:'0'}),null,'No disclosure until operator explicitly approves publication');
});

test('Reviewed legal templates render only server-side and escape injected markup',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'nm-legal-test-'));
 try{
  const src='<!doctype html><h1>{{LEGAL_NAME}}</h1><p>{{LEGAL_STREET}} {{LEGAL_CITY}}</p><span>{{LEGAL_EMAIL}}</span>';
  fs.writeFileSync(path.join(root,'impressum.html'),src);
  fs.writeFileSync(path.join(root,'datenschutz.html'),src);
  const rendered=legalPage('/impressum.html',{...sample,NOMERCY_LEGAL_NAME:'Example & <script>alert(1)</script>'},root);
  assert.match(rendered,/Example &amp; &lt;script&gt;/);
  assert.ok(!rendered.includes('<script>'));
  assert.match(rendered,/contact@example.invalid/);
  assert.equal(legalPage('/impressum.html',{...sample,NOMERCY_LEGAL_EMAIL:''},root),null);
  assert.equal(legalPage('/unknown.html',sample,root),null);
  fs.writeFileSync(path.join(root,'datenschutz.html'),src+'<span class="todo">Unvollständig</span>');
  assert.equal(legalPage('/datenschutz.html',sample,root),null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('Legal source files contain no real operator address or secret values',()=>{
 for(const filename of ['legal-pages.js','public/impressum.html','public/datenschutz.html']){
  const content=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
  assert.match(content,/LEGAL_/);
  assert.ok(!content.includes('NOMERCY_LEGAL_STREET=Am '),'Source must never include a live address');
 }
});
