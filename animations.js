/* ============================================================================
 * animations.js  —  reusable motion + particle helpers
 * ----------------------------------------------------------------------------
 * Everything here is DOM/CSS driven (no canvas). Particles are short-lived
 * absolutely-positioned elements appended to #fx and auto-removed.
 *
 * Public API: HS.FX
 *   .wait(ms)                         -> Promise
 *   .raf()                            -> next animation frame Promise
 *   .sparkleBurst(x, y, opts)         -> star sparkles at stage coords
 *   .confetti(opts)                   -> celebratory confetti rain
 *   .ringBurst(x, y, color)           -> expanding ring shockwave
 *   .floatStars(el, count)            -> ambient stars rising from element
 *   .shake(el)                        -> friendly error shake
 *   .pulse(el)                        -> quick attention pulse
 *   .centerOf(el)                     -> {x,y} in stage coordinate space
 * ========================================================================== */
window.HS = window.HS || {};

HS.FX = (function () {
  'use strict';

  var STAGE_W = 1280, STAGE_H = 720;
  var COLORS = ['#FFD54A', '#FF8A3D', '#7CE7B0', '#5FC8FF', '#FF6FB5', '#C18BFF', '#FFFFFF'];

  function fxLayer() { return document.getElementById('fx'); }

  function wait(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }
  function raf() {
    return new Promise(function (res) { requestAnimationFrame(function () { res(); }); });
  }

  // Convert a real DOM element's screen rect into the stage's 1280x720 space,
  // so particle coords line up regardless of the global scale transform.
  function centerOf(el) {
    var stage = document.getElementById('stage');
    var sr = stage.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    var scaleX = STAGE_W / sr.width;
    var scaleY = STAGE_H / sr.height;
    return {
      x: (r.left - sr.left + r.width / 2) * scaleX,
      y: (r.top - sr.top + r.height / 2) * scaleY,
      w: r.width * scaleX,
      h: r.height * scaleY
    };
  }

  function makeEl(cls) {
    var d = document.createElement('div');
    d.className = cls;
    return d;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  /* ---- sparkle burst ---------------------------------------------------- */
  function sparkleBurst(x, y, opts) {
    opts = opts || {};
    var n = opts.count || 14;
    var spread = opts.spread || 120;
    var layer = fxLayer();
    for (var i = 0; i < n; i++) {
      (function () {
        var s = makeEl('p-spark');
        var ang = rand(0, Math.PI * 2);
        var dist = rand(spread * 0.3, spread);
        var dx = Math.cos(ang) * dist;
        var dy = Math.sin(ang) * dist - rand(0, 30);
        var size = rand(8, 20);
        s.style.left = x + 'px';
        s.style.top = y + 'px';
        s.style.width = size + 'px';
        s.style.height = size + 'px';
        s.style.background = opts.color || pick(COLORS);
        s.style.setProperty('--dx', dx + 'px');
        s.style.setProperty('--dy', dy + 'px');
        s.style.animationDuration = rand(0.6, 1.0) + 's';
        layer.appendChild(s);
        setTimeout(function () { s.remove(); }, 1100);
      })();
    }
  }

  /* ---- magic star burst (for Gogo's teleport poofs) ---------------------- *
   * Same flight as sparkleBurst but the particles are glowing four-point
   * STARS (clip-path) in magic golds/purples/whites — no square blocks.    */
  var STAR_COLORS = ['#ffd54a', '#c77dff', '#ffffff', '#ffe9a8', '#e5b8ff'];
  function starBurst(x, y, opts) {
    opts = opts || {};
    var n = opts.count || 14;
    var spread = opts.spread || 110;
    var layer = fxLayer();
    for (var i = 0; i < n; i++) {
      (function () {
        var s = makeEl('p-star');
        var ang = rand(0, Math.PI * 2);
        var dist = rand(spread * 0.3, spread);
        var size = rand(12, 26);
        s.style.left = x + 'px';
        s.style.top = y + 'px';
        s.style.width = size + 'px';
        s.style.height = size + 'px';
        s.style.color = opts.color || pick(STAR_COLORS);
        s.style.setProperty('--dx', (Math.cos(ang) * dist) + 'px');
        s.style.setProperty('--dy', (Math.sin(ang) * dist - rand(0, 26)) + 'px');
        s.style.animationDuration = rand(0.55, 0.95) + 's';
        layer.appendChild(s);
        setTimeout(function () { s.remove(); }, 1000);
      })();
    }
  }

  /* ---- expanding ring --------------------------------------------------- */
  function ringBurst(x, y, color) {
    var r = makeEl('p-ring');
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    r.style.borderColor = color || '#FFD54A';
    fxLayer().appendChild(r);
    setTimeout(function () { r.remove(); }, 700);
  }

  /* ---- confetti rain ---------------------------------------------------- */
  function confetti(opts) {
    opts = opts || {};
    var n = opts.count || 90;
    var layer = fxLayer();
    for (var i = 0; i < n; i++) {
      (function () {
        var c = makeEl('p-confetti');
        var x = rand(0, STAGE_W);
        var size = rand(8, 16);
        c.style.left = x + 'px';
        c.style.top = rand(-60, -10) + 'px';
        c.style.width = size + 'px';
        c.style.height = rand(size * 0.5, size) + 'px';
        c.style.background = pick(COLORS);
        c.style.setProperty('--drift', rand(-120, 120) + 'px');
        c.style.setProperty('--spin', rand(360, 1080) + 'deg');
        c.style.setProperty('--fall', (STAGE_H + 120) + 'px');
        var dur = rand(2.0, 3.4);
        c.style.animationDuration = dur + 's';
        c.style.animationDelay = rand(0, 0.8) + 's';
        if (Math.random() < 0.4) c.style.borderRadius = '50%';
        layer.appendChild(c);
        setTimeout(function () { c.remove(); }, (dur + 1) * 1000);
      })();
    }
  }

  /* ---- ambient rising stars from an element ----------------------------- */
  function floatStars(el, count) {
    var c = centerOf(el);
    count = count || 6;
    for (var i = 0; i < count; i++) {
      (function (i) {
        setTimeout(function () {
          var s = makeEl('p-floatstar');
          s.textContent = '✦';
          s.style.left = (c.x + rand(-c.w / 2, c.w / 2)) + 'px';
          s.style.top = (c.y + rand(-10, 10)) + 'px';
          s.style.fontSize = rand(14, 26) + 'px';
          s.style.color = pick(COLORS);
          fxLayer().appendChild(s);
          setTimeout(function () { s.remove(); }, 1600);
        }, i * 120);
      })(i);
    }
  }

  /* ---- element micro-animations ----------------------------------------- */
  function reflow(el) { void el.offsetWidth; }

  function shake(el) {
    el.classList.remove('anim-shake');
    reflow(el);
    el.classList.add('anim-shake');
    setTimeout(function () { el.classList.remove('anim-shake'); }, 600);
  }

  function pulse(el) {
    el.classList.remove('anim-pulse');
    reflow(el);
    el.classList.add('anim-pulse');
    setTimeout(function () { el.classList.remove('anim-pulse'); }, 500);
  }

  /* ---- green genie smoke (a character vanishes in a puff) ---------------- *
   * Soft blurred puffs that billow outward & drift up while fading — the
   * classic genie exit, in Gogo's green. */
  var SMOKE_COLORS = ['rgba(110,214,126,0.95)', 'rgba(72,180,96,0.9)', 'rgba(150,232,160,0.85)'];
  function smokePoof(x, y, opts) {
    opts = opts || {};
    var n = opts.count || 14;
    var spread = opts.spread || 100;
    var scale = opts.size || 1;   // puff size multiplier (big vanishes)
    var layer = fxLayer();
    for (var i = 0; i < n; i++) {
      (function () {
        var s = makeEl('p-smoke');
        var ang = rand(0, Math.PI * 2);
        var dist = rand(spread * 0.25, spread);
        var size = rand(36, 78) * scale;
        s.style.left = x + 'px';
        s.style.top = y + 'px';
        s.style.width = size + 'px';
        s.style.height = size + 'px';
        s.style.background = 'radial-gradient(circle, ' + pick(SMOKE_COLORS) + ', rgba(70,170,90,0) 70%)';
        s.style.setProperty('--dx', (Math.cos(ang) * dist) + 'px');
        s.style.setProperty('--dy', (Math.sin(ang) * dist * 0.7 - rand(24, 70)) + 'px');
        s.style.animationDuration = rand(0.9, 1.5) + 's';
        layer.appendChild(s);
        setTimeout(function () { s.remove(); }, 1600);
      })();
    }
  }

  /* ---- celebration combo ------------------------------------------------ */
  function celebrate(el) {
    HS.Audio.playSuccess();
    confetti({ count: 110 });
    if (el) {
      var c = centerOf(el);
      sparkleBurst(c.x, c.y, { count: 22, spread: 180 });
      ringBurst(c.x, c.y, '#FFD54A');
      floatStars(el, 8);
    } else {
      sparkleBurst(STAGE_W / 2, STAGE_H / 2, { count: 22, spread: 220 });
    }
    // (no extra sparkle chime — playSuccess already ends in its own shimmer)
  }

  return {
    STAGE_W: STAGE_W,
    STAGE_H: STAGE_H,
    wait: wait,
    raf: raf,
    centerOf: centerOf,
    sparkleBurst: sparkleBurst,
    starBurst: starBurst,
    smokePoof: smokePoof,
    ringBurst: ringBurst,
    confetti: confetti,
    floatStars: floatStars,
    shake: shake,
    pulse: pulse,
    celebrate: celebrate
  };
})();
