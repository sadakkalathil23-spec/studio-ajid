/* ===========================================================================
   falcon-media.js — the hero's falcon.

   THREE PHASES, in order:

     ENTER  falcon-in.mp4    plays once on load: the bird flies in from the
                             middle-right, comes a little towards the camera,
                             banks back and lands on the sofa arm.
     IDLE   falcon-idle.mp4  loops while nobody scrolls: one fast membrane
                             blink, two small neck movements looking at the
                             horse, and the horse blinks once.
     EXIT   out/0000.webp .. SCROLL-SCRUBBED frame sequence: the bird pushes
                             off and leaves through the middle-left.

   WHY THIS IS SIMPLER THAN IT WAS
   The old rig composited a transparent falcon over a bird-erased plate, which
   needed registration numbers, an erase patch, and per-clip region maths. These
   clips are FULL FRAME renders of the whole painting with the falcon already in
   place, so each one simply replaces the plate. Nothing to line up, nothing to
   drift. The room in them is the painting itself: every frame was matted back
   onto plate.jpg, so outside the falcon they are pixel-identical to the artwork.

   WHY A FRAME SEQUENCE FOR THE EXIT
   Scroll scrubbing needs frame-accurate random access. Seeking a compressed
   video per scroll event stutters; preloaded images do not.
   =========================================================================== */
(function (global) {
  'use strict';

  var A = {
    /* 'animate' the full rig below.
       'plate'   the painting alone, nothing moving — the fallback. */
    mode: 'animate',

    /* The finished painting, falcon included. Only ever shown when there is no
       video to play - it is the still fallback, nothing else. */
    plate: 'assets/plate.jpg',
    /* Frame 0 of falcon-in: the same room with NO falcon. This is the bed the
       clips sit on whenever they are running. */
    room: 'assets/hero-first.webp',
    plateSize: [1920, 1080],

    /* 16:9, so a 16:9 screen fits exactly. Taller viewports crop the sides;
       wider ones crop top and bottom, and this bias keeps the newspaper — which
       carries STUDIO AJID IN MSHEIREB — in frame, giving up empty wall. */
    anchor: 'center 70%',

    enter: ['assets/anim/falcon-in.webm',   'assets/anim/falcon-in.mp4'],
    idle:  ['assets/anim/falcon-idle.webm', 'assets/anim/falcon-idle.mp4'],

    exitDir: 'assets/out/',
    exitCount: 124,
    exitExt: '.webp'
  };

  var ANIMATE = A.mode === 'animate';

  function el(tag) {
    var e = document.createElement(tag);
    e.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;' +
                      /* through a variable so a breakpoint can move the crop:
                         on a phone the frame is far taller than 16:9 and the
                         sides are cut hard, which took most of the falcon with
                         them. See --art-pos in the stylesheet. */
                      'object-fit:cover;object-position:var(--art-pos,' + A.anchor + ');' +
                      'transition:opacity .18s linear';
    return e;
  }

  function video(sources) {
    var v = el('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    sources.forEach(function (s) {
      var so = document.createElement('source');
      so.src = s;
      so.type = /\.webm$/.test(s) ? 'video/webm' : 'video/mp4';
      v.appendChild(so);
    });
    return v;
  }

  /* ---- does the machine actually have the clips? -------------------------
     Without them the hero must still be the finished painting rather than a
     blank frame, so the plate is the floor everything else sits on. */
  function probe(done) {
    var out = { plate: false, media: false };
    var img = new Image();
    img.onload  = function () { out.plate = true;  step(); };
    img.onerror = function () { out.plate = false; step(); };
    img.src = A.plate;

    if (!ANIMATE) { out.media = false; step(); }
    else {
      fetch(A.idle[1], { method: 'HEAD' })
        .then(function (r) { out.media = r.ok; })
        .catch(function () { out.media = false; })
        .then(step);
    }
    var n = 0;
    function step() { if (++n === 2) done(out); }
  }

  function MediaFalcon(stage) {
    this.stage = stage;
    this.state = 'INIT';
    this.exitFrames = [];

    /* THE BED UNDER EVERYTHING, and why it must be empty.
       Every clip here is a full-frame render of this room with the falcon in
       it, and each one is faded in over whatever is beneath. If what is beneath
       is plate.jpg, the painted falcon is showing THROUGH every one of those
       fades - so while the entrance clip flies a bird in from the right, a
       second bird is sitting on the sofa underneath it. That is the doubling.
       It also meant that on a slow connection the sitting bird was all you saw
       until the clip buffered, and then he flew in and landed on himself.
       So when there are clips to play, the bed is the room with NO falcon, and
       the only falcon anywhere is the one in the clip. plate.jpg is kept for
       the case where no video can play at all, which is the one time a painted
       falcon is the right thing to look at. */
    this.plate = el('img');
    this.plate.src = ANIMATE ? A.room : A.plate;
    stage.appendChild(this.plate);

    if (!ANIMATE) return;

    /* THE IDLE LOOP, DOUBLE BUFFERED.
       The clip does not close the way it opens. Measured across its 192 frames,
       the last frame differs from the first by a mean of 1.0/255 over the
       falcon, and 99% of every differing pixel is on the bird - so a plain
       loop:true pops him into a slightly different pose every eight seconds,
       which is the blink. There is no better cut either: every candidate end
       frame from 175 to 191 is off by about the same amount, so trimming buys
       nothing.
       Two copies instead. One plays out while the other starts again from zero
       underneath it, and they cross over. Both ease linearly over the same
       .18s, so they sum to 1 the whole way and the empty room never shows
       between them; the pose difference is a thousandth of full scale, which
       at that speed is invisible. */
    this.idle = video(A.idle);
    this.idle.style.opacity = 0;
    stage.appendChild(this.idle);

    this.idleB = video(A.idle);
    this.idleB.style.opacity = 0;
    stage.appendChild(this.idleB);

    this.idles = [this.idle, this.idleB];

    this.enter = video(A.enter);
    this.enter.style.opacity = 0;
    stage.appendChild(this.enter);

    /* the scrubbed exit draws to a canvas: one image blit per scroll frame */
    this.canvas = el('canvas');
    this.canvas.width = A.plateSize[0];
    this.canvas.height = A.plateSize[1];
    this.canvas.style.opacity = 0;
    this.ctx = this.canvas.getContext('2d');
    stage.appendChild(this.canvas);
  }

  MediaFalcon.prototype.set = function (s) {
    this.state = s;
    if (this.onState) this.onState(s);
  };

  MediaFalcon.prototype.preloadExit = function () {
    var self = this;
    for (var i = 0; i < A.exitCount; i++) {
      var im = new Image();
      im.src = A.exitDir + ('0000' + i).slice(-4) + A.exitExt;
      self.exitFrames.push(im);
    }
  };

  MediaFalcon.prototype.start = function () {
    if (!ANIMATE) { this.set('IDLE'); return; }
    var self = this;
    this.preloadExit();

    /* The entrance plays once, then hands over to the loop. If it cannot play
       — an autoplay block, a missing file — go straight to idle rather than
       leaving the hero on a still frame. */
    this.set('ENTER');
    var v = this.enter;

    /* Reveal on 'playing', not on the call to play(). readyState and the
       promise both resolve before the first frame is on screen; 'playing' is
       the event that means pixels are moving. Revealing any earlier shows an
       empty video box over the pre-roll. */
    var shown = false;
    function show() {
      if (shown) return;
      shown = true;
      v.style.opacity = 1;
    }
    function giveUp() {
      /* Nothing to play. The empty room is not a finished picture, so put the
         painting back before handing over. */
      self.plate.src = A.plate;
      self.toIdle();
    }

    v.addEventListener('playing', show);
    v.addEventListener('ended', function () { self.toIdle(); });

    /* A phone on a poor connection can sit on this for a long time. Rather than
       hold an empty room indefinitely, fall through to the painting and the
       idle loop, which is the same thing the no-video path shows. */
    var bail = setTimeout(function () { if (!shown) giveUp(); }, 8000);
    v.addEventListener('playing', function () { clearTimeout(bail); });

    var p = v.play();
    if (p && p.catch) p.catch(function () { clearTimeout(bail); giveUp(); });
  };

  /* Hand the loop from whichever copy is playing to the other one, starting it
     from the top. Called a fade's length before the current copy runs out. */
  MediaFalcon.prototype.rollIdle = function () {
    var cur = this.idle, nxt = this.idleB;
    nxt.currentTime = 0;
    var p = nxt.play();
    if (p && p.catch) p.catch(function () {});
    nxt.style.opacity = 1;
    cur.style.opacity = 0;          // cur keeps playing to its last frame
    this.idle = nxt;
    this.idleB = cur;
  };

  /* Watch the live copy and roll it over before it ends. timeupdate is far too
     coarse for this - it fires about four times a second, and the window here
     is under two tenths. */
  MediaFalcon.prototype.watchIdle = function () {
    var self = this, FADE = 0.18;
    cancelAnimationFrame(this.idleRaf);
    function tick() {
      self.idleRaf = requestAnimationFrame(tick);
      if (self.state !== 'IDLE') return;
      var v = self.idle;
      if (!v.duration || !isFinite(v.duration)) return;
      if (v.currentTime >= v.duration - FADE) self.rollIdle();
    }
    this.idleRaf = requestAnimationFrame(tick);
  };

  MediaFalcon.prototype.toIdle = function () {
    /* The original crossfade, restored. Two layers easing opacity linearly over
       the same .18s always sum to exactly 1 - one rises by whatever the other
       gives up - so the bed is never exposed between them and there is nothing
       here that needed 'fixing'. The doubled falcon was never this handover; it
       was the painted plate underneath, which is now an empty room. Cutting
       instead of fading only removed the cover over the seam where the
       entrance's last frame and the loop's first frame do not quite agree, and
       put a visible jump on the landing. */
    this.set('IDLE');

    /* A LONG dissolve out of the entrance, not the standard .18s.

       The two clips do not join. Measured over the falcon: the entrance's last
       frame differs from the idle's first by a mean of 5.0/255 with ~15,000
       pixels off, and that is not a timing problem or an alignment one - a
       search over every rigid shift finds 0,0 is already the best, and a scan
       of all 192 idle frames finds nothing closer than 4.25. He simply ends the
       fly-in upright with his head raised and opens the loop crouched with his
       head forward. Two different postures, baked into the renders.

       Nothing in code can make those two frames the same. What code can do is
       choose how long the eye is given to cross between them: at .18s it reads
       as a jump, at .7s it reads as the bird settling after landing, which is
       what he would actually do. This is mitigation, not a fix - the fix is a
       re-rendered idle clip that opens on the landing pose. */
    var LAND = '.7s';
    var pair = [this.idle, this.enter];
    pair.forEach(function (v) {
      if (v) v.style.transition = 'opacity ' + LAND + ' linear';
    });
    setTimeout(function () {
      pair.forEach(function (v) {
        if (v) v.style.transition = 'opacity .18s linear';
      });
    }, 900);

    this.idle.style.opacity = 1;
    if (this.enter) this.enter.style.opacity = 0;
    if (this.canvas) this.canvas.style.opacity = 0;
    var p = this.idle.play();
    if (p && p.catch) p.catch(function () {});
    this.watchIdle();
  };

  /* p runs 0 (perched) -> 1 (gone), driven by scroll in main.js */
  MediaFalcon.prototype.scrub = function (p) {
    if (!ANIMATE) return;

    if (p <= 0.002) {                       // back at rest
      if (this.state === 'EXIT') this.toIdle();
      return;
    }
    if (this.state !== 'EXIT') {
      this.set('EXIT');
      this.canvas.style.opacity = 1;
      /* both copies, not just the live one - the other may be mid-crossover */
      this.idles.forEach(function (v) { v.style.opacity = 0; v.pause(); });
    }
    var i = Math.round(p * (A.exitCount - 1));
    i = i < 0 ? 0 : i > A.exitCount - 1 ? A.exitCount - 1 : i;
    var im = this.exitFrames[i];
    if (im && im.complete && im.naturalWidth) {
      this.ctx.drawImage(im, 0, 0, this.canvas.width, this.canvas.height);
    }
  };

  MediaFalcon.probe = probe;
  global.MediaFalcon = MediaFalcon;
})(window);
