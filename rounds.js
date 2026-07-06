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

  /* ---- a PERSISTENT Gogo instruction panel (avatar + purple bar) that stays
   *      on screen (e.g. the guess heading) — does NOT wait for a tap --------- */
  function instruct(s, text) {
    var b = UI.TutorialBubble({ who: 'gogo', text: text });
    Object.assign(b.style, { left: '50%', top: '18px', transform: 'translateX(-50%)' });
    s.appendChild(b);
    A.playDialogue();
    return b;
  }

  /* ---- a Gogo instruction panel (avatar + purple bar), wait for a tap ----
   *      (cloth + candle flows only — the table flow uses gogoSay below) --- */
  function sayGogo(h, s, text) {
    var b = UI.TutorialBubble({ who: 'gogo', text: text });
    Object.assign(b.style, { left: '50%', top: '18px', transform: 'translateX(-50%)' });
    s.appendChild(b);
    A.playDialogue();
    return h.tapToContinue().then(function () { b.remove(); });
  }

  /* ---- Gogo IN PERSON delivers instructions (table flow) -----------------
   * No instruction panel: the SAME fixed-size Gogo, on the SAME spot as the
   * measuring screens, poofs in, speaks each line beside his head, then poofs
   * away. Auto-paced (by line length) so whatever cue follows — e.g. the hand
   * nudge — can appear the moment he vanishes. */
  var GOGO_SPOT = { left: '130px', top: '40px' };     // one spot on every screen
  // BOTTOM-anchored beside his head: the bubble grows UPWARD with its text, so
  // the tail tip stays on his head whether the line is one word or two rows
  var GOGO_BUBBLE = { left: '430px', bottom: '600px' };
  function lineMs(text) { return Math.max(2400, 900 + String(text).split(/\s+/).length * 240); }
  function gogoSay(s, lines) {
    var g = UI.GogoCharacter('talk');
    Object.assign(g.style, { left: GOGO_SPOT.left, top: GOGO_SPOT.top, visibility: 'hidden' });
    s.appendChild(g);
    var seq = FX.wait(350).then(function () { UI.gogoAppear(g); return FX.wait(500); });
    lines.forEach(function (text) {
      seq = seq.then(function () {
        return new Promise(function (res) {
          var b = UI.SayBubble(text, 'left');
          Object.assign(b.style, GOGO_BUBBLE);
          s.appendChild(b);
          A.playDialogue();
          setTimeout(function () { b.remove(); res(); }, lineMs(text));
        });
      });
    });
    return seq.then(function () { return UI.gogoVanish(g); }).then(function () { g.remove(); });
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
        if (t.spans === bySize[0]) table.classList.add('table--tall');
        else if (t.spans === bySize[1]) table.classList.add('table--tall-mid');
        card._table = table;
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

    // full-body genie + a purple message panel (feedback screens).
    // `text` may be an array of lines — they play one after another in the
    // same bubble spot (e.g. "Well Done!" then the measured length).
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
      var side = onRight ? 'right' : 'left';
      var li = 0, panel = null;
      (function show() {
        if (panel) panel.remove();
        var line = lines[li];
        panel = UI.FeedbackBubble(line, side);
        // successGogo stands lower than wrongGogo — drop the bubble to his head
        if (who === 'success') panel.style.top = '150px';
        s.appendChild(panel);
        A.playDialogue();
        li++;
        if (li < lines.length) {
          setTimeout(function () {
            if (document.body.contains(panel)) show();   // scene may have moved on
          }, lineMs(line));
        }
      })();
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
        // tutorial mode reveals the stage piece by piece (table -> guide lines
        // -> Gogo + text -> handspan); other rounds show everything at once
        var layer = buildStage(s, null, !!opts.tutorial);
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

        var REST = { left: 92, top: 548 };   // hand's resting spot (bottom-left)

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
        // While the child HOLDS the handspan, a faded ghost hand loops along
        // the same path, guiding where to place it.
        var guideGhost = null;
        function stopGuide() {
          var g = guideGhost; guideGhost = null;
          if (g) g.remove();
        }
        function startGuide() {
          if (guideGhost || !alive || nextZone() < 0) return;
          var g = demoHand(true);
          guideGhost = g;
          (function pass() {
            if (guideGhost !== g || !alive) return;
            var zi = nextZone();
            if (zi < 0) { stopGuide(); return; }
            g.style.transition = 'none'; g.style.opacity = '0.4';
            g.style.left = REST.left + 'px'; g.style.top = REST.top + 'px';
            moveArc(g, zones[zi].left, HAND_TOP, 1200).then(function () {
              if (guideGhost !== g) return;
              g.style.transition = 'opacity 0.25s ease'; g.style.opacity = '0';
              setTimeout(pass, 360);
            });
          })();
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
            startGuide();   // ghost hand shows where this handspan goes
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
            stopGuide();
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
          alive = false; stopIdle(); stopGuide();
          // the standing instruction + teaching Gogo have served their purpose —
          // clear them so they don't collide with Gogo's success panel
          if (bubble) { bubble.remove(); bubble = null; }
          if (teacher) { var tg2 = teacher; teacher = null; UI.gogoVanish(tg2).then(function () { tg2.remove(); }); }
          if (curHand) { curHand.remove(); curHand = null; }   // remove the podium source
          FX.celebrate();
          feedback(s, 'success', ['Well Done!', 'The table is ' + spans + ' handspans long!']);
          h.tapToContinue().then(function () { opts.onDone(); });
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
        var LEFTSIDE = TRACK_X0 - Math.round(HW * 0.9);      // wrong: left of the start line
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
          // the show pose raises a hand to the RIGHT of his head, so the only
          // clear head-adjacent spot is ABOVE the turban — tail dropping onto it
          show: { left: '250px', bottom: '615px' },
          wrong: { left: '390px', bottom: '600px' }
        };
        function demoBubbleAt(pose) { return DEMO_BUBBLE[pose] || DEMO_BUBBLE.talk; }
        // beside the head of the small horizontal Gogo down at the podium
        var PODIUM_BUBBLE = { left: '280px', bottom: '330px' };
        // to the LEFT of the right-side "No!" Gogo — bottom-anchored so a
        // two-line rule never collides with his turban, tail tip on his head
        var RIGHT_BUBBLE = { right: '240px', bottom: '475px' };
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
            else h.tapToContinue().then(function () { b.remove(); res(); });
          });
        }
        // teleport the pointing (horizontal) Gogo to hover ABOVE stage x=cx,
        // finger landing right on the spot that needs attention
        function pointGogoAt(cx) {
          return UI.gogoTeleport(teacher, function () {
            UI.setGogoPose(teacher, 'horizontal');
            Object.assign(teacher.style, { width: '250px', transition: '', left: (cx - 136) + 'px', top: '226px' });
          });
        }
        // bubble slot right BESIDE the hovering pointer-Gogo's head (turban top
        // sits ~290px when he hovers at top:226) — at head height on his right,
        // tail curving down onto his face
        function pointBubbleAt(cx) { return { left: (cx + 92) + 'px', top: '246px' }; }
        // after pointing, Gogo vanishes and REAPPEARS ON THE RIGHT to say "No!"
        // (far enough right that his bubble never collapses onto him)
        function noFromRight() {
          return UI.gogoTeleport(teacher, function () {
            UI.setGogoPose(teacher, 'wrong');
            // sized to visually MATCH the small pointing Gogo (not the full 315px)
            Object.assign(teacher.style, { width: '215px', transition: '', left: '980px', top: '240px' });
          }).then(function () { return verdict('No!', false, RIGHT_BUBBLE, 'right'); });
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
            setTimeout(function () { b.remove(); res(); }, 2000);
          });
        }

        function runTutorial() {
          // Staged reveal — one thing at a time so the child can follow:
          //   1. the table alone   2. the guide lines (SFX)
          //   3. Gogo + his line   4. the handspan on its podium
          teacher = UI.GogoCharacter('talk');
          Object.assign(teacher.style, { left: GOGO_SPOT.left, top: GOGO_SPOT.top, visibility: 'hidden' });
          s.appendChild(teacher);

          var seq = FX.wait(900);                                   // 1. table alone
          seq = seq.then(function () {
            layer.revealGuide();                                    // 2. lines drop in (SFX)
            return FX.wait(950);
          });
          seq = seq.then(function () {                              // 3. Gogo poofs in...
            UI.gogoAppear(teacher);
            return FX.wait(500);
          });
          seq = seq.then(function () { return demoLine('We need to measure the table using hand spans.', 0, 'talk'); });
          seq = seq.then(function () {                              // 4. the handspan appears
            demoSource = demoHand(false);
            demoSource.style.transform = 'scale(0.3)'; demoSource.style.opacity = '0';
            demoSource.style.transition = 'transform 0.3s cubic-bezier(.2,1.5,.4,1), opacity 0.25s ease';
            requestAnimationFrame(function () { demoSource.style.transform = 'scale(1)'; demoSource.style.opacity = '1'; });
            A.playPop();
            return FX.wait(650);
          });
          // "But How?" — the thinking genie
          seq = seq.then(function () { return demoLine('But How?', 0, 'think'); });

          // (1) show the drag gesture with a faded ghost hand travelling to & fro
          seq = seq.then(function () {
            return new Promise(function (res) {
              var b, arr;
              var c = Promise.resolve();
              // Gogo teleports down BESIDE THE HANDSPAN ("from here") FIRST, a
              // smaller flying pose pointing at it...
              c = c.then(function () {
                return UI.gogoTeleport(teacher, function () {
                  UI.setGogoPose(teacher, 'horizontal');
                  Object.assign(teacher.style, { width: '250px', left: '16px', top: '330px' });
                });
              });
              // ...and only then his line pops up RIGHT AT HIS HEAD down there
              // (tail tip on his turban). It stays just long enough to read...
              c = c.then(function () {
                var line = "Let's drag a handspan from here to here.";
                b = UI.SayBubble(line, 'left');
                Object.assign(b.style, PODIUM_BUBBLE);
                s.appendChild(b); A.playDialogue();
                // the arrowhead lands INSIDE the first square, marking the drop spot
                arr = makeArrow(REST.left + HW, REST.top + 6, L0 + HW * 0.35, HAND_TOP + HW / 2);
                s.appendChild(arr);
                return FX.wait(lineMs(line));   // read time BEFORE the ghost hand starts
              });
              // ...and goes AWAY the moment the ghost animation begins
              c = c.then(function () {
                if (b) { b.remove(); b = null; }
              });
              // ...then flies WITH the faded hand on EVERY pass — Gogo traces
              // the here-to-here path in step with each ghost iteration.
              function glideTeacher(x, y, ms) {
                if (!teacher) return;
                teacher.style.transition = 'left ' + ms + 'ms cubic-bezier(.4,.05,.4,1), top ' + ms + 'ms cubic-bezier(.4,.05,.4,1)';
                requestAnimationFrame(function () { teacher.style.left = x + 'px'; teacher.style.top = y + 'px'; });
              }
              var ghost;
              c = c.then(function () {                             // pass 1: to the slot
                ghost = demoHand(true);
                A.playWhoosh();
                glideTeacher(L0 - 108, 226, 1300);
                return moveArc(ghost, L0, HAND_TOP, 1300);
              }).then(function () { return FX.wait(320); });
              c = c.then(function () {                             // pass 2: back to the podium
                A.playWhoosh();
                glideTeacher(16, 330, 1100);
                return moveArc(ghost, REST.left, REST.top, 1100);
              }).then(function () { return FX.wait(220); });
              c = c.then(function () {                             // pass 3: to the slot again
                A.playWhoosh();
                glideTeacher(L0 - 108, 226, 1300);
                return moveArc(ghost, L0, HAND_TOP, 1300);
              }).then(function () { return FX.wait(360); });
              // Gogo teleports back to his teaching corner (neutral talk pose —
              // no lingering ShowingGogo)
              c = c.then(function () {
                return UI.gogoTeleport(teacher, function () {
                  UI.setGogoPose(teacher, 'talk');
                  Object.assign(teacher.style, { width: '', transition: '', left: GOGO_SPOT.left, top: GOGO_SPOT.top });
                });
              });
              c.then(function () {
                if (ghost) { ghost.style.transition = 'opacity .3s ease'; ghost.style.opacity = '0'; }
                arr.remove();
                setTimeout(function () { if (ghost) ghost.remove(); if (b) b.remove(); res(); }, 320);
              });
            });
          });

          // (2) HAND 1 — try wrong spots, then land at the start line
          var hand1;
          // For each wrong spot, the pointing (horizontal) Gogo hovers right
          // above the hand — finger on the exact place in question — and a
          // breather separates each "Here?" -> "No!" cycle.
          var MID_CX = MID + HW / 2, LEFT_CX = LEFTSIDE + HW / 2, ON_CX = ONLINE + HW / 2;
          seq = seq.then(function () { hand1 = demoHand(false); A.playWhoosh(); return moveArc(hand1, MID, HAND_TOP, 1300); });
          seq = seq.then(function () { return pointGogoAt(MID_CX); });
          seq = seq.then(function () { return demoLine('Can we keep it here?', 2300, null, pointBubbleAt(MID_CX)); });
          seq = seq.then(function () { return noFromRight(); });
          seq = seq.then(function () { return FX.wait(1200); });
          seq = seq.then(function () { A.playWhoosh(); return moveTo(hand1, LEFTSIDE, HAND_TOP, 950); });
          seq = seq.then(function () { return pointGogoAt(LEFT_CX); });
          seq = seq.then(function () { return demoLine('Here?', 2000, null, pointBubbleAt(LEFT_CX)); });
          seq = seq.then(function () { return noFromRight(); });
          seq = seq.then(function () { return FX.wait(1200); });
          seq = seq.then(function () { A.playWhoosh(); return moveTo(hand1, ONLINE, HAND_TOP, 900); });
          seq = seq.then(function () { return pointGogoAt(ON_CX); });
          seq = seq.then(function () { return demoLine('Here?', 2000, null, pointBubbleAt(ON_CX)); });
          seq = seq.then(function () { return noFromRight(); });
          seq = seq.then(function () { return FX.wait(1200); });
          seq = seq.then(function () { return gogoHome('talk'); });
          seq = seq.then(function () { A.playWhoosh(); return moveTo(hand1, L0, HAND_TOP, 850); });
          seq = seq.then(function () { lockDemoHand(hand1, 0); return demoLine('Yes! Start right at the line.', 2500, 'talk'); });

          // (3) HAND 2 — overlap, then gap, then flush (the "no gaps, no overlaps" rule)
          // Same pattern as hand 1: the pointing (horizontal) Gogo hovers over
          // the hand in question, and the "No!" + rule come from the right side.
          var OVERLAP_CX = OVERLAP + HW / 2, GAP_CX = GAP + HW / 2, L1_CX = L1 + HW / 2;
          var hand2;
          // As in the first demo: Gogo flies down beside the podium pointing at
          // the handspan, his line pops up at his head, and a faded ghost hand
          // replays the drag gesture (Gogo gliding along) to the next slot.
          seq = seq.then(function () {
            return UI.gogoTeleport(teacher, function () {
              UI.setGogoPose(teacher, 'horizontal');
              Object.assign(teacher.style, { width: '250px', left: '16px', top: '330px' });
            });
          });
          seq = seq.then(function () { return demoLine("Let's drag the next handspan.", 0, null, PODIUM_BUBBLE); });
          seq = seq.then(function () {
            var ghost = demoHand(true);
            A.playWhoosh();
            teacher.style.transition = 'left 1300ms cubic-bezier(.4,.05,.4,1), top 1300ms cubic-bezier(.4,.05,.4,1)';
            requestAnimationFrame(function () { teacher.style.left = (L1 - 108) + 'px'; teacher.style.top = '226px'; });
            return moveArc(ghost, L1, HAND_TOP, 1300).then(function () {
              ghost.style.transition = 'opacity .3s ease'; ghost.style.opacity = '0';
              return FX.wait(320).then(function () { ghost.remove(); });
            });
          });
          seq = seq.then(function () { hand2 = demoHand(false); A.playWhoosh(); return moveArc(hand2, OVERLAP, HAND_TOP, 1300); });
          seq = seq.then(function () { return pointGogoAt(OVERLAP_CX); });
          seq = seq.then(function () { return demoLine('Can we keep it here?', 2300, null, pointBubbleAt(OVERLAP_CX)); });
          seq = seq.then(function () { return noFromRight(); });
          seq = seq.then(function () { return demoLine('Handspans must not overlap.', 2900, null, RIGHT_BUBBLE, 'right'); });
          seq = seq.then(function () { return FX.wait(1000); });
          seq = seq.then(function () { A.playWhoosh(); return moveTo(hand2, GAP, HAND_TOP, 950); });
          seq = seq.then(function () { return pointGogoAt(GAP_CX); });
          seq = seq.then(function () { return demoLine('Then can we keep it here?', 2300, null, pointBubbleAt(GAP_CX)); });
          seq = seq.then(function () { return noFromRight(); });
          seq = seq.then(function () { return demoLine('There must be no gap between two handspans.', 2900, null, RIGHT_BUBBLE, 'right'); });
          seq = seq.then(function () { return FX.wait(1000); });
          seq = seq.then(function () { A.playWhoosh(); return moveTo(hand2, L1, HAND_TOP, 850); });
          seq = seq.then(function () { return pointGogoAt(L1_CX); });
          seq = seq.then(function () { lockDemoHand(hand2, 1); return demoLine('Then can we keep it here?', 2200, null, pointBubbleAt(L1_CX)); });
          seq = seq.then(function () { return gogoHome('talk'); });
          seq = seq.then(function () { return verdict('Yes!', true); });
          seq = seq.then(function () { return demoLine("That's the perfect way!", 2300, 'talk'); });
          seq = seq.then(function () { FX.celebrate(); return demoLine('No Gaps! No Overlaps!', 2600, 'talk'); });
          return seq;
        }

        // hand control to the player for the remaining spans. Gogo delivers his
        // hand-over in two short lines, poofs away, and only THEN the nudge
        // cursor appears, tracing the drag path.
        function beginPlay() {
          firstPlaced = true;   // the demo already taught the drag — skip the first-time arrow
          if (demoSource) { demoSource.remove(); demoSource = null; }   // hand off to the interactive source
          if (teacher) UI.setGogoPose(teacher, 'show');
          var seq = demoLine('Now you try!', 2000, 'show');
          seq = seq.then(function () { return demoLine('Drag the rest with no gaps.', 2600, 'show'); });
          seq = seq.then(function () {
            if (!teacher) return;
            var tg = teacher; teacher = null;
            return UI.gogoVanish(tg).then(function () { tg.remove(); });
          });
          seq = seq.then(function () {
            spawnHand();
            showDragNudge();   // demonstrate the drag path right away
          });
          return seq;
        }

        // non-tutorial rounds: Gogo (same size + spot as the tutorial teacher)
        // poofs in, gives the task, poofs away — then the hand + nudge appear
        function beginRound() {
          teacher = UI.GogoCharacter('talk');
          Object.assign(teacher.style, { left: GOGO_SPOT.left, top: GOGO_SPOT.top, visibility: 'hidden' });
          s.appendChild(teacher);
          var seq = FX.wait(350);
          seq = seq.then(function () { UI.gogoAppear(teacher); return FX.wait(500); });
          seq = seq.then(function () { return demoLine('Find out how long the table is.', 2600, 'talk'); });
          seq = seq.then(function () {
            var tg = teacher; teacher = null;
            return UI.gogoVanish(tg).then(function () { tg.remove(); });
          });
          seq = seq.then(function () {
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
   * CANDLE-STAND ROUND — VERTICAL measuring (find the 5-handspan stand)
   * ----------------------------------------------------------------------
   * Same loop as the table hall, rotated 90°: three candle stands (5, 3, 7
   * handspans TALL), measured top-to-bottom, so the dashed guides are
   * HORIZONTAL — one at the cup rim, one at the base — and the hands stack
   * vertically between them.
   * ====================================================================== */
  // candleStandClean.png: cup rim at 0.111 of its height, base at 0.753,
  // (visible height = 0.642 of the image); image aspect w/h = 1536/1024 = 1.5.
  var CANDLE = { src: 'assets/candleStandClean.webp', ar: 1536 / 1024, topF: 0.111, botF: 0.753 };
  var CANDLE_VIS = CANDLE.botF - CANDLE.topF;   // 0.642
  var candleState = null;

  // a shared genie + purple feedback panel (mirrors the table round's feedback)
  function feedbackPanel(s, who, text) {
    var src = who === 'success' ? 'assets/successGogo.webp'
            : who === 'wrong' ? 'assets/wrongGogo.webp'
            : 'assets/ShowingGogo.webp';
    var onRight = who === 'wrong';
    var gogo = el('img.feedback-gogo feedback-gogo--' + who + ' ' + (onRight ? 'feedback-gogo--right' : 'feedback-gogo--left'), { src: src, alt: '', draggable: 'false' });
    s.appendChild(gogo);
    if (who === 'success') A.playClap();   // cheer whenever successGogo appears
    s.appendChild(UI.FeedbackBubble(text, onRight ? 'right' : 'left'));
    A.playDialogue();
  }

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
    candleState = {
      spansList: [5, 3, 7],   // index 0 = the target (5 handspans)
      target: 5,
      measured: [],
      introShown: false,
      center: 0
    };
    h.festiveTransition(function () { candleHall(config, h); }, 'The Candle Hall!');
  }

  /* ---- carousel of candle stands (pick one to measure) ----------------- */
  function candleHall(config, h) {
    h.setBackground('play');
    for (var k = 0; k < candleState.spansList.length; k++) {
      if (candleState.measured.indexOf((candleState.center + k) % candleState.spansList.length) < 0) {
        candleState.center = (candleState.center + k) % candleState.spansList.length; break;
      }
    }
    h.transitionTo(function () {
      var s = h.scene();
      var carousel = el('div.hall-carousel');
      carousel.appendChild(el('div.select-glow'));

      var cards = candleState.spansList.map(function (spans, i) {
        var card = el('div.hall-card', { dataset: { idx: String(i) } });
        var c = candleImg(30 * spans);   // taller stand -> more handspans
        card._candle = c;
        card.appendChild(c);
        if (candleState.measured.indexOf(i) >= 0) {
          card.classList.add('hall-card--done');
          card.appendChild(el('div.hall-card__done', { text: spans + ' handspans' }));
        }
        carousel.appendChild(card);
        return card;
      });
      s.appendChild(carousel);

      var leftArrow = el('button.hall-arrow hall-arrow--left', { type: 'button' }, '‹');
      var rightArrow = el('button.hall-arrow hall-arrow--right', { type: 'button' }, '›');
      s.appendChild(leftArrow); s.appendChild(rightArrow);

      var nudge = UI.HandNudge();
      nudge.classList.add('hand-nudge--tap');
      Object.assign(nudge.style, { left: '52%', top: '48%', display: 'none' });
      s.appendChild(nudge);

      var n = cards.length;
      function isDone(i) { return candleState.measured.indexOf(i) >= 0; }
      function layout() {
        cards.forEach(function (card, i) {
          card.classList.remove('is-center', 'is-left', 'is-right');
          var rel = (i - candleState.center + n) % n;
          card.classList.add(rel === 0 ? 'is-center' : (rel === 1 ? 'is-right' : 'is-left'));
          card._candle.classList.toggle('candle--glow', rel === 0 && !isDone(i));
        });
      }
      layout();
      function rotate(dir) { A.playHover(); nudge.style.display = 'none'; candleState.center = (candleState.center + dir + n) % n; layout(); }
      leftArrow.addEventListener('click', function () { rotate(-1); });
      rightArrow.addEventListener('click', function () { rotate(1); });

      var picked = false;   // guards against double-taps re-running the round
      cards.forEach(function (card, i) {
        card.addEventListener('mouseenter', function () { A.playHover(); });
        card.addEventListener('click', function () {
          if (picked) return;
          if (!card.classList.contains('is-center')) { candleState.center = i; layout(); A.playHover(); nudge.style.display = 'none'; return; }
          if (isDone(i)) { FX.shake(card); A.playWrong(); return; }
          picked = true;
          A.playClick(); nudge.remove();
          var c = FX.centerOf(card);
          FX.sparkleBurst(c.x, c.y, { count: 18, spread: 130 });
          FX.ringBurst(c.x, c.y, '#FFD54A');
          card._candle.style.transition = 'transform 0.45s cubic-bezier(.3,1.5,.4,1)';
          card._candle.style.transform = 'scale(1.1)';
          setTimeout(function () { measureCandle(config, h, i); }, 460);
        });
      });

      var run = Promise.resolve();
      if (!candleState.introShown) {
        candleState.introShown = true;
        run = run.then(function () { return sayGogo(h, s, 'Now find the candle stand that is ' + candleState.target + ' handspans TALL.'); })
                 .then(function () { return sayGogo(h, s, 'Pick a candle stand to measure.'); });
      } else {
        run = run.then(function () { return sayGogo(h, s, 'Pick another candle stand to measure.'); });
      }
      return run.then(function () { if (document.body.contains(nudge)) { UI.idleNudge(nudge, { onShow: function () { A.playPop(); } }); } });
    });
  }

  function measureCandle(config, h, index) {
    playCandleRound(config, h, {
      spans: candleState.spansList[index],
      onDone: function () {
        candleState.measured.push(index);
        if (candleState.measured.length >= candleState.spansList.length) candleSuccess(config, h);
        else h.festiveTransition(function () { candleHall(config, h); }, 'Next stand!');
      }
    });
  }

  /* ---- one vertical measure cycle (guess height -> verify) ------------- */
  function playCandleRound(config, h, opts) {
    h.setBackground('play');
    var spans = opts.spans;
    var HV = 58;                 // vertical hand unit
    var CX = 640;                // horizontal centre
    var BASE_Y = 612;            // bottom guide (base of the stand)

    function buildStage(s) {
      s.appendChild(UI.Vignette());
      var visH = HV * spans;
      var topY = BASE_Y - visH;
      var wrap = candleImg(visH);
      Object.assign(wrap.style, {
        position: 'absolute', left: (CX - wrap._imgW / 2) + 'px',
        top: (topY - CANDLE.topF * wrap._imgH) + 'px', zIndex: '5'
      });
      s.appendChild(wrap);
      var layer = el('div', { style: { position: 'absolute', inset: '0', zIndex: '20' } });
      s.appendChild(layer);
      var half = 118;
      var g = UI.MeasureGuideH(CX - half, CX + half, topY, BASE_Y);
      s.appendChild(g);
      requestAnimationFrame(function () { g.reveal(); });
      return layer;
    }

    // stack `count` hand slots vertically, base upward (each HV tall)
    function placeStack(layer, variant, count, anim) {
      var nn = count != null ? count : spans;
      var nodes = [];
      for (var i = 0; i < nn; i++) {
        var node = UI.HandSpan({ variant: variant, w: HV, h: HV, anim: anim });
        node.classList.add('handspan--vert');   // rotate the hand to measure vertically
        Object.assign(node.style, { position: 'absolute', left: (CX - HV / 2) + 'px', top: (BASE_Y - HV * (i + 1)) + 'px' });
        layer.appendChild(node);
        nodes.push(node);
      }
      return nodes;
    }

    function guessScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        buildStage(s);
        return FX.wait(200)
          .then(function () { instruct(s, 'Guess how many handspans tall the candle stand is.'); return FX.wait(200); })
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
          .then(function () { FX.celebrate(); feedbackPanel(s, 'success', 'Hurray! This stand is ' + spans + ' handspans tall.'); return h.tapToContinue(); })
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
          .then(function () { A.playWrong(); feedbackPanel(s, 'wrong', 'Let us try again.'); return h.tapToContinue(); })
          .then(function () { clueScreen(); });
      });
    }
    function clueScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        placeStack(layer, 'solid', null, true);
        feedbackPanel(s, 'clue', 'Here is a clue. It should look like this.');
        return h.tapToContinue().then(function () { guessScreen(); });
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
      run = run.then(function () { FX.celebrate(wrap); return sayGogo(h, s, 'You found it! This candle stand is ' + candleState.target + ' handspans tall!'); });
      run = run.then(function () { return sackAnim(h, s, wrap); });
      // ... candles are the LAST round -> the finale
      run = run.then(function () { endScreen(config, h, 'You found the ' + candleState.target + '-handspan candle stand!'); });
      return run;
    });
  }

  /* ====================================================================== *
   * CLOTH ROUND — HORIZONTAL measuring (find the 9-handspan cloth)
   * ----------------------------------------------------------------------
   * A third loop, same idea as the tables but with cloths in a different room
   * (Bgm2): three cloths (7, 9, 12 handspans WIDE), measured left-to-right with
   * VERTICAL guides at each cloth's side edges. Cloth2 (9) is the target that
   * Gogo bags at the end.
   * ====================================================================== */
  var CLOTHS = [
    { src: 'assets/Cloth1.webp', spans: 7,  e0: 0.0291, e1: 0.9717, botF: 0.9569, ar: 0.5583 },
    { src: 'assets/Cloth2.webp', spans: 9,  e0: 0.0551, e1: 0.9437, botF: 0.9423, ar: 0.5626 },  // target
    { src: 'assets/Cloth3.webp', spans: 12, e0: 0.0413, e1: 0.9526, botF: 0.9475, ar: 0.5632 }
  ];
  var CLOTH_TARGET = 9;
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
    clothState = { list: CLOTHS, target: CLOTH_TARGET, measured: [], introShown: false, center: 0 };
    h.festiveTransition(function () { clothHall(config, h); }, '');
  }

  /* ---- carousel of cloths (pick one to measure) ------------------------ */
  function clothHall(config, h) {
    h.setBackground('cloth');
    for (var k = 0; k < clothState.list.length; k++) {
      if (clothState.measured.indexOf((clothState.center + k) % clothState.list.length) < 0) {
        clothState.center = (clothState.center + k) % clothState.list.length; break;
      }
    }
    h.transitionTo(function () {
      var s = h.scene();
      var carousel = el('div.hall-carousel hall-carousel--cloth');
      carousel.appendChild(el('div.select-glow'));

      var cards = clothState.list.map(function (art, i) {
        var card = el('div.hall-card', { dataset: { idx: String(i) } });
        var c = clothImg(art, 52 * art.spans);   // wider cloth -> more handspans (bigger display)
        card._cloth = c;
        card.appendChild(c);
        if (clothState.measured.indexOf(i) >= 0) {
          card.classList.add('hall-card--done');
          card.appendChild(el('div.hall-card__done', { text: art.spans + ' handspans' }));
        }
        carousel.appendChild(card);
        return card;
      });
      s.appendChild(carousel);

      var leftArrow = el('button.hall-arrow hall-arrow--left', { type: 'button' }, '‹');
      var rightArrow = el('button.hall-arrow hall-arrow--right', { type: 'button' }, '›');
      s.appendChild(leftArrow); s.appendChild(rightArrow);

      var nudge = UI.HandNudge();
      nudge.classList.add('hand-nudge--tap');
      Object.assign(nudge.style, { left: '52%', top: '48%', display: 'none' });
      s.appendChild(nudge);

      var n = cards.length;
      function isDone(i) { return clothState.measured.indexOf(i) >= 0; }
      function layout() {
        cards.forEach(function (card, i) {
          card.classList.remove('is-center', 'is-left', 'is-right');
          var rel = (i - clothState.center + n) % n;
          card.classList.add(rel === 0 ? 'is-center' : (rel === 1 ? 'is-right' : 'is-left'));
          card._cloth.classList.toggle('cloth--glow', rel === 0 && !isDone(i));
        });
      }
      layout();
      function rotate(dir) { A.playHover(); nudge.style.display = 'none'; clothState.center = (clothState.center + dir + n) % n; layout(); }
      leftArrow.addEventListener('click', function () { rotate(-1); });
      rightArrow.addEventListener('click', function () { rotate(1); });

      cards.forEach(function (card, i) {
        card.addEventListener('mouseenter', function () { A.playHover(); });
        card.addEventListener('click', function () {
          if (!card.classList.contains('is-center')) { clothState.center = i; layout(); A.playHover(); nudge.style.display = 'none'; return; }
          if (isDone(i)) { FX.shake(card); A.playWrong(); return; }
          A.playClick(); nudge.remove();
          var c = FX.centerOf(card);
          FX.sparkleBurst(c.x, c.y, { count: 18, spread: 130 });
          FX.ringBurst(c.x, c.y, '#FFD54A');
          card._cloth.style.transition = 'transform 0.45s cubic-bezier(.3,1.5,.4,1)';
          card._cloth.style.transform = 'scale(1.08)';
          setTimeout(function () { measureCloth(config, h, i); }, 460);
        });
      });

      var run = Promise.resolve();
      if (!clothState.introShown) {
        clothState.introShown = true;
        run = run.then(function () { return sayGogo(h, s, 'Last of all — the royal cloths!'); })
                 .then(function () { return sayGogo(h, s, 'Find the cloth that is ' + clothState.target + ' handspans WIDE.'); })
                 .then(function () { return sayGogo(h, s, 'Pick a cloth to measure.'); });
      } else {
        run = run.then(function () { return sayGogo(h, s, 'Pick another cloth to measure.'); });
      }
      return run.then(function () { if (document.body.contains(nudge)) { UI.idleNudge(nudge, { onShow: function () { A.playPop(); } }); } });
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

    function buildStage(s) {
      // no vignette here — keep the Bgm2 cloth room plain
      var wrap = clothImg(art, trackW);
      Object.assign(wrap.style, { position: 'absolute', left: clothLeft + 'px', top: clothTop + 'px', zIndex: '5' });
      s.appendChild(wrap);
      var layer = el('div', { style: { position: 'absolute', inset: '0', zIndex: '20' } });
      s.appendChild(layer);
      var g = UI.MeasureGuide(TRACK_X0, TRACK_X0 + trackW, GUIDE_TOP, GUIDE_H);
      s.appendChild(g);
      requestAnimationFrame(function () { g.reveal(); });
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

    // intro demo (first cloth): measure the first two spans, then ask
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
          UI.playMeasureHand(hand, 1).then(function () {
            A.playPop();
            FX.sparkleBurst(TRACK_X0 + i * HW + HW / 2, HAND_TOP + HW / 2, { count: 6, spread: 46, color: '#bfe39a' });
            var imp = UI.HandSpan({ variant: 'faded', w: HW, h: HW, anim: true });
            Object.assign(imp.style, { position: 'absolute', left: (TRACK_X0 + i * HW) + 'px', top: HAND_TOP + 'px' });
            layer.appendChild(imp);
            i++;
            if (i >= count) { setTimeout(function () { hand.style.opacity = '0'; setTimeout(function () { hand.remove(); resolve(); }, 240); }, 220); return; }
            hand.style.left = (TRACK_X0 + i * HW) + 'px';
            setTimeout(step, 320);
          });
        }
        setTimeout(step, 380);
      });
    }

    function guessScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        var run = Promise.resolve();
        if (opts.showPreview) run = run.then(function () { return FX.wait(300); }).then(function () { return previewMeasure(layer, Math.min(2, spans)); });
        else run = run.then(function () { return FX.wait(150); });
        run = run.then(function () { instruct(s, 'Guess how many handspans wide the cloth is.'); return FX.wait(200); });
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
          .then(function () { FX.celebrate(); feedbackPanel(s, 'success', 'Hurray! This cloth is ' + spans + ' handspans wide.'); return h.tapToContinue(); })
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
          .then(function () { A.playWrong(); feedbackPanel(s, 'wrong', 'Let us try again.'); return h.tapToContinue(); })
          .then(function () { clueScreen(); });
      });
    }
    function clueScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        placeRow(layer, 'solid', null, true);
        feedbackPanel(s, 'clue', 'Here is a clue. It should look like this.');
        return h.tapToContinue().then(function () { guessScreen(); });
      });
    }
    guessScreen();
  }

  /* ---- the target (9-handspan) cloth is found; Gogo bags it, then END -- */
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
      run = run.then(function () { FX.celebrate(wrap); return sayGogo(h, s, 'You found it! This cloth is ' + clothState.target + ' handspans wide!'); });
      run = run.then(function () { return sackAnim(h, s, wrap); });
      // ... then on to the candle-stand round (3rd flow, measured vertically)
      run = run.then(function () { startCandles(config, h); });
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
      clothState = { list: CLOTHS, target: CLOTH_TARGET, measured: [], introShown: true, center: 0 };
      for (var i = 0; i < CLOTHS.length; i++) {
        if (CLOTHS[i].spans === spans) { measureCloth(config, h, i); return; }
      }
    },
    clothSuccess: function (config, h) {
      clothState = { list: CLOTHS, target: CLOTH_TARGET, measured: [0, 1, 2], introShown: true, center: 0 };
      clothSuccess(config, h);
    },
    candles: startCandles,
    candle: function (config, h, spans) {
      candleState = { spansList: [5, 3, 7], target: 5, measured: [], introShown: true, center: 0 };
      var idx = candleState.spansList.indexOf(spans);
      measureCandle(config, h, idx < 0 ? 0 : idx);
    },
    candleSuccess: function (config, h) {
      candleState = { spansList: [5, 3, 7], target: 5, measured: [0, 1, 2], introShown: true, center: 0 };
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
