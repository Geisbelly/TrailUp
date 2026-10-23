// Tema por perfil e peças das telas logadas do celular (mobile-v1).
// Os 7 perfis e a fórmula da paleta são os do v4 (03-trilha.html); as artes vêm de ../v4/assets.
const ARTE = '../v4/assets/';
const PERFIS = {
  seeker:     {label:'Seeker',     modo:'mapa',   guardiao:'Amara',        chat:true,  p:['#0b2825','#123f3c','#195752','#288a83','#4dcbc1','#f3f7f6','#1fd9ca','#127f77'], sig:'#17a398'},
  survivor:   {label:'Survivor',   modo:'arvore', guardiao:'Kenji',        chat:false, p:['#16191d','#23292e','#313840','#4d5965','#7d8c9c','#f3f5f6','#95a1ae','#3c464f'], sig:'#4e5a66'},
  daredevil:  {label:'Daredevil',  modo:'mapa',   guardiao:'Ember',        chat:false, p:['#280b0f','#3f1218','#571921','#8a2835','#cb4d5e','#f7f3f3','#e87b89','#b42033'], sig:'#d7263d'},
  mastermind: {label:'Mastermind', modo:'arvore', guardiao:'Idris',        chat:false, p:['#110b28','#1b123f','#241957','#3a288a','#644dcb','#f4f3f7','#9583e6','#4528c8'], sig:'#5b3fd9'},
  conqueror:  {label:'Conqueror',  modo:'mapa',   guardiao:'Amina',        chat:false, p:['#0b1328','#121e3f','#192a57','#28428a','#4d6fcb','#f3f4f7','#6f90eb','#1942b2'], sig:'#1e4fd6'},
  socializer: {label:'Socializer', modo:'lista',  guardiao:'Mateo e Zuri', chat:true,  p:['#28120b','#3f1c12','#572719','#8a3d28','#cb684d','#f7f4f3','#f68161','#f24313'], sig:'#f4623a'},
  achiever:   {label:'Achiever',   modo:'lista',  guardiao:'Kwame',        chat:false, p:['#28210b','#3f3412','#574819','#8a7328','#cbad4d','#f7f6f3','#dab43f','#a78620'], sig:'#c9a227'},
};
const qs = new URLSearchParams(location.search);
let perfil = PERFIS[qs.get('perfil')] ? qs.get('perfil') : 'conqueror';

function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function clarear(hex, dl) { // sobe L em HSL; nunca mistura com branco
  let r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  l = Math.min(1, l + dl);
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  let R, G, B; if (s === 0) { R = G = B = l; } else { const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; R = f(p, q, h + 1 / 3); G = f(p, q, h); B = f(p, q, h - 1 / 3); }
  return '#' + [R, G, B].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
function aplicarTema() {
  const [bg, su, el, bo, bs, tx, ac, as] = PERFIS[perfil].p, st = document.documentElement.style, set = (k, v) => st.setProperty(k, v);
  set('--bg', bg); set('--surface', su); set('--elev', el); set('--border', bo); set('--border-strong', bs); set('--text', tx);
  set('--accent', ac); set('--accent-strong', as); set('--accent-hi', clarear(ac, .1)); set('--accent-soft', rgba(ac, .18)); set('--accent-muted', rgba(ac, .12));
  set('--text-muted', rgba(tx, .82)); set('--text-subtle', rgba(tx, .62)); set('--inactive', rgba(tx, .5)); set('--line', rgba(bo, .55));
  set('--surface-a88', rgba(su, .88)); set('--surface-a94', rgba(su, .94)); set('--bg-a85', rgba(bg, .85)); set('--bg-a70', rgba(bg, .7)); set('--bg-a55', rgba(bg, .55)); set('--elev-hi', clarear(el, .05));
}

const ICONE = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  cadeado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"/></svg>',
  relogio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  brilho: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>',
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  ajuda: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg>',
  repetir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  mapa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 20l-5.5 2V6L9 4l6 2 5.5-2v16L15 22l-6-2z"/><path d="M9 4v16M15 6v16"/></svg>',
  escola: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>',
  estrela: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>',
  enviar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
};

// Barra de abas inferior (regras gerais §3): as 5 abas do app. `bloqueadas` = portões fechados.
const ABAS = [
  ['trilha', 'Trilha', '03-trilha.html', '<path d="M9 20l-5.5 2V6L9 4l6 2 5.5-2v16L15 22l-6-2z"/><path d="M9 4v16M15 6v16"/>'],
  ['notificacoes', 'Notificações', '07-notificacoes.html', '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'],
  ['social', 'Social', '06-social.html', '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'],
  ['ranking', 'Ranking', '05-ranking.html', '<path d="M4 21h16M6 21V10M12 21V3M18 21v-7"/>'],
  ['perfil', 'Perfil', '08-perfil-hub.html', '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>'],
];
function abasHTML(ativa, bloqueadas = []) {
  return `<nav class="abas" aria-label="Seções do app">${ABAS.map(([k, rot, href, path]) => {
    const trava = bloqueadas.includes(k);
    return `<a href="${href}" class="aba ${ativa === k ? 'ativa' : ''} ${trava ? 'travada' : ''}" ${ativa === k ? 'aria-current="page"' : ''} data-aba="${k}" ${trava ? `aria-label="${rot}, bloqueado"` : ''}>
      <span class="aba-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">${path}</svg>${k === 'notificacoes' ? '<span class="aba-nb">2</span>' : ''}${trava ? `<span class="aba-trava">${ICONE.cadeado}</span>` : ''}</span>${rot}</a>`;
  }).join('')}</nav>`;
}

// Hexágono de ponta para cima, cantos arredondados (mesmo desenho do v4)
function hexPath(cx, cy, R, rc) {
  const v = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 90); v.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  let d = ''; for (let i = 0; i < 6; i++) { const p = v[i], pr = v[(i + 5) % 6], nx = v[(i + 1) % 6], t = rc / R;
    const a = [p[0] + (pr[0] - p[0]) * t, p[1] + (pr[1] - p[1]) * t], b = [p[0] + (nx[0] - p[0]) * t, p[1] + (nx[1] - p[1]) * t];
    d += (i ? 'L' : 'M') + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + ' Q' + p[0].toFixed(2) + ' ' + p[1].toFixed(2) + ' ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2) + ' '; }
  return d + 'Z';
}
const HEX_FORA = hexPath(50, 50, 46, 9), HEX_DENTRO = hexPath(50, 50, 37, 7), HEX_SEL = hexPath(50, 50, 53, 11);
const HEX_ESTILO = {
  done:    {grad: 'g-done',    stroke: 'var(--accent-hi)', sw: 2, inner: 'rgba(255,255,255,.28)', glyph: 'var(--bg)', brilho: true},
  current: {grad: 'g-current', stroke: 'var(--text)',      sw: 3, inner: 'rgba(255,255,255,.45)', glyph: 'var(--bg)', brilho: true},
  open:    {grad: 'g-open',    stroke: 'var(--accent)',    sw: 2, inner: 'var(--accent-soft)',    glyph: 'var(--text)'},
  locked:  {grad: 'g-locked',  stroke: 'var(--border)',    sw: 2, inner: 'rgba(255,255,255,.05)', glyph: 'var(--inactive)', dash: '5 5'},
};
const HEX_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="g-done" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--accent-strong)"/></linearGradient>
  <linearGradient id="g-current" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent-hi)"/><stop offset="1" style="stop-color:var(--accent)"/></linearGradient>
  <linearGradient id="g-open" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--elev-hi)"/><stop offset="1" style="stop-color:var(--surface)"/></linearGradient>
  <linearGradient id="g-locked" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--surface)"/><stop offset="1" style="stop-color:var(--bg)"/></linearGradient>
  <linearGradient id="g-shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <pattern id="g-locked-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V10" style="stroke:var(--border)" stroke-width="2"/></pattern>
</defs></svg>`;
function hexSVG(t, size, sel = false) {
  const S = HEX_ESTILO[t.st];
  const glifo = t.st === 'done' ? ICONE.check : t.st === 'locked' ? ICONE.cadeado : `<span class="n" style="font-size:${Math.round(size * .36)}px">${t.n}</span>`;
  return `<span class="hx" style="--size:${size}px"><svg viewBox="0 0 100 100" aria-hidden="true">
      ${sel ? `<path d="${HEX_SEL}" fill="none" stroke="var(--text)" stroke-width="2" stroke-dasharray="3 5"/>` : ''}
      <path d="${HEX_FORA}" fill="url(#${S.grad})" stroke="${S.stroke}" stroke-width="${S.sw}" ${S.dash ? `stroke-dasharray="${S.dash}"` : ''}/>
      <path d="${HEX_DENTRO}" fill="none" stroke="${S.inner}" stroke-width="1.5"/>
      ${S.brilho ? `<path d="${HEX_DENTRO}" fill="url(#g-shine)" opacity=".55"/>` : ''}
    </svg><span class="glifo" style="color:${S.glyph}">${glifo}</span></span>`;
}

// Seletor de pré-visualização: estado + perfil (fora do aparelho)
function previewHTML(estados, atual) {
  return `<span>Estado:</span><select id="estado" aria-label="Estado da tela">${estados.map(([k, l]) => `<option value="${k}" ${atual === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <span class="perfis">${Object.entries(PERFIS).map(([k, p]) => `<button class="bolinha" style="background:${p.sig}" title="${p.label} (${p.modo})" aria-label="Perfil ${p.label}" aria-pressed="${perfil === k}" data-perfil="${k}"></button>`).join('')}</span>`;
}
