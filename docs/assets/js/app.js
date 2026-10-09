/* ==========================================================================
   app.41prompts.ai shared behaviour.
   - Injects the upgrade sheet (#upgrade) used by every Performance control.
   - Closes open menus on outside click and Escape.
   Plan state lives on <html data-plan="free|performance">. The mockup is the
   Free plan, so every [data-perf] control opens the upgrade sheet.
   ========================================================================== */
(function () {
  var BP = window.BP;

  /* ---- Upgrade sheet ------------------------------------------------------------ */
  var PERKS = [
    ["P01", "Failure attribution to the exact blok"],
    ["P02", "Linter for repeats, conflicts and untestable lines"],
    ["P03", "Decompiler: long prompts split into bloks"],
    ["P04", "Tests from expects bloks"],
    ["P05", "GPT, Claude and Gemini side by side, with cost and latency"],
    ["P06", "Search inside prompts, tags and filters"],
    ["P07", "Semantic diffs between versions"],
    ["P08", "Shared workspaces with roles"],
    ["D01", "Public share pages"],
    ["D02", "Typed function export"]
  ];
  if (!document.getElementById("upgrade")) {
    var li = PERKS.map(function (p, i) {
      return '<li style="--k:' + i + '"><span class="mono">' + p[0] + "</span>" + p[1] + "</li>";
    }).join("");
    document.body.insertAdjacentHTML("beforeend",
      '<dialog class="dlg" id="upgrade" aria-labelledby="upgradeTitle">' +
        '<div class="dlg__panel frame">' +
          '<button type="button" class="btn btn--icon btn--sm btn--bare dlg__close" data-dialog-close aria-label="Close"><svg class="i" aria-hidden="true"><use href="#i-x"></use></svg></button>' +
          '<span class="stamp upg__stamp">Performance</span>' +
          '<h2 class="upg__title" id="upgradeTitle"><span data-perf-name>This tool</span> is part of Performance.</h2>' +
          '<p class="upg__p">Free stays unlimited for writing, saving and copying prompts. Performance adds the tools that test, measure and share them.</p>' +
          '<ul class="upg__list">' + li + "</ul>" +
          '<p class="upg__price"><b>$TBD</b> / month · billed through Stripe · cancel anytime</p>' +
          '<div class="upg__actions"><button type="button" class="btn" data-dialog-close>Not now</button>' +
          '<a class="btn btn--primary" href="settings.html#billing" data-upgrade><span class="upg__spin" aria-hidden="true"></span><span data-label>Upgrade with Stripe</span></a></div>' +
        "</div>" +
      "</dialog>");
  }

  /* Checkout hand-off: Stripe Checkout is a hosted page. The mockup shows the
     loading state, then lands on Settings > Plan and billing. */
  document.addEventListener("click", function (e) {
    var u = e.target.closest("[data-upgrade]");
    if (!u) return;
    e.preventDefault();
    u.classList.add("is-busy");
    var l = u.querySelector("[data-label]");
    if (l) l.textContent = "Opening Stripe Checkout";
    setTimeout(function () { location.href = u.getAttribute("href"); }, BP && BP.reduce ? 0 : 1100);
  });

  /* ---- Menus ------------------------------------------------------------------- */
  document.addEventListener("click", function (e) {
    document.querySelectorAll("details.menu[open]").forEach(function (m) { if (!m.contains(e.target)) m.removeAttribute("open"); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") document.querySelectorAll("details.menu[open]").forEach(function (m) { m.removeAttribute("open"); m.querySelector("summary").focus(); });
  });
})();
