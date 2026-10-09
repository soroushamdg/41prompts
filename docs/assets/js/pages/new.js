/* ==========================================================================
   New prompt (app.41prompts.ai/new)
   Live character/line count and variable detection; first-blok picker;
   name is slugified; Create shows a short saving state, then opens the editor.
   ========================================================================== */
(function () {
  var BP = window.BP;
  var text = document.getElementById("npText");
  var stats = document.getElementById("npStats");
  var vars = document.getElementById("npVars");
  var name = document.getElementById("npName");
  var seen = [];

  function scan() {
    var t = text.value, found = [], m, re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    while ((m = re.exec(t)) !== null) if (found.indexOf(m[1]) < 0) found.push(m[1]);
    var lines = t ? t.split("\n").length : 0;
    stats.textContent = t.length.toLocaleString("en-US") + " characters · " + lines + " lines · Markdown kept";
    /* Only animate chips that are new since the last scan. */
    vars.textContent = "";
    if (!found.length) { var none = document.createElement("span"); none.className = "muted"; none.textContent = "None"; vars.appendChild(none); }
    found.forEach(function (f) {
      var s = document.createElement("span");
      s.className = "var";
      s.textContent = "{{" + f + "}}";
      if (seen.indexOf(f) > -1) s.style.animation = "none";
      vars.appendChild(s);
    });
    seen = found;
  }
  text.addEventListener("input", scan);
  scan();

  name.addEventListener("blur", function () {
    name.value = name.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "untitled-prompt";
  });

  document.querySelectorAll(".np-type").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".np-type").forEach(function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); });
    });
  });

  var tabsLabel = { tabPaste: "Create prompt", tabBlank: "Create blank prompt" };
  document.addEventListener("tabshow", function (e) {
    document.getElementById("npCreateLabel").textContent = tabsLabel[e.target.id] || "Create prompt";
  });

  document.getElementById("npForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = document.getElementById("npCreate");
    btn.classList.add("is-busy");
    btn.disabled = true;
    document.getElementById("npCreateLabel").textContent = "Creating";
    setTimeout(function () { location.href = "editor.html"; }, BP.reduce ? 0 : 700);
  });
})();
