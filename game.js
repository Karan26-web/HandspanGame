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

  // Round configuration. Tutorial=4, Round1=8, Round2=6 (per the PDF table
  // and the explicit brief). The final scene asks for the 6-handspan table.
  var CONFIG = {
    tutorialSpans: 4,
    round1Spans: 8,
    round2Spans: 6,
    finalTarget: 6,
    // table lengths in the hall (index maps to artwork in rounds.js):
    //   0 -> wooden (Table.svg)  = 6 spans  (the target)
    //   1 -> pink   (Table2.svg) = 5 spans
    //   2 -> green  (Table3.svg) = 4 spans
    finalTables: [
      { spans: 6 },
      { spans: 5 },
      { spans: 4 }
    ]
  };

  var current = null;

  function scene() { return document.getElementById('scene'); }
  function fx() { return document.getElementById('fx'); }

  /* ---- background control ---------------------------------------------- */
  function setBackground(kind) {
    var bg = document.getElementById('bg');
    bg.className = 'bg ' + (kind === 'castle' ? 'bg--castle' : 'bg--play');
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
    s.style.transition = 'opacity 0.32s ease';
    s.style.opacity = '0';
    return FX.wait(320).then(function () {
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
  function tapToContinue() {
    return new Promise(function (resolve) {
      var s = scene();
      var catcher = el('div.tap-catcher');
      var hint = el('div.tap-hint', { text: 'tap to continue' });
      s.appendChild(catcher);
      s.appendChild(hint);
      catcher.addEventListener('click', function () {
        A.playClick();
        catcher.remove();
        hint.remove();
        resolve();
      });
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
   * DIALOGUE
   * Shows a character (gogo|tara) + a speech bubble, types the text, then
   * shows a "Tap to continue" pill and resolves when tapped.
   * opts: { speaker, text, who('gogo'|'tara'|'none'), side, container,
   *         persistChar(bool), autoMs(number) }
   * ====================================================================== */
  function dialogue(opts) {
    opts = opts || {};
    var host = opts.container || scene();
    A.playDialogue();

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
          // No button: tapping anywhere advances. A subtle hint invites it.
          var catcher = el('div.tap-catcher');
          var hint = el('div.tap-hint', { text: 'tap to continue' });
          host.appendChild(catcher);
          host.appendChild(hint);
          catcher.addEventListener('click', function () {
            A.playClick();
            catcher.remove();
            hint.remove();
            done();
          });
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
   * opts: { answer, mountHeading(bool), onResult(correctBool) }
   * Builds the bottom tray, lets the player select cells, and judges on
   * "Check my guess". Returns a Promise<boolean> (true if correct).
   * ====================================================================== */
  function guessPhase(opts) {
    opts = opts || {};
    var answer = opts.answer;
    var s = scene();
    HS._currentAnswer = answer; // internal aid (also used by automated tests)

    // a generous tray so the answer is never the last cell
    var trayCount = Math.max(answer + 4, 10);
    var unit = 84;
    var tray = el('div.guess-tray');
    var cells = [];
    var committed = false;
    var resolveGuess = null;

    for (var i = 0; i < trayCount; i++) {
      (function (idx) {
        var cell = el('div.guess-cell');
        var hs = UI.HandSpan({ variant: 'guide', w: unit, h: unit });
        cell.appendChild(hs);
        cell.addEventListener('click', function () { onCellTap(idx); });
        cell.addEventListener('mouseenter', function () { if (!committed) A.playHover(); });
        cells.push({ cell: cell, hs: hs });
        tray.appendChild(cell);
      })(i);
    }
    s.appendChild(tray);

    // Hand-nudge hints which number to tap. On the guided first flow it sits
    // right above the correct (glowing) answer cell; otherwise it just invites
    // a tap from below. A small (70px) cursor that bounces straight down keeps
    // it locked onto the cell (the larger pop nudge drifted off-target).
    var nudge = UI.HandNudge();
    if (opts.hintAnswer && cells[answer - 1]) {
      var hostCell = cells[answer - 1].cell;
      hostCell.style.position = 'relative';
      hostCell.classList.add('guess-cell--hint');   // precise pulsing glow on the answer
      var wrap = el('div', { style: { position: 'absolute', left: '50%', top: '-58px', transform: 'translateX(-50%)', zIndex: '29' } });
      wrap.appendChild(nudge);
      hostCell.appendChild(wrap);
    } else {
      nudge.classList.add('hand-nudge--tap');
      var wrapC = el('div', { style: { position: 'absolute', left: '50%', bottom: '4px', transform: 'translateX(-50%)', zIndex: '29' } });
      wrapC.appendChild(nudge);
      s.appendChild(wrapC);
    }

    // No "Check" button. Tapping a number IS the guess: the chosen count of
    // hands fills in ONE BY ONE (not all at once), then we resolve so the
    // caller (playRound) can show the success / try-again+clue feedback.
    function onCellTap(idx) {
      if (committed) return;
      committed = true;
      var count = idx + 1;
      if (nudge.parentNode) nudge.parentNode.remove();
      cells.forEach(function (c) { c.cell.classList.remove('guess-cell--hint'); });
      tray.style.pointerEvents = 'none';

      var step = 0;
      (function fillNext() {
        if (step >= count) {
          setTimeout(function () { tray.remove(); resolveGuess(count); }, 380);
          return;
        }
        var c = cells[step];
        UI.setHandSpan(c.hs, 'solid', step + 1);
        c.cell.dataset.selected = '1';
        FX.pulse(c.cell);
        A.playPop();
        step++;
        setTimeout(fillNext, 170);
      })();
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
  function measureFly(opts) {
    var slots = opts.slots;
    var unit = opts.unit;
    var s = scene();

    function flyOne(i) {
      return new Promise(function (resolve) {
        var slot = slots[i];
        var target = FX.centerOf(slot);
        // a flying clone
        var fly = el('div.fly-span');
        var hs = UI.HandSpan({ variant: 'solid', w: unit, h: unit });
        fly.appendChild(hs);
        Object.assign(fly.style, {
          left: target.x + 'px',
          top: (FX.STAGE_H + 60) + 'px',
          transform: 'translate(-50%, -50%) scale(0.8)',
          transition: 'top 0.5s cubic-bezier(.3,1.2,.5,1), transform 0.5s ease'
        });
        s.appendChild(fly);
        A.playWhoosh();
        // animate up to the slot position
        requestAnimationFrame(function () {
          fly.style.top = target.y + 'px';
          fly.style.transform = 'translate(-50%, -50%) scale(1)';
        });
        setTimeout(function () {
          // bounce + land
          A.playPop();
          FX.sparkleBurst(target.x, target.y, { count: 8, spread: 70, color: '#bfe39a' });
          UI.setHandSpan(slot, 'solid');
          FX.pulse(slot);
          fly.remove();
          resolve();
        }, 560);
      });
    }

    var chain = Promise.resolve();
    slots.forEach(function (_, i) {
      chain = chain.then(function () { return flyOne(i); }).then(function () { return FX.wait(140); });
    });
    return chain;
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

      // faint blurred table behind the genie (matches the Figma backdrop)
      var bt = UI.Table({ w: 572 });
      bt.classList.add('tut-blur');
      Object.assign(bt.style, { position: 'absolute', left: '354px', top: '210px', zIndex: '1', opacity: '0.7' });
      s.appendChild(bt);

      // genie, centred
      var genie = UI.Gogo();
      Object.assign(genie.style, { left: '354px', top: '128px', width: '520px', zIndex: '10' });
      s.appendChild(genie);

      function welcome(text) {
        var p = UI.WelcomePanel(text);
        s.appendChild(p);
        A.playDialogue();
        return tapToContinue().then(function () { p.remove(); });
      }

      var seq = FX.wait(150);
      seq = seq.then(function () { return welcome('Welcome to the Hall of Helpful Things!'); });
      seq = seq.then(function () { return welcome("Let's find the right items for the King's feast."); });
      seq = seq.then(function () {
        bgEl.classList.remove('tut-blur');
        tableSelection();
      });
      return seq;
    });
  }

  /* ======================================================================
   * STATE 2 — TABLE SELECTION
   * Front table is highlighted/clickable and sits centred; the other two
   * are smaller blurred glimpses behind it. No rotating platform — just a
   * soft glow. The hand-nudge pops in over the table to invite the tap.
   * ====================================================================== */
  function tableSelection() {
    current = STATE.TABLE_SELECTION;
    setBackground('play');
    return transitionTo(function () {
      var s = scene();

      var carousel = el('div.carousel');

      // soft static glow behind the front table (no spinning disc)
      carousel.appendChild(el('div.select-glow'));

      // three slots: two blurred glimpses behind (pink + green, matching the
      // hall) + the highlighted wooden front one
      var left = el('div.carousel__slot carousel__slot--left', null, [UI.Table({ w: 360, src: 'assets/Table2.svg', ratio: 335 / 567 })]);
      var right = el('div.carousel__slot carousel__slot--right', null, [UI.Table({ w: 360, src: 'assets/Table3.svg', ratio: 468 / 772 })]);
      var front = el('div.carousel__slot carousel__slot--front');
      var frontTable = UI.Table({ w: 420 });
      frontTable.classList.add('table--glow');
      front.appendChild(frontTable);

      carousel.appendChild(left);
      carousel.appendChild(right);
      carousel.appendChild(front);
      // darken the upper & lower bands so focus lands on the central table
      carousel.appendChild(el('div.carousel-vignette'));
      s.appendChild(carousel);

      // hand-nudge that pops in (tap gesture) over the front table
      var nudge = UI.HandNudge();
      nudge.classList.add('hand-nudge--tap');
      Object.assign(nudge.style, { left: '52%', top: '56%' });
      s.appendChild(nudge);

      front.addEventListener('mouseenter', function () { A.playHover(); });
      var picked = false;
      front.addEventListener('click', function () {
        if (picked) return;          // guard against double-tap
        picked = true;
        front.style.pointerEvents = 'none';
        A.playClick();
        var c = FX.centerOf(frontTable);
        FX.sparkleBurst(c.x, c.y, { count: 20, spread: 160 });
        FX.ringBurst(c.x, c.y, '#FFD54A');
        // zoom + bounce, then enter the tutorial
        front.style.transition = 'transform 0.5s cubic-bezier(.3,1.5,.4,1), opacity 0.5s ease';
        front.style.transform = 'translate(-50%, -50%) scale(1.3)';
        nudge.remove();
        setTimeout(function () {
          HS.Tutorial.start(CONFIG, hooks);
        }, 520);
      });
      return null;
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
    showTitleChip: showTitleChip,
    tapToContinue: tapToContinue,
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
    tableSelection: tableSelection,
    hooks: hooks
  };
})();
