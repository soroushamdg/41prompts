/* ==========================================================================
   41prompts logo: "41" morphs into "AI" on hover and focus.
   Ported unchanged in behaviour from the live 41prompts.ai site.
   - Plays once on load (41 → AI → 41), then follows hover/focus.
   - 500 ms per direction, cubic in-out easing, 900 ms hold on load.
   - Past the halfway point the logo gets .is-on: the plate turns into an
     outline and the wordmark letter-spacing opens (see components.css).
   - Does nothing when the user prefers reduced motion.
   Markup: <a class="logo" data-logo> <svg class="logo-glyphs"> rect.logo-plate,
   path.logo-glyph[data-logo-left], path.logo-glyph[data-logo-right] </svg>
   <span class="logo-word">prompts</span></a>
   Shape data also lives in assets/logo/logo-morph.json.
   ========================================================================== */
(function () {
  var G = {
    four: { outer: [[18,14],[32,14],[32,50],[25,50],[25,41],[8,41],[8,41],[8,41],[8,34]], inner: [[25,17],[25,34],[15,34]] },
    A:    { outer: [[28,14],[34,14],[44,50],[36,50],[31,41],[21,41],[16,50],[8,50],[16,36]], inner: [[30,20],[31,34],[24,34]] },
    one:  { outer: [[38,21],[44,14],[48,14],[48,50],[41,50],[41,21]], inner: null },
    I:    { outer: [[45,14],[45,14],[51,14],[45,50],[38,50],[41.5,32]], inner: null }
  };
  function L(a, b, t) { var o = [], i; for (i = 0; i < a.length; i++) o.push([a[i][0] + (b[i][0] - a[i][0]) * t, a[i][1] + (b[i][1] - a[i][1]) * t]); return o; }
  function P(p) { var d = "M" + p[0][0].toFixed(2) + " " + p[0][1].toFixed(2), i; for (i = 1; i < p.length; i++) d += "L" + p[i][0].toFixed(2) + " " + p[i][1].toFixed(2); return d + "Z"; }
  function S(f, t, v) { var d = P(L(f.outer, t.outer, v)); if (f.inner && t.inner) d += " " + P(L(f.inner, t.inner, v)); return d; }
  function E(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* Exposed for the sign-in construction sheet and for tests:
     logoPaths(0) = "41", logoPaths(1) = "AI"; logoShapes = the raw vertex data. */
  window.logoShapes = G;
  window.logoPaths = function (v) { var e = E(Math.max(0, Math.min(1, v))); return { left: S(G.four, G.A, e), right: S(G.one, G.I, e) }; };

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var DUR = 500, HOLD = 900;
  function start() {
    document.querySelectorAll("[data-logo]").forEach(function (logo) {
      var l = logo.querySelector("[data-logo-left]"), r = logo.querySelector("[data-logo-right]");
      if (!l || !r) return;
      var cur = 0, target = 0, raf = 0, last = 0;
      function draw(v) { var e = E(Math.max(0, Math.min(1, v))); l.setAttribute("d", S(G.four, G.A, e)); r.setAttribute("d", S(G.one, G.I, e)); logo.classList.toggle("is-on", v > 0.5); }
      function step(now) {
        if (!last) last = now;
        var dt = Math.min(64, now - last); last = now;
        var dir = target > cur ? 1 : -1; cur += dir * (dt / DUR);
        if ((dir > 0 && cur >= target) || (dir < 0 && cur <= target)) { cur = target; raf = 0; last = 0; draw(cur); return; }
        draw(cur); raf = requestAnimationFrame(step);
      }
      function go(v) { target = v; if (!raf) raf = requestAnimationFrame(step); }
      logo.addEventListener("mouseenter", function () { go(1); });
      logo.addEventListener("mouseleave", function () { go(0); });
      logo.addEventListener("focus", function () { go(1); });
      logo.addEventListener("blur", function () { go(0); });
      logo.setAttribute("data-logo-ready", "");
      go(1); setTimeout(function () { if (target === 1) go(0); }, DUR + HOLD);
    });
  }
  if (document.readyState === "complete") start(); else window.addEventListener("load", start);
})();
