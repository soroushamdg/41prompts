/* Shared sheet chrome and leader-line helpers for the gallery images.
   Each page sets data-sheet, data-name and data-rev on <body>, builds its
   drawing, then calls Sheet.ready(draw) where draw() adds the leader lines. */
(function () {
  var W = 1270, H = 760, IN = 22;
  var NS = "http://www.w3.org/2000/svg";
  var MARK = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="2.5" y="2.5" width="59" height="59" rx="5" fill="#E9F1FF"/>' +
    '<path fill="#0A1830" fill-rule="evenodd" d="M18 14 L32 14 L32 50 L25 50 L25 41 L8 41 L8 34Z M25 17 L25 34 L15 34Z"/>' +
    '<path fill="#0A1830" fill-rule="evenodd" d="M38 21 L44 14 L48 14 L48 50 L41 50 L41 21Z"/></svg>';

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function chrome() {
    var b = document.body, d = b.dataset;
    b.prepend(el("div", "ground"));
    var z = el("div", "zones"), i, x, y, cw = (W - 2 * IN) / 8, ch = (H - 2 * IN) / 4;
    for (i = 0; i < 8; i++) {
      x = IN + (i + 0.5) * cw;
      z.appendChild(span(i + 1, x, IN / 2)); z.appendChild(span(i + 1, x, H - IN / 2));
      if (i) { tick(z, IN + i * cw, IN - 7, 1, 7); tick(z, IN + i * cw, H - IN, 1, 7); }
    }
    for (i = 0; i < 4; i++) {
      y = IN + (i + 0.5) * ch;
      z.appendChild(span("ABCD"[i], IN / 2, y)); z.appendChild(span("ABCD"[i], W - IN / 2, y));
      if (i) { tick(z, IN - 7, IN + i * ch, 7, 1); tick(z, W - IN, IN + i * ch, 7, 1); }
    }
    b.appendChild(z);
    b.appendChild(el("div", "border"));
    var c = el("div", "chrome");
    c.appendChild(el("div", "logo", MARK + "<b>prompts</b>"));
    c.appendChild(el("div", "sheet-no", '<span class="label">' + (d.kicker || "") + '</span><span class="label label--chalk">Sheet ' + d.sheet + ' / 06</span>'));
    c.appendChild(el("div", "titleblock", "<span>41prompts</span><span>Sheet " + d.sheet + "</span><span>" + d.name + "</span><span>Scale 1:1</span><span>Rev " + (d.rev || "7") + "</span>"));
    c.appendChild(el("div", "foot", '<span class="label label--chalk">41prompts.ai</span>' + (d.foot ? '<span class="label">' + d.foot + "</span>" : "")));
    b.appendChild(c);
    var o = document.createElementNS(NS, "svg");
    o.setAttribute("class", "overlay"); o.setAttribute("viewBox", "0 0 " + W + " " + H);
    o.innerHTML = '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0 1 L9 5 L0 9" fill="none" stroke="context-stroke" stroke-width="1.6"/></marker></defs>';
    b.appendChild(o);
    Sheet.svg = o;
  }
  function span(t, x, y) { var s = el("span", null, String(t)); s.style.left = x + "px"; s.style.top = y + "px"; return s; }
  function tick(z, x, y, w, h) { var t = el("i"); t.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px"; z.appendChild(t); }

  var Sheet = window.Sheet = {
    /* Point on an element's box: ax/ay are 0..1 fractions of width/height. */
    pt: function (e, ax, ay) {
      if (typeof e === "string") e = document.querySelector(e);
      var r = e.getBoundingClientRect();
      return [r.left + r.width * (ax == null ? .5 : ax), r.top + r.height * (ay == null ? .5 : ay)];
    },
    path: function (pts, o) {
      o = o || {};
      var p = document.createElementNS(NS, "path"), dd = "M" + pts[0][0] + " " + pts[0][1], i;
      for (i = 1; i < pts.length; i++) dd += " L" + pts[i][0] + " " + pts[i][1];
      p.setAttribute("d", dd);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", o.color || "#9CC3FF");
      p.setAttribute("stroke-width", o.width || 1.3);
      p.setAttribute("stroke-linejoin", "round");
      if (o.dash) p.setAttribute("stroke-dasharray", o.dash);
      if (o.opacity) p.setAttribute("opacity", o.opacity);
      if (o.arrow) p.setAttribute("marker-end", "url(#arr)");
      if (o.glow) p.setAttribute("filter", "drop-shadow(0 0 5px " + o.color + ")");
      Sheet.svg.appendChild(p);
      if (o.dotStart) Sheet.dot(pts[0], o.color, o.dotStart);
      if (o.dotEnd) Sheet.dot(pts[pts.length - 1], o.color, o.dotEnd);
      return p;
    },
    dot: function (p, color, r) {
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", r === true ? 3 : r);
      c.setAttribute("fill", color || "#9CC3FF");
      Sheet.svg.appendChild(c);
    },
    ring: function (p, color, r) {
      var c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", r || 4);
      c.setAttribute("fill", "#0A1830"); c.setAttribute("stroke", color || "#9CC3FF"); c.setAttribute("stroke-width", 1.4);
      Sheet.svg.appendChild(c);
    },
    /* Dimension line between two points with end ticks and a centred label. */
    dim: function (a, b, label, o) {
      o = o || {};
      var col = o.color || "rgba(156,195,255,.6)";
      Sheet.path([a, b], { color: col, width: 1 });
      var vx = b[0] - a[0], vy = b[1] - a[1], len = Math.hypot(vx, vy), nx = -vy / len * 5, ny = vx / len * 5;
      Sheet.path([[a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]], { color: col, width: 1 });
      Sheet.path([[b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]], { color: col, width: 1 });
      if (label) {
        var t = document.createElementNS(NS, "text");
        t.textContent = label;
        t.setAttribute("x", (a[0] + b[0]) / 2 + (o.dx || 0)); t.setAttribute("y", (a[1] + b[1]) / 2 + (o.dy || -6));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-family", "Martian Mono"); t.setAttribute("font-size", "9"); t.setAttribute("letter-spacing", ".9");
        t.setAttribute("fill", o.text || "#93A9CB");
        if (o.rotate) t.setAttribute("transform", "rotate(" + o.rotate + " " + t.getAttribute("x") + " " + t.getAttribute("y") + ")");
        Sheet.svg.appendChild(t);
      }
    },
    ready: function (draw) {
      document.fonts.ready.then(function () {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (draw) draw();
            window.__ready = true;
          });
        });
      });
    }
  };
  chrome();
})();
