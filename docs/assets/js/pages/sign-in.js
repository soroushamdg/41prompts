/* ==========================================================================
   Sign in (app.41prompts.ai/sign-in)
   - #start and #performance change the heading and the hand-off.
   - Email link flow: validate → sending → "check your inbox" (envelope draws).
   - Sheet 00: the logo is constructed on its 64-unit grid, then morphs
     41 ↔ AI with every vertex marked and its coordinates ticking live.
   ========================================================================== */
(function () {
  var BP = window.BP;
  var hash = location.hash.replace("#", "");
  var title = document.getElementById("authTitle");
  var perf = document.getElementById("authPerf");
  var after = hash === "performance" ? "settings.html#billing" : "library.html";
  if (hash === "start" || hash === "performance") title.textContent = "Create your account";
  if (hash === "performance") perf.classList.add("is-on");
  document.getElementById("openLink").setAttribute("href", after);
  document.querySelectorAll("[data-oauth]").forEach(function (a) { a.setAttribute("href", after); });

  /* ---- Email link form ------------------------------------------------------- */
  var form = document.getElementById("authForm"), email = document.getElementById("email");
  var err = document.getElementById("emailErr"), btn = document.getElementById("sendBtn"), label = document.getElementById("sendLabel");
  var sent = document.getElementById("authSent"), sentTo = document.getElementById("sentTo");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
      err.classList.add("is-on");
      email.classList.add("is-bad");
      email.setAttribute("aria-invalid", "true");
      email.animate && !BP.reduce && email.animate([{ transform: "translateX(-5px)" }, { transform: "translateX(4px)" }, { transform: "translateX(-2px)" }, { transform: "none" }], { duration: 320 });
      email.focus();
      return;
    }
    err.classList.remove("is-on");
    email.classList.remove("is-bad");
    email.removeAttribute("aria-invalid");
    btn.classList.add("is-busy");
    btn.disabled = true;
    label.textContent = "Sending link";
    setTimeout(function () {
      form.hidden = true;
      sentTo.textContent = v;
      sent.classList.add("is-on");
      sent.querySelectorAll(".env rect, .env path").forEach(function (p, i) {
        p.style.transition = BP.reduce ? "none" : "stroke-dashoffset 900ms cubic-bezier(.6,0,.2,1) " + (150 + i * 350) + "ms";
        requestAnimationFrame(function () { p.style.strokeDashoffset = 0; });
      });
      btn.classList.remove("is-busy"); btn.disabled = false; label.textContent = "Email me a sign-in link";
    }, BP.reduce ? 0 : 900);
  });
  email.addEventListener("input", function () { if (err.classList.contains("is-on")) { err.classList.remove("is-on"); email.classList.remove("is-bad"); } });
  document.getElementById("resetBtn").addEventListener("click", function () {
    sent.classList.remove("is-on");
    sent.querySelectorAll(".env rect, .env path").forEach(function (p) { p.style.transition = "none"; p.style.strokeDashoffset = 1; });
    form.hidden = false;
    email.focus();
  });

  /* ---- Sheet 00: mark construction ---------------------------------------------- */
  var ms = document.getElementById("ms");
  if (!ms || ms.offsetParent === null) return;
  var NS = "http://www.w3.org/2000/svg";
  var grid = document.getElementById("msGrid");
  var minor = "", major = "";
  for (var u = 0; u <= 64; u += 4) {
    var line = "M" + u + " 0V64M0 " + u + "H64";
    if (u % 16 === 0) major += line; else minor += line;
  }
  [[minor, "", 0], [major, "maj", 200]].forEach(function (g) {
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", g[0]);
    if (g[1]) p.setAttribute("class", g[1]);
    p.setAttribute("pathLength", "1");
    p.setAttribute("data-draw-me", "");
    p.style.setProperty("--ms", "1600ms");
    p.style.setProperty("--dl", g[2] + "ms");
    grid.appendChild(p);
  });

  var G = window.logoShapes;
  var vx = document.getElementById("msVx");
  var L = document.getElementById("msL"), R = document.getElementById("msR");
  var stateLabel = document.getElementById("msState");
  /* Vertex sets in drawing order, with four of them labelled. */
  var SETS = [["four", "A", "outer"], ["four", "A", "inner"], ["one", "I", "outer"]];
  var LABELLED = { "four-outer-0": 1, "four-outer-2": 1, "four-outer-8": 1, "one-outer-2": 1 };
  var marks = [];
  SETS.forEach(function (s) {
    G[s[0]][s[2]].forEach(function (pt, i) {
      var key = s[0] + "-" + s[2] + "-" + i;
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("r", ".85");
      c.style.transitionDelay = (marks.length * 45) + "ms";
      vx.appendChild(c);
      var t = null;
      if (LABELLED[key]) {
        t = document.createElementNS(NS, "text");
        t.style.transitionDelay = (marks.length * 45 + 200) + "ms";
        vx.appendChild(t);
      }
      marks.push({ from: G[s[0]][s[2]][i], to: G[s[1]][s[2]][i], c: c, t: t });
    });
  });
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function draw(v) {
    var paths = window.logoPaths(v), e = ease(v);
    L.setAttribute("d", paths.left);
    R.setAttribute("d", paths.right);
    marks.forEach(function (m) {
      var x = m.from[0] + (m.to[0] - m.from[0]) * e, y = m.from[1] + (m.to[1] - m.from[1]) * e;
      m.c.setAttribute("cx", x.toFixed(2));
      m.c.setAttribute("cy", y.toFixed(2));
      if (m.t) {
        m.t.setAttribute("x", (x + 1.4).toFixed(2));
        m.t.setAttribute("y", (y - 1.2).toFixed(2));
        m.t.textContent = x.toFixed(1).replace(".0", "") + "," + y.toFixed(1).replace(".0", "");
      }
    });
  }
  draw(0);

  if (BP.reduce) { ms.classList.add("is-drawn", "is-dims", "is-vx", "is-solid"); stateLabel.textContent = "41 · rest"; return; }

  var v = 0, target = 0, raf = 0, last = 0, DUR = 900;
  function step(now) {
    if (!last) last = now;
    var dt = Math.min(64, now - last); last = now;
    var dir = target > v ? 1 : -1;
    v += dir * dt / DUR;
    if ((dir > 0 && v >= target) || (dir < 0 && v <= target)) { v = target; raf = 0; last = 0; draw(v); stateLabel.textContent = (v ? "AI" : "41") + " · rest"; return; }
    draw(v);
    stateLabel.textContent = "Morph · " + Math.round(ease(v) * 100) + "%";
    raf = requestAnimationFrame(step);
  }
  function go(t) { target = t; if (!raf) raf = requestAnimationFrame(step); }

  requestAnimationFrame(function () { ms.getBoundingClientRect(); ms.classList.add("is-drawn"); });
  setTimeout(function () { ms.classList.add("is-dims"); }, 1500);
  setTimeout(function () { ms.classList.add("is-vx"); }, 2600);
  setTimeout(function () { ms.classList.add("is-solid"); }, 3900);
  setTimeout(function cycle() {
    if (!document.hidden) go(target ? 0 : 1);
    setTimeout(cycle, 3200);
  }, 5200);
})();
