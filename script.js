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
    // visualViewport is the reliable size on phones (collapsing URL bars,
    // pinch zoom); innerWidth/innerHeight is the desktop fallback
    var vv = window.visualViewport;
    var vw = vv ? vv.width : window.innerWidth;
    var vh = vv ? vv.height : window.innerHeight;
    var scale = Math.min(vw / DESIGN_W, vh / DESIGN_H);
    stage.style.setProperty('--scale', scale);
  }

  window.addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  // many devices fire orientationchange BEFORE the new dimensions land —
  // fit now, then again once the rotation has actually settled
  window.addEventListener('orientationchange', function () {
    fit();
    setTimeout(fit, 300);
  });
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
