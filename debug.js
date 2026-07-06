/* ============================================================================
 * debug.js  —  DEV-ONLY screen jumper widget
 * ----------------------------------------------------------------------------
 * A small floating 🐞 button (top-left, outside the stage). Click it (or press
 * the backtick ` key) to open a panel listing every screen in the game; pick
 * one to jump straight there with a plausible state — no need to play through.
 *
 * Ship note: this file is NOT part of the game. To ship, remove the
 * <script src="debug.js"></script> tag from index.html.
 * ========================================================================== */
(function () {
  'use strict';

  function init() {
    if (!window.HS || !HS.Game || !HS.Rounds || !HS.Tutorial) return;
    var G = HS.Game, R = HS.Rounds, T = HS.Tutorial;
    var CONFIG = G.CONFIG, h = G.hooks;

    /* ---- get the game into a jumpable state ------------------------------ */
    // Dismiss the boot gate if needed (the click on the widget is the user
    // gesture that unlocks audio) and clear screen-scoped bg side-effects.
    function enterGame() {
      var boot = document.getElementById('boot');
      if (boot && !boot.classList.contains('hidden')) {
        HS.Audio.unlock();
        boot.classList.add('hidden');
      }
      document.getElementById('bg').classList.remove('tut-blur');
    }

    /* ---- every screen, in game order ------------------------------------- */
    var SCREENS = [
      ['Intro · welcome',        function () { G.intro(); }],
      ['Tutorial · showcase',    function () { T.start(CONFIG, h); }],
      ['Tutorial · drag lesson', function () { R.startTutorialMeasure(CONFIG, h); }],
      ['Hall of Tables',         function () { R.startHall(CONFIG, h); }],
      ['Round · table (8 sp)',   function () { R.debug.round(CONFIG, h, 8); }],
      ['Round · table (6 sp)',   function () { R.debug.round(CONFIG, h, 6); }],
      ['Hall success · bag it',  function () { R.debug.hallSuccess(CONFIG, h); }],
      ['Cloth hall (flow 2)',    function () { R.startCloths(CONFIG, h); }],
      ['Cloth round (8 sp)',     function () { R.debug.cloth(CONFIG, h, 8); }],
      ['Cloth success',          function () { R.debug.clothSuccess(CONFIG, h); }],
      ['Candle hall (flow 3)',   function () { R.debug.candles(CONFIG, h); }],
      ['Candle round (5 sp)',    function () { R.debug.candle(CONFIG, h, 5); }],
      ['Candle success',         function () { R.debug.candleSuccess(CONFIG, h); }],
      ['End screen',             function () { R.debug.end(CONFIG, h); }],
      ['⟲ Restart game',         function () { G.start(); }]
    ];

    /* ---- widget DOM + styles ---------------------------------------------- */
    var style = document.createElement('style');
    style.textContent =
      '#hs-debug{position:fixed;left:10px;top:10px;z-index:99999;font-family:ui-monospace,Menlo,monospace;}' +
      '#hs-debug__toggle{width:38px;height:38px;border-radius:50%;border:2px solid #fff;cursor:pointer;' +
        'background:#1d1430;color:#fff;font-size:18px;line-height:1;box-shadow:0 4px 10px rgba(0,0,0,.4);opacity:.55;}' +
      '#hs-debug__toggle:hover,#hs-debug.open #hs-debug__toggle{opacity:1;}' +
      '#hs-debug__panel{display:none;margin-top:6px;padding:8px;min-width:200px;border-radius:10px;' +
        'background:rgba(24,17,38,.94);border:1px solid rgba(255,255,255,.25);box-shadow:0 8px 22px rgba(0,0,0,.5);}' +
      '#hs-debug.open #hs-debug__panel{display:block;}' +
      '#hs-debug__panel .hs-debug__title{color:#b9a5e8;font-size:10px;letter-spacing:.12em;' +
        'text-transform:uppercase;margin:2px 4px 6px;}' +
      '#hs-debug__panel button{display:block;width:100%;text-align:left;margin:2px 0;padding:6px 9px;' +
        'border:none;border-radius:6px;cursor:pointer;background:transparent;color:#f1eaff;font:12px/1.2 inherit;}' +
      '#hs-debug__panel button:hover{background:#7B219F;}';
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.id = 'hs-debug';
    var toggle = document.createElement('button');
    toggle.id = 'hs-debug__toggle';
    toggle.type = 'button';
    toggle.title = 'Debug: jump to screen (`)';
    toggle.textContent = '🐞';
    var panel = document.createElement('div');
    panel.id = 'hs-debug__panel';
    var title = document.createElement('div');
    title.className = 'hs-debug__title';
    title.textContent = 'Jump to screen';
    panel.appendChild(title);

    SCREENS.forEach(function (entry) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = entry[0];
      b.addEventListener('click', function () {
        enterGame();
        root.classList.remove('open');
        entry[1]();
      });
      panel.appendChild(b);
    });

    toggle.addEventListener('click', function () { root.classList.toggle('open'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === '`') root.classList.toggle('open');
    });

    root.appendChild(toggle);
    root.appendChild(panel);
    document.body.appendChild(root);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
