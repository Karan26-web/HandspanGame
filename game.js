/* ============================================================================
 * game.js  —  state machine, intro, table-selection carousel + SHARED phases
 * ----------------------------------------------------------------------------
 * Shared phases (reused by tutorial.js and rounds.js):
 *   HS.Game.buildMeasureScene()  -> standard "table + measuring lane" layout
 *   HS.Game.guessPhase()         -> the tap-to-count guessing mini-game
 *   HS.Game.measureFly()         -> handspans fly up & snap onto the table
 *   HS.Game.wellDone()           -> celebratory "Well Done!" with Gogo
 *   HS.Game.dialogue()           -> show character + speech bubble, await tap
 * ========================================================================== */
window.HS = window.HS || {};

HS.Game = (function () {
  'use strict';

  var UI = HS.UI, FX = HS.FX, A = HS.Audio;
  var el = UI.el;

  /* ---- State registry --------------------------------------------------- */
  var STATE = {
    INTRO: 'STATE_INTRO',
    TABLE_SELECTION: 'STATE_TABLE_SELECTION',
    TUTORIAL: 'STATE_TUTORIAL',
    ROUND1: 'STATE_ROUND1',
    ROUND2: 'STATE_ROUND2',
    FINAL: 'STATE_FINAL',
    END: 'STATE_END'
  };

  // Round configuration. Tutorial=5, Round1=8, Round2=6 (the 6-span target
  // is measured last, then bagged). The final scene asks for the 6-span table.
  var CONFIG = {
    tutorialSpans: 5,
    round1Spans: 8,
    round2Spans: 6,
    finalTarget: 6,
    // table lengths (all use the same brown Table.webp, scaled by span count):
    //   0 -> 6 spans (target)   1 -> 5 spans (tutorial, then disabled)   2 -> 8 spans
    finalTables: [
      { spans: 6 },
      { spans: 5 },
      { spans: 8 }
    ]
  };

  var current = null;

  function scene() { return document.getElementById('scene'); }
  function fx() { return document.getElementById('fx'); }

  /* ---- background control ---------------------------------------------- */
  function setBackground(kind) {
    var bg = document.getElementById('bg');
    var mod = kind === 'castle' ? 'bg--castle'
            : kind === 'cloth' ? 'bg--cloth'
            : kind === 'single' ? 'bg--single'
            : 'bg--play';
    bg.className = 'bg ' + mod;
  }

  /* ---- spotlight (dim + blur) ------------------------------------------ */
  function spotlightOn() {
    var s = document.getElementById('spotlight');
    s.classList.remove('hidden');
  }
  function spotlightOff() {
    var s = document.getElementById('spotlight');
    s.classList.add('hidden');
    // demote any promoted elements
    Array.prototype.forEach.call(document.querySelectorAll('.spot-on'), function (n) {
      n.classList.remove('spot-on');
    });
  }
  function promote(node) { if (node) node.classList.add('spot-on'); }

  /* ---- scene transition ------------------------------------------------- */
  // Fade the current scene out, clear, run builder, fade in.
  function transitionTo(builder) {
    var s = scene();
    s.style.transition = 'opacity 0.6s ease';
    s.style.opacity = '0';
    return FX.wait(600).then(function () {
      UI.clear(s);
      spotlightOff();
      s.style.opacity = '0';
      var out = builder();
      // force reflow then fade in
      void s.offsetWidth;
      s.style.opacity = '1';
      return out;
    });
  }

  /* ---- standalone tap-to-continue gate (keeps current scene on screen) -- */
  // reading time for a line of on-screen text (same pacing as auto-advanced
  // dialogue) — callers pass this to tapToContinue as the arrow's hold-back
  // matches rounds.js lineMs — unhurried pacing for early readers
  function readMs(text) { return Math.max(3400, 1500 + String(text).split(/\s+/).length * 350); }
  // `delayMs` holds the arrow (and its tap catcher) back until the scene's
  // content has actually played out / been read — the button must never pop
  // in together with the objects it invites the child to move on from.
  function tapToContinue(delayMs) {
    return new Promise(function (resolve) {
      var s = scene();
      var catcher = el('div.tap-catcher');
      var btn = UI.NextButton();
      var advance = function () {
        A.playClick();
        catcher.remove();
        btn.remove();
        resolve();
      };
      catcher.addEventListener('click', advance);
      btn.addEventListener('click', advance);
      setTimeout(function () {
        s.appendChild(catcher);
        s.appendChild(btn);
      }, Math.max(0, delayMs || 0));
    });
  }

  /* ---- title card (e.g. "Tutorial", "Round 1") ------------------------- */
  function showTitleChip(text, ms) {
    var chip = UI.TitleChip(text);
    scene().appendChild(chip);
    A.playPop();
    return FX.wait(ms || 1200).then(function () {
      chip.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      chip.style.opacity = '0';
      chip.style.transform = 'translate(-50%,-50%) scale(1.3)';
      return FX.wait(420).then(function () { chip.remove(); });
    });
  }

  /* ======================================================================
   * FESTIVE TRANSITION SCREEN  (golden-sand vortex — sand-portal.js)
   * A whirlpool of golden sand spirals in, fully covers the stage, and
   * spirals back out. `build` runs at the portal's PEAK (screen fully
   * covered), so the scene swap is hidden. Resolves when the reveal ends.
   * (`caption` is unused — the portal carries no text.)
   * ====================================================================== */
  function festiveTransition(build, caption) {
    if (typeof playSandTransition === 'undefined') {   // graceful fallback
      if (build) build();
      return Promise.resolve();
    }
    A.playWhoosh();                                     // the sand awakens
    setTimeout(function () { A.playSparkle(); }, 1150); // shimmer at the covered peak
    return playSandTransition(function () { if (build) build(); }, {
      duration: 2.6,
      spins: 2.6,
      density: 'regular',
      zIndex: 400,
      target: document.getElementById('stage')          // cover the game stage, scale with it
    });
  }

  /* ======================================================================
   * DIALOGUE
   * Shows a character (gogo|tara) + a speech bubble, types the text, then
   * shows a "Tap to continue" pill and resolves when tapped.
   * opts: { speaker, text, who('gogo'|'tara'|'none'), side, container,
   *         persistChar(bool), autoMs(number) }
   * ====================================================================== */
  function dialogue(opts) {
    opts = opts || {};
    var host = opts.container || scene();
    A.playVO(opts.text);

    // character (position can be overridden per-scene via opts.charStyle)
    var charNode = null;
    if (opts.who === 'gogo') {
      charNode = UI.Gogo({ sack: opts.sack });
      Object.assign(charNode.style, opts.charStyle || { right: '60px', bottom: '40px' });
      host.appendChild(charNode);
    } else if (opts.who === 'tara') {
      charNode = UI.Tara();
      Object.assign(charNode.style, opts.charStyle || { left: '70px', bottom: '20px' });
      host.appendChild(charNode);
    }

    // Purple panel styling (matches the PanelwGogo art), no speaker label.
    var bubble = UI.SpeechBubble({ text: '', side: opts.side || 'left', purple: true });
    Object.assign(bubble.style, opts.bubbleStyle || { position: 'absolute', left: '50%', top: '90px', transform: 'translateX(-50%)' });
    host.appendChild(bubble);

    return UI.typeInto(bubble, opts.text, 42).then(function () {
      return new Promise(function (resolve) {
        var done = function () {
          if (charNode && !opts.persistChar) charNode.remove();
          bubble.remove();
          resolve();
        };
        if (opts.autoMs) {
          setTimeout(done, opts.autoMs);
        } else {
          // Pulsing arrow button invites the tap; tapping anywhere also
          // advances (kid-friendly catcher behind it).
          var catcher = el('div.tap-catcher');
          var btn = UI.NextButton();
          host.appendChild(catcher);
          host.appendChild(btn);
          var advance = function () {
            A.playClick();
            catcher.remove();
            btn.remove();
            done();
          };
          catcher.addEventListener('click', advance);
          btn.addEventListener('click', advance);
        }
      });
    });
  }

  /* ======================================================================
   * BUILD MEASURE SCENE
   * Standard layout: a table centered high on screen with a scalloped
   * measuring lane along its front edge. Returns handles for the phases.
   * opts: { count, tableW, heading }
   * ====================================================================== */
  function buildMeasureScene(opts) {
    opts = opts || {};
    var count = opts.count;
    var tableW = opts.tableW || 560;
    var s = scene();

    // darken the periphery so the central table + hands pop
    s.appendChild(UI.Vignette());

    if (opts.heading) s.appendChild(UI.Heading(opts.heading));

    // table
    var table = UI.Table({ w: tableW });
    var tableH = tableW * (350 / 662);
    var tableLeft = (FX.STAGE_W - tableW) / 2;
    var tableTop = 150;
    Object.assign(table.style, { position: 'absolute', left: tableLeft + 'px', top: tableTop + 'px', zIndex: '5' });
    s.appendChild(table);

    // measuring lane along the front edge of the tabletop (square hand units)
    var edgeRatio = 0.90;
    var unit = (tableW * edgeRatio) / count;
    var strip = UI.MeasuringStrip(count, { unit: unit, h: unit });
    var laneW = unit * count + 8; // + ticks
    var laneLeft = (FX.STAGE_W - laneW) / 2;
    var laneTop = tableTop + tableH * 0.40; // sits on the front edge
    Object.assign(strip.lane.style, { position: 'absolute', left: laneLeft + 'px', top: laneTop + 'px' });
    s.appendChild(strip.lane);

    return {
      table: table, tableRect: { left: tableLeft, top: tableTop, w: tableW, h: tableH },
      slots: strip.slots, lane: strip.lane, unit: unit, count: count
    };
  }

  /* ======================================================================
   * GUESS PHASE  (tap to count)
   * opts: { answer, hintAnswer(bool), keepTray(bool) }
   * Builds the bottom tray and lets the player pick a count.
   * Default: the tray tears itself down and the promise resolves with the
   * chosen count (the round then shows its verdict on a fresh screen).
   * keepTray: the guess is judged on the SAME screen — resolves with a
   * handle { count, liftHand(i), clearRest() } so the round can fly the
   * chosen hands onto the measuring track (liftHand empties tray cell i and
   * returns its stage centre) and then fade the leftover cells away.
   * ====================================================================== */
  function guessPhase(opts) {
    opts = opts || {};
    var answer = opts.answer;
    var s = scene();
    HS._currentAnswer = answer; // internal aid (also used by automated tests)

    // a generous tray so the answer is never the last cell
    var trayCount = Math.max(answer + 4, 10);
    var unit = 72;
    var tray = el('div.guess-tray');
    var cells = [];
    var committed = false;
    var resolveGuess = null;

    // Hovering the Nth cell highlights the WHOLE run 1..N (so the child sees
    // "if I pick 5, that's these five handspans"), not just the hovered one.
    function highlightUpTo(idx) {
      cells.forEach(function (c, j) {
        if (j <= idx) {
          UI.setHandSpan(c.hs, 'solid', j + 1);
          c.cell.classList.add('guess-cell--lit');
        } else {
          c.hs.dataset.variant = 'guide';
          c.cell.classList.remove('guess-cell--lit');
          var b = c.hs.querySelector('.handspan__num'); if (b) b.remove();
        }
      });
    }
    function clearHighlight() {
      cells.forEach(function (c) {
        c.hs.dataset.variant = 'guide';
        c.cell.classList.remove('guess-cell--lit');
        var b = c.hs.querySelector('.handspan__num'); if (b) b.remove();
      });
    }

    for (var i = 0; i < trayCount; i++) {
      (function (idx) {
        var cell = el('div.guess-cell');
        var hs = UI.HandSpan({ variant: 'guide', w: unit, h: unit });
        cell.appendChild(hs);
        cell.addEventListener('click', function () { onCellTap(idx); });
        // HOVER (not tap) reveals the cumulative run 1..idx+1
        cell.addEventListener('mouseenter', function () {
          if (committed) return;
          A.playHover();
          highlightUpTo(idx);
        });
        cells.push({ cell: cell, hs: hs });
        tray.appendChild(cell);
      })(i);
    }
    // clear the run only when the pointer leaves the whole tray (no flicker
    // while sliding between cells)
    tray.addEventListener('mouseleave', function () { if (!committed) clearHighlight(); });
    s.appendChild(tray);

    // Hand-nudge hints which number to tap. On the guided first flow the SMALL
    // tap cursor presses the correct (glowing) answer cell, its FINGERTIP
    // anchored dead-centre on the cell (the art's tip sits at 30%/20% of the
    // image — the same anchor the tap-pop press animation pivots on), so the
    // pointing is exact; otherwise it just invites a tap from below.
    var nudge = UI.HandNudge();
    if (opts.hintAnswer && cells[answer - 1]) {
      var hostCell = cells[answer - 1].cell;
      hostCell.style.position = 'relative';
      hostCell.classList.add('guess-cell--hint');   // precise pulsing glow on the answer
      nudge.classList.add('hand-nudge--tap');       // 45px tap cursor, tip-anchored press
      // fingertip offset: 45px * 30% ≈ 13px, (45px * 358/254) * 20% ≈ 13px
      Object.assign(nudge.style, { left: '-13px', top: '-13px' });
      var wrap = el('div', { style: { position: 'absolute', left: '50%', top: '50%', zIndex: '29' } });
      wrap.appendChild(nudge);
      hostCell.appendChild(wrap);
    } else {
      nudge.classList.add('hand-nudge--tap');
      var wrapC = el('div', { style: { position: 'absolute', left: '50%', bottom: '4px', transform: 'translateX(-50%)', zIndex: '29' } });
      wrapC.appendChild(nudge);
      s.appendChild(wrapC);
    }
    // the nudge only appears once the player has been idle for ~3s
    UI.idleNudge(nudge);

    // No "Check" button. Tapping a number IS the guess: the chosen count of
    // hands fills in ONE BY ONE (not all at once), then we resolve so the
    // caller (playRound) can show the success / try-again+clue feedback.
    function onCellTap(idx) {
      if (committed) return;
      committed = true;
      var count = idx + 1;
      if (nudge.parentNode) nudge.parentNode.remove();
      // the tap commits the guess: the hover-preview numbers come off the
      // tray — counting happens on the track as the hands land, not here
      cells.forEach(function (c) {
        c.cell.classList.remove('guess-cell--hint', 'guess-cell--lit');
        var b = c.hs.querySelector('.handspan__num'); if (b) b.remove();
      });
      tray.style.pointerEvents = 'none';

      // the commit is INSTANT: the chosen run lights up together with ONE pop
      // and the measuring flight begins right away. A per-hand drumroll here
      // (pop-pop-pop before anything moves) only delays the payoff — the
      // one-by-one counting beat belongs to the track, where the hands land.
      for (var j = 0; j < count; j++) UI.setHandSpan(cells[j].hs, 'solid');
      A.playPop();
      setTimeout(function () {
        if (!opts.keepTray) { tray.remove(); resolveGuess(count); return; }
        resolveGuess({
          count: count,
          // lift tray hand i off its cell: the cell keeps its footprint
          // (no tray reflow) while the hand itself flies to the track
          liftHand: function (i) {
            var c = cells[i];
            var p = FX.centerOf(c.hs);
            c.hs.style.visibility = 'hidden';
            return p;
          },
          // the extra (unselected) handspan buttons bow out together
          clearRest: function () {
            tray.style.transition = 'opacity 0.4s ease';
            tray.style.opacity = '0';
            return new Promise(function (r) { setTimeout(function () { tray.remove(); r(); }, 420); });
          }
        });
      }, 260);
    }

    return new Promise(function (resolve) { resolveGuess = resolve; });
  }

  /* ======================================================================
   * OOPS OVERLAY  (reusable, friendly)
   * opts: { title, sub, tryAgain(bool, default true) }
   * Resolves when "Try Again" tapped (or after autoMs if no button).
   * ====================================================================== */
  function showOops(opts) {
    opts = opts || {};
    var ov = el('div.overlay');
    ov.appendChild(el('div.overlay__title overlay__title--bad', { text: opts.title || 'Oops! …' }));
    if (opts.sub) ov.appendChild(el('div.overlay__sub', { text: opts.sub }));
    scene().appendChild(ov);
    return new Promise(function (resolve) {
      var btn = UI.Button('Try Again!', {
        variant: 'play',
        onClick: function () { ov.remove(); resolve(); }
      });
      ov.appendChild(btn);
    });
  }

  /* ======================================================================
   * MEASURE-FLY PHASE
   * Handspans fly one-by-one from the bottom of the screen and snap onto
   * the table slots (edge-to-edge), with whoosh + bounce. Then resolves.
   * opts: { slots, unit }
   * ====================================================================== */
  // Per the game sketches: the handspans FLY IN one by one from the bottom of
  // the screen up to their spot along the table's edge and stay put (solid).
  // Nothing faded is pre-placed or left behind here — faded impressions are a
  // tutorial-only teaching device. `slots` are pre-placed (hidden) anchor nodes
  // already sitting at their final positions.
  function measureFly(opts) {
    var slots = opts.slots;
    if (!slots || !slots.length) return Promise.resolve();

    return new Promise(function (resolve) {
      var i = 0;
      function flyNext() {
        if (i >= slots.length) { setTimeout(resolve, 220); return; }
        var slot = slots[i];
        // start off the bottom of the screen, then glide up onto its spot
        slot.style.transformOrigin = 'center bottom';
        slot.style.transition = 'none';
        slot.style.transform = 'translateY(360px) scale(0.62)';
        slot.style.opacity = '0';
        void slot.offsetWidth;                    // commit the start state
        slot.style.transition = 'transform 0.5s cubic-bezier(.25,1.35,.45,1), opacity 0.28s ease';
        A.playWhoosh();
        slot.style.opacity = '1';
        slot.style.transform = 'translateY(0) scale(1)';
        setTimeout(function () {
          var c = FX.centerOf(slot);
          A.playPop(); FX.pulse(slot);
          FX.sparkleBurst(c.x, c.y, { count: 7, spread: 48, color: '#bfe39a' });
        }, 500);
        i++;
        setTimeout(flyNext, 560);
      }
      setTimeout(flyNext, 300);
    });
  }

  /* ======================================================================
   * WELL DONE
   * Gogo appears with a celebratory line + confetti. Resolves on tap.
   * opts: { count }
   * ====================================================================== */
  function wellDone(opts) {
    opts = opts || {};
    FX.celebrate();
    return dialogue({
      who: 'gogo',
      speaker: 'Gogo',
      text: 'Well Done! The table is ' + opts.count + ' handspans long.',
      side: 'right',
      bubbleStyle: { position: 'absolute', right: '80px', top: '70px' }
    });
  }

  /* ======================================================================
   * STATE 1 — INTRO  (welcome screens, per the Figma start screen)
   * Blurred room + genie centred + big purple panel. Two lines, then we
   * move on to the table-selection screen.
   * ====================================================================== */
  function intro() {
    current = STATE.INTRO;
    setBackground('play');
    return transitionTo(function () {
      var s = scene();
      var bgEl = document.getElementById('bg');
      bgEl.classList.add('tut-blur');

      // genie, centred (the art's visible body is offset inside its frame, so
      // left is chosen to put the VISIBLE centre exactly on stage centre)
      var genie = UI.Gogo();
      Object.assign(genie.style, { left: '362px', top: '78px', width: '520px', zIndex: '10' });
      s.appendChild(genie);

      // no Next button on the welcome screen — the panel holds for its
      // reading time and the flow moves on by itself
      function welcome(text) {
        var p = UI.WelcomePanel(text);
        s.appendChild(p);
        A.playVO(text);
        return FX.wait(readMs(text) + 600).then(function () { p.remove(); });
      }

      var seq = FX.wait(150);
      seq = seq.then(function () { return welcome('Welcome to the Hall of Helpful Things!'); });
      seq = seq.then(function () {
        bgEl.classList.remove('tut-blur');
        // the tutorial shows the three tables, focuses the 5-span one, and runs
        // the guided drag lesson on it; the remaining tables follow in the hall
        HS.Tutorial.start(CONFIG, hooks);
      });
      return seq;
    });
  }

  /* ---- flow hooks passed to tutorial / rounds -------------------------- */
  // Lets tutorial.js and rounds.js advance the machine without circular refs.
  var hooks = {
    config: CONFIG,
    STATE: STATE,
    scene: scene,
    setBackground: setBackground,
    transitionTo: transitionTo,
    festiveTransition: festiveTransition,
    showTitleChip: showTitleChip,
    tapToContinue: tapToContinue,
    readMs: readMs,
    dialogue: dialogue,
    buildMeasureScene: buildMeasureScene,
    guessPhase: guessPhase,
    measureFly: measureFly,
    wellDone: wellDone,
    showOops: showOops,
    spotlightOn: spotlightOn,
    spotlightOff: spotlightOff,
    promote: promote,
    // after the tutorial, enter the pick-a-table-to-measure "hall"
    startHall: function () { HS.Rounds.startHall(CONFIG, hooks); }
  };

  /* ---- public entry ----------------------------------------------------- */
  function start() {
    intro();
  }

  return {
    STATE: STATE,
    CONFIG: CONFIG,
    start: start,
    intro: intro,
    hooks: hooks
  };
})();
