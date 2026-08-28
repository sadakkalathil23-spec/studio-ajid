/* ===========================================================================
   pattern.js — the two drifting pattern bands on the last page.

   Two motions per band, deliberately independent:

     ENTRANCE  plays ONCE. Both bands slide in together from opposite sides
               with the exact duration/easing used by the hero AJID marks.

     DRIFT     driven by the CLOCK, not the scroll. It starts when the band is
               on screen and keeps going for as long as you stay there — the
               whole point is that it never settles. The top band travels right,
               the lower one left, so they cross.

   The loop has no seam because the artwork tiles: the PNG's left and right
   edges match on every row, so copies laid end to end join invisibly. The strip
   is wrapped by exactly one tile width, which means the same few images are
   reused forever rather than the offset growing without bound.
   =========================================================================== */
(function (global) {
  'use strict';

  var SPEED = 24;           // px per second — a slow, continuous drift
  var ENTRANCE_MS = 1400;   // hero delay (.3s) + hero travel (1.1s)

  function Band(root, dir) {
    this.root = root;
    this.dir = dir;                                   // +1 drifts right
    this.slide = root.querySelector('.patt__slide');
    this.run = root.querySelector('.patt__run');
    this.imgs = [].slice.call(root.querySelectorAll('img'));
    this.offset = 0;
    this.tile = 0;
    this.fit();
  }

  /* Lay down as many copies as the frame needs. One tile is wider than the
     screen at this size, but the strip also has to cover the tile-width the
     wrap slides it by — hence the +2 rather than +1. */
  Band.prototype.fit = function () {
    var first = this.imgs[0];
    if (!first || !first.naturalWidth) return false;
    this.tile = first.getBoundingClientRect().width;
    if (!this.tile) return false;

    var need = Math.ceil(this.root.clientWidth / this.tile) + 2;
    while (this.imgs.length < need) {
      var clone = this.imgs[0].cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');      // the strip repeats; do
      this.run.appendChild(clone);                    // not announce it twice
      this.imgs.push(clone);
    }
    return true;
  };

  Band.prototype.onScreen = function () {
    var r = this.root.getBoundingClientRect();
    return r.bottom > 0 && r.top < (global.innerHeight || 0);
  };

  Band.prototype.step = function (dt, driftReady) {
    if (!this.tile && !this.fit()) return;

    /* Drift begins only after the one-time AJID-style entrance has landed. */
    if (driftReady && this.onScreen()) this.offset += SPEED * dt;

    var w = this.offset % this.tile;
    var x = this.dir > 0 ? w - this.tile : -w;
    this.run.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
  };

  function init() {
    var a = document.querySelector('.patt--a');
    var b = document.querySelector('.patt--b');
    if (!a && !b) return;
    var section = (a || b).closest('.pg--patt');

    var bands = [];
    if (a) bands.push(new Band(a, 1));     // top band travels right
    if (b) bands.push(new Band(b, -1));    // lower band travels left

    /* Sizes are only known once the images have decoded. */
    addEventListener('load', function () { bands.forEach(function (x) { x.fit(); }); });
    addEventListener('resize', function () {
      bands.forEach(function (x) { x.tile = 0; x.fit(); });
    });

    var entered = false;
    var driftAt = Infinity;
    var last = performance.now();
    (function frame(now) {
      /* Clamp the step: coming back to a backgrounded tab hands us a gap of
         many seconds, and without this the pattern would leap forward. */
      var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;

      /* Trigger both sides together the first time the pattern reaches the
         viewport. Never remove the class, so scrolling back cannot replay it. */
      if (!entered && section) {
        var r = section.getBoundingClientRect();
        if (r.top < (global.innerHeight || 0) && r.bottom > 0) {
          entered = true;
          driftAt = now + ENTRANCE_MS;
          section.classList.add('is-pattern-in');
        }
      }

      var driftReady = now >= driftAt;
      bands.forEach(function (x) { x.step(dt, driftReady); });
      requestAnimationFrame(frame);
    })(last);

    global.__patternBands = bands;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
