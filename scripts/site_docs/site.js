// Comportamento da documentação: menu, sumário, diagramas Mermaid e gráficos.
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

const css = getComputedStyle(document.documentElement);
const cor = (v) => css.getPropertyValue(v).trim();

// ---------- menu (telas estreitas)
document.querySelector(".menu-btn")?.addEventListener("click", () => {
  document.body.classList.toggle("menu-aberto");
});

// ---------- sumário: marca a seção visível
const linksToc = [...document.querySelectorAll(".toc a")];
if (linksToc.length) {
  const alvos = linksToc.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
  const obs = new IntersectionObserver(
    (ents) => {
      for (const e of ents) {
        if (!e.isIntersecting) continue;
        linksToc.forEach((a) => a.classList.toggle("ativo", decodeURIComponent(a.hash.slice(1)) === e.target.id));
      }
    },
    { rootMargin: "-15% 0px -75% 0px" }
  );
  alvos.forEach((t) => obs.observe(t));
}

// ---------- diagramas
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  // Sem isto o id de cada SVG sai de Date.now(): dois diagramas no mesmo milissegundo
  // ganham o mesmo id e o segundo é desenhado dentro do primeiro.
  deterministicIds: true,
  theme: "base",
  fontFamily: "Inter, system-ui, sans-serif",
  themeVariables: {
    darkMode: true,
    background: cor("--surface"),
    fontSize: "14px",
    primaryColor: cor("--surface-sub"),
    primaryTextColor: cor("--ink"),
    primaryBorderColor: cor("--accent"),
    secondaryColor: cor("--accent-wash"),
    secondaryTextColor: cor("--ink"),
    secondaryBorderColor: cor("--rule-strong"),
    tertiaryColor: cor("--ground-2"),
    tertiaryTextColor: cor("--ink"),
    tertiaryBorderColor: cor("--rule-strong"),
    lineColor: cor("--muted"),
    textColor: cor("--ink-soft"),
    mainBkg: cor("--surface-sub"),
    nodeBorder: cor("--accent"),
    clusterBkg: "rgba(160,141,245,0.06)",
    clusterBorder: cor("--rule-strong"),
    titleColor: cor("--accent-2"),
    edgeLabelBackground: cor("--ground-2"),
    noteBkgColor: "#2b2414",
    noteTextColor: cor("--ink"),
    noteBorderColor: cor("--accent-2"),
    actorBkg: cor("--surface-sub"),
    actorBorder: cor("--accent"),
    actorTextColor: cor("--ink"),
    actorLineColor: cor("--rule-strong"),
    signalColor: cor("--ink-soft"),
    signalTextColor: cor("--ink"),
    labelBoxBkgColor: cor("--surface-sub"),
    labelBoxBorderColor: cor("--rule-strong"),
    labelTextColor: cor("--ink"),
    loopTextColor: cor("--ink-soft"),
    activationBkgColor: cor("--accent-wash"),
    activationBorderColor: cor("--accent"),
    sequenceNumberColor: "#120f24",
    attributeBackgroundColorOdd: cor("--surface"),
    attributeBackgroundColorEven: cor("--surface-sub"),
    labelColor: cor("--ink"),
    altBackground: cor("--surface"),
  },
  flowchart: { htmlLabels: true, curve: "basis" },
  sequence: { mirrorActors: false, showSequenceNumbers: true },
  er: { useMaxWidth: true },
});

const pres = [...document.querySelectorAll("pre.mermaid")];
if (pres.length) {
  // Medir o texto antes de a fonte carregar desenha caixas do tamanho errado.
  await document.fonts.ready;
  await mermaid.run({ nodes: pres, suppressErrors: true });
}

const zoom = document.createElement("div");
zoom.className = "zoom";
zoom.innerHTML = '<button class="fechar" type="button">fechar · Esc</button><div class="conteudo"></div>';
document.body.appendChild(zoom);
const fecharZoom = () => { zoom.classList.remove("aberto"); zoom.querySelector(".conteudo").innerHTML = ""; };
zoom.querySelector(".fechar").addEventListener("click", fecharZoom);
zoom.addEventListener("click", (e) => { if (e.target === zoom) fecharZoom(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharZoom(); });
document.querySelectorAll("figure.diagrama button.ampliar").forEach((b) => {
  b.addEventListener("click", () => {
    const svg = b.closest("figure").querySelector("svg");
    if (!svg) return;
    const copia = svg.cloneNode(true);
    const largura = svg.viewBox?.baseVal?.width || svg.getBoundingClientRect().width;
    copia.style.width = Math.max(largura * 1.25, window.innerWidth * 0.9) + "px";
    copia.style.maxWidth = "none";
    zoom.querySelector(".conteudo").appendChild(copia);
    zoom.classList.add("aberto");
  });
});

// ---------- gráficos (série única; cor = --accent, texto em tokens de texto)
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, pai) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  pai?.appendChild(n);
  return n;
};
const fmt = (n) => n.toLocaleString("pt-BR");
const passoLimpo = (max) => {
  const bruto = max / 4;
  const p = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= bruto);
};
// coluna com topo arredondado (4px) e base reta
const caminhoColuna = (x, y, w, h, r = 4) => {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};
const caminhoBarra = (x, y, w, h, r = 4) => {
  r = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
};

function dica(fig) {
  let d = fig.querySelector(".dica");
  if (!d) { d = document.createElement("div"); d.className = "dica"; fig.appendChild(d); }
  return d;
}
function mostrarDica(fig, alvo, html) {
  const d = dica(fig);
  const r = alvo.getBoundingClientRect();
  const f = fig.getBoundingClientRect();
  d.innerHTML = html;
  d.style.left = r.left - f.left + r.width / 2 + "px";
  d.style.top = r.top - f.top - 4 + "px";
  d.style.opacity = 1;
}
const esconderDica = (fig) => { const d = fig.querySelector(".dica"); if (d) d.style.opacity = 0; };

function colunas(fig, dados) {
  const W = 560, H = 230, m = { t: 18, r: 8, b: 28, l: 34 };
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": dados.titulo });
  fig.querySelector(".plot").appendChild(svg);
  const max = Math.max(...dados.pontos.map((p) => p.v));
  const passo = passoLimpo(max);
  const topo = Math.ceil(max / passo) * passo;
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / topo);
  const grade = el("g", { class: "grade" }, svg);
  const eixo = el("g", { class: "eixo" }, svg);
  for (let v = 0; v <= topo; v += passo) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, grade);
    el("text", { x: m.l - 6, y: y(v) + 3.5, "text-anchor": "end" }, eixo).textContent = fmt(v);
  }
  const banda = (W - m.l - m.r) / dados.pontos.length;
  const larg = Math.min(24, banda - 6);
  const iMax = dados.pontos.findIndex((p) => p.v === max);
  dados.pontos.forEach((p, i) => {
    const x = m.l + banda * i + (banda - larg) / 2;
    const g = el("g", { class: "col", tabindex: 0, role: "img", "aria-label": `${p.r}: ${fmt(p.v)}${p.parcial ? " (semana parcial)" : ""}` }, svg);
    el("rect", { class: "alvo", x: m.l + banda * i, y: m.t, width: banda, height: H - m.t - m.b }, g);
    if (p.v > 0) el("path", { class: "barra" + (p.parcial ? " parcial" : ""), d: caminhoColuna(x, y(p.v), larg, y(0) - y(p.v)) }, g);
    el("text", { x: x + larg / 2, y: H - m.b + 15, "text-anchor": "middle" }, eixo).textContent = p.r;
    if (i === iMax) el("text", { class: "rotulo", x: x + larg / 2, y: y(p.v) - 6, "text-anchor": "middle" }, svg).textContent = fmt(p.v);
    const html = `<b>${fmt(p.v)}</b> <span>${dados.unidade} · ${p.r}${p.parcial ? " (parcial)" : ""}</span>`;
    g.addEventListener("mouseenter", () => mostrarDica(fig, g.querySelector(".alvo"), html));
    g.addEventListener("focus", () => mostrarDica(fig, g.querySelector(".alvo"), html));
    g.addEventListener("mouseleave", () => esconderDica(fig));
    g.addEventListener("blur", () => esconderDica(fig));
  });
  el("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), stroke: cor("--rule-strong") }, svg);
}

function barras(fig, dados) {
  const linha = 34, m = { t: 6, r: 70, b: 6, l: 120 };
  const W = 560, H = m.t + m.b + linha * dados.pontos.length;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": dados.titulo });
  fig.querySelector(".plot").appendChild(svg);
  const max = Math.max(...dados.pontos.map((p) => p.v));
  const x = (v) => (W - m.l - m.r) * (v / max);
  const eixo = el("g", { class: "eixo" }, svg);
  dados.pontos.forEach((p, i) => {
    const yy = m.t + linha * i + (linha - 20) / 2;
    const g = el("g", { class: "col", tabindex: 0, role: "img", "aria-label": `${p.r}: ${fmt(p.v)} ${dados.unidade}` }, svg);
    el("rect", { class: "alvo", x: 0, y: m.t + linha * i, width: W, height: linha }, g);
    el("path", { class: "barra", d: caminhoBarra(m.l, yy, Math.max(x(p.v), 2), 20) }, g);
    el("text", { x: m.l - 8, y: yy + 14, "text-anchor": "end", style: "font-size:11px;fill:" + cor("--ink-soft") }, eixo).textContent = p.r;
    el("text", { class: "rotulo", x: m.l + x(p.v) + 6, y: yy + 14 }, svg).textContent = fmt(p.v);
    const html = `<b>${fmt(p.v)}</b> <span>${dados.unidade} · ${p.r}</span>`;
    g.addEventListener("mouseenter", () => mostrarDica(fig, g.querySelector(".alvo"), html));
    g.addEventListener("mouseleave", () => esconderDica(fig));
  });
  el("line", { x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, stroke: cor("--rule-strong") }, svg);
}

const fonte = document.getElementById("dados-graficos");
if (fonte) {
  const todos = JSON.parse(fonte.textContent);
  document.querySelectorAll("[data-grafico]").forEach((fig) => {
    const dados = todos[fig.dataset.grafico];
    if (!dados) return;
    (dados.tipo === "barras" ? barras : colunas)(fig, dados);
    fig.querySelector("button.alternar")?.addEventListener("click", (e) => {
      fig.classList.toggle("ver-tabela");
      e.currentTarget.textContent = fig.classList.contains("ver-tabela") ? "ver gráfico" : "ver tabela";
    });
  });
}

// Modelos da página de gamificação: troca a cor sem recarregar.
document.querySelectorAll(".tema-trocar").forEach((grupo) => {
  const vitrine = grupo.nextElementSibling;
  grupo.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b || !vitrine) return;
    vitrine.style.setProperty("--c", b.dataset.temaCor);
    vitrine.style.setProperty("--p", b.dataset.temaPrimaria);
    vitrine.style.setProperty("--f", b.dataset.temaFundo);
    grupo.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
});
