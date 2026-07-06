/* =========================================================================
 * SandPortal — golden-sand vortex scene transition (self-contained, drop-in).
 *
 * A canvas particle portal of warm golden sand: sand awakens at the edges — a
 * clockwise whirlpool forms — a full-screen golden portal hides the old scene
 * (the next scene is built behind it) — the whirlpool reverses outward — a few
 * sparkles drift away. No dependencies, DPR-aware, deterministic.
 *
 * ---- Usage --------------------------------------------------------------
 *   // Low-level: construct + play with callbacks
 *   const portal = new SandPortal({ duration: 2.6, spins: 2.6, target: stageEl });
 *   portal.play({
 *     onPeak: () => swapSceneNow(),   // fires when the screen is fully covered
 *     onDone: () => {}                // fires when the reveal finishes
 *   });
 *
 *   // High-level Promise helper: swap at the peak, resolve when done
 *   await playSandTransition(() => swapSceneNow(), {
 *     duration: 2.6, spins: 2.6, density: 'regular', target: stageEl
 *   });
 *
 * Options:
 *   duration  seconds for the whole cover→reveal (default 2.6)
 *   spins     spiral revolutions (default 2.6)
 *   density   'sparse' | 'regular' | 'dense'  grain count (default 'regular')
 *   zIndex    canvas stacking (default 9999)
 *   target    host element to cover; omit to cover the viewport (fixed)
 *
 * Exposes: window.SandPortal, window.playSandTransition
 * ========================================================================= */
(function () {
    const SandPortal = (function () {
        const TWO_PI = Math.PI * 2;
        const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
        const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
        const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
        const easeOutQuad = (x) => 1 - (1 - x) * (1 - x);
        const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
        const DENSITY = { sparse: 800, regular: 1400, dense: 2200 };

        function mulberry32(a) {
            return function () {
                a |= 0; a = (a + 0x6D2B79F5) | 0;
                let t = Math.imul(a ^ (a >>> 15), 1 | a);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }
        function makeGrains(n, seed) {
            const r = mulberry32(seed), out = [];
            for (let i = 0; i < n; i++) out.push({
                u: Math.sqrt(r()), a0: r() * TWO_PI, swirl: (r() - 0.5) * 0.9,
                size: 0.9 + r() * 2.4, bright: r(), tw: r() * TWO_PI, spd: 0.55 + r() * 0.95,
            });
            return out;
        }
        function makeFringe(n, seed) {
            const r = mulberry32(seed), out = [];
            for (let i = 0; i < n; i++) out.push({
                a: r() * TWO_PI, off: r(), jit: r() - 0.5, size: 1 + r() * 2.6,
                bright: 0.4 + r() * 0.6, spd: 0.7 + r() * 1.1, tw: r() * TWO_PI,
            });
            return out;
        }

        function computeState(P, fullR, spins) {
            const coverEnd = 0.42, holdEnd = 0.54;
            const cover = easeOutCubic(clamp01(P / coverEnd));
            const covered = P >= coverEnd ? 1 : cover;
            const reveal = easeInOutCubic(clamp01((P - holdEnd) / (1 - holdEnd)));
            const outerR = fullR * 1.30 * covered;
            const innerR = fullR * 1.32 * reveal;
            const rotation = spins * TWO_PI * easeOutQuad(P);
            const starAmt = smooth(1 - Math.abs(P - 0.48) / 0.17);
            const coreAmt = covered * (1 - 0.65 * reveal);
            return { P, outerR, innerR, rotation, starAmt, coreAmt, cover };
        }

        // —— star-lattice motif ——————————————————————————————————————————————
        function starPath(ctx, cx, cy, R, points, innerRatio, rot) {
            ctx.beginPath();
            const ri = R * innerRatio;
            for (let i = 0; i < points * 2; i++) {
                const rr = i % 2 === 0 ? R : ri;
                const a = rot + (i / (points * 2)) * TWO_PI;
                const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
        }
        function squarePath(ctx, cx, cy, R, rot) {
            ctx.beginPath();
            for (let i = 0; i < 4; i++) {
                const a = rot + (i / 4) * TWO_PI + Math.PI / 4;
                const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
        }
        function drawStar(ctx, cx, cy, st, fullR) {
            const amt = st.starAmt;
            if (amt < 0.01) return;
            const R = fullR * 0.30 * (0.62 + 0.38 * amt), rot = -st.rotation * 0.14;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = amt * 0.30;
            starPath(ctx, cx, cy, R, 16, 0.44, rot); ctx.fillStyle = '#FFE8A6'; ctx.fill();
            ctx.globalAlpha = amt * 0.9; ctx.lineJoin = 'round';
            ctx.strokeStyle = '#FFF6DC'; ctx.lineWidth = 3.2;
            ctx.shadowColor = 'rgba(255,221,140,0.9)'; ctx.shadowBlur = 26;
            squarePath(ctx, cx, cy, R * 0.74, rot); ctx.stroke();
            squarePath(ctx, cx, cy, R * 0.74, rot + Math.PI / 4); ctx.stroke();
            starPath(ctx, cx, cy, R * 0.92, 8, 0.46, rot);
            ctx.lineWidth = 2.2; ctx.strokeStyle = '#FFEFC0'; ctx.stroke();
            ctx.shadowBlur = 14; ctx.globalAlpha = amt * 0.8;
            const ring = R * 1.18;
            for (let i = 0; i < 16; i++) {
                const a = rot * -1.3 + (i / 16) * TWO_PI;
                squarePath(ctx, cx + Math.cos(a) * ring, cy + Math.sin(a) * ring, R * 0.05, a);
                ctx.fillStyle = '#FFF1C8'; ctx.fill();
            }
            ctx.globalAlpha = amt * 0.45; ctx.shadowBlur = 0;
            ctx.lineWidth = 1.4; ctx.strokeStyle = '#FFE7A0';
            ctx.beginPath(); ctx.arc(cx, cy, R * 1.34, 0, TWO_PI); ctx.stroke();
            ctx.restore();
        }

        function drawFringe(ctx, cx, cy, edge, fr, st, time, dir, fade) {
            fade = fade == null ? 1 : fade;
            const spread = 70;
            for (let i = 0; i < fr.length; i++) {
                const p = fr[i];
                const ang = p.a + st.rotation * 1.25 * p.spd * dir;
                const rr = edge + dir * (p.off * spread + 4) + p.jit * 10;
                const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
                const tw = 0.5 + 0.5 * Math.sin(time * 0.008 * p.spd + p.tw);
                ctx.globalAlpha = p.bright * tw * fade;
                ctx.beginPath();
                ctx.arc(x, y, p.size * (0.7 + 0.6 * tw), 0, TWO_PI);
                ctx.fillStyle = i % 8 === 0 ? '#FFF7D6' : '#FFD98A';
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        function draw(ctx, W, H, st, fields, time) {
            const cx = W / 2, cy = H / 2, innerR = st.innerR, outerR = st.outerR;
            ctx.clearRect(0, 0, W, H);
            if (outerR < 1) return;

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, outerR, 0, TWO_PI, false);
            if (innerR > 0.5) ctx.arc(cx, cy, innerR, 0, TWO_PI, true);
            ctx.clip();

            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
            g.addColorStop(0.00, '#FFF4D2'); g.addColorStop(0.16, '#FCD877');
            g.addColorStop(0.48, '#F3B53F'); g.addColorStop(0.76, '#D98A28');
            g.addColorStop(0.92, '#AE661A'); g.addColorStop(1.00, '#7A4811');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

            ctx.globalCompositeOperation = 'multiply';
            for (let k = 0; k < 7; k++) {
                const phi0 = (k / 7) * TWO_PI;
                ctx.beginPath();
                for (let s = 0; s <= 36; s++) {
                    const f = s / 36, rr = outerR * (0.05 + 0.95 * f);
                    const ang = phi0 + st.rotation * (0.45 + 1.0 * (1 - f)) + f * Math.PI * 1.9;
                    const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
                    s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.lineCap = 'round'; ctx.lineWidth = outerR * 0.10;
                ctx.strokeStyle = 'rgba(120,66,18,0.16)'; ctx.stroke();
            }

            ctx.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 26; k++) {
                const phi0 = (k / 26) * TWO_PI + 0.0007 * time;
                ctx.beginPath();
                for (let s = 0; s <= 44; s++) {
                    const f = s / 44, rr = outerR * (0.06 + 0.94 * f);
                    const ang = phi0 + st.rotation * (0.5 + 1.05 * (1 - f)) + f * Math.PI * 1.75;
                    const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
                    s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.lineCap = 'round'; ctx.lineWidth = 2.4;
                ctx.strokeStyle = 'rgba(255,236,176,0.16)'; ctx.stroke();
            }

            const bP = [], mP = [], dP = [];
            for (let i = 0; i < fields.grains.length; i++) {
                const gr = fields.grains[i], f = gr.u, rr = gr.u * outerR;
                if (rr < innerR - 3) continue;
                const ang = gr.a0 + gr.swirl + st.rotation * gr.spd * (0.5 + 1.1 * (1 - f));
                const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
                const tw = 0.5 + 0.5 * Math.sin(time * 0.006 * gr.spd + gr.tw);
                const b = gr.bright * 0.58 + tw * 0.42, sz = gr.size * (1 + 0.5 * (1 - f));
                (b > 0.80 ? bP : b > 0.46 ? mP : dP).push(x, y, sz);
            }
            const blit = (arr, color) => {
                ctx.beginPath();
                for (let i = 0; i < arr.length; i += 3) {
                    ctx.moveTo(arr[i] + arr[i + 2], arr[i + 1]);
                    ctx.arc(arr[i], arr[i + 1], arr[i + 2], 0, TWO_PI);
                }
                ctx.fillStyle = color; ctx.fill();
            };
            blit(dP, 'rgba(150,86,24,0.55)');
            ctx.globalCompositeOperation = 'lighter';
            blit(mP, 'rgba(255,206,108,0.55)');
            blit(bP, 'rgba(255,247,214,0.95)');

            const cR = outerR * 0.55, cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cR);
            cg.addColorStop(0, 'rgba(255,250,228,' + (0.55 + 0.45 * st.coreAmt) + ')');
            cg.addColorStop(0.4, 'rgba(255,224,150,' + (0.28 * (0.4 + st.coreAmt)) + ')');
            cg.addColorStop(1, 'rgba(255,210,120,0)');
            ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);

            drawStar(ctx, cx, cy, st, Math.min(W, H) * 0.92);
            ctx.restore();

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            if (innerR > 2) {
                ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, TWO_PI);
                ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,240,190,0.85)';
                ctx.shadowColor = 'rgba(255,214,120,0.9)'; ctx.shadowBlur = 34; ctx.stroke();
                ctx.shadowBlur = 0;
                drawFringe(ctx, cx, cy, innerR, fields.fringe, st, time, 1);
            }
            if (st.cover < 1 && outerR > 2)
                drawFringe(ctx, cx, cy, outerR, fields.fringeB, st, time, -1, 1 - st.cover);
            ctx.restore();
        }

        // —— public controller ————————————————————————————————————————————————
        class SandPortal {
            constructor(opts = {}) {
                this.duration = opts.duration || 3;
                this.spins = opts.spins || 2.6;
                this.zIndex = opts.zIndex || 9999;
                this.target = opts.target || null;
                const n = DENSITY[opts.density] || DENSITY.regular;
                this.fields = { grains: makeGrains(n, 12345), fringe: makeFringe(260, 777), fringeB: makeFringe(220, 999) };
                this._raf = null; this._peaked = false; this._canvas = null;
            }

            _makeCanvas() {
                const c = document.createElement('canvas');
                c.id = 'sand-whirlpool';
                c.className = 'sand-portal-canvas';
                const host = this.target || null;
                Object.assign(c.style, {
                    position: host ? 'absolute' : 'fixed', inset: '0', left: '0', top: '0',
                    width: '100%', height: '100%', pointerEvents: 'none', zIndex: String(this.zIndex),
                });
                (host || document.body).appendChild(c);
                // Cap BOTH the DPR and the absolute backing-store width so the fill
                // cost stays modest on large/retina screens; stretched via CSS.
                const dpr = Math.min(1.5, window.devicePixelRatio || 1);
                const rect = host ? host.getBoundingClientRect() : { width: innerWidth, height: innerHeight };
                let cw = Math.max(1, Math.round(rect.width * dpr));
                let ch = Math.max(1, Math.round(rect.height * dpr));
                const MAX_W = 1600;
                if (cw > MAX_W) { ch = Math.round(ch * (MAX_W / cw)); cw = MAX_W; }
                c.width = cw;
                c.height = ch;
                return c;
            }

            /** Play the full cover → reveal. callbacks: { onPeak, onDone } */
            play(cb = {}) {
                this.stop();
                const c = this._makeCanvas();
                this._canvas = c;
                const ctx = c.getContext('2d');
                const W = c.width, H = c.height;
                const fullR = Math.sqrt((W / 2) ** 2 + (H / 2) ** 2);
                const t0 = performance.now();
                this._peaked = false;
                const tick = (now) => {
                    const P = clamp01((now - t0) / 1000 / this.duration);
                    const st = computeState(P, fullR, this.spins);
                    draw(ctx, W, H, st, this.fields, now);
                    if (!this._peaked && P >= 0.48) { this._peaked = true; cb.onPeak && cb.onPeak(); }
                    if (P >= 1) { this.stop(); cb.onDone && cb.onDone(); return; }
                    this._raf = requestAnimationFrame(tick);
                };
                this._raf = requestAnimationFrame(tick);
                return this;
            }

            stop() {
                if (this._raf) cancelAnimationFrame(this._raf);
                this._raf = null;
                if (this._canvas) { this._canvas.remove(); this._canvas = null; }
            }
        }

        return SandPortal;
    })();

    /* Promise helper: swap the scene at the portal peak (fully covered → no
       visible pop), resolve when the reveal completes. `swapAtPeak` is your
       scene-change function; it runs exactly once, when the screen is covered. */
    function playSandTransition(swapAtPeak, opts) {
        opts = opts || {};
        return new Promise((resolve) => {
            const prefersReducedMotion = !!(window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            let swapped = false;
            const runSwap = () => {
                if (swapped) return; swapped = true;
                try { if (typeof swapAtPeak === 'function') swapAtPeak(); } catch (e) { console.error('[SandPortal] swap error:', e); }
            };
            if (prefersReducedMotion) { runSwap(); resolve(); return; }

            const portal = new SandPortal({
                duration: typeof opts.duration === 'number' ? opts.duration : 2.6,
                spins: typeof opts.spins === 'number' ? opts.spins : 2.6,
                density: opts.density || 'regular',
                zIndex: opts.zIndex || 9999,
                target: opts.target || null,
            });
            let finished = false;
            const finish = () => { if (finished) return; finished = true; resolve(); };
            portal.play({
                onPeak: runSwap,
                onDone: () => { runSwap(); finish(); },
            });
            // Backstop so a dropped rAF (tab blur) never strands the transition.
            const DURATION = typeof opts.duration === 'number' ? opts.duration : 2.6;
            setTimeout(() => { try { portal.stop(); } catch (e) {} runSwap(); finish(); }, DURATION * 1000 + 1200);
        });
    }

    window.SandPortal = SandPortal;
    window.playSandTransition = playSandTransition;
})();
