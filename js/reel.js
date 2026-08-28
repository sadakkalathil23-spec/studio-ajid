/* ===========================================================================
   reel.js — the four-card reel on section three.

   Two behaviours, kept apart so they never interfere:

     REVEAL    each card opens as a clipped wipe, top-down, with the picture
               inside counter-sliding down 30% of its own height as the mask
               opens — the depth comes from those two moving against each other.
               Scroll position advances a high-water latch: it plays forward on
               the way down, then stays fully revealed until the page refreshes.

     LOOP      the row is dragged sideways and wraps forever — a card leaving
               the left edge reappears at the right. Rather than physically
               reordering anything, every card's x is taken modulo the strip's
               total length, so a card is simply DRAWN wherever the maths puts
               it. Nothing is ever appended or removed while dragging.

   The four cards in the markup are not enough to fill a wide frame once they
   start moving, so the set is cloned as many times as the frame needs. Without
   that, panning opens a hole where the strip runs out.
   =========================================================================== */
(function (global) {
  'use strict';

  var FRICTION = 0.94;      // how quickly a flick runs down
  var MIN_VEL = 0.05;       // below this the glide is over
  /* Where the cards settle below page two's rule. The rule and monogram of
     this page hang off the cards (the reel is sized from REST), so moving
     this moves the whole group — cards, rule and logo — as one. */
  /* The cards used to hang a long way down inside the reel, because the reveal
     was a drop from behind page two's rule and needed that room. The reveal is
     a clip wipe now — self-contained in each card — so the drop is dead weight,
     and it was the empty space that stopped the section centring. The reel is
     now exactly card height, and the whole group is centred by CSS. */
  var REST = 0;
  var TAIL = 0.015625;      // gap from the cards' bottom to this page's rule: 30 / 1920
  var STEP = 0.12;          // how far apart the four reveals are, in scroll
  var SPAN = 0.50;          // how much scroll one card's reveal takes
  var LEAD = 0.80;          // the whole sequence runs over this much of a screen
  /* Brings the whole sequence forward — start AND finish — by this much of a
     screen. It shifts the window rather than shortening it, so the cascade and
     the rule keep exactly the speed they had; they simply happen sooner. */
  var EARLY = 0.125;
  var RETURN = 0.28;        // the first slice: the row slides back to Projects-first

  function wrap(v, min, span) {
    return ((v - min) % span + span) % span + min;
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* Scroll the page there ourselves rather than asking the browser for
     `behavior:'smooth'`. The native one is not ours to control: its easing and
     duration are the browser's, it does nothing at all while the tab is not
     compositing, and it lands whenever it feels like it. This runs on the same
     smoothstep every other movement on this site uses, so it leaves and arrives
     at rest, and it always ends exactly on the number it was given.

     Any real input from the visitor — wheel, touch, a key — hands control
     straight back; being dragged to a destination you no longer want is worse
     than the jump this replaces. */
  /* Where to stop so a section READS well, which is not the same as its top.
     Page two carries a deliberate 26% top padding — page two.psd puts the badge
     500 down in a 1920 frame — so aligning its top edge parks 410px of white
     above the monogram and shoves the rule to 86% of the screen. What matters
     is the content: the block from the copy down to the rule, centred in the
     window. Being a proportion rather than a pixel figure, it holds at any
     size instead of only on the screen it was measured on. */
  function restingScroll(el) {
    var y0 = (global.pageYOffset || 0);
    var mark = el.querySelector ? el.querySelector('.endmark') : null;
    var body = el.firstElementChild;
    var y;

    if (mark && body && body !== mark) {
      var top = body.getBoundingClientRect().top + y0;
      var bottom = mark.getBoundingClientRect().bottom + y0;
      y = top - Math.max(0, (global.innerHeight - (bottom - top)) / 2);
    } else {
      y = el.getBoundingClientRect().top + y0;
    }

    var max = document.documentElement.scrollHeight - global.innerHeight;
    return Math.round(Math.max(0, Math.min(y, max)));
  }

  function glideTo(y) {
    var start = global.pageYOffset || document.documentElement.scrollTop || 0;
    var dist = y - start;
    if (Math.abs(dist) < 1) return;

    /* long enough to read as travel, short enough not to be a wait */
    var ms = Math.max(450, Math.min(1000, Math.abs(dist) * 0.55));
    var t0 = null, live = true;
    var stop = function () { live = false; };
    var opts = { passive: true, once: true };
    ['wheel', 'touchstart', 'keydown'].forEach(function (t) {
      addEventListener(t, stop, opts);
    });

    requestAnimationFrame(function step(now) {
      if (!live) return;
      if (t0 === null) t0 = now;
      var t = clamp01((now - t0) / ms);
      var e = t * t * (3 - 2 * t);
      global.scrollTo(0, Math.round(start + dist * e));
      if (t < 1) requestAnimationFrame(step);
      else ['wheel', 'touchstart', 'keydown'].forEach(function (k) {
        removeEventListener(k, stop, opts);
      });
    });
  }

  /* Flat at both ends, so anything driven through it leaves rest and arrives at
     rest. A plain clamped ramp instead runs at a constant rate and then stops
     dead on the clamp — full speed to nothing between two frames, which is what
     reads as a jump however small the distance. */
  function ease(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

  /* The one shared crossing speed, in screen-heights of scroll, so this page's
     rule moves at exactly the rate every other rule on the site does. */
  var RULE_WIN = parseFloat(getComputedStyle(document.documentElement)
                   .getPropertyValue('--rule-win')) || 0.30;

  function Reel(root) {
    this.root = root;
    /* this page's own end mark, which this file drives rather than main.js */
    this.mark = root.parentNode ? root.parentNode.querySelector('.endmark') : null;
    this.originals = [].slice.call(root.children);
    this.n = this.originals.length;
    if (!this.n) return;

    this.offset = 0;
    this.vel = 0;
    /* The high-water mark of the reveal. Progress only ever goes up, so the
       four cards open once and stay open — see progress(). */
    this.qTop = 0;
    this.dragging = false;
    this.raf = 0;

    this.build();
    this.bind();
    this.tick();
  }

  /* Clone the set until the strip is comfortably longer than the frame, so
     there is always a card ready to come in at either edge. */
  Reel.prototype.build = function () {
    var W = this.root.clientWidth || 1;
    var probe = this.originals[0].getBoundingClientRect();
    var gapPct = parseFloat(
      getComputedStyle(this.root).getPropertyValue('--reel-gap')) || 0;
    this.gap = W * gapPct / 100;
    this.cardW = probe.width || W * 0.25;
    this.pitch = this.cardW + this.gap;

    var setLen = this.n * this.pitch;
    var need = W + this.pitch * 2;
    var copies = Math.max(2, Math.ceil(need / setLen) + 1);

    /* rebuild only when the copy count actually changes, so a resize does not
       throw away the cards mid-drag */
    if (this.copies !== copies) {
      this.copies = copies;
      while (this.root.children.length > this.n) {
        this.root.removeChild(this.root.lastChild);
      }
      for (var c = 1; c < copies; c++) {
        for (var i = 0; i < this.n; i++) {
          var clone = this.originals[i].cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');   // the set repeats; do
          clone.setAttribute('tabindex', '-1');        // not read it twice, and
          this.root.appendChild(clone);                // not stop on it twice
        }
      }
      this.cards = [].slice.call(this.root.children);
    }

    /* The cards are links. Press one and move, and the browser starts its OWN
       drag-and-drop on the link — complete with a ghost image — which fires
       pointercancel and kills the pan before it has begun. Back when these were
       plain divs the worst that happened was a text selection, which pointer
       events survive. So the native drag has to go, on the clones too. */
    for (var d = 0; d < this.cards.length; d++) {
      this.cards[d].setAttribute('draggable', 'false');
    }

    this.span = this.cards.length * this.pitch;
    /* Flush to the frame: four 474s and three 8px gaps come to exactly 1920, so
       the row fills the width edge to edge with air between the cards. */
    this.origin = 0;

    /* How far below the masking line the cards come to rest. The CSS needs it
       too — the drop starts at minus (this + the card's own height), which is
       what puts the card completely behind the line before it sets off. */
    this.rest = W * REST;
    this.root.style.setProperty('--rest', this.rest.toFixed(2) + 'px');

    /* Exactly the cards' height. The 30px to the rule is the end mark's own
       margin, so the two centre as one block. */
    this.cardH = this.cardW * 9 / 16;
    this.root.style.height = this.cardH.toFixed(2) + 'px';
    this.draw();
  };

  Reel.prototype.draw = function () {
    var min = -this.pitch;
    for (var k = 0; k < this.cards.length; k++) {
      var x = wrap(this.origin + k * this.pitch - this.offset, min, this.span);
      this.cards[k].style.transform =
        'translate3d(' + x.toFixed(2) + 'px,' + this.rest.toFixed(2) + 'px,0)';
    }
  };

  /* How far the section has come up the screen, 0 before it arrives and 1 once
     it is properly in view. Everything about the reveal hangs off this. */
  Reel.prototype.progress = function () {
    var vh = window.innerHeight || 1;
    /* Measure from where the CARDS are, not from the container's top. The reel
       starts at page two's rule and the cards hang `rest` below it, so the
       container crosses into view while page two still fills the screen — timed
       against that, the whole reveal finished before a single card was visible
       (88% done with the cards still under the fold) and all anyone ever saw
       was the settled state. */
    var top = this.root.getBoundingClientRect().top + this.rest;
    var q = (vh * (1 + EARLY) - top) / (vh * LEAD);
    q = q < 0 ? 0 : q > 1 ? 1 : q;

    /* ONE WAY ONLY. Projects, Gallery, Objects and About open once and then
       stay open: scrolling back up must not wipe them shut again, and coming
       down a second time must not re-run the cascade. Latching the progress
       here rather than at each use keeps the cards, the rule and the monogram
       on one clock — they were all reading this number, so they all stop
       reversing together and cannot drift out of step.

       It also settles what happens to a row the visitor has dragged. The
       roll-home branch in reveal() only runs below RETURN, which this can no
       longer fall back to, so the row stays exactly where it was left instead
       of sliding back to Projects-first the moment the section leaves the
       screen. The drag, the flick and the wrap are all untouched. */
    if (q < this.qTop) return this.qTop;
    this.qTop = q;
    return q;
  };

  Reel.prototype.reveal = function () {
    var q = this.progress();
    var setLen = this.n * this.pitch;

    if (q >= RETURN || this.dragging) {
      /* In view and the visitor's to move. Remember where they left it, folded
         to the shortest equivalent rotation — after a few flicks the raw offset
         can be thousands of pixels, and sliding all of that back would crawl.
         Folding by a whole set changes nothing on screen, because the labels
         repeat, so this can be done without any visible jump. */
      if (setLen > 0) {
        var o = ((this.offset % setLen) + setLen) % setLen;
        if (o > setLen / 2) o -= setLen;
        this.offset = o;
      }
      this.home = this.offset;
    } else {
      /* Rolling in or out. The row slides back to Projects-first ON THE SCROLL —
         not on a timer — so it is reversible and lands in step with the page,
         and it finishes BEFORE the first card starts to reveal. Easing it per
         frame instead made it drift home at its own pace, unrelated to how fast
         you were moving. */
      this.offset = this.home * (1 - ease(q / RETURN));
      if (q <= 0) this.home = 0;      // home once, then stay canonical
      this.vel = 0;
      this.draw();
    }

    /* The reveal owns the rest of the travel, so nothing wipes open until the
       row has come back to order. */
    var qr = (q - RETURN) / (1 - RETURN);
    if (qr < 0) qr = 0; else if (qr > 1) qr = 1;

    for (var k = 0; k < this.cards.length; k++) {
      var i = k % this.n;                       // clones follow their own card
      var r = ease((qr - i * STEP) / SPAN);
      this.cards[k].style.setProperty('--hide', (1 - r).toFixed(4));
    }

    /* The rule and the monogram below the cards are driven from the SAME
       progress, scaled so they finish on the exact scroll where the last card
       finishes revealing. Left to the generic page-mark driver they ran on
       their own schedule and landed at an unrelated moment. */
    if (this.mark) {
      /* Ends exactly where the last card ends, but crosses over the SHARED
         window, so it travels at the same rate as every other rule rather than
         being stretched across this page's much longer reveal. */
      var done = RETURN + (1 - RETURN) * ((this.n - 1) * STEP + SPAN);
      var winQ = RULE_WIN / LEAD;               // the window, in this page's q
      var mp = ease((q - (done - winQ)) / winQ);
      this.mark.style.setProperty('--p', mp.toFixed(4));
    }
  };

  /* One loop for both jobs: momentum from a flick, and the scroll-linked
     reveal. The reveal has to run every frame regardless of scroll events,
     because the section is also moved by the hero's own transition. */
  Reel.prototype.tick = function () {
    var self = this;
    var step = function () {
      if (!self.dragging && self.vel) {
        self.vel *= FRICTION;
        if (Math.abs(self.vel) < MIN_VEL) self.vel = 0;
        else { self.offset += self.vel; self.draw(); }
      }
      self.reveal();
      self.raf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(step);
  };

  Reel.prototype.bind = function () {
    var self = this, lastX = 0, lastT = 0, id = null;
    /* The cards are links now, so a pan across the row would otherwise finish by
       opening whichever card the finger happened to lift over. Distance since
       the pointer went down decides which it was: past this many pixels it was
       a drag, and the click that follows is swallowed. */
    var SLOP = 6, moved = 0, suppress = false, held = false;

    this.root.addEventListener('pointerdown', function (e) {
      /* A pointerup can go missing — the pointer leaves the window, or the OS
         takes the gesture. Returning early here meant `id` stayed set for good
         and the reel could never be grabbed again. Take the new pointer over
         instead of refusing it. */
      if (id !== null) {
        try { if (self.root.hasPointerCapture(id)) self.root.releasePointerCapture(id); }
        catch (err) {}
      }
      id = e.pointerId;
      self.dragging = true;
      self.vel = 0;
      moved = 0;
      /* Clear it on every fresh press. It used to be read straight off `moved`
         at click time, and `moved` was only ever reset here — so a gesture that
         ended in pointercancel (which is exactly what the native link drag did)
         left it high, and the next genuine click was eaten. */
      suppress = false;
      /* Do NOT cancel the frame loop here. It used to drive only the momentum
         glide, so stopping it on grab was right; it now also drives the reveal,
         and killing it meant that after one drag the cards never revealed again
         on any later scroll. Zeroing the velocity is all a grab needs. */
      lastX = e.clientX; lastT = e.timeStamp;
      /* Capture is deliberately NOT taken here. Capturing retargets every later
         pointer event — and the click that follows them — to the capturing
         element, so a press on a card arrived at .reel instead of at the link
         and the card simply would not open. It is taken below, once the gesture
         has proved itself a drag, which is the only time it is needed. */
    });

    this.root.addEventListener('pointermove', function (e) {
      if (!self.dragging || e.pointerId !== id) return;
      var dx = e.clientX - lastX;
      var dt = Math.max(1, e.timeStamp - lastT);
      moved += Math.abs(dx);
      if (!held && moved > SLOP) {
        /* Now it is a drag: hold the pointer so it can leave the reel without
           the row stopping dead, and show the closed hand. */
        held = true;
        self.root.classList.add('is-dragging');
        try { self.root.setPointerCapture(id); } catch (err) {}
      }
      self.offset -= dx;
      /* carry the pointer's own speed into the glide, so letting go feels like
         releasing something already moving */
      self.vel = -dx / dt * 16;
      lastX = e.clientX; lastT = e.timeStamp;
      self.draw();
    });

    var release = function (e) {
      if (!self.dragging || (id !== null && e.pointerId !== id)) return;
      /* decide here, while we still know what this gesture was */
      suppress = moved > SLOP;
      self.dragging = false;
      self.root.classList.remove('is-dragging');
      if (held && id !== null) {
        try {
          if (self.root.hasPointerCapture(id)) self.root.releasePointerCapture(id);
        } catch (err) {}
      }
      held = false;
      id = null;
    };
    this.root.addEventListener('pointerup', release);
    this.root.addEventListener('pointercancel', release);

    this.root.addEventListener('click', function (e) {
      if (suppress) { suppress = false; e.preventDefault(); return; }
      var a = e.target.closest && e.target.closest('.reel__card');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (href.charAt(0) !== '#') return;               // a real page: let it go

      /* About lives further UP this same page. Left to the browser that is an
         instant jump backwards, which after all this scrolling reads as the
         page breaking rather than moving. Take it there instead. */
      var el = document.querySelector(href);
      if (!el) return;
      e.preventDefault();
      glideTo(restingScroll(el));
    });

    /* trackpads and horizontal wheels drive it too — but only when the gesture
       is genuinely sideways, or the page could no longer be scrolled over it */
    this.root.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      self.offset += e.deltaX;
      self.vel = e.deltaX * 0.4;
      self.draw();
    }, { passive: false });

    addEventListener('resize', function () { self.build(); });
  };

  /* No trigger to arm: the reveal is a function of where the page is. */

  function init() {
    var root = document.getElementById('reel');
    if (root) global.__reel = new Reel(root);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
