/* ===========================================================================
   falcon.js — a small 2D skeletal rig + behaviour state machine.
   No dependencies. Everything is driven from one tick(dt, now).

   Hierarchy (see index.html):
     fx-anchor  -> perch point, fixed in scene coords
       fx-fly   -> flight path: translate + scale
         fx-pitch -> body pitch, about a point near the chest
           parts: wings (2-segment), tail, body, legs, head

   States: ENTER -> LAND -> IDLE -> (scroll) EXIT
   =========================================================================== */
(function (global) {
  'use strict';

  /* ---------- pivots, in the local 400x300 drawing space ---------- */
  var P = {
    shoulder: [205, 112],   // wing root
    elbow:    [269,  52],   // wrist: the midpoint of the edge the two segments share
    neck:     [176, 110],   // head rotates here; the collar hides the joint
    tailBase: [226, 180]
  };
  var PITCH_PIVOT = [4, -74];   // body centre, in anchor space

  /* ---------- helpers ---------- */
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };
  var rand  = function (a, b) { return a + Math.random() * (b - a); };
  var TAU   = Math.PI * 2;

  var ease = {
    outQuint: function (t) { return 1 - Math.pow(1 - t, 5); },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOut:    function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outBack:  function (t) { var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  };

  /* cubic bezier through 2D control points */
  function bez(p0, p1, p2, p3, t) {
    var u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  }

  function rot(el, deg, pivot, extra) {
    el.setAttribute('transform',
      'rotate(' + deg.toFixed(2) + ' ' + pivot[0] + ' ' + pivot[1] + ')' + (extra || ''));
  }

  /* ---------- flap cycle -----------------------------------------------
     Real wingbeats are asymmetric: the downstroke (power) is quick, the
     upstroke (recovery) is slower and the hand folds inward. We warp the
     phase, then give the outer segment a lag so the wing whips.        */
  function warp(p) {
    p = p % 1;
    var DOWN = 0.38;                        // fraction of the cycle spent going down
    return p < DOWN ? (p / DOWN) * 0.5
                    : 0.5 + ((p - DOWN) / (1 - DOWN)) * 0.5;
  }

  function flapAngles(phase, amp) {
    var w  = warp(phase);
    var s  = -Math.cos(w * TAU);            // -1 top .. +1 bottom
    var lw = warp(phase - 0.14);            // outer segment lags
    var ls = -Math.cos(lw * TAU);
    return {
      inner: (-46 + 62 * (s * 0.5 + 0.5)) * amp,   // -46deg up .. +16deg down
      outer: (-34 + 52 * (ls * 0.5 + 0.5)) * amp,  // primaries flex behind
      lift:  -s * 7 * amp                          // body rises on the downstroke
    };
  }

  /* =========================================================================
     Falcon
     ========================================================================= */
  function Falcon(root) {
    var q = function (id) { return root.querySelector('#' + id); };

    this.el = {
      anchor: q('fx-anchor'), fly: q('fx-fly'), pitch: q('fx-pitch'),
      head: q('fx-head'), lid: q('fx-lid'), tail: q('fx-tail'),
      body: q('fx-body'), legs: q('fx-legs'), shadow: q('fx-shadow'),
      folded: q('wing-folded'),
      nearWing: q('wing-near'), wnIn: q('wn-inner'), wnOut: q('wn-outer'),
      farWing:  q('wing-far'),  wfIn: q('wf-inner'), wfOut: q('wf-outer')
    };

    this.state = 'ENTER';
    this.t = 0;               // seconds inside the current state
    this.phase = 0;           // wingbeat phase
    this.open = 0;            // 0 = folded, 1 = wings spread

    /* head — saccade driven */
    this.head = { yaw: 0, pitch: 0, from: [0, 0], to: [0, 0], dur: .16, el: 0, hold: .8 };
    this.blink = { next: rand(2, 5), t: -1 };
    this.tailFlick = { next: rand(6, 14), t: -1 };
    this.ruffle = { next: rand(14, 26), t: -1 };

    this.exitP = 0;           // scroll progress 0..1 for the exit
    this.onState = null;

    this.reset();
  }

  Falcon.prototype.set = function (s) {
    this.state = s; this.t = 0;
    if (this.onState) this.onState(s);
  };

  Falcon.prototype.reset = function () {
    this.phase = 0; this.open = 1; this.exitP = 0;
    this.head.yaw = 0; this.head.pitch = 0; this.head.to = [0, 0]; this.head.from = [0, 0];
    this.head.el = 0; this.head.dur = .2; this.head.hold = .4;
    this.set('ENTER');
  };

  /* ---------- ENTER: swoops in from off-frame right ---------- */
  var ENTER_DUR = 2.7;
  var E0 = [1500, -520], E1 = [900, -620], E2 = [260, -150], E3 = [0, 0];

  /* ---------- EXIT: launches up and to the left ----------
     Control points are deliberately committed early — a launch that idles
     near the perch for the first third of the scroll reads as a stall.   */
  var X0 = [0, 0], X1 = [-320, -140], X2 = [-900, -620], X3 = [-1700, -900];
  /* barely-there ease-in: accelerates, but never stalls at the start */
  function exitEase(g) { return g * (0.7 + 0.3 * g); }

  Falcon.prototype.tick = function (dt, now) {
    this.t += dt;
    var st = this.state;

    var pos = [0, 0], scale = 1, pitch = 0, alpha = 1;
    var flapAmp = 0, flapSpeed = 0, legDrop = 0, spread = 0;

    /* ------------------------------------------------ ENTER */
    if (st === 'ENTER') {
      var t = clamp(this.t / ENTER_DUR, 0, 1);
      var e = ease.outCubic(t);
      pos = bez(E0, E1, E2, E3, e);
      scale = lerp(1.22, 1, e);
      this.open = 1;
      flapAmp = 1;
      flapSpeed = lerp(5.2, 2.4, t);          // slows as it closes in
      pitch = lerp(-14, -2, ease.inOut(t));
      this.idleHead(dt, now);                 // it keeps scanning on the way in

      /* flare: last 18% it pitches back hard, wings brake, feet reach out */
      if (t > 0.82) {
        var f = (t - 0.82) / 0.18;
        pitch = lerp(-2, 26, ease.outCubic(f));
        spread = f;
        legDrop = ease.outCubic(f);
        flapSpeed = lerp(2.4, 1.1, f);
        pos[1] -= 26 * Math.sin(f * Math.PI);   // small lift in the flare
      }
      if (t >= 1) this.set('LAND');
    }

    /* ------------------------------------------------ LAND */
    else if (st === 'LAND') {
      var LD = 0.95, tl = clamp(this.t / LD, 0, 1);
      /* two quick settle bounces, wings fold, body rocks level */
      var bounce = Math.exp(-tl * 7) * Math.sin(tl * 26) * 9;
      pos = [0, -bounce];
      pitch = lerp(26, 0, ease.outBack(clamp(tl * 1.5, 0, 1))) + bounce * 0.4;
      this.open = 1 - ease.outCubic(clamp(tl * 1.9, 0, 1));
      flapAmp = (1 - tl) * 0.55;
      flapSpeed = 1.6;
      legDrop = 1 - ease.outCubic(clamp(tl * 2.2, 0, 1));
      spread = 1 - tl;
      if (tl >= 1) { this.set('IDLE'); this.head.hold = .35; }
    }

    /* ------------------------------------------------ IDLE */
    else if (st === 'IDLE') {
      this.open = 0;
      /* breathing */
      pos = [0, Math.sin(now * 2.1) * 0.7];
      pitch = Math.sin(now * 2.1) * 0.35;
      this.idleHead(dt, now);
    }

    /* ------------------------------------------------ EXIT (scroll-scrubbed) */
    else if (st === 'EXIT') {
      var p = this.exitP;
      /* 0 .. .10  crouch and load the legs; .10 .. 1  the flight arc */
      if (p < 0.10) {
        var c = p / 0.10;
        pos = [0, 6 * Math.sin(c * Math.PI)];
        pitch = lerp(0, -12, c);
        this.open = ease.outCubic(c) * 0.55;
        flapAmp = 0.35 * c;
        flapSpeed = 3;
      } else {
        var g = (p - 0.10) / 0.90;
        pos = bez(X0, X1, X2, X3, exitEase(g));
        scale = lerp(1, 0.52, g);
        pitch = lerp(-12, -22, ease.outCubic(clamp(g * 2, 0, 1)));
        this.open = 1;
        flapAmp = 1;
        /* phase is TIME driven, not scroll driven — so if the user stops
           mid-scroll the bird hovers instead of freezing mid-beat */
        flapSpeed = lerp(6.5, 4.2, g);
        alpha = 1 - clamp((g - 0.72) / 0.28, 0, 1);
      }
      /* keep the head alive on the way out, pointed at the direction of travel */
      this.head.yaw = lerp(this.head.yaw, -10 - 8 * p, clamp(dt * 6, 0, 1));
      this.head.pitch = lerp(this.head.pitch, -6 * p, clamp(dt * 6, 0, 1));
    }

    /* ------------------------------------------------ apply */
    this.phase += dt * flapSpeed;
    var fa = flapAngles(this.phase, flapAmp);
    if (flapAmp > 0.01) pos[1] += fa.lift;

    var E = this.el;

    E.fly.setAttribute('transform',
      'translate(' + pos[0].toFixed(2) + ' ' + pos[1].toFixed(2) + ') scale(' + scale.toFixed(4) + ')');
    E.fly.setAttribute('opacity', alpha.toFixed(3));
    rot(E.pitch, pitch, PITCH_PIVOT);

    /* wings: open pair cross-fades with the folded pair */
    E.nearWing.setAttribute('opacity', this.open.toFixed(3));
    E.farWing.setAttribute('opacity', (this.open * 0.95).toFixed(3));
    E.folded.setAttribute('opacity', (1 - this.open).toFixed(3));

    /* braking flare: wings swing forward and the hand opens wide */
    var brakeIn = spread * -26, brakeOut = spread * 34;
    rot(E.wnIn,  fa.inner + brakeIn,  P.shoulder);
    rot(E.wnOut, fa.outer + brakeOut, P.elbow);
    /* the far wing runs a little behind in phase and at a wider angle, so the
       two never stack into one silhouette */
    rot(E.wfIn,  fa.inner * 0.88 + brakeIn + 17,  P.shoulder);
    rot(E.wfOut, fa.outer * 0.88 + brakeOut + 12, P.elbow);

    /* legs reach out on approach, tuck up in flight */
    var tuck = this.open * (1 - legDrop);
    var legY = legDrop * 8 - tuck * 17;
    E.legs.setAttribute('transform',
      'translate(' + (tuck * 9).toFixed(2) + ' ' + legY.toFixed(2) + ') rotate(' +
      (legDrop * -18 + tuck * 26).toFixed(2) + ' 190 202)');

    /* tail: fans as a brake / rudder, flicks when perched */
    var tailA = spread * -16 + (st === 'EXIT' ? this.exitP * 10 : 0) + this.tailOffset(dt);
    rot(E.tail, tailA, P.tailBase);

    /* head — counter-rotated against body pitch so it stays horizon-locked.
       This is the single most bird-like detail in the whole rig: the body
       banks and pitches, the head does not. */
    var lock = -pitch * 0.78;
    rot(E.head, this.head.yaw + lock, P.neck,
      ' translate(' + (this.head.pitch * -0.55).toFixed(2) + ' ' + (this.head.pitch * 0.9).toFixed(2) + ')');

    /* contact shadow only reads while it is on the perch */
    var near = (st === 'IDLE') ? 1 : (st === 'LAND') ? 1 - this.open : (st === 'EXIT') ? clamp(1 - this.exitP * 4, 0, 1) : 0;
    E.shadow.setAttribute('opacity', (0.45 * near).toFixed(3));
    E.shadow.setAttribute('rx', (54 * lerp(0.7, 1, near)).toFixed(1));

    this.blinkTick(dt);
  };

  /* ---------- idle head: saccades, not sine waves -------------------------
     A falcon's head snaps to a new bearing in ~120ms and then locks dead
     still. That stop is the whole trick — ease OUT hard, never in-out.   */
  Falcon.prototype.idleHead = function (dt, now) {
    var h = this.head;
    h.el += dt;

    if (h.el >= h.dur + h.hold) {
      h.el = 0;
      h.from = [h.yaw, h.pitch];
      var big = Math.random() < 0.22;                 // occasional look right back
      h.to = big
        ? [rand(20, 38) * (Math.random() < .35 ? -1 : 1), rand(-10, 6)]
        : [rand(-16, 16), rand(-8, 9)];
      h.dur  = big ? rand(0.17, 0.26) : rand(0.09, 0.17);
      h.hold = Math.random() < 0.3 ? rand(0.25, 0.7) : rand(0.9, 3.4);
    }

    var k = clamp(h.el / h.dur, 0, 1);
    var e = ease.outQuint(k);
    h.yaw   = lerp(h.from[0], h.to[0], e);
    h.pitch = lerp(h.from[1], h.to[1], e);

    /* head stabilisation micro-motion while holding still */
    if (k >= 1) {
      h.yaw   += Math.sin(now * 1.7) * 0.35 + Math.sin(now * 5.3) * 0.12;
      h.pitch += Math.sin(now * 2.3 + 1.1) * 0.3;
    }
  };

  Falcon.prototype.tailOffset = function (dt) {
    var f = this.tailFlick;
    if (this.state !== 'IDLE') return 0;
    f.next -= dt;
    if (f.next <= 0 && f.t < 0) { f.t = 0; f.next = rand(7, 16); }
    if (f.t >= 0) {
      f.t += dt;
      var k = f.t / 0.34;
      if (k >= 1) { f.t = -1; return 0; }
      return Math.sin(k * Math.PI) * 6 * Math.cos(k * 12);
    }
    return 0;
  };

  Falcon.prototype.blinkTick = function (dt) {
    var b = this.blink;
    if (this.state === 'IDLE' || this.state === 'EXIT') {
      b.next -= dt;
      if (b.next <= 0 && b.t < 0) { b.t = 0; b.next = rand(2.5, 7); }
    }
    var open = 1;
    if (b.t >= 0) {
      b.t += dt;
      var k = b.t / 0.11;
      if (k >= 1) { b.t = -1; }
      else open = Math.abs(Math.cos(k * Math.PI));       // shut and open
    }
    /* lid is a scaleY about the eye centre: 0 = eye visible, 1 = closed */
    var s = 1 - open;
    this.el.lid.setAttribute('transform',
      'translate(158 88) scale(1 ' + s.toFixed(3) + ') translate(-158 -88)');
  };

  global.Falcon = Falcon;
})(window);
