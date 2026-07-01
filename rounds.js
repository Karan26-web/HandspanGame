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
  // foot = fraction of the artwork's HEIGHT where the legs meet the floor
  // (measured opaque). Green/pink SVGs have ~16% transparent padding below the
  // legs, so we anchor by foot to keep every table standing ON the ground.
  var TABLE_ART = [
    { src: 'assets/Table.svg',  ratio: 350 / 662, name: 'brown', e0: 0.0288, e1: 0.9663, foot: 0.991 },
    { src: 'assets/Table2.svg', ratio: 335 / 567, name: 'green', e0: 0.055,  e1: 0.940,  foot: 0.839 },
    { src: 'assets/Table3.svg', ratio: 468 / 772, name: 'pink',  e0: 0.0625, e1: 0.9337, foot: 0.835 }
  ];
  function art(i) { return TABLE_ART[i % TABLE_ART.length]; }

  // persistent state for the hall loop (reset each time we enter it)
  var state = null;

  /* ---- a Gogo instruction panel (avatar + purple bar), wait for a tap --- */
  function sayGogo(h, s, text) {
    var b = UI.TutorialBubble({ who: 'gogo', text: text });
    Object.assign(b.style, { left: '50%', top: '18px', transform: 'translateX(-50%)' });
    s.appendChild(b);
    A.playDialogue();
    return h.tapToContinue().then(function () { b.remove(); });
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
    hall(config, h);
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

      // each table has its own artwork (Table / Table2 / Table3)
      var cards = state.tables.map(function (t, i) {
        var card = el('div.hall-card', { dataset: { idx: String(i) } });
        var table = UI.Table({ w: 360, src: art(i).src, ratio: art(i).ratio });
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
        if (document.body.contains(nudge)) { nudge.style.display = ''; A.playPop(); }
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
        else hall(config, h);   // back to the hall; measured ones are disabled
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
    var GUIDE_H = HW + 56;

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
    function placeTrack(layer, variant, numbered, count) {
      var n = count != null ? count : spans;
      var nodes = [];
      for (var i = 0; i < n; i++) {
        var node = UI.HandSpan({ variant: variant, w: HW, h: HW });
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

    // full-body genie + a purple message panel (feedback screens)
    function feedback(s, who, text) {
      var src = who === 'success' ? 'assets/successGogo.webp'
              : who === 'wrong' ? 'assets/wrongGogo.svg'
              : 'assets/ShowingGogo.png';
      // genie stands left for success/clue, right for wrong; the bubble sits on
      // the same side with its tail pointing down at the genie
      var onRight = who === 'wrong';
      var gogo = el('img.feedback-gogo feedback-gogo--' + who + ' ' + (onRight ? 'feedback-gogo--right' : 'feedback-gogo--left'), { src: src, alt: '', draggable: 'false' });
      s.appendChild(gogo);
      var panel = UI.FeedbackBubble(text, onRight ? 'right' : 'left');
      s.appendChild(panel);
      A.playDialogue();
    }

    /* ---- guess (no heading; faded track; check appears on selection) --- */
    function guessScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s, null);

        var run = Promise.resolve();
        run = run.then(function () {
          // faded "ghost" track — only shown for the FIRST table the player measures
          if (opts.showFaded) { placeTrack(layer, 'faded', false); A.playPop(); }
          return FX.wait(250);
        });
        run = run.then(function () { return h.guessPhase({ answer: spans, hintAnswer: opts.showFaded }); });
        run = run.then(function (sel) {
          if (sel === spans) successScreen();
          else wrongScreen(sel);
        });
        return run;
      });
    }

    /* ---- correct: fly the numbered hands in + Hurray (successGogo) ----- */
    function successScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s, null);
        var slots = placeTrack(layer, 'guide', true);   // numbered slots to fill

        return FX.wait(400)
          .then(function () { return h.measureFly({ slots: slots, unit: HW }); })
          .then(function () {
            FX.celebrate();
            feedback(s, 'success', 'Hurray! The ' + opts.name + ' table is ' + spans + ' handspans long.');
            return h.tapToContinue();
          })
          .then(function () { opts.onDone(); });
      });
    }

    /* ---- wrong: measure the player's GUESS (hands fly in) -> try again ---- *
     * We animate exactly as many hands as the player guessed (not the table's
     * true length), so a wrong guess visibly falls short of / overshoots the
     * end line before Gogo says "Let us try again." */
    function wrongScreen(guess) {
      var count = Math.max(1, guess || spans);
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s, null);
        var slots = placeTrack(layer, 'guide', false, count);   // slots = the guess

        return FX.wait(400)
          .then(function () { return h.measureFly({ slots: slots, unit: HW }); })
          .then(function () {
            A.playWrong();
            feedback(s, 'wrong', 'Let us try again.');
            return h.tapToContinue();
          })
          .then(function () { clueScreen(); });
      });
    }

    /* ---- clue: "Here is a clue. It should look like this." (ShowingGogo) */
    function clueScreen() {
      h.transitionTo(function () {
        var s = h.scene();
        var layer = buildStage(s, null);
        placeTrack(layer, 'solid', true);   // the correct, numbered answer
        feedback(s, 'clue', 'Here is a clue. It should look like this.');
        return h.tapToContinue().then(function () { guessScreen(); });   // try again
      });
    }

    guessScreen();
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
      run = run.then(function () { endScreen(config, h); });
      return run;
    });
  }

  // Gogo flies in with his sack and the table goes inside
  function sackAnim(h, s, wrap) {
    return new Promise(function (resolve) {
      var gogo = UI.Gogo({ sack: true });
      Object.assign(gogo.style, { right: '40px', bottom: '20px', transform: 'translateX(120%)', transition: 'transform 0.6s ease', zIndex: '15' });
      s.appendChild(gogo);
      requestAnimationFrame(function () { gogo.style.transform = 'translateX(0)'; });

      setTimeout(function () {
        A.playWhoosh();
        var c = FX.centerOf(gogo), wc = FX.centerOf(wrap);
        wrap.style.transition = 'transform 0.7s cubic-bezier(.4,1,.4,1), opacity 0.7s ease';
        wrap.style.transformOrigin = 'center center';
        var dx = c.x - wc.x + 40, dy = c.y - wc.y - 20;
        wrap.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(0.1) rotate(20deg)';
        wrap.style.opacity = '0';
        setTimeout(function () { FX.sparkleBurst(c.x, c.y, { count: 14, spread: 90 }); A.playSparkle(); }, 600);
      }, 800);

      setTimeout(function () {
        h.dialogue({
          who: 'none', text: 'Perfect! Into the sack it goes!',
          bubbleStyle: { position: 'absolute', right: '70px', top: '80px' }, autoMs: 1600
        }).then(resolve);
      }, 1700);
    });
  }

  /* ====================================================================== *
   * END
   * ====================================================================== */
  function endScreen(config, h) {
    h.transitionTo(function () {
      var s = h.scene();
      FX.confetti({ count: 140 });
      A.playSuccess();

      var col = el('div.center-col');
      col.appendChild(el('div.overlay__title overlay__title--ok', { text: 'You did it! 🎉' }));
      col.appendChild(el('div.overlay__sub', {
        text: 'You found the ' + state.target + '-handspan table!', style: { color: '#fff' }
      }));
      col.appendChild(UI.Button('Play Again', { variant: 'play', onClick: function () { HS.Game.start(); } }));
      s.appendChild(col);

      var gogo = UI.Gogo({ sack: true });
      Object.assign(gogo.style, { right: '60px', bottom: '20px' });
      s.appendChild(gogo);

      var trickle = setInterval(function () {
        if (!document.body.contains(col)) { clearInterval(trickle); return; }
        FX.confetti({ count: 18 });
      }, 1400);
      return null;
    });
  }

  return {
    startHall: startHall
  };
})();
