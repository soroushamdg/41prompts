/* ==========================================================================
   Library (app.41prompts.ai/)
   Search by name with highlight, sort, duplicate, rename, archive and delete
   with undo. Every layout change is animated with FLIP.
   ========================================================================== */
(function () {
  var BP = window.BP;
  var body = document.getElementById("libBody");
  var q = document.getElementById("libQ");
  var sort = document.getElementById("libSort");
  var empty = document.getElementById("libEmpty");
  var emptyQ = document.getElementById("libEmptyQ");
  var count = document.getElementById("libCount");
  var summary = document.getElementById("libSummary");

  function rows() { return Array.prototype.slice.call(body.querySelectorAll(".lib-row")); }
  function visible() { return rows().filter(function (r) { return !r.hidden; }); }
  function totals() {
    var all = rows(), v = 0;
    all.forEach(function (r) { v += +r.getAttribute("data-versions"); });
    count.textContent = all.length;
    summary.textContent = all.length + " prompts · " + v + " versions" + (q.value.trim() ? " · showing " + visible().length : "");
  }

  /* ---- Search by name (Free). Searching inside bloks is Performance. ---------- */
  function paintName(r, needle) {
    var a = r.querySelector(".lib-name a"), name = r.getAttribute("data-name");
    if (!needle) { a.textContent = name; return; }
    var i = name.indexOf(needle);
    a.textContent = "";
    a.appendChild(document.createTextNode(name.slice(0, i)));
    var m = document.createElement("mark"); m.className = "hit"; m.textContent = name.slice(i, i + needle.length);
    a.appendChild(m);
    a.appendChild(document.createTextNode(name.slice(i + needle.length)));
  }
  function filter() {
    var needle = q.value.trim().toLowerCase();
    BP.flip(rows(), function () {
      rows().forEach(function (r) {
        var hit = !needle || r.getAttribute("data-name").indexOf(needle) > -1;
        r.hidden = !hit;
        if (hit) paintName(r, needle);
      });
    });
    var none = visible().length === 0;
    empty.classList.toggle("is-on", none);
    emptyQ.textContent = q.value.trim();
    totals();
  }
  q.addEventListener("input", filter);
  document.getElementById("libClear").addEventListener("click", function () { q.value = ""; filter(); q.focus(); });

  /* ---- Sort -------------------------------------------------------------------- */
  sort.addEventListener("change", function () {
    var by = sort.value;
    var list = rows().sort(function (a, b) {
      if (by === "name") return a.getAttribute("data-name").localeCompare(b.getAttribute("data-name"));
      if (by === "versions") return b.getAttribute("data-versions") - a.getAttribute("data-versions");
      return a.getAttribute("data-order") - b.getAttribute("data-order");
    });
    BP.flip(rows(), function () { list.forEach(function (r) { body.appendChild(r); }); });
  });

  /* ---- Row actions -------------------------------------------------------------- */
  function removeRow(r, verb) {
    var next = r.nextElementSibling, name = r.getAttribute("data-name");
    r.classList.add("is-leaving");
    setTimeout(function () {
      var others = rows().filter(function (x) { return x !== r; });
      BP.flip(others, function () { r.remove(); });
      totals();
      BP.toast(verb + " " + name + ".", {
        action: "Undo", ms: 6000,
        onAction: function () {
          r.classList.remove("is-leaving");
          BP.flip(rows(), function () { body.insertBefore(r, next && next.isConnected ? next : null); });
          r.classList.remove("is-back"); void r.offsetWidth; r.classList.add("is-back");
          totals();
          BP.toast("Restored " + name + ".");
        }
      });
    }, BP.reduce ? 0 : 360);
  }
  function duplicate(r) {
    var name = r.getAttribute("data-name") + "-copy";
    var c = r.cloneNode(true);
    c.setAttribute("data-name", name);
    c.setAttribute("data-versions", "1");
    c.querySelector(".lib-name a").textContent = name;
    c.querySelectorAll("td")[2].textContent = "1";
    c.querySelectorAll("td")[3].textContent = "Just now";
    c.querySelectorAll("[aria-label]").forEach(function (b) { b.setAttribute("aria-label", b.getAttribute("aria-label").replace(r.getAttribute("data-name"), name)); });
    BP.flip(rows(), function () { r.after(c); });
    c.classList.add("is-back");
    totals();
    BP.toast("Duplicated as " + name + ".");
  }
  function rename(r) {
    var a = r.querySelector(".lib-name a"), old = r.getAttribute("data-name");
    var input = document.createElement("input");
    input.className = "input input--mono";
    input.value = old;
    input.setAttribute("aria-label", "New name for " + old);
    input.style.minHeight = "34px";
    a.replaceWith(input);
    input.focus(); input.select();
    function commit(save) {
      var v = save ? input.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") : old;
      if (!v) v = old;
      a.textContent = v;
      r.setAttribute("data-name", v);
      input.replaceWith(a);
      if (save && v !== old) BP.toast("Renamed to " + v + ".");
    }
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") commit(true); if (e.key === "Escape") commit(false); });
    input.addEventListener("blur", function () { if (input.isConnected) commit(true); });
  }
  body.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var r = b.closest(".lib-row"), act = b.getAttribute("data-act");
    if (act === "delete") removeRow(r, "Deleted");
    if (act === "archive") removeRow(r, "Archived");
    if (act === "dup") duplicate(r);
    if (act === "rename") rename(r);
  });

  /* Rows cascade in on load. */
  if (!BP.reduce) rows().forEach(function (r, i) {
    r.style.animation = "rise 600ms var(--ease-brand) " + (80 + i * 45) + "ms both";
    r.addEventListener("animationend", function () { r.style.animation = ""; }, { once: true });
  });
  totals();
})();
