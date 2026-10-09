/* ==========================================================================
   Editor (app.41prompts.ai/p/:slug)
   - Bloks: edit in place, add, duplicate, delete with undo, reorder by drag
     (pointer) or keyboard (grip + arrow keys). Layout changes use FLIP.
   - Compiled prompt rebuilds live; hovering a blok highlights its span and
     back. Expects bloks never reach the compiled prompt.
   - Autosave: every change burst becomes a new version in History.
   - Run (Free): streams one reply from one model on the user's key.
   ========================================================================== */
(function () {
  var BP = window.BP;
  var list = document.getElementById("bloks");
  var compiledEl = document.getElementById("compiled");
  var tok = document.getElementById("tokCount");
  var counts = document.getElementById("edCounts");
  var live = document.getElementById("edLive");
  var varInput = document.getElementById("varName");
  var promptName = document.getElementById("promptName");
  var mode = "template";
  var nextId = 5;
  var LABEL = { context: "Context", constraint: "Constraint", example: "Example", expects: "Expects" };
  var PH = {
    context: "Who the model is and the world it works in.",
    constraint: "A rule on length, tone or format.",
    example: "A sample input and the reply you want back.",
    expects: "What a good answer always does. Becomes a test, not prompt text."
  };
  var VAR = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

  function bloks() { return Array.prototype.slice.call(list.querySelectorAll(".blok")); }
  function textOf(b) { return b.querySelector(".blok__text").innerText.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim(); }
  function say(msg) { live.textContent = msg; }

  /* ---- Variables are highlighted whenever a blok is not being edited --------- */
  function paintVars(p) {
    var t = p.innerText.replace(/\n{3,}/g, "\n\n");
    p.textContent = "";
    var last = 0;
    t.replace(VAR, function (m, name, idx) {
      p.appendChild(document.createTextNode(t.slice(last, idx)));
      var s = document.createElement("span"); s.className = "var"; s.textContent = m;
      p.appendChild(s);
      last = idx + m.length;
      return m;
    });
    p.appendChild(document.createTextNode(t.slice(last)));
  }

  /* ---- Compile ---------------------------------------------------------------- */
  function compile(flashId) {
    var plain = [], vars = {};
    var fill = varInput.value.trim();
    compiledEl.textContent = "";
    bloks().forEach(function (b) {
      var type = b.getAttribute("data-type"), id = b.getAttribute("data-id"), t = textOf(b);
      (t.match(VAR) || []).forEach(function (v) { vars[v.replace(/[{}\s]/g, "")] = 1; });
      if (type === "expects") return;
      var row = document.createElement("div");
      row.className = "cseg"; row.setAttribute("data-type", type); row.setAttribute("data-for", id);
      var idEl = document.createElement("span"); idEl.className = "cseg__id"; idEl.textContent = id;
      var tx = document.createElement("span"); tx.className = "cseg__t";
      var last = 0, out = "";
      t.replace(VAR, function (m, v, idx) {
        tx.appendChild(document.createTextNode(t.slice(last, idx)));
        var val = mode === "filled" && v === "customer_name" && fill ? fill : m;
        var s = document.createElement("span"); s.className = "cvar"; s.textContent = val;
        tx.appendChild(s);
        out += t.slice(last, idx) + val;
        last = idx + m.length;
        return m;
      });
      tx.appendChild(document.createTextNode(t.slice(last)));
      out += t.slice(last);
      row.appendChild(idEl); row.appendChild(tx);
      if (flashId === id) row.classList.add("is-flash");
      compiledEl.appendChild(row);
      plain.push(out);
    });
    var full = plain.join("\n\n");
    compiledEl.setAttribute("data-copy-text", full);
    tok.textContent = "≈ " + Math.round(full.length / 4) + " tokens · " + full.length.toLocaleString("en-US") + " chars";
    var nb = bloks().length, nv = Object.keys(vars).length;
    counts.textContent = nb + (nb === 1 ? " blok" : " bloks") + " · " + nv + (nv === 1 ? " variable" : " variables");
  }

  /* ---- Hover sync between bloks and compiled spans --------------------------- */
  function hot(id, on) {
    var b = list.querySelector('.blok[data-id="' + id + '"]');
    if (b) b.classList.toggle("is-hot", on);
    var c = compiledEl.querySelector('[data-for="' + id + '"]');
    if (c) {
      c.classList.toggle("is-hot", on);
      if (on) {
        var top = c.offsetTop - 8, bottom = c.offsetTop + c.offsetHeight + 8;
        if (top < compiledEl.scrollTop || bottom > compiledEl.scrollTop + compiledEl.clientHeight) compiledEl.scrollTo({ top: top, behavior: BP.reduce ? "auto" : "smooth" });
      }
    }
  }
  var hotB = null;
  list.addEventListener("mouseover", function (e) {
    var b = e.target.closest(".blok");
    if (!b || (b === hotB)) return;
    if (hotB) hot(hotB.getAttribute("data-id"), false);
    hotB = b; hot(b.getAttribute("data-id"), true);
  });
  list.addEventListener("mouseleave", function () { if (hotB && !drag) { hot(hotB.getAttribute("data-id"), false); hotB = null; } });
  compiledEl.addEventListener("mouseover", function (e) {
    var c = e.target.closest(".cseg");
    compiledEl.querySelectorAll(".cseg").forEach(function (x) { if (x !== c) hot(x.getAttribute("data-for"), false); });
    if (c) { var b = list.querySelector('.blok[data-id="' + c.getAttribute("data-for") + '"]'); if (b) b.classList.add("is-hot"); c.classList.add("is-hot"); }
  });
  compiledEl.addEventListener("mouseleave", function () { compiledEl.querySelectorAll(".cseg").forEach(function (x) { hot(x.getAttribute("data-for"), false); }); });

  /* ---- Autosave → versions --------------------------------------------------- */
  var ver = 7, saveT, note = null;
  var saveState = document.getElementById("saveState"), saveLabel = document.getElementById("saveLabel");
  var sheetNo = document.getElementById("sheetNo"), histCount = document.getElementById("histCount"), vlist = document.getElementById("vlist");
  function dirty(n) {
    if (n) note = n;
    saveState.classList.add("is-saving");
    saveLabel.textContent = "Saving";
    clearTimeout(saveT);
    saveT = setTimeout(commit, 900);
  }
  function commit() {
    ver++;
    saveState.classList.remove("is-saving");
    saveLabel.textContent = "Saved · v" + ver;
    sheetNo.textContent = "Sheet 07 · Rev " + ver + " · Private";
    histCount.textContent = ver;
    addVersion(ver, note || "Edited");
    note = null;
    var item = document.querySelector('.ed-rail__item[aria-current="page"]');
    if (item) { item.querySelector("b span").textContent = "v" + ver; item.querySelector(":scope > span").textContent = "Just now"; }
  }
  function addVersion(v, text) {
    var cur = vlist.querySelector(".vrow.is-current");
    if (cur) {
      cur.classList.remove("is-current");
      var c = cur.querySelector(".vcur");
      if (c) {
        var acts = document.createElement("span"); acts.className = "vacts";
        acts.innerHTML = '<button class="btn btn--sm" type="button" data-restore="' + cur.getAttribute("data-v") + '">Restore</button>';
        c.replaceWith(acts);
      }
    }
    var row = document.createElement("div");
    row.className = "vrow is-current is-new"; row.setAttribute("data-v", v);
    row.innerHTML = '<span class="vdot"><span></span></span><div class="vmain"><div class="vmain__top"><span class="mono">v' + v + '</span><span class="when">Just now</span></div><div class="vmain__note"></div></div><span class="vcur">CURRENT</span>';
    row.querySelector(".vmain__note").textContent = text;
    vlist.prepend(row);
  }

  /* ---- Editing text ------------------------------------------------------------ */
  list.addEventListener("input", function (e) {
    var p = e.target.closest(".blok__text");
    if (!p) return;
    var id = p.closest(".blok").getAttribute("data-id");
    compile(); hot(id, true);
    dirty("Edited " + id);
  });
  list.addEventListener("focusin", function (e) { var p = e.target.closest(".blok__text"); if (p) hot(p.closest(".blok").getAttribute("data-id"), true); });
  list.addEventListener("focusout", function (e) {
    var p = e.target.closest(".blok__text");
    if (!p) return;
    paintVars(p);
    hot(p.closest(".blok").getAttribute("data-id"), false);
  });
  list.addEventListener("paste", function (e) {
    var p = e.target.closest(".blok__text");
    if (!p) return;
    e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
  });

  /* ---- Create, duplicate, delete ------------------------------------------------ */
  function makeBlok(type, text) {
    var id = "B" + (nextId++);
    var s = document.createElement("section");
    s.className = "blok frame"; s.setAttribute("data-type", type); s.setAttribute("data-id", id);
    s.setAttribute("aria-label", LABEL[type] + " blok " + id);
    s.innerHTML =
      '<button class="grip" type="button" aria-label="Move blok ' + id + '. Drag, or press the up and down arrow keys."><svg class="i" aria-hidden="true"><use href="#i-grip"></use></svg></button>' +
      '<div class="blok__main"><div class="blok__head"><span class="blok__type"></span><span class="blok__id"></span>' +
      '<span class="blok__tools"><button class="btn btn--icon btn--sm btn--bare" type="button" data-act="dup" aria-label="Duplicate blok ' + id + '"><svg class="i" aria-hidden="true"><use href="#i-copy"></use></svg></button>' +
      '<button class="btn btn--icon btn--sm btn--bare" type="button" data-act="del" aria-label="Delete blok ' + id + '"><svg class="i" aria-hidden="true"><use href="#i-trash"></use></svg></button></span></div>' +
      '<p class="blok__text" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true"></p>' +
      (type === "expects" ? '<div class="blok__foot"><span class="blok__note">Becomes a test · not in the prompt</span><button class="btn btn--sm btn--locked blok__runtest" type="button" data-perf="Tests">Run as test <span class="stamp">Performance</span></button></div>' : "") +
      '</div>';
    s.querySelector(".blok__type").textContent = LABEL[type];
    s.querySelector(".blok__id").textContent = id;
    var p = s.querySelector(".blok__text");
    p.setAttribute("aria-label", "Text of blok " + id);
    p.setAttribute("data-placeholder", PH[type]);
    p.textContent = text || "";
    return s;
  }
  function enter(b) {
    b.classList.add("is-new");
    b.addEventListener("animationend", function () { b.classList.remove("is-new"); }, { once: true });
  }
  document.querySelector(".addbar").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-add]");
    if (!btn) return;
    var type = btn.getAttribute("data-add");
    var nb = makeBlok(type, "");
    BP.flip(bloks(), function () { list.appendChild(nb); });
    enter(nb);
    nb.scrollIntoView({ block: "nearest", behavior: BP.reduce ? "auto" : "smooth" });
    nb.querySelector(".blok__text").focus();
    compile();
    dirty("Added " + nb.getAttribute("data-id"));
    say(LABEL[type] + " blok added.");
  });
  function dup(b) {
    var nb = makeBlok(b.getAttribute("data-type"), textOf(b));
    paintVars(nb.querySelector(".blok__text"));
    BP.flip(bloks(), function () { b.after(nb); });
    enter(nb);
    compile(nb.getAttribute("data-id"));
    dirty("Duplicated " + b.getAttribute("data-id"));
    say("Blok duplicated as " + nb.getAttribute("data-id") + ".");
  }
  function del(b) {
    var id = b.getAttribute("data-id"), next = b.nextElementSibling;
    b.classList.add("is-leaving");
    setTimeout(function () {
      var others = bloks().filter(function (x) { return x !== b; });
      BP.flip(others, function () { b.remove(); });
      if (hotB === b) hotB = null;
      compile();
      dirty("Deleted " + id);
      BP.toast("Deleted blok " + id + ".", {
        action: "Undo", ms: 6000,
        onAction: function () {
          b.classList.remove("is-leaving", "is-hot");
          BP.flip(bloks(), function () { list.insertBefore(b, next && next.isConnected ? next : null); });
          enter(b);
          compile(id);
          dirty("Restored " + id);
        }
      });
    }, BP.reduce ? 0 : 280);
  }
  list.addEventListener("click", function (e) {
    var a = e.target.closest("[data-act]");
    if (!a) return;
    var b = a.closest(".blok");
    if (a.getAttribute("data-act") === "dup") dup(b);
    if (a.getAttribute("data-act") === "del") del(b);
  });

  /* ---- Reorder: drag the grip ---------------------------------------------------
     The lifted blok follows the pointer; when its centre crosses a neighbour's
     centre it moves in the DOM, neighbours slide with FLIP, and the drag origin
     is corrected so the blok stays under the pointer. */
  var drag = null;
  function nextBlok(b) { var n = b.nextElementSibling; while (n && !n.classList.contains("blok")) n = n.nextElementSibling; return n; }
  function layoutTop(b) { var t = b.style.transform; b.style.transform = "none"; var y = b.getBoundingClientRect().top; b.style.transform = t; return y; }
  list.addEventListener("pointerdown", function (e) {
    var g = e.target.closest(".grip");
    if (!g || e.button !== 0) return;
    e.preventDefault();
    var b = g.closest(".blok");
    g.setPointerCapture(e.pointerId);
    drag = { b: b, startY: e.clientY, originY: e.clientY, moved: false };
    b.classList.add("is-lifted");
    hot(b.getAttribute("data-id"), true);
  });
  list.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var b = drag.b;
    if (Math.abs(e.clientY - drag.originY) > 3) drag.moved = true;
    b.style.transform = "translateY(" + (e.clientY - drag.startY) + "px) scale(1.012)";
    var r = b.getBoundingClientRect(), mid = r.top + r.height / 2;
    var sibs = bloks().filter(function (x) { return x !== b; });
    var target = null;
    for (var i = 0; i < sibs.length; i++) {
      var sr = sibs[i].getBoundingClientRect();
      if (mid < sr.top + sr.height / 2) { target = sibs[i]; break; }
    }
    if (target !== nextBlok(b)) {
      var before = layoutTop(b);
      BP.flip(sibs, function () { list.insertBefore(b, target); }, { ms: 300 });
      drag.startY += layoutTop(b) - before;
      b.style.transform = "translateY(" + (e.clientY - drag.startY) + "px) scale(1.012)";
    }
  });
  function drop() {
    if (!drag) return;
    var b = drag.b, from = b.style.transform, moved = drag.moved;
    drag = null;
    b.classList.remove("is-lifted");
    b.style.transform = "";
    if (!BP.reduce && from) b.animate([{ transform: from }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(.32,.72,0,1)" });
    hot(b.getAttribute("data-id"), false);
    if (moved) {
      compile(b.getAttribute("data-id"));
      dirty("Reordered bloks");
      say("Blok " + b.getAttribute("data-id") + " moved to position " + (bloks().indexOf(b) + 1) + ".");
    }
  }
  list.addEventListener("pointerup", drop);
  list.addEventListener("pointercancel", drop);
  /* ---- Reorder: keyboard --------------------------------------------------------- */
  list.addEventListener("keydown", function (e) {
    var g = e.target.closest(".grip");
    if (!g || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    var b = g.closest(".blok"), all = bloks(), i = all.indexOf(b), j = e.key === "ArrowUp" ? i - 1 : i + 1;
    if (j < 0 || j >= all.length) return;
    BP.flip(all, function () { list.insertBefore(b, e.key === "ArrowUp" ? all[j] : nextBlok(all[j])); });
    g.focus();
    compile(b.getAttribute("data-id"));
    dirty("Reordered bloks");
    say("Blok " + b.getAttribute("data-id") + " moved to position " + (j + 1) + " of " + all.length + ".");
  });

  /* ---- Compiled panel controls ------------------------------------------------------ */
  document.querySelectorAll("[data-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      mode = btn.getAttribute("data-mode");
      document.querySelectorAll("[data-mode]").forEach(function (x) { x.setAttribute("aria-pressed", x === btn ? "true" : "false"); });
      compile();
      if (!BP.reduce) compiledEl.querySelectorAll(".cvar").forEach(function (v) { v.animate([{ backgroundColor: "rgba(255,210,122,.4)" }, { backgroundColor: "rgba(255,210,122,0)" }], { duration: 800 }); });
    });
  });
  varInput.addEventListener("input", compile);
  document.querySelectorAll("[data-copy-fmt]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var fmt = btn.getAttribute("data-copy-fmt"), name = promptName.textContent.trim(), out;
      if (fmt === "md") out = "# " + name + "\n\n" + bloks().map(function (b) { return "## " + LABEL[b.getAttribute("data-type")] + " (" + b.getAttribute("data-id") + ")\n\n" + textOf(b); }).join("\n\n");
      else out = JSON.stringify({ name: name, version: ver, bloks: bloks().map(function (b) { return { id: b.getAttribute("data-id"), type: b.getAttribute("data-type"), text: textOf(b) }; }) }, null, 2);
      try { navigator.clipboard.writeText(out).catch(function () {}); } catch (err) {}
      BP.toast(fmt === "md" ? "Copied as Markdown." : "Copied as JSON.");
    });
  });

  /* ---- Run once (Free, one model, the user's key) ------------------------------------- */
  var REPLY = "Hi Sam, I’m sorry your order #4471 hasn’t shipped yet. I checked, and it is packed and leaves our warehouse today. You will get tracking within 24 hours. If it is not with you by Friday, reply here and I will set up a replacement or a return. Our returns page has the details: northwind.example/returns";
  var runBtn = document.getElementById("runBtn"), runLabel = document.getElementById("runLabel"), runOut = document.getElementById("runOut");
  var runMeter = document.getElementById("runMeter"), rsTok = document.getElementById("rsTok"), rsMs = document.getElementById("rsMs"), rsCost = document.getElementById("rsCost");
  runBtn.addEventListener("click", function () {
    runBtn.disabled = true;
    runLabel.textContent = "Running";
    runOut.classList.remove("is-empty");
    runOut.textContent = "";
    var caret = document.createElement("span"); caret.className = "caret"; runOut.appendChild(caret);
    var words = REPLY.split(" "), i = 0, t0 = performance.now(), latency = 420;
    runMeter.style.width = "0";
    setTimeout(function step() {
      if (i < words.length) {
        caret.before(document.createTextNode((i ? " " : "") + words[i]));
        i++;
        var n = Math.round(i * 1.3);
        runMeter.style.width = (i / words.length * 100) + "%";
        rsTok.textContent = n;
        rsMs.textContent = Math.round(latency + performance.now() - t0).toLocaleString("en-US") + " ms";
        rsCost.textContent = "$" + (0.0011 + n * 0.00002).toFixed(4);
        setTimeout(step, BP.reduce ? 0 : 26 + Math.random() * 44);
      } else {
        caret.remove();
        runBtn.disabled = false;
        runLabel.textContent = "Run again";
      }
    }, BP.reduce ? 0 : latency);
  });

  /* ---- History ------------------------------------------------------------------------- */
  vlist.addEventListener("click", function (e) {
    var r = e.target.closest("[data-restore]");
    if (!r) return;
    var v = r.getAttribute("data-restore");
    clearTimeout(saveT);
    note = "Restored v" + v;
    commit();
    BP.toast("Restored v" + v + " as v" + ver + ". Nothing was overwritten.");
  });
  var nameBox = document.getElementById("nameBox");
  nameBox.addEventListener("click", function (e) {
    if (!e.target.closest("#nameVersion")) return;
    nameBox.innerHTML = '<div class="keyform"><label class="sr-only" for="vName">Version name</label><input class="input input--mono" id="vName" placeholder="works on Claude" autocomplete="off"><button class="btn btn--primary" type="button" id="vSave">Save name</button></div>';
    var inp = document.getElementById("vName");
    inp.focus();
    function save() {
      var v = inp.value.trim();
      if (v) {
        var top = vlist.querySelector(".vrow.is-current .vmain__top");
        var old = top.querySelector(".vname"); if (old) old.remove();
        var tag = document.createElement("span"); tag.className = "vname"; tag.textContent = v;
        tag.style.animation = "pop 380ms var(--ease-brand)";
        top.appendChild(tag);
        BP.toast("Named v" + ver + " “" + v + "”.");
      }
      nameBox.innerHTML = '<button class="btn btn--dashed btn--block" type="button" id="nameVersion">Name this version</button>';
    }
    document.getElementById("vSave").addEventListener("click", save);
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter") save(); if (ev.key === "Escape") { inp.value = ""; save(); } });
  });

  /* ---- Prompt name ------------------------------------------------------------------------- */
  var crumb = document.getElementById("crumbName");
  promptName.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); promptName.blur(); } });
  promptName.addEventListener("input", function () {
    crumb.textContent = promptName.textContent;
    var item = document.querySelector('.ed-rail__item[aria-current="page"] b');
    if (item) item.firstChild.textContent = promptName.textContent + " ";
    dirty("Renamed");
  });

  /* ---- Rail search ---------------------------------------------------------------------------- */
  var railQ = document.getElementById("railQ"), railItems = Array.prototype.slice.call(document.querySelectorAll(".ed-rail__item"));
  railQ.addEventListener("input", function () {
    var n = railQ.value.trim().toLowerCase();
    BP.flip(railItems, function () { railItems.forEach(function (a) { a.hidden = n && a.getAttribute("data-name").indexOf(n) < 0; }); });
  });

  /* ---- First paint ------------------------------------------------------------------------------ */
  bloks().forEach(function (b) { paintVars(b.querySelector(".blok__text")); });
  compile();
  if (!BP.reduce) bloks().forEach(function (b, i) {
    b.style.animation = "blok-in 640ms var(--ease-brand) " + (120 + i * 90) + "ms both";
    b.addEventListener("animationend", function () { b.style.animation = ""; }, { once: true });
  });
})();
