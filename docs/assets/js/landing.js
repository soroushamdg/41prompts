/* ==========================================================================
   41prompts.ai landing page choreography.
   Sheet 01 (hero), Sheet 02 (how it works), bill of materials,
   attribution trace, footer wordmark. Uses BP from motion.js.
   ========================================================================== */
(function () {
  var BP = window.BP;

  /* ---- CAD crosshair over the hero ---------------------------------------- */
  BP.crosshair(document.querySelector(".hero"));

  /* ---- Sheet 01: paste → scan → split → run → trace ---------------------------- */
  var hd = document.getElementById("hd");
  var status = document.getElementById("hdStatus");
  var runs = hd.querySelectorAll(".hd__run");
  var svg = hd.querySelector(".hd__wire");
  var path = document.getElementById("hdPath");
  var dot = document.getElementById("hdDot");
  var cause = document.getElementById("hdCause");
  var fail = document.getElementById("hdFail");
  var callout = document.getElementById("hdCallout");

  function setStatus(t, bad) { status.textContent = t; status.classList.toggle("is-bad", !!bad); }
  function reset() {
    hd.classList.remove("is-scan", "is-split", "is-run", "is-trace");
    runs.forEach(function (r) { r.classList.remove("is-done"); });
    path.style.transition = "none";
    path.style.strokeDasharray = "2000";
    path.style.strokeDashoffset = "2000";
    setStatus("Pasted · 4 sentences");
  }
  function trace(instant) {
    var end = BP.route(svg, path, fail.querySelector(".hd__res"), cause, { side: "right", gutter: 22 });
    dot.setAttribute("cx", end.x);
    dot.setAttribute("cy", end.y);
    var host = svg.parentElement.getBoundingClientRect();
    var c = cause.getBoundingClientRect(), f = fail.getBoundingClientRect();
    callout.style.top = ((c.bottom + f.top) / 2 - host.top - 11) + "px";
    if (instant) { BP.prepPath(path); path.style.strokeDashoffset = 0; }
    else BP.drawPath(path, 1000);
  }
  function endState() {
    hd.classList.add("is-split", "is-run", "is-trace");
    runs.forEach(function (r) { r.classList.add("is-done"); });
    setStatus("Failure traced to B3", true);
    requestAnimationFrame(function () { trace(true); });
  }

  var seq = null;
  if (BP.reduce) {
    if (document.readyState === "complete") endState(); else window.addEventListener("load", endState);
  } else {
    seq = BP.loop(hd, [
      [0, reset],
      [700, function () { hd.classList.add("is-scan"); setStatus("Reading · decompiling"); }],
      [2000, function () { hd.classList.remove("is-scan"); hd.classList.add("is-split"); setStatus("4 bloks · 1 conflict", true); }],
      [3900, function () { hd.classList.add("is-run"); setStatus("Running on 3 models"); }],
      [4300, function () { runs[0].classList.add("is-done"); }],
      [4650, function () { runs[1].classList.add("is-done"); }],
      [5000, function () { runs[2].classList.add("is-done"); }],
      [6000, function () { hd.classList.add("is-trace"); trace(false); setStatus("Failure traced to B3", true); }]
    ], 11800);
  }
  document.getElementById("hdReplay").addEventListener("click", function () { if (seq) seq.replay(); });

  /* ---- Sheet 02: scroll-driven states ------------------------------------------- */
  var fig = document.getElementById("howFig");
  var cap = document.getElementById("howCap");
  var rev = document.getElementById("howRev");
  var steps = document.querySelectorAll(".how__step");
  var CAPS = { 1: "Sheet 02 · Pasted · 8 lines", 2: "Sheet 02 · 4 bloks", 3: "Sheet 02 · Compiled · 186 tokens" };
  var copyT, pressT;
  function setState(n) {
    n = String(n);
    if (fig.getAttribute("data-state") === n) return;
    fig.setAttribute("data-state", n);
    cap.textContent = CAPS[n];
    rev.textContent = "State " + n + "/3";
    steps.forEach(function (s) { s.classList.toggle("is-active", s.getAttribute("data-step") === n); });
    fig.classList.remove("is-copied", "is-press");
    clearTimeout(copyT); clearTimeout(pressT);
    if (n === "3") {
      copyT = setTimeout(function () {
        fig.classList.add("is-press");
        pressT = setTimeout(function () { fig.classList.remove("is-press"); fig.classList.add("is-copied"); }, 170);
      }, 2000);
    }
  }
  steps[0].classList.add("is-active");
  var wide = window.matchMedia("(min-width: 961px)");
  if (BP.reduce) {
    setState(3);
    steps.forEach(function (s) { s.classList.add("is-active"); });
  } else if ("IntersectionObserver" in window) {
    var sio = new IntersectionObserver(function (entries) {
      if (!wide.matches) return;
      entries.forEach(function (en) { if (en.isIntersecting) setState(en.target.getAttribute("data-step")); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach(function (s) { sio.observe(s); });
  }
  var cycle = null;
  function narrow() {
    if (BP.reduce) return;
    if (!wide.matches && !cycle) {
      var k = +fig.getAttribute("data-state");
      cycle = setInterval(function () { k = (k % 3) + 1; setState(k); }, 3600);
    } else if (wide.matches && cycle) { clearInterval(cycle); cycle = null; }
  }
  narrow();
  wide.addEventListener("change", narrow);
  document.querySelectorAll("[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () { setState(b.getAttribute("data-goto")); });
  });

  /* ---- Bill of materials: draw the ∞ marks ------------------------------------ */
  var bom = document.querySelector(".bom");
  var infs = bom.querySelectorAll(".inf path");
  infs.forEach(function (p) { BP.prepPath(p); });
  BP.onReveal(bom, function () { infs.forEach(function (p, i) { BP.drawPath(p, 1300, 350 + i * 110); }); });

  /* ---- P01 attribution: trace the failed cell to its blok ------------------------- */
  var attr = document.getElementById("attrDraw");
  var aSvg = attr.querySelector(".attr__wire");
  var aPath = document.getElementById("attrPath");
  function attrTrace(instant) {
    BP.route(aSvg, aPath, document.getElementById("attrCell"), document.getElementById("attrBlok"), { side: "right", gutter: 16, pad: 2 });
    if (instant) { BP.prepPath(aPath); aPath.style.strokeDashoffset = 0; }
    else BP.drawPath(aPath, 1000);
  }
  BP.onReveal(document.getElementById("attr"), function () {
    setTimeout(function () { attr.classList.add("is-traced"); attrTrace(BP.reduce); }, BP.reduce ? 0 : 1500);
  });

  /* ---- Footer wordmark draws itself ------------------------------------------------- */
  var mark = document.querySelector(".site-foot__mark text");
  if (mark && !BP.reduce) {
    mark.style.strokeDasharray = "2400 2400";
    mark.style.strokeDashoffset = "2400";
    BP.onReveal(document.querySelector(".site-foot__mark"), function () {
      mark.style.transition = "stroke-dashoffset 3400ms cubic-bezier(.6,0,.2,1), fill 800ms, stroke 400ms";
      mark.style.strokeDashoffset = "0";
    });
  }

  /* ---- Keep leader lines attached on resize ------------------------------------------ */
  var rT;
  window.addEventListener("resize", function () {
    clearTimeout(rT);
    rT = setTimeout(function () {
      if (hd.classList.contains("is-trace")) trace(true);
      if (attr.classList.contains("is-traced")) attrTrace(true);
    }, 120);
  });
})();
