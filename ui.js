/* ============================================================================
 * ui.js  —  reusable UI building blocks
 * ----------------------------------------------------------------------------
 * All components return real DOM nodes. Nothing here knows about game flow;
 * tutorial.js / rounds.js / game.js compose these pieces.
 *
 * The single most important component is HS.UI.HandSpan() — the reusable
 * representation of the "{" handspan symbol from the PDF. It is used
 * EVERYWHERE (tutorial demo, guess row, measuring strip, table markers).
 * ========================================================================== */
window.HS = window.HS || {};

HS.UI = (function () {
  'use strict';

  /* ---- tiny DOM helper -------------------------------------------------- */
  // el('div.foo.bar', {attrs}, [children|string])
  // Accepts dot-separated classes and/or space-separated class groups, e.g.
  // 'div.foo.bar', 'button.btn btn--play', 'div.char char--gogo'.
  function el(spec, props, children) {
    var tokens = spec.split(/\s+/).filter(Boolean);
    var head = tokens[0].split('.');
    var tag = head[0] || 'div';
    var node = document.createElement(tag);
    for (var i = 1; i < head.length; i++) { if (head[i]) node.classList.add(head[i]); }
    for (var t = 1; t < tokens.length; t++) {
      tokens[t].split('.').forEach(function (c) { if (c) node.classList.add(c); });
    }
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'style') {
          Object.assign(node.style, props[k]);
        } else if (k === 'html') {
          node.innerHTML = props[k];
        } else if (k === 'text') {
          node.textContent = props[k];
        } else if (k === 'on') {
          Object.keys(props[k]).forEach(function (ev) {
            node.addEventListener(ev, props[k][ev]);
          });
        } else if (k === 'dataset') {
          Object.assign(node.dataset, props[k]);
        } else if (props[k] != null) {
          node.setAttribute(k, props[k]);
        }
      });
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ======================================================================
   * HANDSPAN  — the one reusable measurement unit
   * ----------------------------------------------------------------------
   * Rendered as the orange hand artwork (assets/hand.webp). The same unit is
   * used for the guess tray, the measuring lane, the fly-in measurement and
   * the final table markers, so the whole game speaks one visual language.
   *
   * opts:
   *   variant : 'guide' | 'solid' | 'faded' | 'impression'  (default 'solid')
   *   w, h    : pixel size (default 88 x 88)
   *   number  : optional numeric badge shown above the unit
   * ====================================================================== */
  function HandSpan(opts) {
    opts = opts || {};
    var w = opts.w || 88;
    var h = opts.h || 88;
    var variant = opts.variant || 'solid';

    // Default unit is the vibrant hand.png artwork. Pass `anim:true` for the
    // pose the measuring animation (handSpanAnimation) settles on — its exact
    // last frame — so an impression left where the animation ends matches it
    // pixel-for-pixel.
    var anim = opts.anim === true;

    var wrap = el('div.handspan', { dataset: { variant: variant } });
    if (anim) wrap.classList.add('handspan--anim');
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';

    wrap.appendChild(el('img.handspan__hand', {
      src: anim ? 'assets/handSpanHand.webp' : 'assets/hand.webp', alt: '', draggable: 'false'
    }));

    if (opts.number != null) {
      wrap.appendChild(el('div.handspan__num', { text: String(opts.number) }));
    }
    return wrap;
  }

  /* ======================================================================
   * MEASURE HAND  — the animated hand that stretches to measure one span
   * (assets/handSpanAnimation.webm, transparent VP9). This is THE measuring
   * animation, reused wherever a hand actively measures (the tutorial demo and
   * the guess-phase preview). It settles on the open pose (handSpanHand.png),
   * which the faded impressions reuse so they land exactly on the settle frame.
   * ====================================================================== */
  function MeasureHand(sizePx) {
    var d = el('div.measure-hand');
    if (sizePx) { d.style.width = sizePx + 'px'; d.style.height = sizePx + 'px'; }
    var v = document.createElement('video');
    v.className = 'measure-hand__vid';
    v.src = 'assets/handSpanAnimation.webm';
    v.muted = true; v.defaultMuted = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.playsInline = true; v.preload = 'auto';
    d.appendChild(v);
    d._video = v;
    return d;
  }

  // Play the stretch animation once (optionally faster). Resolves when the clip
  // ends, with a safety timeout so a stalled decode never hangs the flow.
  function playMeasureHand(node, rate) {
    var v = node._video;
    rate = rate || 1;
    return new Promise(function (resolve) {
      var settled = false;
      function done() { if (settled) return; settled = true; v.removeEventListener('ended', done); resolve(); }
      v.addEventListener('ended', done);
      v.playbackRate = rate;
      try { v.currentTime = 0; } catch (e) {}
      var pr = v.play();
      if (pr && pr.catch) pr.catch(function () {});
      setTimeout(done, 1000 / rate + 450);
    });
  }

  // Update an existing handspan's variant + optional number badge in place.
  function setHandSpan(node, variant, number) {
    node.dataset.variant = variant;
    if (number != null) {
      var badge = node.querySelector('.handspan__num');
      if (!badge) {
        badge = el('div.handspan__num');
        node.appendChild(badge);
      }
      badge.textContent = String(number);
      // pop the badge in
      badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop');
    }
  }

  /* ======================================================================
   * TABLE  — uses the provided Table.svg artwork
   * opts: { scale, w }  -> width in px (height auto via 662x350 ratio)
   * Returns a wrapper so we can attach measuring strips / glow.
   * ====================================================================== */
  var TABLE_RATIO = 350 / 662;
  function Table(opts) {
    opts = opts || {};
    var w = opts.w || 360;
    var ratio = opts.ratio || TABLE_RATIO;     // height / width of the artwork
    var src = opts.src || 'assets/Table.webp';
    var wrap = el('div.table');
    wrap.style.width = w + 'px';
    wrap.style.height = (w * ratio) + 'px';
    var img = el('img.table__img', { src: src, alt: 'table', draggable: 'false' });
    wrap.appendChild(img);
    return wrap;
  }

  /* ======================================================================
   * MEASURING STRIP — a horizontal lane that holds handspan slots,
   * placed under a table's top edge. Used by tutorial + rounds.
   * Returns { lane, slots[] } where each slot is a HandSpan('guide').
   * ====================================================================== */
  function MeasuringStrip(count, opts) {
    opts = opts || {};
    var unit = opts.unit || 84;
    var h = opts.h || 60;
    var lane = el('div.measure-lane');
    var slots = [];
    // left + right end ticks (the black vertical markers in the PDF)
    lane.appendChild(el('div.measure-tick'));
    var row = el('div.measure-row');
    for (var i = 0; i < count; i++) {
      var hs = HandSpan({ variant: 'guide', w: unit, h: h });
      slots.push(hs);
      row.appendChild(hs);
    }
    lane.appendChild(row);
    lane.appendChild(el('div.measure-tick'));
    return { lane: lane, slots: slots, row: row };
  }

  /* ======================================================================
   * SPEECH BUBBLE  — purple panel, yellow border, white bold text
   * opts: { speaker, text, side('left'|'right'), accent }
   * ====================================================================== */
  function SpeechBubble(opts) {
    opts = opts || {};
    var b = el('div.bubble', { dataset: { side: opts.side || 'left' } });
    if (opts.purple) b.classList.add('bubble--purple');
    if (opts.speaker) {
      b.appendChild(el('div.bubble__speaker', {
        text: opts.speaker,
        style: opts.accent ? { color: opts.accent } : null
      }));
    }
    b.appendChild(el('div.bubble__text', { text: opts.text || '' }));
    b.appendChild(el('div.bubble__tail'));
    return b;
  }

  // Typewriter-reveal text into an existing bubble's text node.
  function typeInto(bubble, text, cps) {
    var node = bubble.querySelector('.bubble__text');
    node.textContent = '';
    var chars = text.split('');
    var i = 0;
    var step = 1000 / (cps || 38);
    return new Promise(function (resolve) {
      var timer = setInterval(function () {
        node.textContent += chars[i++];
        if (i >= chars.length) { clearInterval(timer); resolve(); }
      }, step);
    });
  }

  /* ======================================================================
   * CHARACTERS
   * Gogo -> provided gogo.png.  Tara -> built in pure CSS (no asset given).
   * ====================================================================== */
  function Gogo(opts) {
    opts = opts || {};
    var c = el('div.char char--gogo');
    if (opts.sack) c.classList.add('char--sack');
    c.appendChild(el('img.char__img', { src: 'assets/gogo.webp', alt: 'Gogo', draggable: 'false' }));
    if (opts.sack) {
      // Santa-style sack drawn in CSS, slung on Gogo's back.
      c.appendChild(el('div.gogo-sack', null, [el('div.gogo-sack__tie')]));
    }
    return c;
  }

  // CSS-drawn princess "Tara" (cute, on-brand, no external art needed).
  function Tara() {
    var c = el('div.char char--tara');
    c.innerHTML =
      '<div class="tara">' +
        '<div class="tara__crown"></div>' +
        '<div class="tara__hair"></div>' +
        '<div class="tara__face">' +
          '<div class="tara__eye tara__eye--l"></div>' +
          '<div class="tara__eye tara__eye--r"></div>' +
          '<div class="tara__cheek tara__cheek--l"></div>' +
          '<div class="tara__cheek tara__cheek--r"></div>' +
          '<div class="tara__smile"></div>' +
        '</div>' +
        '<div class="tara__hair-side tara__hair-side--l"></div>' +
        '<div class="tara__hair-side tara__hair-side--r"></div>' +
        '<div class="tara__dress"></div>' +
      '</div>';
    return c;
  }

  /* ======================================================================
   * BUTTONS + small bits
   * ====================================================================== */
  function Button(label, opts) {
    opts = opts || {};
    var b = el('button.btn', {
      type: 'button',
      on: {
        click: function (e) {
          if (b.disabled) return;
          HS.Audio.playClick();
          if (opts.onClick) opts.onClick(e);
        },
        mouseenter: function () { if (!b.disabled) HS.Audio.playHover(); }
      }
    }, label);
    if (opts.variant) b.classList.add('btn--' + opts.variant);
    if (opts.id) b.id = opts.id;
    return b;
  }

  // "Tap to continue" pill (top-right in dialogue scenes).
  function TapToContinue(onTap) {
    var p = el('button.tap-continue', {
      type: 'button',
      on: { click: function () { HS.Audio.playClick(); onTap && onTap(); } }
    }, ['Tap to continue ', el('span.tap-continue__arrow', { text: '➜' })]);
    return p;
  }

  // Animated hand-cursor nudge (assets/handNudge.webp) to point at a target.
  function HandNudge() {
    var n = el('div.hand-nudge');
    n.appendChild(el('img', { src: 'assets/handNudge.webp', alt: '', draggable: 'false' }));
    return n;
  }

  // Reveal a hand-nudge ONLY after the user has been idle for `ms` (default 3s).
  // Any pointer/keyboard activity hides it and restarts the countdown, so the
  // hint only appears when the player seems stuck. Returns a stop() function;
  // it also self-cleans once the node leaves the DOM (e.g. scene change).
  function idleNudge(node, opts) {
    opts = opts || {};
    var ms = opts.ms || 5000;
    var timer = null, stopped = false;
    var events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'];
    node.style.display = 'none';
    function stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      events.forEach(function (e) { document.removeEventListener(e, reset); });
    }
    function show() {
      if (stopped) return;
      if (!document.body.contains(node)) { stop(); return; }
      node.style.display = '';
      if (opts.onShow) opts.onShow();
    }
    function reset() {
      if (stopped) return;
      if (!document.body.contains(node)) { stop(); return; }   // scene changed
      node.style.display = 'none';
      clearTimeout(timer);
      timer = setTimeout(show, ms);
    }
    events.forEach(function (e) { document.addEventListener(e, reset, { passive: true }); });
    timer = setTimeout(show, ms);
    return stop;
  }

  // Big floating title chip (e.g. "Tutorial", "Round 1").
  function TitleChip(text) {
    return el('div.title-chip', { text: text });
  }

  // Heading line shown atop measuring scenes.
  function Heading(text) {
    return el('div.scene-heading', { text: text });
  }

  /* ======================================================================
   * TUTORIAL-SPECIFIC COMPONENTS  (match the Figma "tutorial" flow)
   * Layout/ratios are mapped from the 1920x1080 Figma frames onto our
   * 1280x720 stage (factor 2/3). See tutorial.js for placement.
   * ====================================================================== */

  // Avatar bubble: circular head (yellow ring baked in) + purple bar.
  // (No angular pointer/tail — flat instruction panel.)
  // who: 'gogo' | 'child'
  function TutorialBubble(opts) {
    opts = opts || {};
    var avatarSrc = opts.who === 'child' ? 'assets/avatar_tara.webp' : 'assets/avatar_gogo.webp';
    var wrap = el('div.tbubble');
    wrap.appendChild(el('div.tbubble__avatar', null,
      [el('img', { src: avatarSrc, alt: '', draggable: 'false' })]));
    var bar = el('div.tbubble__bar', null, [
      el('span.tbubble__text', { text: opts.text || '' })
    ]);
    wrap.appendChild(bar);
    return wrap;
  }

  // Big welcome panel: purple rounded bar with a downward tail (genie speaks).
  function WelcomePanel(text) {
    return el('div.welcome-panel', null, [
      el('div.welcome-panel__text', { text: text }),
      el('div.welcome-panel__tail')
    ]);
  }

  // Compact feedback bubble for the success / try-again / clue screens. It is
  // anchored to the genie's side (left|right) with its tail pointing DOWN at
  // the genie, so it reads as the genie speaking.
  function FeedbackBubble(text, side) {
    var cls = 'div.fb-bubble ' + (side === 'right' ? 'fb-bubble--right' : 'fb-bubble--left');
    return el(cls, null, [
      el('div.fb-bubble__text', { text: text }),
      el('div.fb-bubble__tail')
    ]);
  }

  // One orange hand (the handspan unit AND the draggable cursor share art).
  function HandUnit(sizePx) {
    var d = el('div.hand-unit');
    if (sizePx) { d.style.width = sizePx + 'px'; d.style.height = sizePx + 'px'; }
    d.appendChild(el('img', { src: 'assets/hand.webp', alt: '', draggable: 'false' }));
    return d;
  }

  // The hand resting on a glowing holographic podium (bottom-left in Figma).
  function HandPodium() {
    var c = el('div.hand-podium');
    c.appendChild(el('div.hand-podium__glow'));
    c.appendChild(el('div.hand-podium__disc'));
    var hand = HandUnit();
    hand.classList.add('hand-podium__hand');
    c.appendChild(hand);
    return c;
  }

  // The two dashed start/end measurement guide lines. Returns the group plus
  // a reveal() that animates them in (used together with an SFX).
  function MeasureGuide(startX, endX, top, height) {
    var g = el('div.measure-guide');
    // start line draws its dash OUTWARD (to the left of startX) so it hugs the
    // outside of the leg like the end line does — no overlap with the drop-zone.
    var a = el('div.measure-guide__line measure-guide__line--start');
    Object.assign(a.style, { left: startX + 'px', top: top + 'px', height: height + 'px' });
    var b = el('div.measure-guide__line');
    Object.assign(b.style, { left: endX + 'px', top: top + 'px', height: height + 'px' });
    g.appendChild(a); g.appendChild(b);
    g.reveal = function () { a.classList.add('is-in'); b.classList.add('is-in'); };
    return g;
  }

  // Two HORIZONTAL dashed guide lines (top & bottom) for vertical measuring —
  // e.g. the height of a candle stand. Same reveal() contract.
  function MeasureGuideH(x0, x1, topY, bottomY) {
    var g = el('div.measure-guide');
    function line(y) {
      var l = el('div.measure-guide__line measure-guide__line--h');
      Object.assign(l.style, { left: x0 + 'px', top: y + 'px', width: (x1 - x0) + 'px' });
      return l;
    }
    var a = line(topY), b = line(bottomY);
    g.appendChild(a); g.appendChild(b);
    g.reveal = function () { a.classList.add('is-in'); b.classList.add('is-in'); };
    return g;
  }

  // Spotlight vignette: darkens the periphery so the central table + hands
  // read clearly. Sits above the background but below the table & UI.
  function Vignette() {
    return el('div.tut-vignette');
  }

  /* ======================================================================
   * GOGO SPEAKS — unified instruction system
   * A Gogo character (posed by the KIND of line) plus a speech bubble whose
   * tail points AT that Gogo. Poses:
   *   'think' -> ThinkGogo   (questions / pondering: "But How?", "Here?")
   *   'show'  -> ShowingGogo (pointing / instructing: "Tap here…", "Drag…")
   *   'talk'  -> gogo        (statements / celebration: "We need to…", "Yes!")
   *   'horizontal' -> HorizontalGogo (casual narration from the corner)
   * ====================================================================== */
  var GOGO_POSE = { think: 'ThinkGogo.webp', show: 'ShowingGogo.webp', talk: 'gogo.webp', horizontal: 'HorizontalGogo.webp', wrong: 'wrongGogo.webp' };
  function GogoCharacter(pose) {
    pose = pose || 'talk';
    var c = el('div.gogo-char gogo-char--' + pose);
    c.appendChild(el('img', { src: 'assets/' + (GOGO_POSE[pose] || 'gogo.webp'), alt: '', draggable: 'false' }));
    return c;
  }
  // Swap an existing Gogo character's pose (keeps its position/animation).
  function setGogoPose(charEl, pose) {
    pose = pose || 'talk';
    charEl.className = 'gogo-char gogo-char--' + pose;
    var img = charEl.querySelector('img');
    if (img) img.src = 'assets/' + (GOGO_POSE[pose] || 'gogo.webp');
  }
  // Speech bubble with a tail pointing at the speaker.
  // tail: 'down-right' (bubble ABOVE a right-anchored Gogo) | 'left' (bubble to
  // the RIGHT of a left-anchored Gogo).
  function SayBubble(text, tail) {
    var b = el('div.say-bubble say-bubble--' + (tail || 'down-right'));
    b.appendChild(el('div.say-bubble__text', { text: text || '' }));
    b.appendChild(el('div.say-bubble__tail'));
    return b;
  }

  // Small purple call-out chip ("Start from one end.", "No Gaps!", ...).
  function LabelChip(text) {
    return el('div.label-chip', null, [
      el('span', { text: text }),
      el('div.label-chip__tail')
    ]);
  }

  return {
    el: el,
    clear: clear,
    HandSpan: HandSpan,
    setHandSpan: setHandSpan,
    MeasureHand: MeasureHand,
    playMeasureHand: playMeasureHand,
    Table: Table,
    MeasuringStrip: MeasuringStrip,
    SpeechBubble: SpeechBubble,
    typeInto: typeInto,
    Gogo: Gogo,
    Tara: Tara,
    Button: Button,
    TapToContinue: TapToContinue,
    HandNudge: HandNudge,
    idleNudge: idleNudge,
    TitleChip: TitleChip,
    Heading: Heading,
    TutorialBubble: TutorialBubble,
    GogoCharacter: GogoCharacter,
    setGogoPose: setGogoPose,
    SayBubble: SayBubble,
    WelcomePanel: WelcomePanel,
    FeedbackBubble: FeedbackBubble,
    HandUnit: HandUnit,
    HandPodium: HandPodium,
    MeasureGuide: MeasureGuide,
    MeasureGuideH: MeasureGuideH,
    Vignette: Vignette,
    LabelChip: LabelChip
  };
})();
