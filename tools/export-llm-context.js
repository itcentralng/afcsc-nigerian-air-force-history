#!/usr/bin/env node
/*
  Writes the history in data/content.js as a clean reference document for
  use as LLM context: facts and narrative only, with no photo paths,
  captions, film links or kiosk wording.

  Usage:  node tools/export-llm-context.js
  Output: docs/naf-history-llm-context.txt
*/
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
global.window = {};
require(path.join(root, 'data/content.js'));
const C = global.window.HOF_CONTENT;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const today = new Date();
const asOf = MONTHS[today.getMonth()] + ' ' + today.getFullYear();
const parse = (iso) => { const p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
const fmt = (iso) => { if (!iso) return 'present'; const d = parse(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const tenure = (c) => {
  const days = Math.max(0, Math.round(((c.to ? parse(c.to) : today) - parse(c.from)) / 86400000));
  if (days < 120) return plural(days, 'day');
  const months = Math.round(days / 30.44), y = Math.floor(months / 12), m = months % 12;
  return [y ? plural(y, 'year') : '', m ? plural(m, 'month') : ''].filter(Boolean).join(' ');
};
const clean = (s) => String(s || '').replace(/\s*·\s*/g, '; ').replace(/\s+/g, ' ').trim();
const place = (st) => (!st ? '' : /^FCT/.test(st) ? st : st + ' State');
const title = (c) => (c.no <= 2 ? 'Commander of the Nigerian Air Force' : 'Chief of the Air Staff');

const out = [];
const L = (s) => out.push(s == null ? '' : s);
const H1 = (s) => { L(); L('# ' + s); L(); };
const H2 = (s) => { L(); L('## ' + s); L(); };
const H3 = (s) => { L(); L('### ' + s); };

const founded = C.events.find((e) => /formally established/i.test(e.title));
const serving = C.chiefs.find((c) => c.serving);
const hq = C.bases.find((b) => b.id === 'abuja');

L('NIGERIAN AIR FORCE HISTORY — REFERENCE CONTEXT');
L();
L('About this document: a factual reference on the history of the Nigerian Air Force (NAF), compiled for the Air Marshal S.K. Aneke Hall of Fame at the Armed Forces Command and Staff College (AFCSC), Jaji. It covers the founding and development of the NAF from 1961, every Commander and Chief of the Air Staff, the history of the AFCSC and its Department of Air Warfare, NAF bases and the aircraft the NAF has operated. Information is current as of ' + asOf + '. Biographies of the Chiefs of the Air Staff draw on the Nigerian Air Force (airforce.mil.ng) and Wikipedia. Where this document is silent on a point, treat that point as not covered rather than inferring it.');

H1('Key facts');
if (founded) L('- Established: ' + founded.date + '. ' + clean(founded.text.join(' ')));
L('- Leadership: ' + C.chiefs.length + ' heads of service to date. The first two (' + C.chiefs[0].name + ' and ' + C.chiefs[1].name + ') were German Air Force officers who served as Commanders of the NAF; from ' + fmt(C.chiefs[2].from) + ' the service has been led by Nigerian officers.');
if (serving) L('- Serving Chief of the Air Staff: ' + serving.name + ', the ' + ordinalWord(serving.no) + ' head of the service, in office since ' + fmt(serving.from) + '. The Hall of Fame at AFCSC Jaji is named after him.');
if (hq) L('- Headquarters: ' + hq.city + ' (' + clean(hq.role) + ').');
L('- Commands: Tactical Air Command (Makurdi), Special Operations Command (Bauchi), Mobility Command (Yenagoa), Air Training Command (Kaduna), Ground Training Command (Enugu) and Logistics Command (Lagos).');
L('- Birthplace of the NAF: Kaduna, where the first base was built from 1964.');

H1('Chiefs of the Air Staff at a glance');
L('In order of appointment. Dates are as recorded; "present" means still in office as of ' + asOf + '. These are the dates each Chief held office; where the timeline below gives a slightly different appointment date, it usually records when the appointment was announced.');
L();
C.chiefs.forEach((c) => {
  L(c.no + '. ' + c.name + ' — ' + title(c) + ', ' + fmt(c.from) + ' to ' + fmt(c.to) + ' (' + tenure(c) + ')' + (c.state ? '; state of origin: ' + c.state : '') + (c.serving ? '; serving' : ''));
});

H1('Timeline of the Nigerian Air Force, ' + C.decades[0].from + ' to ' + C.decades[C.decades.length - 1].to);
C.decades.forEach((d) => {
  H2(d.from + '–' + d.to + ': ' + d.title);
  L(clean(d.summary));
  C.events.filter((e) => e.year >= d.from && e.year <= d.to).forEach((e) => {
    H3(e.date + ' — ' + clean(e.title));
    e.text.forEach((p) => L(clean(p)));
    if (e.state) L('Location: ' + place(e.state) + '.');
  });
});

H1('Commanders and Chiefs of the Air Staff: profiles');
C.chiefs.forEach((c) => {
  H2(c.no + '. ' + c.name);
  L('- Position: ' + (c.serving ? 'Serving ' : '') + title(c) + ' (' + ordinalWord(c.no) + ' head of the NAF)');
  L('- Rank: ' + c.rank);
  L('- In office: ' + fmt(c.from) + ' to ' + fmt(c.to) + ' (' + tenure(c) + ')');
  if (c.born) L('- Born: ' + c.born);
  if (c.died) L('- Died: ' + c.died);
  if (c.state) L('- State of origin: ' + c.state);
  L();
  c.bio.forEach((p) => L(clean(p)));
  if (c.achievements && c.achievements.length) {
    L();
    L('Notable in office:');
    c.achievements.forEach((a) => L('- ' + clean(a)));
  }
});

['college', 'daw'].forEach((key) => {
  const ch = C.chronicles[key];
  H1(ch.title + (key === 'daw' ? ', AFCSC Jaji' : ': ' + ch.eyebrow));
  L(clean(ch.intro));
  ch.items.forEach((it) => {
    H3(it.date + ' — ' + clean(it.title));
    it.text.forEach((p) => L(clean(p)));
  });
});

H1('Bases and installations');
C.bases.forEach((b) => {
  H2(b.city + ' (' + place(b.state) + ')');
  L('Role: ' + clean(b.role) + '.');
  (b.text || []).forEach((p) => L(clean(p)));
});

H1('Aircraft operated by the Nigerian Air Force');
L('In order of entry into service.');
C.aircraft.forEach((a) => {
  H3(a.name);
  L('- Entered NAF service: ' + a.inService);
  L('- Origin: ' + a.origin);
  L('- Role: ' + a.role);
  L('- Notes: ' + clean(a.note));
});

function ordinalWord(n) {
  const w = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
  if (n < w.length) return w[n];
  const units = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
  return 'twenty-' + units[n - 20];
}

fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
const file = path.join(root, 'docs/naf-history-llm-context.txt');
fs.writeFileSync(file, out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n');
console.log('wrote', path.relative(root, file), out.length, 'lines,', fs.statSync(file).size, 'bytes');
