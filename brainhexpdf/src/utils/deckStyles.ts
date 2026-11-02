// Folha de estilo do deck HTML do aluno. Sem Tailwind em tempo de execucao:
// o deck fica em cache no app e precisa abrir sem rede (o Play CDN do
// Tailwind compilava as classes no aparelho, a cada abertura, e sem rede o
// deck abria sem estilo nenhum).
//
// Tudo e' escopado em `.tu-deck`, porque a mesma folha entra no export de PDF
// do estudio (generatePdfPageHtml), dentro da pagina do proprio estudio.
//
// Decisoes de leitura (ver docs/superpowers/specs/2026-11-02-deck-html-redesenho-design.md):
//  - corpo de 17 a 19px, linha 1.6, medida de ~66 caracteres (WCAG 1.4.8);
//  - nada abaixo de 14px; rotulos em caixa normal (caixa-alta mono era
//    9-11px e lia mal);
//  - alvos de toque de 44px (WCAG 2.5.5);
//  - claro e escuro com AAA (7:1) em todo texto, ver deckTheme.ts;
//  - prefers-reduced-motion e a escolha do aluno desligam as animacoes.

import type { DeckData } from '../types';
import { buildDeckColorTokens, deckTokensToCss } from './deckTheme';
import { motifDataUri } from './deckProfileIdentity';

export const DECK_PREFS_STORAGE_KEY = 'trailup_deck_prefs';

function modeBlock(profile: string, mode: 'dark' | 'light'): string {
  const t = buildDeckColorTokens(profile, mode);
  const onSuccess = mode === 'dark' ? t.bg : t.surface;
  return `color-scheme: ${mode}; ${deckTokensToCss(t)} --on-success: ${onSuccess}; --motif: ${motifDataUri(profile, t.accent)};`;
}

/** CSS escopado em .tu-deck (tokens dos dois modos + componentes). */
export function getDeckScopedCss(deck: Pick<DeckData, 'targetProfile'>): string {
  const profile = String(deck.targetProfile || '');
  const dark = modeBlock(profile, 'dark');
  const light = modeBlock(profile, 'light');
  return `
    .tu-deck { ${dark} }
    html[data-theme="light"] .tu-deck, .tu-deck[data-theme="light"] { ${light} }
    html[data-theme="dark"] .tu-deck, .tu-deck[data-theme="dark"] { ${dark} }
    @media (prefers-color-scheme: light) {
      html:not([data-theme]) .tu-deck:not([data-theme]) { ${light} }
    }

    .tu-deck {
      --font-body: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-display: "Cinzel", Georgia, "Times New Roman", serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      --scale: 1;
      --lh: 1.6;
      --ls: normal;
      --ws: normal;
      --para: 0.9em;
      --fs-body: calc(var(--scale) * clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem));
      --fs-small: calc(var(--scale) * 0.9375rem);
      --fs-meta: calc(var(--scale) * 0.875rem);
      --fs-lead: calc(var(--scale) * clamp(1.125rem, 1.05rem + 0.45vw, 1.375rem));
      --fs-h3: calc(var(--scale) * 1.125rem);
      --fs-h2: calc(var(--scale) * clamp(1.375rem, 1.15rem + 1.1vw, 2rem));
      --fs-cover: calc(var(--scale) * clamp(1.5rem, 1.1rem + 2.2vw, 2.6rem));
      --radius: 16px;
      --radius-sm: 12px;
      --measure: 66ch;
      font-family: var(--font-body);
      font-size: var(--fs-body);
      line-height: var(--lh);
      letter-spacing: var(--ls);
      word-spacing: var(--ws);
      color: var(--ink);
      background: var(--bg);
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
      -webkit-font-smoothing: antialiased;
    }
    html[data-texto="grande"] .tu-deck { --scale: 1.15; }
    html[data-texto="maior"] .tu-deck { --scale: 1.3; }
    /* Valores de WCAG 1.4.12 (espacamento de texto). */
    html[data-espaco="amplo"] .tu-deck { --lh: 1.85; --ls: 0.02em; --ws: 0.08em; --para: 1.5em; }

    .tu-deck *, .tu-deck *::before, .tu-deck *::after { box-sizing: border-box; }
    .tu-deck [hidden] { display: none !important; }
    .tu-deck button { font: inherit; letter-spacing: inherit; word-spacing: inherit; }
    .tu-deck :focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
    .tu-deck .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }

    /* ---------------------------------------------------------------- slide */
    .tu-deck .slide { width: 100%; max-width: 1040px; margin: auto; }
    .tu-deck .slide-head { margin: 0 0 20px; max-width: var(--measure); }
    .tu-deck .slide-kicker {
      margin: 0 0 6px; font-size: var(--fs-small); font-weight: 700; color: var(--accent);
    }
    .tu-deck .slide-title {
      margin: 0; font-size: var(--fs-h2); line-height: 1.2; font-weight: 800;
      letter-spacing: -0.01em; text-wrap: balance; overflow-wrap: anywhere;
    }
    .tu-deck .slide-title:focus { outline: none; }
    .tu-deck .slide-title:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
    .tu-deck .slide-subtitle { margin: 8px 0 0; font-size: var(--fs-lead); line-height: 1.4; color: var(--ink-muted); }
    .tu-deck .slide-objective {
      margin: 14px 0 0; padding: 10px 14px; border-radius: var(--radius-sm);
      background: var(--surface-2); border: 1px solid var(--border);
      font-size: var(--fs-small); line-height: 1.5; color: var(--ink-muted);
    }
    .tu-deck .slide-objective strong { color: var(--ink); }

    .tu-deck .slide-body { display: grid; gap: 24px; }
    @media (min-width: 960px) {
      .tu-deck .slide-body.has-aside { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); align-items: start; }
    }
    .tu-deck .slide-main, .tu-deck .slide-aside { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
    .tu-deck .prose { max-width: var(--measure); overflow-wrap: break-word; }
    .tu-deck .prose p { margin: 0 0 var(--para); }
    .tu-deck .prose p:last-child { margin-bottom: 0; }
    .tu-deck .prose--lead p { font-size: var(--fs-lead); line-height: calc(var(--lh) - 0.05); }
    .tu-deck strong { font-weight: 750; }
    .tu-deck code {
      font-family: var(--font-mono); font-size: 0.9em; padding: 0.08em 0.35em; border-radius: 6px;
      background: var(--surface-2); border: 1px solid var(--border);
    }

    /* Fala do guia */
    .tu-deck .guide-callout {
      display: flex; gap: 14px; align-items: flex-start; margin: 0 0 24px; padding: 14px 16px;
      max-width: var(--measure); border-radius: var(--radius); background: var(--surface-accent);
      border: 1px solid var(--border); border-inline-start: 4px solid var(--accent);
    }
    .tu-deck .guide-avatar {
      flex: none; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center;
      background: var(--accent); color: var(--on-accent); font-family: var(--font-display);
      font-weight: 700; font-size: 1rem; letter-spacing: 0;
    }
    .tu-deck .guide-text { min-width: 0; }
    .tu-deck .guide-name { margin: 0; font-size: var(--fs-small); font-weight: 800; color: var(--accent); }
    .tu-deck .guide-phase { font-weight: 600; color: var(--ink-muted); }
    .tu-deck .guide-speech { margin: 2px 0 0; }

    /* Cartoes e widgets */
    .tu-deck .card, .tu-deck .widget {
      background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px;
    }
    .tu-deck .widget { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
    .tu-deck .widget-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .tu-deck .widget-label {
      margin: 0; display: inline-flex; align-items: center; gap: 8px;
      font-size: var(--fs-small); font-weight: 800; color: var(--accent);
    }
    .tu-deck .widget-label svg { width: 18px; height: 18px; flex: none; }
    .tu-deck .widget-title { margin: 0; font-size: var(--fs-h3); font-weight: 800; line-height: 1.35; }
    .tu-deck .widget-question { margin: 0; font-size: var(--fs-h3); font-weight: 700; line-height: 1.45; }
    .tu-deck .widget-hint { margin: 0; font-size: var(--fs-small); color: var(--ink-muted); }
    .tu-deck .xp-tag {
      flex: none; font-size: var(--fs-meta); font-weight: 800; padding: 2px 10px; border-radius: 999px;
      background: var(--surface-accent); color: var(--accent); border: 1px solid var(--border);
      font-variant-numeric: tabular-nums; white-space: nowrap;
    }

    .tu-deck .option-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .tu-deck .option, .tu-deck .check-row, .tu-deck .choice {
      display: flex; align-items: flex-start; gap: 12px; width: 100%; min-height: 48px; padding: 12px 14px;
      text-align: start; color: var(--ink); background: var(--surface); border: 1.5px solid var(--border);
      border-radius: var(--radius-sm); cursor: pointer; line-height: 1.45;
      transition: border-color .15s ease, background-color .15s ease, transform .15s ease;
    }
    .tu-deck .option:hover, .tu-deck .check-row:hover, .tu-deck .choice:hover { border-color: var(--border-strong); }
    .tu-deck .option-letter, .tu-deck .check-box {
      flex: none; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center;
      font-size: var(--fs-meta); font-weight: 800; background: var(--surface-2); color: var(--ink);
      border: 1.5px solid var(--border-strong); font-variant-numeric: tabular-nums;
    }
    .tu-deck .option-text, .tu-deck .check-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .tu-deck .option-state { flex: none; font-size: var(--fs-meta); font-weight: 800; }
    .tu-deck .option.is-correct { border-color: var(--success); background: var(--success-surface); }
    .tu-deck .option.is-correct .option-letter { background: var(--success); color: var(--on-success); border-color: var(--success); }
    .tu-deck .option.is-correct .option-state { color: var(--success); }
    .tu-deck .option.is-wrong { border-color: var(--danger); background: var(--danger-surface); }
    .tu-deck .option.is-wrong .option-letter { background: var(--danger-surface); color: var(--danger); border-color: var(--danger); }
    .tu-deck .option.is-wrong .option-state { color: var(--danger); }

    .tu-deck .check-row { align-items: center; }
    .tu-deck .check-row .xp-tag { margin-inline-start: auto; }
    .tu-deck .check-row.is-done { border-color: var(--success); background: var(--success-surface); }
    .tu-deck .check-row.is-done .check-box { background: var(--success); color: var(--on-success); border-color: var(--success); }
    .tu-deck .check-row.is-done .xp-tag { color: var(--success); background: var(--surface); }

    .tu-deck .choice-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
    .tu-deck .choice { flex-direction: column; gap: 6px; }
    .tu-deck .choice-top { display: flex; width: 100%; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .tu-deck .choice-title { margin: 0; font-weight: 800; }
    .tu-deck .choice-desc { margin: 0; font-size: var(--fs-small); color: var(--ink-muted); }
    .tu-deck .choice.is-selected { border-color: var(--accent); background: var(--surface-accent); }

    .tu-deck .feedback { padding: 12px 14px; border-radius: var(--radius-sm); border: 1.5px solid var(--border); background: var(--surface); }
    .tu-deck .feedback-title { display: flex; align-items: center; gap: 6px; font-weight: 800; margin: 0 0 4px; }
    .tu-deck .feedback p { margin: 0; }
    .tu-deck .feedback--success { background: var(--success-surface); border-color: var(--success); }
    .tu-deck .feedback--success .feedback-title { color: var(--success); }
    .tu-deck .feedback--danger { background: var(--danger-surface); border-color: var(--danger); }
    .tu-deck .feedback--danger .feedback-title { color: var(--danger); }
    .tu-deck .feedback--accent { background: var(--surface-accent); border-color: var(--border-strong); }
    .tu-deck .feedback--accent .feedback-title { color: var(--accent); }

    /* Etapas, cartoes, comparacao, numeros */
    .tu-deck .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); }
    .tu-deck .step { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border-radius: var(--radius-sm); background: var(--surface); border: 1.5px solid var(--border); }
    .tu-deck .step.is-focus { border-color: var(--border-strong); background: var(--surface-accent); }
    .tu-deck .step-num {
      flex: none; min-width: 36px; height: 36px; padding: 0 6px; border-radius: 10px; display: grid; place-items: center;
      background: var(--accent); color: var(--on-accent); font-weight: 800; font-variant-numeric: tabular-nums;
    }
    .tu-deck .step-title { margin: 0; font-weight: 800; line-height: 1.35; }
    .tu-deck .step-desc { margin: 4px 0 0; font-size: var(--fs-small); color: var(--ink-muted); }
    .tu-deck .focus-tag { display: inline-block; margin-top: 6px; font-size: var(--fs-meta); font-weight: 800; color: var(--accent); }

    .tu-deck .tile-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); }
    .tu-deck .tile { padding: 14px; border-radius: var(--radius-sm); background: var(--surface); border: 1.5px solid var(--border); min-width: 0; }
    .tu-deck .tile.is-focus { border-color: var(--border-strong); background: var(--surface-accent); }
    .tu-deck .tile-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .tu-deck .tile-title { margin: 0; font-weight: 800; line-height: 1.35; }
    .tu-deck .tile-desc { margin: 4px 0 0; font-size: var(--fs-small); color: var(--ink-muted); }
    .tu-deck .tile-list { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; font-size: var(--fs-small); }
    .tu-deck .tile-list li { display: flex; gap: 8px; align-items: flex-start; }
    .tu-deck .tile-list svg { flex: none; width: 18px; height: 18px; margin-top: 2px; color: var(--accent); }
    .tu-deck .tag {
      display: inline-block; font-size: var(--fs-meta); font-weight: 800; padding: 1px 10px; border-radius: 999px;
      background: var(--accent); color: var(--on-accent);
    }
    .tu-deck .metric-value { display: block; font-size: calc(var(--scale) * 1.75rem); line-height: 1.1; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .tu-deck .metric-label { margin: 6px 0 0; font-weight: 800; }
    .tu-deck .metric-sub { margin: 2px 0 0; font-size: var(--fs-small); color: var(--ink-muted); }
    .tu-deck .metric-trend { margin: 4px 0 0; font-size: var(--fs-meta); font-weight: 800; color: var(--success); }

    /* Batalha */
    .tu-deck .boss-hp { height: 14px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); overflow: hidden; }
    .tu-deck .boss-hp > span { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, var(--danger), var(--warning), var(--success)); transition: width .3s ease; }
    .tu-deck .boss-hp-text { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--danger); font-size: var(--fs-small); }
    .tu-deck .btn-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr)); gap: 10px; }

    /* Botoes */
    .tu-deck .btn, .tu-deck .btn-trailup {
      min-height: 44px; padding: 10px 18px; border-radius: 12px; display: inline-flex; align-items: center;
      justify-content: center; gap: 8px; cursor: pointer; font-weight: 800; border: 1.5px solid transparent;
      text-decoration: none; transition: transform .15s ease, filter .15s ease;
    }
    .tu-deck .btn-primary, .tu-deck .btn-trailup { background: var(--accent); color: var(--on-accent); }
    .tu-deck .btn-primary:hover, .tu-deck .btn-trailup:hover { filter: brightness(1.06); }
    .tu-deck .btn-secondary { background: var(--surface-2); color: var(--ink); border-color: var(--border); }
    .tu-deck .btn-secondary:hover { border-color: var(--border-strong); }
    .tu-deck .btn:disabled, .tu-deck .btn-trailup:disabled { opacity: .45; cursor: not-allowed; filter: none; }
    .tu-deck .btn svg, .tu-deck .btn-trailup svg { width: 20px; height: 20px; flex: none; }

    /* Campos */
    .tu-deck .field-label { font-size: var(--fs-small); font-weight: 800; }
    .tu-deck textarea {
      width: 100%; min-height: 112px; resize: vertical; padding: 12px; border-radius: var(--radius-sm);
      font: inherit; line-height: 1.5; color: var(--ink); background: var(--surface); border: 1.5px solid var(--border-strong);
    }
    .tu-deck textarea::placeholder { color: var(--ink-muted); opacity: 1; }
    .tu-deck .form-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .tu-deck .status-text { margin: 0; font-size: var(--fs-small); color: var(--ink-muted); }
    .tu-deck .status-text.is-ok { color: var(--success); }
    .tu-deck .status-text.is-warn { color: var(--warning); }
    .tu-deck .guide-list { margin: 0; padding-inline-start: 1.4em; display: flex; flex-direction: column; gap: 6px; }
    .tu-deck .guide-list li::marker { color: var(--accent); font-weight: 800; }
    .tu-deck details.sample { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 14px; background: var(--surface); }
    .tu-deck details.sample summary { cursor: pointer; font-weight: 800; color: var(--accent); min-height: 28px; }
    .tu-deck details.sample p { margin: 8px 0 0; }

    /* Blocos de apoio */
    .tu-deck .code-block { border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); overflow: hidden; min-width: 0; }
    .tu-deck .code-block-head { padding: 6px 12px; font-size: var(--fs-meta); font-weight: 700; color: var(--ink-muted); border-bottom: 1px solid var(--border); }
    .tu-deck .code-block pre {
      margin: 0; padding: 12px; overflow-x: auto; font-family: var(--font-mono); font-size: 0.875em;
      line-height: 1.55; color: var(--ink); white-space: pre; tab-size: 2;
    }
    .tu-deck .example-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .tu-deck .note {
      padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-accent);
      border: 1px solid var(--border); border-inline-start: 4px solid var(--accent);
    }
    .tu-deck .note-label { display: block; margin-bottom: 2px; font-size: var(--fs-small); font-weight: 800; color: var(--accent); }
    .tu-deck .note p { margin: 0; }
    .tu-deck .pull-quote { margin: 0; padding-inline-start: 16px; border-inline-start: 3px solid var(--accent); }
    .tu-deck .pull-quote p { margin: 0; font-size: var(--fs-lead); line-height: 1.45; }
    .tu-deck .pull-quote cite { display: block; margin-top: 6px; font-style: normal; font-size: var(--fs-small); color: var(--ink-muted); }
    .tu-deck .figure { margin: 0; padding: 8px; border-radius: var(--radius); background: var(--surface-2); border: 1px solid var(--border); }
    .tu-deck .figure img { display: block; width: 100%; max-height: min(52vh, 380px); object-fit: contain; border-radius: 10px; background: var(--surface); }
    .tu-deck .figure-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .tu-deck .figure-grid img { max-height: 200px; }
    .tu-deck .figure figcaption { margin: 8px 4px 2px; font-size: var(--fs-small); color: var(--ink-muted); }

    /* Capa, reflexao e fechamento */
    .tu-deck .hero {
      position: relative; overflow: hidden; text-align: center; border-radius: 22px; margin: 0 0 24px;
      padding: clamp(24px, 5vw, 48px) clamp(18px, 4vw, 48px); background: var(--surface-accent); border: 1px solid var(--border);
    }
    .tu-deck .hero::before { content: ""; position: absolute; inset: 0; background-image: var(--motif); opacity: .16; pointer-events: none; }
    .tu-deck .hero > * { position: relative; }
    .tu-deck .hero-emblem {
      width: 72px; height: 72px; margin: 0 auto 16px; border-radius: 22px; display: grid; place-items: center;
      background: var(--surface); color: var(--accent); border: 1.5px solid var(--border-strong);
    }
    .tu-deck .hero-emblem svg { width: 38px; height: 38px; }
    .tu-deck .badge {
      display: inline-block; padding: 4px 14px; border-radius: 999px; background: var(--accent); color: var(--on-accent);
      font-size: var(--fs-meta); font-weight: 800; letter-spacing: .04em;
    }
    .tu-deck .hero-title {
      margin: 16px auto 8px; max-width: 24ch; font-family: var(--font-display); font-size: var(--fs-cover);
      line-height: 1.15; font-weight: 700; letter-spacing: 0; text-wrap: balance; overflow-wrap: anywhere;
    }
    .tu-deck .hero-subtitle { margin: 0 auto; max-width: 48ch; font-size: var(--fs-lead); line-height: 1.45; color: var(--ink-muted); }
    .tu-deck .hero-meta { margin: 14px 0 0; font-size: var(--fs-small); color: var(--ink-muted); }
    .tu-deck .hero-meta strong { color: var(--ink); }
    .tu-deck .slide-divider { display: flex; height: 16px; max-width: 420px; margin: 18px auto 0; color: var(--accent); }
    .tu-deck .slide-divider .w-full { width: 100%; }
    .tu-deck .slide-divider .h-full { height: 100%; }
    .tu-deck .slide-divider .flex { display: flex; }
    .tu-deck .slide-divider .items-center { align-items: center; }
    .tu-deck .slide-divider .gap-0\\.5 { gap: 2px; }
    .tu-deck .slide-divider .flex-1 { flex: 1 1 0%; }
    .tu-deck .slide-divider .min-w-0 { min-width: 0; }
    .tu-deck .slide-divider .w-auto { width: auto; }
    .tu-deck .slide-divider .shrink-0 { flex-shrink: 0; }
    .tu-deck .slide-divider .pointer-events-none { pointer-events: none; }
    .tu-deck .centered { max-width: 680px; margin-inline: auto; }
    .tu-deck .reflect-q { padding: 14px 16px; }
    .tu-deck .reflect-q p { margin: 0 0 10px; font-weight: 700; }
    .tu-deck .reflect-lines { height: 56px; background-image: repeating-linear-gradient(to bottom, transparent 0 26px, var(--border) 26px 28px); }
    .tu-deck .takeaway-recap { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; text-align: start; }
    .tu-deck .takeaway-recap li { display: flex; gap: 10px; align-items: flex-start; }
    .tu-deck .takeaway-recap svg { flex: none; width: 20px; height: 20px; margin-top: 3px; color: var(--accent); }

    /* Animacoes (desligadas por prefers-reduced-motion ou pela escolha do aluno) */
    .tu-deck .slide-enter-next { animation: tuSlideNext .32s cubic-bezier(.16, 1, .3, 1) both; }
    .tu-deck .slide-enter-prev { animation: tuSlidePrev .32s cubic-bezier(.16, 1, .3, 1) both; }
    .tu-deck .fade-enter { animation: tuFade .25s ease both; }
    .tu-deck .pop-success { animation: tuPop .35s cubic-bezier(.34, 1.56, .64, 1) both; }
    .tu-deck .shake-error { animation: tuShake .35s ease both; }
    .tu-deck .shake-impact { animation: tuShake .35s ease both; }
    @keyframes tuSlideNext { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
    @keyframes tuSlidePrev { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
    @keyframes tuFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes tuPop { 0% { transform: scale(1); } 50% { transform: scale(1.03); } 100% { transform: scale(1); } }
    @keyframes tuShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
    @media (prefers-reduced-motion: reduce) {
      .tu-deck *, .tu-deck *::before, .tu-deck *::after {
        animation-duration: .01ms !important; animation-iteration-count: 1 !important;
        transition-duration: .01ms !important; scroll-behavior: auto !important;
      }
    }
    html[data-movimento="reduzido"] .tu-deck *, html[data-movimento="reduzido"] .tu-deck *::before, html[data-movimento="reduzido"] .tu-deck *::after {
      animation-duration: .01ms !important; animation-iteration-count: 1 !important;
      transition-duration: .01ms !important; scroll-behavior: auto !important;
    }

    /* Alto contraste do sistema (Windows) */
    @media (forced-colors: active) {
      .tu-deck .option, .tu-deck .check-row, .tu-deck .choice, .tu-deck .card, .tu-deck .widget { border: 1px solid CanvasText; }
      .tu-deck .option.is-correct, .tu-deck .check-row.is-done, .tu-deck .choice.is-selected { border: 3px solid Highlight; }
    }
  `;
}

/** CSS do documento interativo (casca: cabecalho, palco, rodape, dialogos). */
export function getDeckShellCss(): string {
  return `
    html, body { margin: 0; height: 100%; }
    body.tu-deck { overflow: hidden; display: flex; justify-content: center; align-items: stretch; }
    .deck-container {
      position: relative; width: 100%; max-width: 1180px;
      height: 100vh; height: 100dvh;
      display: flex; flex-direction: column; overflow: hidden; background: var(--surface);
    }
    @media (min-width: 900px) and (min-height: 560px) {
      body.tu-deck { padding: 16px; }
      .deck-container {
        height: calc(100vh - 32px); height: calc(100dvh - 32px);
        border: 1px solid var(--border); border-radius: 22px; box-shadow: 0 24px 60px -28px rgb(0 0 0 / .5);
      }
    }
    .deck-container.mode-fullscreen {
      position: fixed; inset: 0; z-index: 50; max-width: none; width: 100vw; width: 100dvw;
      height: 100vh; height: 100dvh; border: 0; border-radius: 0; box-shadow: none;
    }

    .tu-deck .deck-header {
      position: relative; display: flex; align-items: center; gap: 10px; min-height: 64px;
      padding: 10px max(12px, env(safe-area-inset-right)) 10px max(12px, env(safe-area-inset-left));
      background: var(--surface); border-bottom: 1px solid var(--border);
    }
    .tu-deck .deck-header::before { content: ""; position: absolute; inset: 0; background-image: var(--motif); opacity: .08; pointer-events: none; }
    .tu-deck .deck-brand { position: relative; display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
    .tu-deck .profile-emblem {
      flex: none; width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center;
      color: var(--accent); background: var(--surface-accent); border: 1px solid var(--border-strong);
    }
    .tu-deck .profile-emblem svg { width: 22px; height: 22px; }
    .tu-deck .deck-titles { min-width: 0; }
    .tu-deck .deck-kicker { margin: 0; font-size: var(--fs-meta); font-weight: 700; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tu-deck .deck-title { margin: 0; font-size: 1rem; line-height: 1.3; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tu-deck .deck-controls { position: relative; display: flex; align-items: center; gap: 6px; flex: none; }
    .tu-deck .icon-btn {
      min-width: 44px; height: 44px; padding: 0 10px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink);
      font-size: var(--fs-meta); font-weight: 700; cursor: pointer;
    }
    .tu-deck .icon-btn:hover { border-color: var(--border-strong); }
    .tu-deck .icon-btn[aria-pressed="true"] { color: var(--accent); background: var(--surface-accent); border-color: var(--border-strong); }
    .tu-deck .icon-btn svg { width: 20px; height: 20px; flex: none; }
    .tu-deck .btn-label { display: none; }
    @media (min-width: 1100px) { .tu-deck .icon-btn .btn-label { display: inline; } }
    .tu-deck .xp-chip {
      height: 44px; padding: 0 12px; display: inline-flex; align-items: center; gap: 0; border-radius: 999px;
      background: var(--surface-accent); color: var(--accent); border: 1px solid var(--border-strong);
      font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: var(--fs-meta);
    }
    .tu-deck .xp-chip svg { width: 16px; height: 16px; }
    .tu-deck .xp-total { font-weight: 700; color: var(--ink-muted); }
    .tu-deck .xp-chip.is-bump { transform: scale(1.08); transition: transform .15s ease; }

    .tu-deck .deck-progress { height: 4px; background: var(--surface-2); flex: none; }
    .tu-deck .deck-progress > span { display: block; height: 100%; width: 0; background: var(--accent); transition: width .3s ease; }

    #slide-stage {
      position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch; display: flex; flex-direction: column;
      /* O conteiner rolavel comeca no topo: centralizar um filho maior que o
         palco jogava metade do slide acima de scrollTop=0, sem como chegar
         nele. Slide curto continua centralizado pela margem automatica. */
      justify-content: flex-start;
      padding: clamp(18px, 3vw, 40px) max(clamp(16px, 4vw, 56px), env(safe-area-inset-right)) clamp(24px, 3vw, 40px) max(clamp(16px, 4vw, 56px), env(safe-area-inset-left));
      scrollbar-width: thin; scrollbar-color: var(--border) transparent;
    }
    #slide-stage > * {
      flex-shrink: 0;
    }
    #slide-stage:focus { outline: none; }

    .tu-deck .deck-footer {
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none;
      padding: 10px max(12px, env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
      background: var(--surface); border-top: 1px solid var(--border);
    }
    .tu-deck .slide-count { margin: 0; font-size: var(--fs-small); font-weight: 700; color: var(--ink-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .tu-deck .nav-label { display: none; }
    @media (min-width: 480px) { .tu-deck .nav-label { display: inline; } }

    @media (max-width: 560px) {
      .tu-deck .deck-kicker, .tu-deck .xp-total { display: none; }
      .tu-deck #btn-fullscreen { display: none; }
    }
    @media (max-width: 400px) {
      .tu-deck .deck-titles { display: none; }
    }

    .tu-deck .tu-dialog {
      width: min(560px, calc(100vw - 24px)); max-height: min(85vh, 680px); padding: 0;
      border: 1px solid var(--border); border-radius: 20px; background: var(--surface); color: var(--ink);
      box-shadow: 0 30px 80px -30px rgb(0 0 0 / .6);
    }
    .tu-deck .tu-dialog::backdrop { background: rgb(0 0 0 / .55); }
    .tu-deck .dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 14px 6px 18px; }
    .tu-deck .dialog-title { margin: 0; font-size: calc(var(--scale) * 1.25rem); font-weight: 800; }
    .tu-deck .dialog-body { padding: 8px 18px 18px; overflow: auto; max-height: calc(min(85vh, 680px) - 70px); }
    .tu-deck .pref { border: 0; padding: 0; margin: 0 0 18px; min-width: 0; }
    .tu-deck .pref legend { padding: 0; margin: 0 0 8px; font-weight: 800; }
    .tu-deck .seg { display: flex; flex-wrap: wrap; gap: 8px; }
    .tu-deck .seg label { position: relative; }
    .tu-deck .seg input { position: absolute; opacity: 0; width: 1px; height: 1px; }
    .tu-deck .seg span {
      display: inline-flex; align-items: center; min-height: 44px; padding: 0 14px; border-radius: 12px; cursor: pointer;
      border: 1.5px solid var(--border); background: var(--surface-2); font-weight: 700;
    }
    .tu-deck .seg input:checked + span { border-color: var(--accent); background: var(--surface-accent); color: var(--accent); }
    .tu-deck .seg input:focus-visible + span { outline: 3px solid var(--focus); outline-offset: 2px; }
    .tu-deck .pref-hint { margin: 6px 0 0; font-size: var(--fs-small); color: var(--ink-muted); }
    .tu-deck .toc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .tu-deck .toc-item {
      width: 100%; display: flex; gap: 12px; align-items: flex-start; min-height: 48px; padding: 10px 12px; text-align: start;
      border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); color: var(--ink); cursor: pointer; line-height: 1.4;
    }
    .tu-deck .toc-item[aria-current="true"] { border-color: var(--accent); background: var(--surface-accent); }
    .tu-deck .toc-num { flex: none; min-width: 28px; font-weight: 800; color: var(--accent); font-variant-numeric: tabular-nums; }

    .floating-xp-badge {
      position: fixed; z-index: 99; pointer-events: none; transform: translate(-50%, 0);
      padding: 6px 14px; border-radius: 999px; font-weight: 800; font-size: 15px;
      background: var(--surface); color: var(--accent); border: 1.5px solid var(--border-strong);
      box-shadow: 0 10px 30px -10px rgb(0 0 0 / .5); animation: tuFloatXp 1.3s cubic-bezier(.16, 1, .3, 1) forwards;
    }
    @keyframes tuFloatXp {
      0% { opacity: 0; transform: translate(-50%, 0) scale(.8); }
      20% { opacity: 1; transform: translate(-50%, -18px) scale(1.05); }
      75% { opacity: 1; transform: translate(-50%, -48px) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -70px) scale(.95); }
    }
    #magic-particle-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }
  `;
}
