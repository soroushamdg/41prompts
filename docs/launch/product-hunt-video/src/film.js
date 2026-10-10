/* 41prompts launch film. render(t) draws the frame at t seconds (0 to 30).
   Timing follows ../cues.json; window.CUES is injected by render.mjs when available. */
(function () {
  var C = F.clamp, L = F.lerp, P = F.P, E = F.E, $ = F.$, $$ = F.$$, show = F.show;
  var cues = (window.CUES && window.CUES.events) || [];
  var streamTicks = cues.filter(function (e) { return e.kind === "stream_tick"; }).map(function (e) { return e.t; });
  if (!streamTicks.length) for (var st = 18.75; st < 20.75; st += .048) streamTicks.push(st);

  var el = {
    stage: $("#stage"), grid: $("#grid"), glow: $("#glow"), grain: $("#grain"), black: $("#black"),
    s123: $("#s123"), cam: $("#cam"), plane: $("#plane"), wall: $("#wallframe"), sheen: $("#corner-sheen"), scan: $("#scan"),
    plates: $$(".plate"), head: $("#ed-head"), compiled: $("#compiled"), copybtn: $("#copybtn"), copied: $("#copied"),
    links: $("#links"), segi: $("#segi"), segT: $("#seg-t"), segF: $("#seg-f"), vT: $("#v-t"), vF: $("#v-f"),
    olabs: $("#olabs"), ol: [$("#ol1"), $("#ol2"), $("#ol3"), $("#ol4")],
    s4: $("#s4"), tl: $("#tl"), track: $("#track"), nodes: $("#nodes"), tag: $("#tag"), arc: $("#arc"), toast: $("#toast"), dive: $("#dive"),
    s5: $("#s5"), run: $("#run"), runbtn: $("#runbtn"), reply: $("#reply"), uline: $("#uline"),
    mTok: $("#m-tok"), mTime: $("#m-time"), mCost: $("#m-cost"),
    s6: $("#s6"), mword: $("#mword"), mid: $("#mid"), mframe: $("#mframe"),
    s7: $("#s7"), s8: $("#s8"), logo: $("#logo"), plate: $("#plate"), gl: $("#gl"), gr: $("#gr"), spec: $("#specbar"), verts: $("#verts"),
    ring: $("#ring"), word: $("#word"), tagline: $("#tagline"), url: $("#url"),
    t1: $("#t1"), t2a: $("#t2a"), t2b: $("#t2b"), t3: $("#t3"), t4a: $("#t4a"), t4b: $("#t4b"), t5a: $("#t5a"), t5b: $("#t5b"), t7: $("#t7")
  };

  /* cursor and the morph line live at the top level */
  var cursor = document.createElement("div");
  cursor.style.cssText = "position:absolute;left:0;top:0;width:44px;height:44px;z-index:55;transform-origin:8px 6px";
  cursor.innerHTML = '<svg viewBox="0 0 32 32" width="44" height="44"><path d="M6 4 L6 25 L11.5 19.8 L15.2 28 L19 26.3 L15.4 18.4 L23 18.4 Z" fill="#E9F1FF" stroke="#0A1830" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  el.stage.appendChild(cursor);
  var mline = document.createElement("div");
  mline.style.cssText = "position:absolute;height:2px;background:rgba(156,195,255,.45);z-index:15";
  el.stage.appendChild(mline);

  /* ---------------------------------------------------------------- data */
  var NODES = 19, SP = 210;
  for (var n = 1; n <= NODES; n++) {
    var d = document.createElement("div");
    d.className = "node"; d.innerHTML = "<span>v" + n + "</span>";
    el.nodes.appendChild(d);
  }
  var nodeEls = $$(".node");
  var reply = "Sorry about that, Sam. I’ve started an exchange for a size 10, and a prepaid label is in your inbox. Reply here if the new pair doesn’t fit.".split(" ");
  el.reply.innerHTML = reply.map(function (w) { return '<span class="rw">' + w + "</span>"; }).join(" ") + '<span class="caret"></span>';
  var replyWords = $$(".rw"), caret = $(".caret");
  var MANI = [
    ["Paste.", "M02 · Paste any prompt"], ["Split.", "M03 · Bloks editor"], ["Name.", "M03 · Four blok types"], ["Reorder.", "M03 · Drag or ↑ ↓"],
    ["Compile.", "M04 · Live compiled prompt"], ["Copy.", "M04 · One click"], ["Version.", "M05 · Every save"], ["Restore.", "M05 · Nothing overwritten"],
    ["Run.", "M06 · On your own key"], ["Search.", "M08 · ⌘K"], ["Export.", "M09 · Markdown + JSON"], ["Ship.", "41prompts.ai"]
  ];
  var MCOL = ["#9CC3FF", "#FFD27A", "#C6A8FF", "#6FE3A5"];
  var G = {
    four: { outer: [[18,14],[32,14],[32,50],[25,50],[25,41],[8,41],[8,41],[8,41],[8,34]], inner: [[25,17],[25,34],[15,34]] },
    A:    { outer: [[28,14],[34,14],[44,50],[36,50],[31,41],[21,41],[16,50],[8,50],[16,36]], inner: [[30,20],[31,34],[24,34]] },
    one:  { outer: [[38,21],[44,14],[48,14],[48,50],[41,50],[41,21]] },
    I:    { outer: [[45,14],[45,14],[51,14],[45,50],[38,50],[41.5,32]] }
  };
  function lp(a, b, k) { return a.map(function (p, i) { return [p[0] + (b[i][0] - p[0]) * k, p[1] + (b[i][1] - p[1]) * k]; }); }
  function path(p) { return "M" + p.map(function (v) { return v[0].toFixed(2) + " " + v[1].toFixed(2); }).join(" L") + "Z"; }

  /* geometry measured once, with every transform at rest */
  var geo = null;
  function measure() {
    var r = $("#badge-dot").getBoundingClientRect();
    var u = el.uline.getBoundingClientRect();
    var rb = el.runbtn.getBoundingClientRect();
    geo = { dot: [r.left + r.width / 2, r.top + r.height / 2], uline: [u.left, u.top, u.width], runbtn: [rb.left + rb.width * .45, rb.top + rb.height * .6],
            wordW: el.word.getBoundingClientRect().width };
  }

  function camT(fx, fy, s, ax, ay, dx, dy) {
    return "translate(" + (fx + (dx || 0)) + "px," + (fy + (dy || 0)) + "px) rotateX(" + (ax || 0) + "deg) rotateY(" + (ay || 0) + "deg) scale(" + s + ") translate(" + (-fx) + "px," + (-fy) + "px)";
  }
  function kickPulse(t) {
    var last = -9;
    if (t >= 4 && t < 22) last = 4 + Math.floor(t - 4);
    else if (t >= 22 && t < 25.5) last = 22 + Math.floor((t - 22) / .5) * .5;
    return Math.exp(-(t - last) / .14);
  }
  function opa(e, v) { e.style.opacity = v; }
  function tf(e, v) { e.style.transform = v; }
  function blur(e, v) { e.style.filter = v > .05 ? "blur(" + v.toFixed(2) + "px)" : "none"; }

  /* ================================================================ RENDER */
  window.render = function (t) {
    if (!geo) measure();
    var fi = Math.round(t * 60);
    tf(el.grain, "translate(" + ((fi * 73) % 180 - 90) + "px," + ((fi * 151) % 180 - 90) + "px)");

    /* ground: grid and glow, pulsing with the kick */
    var kp = kickPulse(t);
    var gridO = t < 2 ? .15 + .45 * E.out(P(t, .2, 1.8)) : t < 25.5 ? .75 : .75;
    if (t >= 27) gridO = .55 + .9 * Math.exp(-(t - 27) / .35);
    opa(el.grid, C(gridO + .35 * kp, 0, 1));
    opa(el.glow, t < 27 ? .7 + .3 * kp : .6 + 1.2 * Math.exp(-(t - 27) / .5));

    show(cursor, (t >= 12.35 && t < 13.75) || (t >= 18.05 && t < 18.9));
    scene123(t);
    scene4(t);
    scene5(t);
    scene6(t);
    scene7(t);
    scene8(t);
  };

  /* ---------------------------------------------------- 0–14 s: wall, bloks, editor */
  function scene123(t) {
    var on = show(el.s123, t < 14.0);
    show(el.olabs, t >= 5.9 && t < 8.4);
    show(el.t1, t >= 1.9 && t < 4.0);
    show(el.t2a, t >= 7.95 && t < 9.05);
    show(el.t2b, t >= 8.95 && t < 10.1);
    show(el.t3, t >= 13.2 && t < 13.9);
    if (!on) return;

    /* plane rotation: flat wall → isometric stack → flat editor */
    var kIso = E.out(P(t, 4.75, 5.7)), kFold = E.out(P(t, 10.0, 10.75));
    var orbit = E.io(P(t, 5.7, 10.0));
    var rx = L(0, L(50, 45, orbit), kIso), rz = L(0, L(-19, -28, orbit), kIso);
    rx = L(rx, 0, kFold); rz = L(rz, 0, kFold);
    tf(el.plane, "rotateX(" + rx + "deg) rotateZ(" + rz + "deg)");

    /* camera */
    var cam;
    if (t < 2.2) {
      var kPull = E.out(P(t, 1.0, 2.15));
      var s = L(L(11.5, 10.2, P(t, 0, 1)), 1.0, kPull);
      var fx = L(420, 960, kPull), fy = L(316, 540, kPull);
      cam = camT(fx, fy, s, L(L(-14, -9, P(t, 0, 1)), 0, kPull), L(L(26, 18, P(t, 0, 1)), 0, kPull));
    } else if (t < 4.75) {
      cam = camT(960, 540, L(1.0, 1.07, E.io(P(t, 2.15, 4.75))), 0, 0);
    } else if (t < 10.0) {
      var k8 = E.out(P(t, 7.9, 8.7));
      var push = L(1.07, 1.0, E.out(P(t, 4.75, 5.6)));
      cam = camT(960, 540, L(push, .74, k8), 0, 0, L(L(0, -230, E.out(P(t, 5.0, 6.0))), 430, k8), L(L(0, 30, E.out(P(t, 5.0, 6.0))), 60, k8));
    } else {
      cam = camT(960, 540, L(.74, 1, kFold), 0, 0, L(430, 0, kFold), L(60, 0, kFold));
    }
    tf(el.cam, cam);

    /* corner sheen and wall */
    var sw = P(t, .15, 1.3);
    el.sheen.style.setProperty("--sx", L(-60, 120, E.io(sw)) + "px");
    el.sheen.style.setProperty("--sy", L(120, -40, E.io(sw)) + "px");
    opa(el.sheen, Math.sin(Math.PI * sw));
    opa(el.wall, t < .15 ? 0 : 1 - E.io(P(t, 4.7, 5.2)));
    opa(el.scan, t >= 4.0 && t < 4.85 ? 1 - P(t, 4.7, 4.85) : 0);
    var scanY = L(-10, 460, E.io(P(t, 4.0, 4.75)));
    tf(el.scan, "translateY(" + scanY + "px)");

    /* plates */
    el.plates.forEach(function (p, k) {
      var raw = p.children[1], blk = p.children[2], pf = p.children[0], sheen = p.children[3];
      var yWall = 36 + k * 96, hWall = 84;
      var yStack = 149, hStack = 150, zStack = (3 - k) * 132;
      var yEd = -66 + k * 150, xEd = -260, wEd = 840;
      var s0 = 5.0 + k * .25, kx = E.out(P(t, s0, s0 + .62));
      var kf = E.out(P(t, 10.0 + k * .045, 10.7 + k * .045));
      var y = L(L(yWall, yStack, kx), yEd, kf), z = L(L(0, zStack, kx), 0, kf), h = L(L(hWall, hStack, kx), 130, kf);
      p.style.setProperty("--tf", L(30, 23, kf) + "px"); p.style.setProperty("--lf", L(18, 15, kf) + "px");
      var x = L(L(40, 0, kx), xEd, kf), w = L(L(1000, 1080, kx), wEd, kf);
      p.style.top = "0px"; p.style.left = "0px"; p.style.width = w + "px"; p.style.height = h + "px";
      tf(p, "translate3d(" + x + "px," + y + "px," + z + "px)");
      /* scan tint, then raw text → blok */
      var tint = C((scanY - yWall) / hWall) * 100;
      raw.firstChild.style.color = "color-mix(in srgb, var(--c) " + tint.toFixed(1) + "%, #C9D7EE)";
      var kb = E.io(P(t, 4.95 + k * .25, 5.35 + k * .25));
      opa(raw, (t < 3.7 ? L(.5, .62, P(t, 0, 3.6)) : L(.62, 1, P(t, 3.7, 4.0))) * (1 - kb));
      blur(raw, (t < 3.6 ? 4.5 : L(4.5, 0, P(t, 3.6, 4.0))) + kb * 12);
      opa(blk, E.io(P(t, 5.05 + k * .25, 5.4 + k * .25))); blur(blk, (1 - E.out(P(t, 5.05 + k * .25, 5.45 + k * .25))) * 10); opa(pf, kb);
      /* sheen across the stack during the orbit */
      sheen.style.setProperty("--p", L(-30, 130, E.io(P(t, 6.1 + k * .12, 7.5 + k * .12))) + "%");
      opa(sheen, t > 6 && t < 7.8 ? 1 : 0);
      /* recede behind the spec line, then the expects blok steps back in the editor */
      var dim = 1 - .55 * E.out(P(t, 7.9, 8.6)) + .55 * kf;
      if (k === 3) dim *= 1 - .4 * E.out(P(t, 11.0, 11.4));
      opa(p, dim);
      var note = blk.querySelector(".note");
      if (note) opa(note, E.out(P(t, 11.0, 11.35)));
    });

    /* orbit labels, placed against each plate's right edge */
    var lead = "";
    if (t >= 5.9 && t < 8.4) {
      var rs = el.plates.map(function (pl) { return pl.querySelector(".mk.r").getBoundingClientRect(); });
      var colX = Math.max.apply(null, rs.map(function (r) { return r.left; })) + 120;
      el.ol.forEach(function (o, k) {
        var r = rs[k], ly = 300 + k * 150;
        var s0 = 6.0 + k * .5, ki = E.out(P(t, s0, s0 + .5)), ko = E.io(P(t, 7.85 + k * .04, 8.15 + k * .04));
        o.style.left = (colX + 24) + "px"; o.style.top = (ly - 62) + "px";
        opa(o, P(t, s0, s0 + .25) * (1 - ko));
        blur(o, (1 - ki) * 16 + ko * 14);
        tf(o, "translateX(" + ((1 - ki) * 30) + "px)");
        var kd = E.draw(P(t, s0 - .05, s0 + .3)), mx = colX - 40;
        var dd = "M" + r.left + " " + r.top + " L" + mx + " " + r.top + " L" + (mx + 24) + " " + ly + " L" + (colX + 8) + " " + ly;
        lead += '<path d="' + dd + '" fill="none" stroke="' + MCOL[k] + '" stroke-width="1.6" pathLength="1" stroke-dasharray="1" stroke-dashoffset="' + (1 - kd) + '" opacity="' + (.85 * (1 - ko)) + '"/>';
        lead += '<circle cx="' + r.left + '" cy="' + r.top + '" r="4.5" fill="#050C1A" stroke="' + MCOL[k] + '" stroke-width="1.6" opacity="' + (kd > 0 ? 1 - ko : 0) + '"/>';
      });
    }

    /* headline over the wall */
    tf(el.t1, "translateX(-50%)");
    if (t < 3.5) { el.t1.style.filter = "none"; opa(el.t1, 1); F.blurIn(el.t1, t, [2.0, 2.25, 2.5, 2.75, 3.0], { dur: .6, blur: 22 }); }
    else F.blurOut(el.t1, t, 3.55, .4, { base: "translateX(-50%)", grow: .05 });

    /* spec → benefit */
    if (t < 8.8) { opa(el.t2a, 1); el.t2a.style.filter = "none"; tf(el.t2a, "none"); F.blurIn(el.t2a, t, [8.0, 8.25, 8.5], { dur: .55 }); }
    else F.blurOut(el.t2a, t, 8.8, .2);
    if (t < 9.75) { opa(el.t2b, 1); el.t2b.style.filter = "none"; tf(el.t2b, "none"); F.blurIn(el.t2b, t, [9.0, 9.15, 9.3, 9.45, 9.6], { dur: .5 }); }
    else F.blurOut(el.t2b, t, 9.75, .25);

    /* editor chrome */
    var kh = E.out(P(t, 10.25, 10.8));
    opa(el.head, kh); blur(el.head, (1 - kh) * 12); tf(el.head, "translateY(" + ((1 - kh) * -20) + "px)");
    var kc = E.out(P(t, 10.3, 10.85));
    opa(el.compiled, kc); tf(el.compiled, "translateX(" + ((1 - kc) * 90) + "px)");
    ["#c1", "#c2", "#c3", "#counts"].forEach(function (id, i) {
      var e = $(id), s0 = 10.5 + i * .125, k = E.out(P(t, s0, s0 + .45));
      opa(e, P(t, s0, s0 + .2)); blur(e, (1 - k) * 10); tf(e, "translateX(" + ((1 - k) * -26) + "px)");
    });
    var kseg = E.out(P(t, 11.0, 11.4)), kflip = E.out(P(t, 11.5, 11.8));
    opa(el.segi.parentNode, kseg);
    tf(el.segi, "translateX(" + (kflip * 100) + "%)");
    el.segT.style.color = kflip < .5 ? "#0A1830" : "#C9D7EE"; el.segF.style.color = kflip < .5 ? "#C9D7EE" : "#0A1830";
    opa(el.vT, 1 - kflip); blur(el.vT, kflip * 8); opa(el.vF, kflip); blur(el.vF, (1 - kflip) * 8);
    el.vT.style.display = kflip >= 1 ? "none" : "inline"; el.vF.style.position = kflip >= 1 ? "static" : "absolute";
    var kb2 = E.out(P(t, 11.125, 11.6));
    var press = t < 13.0 ? 1 : t < 13.07 ? L(1, .965, P(t, 13.0, 13.07)) : L(.965, 1, E.out(P(t, 13.07, 13.35)));
    opa(el.copybtn, P(t, 11.125, 11.35)); tf(el.copybtn, "translateY(" + ((1 - kb2) * 30) + "px) scale(" + press + ")");
    var kcp = E.back(P(t, 13.05, 13.35));
    opa(el.copied, P(t, 13.05, 13.12)); tf(el.copied, "translateY(-50%) scale(" + L(.5, 1, kcp) + ")");

    /* links from bloks to compiled lines */
    var lk = lead;
    if (t >= 10.4 && t < 12.4) {
      [0, 1, 2].forEach(function (k) {
        var a = el.plates[k].querySelector(".mk.r").getBoundingClientRect(), b = $("#c" + (k + 1)).getBoundingClientRect();
        var x1 = a.left, y1 = a.top, x2 = b.left - 6, y2 = b.top + 16, mx = (x1 + x2) / 2;
        var dd = "M" + x1 + " " + y1 + " C " + mx + " " + y1 + ", " + mx + " " + y2 + ", " + x2 + " " + y2;
        var kd = E.draw(P(t, 10.45 + k * .1, 10.95 + k * .1)), fade = 1 - P(t, 12.0, 12.4);
        lk += '<path d="' + dd + '" fill="none" stroke="' + MCOL[k] + '" stroke-width="2" pathLength="1" stroke-dasharray="1" stroke-dashoffset="' + (1 - kd) + '" opacity="' + (.8 * fade) + '"/>';
        lk += '<circle cx="' + x2 + '" cy="' + y2 + '" r="4" fill="' + MCOL[k] + '" opacity="' + (kd >= 1 ? fade : 0) + '"/>';
      });
    }
    el.links.innerHTML = lk;

    /* cursor to Copy prompt */
    var kcur = E.brand(P(t, 12.4, 12.98));
    var cx = L(1900, 1440, kcur), cy = L(1060, 788, kcur), cs = t >= 13.0 && t < 13.1 ? .86 : 1;
    if (t < 14) { tf(cursor, "translate(" + cx + "px," + cy + "px) scale(" + cs + ")"); opa(cursor, P(t, 12.35, 12.5) * (1 - P(t, 13.55, 13.7))); }

    /* text after the click */
    if (t < 13.65) { opa(el.t3, 1); el.t3.style.filter = "none"; tf(el.t3, "none"); F.blurIn(el.t3, t, [13.25, 13.4, 13.55], { dur: .45 }); }
    else F.blurOut(el.t3, t, 13.65, .15);

    /* the dive into the saved badge */
    el.s123.style.transformOrigin = geo.dot[0] + "px " + geo.dot[1] + "px";
    var pushEd = L(1, 1.035, E.io(P(t, 10.8, 13.7)));
    if (t >= 13.7) {
      var kd2 = E.in(P(t, 13.7, 14.0));
      tf(el.s123, "scale(" + (pushEd * L(1, 260, kd2)) + ")");
      blur(el.s123, kd2 * 3);
    } else { tf(el.s123, "scale(" + pushEd + ")"); el.s123.style.filter = "none"; }
  }

  /* ---------------------------------------------------------- 14–18 s: versions */
  function scene4(t) {
    var on = show(el.s4, t >= 13.98 && t < 18.2);
    show(el.t4a, t >= 14.4 && t < 17.4);
    show(el.t4b, t >= 17.35 && t < 18.1);
    show(mline, t >= 17.7 && t < 18.2);
    if (!on) return;
    /* dive circle lands on v18 */
    var kdv = E.out(P(t, 14.0, 14.36));
    show(el.dive, t < 14.36);
    var dsz = L(3400, 30, kdv), dx = L(geo.dot[0], 960, kdv), dy = L(geo.dot[1], 640, kdv);
    el.dive.style.cssText = "left:" + (dx - dsz / 2) + "px;top:" + (dy - dsz / 2) + "px;width:" + dsz + "px;height:" + dsz + "px";

    /* camera index along the timeline and the zoom out */
    var c = 18;
    if (t >= 14.3) c = L(18, 5, E.io(P(t, 14.3, 16.05)));
    var kz = E.out(P(t, 16.5, 17.3));
    c = L(c, 12, kz);
    var sc = L(1, .5, kz);
    tf(el.tl, "scale(" + sc + ")");
    var x0 = function (i) { return 960 + (i - c) * SP; };
    el.track.style.left = (x0(1) - 900) + "px"; el.track.style.width = (x0(NODES) - x0(1) + 1800) + "px";
    nodeEls.forEach(function (nd, i) {
      var v = i + 1;
      nd.style.left = x0(v) + "px";
      var litT = v === 18 ? 14.25 : v >= 6 && v < 18 ? 14.25 + (18 - v) * .125 : v === 5 ? 16.0 : v === 19 ? 17.25 : 99;
      if (v < 5) litT = 16.6 + (5 - v) * .05;
      var lit = t >= litT;
      nd.classList.toggle("lit", lit);
      nd.classList.toggle("named", v === 5 && t >= 16.0);
      nd.style.setProperty("--g", lit ? (.25 + .75 * Math.exp(-(t - litT) / .22)).toFixed(3) : 0);
      var pop = lit ? L(1.6, 1, E.out(P(t, litT, litT + .3))) : 1;
      if (v === 19) { pop = t < 17.2 ? 0 : L(0, 1, E.back(P(t, 17.2, 17.5))); }
      tf(nd, "scale(" + pop + ")");
      opa(nd, (t < 14.3 && v !== 18 ? P(t, 14.1, 14.3) : 1) * (1 - P(t, 17.7, 17.95)));
    });
    opa(el.track, 1 - P(t, 17.7, 17.8));
    /* tag on v5 */
    var kt = E.back(P(t, 16.0, 16.35));
    el.tag.style.left = x0(5) + "px"; el.tag.style.top = "700px";
    opa(el.tag, P(t, 16.0, 16.1) * (1 - P(t, 17.7, 17.95))); tf(el.tag, "translate(-50%,0) scale(" + L(.6, 1, kt) + ")");
    /* restore arc */
    var a = x0(5), b = x0(19), top = 640 - 300;
    var ka = E.draw(P(t, 16.55, 17.25));
    el.arc.innerHTML = t >= 16.55 ? '<path d="M' + a + " 625 C " + a + " " + top + ", " + b + " " + top + ", " + b + ' 625" fill="none" stroke="#6FE3A5" stroke-width="3" stroke-dasharray="10 10" pathLength="1000" style="stroke-dasharray:' + (ka * 1000) + ' 1000" opacity="' + (1 - P(t, 17.7, 17.9)) + '"/>' : "";
    var kto = E.back(P(t, 17.25, 17.55));
    var mx = 960 + ((a + b) / 2 - 960) * sc, my = 640 + (top + 70 - 640) * sc;
    el.toast.style.left = mx + "px"; el.toast.style.top = (my - 30) + "px";
    opa(el.toast, P(t, 17.25, 17.35) * (1 - P(t, 17.75, 17.95))); tf(el.toast, "translate(-50%,-50%) scale(" + L(.7, 1, kto) + ")");

    /* words */
    if (t < 17.15) { opa(el.t4a, 1); el.t4a.style.filter = "none"; tf(el.t4a, "none"); F.blurIn(el.t4a, t, [14.5, 14.65, 14.8], { dur: .55 }); }
    else F.blurOut(el.t4a, t, 17.15, .2);
    if (t < 17.85) { opa(el.t4b, 1); el.t4b.style.filter = "none"; tf(el.t4b, "none"); F.blurIn(el.t4b, t, [17.4, 17.55, 17.7], { dur: .45 }); }
    else F.blurOut(el.t4b, t, 17.85, .2);

    /* the track becomes the run panel's input line */
    if (t >= 17.7) {
      var km = E.out(P(t, 17.75, 18.15));
      var ly = 640, lx = 0, lw = 1920;
      mline.style.left = L(lx, geo.uline[0], km) + "px"; mline.style.top = L(ly, geo.uline[1], km) + "px";
      mline.style.width = L(lw, geo.uline[2], km) + "px";
    }
  }

  /* ------------------------------------------------------------- 18–22 s: run */
  function scene5(t) {
    var on = show(el.s5, t >= 17.9 && t < 22.1);
    show(el.t5a, t >= 19.95 && t < 21.05);
    show(el.t5b, t >= 20.95 && t < 22.1);
    if (!on) return;
    var ki = E.out(P(t, 17.95, 18.45)), kr = E.out(P(t, 20.0, 20.6)), ko = E.io(P(t, 21.8, 22.05));
    var ry = L(-9, -3, P(t, 18, 20)), rxx = L(5, 2, P(t, 18, 20));
    opa(el.run, ki * (1 - .55 * kr) * (1 - ko));
    blur(el.run, (1 - ki) * 10 + ko * 16);
    var macro = L(1, 1.1, E.io(P(t, 18.6, 19.95))) * L(1, 1 / 1.1, kr);
    tf(el.run, "translateX(" + (kr * 380) + "px) translateY(" + (L(0, -40, E.io(P(t, 18.6, 19.95))) * (1 - kr)) + "px) rotateY(" + L(ry, -14, kr) + "deg) rotateX(" + rxx + "deg) scale(" + (L(.96, 1, ki) * L(1, .84, kr) * macro) + ")");
    el.run.style.setProperty("--sp", L(-30, 130, E.io(P(t, 18.15, 18.9))) + "%");
    opa(el.uline, t >= 18.15 ? 1 : 0);
    /* cursor and click */
    var kc = E.brand(P(t, 18.05, 18.47));
    if (t >= 18.0 && t < 18.9) {
      tf(cursor, "translate(" + L(1860, geo.runbtn[0], kc) + "px," + L(1040, geo.runbtn[1], kc) + "px) scale(" + (t >= 18.5 && t < 18.58 ? .86 : 1) + ")");
      opa(cursor, P(t, 18.05, 18.15) * (1 - P(t, 18.7, 18.85)));
    }
    var press = t < 18.5 ? 1 : t < 18.57 ? .95 : L(.95, 1, E.out(P(t, 18.57, 18.8)));
    tf(el.runbtn, "scale(" + press + ")");
    /* stream, synced to the stream ticks */
    var n = 0; for (var i = 0; i < streamTicks.length; i++) if (t >= streamTicks[i]) n = i + 1;
    var shown = Math.round(n / streamTicks.length * replyWords.length);
    replyWords.forEach(function (w, i) { w.style.display = i < shown ? "inline" : "none"; });
    var fr = n / streamTicks.length;
    caret.style.opacity = t < 18.75 ? 0 : (fr < 1 ? 1 : (Math.floor(t * 2.5) % 2 ? 0 : 1));
    var kmt = fr;
    el.mTok.textContent = Math.round(214 * kmt);
    el.mTime.textContent = (t < 18.75 ? 0 : Math.min(1.4, (t - 18.75) * .7)).toFixed(1) + "s";
    el.mCost.textContent = "$" + (.0021 * kmt).toFixed(4);
    /* words */
    if (t < 20.8) { opa(el.t5a, 1); el.t5a.style.filter = "none"; tf(el.t5a, "none"); F.blurIn(el.t5a, t, [20.0, 20.25, 20.5], { dur: .5 }); }
    else F.blurOut(el.t5a, t, 20.8, .2);
    if (t < 21.8) { opa(el.t5b, 1); el.t5b.style.filter = "none"; tf(el.t5b, "none"); F.blurIn(el.t5b, t, [21.0, 21.25, 21.5], { dur: .5 }); }
    else F.blurOut(el.t5b, t, 21.8, .22);
  }

  /* ------------------------------------------------------- 22–25.5 s: manifesto */
  function scene6(t) {
    var on = show(el.s6, t >= 22.0 && t < 25.5);
    if (!on) return;
    var i = Math.min(11, Math.floor((t - 22.0) / .25)), s0 = 22.0 + i * .25;
    var m = MANI[i], inv = t >= 24.0 && t < 24.5;
    if (el.mword.textContent !== m[0]) el.mword.textContent = m[0];
    if (el.mid.textContent !== m[1]) el.mid.textContent = m[1];
    var k = E.out(P(t, s0, s0 + .18));
    var hold = i === 11 ? L(1, 1.1, E.io(P(t, 24.75, 25.5))) : 1;
    el.s6.style.background = inv ? "#E9F1FF" : "transparent";
    el.mword.style.color = inv ? "#0A1830" : "#E9F1FF";
    el.mid.style.color = inv ? "#3A4F72" : MCOL[i % 4];
    opa(el.mword, P(t, s0, s0 + .05));
    blur(el.mword, (1 - k) * 14);
    var zoom = L(1, 1.1, E.in(P(t, 22, 25.5)));
    tf(el.mword, "translate(-50%,-50%) scale(" + (L(1.14, 1, k) * hold * zoom) + ")");
    var w = el.mword.offsetWidth * hold * zoom, h = 300 * hold * zoom;
    el.mid.style.top = (560 - h / 2 - 40) + "px";
    tf(el.mid, "translate(-50%,-50%) translateY(" + ((1 - k) * 14) + "px)");
    opa(el.mid, P(t, s0 + .02, s0 + .09));
    var pad = 54;
    el.mframe.style.left = (960 - w / 2 - pad) + "px"; el.mframe.style.top = (560 - h / 2 - pad - 4) + "px";
    el.mframe.style.width = (w + pad * 2) + "px"; el.mframe.style.height = (h + pad * 2 + 8) + "px";
    el.mframe.style.setProperty("--corner", inv ? "#0A1830" : MCOL[i % 4]);
    el.mframe.style.setProperty("--cl", L(110, 34, k) + "px");
    el.mframe.style.borderColor = inv ? "rgba(10,24,48,.25)" : "rgba(156,195,255,.18)";
    opa(el.grid, inv ? 0 : el.grid.style.opacity);
  }

  /* --------------------------------------------------- 25.5–27 s: the dropoff */
  function scene7(t) {
    show(el.black, t >= 25.5 && t < 27.8);
    opa(el.black, t < 27.0 ? 1 : 1 - E.io(P(t, 27.0, 27.7)));
    var on = show(el.s7, t >= 25.5 && t < 27.25);
    if (!on) return;
    if (t < 27.0) { opa(el.t7, 1); el.t7.style.filter = "none"; tf(el.t7, "translateX(-50%)"); F.blurIn(el.t7, t, [25.75, 26.2, 26.6], { dur: .75, blur: 26, rise: 18 }); }
    else F.blurOut(el.t7, t, 27.0, .2, { base: "translateX(-50%)", grow: .35, blur: 30 });
  }

  /* ------------------------------------------------------ 27–30 s: the climax */
  function scene8(t) {
    var on = show(el.s8, t >= 27.0);
    if (!on) return;
    var ks = E.out(P(t, 27.0, 27.42));
    var kl = E.out(P(t, 28.35, 28.9));
    var lockLeft = 960 - (320 + 48 + geo.wordW) / 2;
    var lx = L(800, lockLeft, kl);
    el.logo.style.left = lx + "px";
    var push = L(1, 1.035, E.io(P(t, 28.9, 30)));
    tf(el.s8, "scale(" + push + ")"); el.s8.style.transformOrigin = "960px 540px";
    tf(el.logo, "perspective(1400px) rotateX(" + L(30, 0, ks) + "deg) rotateZ(" + L(-9, 0, ks) + "deg) scale(" + L(7.5, 1, ks) + ")");
    blur(el.logo, (1 - ks) * 12);
    opa(el.logo, P(t, 27.0, 27.05));
    /* morph 41 → AI → 41 */
    var v = 0, mw = 0;
    if (t >= 27.5 && t < 28.0) { v = P(t, 27.5, 28.0); mw = Math.sin(Math.PI * v); }
    else if (t >= 28.0 && t < 28.25) v = 1;
    else if (t >= 28.25 && t < 28.75) { v = 1 - P(t, 28.25, 28.75); mw = Math.sin(Math.PI * v); }
    var e = E.io(v);
    var lo = lp(G.four.outer, G.A.outer, e), li = lp(G.four.inner, G.A.inner, e), ro = lp(G.one.outer, G.I.outer, e);
    el.gl.setAttribute("d", path(lo) + " " + path(li)); el.gr.setAttribute("d", path(ro));
    var onAI = e > .5;
    el.plate.setAttribute("fill", onAI ? "#050C1A" : "#E9F1FF"); el.plate.setAttribute("stroke-width", onAI ? 5 : 0);
    el.gl.setAttribute("fill", onAI ? "#E9F1FF" : "#0A1830"); el.gr.setAttribute("fill", onAI ? "#E9F1FF" : "#0A1830");
    var vs = "";
    if (mw > .02) lo.concat(li, ro).forEach(function (p) { vs += '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="1.1" fill="#050C1A" stroke="#9CC3FF" stroke-width=".45" opacity="' + mw.toFixed(3) + '"/>'; });
    el.verts.innerHTML = vs;
    /* specular sweep across the plate */
    var kp = E.io(P(t, 27.12, 27.7));
    el.spec.setAttribute("x", L(-40, 100, kp)); el.spec.setAttribute("opacity", t < 27.75 ? .6 : 0);
    /* shockwave */
    var kr = E.out(P(t, 27.04, 27.95)), rs = L(300, 1900, kr);
    el.ring.style.cssText = "left:" + (960 - rs / 2) + "px;top:" + (520 - rs / 2) + "px;width:" + rs + "px;height:" + rs + "px;opacity:" + (.7 * (1 - kr)) + ";border-width:" + L(3, 1, kr) + "px";
    /* wordmark */
    var kw = E.out(P(t, 28.4, 29.0));
    el.word.style.left = (lockLeft + 320 + 48) + "px";
    opa(el.word, P(t, 28.4, 28.6)); blur(el.word, (1 - kw) * 16);
    el.word.style.letterSpacing = L(.04, -.045, kw) + "em";
    tf(el.word, "translateX(" + ((1 - kw) * 60) + "px)");
    F.blurIn(el.tagline, t, [28.5, 28.75, 29.0], { dur: .5 });
    var ku = E.out(P(t, 29.2, 29.7));
    opa(el.url, P(t, 29.2, 29.4)); blur(el.url, (1 - ku) * 12); tf(el.url, "translateY(" + ((1 - ku) * 16) + "px)");
  }
})();
