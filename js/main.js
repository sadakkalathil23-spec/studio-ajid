/* ===========================================================================
   main.js — scroll driver + page transition.
   Page 1 lifts, page 2 rises behind it, the falcon exit is scrubbed by the
   same progress value so the three move as one gesture.

   Two rendering paths, chosen automatically:
     assets/plate.jpg present  -> MediaFalcon  (real footage, photoreal)
     absent                    -> Falcon       (vector rig, the placeholder)
   =========================================================================== */
(function () {
  'use strict';

  var page1 = document.getElementById('page1');
  var page2 = document.getElementById('page2');
  var hud   = document.getElementById('hud-state');
  var scene = document.querySelector('.scene');
  var stage = document.getElementById('media-stage');

  if (/\bdebug\b/.test(location.search)) document.body.classList.add('debug');
  /* ?ready — jump straight to the settled hero, no entrance. Deterministic
     for screenshots, and it is what a printed page wants too. */
  if (/\bready\b/.test(location.search))
    document.documentElement.classList.add('settled');

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var vector = null;    // the SVG rig
  var media  = null;    // the footage player

  MediaFalcon.probe(function (have) {
    if (have.media) {
      stage.style.display = 'block';          // .scene stays hidden - no flash
      media = new MediaFalcon(stage);
      media.onState = function (s) { hud.textContent = s + ' (media)'; };
      window.__media = media;
      if (!reduced) media.start(); else media.toIdle();
      return;
    }

    /* vector rig — but if a real plate is already sitting in assets/, use it
       as the backdrop so the painting is real even before the footage is */
    if (have.plate) {
      var g = document.getElementById('plate');
      var im = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      im.setAttribute('href', 'assets/plate.jpg');
      im.setAttribute('width', 1400); im.setAttribute('height', 1130);
      im.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      g.parentNode.replaceChild(im, g);
    }
    scene.style.display = 'block';           // vector fallback: now show it
    vector = new Falcon(document);
    vector.onState = function (s) { hud.textContent = s; };
    window.__falcon = vector;
    if (reduced) { vector.set('IDLE'); vector.open = 0; }
  });

  /* ------------------------------ scroll ---------------------------------- */
  /* How the first viewport of scrolling is shared out. The text owns the first
     TEXT_SPAN of it; the painting starts lifting at LIFT_AT, just before the
     text has finished, so the two overlap rather than queue. */
  var TEXT_SPAN = 0.40, LIFT_AT = 0.34;
  /* Reserve the first mouse-wheel-sized part of the scroll for the falcon.
     The rest of the front-page choreography is remapped to begin only after
     that first step, while still completing at the same end position. */
  var FRONT_MOTION_AT = 0.12;
  /* The one shared crossing speed, in screen-heights of scroll. Every rule on
     the site covers the same distance, so sharing this window is what makes
     them all move at the same rate. */
  var RULE_WIN = parseFloat(getComputedStyle(document.documentElement)
                   .getPropertyValue('--rule-win')) || 0.30;

  var MARK_SPAN = RULE_WIN / (1 - LIFT_AT);

  var progress = 0, target = 0;
  /* A completed flyout never scrubs backward. Once the front page has fully
     left, the first upward movement restores the perched idle state and holds
     it there until the visitor returns to the start. The next descent can then
     play a fresh forward flyout. */
  var falconLeftFront = false;
  var falconHoldIdle = false;
  var falconLastP = 0;

  function readScroll() {
    /* the exit plays across the first viewport-height of scrolling */
    var span = window.innerHeight;
    target = Math.min(1, Math.max(0, window.scrollY / span));
  }
  /* How far the monogram runs in. One source of truth: the distance and the
     moment it starts are both derived from it, so they can never disagree.
     Its run has to happen at the SAME SPEED as the line's leading edge, and
     that edge covers half the viewport across the full progress — so the run
     is LOGO_TRAVEL/(width/2) of it, which depends on the screen. Hence this
     rather than a hard-coded fraction. */
  var LOGO_TRAVEL = 50;
  function setLogoIn() {
    var half = Math.max(1, window.innerWidth / 2);
    document.documentElement.style.setProperty('--logo-travel', LOGO_TRAVEL + 'px');
    document.documentElement.style.setProperty(
      '--logo-in', (1 - Math.min(0.5, LOGO_TRAVEL / half)).toFixed(4));
  }
  /* Do NOT rely on events to get this right. The first measurement can land
     while the window is still laying out — or while the page is hidden, where
     widths are not yet meaningful — and resize/load/visibilitychange all failed
     to correct it in practice: the value stuck at the clamp ceiling for the life
     of the page. The loop below re-derives it whenever the width actually
     changes, which cannot be missed and costs one comparison a frame. */
  var lastW = -1;
  function syncLogoIn() {
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    setLogoIn();
  }
  addEventListener('resize', syncLogoIn);
  syncLogoIn();

  /* Coming back to a backgrounded tab, requestAnimationFrame has been stopped
     and `progress` is stale by however far the page was scrolled meanwhile.
     Letting it smooth from there makes the whole hero lurch through its travel
     in one visible catch-up, and the page-shift that follows the painting spikes
     with it — measured at 983px before settling. Snapping to the true position
     on the way back in means it simply resumes where it is. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    readScroll();
    progress = target;
    last = performance.now() / 1000;      // no giant dt on the first frame back
  });

  addEventListener('scroll', readScroll, { passive: true });
  addEventListener('resize', readScroll);
  readScroll();

  /* ------------------------- every end mark ------------------------------- */
  /* Match the reference site everywhere: each divider and A. plays once when
     it enters the viewport. The animation is time-based, never scroll-scrubbed,
     so mouse-wheel deltas cannot resize, reverse or jitter the mark. */
  var heroEm = document.getElementById('endmark');
  /* Every divider, including the front one, reveals once per page load. The
     class is never removed; refreshing the document creates the only replay. */
  var endmarks = [].slice.call(document.querySelectorAll('.endmark'));
  var studioReveal = document.querySelector('.studio');
  var infoReveal = document.querySelector('.info');
  var endmarkRevealReady = false;
  var runway = document.querySelector('.runway');
  var pagesEl = document.getElementById('pages');

  function revealEndmarks() {
    if (!endmarkRevealReady) return;
    var trigger = window.innerHeight * 0.92;

    /* One-shot: this loop only adds the class and never removes it. */
    for (var i = 0; i < endmarks.length; i++) {
      var mark = endmarks[i];
      if (mark.classList.contains('is-inview')) continue;
      var rect = mark.getBoundingClientRect();
      var isFinalMark = !!mark.closest('.pg--patt');
      /* A deep-page reload may put earlier marks above the viewport. Mark them
         complete as well so scrolling back never reveals an empty divider. */
      /* The final mark has a deliberate 30px gap below it. At maximum scroll
         that keeps its line slightly below the shared 92% trigger on some
         viewport sizes, so reveal it as soon as any part enters the viewport. */
      if (rect.top <= trigger || (isFinalMark && rect.top < window.innerHeight)) {
        mark.classList.add('is-inview');
      }
    }

    /* About content uses the hero navigation's same left-to-right stagger.
       This class is intentionally never removed: it plays once per refresh,
       then the logo and both paragraphs stay locked in their final positions. */
    if (studioReveal && !studioReveal.classList.contains('is-inview')) {
      var studioRect = studioReveal.getBoundingClientRect();
      if (studioRect.top <= trigger) studioReveal.classList.add('is-inview');
    }

    /* The address page follows the same permanent one-shot reveal: heading,
       location line one, location line two, then the appointment line. */
    if (infoReveal && !infoReveal.classList.contains('is-inview')) {
      var infoRect = infoReveal.getBoundingClientRect();
      if (infoRect.top <= trigger) infoReveal.classList.add('is-inview');
    }
  }

  /* The runway is the hero's own travel PLUS the end mark that hangs below the
     painting — measured, not assumed, so the pages come to rest exactly under
     the rule with no seam and no overlap. Anything shorter and page two rides
     up over the rule; anything longer and the white band comes back. */
  function sizeRunway() {
    if (!runway || !heroEm || !page1) return;
    var gap = heroEm.offsetTop - page1.offsetHeight;      // the mark's own margin
    var artMax = window.innerHeight * 0.02;               // half of the 4% zoom
    runway.style.height =
      (window.innerHeight + gap + heroEm.offsetHeight + artMax) + 'px';
  }
  addEventListener('resize', sizeRunway);
  sizeRunway();

  addEventListener('scroll', revealEndmarks, { passive: true });
  addEventListener('resize', revealEndmarks);
  function armEndmarkReveals() {
    /* Wait until the loaded layout has painted twice. During the first paint,
       late image/font sizing can briefly place later marks at the top and fire
       their one-shot animation before the user reaches them. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        endmarkRevealReady = true;
        revealEndmarks();
      });
    });
  }
  function scheduleEndmarkReveals() {
    /* The reel builds its repeated cards just after load. Give that layout one
       short settling window so a later divider cannot briefly cross the trigger
       before the cards establish their final height. */
    setTimeout(armEndmarkReveals, 600);
  }
  if (document.readyState === 'complete') scheduleEndmarkReveals();
  else addEventListener('load', scheduleEndmarkReveals, { once: true });

  /* ------------------------------ loop ------------------------------------ */
  var last = performance.now() / 1000;

  function frame(ms) {
    var now = ms / 1000;
    /* clamp both ends: the top stops tab-switches jumping the animation,
       the bottom stops a non-monotonic clock running it backwards */
    var dt = Math.max(0, Math.min(0.05, now - last));
    last = now;

    /* Geometry must follow the browser's real scroll position exactly. Using a
       smoothed value here made the fixed artwork lag behind the document-flow
       divider and A., which appeared as parallax under mouse-wheel scrolling. */
    progress = target;
    var p = target;

    /* Stage one is falcon-only. Stage two starts after the first scroll step
       and drives every other front-page movement. */
    var sceneP = (p - FRONT_MOTION_AT) / (1 - FRONT_MOTION_AT);
    if (sceneP < 0) sceneP = 0; else if (sceneP > 1) sceneP = 1;

    /* The hero text has to clear the frame BEFORE the painting starts to lift.
       Run them together and the words — which sit at the top of the page — are
       carried off the top of the screen while their own slide is still playing,
       so the one-by-one exit happens where nobody can see it. So the scroll is
       split: the text leaves over the first stretch, the painting takes over
       after, with a slight overlap so the hand-off is not a stop. */
    var te = Math.min(1, sceneP / TEXT_SPAN);                 // text exit
    var pl = Math.max(0, Math.min(1,
      (sceneP - LIFT_AT) / (1 - LIFT_AT)));                  // page lift

    /* page transition */
    page1.style.transform = 'translate3d(0,' + (-pl * 100).toFixed(3) + 'vh,0)';
    page2.style.transform = 'translate3d(0,' + ((1 - pl) * 32).toFixed(3) + 'vh,0)';
    /* page 2 is fully opaque from the start - it rises into place rather
       than fading in, so nothing anywhere on the page dissolves */
    /* a touch of scale on the painting as it leaves reads as depth */
    var s = 1 + pl * 0.04;
    var zoom = 'scale(' + s.toFixed(4) + ')';
    scene.style.transform = zoom;
    if (stage) stage.style.transform = zoom;

    document.documentElement.style.setProperty(
      '--art-shift', (window.innerHeight * (s - 1) / 2).toFixed(2) + 'px');

    if (pl < 1 && heroEm && pagesEl) {
      var applied = parseFloat(
        document.documentElement.style.getPropertyValue('--pages-shift')) || 0;
      var naturalTop = pagesEl.getBoundingClientRect().top - applied;
      var shift = heroEm.getBoundingClientRect().bottom - naturalTop;
      document.documentElement.style.setProperty(
        '--pages-shift', (shift > 0 ? shift : 0).toFixed(2) + 'px');
      document.documentElement.style.setProperty('--mark-trail', '0px');
    } else {
      document.documentElement.style.setProperty('--pages-shift', '0px');
      if (heroEm && pagesEl) {
        var carried = parseFloat(
          document.documentElement.style.getPropertyValue('--mark-trail')) || 0;
        var emNatural = heroEm.getBoundingClientRect().bottom - carried;
        var trail = pagesEl.getBoundingClientRect().top - emNatural;
        document.documentElement.style.setProperty(
          '--mark-trail', (trail < 0 ? trail : 0).toFixed(2) + 'px');
      }
    }

    /* every piece of hero text is driven off this one value... */
    document.documentElement.style.setProperty('--exit', te.toFixed(4));
    /* ...and anything that travels with the painting off this one */
    document.documentElement.style.setProperty('--lift', pl.toFixed(4));

    var mp = pl / MARK_SPAN;
    if (mp < 0) mp = 0; else if (mp > 1) mp = 1;
    mp = mp * mp * (3 - 2 * mp);
    document.documentElement.style.setProperty('--mark-p', mp.toFixed(4));

    /* Hand RAW scroll progress to whichever falcon is live, so takeoff begins
       with the first downward scroll instead of waiting for the later artwork
       lift phase. A partial scroll remains
       scrubbed, but after a COMPLETE departure the return is not played in
       reverse: the bird snaps cleanly to its idle perch and waits there. */
    if (p >= 0.995) falconLeftFront = true;
    if (falconLeftFront && p < falconLastP - 0.0005 && !falconHoldIdle) {
      falconHoldIdle = true;
      if (media) media.toIdle();
      if (vector) {
        vector.exitP = 0;
        vector.set('IDLE');
      }
    }
    if (falconHoldIdle && p <= 0.002) {
      falconHoldIdle = false;
      falconLeftFront = false;
    }

    if (!falconHoldIdle) {
      /* p^0.72 front-loads the sequence: the bird is airborne immediately. */
      if (media) {
        media.scrub(Math.pow(p, 0.72));
      } else if (vector) {
        if (p > 0.004) {
          if (vector.state === 'IDLE') vector.set('EXIT');
          if (vector.state === 'EXIT') vector.exitP = p;
        } else if (vector.state === 'EXIT') {
          vector.exitP = 0;
          vector.set('IDLE');
        }
      }
    }
    if (vector) vector.tick(dt, now);
    falconLastP = p;

    syncLogoIn();
    revealEndmarks();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* wordmark reveal — one frame after paint so the transitions actually run */
  var copy = document.getElementById('heroUi');
  function revealMarks() {
    var fired = false;
    var go = function () {
      if (fired) return;
      fired = true;
      ['markLat', 'markAr'].forEach(function (id) {
        var n = document.getElementById(id);
        if (n) n.classList.add('is-in');
      });
      if (copy) copy.classList.add('is-in');
    };
    /* two frames, not one: the browser has to paint the off-screen start state
       before the class flips, or it coalesces both into a single style
       recalculation and the transition is skipped entirely */
    requestAnimationFrame(function () { requestAnimationFrame(go); });
    /* rAF never fires while the tab is in the background, which would leave the
       studio's own name parked off-screen until the tab was looked at. The
       timer is not throttled the same way, so it guarantees the reveal — and
       whichever runs first wins. */
    setTimeout(go, 260);
  }
  revealMarks();

})();
