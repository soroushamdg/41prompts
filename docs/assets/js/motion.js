/* ==========================================================================
   41prompts motion primitives. No dependencies.
   Every effect checks prefers-reduced-motion and falls back to the end state.

   BP.reduce               true when the user prefers reduced motion
   [data-reveal]           element fades/rises in when it enters the viewport
                           data-reveal="up" (default) | "fade" | "left" | "scale"
                           data-delay="120" (ms)
                           fires a "reveal" event on the element
   BP.onReveal(el, fn)     run fn once when el enters the viewport
   BP.drawPath(path, ms, delay)   draw an SVG stroke from 0 to full length
   [data-count-to]         number counts up on reveal (data-decimals, data-prefix, data-suffix)
   BP.route(svg, path, fromEl, toEl, opts)  route an orthogonal leader line
                           between two elements inside the svg's container
   BP.flip(els, mutate)    animate layout changes (First, Last, Invert, Play)
   BP.crosshair(section)   CAD crosshair with X/Y readout that follows the mouse
   BP.loop(steps, period)  run a timed sequence of [ms, fn] steps on repeat;
                           pauses when offscreen or the tab is hidden
   ========================================================================== */
(function () {
  var BP = (window.BP = window.BP || {});
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  BP.reduce = mq.matches;
  var root = document.documentElement;
  root.classList.add("js");
  if (BP.reduce) root.classList.add("reduce");

  /* ---- Reveal ----------------------------------------------------------- */
  var io = null;
  if (!BP.reduce && "IntersectionObserver" in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        io.unobserve(el);
        var d = +(el.getAttribute("data-delay") || 0);
        setTimeout(function () {
          el.classList.remove("rv-pre");
          el.classList.add("rv-in");
          (el._revealFns || []).forEach(function (fn) { fn(el); });
          el.dispatchEvent(new CustomEvent("reveal"));
        }, d);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
  }
  BP.onReveal = function (el, fn) {
    if (!el) return;
    if (!io || el.classList.contains("rv-in")) { fn(el); return; }
    (el._revealFns = el._revealFns || []).push(fn);
    if (!el.hasAttribute("data-reveal")) { el.setAttribute("data-reveal", "none"); io.observe(el); }
  };
  function initReveal() {
    document.querySelectorAll("[data-reveal]").forEach(function (el) {
      if (!io) { el.classList.add("rv-in"); return; }
      if (el.getAttribute("data-reveal") !== "none") el.classList.add("rv-pre");
      io.observe(el);
    });
  }

  /* ---- Stroke drawing ---------------------------------------------------- */
  BP.prepPath = function (path) {
    var len = path.getTotalLength ? path.getTotalLength() : 0;
    path.style.transition = "none";
    path.style.strokeDasharray = len + " " + len;
    path.style.strokeDashoffset = BP.reduce ? 0 : len;
    return len;
  };
  BP.drawPath = function (path, ms, delay) {
    var len = BP.prepPath(path);
    if (BP.reduce) return;
    path.getBoundingClientRect();
    path.style.transition = "stroke-dashoffset " + (ms || 900) + "ms cubic-bezier(.6,0,.2,1) " + (delay || 0) + "ms";
    path.style.strokeDashoffset = 0;
    return len;
  };
  function initDraw() {
    document.querySelectorAll("[data-draw]").forEach(function (svg) {
      var paths = svg.querySelectorAll("path, line, polyline, circle, rect, ellipse, text");
      paths.forEach(function (p) { if (p.getTotalLength) BP.prepPath(p); });
      BP.onReveal(svg, function () {
        var base = +(svg.getAttribute("data-draw") || 0) || 0;
        paths.forEach(function (p, i) { if (p.getTotalLength) BP.drawPath(p, +(p.getAttribute("data-ms") || 1100), base + i * 90); });
      });
    });
  }

  /* ---- Count up --------------------------------------------------------- */
  BP.countTo = function (el, to, opts) {
    opts = opts || {};
    var dec = opts.decimals || 0, pre = opts.prefix || "", suf = opts.suffix || "", dur = opts.ms || 1100;
    function fmt(v) { return pre + v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf; }
    if (BP.reduce) { el.textContent = fmt(to); return; }
    var t0 = 0;
    function step(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  };
  function initCount() {
    document.querySelectorAll("[data-count-to]").forEach(function (el) {
      var to = parseFloat(el.getAttribute("data-count-to"));
      var o = { decimals: +(el.getAttribute("data-decimals") || 0), prefix: el.getAttribute("data-prefix") || "", suffix: el.getAttribute("data-suffix") || "", ms: +(el.getAttribute("data-ms") || 1100) };
      var host = el.closest("[data-reveal]") || el;
      BP.onReveal(host, function () { setTimeout(function () { BP.countTo(el, to, o); }, +(el.getAttribute("data-delay") || 0)); });
    });
  }

  /* ---- Leader lines ------------------------------------------------------
     Routes an orthogonal line from the right edge of `fromEl` out to a gutter,
     up or down, and into the right edge of `toEl` (or left edges with side:"left").
     The svg must be absolutely positioned over a common container. */
  BP.route = function (svg, path, fromEl, toEl, opts) {
    opts = opts || {};
    var host = svg.parentElement.getBoundingClientRect();
    var a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    svg.setAttribute("viewBox", "0 0 " + host.width + " " + host.height);
    var side = opts.side || "right", pad = opts.pad || 4;
    var y1 = a.top - host.top + a.height / 2, y2 = b.top - host.top + b.height / 2;
    var x1, x2, gx;
    if (side === "right") {
      x1 = a.right - host.left + pad; x2 = b.right - host.left + pad;
      gx = Math.max(x1, x2) + (opts.gutter || 18);
      gx = Math.min(gx, host.width - 3);
    } else {
      x1 = a.left - host.left - pad; x2 = b.left - host.left - pad;
      gx = Math.max(3, Math.min(x1, x2) - (opts.gutter || 18));
    }
    var r = 6, dy = y2 > y1 ? 1 : -1, sx = side === "right" ? 1 : -1;
    var d = "M" + x1 + " " + y1 + " H" + (gx - sx * r) +
      " Q" + gx + " " + y1 + " " + gx + " " + (y1 + dy * r) +
      " V" + (y2 - dy * r) +
      " Q" + gx + " " + y2 + " " + (gx - sx * r) + " " + y2 +
      " H" + x2;
    path.setAttribute("d", d);
    return { x: x2, y: y2 };
  };

  /* ---- FLIP ------------------------------------------------------------- */
  BP.flip = function (els, mutate, opts) {
    opts = opts || {};
    els = Array.prototype.slice.call(els);
    var first = new Map();
    els.forEach(function (el) { first.set(el, el.getBoundingClientRect()); });
    mutate();
    if (BP.reduce) return;
    els.forEach(function (el) {
      if (!el.isConnected) return;
      var f = first.get(el), l = el.getBoundingClientRect();
      if (!f) return;
      var dx = f.left - l.left, dy = f.top - l.top;
      if (!dx && !dy) return;
      el.animate([{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "none" }],
        { duration: opts.ms || 420, easing: "cubic-bezier(.32,.72,0,1)" });
    });
  };

  /* ---- CAD crosshair ---------------------------------------------------- */
  BP.crosshair = function (section) {
    if (BP.reduce || !section || !window.matchMedia("(pointer: fine)").matches) return;
    var box = document.createElement("div");
    box.className = "xhair";
    box.setAttribute("aria-hidden", "true");
    box.innerHTML = '<span class="xhair__h"></span><span class="xhair__v"></span><span class="xhair__read"></span>';
    section.appendChild(box);
    var read = box.querySelector(".xhair__read");
    var tx = 0, ty = 0, x = 0, y = 0, raf = 0, on = false;
    function tick() {
      x += (tx - x) * 0.28; y += (ty - y) * 0.28;
      box.style.setProperty("--x", x.toFixed(1) + "px");
      box.style.setProperty("--y", y.toFixed(1) + "px");
      read.textContent = "X " + String(Math.round(tx)).padStart(4, "0") + "  Y " + String(Math.round(ty)).padStart(4, "0");
      if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) raf = requestAnimationFrame(tick); else raf = 0;
    }
    section.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      var r = section.getBoundingClientRect();
      tx = e.clientX - r.left; ty = e.clientY - r.top;
      if (!on) { x = tx; y = ty; on = true; box.classList.add("is-on"); }
      box.classList.toggle("is-dim", !!e.target.closest("a, button, input, textarea, .hd"));
      if (!raf) raf = requestAnimationFrame(tick);
    });
    section.addEventListener("pointerleave", function () { on = false; box.classList.remove("is-on"); });
  };

  /* ---- Looping sequences -------------------------------------------------- */
  BP.loop = function (host, steps, period) {
    var timers = [], visible = true, running = false;
    function clear() { timers.forEach(clearTimeout); timers = []; }
    function run() {
      clear(); running = true;
      steps.forEach(function (s) { timers.push(setTimeout(s[1], s[0])); });
      if (!BP.reduce) timers.push(setTimeout(function () { if (visible && !document.hidden) run(); else running = false; }, period));
    }
    if ("IntersectionObserver" in window && !BP.reduce) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible && !running && !document.hidden) run();
      }, { threshold: 0.15 }).observe(host);
      document.addEventListener("visibilitychange", function () { if (!document.hidden && visible && !running) run(); });
    } else run();
    return { replay: run, stop: function () { clear(); running = false; } };
  };

  function init() { initReveal(); initDraw(); initCount(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
