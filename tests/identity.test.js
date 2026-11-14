'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');
const css = readFileSync(join(__dirname, '..', 'public', 'hq.css'), 'utf8');
test('Eigenes NoMercy-Wappen statt Rasterlogo und Minecraft-Item-Akzente', () => {
 assert.match(html, /class="brand-crest"/);
 assert.match(html, /class="equip-crest"/);
 assert.match(html, /id="nm-pixel-diamond"/);
 assert.match(html, /id="nm-pixel-sword"/);
 assert.match(html, /id="nm-pixel-chest"/);
 assert.match(html, /id="nm-pixel-apple"/);
 assert.match(html, /id="nm-pixel-pearl"/);
 assert.doesNotMatch(html, /hero-art-orbit|hero-art-emblem/);
 assert.match(css, /\.equipment-art:after\{background:none!important;content:none!important\}/);
 assert.match(css, /prefers-reduced-motion:reduce/);
});
