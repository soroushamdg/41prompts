/* ==========================================================================
   41prompts shared UI behaviour. No dependencies.

   BP.toast(msg, {action, onAction, ms})   status toast, optional action (Undo)
   [data-copy="#selector"]                  copies that element's text;
                                            <span data-label> swaps to "Copied"
   [data-dialog-open="id"] / [data-dialog-close]   open and close <dialog>
   [data-perf="Feature name"]               Performance-gated control: on the
                                            Free plan it opens #upgrade and names
                                            the feature in [data-perf-name]
   [role=tablist] > [role=tab][aria-controls]       tabs with panels
   [data-search]                            focused by Cmd/Ctrl+K
   ========================================================================== */
(function () {
  var BP = (window.BP = window.BP || {});

  /* ---- Toast --------------------------------------------------------------- */
  var toastEl, toastTimer;
  BP.toast = function (msg, opts) {
    opts = opts || {};
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = "";
    var s = document.createElement("span");
    s.textContent = msg;
    toastEl.appendChild(s);
    if (opts.action) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn--primary btn--sm";
      b.textContent = opts.action;
      b.addEventListener("click", function () { hide(); if (opts.onAction) opts.onAction(); });
      toastEl.appendChild(b);
    }
    requestAnimationFrame(function () { toastEl.classList.add("is-on"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hide, opts.ms || 4200);
    function hide() { toastEl.classList.remove("is-on"); }
  };

  /* ---- Copy ---------------------------------------------------------------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy]");
    if (!b) return;
    var src = document.querySelector(b.getAttribute("data-copy"));
    var text = src ? (src.getAttribute("data-copy-text") || src.innerText || src.textContent) : "";
    var label = b.querySelector("[data-label]");
    function done() {
      b.classList.add("is-done");
      if (label) {
        if (!label.hasAttribute("data-label-orig")) label.setAttribute("data-label-orig", label.textContent);
        label.textContent = b.getAttribute("data-done") || "Copied";
      }
      clearTimeout(b._t);
      b._t = setTimeout(function () {
        b.classList.remove("is-done");
        if (label) label.textContent = label.getAttribute("data-label-orig");
      }, 1800);
    }
    try { navigator.clipboard.writeText(text).then(done, done); } catch (err) { done(); }
  });

  /* ---- Dialogs ------------------------------------------------------------- */
  BP.openDialog = function (id) {
    var d = document.getElementById(id);
    if (d && d.showModal && !d.open) d.showModal();
    return d;
  };
  document.addEventListener("click", function (e) {
    var o = e.target.closest("[data-dialog-open]");
    if (o) { e.preventDefault(); BP.openDialog(o.getAttribute("data-dialog-open")); return; }
    var c = e.target.closest("[data-dialog-close]");
    if (c) { var d = c.closest("dialog"); if (d) d.close(); return; }
    if (e.target.tagName === "DIALOG") e.target.close();
  });

  /* ---- Performance gating ---------------------------------------------------
     On the Free plan every Performance control stays visible, marked with the
     stamp, and opens the upgrade sheet instead of running. */
  document.addEventListener("click", function (e) {
    var p = e.target.closest("[data-perf]");
    if (!p || document.documentElement.getAttribute("data-plan") === "performance") return;
    e.preventDefault();
    var d = document.getElementById("upgrade");
    if (!d) return;
    d.querySelectorAll("[data-perf-name]").forEach(function (n) { n.textContent = p.getAttribute("data-perf"); });
    BP.openDialog("upgrade");
  });

  /* ---- Tabs ---------------------------------------------------------------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest('[role="tab"][aria-controls]');
    if (!t) return;
    var list = t.closest('[role="tablist"]');
    list.querySelectorAll('[role="tab"]').forEach(function (x) {
      var on = x === t;
      x.setAttribute("aria-selected", on ? "true" : "false");
      x.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(x.getAttribute("aria-controls"));
      if (panel) { panel.hidden = !on; if (on) { panel.classList.remove("panel-in"); void panel.offsetWidth; panel.classList.add("panel-in"); } }
    });
    t.dispatchEvent(new CustomEvent("tabshow", { bubbles: true }));
  });

  /* ---- Cmd/Ctrl+K focuses search -------------------------------------------- */
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      var s = document.querySelector("[data-search]");
      if (s) { e.preventDefault(); s.focus(); s.select && s.select(); }
    }
  });
})();
