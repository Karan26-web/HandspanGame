/* ============================================================================
 * tutorial.js  —  guided tutorial intro (table showcase -> select -> lesson)
 * ----------------------------------------------------------------------------
 * New flow (per the redesign that matches the drag-to-measure mechanic):
 *   1. (game.js intro) "Welcome to the Hall of Helpful Things!"
 *   2. THREE-TABLE SHOWCASE — the three tables sit in the selection carousel,
 *      HorizontalGogo introduces them:
 *        "Here are the tables."
 *        "Let's measure how long each table is."
 *   3. FOCUS + SELECT — the tutorial (centre) table is brought into focus and
 *      the side tables blur (exactly like the real selection screen):
 *        "Tap here to select this table."   (player taps the centre table)
 *   4. -> HS.Rounds.startTutorialMeasure: the guided drag lesson runs on the
 *      chosen table (Gogo demonstrates, then the player finishes measuring),
 *      after which the Hall of Tables opens for the remaining tables.
 * ========================================================================== */
window.HS = window.HS || {};

HS.Tutorial = (function () {
  'use strict';

  var UI = HS.UI, FX = HS.FX, A = HS.Audio;
  var el = UI.el;

  // same brown artwork as every table; cards are sized by span count so a
  // longer table genuinely looks longer (matches the Hall carousel).
  var TABLE_SRC = 'assets/Table.png';
  var TABLE_RATIO = 350 / 662;
  var CARD_E0 = 0.0375, CARD_E1 = 0.9542;         // outer leg-foot fractions
  function cardWidth(spans) { return (50 * spans) / (CARD_E1 - CARD_E0); }

  // Gogo (top-left) speaks; the bubble sits to his right with its tail pointing
  // LEFT at him. `pose` picks the asset by the kind of line. The wide lounging
  // (horizontal) pose sits bigger & further right, so the bubble follows.
  // Waits for a tap.
  function placeGogo(gogo, pose) {
    if (pose === 'horizontal') Object.assign(gogo.style, { left: '270px', top: '-14px' });
    else if (pose === 'show') Object.assign(gogo.style, { left: '-4px', top: '120px' });  // presenting from the LEFT
    else Object.assign(gogo.style, { left: '300px', top: '-6px' });   // standing gogo.webp
  }
  function bubblePos(pose) {
    // hugging the head: BOTTOM-anchored so the tail tip lands right beside
    // Gogo's ear whatever the line length (the bubble grows upward)
    if (pose === 'horizontal') return { left: '648px', bottom: '650px' };
    if (pose === 'show') return { left: '195px', bottom: '500px' };
    return { left: '560px', bottom: '640px' };
  }
  function say(h, s, gogo, text, pose) {
    UI.setGogoPose(gogo, pose);
    placeGogo(gogo, pose);
    var b = UI.SayBubble(text, 'left');
    Object.assign(b.style, bubblePos(pose));
    s.appendChild(b);
    A.playDialogue();
    // no Next button here — the line holds for its reading time, then the
    // flow moves on by itself
    return FX.wait(h.readMs(text) + 600).then(function () { b.remove(); });
  }

  function start(config, h) {
    h.setBackground('play');

    h.transitionTo(function () {
      var s = h.scene();

      // fade the room behind so the row of tables is the clear focus
      var bgEl = document.getElementById('bg');
      bgEl.classList.add('tut-blur');

      // ---- the three tables in the selection carousel -------------------
      // starts UNLIT + FLAT: all three tables equally visible & sharp, no
      // spotlight, no blur/dim. The reveal then plays out one step at a time —
      // lights on first, then the side tables recede.
      var carousel = el('div.hall-carousel hall-carousel--unlit hall-carousel--flat');
      carousel.appendChild(el('div.select-glow'));

      var tables = config.finalTables;                 // [{6},{5},{8}]
      // centre the tutorial (5-span) table
      var center = 0;
      for (var i = 0; i < tables.length; i++) { if (tables[i].spans === config.tutorialSpans) { center = i; break; } }

      var bySize = tables.map(function (t) { return t.spans; }).sort(function (a, b) { return a - b; });
      var cards = tables.map(function (t, idx) {
        var card = el('div.hall-card', { dataset: { idx: String(idx) } });
        var table = UI.Table({ w: cardWidth(t.spans), src: TABLE_SRC, ratio: TABLE_RATIO });
        // smaller tables get longer legs so every top clears the wall bar
        // while the heights still read ascending with the span count
        if (t.spans === bySize[0]) table.classList.add('table--tall');
        else if (t.spans === bySize[1]) table.classList.add('table--tall-mid');
        card._table = table;
        card.appendChild(table);
        carousel.appendChild(card);
        return card;
      });
      s.appendChild(carousel);

      var n = cards.length;
      function layout() {
        cards.forEach(function (card, idx) {
          card.classList.remove('is-center', 'is-left', 'is-right');
          var rel = (idx - center + n) % n;            // 0 centre, 1 right, 2 left
          card.classList.add(rel === 0 ? 'is-center' : (rel === 1 ? 'is-right' : 'is-left'));
        });
      }
      layout();

      // Gogo PRESENTS the tables from the left side (ShowingGogo, open palm
      // sweeping toward the row of tables on the right).
      var gogo = UI.GogoCharacter('show');
      placeGogo(gogo, 'show');
      s.appendChild(gogo);

      var run = Promise.resolve();
      run = run.then(function () { return say(h, s, gogo, 'Here are the tables.', 'show'); });
      run = run.then(function () { return say(h, s, gogo, "Let's measure how long each table is.", 'show'); });

      // ---- STEP 1: THE TABLES MOVE — the centre table comes FORWARD while the
      // side tables drift back into the background. VERY slow & readable.
      run = run.then(function () {
        // the presenting narrator magically POOFS away first (sparkles + shrink)
        // and reappears for the select prompt
        UI.gogoVanish(gogo);
        return FX.wait(450);
      });
      run = run.then(function () {
        A.playWhoosh();
        bgEl.classList.remove('tut-blur');   // the spotlight sequence takes over
        carousel.classList.add('hall-carousel--slowmo');      // extra-slow glide
        carousel.classList.remove('hall-carousel--flat');     // sides recede & blur, centre forward
        return FX.wait(2100);   // let the slow move fully settle
      });

      // ---- STEP 2: only THEN the spotlight falls onto the centre table (SFX)
      run = run.then(function () {
        A.playLightsOn();
        carousel.classList.remove('hall-carousel--slowmo');
        carousel.classList.remove('hall-carousel--unlit');   // beam + vignette fade in
        cards[center]._table.classList.add('table--glow');   // centre gets focus brackets
        // a brief warm flash of the beam as the lights snap on
        var flash = el('div.lights-flash');
        s.appendChild(flash);
        requestAnimationFrame(function () { flash.classList.add('is-on'); });
        setTimeout(function () { flash.classList.remove('is-on'); }, 320);
        setTimeout(function () { flash.remove(); }, 760);
        return FX.wait(1100);   // hold on the lit centre before the prompt
      });

      // ---- FOCUS + SELECT the tutorial table ----------------------------
      run = run.then(function () {
        UI.setGogoPose(gogo, 'horizontal');   // lounging narrator, centred like the intro
        placeGogo(gogo, 'horizontal');        // (repositioned while invisible)
        UI.gogoAppear(gogo);                  // magic poof back in for the prompt
        var b = UI.SayBubble('Tap to select this table.', 'left');
        Object.assign(b.style, bubblePos('horizontal'));
        s.appendChild(b);
        A.playDialogue();

        var nudge = UI.HandNudge();
        nudge.classList.add('hand-nudge--tap');
        Object.assign(nudge.style, { position: 'absolute', left: '50%', top: '52%', transform: 'translateX(-50%)', zIndex: '41' });
        s.appendChild(nudge);
        UI.idleNudge(nudge, { ms: 2500, onShow: function () { A.playPop(); } });

        return new Promise(function (resolve) {
          var card = cards[center];
          card.style.cursor = 'pointer';
          card.addEventListener('mouseenter', function () { A.playHover(); });
          function pick() {
            card.removeEventListener('click', pick);
            A.playClick();
            b.remove();
            if (nudge.parentNode) nudge.remove();
            var c = FX.centerOf(card);
            FX.sparkleBurst(c.x, c.y, { count: 18, spread: 130 });
            if (FX.ringBurst) FX.ringBurst(c.x, c.y, '#FFD54A');
            card._table.style.transition = 'transform 0.45s cubic-bezier(.3,1.5,.4,1)';
            card._table.style.transform = 'scale(1.12)';
            setTimeout(resolve, 460);
          }
          card.addEventListener('click', pick);
        });
      });

      // ---- run the guided drag lesson on the chosen table ---------------
      run = run.then(function () { HS.Rounds.startTutorialMeasure(config, h); });

      return run;
    });
  }

  return { start: start };
})();
