/*
  SK Aneke Hall of Fame — kiosk runtime.

  Plain ES5-ish JavaScript, no build step, runs from file:// in Edge kiosk mode.
  Data lives in data/content.js (window.HOF_CONTENT); this file only presents it.

  Structure
    helpers        small formatting + markup utilities
    chrome         stage scaling, top bar, gallery dock, flight curtain
    routes         hash router with a small back stack
    views          welcome, history, nigerian air force, chiefs,
                   college, films, air warfare
    overlays       photo viewer (lightbox), record viewer, film player, idle
*/
(function () {
  'use strict';

  var C = window.HOF_CONTENT || {};
  var DECADES = C.decades || [];
  var EVENTS = (C.events || []).slice();
  var CHIEFS = C.chiefs || [];
  var FILMS = C.films || [];
  var COLLEGE = (C.chronicles && C.chronicles.college) || { items: [] };
  var DAW = (C.chronicles && C.chronicles.daw) || { items: [] };

  var FALLBACK_PHOTO = COLLEGE.hero || (DAW.hero || 'assets/icons/afcsc.png');
  var CURTAIN_MS = 720;
  var IDLE_MS = 120000;
  var IDLE_COUNT = 10;

  /* ============================================================
     helpers
     ============================================================ */

  var MOJIBAKE = [
    ['â€“', '–'], ['â€”', '—'], ['â€™', '’'], ['â€˜', '‘'], ['â€œ', '“'], ['â€\u009d', '”'],
    ['Â·', '·'], ['Â ', ' '], ['Ã©', 'é'], ['Ã¡', 'á'], ['Ã³', 'ó'], ['â€¦', '…'], ['Â', '']
  ];

  function fix(text) {
    var s = String(text == null ? '' : text);
    for (var i = 0; i < MOJIBAKE.length; i++) s = s.split(MOJIBAKE[i][0]).join(MOJIBAKE[i][1]);
    return s;
  }

  function esc(text) {
    return fix(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function byId(id) { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function parseISO(text) {
    if (!text) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function fmtDate(text) {
    var d = parseISO(text);
    if (!d) return fix(text || '');
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function yearOf(iso) {
    var d = parseISO(iso);
    return d ? d.getFullYear() : null;
  }

  function span(from, to, now) {
    var a = yearOf(from), b = to ? yearOf(to) : null;
    if (!a) return fix(from || '');
    if (!b) return a + ' – ' + (now || 'today');
    return a + ' – ' + b;
  }

  function initials(name) {
    var parts = String(name || '').replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/);
    if (!parts[0]) return 'NAF';
    var first = parts[0].charAt(0);
    var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  function ordinal(n) {
    var n2 = Math.abs(n) % 100;
    var suffix = ['th', 'st', 'nd', 'rd'];
    var k = n2 % 10;
    return n + (n2 >= 11 && n2 <= 13 ? 'th' : (suffix[k] || 'th'));
  }

  function tenureText(from, to) {
    var a = parseISO(from);
    var b = to ? parseISO(to) : new Date();
    if (!a || !b || b < a) return '';
    var months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() >= a.getDate()) months += 1;
    var years = Math.floor(months / 12);
    var rest = months % 12;
    var parts = [];
    if (years) parts.push(years + (years === 1 ? ' year' : ' years'));
    if (rest) parts.push(rest + (rest === 1 ? ' month' : ' months'));
    if (!parts.length) parts.push('under a month');
    return parts.join(', ');
  }

  function photoOf(event) {
    var list = (event && event.photos) || [];
    for (var i = 0; i < list.length; i++) if (list[i]) return list[i];
    return FALLBACK_PHOTO;
  }

  function portraitOf(chief) { return chief.portrait || chief.photo || FALLBACK_PHOTO; }

  function imgTag(src, alt, cls) {
    return '<img class="' + (cls || '') + '" src="' + esc(src || FALLBACK_PHOTO) + '" alt="' + esc(alt || '') +
      '" loading="lazy" onerror="this.style.opacity=0" />';
  }

  function eventsIn(from, to) {
    return EVENTS.filter(function (e) { return e.year >= from && e.year <= to; });
  }

  function eraOf(year) {
    for (var i = 0; i < DECADES.length; i++) if (year >= DECADES[i].from && year <= DECADES[i].to) return i;
    return 0;
  }

  function filmForYear(year) {
    for (var i = 0; i < FILMS.length; i++) if (FILMS[i].year && FILMS[i].year === year) return FILMS[i];
    return nearestFilm(year);
  }

  function nearestFilm(year) {
    var withYear = FILMS.filter(function (f) { return f.year; });
    if (!withYear.length) return null;
    var best = withYear[0];
    for (var i = 1; i < withYear.length; i++) {
      if (Math.abs(withYear[i].year - year) < Math.abs(best.year - year)) best = withYear[i];
    }
    return Math.abs(best.year - year) <= 8 ? best : null;
  }

  function filmStill(film) {
    if (!film) return FALLBACK_PHOTO;
    if (film.still) return film.still;
    var hit = EVENTS.filter(function (e) { return e.year === film.year && e.photos && e.photos.length; })[0];
    return hit ? photoOf(hit) : DAW.hero || FALLBACK_PHOTO;
  }

  function filmById(id) {
    for (var i = 0; i < FILMS.length; i++) if (FILMS[i].id === id) return FILMS[i];
    return null;
  }

  function firstLine(event) {
    var text = (event && event.text) || [];
    return text.length ? text[0] : '';
  }

  function rng(seed) {
    var s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  /* ============================================================
     sections
     ============================================================ */

  var WELCOME_SECTION = { key: 'welcome', no: '01', title: 'Welcome' };

  var SECTIONS = [
    { key: 'history', no: '02', title: 'History', short: 'History', blurb: 'Six decades in six chapters', route: '#/history' },
    { key: 'naf', no: '03', title: 'Nigerian Air Force', short: 'Air Force', blurb: 'Eras and the full timeline', route: '#/naf' },
    { key: 'chiefs', no: '04', title: 'Chiefs of the Air Staff', short: 'Chiefs', blurb: 'Twenty-three commanders', route: '#/chiefs' },
    { key: 'college', no: '05', title: 'The College', short: 'College', blurb: 'Records of the College', route: '#/college' },
    { key: 'films', no: '06', title: 'Film Archive', short: 'Film', blurb: 'Seven short films', route: '#/films' },
    { key: 'daw', no: '07', title: 'Air Warfare', short: 'Air Warfare', blurb: 'The Department, 1977 to today', route: '#/daw' }
  ];

  function sectionOf(key) {
    for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].key === key) return SECTIONS[i];
    return SECTIONS[0];
  }

  /* ============================================================
     state
     ============================================================ */

  var state = {
    current: null,
    stack: [],
    era: 0,
    year: null,
    moment: 0,
    chapter: 0,
    suppressClick: false,
    skipCurtain: false,
    films: { index: 0 },
    record: { set: null, index: 0 },
    lightbox: { list: [], index: 0, collection: '' },
    idleTimer: null,
    idleCountTimer: null,
    idleLeft: IDLE_COUNT,
    transitioning: false,
    drag: null
  };

  var dom = {};

  /* ============================================================
     chrome
     ============================================================ */

  function scaleStage() {
    if (!dom.stage) return;
    var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    dom.stage.style.transform = 'scale(' + scale + ')';
  }

  function setChrome(section, opts) {
    var isWelcome = section.key === 'welcome';
    dom.topbar.classList.toggle('hidden', isWelcome);
    dom.dock.classList.toggle('hidden', isWelcome);
    if (!isWelcome) {
      byId('section-n').textContent = section.no;
      byId('section-title').textContent = section.title;
      paintDock(section.key);
      var idx = SECTIONS.map(function (s) { return s.key; }).indexOf(section.key);
      var prev = idx < 0 ? SECTIONS[SECTIONS.length - 1] : SECTIONS[(idx - 1 + SECTIONS.length) % SECTIONS.length];
      var next = idx < 0 ? SECTIONS[0] : SECTIONS[(idx + 1) % SECTIONS.length];
      byId('dock-prev-label').textContent = prev.short;
      byId('dock-next-label').textContent = next.short;
    }
    document.body.dataset.section = section.key;
  }

  function paintDock(activeKey) {
    if (!dom.dockItems.childElementCount) {
      dom.dockItems.innerHTML = SECTIONS.map(function (s) {
        return '<button class="dock-item" data-act="go" data-route="' + s.route + '">' +
          '<span class="dock-n">' + s.no + '</span>' +
          '<span class="dock-label">' + esc(s.short) + '</span></button>';
      }).join('');
    }
    qsa('.dock-item', dom.dockItems).forEach(function (btn, i) {
      btn.classList.toggle('is-on', SECTIONS[i].key === activeKey);
    });
  }

  function showCurtain(section, onCovered) {
    var crest = 'assets/icons/naf.png';
    var layer = document.createElement('div');
    layer.className = 'curtain is-in';
    layer.innerHTML =
      '<div class="curtain-lead"></div>' +
      '<div class="curtain-main">' +
      '<span class="curtain-bar"></span>' +
      '<svg class="curtain-jet" viewBox="0 0 200 80" aria-hidden="true"><path d="M4 44l52-10 30-26 12 2-14 24 44-6 26-14 10 3-12 17 26-2 6 6-6 6-26-2 12 17-10 3-26-14-44-6 14 24-12 2-30-26-52-10z"/></svg>' +
      '<span class="curtain-contrail curtain-contrail--a"></span>' +
      '<span class="curtain-contrail curtain-contrail--b"></span>' +
      '<div class="curtain-inner">' +
      '<img class="curtain-crest" src="' + crest + '" alt="" onerror="this.style.display=\'none\'" />' +
      '<div class="curtain-body">' +
      '<span class="curtain-n">' + esc(section.key === 'welcome' ? 'Gallery 01 · Welcome' : 'Gallery ' + section.no + ' · ' + section.title) + '</span>' +
      '<span class="curtain-title">' + esc(section.key === 'welcome' ? 'The History Experience' : section.title) + '</span>' +
      '</div></div></div>';
    dom.stage.appendChild(layer);
    setTimeout(function () { if (onCovered) onCovered(); }, 520);
    setTimeout(function () {
      layer.classList.remove('is-in');
      layer.classList.add('is-out');
    }, 560);
    setTimeout(function () { layer.remove(); }, 1240);
  }

  function enterTimeline(era, year) {
    var explorer = byId('era-explorer');
    var target = hashFor('naf', { era: era, year: year });
    if (!explorer) { navigate(target); return; }
    explorer.classList.add('is-collapsing');
    state.skipCurtain = true;
    setTimeout(function () { navigate(target); }, 280);
  }

  /* ============================================================
     router
     ============================================================ */

  function parseHash() {
    var raw = location.hash || '#/welcome';
    var s = raw.replace(/^#\/?/, '');
    var qi = s.indexOf('?');
    var name = (qi >= 0 ? s.slice(0, qi) : s).replace(/\/+$/, '') || 'welcome';
    var params = {};
    if (qi >= 0) {
      s.slice(qi + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var eq = pair.indexOf('=');
        var k = eq >= 0 ? pair.slice(0, eq) : pair;
        var v = eq >= 0 ? pair.slice(eq + 1) : '';
        try { params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { params[k] = v; }
      });
    }
    return { name: name, params: params };
  }

  function hashFor(name, params) {
    var bits = [];
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] === null || params[k] === undefined || params[k] === '') return;
      bits.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])));
    });
    return '#/' + name + (bits.length ? '?' + bits.join('&') : '');
  }

  function navigate(hash, opts) {
    opts = opts || {};
    if (!opts.replace && location.hash !== hash) state.stack.push(location.hash || '#/welcome');
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function goBack() {
    var target = state.stack.pop();
    if (!target || target === location.hash) target = '#/history';
    navigate(target, { replace: true });
  }

  /* ============================================================
     view helpers
     ============================================================ */

  function masthead(eyebrow, title, blurb) {
    return '<div class="masthead">' +
      (eyebrow ? '<span class="eyebrow">' + esc(eyebrow) + '</span>' : '') +
      '<h2>' + esc(title) + '</h2>' +
      (blurb ? '<p>' + esc(blurb) + '</p>' : '') +
      '</div>';
  }

  function revealAll(root) {
    var items = qsa('.reveal', root);
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = +(el.dataset.delay || 0);
        setTimeout(function () { el.classList.add('is-in'); }, delay);
        io.unobserve(el);
      });
    }, { root: root, rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ============================================================
     VIEW — welcome
     ============================================================ */

  function viewWelcome() {
    var intro = filmById('intro') || FILMS[0] || {};
    var nav = SECTIONS.map(function (s, i) {
      return (i ? '<span class="welcome-nav-dot"></span>' : '') +
        '<button class="welcome-nav-item" data-act="go" data-route="' + s.route + '">' + esc(s.short) + '</button>';
    }).join('');

    var paths =
      '<svg class="welcome-paths" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M -60 940 C 420 800 760 1010 1160 890 S 1720 690 1990 760" stroke="var(--olive)" stroke-opacity="0.45" />' +
      '<path d="M -60 300 C 260 220 520 360 860 250" stroke="var(--aviation)" stroke-opacity="0.4" />' +
      '<path d="M 1100 1010 C 1350 900 1600 980 1990 860" stroke="var(--aviation)" stroke-opacity="0.4" />' +
      '</svg>';

    var jet = '<svg class="welcome-jet" viewBox="0 0 200 80" aria-hidden="true">' +
      '<path fill="var(--brass)" d="M4 44l52-10 30-26 12 2-14 24 44-6 26-14 10 3-12 17 26-2 6 6-6 6-26-2 12 17-10 3-26-14-44-6 14 24-12 2-30-26-52-10z" />' +
      '</svg>';

    var html = '<div class="screen-inner welcome">' +
      '<div class="welcome-grain"></div>' +
      '<div class="welcome-orb welcome-orb--l"></div>' +
      '<div class="welcome-orb welcome-orb--r"></div>' +
      '<div class="welcome-radar"></div>' +
      paths + jet +
      '<div class="welcome-corner welcome-corner--tl">' +
      '<span class="welcome-corner-n">01</span><span class="welcome-corner-rule"></span>' +
      '<span class="welcome-corner-title">Welcome</span></div>' +
      '<div class="welcome-corner welcome-corner--tr">' +
      '<button class="btn btn--paper" data-act="exit-app">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>Close</button></div>' +
      '<div class="welcome-corner welcome-corner--bl">' +
      '<span class="welcome-corner-kicker">Jaji · Kaduna State · Nigeria</span>' +
      '<span class="welcome-corner-value">10°49′N · 007°35′E</span></div>' +
      '<div class="welcome-corner welcome-corner--br">' +
      '<span class="welcome-corner-kicker">Air Faculty established</span>' +
      '<span class="welcome-corner-value">26 February 1979</span></div>' +
      '<div class="welcome-body">' +
      '<div class="welcome-crest-wrap">' +
      '<svg class="welcome-rings" viewBox="0 0 200 200" aria-hidden="true">' +
      '<circle cx="100" cy="100" r="96" stroke-width="0.8" />' +
      '<circle cx="100" cy="100" r="88" stroke-width="0.5" stroke-dasharray="1 4" stroke-opacity="0.45" />' +
      '</svg>' +
      '<img class="welcome-crest" src="assets/icons/naf.png" alt="Nigerian Air Force crest" onerror="this.style.display=\'none\'" />' +
      '</div>' +
      '<p class="welcome-host">Armed Forces Command and Staff College, Jaji</p>' +
      '<div class="welcome-dept"><i></i>Department of Air Warfare<i></i></div>' +
      '<h1 class="welcome-title"><em>The</em> Hall of Fame</h1>' +
      '<p class="welcome-lede">' + esc((C.meta && C.meta.tagline) || 'Six decades of Nigerian airpower.') + '</p>' +
      '<div class="welcome-actions">' +
      '<button class="welcome-enter" data-act="go" data-route="#/history">Enter Experience' +
      '<span class="arrow"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></span></button>' +
      (intro.src ? '<button class="btn btn--glass" data-act="film" data-id="' + esc(intro.id) + '" style="color:var(--navy);border-color:color-mix(in oklab,var(--navy) 24%,transparent);background:color-mix(in oklab,var(--paper) 70%,transparent)">Watch the introduction</button>' : '') +
      '</div>' +
      '<nav class="welcome-nav" aria-label="Go straight to a gallery">' + nav + '</nav>' +
      '<div class="welcome-stats">' +
      '<span class="welcome-stat"><b>' + DECADES.length + '</b>decades</span>' +
      '<span class="welcome-stat"><b>' + CHIEFS.length + '</b>chiefs</span>' +
      '<span class="welcome-stat"><b>' + EVENTS.length + '</b>moments</span>' +
      '<span class="welcome-stat"><b>' + FILMS.length + '</b>films</span>' +
      '</div>' +
      '</div></div>';

    return { html: html, after: function () {} };
  }

  /* ============================================================
     VIEW — history
     ============================================================ */

  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

  function viewHistory(params) {
    var start = parseInt(params && params.chapter, 10);
    if (!isNaN(start)) state.chapter = Math.max(0, Math.min(DECADES.length - 1, start));
    var cards = DECADES.map(function (d, i) {
      var evs = eventsIn(d.from, d.to);
      var chips = evs.slice(0, 4).map(function (ev) {
        return '<button class="moment-chip" data-act="moment" data-era="' + i + '" data-year="' + ev.year + '">' +
          '<span class="d">' + esc(ev.date || ev.year) + '</span>' +
          '<span class="m">' + esc(ev.title) + '</span></button>';
      }).join('');
      return '<article class="chapter-card" data-act="chapter" data-index="' + i + '" role="button" tabindex="0">' +
        '<div class="chapter-flip">' +
        '<div class="chapter-face chapter-face--front">' +
        '<button class="chapter-photo" data-act="lightbox-era" data-era="' + i + '" aria-label="Photographs of ' + esc(d.title) + '">' +
        imgTag(evs.length ? photoOf(evs[0]) : FALLBACK_PHOTO, d.title) + '</button>' +
        '<div class="chapter-info">' +
        '<span class="chapter-range">' + d.from + ' — ' + d.to + '</span>' +
        '<h3 class="chapter-title">' + esc(d.title) + '</h3>' +
        '<p class="chapter-summary">' + esc(d.summary) + '</p>' +
        '<div class="chapter-moments">' + chips + '</div>' +
        '<button class="chapter-go" data-act="era-more" data-era="' + i + '" data-year="' + (evs.length ? evs[0].year : d.from) + '">' +
        'Open this era on the timeline' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></button>' +
        '</div></div>' +
        '<div class="chapter-face chapter-face--back">' +
        '<span class="chapter-back-num">' + ROMAN[i] + '</span>' +
        '<span class="chapter-back-title">' + esc(d.title) + '</span>' +
        '<span class="chapter-back-range">' + d.from + ' — ' + d.to + '</span>' +
        '</div></div></article>';
    }).join('');

    return {
      html: '<div class="screen-inner history">' +
        '<header class="page-head">' +
        masthead('The story of the service', 'A history in six chapters',
          'Turn a card to read its chapter, then touch a moment to find it on the timeline.') +
        '<div class="head-tools"><img class="head-crest" src="assets/icons/naf.png" alt="Nigerian Air Force crest" onerror="this.style.display=\'none\'" /></div>' +
        '</header>' +
        '<div class="chapter-deck" id="chapter-deck">' + cards + '</div>' +
        '</div>',
      after: function () {
        if (state.chapter >= DECADES.length) state.chapter = 0;
        layoutDeck();
      }
    };
  }

  function layoutDeck() {
    var deck = byId('chapter-deck');
    if (!deck) return;
    var cards = qsa('.chapter-card', deck);
    if (!cards.length) return;

    var W = deck.clientWidth;
    var n = cards.length;
    var active = Math.max(0, Math.min(n - 1, state.chapter || 0));
    var gap = 34;
    var backW = Math.round(Math.min(196, Math.max(148, (W * 0.62) / n)));
    var overlap = Math.round(backW * 0.4);
    var leftCount = active;
    var rightCount = n - 1 - active;
    var leftTotal = leftCount ? leftCount * backW - (leftCount - 1) * overlap : 0;
    var rightTotal = rightCount ? rightCount * backW - (rightCount - 1) * overlap : 0;
    var gaps = (leftCount ? gap : 0) + (rightCount ? gap : 0);
    var activeW = Math.max(540, Math.min(780, W - 40 - leftTotal - rightTotal - gaps));
    var total = leftTotal + rightTotal + activeW + gaps;
    var startX = Math.max(0, (W - total) / 2);
    var activeX = startX + (leftCount ? leftTotal + gap : 0);

    var activeCard = cards[active];
    activeCard.style.left = Math.round(activeX) + 'px';
    activeCard.style.width = Math.round(activeW) + 'px';

    for (var j = active - 1, k = 0; j >= 0; j--, k++) {
      var card = cards[j];
      var left = activeX - gap - backW - k * (backW - overlap);
      card.style.left = Math.round(left) + 'px';
      card.style.width = backW + 'px';
      card.classList.add('is-left');
      card.classList.remove('is-right');
      card.style.zIndex = 30 - k;
    }

    for (var i = active + 1, r = 0; i < n; i++, r++) {
      var rcard = cards[i];
      rcard.style.left = Math.round(activeX + activeW + gap + r * (backW - overlap)) + 'px';
      rcard.style.width = backW + 'px';
      rcard.classList.add('is-right');
      rcard.classList.remove('is-left');
      rcard.style.zIndex = 30 - r;
    }

    activeCard.classList.remove('is-left', 'is-right');
    activeCard.style.zIndex = 40;
    cards.forEach(function (card, i) {
      card.classList.toggle('is-on', i === active);
    });
  }

  function activateChapter(index) {
    if (index === state.chapter) return;
    state.chapter = index;
    layoutDeck();
  }

  /* ============================================================
     VIEW — Nigerian Air Force (eras + timeline)
     ============================================================ */

  function eraEvents(index) {
    var d = DECADES[index];
    if (!d) return [];
    return eventsIn(d.from, d.to);
  }

  function yearsOfEra(index) {
    var map = {};
    var order = [];
    eraEvents(index).forEach(function (ev) {
      if (!map[ev.year]) { map[ev.year] = []; order.push(ev.year); }
      map[ev.year].push(ev);
    });
    order.sort(function (a, b) { return a - b; });
    return order.map(function (y) { return { year: y, events: map[y] }; });
  }

  function viewNaf(params) {
    var era = Math.max(0, Math.min(DECADES.length - 1, parseInt(params.era, 10) || 0));
    state.era = era;
    var year = parseInt(params.year, 10) || null;

    var html = '<div class="screen-inner naf">' +
      '<header class="page-head naf-head">' +
      masthead('Nigerian Air Force · 1964 to today', 'Nigerian Air Force',
        'Six decades, opened like a folder. Choose an era to read its brief, or open the full timeline and move through the years.') +
      '<div class="head-tools">' +
      '<div class="naf-toggle">' +
      '<button data-act="naf-mode" data-mode="eras" class="' + (year ? '' : 'is-on') + '">Eras</button>' +
      '<button data-act="naf-mode" data-mode="timeline" class="' + (year ? 'is-on' : '') + '">Timeline</button>' +
      '</div>' +
      '<img class="head-crest" src="assets/icons/naf.png" alt="Nigerian Air Force crest" onerror="this.style.display=\'none\'" />' +
      '</div></header>';

    if (year) {
      var erev = eraEvents(era);
      var startIdx = 0;
      for (var j = 0; j < erev.length; j++) if (erev[j].year === year) { startIdx = j; break; }
      state.year = year;
      state.moment = startIdx;
      html += '<div class="era-strip" id="era-strip">' + eraStrip(era) + '</div>';
      html += '<div class="naf-timeline" id="naf-timeline"></div>';
    } else {
      state.year = null;
      html += '<div class="era-explorer" id="era-explorer">' + eraColumns(era) + '</div>';
    }
    html += '</div>';

    return {
      html: html,
      after: function () {
        if (year) paintTimeline();
        else bindEraExplorer();
      }
    };
  }

  function eraColumns(active) {
    return DECADES.map(function (d, i) {
      var evs = eraEvents(i);
      var cover = evs.length ? photoOf(evs[0]) : FALLBACK_PHOTO;
      var first = evs.length ? evs[0].year : d.from;
      return '<div class="era-col' + (i === active ? ' is-on' : '') + '" role="button" tabindex="0" data-act="era-select" data-era="' + i + '">' +
        '<div class="era-col-bg">' + imgTag(cover, d.title) + '</div>' +
        '<div class="era-rail">' +
        '<span class="era-rail-range">' + d.from + '–' + d.to + '</span>' +
        '<span class="era-rail-title">' + esc(d.title) + '</span>' +
        '<span class="era-rail-num">' + ROMAN[i] + '</span>' +
        '</div>' +
        '<div class="era-open">' +
        '<span class="era-open-num">Era ' + ROMAN[i] + '</span>' +
        '<h3>' + esc(d.title) + '</h3>' +
        '<p>' + esc(d.summary) + '</p>' +
        '<div class="era-open-facts">' +
        '<span class="era-fact"><b>' + evs.length + '</b><span>Moments</span></span>' +
        '<span class="era-fact"><b>' + d.from + '–' + d.to + '</b><span>Years</span></span>' +
        '<span class="era-fact"><b>' + (evs.length ? evs[0].year : d.from) + '</b><span>First record</span></span>' +
        '</div>' +
        '<div class="era-open-actions">' +
        '<button class="btn btn--brass" data-act="era-more" data-era="' + i + '" data-year="' + first + '">More info' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></button>' +
        '</div></div></div>';
    }).join('');
  }

  function eraStrip(active) {
    return DECADES.map(function (d, i) {
      return '<button class="era-chip' + (i === active ? ' is-on' : '') + '" data-act="era-jump" data-era="' + i + '">' +
        '<b>' + ROMAN[i] + '</b>' +
        '<span class="era-chip-range">' + d.from + '–' + d.to + '</span>' +
        '<span class="era-chip-title">' + esc(d.title) + '</span></button>';
    }).join('');
  }

  function bindEraExplorer() {
    var cols = qsa('.era-col');
    cols.forEach(function (col) {
      col.addEventListener('pointerenter', function () {
        if (window.matchMedia('(hover: hover)').matches) selectEra(+col.dataset.era);
      });
    });
    selectEra(state.era);
  }

  function selectEra(index) {
    state.era = index;
    qsa('.era-col').forEach(function (col) {
      col.classList.toggle('is-on', +col.dataset.era === index);
    });
  }

  function timelineMomentFor(year) {
    var list = eraEvents(state.era);
    var idx = 0;
    for (var i = 0; i < list.length; i++) if (list[i].year === year) { idx = i; break; }
    return { list: list, index: idx };
  }

  function paintTimeline() {
    var host = byId('naf-timeline');
    if (!host) return;
    var list = eraEvents(state.era);
    if (!list.length) { host.innerHTML = ''; return; }
    var index = state.moment || 0;
    if (index < 0) index = list.length - 1;
    if (index >= list.length) index = 0;
    var ev = list[index];
    state.moment = index;
    state.year = ev.year;

    var d = DECADES[state.era] || {};
    var years = yearsOfEra(state.era);
    var next = list[(index + 1) % list.length];
    var film = filmForYear(ev.year) || (state.era >= 4 ? filmById('sixty') : filmById('birth'));

    var neighbours = [list[index + 1], list[index + 2], list[index - 1]].filter(Boolean);
    var stack = '<div class="print-frame naf-print naf-print--a"><div class="photo photo--plain">' + imgTag(photoOf(ev), ev.title) + '</div></div>';
    if (neighbours[0]) {
      stack += '<div class="print-frame naf-print naf-print--b"><div class="photo photo--plain">' + imgTag(photoOf(neighbours[0]), neighbours[0].title) + '</div></div>';
    }
    if (neighbours[1]) {
      stack += '<div class="print-frame naf-print naf-print--c"><div class="photo photo--plain">' + imgTag(photoOf(neighbours[1]), neighbours[1].title) + '</div></div>';
    }
    if (film) {
      stack += '<button class="naf-film-card" data-act="film" data-id="' + esc(film.id) + '">' +
        '<span class="fc-still">' + imgTag(filmStill(film), film.title) + '</span>' +
        '<span class="fc-body"><span class="fc-kicker">Film</span><span class="fc-title">' + esc(film.title) + '</span></span>' +
        '<span class="fc-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7Z"/></svg></span></button>';
    }

    var paragraphs = (ev.text || []).slice(0, 2).map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('');
    var yearCards = years.map(function (y) {
      return '<button class="year-card' + (y.year === ev.year ? ' is-on' : '') + '" data-act="naf-year" data-year="' + y.year + '">' +
        '<b>' + y.year + '</b><span>' + esc(y.events[0].title) + '</span></button>';
    }).join('');

    host.innerHTML =
      '<div class="naf-main">' +
      '<div class="naf-media"><div class="naf-media-stack">' + stack + '</div></div>' +
      '<div class="naf-text">' +
      '<span class="naf-eyebrow"><span class="rule"></span>Era ' + ROMAN[state.era] + ' · ' + esc(d.title || '') + '</span>' +
      '<h2 class="naf-title">' + esc(ev.title) + '</h2>' +
      '<div class="naf-paras">' + paragraphs + '</div>' +
      '<div class="naf-meta"><span class="context-tag">' + esc(ev.date || ev.year) + '</span>' +
      (ev.state ? '<span>' + esc(ev.state) + '</span>' : '') +
      '<span>' + (index + 1) + ' of ' + list.length + '</span></div>' +
      '<div class="naf-actions">' +
      '<button class="round-btn" data-act="naf-prev" aria-label="Previous moment"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button>' +
      '<button class="round-btn round-btn--navy" data-act="naf-next" aria-label="Next moment"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>' +
      '<button class="btn btn--ghost btn--sm" data-act="naf-mode" data-mode="eras">Back to the eras</button>' +
      '</div>' +
      '<div class="naf-meta"><span class="muted">Next: ' + esc(next.title) + '</span></div>' +
      '</div></div>' +
      '<div class="naf-years">' + yearCards + '</div>';
  }

  /* ============================================================
     VIEW — chiefs
     ============================================================ */

  function viewChiefs() {
    var spanYears = chiefSpan();
    var totalMs = Math.max(1, spanYears.max - spanYears.min);

    function pct(date) { return ((date - spanYears.min) / totalMs) * 100; }

    var segments = CHIEFS.map(function (c, i) {
      var from = parseISO(c.from) || spanYears.min;
      var to = c.to ? (parseISO(c.to) || spanYears.max) : spanYears.max;
      var left = Math.max(0, Math.min(100, pct(from)));
      var width = Math.max(0.22, Math.min(100 - left, pct(to) - left));
      return '<button class="tenure-seg" data-act="record" data-set="chiefs" data-index="' + i + '"' +
        ' style="left:' + left.toFixed(3) + '%;width:' + width.toFixed(3) + '%"' +
        ' aria-label="' + esc((c.shortName || c.name) + ', ' + span(c.from, c.to)) + '">' +
        (width > 2.4 ? '<span>' + (c.no || i + 1) + '</span>' : '') + '</button>';
    }).join('');

    var ticks = '';
    for (var year = 1970; year <= 2020; year += 10) {
      var p = pct(new Date(year, 0, 1));
      if (p > 0 && p < 100) {
        ticks += '<span class="tenure-tick" style="left:' + p.toFixed(3) + '%">' + year + '</span>';
      }
    }

    var cards = CHIEFS.map(function (c, i) {
      return '<button class="chief-card" data-act="record" data-set="chiefs" data-index="' + i + '">' +
        '<span class="chief-print"><span class="chief-photo">' +
        imgTag(portraitOf(c), c.name) +
        '<span class="chief-initials">' + esc(initials(c.name)) + '</span>' +
        '<span class="chief-badge">' + ordinal(c.no || i + 1) + '</span>' +
        '</span></span>' +
        '<span class="chief-meta">' +
        '<span class="chief-name">' + esc(c.shortName || c.name) + '</span>' +
        '<span class="chief-years">' + esc(span(c.from, c.to)) + '</span>' +
        '<span class="chief-duration">' + esc(tenureText(c.from, c.to)) + '</span>' +
        '</span></button>';
    }).join('');

    var lineage = filmById('lineage');

    return {
      html: '<div class="screen-inner chiefs">' +
        '<header class="page-head">' +
        masthead('Command · 1963 to today', 'The officers who led the service',
          'Two German commanders, then the Nigerian officers who have led the service since 1966. The bar draws every tenure to scale; the portraits run in order of appointment.') +
        '<div class="head-tools">' +
        (lineage ? '<button class="chief-film" data-act="film" data-id="' + esc(lineage.id) + '">' +
          '<span class="chief-film-still">' + imgTag(filmStill(lineage), lineage.title) + '</span>' +
          '<span class="chief-film-body"><span class="chief-film-kicker">1963 – today</span>' +
          '<span class="chief-film-title">' + esc(lineage.title) + '</span></span>' +
          '<span class="chief-film-play"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7Z"/></svg></span>' +
          '</button>' : '') +
        '</div></header>' +
        '<div class="tenure">' +
        '<div class="tenure-bar" id="tenure-bar">' + segments + '</div>' +
        '<div class="tenure-axis">' + ticks + '</div>' +
        '</div>' +
        '<div class="chief-wall" id="chief-wall">' + cards + '</div>' +
        '<button class="chief-arrow chief-arrow--prev" data-act="chief-scroll" data-delta="-1" aria-label="Previous chiefs">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg></button>' +
        '<button class="chief-arrow chief-arrow--next" data-act="chief-scroll" data-delta="1" aria-label="More chiefs">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>' +
        '</div>',
      after: function () { bindChiefRail(); }
    };
  }

  function bindChiefRail() {
    var rail = byId('chief-wall');
    if (!rail) return;
    var drag = null;

    rail.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      drag = { id: ev.pointerId, x: ev.clientX, start: rail.scrollLeft, moved: 0 };
    });

    function move(ev) {
      if (!drag || drag.id !== ev.pointerId) return;
      var dx = ev.clientX - drag.x;
      drag.moved = Math.max(drag.moved, Math.abs(dx));
      if (drag.moved > 8) {
        rail.classList.add('is-dragging');
        rail.scrollLeft = drag.start - dx;
        if (ev.cancelable) ev.preventDefault();
      }
    }

    function end(ev) {
      if (!drag || drag.id !== ev.pointerId) return;
      if (drag.moved > 8) state.suppressClick = true;
      drag = null;
      rail.classList.remove('is-dragging');
    }

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    rail.addEventListener('wheel', function (ev) {
      if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
      rail.scrollLeft += ev.deltaY;
      ev.preventDefault();
    }, { passive: false });
  }

  function stepChiefRail(delta) {
    var rail = byId('chief-wall');
    if (!rail) return;
    var card = qs('.chief-card', rail);
    var step = card ? card.offsetWidth + 16 : 420;
    rail.scrollBy({ left: delta * step * 2, behavior: 'smooth' });
  }

  function chiefSpan() {
    var min = null;
    var max = null;
    var today = new Date();
    CHIEFS.forEach(function (c) {
      var a = parseISO(c.from);
      var b = c.to ? parseISO(c.to) : today;
      if (a && (!min || a < min)) min = a;
      if (b && (!max || b > max)) max = b;
    });
    return { min: min || new Date(1963, 0, 1), max: max || today };
  }

  /* ============================================================
     VIEW — college
     ============================================================ */

  function layoutCollage() {
    var host = byId('light-table');
    if (!host) return;
    var pieces = qsa('.collage-piece', host);
    if (!pieces.length) return;

    var W = host.clientWidth;
    var H = host.clientHeight;
    var cols = 6;
    var rows = Math.ceil(pieces.length / cols);
    var gap = 15;
    var colW = W / cols;
    var maxH = (H - 26 * (rows - 1)) / rows;
    var w = Math.min(258, colW - gap);

    var h = 0;
    for (var pass = 0; pass < 6; pass++) {
      pieces.forEach(function (p) { p.style.width = w + 'px'; });
      h = 0;
      pieces.forEach(function (p) { h = Math.max(h, p.offsetHeight); });
      if (h <= maxH) break;
      w = Math.max(120, Math.floor(w * (maxH / h)));
    }

    var rowGap = rows > 1 ? Math.max(12, Math.min(26, (H - rows * h) / (rows - 1))) : 0;
    var totalH = rows * h + rowGap * (rows - 1);
    var startY = Math.max(4, (H - totalH) / 2);
    var rand = rng(19760529);

    pieces.forEach(function (p, i) {
      var c = i % cols;
      var r = Math.floor(i / cols);
      var cx = colW * (c + 0.5) + (rand() - 0.5) * 12;
      var cy = startY + r * (h + rowGap) + h / 2 + (rand() - 0.5) * 8;
      cx = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, cx));
      cy = Math.max(h / 2 + 4, Math.min(H - h / 2 - 4, cy));
      p.style.left = Math.round(cx - w / 2) + 'px';
      p.style.top = Math.round(cy - h / 2) + 'px';
      p.style.setProperty('--rot', ((rand() - 0.5) * 6).toFixed(2) + 'deg');
    });
  }

  function viewCollage() {
    var items = COLLEGE.items || [];
    var pieces = items.map(function (item, i) {
      var photo = (item.photos && item.photos[0]) || COLLEGE.hero || FALLBACK_PHOTO;
      return '<div class="collage-piece" data-act="college-open" data-index="' + i + '" role="button" tabindex="0" style="z-index:' + (10 + i) + '">' +
        '<div class="print-frame"><div class="photo">' + imgTag(photo, item.title) + '</div></div>' +
        '<div class="collage-cap"><b>' + esc(item.date || '') + '</b><span>' + esc(item.title) + '</span></div>' +
        '</div>';
    }).join('');

    return {
      html: '<div class="screen-inner collage">' +
        '<header class="page-head">' +
        masthead(COLLEGE.eyebrow || 'The College', 'The College',
          COLLEGE.intro || 'Seventeen records from the history of the College, laid out on a light table. Drag the prints aside, and touch one to read it.') +
        '<div class="head-tools"><img class="head-crest" src="assets/icons/afcsc.png" alt="College crest" onerror="this.style.display=\'none\'" /></div>' +
        '</header>' +
        '<div class="light-table" id="light-table">' + pieces + '</div></div>',
      after: function () { bindCollage(); }
    };
  }

  function stageScale() {
    var m = /scale\(([\d.]+)\)/.exec(dom.stage.style.transform || '');
    return m ? parseFloat(m[1]) : 1;
  }

  function bindCollage() {
    var host = byId('light-table');
    if (!host) return;
    layoutCollage();
    var pieces = qsa('.collage-piece', host);

    pieces.forEach(function (piece) {
      piece.addEventListener('pointerdown', function (ev) {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        resetIdle();
        var scale = stageScale() || 1;
        var hostRect = host.getBoundingClientRect();
        var rect = piece.getBoundingClientRect();
        state.drag = {
          el: piece,
          pointerId: ev.pointerId,
          host: host,
          offsetX: (ev.clientX - rect.left) / scale,
          offsetY: (ev.clientY - rect.top) / scale,
          startClientX: ev.clientX,
          startClientY: ev.clientY,
          hostW: hostRect.width / scale,
          hostH: hostRect.height / scale,
          w: rect.width / scale,
          h: rect.height / scale,
          moved: 0,
          baseZ: piece.style.zIndex
        };
        piece.classList.add('is-drag');
        piece.style.zIndex = 80;
        try { piece.setPointerCapture(ev.pointerId); } catch (e) {}
      });

      piece.addEventListener('pointermove', function (ev) {
        var d = state.drag;
        if (!d || d.el !== piece || d.pointerId !== ev.pointerId) return;
        var scale = stageScale() || 1;
        var hostRect = host.getBoundingClientRect();
        var dx = ev.clientX - d.startClientX;
        var dy = ev.clientY - d.startClientY;
        d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
        var left = (ev.clientX - hostRect.left) / scale - d.offsetX;
        var top = (ev.clientY - hostRect.top) / scale - d.offsetY;
        left = Math.max(0, Math.min(d.hostW - d.w, left));
        top = Math.max(0, Math.min(d.hostH - d.h, top));
        piece.style.left = left + 'px';
        piece.style.top = top + 'px';
      });

      function release(ev) {
        var d = state.drag;
        if (!d || d.el !== piece) return;
        var dragged = d.moved > 10;
        piece.classList.remove('is-drag');
        piece.style.zIndex = dragged ? 70 : d.baseZ;
        state.suppressClick = dragged;
        state.drag = null;
      }

      piece.addEventListener('pointerup', release);
      piece.addEventListener('pointercancel', release);
      piece.addEventListener('lostpointercapture', function (ev) {
        var d = state.drag;
        if (!d || d.el !== piece) return;
        piece.classList.remove('is-drag');
        state.drag = null;
      });
    });
  }

  /* ============================================================
     VIEW — film archive
     ============================================================ */

  function filmList() {
    var list = FILMS.filter(function (f) { return f.id !== 'intro'; });
    return list.length ? list : FILMS.slice();
  }

  function viewFilms() {
    var list = filmList();
    var feature = list[0] || {};
    var rows = list.map(function (f, i) {
      return '<button class="film-row' + (i === 0 ? ' is-on' : '') + '" data-act="film" data-id="' + esc(f.id) + '">' +
        '<span class="film-idx">' + pad2(i + 1) + '</span>' +
        '<span class="film-thumb">' + imgTag(filmStill(f), f.title) + '</span>' +
        '<span class="film-titles"><b>' + esc(f.title) + '</b><span>' + esc(f.subtitle || '') + '</span></span>' +
        '<span class="film-go"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7Z"/></svg></span>' +
        '</button>';
    }).join('');

    return {
      html: '<div class="screen-inner films">' +
        '<header class="page-head">' +
        masthead('Moving pictures', 'Film Archive',
          'Seven short films from the service and the College: the founding years, the civil war, the Hercules fleet and sixty years of the Nigerian Air Force.') +
        '<div class="head-tools"><img class="head-crest" src="assets/icons/naf.png" alt="Nigerian Air Force crest" onerror="this.style.display=\'none\'" /></div>' +
        '</header>' +
        '<div class="theatre">' +
        '<div class="theatre-hero">' +
        imgTag(filmStill(feature), feature.title, 'hero-still') +
        '<img class="theatre-crest" src="assets/icons/naf.png" alt="" onerror="this.style.display=\'none\'" />' +
        '<button class="theatre-play" data-act="film" data-id="' + esc(feature.id) + '" aria-label="Play ' + esc(feature.title) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5v14l12-7Z"/></svg></button>' +
        '<div class="theatre-hero-body">' +
        '<span class="eyebrow">Now showing</span>' +
        '<h3>' + esc(feature.title) + '</h3>' +
        '<p>' + esc(feature.description || '') + '</p>' +
        '<div class="theatre-hero-actions">' +
        '<button class="btn btn--brass" data-act="film" data-id="' + esc(feature.id) + '">Play the film</button>' +
        '<span class="muted" style="color:var(--on-dark-muted);font-size:15px">' + esc(feature.subtitle || '') + '</span>' +
        '</div></div></div>' +
        '<div class="theatre-list" id="theatre-list">' + rows + '</div>' +
        '</div></div>',
      after: function () {}
    };
  }

  /* ============================================================
     VIEW — air warfare
     ============================================================ */

  function viewDaw() {
    var items = DAW.items || [];
    var tiles = items.slice(0, 8).map(function (item, i) {
      return '<div class="daw-tile" data-act="daw-flip" data-index="' + i + '" role="button" tabindex="0">' +
        '<div class="daw-tile-inner">' +
        '<div class="daw-face daw-face--front">' +
        '<span class="daw-date">' + esc(item.date) + '</span>' +
        '<span class="daw-tile-title">' + esc(item.title) + '</span>' +
        '<span class="daw-tile-go">Turn the card' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></span>' +
        '</div>' +
        '<div class="daw-face daw-face--back">' +
        '<span class="daw-back-date">' + esc(item.date) + '</span>' +
        '<span class="daw-back-title">' + esc(item.title) + '</span>' +
        '<span class="daw-back-text">' + esc((item.text && item.text[0]) || '') + '</span>' +
        '<button class="btn btn--brass btn--sm" data-act="record" data-set="daw" data-index="' + i + '">Read the record</button>' +
        '</div></div></div>';
    }).join('');

    var ribbonItems = items.map(function (item) {
      return '<span class="daw-ribbon-item"><b>' + esc(item.date) + '</b>' + esc(item.title) + '</span>';
    }).join('');
    var ribbon = '<div class="daw-ribbon"><div class="daw-ribbon-track">' + ribbonItems + ribbonItems + '</div></div>';

    return {
      html: '<div class="screen-inner daw">' +
        '<div class="daw-hero">' +
        imgTag(DAW.hero || FALLBACK_PHOTO, DAW.heroCaption || 'Department of Air Warfare', 'daw-hero-img') +
        '<div class="daw-hero-veil"></div>' +
        '<img class="daw-crest" src="assets/icons/naf.png" alt="Nigerian Air Force crest" onerror="this.style.display=\'none\'" />' +
        '<div class="daw-hero-body">' +
        '<span class="eyebrow"><span class="rule"></span>Air Warfare · The Department</span>' +
        '<h2>' + esc(DAW.title || 'History of the Department of Air Warfare') + '</h2>' +
        '<p>' + esc(DAW.intro || '') + '</p>' +
        '</div></div>' +
        '<div class="daw-body"><div class="daw-tiles">' + tiles + '</div>' + ribbon + '</div>' +
        '</div>',
      after: function () {}
    };
  }

  /* ============================================================
     RECORD SETS
     ============================================================ */

  function buildRecordSets() {
    if (state.sets) return state.sets;
    var sets = {};

    sets.chiefs = CHIEFS.map(function (c) {
      var facts = [['Tenure', span(c.from, c.to)]];
      if (c.born) facts.push(['Born', fix(c.born)]);
      if (c.died) facts.push(['Died', fix(c.died)]);
      if (c.state) facts.push(['State', fix(c.state)]);
      return {
        img: portraitOf(c),
        fig: 'Chief of the Air Staff No. ' + pad2(c.no || 0),
        eyebrow: 'Commander · Chief of the Air Staff',
        name: c.name,
        role: c.rank || '',
        facts: facts,
        copy: (c.bio || []).map(fix),
        subhead: 'Achievements',
        list: (c.achievements || []).map(fix),
        sources: (c.sources || []).map(fix)
      };
    });

    sets.college = [];
    state.collegeMap = {};
    (COLLEGE.items || []).forEach(function (item, itemIndex) {
      var photos = (item.photos && item.photos.length) ? item.photos : [COLLEGE.hero || FALLBACK_PHOTO];
      state.collegeMap[itemIndex] = sets.college.length;
      photos.forEach(function (src, photoIndex) {
        sets.college.push({
          img: src,
          fig: 'College record · ' + fix(item.date || ''),
          eyebrow: COLLEGE.eyebrow || 'Armed Forces Command and Staff College, Nigeria',
          name: item.title,
          role: item.date || '',
          facts: [['Collection', 'History of the College'], ['Photograph', (photoIndex + 1) + ' of ' + photos.length]],
          copy: (item.text || []).map(fix),
          subhead: item.caption ? 'Caption' : '',
          list: item.caption ? [fix(item.caption)] : [],
          sources: []
        });
      });
    });

    sets.daw = (DAW.items || []).map(function (item, i) {
      return {
        img: (item.photos && item.photos[0]) || DAW.hero || FALLBACK_PHOTO,
        fig: 'Department of Air Warfare · ' + fix(item.date || ''),
        eyebrow: DAW.eyebrow || 'Department of Air Warfare',
        name: item.title,
        role: item.date || '',
        facts: [['Collection', 'History of the Department of Air Warfare'], ['Record', (i + 1) + ' of ' + (DAW.items || []).length]],
        copy: (item.text || []).map(fix),
        subhead: item.caption ? 'Caption' : '',
        list: item.caption ? [fix(item.caption)] : [],
        sources: []
      };
    });

    sets.films = FILMS.map(function (f) {
      return {
        img: filmStill(f),
        fig: 'Film · ' + fix(f.subtitle || ''),
        eyebrow: 'Film archive',
        name: f.title,
        role: f.subtitle || '',
        facts: [['Runtime', 'Short film'], ['Collection', 'SK Aneke Hall of Fame']],
        copy: [fix(f.description || '')],
        subhead: '',
        list: [],
        sources: []
      };
    });

    state.sets = sets;
    return sets;
  }

  /* ============================================================
     OVERLAY — record viewer
     ============================================================ */

  function openRecord(setName, index) {
    var sets = buildRecordSets();
    var list = sets[setName];
    if (!list || !list.length) return;
    if (setName === 'college' && state.collegeMap && state.collegeMap[index] !== undefined) {
      index = state.collegeMap[index];
    }
    state.record.set = setName;
    state.record.index = Math.max(0, Math.min(list.length - 1, index || 0));
    dom.record.classList.remove('hidden');
    paintRecord();
    resetIdle();
  }

  function paintRecord() {
    var sets = buildRecordSets();
    var list = sets[state.record.set] || [];
    var rec = list[state.record.index];
    if (!rec) return;

    var img = byId('record-img');
    img.src = rec.img || FALLBACK_PHOTO;
    img.alt = fix(rec.name || '');
    img.style.opacity = '';
    byId('record-fig').textContent = rec.fig || '';
    byId('record-hint').textContent = (state.record.index + 1) + ' of ' + list.length;

    var facts = (rec.facts || []).filter(function (f) { return f[1]; }).map(function (f) {
      return '<span class="record-fact"><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></span>';
    }).join('');

    var body =
      '<span class="record-eyebrow">' + esc(rec.eyebrow || '') + '</span>' +
      '<h2 class="record-name">' + esc(rec.name || '') + '</h2>' +
      (rec.role ? '<p class="record-role">' + esc(rec.role) + '</p>' : '') +
      '<div class="record-rule"></div>' +
      (facts ? '<div class="record-facts">' + facts + '</div>' : '') +
      (rec.copy || []).filter(Boolean).map(function (p) {
        return '<p class="record-copy">' + esc(p) + '</p>';
      }).join('') +
      (rec.list && rec.list.length
        ? '<span class="record-subhead">' + esc(rec.subhead || 'Details') + '</span><ul class="record-list">' +
          rec.list.map(function (li) { return '<li>' + esc(li) + '</li>'; }).join('') + '</ul>'
        : '') +
      (rec.sources && rec.sources.length
        ? '<span class="record-subhead">Sources</span><div class="record-sources">' +
          rec.sources.map(function (s) { return '<span class="record-source">' + esc(s) + '</span>'; }).join('') + '</div>'
        : '');

    byId('record-body').innerHTML = body;
    byId('record-body').scrollTop = 0;
  }

  function stepRecord(delta) {
    var sets = buildRecordSets();
    var list = sets[state.record.set] || [];
    if (!list.length) return;
    state.record.index = (state.record.index + delta + list.length) % list.length;
    paintRecord();
  }

  function closeRecord() { dom.record.classList.add('hidden'); }

  /* ============================================================
     OVERLAY — photo viewer
     ============================================================ */

  function eraPhotos(eraIndex) {
    var out = [];
    eraEvents(eraIndex).forEach(function (ev) {
      (ev.photos || []).forEach(function (src) {
        out.push({ src: src, caption: ev.caption || ev.title, date: ev.date || ev.year });
      });
    });
    return out.length ? out : [{ src: FALLBACK_PHOTO, caption: 'Archive photograph', date: '' }];
  }

  function openLightbox(list, index, collection) {
    if (!list || !list.length) return;
    state.lightbox = { list: list, index: Math.max(0, Math.min(list.length - 1, index || 0)), collection: collection || '' };
    dom.lightbox.classList.remove('hidden');
    paintLightbox();
    resetIdle();
  }

  function paintLightbox() {
    var box = state.lightbox;
    var item = box.list[box.index];
    if (!item) return;
    byId('lightbox-n').textContent = pad2(box.index + 1);
    byId('lightbox-total').textContent = pad2(box.list.length);
    byId('lightbox-collection').textContent = box.collection;
    var img = byId('lightbox-img');
    img.src = item.src;
    img.alt = fix(item.caption || '');
    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = 'zoom-in 380ms var(--ease)';
    byId('lightbox-caption').innerHTML =
      (item.date ? '<span class="cap-date">' + esc(item.date) + '</span>' : '') + esc(item.caption || '');
    byId('lightbox-strip').innerHTML = box.list.map(function (it, i) {
      return '<button class="strip-thumb' + (i === box.index ? ' is-on' : '') + '" data-act="lightbox-jump" data-index="' + i + '">' +
        '<img src="' + esc(it.src) + '" alt="" onerror="this.style.opacity=0" /></button>';
    }).join('');
    var active = qs('.strip-thumb.is-on', byId('lightbox-strip'));
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function stepLightbox(delta) {
    var box = state.lightbox;
    if (!box.list.length) return;
    box.index = (box.index + delta + box.list.length) % box.list.length;
    paintLightbox();
  }

  function closeLightbox() { dom.lightbox.classList.add('hidden'); }

  /* ============================================================
     OVERLAY — film player
     ============================================================ */

  function openFilm(id) {
    var film = filmById(id) || filmList()[0];
    if (!film) return;
    state.films.current = film;
    dom.player.classList.remove('hidden');
    dom.player.classList.add('is-playing');
    byId('player-title').textContent = fix(film.title || '');
    byId('player-sub').textContent = fix(film.subtitle || '');
    byId('player-missing-file').textContent = fix(film.src || '');
    byId('player-missing').classList.add('hidden');
    byId('player-read').classList.toggle('hidden', !film.description);
    byId('player-read').dataset.id = film.id;
    var video = dom.playerVideo;
    video.classList.remove('hidden');
    video.src = film.src;
    video.load();
    var p = video.play();
    if (p && p.catch) p.catch(function () {});
    updatePlayerTime();
    resetIdle();
  }

  function closeFilm() {
    var video = dom.playerVideo;
    try { video.pause(); } catch (e) {}
    video.removeAttribute('src');
    try { video.load(); } catch (e) {}
    dom.player.classList.add('hidden');
    dom.player.classList.remove('is-playing', 'is-idle');
  }

  function toggleFilm() {
    var video = dom.playerVideo;
    if (video.paused) {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
      dom.player.classList.add('is-playing');
    } else {
      video.pause();
      dom.player.classList.remove('is-playing');
    }
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updatePlayerTime() {
    var video = dom.playerVideo;
    var duration = video.duration || 0;
    byId('player-time').textContent = fmtTime(video.currentTime) + ' / ' + fmtTime(duration);
    var pct = duration ? (video.currentTime / duration) * 100 : 0;
    byId('player-scrub-fill').style.width = pct.toFixed(2) + '%';
  }

  /* ============================================================
     IDLE
     ============================================================ */

  function resetIdle() {
    clearTimeout(state.idleTimer);
    clearInterval(state.idleCountTimer);
    if (!dom.idle.classList.contains('hidden')) hideIdle();
    state.idleTimer = setTimeout(startIdle, IDLE_MS);
  }

  function startIdle() {
    if (isOverlayOpen()) { state.idleTimer = setTimeout(startIdle, IDLE_MS); return; }
    state.idleLeft = IDLE_COUNT;
    byId('idle-count').textContent = state.idleLeft;
    dom.idle.classList.remove('hidden');
    clearInterval(state.idleCountTimer);
    state.idleCountTimer = setInterval(function () {
      state.idleLeft -= 1;
      byId('idle-count').textContent = Math.max(0, state.idleLeft);
      if (state.idleLeft <= 0) {
        clearInterval(state.idleCountTimer);
        hideIdle();
        state.stack.length = 0;
        navigate('#/welcome', { replace: true });
      }
    }, 1000);
  }

  function hideIdle() {
    dom.idle.classList.add('hidden');
    clearInterval(state.idleCountTimer);
  }

  function isOverlayOpen() {
    return !dom.player.classList.contains('hidden') || !dom.lightbox.classList.contains('hidden') || !dom.record.classList.contains('hidden');
  }

  function closeTopOverlay() {
    if (!dom.player.classList.contains('hidden')) { closeFilm(); return true; }
    if (!dom.record.classList.contains('hidden')) { closeRecord(); return true; }
    if (!dom.lightbox.classList.contains('hidden')) { closeLightbox(); return true; }
    return false;
  }

  /* ============================================================
     RENDER
     ============================================================ */

  var VIEWS = {
    welcome: viewWelcome,
    history: viewHistory,
    naf: viewNaf,
    chiefs: viewChiefs,
    college: viewCollage,
    films: viewFilms,
    daw: viewDaw
  };

  function render() {
    var route = parseHash();
    var key = route.name;
    if (!VIEWS[key]) key = 'history';

    var section = key === 'welcome' ? WELCOME_SECTION : sectionOf(key);

    var view = VIEWS[key](route.params);
    dom.screen.innerHTML = view.html;
    state.current = key;
    setChrome(section);
    if (view.after) view.after();
    revealAll(dom.screen);

    var scroller = qs('.history-scroll, .chief-wall', dom.screen);
    if (scroller) scroller.scrollTop = 0;

    if (route.params.chief) openRecord('chiefs', (parseInt(route.params.chief, 10) || 1) - 1);
    if (route.params.open) openRecord('college', parseInt(route.params.open, 10) || 0);
    if (route.params.film) openFilm(route.params.film);
  }

  function onHashChange() {
    var next = parseHash().name;
    if (!VIEWS[next]) next = 'history';
    var prev = state.current;
    if (prev && prev !== next && !state.skipCurtain) {
      var section = next === 'welcome' ? WELCOME_SECTION : sectionOf(next);
      showCurtain(section, function () { render(); });
    } else {
      state.skipCurtain = false;
      render();
    }
  }

  /* ============================================================
     EVENTS
     ============================================================ */

  function onClick(ev) {
    var target = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!target) return;
    if (state.suppressClick) { state.suppressClick = false; return; }
    var act = target.dataset.act;
    resetIdle();

    switch (act) {
      case 'go':
        navigate(target.dataset.route || '#/history');
        break;
      case 'home':
        navigate('#/welcome');
        break;
      case 'back':
        goBack();
        break;
      case 'close-app':
        closeTopOverlay();
        navigate('#/welcome');
        break;
      case 'exit-app':
        closeTopOverlay();
        try { window.close(); } catch (err) {}
        break;
      case 'chapter':
        activateChapter(+target.dataset.index);
        break;
      case 'prev-section':
      case 'next-section':
        stepSection(act === 'next-section' ? 1 : -1);
        break;
      case 'moment':
        navigate(hashFor('naf', { era: target.dataset.era, year: target.dataset.year }));
        break;
      case 'lightbox-era':
        openLightbox(eraPhotos(+target.dataset.era), 0, 'Era ' + ROMAN[+target.dataset.era] + ' · ' + (DECADES[+target.dataset.era] || {}).title);
        break;
      case 'lightbox-close':
        closeLightbox();
        break;
      case 'lightbox-prev':
        stepLightbox(-1);
        break;
      case 'lightbox-next':
        stepLightbox(1);
        break;
      case 'lightbox-jump':
        state.lightbox.index = +target.dataset.index;
        paintLightbox();
        break;
      case 'era-select':
        selectEra(+target.dataset.era);
        break;
      case 'era-more':
        enterTimeline(target.dataset.era, target.dataset.year);
        break;
      case 'era-jump':
        var jumpEra = +target.dataset.era;
        var jumpList = eraEvents(jumpEra);
        state.moment = 0;
        enterTimeline(jumpEra, jumpList.length ? jumpList[0].year : DECADES[jumpEra].from);
        break;
      case 'naf-mode':
        if (target.dataset.mode === 'eras') navigate(hashFor('naf', { era: state.era }));
        else {
          var list = eraEvents(state.era);
          var year = state.year || (list.length ? list[0].year : DECADES[state.era].from);
          state.moment = 0;
          enterTimeline(state.era, year);
        }
        break;
      case 'naf-year':
        var list2 = eraEvents(state.era);
        var year2 = +target.dataset.year;
        for (var i2 = 0; i2 < list2.length; i2++) if (list2[i2].year === year2) { state.moment = i2; break; }
        paintTimeline();
        break;
      case 'naf-prev':
        state.moment = (state.moment || 0) - 1;
        paintTimeline();
        break;
      case 'naf-next':
        state.moment = (state.moment || 0) + 1;
        paintTimeline();
        break;
      case 'record':
        openRecord(target.dataset.set || 'chiefs', +target.dataset.index || 0);
        break;
      case 'record-close':
        closeRecord();
        break;
      case 'record-prev':
        stepRecord(-1);
        break;
      case 'record-next':
        stepRecord(1);
        break;
      case 'college-open':
        openRecord('college', +target.dataset.index || 0);
        break;
      case 'chief-scroll':
        stepChiefRail(+target.dataset.delta || 1);
        break;
      case 'daw-flip':
        target.classList.toggle('is-flip');
        break;
      case 'film':
        openFilm(target.dataset.id);
        break;
      case 'film-close':
        closeFilm();
        break;
      case 'film-toggle':
        toggleFilm();
        break;
      case 'film-read':
        openRecord('films', filmIndex(target.dataset.id));
        break;
      case 'film-next':
        openFilm(nextFilmId());
        break;
      case 'idle-stay':
        hideIdle();
        break;
      default:
        break;
    }
  }

  function filmIndex(id) {
    for (var i = 0; i < FILMS.length; i++) if (FILMS[i].id === id) return i;
    return 0;
  }

  function nextFilmId() {
    var list = filmList();
    if (!list.length) return null;
    var current = state.films.current;
    var idx = 0;
    for (var i = 0; i < list.length; i++) if (current && list[i].id === current.id) idx = i;
    return list[(idx + 1) % list.length].id;
  }

  function stepSection(delta) {
    var idx = SECTIONS.map(function (s) { return s.key; }).indexOf(state.current);
    if (idx < 0) idx = delta > 0 ? -1 : 0;
    var next = SECTIONS[(idx + delta + SECTIONS.length) % SECTIONS.length];
    navigate(next.route);
  }

  function onKeyDown(ev) {
    if (ev.key === 'Escape') {
      if (closeTopOverlay()) { ev.preventDefault(); return; }
      if (document.body.dataset.section !== 'history') navigate('#/history');
      return;
    }
    var section = state.current;
    if (section === 'naf' && state.year) {
      if (ev.key === 'ArrowRight') { state.moment = (state.moment || 0) + 1; paintTimeline(); }
      if (ev.key === 'ArrowLeft') { state.moment = (state.moment || 0) - 1; paintTimeline(); }
    } else if (!dom.lightbox.classList.contains('hidden')) {
      if (ev.key === 'ArrowRight') stepLightbox(1);
      if (ev.key === 'ArrowLeft') stepLightbox(-1);
    }
  }

  /* ============================================================
     BOOT
     ============================================================ */

  function boot() {
    dom.stage = byId('stage');
    dom.screen = byId('screen');
    dom.topbar = byId('topbar');
    dom.dock = byId('dock');
    dom.dockItems = byId('dock-items');
    dom.lightbox = byId('lightbox');
    dom.record = byId('record');
    dom.player = byId('player');
    dom.playerVideo = byId('player-video');
    dom.idle = byId('idle');

    scaleStage();
    window.addEventListener('resize', scaleStage);

    dom.stage.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', function () { resetIdle(); }, true);

    var video = dom.playerVideo;
    video.addEventListener('timeupdate', updatePlayerTime);
    video.addEventListener('loadedmetadata', updatePlayerTime);
    video.addEventListener('error', function () {
      if (dom.player.classList.contains('hidden')) return;
      byId('player-missing').classList.remove('hidden');
      video.classList.add('hidden');
    });
    video.addEventListener('click', function () { resetIdle(); toggleFilm(); });

    var scrub = byId('player-scrub');
    scrub.addEventListener('pointerdown', function (ev) {
      var rect = scrub.getBoundingClientRect();
      var duration = video.duration || 0;
      if (!duration) return;
      var ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      video.currentTime = ratio * duration;
      updatePlayerTime();
      resetIdle();
    });

    dom.player.addEventListener('pointermove', function () { resetIdle(); });

    if (!location.hash) history.replaceState(null, '', '#/welcome');
    window.addEventListener('hashchange', onHashChange);

    render();
    resetIdle();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
