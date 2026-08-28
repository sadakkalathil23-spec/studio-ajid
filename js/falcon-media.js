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

    plate: 'assets/plate.jpg',
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

    this.plate = el('img');
    this.plate.src = A.plate;
    stage.appendChild(this.plate);

    if (!ANIMATE) return;

    this.idle = video(A.idle);
    this.idle.loop = true;
    this.idle.style.opacity = 0;
    stage.appendChild(this.idle);

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
    this.enter.style.opacity = 1;
    this.enter.addEventListener('ended', function () { self.toIdle(); });
    var p = this.enter.play();
    if (p && p.catch) p.catch(function () { self.toIdle(); });
  };

  MediaFalcon.prototype.toIdle = function () {
    this.set('IDLE');
    this.idle.style.opacity = 1;
    if (this.enter) this.enter.style.opacity = 0;
    if (this.canvas) this.canvas.style.opacity = 0;
    var p = this.idle.play();
    if (p && p.catch) p.catch(function () {});
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
      this.idle.style.opacity = 0;
      this.idle.pause();
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
