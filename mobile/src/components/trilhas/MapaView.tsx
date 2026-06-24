import { useTrilha } from "@/context/TrilhaContext";
import { useUsuario } from "@/context/SessaoContext";
import { Color } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { router } from "expo-router";
import React, { useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";

const PIXI_CDNS = `
  <script src="https://cdn.jsdelivr.net/npm/pixi.js@7/dist/pixi.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/pixi-viewport@5/dist/viewport.min.js"></script>
`;

function buildHTML(payload: any) {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #app {
    width: 100%; height: 100%; overflow: hidden;
    background:
      radial-gradient(ellipse at 14% 9%, rgba(255,228,170,0.11) 0%, transparent 28%),
      radial-gradient(ellipse at 86% 7%, rgba(255,218,150,0.07) 0%, transparent 22%),
      linear-gradient(180deg,
        ${payload.palette.skyTop} 0%,
        ${payload.palette.skyBottom} 42%,
        ${payload.palette.sea} 43%,
        ${payload.palette.seaDeep} 100%);
  }
  canvas { display: block; }

  /* ── Info card (top-left) ─────────────────── */
  .worldCard {
    position: absolute; top: 14px; left: 14px;
    max-width: 270px; padding: 14px 16px 13px;
    background: linear-gradient(155deg, ${payload.palette.panelBg} 0%, rgba(10,8,6,0.86) 100%);
    border: 1px solid ${payload.palette.panelBorder};
    border-radius: 3px;
    box-shadow:
      inset 0 0 0 3px rgba(16,8,2,0.72),
      inset 0 0 0 4px rgba(190,148,58,0.16),
      0 22px 52px rgba(0,0,0,0.48);
    pointer-events: none;
  }
  .worldCard::before {
    content: ""; position: absolute; inset: 5px; border-radius: 2px;
    border: 1px solid rgba(255,255,255,0.08); pointer-events: none;
  }
  .wc-corner {
    position: absolute; width: 11px; height: 11px;
    border-color: ${payload.palette.panelBorder}; border-style: solid;
  }
  .tl { top: 5px; left: 5px; border-width: 2px 0 0 2px; border-radius: 2px 0 0 0; }
  .tr { top: 5px; right: 5px; border-width: 2px 2px 0 0; border-radius: 0 2px 0 0; }
  .bl { bottom: 5px; left: 5px; border-width: 0 0 2px 2px; border-radius: 0 0 0 2px; }
  .br { bottom: 5px; right: 5px; border-width: 0 2px 2px 0; border-radius: 0 0 2px 0; }
  .eyebrow {
    color: ${payload.palette.textSecondary}; font: 700 10px/1 Georgia,serif;
    letter-spacing: 2.4px; text-transform: uppercase; margin-bottom: 6px;
  }
  .worldTitle {
    color: ${payload.palette.textPrimary}; font: 800 24px/1.1 Georgia,serif;
    letter-spacing: 0.3px; text-shadow: 0 2px 10px rgba(0,0,0,0.65);
  }
  .worldSub {
    margin-top: 5px; color: ${payload.palette.textSecondary};
    font: 600 11px/1.35 Georgia,serif; letter-spacing: 0.3px;
  }
  .wd-rule {
    margin: 9px 0 8px; border: none; border-top: 1px solid ${payload.palette.panelBorder};
    position: relative;
  }
  .wd-rule::before {
    content: "✦"; position: absolute; left: 50%;
    transform: translateX(-50%) translateY(-52%);
    background: rgba(40,24,9,0.97); padding: 0 5px;
    color: rgba(200,158,60,0.55); font-size: 9px;
  }
  .worldDesc {
    color: ${payload.palette.textSecondary}; font: 400 11px/1.5 Georgia,serif;
  }

  /* ── Legend chips (top-right) ────────────── */
  .legend {
    position: absolute; right: 14px; top: 14px;
    display: flex; flex-direction: column; gap: 8px; pointer-events: none;
  }
  .legendChip {
    min-width: 148px; padding: 10px 13px; border-radius: 3px;
    background: linear-gradient(155deg, ${payload.palette.panelBg}, rgba(10,8,6,0.84));
    border: 1px solid ${payload.palette.panelBorder}; color: ${payload.palette.textPrimary};
    font: 700 11px/1.25 Georgia,serif; letter-spacing: 0.3px;
    box-shadow: inset 0 0 0 2px rgba(16,8,2,0.58), 0 10px 26px rgba(0,0,0,0.32);
  }
  .legendChip small {
    display: block; margin-top: 4px; color: ${payload.palette.textSecondary};
    font: 400 10px/1.3 Georgia,serif;
  }
  .chip-dot {
    display: inline-block; width: 6px; height: 6px; border-radius: 50%;
    margin-right: 6px; vertical-align: middle; background: ${payload.palette.route};
  }

  /* ── Stage strip (bottom) ────────────────── */
  .hud {
    position: absolute; left: 0; right: 0; bottom: 0;
    display: flex; gap: 0; overflow-x: auto; padding: 0 10px 0;
    background: linear-gradient(0deg, rgba(8,8,8,0.76) 0%, rgba(8,8,8,0.34) 72%, transparent 100%);
  }
  .hud::-webkit-scrollbar { display: none; }
  .stage {
    flex: 0 0 auto; min-width: 118px; padding: 9px 13px 10px;
    margin: 8px 3px 0; border-radius: 4px 4px 0 0;
    border: 1px solid ${payload.palette.panelBorder}; border-bottom: none;
    background: linear-gradient(180deg, ${payload.palette.panelBg} 0%, rgba(10,8,6,0.84) 100%);
    color: ${payload.palette.textPrimary}; font: 700 11px/1.2 Georgia,serif; letter-spacing: 0.2px;
    cursor: pointer; position: relative;
    box-shadow: inset 0 -4px 18px rgba(0,0,0,0.22);
    transition: background 0.15s;
  }
  .stage:hover { background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(10,8,6,0.84)); }
  .stage.done  { border-color: ${payload.palette.borderDone}; }
  .stage.curr  { border-color: ${payload.palette.borderCurrent}; }
  .stage.lock  { opacity: 0.6; }
  .stage small {
    display: block; margin-top: 4px; color: ${payload.palette.textSecondary};
    font: 400 10px/1.2 Georgia,serif;
  }
  .s-num {
    position: absolute; top: 6px; right: 9px;
    color: ${payload.palette.textSecondary}; font: 700 9px/1 Georgia,serif;
  }
</style>
${PIXI_CDNS}
</head><body>
<div id="app"></div>
<div class="worldCard">
  <div class="wc-corner tl"></div><div class="wc-corner tr"></div>
  <div class="wc-corner bl"></div><div class="wc-corner br"></div>
  <div class="eyebrow" id="eyebrow">Carta do Reino</div>
  <div class="worldTitle" id="worldTitle"></div>
  <div class="worldSub" id="worldSub"></div>
  <hr class="wd-rule">
  <div class="worldDesc" id="worldDesc"></div>
</div>
<div class="legend">
  <div class="legendChip" id="legendA"></div>
  <div class="legendChip" id="legendB"></div>
</div>
<div class="hud" id="hud"></div>
<script>
(function () {
  var INIT = ${JSON.stringify(payload)};

  var app = new PIXI.Application({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    powerPreference: "high-performance",
  });
  document.getElementById("app").appendChild(app.view);

  // PIXI v7: sem um stage interativo com hitArea, o EventSystem nao propaga
  // pointertap aos nos (containers filhos). Isto e o que faz o toque nos nos
  // do grafo funcionar de forma consistente.
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;

  var viewport = new pixi_viewport.Viewport({
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    worldWidth: INIT.worldW,
    worldHeight: INIT.worldH,
    events: app.renderer.events,
  });
  app.stage.addChild(viewport);
  viewport.drag({ wheel: false, mouseButtons: "all" }).pinch().wheel().decelerate();
  viewport.clamp({ direction: "all" });
  viewport.clampZoom({ minScale: 0.48, maxScale: 1.85 });

  var seaLayer     = new PIXI.Container();
  var routeLayer   = new PIXI.Container();
  var countryLayer = new PIXI.Container();
  var fxLayer      = new PIXI.Container();
  viewport.addChild(seaLayer, routeLayer, countryLayer, fxLayer);

  function hex(color) { return PIXI.utils.string2hex(color || "#ffffff"); }

  function hashString(v) {
    var h = 0;
    for (var i = 0; i < v.length; i++) { h = (h << 5) - h + v.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  }
  function makeRandom(seed) {
    var state = hashString(String(seed)) || 1;
    return function() {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  // Quadratic bezier point
  function qbez(x0, y0, cx, cy, x1, y1, t) {
    var mt = 1 - t;
    return { x: mt*mt*x0 + 2*mt*t*cx + t*t*x1, y: mt*mt*y0 + 2*mt*t*cy + t*t*y1 };
  }

  function cbez(x0, y0, c1x, c1y, c2x, c2y, x1, y1, t) {
    var mt = 1 - t;
    return {
      x: mt*mt*mt*x0 + 3*mt*mt*t*c1x + 3*mt*t*t*c2x + t*t*t*x1,
      y: mt*mt*mt*y0 + 3*mt*mt*t*c1y + 3*mt*t*t*c2y + t*t*t*y1,
    };
  }

  /* ── Sea backdrop ───────────────────────────────────── */
  function drawSeaBackdrop() {
    var sea = new PIXI.Graphics();
    sea.beginFill(hex(INIT.palette.sea), 0.14);
    sea.drawRoundedRect(-120, -120, INIT.worldW + 240, INIT.worldH + 240, 120);
    sea.endFill();
    seaLayer.addChild(sea);

    // fog blobs
    for (var i = 0; i < 14; i++) {
      var rnd = makeRandom("fog:" + i);
      var cloud = new PIXI.Graphics();
      cloud.beginFill(0xffffff, 0.038 + rnd() * 0.035);
      cloud.drawCircle(rnd() * INIT.worldW, rnd() * INIT.worldH, 90 + rnd() * 160);
      cloud.endFill();
      cloud.filters = [new PIXI.filters.BlurFilter({ strength: 20 + rnd() * 14 })];
      fxLayer.addChild(cloud);
    }

    // sparkle dust
    for (var j = 0; j < 60; j++) {
      var rnd2 = makeRandom("spark:" + j);
      var sp = new PIXI.Graphics();
      sp.beginFill(0xf5e8c0, 0.12 + rnd2() * 0.20);
      sp.drawCircle(rnd2() * INIT.worldW, 20 + rnd2() * INIT.worldH * 0.3, 0.7 + rnd2() * 1.5);
      sp.endFill();
      fxLayer.addChild(sp);
    }
  }

  /* ── Lat/lon grid ───────────────────────────────────── */
  function drawSeaGrid() {
    var g = new PIXI.Graphics();
    var hLines = 6, vLines = 9;
    for (var i = 0; i <= hLines; i++) {
      var y = (INIT.worldH / hLines) * i;
      g.lineStyle({ width: 1, color: hex(INIT.palette.borderLocked), alpha: 0.18 });
      g.moveTo(0, y); g.lineTo(INIT.worldW, y);
    }
    for (var j = 0; j <= vLines; j++) {
      var x = (INIT.worldW / vLines) * j;
      g.lineStyle({ width: 1, color: hex(INIT.palette.borderLocked), alpha: 0.14 });
      g.moveTo(x, 0); g.lineTo(x, INIT.worldH);
    }
    seaLayer.addChild(g);
  }

  /* ── Sea wave lines ─────────────────────────────────── */
  function drawSeaWaves() {
    var g = new PIXI.Graphics();
    var rows = 14;
    for (var row = 0; row < rows; row++) {
      var baseY = INIT.worldH * 0.44 + (row / rows) * INIT.worldH * 0.55;
      var amp = 3 + Math.sin(row * 1.3) * 2.5;
      var freq = 56 + row * 9;
      g.lineStyle({ width: 0.75, color: hex(INIT.palette.route), alpha: 0.08 + row * 0.004 });
      g.moveTo(0, baseY);
      for (var x = 0; x <= INIT.worldW; x += freq) {
        g.bezierCurveTo(x + freq*0.28, baseY - amp, x + freq*0.72, baseY + amp, x + freq, baseY);
      }
    }
    seaLayer.addChild(g);
  }

  /* ── Cartographic sea labels ────────────────────────── */
  function drawSeaLabels() {
    var items = [
      { text: "MARE\nINCOGNITUM", x: INIT.worldW * 0.09, y: INIT.worldH * 0.72 },
      { text: "OCEANUS\nMYSTERIOSUS", x: INIT.worldW * 0.80, y: INIT.worldH * 0.80 },
      { text: "FINIS\nTERRAE", x: INIT.worldW * 0.48, y: INIT.worldH * 0.89 },
    ];
    items.forEach(function(item) {
      var t = new PIXI.Text(item.text, {
        fill: hex(INIT.palette.textSecondary), fontSize: 10, fontStyle: "italic",
        fontFamily: "Georgia", align: "center",
      });
      t.anchor.set(0.5); t.position.set(item.x, item.y); t.alpha = 0.3;
      seaLayer.addChild(t);
    });
  }

  /* ── Ornate outer border ────────────────────────────── */
  function drawDecorativeBorder() {
    var g = new PIXI.Graphics();
    var W = INIT.worldW, H = INIT.worldH, m = 10;

    g.lineStyle({ width: 3, color: hex(INIT.palette.route), alpha: 0.3 });
    g.drawRect(m, m, W - m*2, H - m*2);
    g.lineStyle({ width: 1, color: hex(INIT.palette.route), alpha: 0.18 });
    g.drawRect(m + 7, m + 7, W - (m+7)*2, H - (m+7)*2);

    // corner diamonds
    [[m,m],[W-m,m],[m,H-m],[W-m,H-m]].forEach(function(pt) {
      var cx = pt[0], cy = pt[1], s = 9;
      g.lineStyle({ width: 1.5, color: hex(INIT.palette.route), alpha: 0.48 });
      g.beginFill(hex(INIT.palette.marker), 0.65);
      g.moveTo(cx, cy - s); g.lineTo(cx + s, cy);
      g.lineTo(cx, cy + s); g.lineTo(cx - s, cy); g.closePath();
      g.endFill();
    });

    // mid-edge smaller diamonds
    [[W/2,m],[W/2,H-m],[m,H/2],[W-m,H/2]].forEach(function(pt) {
      var cx = pt[0], cy = pt[1], s = 5;
      g.lineStyle({ width: 1, color: hex(INIT.palette.route), alpha: 0.35 });
      g.beginFill(hex(INIT.palette.marker), 0.45);
      g.moveTo(cx, cy - s); g.lineTo(cx + s, cy);
      g.lineTo(cx, cy + s); g.lineTo(cx - s, cy); g.closePath();
      g.endFill();
    });

    fxLayer.addChild(g);
  }

  /* ── Compass rose (16-point) ────────────────────────── */
  function drawCompassRose() {
    var container = new PIXI.Container();
    var rx = INIT.worldW - 124, ry = INIT.worldH - 136;
    container.position.set(rx, ry);
    var S = 54;

    var rings = new PIXI.Graphics();
    rings.lineStyle({ width: 2, color: hex(INIT.palette.routeGlow), alpha: 0.38 });
    rings.drawCircle(0, 0, S + 8);
    rings.lineStyle({ width: 1, color: hex(INIT.palette.route), alpha: 0.22 });
    rings.drawCircle(0, 0, S * 0.48);
    rings.drawCircle(0, 0, S * 0.18);
    container.addChild(rings);

    var armColor = hex(INIT.palette.route);
    var rose = new PIXI.Graphics();
    for (var i = 0; i < 16; i++) {
      var angle = (Math.PI * 2 * i) / 16 - Math.PI / 2;
      var isMain = i % 2 === 0;
      var tipLen = isMain ? S : S * 0.6;
      var bw = isMain ? 0.21 : 0.13;
      var tip  = { x: Math.cos(angle) * tipLen, y: Math.sin(angle) * tipLen };
      var left  = { x: Math.cos(angle + bw) * S * 0.16, y: Math.sin(angle + bw) * S * 0.16 };
      var right = { x: Math.cos(angle - bw) * S * 0.16, y: Math.sin(angle - bw) * S * 0.16 };
      var isNorth = (i === 0);
      var fa = isMain ? (isNorth ? 0.9 : 0.46) : 0.22;
      rose.lineStyle({ width: 1, color: armColor, alpha: isMain ? 0.72 : 0.38 });
      rose.beginFill(isNorth ? hex(INIT.palette.borderCurrent) : armColor, fa);
      rose.moveTo(tip.x, tip.y);
      rose.lineTo(left.x, left.y);
      rose.lineTo(0, 0);
      rose.lineTo(right.x, right.y);
      rose.closePath();
      rose.endFill();
    }
    container.addChild(rose);

    var gem = new PIXI.Graphics();
    gem.beginFill(hex(INIT.palette.marker), 0.95);
    gem.drawCircle(0, 0, 4.5);
    gem.endFill();
    gem.lineStyle({ width: 1.2, color: hex(INIT.palette.route), alpha: 0.75 });
    gem.drawCircle(0, 0, 8);
    container.addChild(gem);

    var dirs = [["N", 0, -S-18], ["S", 0, S+18], ["E", S+18, 0], ["W", -S-18, 0]];
    dirs.forEach(function(d) {
      var t = new PIXI.Text(String(d[0]), {
        fill: d[0] === "N" ? INIT.palette.borderCurrent : INIT.palette.textPrimary,
        fontSize: d[0] === "N" ? 14 : 10,
        fontWeight: d[0] === "N" ? "900" : "700",
        fontFamily: "Georgia",
      });
      t.anchor.set(0.5); t.position.set(Number(d[1]), Number(d[2]));
      container.addChild(t);
    });

    container.alpha = 0.78;
    fxLayer.addChild(container);
  }

  /* ── Country shape builder ──────────────────────────── */
  function buildCountryPoints(node) {
    var rnd = makeRandom("country:" + node.id);
    var points = [], total = 13;
    for (var i = 0; i < total; i++) {
      var angle = (Math.PI * 2 * i) / total;
      var jitter = 0.78 + rnd() * 0.38;
      points.push({
        x: Math.cos(angle) * node.countryWidth  * jitter,
        y: Math.sin(angle) * node.countryHeight * jitter,
      });
    }
    return points;
  }

  function drawCountryShape(g, pts) {
    g.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) {
      var prev = pts[i-1], cur = pts[i];
      g.quadraticCurveTo(prev.x, prev.y, (prev.x+cur.x)*0.5, (prev.y+cur.y)*0.5);
    }
    var last = pts[pts.length-1], first = pts[0];
    var ex = (last.x+first.x)*0.5, ey = (last.y+first.y)*0.5;
    g.quadraticCurveTo(last.x, last.y, ex, ey);
    g.quadraticCurveTo(first.x, first.y, first.x, first.y);
  }

  /* ── Country interior texture & mountains ───────────── */
  function drawCountryInterior(container, pts, rnd, node) {
    // Interior dot texture
    var dotG = new PIXI.Graphics();
    var bminX = Math.min.apply(null, pts.map(function(p){ return p.x; }));
    var bmaxX = Math.max.apply(null, pts.map(function(p){ return p.x; }));
    var bminY = Math.min.apply(null, pts.map(function(p){ return p.y; }));
    var bmaxY = Math.max.apply(null, pts.map(function(p){ return p.y; }));
    var dotCount = Math.floor(6 + rnd() * 9);
    for (var d = 0; d < dotCount; d++) {
      var dx = bminX*0.6 + rnd() * (bmaxX - bminX) * 0.6;
      var dy = bminY*0.6 + rnd() * (bmaxY - bminY) * 0.6;
      if (Math.hypot(dx, dy) < Math.max(node.countryWidth, node.countryHeight) * 0.82) {
        dotG.beginFill(0xffffff, 0.055 + rnd() * 0.055);
        dotG.drawCircle(dx, dy, 1.1 + rnd() * 1.4);
        dotG.endFill();
      }
    }
    container.addChild(dotG);

    // Mountain shapes on larger nodes
    if (node.countryWidth > 105) {
      var mtG = new PIXI.Graphics();
      var numMt = 1 + Math.floor(rnd() * 2);
      for (var m = 0; m < numMt; m++) {
        var mx = (rnd() - 0.5) * node.countryWidth * 0.55;
        var my = (rnd() - 0.5) * node.countryHeight * 0.5;
        var mh = 13 + rnd() * 10, mw = 10 + rnd() * 8;
        mtG.lineStyle({ width: 0.8, color: 0xffffff, alpha: 0.1 });
        mtG.beginFill(0xffffff, 0.055);
        mtG.moveTo(mx, my);
        mtG.lineTo(mx - mw, my + mh);
        mtG.lineTo(mx + mw, my + mh);
        mtG.closePath();
        mtG.endFill();
        // Snow cap
        mtG.beginFill(0xffffff, 0.12);
        mtG.moveTo(mx, my);
        mtG.lineTo(mx - mw * 0.35, my + mh * 0.38);
        mtG.lineTo(mx + mw * 0.35, my + mh * 0.38);
        mtG.closePath();
        mtG.endFill();
      }
      container.addChild(mtG);
    }
  }

  /* ── Routes with dashes and waypoints ──────────────── */
  function drawRoutes() {
    var pulses = [];
    for (var ei = 0; ei < INIT.edges.length; ei++) {
      var edge = INIT.edges[ei];
      var from = INIT.nodesById[edge.from];
      var to   = INIT.nodesById[edge.to];
      if (!from || !to) continue;

      var startX = from.x + from.countryWidth * 0.5;
      var startY = from.y;
      var endX = to.x - to.countryWidth * 0.5;
      var endY = to.y;
      var deltaX = Math.max(88, (endX - startX) * 0.42);
      var c1x = startX + deltaX;
      var c1y = startY;
      var c2x = endX - deltaX;
      var c2y = endY;

      // Dashed road (skip every 3rd segment)
      var segs = 18;
      for (var s = 0; s < segs; s++) {
        if (s % 3 === 2) continue;
        var p0 = cbez(startX, startY, c1x, c1y, c2x, c2y, endX, endY, s / segs);
        var p1 = cbez(startX, startY, c1x, c1y, c2x, c2y, endX, endY, (s + 0.65) / segs);
        var seg = new PIXI.Graphics();
        seg.lineStyle({ width: 2.5, color: hex(INIT.palette.route), alpha: 0.26 });
        seg.moveTo(p0.x, p0.y); seg.lineTo(p1.x, p1.y);
        routeLayer.addChild(seg);
      }

      // Glow overlay
      var glow = new PIXI.Graphics();
      glow.lineStyle({ width: 1.4, color: hex(INIT.palette.routeGlow), alpha: 0.68 });
      glow.moveTo(startX, startY);
      glow.bezierCurveTo(c1x, c1y, c2x, c2y, endX, endY);
      glow.filters = [new PIXI.filters.BlurFilter({ strength: 3.5 })];
      routeLayer.addChild(glow);
      pulses.push(glow);

      // Waypoint diamond at midpoint
      var mid = cbez(startX, startY, c1x, c1y, c2x, c2y, endX, endY, 0.5);
      var diamond = new PIXI.Graphics();
      diamond.lineStyle({ width: 1, color: hex(INIT.palette.route), alpha: 0.6 });
      diamond.beginFill(hex(INIT.palette.marker), 0.55);
      diamond.moveTo(mid.x, mid.y - 5.5);
      diamond.lineTo(mid.x + 5.5, mid.y);
      diamond.lineTo(mid.x, mid.y + 5.5);
      diamond.lineTo(mid.x - 5.5, mid.y);
      diamond.closePath();
      diamond.endFill();
      routeLayer.addChild(diamond);

      // Quarter-point dots
      [0.25, 0.75].forEach(function(t) {
        var pt = cbez(startX, startY, c1x, c1y, c2x, c2y, endX, endY, t);
        var dot = new PIXI.Graphics();
        dot.beginFill(hex(INIT.palette.route), 0.38);
        dot.drawCircle(pt.x, pt.y, 2.8);
        dot.endFill();
        routeLayer.addChild(dot);
      });

      var tip = cbez(startX, startY, c1x, c1y, c2x, c2y, endX, endY, 0.98);
      var prev = cbez(startX, startY, c1x, c1y, c2x, c2y, endX, endY, 0.92);
      var angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
      var arrow = new PIXI.Graphics();
      arrow.beginFill(hex(INIT.palette.routeGlow), 0.74);
      arrow.moveTo(tip.x, tip.y);
      arrow.lineTo(tip.x - Math.cos(angle - 0.34) * 12, tip.y - Math.sin(angle - 0.34) * 12);
      arrow.lineTo(tip.x - Math.cos(angle + 0.34) * 12, tip.y - Math.sin(angle + 0.34) * 12);
      arrow.closePath();
      arrow.endFill();
      routeLayer.addChild(arrow);
    }

    app.ticker.add(function() {
      var wave = (Math.sin(app.ticker.lastTime / 540) + 1) * 0.5;
      pulses.forEach(function(item) { item.alpha = 0.3 + wave * 0.52; });
    });
  }

  /* ── State colors ───────────────────────────────────── */
  function stateColors(node) {
    if (node.completed) return { fill: INIT.palette.countryDone, stroke: INIT.palette.borderDone, glow: INIT.palette.countryDone };
    if (node.id === INIT.currentId) return { fill: INIT.palette.countryCurrent, stroke: INIT.palette.borderCurrent, glow: INIT.palette.countryCurrent };
    if (node.locked) return { fill: INIT.palette.countryLocked, stroke: INIT.palette.borderLocked, glow: INIT.palette.countryLocked };
    return { fill: INIT.palette.countryOpen, stroke: INIT.palette.borderOpen, glow: INIT.palette.countryOpen };
  }

  /* ── Build country node ─────────────────────────────── */
  function makeCountry(node) {
    var colors = stateColors(node);
    var container = new PIXI.Container();
    container.position.set(node.x, node.y);
    container.eventMode = "static";
    container.cursor = "pointer";

    var isCurrent = node.id === INIT.currentId;
    var halo = new PIXI.Graphics();
    halo.beginFill(hex(colors.glow), isCurrent ? 0.20 : 0.09);
    halo.drawRoundedRect(-(node.countryWidth / 2) - 14, -(node.countryHeight / 2) - 14, node.countryWidth + 28, node.countryHeight + 28, 26);
    halo.endFill();
    halo.filters = [new PIXI.filters.BlurFilter({ strength: isCurrent ? 16 : 10 })];
    container.addChild(halo);

    var shadow = new PIXI.Graphics();
    shadow.beginFill(0x000000, 0.18);
    shadow.drawRoundedRect(-(node.countryWidth / 2) + 6, -(node.countryHeight / 2) + 8, node.countryWidth, node.countryHeight, 20);
    shadow.endFill();
    container.addChild(shadow);

    var panel = new PIXI.Graphics();
    panel.lineStyle({ width: isCurrent ? 3 : 2, color: hex(colors.stroke), alpha: 0.96 });
    panel.beginFill(hex(colors.fill), node.locked ? 0.70 : 0.90);
    panel.drawRoundedRect(-(node.countryWidth / 2), -(node.countryHeight / 2), node.countryWidth, node.countryHeight, 20);
    panel.endFill();
    container.addChild(panel);

    var inner = new PIXI.Graphics();
    inner.lineStyle({ width: 1, color: hex(colors.stroke), alpha: 0.22 });
    inner.beginFill(hex(INIT.palette.marker), 0.05);
    inner.drawRoundedRect(-(node.countryWidth / 2) + 8, -(node.countryHeight / 2) + 8, node.countryWidth - 16, node.countryHeight - 16, 14);
    inner.endFill();
    container.addChild(inner);

    var header = new PIXI.Graphics();
    header.beginFill(hex(colors.stroke), 0.18);
    header.drawRoundedRect(-(node.countryWidth / 2) + 8, -(node.countryHeight / 2) + 8, node.countryWidth - 16, 28, 12);
    header.endFill();
    container.addChild(header);

    var shield = new PIXI.Graphics();
    shield.lineStyle({ width: 1.5, color: hex(colors.stroke), alpha: 0.92 });
    shield.beginFill(hex(INIT.palette.marker), 0.96);
    shield.moveTo(-(node.countryWidth / 2) + 24, -(node.countryHeight / 2) + 18);
    shield.lineTo(-(node.countryWidth / 2) + 38, -(node.countryHeight / 2) + 28);
    shield.lineTo(-(node.countryWidth / 2) + 36, -(node.countryHeight / 2) + 46);
    shield.quadraticCurveTo(-(node.countryWidth / 2) + 31, -(node.countryHeight / 2) + 57, -(node.countryWidth / 2) + 24, -(node.countryHeight / 2) + 62);
    shield.quadraticCurveTo(-(node.countryWidth / 2) + 17, -(node.countryHeight / 2) + 57, -(node.countryWidth / 2) + 12, -(node.countryHeight / 2) + 46);
    shield.lineTo(-(node.countryWidth / 2) + 10, -(node.countryHeight / 2) + 28);
    shield.closePath();
    shield.endFill();
    container.addChild(shield);

    var seq = new PIXI.Text(String(node.sequence), {
      fill: INIT.palette.markerText,
      fontSize: 11,
      fontWeight: "800", fontFamily: "Georgia",
    });
    seq.anchor.set(0.5);
    seq.position.set(-(node.countryWidth / 2) + 24, -(node.countryHeight / 2) + 38);
    container.addChild(seq);

    var title = new PIXI.Text(String(node.countryName), {
      fill: INIT.palette.textPrimary,
      fontSize: isCurrent ? 15 : 13,
      fontWeight: "800",
      fontFamily: "Georgia",
      wordWrap: true,
      wordWrapWidth: node.countryWidth - 74,
    });
    title.position.set(-(node.countryWidth / 2) + 50, -(node.countryHeight / 2) + 14);
    container.addChild(title);

    var badgeText = node.badge || (isCurrent ? "Em foco" : node.completed ? "Concluido" : node.locked ? "Selado" : "Disponivel");
    var badge = new PIXI.Graphics();
    badge.lineStyle({ width: 1, color: hex(colors.stroke), alpha: 0.36 });
    badge.beginFill(hex(colors.stroke), 0.18);
    badge.drawRoundedRect((node.countryWidth / 2) - 84, -(node.countryHeight / 2) + 14, 70, 18, 9);
    badge.endFill();
    container.addChild(badge);

    var badgeLabel = new PIXI.Text(String(badgeText).toUpperCase(), {
      fill: INIT.palette.textPrimary,
      fontSize: 8,
      fontWeight: "800",
      fontFamily: "Georgia",
    });
    badgeLabel.anchor.set(0.5);
    badgeLabel.position.set((node.countryWidth / 2) - 49, -(node.countryHeight / 2) + 23);
    container.addChild(badgeLabel);

    var topic = new PIXI.Text(String(node.topicTitle), {
      fill: INIT.palette.textSecondary,
      fontSize: 10,
      fontFamily: "Georgia",
      wordWrap: true,
      wordWrapWidth: node.countryWidth - 28,
    });
    topic.position.set(-(node.countryWidth / 2) + 14, -6);
    container.addChild(topic);

    var capital = new PIXI.Text("Capital: " + String(node.capitalName), {
      fill: INIT.palette.textSecondary,
      fontSize: 9,
      fontWeight: "700",
      fontFamily: "Georgia",
      wordWrap: true,
      wordWrapWidth: node.countryWidth - 28,
    });
    capital.position.set(-(node.countryWidth / 2) + 14, 28);
    container.addChild(capital);

    var biome = new PIXI.Text("Terreno: " + String(node.biome), {
      fill: INIT.palette.textSecondary,
      fontSize: 9,
      fontFamily: "Georgia",
      wordWrap: true,
      wordWrapWidth: node.countryWidth - 28,
    });
    biome.position.set(-(node.countryWidth / 2) + 14, 44);
    container.addChild(biome);

    var leftPort = new PIXI.Graphics();
    leftPort.lineStyle({ width: 1.6, color: hex(colors.stroke), alpha: 0.9 });
    leftPort.beginFill(hex(INIT.palette.marker), 0.94);
    leftPort.drawCircle(-(node.countryWidth / 2), 0, 6);
    leftPort.endFill();
    container.addChild(leftPort);

    var rightPort = new PIXI.Graphics();
    rightPort.lineStyle({ width: 1.6, color: hex(colors.stroke), alpha: 0.9 });
    rightPort.beginFill(hex(INIT.palette.marker), 0.94);
    rightPort.drawCircle(node.countryWidth / 2, 0, 6);
    rightPort.endFill();
    container.addChild(rightPort);

    if (node.completed) {
      var check = new PIXI.Graphics();
      check.lineStyle({ width: 2.4, color: hex(INIT.palette.borderDone), alpha: 0.98 });
      check.moveTo((node.countryWidth / 2) - 28, (node.countryHeight / 2) - 20);
      check.lineTo((node.countryWidth / 2) - 22, (node.countryHeight / 2) - 12);
      check.lineTo((node.countryWidth / 2) - 10, (node.countryHeight / 2) - 28);
      container.addChild(check);
    } else if (node.locked) {
      var lock = new PIXI.Graphics();
      lock.lineStyle({ width: 1.8, color: hex(INIT.palette.textSecondary), alpha: 0.66 });
      lock.drawRoundedRect((node.countryWidth / 2) - 24, (node.countryHeight / 2) - 28, 12, 11, 2);
      lock.moveTo((node.countryWidth / 2) - 22, (node.countryHeight / 2) - 28);
      lock.bezierCurveTo((node.countryWidth / 2) - 22, (node.countryHeight / 2) - 36, (node.countryWidth / 2) - 14, (node.countryHeight / 2) - 36, (node.countryWidth / 2) - 14, (node.countryHeight / 2) - 28);
      container.addChild(lock);
    }

    if (isCurrent) {
      var crown = new PIXI.Graphics();
      crown.lineStyle({ width: 1, color: hex(INIT.palette.borderCurrent), alpha: 0.78 });
      crown.beginFill(hex(INIT.palette.borderCurrent), 0.86);
      crown.moveTo(0, -(node.countryHeight / 2) - 22);
      crown.lineTo(10, -(node.countryHeight / 2) - 10);
      crown.lineTo(4, -(node.countryHeight / 2) - 4);
      crown.lineTo(0, -(node.countryHeight / 2) - 12);
      crown.lineTo(-4, -(node.countryHeight / 2) - 4);
      crown.lineTo(-10, -(node.countryHeight / 2) - 10);
      crown.closePath();
      crown.endFill();
      container.addChild(crown);

      app.ticker.add(function() {
        var t = app.ticker.lastTime;
        halo.alpha = 0.18 + 0.05 * Math.sin(t / 240);
      });
    }

    container.hitArea = new PIXI.RoundedRectangle(-(node.countryWidth / 2), -(node.countryHeight / 2), node.countryWidth, node.countryHeight, 20);
    container.on("pointertap", function() {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: "node:tap", id: node.id })
      );
    });

    return container;
  }

  /* ── HTML overlay ───────────────────────────────────── */
  function mountOverlay() {
    document.getElementById("worldTitle").textContent = INIT.worldName;
    document.getElementById("worldSub").textContent = INIT.worldSubtitle + " - " + INIT.classLabel;
    document.getElementById("worldDesc").textContent = INIT.worldDescription;

    var doneCount = INIT.nodes.filter(function(n){ return n.completed; }).length;
    var openCount = INIT.nodes.filter(function(n){ return !n.locked && !n.completed; }).length;
    var current   = INIT.nodes.find(function(n){ return n.id === INIT.currentId; }) || null;

    document.getElementById("legendA").innerHTML =
      "<span class=\"chip-dot\" style=\"background:" + INIT.palette.borderDone + "\"></span>Reinos conquistados: " + doneCount +
      "<small>Terras dominadas pelo seu progresso.</small>";
    document.getElementById("legendB").innerHTML =
      "<span class=\"chip-dot\"></span>" +
      (current ? "Em foco: " + current.countryName : "Rotas abertas: " + openCount) +
      "<small>" +
      (current ? current.topicTitle : "Estradas disponiveis para seguir.") +
      "</small>";

    var hud = document.getElementById("hud");
    INIT.nodes.slice().sort(function(a, b){ return a.sequence - b.sequence; }).forEach(function(node) {
      var item = document.createElement("div");
      var cls = "stage";
      if (node.completed) cls += " done";
      else if (node.id === INIT.currentId) cls += " curr";
      else if (node.locked) cls += " lock";
      item.className = cls;
      item.style.borderColor = node.completed
        ? INIT.palette.borderDone
        : node.id === INIT.currentId
        ? INIT.palette.borderCurrent
        : node.locked
        ? INIT.palette.borderLocked
        : INIT.palette.borderOpen;
      item.innerHTML =
        "<span class=\"s-num\">" + node.sequence + "</span>" +
        node.countryName +
        "<small>" +
        (node.completed ? "Feudo conquistado"
          : node.locked  ? "Fronteira selada"
          : node.id === INIT.currentId ? "Reino em foco"
          : "Estrada aberta") +
        "</small>";
      item.onclick = function() {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "node:tap", id: node.id })
        );
      };
      hud.appendChild(item);
    });
  }

  /* ── Init ───────────────────────────────────────────── */
  drawSeaBackdrop();
  drawSeaGrid();
  drawSeaWaves();
  drawSeaLabels();
  drawDecorativeBorder();
  drawCompassRose();
  drawRoutes();
  INIT.nodes.forEach(function(node) { countryLayer.addChild(makeCountry(node)); });
  mountOverlay();

  function moveToInitialFocus() {
    var current = INIT.nodes.find(function(node) { return node.id === INIT.currentId; }) || null;
    viewport.fitWorld(true);
    var targetScale = Math.max(
      0.56,
      Math.min(
        1.02,
        Math.min(window.innerWidth / (INIT.worldW + 160), window.innerHeight / (INIT.worldH + 180)) * 1.58
      )
    );
    viewport.setZoom(targetScale, true);
    viewport.moveCenter(current ? current.x : INIT.worldW * 0.5, current ? current.y : INIT.worldH * 0.5);
  }

  moveToInitialFocus();

  window.addEventListener("resize", function() {
    viewport.resize(window.innerWidth, window.innerHeight, INIT.worldW, INIT.worldH);
    moveToInitialFocus();
  });
})();
</script></body></html>`;
}

export const TrilhaMapaHero: React.FC = () => {
  const { grafo, classeAtual, mapTheme } = useTrilha();
  const { usuario } = useUsuario();
  const { width } = useWindowDimensions();
  const profilePalette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null);

  const maxRows = useMemo(
    () => Math.max(1, ...grafo.levels.map((level) => level.length)),
    [grafo.levels]
  );

  const nodes = useMemo(
    () =>
      grafo.levels.flatMap((level, levelIndex) => {
        const columnGap = 248;
        const rowGap = 168;
        const startX = 210;
        const startY = 190;
        const consumedHeight = Math.max(0, (level.length - 1) * rowGap);
        const offsetY = ((maxRows - 1) * rowGap - consumedHeight) / 2;

        return level.map((node, rowIndex) => {
          const country = mapTheme?.countries[node.id];
          const countryName = country?.countryName ?? node.titulo;

          return {
            id: node.id,
            sequence: node.sequence,
            topicTitle: node.titulo,
            countryName,
            capitalName: country?.capitalName ?? `Capital ${node.sequence}`,
            lore: country?.lore ?? node.resumo ?? "",
            emblem: country?.emblem ?? "map",
            biome: country?.biome ?? "fronteiras em expansao",
            completed: !!node.completed,
            locked: !!node.locked,
            x: startX + levelIndex * columnGap + (levelIndex % 2 === 0 ? 0 : 14),
            y: startY + offsetY + rowIndex * rowGap,
            badge: node.badgeLabel ?? null,
            countryWidth: Math.max(186, Math.min(226, 188 + countryName.length * 0.95)),
            countryHeight: 126,
          };
        });
      }),
    [grafo.levels, mapTheme, maxRows]
  );

  const currentId = useMemo(
    () => grafo.nodes.find((node) => !node.completed && !node.locked)?.id ?? null,
    [grafo.nodes]
  );

  const html = useMemo(
    () =>
      buildHTML({
        worldW: Math.max(1540, width + 420, 420 + Math.max(0, grafo.levels.length - 1) * 248 + 460),
        worldH: Math.max(980, 360 + Math.max(0, maxRows - 1) * 168 + 340),
        nodes,
        nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
        edges: grafo.edges,
        currentId,
        worldName: mapTheme?.worldName ?? classeAtual?.resumo?.materia_nome ?? "Mundo da Classe",
        worldSubtitle: mapTheme?.worldSubtitle ?? "Carta principal da sua jornada",
        worldDescription:
          mapTheme?.worldDescription ??
          "Cada topico e um reino navegavel em uma malha de rotas e dependencias.",
        classLabel: mapTheme?.classLabel ?? classeAtual?.resumo?.materia_nome ?? "Classe",
        palette: {
          ...(mapTheme?.palette ?? {
            skyTop: "#111827",
            skyBottom: "#172554",
            sea: "#13253a",
            seaDeep: "#08131f",
            route: profilePalette.accent,
            routeGlow: profilePalette.accentStrong,
            countryLocked: "#2a3347",
            countryOpen: profilePalette.accentStrong,
            countryDone: "#355c47",
            countryCurrent: profilePalette.accent,
            borderLocked: "#57627b",
            borderOpen: profilePalette.accent,
            borderDone: "#7ac870",
            borderCurrent: profilePalette.accent,
            marker: "#f2e6c8",
            markerText: "#2a1a08",
            textPrimary: profilePalette.text,
            textSecondary: "#c7d2fe",
            panelBg: profilePalette.surfaceElevated,
            panelBorder: profilePalette.borderStrong,
          }),
          route: profilePalette.accent,
          routeGlow: profilePalette.accentStrong,
          countryOpen: profilePalette.accentStrong,
          countryCurrent: profilePalette.accent,
          borderOpen: profilePalette.accent,
          borderCurrent: profilePalette.accent,
          textPrimary: profilePalette.text,
          panelBg: profilePalette.surfaceElevated,
          panelBorder: profilePalette.borderStrong,
        },
      }),
    [
      classeAtual?.resumo?.materia_nome,
      currentId,
      grafo.edges,
      grafo.levels.length,
      mapTheme,
      maxRows,
      nodes,
      profilePalette.accent,
      profilePalette.accentStrong,
      profilePalette.borderStrong,
      profilePalette.surfaceElevated,
      profilePalette.text,
      width,
    ]
  );

  return (
    <View style={{ flex: 1, backgroundColor: profilePalette.background }}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={(event) => {
          try {
            const payload = JSON.parse(event.nativeEvent.data);
            if (payload?.type === "node:tap" && payload.id) {
              router.push(`/(tabs)/trilha/${encodeURIComponent(payload.id)}`);
            }
          } catch {}
        }}
        style={{ flex: 1 }}
      />
    </View>
  );
};
