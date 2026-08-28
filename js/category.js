/* ===========================================================================
   category.js — the index page behind Projects, Gallery and Objects.

   ONE page serves all three. Which one it is comes from the query string
   (?c=projects), so there is a single template to change rather than three
   files that drift apart. Everything below is a placeholder: the names are
   stand-ins so the layout can be judged with real-length words in it, and the
   picture holders are the same sand rectangles the reel uses. Swapping in the
   real work means editing SETS and dropping an `img` in each holder — no
   layout change.

   It runs BEFORE lang.js on purpose. The heading and every caption are written
   out carrying their own `data-ar`, so by the time lang.js sweeps the document
   they are already there and Arabic applies to them like any other string.
   =========================================================================== */
(function (global) {
  'use strict';

  /* Placeholder copy. Each entry is [English, Arabic] — the real titles will
     replace these; the shape of the page does not depend on them. */
  var SETS = {
    projects: {
      title: ['Projects', 'مشاريع'],
      items: [
        ['Majlis Residence',  'مجلس سكني'],
        ['Msheireb Townhouse', 'منزل مشيرب'],
        ['Pearl Apartment',   'شقة اللؤلؤة'],
        ['Al Wakrah Villa',   'فيلا الوكرة'],
        ['Souq Guest House',  'دار ضيافة السوق'],
        ['Lusail Penthouse',  'بنتهاوس لوسيل']
      ]
    },
    gallery: {
      title: ['Gallery', 'معرض'],
      items: [
        ['Interiors', 'فراغات'],
        ['Details',   'تفاصيل'],
        ['Materials', 'خامات'],
        ['Light',     'ضوء'],
        ['Craft',     'حرفة'],
        ['Site',      'موقع']
      ]
    },
    residential: {
      title: ['Residential', 'سكني'],
      items: [
        ['Family Villa',    'فيلا عائلية'],
        ['Majlis',          'مجلس'],
        ['Courtyard House', 'بيت بفناء'],
        ['Master Suite',    'جناح رئيسي'],
        ['City Apartment',  'شقة في المدينة'],
        ['Roof Terrace',    'سطح']
      ]
    },
    hospitality: {
      title: ['Hospitality', 'ضيافة'],
      items: [
        ['Hotel Lobby',   'بهو فندق'],
        ['Restaurant',    'مطعم'],
        ['Café',          'مقهى'],
        ['Spa',           'منتجع صحي'],
        ['Ballroom',      'قاعة احتفالات'],
        ['Guest Suite',   'جناح ضيوف']
      ]
    },
    objects: {
      title: ['Objects', 'قطع'],
      items: [
        ['Scroll Stool',    'مقعد اللفافة'],
        ['Falcon Console',  'كونسول الصقر'],
        ['Sadu Bench',      'مقعد السدو'],
        ['Terrazzo Table',  'طاولة تيرازو'],
        ['Brass Sconce',    'إضاءة نحاسية'],
        ['Clay Vessel',     'إناء طيني']
      ]
    }
  };

  var which = (new URLSearchParams(location.search).get('c') || '').toLowerCase();
  var set = SETS[which] || SETS.projects;

  /* ---- heading ---------------------------------------------------------- */
  var h = document.getElementById('catTitle');
  if (h) {
    h.textContent = set.title[0];
    h.setAttribute('data-ar', set.title[1]);
  }
  /* The tab, too. lang.js sweeps every [data-ar] in the document — <head>
     included — so marking the title element is all this takes; setting
     document.title alone would have left the tab in English under Arabic. */
  var t = document.querySelector('title');
  if (t) {
    t.textContent = set.title[0] + ' — AJID';
    t.setAttribute('data-ar', set.title[1] + ' — عجيد');
  }

  /* ---- the picture holders ---------------------------------------------- */
  var grid = document.getElementById('catGrid');
  if (grid) {
    set.items.forEach(function (item, i) {
      var fig = document.createElement('figure');
      fig.className = 'cat__cell';
      /* the stagger: each cell opens one beat after the one before it */
      fig.style.setProperty('--i', i);

      var mask = document.createElement('div');
      mask.className = 'cat__in';
      var img = document.createElement('div');
      img.className = 'cat__img';                 // drop the real <img> in here
      mask.appendChild(img);

      var cap = document.createElement('figcaption');
      cap.className = 'cat__name';
      cap.textContent = item[0];
      cap.setAttribute('data-ar', item[1]);

      fig.appendChild(mask);
      fig.appendChild(cap);
      grid.appendChild(fig);
    });
  }

  /* ---- this page's end mark ---------------------------------------------
     The same rule and monogram that close every other page, moving at the same
     rate: the shared window out of the stylesheet, smoothstepped so it leaves
     and arrives at rest rather than stopping dead on the clamp. main.js is not
     loaded here — it is the hero's driver and there is no hero — so the few
     lines it would have contributed live here instead. */
  var RULE_WIN = parseFloat(getComputedStyle(document.documentElement)
                   .getPropertyValue('--rule-win')) || 0.42;
  var MARK_END = 0.24;
  var marks = [].slice.call(document.querySelectorAll('.endmark'));

  function updateMarks() {
    var vh = global.innerHeight || 1;
    for (var i = 0; i < marks.length; i++) {
      var top = marks[i].getBoundingClientRect().top;
      var q = (vh * (1 - MARK_END + RULE_WIN) - top) / (vh * RULE_WIN);
      q = q < 0 ? 0 : q > 1 ? 1 : q;
      q = q * q * (3 - 2 * q);
      marks[i].style.setProperty('--p', q.toFixed(4));
    }
  }

  addEventListener('scroll', updateMarks, { passive: true });
  addEventListener('resize', updateMarks);
  updateMarks();

  global.__category = { which: which, set: set };
})(window);
