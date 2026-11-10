#!/usr/bin/env node
/*
  Rebuilds data/content.js from the archived Netlify page in
  source/aneke-hall-of-fame/index.html.

  The original site keeps all of its content as static fields on one
  component class (T, DECADES, EVENTS, CHIEFS, BASES, OUTLINE, AIRCRAFT,
  FILMS, STATES, TIMELINES). This script evaluates just those fields, renames
  the terse keys to readable ones and writes a plain data file the kiosk can
  load from file:// with no build step.

  Usage:  node tools/extract-content.js
  Only needed again if the source archive is replaced. After that, edit
  data/content.js directly.
*/
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'source/aneke-hall-of-fame/index.html'), 'utf8');

// Pull the component script and keep only the `static NAME = ...;` lines.
const script = html.slice(html.indexOf('class Component extends DCLogic'));
// Multi-line statics (T, DECADES, FILMS) run until a line of just "  ];" / "  };".
let src = '';
const lines = script.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (!/^ {2}static [A-Z_]+ =/.test(lines[i])) continue;
  let chunk = lines[i];
  if (!/;\s*$/.test(chunk)) {
    while (++i < lines.length) { chunk += '\n' + lines[i]; if (/^ {2}[\]}];\s*$/.test(lines[i])) break; }
  }
  src += chunk.replace(/^ {2}static /, 'out.') + '\n';
}
const out = {};
vm.runInNewContext(src, { out });

const portraitFor = (c) => {
  const name = String(c.n).padStart(2, '0') + '-' + String(c.short).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.jpg';
  return fs.existsSync(path.join(root, 'assets/portraits', name)) ? 'assets/portraits/' + name : undefined;
};
// Typing slips in the source, corrected on the way out.
const CORRECTIONS = [
  [/401Flying/g, '401 Flying'],
  [/School {2,}\(301 FTS\)/g, 'School (301 FTS)'],
  [/Mikoyan-Hurevich/g, 'Mikoyan-Gurevich']
];
const fix = (s) => CORRECTIONS.reduce((t, [re, to]) => t.replace(re, to), s);
const paras = (s) => fix(String(s || '')).split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
const clean = (o) => { Object.keys(o).forEach((k) => { if (o[k] === undefined || o[k] === '' || (Array.isArray(o[k]) && !o[k].length)) delete o[k]; }); return o; };

const content = {
  meta: {
    title: 'Air Marshal S.K. Aneke Hall of Fame',
    kicker: 'Nigerian Air Force · Established 1964',
    subtitle: 'Our History',
    host: 'Armed Forces Command and Staff College, Jaji',
    tagline: 'Six decades of Nigerian airpower: the people, the aircraft and the moments that built the Nigerian Air Force.',
    source: 'https://aneke-hall-of-fame.netlify.app'
  },

  decades: out.DECADES.map((d) => ({ from: d.a, to: d.b, title: d.label, summary: d.summary })),

  events: out.EVENTS.map((e) => clean({
    year: e.y,
    date: e.d,
    title: e.t,
    text: paras(e.x),
    photos: e.imgs || [],
    caption: e.cap,
    film: e.f,
    state: e.s
  })),

  chiefs: out.CHIEFS.map((c) => clean({
    no: c.n,
    name: c.name,
    shortName: c.short,
    rank: c.rank,
    from: c.f,
    to: c.to || null,
    born: c.born,
    died: c.died,
    state: c.st,
    serving: c.serving || undefined,
    bio: paras(c.bio),
    achievements: c.ach || [],
    sources: c.src || [],
    photo: c.img,
    // evenly cropped copy made by tools/crop-chief-portraits.py, when present
    portrait: portraitFor(c)
  })),

  bases: out.BASES.map((b) => clean({
    id: b.id,
    city: b.city,
    state: b.state,
    lon: b.lon,
    lat: b.lat,
    role: b.role,
    photo: b.img,
    caption: b.cap,
    text: b.paras || [],
    labelDx: b.lx,
    labelDy: b.ly
  })),

  aircraft: out.AIRCRAFT.map((a) => clean({
    name: a.name, origin: a.origin, role: a.role, inService: a.years, note: a.note, photo: a.img, caption: a.cap
  })),

  films: out.FILMS.map((f) => clean({
    id: f.id,
    title: f.title,
    subtitle: f.sub,
    duration: f.dur,
    src: f.src,
    year: f.y,
    section: f.screen,
    description: f.desc
  })),

  chronicles: Object.keys(out.TIMELINES).reduce((acc, key) => {
    const t = out.TIMELINES[key];
    acc[key] = clean({
      id: t.id,
      eyebrow: t.eyebrow,
      title: t.title,
      intro: t.intro,
      hero: t.hero,
      heroCaption: t.heroLabel,
      items: t.items.map((it) => clean({
        date: it.yr,
        title: it.t,
        text: paras(it.x),
        photos: [it.img].concat(it.imgs || []).filter(Boolean),
        caption: it.cap
      }))
    });
    return acc;
  }, {}),

  states: out.STATES,

  // Simplified outline of Nigeria as [longitude, latitude] pairs, drawn as the base map.
  nigeriaOutline: out.OUTLINE,

  introFilm: out.INTRO_SRC
};

const banner = `/*
  Content for the Air Marshal S.K. Aneke Hall of Fame kiosk.

  Extracted from ${content.meta.source} by tools/extract-content.js and
  then maintained here by hand. Plain data only; see README.md for the
  meaning of each field.
    events      ${content.events.length} moments in NAF history, oldest first
    chiefs      ${content.chiefs.length} Commanders / Chiefs of the Air Staff, in order
    bases       ${content.bases.length} bases and installations on the map
    aircraft    ${content.aircraft.length} aircraft types
    films       ${content.films.length} short films
    chronicles  College (${content.chronicles.college.items.length} entries), Department of Air Warfare (${content.chronicles.daw.items.length} entries)
*/
`;
fs.writeFileSync(path.join(root, 'data/content.js'), banner + 'window.HOF_CONTENT = ' + JSON.stringify(content, null, 2) + ';\n');
console.log('wrote data/content.js:', Object.keys(content).map((k) => k + (Array.isArray(content[k]) ? '(' + content[k].length + ')' : '')).join(', '));
