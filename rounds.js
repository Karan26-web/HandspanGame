/* ============================================================================
 * rounds.js  —  "Hall of Tables": fixed-sequence measure loop
 * ----------------------------------------------------------------------------
 * After the tutorial the player returns to the hall: the JUST-measured table
 * is shown centred with its "N handspans" chip, then glides aside so the next
 * table comes into focus, and a hand nudge invites the tap (no arrows, no
 * free selection — the order is fixed). Each tap runs the drag-to-measure
 * round. Once every table is measured, Gogo bags the 6-handspan target.
 *
 * Shared phases (guessPhase / measureFly / wellDone / buildMeasureScene) are
 * provided by game.js via the hooks object `h`.
 * ========================================================================== */
window.HS = window.HS || {};

HS.Rounds = (function () {
  'use strict';

  var UI = HS.UI, FX = HS.FX, A = HS.Audio;
  var el = UI.el;

  // distinct artwork per table (each table keeps its own look as it scrolls).
  // e0/e1 = the table's OUTER leg-foot edges as a fraction of its width (measured
  // opaque), so the measuring lines sit on the table's outer outline.
  // Every table uses the SAME brown artwork (Table.svg); they differ only by
  // SIZE — the more handspans, the longer the table. foot = fraction of the art
  // height where the legs meet the floor (so it stands ON the ground).
  // foot = fraction of the rendered element height where the VISIBLE legs end.
  // Table.svg (aspect ~0.404) letterboxes inside the 0.529-ratio box, so the
  // legs sit at ~0.855 of the box height, not ~0.965 — anchor by that so the
  // legs land on FLOOR_Y and meet the guide-line tops.
  var BROWN = { src: 'assets/Table.png', ratio: 350 / 662, name: 'brown', e0: 0.0375, e1: 0.9542, foot: 0.855 };
  var TABLE_ART = [BROWN, BROWN, BROWN];
  function art(i) { return TABLE_ART[i % TABLE_ART.length]; }

  // persistent state for the hall loop (reset each time we enter it)
  var state = null;

  /* ---- ONE instruction panel for the guess flows (cloth + candle) --------
   * Gogo IN PERSON is reserved for the table flow (flow 1). In every other
   * flow the round plays out on its own, and JUST BEFORE play a single
   * instruction panel (avatar + purple bar) comes in with the task text,
   * is read, and goes away by itself. */
  function instructOnce(s, text) {
    var b = UI.TutorialBubble({ who: 'gogo', text: text });
    Object.assign(b.style, { left: '50%', top: '18px', transform: 'translateX(-50%)' });
    s.appendChild(b);
    A.playDialogue();
    return FX.wait(lineMs(text)).then(function () {
      b.style.transition = 'opacity 0.3s ease'; b.style.opacity = '0';
      return FX.wait(300).then(function () { b.remove(); });
    });
  }
  /* same panel, but held on screen until a tap (success recaps) */
  function panelSay(h, s, text) {
    var b = UI.TutorialBubble({ who: 'gogo', text: text });
    Object.assign(b.style, { left: '50%', top: '18px', transform: 'translateX(-50%)' });
    s.appendChild(b);
    A.playDialogue();
    // the arrow waits until the panel has been read, then invites the tap
    return h.tapToContinue(lineMs(text)).then(function () { b.remove(); });
  }

  /* ---- Gogo IN PERSON delivers instructions (table flow ONLY) ------------
   * No instruction panel: the SAME fixed-size Gogo, on the SAME spot as the
   * measuring screens, poofs in, speaks each line beside his head, then poofs
   * away. Auto-paced (by line length) so whatever cue follows — e.g. the hand
   * nudge — can appear the moment he vanishes. */
  var GOGO_SPOT = { left: '130px', top: '40px' };     // one spot on every screen
  // BOTTOM-anchored beside his head: the bubble grows UPWARD with its text, so
  // the tail tip stays on his head whether the line is one word or two rows
  var GOGO_BUBBLE = { left: '430px', bottom: '600px' };
  function lineMs(text) { return Math.max(2400, 900 + String(text).split(/\s+/).length * 240); }
  // opts (all optional): pose ('talk'|'show'|...), spot {left,top}, bubble
  // {left,bottom} — the hall intros use the presenting ShowingGogo far left
  function gogoSay(s, lines, opts) {
    opts = opts || {};
    var g = UI.GogoCharacter(opts.pose || 'talk');
    var spot = opts.spot || GOGO_SPOT;
    Object.assign(g.style, { left: spot.left, top: spot.top, visibility: 'hidden' });
    s.appendChild(g);
    var seq = FX.wait(350).then(function () { UI.gogoAppear(g); return FX.wait(500); });
    lines.forEach(function (text) {
      seq = seq.then(function () {
        return new Promise(function (res) {
          var b = UI.SayBubble(text, 'left');
          Object.assign(b.style, opts.bubble || GOGO_BUBBLE);
          s.appendChild(b);
          A.playDialogue();
          setTimeout(function () { b.remove(); res(); }, lineMs(text));
        });
      });
    });
    return seq.then(function () { return UI.gogoVanish(g); }).then(function () { g.remove(); });
  }

  /* ---- full-body genie + purple message panel (success / wrong / clue) ---
   * ONE feedback style for every flow (matches flow 1). `text` may be an
   * array of lines — they play one after another in the same bubble spot.
   * Every line (success, wrong + clue) uses the SAME dialogue box as flow 1's
   * Gogo speech (the white-stroked Figma DialogueBox with its swoosh tail),
   * BOTTOM anchored beside the genie's head so the tail tip stays on his head.
   * successGogo is narrower & stands lower, so his anchor sits in tighter. */
  var FEEDBACK_BUBBLE = {
    // success sits in the CLEAR top-right corner — above the widest prop's
    // top edge (the 10-span cloth tops out ~y134), so the bubble never lies
    // over the measured object; the raised genie keeps the tail on his head
    success: { tail: 'right', style: { right: '210px', bottom: '595px' } },
    wrong:   { tail: 'right', style: { right: '250px', bottom: '570px' } },
    clue:    { tail: 'left',  style: { left: '235px',  bottom: '558px' } }
  };
  function feedback(s, who, text) {
    var src = who === 'success' ? 'assets/successGogo.webp'
            : who === 'wrong' ? 'assets/wrongGogo.webp'
            : 'assets/ShowingGogo.webp';
    // genie stands RIGHT for success/wrong, left for the clue; the bubble
    // sits on the same side with its tail pointing down at the genie
    var onRight = who === 'wrong' || who === 'success';
    var gogo = el('img.feedback-gogo feedback-gogo--' + who + ' ' + (onRight ? 'feedback-gogo--right' : 'feedback-gogo--left'), { src: src, alt: '', draggable: 'false' });
    s.appendChild(gogo);
    if (who === 'success') A.playClap();   // cheer whenever successGogo appears
    var lines = Array.isArray(text) ? text : [text];
    var li = 0, panel = null;
    (function show() {
      if (panel) panel.remove();
      var line = lines[li];
      var spot = FEEDBACK_BUBBLE[who];
      panel = UI.SayBubble(line, spot.tail);
      Object.assign(panel.style, spot.style);
      s.appendChild(panel);
      A.playDialogue();
      li++;
      if (li < lines.length) {
        setTimeout(function () {
          if (document.body.contains(panel)) show();   // scene may have moved on
        }, lineMs(line));
      }
    })();
    // ms until the LAST line has landed plus a beat to take it in — callers
    // pass this to tapToContinue so the arrow only appears once the genie's
    // message has actually been delivered
    var wait = 900;
    for (var w = 0; w < lines.length - 1; w++) wait += lineMs(lines[w]);
    return wait;
  }

  /* ---- a curved dashed "drag here" arrow (SVG) from (x1,y1) to (x2,y2) --- */
  function makeArrow(x1, y1, x2, y2) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'drag-arrow');
    svg.setAttribute('viewBox', '0 0 ' + FX.STAGE_W + ' ' + FX.STAGE_H);
    Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: FX.STAGE_W + 'px', height: FX.STAGE_H + 'px', zIndex: '28', pointerEvents: 'none', overflow: 'visible' });
    var mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 36;   // control point arcs up & over
    // final-approach direction (control -> tip)
    var dx = x2 - mx, dy = y2 - my, L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    var b = 22, w = 10;                       // arrowhead length / half-width
    // the dashed shaft STOPS at the head's base so no dash pokes past the pointer
    var sx = x2 - dx * b, sy = y2 - dy * b;
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' Q ' + mx + ' ' + my + ' ' + sx + ' ' + sy);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(255,255,255,0.95)');
    path.setAttribute('stroke-width', '5');
    path.setAttribute('stroke-dasharray', '9 11');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
    // solid arrowhead: tip at (x2,y2), base at the shaft's end
    var px = -dy, py = dx;
    var head = document.createElementNS(NS, 'path');
    head.setAttribute('d', 'M ' + x2 + ' ' + y2 +
      ' L ' + (sx + w * px) + ' ' + (sy + w * py) +
      ' L ' + (sx - w * px) + ' ' + (sy - w * py) + ' Z');
    head.setAttribute('fill', 'rgba(255,255,255,0.95)');
    svg.appendChild(head);
    return svg;
  }

  /* ====================================================================== *
   * TUTORIAL MEASURE — the guided drag lesson on the tutorial (5-span) table.
   * Reuses the real drag mechanic (playRound) with tutorial: true, so Gogo
   * demonstrates the first two hands and the player finishes the rest. When
   * done, we enter the Hall of Tables (which marks this table measured).
   * ====================================================================== */
  function startTutorialMeasure(config, h) {
    playRound(config, h, {
      tutorial: true,
      spans: config.tutorialSpans,
      src: BROWN.src, ratio: BROWN.ratio, name: BROWN.name,
      e0: BROWN.e0, e1: BROWN.e1, foot: BROWN.foot,
      showFaded: false,
      onDone: function () { startHall(config, h); }
    });
  }

  /* ====================================================================== *
   * ENTRY — initialise state, then show the hall
   * ====================================================================== */
  function startHall(config, h) {
    // The tutorial already measured its table (the 5-handspan one), so mark it
    // done up front: it shows disabled and the player measures the rest (8 & 6).
    var tutIdx = -1;
    for (var i = 0; i < config.finalTables.length; i++) {
      if (config.finalTables[i].spans === config.tutorialSpans) { tutIdx = i; break; }
    }
    state = {
      tables: config.finalTables,   // [{spans:5},{spans:8},{spans:6}]
      target: config.finalTarget,   // 6
      measured: tutIdx >= 0 ? [tutIdx] : [],   // tutorial table pre-measured
      hallMeasured: 0,              // tables measured IN the hall (for the faded guide)
      center: 0
    };
    // festive entrance into the Hall of Tables
    h.festiveTransition(function () { hall(config, h); }, 'The Hall of Tables!');
  }

  /* ====================================================================== *
   * THE HALL — fixed-sequence table showcase (flow 1: no free selection)
   * On entry the JUST-measured table holds the spotlight with its
   * "N handspans" chip, then glides aside so the next table comes into
   * focus, and a hand nudge invites the tap. No arrows, no panels, no Gogo.
   * ====================================================================== */
  function hall(config, h) {
    h.setBackground('play');

    // start centred on the table we just measured (the tutorial one at first)
    state.center = state.measured.length ? state.measured[state.measured.length - 1] : 0;

    h.transitionTo(function () {
      var s = h.scene();

      var carousel = el('div.hall-carousel hall-carousel--fixed');
      carousel.appendChild(el('div.select-glow'));

      // same brown artwork for every table — width grows with its span count so
      // a longer table genuinely looks longer in the carousel
      var bySize = state.tables.map(function (t) { return t.spans; }).sort(function (a, b) { return a - b; });
      var cards = state.tables.map(function (t, i) {
        var card = el('div.hall-card', { dataset: { idx: String(i) } });
        var a = art(i);
        var cardW = (50 * t.spans) / (a.e1 - a.e0);   // constant hand size -> proportional width
        var table = UI.Table({ w: cardW, src: a.src, ratio: a.ratio });
        // smaller tables get longer legs so every top clears the wall bar and
        // the heights read ascending (matches the tutorial showcase)
        var stretch = 1;
        if (t.spans === bySize[0]) { table.classList.add('table--tall'); stretch = 1.22; }
        else if (t.spans === bySize[1]) { table.classList.add('table--tall-mid'); stretch = 1.15; }
        card._table = table;
        card._w = cardW;
        card._h = cardW * a.ratio * stretch;
        card.appendChild(table);
        if (state.measured.indexOf(i) >= 0) {
          card.classList.add('hall-card--done');
          card.appendChild(el('div.hall-card__done', { text: t.spans + ' handspans' }));
        }
        carousel.appendChild(card);
        return card;
      });

      // floating dust motes drifting up through the warm spotlight (atmosphere)
      for (var d = 0; d < 9; d++) {
        var mote = el('div.dust');
        var sz = 3 + Math.random() * 5;
        Object.assign(mote.style, {
          left: (42 + Math.random() * 16) + '%',
          top: (46 + Math.random() * 30) + '%',
          width: sz + 'px', height: sz + 'px',
          animationDuration: (6 + Math.random() * 6) + 's',
          animationDelay: (-Math.random() * 8) + 's'
        });
        carousel.appendChild(mote);
      }
      s.appendChild(carousel);

      var nudge = UI.HandNudge();
      nudge.classList.add('hand-nudge--tap');
      // hidden until the entrance recap finishes and the next table is in focus
      Object.assign(nudge.style, { left: '52%', top: '56%', display: 'none' });
      s.appendChild(nudge);

      var n = cards.length;
      function isDone(i) { return state.measured.indexOf(i) >= 0; }

      function layout() {
        cards.forEach(function (card, i) {
          card.classList.remove('is-center', 'is-left', 'is-right');
          var rel = (i - state.center + n) % n;       // 0 centre, 1 right, 2 left
          card.classList.add(rel === 0 ? 'is-center' : (rel === 1 ? 'is-right' : 'is-left'));
          // glow only the centred, still-measurable table
          card._table.classList.toggle('table--glow', rel === 0 && !isDone(i));
        });
        // The light cone is tuned for the small tables; the 8-span tabletop is
        // wider than the beam at its height. Widen the cone (via --beam-scale)
        // just enough that the beam clears the centred tabletop with a margin.
        // Mirrors the .hall-carousel::after geometry: width 72% of the stage,
        // top -6%, height 98%, cone edges 24% -> 86% of its width top-to-bottom.
        var c = cards[state.center];
        var tableW = c._w * 1.3;                          // is-center scale
        var tableTopY = (720 - 236) - c._h * 1.3;         // cards stand 236px above the stage floor
        var t = (tableTopY + 0.06 * 720) / (0.98 * 720);  // 0 = cone top, 1 = cone bottom
        var beamAtTop = 0.72 * 1280 * (0.24 + 0.62 * t);  // base beam width at the tabletop
        var scale = Math.max(1, (tableW + 48) / beamAtTop);
        carousel.style.setProperty('--beam-scale', scale.toFixed(3));
      }
      layout();

      // the sequence is FIXED: only the centred, next-in-line table is tappable
      var picked = false;   // guards against double-taps re-running the round
      cards.forEach(function (card, i) {
        card.addEventListener('mouseenter', function () {
          if (card.classList.contains('is-center') && !isDone(i)) A.playHover();
        });
        card.addEventListener('click', function () {
          if (picked || !card.classList.contains('is-center') || isDone(i)) return;
          picked = true;
          A.playClick();
          nudge.remove();
          var c = FX.centerOf(card);
          FX.sparkleBurst(c.x, c.y, { count: 18, spread: 130 });
          FX.ringBurst(c.x, c.y, '#FFD54A');
          card._table.style.transition = 'transform 0.45s cubic-bezier(.3,1.5,.4,1)';
          card._table.style.transform = 'scale(1.12)';
          setTimeout(function () { measureTable(config, h, i); }, 460);
        });
      });

      // ENTRANCE RECAP: the just-measured table holds the spotlight, bright,
      // with its "N handspans" chip — then it glides aside, the next table
      // comes into focus, and only then the hand nudge appears.
      var prevCard = cards[state.center];
      prevCard.classList.add('hall-card--recap');
      prevCard._table.classList.add('table--glow');
      // the festive overlay still covers the scene for ~1.3s after it is
      // built — hold the recap long enough that it plays out in full view
      var run = FX.wait(3000);
      run = run.then(function () {
        prevCard.classList.remove('hall-card--recap');
        A.playWhoosh();
        for (var k = 1; k <= n; k++) {                 // next unmeasured table
          var idx = (state.center + k) % n;
          if (!isDone(idx)) { state.center = idx; break; }
        }
        layout();                                      // the recap card glides aside
        return FX.wait(900);
      });
      return run.then(function () {
        if (!document.body.contains(nudge)) return;
        UI.idleNudge(nudge, { onShow: function () { A.playPop(); } });
        nudge.style.display = '';
        A.playPop();
      });
    });
  }

  /* ====================================================================== *
   * MEASURE A CHOSEN TABLE  (guess -> verify -> result)
   * ====================================================================== */
  function measureTable(config, h, index) {
    var t = state.tables[index];
    playRound(config, h, {
      spans: t.spans,
      src: art(index).src,
      ratio: art(index).ratio,
      name: art(index).name,
      e0: art(index).e0,
      e1: art(index).e1,
      foot: art(index).foot,
      showFaded: state.hallMeasured === 0,   // faded track only on the first HALL table
      onDone: function () {
        state.hallMeasured++;
        state.measured.push(index);
        // The game does NOT end the moment the 6-span table is found — the
        // player measures every table first. Once all are measured, Gogo
        // celebrates & bags the target (6-handspan) one.
        if (state.measured.length >= state.tables.length) hallSuccess(config, h);
        // festive transition back to the hall; measured tables are disabled
        else h.festiveTransition(function () { hall(config, h); }, 'Next table!');
      }
    });
  }

  // a single measure cycle for one table (guess on a faded track -> verify)
  function playRound(config, h, opts) {
    h.setBackground('single');   // the individual-table room (BgmSingle)
    var spans = opts.spans;

    // The hand is a FIXED size; the table's width grows with its span count, so
    // a 6-handspan table is visibly longer than a 4-handspan one. The track runs
    // between the table's OUTER leg edges (e0..e1), bracketed by the guides.
    var e0 = opts.e0 != null ? opts.e0 : 0.05;
    var e1 = opts.e1 != null ? opts.e1 : 0.95;
    var foot = opts.foot != null ? opts.foot : 0.99;  // leg-foot fraction of the art height
    // Hand width per round: the BIGGEST (8-span) table keeps the classic 70px
    // hand / 611px width; the smaller tables get proportionally LARGER hands so
    // they fill the room more, while still reading shorter than the 8-span one
    // (graded target widths: 5 spans -> ~523px, 6 -> ~550px, 8 -> ~611px).
    var HW = spans >= 8 ? 70 : Math.round(((611 - (8 - spans) * 30) * (e1 - e0)) / spans);
    var TRACK_W = HW * spans;                         // track length scales with spans
    var TABLE_W = TRACK_W / (e1 - e0);                // table width that fits the track
    var TABLE_LEFT = (FX.STAGE_W - TABLE_W) / 2;
    var TABLE_H = TABLE_W * (opts.ratio || 350 / 662);
    // Every table STANDS ON the floor line: we anchor by its measured leg-foot
    // (foot) so the visible legs — not the transparent padding below them — land
    // on FLOOR_Y. The hand row sits right at the feet.
    var FLOOR_Y = 452;                               // floor line (where the legs stand)
    var TABLE_TOP = FLOOR_Y - TABLE_H * foot;
    var TRACK_X0 = TABLE_LEFT + TABLE_W * e0;
    var HAND_TOP = FLOOR_Y;                           // hand-box top at the feet (hands hang below)
    var GUIDE_TOP = FLOOR_Y - 10;                     // dashed guides begin at the feet
    var GUIDE_H = HW + 14;                            // bracket just the hand row (no long overflow)

    // deferGuide: the tutorial reveals the guide lines ITSELF (a beat after the
    // table, with SFX) — the layer exposes revealGuide() for that.
    function buildStage(s, heading, deferGuide) {
      // no vignette / blur here — the individual-table room stays clean & bright
      var table = UI.Table({ w: TABLE_W, src: opts.src, ratio: opts.ratio });
      Object.assign(table.style, { position: 'absolute', left: TABLE_LEFT + 'px', top: TABLE_TOP + 'px', zIndex: '5' });
      s.appendChild(table);
      if (heading) s.appendChild(UI.Heading(heading));
      var layer = el('div', { style: { position: 'absolute', inset: '0', zIndex: '20' } });
      s.appendChild(layer);
      var g = UI.MeasureGuide(TRACK_X0, TRACK_X0 + TRACK_W, GUIDE_TOP, GUIDE_H);
      s.appendChild(g);
      layer.revealGuide = function () {
        g.reveal();
        A.playWhoosh();
        FX.sparkleBurst(TRACK_X0, GUIDE_TOP, { count: 6, spread: 40, color: '#e11dff' });
        FX.sparkleBurst(TRACK_X0 + TRACK_W, GUIDE_TOP, { count: 6, spread: 40, color: '#e11dff' });
      };
      // spotlight the START line while Gogo delivers the start-from-one-end rule
      layer.pulseStart = function (on) {
        var l = g.startLine;
        if (on) { l.style.animation = ''; l.classList.add('measure-guide__line--hot'); return; }
        l.classList.remove('measure-guide__line--hot');
        // pin the revealed end-state so the .is-in drop animation doesn't replay
        Object.assign(l.style, { animation: 'none', transform: 'scaleY(1)', opacity: '1' });
      };
      if (!deferGuide) requestAnimationFrame(function () { g.reveal(); });
      return layer;
    }

    // place `count` hands flush along the track (defaults to the table's true
    // span count). variant: 'faded' | 'guide' | 'solid'.  numbered: 1..N circles.
    function placeTrack(layer, variant, numbered, count, anim) {
      var n = count != null ? count : spans;
      var nodes = [];
      for (var i = 0; i < n; i++) {
        var node = UI.HandSpan({ variant: variant, w: HW, h: HW, anim: anim });
        Object.assign(node.style, { position: 'absolute', left: (TRACK_X0 + i * HW) + 'px', top: HAND_TOP + 'px' });
        layer.appendChild(node);
        if (numbered) {
          var num = el('div.track-num', { text: String(i + 1) });
          Object.assign(num.style, {
            position: 'absolute', left: (TRACK_X0 + i * HW + HW / 2) + 'px',
            top: (HAND_TOP + HW + 4) + 'px', transform: 'translateX(-50%)'
          });
          layer.appendChild(num);
        }
        nodes.push(node);
      }
      return nodes;
    }

    // Intro demo before guessing: the hand stretches to measure the first
    // `count` spans (starting at the edge, each flush after the previous) and
    // STOPS, leaving faded impressions — then the "Guess..." question appears.
    function previewMeasure(layer, count) {
      return new Promise(function (resolve) {
        function slotLeft(i) { return TRACK_X0 + i * HW; }
        var hand = UI.MeasureHand(HW);
        Object.assign(hand.style, {
          left: slotLeft(0) + 'px', top: HAND_TOP + 'px', opacity: '0', zIndex: '24',
          transition: 'left 0.3s cubic-bezier(.4,.02,.3,1), opacity 0.2s ease'
        });
        layer.appendChild(hand);
        A.playWhoosh();
        requestAnimationFrame(function () { hand.style.opacity = '1'; });

        var i = 0;
        function step() {
          UI.playMeasureHand(hand, 1).then(function () {
            A.playPop();
            FX.sparkleBurst(slotLeft(i) + HW / 2, HAND_TOP + HW / 2, { count: 6, spread: 46, color: '#bfe39a' });
            var imp = UI.HandSpan({ variant: 'faded', w: HW, h: HW, anim: true });
            Object.assign(imp.style, { position: 'absolute', left: slotLeft(i) + 'px', top: HAND_TOP + 'px' });
            layer.appendChild(imp);
            i++;
            if (i >= count) {
              setTimeout(function () {
                hand.style.opacity = '0';
                setTimeout(function () { hand.remove(); resolve(); }, 240);
              }, 220);
              return;
            }
            hand.style.left = slotLeft(i) + 'px';
            setTimeout(step, 320);
          });
        }
        setTimeout(step, 380);
      });
    }

    /* ---- DRAG-TO-MEASURE: the player drags hands into the span slots ------ *
     * The table defines `spans` invisible drop-zones across its width. A hand
     * sits on a podium (bottom-left); the player drags it into the NEXT empty
     * zone only — placement is strictly left-to-right, one after the other, so
     * you can't skip ahead or leave gaps. The first time, an arrow guides the
     * drag to zone 1; after that, going idle ~3s highlights the hand + shows
     * the hand-nudge. When every zone is filled the table is measured. */
    function dragScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        // EVERY round reveals the stage piece by piece (table -> guide lines
        // -> Gogo + text -> handspan) — the guide reveal is always deferred
        // to the sequence (runTutorial / beginRound)
        var layer = buildStage(s, null, true);
        // no standing instruction panel — Gogo himself delivers the line in
        // both modes (see runTutorial / beginRound), then steps aside
        var bubble = null;

        var stageEl = document.getElementById('stage');
        function toStage(cx, cy) {
          var r = stageEl.getBoundingClientRect();
          return { x: (cx - r.left) * (FX.STAGE_W / r.width), y: (cy - r.top) * (FX.STAGE_H / r.height) };
        }

        // invisible drop-zones = the snap targets across the track
        var zones = [];
        for (var i = 0; i < spans; i++) {
          var zx = TRACK_X0 + i * HW;
          var zn = el('div.drop-zone');
          Object.assign(zn.style, { position: 'absolute', left: zx + 'px', top: HAND_TOP + 'px', width: HW + 'px', height: HW + 'px' });
          layer.appendChild(zn);
          zones.push({ left: zx, cx: zx + HW / 2, filled: false, node: zn });
        }
        var filled = 0, alive = true, firstPlaced = false;
        var curHand = null, arrow = null, idleTimer = null, idleNudgeEl = null;
        var teacher = null;   // the Gogo/ThinkGogo character shown during the tutorial demo
        var demoSource = null;   // the persistent hand on the podium during the demo (clones do the moving)

        var REST = { left: 92, top: 508 };   // hand's resting spot (bottom-left, lifted out of the
                                             // corner but clear of the lounging Gogo's pointing finger)
        // the resting spot reads as a glowing "handspan button": the purple
        // podium art (assets/handDrag.svg) sits under the hovering hand, its
        // light beam rising up behind the hand (hand z-index is higher)
        var podW = Math.round(HW * 2.6), podH = Math.round(podW * 525 / 532);
        var podium = el('img.drag-podium', { src: 'assets/handDrag.svg', alt: '', draggable: 'false' });
        Object.assign(podium.style, {
          left: (REST.left + HW / 2 - podW / 2) + 'px',
          top: (REST.top + HW + 14 - Math.round(podH * 0.59)) + 'px',   // disc a beat below the hovering hand
          width: podW + 'px', height: podH + 'px'
        });
        podium.style.display = 'none';   // revealed together with the handspan
        s.appendChild(podium);

        // sequential placement: the ONLY valid target is the next empty slot.
        // zones fill strictly left-to-right, so that's always index `filled`.
        function nextZone() { return filled < spans ? filled : -1; }
        function clearTargets() { zones.forEach(function (z) { z.node.classList.remove('drop-zone--target'); }); }
        function stopIdle() {
          if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
          if (curHand) curHand.classList.remove('drag-hand--hint');
          if (idleNudgeEl) { idleNudgeEl.remove(); idleNudgeEl = null; }
        }
        // The nudge cursor TRACES the drag path on a loop — podium up to the
        // next empty slot — showing the child the hand must be moved that way.
        function showDragNudge() {
          if (idleNudgeEl || !alive) return;
          var n = UI.HandNudge();
          // the cropped nudge's fingertip is top-centre; start it over the hand
          Object.assign(n.style, { position: 'absolute', left: (REST.left + HW * 0.42) + 'px', top: (REST.top + HW * 0.06) + 'px', width: '44px', zIndex: '30' });
          s.appendChild(n);
          idleNudgeEl = n;
          A.playPop();
          (function pass() {
            if (idleNudgeEl !== n || !alive) return;
            var zi = nextZone();
            if (zi < 0) { stopIdle(); return; }
            n.style.transition = 'none'; n.style.opacity = '1';
            n.style.left = (REST.left + HW * 0.42) + 'px'; n.style.top = (REST.top + HW * 0.06) + 'px';
            moveArc(n, zones[zi].left + HW * 0.42, HAND_TOP + HW * 0.1, 1400).then(function () {
              if (idleNudgeEl !== n) return;
              n.style.transition = 'opacity 0.25s ease'; n.style.opacity = '0';
              setTimeout(pass, 420);
            });
          })();
        }
        function armIdle() {
          stopIdle();
          if (!alive || filled >= spans) return;
          idleTimer = setTimeout(function () {
            if (!alive || !curHand) return;
            curHand.classList.add('drag-hand--hint');
            showDragNudge();
          }, 5000);
        }
        // The hand on the podium is a PERSISTENT source — it never moves. Each
        // drag lifts a CLONE that follows the pointer; on drop the clone is
        // placed (or discarded) and the source stays put for the next span.
        function spawnHand() {
          var src = el('div.drag-hand', null, [el('img', { src: 'assets/handSpanHand.webp', alt: '', draggable: 'false' })]);
          Object.assign(src.style, { left: REST.left + 'px', top: REST.top + 'px', width: HW + 'px', height: HW + 'px' });
          s.appendChild(src);
          curHand = src;
          wireDrag(src);
          armIdle();
          // first-ever drag: arrow + target the first zone
          if (!firstPlaced && !arrow) {
            // the arrowhead lands INSIDE the target square, marking the drop spot
            arrow = makeArrow(REST.left + HW, REST.top + 6, zones[0].left + HW * 0.35, HAND_TOP + HW / 2);
            s.appendChild(arrow);
            zones[0].node.classList.add('drop-zone--target');
          }
        }

        function wireDrag(src) {
          var dragging = false, clone = null;
          function down(e) {
            if (dragging || !alive || filled >= spans) return;
            dragging = true; stopIdle();
            src.classList.remove('drag-hand--hint');
            if (arrow) { arrow.remove(); arrow = null; }
            // tutorial: the "Now you try!" instruction + teaching Gogo step aside
            // the moment the child takes over
            if (opts.tutorial) {
              if (bubble) { bubble.remove(); bubble = null; }
              // the teaching Gogo teleports away in a magic poof
              if (teacher) { var tg = teacher; teacher = null; UI.gogoVanish(tg).then(function () { tg.remove(); }); }
            }
            clearTargets();
            // lift a clone that follows the pointer; the source stays on the podium
            clone = el('div.drag-hand drag-hand--dragging', null, [el('img', { src: 'assets/handSpanHand.webp', alt: '', draggable: 'false' })]);
            Object.assign(clone.style, { left: src.style.left, top: src.style.top, width: HW + 'px', height: HW + 'px', pointerEvents: 'none' });
            s.appendChild(clone);
            // Track move/up on the DOCUMENT (not the source): the source stays put
            // on the podium, so once the pointer leaves it, element-scoped events
            // stop firing and the clone would freeze. Document listeners follow the
            // pointer anywhere until release.
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', up);
            document.addEventListener('pointercancel', up);
            // no ghost-hand guide while dragging — the idle hand nudge (and the
            // glowing target zone) is guidance enough
            A.playPop(); move(e); e.preventDefault();
          }
          function move(e) {
            if (!dragging || !clone) return;
            var p = toStage(e.clientX, e.clientY);
            clone.style.left = (p.x - HW / 2) + 'px'; clone.style.top = (p.y - HW / 2) + 'px';
            clearTargets();
            var mzi = nextZone();
            if (mzi >= 0 && p.y > HAND_TOP - HW && p.y < HAND_TOP + HW * 2) zones[mzi].node.classList.add('drop-zone--target');
          }
          function up(e) {
            if (!dragging) return; dragging = false;
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            document.removeEventListener('pointercancel', up);
            clearTargets();
            var c = clone; clone = null;
            if (!c) return;
            var p = toStage(e.clientX, e.clientY);
            // accept the drop ONLY when it lands near the next slot (within ~one
            // hand-width) — a later square or a gap snaps the clone back & away.
            var zi = nextZone();
            var near = zi >= 0 && p.y > HAND_TOP - HW && p.y < HAND_TOP + HW * 2 && Math.abs(p.x - zones[zi].cx) < HW;
            if (near) placeClone(c, zi); else discardClone(c);
          }
          src.addEventListener('pointerdown', down);
        }

        function placeClone(clone, zi) {
          var z = zones[zi]; z.filled = true; filled++;
          clone.style.transition = 'left 0.16s ease, top 0.16s ease';
          clone.style.left = z.left + 'px'; clone.style.top = HAND_TOP + 'px';
          clone.classList.remove('drag-hand--dragging'); clone.classList.add('drag-hand--placed');
          A.playHandPlace(); FX.pulse(clone);   // drop sound when the hand lands in a span area
          FX.sparkleBurst(z.cx, HAND_TOP + HW / 2, { count: 7, spread: 48, color: '#bfe39a' });
          firstPlaced = true;   // (the instruction bubble stays constant)
          if (filled >= spans) setTimeout(finishMeasure, 560);
          else armIdle();   // source stays on the podium, ready for the next span
        }

        function discardClone(clone) {
          clone.classList.remove('drag-hand--dragging');
          clone.style.transition = 'left 0.2s ease, top 0.2s ease, opacity 0.2s ease';
          clone.style.left = REST.left + 'px'; clone.style.top = REST.top + 'px'; clone.style.opacity = '0';
          setTimeout(function () { clone.remove(); }, 220);
          armIdle();
        }

        function finishMeasure() {
          alive = false; stopIdle();
          // the standing instruction + teaching Gogo have served their purpose —
          // clear them so they don't collide with Gogo's success panel
          if (bubble) { bubble.remove(); bubble = null; }
          if (teacher) { var tg2 = teacher; teacher = null; UI.gogoVanish(tg2).then(function () { tg2.remove(); }); }
          if (curHand) { curHand.remove(); curHand = null; }   // remove the podium source
          podium.remove();   // the empty button has nothing left to offer
          FX.celebrate();
          var readWait = feedback(s, 'success', ['Well Done!', 'The table is ' + spans + ' handspans long!']);
          h.tapToContinue(readWait).then(function () { opts.onDone(); });
        }

        /* ================================================================ *
         * TUTORIAL DEMO — Gogo teaches the drag-to-measure rules by example
         * before the player takes over. Runs only when opts.tutorial is set.
         * It fills zones 0 and 1 via a scripted animation (a faded "ghost"
         * shows the drag gesture; a solid hand tries wrong spots first, so the
         * child sees WHY the start point / no-gaps / no-overlaps rules matter),
         * then hands control to the normal interactive flow for the rest.
         * ================================================================ */
        // hand centres/edges used by the demo (left coords)
        var L0 = zones[0].left;                              // correct: at the start line
        var L1 = zones[1] ? zones[1].left : L0 + HW;         // correct: flush after hand 1
        var MID = TRACK_X0 + Math.round(TRACK_W / 2 - HW / 2);   // wrong: middle of the row
        var LEFTSIDE = TRACK_X0 - Math.round(HW * 1.2);      // wrong: FULLY outside the start line (clear gap, no touching)
        var ONLINE = TRACK_X0 - Math.round(HW / 2);          // wrong: straddling the start line
        var OVERLAP = TRACK_X0 + Math.round(HW * 0.45);      // wrong: on top of hand 1
        var GAP = TRACK_X0 + Math.round(HW * 1.7);           // wrong: a gap after hand 1

        function demoHand(faded) {
          var hand = el('div.drag-hand', null, [el('img', { src: 'assets/handSpanHand.webp', alt: '', draggable: 'false' })]);
          Object.assign(hand.style, { left: REST.left + 'px', top: REST.top + 'px', width: HW + 'px', height: HW + 'px', pointerEvents: 'none' });
          if (faded) hand.style.opacity = '0.4';
          s.appendChild(hand);
          return hand;
        }
        function moveTo(hand, left, top, ms) {
          return new Promise(function (res) {
            hand.style.transition = 'left ' + ms + 'ms cubic-bezier(.3,1,.4,1), top ' + ms + 'ms cubic-bezier(.3,1,.4,1)';
            requestAnimationFrame(function () { hand.style.left = left + 'px'; if (top != null) hand.style.top = top + 'px'; });
            setTimeout(res, ms + 40);
          });
        }
        // move the hand from its current spot to (tx,ty) along a curved arc that
        // rises up & over — tracing the same path the guide arrow points along
        // (podium -> drop area). Slower & hand-animated so the child can follow it.
        function moveArc(hand, tx, ty, ms) {
          var sx = parseFloat(hand.style.left) || 0;
          var sy = parseFloat(hand.style.top) || 0;
          var cx = (sx + tx) / 2, cy = Math.min(sy, ty) - 90;   // arc height matches the arrow's rise
          return new Promise(function (res) {
            hand.style.transition = 'none';
            var start = null;
            function frame(t) {
              if (start === null) start = t;
              var p = Math.min(1, (t - start) / ms);
              var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;   // ease in-out
              var m = 1 - e;
              hand.style.left = (m * m * sx + 2 * m * e * cx + e * e * tx) + 'px';
              hand.style.top = (m * m * sy + 2 * m * e * cy + e * e * ty) + 'px';
              if (p < 1) requestAnimationFrame(frame); else res();
            }
            requestAnimationFrame(frame);
          });
        }
        // snap a demo hand into a zone (marks it filled, no auto-spawn)
        function lockDemoHand(hand, zi) {
          var z = zones[zi]; z.filled = true; filled++;
          hand.style.left = z.left + 'px'; hand.style.top = HAND_TOP + 'px';
          hand.classList.add('drag-hand--placed');
          A.playHandPlace(); FX.pulse(hand);
          FX.sparkleBurst(z.cx, HAND_TOP + HW / 2, { count: 7, spread: 48, color: '#bfe39a' });
        }
        // Each pose's art has different transparent padding, so the bubble is
        // anchored to that pose's VISIBLE right edge — no floating gap on
        // narrow poses (e.g. ThinkGogo). BOTTOM-anchored (like GOGO_BUBBLE) so
        // short lines ("Yes!") keep their tail tip on his head too.
        var DEMO_BUBBLE = {
          talk: { left: '430px', bottom: '600px' },
          think: { left: '410px', bottom: '600px' },
          // lifted clear ABOVE the raised hand ("Now you try!" / "Drag the
          // rest…") — the tail tip points down toward the hand without the
          // bubble body ever clashing with it
          show: { left: '385px', bottom: '615px' },
          wrong: { left: '390px', bottom: '600px' }
        };
        function demoBubbleAt(pose) { return DEMO_BUBBLE[pose] || DEMO_BUBBLE.talk; }
        // beside the head of the small horizontal Gogo down at the podium
        var PODIUM_BUBBLE = { left: '280px', bottom: '330px' };
        // Gogo speaks; the bubble sits beside him with its tail pointing at him.
        // `pose` picks the asset by the kind of line. Auto-advances after `ms`,
        // or waits for a tap if ms is 0.
        function demoLine(text, ms, pose, posOverride, tail) {
          return new Promise(function (res) {
            if (teacher && pose) UI.setGogoPose(teacher, pose);
            var b = UI.SayBubble(text, tail || 'left');
            Object.assign(b.style, posOverride || demoBubbleAt(pose || 'talk'));
            s.appendChild(b);
            A.playDialogue();
            // every timed line stays up at least long enough to be READ by a
            // child (lineMs scales with the word count)
            if (ms) setTimeout(function () { b.remove(); res(); }, Math.max(ms, lineMs(text)));
            else h.tapToContinue(lineMs(text)).then(function () { b.remove(); res(); });
          });
        }
        // the pointing (horizontal) Gogo GLIDES alongside a moving hand — same
        // duration as the hand's move so the two travel and settle TOGETHER,
        // his finger landing right above stage x=cx. He hovers at ONE fixed
        // height for every spot, so he never bobs down for a particular line.
        var POINT_TOP = 226;
        function glidePointGogo(cx, ms) {
          if (!teacher) return;
          UI.setGogoPose(teacher, 'horizontal');
          teacher.style.width = '250px';
          teacher.style.transition = 'left ' + ms + 'ms cubic-bezier(.4,.05,.4,1), top ' + ms + 'ms cubic-bezier(.4,.05,.4,1)';
          requestAnimationFrame(function () { teacher.style.left = (cx - 136) + 'px'; teacher.style.top = POINT_TOP + 'px'; });
        }
        // bubble slot right BESIDE the hovering pointer-Gogo's head (turban top
        // sits ~290px when he hovers at top:226) — at head height on his right,
        // tail curving down onto his face.
        function pointBubbleAt(cx) { return { left: (cx + 92) + 'px', top: (POINT_TOP + 20) + 'px' }; }
        // "No!" comes from the SAME hovering pointer-Gogo — he stays put,
        // finger on the spot in question; only the bubble text changes
        function noHere(cx) {
          return new Promise(function (res) {
            var b = UI.SayBubble('No!', 'left');
            Object.assign(b.style, pointBubbleAt(cx));
            s.appendChild(b);
            A.playWrong();
            setTimeout(function () { b.remove(); res(); }, 2600);
          });
        }
        // teleport the teacher back to his corner
        function gogoHome(pose) {
          return UI.gogoTeleport(teacher, function () {
            UI.setGogoPose(teacher, pose || 'talk');
            Object.assign(teacher.style, { width: '', transition: '', left: GOGO_SPOT.left, top: GOGO_SPOT.top });
          });
        }
        // "No!" / "Yes!" is Gogo answering his own question — same purple bubble
        // pointing at him (NOT a separate coloured badge); the sound conveys
        // right vs wrong. `good` also picks a matching pose.
        function verdict(text, good, posOverride, tail) {
          return new Promise(function (res) {
            if (teacher) UI.setGogoPose(teacher, good ? 'talk' : 'wrong');
            var b = UI.SayBubble(text, tail || 'left');
            Object.assign(b.style, posOverride || demoBubbleAt(good ? 'talk' : 'wrong'));
            s.appendChild(b);
            if (good) A.playSuccess(); else A.playWrong();
            setTimeout(function () { b.remove(); res(); }, 2600);
          });
        }

        function runTutorial() {
          // Staged reveal — one thing at a time so the child can follow:
          //   1. the table alone   2. the guide lines (SFX)
          //   3. Gogo + his line   4. the handspan on its podium
          teacher = UI.GogoCharacter('talk');
          Object.assign(teacher.style, { left: GOGO_SPOT.left, top: GOGO_SPOT.top, visibility: 'hidden' });
          s.appendChild(teacher);

          // unhurried beats: each reveal gets a moment to land before the next
          var seq = FX.wait(1300);                                  // 1. table alone
          seq = seq.then(function () {
            layer.revealGuide();                                    // 2. lines drop in (SFX)
            return FX.wait(1300);
          });
          seq = seq.then(function () {                              // 3. Gogo poofs in...
            UI.gogoAppear(teacher);
            return FX.wait(800);
          });
          seq = seq.then(function () { return demoLine('We need to measure the table using hand spans.', 0, 'talk'); });
          // "But How?" — the thinking genie (nothing else on screen yet: the
          // handspan only pops in AFTER the question, as its answer)
          seq = seq.then(function () { return demoLine('But How?', 0, 'think'); });
          seq = seq.then(function () { return FX.wait(400); });     // beat before the answer
          seq = seq.then(function () {                              // 4. the handspan appears
            podium.style.display = '';
            demoSource = demoHand(false);
            demoSource.style.transform = 'scale(0.3)'; demoSource.style.opacity = '0';
            demoSource.style.transition = 'transform 0.3s cubic-bezier(.2,1.5,.4,1), opacity 0.25s ease';
            requestAnimationFrame(function () { demoSource.style.transform = 'scale(1)'; demoSource.style.opacity = '1'; });
            A.playPop();
            return FX.wait(900);
          });

          // (1) Gogo flies down BESIDE THE HANDSPAN on its podium — a smaller
          // flying pose pointing at it — and introduces the drag. NO guide
          // arrow and NO correct-spot preview in the tutorial (the real game
          // rounds keep their own first-drag arrow): the tutorial teaches by
          // taking the hand straight to the WRONG spots first, Gogo gliding
          // along in sync the whole way.
          seq = seq.then(function () {
            return UI.gogoTeleport(teacher, function () {
              UI.setGogoPose(teacher, 'horizontal');
              Object.assign(teacher.style, { width: '250px', left: '16px', top: '330px' });
            });
          });
          // his line pops up RIGHT AT HIS HEAD down there (tail tip on his
          // turban), stays just long enough to read, then the tour begins
          // KID PACING from here on: longer line holds + real pauses between
          // every question -> answer -> move, so each idea lands one at a time
          seq = seq.then(function () { return FX.wait(600); });     // let the teleport settle
          seq = seq.then(function () { return demoLine("Let's drag the first handspan.", 3200, null, PODIUM_BUBBLE); });
          seq = seq.then(function () { return FX.wait(700); });     // beat before the hand lifts off

          // (2) HAND 1 — the hand tries the wrong spots, then lands at the
          // start line.
          var hand1;
          // For each wrong spot, the pointing (horizontal) Gogo hovers right
          // above the hand — finger on the exact place in question — and a
          // breather separates each "Here?" -> "No!" cycle.
          var MID_CX = MID + HW / 2, LEFT_CX = LEFTSIDE + HW / 2, ON_CX = ONLINE + HW / 2;
          seq = seq.then(function () { hand1 = demoHand(false); A.playWhoosh(); glidePointGogo(MID_CX, 1300); return moveArc(hand1, MID, HAND_TOP, 1300); });
          seq = seq.then(function () { return FX.wait(500); });
          seq = seq.then(function () { return demoLine('Can we keep it here?', 3000, null, pointBubbleAt(MID_CX)); });
          seq = seq.then(function () { return noHere(MID_CX); });
          seq = seq.then(function () { return FX.wait(1800); });
          seq = seq.then(function () { A.playWhoosh(); glidePointGogo(LEFT_CX, 950); return moveTo(hand1, LEFTSIDE, HAND_TOP, 950); });
          seq = seq.then(function () { return FX.wait(500); });
          seq = seq.then(function () { return demoLine('Here?', 2600, null, pointBubbleAt(LEFT_CX)); });
          seq = seq.then(function () { return noHere(LEFT_CX); });
          seq = seq.then(function () { return FX.wait(1800); });
          // last wrong spot: Gogo glides across at the SAME hover height as the
          // other spots, finger settling right above the straddling hand
          seq = seq.then(function () { A.playWhoosh(); glidePointGogo(ON_CX, 900); return moveTo(hand1, ONLINE, HAND_TOP, 900); });
          seq = seq.then(function () { return FX.wait(500); });
          seq = seq.then(function () { return demoLine('Here?', 2600, null, pointBubbleAt(ON_CX)); });
          seq = seq.then(function () { return noHere(ON_CX); });
          seq = seq.then(function () { return FX.wait(1800); });
          // THE START RULE — the straddling hand's centre IS the start line
          // (ON_CX === TRACK_X0), so Gogo is ALREADY there, finger on the
          // handspan; he says the rule without moving at all. The START line
          // throbs bright for the whole rule + slide so "one end" is SEEN.
          seq = seq.then(function () { layer.pulseStart(true); return demoLine('We must start from one end of the table.', 3400, null, pointBubbleAt(TRACK_X0)); });
          // ...and only THEN the straddling hand slides to the correct spot,
          // landing right under his pointing finger
          seq = seq.then(function () { return FX.wait(500); });
          seq = seq.then(function () { A.playWhoosh(); return moveTo(hand1, L0, HAND_TOP, 850); });
          seq = seq.then(function () { return FX.wait(600); });
          seq = seq.then(function () { layer.pulseStart(false); return gogoHome('talk'); });
          seq = seq.then(function () { lockDemoHand(hand1, 0); return demoLine('Yes! Start right at the line.', 3200, 'talk'); });
          // checkpoint: the start rule is complete — the pulsing Next button
          // appears and the SECOND handspan's lesson waits for the tap
          seq = seq.then(function () { return h.tapToContinue(300); });

          // (3) HAND 2 — overlap, then gap, then flush (the "no gaps, no overlaps" rule)
          // Same pattern as hand 1: Gogo flies down beside the podium, says his
          // line, and the hand goes STRAIGHT to the wrong (overlap) spot —
          // no correct-slot preview — with Gogo gliding along in sync.
          var OVERLAP_CX = OVERLAP + HW / 2, GAP_CX = GAP + HW / 2, L1_CX = L1 + HW / 2;
          var hand2;
          seq = seq.then(function () {
            return UI.gogoTeleport(teacher, function () {
              UI.setGogoPose(teacher, 'horizontal');
              Object.assign(teacher.style, { width: '250px', left: '16px', top: '330px' });
            });
          });
          seq = seq.then(function () { return FX.wait(600); });     // let the teleport settle
          seq = seq.then(function () { return demoLine("Let's drag the next handspan.", 3200, null, PODIUM_BUBBLE); });
          seq = seq.then(function () { return FX.wait(700); });     // beat before the hand lifts off
          seq = seq.then(function () { hand2 = demoHand(false); A.playWhoosh(); glidePointGogo(OVERLAP_CX, 1300); return moveArc(hand2, OVERLAP, HAND_TOP, 1300); });
          seq = seq.then(function () { return FX.wait(500); });
          seq = seq.then(function () { return demoLine('Can we keep it here?', 3000, null, pointBubbleAt(OVERLAP_CX)); });
          seq = seq.then(function () { return noHere(OVERLAP_CX); });
          seq = seq.then(function () { return demoLine('Handspans must not overlap.', 3600, null, pointBubbleAt(OVERLAP_CX)); });
          seq = seq.then(function () { return FX.wait(1600); });
          seq = seq.then(function () { A.playWhoosh(); glidePointGogo(GAP_CX, 950); return moveTo(hand2, GAP, HAND_TOP, 950); });
          seq = seq.then(function () { return FX.wait(500); });
          seq = seq.then(function () { return demoLine('Then can we keep it here?', 3000, null, pointBubbleAt(GAP_CX)); });
          seq = seq.then(function () { return noHere(GAP_CX); });
          seq = seq.then(function () { return demoLine('There must be no gap between two handspans.', 3600, null, pointBubbleAt(GAP_CX)); });
          seq = seq.then(function () { return FX.wait(1600); });
          seq = seq.then(function () { A.playWhoosh(); glidePointGogo(L1_CX, 850); return moveTo(hand2, L1, HAND_TOP, 850); });
          seq = seq.then(function () { return FX.wait(500); });
          seq = seq.then(function () { lockDemoHand(hand2, 1); return demoLine('Then can we keep it here?', 3000, null, pointBubbleAt(L1_CX)); });
          seq = seq.then(function () { return gogoHome('talk'); });
          seq = seq.then(function () { return verdict('Yes!', true); });
          seq = seq.then(function () { return FX.wait(500); });
          seq = seq.then(function () { return demoLine("That's the perfect way!", 3000, 'talk'); });
          seq = seq.then(function () { FX.celebrate(); return demoLine('No Gaps! No Overlaps!', 3400, 'talk'); });
          return seq;
        }

        // hand control to the player for the remaining spans. Gogo delivers his
        // hand-over in two short lines, poofs away, and only THEN the nudge
        // cursor appears, tracing the drag path.
        function beginPlay() {
          firstPlaced = true;   // the demo already taught the drag — skip the first-time arrow
          if (demoSource) { demoSource.remove(); demoSource = null; }   // hand off to the interactive source
          if (teacher) UI.setGogoPose(teacher, 'show');
          var seq = FX.wait(500);                                   // breather after the demo's cheer
          seq = seq.then(function () { return demoLine('Now you try!', 2600, 'show'); });
          seq = seq.then(function () { return demoLine('Drag the rest with no gaps.', 3200, 'show'); });
          seq = seq.then(function () {
            if (!teacher) return;
            var tg = teacher; teacher = null;
            return UI.gogoVanish(tg).then(function () { tg.remove(); });
          });
          seq = seq.then(function () { return FX.wait(350); });     // beat before the hand + nudge
          seq = seq.then(function () {
            spawnHand();
            showDragNudge();   // demonstrate the drag path right away
          });
          return seq;
        }

        // non-tutorial rounds: SAME staged reveal as the tutorial — the table
        // alone, then the guide lines, then Gogo + his line, then the handspan
        function beginRound() {
          teacher = UI.GogoCharacter('talk');
          Object.assign(teacher.style, { left: GOGO_SPOT.left, top: GOGO_SPOT.top, visibility: 'hidden' });
          s.appendChild(teacher);
          var seq = FX.wait(1000);                                  // 1. the table alone
          seq = seq.then(function () {
            layer.revealGuide();                                    // 2. lines drop in (SFX)
            return FX.wait(1100);
          });
          seq = seq.then(function () {                              // 3. Gogo poofs in...
            UI.gogoAppear(teacher);
            return FX.wait(800);
          });
          seq = seq.then(function () { return demoLine('Find out how long the table is.', 2600, 'talk'); });
          seq = seq.then(function () {
            var tg = teacher; teacher = null;
            return UI.gogoVanish(tg).then(function () { tg.remove(); });
          });
          seq = seq.then(function () { return FX.wait(350); });     // beat before the hand + nudge
          seq = seq.then(function () {                              // 4. the handspan appears
            podium.style.display = '';
            A.playPop();
            spawnHand();
            showDragNudge();
          });
          return seq;
        }

        if (opts.tutorial) runTutorial().then(beginPlay);
        else beginRound();
        return null;
      });
    }

    dragScreen();
  }

  /* ====================================================================== *
   * SUCCESS — the 6-handspan table is found; Gogo bags it
   * ====================================================================== */
  function hallSuccess(config, h) {
    h.setBackground('play');
    h.transitionTo(function () {
      var s = h.scene();
      s.appendChild(UI.Vignette());

      // artwork of the target (6-handspan) table
      var tart = TABLE_ART[0];
      for (var ti = 0; ti < state.tables.length; ti++) {
        if (state.tables[ti].spans === state.target) { tart = art(ti); break; }
      }
      var card = el('div.hall-found');
      Object.assign(card.style, { position: 'absolute', left: '50%', top: '44%', transform: 'translate(-50%,-50%)', zIndex: '5' });
      var table = UI.Table({ w: 440, src: tart.src, ratio: tart.ratio });
      table.classList.add('table--glow');
      card.appendChild(table);
      // its handspan markers (the proof it's 6 long)
      var strip = el('div.marker-strip');
      var unit = (440 * 0.86) / state.target;
      for (var i = 0; i < state.target; i++) strip.appendChild(UI.HandSpan({ variant: 'solid', w: unit, h: unit }));
      card.appendChild(strip);
      s.appendChild(card);

      var run = Promise.resolve();
      run = run.then(function () {
        FX.celebrate(card);
        return gogoSay(s, ['You found it! This table is ' + state.target + ' handspans long!']);
      });
      run = run.then(function () { return sackAnim(h, s, card); });
      // ... then on to the cloth round (2nd flow, measured by width in the Bgm2 room)
      run = run.then(function () { startCloths(config, h); });
      return run;
    });
  }

  // Gogo (holding his sack) flies in from the right and the table shrinks into
  // the red sack. Uses the gogoWbag artwork; the sack sits at ~0.687 of its
  // width, ~0.503 of its height.
  function sackAnim(h, s, wrap) {
    return new Promise(function (resolve) {
      var gogo = el('img.gogo-bag', { src: 'assets/gogoWbag.webp', alt: '', draggable: 'false' });
      Object.assign(gogo.style, {
        position: 'absolute', right: '30px', bottom: '4px', height: '440px', width: 'auto',
        transform: 'translateX(135%)', transition: 'transform 0.6s cubic-bezier(.3,1,.4,1)',
        zIndex: '15', filter: 'drop-shadow(0 12px 16px rgba(0,0,0,0.35))'
      });
      s.appendChild(gogo);
      requestAnimationFrame(function () { gogo.style.transform = 'translateX(0)'; });

      setTimeout(function () {
        A.playWhoosh();
        var c = FX.centerOf(gogo), wc = FX.centerOf(wrap);
        var sackX = c.x + 0.187 * c.w, sackY = c.y + 0.003 * c.h;   // the red sack
        wrap.style.transition = 'transform 0.75s cubic-bezier(.5,0,.4,1), opacity 0.7s ease';
        wrap.style.transformOrigin = 'center center';
        wrap.style.transform = 'translate(' + (sackX - wc.x) + 'px,' + (sackY - wc.y) + 'px) scale(0.06) rotate(18deg)';
        wrap.style.opacity = '0';
        setTimeout(function () {
          FX.sparkleBurst(sackX, sackY, { count: 16, spread: 90 }); A.playSparkle();
          // the bag gives a little "stuffed" bounce
          gogo.style.transition = 'transform 0.18s ease';
          gogo.style.transform = 'translateY(-10px) scale(1.04)';
          setTimeout(function () { gogo.style.transform = 'translateY(0) scale(1)'; }, 190);
        }, 640);
      }, 760);

      // (no speech panel here) — just let the bag settle, then continue
      setTimeout(resolve, 1700);
    });
  }

  /* ====================================================================== *
   * END
   * ====================================================================== */
  function endScreen(config, h, sub) {
    h.setBackground('play');   // back to the default room for the finale
    h.transitionTo(function () {
      var s = h.scene();
      FX.confetti({ count: 140 });
      A.playSuccess();

      var col = el('div.center-col');
      col.appendChild(el('div.overlay__title overlay__title--ok', { text: 'You did it! 🎉' }));
      col.appendChild(el('div.overlay__sub', {
        text: sub || ('You found the ' + state.target + '-handspan table!'), style: { color: '#fff' }
      }));
      col.appendChild(UI.Button('Play Again', { variant: 'play', onClick: function () { HS.Game.start(); } }));
      s.appendChild(col);

      var gogo = el('img.gogo-bag', { src: 'assets/gogoWbag.webp', alt: '', draggable: 'false' });
      Object.assign(gogo.style, {
        position: 'absolute', right: '50px', bottom: '10px', height: '400px', width: 'auto',
        zIndex: '6', filter: 'drop-shadow(0 12px 16px rgba(0,0,0,0.35))'
      });
      s.appendChild(gogo);

      var trickle = setInterval(function () {
        if (!document.body.contains(col)) { clearInterval(trickle); return; }
        FX.confetti({ count: 18 });
      }, 1400);
      return null;
    });
  }

  /* ====================================================================== *
   * FIXED-SEQUENCE SHOWCASE HALL — shared by the cloth & candle flows
   * ----------------------------------------------------------------------
   * Mirrors the Hall of Tables exactly: on entry the JUST-measured item
   * holds the focus, bright, with its "N handspans" chip — then it glides
   * aside, the next item comes into focus, and a hand nudge invites the
   * tap. On the FIRST entry the three items open as a flat, equal row (all
   * fully on screen), then the first one grows into focus and glows.
   * No arrows, no rotation, no panels, no Gogo — the order is fixed.
   * opts: { bg, carouselClass, glowClass, makeNode(item), spansOf(item),
   *         onPick(index), blurIntro }
   * ====================================================================== */
  function fixedHall(h, st, opts) {
    h.setBackground(opts.bg);
    var n = st.list.length;
    // start centred on the item we just measured (recap), if any
    st.center = st.measured.length ? st.measured[st.measured.length - 1] : 0;

    h.transitionTo(function () {
      var s = h.scene();
      var carousel = el('div.hall-carousel hall-carousel--fixed ' + opts.carouselClass);
      // first entry opens on a FLAT equal row — the focus animation follows
      var introMode = !st.measured.length;
      if (introMode) carousel.classList.add('hall-carousel--intro');
      // Gogo presents from the left, so the intro row starts huddled RIGHT
      if (introMode && opts.introLines) carousel.classList.add('hall-carousel--present');
      // blurIntro: the first entry opens like the table showcase — the room
      // BLURRED and UNLIT behind the flat row; the blur lifts and the beam
      // snaps on as the focus move begins
      var bgEl = document.getElementById('bg');
      if (introMode && opts.blurIntro) {
        bgEl.classList.add('tut-blur');
        carousel.classList.add('hall-carousel--unlit');
      }
      carousel.appendChild(el('div.select-glow'));

      var cards = st.list.map(function (item, i) {
        var card = el('div.hall-card', { dataset: { idx: String(i) } });
        card._node = opts.makeNode(item);
        card.appendChild(card._node);
        if (st.measured.indexOf(i) >= 0) {
          card.classList.add('hall-card--done');
          card.appendChild(el('div.hall-card__done', { text: opts.spansOf(item) + ' handspans' }));
        }
        carousel.appendChild(card);
        return card;
      });
      s.appendChild(carousel);

      var nudge = UI.HandNudge();
      nudge.classList.add('hand-nudge--tap');
      // hidden until the entrance recap finishes and the next item is in focus
      Object.assign(nudge.style, { left: '52%', top: '48%', display: 'none' });
      s.appendChild(nudge);

      function isDone(i) { return st.measured.indexOf(i) >= 0; }
      function layout() {
        cards.forEach(function (card, i) {
          card.classList.remove('is-center', 'is-left', 'is-right');
          var rel = (i - st.center + n) % n;
          card.classList.add(rel === 0 ? 'is-center' : (rel === 1 ? 'is-right' : 'is-left'));
          // the glow marks the next-in-line item only once it holds the focus
          card._node.classList.toggle(opts.glowClass, !introMode && rel === 0 && !isDone(i));
        });
      }
      layout();

      // the sequence is FIXED: only the centred, next-in-line item is tappable
      var picked = false;   // guards against double-taps re-running the round
      cards.forEach(function (card, i) {
        card.addEventListener('mouseenter', function () {
          if (card.classList.contains('is-center') && !isDone(i)) A.playHover();
        });
        card.addEventListener('click', function () {
          if (picked || !card.classList.contains('is-center') || isDone(i)) return;
          picked = true;
          A.playClick(); nudge.remove();
          bgEl.classList.remove('tut-blur');   // never carry the intro blur forward
          var c = FX.centerOf(card);
          FX.sparkleBurst(c.x, c.y, { count: 18, spread: 130 });
          FX.ringBurst(c.x, c.y, '#FFD54A');
          card._node.style.transition = 'transform 0.45s cubic-bezier(.3,1.5,.4,1)';
          card._node.style.transform = 'scale(1.08)';
          setTimeout(function () { opts.onPick(i); }, 460);
        });
      });

      // ENTRANCE RECAP (after a measure): the just-measured item holds the
      // focus with its chip — then it glides aside, the next item comes into
      // focus, and only then the hand nudge appears.
      var run;
      if (st.measured.length) {
        var prevCard = cards[st.center];
        prevCard.classList.add('hall-card--recap');
        prevCard._node.classList.add(opts.glowClass);
        // the festive overlay still covers the scene for ~1.3s after it is
        // built — hold the recap long enough that it plays out in full view
        run = FX.wait(3000).then(function () {
          prevCard.classList.remove('hall-card--recap');
          A.playWhoosh();
          for (var k = 1; k <= n; k++) {                 // next unmeasured item
            var idx = (st.center + k) % n;
            if (!isDone(idx)) { st.center = idx; break; }
          }
          layout();                                      // the recap card glides aside
          return FX.wait(900);
        });
      } else {
        // ENTRANCE (first entry): the items hold as a flat, equal row (behind
        // a blurred room when blurIntro) while the festive overlay clears —
        // then the blur lifts, the first one GROWS into focus (the sides
        // recede and fade), and only then the nudge appears
        // with a presenting Gogo the row needs no long silent hold — he
        // enters as soon as the festive overlay has cleared (~1.3s)
        run = FX.wait(opts.introLines ? 1500 : (opts.blurIntro ? 3200 : 2200));
        // every flow's FIRST screen: the presenting ShowingGogo (open palm
        // sweeping toward the row, far LEFT like the table showcase) poofs in
        // and presents it ("Here are the ..." / "Let's measure ...") before
        // the focus move
        if (opts.introLines) run = run.then(function () {
          return gogoSay(s, opts.introLines, {
            pose: 'show',
            spot: { left: '-4px', top: '120px' },
            bubble: { left: '195px', bottom: '500px' }
          });
        });
        // STEP 1 (after the presentation): the row glides from the huddle to
        // the CENTRE — still flat and equal — and holds a beat
        run = run.then(function () {
          A.playWhoosh();
          bgEl.classList.remove('tut-blur');
          carousel.classList.remove('hall-carousel--present');
          return FX.wait(1100);
        });
        // STEP 2: only THEN the required item grows into focus (glow) while
        // the others recede and fade
        run = run.then(function () {
          A.playWhoosh();
          if (opts.blurIntro) A.playLightsOn();          // the beam snaps on with the move
          carousel.classList.remove('hall-carousel--unlit');
          carousel.classList.remove('hall-carousel--intro');
          introMode = false;
          layout();                                      // the focused item now glows
          return FX.wait(900);
        });
      }
      return run.then(function () {
        if (!document.body.contains(nudge)) return;
        // pin the tap cursor's FINGERTIP (30%/20% of the 45px art) right on
        // the centred item itself, whatever its size or floor line
        var c = FX.centerOf(cards[st.center]._node);
        Object.assign(nudge.style, { left: (c.x - 13) + 'px', top: (c.y - 13) + 'px' });
        UI.idleNudge(nudge, { onShow: function () { A.playPop(); } });
        nudge.style.display = '';
        A.playPop();
      });
    });
  }

  /* ====================================================================== *
   * CANDLE ROUND (flow 3) — VERTICAL DRAG measuring.
   * Plain pillar candles (Candle.png) measured by HEIGHT with the SAME
   * drag-the-handspan mechanic as the tables: the child drags hands from
   * the podium into a column beside the candle, bottom-to-top, no gaps.
   * Fixed order: 4 -> 2 -> the 3-span target (bagged last).
   * ====================================================================== */
  // alpha-measured from Candle.png (like the stand's base edge): body top /
  // bottom / half-width as fractions of the image height & width
  var PILLAR = { src: 'assets/Candle.png', ar: 1536 / 1024, topF: 0.122, botF: 0.956, sideF: 0.1146 };
  var PILLAR_VIS = PILLAR.botF - PILLAR.topF;
  var pillarState = null;

  // a candle wrapper whose VISIBLE height (body top -> base, wick excluded)
  // = visH px; bottom-cropped to the base so all candles share the floor line
  function pillarImg(visH) {
    var imgH = visH / PILLAR_VIS;
    var imgW = imgH * PILLAR.ar;
    var img = el('img.candle__img', { src: PILLAR.src, alt: '', draggable: 'false' });
    Object.assign(img.style, { position: 'absolute', left: '0', top: '0', width: imgW + 'px', height: imgH + 'px' });
    var wrap = el('div.candle', null, [img]);
    Object.assign(wrap.style, { width: imgW + 'px', height: (PILLAR.botF * imgH) + 'px' });
    wrap._imgH = imgH; wrap._imgW = imgW;
    return wrap;
  }

  function startPillars(config, h) {
    // measured in list order: 4, then 2, then the 3-span target (bagged last)
    pillarState = { list: [4, 2, 3], target: 3, measured: [], center: 0 };
    h.festiveTransition(function () { pillarHall(config, h); }, 'The Candle Room!');
  }

  /* ---- fixed-sequence candle showcase ------------------------------------ */
  function pillarHall(config, h) {
    fixedHall(h, pillarState, {
      bg: 'play',
      carouselClass: 'hall-carousel--candle',
      blurIntro: true,
      glowClass: 'candle--glow',
      introLines: ['Here are the candles.', "Let's measure how tall each candle is."],
      makeNode: function (spans) { return pillarImg(44 * spans); },   // taller candle -> more handspans
      spansOf: function (spans) { return spans; },
      onPick: function (i) { measurePillar(config, h, i); }
    });
  }

  function measurePillar(config, h, index) {
    playPillarRound(config, h, {
      spans: pillarState.list[index],
      onDone: function () {
        pillarState.measured.push(index);
        if (pillarState.measured.length >= pillarState.list.length) pillarSuccess(config, h);
        else h.festiveTransition(function () { pillarHall(config, h); }, 'Next candle!');
      }
    });
  }

  /* ---- one vertical DRAG measure cycle for a candle ---------------------- */
  function playPillarRound(config, h, opts) {
    h.setBackground('single');
    var spans = opts.spans;
    var HV = 76;                     // vertical hand unit (2-4 span candles)
    var CX = 640;                    // every candle's base is centred here
    var BASE_Y = 452;                // candles stand on the shared floor line
    var visH = HV * spans;
    var imgW = (visH / PILLAR_VIS) * PILLAR.ar;
    var BODY_HALF = PILLAR.sideF * imgW;
    var STACK_LEFT = CX - BODY_HALF - 12 - HV;   // hand column hugs the body's left edge

    h.transitionTo(function () {
      var s = h.scene();
      s.appendChild(UI.Vignette());
      var topY = BASE_Y - visH;
      var wrap = pillarImg(visH);
      Object.assign(wrap.style, {
        position: 'absolute', left: (CX - wrap._imgW / 2) + 'px',
        top: (topY - PILLAR.topF * wrap._imgH) + 'px', zIndex: '5'
      });
      s.appendChild(wrap);
      var layer = el('div', { style: { position: 'absolute', inset: '0', zIndex: '20' } });
      s.appendChild(layer);
      // the guides bracket the hand column AND the candle together (revealed
      // as step 2 of the staged entrance, not at build time)
      var g = UI.MeasureGuideH(STACK_LEFT - 12, CX + BODY_HALF + 24, topY, BASE_Y);
      s.appendChild(g);

      var stageEl = document.getElementById('stage');
      function toStage(cx, cy) {
        var r = stageEl.getBoundingClientRect();
        return { x: (cx - r.left) * (FX.STAGE_W / r.width), y: (cy - r.top) * (FX.STAGE_H / r.height) };
      }

      // drop zones stack BOTTOM-TO-TOP beside the candle (start at the base,
      // one above the other — the vertical mirror of the table's track)
      var zones = [];
      for (var i = 0; i < spans; i++) {
        var zt = BASE_Y - HV * (i + 1);
        var zn = el('div.drop-zone');
        Object.assign(zn.style, { position: 'absolute', left: STACK_LEFT + 'px', top: zt + 'px', width: HV + 'px', height: HV + 'px' });
        layer.appendChild(zn);
        zones.push({ left: STACK_LEFT, top: zt, cx: STACK_LEFT + HV / 2, cy: zt + HV / 2, node: zn });
      }
      var filled = 0, alive = true;
      var curHand = null, arrow = null, idleTimer = null, idleNudgeEl = null;

      var REST = { left: 92, top: 508 };   // podium spot (same as the table flow)
      var podW = Math.round(HV * 2.6), podH = Math.round(podW * 525 / 532);
      var podium = el('img.drag-podium', { src: 'assets/handDrag.svg', alt: '', draggable: 'false' });
      Object.assign(podium.style, {
        left: (REST.left + HV / 2 - podW / 2) + 'px',
        top: (REST.top + HV + 14 - Math.round(podH * 0.59)) + 'px',
        width: podW + 'px', height: podH + 'px'
      });
      podium.style.display = 'none';   // revealed together with the handspan
      s.appendChild(podium);

      function nextZone() { return filled < spans ? filled : -1; }
      function clearTargets() { zones.forEach(function (z) { z.node.classList.remove('drop-zone--target'); }); }
      function stopIdle() {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        if (curHand) curHand.classList.remove('drag-hand--hint');
        if (idleNudgeEl) { idleNudgeEl.remove(); idleNudgeEl = null; }
      }
      // rise-up-and-over arc (same easing as the table flow's moveArc)
      function moveArcN(node, tx, ty, ms) {
        var sx = parseFloat(node.style.left) || 0;
        var sy = parseFloat(node.style.top) || 0;
        var cx2 = (sx + tx) / 2, cy2 = Math.min(sy, ty) - 90;
        return new Promise(function (res) {
          node.style.transition = 'none';
          var start = null;
          function frame(t) {
            if (start === null) start = t;
            var p = Math.min(1, (t - start) / ms);
            var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            var m = 1 - e;
            node.style.left = (m * m * sx + 2 * m * e * cx2 + e * e * tx) + 'px';
            node.style.top = (m * m * sy + 2 * m * e * cy2 + e * e * ty) + 'px';
            if (p < 1) requestAnimationFrame(frame); else res();
          }
          requestAnimationFrame(frame);
        });
      }
      // the nudge cursor traces the drag path on a loop: podium -> next zone
      function showDragNudge() {
        if (idleNudgeEl || !alive) return;
        var n = UI.HandNudge();
        Object.assign(n.style, { position: 'absolute', left: (REST.left + HV * 0.42) + 'px', top: (REST.top + HV * 0.06) + 'px', width: '44px', zIndex: '30' });
        s.appendChild(n);
        idleNudgeEl = n;
        A.playPop();
        (function pass() {
          if (idleNudgeEl !== n || !alive) return;
          var zi = nextZone();
          if (zi < 0) { stopIdle(); return; }
          n.style.transition = 'none'; n.style.opacity = '1';
          n.style.left = (REST.left + HV * 0.42) + 'px'; n.style.top = (REST.top + HV * 0.06) + 'px';
          moveArcN(n, zones[zi].left + HV * 0.42, zones[zi].top + HV * 0.1, 1400).then(function () {
            if (idleNudgeEl !== n) return;
            n.style.transition = 'opacity 0.25s ease'; n.style.opacity = '0';
            setTimeout(pass, 420);
          });
        })();
      }
      function armIdle() {
        stopIdle();
        if (!alive || filled >= spans) return;
        idleTimer = setTimeout(function () {
          if (!alive || !curHand) return;
          curHand.classList.add('drag-hand--hint');
          showDragNudge();
        }, 5000);
      }
      // persistent source hand on the podium; clones do the moving. The hand
      // rests in its NORMAL pose — it only flips vertical when it lands in
      // the measuring column (see placeClone).
      function spawnHand() {
        var src = el('div.drag-hand', null, [el('img', { src: 'assets/handSpanHand.webp', alt: '', draggable: 'false' })]);
        Object.assign(src.style, { left: REST.left + 'px', top: REST.top + 'px', width: HV + 'px', height: HV + 'px' });
        s.appendChild(src);
        curHand = src;
        wireDrag(src);
        armIdle();
        if (!arrow) {
          // first drag: arrow from the podium INTO the bottom zone
          arrow = makeArrow(REST.left + HV, REST.top + 6, zones[0].cx - HV * 0.15, zones[0].cy);
          s.appendChild(arrow);
          zones[0].node.classList.add('drop-zone--target');
        }
      }
      function wireDrag(src) {
        var dragging = false, clone = null;
        function down(e) {
          if (dragging || !alive || filled >= spans) return;
          dragging = true; stopIdle();
          src.classList.remove('drag-hand--hint');
          if (arrow) { arrow.remove(); arrow = null; }
          clearTargets();
          clone = el('div.drag-hand drag-hand--dragging', null, [el('img', { src: 'assets/handSpanHand.webp', alt: '', draggable: 'false' })]);
          Object.assign(clone.style, { left: src.style.left, top: src.style.top, width: HV + 'px', height: HV + 'px', pointerEvents: 'none' });
          s.appendChild(clone);
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', up);
          document.addEventListener('pointercancel', up);
          A.playPop(); move(e); e.preventDefault();
        }
        function move(e) {
          if (!dragging || !clone) return;
          var p = toStage(e.clientX, e.clientY);
          clone.style.left = (p.x - HV / 2) + 'px'; clone.style.top = (p.y - HV / 2) + 'px';
          clearTargets();
          var mzi = nextZone();
          if (mzi >= 0 && p.x > STACK_LEFT - HV && p.x < STACK_LEFT + HV * 2) zones[mzi].node.classList.add('drop-zone--target');
        }
        function up(e) {
          if (!dragging) return; dragging = false;
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.removeEventListener('pointercancel', up);
          clearTargets();
          var c = clone; clone = null;
          if (!c) return;
          var p = toStage(e.clientX, e.clientY);
          // accept ONLY near the next slot up (the vertical mirror of the
          // table rule): a higher slot or a gap snaps the clone back
          var zi = nextZone();
          var near = zi >= 0 && p.x > STACK_LEFT - HV && p.x < STACK_LEFT + HV * 2 && Math.abs(p.y - zones[zi].cy) < HV;
          if (near) placeClone(c, zi); else discardClone(c);
        }
        src.addEventListener('pointerdown', down);
      }
      function placeClone(clone, zi) {
        var z = zones[zi]; filled++;
        clone.style.transition = 'left 0.16s ease, top 0.16s ease';
        clone.style.left = z.left + 'px'; clone.style.top = z.top + 'px';
        clone.classList.remove('drag-hand--dragging'); clone.classList.add('drag-hand--placed');
        // the hand FLIPS vertical as it snaps into the column (whoosh) — it
        // rests in its normal pose everywhere else
        A.playWhoosh();
        clone.classList.add('drag-hand--vert');
        A.playHandPlace(); FX.pulse(clone);
        FX.sparkleBurst(z.cx, z.cy, { count: 7, spread: 48, color: '#bfe39a' });
        if (filled >= spans) setTimeout(finish, 560);
        else armIdle();
      }
      function discardClone(clone) {
        clone.classList.remove('drag-hand--dragging');
        clone.style.transition = 'left 0.2s ease, top 0.2s ease, opacity 0.2s ease';
        clone.style.left = REST.left + 'px'; clone.style.top = REST.top + 'px'; clone.style.opacity = '0';
        setTimeout(function () { clone.remove(); }, 220);
        armIdle();
      }
      function finish() {
        alive = false; stopIdle();
        if (curHand) { curHand.remove(); curHand = null; }
        podium.remove();
        FX.celebrate();
        var readWait = feedback(s, 'success', ['Well Done!', 'The candle is ' + spans + ' handspans tall!']);
        h.tapToContinue(readWait).then(function () { opts.onDone(); });
      }

      // staged entrance (matches the table rounds): the candle alone, then
      // the guide lines, then Gogo + his line, then the handspan
      FX.wait(1000)
        .then(function () {
          g.reveal();
          A.playWhoosh();
          FX.sparkleBurst(STACK_LEFT - 12, topY, { count: 6, spread: 40, color: '#e11dff' });
          FX.sparkleBurst(CX + BODY_HALF + 24, BASE_Y, { count: 6, spread: 40, color: '#e11dff' });
          return FX.wait(1100);
        })
        .then(function () { return gogoSay(s, ['Find out how tall the candle is.']); })
        .then(function () { return FX.wait(350); })
        .then(function () {
          if (!alive) return;
          podium.style.display = '';
          A.playPop();
          spawnHand();
          showDragNudge();
        });
      return null;
    });
  }

  /* ---- the target (3-handspan) candle is found; Gogo bags it ------------ */
  function pillarSuccess(config, h) {
    h.setBackground('play');
    h.transitionTo(function () {
      var s = h.scene();
      s.appendChild(UI.Vignette());
      var wrap = pillarImg(76 * pillarState.target);
      wrap.classList.add('candle--glow');
      Object.assign(wrap.style, { position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', zIndex: '5' });
      s.appendChild(wrap);
      var run = Promise.resolve();
      run = run.then(function () { FX.celebrate(wrap); return panelSay(h, s, 'You found it! This candle is ' + pillarState.target + ' handspans tall!'); });
      run = run.then(function () { return sackAnim(h, s, wrap); });
      // ... then on to the candle-stand round (4th flow)
      run = run.then(function () { startCandles(config, h); });
      return run;
    });
  }

  /* ====================================================================== *
   * CANDLE-STAND ROUND — VERTICAL measuring (find the 5-handspan stand)
   * ----------------------------------------------------------------------
   * Same loop as the table hall, rotated 90°: three candle stands (3, 6, 5
   * handspans TALL — the 5-span target measured last, then bagged), measured
   * top-to-bottom, so the dashed guides are HORIZONTAL — one at the cup rim,
   * one at the base — and the hands stack vertically between them.
   * ====================================================================== */
  // candleStandClean.png: cup rim at 0.111 of its height, base at 0.753,
  // (visible height = 0.642 of the image); image aspect w/h = 1536/1024 = 1.5.
  var CANDLE = { src: 'assets/candleStandClean.webp', ar: 1536 / 1024, topF: 0.111, botF: 0.753 };
  var CANDLE_VIS = CANDLE.botF - CANDLE.topF;   // 0.642
  var candleState = null;

  // a candle-stand wrapper whose VISIBLE height (cup rim -> base) = visH px.
  // The wrapper's bottom edge is cropped to the BASE (botF of the image) — the
  // transparent padding below the base is trimmed — so different-height stands
  // all stand on the same floor line instead of floating at varied heights.
  function candleImg(visH) {
    var imgH = visH / CANDLE_VIS;
    var imgW = imgH * CANDLE.ar;
    var img = el('img.candle__img', { src: CANDLE.src, alt: '', draggable: 'false' });
    Object.assign(img.style, { position: 'absolute', left: '0', top: '0', width: imgW + 'px', height: imgH + 'px' });
    var wrap = el('div.candle', null, [img]);
    Object.assign(wrap.style, { width: imgW + 'px', height: (CANDLE.botF * imgH) + 'px' });
    wrap._imgH = imgH; wrap._imgW = imgW;
    return wrap;
  }

  function startCandles(config, h) {
    // measured in list order: 3, then 6, then the 5-span target (bagged last)
    candleState = { list: [3, 6, 5], target: 5, measured: [], center: 0 };
    h.festiveTransition(function () { candleHall(config, h); }, 'The Candle Hall!');
  }

  /* ---- fixed-sequence candle showcase (no arrows, no rotation) ---------- */
  function candleHall(config, h) {
    fixedHall(h, candleState, {
      bg: 'play',
      carouselClass: 'hall-carousel--candle',
      blurIntro: true,   // first entry: blurred room -> focus move (like the table showcase)
      glowClass: 'candle--glow',
      introLines: ['Here are the candle stands.', "Let's measure how tall each candle stand is."],
      makeNode: function (spans) { return candleImg(30 * spans); },   // taller stand -> more handspans
      spansOf: function (spans) { return spans; },
      onPick: function (i) { measureCandle(config, h, i); }
    });
  }

  function measureCandle(config, h, index) {
    playCandleRound(config, h, {
      spans: candleState.list[index],
      onDone: function () {
        candleState.measured.push(index);
        if (candleState.measured.length >= candleState.list.length) candleSuccess(config, h);
        else h.festiveTransition(function () { candleHall(config, h); }, 'Next stand!');
      }
    });
  }

  /* ---- one vertical measure cycle (guess height -> verify) ------------- */
  function playCandleRound(config, h, opts) {
    h.setBackground('play');
    var spans = opts.spans;
    var HV = 58;                 // vertical hand unit
    var CX = 640;                // horizontal centre — EVERY stand's base is centred
                                 // here (the base is centred in the art), so the
                                 // standing x never shifts between rounds
    var BASE_Y = 452;            // the base sits on the SAME floor line as the table flow
    // The hand column measures BESIDE the stand, never on top of it: it hugs
    // the stand's solid base edge (alpha-measured at 0.179 of the image width
    // per side) with a small gap, whatever the stand's size.
    var visH = HV * spans;
    var imgW = (visH / CANDLE_VIS) * CANDLE.ar;
    var BASE_HALF = 0.179 * imgW;
    var STACK_LEFT = CX - BASE_HALF - 12 - HV;        // hand-box left, just left of the base

    function buildStage(s, deferGuide) {
      s.appendChild(UI.Vignette());
      var topY = BASE_Y - visH;
      var wrap = candleImg(visH);
      Object.assign(wrap.style, {
        position: 'absolute', left: (CX - wrap._imgW / 2) + 'px',
        top: (topY - CANDLE.topF * wrap._imgH) + 'px', zIndex: '5'
      });
      s.appendChild(wrap);
      var layer = el('div', { style: { position: 'absolute', inset: '0', zIndex: '20' } });
      s.appendChild(layer);
      // the guides bracket the hand column AND the stand together
      var g = UI.MeasureGuideH(STACK_LEFT - 12, CX + BASE_HALF + 24, topY, BASE_Y);
      s.appendChild(g);
      // the round's first screen staggers the reveal (stand alone -> lines)
      layer.revealGuide = function () {
        g.reveal();
        A.playWhoosh();
        FX.sparkleBurst(STACK_LEFT - 12, topY, { count: 6, spread: 40, color: '#e11dff' });
        FX.sparkleBurst(CX + BASE_HALF + 24, BASE_Y, { count: 6, spread: 40, color: '#e11dff' });
      };
      if (!deferGuide) requestAnimationFrame(function () { g.reveal(); });
      return layer;
    }

    // stack `count` hand slots vertically BESIDE the stand, base upward
    function placeStack(layer, variant, count, anim) {
      var nn = count != null ? count : spans;
      var nodes = [];
      for (var i = 0; i < nn; i++) {
        var node = UI.HandSpan({ variant: variant, w: HV, h: HV, anim: anim });
        node.classList.add('handspan--vert');   // rotate the hand to measure vertically
        Object.assign(node.style, { position: 'absolute', left: STACK_LEFT + 'px', top: (BASE_Y - HV * (i + 1)) + 'px' });
        layer.appendChild(node);
        nodes.push(node);
      }
      return nodes;
    }

    function guessScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s, true);
        // staged entrance: the stand alone, then the guide lines draw in.
        // just before play: the ONE instruction panel comes, is read, and
        // goes away — only then the guess tray appears
        return FX.wait(1000)
          .then(function () { layer.revealGuide(); return FX.wait(1100); })
          .then(function () { return instructOnce(s, 'Guess how many handspans tall the candle stand is.'); })
          .then(function () { return h.guessPhase({ answer: spans }); })
          .then(function (sel) { if (sel === spans) successScreen(); else wrongScreen(sel); });
      });
    }
    function successScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        var slots = placeStack(layer, 'solid', null, true);
        slots.forEach(function (n) { n.style.opacity = '0'; });
        return FX.wait(350)
          .then(function () { return h.measureFly({ slots: slots, unit: HV }); })
          .then(function () { FX.celebrate(); return h.tapToContinue(feedback(s, 'success', 'Hurray! This stand is ' + spans + ' handspans tall.')); })
          .then(function () { opts.onDone(); });
      });
    }
    function wrongScreen(guess) {
      var count = Math.max(1, guess || spans);
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        var slots = placeStack(layer, 'solid', count, true);
        slots.forEach(function (n) { n.style.opacity = '0'; });
        return FX.wait(350)
          .then(function () { return h.measureFly({ slots: slots, unit: HV }); })
          .then(function () { A.playWrong(); return h.tapToContinue(feedback(s, 'wrong', 'Let us try again.')); })
          .then(function () { clueScreen(); });
      });
    }
    function clueScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        placeStack(layer, 'solid', null, true);
        var readWait = feedback(s, 'clue', 'Here is a clue. It should look like this.');
        return h.tapToContinue(readWait).then(function () { guessScreen(); });
      });
    }
    guessScreen();
  }

  /* ---- the target (5-handspan) stand is found; Gogo bags it, then END -- */
  function candleSuccess(config, h) {
    h.setBackground('play');
    h.transitionTo(function () {
      var s = h.scene();
      s.appendChild(UI.Vignette());
      var wrap = candleImg(300);
      wrap.classList.add('candle--glow');
      Object.assign(wrap.style, { position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', zIndex: '5' });
      s.appendChild(wrap);

      var run = Promise.resolve();
      run = run.then(function () { FX.celebrate(wrap); return panelSay(h, s, 'You found it! This candle stand is ' + candleState.target + ' handspans tall!'); });
      run = run.then(function () { return sackAnim(h, s, wrap); });
      // ... candles are the LAST round -> the finale
      run = run.then(function () { endScreen(config, h, 'You found the ' + candleState.target + '-handspan candle stand!'); });
      return run;
    });
  }

  /* ====================================================================== *
   * CLOTH ROUND — HORIZONTAL measuring (find the 8-handspan cloth)
   * ----------------------------------------------------------------------
   * A second loop, same idea as the tables but with cloths in a different
   * room (Bgm2): three cloths (10, 7, 8 handspans WIDE), measured
   * left-to-right with VERTICAL guides at each cloth's side edges, in that
   * fixed order — the BLUE cloth (Cloth2, 8 spans) is the target, measured
   * last, that Gogo bags at the end.
   * ====================================================================== */
  var CLOTHS = [
    { src: 'assets/Cloth1.webp', spans: 10, e0: 0.0291, e1: 0.9717, botF: 0.9569, ar: 0.5583 },  // red
    { src: 'assets/Cloth3.webp', spans: 7,  e0: 0.0413, e1: 0.9526, botF: 0.9475, ar: 0.5632 },  // white
    { src: 'assets/Cloth2.webp', spans: 8,  e0: 0.0551, e1: 0.9437, botF: 0.9423, ar: 0.5626 }   // blue — target
  ];
  var CLOTH_TARGET = 8;
  var clothState = null;

  // a cloth wrapper whose measurable width (edge e0->e1) = trackW px
  function clothImg(art, trackW) {
    var imgW = trackW / (art.e1 - art.e0);
    var imgH = imgW * art.ar;
    var wrap = el('div.cloth', null, [el('img.cloth__img', { src: art.src, alt: '', draggable: 'false' })]);
    Object.assign(wrap.style, { width: imgW + 'px', height: imgH + 'px' });
    wrap._imgW = imgW; wrap._imgH = imgH; wrap._art = art;
    return wrap;
  }

  function startCloths(config, h) {
    clothState = { list: CLOTHS, target: CLOTH_TARGET, measured: [], center: 0 };
    h.festiveTransition(function () { clothHall(config, h); }, '');
  }

  /* ---- fixed-sequence cloth showcase (flow 2: no free selection) -------- */
  function clothHall(config, h) {
    fixedHall(h, clothState, {
      bg: 'cloth',
      carouselClass: 'hall-carousel--cloth',
      glowClass: 'cloth--glow',
      introLines: ['Here are the tablecloths.', "Let's measure how long each tablecloth is."],
      makeNode: function (art) { return clothImg(art, 52 * art.spans); },   // wider cloth -> more handspans
      spansOf: function (art) { return art.spans; },
      onPick: function (i) { measureCloth(config, h, i); }
    });
  }

  function measureCloth(config, h, index) {
    var art = clothState.list[index];
    playClothRound(config, h, {
      art: art,
      spans: art.spans,
      showPreview: clothState.measured.length === 0,   // demo on the first cloth
      onDone: function () {
        clothState.measured.push(index);
        if (clothState.measured.length >= clothState.list.length) clothSuccess(config, h);
        else h.festiveTransition(function () { clothHall(config, h); }, '');
      }
    });
  }

  /* ---- one horizontal measure cycle (guess width -> verify) ------------ */
  function playClothRound(config, h, opts) {
    h.setBackground('cloth');
    var art = opts.art, spans = opts.spans;
    var HW = 56;                       // hand unit width
    var CX = 640;                      // horizontal centre
    var CY = 300;                      // cloth centre (vertical)
    var trackW = HW * spans;
    var imgW = trackW / (art.e1 - art.e0);
    var imgH = imgW * art.ar;
    var clothLeft = CX - imgW / 2, clothTop = CY - imgH / 2;
    var TRACK_X0 = clothLeft + art.e0 * imgW;               // left side edge
    var HAND_TOP = clothTop + art.botF * imgH;              // hands hang from the bottom edge
    var GUIDE_TOP = HAND_TOP - 10;
    var GUIDE_H = HW + 46;

    function buildStage(s, deferGuide) {
      // no vignette here — keep the Bgm2 cloth room plain
      var wrap = clothImg(art, trackW);
      Object.assign(wrap.style, { position: 'absolute', left: clothLeft + 'px', top: clothTop + 'px', zIndex: '5' });
      s.appendChild(wrap);
      var layer = el('div', { style: { position: 'absolute', inset: '0', zIndex: '20' } });
      s.appendChild(layer);
      var g = UI.MeasureGuide(TRACK_X0, TRACK_X0 + trackW, GUIDE_TOP, GUIDE_H);
      s.appendChild(g);
      // the round's first screen staggers the reveal (cloth alone -> lines)
      layer.revealGuide = function () {
        g.reveal();
        A.playWhoosh();
        FX.sparkleBurst(TRACK_X0, GUIDE_TOP, { count: 6, spread: 40, color: '#e11dff' });
        FX.sparkleBurst(TRACK_X0 + trackW, GUIDE_TOP, { count: 6, spread: 40, color: '#e11dff' });
      };
      if (!deferGuide) requestAnimationFrame(function () { g.reveal(); });
      return layer;
    }

    // lay `count` hand slots in a row along the bottom edge (each HW wide)
    function placeRow(layer, variant, count, anim) {
      var nn = count != null ? count : spans;
      var nodes = [];
      for (var i = 0; i < nn; i++) {
        var node = UI.HandSpan({ variant: variant, w: HW, h: HW, anim: anim });
        Object.assign(node.style, { position: 'absolute', left: (TRACK_X0 + i * HW) + 'px', top: HAND_TOP + 'px' });
        layer.appendChild(node);
        nodes.push(node);
      }
      return nodes;
    }

    // Intro demo (first cloth ONLY): the hand measures the WHOLE cloth,
    // edge to edge — each stretch leaves a faded impression behind as the
    // hand moves on, so when the demo ends the full faded track stays on
    // screen next to the guess tray (same lesson as the first hall table).
    // Every span plays the full stretch at natural speed (a rushed stretch is
    // unreadable); only the hop between slots tightens after the first two.
    function previewMeasure(layer, count) {
      return new Promise(function (resolve) {
        var hand = UI.MeasureHand(HW);
        Object.assign(hand.style, {
          left: TRACK_X0 + 'px', top: HAND_TOP + 'px', opacity: '0', zIndex: '24',
          transition: 'left 0.3s cubic-bezier(.4,.02,.3,1), opacity 0.2s ease'
        });
        layer.appendChild(hand);
        A.playWhoosh();
        requestAnimationFrame(function () { hand.style.opacity = '1'; });
        var i = 0;
        function step() {
          var teaching = i < 2;
          UI.playMeasureHand(hand, 1).then(function () {
            A.playPop();
            FX.sparkleBurst(TRACK_X0 + i * HW + HW / 2, HAND_TOP + HW / 2, { count: 6, spread: 46, color: '#bfe39a' });
            var imp = UI.HandSpan({ variant: 'faded', w: HW, h: HW, anim: true });
            Object.assign(imp.style, { position: 'absolute', left: (TRACK_X0 + i * HW) + 'px', top: HAND_TOP + 'px' });
            layer.appendChild(imp);
            i++;
            if (i >= count) { setTimeout(function () { hand.style.opacity = '0'; setTimeout(function () { hand.remove(); resolve(); }, 240); }, 220); return; }
            hand.style.left = (TRACK_X0 + i * HW) + 'px';
            setTimeout(step, teaching ? 320 : 180);
          });
        }
        setTimeout(step, 380);
      });
    }

    function guessScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s, true);
        // staged entrance: the cloth alone, then the guide lines drop in
        var run = FX.wait(1000);
        run = run.then(function () { layer.revealGuide(); return FX.wait(1100); });
        // tutorial (first cloth): the demo sweeps the FULL width and its faded
        // track stays up alongside the guess tray, so the child can count.
        // every later cloth: a short reminder — the hand starts at the edge
        // and STOPS at the second spot, then the "Guess..." panel comes.
        run = run.then(function () { return previewMeasure(layer, opts.showPreview ? spans : Math.min(2, spans)); });
        // just before play: the ONE instruction panel comes, is read, and
        // goes away — only then the guess tray appears
        run = run.then(function () { return instructOnce(s, 'Guess how long the tablecloth is.'); });
        run = run.then(function () { return h.guessPhase({ answer: spans, hintAnswer: opts.showPreview }); });
        run = run.then(function (sel) { if (sel === spans) successScreen(); else wrongScreen(sel); });
        return run;
      });
    }
    function successScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        var slots = placeRow(layer, 'solid', null, true);
        slots.forEach(function (n) { n.style.opacity = '0'; });
        return FX.wait(350)
          .then(function () { return h.measureFly({ slots: slots, unit: HW }); })
          .then(function () { FX.celebrate(); return h.tapToContinue(feedback(s, 'success', 'Hurray! This cloth is ' + spans + ' handspans wide.')); })
          .then(function () { opts.onDone(); });
      });
    }
    function wrongScreen(guess) {
      var count = Math.max(1, guess || spans);
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        var slots = placeRow(layer, 'solid', count, true);
        slots.forEach(function (n) { n.style.opacity = '0'; });
        return FX.wait(350)
          .then(function () { return h.measureFly({ slots: slots, unit: HW }); })
          .then(function () { A.playWrong(); return h.tapToContinue(feedback(s, 'wrong', 'Let us try again.')); })
          .then(function () { clueScreen(); });
      });
    }
    function clueScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        placeRow(layer, 'solid', null, true);
        var readWait = feedback(s, 'clue', 'Here is a clue. It should look like this.');
        return h.tapToContinue(readWait).then(function () { guessScreen(); });
      });
    }
    guessScreen();
  }

  /* ---- the target (8-handspan, blue) cloth is found; Gogo bags it ------ */
  function clothSuccess(config, h) {
    h.setBackground('cloth');
    h.transitionTo(function () {
      var s = h.scene();
      // no vignette — keep the Bgm2 cloth room plain
      var tart = CLOTHS[0];
      for (var i = 0; i < CLOTHS.length; i++) { if (CLOTHS[i].spans === clothState.target) { tart = CLOTHS[i]; break; } }
      var wrap = clothImg(tart, 480);
      wrap.classList.add('cloth--glow');
      Object.assign(wrap.style, { position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%,-50%)', zIndex: '5' });
      s.appendChild(wrap);

      var run = Promise.resolve();
      run = run.then(function () { FX.celebrate(wrap); return panelSay(h, s, 'You found it! This cloth is ' + clothState.target + ' handspans wide!'); });
      run = run.then(function () { return sackAnim(h, s, wrap); });
      // ... then on to the candle round (3rd flow: vertical DRAG measuring)
      run = run.then(function () { startPillars(config, h); });
      return run;
    });
  }

  /* ====================================================================== *
   * DEBUG JUMPS — used only by the dev widget (debug.js). Each entry drops
   * straight onto one screen with a plausible state, skipping the journey.
   * ====================================================================== */
  function debugEnsureState(config) {
    var tutIdx = -1;
    for (var i = 0; i < config.finalTables.length; i++) {
      if (config.finalTables[i].spans === config.tutorialSpans) { tutIdx = i; break; }
    }
    state = {
      tables: config.finalTables,
      target: config.finalTarget,
      measured: tutIdx >= 0 ? [tutIdx] : [],
      hallMeasured: 0,
      center: 0
    };
  }
  var debug = {
    round: function (config, h, spans) {
      debugEnsureState(config);
      for (var i = 0; i < state.tables.length; i++) {
        if (state.tables[i].spans === spans) { measureTable(config, h, i); return; }
      }
    },
    hallSuccess: function (config, h) {
      debugEnsureState(config);
      state.measured = state.tables.map(function (t, i) { return i; });
      hallSuccess(config, h);
    },
    cloth: function (config, h, spans) {
      clothState = { list: CLOTHS, target: CLOTH_TARGET, measured: [], center: 0 };
      for (var i = 0; i < CLOTHS.length; i++) {
        if (CLOTHS[i].spans === spans) { measureCloth(config, h, i); return; }
      }
    },
    clothSuccess: function (config, h) {
      clothState = { list: CLOTHS, target: CLOTH_TARGET, measured: [0, 1, 2], center: 0 };
      clothSuccess(config, h);
    },
    pillars: startPillars,
    pillar: function (config, h, spans) {
      pillarState = { list: [4, 2, 3], target: 3, measured: [], center: 0 };
      var idx = pillarState.list.indexOf(spans);
      measurePillar(config, h, idx < 0 ? 0 : idx);
    },
    pillarSuccess: function (config, h) {
      pillarState = { list: [4, 2, 3], target: 3, measured: [0, 1, 2], center: 0 };
      pillarSuccess(config, h);
    },
    candles: startCandles,
    candle: function (config, h, spans) {
      candleState = { list: [3, 6, 5], target: 5, measured: [], center: 0 };
      var idx = candleState.list.indexOf(spans);
      measureCandle(config, h, idx < 0 ? 0 : idx);
    },
    candleSuccess: function (config, h) {
      candleState = { list: [3, 6, 5], target: 5, measured: [0, 1, 2], center: 0 };
      candleSuccess(config, h);
    },
    end: function (config, h) {
      debugEnsureState(config);
      endScreen(config, h);
    }
  };

  return {
    startTutorialMeasure: startTutorialMeasure,
    startHall: startHall,
    startCloths: startCloths,
    debug: debug
  };
})();
