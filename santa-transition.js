/*!
 * Santa Bag Transition — dependency-free loading / level-transition overlay.
 * (Vendored into the Handspan game. `showLoading:false` skips the loading
 * meter/percent/label and plays bag → burst → title reveal → uncover.)
 */
(function (global) {
  'use strict';

  var MOODS = {
    midnight: { inner: '#2c3c7e', mid: '#151d48', outer: '#070c24', text: '#eaf1ff', sub: '#94a5da', snow: 'rgba(255,255,255,0.92)' },
    red:      { inner: '#8f1723', mid: '#4c0c14', outer: '#230609', text: '#ffe9ea', sub: '#e79ba0', snow: 'rgba(255,255,255,0.92)' },
    snowy:    { inner: '#f4f9ff', mid: '#cfe0fa', outer: '#a7c1e6', text: '#213251', sub: '#5d7099', snow: 'rgba(120,150,200,0.8)' },
    golden:   { inner: '#6d4e15', mid: '#3a2a0c', outer: '#1b1305', text: '#fff3d6', sub: '#e4c079', snow: 'rgba(255,255,255,0.92)' }
  };

  var clamp = function (v, a, b) { a = (a === undefined ? 0 : a); b = (b === undefined ? 1 : b); return Math.max(a, Math.min(b, v)); };
  var smooth = function (a, b, x) { var u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  var lerp = function (a, b, u) { return a + (b - a) * u; };
  var hexA = function (hex, a) {
    var h = (hex || '#f4c65a').replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  };

  var styleInjected = false;
  function injectKeyframes() {
    if (styleInjected) return; styleInjected = true;
    var s = document.createElement('style');
    s.textContent =
      '@keyframes stxFall{0%{transform:translate3d(0,-14vh,0) rotate(0)}100%{transform:translate3d(var(--stx-drift,0px),116vh,0) rotate(260deg)}}' +
      '@keyframes stxTwk{0%,100%{opacity:.18;transform:scale(.7)}50%{opacity:.95;transform:scale(1.25)}}' +
      '@keyframes stxShim{0%{transform:translateX(-130%) skewX(-16deg)}100%{transform:translateX(360%) skewX(-16deg)}}';
    document.head.appendChild(s);
  }

  function el(tag, css, parent) {
    var d = document.createElement(tag);
    if (css) d.style.cssText = css;
    if (parent) parent.appendChild(d);
    return d;
  }

  function SantaTransition(opts) {
    this.o = {};
    this._defaults = {
      mount: (typeof document !== 'undefined' ? document.body : null),
      bagSrc: 'bag.png',
      mood: 'midnight',
      accent: '#f4c65a',
      snow: true,
      showLoading: true,       // set false to skip the meter/percent/label
      loadingText: 'LOADING',
      kicker: 'GET READY',
      title: 'LEVEL 2',
      loadDuration: 2.6,
      holdDuration: 0.7,       // bag settle time before the burst (no-loading mode)
      burstDuration: 2.4,
      fontFamily: "'Fredoka', system-ui, -apple-system, 'Segoe UI', sans-serif",
      zIndex: 99999
    };
    this._merge(opts);
    this.stage = 'idle';
    this.progress = 0;
    this.gifts = [];
    this.raf = null;
    this._covered = false;
    this._tick = this._tick.bind(this);
  }

  SantaTransition.prototype._merge = function (opts) {
    opts = opts || {};
    var base = (this.stage && this.o) ? this.o : this._defaults;
    var out = {};
    for (var k in base) out[k] = base[k];
    for (var j in opts) out[j] = opts[j];
    this.o = out;
  };

  // ---- public API -------------------------------------------------------

  SantaTransition.prototype.play = function (opts) {
    this._merge(opts);
    this.auto = true;
    this._start();
    this.loadStart = performance.now();
    return this;
  };

  SantaTransition.prototype.show = function (opts) {
    this._merge(opts);
    this.auto = false;
    this.progress = 0;
    this._start();
    return this;
  };

  SantaTransition.prototype.setProgress = function (p) {
    this.progress = clamp(p, 0, 1);
    if (this.progress >= 1 && this.stage === 'loading' && !this.auto) this._startBurst();
    return this;
  };

  SantaTransition.prototype.hide = function () {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
    this.stage = 'idle';
    return this;
  };

  // ---- internals --------------------------------------------------------

  SantaTransition.prototype._start = function () {
    injectKeyframes();
    this.hide();
    this._build();
    this.stage = 'loading';
    this._covered = false;
    this._t0 = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  };

  SantaTransition.prototype._startBurst = function () {
    this.stage = 'burst';
    this.burstStart = performance.now();
    this._covered = false;
  };

  SantaTransition.prototype._finish = function () {
    var cb = this.o.onComplete;
    this.hide();
    if (typeof cb === 'function') cb();
  };

  SantaTransition.prototype._build = function () {
    var o = this.o, p = MOODS[o.mood] || MOODS.midnight, ac = o.accent;
    this.pal = p;

    var root = el('div', 'position:fixed; inset:0; overflow:hidden; z-index:' + o.zIndex +
      '; font-family:' + o.fontFamily + '; color:' + p.text +
      '; background:radial-gradient(130% 112% at 50% 38%, ' + p.inner + ', ' + p.mid + ' 45%, ' + p.outer + ')' +
      '; user-select:none; -webkit-user-select:none;');
    (o.mount || document.body).appendChild(root);
    this.root = root;

    this.ambient = el('div', 'position:absolute; inset:0; pointer-events:none; z-index:1;', root);
    this._buildAmbient();

    el('div', 'position:absolute; inset:0; pointer-events:none; z-index:2; background:radial-gradient(125% 92% at 50% 44%, transparent 52%, rgba(0,0,0,0.5) 100%);', root);

    this.glow = el('div', 'position:absolute; left:50%; top:47%; width:min(128vw,940px); height:min(128vw,940px); transform:translate(-50%,-50%); z-index:3; pointer-events:none; opacity:0.45; background:radial-gradient(circle, ' + hexA(ac, 0.5) + ' 0%, ' + hexA(ac, 0.12) + ' 38%, transparent 68%);', root);

    var stage = el('div', 'position:absolute; inset:0; z-index:4; display:flex; align-items:center; justify-content:center;', root);
    this.bagWrap = el('div', 'position:relative; height:min(58vh,82vw); aspect-ratio:1200 / 1543; transform-origin:50% 95%; will-change:transform, opacity;', stage);

    this.mouthGlow = el('div', 'position:absolute; left:50%; top:16%; width:78%; height:40%; transform:translate(-50%,-50%); opacity:0.14; pointer-events:none; filter:blur(2px); background:radial-gradient(circle, rgba(255,250,235,0.95) 0%, ' + hexA(ac, 0.85) + ' 32%, ' + hexA(ac, 0.15) + ' 62%, transparent 76%);', this.bagWrap);
    this.beam = el('div', 'position:absolute; left:50%; top:19%; width:min(30%,130px); height:74%; transform:translateX(-50%) scaleY(0.3); transform-origin:50% 100%; filter:blur(7px); opacity:0; pointer-events:none; background:linear-gradient(to top, ' + hexA(ac, 0.6) + ', ' + hexA('#fff8e1', 0.28) + ' 40%, transparent);', this.bagWrap);
    var img = el('img', 'position:absolute; inset:0; width:100%; height:100%; object-fit:contain; pointer-events:none; filter:drop-shadow(0 26px 32px rgba(0,0,0,0.5));', this.bagWrap);
    img.src = o.bagSrc; img.alt = ''; img.draggable = false;
    this.giftsHost = el('div', 'position:absolute; left:50%; top:15%; width:0; height:0; z-index:5; pointer-events:none;', this.bagWrap);
    this._buildGifts();

    // Loading meter (percent + bar + label) — skipped when showLoading is false.
    this.loading = null;
    if (o.showLoading !== false) {
      this.loading = el('div', 'position:absolute; left:50%; bottom:8.5%; transform:translateX(-50%); z-index:6; width:min(80vw,440px); text-align:center;', root);
      var pctRow = el('div', 'display:flex; align-items:baseline; justify-content:center; margin-bottom:16px;', this.loading);
      this.percent = el('div', 'font-size:clamp(32px,10vw,60px); font-weight:700; line-height:1; letter-spacing:-0.02em; color:' + ac + '; text-shadow:0 2px 16px ' + hexA(ac, 0.55) + ';', pctRow);
      this.percent.textContent = '0%';
      var track = el('div', 'position:relative; height:14px; border-radius:99px; overflow:hidden; background:rgba(255,255,255,0.13); box-shadow:inset 0 1px 3px rgba(0,0,0,0.45);', this.loading);
      this.barFill = el('div', 'position:absolute; left:0; top:0; height:100%; width:0%; border-radius:99px; box-shadow:0 0 12px ' + hexA(ac, 0.7) + '; background:linear-gradient(90deg,' + hexA(ac, 0.9) + ',' + ac + ' 55%,' + hexA('#ffffff', 0.85) + ');', track);
      var shimWrap = el('div', 'position:absolute; inset:0; overflow:hidden;', this.barFill);
      el('div', 'position:absolute; top:0; left:0; width:40%; height:100%; background:linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.7) 50%, transparent 70%); animation:stxShim 1.7s linear infinite;', shimWrap);
      var label = el('div', 'margin-top:15px; font-size:clamp(12px,3.4vw,17px); font-weight:500; letter-spacing:0.34em; text-transform:uppercase; color:' + p.sub + ';', this.loading);
      label.textContent = o.loadingText;
    }

    this.wipe = el('div', 'position:absolute; left:50%; top:34%; width:min(72vw,540px); height:min(72vw,540px); transform:translate(-50%,-50%) scale(0); border-radius:50%; z-index:7; pointer-events:none; opacity:0; background:radial-gradient(circle, #ffffff 0%, ' + hexA('#fff4d6', 0.96) + ' 18%, ' + hexA(ac, 0.85) + ' 40%, ' + hexA(ac, 0.25) + ' 62%, transparent 74%);', root);

    this.reveal = el('div', 'position:absolute; inset:0; z-index:8; display:flex; flex-direction:column; align-items:center; justify-content:center; opacity:0; pointer-events:none; text-align:center; padding:0 6vw;', root);
    var kick = el('div', 'font-size:clamp(12px,3.6vw,18px); font-weight:700; letter-spacing:0.46em; text-transform:uppercase; color:#b2354a; margin-bottom:12px; text-shadow:0 1px 0 rgba(255,255,255,0.45);', this.reveal);
    kick.textContent = o.kicker;
    var ttl = el('div', 'font-size:clamp(44px,14vw,116px); font-weight:700; line-height:0.92; letter-spacing:-0.02em; color:#951226; text-shadow:0 2px 0 rgba(255,255,255,0.4), 0 14px 34px rgba(90,10,25,0.35);', this.reveal);
    ttl.textContent = o.title;
  };

  SantaTransition.prototype._buildAmbient = function () {
    var host = this.ambient, p = this.pal, i, sz;
    host.innerHTML = '';
    var col = p.snow;
    for (i = 0; i < 42; i++) {
      sz = 1 + Math.random() * 2.4;
      el('div', 'position:absolute; left:' + (Math.random() * 100) + '%; top:' + (Math.random() * 100) + '%; width:' + sz + 'px; height:' + sz + 'px; border-radius:50%; background:' + col + '; animation:stxTwk ' + (2 + Math.random() * 3).toFixed(2) + 's ease-in-out ' + (Math.random() * 3).toFixed(2) + 's infinite;', host);
    }
    if (this.o.snow) {
      for (i = 0; i < 46; i++) {
        sz = 3 + Math.random() * 7;
        var dur = 6 + Math.random() * 8;
        var f = el('div', 'position:absolute; top:0; left:' + (Math.random() * 100) + '%; width:' + sz + 'px; height:' + sz + 'px; border-radius:50%; background:' + col + '; box-shadow:0 0 ' + sz + 'px ' + col + '; opacity:' + (0.35 + Math.random() * 0.5).toFixed(2) + '; animation:stxFall ' + dur.toFixed(2) + 's linear ' + (-Math.random() * dur).toFixed(2) + 's infinite;', host);
        f.style.setProperty('--stx-drift', ((Math.random() * 2 - 1) * 46).toFixed(0) + 'px');
      }
    }
  };

  SantaTransition.prototype._buildGifts = function () {
    var host = this.giftsHost, i;
    host.innerHTML = ''; this.gifts = [];
    var boxColors = ['#e63946', '#2a9d8f', '#4895ef', '#f77f00', '#8ac926', '#ff5d8f', '#ffffff', '#f4c65a', '#b5179e'];
    var ribbons = ['#ffffff', '#f4c65a', '#ffe6a3'];
    for (i = 0; i < 9; i++) {
      var w = 18 + Math.random() * 20, h = w * (0.82 + Math.random() * 0.36);
      var col = boxColors[i % boxColors.length], rib = ribbons[i % ribbons.length];
      var box = el('div', 'position:absolute; left:0; top:0; width:' + w.toFixed(1) + 'px; height:' + h.toFixed(1) + 'px; transform:translate(-50%,-50%) scale(0); opacity:0; border-radius:3px; background:' + col + '; box-shadow:inset 0 -4px 7px rgba(0,0,0,0.28), 0 4px 10px rgba(0,0,0,0.35); will-change:transform, opacity;', host);
      el('div', 'position:absolute; left:50%; top:0; transform:translateX(-50%); width:' + Math.max(3, w * 0.18).toFixed(1) + 'px; height:100%; background:' + rib + ';', box);
      el('div', 'position:absolute; top:38%; left:0; width:100%; height:' + Math.max(3, h * 0.18).toFixed(1) + 'px; background:' + rib + ';', box);
      el('div', 'position:absolute; top:0; left:0; width:100%; height:26%; background:rgba(255,255,255,0.18); border-radius:3px 3px 0 0;', box);
      this.gifts.push({ el: box, ang: -Math.PI * 0.12 - Math.random() * Math.PI * 0.76, dist: 70 + Math.random() * 150, rise: 150 + Math.random() * 230, spin: (Math.random() * 2 - 1) * 1.4, scale: 0.85 + Math.random() * 0.7, delay: Math.random() * 0.26 });
    }
    for (i = 0; i < 13; i++) {
      var s2 = 8 + Math.random() * 15;
      var sp = el('div', 'position:absolute; left:0; top:0; width:' + s2.toFixed(1) + 'px; height:' + s2.toFixed(1) + 'px; transform:translate(-50%,-50%) scale(0); opacity:0; background:#fff; box-shadow:0 0 9px rgba(255,244,214,0.9); clip-path:polygon(50% 0,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0 50%,39% 39%); will-change:transform, opacity;', host);
      this.gifts.push({ el: sp, ang: -Math.PI * 0.05 - Math.random() * Math.PI * 0.9, dist: 90 + Math.random() * 185, rise: 170 + Math.random() * 250, spin: (Math.random() * 2 - 1) * 2.4, scale: 0.55 + Math.random() * 0.95, delay: Math.random() * 0.3 });
    }
  };

  SantaTransition.prototype._tick = function () {
    var now = performance.now();
    if (this.stage === 'loading') {
      if (this.auto) {
        // no-loading mode uses a short "settle" hold instead of the fake fill
        var dur = (this.o.showLoading === false) ? this.o.holdDuration : this.o.loadDuration;
        this.progress = clamp((now - this.loadStart) / 1000 / dur, 0, 1);
        if (this.progress >= 1) this._startBurst();
      }
      this._renderLoading((now - this._t0) / 1000);
    } else if (this.stage === 'burst') {
      var b = clamp((now - this.burstStart) / 1000 / this.o.burstDuration, 0, 1);
      this._renderBurst(b, (now - this._t0) / 1000);
      if (b >= 1) { this._finish(); return; }
    }
    this.raf = requestAnimationFrame(this._tick);
  };

  SantaTransition.prototype._renderLoading = function (tsec) {
    var p = clamp(this.progress, 0, 1);
    if (this.loading) {
      this.percent.textContent = Math.round(p * 100) + '%';
      this.barFill.style.width = (p * 100).toFixed(1) + '%';
      this.loading.style.opacity = '1';
    }

    var fill = lerp(0.965, 1.015, p), bob = Math.sin(tsec * 2.0) * 0.008;
    this.bagWrap.style.opacity = '1';
    this.bagWrap.style.transform = 'translateY(' + (Math.sin(tsec * 2.0) * 3).toFixed(1) + 'px) rotate(' + (Math.sin(tsec * 1.7) * 1.5).toFixed(2) + 'deg) scale(' + (fill + bob).toFixed(3) + ',' + (fill - bob).toFixed(3) + ')';
    this.mouthGlow.style.opacity = (0.13 + 0.05 * Math.sin(tsec * 3.0)).toFixed(3);
    this.mouthGlow.style.transform = 'translate(-50%,-50%) scale(1)';
    this.glow.style.opacity = clamp(0.42 + 0.08 * Math.sin(tsec * 1.5), 0, 1).toFixed(3);
    this.beam.style.opacity = '0';
    this.wipe.style.opacity = '0';
    this.reveal.style.opacity = '0';
    if (this.root) this.root.style.opacity = '1';
    for (var i = 0; i < this.gifts.length; i++) this.gifts[i].el.style.opacity = '0';
  };

  SantaTransition.prototype._renderBurst = function (b, tsec) {
    var sx, sy, ty, bagOp = 1, u;
    if (b < 0.178) { u = smooth(0, 0.178, b); sx = lerp(1.015, 1.13, u); sy = lerp(1.015, 0.85, u); ty = lerp(0, 16, u); }
    else if (b < 0.40) { u = smooth(0.178, 0.40, b); sx = lerp(1.13, 0.9, u); sy = lerp(0.85, 1.17, u); ty = lerp(16, -24, u); }
    else { u = smooth(0.40, 0.69, b); sx = lerp(0.9, 0.66, u); sy = lerp(1.17, 0.66, u); ty = lerp(-24, -46, u); bagOp = 1 - smooth(0.42, 0.69, b); }
    this.bagWrap.style.transform = 'translateY(' + ty.toFixed(1) + 'px) rotate(0deg) scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ')';
    this.bagWrap.style.opacity = bagOp.toFixed(3);

    if (this.loading) this.loading.style.opacity = (1 - smooth(0, 0.10, b)).toFixed(3);
    this.glow.style.opacity = clamp(Math.max(0.42, smooth(0, 0.30, b)), 0, 1).toFixed(3);

    var flare = (b >= 0.10 && b < 0.62) ? Math.sin(clamp((b - 0.10) / 0.52, 0, 1) * Math.PI) : 0;
    var mg = Math.max(0.13, smooth(0, 0.18, b) * 0.5, flare);
    this.mouthGlow.style.opacity = clamp(mg, 0, 1).toFixed(3);
    this.mouthGlow.style.transform = 'translate(-50%,-50%) scale(' + (1 + flare * 1.6).toFixed(3) + ')';

    var beam = smooth(0.10, 0.30, b) * (1 - smooth(0.55, 0.72, b));
    this.beam.style.opacity = beam.toFixed(3);
    this.beam.style.transform = 'translateX(-50%) scaleY(' + lerp(0.3, 1.1, smooth(0.10, 0.40, b)).toFixed(3) + ')';

    var active = b >= 0.156 && b <= 0.85;
    var gu = clamp((b - 0.156) / (0.778 - 0.156), 0, 1);
    for (var i = 0; i < this.gifts.length; i++) {
      var g = this.gifts[i];
      if (!active) { g.el.style.opacity = '0'; continue; }
      var d = clamp((gu - g.delay) / (1 - g.delay), 0, 1);
      if (d <= 0) { g.el.style.opacity = '0'; continue; }
      var x = Math.cos(g.ang) * g.dist * d;
      var y = -g.rise * Math.sin(Math.min(1, d) * Math.PI * 0.92);
      var sc = g.scale * (0.3 + 0.7 * smooth(0, 0.16, d));
      var op = smooth(0, 0.08, d) * (1 - smooth(0.72, 1, d));
      g.el.style.transform = 'translate(-50%,-50%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + (g.spin * 360 * d).toFixed(1) + 'deg) scale(' + sc.toFixed(3) + ')';
      g.el.style.opacity = op.toFixed(3);
    }

    this.wipe.style.transform = 'translate(-50%,-50%) scale(' + lerp(0, 3.6, smooth(0.378, 0.80, b)).toFixed(3) + ')';
    this.wipe.style.opacity = smooth(0.40, 0.70, b).toFixed(3);

    this.reveal.style.opacity = smooth(0.69, 0.80, b).toFixed(3);
    this.reveal.style.transform = 'scale(' + lerp(0.9, 1, smooth(0.66, 0.80, b)).toFixed(3) + ')';

    if (!this._covered && b >= 0.72) {
      this._covered = true;
      if (typeof this.o.onCovered === 'function') this.o.onCovered();
    }

    // uncover: fade the whole overlay out to reveal the (swapped) scene behind
    if (this.root) this.root.style.opacity = (1 - smooth(0.88, 1.0, b)).toFixed(3);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SantaTransition;
  global.SantaTransition = SantaTransition;
})(typeof window !== 'undefined' ? window : this);
