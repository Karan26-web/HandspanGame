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
    // Scale to the SAME box that lays out and centres the stage — the
    // #viewport container (position:fixed; inset:0). Its clientWidth/Height
    // track browser/page zoom correctly, whereas window.visualViewport does
    // NOT reflect page zoom (Cmd/Ctrl +): its width stays at the un-zoomed
    // value, so scaling by it left the stage larger than its shrunken
    // container and it spilled off to one side. innerWidth/Height is the
    // fallback when the container isn't found yet.
    var vp = document.getElementById('viewport');
    var vw = vp ? vp.clientWidth : window.innerWidth;
    var vh = vp ? vp.clientHeight : window.innerHeight;
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
