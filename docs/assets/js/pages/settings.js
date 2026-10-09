/* ==========================================================================
   Settings (app.41prompts.ai/settings)
   Scroll-spy section nav; key test and save with a live connection state;
   Stripe Checkout hand-off state; export progress; typed delete confirmation.
   ========================================================================== */
(function () {
  var BP = window.BP;

  /* ---- Scroll-spy ----------------------------------------------------------- */
  var links = Array.prototype.slice.call(document.querySelectorAll("#setNav a"));
  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle("is-on", a.getAttribute("href") === "#" + en.target.id); });
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    document.querySelectorAll(".set-sec").forEach(function (s) { spy.observe(s); });
  }

  /* Arriving from an upgrade link: point at the Performance card. */
  if (location.hash === "#billing") {
    var card = document.querySelector(".plancard--perf");
    setTimeout(function () {
      card.style.setProperty("--cl", "26px");
      if (!BP.reduce) card.animate([{ boxShadow: "0 0 0 0 rgba(233,241,255,.45)" }, { boxShadow: "0 0 0 14px rgba(233,241,255,0)" }], { duration: 1100, easing: "ease-out" });
      setTimeout(function () { card.style.removeProperty("--cl"); }, 1200);
    }, 500);
  }

  /* ---- Keys: test connection -------------------------------------------------- */
  document.querySelectorAll("[data-test]").forEach(function (b) {
    b.addEventListener("click", function () {
      var row = b.closest(".set-row"), st = row.querySelector(".keystate"), lbl = st.querySelector("span:last-child");
      st.classList.remove("is-ok"); st.classList.add("is-test");
      lbl.textContent = "Testing";
      b.disabled = true;
      setTimeout(function () {
        st.classList.remove("is-test"); st.classList.add("is-ok");
        lbl.textContent = "Works · 212 ms";
        b.disabled = false;
        setTimeout(function () { lbl.textContent = "Connected"; }, 2600);
      }, BP.reduce ? 0 : 1100);
    });
  });
  document.querySelectorAll("[data-remove]").forEach(function (b) {
    b.addEventListener("click", function () { BP.toast("In the product this asks you to confirm before removing the key."); });
  });

  /* ---- Keys: save the missing Google key ------------------------------------------ */
  var gKey = document.getElementById("gKey"), gSave = document.getElementById("gSave"), gForm = document.getElementById("gForm"), gState = document.getElementById("gState");
  gKey.addEventListener("input", function () { gSave.disabled = gKey.value.trim().length < 8; });
  gForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (gSave.disabled) return;
    var last4 = gKey.value.trim().slice(-4);
    gState.classList.add("is-test");
    gState.querySelector("span:last-child").textContent = "Checking key";
    gSave.disabled = true;
    setTimeout(function () {
      gState.classList.remove("is-test"); gState.classList.add("is-ok");
      gState.querySelector("span:last-child").textContent = "Connected";
      var main = document.querySelector("#googleRow .set-row__main span");
      main.className = "mono";
      main.textContent = "Key ending " + last4 + " · added just now";
      gForm.outerHTML = '<span style="display: flex; gap: 8px"><button class="btn btn--sm" type="button" disabled>Test connection</button><button class="btn btn--sm" type="button" aria-label="Remove Google key">Remove</button></span>';
      BP.toast("Google key saved. All 3 providers are connected.");
    }, BP.reduce ? 0 : 1200);
  });

  /* ---- Stripe Checkout hand-off --------------------------------------------------- */
  var checkout = document.getElementById("checkout");
  checkout.addEventListener("click", function (e) {
    e.preventDefault();
    checkout.classList.add("is-busy");
    document.getElementById("checkoutLabel").textContent = "Opening Stripe Checkout";
    setTimeout(function () {
      checkout.classList.remove("is-busy");
      document.getElementById("checkoutLabel").textContent = "Upgrade with Stripe";
      document.getElementById("stripeState").classList.add("is-on");
    }, BP.reduce ? 0 : 1400);
  });

  /* ---- Export ---------------------------------------------------------------------- */
  var exportBtn = document.getElementById("exportBtn"), exportState = document.getElementById("exportState");
  var bar = document.getElementById("exportBar"), elabel = document.getElementById("exportLabel");
  exportBtn.addEventListener("click", function () {
    exportBtn.disabled = true;
    exportState.classList.add("is-on");
    var p = 0, steps = ["Packing 8 prompts, 48 versions", "Writing Markdown", "Writing JSON", "Compressing"];
    var t = setInterval(function () {
      p = Math.min(100, p + 7 + Math.random() * 12);
      bar.style.width = p + "%";
      elabel.textContent = steps[Math.min(steps.length - 1, Math.floor(p / 26))] + " · " + Math.round(p) + "%";
      if (p >= 100) {
        clearInterval(t);
        elabel.textContent = "Ready · 41prompts-export-2026-10-09.zip · 184 KB";
        exportBtn.disabled = false;
        exportBtn.lastChild.textContent = "Download .zip";
      }
    }, BP.reduce ? 1 : 140);
  });

  /* ---- Delete account: typed confirmation -------------------------------------------- */
  var del = document.getElementById("delConfirm"), delBtn = document.getElementById("delBtn");
  del.addEventListener("input", function () { delBtn.disabled = del.value !== "DELETE"; });
  document.getElementById("delForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (del.value !== "DELETE") {
      del.classList.remove("is-shake"); void del.offsetWidth; del.classList.add("is-shake");
      return;
    }
    BP.toast("In the product this deletes everything and signs you out.");
  });
})();
