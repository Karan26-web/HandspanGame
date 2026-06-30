/* ============================================================================
 * audio.js  —  Handspan Game audio engine
 * ----------------------------------------------------------------------------
 * Strategy:
 *   1. Try to load real audio files from assets/audios/ (mapped by name).
 *   2. If a file is missing / cannot decode, fall back to a tiny WebAudio
 *      synthesizer so the game ALWAYS has tactile sound — never silent,
 *      never throwing.
 *
 * Public API (all safe to call any time, before or after unlock):
 *   HS.Audio.unlock()        -> resume context (call on first user gesture)
 *   HS.Audio.playClick()
 *   HS.Audio.playPop()
 *   HS.Audio.playHover()
 *   HS.Audio.playSuccess()
 *   HS.Audio.playWrong()
 *   HS.Audio.playWhoosh()
 *   HS.Audio.playSparkle()
 *   HS.Audio.playDialogue()
 * ========================================================================== */
window.HS = window.HS || {};

HS.Audio = (function () {
  'use strict';

  // Optional real files. Folder is empty in this build, so every one of these
  // will silently fail the fetch and we transparently use the synth fallback.
  var FILES = {
    click: 'assets/audios/click.mp3',
    pop: 'assets/audios/pop.mp3',
    hover: 'assets/audios/hover.mp3',
    success: 'assets/audios/success.mp3',
    wrong: 'assets/audios/wrong.mp3',
    whoosh: 'assets/audios/whoosh.mp3',
    sparkle: 'assets/audios/sparkle.mp3',
    dialogue: 'assets/audios/dialogue.mp3'
  };

  var ctx = null;          // shared AudioContext (created lazily on unlock)
  var master = null;       // master gain
  var buffers = {};        // decoded file buffers, keyed by sound name
  var unlocked = false;
  var muted = false;

  /* ---- context lifecycle ------------------------------------------------ */
  function ensureCtx() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    if (unlocked) return;
    var c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    // Play a near-silent blip to satisfy mobile autoplay policies.
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      g.gain.value = 0.0001;
      o.connect(g); g.connect(master);
      o.start(); o.stop(c.currentTime + 0.02);
    } catch (e) { /* no-op */ }
    unlocked = true;
    loadFiles(); // attempt (and fail gracefully) to fetch real audio
  }

  /* ---- optional file loading (best-effort) ------------------------------ */
  function loadFiles() {
    var c = ensureCtx();
    if (!c || typeof fetch !== 'function') return;
    Object.keys(FILES).forEach(function (name) {
      fetch(FILES[name])
        .then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
        .then(function (buf) {
          return new Promise(function (res, rej) {
            c.decodeAudioData(buf, res, rej);
          });
        })
        .then(function (decoded) { buffers[name] = decoded; })
        .catch(function () { /* graceful: keep synth fallback */ });
    });
  }

  function playBuffer(name) {
    var c = ensureCtx();
    if (!c || !buffers[name]) return false;
    var src = c.createBufferSource();
    src.buffer = buffers[name];
    src.connect(master);
    src.start();
    return true;
  }

  /* ---- low-level synth helpers ------------------------------------------ */
  // A single shaped oscillator note.
  function note(opts) {
    var c = ensureCtx();
    if (!c || muted) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.f0, t0);
    if (opts.f1 != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f1), t0 + opts.dur);
    }
    var peak = opts.gain == null ? 0.25 : opts.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain); gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  // Filtered noise burst (used for whoosh / sparkle shimmer).
  function noise(opts) {
    var c = ensureCtx();
    if (!c || muted) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var len = Math.floor(c.sampleRate * opts.dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
    var src = c.createBufferSource();
    src.buffer = buf;
    var filt = c.createBiquadFilter();
    filt.type = opts.filter || 'bandpass';
    filt.frequency.setValueAtTime(opts.fStart, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(80, opts.fEnd), t0 + opts.dur);
    filt.Q.value = opts.q || 0.8;
    var gain = c.createGain();
    var peak = opts.gain == null ? 0.18 : opts.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filt); filt.connect(gain); gain.connect(master);
    src.start(t0); src.stop(t0 + opts.dur + 0.02);
  }

  /* ---- public sound effects --------------------------------------------- */
  function playClick() {
    if (playBuffer('click')) return;
    note({ type: 'triangle', f0: 540, f1: 720, dur: 0.09, gain: 0.22 });
  }

  function playPop() {
    if (playBuffer('pop')) return;
    note({ type: 'sine', f0: 320, f1: 760, dur: 0.12, gain: 0.28 });
  }

  function playHover() {
    if (playBuffer('hover')) return;
    note({ type: 'sine', f0: 880, f1: 1040, dur: 0.06, gain: 0.10 });
  }

  function playSuccess() {
    if (playBuffer('success')) return;
    // Happy ascending arpeggio (C-E-G-C).
    var seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach(function (f, i) {
      note({ type: 'triangle', f0: f, dur: 0.22, gain: 0.26, delay: i * 0.10 });
    });
    noise({ filter: 'highpass', fStart: 4000, fEnd: 9000, dur: 0.5, gain: 0.05, delay: 0.2 });
  }

  function playWrong() {
    if (playBuffer('wrong')) return;
    // Gentle (kid-friendly) descending "uh-oh", never harsh.
    note({ type: 'sine', f0: 380, f1: 300, dur: 0.16, gain: 0.22 });
    note({ type: 'sine', f0: 300, f1: 220, dur: 0.22, gain: 0.22, delay: 0.16 });
  }

  function playWhoosh() {
    if (playBuffer('whoosh')) return;
    // soft descending "swoop" for moving pieces (NOT a harsh noise/clap burst)
    note({ type: 'sine', f0: 620, f1: 280, dur: 0.26, gain: 0.09 });
    noise({ filter: 'lowpass', fStart: 520, fEnd: 180, dur: 0.20, q: 0.3, gain: 0.03 });
  }

  function playSparkle() {
    if (playBuffer('sparkle')) return;
    [1320, 1760, 2090].forEach(function (f, i) {
      note({ type: 'sine', f0: f, f1: f * 1.5, dur: 0.14, gain: 0.10, delay: i * 0.05 });
    });
  }

  function playDialogue() {
    if (playBuffer('dialogue')) return;
    // Soft "blip" used when a speech bubble appears.
    note({ type: 'sine', f0: 600, f1: 520, dur: 0.10, gain: 0.12 });
  }

  function setMuted(v) { muted = !!v; }

  return {
    unlock: unlock,
    playClick: playClick,
    playPop: playPop,
    playHover: playHover,
    playSuccess: playSuccess,
    playWrong: playWrong,
    playWhoosh: playWhoosh,
    playSparkle: playSparkle,
    playDialogue: playDialogue,
    setMuted: setMuted
  };
})();
