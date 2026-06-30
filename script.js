/* ============================================================================
 * script.js  —  bootstrap / entry point
 * ----------------------------------------------------------------------------
 *  - Locks the 1280x720 stage to the viewport (uniform scale, aspect ratio
 *    preserved, never scrolls).
 *  - Wires the "Tap to Play" gate so we can unlock the WebAudio context on a
 *    real user gesture, then kicks off the state machine.
 * ========================================================================== */
(function () {
  'use strict';

  var DESIGN_W = 1280, DESIGN_H = 720;

  /* ---- responsive scaling ---------------------------------------------- */
  function fit() {
    var stage = document.getElementById('stage');
    if (!stage) return;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var scale = Math.min(vw / DESIGN_W, vh / DESIGN_H);
    stage.style.setProperty('--scale', scale);
  }

  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  fit();

  /* ---- boot gate -------------------------------------------------------- */
  function boot() {
    var bootEl = document.getElementById('boot');
    var btn = document.getElementById('bootBtn');

    function go() {
      HS.Audio.unlock();          // unlock audio on the user gesture
      HS.Audio.playClick();
      bootEl.classList.add('hidden');
      HS.Game.start();            // begin the state machine (INTRO)
    }

    btn.addEventListener('click', go, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { fit(); boot(); });
  } else {
    fit(); boot();
  }
})();
