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
  // Every table uses the SAME brown artwork (Table.webp); they differ only by
  // SIZE — the more handspans, the longer the table. foot = fraction of the art
  // height where the legs meet the floor (so it stands ON the ground).
  // foot = fraction of the rendered element height where the VISIBLE legs end.
  // Table.webp (aspect ~0.404) letterboxes inside the 0.529-ratio box, so the
  // legs sit at ~0.855 of the box height, not ~0.965 — anchor by that so the
  // legs land on FLOOR_Y and meet the guide-line tops.
  var BROWN = { src: 'assets/Table.webp', ratio: 350 / 662, name: 'brown', e0: 0.0375, e1: 0.9542, foot: 0.855 };
  var TABLE_ART = [BROWN, BROWN, BROWN];
  function art(i) { return TABLE_ART[i % TABLE_ART.length]; }

  // persistent state for the hall loop (reset each time we enter it)
  var state = null;

  /* ---- ONE instruction panel for the guess flows (cloth + candle) --------
   * Gogo IN PERSON is reserved for the table flow (flow 1). In every other
   * flow the round plays out on its own, and JUST BEFORE play an instruction
   * panel (avatar + purple bar) comes in with the task text and STAYS on
   * screen for the whole guess phase — it is the task the child keeps
   * referring to while picking a number. Resolves once the line has been
   * read (so the guess tray can then appear); the panel itself lives until
   * the scene moves on. */
  function instructStay(s, text) {
    var b = UI.TutorialBubble({ who: 'gogo', text: text });
    Object.assign(b.style, { left: '50%', top: '18px', transform: 'translateX(-50%)' });
    s.appendChild(b);
    A.playVO(text);
    // resolves with the panel node — drag flows clear it when measuring ends
    // (guess flows just leave it; the scene transition takes it away)
    return FX.wait(lineMs(text)).then(function () { return b; });
  }
  /* later guess rounds: the demo's outline track lingers briefly, then fades
   * away — the child answers from memory (only the FIRST cloth / stand keeps
   * its outlines up for counting) */
  function fadeImpressions(imps) {
    return FX.wait(2000).then(function () {
      imps.forEach(function (n) { n.style.transition = 'opacity 0.5s ease'; n.style.opacity = '0'; });
      return FX.wait(520).then(function () { imps.forEach(function (n) { n.remove(); }); });
    });
  }
  /* ---- judge on the SAME screen (cloth + candle guess rounds) ------------
   * The chosen handspans LIFT OUT of the tray one by one and glide onto the
   * measuring track — no scene switch — each hand's counting circle popping
   * in as it lands (below the hand on a horizontal track, beside it on a
   * vertical stack, the same spots the clue screens use). `g` is guessPhase's
   * keepTray handle; geo: { unit, vert, slotAt(i)->{left,top},
   * numAt(i)->{left,top: the circle's CENTRE, badge-pop centres it} }.
   * Correct or wrong, the beat is the SAME slow one-thing-at-a-time measure:
   * lift -> glide -> land -> its number pops with the tick -> the next hand
   * lifts. The child counts along and SEES the guess measured out; the
   * verdict then plays over the finished track (a correct guess goes straight
   * to the clap — see successClap — a wrong one shows where it fell short). */
  var TRAY_UNIT = 72;   // guess-tray hand size (see guessPhase) — the flying
                        // hand starts at this scale and settles at geo.unit
  function measureFromTray(s, g, geo) {
    return new Promise(function (resolve) {
      var count = g.count, launched = 0;
      // one hand's full glide, tray cell -> track slot; onLanded fires with
      // the settle pulse as the hand touches down
      function flyOne(idx, onLanded) {
        var from = g.liftHand(idx);
        var slot = geo.slotAt(idx);
        var node = UI.HandSpan({ variant: 'solid', w: geo.unit, h: geo.unit, anim: true });
        if (geo.vert) node.classList.add('handspan--vert');
        node.classList.add('fly-span');
        // start EXACTLY on the lifted tray cell, transitions OFF: the start
        // state must be COMMITTED (forced reflow, same recipe as measureFly)
        // before the target is set — a rAF alone can collapse start + target
        // into one style update and the hand TELEPORTS instead of gliding
        Object.assign(node.style, {
          left: (from.x - geo.unit / 2) + 'px', top: (from.y - geo.unit / 2) + 'px',
          transform: 'scale(' + (TRAY_UNIT / geo.unit) + ')',
          transition: 'none'
        });
        s.appendChild(node);
        void node.offsetWidth;   // commit the start state
        // a BRISK but readable glide — quick enough to keep the verdict
        // moving, slow enough that the eye follows each hand; the lift whoosh
        // is the only sound of the movement (no landing pop: the one-by-one
        // SFX belongs to the COUNTING)
        node.style.transition = 'left 0.8s cubic-bezier(.3,.7,.3,1), top 0.8s cubic-bezier(.3,.7,.3,1), transform 0.8s ease';
        node.style.left = slot.left + 'px';
        node.style.top = slot.top + 'px';
        node.style.transform = 'scale(1)';
        A.playWhoosh();
        setTimeout(function () {
          FX.pulse(node);   // a silent soft settle on touchdown
          onLanded();
        }, 850);
      }
      // strict one-thing-at-a-time beat — the hand finishes its whole glide,
      // THEN its count pops in, THEN the next lifts off, so the child counts
      // along hand by hand (same circles + tick as the clue screens)
      (function flyNext() {
        if (launched >= count) { setTimeout(resolve, 260); return; }
        var idx = launched++;
        flyOne(idx, function () {
          setTimeout(function () {
            var np = geo.numAt(idx);
            var num = el('div.track-num track-num--pop', { text: String(idx + 1) });
            Object.assign(num.style, { position: 'absolute', left: np.left + 'px', top: np.top + 'px', zIndex: '25' });
            s.appendChild(num);
            A.playPop();
            setTimeout(flyNext, 350);
          }, 250);
        });
      })();
    });
  }
  // A correct guess was already counted hand by hand as it was measured out
  // (see measureFromTray), so success skips a second count-off and goes
  // straight to the applause: the clap starts a beat after "Hurray!" pops,
  // and the "...N handspans" sentence waits until the cheer has rung out
  // (clapSound.ogg is ~2.0s). Returns the ms to pass as feedback's holdFirst.
  function successClap() {
    setTimeout(A.playClap, 350);
    return 350 + 2050 + 250;
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
  // Unhurried pacing for early readers (~1.5-2 words/sec + settle time):
  // even the shortest line holds 3.4s, and every word adds a full 350ms so a
  // child can follow the voice-over AND the text comfortably.
  function lineMs(text) { return Math.max(3400, 1500 + String(text).split(/\s+/).length * 350); }
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
          A.playVO(text);
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
    // the wrong genie hugs the right frame edge (see .feedback-gogo--wrong),
    // so his bubble rides 76px further right too — tail tip stays on his head
    wrong:   { tail: 'right', style: { right: '174px', bottom: '570px' } },
    clue:    { tail: 'left',  style: { left: '235px',  bottom: '558px' } }
  };
  function feedback(s, who, text, opts) {
    var src = who === 'success' ? 'assets/successGogo.webp'
            : who === 'wrong' ? 'assets/wrongGogo.webp'
            : 'assets/ShowingGogo.webp';
    // genie stands RIGHT for success/wrong, left for the clue; the bubble
    // sits on the same side with its tail pointing down at the genie
    var onRight = who === 'wrong' || who === 'success';
    var gogo = el('img.feedback-gogo feedback-gogo--' + who + ' ' + (onRight ? 'feedback-gogo--right' : 'feedback-gogo--left'), { src: src, alt: '', draggable: 'false' });
    s.appendChild(gogo);
    // (no clap here — on success the cheer belongs AFTER the count-off:
    // "Well Done!" -> 1..N one by one -> clap. See countOff's clap option.)
    var lines = Array.isArray(text) ? text : [text];
    // opts.holdFirst: minimum ms the FIRST line stays up before the next one —
    // the success screens hold "Well Done!"/"Hurray!" until the handspan
    // count-off has finished, so the sentence lands with the count as proof
    var holdFirst = (opts && opts.holdFirst) || 0;
    function stayMs(idx) { return idx === 0 ? Math.max(lineMs(lines[idx]), holdFirst) : lineMs(lines[idx]); }
    var li = 0, panel = null;
    (function show() {
      if (panel) panel.remove();
      var line = lines[li];
      var spot = FEEDBACK_BUBBLE[who];
      panel = UI.SayBubble(line, spot.tail);
      Object.assign(panel.style, spot.style);
      s.appendChild(panel);
      A.playVO(line);
      li++;
      if (li < lines.length) {
        setTimeout(function () {
          if (document.body.contains(panel)) show();   // scene may have moved on
        }, stayMs(li - 1));
      }
    })();
    // ms until the LAST line has landed plus a beat to take it in — callers
    // pass this to tapToContinue so the arrow only appears once the genie's
    // message has actually been delivered
    var wait = 1400;
    for (var w = 0; w < lines.length - 1; w++) wait += stayMs(w);
    return wait;
  }

  /* ---- success COUNT-OFF: 1..N circles pop in one by one ------------------
   * EVERY flow's success plays the same beat: the celebratory word appears,
   * then the placed hands count off (1..N, the clue screens' circles), and
   * only then the "...N handspans" sentence lands (pass the returned ms to
   * feedback's holdFirst). posAt(i) -> {left,top} — badge-pop centres the
   * circle on `left`, so callers pass the same coords their clue screen uses. */
  // one number per beat, slow enough for the child to count along out loud
  var COUNT_START = 700, COUNT_STEP = 450;
  // opts.clap: the SUCCESS count-offs end on the cheerful clap — it fires the
  // moment the LAST circle lands (clue-screen counts pass no opts: a hint
  // earns no applause). Every flow gets the same beat:
  //   "Well Done!"/"Hurray!" -> 1..N one by one -> CLAP -> the sentence.
  function countOff(parent, n, posAt, opts) {
    for (var i = 0; i < n; i++) {
      var p = posAt(i);
      var num = el('div.track-num track-num--pop', { text: String(i + 1) });
      Object.assign(num.style, {
        position: 'absolute', left: p.left + 'px', top: p.top + 'px',
        zIndex: '25', animationDelay: (COUNT_START + i * COUNT_STEP) / 1000 + 's'
      });
      parent.appendChild(num);
      // the one-by-one tick rides WITH each circle's pop-in — this counting
      // beat is the only place the per-item SFX lives
      setTimeout(A.playPop, COUNT_START + i * COUNT_STEP);
    }
    if (opts && opts.clap) {
      // the cheer starts as the LAST circle lands, and the count-off isn't
      // "over" until the whole clap has rung out (clapSound.ogg is ~2.0s) —
      // so the "...N handspans" sentence never talks over the applause
      var clapAt = COUNT_START + (n - 1) * COUNT_STEP + 350;
      setTimeout(A.playClap, clapAt);
      return clapAt + 2050 + 250;   // clap length + a breath
    }
    // ms until the last circle has popped, plus a settle beat
    return COUNT_START + n * COUNT_STEP + 600;
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
        // the standing task panel: the tutorial is Gogo-led (he speaks in
        // person), but the normal rounds pin "Measure how long the table is."
        // here for the whole measure (see beginRound / finishMeasure)
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
        // podium art (assets/handDrag.webp) sits under the hovering hand, its
        // light beam rising up behind the hand (hand z-index is higher)
        var podW = Math.round(HW * 2.6), podH = Math.round(podW * 525 / 532);
        var podium = el('img.drag-podium', { src: 'assets/handDrag.webp', alt: '', draggable: 'false' });
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
            // tutorial: the "Now you try." instruction + teaching Gogo step aside
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
          // "Well Done!" -> the placed hands COUNT OFF below (1..N circles,
          // the clue screens' language) -> only then "...N handspans long."
          // (holdFirst keeps the first line up until the count has finished)
          var countMs = countOff(s, spans, function (ni) {
            return { left: TRACK_X0 + ni * HW + HW / 2, top: HAND_TOP + HW + 6 };
          }, { clap: true });
          var readWait = feedback(s, 'success', ['Well Done!', 'The table is ' + spans + ' handspans long.'], { holdFirst: countMs });
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
        }
        // Each pose's art has different transparent padding, so the bubble is
        // anchored to that pose's VISIBLE right edge — no floating gap on
        // narrow poses (e.g. ThinkGogo). BOTTOM-anchored (like GOGO_BUBBLE) so
        // short lines ("Yes!") keep their tail tip on his head too.
        var DEMO_BUBBLE = {
          talk: { left: '365px', bottom: '600px' },
          think: { left: '410px', bottom: '600px' },
          // lifted clear ABOVE the raised hand ("Now you try." / "Drag the
          // rest…") — the tail tip points down toward the hand without the
          // bubble body ever clashing with it
          show: { left: '385px', bottom: '615px' },
          wrong: { left: '390px', bottom: '600px' }
        };
        function demoBubbleAt(pose) { return DEMO_BUBBLE[pose] || DEMO_BUBBLE.talk; }
        // beside the head of the small horizontal Gogo down at the podium
        // (his box: left 16, top 330, 250px wide — turban ends around x 250,
        // y 390, and the tail tip lands at about left+12 / bottom-edge+29)
        var PODIUM_BUBBLE = { left: '230px', bottom: '335px' };
        // Gogo speaks; the bubble sits beside him with its tail pointing at him.
        // `pose` picks the asset by the kind of line. Auto-advances after `ms`,
        // or waits for a tap if ms is 0.
        function demoLine(text, ms, pose, posOverride, tail) {
          return new Promise(function (res) {
            if (teacher && pose) UI.setGogoPose(teacher, pose);
            var b = UI.SayBubble(text, tail || 'left');
            Object.assign(b.style, posOverride || demoBubbleAt(pose || 'talk'));
            s.appendChild(b);
            A.playVO(text);
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
        var POINT_TOP = 266;
        function glidePointGogo(cx, ms) {
          if (!teacher) return;
          UI.setGogoPose(teacher, 'horizontal');
          teacher.style.width = '250px';
          teacher.style.transition = 'left ' + ms + 'ms cubic-bezier(.4,.05,.4,1), top ' + ms + 'ms cubic-bezier(.4,.05,.4,1)';
          requestAnimationFrame(function () { teacher.style.left = (cx - 136) + 'px'; teacher.style.top = POINT_TOP + 'px'; });
        }
        // bubble slot hugging the hovering pointer-Gogo's head (turban top sits
        // ~POINT_TOP+40; the head fills the right end of his box, ending at
        // ~cx+114). BOTTOM-anchored just above the turban so the tail tip lands
        // on his face whatever the line length (the bubble grows upward).
        function pointBubbleAt(cx) { return { left: (cx + 65) + 'px', bottom: (670 - POINT_TOP) + 'px' }; }
        // "No!" comes from the SAME hovering pointer-Gogo — he stays put,
        // finger on the spot in question; only the bubble text changes
        function noHere(cx) {
          return new Promise(function (res) {
            var b = UI.SayBubble('No!', 'left');
            Object.assign(b.style, pointBubbleAt(cx));
            s.appendChild(b);
            A.playWrong();          // ducked under the spoken "No!"
            A.playVO('No!');
            setTimeout(function () { b.remove(); res(); }, 3400);
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
            if (good) A.playSuccess(); else A.playWrong();   // ducked under the VO
            A.playVO(text);
            setTimeout(function () { b.remove(); res(); }, 3400);
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
          seq = seq.then(function () { return demoLine('We need to measure the table using handspans.', 3400, 'talk'); });
          // "But how?" — the thinking genie (nothing else on screen yet: the
          // handspan only pops in AFTER the question, as its answer)
          seq = seq.then(function () { return demoLine('But how?', 2600, 'think'); });
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
          seq = seq.then(function () { return demoLine('Let us drag the first handspan.', 3200, null, PODIUM_BUBBLE); });
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
          seq = seq.then(function () { return FX.wait(700); });    // slight pause: let the question land before the answer
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
          // The rule bubble STAYS UP through the slide — the words and the
          // move are read together — and only comes down once the hand lands.
          var startRuleBubble;
          seq = seq.then(function () {
            layer.pulseStart(true);
            startRuleBubble = UI.SayBubble('We must start from one end of the table.', 'left');
            Object.assign(startRuleBubble.style, pointBubbleAt(TRACK_X0));
            s.appendChild(startRuleBubble);
            A.playVO('We must start from one end of the table.');
            return FX.wait(Math.max(3400, lineMs('We must start from one end of the table.')));
          });
          // ...the straddling hand slides to the correct spot, landing right
          // under his pointing finger — no follow-up "Yes!" line: the slide
          // itself is the answer
          seq = seq.then(function () { A.playWhoosh(); return moveTo(hand1, L0, HAND_TOP, 850); });
          seq = seq.then(function () { return FX.wait(600); });
          seq = seq.then(function () {
            if (startRuleBubble) { startRuleBubble.remove(); startRuleBubble = null; }
            layer.pulseStart(false);
            return gogoHome('talk');
          });
          // checkpoint: the start rule is complete — the pulsing Next button
          // appears and the SECOND handspan's lesson waits for the tap
          seq = seq.then(function () { lockDemoHand(hand1, 0); return h.tapToContinue(300); });

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
          seq = seq.then(function () { return demoLine('Let us drag the next handspan.', 3200, null, PODIUM_BUBBLE); });
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
          seq = seq.then(function () { return demoLine("That is the perfect way.", 3000, 'talk'); });
          seq = seq.then(function () { FX.celebrate(); return demoLine('No Gaps! No Overlaps!', 3400, 'talk'); });
          return seq;
        }

        // hand control to the player for the remaining spans. Gogo delivers his
        // hand-over in two short lines, poofs away, and only THEN the nudge
        // cursor appears, tracing the drag path.
        function beginPlay() {
          firstPlaced = true;   // the demo already taught the drag — skip the first-time arrow
          if (teacher) UI.setGogoPose(teacher, 'show');
          var seq = FX.wait(500);                                   // breather after the demo's cheer
          seq = seq.then(function () { return demoLine('Now you try.', 2600, 'show'); });
          seq = seq.then(function () { return demoLine('Drag the rest with no gaps.', 3200, 'show'); });
          seq = seq.then(function () {
            if (!teacher) return;
            var tg = teacher; teacher = null;
            return UI.gogoVanish(tg).then(function () { tg.remove(); });
          });
          seq = seq.then(function () { return FX.wait(350); });     // beat before the hand + nudge
          seq = seq.then(function () {
            // the podium art has no hand baked in, so the demo hand must stay
            // put until this exact moment — the interactive source replaces it
            // in the same frame and the podium is never seen empty
            if (demoSource) { demoSource.remove(); demoSource = null; }
            spawnHand();
            showDragNudge();   // demonstrate the drag path right away
          });
          return seq;
        }

        // non-tutorial rounds: staged reveal — the table alone, then the guide
        // lines, then the TASK PANEL ("Find...") which STAYS up for the
        // whole measure (cleared in finishMeasure), then the handspan
        function beginRound() {
          var seq = FX.wait(1000);                                  // 1. the table alone
          seq = seq.then(function () {
            layer.revealGuide();                                    // 2. lines drop in (SFX)
            return FX.wait(1100);
          });
          seq = seq.then(function () {                              // 3. the standing task panel
            return instructStay(s, 'Measure how long the table is.').then(function (p) { bubble = p; });
          });
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
  /* ---- shared FINALE (success-bag) screen for EVERY flow -----------------
   * The storybook recap: all measured objects line up smallest -> largest,
   * each with its "N handspans" chip below; the taragogo gif tells the
   * story from the left, vanishes in green genie smoke, a cone of light
   * falls on the target from above, and bag-Gogo swoops in from the left to
   * take it. opts:
   *   bg        background name ('play' | 'cloth' | ...)
   *   vignette  false to keep the room plain (cloth room)
   *   items     [{ spans, node, wrapW, advW, rise }] — node pre-built;
   *             wrapW = node box width, advW = visual width the row should
   *             advance by (narrow candles have wide transparent boxes),
   *             rise = node box height above the shared floor line
   *   target    span count to spotlight
   *   glow      css class for the flow's target glow (added to the node)
   *   storyLine Tara's spoken request ("We need a ... that is N handspans
   *             ...") — shown in a bubble beside the gif + voiced while
   *             the (silent) taragogo gif plays
   *   onDone    where the flow goes after the bag leaves */
  function finaleScreen(config, h, opts) {
    h.setBackground(opts.bg || 'play');
    h.transitionTo(function () {
      var s = h.scene();
      if (opts.vignette !== false) s.appendChild(UI.Vignette());

      var FLOOR_Y = 430;    // shared floor line for the row
      var ROW_CX = 810;     // row centred in the space right of the storytellers
      var GAP = 56;
      var items = opts.items.slice().sort(function (a, b) { return a.spans - b.spans; });
      var totalW = items.reduce(function (a, it) { return a + it.advW; }, 0) + GAP * (items.length - 1);
      var x = ROW_CX - totalW / 2;
      var targetItem = items[0];
      items.forEach(function (it) {
        if (it.spans === opts.target) targetItem = it;
        var card = el('div.finale-card');
        card.appendChild(it.node);
        card.appendChild(el('div.hall-card__done', { text: it.spans + ' handspans' }));
        // the row advances by the VISUAL width; the (possibly wider) box is
        // centred on that slot, and every base sits on the same floor line
        Object.assign(card.style, { left: (x + (it.advW - it.wrapW) / 2) + 'px', top: (FLOOR_Y - it.rise) + 'px' });
        s.appendChild(card);
        it._card = card;
        x += it.advW + GAP;
      });

      // ---- the storytellers: the taragogo gif plays on the LEFT. If the
      // gif is missing/broken the beat is skipped silently (no line, no smoke).
      // The host keeps the OLD clip's exact 350x350 box — it is the anchor the
      // smoke poofs centre on and the pivot the fade-out scales around.
      var host = el('div.finale-video');
      // tucked into the top-left corner of the floor area — clear of the
      // object row, with the story bubble sitting right beside Tara's head
      Object.assign(host.style, { position: 'absolute', left: '16px', bottom: '150px', width: '350px', height: '350px', zIndex: '12' });
      // Canvas geometry, measured from the assets (alpha union across frames):
      //   gogobTara.webm  640x640,  characters box (62,62)-(582,577)
      //   taragogo.gif   1920x1080, characters box (618,197)-(1310,878)
      // The old square clip at width 350 drew the characters 284px wide with
      // their feet on stage y=535.5; the widescreen gif is sized/offset below
      // so ITS characters land on exactly that box (same size, feet, centre) —
      // the extra margin is transparent, so nothing else shows
      var gif = el('img', { src: 'assets/taragogo.gif', alt: '', draggable: 'false' });
      Object.assign(gif.style, {
        position: 'absolute', width: '794px',
        left: '-222.6px', top: '-47.6px', pointerEvents: 'none'
      });
      host.appendChild(gif);
      s.appendChild(host);

      // Tara's story line — HER text box for the flow ("We need a ... that
      // is N handspans ...") beside the gif, voiced by her recording. The
      // gif itself is silent, so her voice carries the story.
      var storyBubble = null;
      function showStory() {
        if (!opts.storyLine || storyBubble) return;
        storyBubble = UI.SayBubble(opts.storyLine, 'left');
        // BOTTOM-anchored just above Tara's head (she stands on the gif's
        // right side), tail-left dipping to her crown — the bubble grows
        // upward so longer lines never drift down over the characters
        Object.assign(storyBubble.style, { left: '290px', bottom: '440px', zIndex: '13' });
        s.appendChild(storyBubble);
        A.playVO(opts.storyLine);
      }
      function hideStory() { if (storyBubble) { storyBubble.remove(); storyBubble = null; } }

      // A gif has no 'ended' event or playback rate, so the beat is TIMED:
      // the old clip ran 2.25s at 0.55 rate ≈ 4.1s — the gif (2.23s/loop)
      // loops underneath while the bubble + voice carry the story, keeping
      // the finale's overall pacing exactly as it was.
      var STORY_MS = 4100;
      function playStory() {
        return new Promise(function (resolve) {
          var settled = false;
          function done() { if (settled) return; settled = true; hideStory(); resolve(); }
          function fallback() {
            if (settled) return; settled = true;
            hideStory();
            host._gone = true; host.remove();
            resolve();
          }
          function begin() { showStory(); setTimeout(done, STORY_MS); }
          // a missing file may have failed DURING the intro beat, before these
          // listeners attach — so check the load state, don't just listen
          gif.addEventListener('error', fallback);
          if (gif.complete && gif.naturalWidth === 0) { fallback(); return; }
          if (gif.complete) begin();
          else gif.addEventListener('load', begin);
          setTimeout(done, 15000);   // a stalled load must never wedge the finale
        });
      }

      var run = FX.wait(1600);   // a calm look at the line-up first
      // 1. the storytellers tell it (beat skipped silently if the clip is absent)
      run = run.then(playStory);
      run = run.then(function () { return FX.wait(1200); });   // let the story sink in
      // 2. they vanish in GREEN GENIE SMOKE the moment their story ends
      run = run.then(function () {
        if (host._gone) return;
        var c = FX.centerOf(host);
        A.playWhoosh();
        // stacked bursts of BIG puffs so the cloud swallows the whole panel —
        // head, middle and feet — with a second wave rolling in behind
        FX.smokePoof(c.x, c.y - c.h * 0.3, { count: 16, spread: 150, size: 2 });
        FX.smokePoof(c.x, c.y,             { count: 16, spread: 180, size: 2.4 });
        FX.smokePoof(c.x, c.y + c.h * 0.3, { count: 16, spread: 150, size: 2 });
        setTimeout(function () {
          FX.smokePoof(c.x, c.y - c.h * 0.15, { count: 10, spread: 140, size: 2.2 });
          FX.smokePoof(c.x, c.y + c.h * 0.15, { count: 10, spread: 140, size: 2.2 });
        }, 260);
        // whoosh alone carries the smoke — no extra sparkle chime
        host.style.transition = 'opacity 0.5s ease, transform 0.55s ease';
        host.style.opacity = '0'; host.style.transform = 'scale(0.55)';
        return FX.wait(1100).then(function () { host.remove(); });
      });
      // 3. ...and THEN the correct object takes the light; the others step
      // back, and a warm cone of light falls on the winner from above
      run = run.then(function () {
        A.playLightsOn();
        items.forEach(function (it) {
          it._card.classList.add(it === targetItem ? 'finale-card--hero' : 'finale-card--dim');
        });
        if (opts.glow) targetItem.node.classList.add(opts.glow);
        var c = FX.centerOf(targetItem._card);
        var beam = el('div.finale-beam');
        Object.assign(beam.style, {
          left: c.x + 'px',
          width: Math.max(320, targetItem.advW * 1.7) + 'px',
          height: (FLOOR_Y + 90) + 'px'   // from above the frame down past the floor line
        });
        s.appendChild(beam);
        requestAnimationFrame(function () { beam.classList.add('is-on'); });
        FX.ringBurst(c.x, c.y, '#FFD54A');
        FX.starBurst(c.x, c.y, { count: 14, spread: 120 });
        return FX.wait(2300);
      });
      // 4. Gogo's bag flies in from the left and takes the winner (chip and all)
      run = run.then(function () { return FX.wait(600); });
      run = run.then(function () { return sackAnim(h, s, targetItem._card, { from: 'left' }); });
      run = run.then(function () { opts.onDone(); });
      return run;
    });
  }

  function hallSuccess(config, h) {
    finaleScreen(config, h, {
      bg: 'play',
      storyLine: 'We need a table that is ' + state.target + ' handspans long.',
      items: state.tables.map(function (t, i) {
        var tw = (34 * t.spans) / (art(i).e1 - art(i).e0);
        return {
          spans: t.spans,
          node: (function () { var n = UI.Table({ w: tw, src: art(i).src, ratio: art(i).ratio }); return n; })(),
          wrapW: tw, advW: tw,
          rise: art(i).foot * tw * art(i).ratio   // feet on the floor line
        };
      }),
      target: state.target,
      glow: 'table--glow',
      // ... then on to the cloth round (2nd flow, measured by width)
      onDone: function () { startCloths(config, h); }
    });
  }

  // Gogo (holding his sack) flies in and the object shrinks into the red
  // sack. Uses the gogoWbag artwork; the sack sits at ~0.687 of its width,
  // ~0.503 of its height. Enters from the RIGHT by default; pass
  // { from: 'left' } to enter from the left (art mirrored so he still faces
  // the scene, which also mirrors the sack's offset).
  function sackAnim(h, s, wrap, o) {
    var fromLeft = o && o.from === 'left';
    return new Promise(function (resolve) {
      // the mirror lives STATICALLY on the inner img; the wrapper only ever
      // animates plain translate/scale. Mixing scaleX(-1) into the animated
      // transform made the browser matrix-decompose between mismatched
      // transform lists — a visible shrink/expand wobble mid-flight.
      var img = el('img.gogo-bag', { src: 'assets/gogoWbag.webp', alt: '', draggable: 'false' });
      Object.assign(img.style, {
        height: '100%', width: 'auto', display: 'block',
        filter: 'drop-shadow(0 12px 16px rgba(0,0,0,0.35))'
      });
      if (fromLeft) img.style.transform = 'scaleX(-1)';
      var gogo = el('div', null, [img]);
      Object.assign(gogo.style, {
        position: 'absolute', bottom: '4px', height: '440px',
        transition: 'transform 0.85s cubic-bezier(.3,1,.4,1)',
        zIndex: '15'
      });
      var offscreen = 'translateX(' + (fromLeft ? '-145%' : '145%') + ')';
      if (fromLeft) gogo.style.left = '30px'; else gogo.style.right = '30px';
      // he MATERIALISES on the spot in GREEN GENIE SMOKE — the same cloud the
      // storytellers vanish in, so arrivals and departures share one magic
      // language. No slide-in: only his EXIT flies out the side.
      gogo.style.opacity = '0';
      s.appendChild(gogo);
      var gc = FX.centerOf(gogo);
      A.playWhoosh();
      FX.smokePoof(gc.x, gc.y - gc.h * 0.3, { count: 16, spread: 150, size: 2 });
      FX.smokePoof(gc.x, gc.y,              { count: 16, spread: 180, size: 2.4 });
      FX.smokePoof(gc.x, gc.y + gc.h * 0.3, { count: 16, spread: 150, size: 2 });
      setTimeout(function () {
        gogo.style.transition = 'opacity 0.45s ease';
        gogo.style.opacity = '1';   // revealed under the cloud as it rolls open
      }, 200);

      setTimeout(function () {
        A.playWhoosh();
        var c = FX.centerOf(gogo), wc = FX.centerOf(wrap);
        var sackX = c.x + (fromLeft ? -0.187 : 0.187) * c.w, sackY = c.y + 0.003 * c.h;   // the red sack
        wrap.style.transition = 'transform 0.75s cubic-bezier(.5,0,.4,1), opacity 0.7s ease';
        wrap.style.transformOrigin = 'center center';
        wrap.style.transform = 'translate(' + (sackX - wc.x) + 'px,' + (sackY - wc.y) + 'px) scale(0.06) rotate(18deg)';
        wrap.style.opacity = '0';
        setTimeout(function () {
          // a soft pop as the object lands in the sack — the sparkle chime
          // ("twii") felt off against the smoke-and-whoosh genie magic
          FX.sparkleBurst(sackX, sackY, { count: 16, spread: 90 }); A.playPop();
          // the bag gives a little "stuffed" bounce...
          gogo.style.transition = 'transform 0.18s ease';
          gogo.style.transform = 'translateY(-10px) scale(1.04)';
          setTimeout(function () { gogo.style.transform = 'translateY(0) scale(1)'; }, 190);
          // ...he shows it off for a beat, then flies away the way he came,
          // sack full — the screen is his exit's to end
          setTimeout(function () {
            A.playWhoosh();
            gogo.style.transition = 'transform 0.75s cubic-bezier(.55,0,.8,.6)';
            gogo.style.transform = offscreen;
            setTimeout(function () { gogo.remove(); resolve(); }, 800);
          }, 700);
        }, 640);
      }, 950);
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
      A.playVO('You did it! 🎉');   // spoken first so the chime ducks under it
      A.playSuccess();

      var col = el('div.center-col');
      col.appendChild(el('div.overlay__title overlay__title--ok', { text: 'You did it! 🎉' }));
      col.appendChild(el('div.overlay__sub', {
        text: sub || ('You found the ' + state.target + '-handspan table.'), style: { color: '#fff' }
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
        // and presents it ("Here are the ..." / "Let us measure ...") before
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
   * Plain pillar candles (Candle.webp) measured by HEIGHT with the SAME
   * drag-the-handspan mechanic as the tables: the child drags hands from
   * the podium into a column beside the candle, bottom-to-top, no gaps.
   * Fixed order: 4 -> 2 -> the 3-span target (bagged last).
   * ====================================================================== */
  // alpha-measured from Candle.webp (like the stand's base edge): body top /
  // bottom / half-width as fractions of the image height & width
  var PILLAR = { src: 'assets/Candle.webp', ar: 1536 / 1024, topF: 0.122, botF: 0.956, sideF: 0.1146 };
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
      introLines: ['Here are the candles.', "Let us measure how tall each candle is."],
      makeNode: function (spans) { return pillarImg(70 * spans); },   // taller candle -> more handspans
                                                                      // (unit sized so even the SHORTEST candle's top clears
                                                                      // the room's wall-floor edge from the shared base line)
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
      var podium = el('img.drag-podium', { src: 'assets/handDrag.webp', alt: '', draggable: 'false' });
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
      // rests in its NORMAL pose on the podium — it flips vertical the moment
      // the player picks it up (see wireDrag's down), so it already reads as
      // a measuring unit while it travels to the column.
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
          // the lifted hand flips vertical RIGHT AWAY (whoosh) — picking it
          // up is the selection; it lands in the column in the same pose
          clone.classList.add('drag-hand--vert');
          A.playWhoosh();
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
        A.playHandPlace(); FX.pulse(clone);   // already vertical since pickup
        if (filled >= spans) setTimeout(finish, 560);
        else armIdle();
      }
      function discardClone(clone) {
        clone.classList.remove('drag-hand--dragging');
        clone.classList.remove('drag-hand--vert');   // rejected: back to the resting pose
        clone.style.transition = 'left 0.2s ease, top 0.2s ease, opacity 0.2s ease';
        clone.style.left = REST.left + 'px'; clone.style.top = REST.top + 'px'; clone.style.opacity = '0';
        setTimeout(function () { clone.remove(); }, 220);
        armIdle();
      }
      var taskPanel = null;   // the standing "Find..." panel (up for the whole measure)
      function finish() {
        alive = false; stopIdle();
        // the standing task panel has served its purpose — clear it so it
        // doesn't collide with Gogo's success panel
        if (taskPanel) { taskPanel.remove(); taskPanel = null; }
        if (curHand) { curHand.remove(); curHand = null; }
        podium.remove();
        FX.celebrate();
        // "Well Done!" -> the stacked hands COUNT OFF beside the column
        // (bottom-to-top, in placement order) -> only then "...N handspans
        // tall!" (holdFirst keeps the first line up until the count is done)
        var countMs = countOff(s, spans, function (ni) {
          return { left: STACK_LEFT - 26, top: BASE_Y - HV * (ni + 1) + HV / 2 - 18 };
        }, { clap: true });
        var readWait = feedback(s, 'success', ['Well Done!', 'The candle is ' + spans + ' handspans tall.'], { holdFirst: countMs });
        h.tapToContinue(readWait).then(function () { opts.onDone(); });
      }

      // staged entrance (matches the table rounds): the candle alone, then
      // the guide lines, then the standing task panel, then the handspan
      FX.wait(1000)
        .then(function () {
          g.reveal();
          A.playWhoosh();
          FX.sparkleBurst(STACK_LEFT - 12, topY, { count: 6, spread: 40, color: '#e11dff' });
          FX.sparkleBurst(CX + BODY_HALF + 24, BASE_Y, { count: 6, spread: 40, color: '#e11dff' });
          return FX.wait(1100);
        })
        .then(function () { return instructStay(s, 'Measure how tall the candle is.').then(function (p) { taskPanel = p; }); })
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
    finaleScreen(config, h, {
      bg: 'play',
      storyLine: 'We need a candle that is ' + pillarState.target + ' handspans tall.',
      items: pillarState.list.map(function (spans) {
        var wrap = pillarImg(45 * spans);
        return {
          spans: spans, node: wrap,
          wrapW: wrap._imgW,
          advW: 2 * PILLAR.sideF * wrap._imgW + 36,   // the candle BODY, not its padded box
          rise: PILLAR.botF * wrap._imgH              // base on the floor line
        };
      }),
      target: pillarState.target,
      glow: 'candle--glow',
      // ... then on to the candle-stand round (4th flow)
      onDone: function () { startCandles(config, h); }
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
  // candleStandClean.webp: cup rim at 0.111 of its height, base at 0.753,
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
      introLines: ['Here are the candle stands.', "Let us measure how tall each candle stand is."],
      makeNode: function (spans) { return candleImg(48 * spans); },   // taller stand -> more handspans
                                                                      // (unit keeps every stand's rim above the wall-floor edge,
                                                                      // and the SMALLEST 3-span stand still clearly readable)
      spansOf: function (spans) { return spans; },
      onPick: function (i) { measureCandle(config, h, i); }
    });
  }

  function measureCandle(config, h, index) {
    playCandleRound(config, h, {
      spans: candleState.list[index],
      firstFlow: candleState.measured.length === 0,   // guided first stand: outlines stay
      onDone: function () {
        candleState.measured.push(index);
        if (candleState.measured.length >= candleState.list.length) candleSuccess(config, h);
        else h.festiveTransition(function () { candleHall(config, h); }, 'Next stand!');
      }
    });
  }

  /* ---- one vertical measure cycle (guess height -> verify) ------------- */
  function playCandleRound(config, h, opts) {
    h.setBackground('cloth');   // the stand GAMEPLAY plays in the Bgm2 room
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
      // soft-focus the room for the whole round so the stand, the guide lines
      // and the hand column are the clear subject (lifted again on the way
      // back to the hall — see guessScreen's success verdict)
      document.getElementById('bg').classList.add('tut-blur');
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

    // Intro demo (every stand's FIRST guess): the cloth preview rotated 90° —
    // the hand climbs the stand base-to-rim, leaving a hand outline behind at
    // each step. Resolves with the outline nodes so the caller decides their
    // fate (first stand: they stay for counting; later stands: they fade).
    function previewMeasureV(layer, count) {
      return new Promise(function (resolve) {
        var imps = [];
        var hand = UI.MeasureHand(HV);
        hand.classList.add('measure-hand--vert');
        Object.assign(hand.style, {
          left: STACK_LEFT + 'px', top: (BASE_Y - HV) + 'px', opacity: '0', zIndex: '24',
          transition: 'top 0.3s cubic-bezier(.4,.02,.3,1), opacity 0.2s ease'
        });
        layer.appendChild(hand);
        A.playWhoosh();
        requestAnimationFrame(function () { hand.style.opacity = '1'; });
        var i = 0;
        function step() {
          var teaching = i < 2;
          UI.playMeasureHand(hand, 1).then(function () {
            A.playPop();
            var imp = UI.HandSpan({ variant: 'faded', w: HV, h: HV, anim: true });
            imp.classList.add('handspan--vert');
            Object.assign(imp.style, { position: 'absolute', left: STACK_LEFT + 'px', top: (BASE_Y - (i + 1) * HV) + 'px' });
            layer.appendChild(imp);
            imps.push(imp);
            i++;
            if (i >= count) { setTimeout(function () { hand.style.opacity = '0'; setTimeout(function () { hand.remove(); resolve(imps); }, 240); }, 220); return; }
            hand.style.top = (BASE_Y - (i + 1) * HV) + 'px';
            setTimeout(step, teaching ? 320 : 180);
          });
        }
        setTimeout(step, 380);
      });
    }

    function guessScreen(retry) {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s, true);
        var panel = null;
        // staged entrance: the stand alone, then the guide lines draw in,
        // then the demo hand measures the WHOLE stand leaving outlines —
        // but only on the round's first guess: after a wrong answer + clue
        // the child comes straight back to the panel + tray, no replay
        var run = FX.wait(1000)
          .then(function () { layer.revealGuide(); return FX.wait(1100); });
        if (!retry) {
          run = run.then(function () { return previewMeasureV(layer, spans); });
          run = run.then(function (imps) {
            if (opts.firstFlow) return;          // 1st stand: outlines stay up for counting
            return fadeImpressions(imps);        // later stands: guess from memory
          });
        }
        // the instruction panel comes in and STAYS for the whole guess —
        // the tray appears once the line has been read
        run = run.then(function () { return instructStay(s, 'Guess how many handspans tall the candle stand is.').then(function (p) { panel = p; }); });
        run = run.then(function () { return h.guessPhase({ answer: spans, keepTray: true }); });
        // the verdict plays on THIS screen: the chosen hands fly out of the
        // tray and stack up the stand ONE BY ONE — each popping its count as
        // it lands — the leftover tray buttons fade away, and only then Gogo
        // delivers his line. The count already happened in flight, so a
        // correct guess goes straight to the clap (see successClap).
        run = run.then(function (g) {
          var good = g.count === spans;
          return measureFromTray(s, g, {
            unit: HV, vert: true,
            slotAt: function (i) { return { left: STACK_LEFT, top: BASE_Y - HV * (i + 1) }; },
            numAt: function (i) { return { left: STACK_LEFT - 26, top: BASE_Y - HV * (i + 1) + HV / 2 - 18 }; }
          }).then(function () { return g.clearRest(); })
            .then(function () { if (panel) { panel.remove(); panel = null; } return FX.wait(300); })
            .then(function () {
              if (good) {
                FX.celebrate();
                // "Hurray!" -> CLAP -> "...N handspans tall."
                return h.tapToContinue(feedback(s, 'success', ['Hurray!', 'This stand is ' + spans + ' handspans tall.'], { holdFirst: successClap() }))
                  .then(function () { document.getElementById('bg').classList.remove('tut-blur'); opts.onDone(); });
              }
              A.playWrong();
              return h.tapToContinue(feedback(s, 'wrong', 'Let us try again.'))
                .then(function () { clueScreen(); });
            });
        });
        return run;
      });
    }
    function clueScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        placeStack(layer, 'solid', null, true);
        // the clue COUNTS the stack: 1..N circles pop in one by one, each
        // beside its hand (below-the-hand would land inside the previous
        // hand in a vertical stack, so they sit just outside the column);
        // the arrow holds until BOTH the line is read and the count is done
        var countMs = countOff(layer, spans, function (i) {
          return { left: STACK_LEFT - 26, top: BASE_Y - HV * (i + 1) + HV / 2 - 18 };
        });
        var readWait = Math.max(feedback(s, 'clue', 'Here is a clue.'), countMs);
        return h.tapToContinue(readWait).then(function () { guessScreen(true); });
      });
    }
    guessScreen();
  }

  /* ---- the target (5-handspan) stand is found; Gogo bags it, then END -- */
  function candleSuccess(config, h) {
    finaleScreen(config, h, {
      bg: 'play',
      storyLine: 'We need a candle stand that is ' + candleState.target + ' handspans tall.',
      items: candleState.list.map(function (spans) {
        var wrap = candleImg(40 * spans);
        return {
          spans: spans, node: wrap,
          wrapW: wrap._imgW,
          advW: wrap._imgW * 0.34 + 24,   // the stand's visible body, not its padded box
          rise: CANDLE.botF * wrap._imgH  // base on the floor line
        };
      }),
      target: candleState.target,
      glow: 'candle--glow',
      // ... candle stands are the LAST round -> the grand finale
      onDone: function () { endScreen(config, h, 'You found the ' + candleState.target + '-handspan candle stand.'); }
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
      introLines: ['Here are the tablecloths.', "Let us measure how long each tablecloth is."],
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
      showPreview: clothState.measured.length === 0,   // guided first cloth: outlines stay + answer hint
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

    // Intro demo (every cloth's FIRST guess): the hand measures the WHOLE
    // cloth, edge to edge — each stretch leaves a hand outline behind as the
    // hand moves on. Resolves with the outline nodes so the caller decides
    // their fate: the first cloth keeps them up for counting, later cloths
    // fade them away so the child answers from memory.
    // Every span plays the full stretch at natural speed (a rushed stretch is
    // unreadable); only the hop between slots tightens after the first two.
    function previewMeasure(layer, count) {
      return new Promise(function (resolve) {
        var imps = [];
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
            var imp = UI.HandSpan({ variant: 'faded', w: HW, h: HW, anim: true });
            Object.assign(imp.style, { position: 'absolute', left: (TRACK_X0 + i * HW) + 'px', top: HAND_TOP + 'px' });
            layer.appendChild(imp);
            imps.push(imp);
            i++;
            if (i >= count) { setTimeout(function () { hand.style.opacity = '0'; setTimeout(function () { hand.remove(); resolve(imps); }, 240); }, 220); return; }
            hand.style.left = (TRACK_X0 + i * HW) + 'px';
            setTimeout(step, teaching ? 320 : 180);
          });
        }
        setTimeout(step, 380);
      });
    }

    function guessScreen(retry) {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s, true);
        var panel = null;
        // staged entrance: the cloth alone, then the guide lines drop in
        var run = FX.wait(1000);
        run = run.then(function () { layer.revealGuide(); return FX.wait(1100); });
        // the demo sweeps the FULL width leaving outlines behind — but only
        // on the round's first guess: after a wrong answer + clue the child
        // comes straight back to the panel + tray, no replay
        if (!retry) {
          run = run.then(function () { return previewMeasure(layer, spans); });
          run = run.then(function (imps) {
            if (opts.showPreview) return;        // 1st cloth: outlines stay up for counting
            return fadeImpressions(imps);        // later cloths: guess from memory
          });
        }
        // the instruction panel comes in and STAYS for the whole guess —
        // the tray appears once the line has been read
        run = run.then(function () { return instructStay(s, 'Guess how long the tablecloth is.').then(function (p) { panel = p; }); });
        run = run.then(function () { return h.guessPhase({ answer: spans, hintAnswer: opts.showPreview, keepTray: true }); });
        // the verdict plays on THIS screen: the chosen hands fly out of the
        // tray onto the cloth's bottom edge ONE BY ONE — each popping its
        // count as it lands — the leftover tray buttons fade away, and only
        // then Gogo delivers his line. The count already happened in flight,
        // so a correct guess goes straight to the clap (see successClap).
        run = run.then(function (g) {
          var good = g.count === spans;
          return measureFromTray(s, g, {
            unit: HW, vert: false,
            slotAt: function (i) { return { left: TRACK_X0 + i * HW, top: HAND_TOP }; },
            numAt: function (i) { return { left: TRACK_X0 + i * HW + HW / 2, top: HAND_TOP + HW + 6 }; }
          }).then(function () { return g.clearRest(); })
            .then(function () { if (panel) { panel.remove(); panel = null; } return FX.wait(300); })
            .then(function () {
              if (good) {
                FX.celebrate();
                // "Hurray!" -> CLAP -> "...N handspans wide."
                return h.tapToContinue(feedback(s, 'success', ['Hurray!', 'This cloth is ' + spans + ' handspans wide.'], { holdFirst: successClap() }))
                  .then(function () { opts.onDone(); });
              }
              A.playWrong();
              return h.tapToContinue(feedback(s, 'wrong', 'Let us try again.'))
                .then(function () { clueScreen(); });
            });
        });
        return run;
      });
    }
    function clueScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s);
        placeRow(layer, 'solid', null, true);
        // the clue COUNTS the row: 1..N circles pop in one by one BELOW the
        // hands, so the child reads the answer straight off the screen;
        // the arrow holds until BOTH the line is read and the count is done
        var countMs = countOff(layer, spans, function (i) {
          return { left: TRACK_X0 + i * HW + HW / 2, top: HAND_TOP + HW + 6 };
        });
        var readWait = Math.max(feedback(s, 'clue', 'Here is a clue.'), countMs);
        return h.tapToContinue(readWait).then(function () { guessScreen(true); });
      });
    }
    guessScreen();
  }

  /* ---- the target (8-handspan, blue) cloth is found; Gogo bags it ------ */
  function clothSuccess(config, h) {
    finaleScreen(config, h, {
      bg: 'cloth',
      vignette: false,   // keep the Bgm2 cloth room plain
      storyLine: 'We need a tablecloth that is ' + CLOTH_TARGET + ' handspans long.',
      items: CLOTHS.map(function (a) {
        var wrap = clothImg(a, 22 * a.spans);
        return { spans: a.spans, node: wrap, wrapW: wrap._imgW, advW: wrap._imgW, rise: wrap._imgH };
      }),
      target: clothState.target,
      glow: 'cloth--glow',
      // ... then on to the candle round (3rd flow: vertical DRAG measuring)
      onDone: function () { startPillars(config, h); }
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
