#!/usr/bin/env node
/*
  Writes every piece of text in data/content.js to a plain, readable
  docs/hall-of-fame-content.txt, organised by section, with the photo and
  film file each item uses.

  Usage:  node tools/export-text.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
global.window = {};
require(path.join(root, 'data/content.js'));
const C = global.window.HOF_CONTENT;

const out = [];
const W = 78;
const line = (s) => out.push(s == null ? '' : s);
const rule = (ch) => line((ch || '-').repeat(W));
const wrap = (text, indent) => {
  indent = indent || '';
  const words = String(text).split(/\s+/);
  let cur = indent;
  words.forEach((w) => {
    if ((cur + w).length > W && cur.trim()) { out.push(cur.replace(/\s+$/, '')); cur = indent; }
    cur += w + ' ';
  });
  if (cur.trim()) out.push(cur.replace(/\s+$/, ''));
};
const field = (k, v, indent) => { if (v == null || v === '' || (Array.isArray(v) && !v.length)) return; wrap(k + ': ' + (Array.isArray(v) ? v.join(' | ') : v), indent || '  '); };
const section = (title, note) => { line(); rule('='); line(title.toUpperCase()); if (note) wrap(note); rule('='); };

line(C.meta.title.toUpperCase());
line(C.meta.kicker + ' · ' + C.meta.subtitle);
line();
wrap(C.meta.tagline);
line();
line('Source: ' + C.meta.source);
line('Exported: ' + new Date().toISOString().slice(0, 10));
line();
line('CONTENTS');
[
  '1. Decades (' + C.decades.length + ')',
  '2. Timeline of the Nigerian Air Force (' + C.events.length + ' events)',
  '3. Commanders and Chiefs of the Air Staff (' + C.chiefs.length + ')',
  '4. History of the College (' + C.chronicles.college.items.length + ' milestones)',
  '5. History of the Department of Air Warfare (' + C.chronicles.daw.items.length + ' milestones)',
  '6. Bases (' + C.bases.length + ')',
  '7. Aircraft (' + C.aircraft.length + ')',
  '8. Films (' + C.films.length + ')',
  '9. States of Nigeria (' + C.states.length + ')'
].forEach((s) => line('  ' + s));

section('1. Decades');
C.decades.forEach((d) => { line(); line(d.from + ' – ' + d.to + '  ' + d.title); wrap(d.summary, '  '); });

section('2. Timeline of the Nigerian Air Force', 'Oldest first. "State" links an event to a state for the Find your connection feature; "Film" names the film that tells the story.');
let lastYear = null;
C.events.forEach((e, i) => {
  if (e.year !== lastYear) { line(); rule(); line(String(e.year)); rule(); lastYear = e.year; }
  line();
  line('[' + (i + 1) + '] ' + e.date + ' — ' + e.title);
  (e.text || []).forEach((p) => wrap(p, '  '));
  field('Photo caption', e.caption);
  field('State', e.state);
  field('Film', e.film);
  field('Photos', e.photos);
});

section('3. Commanders and Chiefs of the Air Staff', 'In order of appointment. Numbers 1 and 2 were German Air Force commanders of the NAF.');
C.chiefs.forEach((c) => {
  line(); rule();
  line(c.no + '. ' + c.name + (c.serving ? '  (SERVING)' : ''));
  rule();
  field('Short name', c.shortName);
  field('Rank', c.rank);
  field('In office', c.from + ' to ' + (c.to || 'present'));
  field('Born', c.born);
  field('Died', c.died);
  field('State of origin', c.state);
  line('  Biography:');
  (c.bio || []).forEach((p) => wrap(p, '    '));
  if (c.achievements && c.achievements.length) { line('  Notable in office:'); c.achievements.forEach((a) => wrap('- ' + a, '    ')); }
  field('Sources', c.sources);
  field('Photo', c.photo);
});

['college', 'daw'].forEach((key, n) => {
  const ch = C.chronicles[key];
  section((4 + n) + '. ' + ch.title, ch.eyebrow);
  line();
  wrap(ch.intro);
  field('Hero photo', ch.hero, '');
  field('Hero caption', ch.heroCaption, '');
  ch.items.forEach((it, i) => {
    line();
    line('[' + (i + 1) + '] ' + it.date + ' — ' + it.title);
    (it.text || []).forEach((p) => wrap(p, '  '));
    field('Photo caption', it.caption);
    field('Photos', it.photos);
  });
});

section('6. Bases', 'Longitude/latitude place each base on the map of Nigeria.');
C.bases.forEach((b) => {
  line();
  line(b.city + ' (' + b.state + ')');
  field('Role', b.role);
  field('Position', 'lon ' + b.lon + ', lat ' + b.lat);
  (b.text || []).forEach((p) => wrap(p, '  '));
  field('Photo caption', b.caption);
  field('Photo', b.photo);
});

section('7. Aircraft', 'In order of entry into service.');
C.aircraft.forEach((a) => {
  line();
  line(a.name);
  field('In service from', a.inService);
  field('Origin', a.origin);
  field('Role', a.role);
  field('Note', a.note);
  field('Photo caption', a.caption);
  field('Photo', a.photo);
});

section('8. Films');
C.films.forEach((f) => {
  line();
  line(f.title + ' — ' + f.subtitle);
  wrap(f.description, '  ');
  field('File', f.src);
  field('Linked year', f.year);
  field('Linked section', f.section);
});
line();
field('Welcome-screen film', C.introFilm, '');

section('9. States of Nigeria');
line();
wrap(C.states.join(', '));
line();

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
const file = path.join(root, 'docs/hall-of-fame-content.txt');
fs.writeFileSync(file, out.join('\n') + '\n');
console.log('wrote', path.relative(root, file), out.length, 'lines');
