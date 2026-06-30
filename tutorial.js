/* ============================================================================
 * tutorial.js  —  guided tutorial, rebuilt to match the Figma "tutorial" flow
 * ----------------------------------------------------------------------------
 * All coordinates are mapped from the 1920x1080 Figma frames onto our
 * 1280x720 stage (factor 2/3) so element ratios & alignment are preserved.
 *
 * Flow (one Figma frame == one "screen", advanced by tapping anywhere):
 *   A. Welcome (genie + big panel)
 *        "Welcome to the Hall of Helpful Things!"
 *        "Let's find the right items for the King's feast."
 *        "Ready? Let's begin!"
 *   B. The question (table + dashed start/end guides + child bubble)
 *        "Where do I put my hand?" / "On the side?" / "In front?"
 *   C. Genie demonstrates with the draggable hand
 *        "Look! I will drag the hand and place it." (hand flies to a wrong spot)
 *        "Where is the hand now?" / "Is it in front of the table?"
 *        "Yes, but look! It is not at the starting point."
 *        "The hand must be placed at the starting point." (hand moves to start)
 *   D. The rules
 *        "Now, let me place the next hand."
 *        "We need to place the hands with no gaps."   (gap shown)
 *        "Also, the hands should not be placed on top of each other." (overlap)
 *   E. Correct method, with call-out labels
 *        "Place the first hand at the starting point."  [Start from one end.]
 *        "Put the next hand right next to it. No gaps in between!"  [No Gaps!]
 *        (third hand)  [No overlap!]
 *   F. "Now it is time for you to find how long the table is." -> guess (=4)
 *        -> "Well Done!" -> Round 1
 * ========================================================================== */
window.HS = window.HS || {};

HS.Tutorial = (function () {
  'use strict';

  var UI = HS.UI, FX = HS.FX, A = HS.Audio;
  var el = UI.el;

  /* ---- geometry (1920x1080 Figma -> 1280x720 stage, x2/3) -------------- */
  var TABLE = { left: 354, top: 179, w: 572, h: 302 };
  // Guides sit on the table's OUTER leg-foot edges (measured opaque: Table.svg
  // feet span 2.88%..96.63% of its width): 354 + 572*0.0288 ≈ 370, 354 + 572*0.9663 ≈ 907.
  var GUIDE = { startX: 370, endX: 907, top: 466, h: 98 };
  // The visible hand now fills the box width, so the box width IS the flush
  // hand width — placing boxes one box-width apart makes the hands touch.
  var HAND_BOX = 88;
  var HAND_TOP = 478;                 // top of a placed hand box

  // Teaching positions (hand CENTRE x), each visually distinct:
  var SIDE_CX = 300;                  // "On the side?" — OUTSIDE, left of the start line
  var FRONT_CX = 638;                 // "In front?"    — CENTRE, between the two lines
  var ONLINE_CX = GUIDE.startX;       // "Where is the hand now?" — ON the start line
  // flush sequence: first hand's left edge AT the line, each next exactly one
  // box-width along (no gaps, no overlaps)
  var HAND_C = [
    GUIDE.startX + HAND_BOX / 2,            // 471 — starts at the line
    GUIDE.startX + HAND_BOX * 1.5,          // 559
    GUIDE.startX + HAND_BOX * 2.5           // 647
  ];
  var GENIE = { left: 354, top: 128, w: 520 };

  /* ---- small scene helpers --------------------------------------------- */
  function bg() { return document.getElementById('bg'); }
  function blur(on) { bg().classList.toggle('tut-blur', !!on); }

  // place a hand unit centred at cx (box top = HAND_TOP unless given)
  function placeHand(layer, cx, opts) {
    opts = opts || {};
    var hand = UI.HandUnit(HAND_BOX);
    hand.style.left = (cx - HAND_BOX / 2) + 'px';
    hand.style.top = (opts.top != null ? opts.top : HAND_TOP) + 'px';
    if (opts.faded) hand.classList.add('is-faded');
    // pop-in
    hand.style.transform = 'scale(0.4)';
    hand.style.opacity = '0';
    hand.style.transition = 'transform 0.25s cubic-bezier(.2,1.5,.4,1), opacity 0.25s ease, left 0.5s ease';
    layer.appendChild(hand);
    requestAnimationFrame(function () { hand.style.transform = 'scale(1)'; hand.style.opacity = '1'; });
    A.playPop();
    return hand;
  }

  // fly a hand from the podium (bottom-left) to a target centre
  function flyHandFromPodium(layer, podium, targetCx) {
    return new Promise(function (resolve) {
      var p = FX.centerOf(podium);
      var hand = UI.HandUnit(HAND_BOX);
      hand.style.left = (p.x - HAND_BOX / 2) + 'px';
      hand.style.top = (p.y - HAND_BOX) + 'px';
      hand.style.transition = 'left 0.7s cubic-bezier(.3,1,.4,1), top 0.7s cubic-bezier(.3,1,.4,1)';
      layer.appendChild(hand);
      A.playWhoosh();
      requestAnimationFrame(function () {
        hand.style.left = (targetCx - HAND_BOX / 2) + 'px';
        hand.style.top = HAND_TOP + 'px';
      });
      setTimeout(function () { A.playPop(); FX.pulse(hand); resolve(hand); }, 740);
    });
  }

  /* ---- the controller -------------------------------------------------- */
  function start(config, h) {
    h.setBackground('play');

    h.transitionTo(function () {
      var s = h.scene();

      // ---- persistent layers -------------------------------------------
      var layer = el('div', { style: { position: 'absolute', inset: '0', zIndex: '20' } });

      // dialogue helper: avatar bubble centred near the top, wait for a tap
      function say(who, text) {
        var b = UI.TutorialBubble({ who: who, text: text });
        Object.assign(b.style, { left: '50%', top: '16px', transform: 'translateX(-50%)' });
        s.appendChild(b);
        A.playDialogue();
        return h.tapToContinue().then(function () { b.remove(); });
      }
      var run = Promise.resolve();

      /* ===== set the measuring stage =================================== *
       * The welcome screens now play in the intro (before table selection),
       * so the tutorial begins directly on the measuring stage.            */
      run = run.then(function () {
        blur(false);
        // darken the periphery so the central table + hands read clearly
        s.appendChild(UI.Vignette());

        var table = UI.Table({ w: TABLE.w });
        Object.assign(table.style, { position: 'absolute', left: TABLE.left + 'px', top: TABLE.top + 'px', zIndex: '5' });
        s.appendChild(table);
        s._table = table;

        // start/end guides are added now but revealed (with SFX) a beat later
        s._guide = UI.MeasureGuide(GUIDE.startX, GUIDE.endX, GUIDE.top, GUIDE.h);
        s.appendChild(s._guide);
        s.appendChild(layer);
        return FX.wait(450);
      });

      // the two dashed lines appear with a sound
      run = run.then(function () {
        if (s._guide) s._guide.reveal();
        A.playWhoosh();
        FX.sparkleBurst(GUIDE.startX, GUIDE.top, { count: 6, spread: 40, color: '#e11dff' });
        FX.sparkleBurst(GUIDE.endX, GUIDE.top, { count: 6, spread: 40, color: '#e11dff' });
        return FX.wait(450);
      });

      /* ===== B. THE QUESTION (child wondering — hand shows each guess) === */
      // a "thinking" hand the child imagines placing in different spots
      var thinkHand;
      run = run.then(function () { return say('child', 'Where do I put my hand?'); });
      run = run.then(function () {
        // "On the side?" -> hand OUTSIDE the lines (to the left)
        thinkHand = placeHand(layer, SIDE_CX);
        return say('child', 'On the side?');
      });
      run = run.then(function () {
        // "In front?" -> hand in the CENTRE, between the two lines
        thinkHand.style.left = (FRONT_CX - HAND_BOX / 2) + 'px';
        A.playWhoosh();
        return say('child', 'In front?');
      });

      /* ===== C. GENIE DEMONSTRATES =================================== */
      var podium, demoHand;
      run = run.then(function () {
        if (thinkHand) { thinkHand.remove(); thinkHand = null; } // genie takes over
        podium = UI.HandPodium();
        Object.assign(podium.style, { left: '25px', bottom: '40px' });
        s.appendChild(podium);
        return say('gogo', 'Look! I will drag the hand and place it.');
      });
      // fly the hand ON to the start line (centred on it, straddling)
      run = run.then(function () { return flyHandFromPodium(layer, podium, ONLINE_CX); })
              .then(function (hand) { demoHand = hand; });
      run = run.then(function () { return say('gogo', 'Where is the hand now?'); });
      run = run.then(function () { return say('gogo', 'Is it in front of the table?'); });
      run = run.then(function () { return say('gogo', 'Yes, but look! It is not at the starting point.'); });
      run = run.then(function () {
        // place it PROPERLY — starting from the line (fully after the start)
        demoHand.style.left = (HAND_C[0] - HAND_BOX / 2) + 'px';
        A.playWhoosh();
        FX.sparkleBurst(GUIDE.startX, GUIDE.top + 20, { count: 8, spread: 60, color: '#ffd24a' });
        return say('gogo', 'The hand must be placed at the starting point.');
      });

      /* ===== D. THE RULES ============================================ */
      run = run.then(function () {
        // a second hand, flush after the first
        s._hand2 = placeHand(layer, HAND_C[1]);
        return say('gogo', 'Now, let me place the next hand.');
      });
      run = run.then(function () {
        // demonstrate a GAP: shove hand2 to the right
        s._hand2.style.left = (HAND_C[1] + 70 - HAND_BOX / 2) + 'px';
        s._hand2.classList.add('is-wrong');
        return say('gogo', 'We need to place the hands with no gaps.');
      });
      run = run.then(function () {
        // demonstrate an OVERLAP: pull hand2 left onto hand1
        s._hand2.style.left = (HAND_C[0] + 36 - HAND_BOX / 2) + 'px';
        return say('gogo', 'Also, the hands should not be placed on top of each other.');
      });

      /* ===== "LET US RECALL" — genie recap, table cleared ============= */
      run = run.then(function () {
        // clear the measuring stage and bring the genie centre-stage
        UI.clear(layer);
        if (podium) podium.style.display = 'none';
        if (s._table) s._table.style.display = 'none';
        if (s._guide) s._guide.style.display = 'none';

        var genie = UI.Gogo();
        Object.assign(genie.style, { left: GENIE.left + 'px', top: GENIE.top + 'px', width: GENIE.w + 'px', zIndex: '10' });
        s.appendChild(genie);
        s._recallGenie = genie;

        var p = UI.WelcomePanel('Let us recall.');
        s.appendChild(p);
        A.playDialogue();
        return h.tapToContinue().then(function () { p.remove(); });
      });
      run = run.then(function () {
        // restore the stage for the clean correct-method demonstration
        if (s._recallGenie) { s._recallGenie.remove(); s._recallGenie = null; }
        if (s._table) s._table.style.display = '';
        if (s._guide) s._guide.style.display = '';
        if (podium) podium.style.display = '';
        return FX.wait(200);
      });

      /* ===== E. CORRECT METHOD with labels =========================== */
      run = run.then(function () {
        // reset the demo: clear hands, keep table + guides
        UI.clear(layer);
        var chip = UI.LabelChip('Start from one end.');
        chip.style.top = '348px';
        s.appendChild(chip); s._chip = chip;
        // the chip's tail (at its horizontal centre) must point at the START
        // edge line — centre the chip over GUIDE.startX after measuring its width
        chip.style.left = (GUIDE.startX - chip.offsetWidth / 2) + 'px';
        placeHand(layer, HAND_C[0]);
        FX.sparkleBurst(HAND_C[0], HAND_TOP + 40, { count: 8, spread: 60, color: '#bfe39a' });
        return say('gogo', 'Place the first hand at the starting point.');
      });
      run = run.then(function () {
        if (s._chip) s._chip.remove();
        var chip = UI.LabelChip('No Gaps!');
        Object.assign(chip.style, { left: (HAND_C[1] - 30) + 'px', top: '360px' });
        s.appendChild(chip); s._chip = chip;
        placeHand(layer, HAND_C[1]);
        return say('gogo', 'Put the next hand right next to it. No gaps in between!');
      });
      run = run.then(function () {
        if (s._chip) s._chip.remove();
        var chip = UI.LabelChip('No overlap!');
        Object.assign(chip.style, { left: (HAND_C[2] - 30) + 'px', top: '360px' });
        s.appendChild(chip); s._chip = chip;
        placeHand(layer, HAND_C[2]);
        FX.sparkleBurst(HAND_C[2], HAND_TOP + 40, { count: 8, spread: 60, color: '#bfe39a' });
        return say('gogo', 'Put the next hand right next to it. No gaps in between!');
      });

      /* ===== -> SELECT-TABLE (no standalone guess; the player now picks a
       *         table to measure in the Hall) ========================= */
      run = run.then(function () {
        if (s._chip) s._chip.remove();
        if (podium) podium.remove();
        return FX.wait(250);
      }).then(function () {
        h.startHall();
      });

      return run;
    });
  }

  return { start: start };
})();
