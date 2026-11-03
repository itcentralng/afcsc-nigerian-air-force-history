/* ============================================================
   AIR MARSHAL S.K. ANEKE HALL OF FAME — kiosk app logic
   History of the Nigerian Air Force · AFCSC Jaji
   Plain JavaScript, no build step, runs from file:// with no internet.
   All content comes from data/content.js (window.HOF_CONTENT).
   ============================================================ */

(function () {
  'use strict';

  var C = window.HOF_CONTENT;

  // ---------- tuning ----------
  var STAGE_W = 1920, STAGE_H = 1080;
  var IDLE_MS = 90000;           // no touch for this long -> "still there?" prompt
  var IDLE_WARN_S = 10;          // seconds the prompt counts down before the welcome screen
  var YEAR_FIRST = 1961, YEAR_LAST = 2026;
  var YEAR_W = 132;              // px per year on the timeline ruler
  var ATTRACT_SLIDE_MS = 7000;   // welcome-screen photo and fact rotation
  var HOME_FACT_MS = 9000;
  var AMBIENT_SRC = 'assets/audio/ambient.mp3'; // optional: drop a loop here to enable music
  var AMBIENT_VOLUME = 0.3, AMBIENT_DUCK = 0.05;

  var SECTIONS = {
    timeline: { num: 'I', title: 'History of the Nigerian Air Force' },
    chiefs:   { num: 'II', title: 'Past Chiefs of the Air Staff' },
    college:  { num: 'III', title: 'History of the College' },
    daw:      { num: 'IV', title: 'History of the Department of Air Warfare' },
    fleet:    { num: 'V', title: 'Fleet & Bases' },
    connect:  { num: 'VI', title: 'Find your connection' },
    archive:  { num: 'VII', title: 'Photo archive' },
    films:    { num: 'Films', title: 'Watch the story' }
  };
  var EXPLORE_KEYS = ['films', 'timeline', 'chiefs', 'college', 'daw', 'fleet', 'connect', 'archive'];

  var state = {
    screen: 'attract',
    hist: [],
    decade: 0,
    year: null,
    rulerX: 0,
    chief: 1,
    fleetTab: 'bases',
    base: 'kaduna',
    era: 'all',
    cmode: null,
    cval: null,
    cdecade: 1980,
    archive: 'all',
    visited: {},
    watched: {},
    big: false,
    reach: false,
    scale: 1
  };

  var el = {};
  var lists = {};          // photo lists the viewer can page through, keyed per render
  var lightbox = { list: [], i: 0 };
  var film = null;
  var lastTouch = Date.now();
  var idleLeft = 0;
  var attractTimer = null, homeFactTimer = null;
  var ambient = null, ambientOn = true, ambientReady = false;

  // ============================================================
  // Derived data
  // ============================================================
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  C.events.forEach(function (e, i) { e.id = i; });
  var countsByYear = {};
  C.events.forEach(function (e) { countsByYear[e.year] = (countsByYear[e.year] || 0) + 1; });
  var eventYears = Object.keys(countsByYear).map(Number).sort(function (a, b) { return a - b; });

  function filmById(id) { for (var i = 0; i < C.films.length; i++) if (C.films[i].id === id) return C.films[i]; return null; }
  function chiefByNo(n) { for (var i = 0; i < C.chiefs.length; i++) if (C.chiefs[i].no === n) return C.chiefs[i]; return C.chiefs[0]; }
  function baseById(id) { for (var i = 0; i < C.bases.length; i++) if (C.bases[i].id === id) return C.bases[i]; return C.bases[0]; }
  function eventsInYear(y) { return C.events.filter(function (e) { return e.year === y; }); }
  function decadeOf(y) { for (var i = 0; i < C.decades.length; i++) if (y >= C.decades[i].from && y <= C.decades[i].to) return i; return 0; }

  function filmStill(f) {
    for (var i = 0; i < C.events.length; i++) if (C.events[i].film === f.id && C.events[i].photos && C.events[i].photos.length) return C.events[i].photos[0];
    if (f.section === 'college') return C.chronicles.college.hero;
    if (f.section === 'chiefs') return chiefByNo(C.chiefs.length).photo;
    if (f.section === 'home') return firstPhoto(C.events.filter(function (e) { return e.year === 1964; }));
    if (f.year) return firstPhoto(eventsInYear(f.year));
    return '';
  }
  // Which films are actually on this kiosk. Each film file is probed once at
  // start-up; missing ones show "Coming soon" until the file is dropped into
  // assets/video/ (no code change needed).
  var filmStatus = {};
  function probeFilms() {
    C.films.forEach(function (f) {
      var v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.addEventListener('loadedmetadata', function () {
        filmStatus[f.id] = 'ok';
        if (!f.duration && isFinite(v.duration)) f.duration = mmss(v.duration);
        v.removeAttribute('src'); v.load();
        refreshFilmViews();
      }, { once: true });
      v.addEventListener('error', function () { filmStatus[f.id] = 'missing'; refreshFilmViews(); }, { once: true });
      v.src = f.src;
    });
  }
  function filmReady(f) { return filmStatus[f.id] === 'ok'; }
  function filmSoon(f) { return filmStatus[f.id] === 'missing'; }
  var refreshTimer = null;
  function refreshFilmViews() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      if (['films', 'timeline', 'chiefs', 'college', 'daw'].indexOf(state.screen) >= 0 && el.lightbox.classList.contains('hidden') && !film) {
        var scrollers = [].map.call(el.screens[state.screen].querySelectorAll('[data-scroll]'), function (n) { return [n.scrollLeft, n.scrollTop]; });
        show();
        [].forEach.call(el.screens[state.screen].querySelectorAll('[data-scroll]'), function (n, i) { if (scrollers[i]) { n.scrollLeft = scrollers[i][0]; n.scrollTop = scrollers[i][1]; } });
      }
    }, 150);
  }

  function firstPhoto(events) { for (var i = 0; i < events.length; i++) if (events[i].photos && events[i].photos.length) return events[i].photos[0]; return ''; }

  // Every photograph in the content, once, tagged with where it belongs.
  var ARCHIVE = (function () {
    var seen = {}, out = [];
    function add(src, item) { if (!src || seen[src]) return; seen[src] = true; item.src = src; out.push(item); }
    C.events.forEach(function (e) {
      (e.photos || []).forEach(function (p, i) {
        add(p, { group: 'timeline', year: e.year, date: e.date, title: e.title, text: i === 0 && e.caption ? e.caption : '', link: { act: 'year', arg: e.year } });
      });
    });
    C.chiefs.forEach(function (c) { add(c.photo, { group: 'chiefs', date: ordinal(c.no) + ' Chief of the Air Staff', title: c.name, text: yr(c.from) + ' – ' + (c.to ? yr(c.to) : 'present'), link: { act: 'chief', arg: c.no } }); });
    C.bases.forEach(function (b) { add(b.photo, { group: 'bases', date: b.city + ' · ' + b.state, title: b.role, text: b.caption || '', link: { act: 'base', arg: b.id } }); });
    C.aircraft.forEach(function (a) { add(a.photo, { group: 'aircraft', date: 'In service from ' + a.inService + ' · ' + a.origin, title: a.name, text: a.caption || '', link: { act: 'go', arg: 'fleet:aircraft' } }); });
    ['college', 'daw'].forEach(function (key) {
      var ch = C.chronicles[key];
      add(ch.hero, { group: key, date: ch.eyebrow, title: ch.heroCaption || ch.title, text: '', link: { act: 'go', arg: key } });
      ch.items.forEach(function (it) {
        (it.photos || []).forEach(function (p, i) { add(p, { group: key, date: it.date, title: it.title, text: i === 0 && it.caption ? it.caption : '', link: { act: 'go', arg: key } }); });
      });
    });
    return out;
  })();
  var ARCHIVE_GROUPS = [
    { key: 'all', label: 'Everything' },
    { key: 'timeline', label: 'Air Force history' },
    { key: 'chiefs', label: 'Chiefs of the Air Staff' },
    { key: 'bases', label: 'Bases' },
    { key: 'aircraft', label: 'Aircraft' },
    { key: 'college', label: 'The College' },
    { key: 'daw', label: 'Air Warfare' }
  ];

  var ERAS = [
    { key: 'all', label: 'All aircraft', from: 0, to: 9999 },
    { key: '60s', label: '1960s', from: 1960, to: 1969 },
    { key: '70s', label: '1970s', from: 1970, to: 1979 },
    { key: '80s', label: '1980s', from: 1980, to: 1989 },
    { key: '00s', label: '2000s – 2010s', from: 1990, to: 2019 },
    { key: '20s', label: '2020s', from: 2020, to: 2099 }
  ];

  // ============================================================
  // Small helpers
  // ============================================================
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function yr(iso) { return iso ? iso.slice(0, 4) : ''; }
  function parseISO(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(iso) { if (!iso) return 'Present'; var d = parseISO(iso); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function tenure(c) {
    var a = parseISO(c.from), b = c.to ? parseISO(c.to) : new Date();
    var days = Math.max(0, Math.round((b - a) / 86400000));
    if (days < 120) return plural(days, 'day');
    var months = Math.round(days / 30.44), y = Math.floor(months / 12), m = months % 12;
    return [y ? plural(y, 'year') : '', m ? plural(m, 'month') : ''].filter(Boolean).join(', ');
  }
  function casFor(y) {
    var d = new Date(y, 6, 1);
    for (var i = 0; i < C.chiefs.length; i++) {
      var c = C.chiefs[i];
      if (parseISO(c.from) <= d && (!c.to || parseISO(c.to) > d)) return c;
    }
    return null;
  }
  function chiefYears(c) { return yr(c.from) + ' – ' + (c.to ? yr(c.to) : 'present'); }
  function chiefLabel(c) { return c.serving ? 'Serving Chief of the Air Staff' : ordinal(c.no) + (c.no <= 2 ? ' Commander of the NAF' : ' Chief of the Air Staff'); }
  function initials(name) { return String(name || '').replace(/^(Air Chief Marshal|Air Marshal|Air Vice Marshal|Lieutenant Colonel|Colonel|Brigadier)\s+/, '').split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 3); }
  function paras(arr, cls) { return (arr || []).map(function (p) { return '<p class="' + (cls || 'body-text') + '">' + esc(p) + '</p>'; }).join(''); }

  // A photo frame: shows a quiet placeholder until (or unless) the image loads.
  function frame(src, cls, label, attrs) {
    return '<div class="frame ' + (cls || '') + '" data-label="' + esc(label || '') + '"' + (attrs || '') + '>' +
      (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async" />' : '') + '</div>';
  }
  function zoomAttrs(listKey, i) { return ' data-act="zoom" data-arg="' + listKey + ':' + i + '"'; }

  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7Z" fill="currentColor" stroke="none"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M15 6 9 12l6 6"/></svg>',
    zoom: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5M11 8.5v5M8.5 11h5"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8Z"/></svg>',
    plane: '<svg viewBox="0 0 24 24"><path d="M21 15.5v-1.8l-7.5-4.5V4.5a1.5 1.5 0 0 0-3 0v4.7L3 13.7v1.8l7.5-2.2v4.4l-2 1.5v1.3l3.5-1 3.5 1v-1.3l-2-1.5v-4.4Z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'
  };

  // ============================================================
  // Stage scaling
  // ============================================================
  function scaleStage() {
    var s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    state.scale = s;
    el.stage.style.transform = 'scale(' + s + ')';
  }

  // ============================================================
  // Touch scrolling: drag with momentum on any [data-scroll] element.
  // Works the same for finger and mouse; a drag never counts as a tap.
  // ============================================================
  function initScrollers(root) {
    root.querySelectorAll('[data-scroll]').forEach(function (node) { makeScroller(node, node.getAttribute('data-scroll')); });
  }
  function makeScroller(node, axis) {
    if (node._scroller) return;
    node._scroller = true;
    var s = { down: false, moved: false, start: 0, last: 0, lastT: 0, v: 0, pid: null, raf: 0 };
    function pos(e) { return axis === 'x' ? e.clientX : e.clientY; }
    function get() { return axis === 'x' ? node.scrollLeft : node.scrollTop; }
    function set(v) { if (axis === 'x') node.scrollLeft = v; else node.scrollTop = v; }
    node.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      cancelAnimationFrame(s.raf); cancelAnimationFrame(node._glide || 0);
      s.down = true; s.moved = false; s.start = s.last = pos(e); s.lastT = performance.now(); s.v = 0; s.pid = e.pointerId;
    });
    node.addEventListener('pointermove', function (e) {
      if (!s.down || e.pointerId !== s.pid) return;
      var p = pos(e);
      if (!s.moved && Math.abs(p - s.start) > 10) {
        s.moved = true; node.classList.add('dragging');
        try { node.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      if (!s.moved) return;
      var d = (p - s.last) / state.scale, t = performance.now();
      set(get() - d);
      s.v = 0.75 * s.v + 0.25 * (d / Math.max(1, t - s.lastT));
      s.last = p; s.lastT = t;
    });
    function up() {
      if (!s.down) return;
      s.down = false;
      if (!s.moved) return;
      node._suppressClick = Date.now();
      node.classList.remove('dragging');
      var v = s.v * 16;
      (function step() {
        if (Math.abs(v) < 0.4) return;
        set(get() - v); v *= 0.94;
        s.raf = requestAnimationFrame(step);
      })();
    }
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('click', function (e) {
      if (node._suppressClick && Date.now() - node._suppressClick < 350) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    if (axis === 'x') {
      node.addEventListener('wheel', function (e) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { node.scrollLeft += e.deltaY; e.preventDefault(); }
      }, { passive: false });
    }
  }
  function glideTo(node, axis, target, ms) {
    cancelAnimationFrame(node._glide || 0);
    var from = axis === 'x' ? node.scrollLeft : node.scrollTop, t0 = performance.now();
    ms = ms || 600;
    (function step(now) {
      var k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      var v = from + (target - from) * e;
      if (axis === 'x') node.scrollLeft = v; else node.scrollTop = v;
      if (k < 1) node._glide = requestAnimationFrame(step);
    })(t0);
  }

  // ============================================================
  // Navigation
  // ============================================================
  function snapshot() {
    return { screen: state.screen, decade: state.decade, year: state.year, chief: state.chief, fleetTab: state.fleetTab, base: state.base, era: state.era, cmode: state.cmode, cval: state.cval, archive: state.archive };
  }
  function go(screen, patch) {
    if (screen !== state.screen || patch) state.hist.push(snapshot());
    Object.assign(state, patch || {});
    state.screen = screen;
    if (EXPLORE_KEYS.indexOf(screen) >= 0) state.visited[screen] = true;
    if (screen === 'chief') state.visited.chiefs = true;
    show();
  }
  function goBack() {
    if (state.screen === 'timeline' && state.year != null) { state.year = null; return show(); }
    if (state.screen === 'connect' && state.cval != null) { state.cval = null; return show(); }
    if (state.screen === 'connect' && state.cmode) { state.cmode = null; return show(); }
    var prev = state.hist.pop();
    if (!prev || prev.screen === 'attract') { state.hist = []; state.screen = 'home'; return show(); }
    Object.assign(state, prev);
    show();
  }
  function goHome() { state.hist = []; state.screen = 'home'; state.year = null; state.cmode = null; state.cval = null; show(); }

  function show() {
    var id = state.screen;
    Object.keys(el.screens).forEach(function (k) { el.screens[k].classList.toggle('active', k === id); });
    el.topbar.classList.toggle('hidden', id === 'attract');
    el.back.classList.toggle('invisible', id === 'home');
    lists = {};
    var r = RENDER[id];
    if (r) {
      el.screens[id].innerHTML = r();
      initScrollers(el.screens[id]);
      if (AFTER[id]) AFTER[id](el.screens[id]);
    }
    renderCrumb();
    if (id === 'attract') startAttract(); else stopAttract();
    if (id === 'home') startHomeFacts(); else stopHomeFacts();
  }

  function renderCrumb() {
    var parts = ['Our History'];
    var s = state.screen;
    if (SECTIONS[s]) parts.push(SECTIONS[s].title);
    if (s === 'timeline') { var d = C.decades[state.decade]; parts.push(d.from + '–' + d.to); if (state.year) parts.push(String(state.year)); }
    if (s === 'chief') { parts.push(SECTIONS.chiefs.title); parts.push(chiefByNo(state.chief).shortName); }
    if (s === 'fleet') parts.push(state.fleetTab === 'bases' ? 'Bases' : 'Aircraft');
    if (s === 'connect' && state.cmode) parts.push({ state: 'Your state', year: 'Your birth year', chief: 'A Chief you know' }[state.cmode]);
    el.crumb.innerHTML = parts.map(function (p, i) { return '<span class="crumb-part' + (i === parts.length - 1 ? ' crumb-part--last' : '') + '">' + esc(p) + '</span>'; }).join('<span class="crumb-sep">/</span>');
  }

  // ============================================================
  // Screens
  // ============================================================
  var RENDER = {}, AFTER = {};

  // ---------- Welcome (attract) ----------
  var attractFacts = C.events.filter(function (e) { return /\d{1,2} [A-Z][a-z]+ \d{4}/.test(e.date) || e.photos; });
  var attractPhotos = (function () {
    var pool = [];
    C.events.forEach(function (e) { if (e.photos && e.photos[0]) pool.push(e.photos[0]); });
    return shuffle(pool).slice(0, 14);
  })();
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function onThisDay() {
    var now = new Date(), key = now.getDate() + ' ' + MONTHS[now.getMonth()];
    return C.events.filter(function (e) { return e.date.indexOf(key + ' ') === 0; });
  }

  RENDER.attract = function () {
    var now = new Date(), years = now.getFullYear() - 1964;
    var lights = '';
    for (var i = 0; i < 26; i++) lights += '<span class="runway-light" style="animation-delay:' + (i * 0.09).toFixed(2) + 's"></span>';
    return '' +
      '<div class="attract" data-act="begin">' +
        '<div class="attract-slides" id="attract-slides">' +
          '<div class="attract-slide"></div><div class="attract-slide"></div>' +
        '</div>' +
        '<video class="attract-video" id="attract-video" muted loop playsinline autoplay src="' + esc(C.introFilm) + '"></video>' +
        '<div class="attract-shade"></div>' +

        '<header class="attract-bar">' +
          '<div class="attract-crests">' +
            '<img src="assets/icons/naf.png" alt="Nigerian Air Force" />' +
            '<span class="attract-crest-text"><b>Nigerian Air Force</b><span>Established 18 April 1964</span></span>' +
            '<span class="attract-crest-rule"></span>' +
            '<img src="assets/icons/afcsc.png" alt="Armed Forces Command and Staff College" />' +
            '<span class="attract-crest-text"><b>Armed Forces Command and Staff College</b><span>Jaji, Kaduna State</span></span>' +
          '</div>' +
          '<div class="attract-clock"><span id="attract-date"></span><span class="attract-time" id="attract-time"></span></div>' +
        '</header>' +

        '<div class="attract-hero">' +
          '<div class="attract-kicker">The Air Marshal S.K. Aneke</div>' +
          '<h1 class="attract-title">Hall of Fame</h1>' +
          '<p class="attract-lede">The story of the Nigerian Air Force: ' + years + ' years of the people, the aircraft and the moments that built it.</p>' +
          '<div class="attract-figures">' +
            figure(String(years), 'years of service') +
            figure(String(C.chiefs.length), 'Commanders &amp; Chiefs') +
            figure(String(C.events.length), 'recorded moments') +
            figure(String(C.bases.length), 'bases on the map') +
          '</div>' +
        '</div>' +

        '<aside class="attract-card" id="attract-card"></aside>' +

        '<div class="attract-begin">' +
          '<div class="runway">' + lights + '</div>' +
          '<div class="attract-begin-label"><span>Touch anywhere to begin</span>' + ICON.next + '</div>' +
        '</div>' +
      '</div>';
  };
  function figure(n, label) { return '<div class="figure"><span class="figure-n">' + n + '</span><span class="figure-l">' + label + '</span></div>'; }
  AFTER.attract = function (root) {
    var v = root.querySelector('#attract-video');
    v.addEventListener('error', function () { v.classList.add('hidden'); });
    v.addEventListener('playing', function () { root.querySelector('.attract').classList.add('has-video'); });
    var p = v.play(); if (p && p.catch) p.catch(function () {});
  };
  var attractIdx = 0;
  function startAttract() {
    stopAttract();
    attractIdx = 0;
    stepAttract();
    attractTimer = setInterval(stepAttract, ATTRACT_SLIDE_MS);
  }
  function stopAttract() {
    clearInterval(attractTimer); attractTimer = null;
    var v = $('attract-video');
    if (v && state.screen !== 'attract') v.pause();
  }
  function stepAttract() {
    var slides = document.querySelectorAll('#attract-slides .attract-slide');
    if (slides.length === 2 && attractPhotos.length) {
      var incoming = slides[attractIdx % 2], outgoing = slides[(attractIdx + 1) % 2];
      incoming.style.backgroundImage = 'url("' + attractPhotos[attractIdx % attractPhotos.length] + '")';
      incoming.classList.remove('on'); void incoming.offsetWidth; incoming.classList.add('on');
      outgoing.classList.remove('on');
    }
    var now = new Date();
    var dEl = $('attract-date'), tEl = $('attract-time');
    if (dEl) dEl.textContent = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()] + ', ' + now.getDate() + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear();
    if (tEl) tEl.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var card = $('attract-card');
    if (card) {
      var today = onThisDay();
      var e = today.length && attractIdx % 3 === 0 ? today[(attractIdx / 3) % today.length] : attractFacts[Math.floor(Math.random() * attractFacts.length)];
      var label = today.indexOf(e) >= 0 ? 'On this day' : 'From the archive';
      var ph = e.photos && e.photos[0];
      card.classList.remove('on');
      setTimeout(function () {
        card.innerHTML = (ph ? frame(ph, 'attract-card-img') : '') +
          '<span class="attract-card-body"><span class="eyebrow">' + label + '</span>' +
          '<span class="attract-card-date">' + esc(e.date) + '</span>' +
          '<span class="attract-card-title">' + esc(e.title) + '</span></span>' +
          '<span class="attract-card-progress"></span>';
        card.classList.add('on');
      }, 450);
    }
    attractIdx++;
  }

  // ---------- Home ----------
  RENDER.home = function () {
    var nPhotos = ARCHIVE.length;
    var tiles = [
      { key: 'films', img: filmStill(filmById('intro')) || filmStill(C.films[1]), desc: plural(C.films.length, 'short film') + ', from the first cadets to sixty years of service. Most visitors start here.', feature: true },
      { key: 'timeline', img: firstPhoto(eventsInYear(1964)), desc: 'From 1961 to today: ' + C.events.length + ' recorded moments, year by year, on a timeline you sweep with your finger.' },
      { key: 'chiefs', img: chiefByNo(C.chiefs.length).photo, desc: (C.chiefs.length - 1) + ' commanders from 1963 to 2025, and the serving Chief who gives this hall its name.' },
      { key: 'college', img: C.chronicles.college.hero, desc: 'From the Army Command and Staff College of 1976 to the tri-service AFCSC: the home of this Hall of Fame.' },
      { key: 'daw', img: C.chronicles.daw.hero, desc: 'How airpower is taught to the commanders of Nigeria and her allies.' },
      { key: 'fleet', img: (C.aircraft[C.aircraft.length - 2] || {}).photo, desc: 'Tap a base on the map of Nigeria. Browse every aircraft that has worn the roundel.' },
      { key: 'connect', img: '', map: true, desc: 'Your state, your birth year, or a Chief you know. Every Nigerian has a place in this story.' },
      { key: 'archive', img: '', collage: true, desc: plural(nPhotos, 'photograph') + ' from the archive in one place. Tap any picture to see where it belongs.' }
    ];
    var nVisited = EXPLORE_KEYS.filter(function (k) { return state.visited[k]; }).length;
    var progress = nVisited === 0 ? EXPLORE_KEYS.length + ' stories to explore' : nVisited === EXPLORE_KEYS.length ? 'All ' + EXPLORE_KEYS.length + ' stories explored' : nVisited + ' of ' + EXPLORE_KEYS.length + ' stories explored';
    var collage = shuffle(ARCHIVE.filter(function (a) { return a.group === 'timeline'; })).slice(0, 6);

    return '' +
      '<div class="home">' +
        '<div class="home-intro">' +
          '<div class="eyebrow">' + esc(C.meta.kicker) + '</div>' +
          '<h1 class="home-title">Air Marshal S.K. Aneke<br/>Hall of Fame</h1>' +
          '<div class="home-sub">' + esc(C.meta.subtitle) + '</div>' +
          '<p class="home-tagline">' + esc(C.meta.tagline) + '</p>' +
          '<div class="home-stats">' +
            stat('1964', 'Established') + stat(String(C.chiefs.length), 'Commanders & Chiefs') + stat(String(C.events.length), 'Recorded moments') + stat(String(C.aircraft.length), 'Aircraft types') +
          '</div>' +
          '<div class="home-fact" id="home-fact"></div>' +
          '<div class="home-progress">' +
            '<div class="home-progress-dots">' + EXPLORE_KEYS.map(function (k) { return '<span class="dot' + (state.visited[k] ? ' dot--on' : '') + '"></span>'; }).join('') + '</div>' +
            '<span>' + esc(progress) + '</span>' +
          '</div>' +
        '</div>' +
        '<nav class="home-grid">' + tiles.map(function (t, i) {
          var s = SECTIONS[t.key];
          var visited = t.key === 'films' ? (Object.keys(state.watched).length ? Object.keys(state.watched).length + ' of ' + C.films.length + ' watched' : '') : (state.visited[t.key] ? 'Visited' : '');
          var media = t.map ? '<div class="tile-map">' + nigeriaSvg([], null, true) + '</div>'
            : t.collage ? '<div class="tile-collage">' + collage.map(function (a) { return frame(a.src, 'tile-collage-cell'); }).join('') + '</div>'
            : frame(t.img, 'tile-img');
          return '<button class="tile' + (t.feature ? ' tile--feature' : '') + '" data-act="go" data-arg="' + t.key + '" style="animation-delay:' + (i * 60) + 'ms">' +
            media + '<span class="tile-shade"></span>' +
            (t.feature ? '<span class="tile-play">' + ICON.play + '</span>' : '') +
            '<span class="tile-body">' +
              '<span class="tile-num">' + esc(s.num) + '</span>' +
              '<span class="tile-title">' + esc(s.title) + '</span>' +
              '<span class="tile-desc">' + esc(t.desc) + '</span>' +
            '</span>' +
            (visited ? '<span class="tile-visited">' + ICON.check + esc(visited) + '</span>' : '') +
          '</button>';
        }).join('') + '</nav>' +
      '</div>';
  };
  function stat(n, label) { return '<div class="stat"><span class="stat-n">' + esc(n) + '</span><span class="stat-l">' + esc(label) + '</span></div>'; }

  function startHomeFacts() {
    stopHomeFacts();
    var pool = shuffle(C.events.filter(function (e) { return e.photos && e.photos.length; }));
    var i = 0;
    function step() {
      var node = $('home-fact'); if (!node) return;
      var e = pool[i++ % pool.length];
      node.classList.remove('on');
      setTimeout(function () {
        node.innerHTML = '<button class="home-fact-btn" data-act="year" data-arg="' + e.year + '">' +
          frame(e.photos[0], 'home-fact-img') +
          '<span class="home-fact-text"><span class="eyebrow">From the archive · ' + esc(e.date) + '</span><span class="home-fact-title">' + esc(e.title) + '</span><span class="home-fact-cta">Read the story ' + ICON.next + '</span></span>' +
        '</button>';
        node.classList.add('on');
      }, 400);
    }
    step();
    homeFactTimer = setInterval(step, HOME_FACT_MS);
  }
  function stopHomeFacts() { clearInterval(homeFactTimer); homeFactTimer = null; }

  // ---------- History of the NAF: decades, ruler and years ----------
  RENDER.timeline = function () {
    var d = C.decades[state.decade];
    var chips = C.decades.map(function (dd, i) {
      return '<button class="decade-chip' + (i === state.decade ? ' is-on' : '') + '" data-act="decade" data-arg="' + i + '">' +
        '<span class="decade-chip-range">' + dd.from + ' – ' + dd.to + '</span><span class="decade-chip-title">' + esc(dd.title) + '</span></button>';
    }).join('');

    var ruler = '';
    for (var y = YEAR_FIRST; y <= YEAR_LAST; y++) {
      var n = countsByYear[y] || 0, di = decadeOf(y);
      var cls = 'ruler-year' + (n ? ' has-events' : '') + (state.year === y ? ' is-on' : '') + (di === state.decade ? ' in-decade' : '');
      ruler += '<button class="' + cls + '"' + (n ? ' data-act="year" data-arg="' + y + '"' : '') + ' style="width:' + YEAR_W + 'px">' +
        (C.decades[di] && C.decades[di].from === y ? '<span class="ruler-decade">' + esc(C.decades[di].title) + '</span>' : '') +
        '<span class="ruler-label">' + y + '</span>' +
        '<span class="ruler-dot" style="--n:' + Math.min(n, 8) + '"></span>' +
        (n ? '<span class="ruler-count">' + plural(n, 'moment') + '</span>' : '') +
      '</button>';
    }

    var body = state.year == null ? timelineDecadeBody(d) : timelineYearBody(state.year);
    return '' +
      '<div class="timeline">' +
        '<div class="timeline-head">' +
          '<div class="section-heading"><span class="section-num">I</span><h2 class="section-title">History of the Nigerian Air Force</h2></div>' +
          '<div class="decade-chips">' + chips + '</div>' +
        '</div>' +
        '<div class="ruler-wrap">' +
          '<div class="ruler" data-scroll="x" id="ruler"><div class="ruler-track" style="padding:0 ' + (STAGE_W / 2 - YEAR_W / 2) + 'px">' + ruler + '</div></div>' +
          '<div class="ruler-hint">Sweep to travel · Tap a year</div>' +
        '</div>' +
        '<div class="timeline-body">' + body + '</div>' +
      '</div>';
  };

  function timelineDecadeBody(d) {
    var years = eventYears.filter(function (y) { return y >= d.from && y <= d.to; });
    var evs = C.events.filter(function (e) { return e.year >= d.from && e.year <= d.to; });
    var hero = firstPhoto(evs);
    var films = C.films.filter(function (f) { return f.year && f.year >= d.from && f.year <= d.to; });
    return '' +
      '<div class="decade">' +
        '<div class="decade-left">' +
          frame(hero, 'decade-hero', 'Photograph of the decade') +
          (films.length ? '<div class="decade-films">' + films.map(filmButton).join('') + '</div>' : '') +
        '</div>' +
        '<div class="decade-right">' +
          '<div class="eyebrow">' + d.from + ' – ' + d.to + ' · ' + plural(evs.length, 'recorded moment') + ' in ' + plural(years.length, 'year') + '</div>' +
          '<h3 class="decade-title">' + esc(d.title) + '</h3>' +
          '<p class="decade-summary">' + esc(d.summary) + '</p>' +
          '<div class="year-cards" data-scroll="y">' + years.map(function (y) {
            var first = eventsInYear(y)[0];
            return '<button class="year-card" data-act="year" data-arg="' + y + '">' +
              '<span class="year-card-y">' + y + '</span>' +
              '<span class="year-card-t">' + esc(first.title) + '</span>' +
              '<span class="year-card-n">' + plural(countsByYear[y], 'moment') + ICON.next + '</span>' +
            '</button>';
          }).join('') + '</div>' +
        '</div>' +
      '</div>';
  }

  function timelineYearBody(y) {
    var evs = eventsInYear(y);
    var cas = casFor(y);
    var idx = eventYears.indexOf(y);
    var prevY = idx > 0 ? eventYears[idx - 1] : null, nextY = idx < eventYears.length - 1 ? eventYears[idx + 1] : null;

    var key = 'year-' + y;
    lists[key] = [];
    evs.forEach(function (e) {
      (e.photos || []).forEach(function (p, i) { lists[key].push({ src: p, date: e.date, title: e.title, text: i === 0 ? (e.caption || '') : '' }); });
    });

    var casCard = cas
      ? '<button class="cas-card" data-act="chief" data-arg="' + cas.no + '">' + frame(cas.photo, 'cas-photo', initials(cas.name)) +
          '<span class="cas-text"><span class="eyebrow">Chief of the Air Staff in ' + y + '</span><span class="cas-name">' + esc(cas.name) + '</span><span class="cas-sub">' + esc(chiefLabel(cas)) + ' · tap for his story</span></span></button>'
      : '<div class="cas-card cas-card--none"><span class="cas-text"><span class="eyebrow">Before the first commander</span><span class="cas-name">The Air Force did not yet exist</span><span class="cas-sub">Formally established 18 April 1964</span></span></div>';

    var photoI = 0;
    var cards = evs.map(function (e) {
      var f = e.film ? filmById(e.film) : null;
      var ph = e.photos || [];
      var startI = photoI; photoI += ph.length;
      return '<article class="event">' +
        '<div class="event-media">' +
          (ph.length ? '<button class="event-photo"' + zoomAttrs(key, startI) + '>' + frame(ph[0], 'event-frame', 'Photograph') + '<span class="zoom-badge">' + ICON.zoom + '</span></button>'
                     : '<div class="event-photo event-photo--none">' + frame('', 'event-frame', 'No photograph in the archive yet') + '</div>') +
          (ph.length > 1 ? '<div class="event-thumbs">' + ph.slice(1, 6).map(function (p, j) {
            var more = j === 4 && ph.length > 6 ? '<span class="thumb-more">+' + (ph.length - 6) + '</span>' : '';
            return '<button class="event-thumb"' + zoomAttrs(key, startI + j + 1) + '>' + frame(p, 'thumb-frame') + more + '</button>';
          }).join('') + '</div>' : '') +
          (e.caption ? '<div class="event-caption">' + esc(e.caption) + '</div>' : '') +
        '</div>' +
        '<div class="event-text">' +
          '<div class="eyebrow">' + esc(e.date) + (e.state ? ' · ' + esc(e.state) : '') + '</div>' +
          '<h4 class="event-title">' + esc(e.title) + '</h4>' +
          paras(e.text) +
          (f ? '<button class="watch-btn" data-act="film" data-arg="' + f.id + '">' + ICON.play + '<span>Watch: ' + esc(f.title) + '</span></button>' : '') +
        '</div>' +
      '</article>';
    }).join('');

    return '' +
      '<div class="year">' +
        '<div class="year-left">' +
          '<div class="year-big">' + y + '</div>' +
          '<div class="eyebrow">' + esc(C.decades[decadeOf(y)].title) + ' · ' + plural(evs.length, 'moment') + '</div>' +
          casCard +
          '<div class="year-nav">' +
            '<button class="ghost-btn' + (prevY ? '' : ' is-off') + '" data-act="year" data-arg="' + (prevY || '') + '">' + ICON.prev + (prevY || '') + '</button>' +
            '<button class="ghost-btn" data-act="year-clear">All of ' + C.decades[decadeOf(y)].from + '–' + C.decades[decadeOf(y)].to + '</button>' +
            '<button class="ghost-btn' + (nextY ? '' : ' is-off') + '" data-act="year" data-arg="' + (nextY || '') + '">' + (nextY || '') + ICON.next + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="year-events" data-scroll="y">' + cards + '</div>' +
      '</div>';
  }

  AFTER.timeline = function (root) {
    var r = root.querySelector('#ruler');
    r.scrollLeft = state.rulerX;
    r.addEventListener('scroll', function () { state.rulerX = r.scrollLeft; });
    var target = state.year != null ? state.year : C.decades[state.decade].from + 4;
    glideTo(r, 'x', (target - YEAR_FIRST) * YEAR_W, 700);
  };

  function filmButton(f) {
    return '<button class="film-chip' + (filmSoon(f) ? ' is-soon' : '') + '" data-act="film" data-arg="' + f.id + '">' + frame(filmStill(f), 'film-chip-img') +
      '<span class="film-chip-play">' + ICON.play + '</span>' +
      '<span class="film-chip-text"><span class="eyebrow">' + (filmSoon(f) ? 'Film coming soon' : esc(f.subtitle)) + '</span><span class="film-chip-title">' + esc(f.title) + '</span></span></button>';
  }

  // ---------- Films ----------
  RENDER.films = function () {
    return '' +
      '<div class="films">' +
        '<div class="section-head">' +
          '<div class="section-heading"><span class="section-num">Films</span><h2 class="section-title">Watch the story</h2></div>' +
          '<p class="section-intro">Short films from the archive. Tap any film to play it full screen; every film ends with a path into the written history.' +
            (C.films.some(filmSoon) ? ' Films marked “Coming soon” are being added to the Hall of Fame.' : '') + '</p>' +
        '</div>' +
        '<div class="film-grid">' + C.films.map(function (f, i) {
          var soon = filmSoon(f);
          return '<button class="film-card' + (i === 0 ? ' film-card--lead' : '') + (soon ? ' is-soon' : '') + '" data-act="film" data-arg="' + f.id + '">' +
            '<span class="film-card-media">' + frame(filmStill(f), 'film-card-img') + '<span class="film-card-play">' + ICON.play + '</span>' +
              (soon ? '<span class="soon-badge">Coming soon</span>' : '') +
              (state.watched[f.id] ? '<span class="tile-visited">' + ICON.check + 'Watched</span>' : '') + '</span>' +
            '<span class="film-card-body"><span class="eyebrow">' + esc(f.subtitle) + (f.duration ? ' · ' + esc(f.duration) : '') + '</span>' +
              '<span class="film-card-title">' + esc(f.title) + '</span>' +
              '<span class="film-card-desc">' + esc(f.description) + '</span></span>' +
          '</button>';
        }).join('') + '</div>' +
      '</div>';
  };

  // ---------- Chiefs of the Air Staff ----------
  var LINEAGE_FROM = 1963, LINEAGE_TO = 2027;
  RENDER.chiefs = function () {
    var span = LINEAGE_TO - LINEAGE_FROM, W = 1760;
    function x(iso) { var d = parseISO(iso); return ((d.getFullYear() + d.getMonth() / 12 + d.getDate() / 365) - LINEAGE_FROM) / span * W; }
    var segs = C.chiefs.map(function (c, i) {
      var a = x(c.from), b = c.to ? x(c.to) : x(new Date().toISOString().slice(0, 10));
      var w = Math.max(6, b - a);
      return '<button class="lineage-seg' + (i % 2 ? ' alt' : '') + (c.serving ? ' serving' : '') + '" data-act="chief" data-arg="' + c.no + '" style="left:' + a.toFixed(1) + 'px;width:' + w.toFixed(1) + 'px" title="' + esc(c.shortName) + '">' +
        (w > 30 ? '<span>' + c.no + '</span>' : '') + '</button>';
    }).join('');
    var ticks = '';
    for (var y = 1965; y <= 2025; y += 5) ticks += '<span class="lineage-tick' + (y % 10 === 0 ? ' major' : '') + '" style="left:' + ((y - LINEAGE_FROM) / span * W).toFixed(1) + 'px">' + (y % 10 === 0 ? y : '') + '</span>';

    var aneke = filmById('lineage');
    return '' +
      '<div class="chiefs">' +
        '<div class="section-head section-head--row">' +
          '<div>' +
            '<div class="section-heading"><span class="section-num">II</span><h2 class="section-title">Past Chiefs of the Air Staff</h2></div>' +
            '<p class="section-intro">Twenty-two commanders from 1963 to 2025, and the serving Chief. Each band below is one tenure, drawn to scale. Sweep the gallery to travel through time; tap a Chief to learn his story.</p>' +
          '</div>' +
          (aneke ? filmButton(aneke) : '') +
        '</div>' +
        '<div class="lineage"><div class="lineage-bar">' + segs + '</div><div class="lineage-axis">' + ticks + '</div></div>' +
        '<div class="chief-strip" data-scroll="x" id="chief-strip"><div class="chief-strip-track">' +
          C.chiefs.map(function (c) {
            return '<button class="chief-card' + (c.serving ? ' chief-card--serving' : '') + '" data-act="chief" data-arg="' + c.no + '">' +
              frame(c.photo, 'chief-card-photo', initials(c.name)) +
              '<span class="chief-card-no">' + (c.serving ? 'Serving' : ordinal(c.no)) + '</span>' +
              '<span class="chief-card-body">' +
                '<span class="chief-card-name">' + esc(c.shortName) + '</span>' +
                '<span class="chief-card-years">' + chiefYears(c) + '</span>' +
                '<span class="chief-card-tenure">' + esc(tenure(c)) + '</span>' +
              '</span>' +
            '</button>';
          }).join('') +
        '</div></div>' +
      '</div>';
  };
  AFTER.chiefs = function (root) {
    var strip = root.querySelector('#chief-strip');
    if (state.chiefStripX) strip.scrollLeft = state.chiefStripX;
    strip.addEventListener('scroll', function () { state.chiefStripX = strip.scrollLeft; });
  };

  RENDER.chief = function () {
    var c = chiefByNo(state.chief);
    var i = C.chiefs.indexOf(c);
    var prev = C.chiefs[i - 1], next = C.chiefs[i + 1];
    var a = +yr(c.from), b = c.to ? +yr(c.to) : new Date().getFullYear();
    var evs = C.events.filter(function (e) { return e.year >= a && e.year <= b; });
    lists.chief = [{ src: c.photo, date: chiefLabel(c), title: c.name, text: chiefYears(c) }];
    var meta = [['Rank', c.rank], ['In office', fmtDate(c.from) + ' – ' + fmtDate(c.to)], ['Time in office', tenure(c)]];
    if (c.born) meta.push(['Born', c.born]);
    if (c.died) meta.push(['Died', c.died]);
    if (c.state) meta.push(['State of origin', c.state]);
    return '' +
      '<div class="chief">' +
        '<div class="chief-left">' +
          '<button class="chief-portrait"' + zoomAttrs('chief', 0) + '>' + frame(c.photo, 'chief-portrait-frame', initials(c.name)) + '</button>' +
          '<div class="chief-ordinal">' + esc(chiefLabel(c)) + '</div>' +
          '<div class="chief-pager">' +
            '<button class="round-btn' + (prev ? '' : ' is-off') + '" data-act="chief" data-arg="' + (prev ? prev.no : '') + '" aria-label="Previous Chief">' + ICON.prev + '</button>' +
            '<span>' + (i + 1) + ' of ' + C.chiefs.length + '</span>' +
            '<button class="round-btn' + (next ? '' : ' is-off') + '" data-act="chief" data-arg="' + (next ? next.no : '') + '" aria-label="Next Chief">' + ICON.next + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="chief-right" data-scroll="y">' +
          '<div class="eyebrow">' + esc(c.rank) + '</div>' +
          '<h2 class="chief-name">' + esc(c.name) + '</h2>' +
          '<div class="chief-meta">' + meta.map(function (m) { return '<div class="meta"><span class="meta-k">' + esc(m[0]) + '</span><span class="meta-v">' + esc(m[1]) + '</span></div>'; }).join('') + '</div>' +
          paras(c.bio, 'body-text body-text--lead') +
          (c.achievements && c.achievements.length ? '<h3 class="sub-head">Notable in office</h3><ul class="ach">' + c.achievements.map(function (x) { return '<li>' + ICON.star + '<span>' + esc(x) + '</span></li>'; }).join('') + '</ul>' : '') +
          (evs.length ? '<h3 class="sub-head">What happened under his command</h3><div class="mini-events">' + evs.map(miniEvent).join('') + '</div>' : '') +
          (c.sources && c.sources.length ? '<div class="sources">Sources: ' + c.sources.map(esc).join(' · ') + '</div>' : '') +
        '</div>' +
      '</div>';
  };
  function miniEvent(e) {
    return '<button class="mini-event" data-act="year" data-arg="' + e.year + '">' +
      '<span class="mini-event-y">' + e.year + '</span>' +
      '<span class="mini-event-body"><span class="mini-event-d">' + esc(e.date) + '</span><span class="mini-event-t">' + esc(e.title) + '</span></span>' +
      ICON.next + '</button>';
  }

  // ---------- Chronicles: the College and the Department of Air Warfare ----------
  function renderChronicle(key, num) {
    var ch = C.chronicles[key];
    var f = C.films.filter(function (x) { return x.section === 'college'; })[0];
    var lk = 'chron-' + key;
    lists[lk] = [];
    if (ch.hero) lists[lk].push({ src: ch.hero, date: ch.eyebrow, title: ch.heroCaption || ch.title, text: '' });
    var items = ch.items.map(function (it, idx) {
      var start = lists[lk].length;
      (it.photos || []).forEach(function (p, j) { lists[lk].push({ src: p, date: it.date, title: it.title, text: j === 0 ? (it.caption || '') : '' }); });
      var ph = it.photos || [];
      return '<article class="chron-item' + (idx % 2 ? ' alt' : '') + '">' +
        '<span class="chron-node"></span>' +
        '<div class="chron-date">' + esc(it.date) + '</div>' +
        '<div class="chron-card">' +
          (ph.length ? '<button class="chron-photo"' + zoomAttrs(lk, start) + '>' + frame(ph[0], 'chron-frame', 'Photograph') + '<span class="zoom-badge">' + ICON.zoom + '</span></button>' : '') +
          '<div class="chron-text">' +
            '<h4 class="chron-title">' + esc(it.title) + '</h4>' + paras(it.text) +
            (ph.length > 1 ? '<div class="event-thumbs">' + ph.slice(1).map(function (p, j) { return '<button class="event-thumb"' + zoomAttrs(lk, start + j + 1) + '>' + frame(p, 'thumb-frame') + '</button>'; }).join('') + '</div>' : '') +
            (it.caption ? '<div class="event-caption">' + esc(it.caption) + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
    return '' +
      '<div class="chron">' +
        '<div class="chron-left">' +
          '<div class="section-heading"><span class="section-num">' + num + '</span></div>' +
          '<div class="eyebrow">' + esc(ch.eyebrow) + '</div>' +
          '<h2 class="chron-heading">' + esc(ch.title) + '</h2>' +
          '<p class="section-intro">' + esc(ch.intro) + '</p>' +
          (ch.hero ? '<button class="chron-hero"' + zoomAttrs(lk, 0) + '>' + frame(ch.hero, 'chron-hero-frame') + '<span class="chron-hero-cap">' + esc(ch.heroCaption || '') + '</span></button>' : '') +
          '<div class="chron-foot">' +
            '<span class="chron-count">' + plural(ch.items.length, 'milestone') + ' · ' + esc(ch.items[0].date) + ' – ' + esc(ch.items[ch.items.length - 1].date) + '</span>' +
            (f ? filmButton(f) : '') +
          '</div>' +
          '<button class="ghost-btn chron-switch" data-act="go" data-arg="' + (key === 'college' ? 'daw' : 'college') + '">' + (key === 'college' ? 'Continue: the Department of Air Warfare' : 'Back to the history of the College') + ICON.next + '</button>' +
        '</div>' +
        '<div class="chron-right" data-scroll="y"><div class="chron-spine"></div>' + items + '<div class="chron-end">' + ICON.plane + '</div></div>' +
      '</div>';
  }
  RENDER.college = function () { return renderChronicle('college', 'III'); };
  RENDER.daw = function () { return renderChronicle('daw', 'IV'); };

  // ---------- Fleet & Bases ----------
  function project(lon, lat) { return [40 + (lon - 2.5) * 75, 40 + (13.95 - lat) * 75]; }
  function nigeriaSvg(bases, sel, decorative) {
    var d = 'M' + C.nigeriaOutline.map(function (p) { var q = project(p[0], p[1]); return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join('L') + 'Z';
    var marks = (decorative ? C.bases : bases).map(function (b) {
      var q = project(b.lon, b.lat), on = b.id === sel;
      if (decorative) return '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="9" class="map-dot"/>';
      var lx = q[0] + (b.labelDx != null ? b.labelDx : 16), ly = q[1] + (b.labelDy != null ? b.labelDy : 7);
      return '<g class="map-base' + (on ? ' is-on' : '') + '" data-act="base" data-arg="' + b.id + '">' +
        (on ? '<circle class="map-ring" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="24"/>' : '') +
        '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="34" fill="transparent"/>' +
        '<circle class="map-pin" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + (on ? 12 : 8) + '"/>' +
        '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '">' + esc(b.city) + '</text></g>';
    }).join('');
    return '<svg class="nigeria" viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid meet"><path class="map-land" d="' + d + '"/>' + marks + '</svg>';
  }

  RENDER.fleet = function () {
    var tabs = '<div class="tabs">' +
      '<button class="tab' + (state.fleetTab === 'bases' ? ' is-on' : '') + '" data-act="fleet-tab" data-arg="bases">' + ICON.pin + 'Bases</button>' +
      '<button class="tab' + (state.fleetTab === 'aircraft' ? ' is-on' : '') + '" data-act="fleet-tab" data-arg="aircraft">' + ICON.plane + 'Aircraft</button></div>';
    var head = '<div class="section-head section-head--row">' +
      '<div><div class="section-heading"><span class="section-num">V</span><h2 class="section-title">Fleet &amp; Bases</h2></div>' +
      '<p class="section-intro">Tap a base on the map of Nigeria, or browse the aircraft that have worn the green-and-white roundel. Six Commands: Tactical Air (Makurdi), Special Operations (Bauchi), Mobility (Yenagoa), Air Training (Kaduna), Ground Training (Enugu) and Logistics (Lagos).</p></div>' +
      tabs + '</div>';
    return '<div class="fleet">' + head + (state.fleetTab === 'bases' ? fleetBases() : fleetAircraft()) + '</div>';
  };
  function fleetBases() {
    var b = baseById(state.base);
    lists.base = [{ src: b.photo, date: b.city + ' · ' + b.state, title: b.role, text: b.caption || '' }];
    return '' +
      '<div class="bases">' +
        '<div class="bases-left">' +
          '<div class="map-wrap">' + nigeriaSvg(C.bases, b.id) + '</div>' +
          '<div class="base-chips" data-scroll="x"><div class="base-chips-track">' + C.bases.map(function (x) {
            return '<button class="chip' + (x.id === b.id ? ' is-on' : '') + '" data-act="base" data-arg="' + x.id + '">' + esc(x.city) + '</button>';
          }).join('') + '</div></div>' +
        '</div>' +
        '<div class="base-panel" data-scroll="y" id="base-panel">' +
          (b.photo ? '<button class="base-photo"' + zoomAttrs('base', 0) + '>' + frame(b.photo, 'base-frame', b.city) + '<span class="zoom-badge">' + ICON.zoom + '</span></button>' : frame('', 'base-frame', b.city)) +
          (b.caption ? '<div class="event-caption">' + esc(b.caption) + '</div>' : '') +
          '<div class="eyebrow">' + ICON.pin + esc(b.state) + '</div>' +
          '<h3 class="base-city">' + esc(b.city) + '</h3>' +
          '<div class="base-role">' + esc(b.role) + '</div>' +
          paras(b.text) +
        '</div>' +
      '</div>';
  }
  function eraOf(a) { var m = String(a.inService).match(/\d{4}/); return m ? +m[0] : 0; }
  function fleetAircraft() {
    var era = ERAS.filter(function (e) { return e.key === state.era; })[0] || ERAS[0];
    var list = C.aircraft.filter(function (a) { var y = eraOf(a); return y >= era.from && y <= era.to; });
    lists.aircraft = list.map(function (a) { return { src: a.photo, date: 'In service from ' + a.inService + ' · ' + a.origin + ' · ' + a.role, title: a.name, text: a.note + (a.caption ? '\n\n' + a.caption : '') }; });
    return '' +
      '<div class="aircraft">' +
        '<div class="era-chips">' + ERAS.map(function (e) {
          var n = C.aircraft.filter(function (a) { var y = eraOf(a); return y >= e.from && y <= e.to; }).length;
          return '<button class="chip' + (e.key === era.key ? ' is-on' : '') + '" data-act="era" data-arg="' + e.key + '">' + esc(e.label) + ' <span class="chip-n">' + n + '</span></button>';
        }).join('') + '</div>' +
        '<div class="aircraft-grid" data-scroll="y">' + list.map(function (a, i) {
          return '<button class="aircraft-card"' + zoomAttrs('aircraft', i) + '>' +
            frame(a.photo, 'aircraft-img', a.name) +
            '<span class="aircraft-year">' + esc(a.inService) + '</span>' +
            '<span class="aircraft-body"><span class="aircraft-name">' + esc(a.name) + '</span>' +
            '<span class="aircraft-role">' + esc(a.role) + ' · ' + esc(a.origin) + '</span>' +
            '<span class="aircraft-note">' + esc(a.note) + '</span></span>' +
          '</button>';
        }).join('') + '</div>' +
      '</div>';
  }

  // ---------- Find your connection ----------
  RENDER.connect = function () {
    var head = '<div class="section-heading"><span class="section-num">VI</span><h2 class="section-title">Find your connection</h2></div>';
    if (!state.cmode) {
      var tiles = [
        { mode: 'state', glyph: '36+1', title: 'Your state', desc: 'Pick the state you call home. See the Chiefs who came from there, the bases on its soil and the events that happened there.', cta: 'Choose a state' },
        { mode: 'year', glyph: '19xx', title: 'Your birth year', desc: 'Find out who commanded the Air Force the year you were born, and what it was doing.', cta: 'Choose a year' },
        { mode: 'chief', glyph: 'CAS', title: 'A Chief you know', desc: 'Choose a Chief of the Air Staff and see everything that happened under his command.', cta: 'Choose a Chief' }
      ];
      return '<div class="connect">' + head +
        '<p class="section-intro connect-intro">Every Nigerian has a place in this story. Start with something you know.</p>' +
        '<div class="connect-tiles">' + tiles.map(function (t, i) {
          return '<button class="connect-tile" data-act="cmode" data-arg="' + t.mode + '" style="animation-delay:' + (i * 80) + 'ms">' +
            '<span class="connect-glyph">' + esc(t.glyph) + '</span><span class="connect-title">' + esc(t.title) + '</span>' +
            '<span class="connect-desc">' + esc(t.desc) + '</span><span class="connect-cta">' + esc(t.cta) + ICON.next + '</span></button>';
        }).join('') + '</div></div>';
    }
    if (state.cval == null) return '<div class="connect">' + head + connectPicker() + '</div>';
    return '<div class="connect">' + connectResult() + '</div>';
  };

  function stateCounts(st) {
    return {
      chiefs: C.chiefs.filter(function (c) { return c.state === st; }).length,
      bases: C.bases.filter(function (b) { return b.state === st; }).length,
      events: C.events.filter(function (e) { return e.state === st; }).length
    };
  }
  function connectPicker() {
    if (state.cmode === 'state') {
      return '<div class="pick-head"><h3 class="pick-title">Which state do you call home?</h3><p class="section-intro">All 36 states and the Federal Capital Territory. A gold mark means the archive already holds something from there.</p></div>' +
        '<div class="state-grid">' + C.states.map(function (st) {
          var n = stateCounts(st), any = n.chiefs + n.bases + n.events;
          return '<button class="state-btn' + (any ? ' has' : '') + '" data-act="cval" data-arg="' + esc(st) + '"><span>' + esc(st) + '</span>' + (any ? '<span class="state-n">' + any + '</span>' : '') + '</button>';
        }).join('') + '</div>';
    }
    if (state.cmode === 'year') {
      var decs = []; for (var d = 1930; d <= 2020; d += 10) decs.push(d);
      var years = []; for (var y = state.cdecade; y < state.cdecade + 10 && y <= 2020; y++) years.push(y);
      return '<div class="pick-head"><h3 class="pick-title">Which year were you born?</h3><p class="section-intro">Choose the decade, then the year.</p></div>' +
        '<div class="decade-pick">' + decs.map(function (dd) { return '<button class="chip chip--lg' + (dd === state.cdecade ? ' is-on' : '') + '" data-act="cdecade" data-arg="' + dd + '">' + dd + 's</button>'; }).join('') + '</div>' +
        '<div class="year-pick">' + years.map(function (yy) { return '<button class="year-btn' + (countsByYear[yy] ? ' has' : '') + '" data-act="cval" data-arg="' + yy + '">' + yy + '</button>'; }).join('') + '</div>';
    }
    return '<div class="pick-head"><h3 class="pick-title">Which Chief of the Air Staff?</h3><p class="section-intro">Listed in order of service.</p></div>' +
      '<div class="chief-pick">' + C.chiefs.map(function (c) {
        return '<button class="chief-pick-btn" data-act="cval" data-arg="' + c.no + '">' + frame(c.photo, 'chief-pick-photo', initials(c.name)) +
          '<span class="chief-pick-text"><span class="chief-pick-name">' + esc(c.shortName) + '</span><span class="chief-pick-years">' + chiefYears(c) + '</span></span></button>';
      }).join('') + '</div>';
  }
  function connectResult() {
    var r = { chiefs: [], bases: [], events: [], eyebrow: '', title: '', sub: '', chiefsHead: '', eventsHead: '', empty: '' };
    if (state.cmode === 'state') {
      var st = state.cval;
      r.chiefs = C.chiefs.filter(function (c) { return c.state === st; });
      r.bases = C.bases.filter(function (b) { return b.state === st; });
      r.events = C.events.filter(function (e) { return e.state === st; });
      r.eyebrow = 'Your state';
      r.title = st + ' and the Nigerian Air Force';
      r.sub = [r.chiefs.length ? plural(r.chiefs.length, 'Chief of the Air Staff', 'Chiefs of the Air Staff') : 'No Chief of the Air Staff yet', r.bases.length ? plural(r.bases.length, 'base') : 'no base recorded', r.events.length ? plural(r.events.length, 'event') : 'no events recorded yet'].join(' · ');
      r.chiefsHead = 'Chiefs of the Air Staff from ' + st;
      r.eventsHead = 'Moments in ' + st;
      r.empty = 'The archive for ' + st + ' is still growing. The Nigerian Air Force welcomes photographs and records from your community.';
    } else if (state.cmode === 'year') {
      var y = +state.cval, c = casFor(y), diff = y - 1964;
      r.events = eventsInYear(y);
      r.eventsHead = 'What the Air Force was doing in ' + y;
      if (!r.events.length) { r.events = C.events.filter(function (e) { return Math.abs(e.year - y) <= 2; }); r.eventsHead = 'Closest recorded moments to ' + y; }
      r.eyebrow = 'Your birth year · ' + y;
      r.title = y < 1964 ? 'You were born ' + plural(1964 - y, 'year') + ' before the Air Force' : y === 1964 ? 'You and the Air Force were born the same year' : 'The Air Force was ' + plural(diff, 'year') + ' old when you were born';
      r.sub = c ? (c.serving ? 'Serving Chief of the Air Staff: ' : 'Commanding the Air Force that year: ') + c.name : (y < 1963 ? 'There was no Nigerian Air Force yet.' : '');
      r.chiefs = c ? [c] : [];
      r.chiefsHead = 'Who commanded the Air Force in ' + y;
      r.empty = 'Before 1961 there was no air force to record. Open the history timeline to begin in 1961.';
    } else {
      var ch = chiefByNo(+state.cval), a = +yr(ch.from), b = ch.to ? +yr(ch.to) : new Date().getFullYear();
      r.chiefs = [ch];
      r.events = C.events.filter(function (e) { return e.year >= a && e.year <= b; });
      r.eyebrow = chiefLabel(ch);
      r.title = 'Under the command of ' + ch.shortName;
      r.sub = chiefYears(ch) + ' · ' + tenure(ch);
      r.chiefsHead = 'Open his story';
      r.eventsHead = 'Moments during his tenure';
      r.empty = 'No recorded events during this tenure yet.';
    }
    var left = '';
    if (r.chiefs.length) left += '<h3 class="sub-head">' + esc(r.chiefsHead) + '</h3>' + r.chiefs.map(function (c) {
      return '<button class="cas-card" data-act="chief" data-arg="' + c.no + '">' + frame(c.photo, 'cas-photo', initials(c.name)) +
        '<span class="cas-text"><span class="eyebrow">' + esc(chiefLabel(c)) + '</span><span class="cas-name">' + esc(c.name) + '</span><span class="cas-sub">' + chiefYears(c) + ' · ' + esc(tenure(c)) + '</span></span></button>';
    }).join('');
    if (r.bases.length) left += '<h3 class="sub-head">Air Force presence</h3>' + r.bases.map(function (b) {
      return '<button class="base-row" data-act="base" data-arg="' + b.id + '">' + frame(b.photo, 'base-row-img', b.city) + '<span class="base-row-text"><span class="base-row-city">' + esc(b.city) + '</span><span class="base-row-role">' + esc(b.role) + '</span></span>' + ICON.next + '</button>';
    }).join('');
    if (!left) left = '<div class="connect-empty-left">' + nigeriaSvg([], null, true) + '</div>';
    return '' +
      '<div class="result-head">' +
        '<div><div class="eyebrow">' + esc(r.eyebrow) + '</div><h2 class="result-title">' + esc(r.title) + '</h2><div class="result-sub">' + esc(r.sub) + '</div></div>' +
        '<button class="ghost-btn" data-act="creset">Try another</button>' +
      '</div>' +
      '<div class="result-body">' +
        '<div class="result-left" data-scroll="y">' + left + '</div>' +
        '<div class="result-right" data-scroll="y"><h3 class="sub-head">' + esc(r.eventsHead) + '</h3>' +
          (r.events.length ? '<div class="mini-events">' + r.events.map(miniEvent).join('') + '</div>' : '<p class="body-text muted">' + esc(r.empty) + '</p>') +
        '</div>' +
      '</div>';
  }

  // ---------- Photo archive ----------
  RENDER.archive = function () {
    var items = state.archive === 'all' ? ARCHIVE : ARCHIVE.filter(function (a) { return a.group === state.archive; });
    lists.archive = items;
    return '' +
      '<div class="archive">' +
        '<div class="section-head section-head--row">' +
          '<div><div class="section-heading"><span class="section-num">VII</span><h2 class="section-title">Photo archive</h2></div>' +
          '<p class="section-intro">Every photograph in the Hall of Fame. Tap a picture to view it full screen, read its caption and jump to the story it belongs to.</p></div>' +
          '<div class="archive-count"><span class="stat-n">' + items.length + '</span><span class="stat-l">photographs</span></div>' +
        '</div>' +
        '<div class="era-chips">' + ARCHIVE_GROUPS.map(function (g) {
          var n = g.key === 'all' ? ARCHIVE.length : ARCHIVE.filter(function (a) { return a.group === g.key; }).length;
          return '<button class="chip' + (g.key === state.archive ? ' is-on' : '') + '" data-act="archive" data-arg="' + g.key + '">' + esc(g.label) + ' <span class="chip-n">' + n + '</span></button>';
        }).join('') + '</div>' +
        '<div class="archive-grid" data-scroll="y">' + items.map(function (a, i) {
          return '<button class="archive-cell"' + zoomAttrs('archive', i) + '>' + frame(a.src, 'archive-img') +
            (a.year ? '<span class="archive-year">' + a.year + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
      '</div>';
  };

  // ============================================================
  // Photo viewer
  // ============================================================
  function openLightbox(key, i) {
    var list = lists[key];
    if (!list || !list.length) return;
    lightbox.list = list.filter(function (x) { return x.src; });
    if (!lightbox.list.length) return;
    lightbox.i = Math.max(0, Math.min(lightbox.list.indexOf(list[i]), lightbox.list.length - 1));
    renderLightbox();
    el.lightbox.classList.remove('hidden');
  }
  function renderLightbox() {
    var it = lightbox.list[lightbox.i];
    var img = $('lightbox-img');
    img.classList.remove('missing');
    img.src = it.src;
    $('lightbox-date').textContent = it.date || '';
    $('lightbox-count').textContent = lightbox.list.length > 1 ? (lightbox.i + 1) + ' / ' + lightbox.list.length : '';
    $('lightbox-title').textContent = it.title || '';
    $('lightbox-text').innerHTML = paras(String(it.text || '').split(/\n\n+/).filter(Boolean), 'lightbox-p');
    $('lightbox-link').classList.toggle('hidden', !it.link);
    el.lightbox.querySelector('.lightbox-nav--prev').classList.toggle('is-off', lightbox.list.length < 2);
    el.lightbox.querySelector('.lightbox-nav--next').classList.toggle('is-off', lightbox.list.length < 2);
    var fig = $('lightbox-figure');
    fig.classList.remove('enter'); void fig.offsetWidth; fig.classList.add('enter');
  }
  function stepLightbox(d) {
    var n = lightbox.list.length; if (n < 2) return;
    lightbox.i = (lightbox.i + d + n) % n;
    renderLightbox();
  }
  function closeLightbox() { el.lightbox.classList.add('hidden'); }
  function initLightboxSwipe() {
    var fig = $('lightbox-figure'), sx = null;
    fig.addEventListener('pointerdown', function (e) { sx = e.clientX; });
    fig.addEventListener('pointerup', function (e) {
      if (sx == null) return;
      var dx = (e.clientX - sx) / state.scale; sx = null;
      if (Math.abs(dx) > 80) stepLightbox(dx < 0 ? 1 : -1);
    });
  }

  // ============================================================
  // Film player
  // ============================================================
  function openFilm(id) {
    var f = filmById(id); if (!f) return;
    film = f;
    var v = el.video;
    $('player-title').textContent = f.title;
    $('player-sub').textContent = f.subtitle || '';
    $('player-missing').classList.toggle('hidden', !filmSoon(f));
    $('player-missing-file').textContent = (f.year ? 'Meanwhile, read the story of ' + f.year + ' in the history of the Air Force.' : 'Meanwhile, explore the written history.');
    $('player-read').textContent = f.year ? 'Read the story of ' + f.year : f.section === 'chiefs' ? 'Meet the Chiefs' : f.section === 'college' ? 'Read about the College' : 'Explore the history';
    var nx = C.films[(C.films.indexOf(f) + 1) % C.films.length];
    $('player-next').innerHTML = 'Next: ' + esc(nx.title) + ICON.next;
    setPlayIcon(false);
    $('player-scrub-fill').style.width = '0%';
    $('player-time').textContent = '0:00 / 0:00';
    if (filmSoon(f)) v.removeAttribute('src'); else v.src = f.src;
    el.player.classList.toggle('is-soon', filmSoon(f));
    el.player.classList.remove('hidden');
    duckAmbient(true);
    if (!filmSoon(f)) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  }
  function closeFilm() {
    el.video.pause();
    el.video.removeAttribute('src'); el.video.load();
    el.player.classList.add('hidden');
    film = null;
    duckAmbient(false);
    if (state.screen === 'films') show();
  }
  function setPlayIcon(playing) { el.player.classList.toggle('is-playing', playing); }
  function mmss(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
  function initPlayer() {
    var v = el.video;
    v.addEventListener('play', function () { setPlayIcon(true); });
    v.addEventListener('pause', function () { setPlayIcon(false); });
    v.addEventListener('ended', function () { setPlayIcon(false); el.player.classList.add('is-ended'); });
    v.addEventListener('playing', function () { el.player.classList.remove('is-ended'); if (film) state.watched[film.id] = true; });
    v.addEventListener('timeupdate', function () {
      $('player-time').textContent = mmss(v.currentTime) + ' / ' + mmss(v.duration);
      $('player-scrub-fill').style.width = (v.duration ? v.currentTime / v.duration * 100 : 0) + '%';
    });
    v.addEventListener('error', function () { if (film && v.getAttribute('src')) { filmStatus[film.id] = 'missing'; el.player.classList.add('is-soon'); $('player-missing').classList.remove('hidden'); } });
    $('player-scrub').addEventListener('pointerdown', function (e) {
      if (!v.duration) return;
      var r = e.currentTarget.getBoundingClientRect();
      v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.duration;
    });
  }
  function filmRead() {
    var f = film; if (!f) return;
    closeFilm();
    if (f.year) selectYear(f.year);
    else if (f.section === 'chiefs') go('chiefs');
    else if (f.section === 'college') go('college');
    else go('timeline', { year: null });
  }

  // ============================================================
  // Timeline actions
  // ============================================================
  function selectYear(y) {
    y = +y; if (!y) return;
    var patch = { year: y, decade: decadeOf(y) };
    if (state.screen === 'timeline') { Object.assign(state, patch); state.visited.timeline = true; show(); }
    else go('timeline', patch);
  }

  // ============================================================
  // Ambient music (optional — silent unless assets/audio/ambient.mp3 exists)
  // ============================================================
  function initAmbient() {
    ambient = new Audio();
    ambient.loop = true; ambient.volume = AMBIENT_VOLUME; ambient.preload = 'auto';
    ambient.addEventListener('canplaythrough', function () { ambientReady = true; el.sound.classList.remove('hidden'); }, { once: true });
    ambient.addEventListener('error', function () { ambient = null; });
    ambient.src = AMBIENT_SRC;
  }
  function startAmbient() { if (ambient && ambientOn && ambient.paused) { var p = ambient.play(); if (p && p.catch) p.catch(function () {}); } }
  function duckAmbient(on) { if (ambient && ambientReady) ambient.volume = on ? AMBIENT_DUCK : AMBIENT_VOLUME; }
  function toggleSound() {
    ambientOn = !ambientOn;
    el.sound.classList.toggle('is-muted', !ambientOn);
    if (!ambient) return;
    if (ambientOn) startAmbient(); else ambient.pause();
  }

  // ============================================================
  // Idle handling
  // ============================================================
  function touched() {
    lastTouch = Date.now();
    if (idleLeft) { idleLeft = 0; el.idle.classList.add('hidden'); }
  }
  function idleTick() {
    if (state.screen === 'attract') return;
    if (film && !el.video.paused) { lastTouch = Date.now(); return; }
    if (!idleLeft && Date.now() - lastTouch > IDLE_MS) { idleLeft = IDLE_WARN_S; el.idle.classList.remove('hidden'); }
    if (idleLeft) {
      $('idle-count').textContent = idleLeft;
      idleLeft--;
      if (idleLeft === 0) resetToAttract();
    }
  }
  function resetToAttract() {
    el.idle.classList.add('hidden');
    idleLeft = 0;
    if (film) closeFilm();
    closeLightbox();
    Object.assign(state, { screen: 'attract', hist: [], decade: 0, year: null, rulerX: 0, chief: 1, chiefStripX: 0, fleetTab: 'bases', base: 'kaduna', era: 'all', cmode: null, cval: null, cdecade: 1980, archive: 'all', visited: {}, watched: {}, big: false, reach: false });
    applyPrefs();
    if (ambient) ambient.pause();
    show();
  }
  function applyPrefs() {
    el.stage.classList.toggle('big', state.big);
    el.stage.classList.toggle('reach', state.reach);
    $('btn-big').setAttribute('aria-pressed', String(state.big));
    $('btn-reach').setAttribute('aria-pressed', String(state.reach));
  }

  // ============================================================
  // Actions (one delegated click handler for the whole stage)
  // ============================================================
  var ACTIONS = {
    begin: function () { state.hist = []; go('home'); startAmbient(); },
    home: goHome,
    back: goBack,
    go: function (arg) { var p = arg.split(':'); go(p[0], p[1] ? { fleetTab: p[1] } : (p[0] === 'timeline' ? { year: null } : null)); },
    decade: function (arg) { state.decade = +arg; state.year = null; show(); },
    year: function (arg) { closeLightbox(); selectYear(arg); },
    'year-clear': function () { state.year = null; show(); },
    chief: function (arg) {
      if (!arg) return;
      closeLightbox();
      if (state.screen === 'chief') { state.chief = +arg; show(); el.screens.chief.querySelector('.chief-right').scrollTop = 0; }
      else go('chief', { chief: +arg });
    },
    'fleet-tab': function (arg) { state.fleetTab = arg; show(); },
    base: function (arg) {
      closeLightbox();
      if (state.screen === 'fleet') { state.base = arg; state.fleetTab = 'bases'; show(); }
      else go('fleet', { base: arg, fleetTab: 'bases' });
    },
    era: function (arg) { state.era = arg; show(); },
    cmode: function (arg) { state.cmode = arg; state.cval = null; show(); },
    cdecade: function (arg) { state.cdecade = +arg; show(); },
    cval: function (arg) { state.cval = state.cmode === 'state' ? arg : +arg; show(); },
    creset: function () { state.cmode = null; state.cval = null; show(); },
    archive: function (arg) { state.archive = arg; show(); },
    zoom: function (arg) { var p = arg.split(':'); openLightbox(p[0], +p[1]); },
    'lightbox-close': closeLightbox,
    'lightbox-prev': function () { stepLightbox(-1); },
    'lightbox-next': function () { stepLightbox(1); },
    'lightbox-link': function () {
      var it = lightbox.list[lightbox.i]; if (!it || !it.link) return;
      closeLightbox();
      ACTIONS[it.link.act](String(it.link.arg));
    },
    film: function (arg) { openFilm(arg); },
    'film-close': closeFilm,
    'film-toggle': function () { var v = el.video; if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); },
    'film-next': function () { if (!film) return; openFilm(C.films[(C.films.indexOf(film) + 1) % C.films.length].id); },
    'film-read': filmRead,
    'toggle-big': function () { state.big = !state.big; applyPrefs(); },
    'toggle-reach': function () { state.reach = !state.reach; applyPrefs(); },
    'toggle-sound': toggleSound,
    'idle-stay': function () { touched(); }
  };

  function onClick(e) {
    var t = e.target.closest('[data-act]');
    if (!t || !el.stage.contains(t)) return;
    if (t.classList.contains('is-off')) return;
    var fn = ACTIONS[t.getAttribute('data-act')];
    if (fn) fn(t.getAttribute('data-arg') || '');
  }

  // ============================================================
  // Init
  // ============================================================
  function init() {
    el.stage = $('stage');
    el.topbar = $('topbar');
    el.crumb = $('crumb');
    el.back = $('btn-back');
    el.sound = $('btn-sound');
    el.lightbox = $('lightbox');
    el.player = $('player');
    el.video = $('player-video');
    el.idle = $('idle');
    el.screens = {};
    document.querySelectorAll('.screen').forEach(function (s) { el.screens[s.id.replace('screen-', '')] = s; });

    // Any image that fails to load (e.g. media not copied yet) falls back to its frame's placeholder.
    document.addEventListener('error', function (e) {
      if (e.target && e.target.tagName === 'IMG') e.target.classList.add('missing');
    }, true);

    el.stage.addEventListener('click', onClick);
    el.stage.addEventListener('pointerdown', touched, true);
    document.addEventListener('keydown', function (e) {
      touched();
      if (e.key === 'Escape') { if (film) closeFilm(); else if (!el.lightbox.classList.contains('hidden')) closeLightbox(); else if (state.screen !== 'attract') goBack(); }
      if (!el.lightbox.classList.contains('hidden')) { if (e.key === 'ArrowRight') stepLightbox(1); if (e.key === 'ArrowLeft') stepLightbox(-1); }
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    window.addEventListener('resize', scaleStage);
    scaleStage();
    initPlayer();
    initLightboxSwipe();
    initAmbient();
    probeFilms();
    setInterval(idleTick, 1000);
    show();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
