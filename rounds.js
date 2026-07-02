/* ============================================================================
 * rounds.js  —  "Hall of Tables": pick-a-table-to-measure loop
 * ----------------------------------------------------------------------------
 * After the tutorial the player is taken to a scrolling table-selection
 * carousel (the centred table is the big, selectable one). Gogo introduces it:
 *     "Let us now find the table that is 6 handspans long."
 *     "Pick a table you want to measure first."
 * The player scrolls (◀ ▶), taps the centred table, and measures it
 * (guess -> fly-in verify -> "The table is N handspans long."). A measured
 * table is then DISABLED so it can't be chosen again. When the player measures
 * the 6-handspan table, Gogo collects it in his sack and the game ends.
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
  var BROWN = { src: 'assets/Table.webp', ratio: 350 / 662, name: 'brown', e0: 0.0375, e1: 0.9542, foot: 0.855 };
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

  /* ---- a Gogo instruction panel (avatar + purple bar), wait for a tap --- */
  function sayGogo(h, s, text) {
    var b = UI.TutorialBubble({ who: 'gogo', text: text });
    Object.assign(b.style, { left: '50%', top: '18px', transform: 'translateX(-50%)' });
    s.appendChild(b);
    A.playDialogue();
    return h.tapToContinue().then(function () { b.remove(); });
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
      introShown: false,
      center: 0
    };
    // festive entrance into the Hall of Tables
    h.festiveTransition(function () { hall(config, h); }, 'The Hall of Tables!');
  }

  /* ====================================================================== *
   * THE HALL — scrolling table-selection carousel
   * ====================================================================== */
  function hall(config, h) {
    h.setBackground('play');

    // centre on the first un-measured table when we come back
    for (var k = 0; k < state.tables.length; k++) {
      if (state.measured.indexOf((state.center + k) % state.tables.length) < 0) {
        state.center = (state.center + k) % state.tables.length; break;
      }
    }

    h.transitionTo(function () {
      var s = h.scene();

      var carousel = el('div.hall-carousel');
      carousel.appendChild(el('div.select-glow'));

      // same brown artwork for every table — width grows with its span count so
      // a longer table genuinely looks longer in the carousel
      var cards = state.tables.map(function (t, i) {
        var card = el('div.hall-card', { dataset: { idx: String(i) } });
        var a = art(i);
        var cardW = (50 * t.spans) / (a.e1 - a.e0);   // constant hand size -> proportional width
        var table = UI.Table({ w: cardW, src: a.src, ratio: a.ratio });
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

      // scroll arrows
      var leftArrow = el('button.hall-arrow hall-arrow--left', { type: 'button' }, '‹');
      var rightArrow = el('button.hall-arrow hall-arrow--right', { type: 'button' }, '›');
      s.appendChild(leftArrow);
      s.appendChild(rightArrow);

      var nudge = UI.HandNudge();
      nudge.classList.add('hand-nudge--tap');
      // hidden until the intro panels finish — it appears only once it is time
      // to actually pick a table (after "Pick a table you want to measure first.")
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

      function rotate(dir) {
        A.playHover();   // same sound as tapping a side table to centre it
        nudge.style.display = 'none';
        state.center = (state.center + dir + n) % n;
        layout();
      }
      leftArrow.addEventListener('click', function () { rotate(-1); });
      rightArrow.addEventListener('click', function () { rotate(1); });

      cards.forEach(function (card, i) {
        card.addEventListener('mouseenter', function () { A.playHover(); });
        card.addEventListener('click', function () {
          // tapping a side table scrolls it to the centre (with the hover sfx)
          if (!card.classList.contains('is-center')) {
            state.center = i; layout(); A.playHover(); nudge.style.display = 'none'; return;
          }
          if (isDone(i)) { FX.shake(card); A.playWrong(); return; }   // disabled
          // select this table to measure
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

      // Gogo instructions
      var run = Promise.resolve();
      if (!state.introShown) {
        state.introShown = true;
        run = run.then(function () {
          return sayGogo(h, s, 'Let us now find the table that is ' + state.target + ' handspans long.');
        }).then(function () {
          return sayGogo(h, s, 'Pick a table you want to measure first.');
        });
      } else {
        run = run.then(function () { return sayGogo(h, s, 'Pick another table to measure.'); });
      }
      // the nudge now appears, cueing the player to pick the centred table
      return run.then(function () {
        if (document.body.contains(nudge)) { UI.idleNudge(nudge, { onShow: function () { A.playPop(); } }); }
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
    h.setBackground('play');
    var spans = opts.spans;

    // The hand is a FIXED size; the table's width grows with its span count, so
    // a 6-handspan table is visibly longer than a 4-handspan one. The track runs
    // between the table's OUTER leg edges (e0..e1), bracketed by the guides.
    var e0 = opts.e0 != null ? opts.e0 : 0.05;
    var e1 = opts.e1 != null ? opts.e1 : 0.95;
    var foot = opts.foot != null ? opts.foot : 0.99;  // leg-foot fraction of the art height
    var HW = 70;                                      // constant flush hand width (a bit smaller)
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

    function buildStage(s, heading) {
      s.appendChild(UI.Vignette());
      var table = UI.Table({ w: TABLE_W, src: opts.src, ratio: opts.ratio });
      Object.assign(table.style, { position: 'absolute', left: TABLE_LEFT + 'px', top: TABLE_TOP + 'px', zIndex: '5' });
      s.appendChild(table);
      if (heading) s.appendChild(UI.Heading(heading));
      var layer = el('div', { style: { position: 'absolute', inset: '0', zIndex: '20' } });
      s.appendChild(layer);
      var g = UI.MeasureGuide(TRACK_X0, TRACK_X0 + TRACK_W, GUIDE_TOP, GUIDE_H);
      s.appendChild(g);
      requestAnimationFrame(function () { g.reveal(); });
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

    // full-body genie + a purple message panel (feedback screens)
    function feedback(s, who, text) {
      var src = who === 'success' ? 'assets/successGogo.webp'
              : who === 'wrong' ? 'assets/wrongGogo.webp'
              : 'assets/ShowingGogo.webp';
      // genie stands left for success/clue, right for wrong; the bubble sits on
      // the same side with its tail pointing down at the genie
      var onRight = who === 'wrong';
      var gogo = el('img.feedback-gogo feedback-gogo--' + who + ' ' + (onRight ? 'feedback-gogo--right' : 'feedback-gogo--left'), { src: src, alt: '', draggable: 'false' });
      s.appendChild(gogo);
      var panel = UI.FeedbackBubble(text, onRight ? 'right' : 'left');
      s.appendChild(panel);
      A.playDialogue();
    }

    /* ---- DRAG-TO-MEASURE: the player drags hands into the span slots ------ *
     * The table defines `spans` invisible drop-zones across its width. A hand
     * sits on a podium (bottom-left); the player drags it into any empty zone
     * (order is free). The first time, an arrow guides the drag to zone 1;
     * after that, going idle ~3s highlights the hand + shows the hand-nudge.
     * When every zone is filled the table is measured. */
    function dragScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s, null);
        var bubble = instruct(s, 'Drag the hand to the table to measure it.');

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

        var REST = { left: 92, top: 548 };   // hand's resting spot on the podium
        var podium = el('div.drag-podium');
        Object.assign(podium.style, { left: (REST.left + HW / 2) + 'px', top: (REST.top + HW + 4) + 'px' });
        s.appendChild(podium);

        function nearestEmpty(x) {
          var best = -1, bd = 1e9;
          for (var i = 0; i < zones.length; i++) { if (zones[i].filled) continue; var d = Math.abs(zones[i].cx - x); if (d < bd) { bd = d; best = i; } }
          return best;
        }
        function clearTargets() { zones.forEach(function (z) { z.node.classList.remove('drop-zone--target'); }); }
        function stopIdle() {
          if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
          if (curHand) curHand.classList.remove('drag-hand--hint');
          if (idleNudgeEl) { idleNudgeEl.remove(); idleNudgeEl = null; }
        }
        function armIdle() {
          stopIdle();
          if (!alive || filled >= spans) return;
          idleTimer = setTimeout(function () {
            if (!alive || !curHand) return;
            curHand.classList.add('drag-hand--hint');
            idleNudgeEl = UI.HandNudge();
            // the cropped nudge's fingertip is top-centre; sit it over the hand
            Object.assign(idleNudgeEl.style, { position: 'absolute', left: (REST.left + HW * 0.42) + 'px', top: (REST.top + HW * 0.06) + 'px', width: '58px', zIndex: '30' });
            s.appendChild(idleNudgeEl);
            A.playPop();
          }, 10000);
        }

        function spawnHand() {
          var hand = el('div.drag-hand', null, [el('img', { src: 'assets/handSpanHand.webp', alt: '', draggable: 'false' })]);
          Object.assign(hand.style, { left: REST.left + 'px', top: REST.top + 'px', width: HW + 'px', height: HW + 'px' });
          s.appendChild(hand);
          curHand = hand;
          wireDrag(hand);
          armIdle();
          // first-ever placement: arrow + target the first zone
          if (!firstPlaced && !arrow) {
            // stop the arrowhead well OUTSIDE the box (clear of its glow halo and the
            // guide line), pointing at the box — head never enters the box or the dashes
            arrow = makeArrow(REST.left + HW, REST.top + 6, zones[0].left - 40, HAND_TOP + HW / 2);
            s.appendChild(arrow);
            zones[0].node.classList.add('drop-zone--target');
          }
        }

        function wireDrag(hand) {
          var dragging = false;
          function down(e) {
            dragging = true; stopIdle();
            if (arrow) { arrow.remove(); arrow = null; }
            clearTargets();
            try { hand.setPointerCapture(e.pointerId); } catch (_) {}
            hand.classList.add('drag-hand--dragging');
            A.playPop(); move(e); e.preventDefault();
          }
          function move(e) {
            if (!dragging) return;
            var p = toStage(e.clientX, e.clientY);
            hand.style.left = (p.x - HW / 2) + 'px'; hand.style.top = (p.y - HW / 2) + 'px';
            clearTargets();
            if (p.y > HAND_TOP - HW && p.y < HAND_TOP + HW * 2) { var zi = nearestEmpty(p.x); if (zi >= 0) zones[zi].node.classList.add('drop-zone--target'); }
          }
          function up(e) {
            if (!dragging) return; dragging = false;
            hand.classList.remove('drag-hand--dragging'); clearTargets();
            var p = toStage(e.clientX, e.clientY);
            var within = p.y > HAND_TOP - HW && p.y < HAND_TOP + HW * 2 && p.x > TRACK_X0 - HW && p.x < TRACK_X0 + spans * HW + HW;
            var zi = within ? nearestEmpty(p.x) : -1;
            if (zi >= 0) place(hand, zi); else back(hand);
          }
          hand.addEventListener('pointerdown', down);
          hand.addEventListener('pointermove', move);
          hand.addEventListener('pointerup', up);
          hand.addEventListener('pointercancel', up);
        }

        function place(hand, zi) {
          var z = zones[zi]; z.filled = true; filled++;
          hand.style.transition = 'left 0.16s ease, top 0.16s ease';
          hand.style.left = z.left + 'px'; hand.style.top = HAND_TOP + 'px';
          hand.style.pointerEvents = 'none'; hand.classList.add('drag-hand--placed');
          curHand = null; stopIdle();
          A.playHandPlace(); FX.pulse(hand);   // drop sound when the hand lands in a span area
          FX.sparkleBurst(z.cx, HAND_TOP + HW / 2, { count: 7, spread: 48, color: '#bfe39a' });
          if (!firstPlaced) {
            firstPlaced = true;
            var t = bubble.querySelector('.tbubble__text');
            if (t) t.textContent = 'Put the next hand right next to it. No gaps!';
          }
          if (filled >= spans) setTimeout(finishMeasure, 560);
          else spawnHand();
        }

        function back(hand) {
          hand.style.transition = 'left 0.24s ease, top 0.24s ease';
          hand.style.left = REST.left + 'px'; hand.style.top = REST.top + 'px';
          armIdle();
        }

        function finishMeasure() {
          alive = false; stopIdle();
          FX.celebrate();
          feedback(s, 'success', 'You measured it! The table is ' + spans + ' handspans long.');
          h.tapToContinue().then(function () { opts.onDone(); });
        }

        spawnHand();
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
        return sayGogo(h, s, 'You found it! This table is ' + state.target + ' handspans long!');
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

      cards.forEach(function (card, i) {
        card.addEventListener('mouseenter', function () { A.playHover(); });
        card.addEventListener('click', function () {
          if (!card.classList.contains('is-center')) { candleState.center = i; layout(); A.playHover(); nudge.style.display = 'none'; return; }
          if (isDone(i)) { FX.shake(card); A.playWrong(); return; }
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

  return {
    startHall: startHall,
    startCloths: startCloths
  };
})();
