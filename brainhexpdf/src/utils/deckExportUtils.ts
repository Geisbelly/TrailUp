import { DeckData, SlideData } from '../types';
import { generateMedievalSvgDivider } from '../components/ThematicDecorations';
import { getProfileCoverCopy } from './profileCoverCopy';
import { DECK_PREFS_STORAGE_KEY, getDeckScopedCss, getDeckShellCss } from './deckStyles';
import { emblemSvg, getDeckProfileIdentity, guideInitials } from './deckProfileIdentity';

// Deck HTML do aluno (o arquivo que o /api/v1/render-and-store sobe para o
// R2 e que o app abre num WebView e o console num iframe).
//
// Redesenho de 02/11 (ver docs/superpowers/specs/2026-11-02-deck-html-redesenho-design.md):
//  - sem Tailwind em tempo de execucao (deckStyles.ts);
//  - claro/escuro por tokens AAA do perfil (deckTheme.ts), escolha do aluno
//    > ?tema=claro|escuro do app > preferencia do sistema;
//  - ajustes de leitura (tamanho, espacamento, animacoes, sons) guardados no
//    aparelho, iguais para todos os decks;
//  - controles com <button>/aria-pressed, foco no titulo ao trocar de slide,
//    anuncio "Slide N de M" para leitor de tela, sumario navegavel;
//  - todo texto vindo do modelo e' escapado (so' **negrito** e `codigo`
//    viram marcacao).
//
// O que NAO mudou e' contrato com o app: deck/STORAGE_KEY embutidos,
// mensagens trailup:progress (mesmas chaves e mesmas regras de XP) e os
// parametros hideQuiz/hideChecklist/hideNotes.

function escapeHtmlText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value: unknown): string {
  return escapeHtmlText(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Texto do modelo escapado; so' **negrito** e `codigo` viram marcacao. */
function rich(value: unknown): string {
  return escapeHtmlText(value)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

/**
 * Valor para data-*: o dataset devolve o texto original, sem precisar de
 * encodeURIComponent (que lanca URIError com surrogate solitario e derrubava
 * o render inteiro).
 */
function dataAttr(value: unknown): string {
  return escapeHtmlAttribute(value);
}

/** Texto do modelo sem a marcacao leve (para alt, title e leitor de tela). */
function plain(value: unknown): string {
  return String(value ?? '').split('**').join('').split('`').join('');
}

/**
 * Divisor SVG vindo do estudio (endpoint de decoracoes). Unico campo que
 * entra como marcacao: so' passa SVG sem script, handler, link ou HTML
 * embutido; o resto cai no divisor padrao do perfil.
 */
function safeDividerSvg(svg: unknown): string {
  const text = String(svg ?? '').trim();
  if (!/^<svg[\s>]/i.test(text) || !/<\/svg>$/i.test(text)) return '';
  if (/<\s*(script|foreignObject|iframe|object|embed|a|use|image|style)\b|\son\w+\s*=|href\s*=|javascript:/i.test(text)) return '';
  return text;
}

/**
 * JSON seguro dentro de <script>: um "</script>" ou "<!--" vindo do texto
 * fecharia (ou desligaria) a tag. As demais "<" ficam como estao, porque a
 * marcacao dos slides vai embutida aqui.
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/<\//g, '<\\/')
    .replace(/<!--/g, '<\\!--')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const svgIcon = (body: string, className = '') =>
  `<svg${className ? ` class="${className}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

// Icones de interface (lucide). So' estados e acoes com sentido unico:
// voltar/avancar, sumario, leitura, narrar, tela cheia, fechar, check.
const UI_ICONS = {
  prev: svgIcon('<path d="m15 18-6-6 6-6"/>'),
  next: svgIcon('<path d="m9 18 6-6-6-6"/>'),
  toc: svgIcon('<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>'),
  reading: svgIcon('<path d="m15 16 2.536-7.328a1.02 1.02 1 0 1 1.928 0L22 16"/><path d="M15.697 14h5.606"/><path d="m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16"/><path d="M3.304 13h6.392"/>'),
  narrate: svgIcon('<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>'),
  fullscreen: svgIcon('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  close: svgIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  check: svgIcon('<path d="M20 6 9 17l-5-5"/>'),
  restart: svgIcon('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
};

function guideCalloutHtml(name: string, speech: string, phase?: string): string {
  if (!speech) return '';
  return `
    <div class="guide-callout" role="note" aria-label="Fala de ${escapeHtmlAttribute(name)}">
      <span class="guide-avatar" aria-hidden="true">${escapeHtmlText(guideInitials(name))}</span>
      <div class="guide-text">
        <p class="guide-name">${escapeHtmlText(name)}${phase ? ` <span class="guide-phase">· ${escapeHtmlText(phase)}</span>` : ''}</p>
        <p class="guide-speech">“${rich(speech)}”</p>
      </div>
    </div>`;
}

/**
 * Marcacao de um slide (sem a casca do deck). Classes semanticas, estilizadas
 * por getDeckScopedCss.
 */
export function generateThemedSlideHtml(
  s: SlideData,
  deck: DeckData,
  idx: number,
  _activeArchetype?: string
): string {
  const identity = getDeckProfileIdentity(deck.targetProfile);
  const coverCopy = getProfileCoverCopy(deck.targetProfile);
  const titleId = `slide-title-${idx}`;
  const guideName = s.characterGuide?.name || identity.guideName;
  const guideSpeech = s.characterGuide?.speechText || s.thematicStorytelling?.narrativeBeat || '';
  const dividerSvg = safeDividerSvg(s.aiDecorations?.customDividerSvg) || generateMedievalSvgDivider(deck.targetProfile);
  const dividerHtml = dividerSvg ? `<div class="slide-divider" aria-hidden="true">${dividerSvg}</div>` : '';
  const paragraphs = s.contentParagraphs || [];

  // Imagem(ns) de referencia do professor. Legenda nomeia o que a imagem
  // ilustra (subtopic/title), nunca um rodape generico.
  const referenceImageCaption = rich(s.subtopic || s.title || 'Ilustração do tópico');
  const allReferenceImages = s.referenceImageDataUri
    ? [s.referenceImageDataUri, ...(s.additionalReferenceImageDataUris || [])]
    : [];
  const referenceImageAlt = escapeHtmlAttribute(plain(s.subtopic || s.title));
  const referenceImageHtml = allReferenceImages.length > 1
    ? `
      <figure class="figure">
        <div class="figure-grid">
          ${allReferenceImages.map((uri) => `<img src="${escapeHtmlAttribute(uri)}" alt="${referenceImageAlt}" loading="lazy" />`).join('')}
        </div>
        <figcaption>${referenceImageCaption}</figcaption>
      </figure>`
    : allReferenceImages.length === 1
      ? `
      <figure class="figure">
        <img src="${escapeHtmlAttribute(allReferenceImages[0])}" alt="${referenceImageAlt}" />
        <figcaption>${referenceImageCaption}</figcaption>
      </figure>`
      : '';

  const uniqueInteractive = s.interactiveElement;
  const resolvedQuiz = s.quiz?.options?.length
    ? s.quiz
    : uniqueInteractive?.type === 'mini_quiz' && uniqueInteractive.quizOptions?.length
      ? {
          question: s.quiz?.question || uniqueInteractive.prompt,
          options: uniqueInteractive.quizOptions.map((option) => ({
            id: option.id,
            text: option.text,
            isCorrect: option.isCorrect === true,
            explanation: option.explanation || option.feedback || '',
          })),
        }
      : undefined;
  const resolvedChecklist = s.checklist?.length
    ? s.checklist
    : uniqueInteractive?.type === 'mastery_checklist' && uniqueInteractive.checklistItems?.length
      ? uniqueInteractive.checklistItems
      : [];
  const resolvedDecisionChoices = s.decisionChoices?.length
    ? s.decisionChoices
    : uniqueInteractive?.type === 'decision_choice' && uniqueInteractive.decisionChoices?.length
      ? uniqueInteractive.decisionChoices
      : [];

  // --- Widgets ---------------------------------------------------------
  let interactiveWidgetHtml = '';

  // A. Quiz
  if (resolvedQuiz || (s.type === 'interactive_challenge' && resolvedChecklist.length === 0 && resolvedDecisionChoices.length === 0)) {
    const q = resolvedQuiz || {
      question: s.contentParagraphs && s.contentParagraphs[0] ? s.contentParagraphs[0] : 'Desafio prático: escolha a melhor abordagem.',
      options: [
        { id: 'opt-1', text: s.keyTakeaways && s.keyTakeaways[0] ? s.keyTakeaways[0] : 'Aplicar os padrões e as boas práticas recomendadas.', isCorrect: true, explanation: 'Isso! Essa é a abordagem recomendada.' },
        { id: 'opt-2', text: 'Ignorar as boas práticas e seguir sem testar.', isCorrect: false, explanation: 'Essa escolha deixa o resultado frágil e arriscado.' },
        { id: 'opt-3', text: 'Pular a verificação final.', isCorrect: false, explanation: 'Sem verificar, não há como saber se deu certo.' },
      ],
    };
    const questionId = `quiz-q-${idx}`;
    interactiveWidgetHtml = `
      <section class="quiz-widget-container widget" aria-labelledby="${questionId}">
        <div class="widget-head">
          <p class="widget-label">Desafio · Quiz</p>
          <span class="xp-tag">+150 XP</span>
        </div>
        <p class="widget-question" id="${questionId}">${rich(q.question)}</p>
        <div class="quiz-options-group option-list" id="quiz-options-group-${idx}" role="group" aria-labelledby="${questionId}">
          ${(q.options || []).map((opt, oidx) => {
            const optId = opt.id || ('opt-' + idx + '-' + oidx);
            const isCorrectBool = opt.isCorrect === true || (opt as any).isCorrect === 'true';
            const letter = String.fromCharCode(65 + oidx);
            return `
              <button
                type="button"
                class="quiz-option-btn option"
                id="opt-${escapeHtmlAttribute(optId)}"
                aria-pressed="false"
                data-explanation="${dataAttr(opt.explanation || '')}"
                onclick="handleQuizAnswer(this, ${isCorrectBool}, this.dataset.explanation)"
              >
                <span class="quiz-letter-badge option-letter" aria-hidden="true">${letter}</span>
                <span class="option-text"><span class="sr-only">Alternativa ${letter}: </span>${rich(opt.text)}</span>
                <span class="option-state"></span>
              </button>`;
          }).join('')}
        </div>
        <div class="quiz-feedback-box feedback" role="status" aria-live="polite" hidden></div>
      </section>`;
  }
  // B. Checklist
  else if (resolvedChecklist.length > 0) {
    interactiveWidgetHtml = `
      <section class="checklist-widget-container widget" aria-label="Marcos de domínio">
        <div class="widget-head">
          <p class="widget-label">Marcos de domínio</p>
          <p class="widget-hint">Toque para marcar</p>
        </div>
        <ul class="option-list">
          ${resolvedChecklist.map((item, cidx) => `
            <li>
              <button
                type="button"
                id="chk-${escapeHtmlAttribute(item.id)}"
                class="chk-item-row check-row"
                aria-pressed="false"
                data-item-id="${escapeHtmlAttribute(item.id)}"
                onclick="toggleChecklistItem(this, this.dataset.itemId, ${Number(item.xp) || 50})"
              >
                <span class="chk-status-box check-box" aria-hidden="true">${cidx + 1}</span>
                <span class="chk-text check-text">${rich(item.text)}</span>
                <span class="chk-xp-badge xp-tag">+${Number(item.xp) || 50} XP</span>
              </button>
            </li>`).join('')}
        </ul>
      </section>`;
  }
  // C. Decisao
  else if (resolvedDecisionChoices.length > 0) {
    interactiveWidgetHtml = `
      <section class="decision-widget-container widget" aria-label="Escolha seu caminho">
        <div class="widget-head">
          <p class="widget-label">Escolha seu caminho</p>
        </div>
        <div class="choice-grid">
          ${resolvedDecisionChoices.map((c) => `
            <button
              type="button"
              id="decision-${escapeHtmlAttribute(c.id)}"
              class="decision-card-btn choice"
              aria-pressed="false"
              data-choice-id="${escapeHtmlAttribute(c.id)}"
              data-outcome="${dataAttr(c.outcome)}"
              onclick="selectDecisionPath(this, this.dataset.choiceId, ${Number(c.xpReward) || 100}, this.dataset.outcome)"
            >
              <span class="choice-top">
                <span class="choice-title">${rich(c.label)}</span>
                <span class="xp-tag">+${Number(c.xpReward) || 100} XP</span>
              </span>
              <span class="choice-desc">${rich(c.description)}</span>
            </button>`).join('')}
        </div>
        <div class="decision-outcome-box feedback feedback--accent" role="status" aria-live="polite" hidden></div>
      </section>`;
  }
  // D. Batalha
  else if (s.type === 'boss_battle') {
    interactiveWidgetHtml = `
      <section class="widget" aria-label="Batalha">
        <div class="widget-head">
          <p class="widget-label">Batalha do conhecimento</p>
          <span class="boss-hp-text" id="boss-hp-display">1000 / 1000</span>
        </div>
        <div class="boss-hp" role="progressbar" aria-label="Vida do guardião" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="1000" id="boss-hp-meter">
          <span id="boss-hp-bar" style="width: 100%;"></span>
        </div>
        <div id="boss-actions" class="btn-row">
          <button type="button" onclick="attackBoss(350, 'Golpe técnico')" class="btn btn-secondary">Golpe técnico (−350)</button>
          <button type="button" onclick="attackBoss(650, 'Golpe crítico')" class="btn btn-primary">Golpe crítico (−650)</button>
        </div>
        <div id="boss-feedback" class="feedback" role="status" aria-live="polite" hidden></div>
      </section>`;
  }
  // E. Etapas
  else if (s.timelineSteps && s.timelineSteps.length > 0) {
    interactiveWidgetHtml = `
      <section class="widget" aria-label="Etapas">
        <p class="widget-label">Etapas</p>
        <ol class="steps">
          ${s.timelineSteps.map((step) => `
            <li class="step${step.highlight ? ' is-focus' : ''}">
              <span class="step-num" aria-hidden="true">${escapeHtmlText(step.stepNumber)}</span>
              <div>
                <p class="step-title"><span class="sr-only">Etapa ${escapeHtmlText(step.stepNumber)}: </span>${rich(step.title)}</p>
                <p class="step-desc">${rich(step.description)}</p>
                ${step.highlight ? '<span class="focus-tag">Foco desta etapa</span>' : ''}
              </div>
            </li>`).join('')}
        </ol>
      </section>`;
  }
  // F. Cartoes
  else if (s.bentoCards && s.bentoCards.length > 0) {
    interactiveWidgetHtml = `
      <section class="widget" aria-label="Pontos principais">
        <p class="widget-label">Pontos principais</p>
        <div class="tile-grid">
          ${s.bentoCards.map((b) => `
            <div class="tile${b.highlight ? ' is-focus' : ''}">
              ${b.tag || b.stat ? `<div class="tile-top">${b.tag ? `<span class="tag">${rich(b.tag)}</span>` : '<span></span>'}${b.stat ? `<span class="metric-value" style="font-size: 1.125rem">${escapeHtmlText(b.stat)}</span>` : ''}</div>` : ''}
              <p class="tile-title">${rich(b.title)}</p>
              <p class="tile-desc">${rich(b.description)}</p>
            </div>`).join('')}
        </div>
      </section>`;
  }
  // G. Comparacao
  else if (s.comparisonColumns && s.comparisonColumns.length > 0) {
    interactiveWidgetHtml = `
      <section class="widget" aria-label="Comparação">
        <p class="widget-label">Comparação</p>
        <div class="tile-grid">
          ${s.comparisonColumns.map((col) => `
            <div class="tile${col.highlight ? ' is-focus' : ''}">
              <div class="tile-top">
                <p class="tile-title">${rich(col.title)}</p>
                ${col.badge ? `<span class="tag">${rich(col.badge)}</span>` : ''}
              </div>
              ${col.subtitle ? `<p class="tile-desc">${rich(col.subtitle)}</p>` : ''}
              <ul class="tile-list">
                ${(col.items || []).map((item) => `<li>${UI_ICONS.check}<span>${rich(item)}</span></li>`).join('')}
              </ul>
            </div>`).join('')}
        </div>
      </section>`;
  }
  // H. Numeros
  else if (s.metricCards && s.metricCards.length > 0) {
    interactiveWidgetHtml = `
      <section class="widget" aria-label="Em números">
        <p class="widget-label">Em números</p>
        <div class="tile-grid">
          ${s.metricCards.map((m) => `
            <div class="tile">
              <span class="metric-value">${escapeHtmlText(m.value)}</span>
              <p class="metric-label">${rich(m.label)}</p>
              ${m.sublabel ? `<p class="metric-sub">${rich(m.sublabel)}</p>` : ''}
              ${m.trend ? `<p class="metric-trend">${escapeHtmlText(m.trend)}</p>` : ''}
            </div>`).join('')}
        </div>
      </section>`;
  }
  // I. Ideias-chave (quando nao ha outro widget). Vale tambem no fechamento:
  // la' sempre foram marcaveis e davam XP (25 cada), e o app soma esse XP.
  else if (s.keyTakeaways && s.keyTakeaways.length > 0) {
    const takeawaysLabel = s.type === 'epic_conclusion' || s.type === 'reward_certificate' ? 'O que levar deste tópico' : 'Ideias-chave';
    interactiveWidgetHtml = `
      <section class="widget" aria-label="${takeawaysLabel}">
        <div class="widget-head">
          <p class="widget-label">${takeawaysLabel}</p>
          <p class="widget-hint">Marque o que você domina (+25 XP)</p>
        </div>
        <ul class="option-list">
          ${s.keyTakeaways.map((t, tidx) => `
            <li>
              <button
                type="button"
                id="takeaway-${idx}-${tidx}"
                class="takeaway-item-row check-row"
                aria-pressed="false"
                onclick="toggleTakeawayMastery(this, '${idx}-${tidx}', 25)"
              >
                <span class="takeaway-status-box check-box" aria-hidden="true">${tidx + 1}</span>
                <span class="takeaway-text check-text">${rich(t)}</span>
                <span class="takeaway-xp-badge xp-tag">+25 XP</span>
              </button>
            </li>`).join('')}
        </ul>
      </section>`;
  }

  // O schema atual garante um elemento interativo unico por slide. Quiz,
  // checklist e decisao sao adaptados aos widgets acima; os demais tipos
  // ganham o proprio controle em vez de sumir do HTML exportado.
  const uniqueHandledByLegacyWidget =
    (uniqueInteractive?.type === 'mini_quiz' && !!resolvedQuiz) ||
    (uniqueInteractive?.type === 'mastery_checklist' && resolvedChecklist.length > 0) ||
    (uniqueInteractive?.type === 'decision_choice' && resolvedDecisionChoices.length > 0);

  if (uniqueInteractive && !uniqueHandledByLegacyWidget) {
    const guidanceItems = [
      ...(uniqueInteractive.actionInstructions || []),
      ...(uniqueInteractive.guidingQuestions || []),
    ];
    const uniqueTypeLabel: Record<string, string> = {
      reflection_point: 'Reflexão aplicada',
      action_prompt: 'Missão prática',
      code_inspect: 'Inspeção de código',
    };

    interactiveWidgetHtml += `
      <section class="unique-interactive-widget widget" aria-labelledby="unique-title-${idx}">
        <div class="widget-head">
          <p class="widget-label">${uniqueTypeLabel[uniqueInteractive.type] || 'Desafio interativo'}</p>
          <span class="xp-tag">+${Number(uniqueInteractive.xpReward) || 100} XP</span>
        </div>
        <h3 class="widget-title" id="unique-title-${idx}">${rich(uniqueInteractive.title)}</h3>
        ${uniqueInteractive.badge ? `<p class="widget-hint">${rich(uniqueInteractive.badge)}</p>` : ''}
        <p style="margin: 0">${rich(uniqueInteractive.prompt)}</p>
        ${uniqueInteractive.contextHint ? `<p class="widget-hint">${rich(uniqueInteractive.contextHint)}</p>` : ''}
        ${guidanceItems.length > 0 ? `
          <ol class="guide-list">
            ${guidanceItems.map((item) => `<li>${rich(item)}</li>`).join('')}
          </ol>` : ''}
        ${uniqueInteractive.codeSnippet ? `
          <div class="code-block">
            <div class="code-block-head">${escapeHtmlText(uniqueInteractive.codeSnippet.language || 'Código')}</div>
            <pre tabindex="0">${escapeHtmlText(uniqueInteractive.codeSnippet.code)}</pre>
          </div>
          ${uniqueInteractive.codeSnippet.inspectionHint ? `<p class="widget-hint">${rich(uniqueInteractive.codeSnippet.inspectionHint)}</p>` : ''}
        ` : ''}
        ${uniqueInteractive.sampleReflection ? `<details class="sample"><summary>Ver exemplo de resposta</summary><p>${rich(uniqueInteractive.sampleReflection)}</p></details>` : ''}
        ${uniqueInteractive.suggestedAction ? `<div class="note"><span class="note-label">Ação sugerida</span><p>${rich(uniqueInteractive.suggestedAction)}</p></div>` : ''}
        ${uniqueInteractive.expectedDeliverable ? `<p style="margin: 0"><strong>Entrega esperada:</strong> ${rich(uniqueInteractive.expectedDeliverable)}</p>` : ''}
        <label class="field-label" for="unique-note-${idx}">Sua resposta</label>
        <textarea
          id="unique-note-${idx}"
          class="unique-note-input"
          placeholder="${escapeHtmlAttribute(uniqueInteractive.userNotePlaceholder || 'Escreva sua análise, decisão ou plano de ação...')}"
        ></textarea>
        <div class="form-row">
          <button
            type="button"
            onclick="saveUniqueInteraction(${idx}, ${Number(uniqueInteractive.xpReward) || 100})"
            class="btn-trailup"
          >Salvar resposta</button>
          <p id="unique-status-${idx}" class="unique-interaction-status status-text" role="status" aria-live="polite"></p>
        </div>
      </section>`;
  }

  // --- Blocos de apoio -------------------------------------------------
  const writtenExampleHtml = s.writtenExample ? `
    <section class="card" aria-label="Exemplo">
      <div class="example-head">
        <p class="widget-label">${s.writtenExample.visualType === 'code' ? 'Exemplo de código' : s.writtenExample.visualType === 'diagram' ? 'Diagrama' : 'Na prática'}</p>
      </div>
      <h3 class="widget-title" style="margin-top: 6px">${rich(s.writtenExample.title)}</h3>
      <p style="margin: 6px 0 0">${rich(s.writtenExample.explanation)}</p>
      ${s.writtenExample.codeOrDiagram ? `
        <div class="code-block" style="margin-top: 12px"><pre tabindex="0">${escapeHtmlText(s.writtenExample.codeOrDiagram)}</pre></div>
      ` : ''}
    </section>` : '';

  const codeSnippetHtml = s.codeSnippet ? `
    <div class="code-block">
      <div class="code-block-head">${escapeHtmlText(s.codeSnippet.language || 'Código')}</div>
      <pre tabindex="0">${escapeHtmlText(s.codeSnippet.code)}</pre>
    </div>` : '';

  const stickyNoteHtml = s.stickyNote ? `
    <div class="note" role="note">
      <span class="note-label">${rich(s.stickyNote.badge || 'Nota')}</span>
      <p>${rich(s.stickyNote.text)}</p>
    </div>` : '';

  const secretLoreHtml = s.secretLore ? `
    <div class="secret-lore-widget">
      <button
        type="button"
        id="btn-reveal-secret-${idx}"
        class="btn-reveal-secret btn btn-secondary"
        style="width: 100%"
        aria-expanded="false"
        aria-controls="secret-content-${idx}"
        onclick="revealSecretLore(this)"
      >${rich(s.secretLore.hint || 'Revelar um segredo')} <span class="xp-tag">+100 XP</span></button>
      <div class="secret-revealed-content note" id="secret-content-${idx}" hidden>
        <span class="note-label">Segredo revelado</span>
        <p>${rich(s.secretLore.revealedContent)}</p>
      </div>
    </div>` : '';

  const quoteHtml = s.quote ? `
    <blockquote class="pull-quote">
      <p>“${rich(s.quote.text)}”</p>
      ${s.quote.author ? `<cite>— ${escapeHtmlText(s.quote.author)}</cite>` : ''}
    </blockquote>` : '';

  let bodyHtml = '';

  // --- Capa ------------------------------------------------------------
  if (s.type === 'cover') {
    bodyHtml = `
      <article class="slide slide--cover" aria-labelledby="${titleId}">
        <header class="hero">
          <div class="hero-emblem">${emblemSvg(deck.targetProfile)}</div>
          <p class="badge">${escapeHtmlText(coverCopy.missionBadge)}</p>
          <h2 class="hero-title slide-title" id="${titleId}" tabindex="-1">${rich(s.title)}</h2>
          ${s.subtitle ? `<p class="hero-subtitle">${rich(s.subtitle)}</p>` : ''}
          <p class="hero-meta">${escapeHtmlText(identity.styleName)} · com <strong>${escapeHtmlText(guideName)}</strong></p>
          ${dividerHtml}
        </header>
        <div class="centered">
          ${guideCalloutHtml(guideName, guideSpeech, s.characterGuide?.title)}
          <div class="prose prose--lead">
            ${paragraphs.map((p) => `<p>${rich(p)}</p>`).join('')}
          </div>
        </div>
      </article>`;
  }
  // --- Fechamento --------------------------------------------------------
  else if (s.type === 'epic_conclusion' || s.type === 'reward_certificate') {
    bodyHtml = `
      <article class="slide slide--finale" aria-labelledby="${titleId}">
        <header class="hero">
          <div class="hero-emblem">${emblemSvg(deck.targetProfile)}</div>
          <p class="badge">${escapeHtmlText(coverCopy.conclusionBadge)}</p>
          <h2 class="hero-title slide-title" id="${titleId}" tabindex="-1">${rich(s.title || 'Jornada concluída')}</h2>
          ${dividerHtml}
        </header>
        <div class="centered" style="display: flex; flex-direction: column; gap: 18px">
          <div class="prose prose--lead">
            <p>${rich((s.contentParagraphs && s.contentParagraphs[0]) || `Você completou a trilha ${deck.title}.`)}</p>
          </div>
          ${interactiveWidgetHtml}
          ${quoteHtml}
          <div><button type="button" onclick="goToSlide(0)" class="btn btn-secondary">${UI_ICONS.restart}<span>Revisar trilha</span></button></div>
        </div>
      </article>`;
  }
  // --- Ponto de reflexao (deliberadamente enxuto) -------------------------
  else if (s.type === 'reflection_checkpoint') {
    bodyHtml = `
      <article class="slide slide--reflection" aria-labelledby="${titleId}">
        <div class="centered" style="text-align: center">
          <p class="badge">PONTO DE REFLEXÃO</p>
          <h2 class="slide-title" id="${titleId}" tabindex="-1" style="margin-top: 14px">${rich(s.title)}</h2>
        </div>
        <ol class="centered" style="list-style: none; padding: 0; margin-top: 20px; display: flex; flex-direction: column; gap: 12px">
          ${(s.guidingQuestions || []).map((q, qi) => `
            <li class="card reflect-q">
              <p>${qi + 1}. ${rich(q)}</p>
              <div class="reflect-lines" aria-hidden="true"></div>
            </li>`).join('')}
        </ol>
      </article>`;
  }
  // --- Reflexao antes do fechamento (widget extraido do ultimo slide) -------
  else if (s.type === 'pre_conclusion_reflection') {
    bodyHtml = `
      <article class="slide slide--reflection" aria-labelledby="${titleId}">
        <div class="centered" style="display: flex; flex-direction: column; gap: 18px">
          <h2 class="slide-title" id="${titleId}" tabindex="-1" style="text-align: center">${rich(s.title)}</h2>
          ${interactiveWidgetHtml}
        </div>
      </article>`;
  }
  // --- Slides de conteudo ------------------------------------------------
  else {
    const hasAside = !!interactiveWidgetHtml || !!referenceImageHtml;
    // Slide com pouco conteudo (tipico de uma "Parte 2/2" apos a divisao
    // por paragrafo, ver slidePagination.ts) ganha fonte maior, em vez de
    // texto pequeno boiando num palco de altura fixa.
    const isSparse =
      !hasAside &&
      paragraphs.length <= 1 &&
      !s.writtenExample &&
      !s.codeSnippet &&
      !s.stickyNote &&
      !s.secretLore &&
      !s.quote;

    const mainColumn = `
      ${paragraphs.length > 0 ? `<div class="prose${isSparse ? ' prose--lead' : ''}">${paragraphs.map((p) => `<p>${rich(p)}</p>`).join('')}</div>` : ''}
      ${writtenExampleHtml}
      ${codeSnippetHtml}
      ${stickyNoteHtml}
      ${secretLoreHtml}
      ${quoteHtml}`;

    bodyHtml = `
      <article class="slide${isSparse ? ' slide--sparse' : ''}" aria-labelledby="${titleId}">
        <header class="slide-head">
          ${s.subtopic ? `<p class="slide-kicker">${rich(s.subtopic)}</p>` : ''}
          <h2 class="slide-title" id="${titleId}" tabindex="-1">${rich(s.title)}</h2>
          ${s.subtitle ? `<p class="slide-subtitle">${rich(s.subtitle)}</p>` : ''}
          ${s.pedagogicalObjective ? `<p class="slide-objective"><strong>Objetivo:</strong> ${rich(s.pedagogicalObjective)}</p>` : ''}
        </header>
        ${guideCalloutHtml(guideName, guideSpeech, s.thematicStorytelling?.storyArcPhase)}
        <div class="slide-body${hasAside ? ' has-aside' : ''}">
          <div class="slide-main">${mainColumn}</div>
          ${hasAside ? `<div class="slide-aside">${referenceImageHtml}${interactiveWidgetHtml}</div>` : ''}
        </div>
      </article>`;
  }

  return bodyHtml;
}

/**
 * Deck interativo completo (um arquivo, sem dependencia de rede alem da
 * fonte de titulo, que tem substituta local).
 */
export function generateInteractiveHtml(
  deck: DeckData,
  _selectedArchetypeOverride?: string,
  _exportedState?: any
): string {
  const identity = getDeckProfileIdentity(deck.targetProfile);
  const totalSlides = deck.slides?.length || 0;
  // So' no cabecalho, ao lado do XP ja obtido (ver
  // docs/superpowers/specs/2026-08-24-capa-final-redesign-design.md).
  const estimatedTotalXp = (totalSlides || 8) * 150;
  const slideTitles = (deck.slides || []).map((sl) => plain(sl.title));

  return `<!DOCTYPE html>
<html lang="pt-BR" translate="no" class="notranslate">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="google" content="notranslate" />
  <meta name="color-scheme" content="dark light" />
  <title>${escapeHtmlText(plain(deck.title))} · TrailUp (${escapeHtmlText(identity.label)})</title>
  <script>
    // Antes do primeiro desenho: tema e ajustes de leitura, sem piscar.
    (function () {
      var root = document.documentElement;
      var prefs = {};
      try { prefs = JSON.parse(localStorage.getItem('${DECK_PREFS_STORAGE_KEY}') || '{}') || {}; } catch (e) { prefs = {}; }
      var temaApp = '';
      try { temaApp = new URLSearchParams(window.location.search).get('tema') || ''; } catch (e) {}
      function resolveTheme() {
        if (prefs.tema === 'claro') return 'light';
        if (prefs.tema === 'escuro') return 'dark';
        if (temaApp === 'claro') return 'light';
        if (temaApp === 'escuro') return 'dark';
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
      window.__deckPrefs = prefs;
      window.__applyDeckPrefs = function () {
        root.setAttribute('data-theme', resolveTheme());
        root.setAttribute('data-texto', prefs.texto || 'padrao');
        root.setAttribute('data-espaco', prefs.espaco || 'padrao');
        root.setAttribute('data-movimento', prefs.movimento || 'sistema');
      };
      window.__applyDeckPrefs();
      try {
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () { window.__applyDeckPrefs(); });
      } catch (e) {}
    })();
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap" rel="stylesheet">
  <style>
    ${getDeckScopedCss(deck)}
    ${getDeckShellCss()}
  </style>
</head>
<body class="tu-deck">
  <a class="skip-link" href="#slide-stage" onclick="event.preventDefault(); document.getElementById('slide-stage').focus();">Ir para o conteúdo do slide</a>
  <div class="deck-container" id="deck-wrapper">
    <canvas id="magic-particle-canvas" aria-hidden="true"></canvas>

    <header class="deck-header">
      <div class="deck-brand">
        <span class="profile-emblem" title="Perfil ${escapeHtmlAttribute(identity.label)}">${emblemSvg(deck.targetProfile)}</span>
        <div class="deck-titles">
          <p class="deck-kicker">${escapeHtmlText(identity.label)} · ${escapeHtmlText(identity.styleName)}</p>
          <h1 class="deck-title deck-header-title" title="${escapeHtmlAttribute(plain(deck.title))}">${rich(deck.title)}</h1>
        </div>
      </div>

      <div class="deck-controls">
        <span class="xp-chip" id="xp-badge-container" title="XP desta apresentação (salvo automaticamente)">
          <span class="sr-only">XP: </span><span id="xp-counter">0</span><span class="xp-total">/${estimatedTotalXp}</span>&nbsp;XP
        </span>
        <button type="button" class="icon-btn" id="btn-toc" aria-haspopup="dialog" aria-controls="dlg-toc" onclick="openDialog('dlg-toc')" aria-label="Sumário dos slides">
          ${UI_ICONS.toc}<span class="btn-label">Sumário</span>
        </button>
        <button type="button" class="icon-btn" id="btn-reading" aria-haspopup="dialog" aria-controls="dlg-reading" onclick="openDialog('dlg-reading')" aria-label="Ajustes de leitura">
          ${UI_ICONS.reading}<span class="btn-label">Leitura</span>
        </button>
        <button type="button" class="icon-btn" id="btn-narration" aria-pressed="false" onclick="toggleNarration()" aria-label="Narrar este slide">
          ${UI_ICONS.narrate}<span class="btn-label" id="narration-label">Narrar</span>
        </button>
        <button type="button" class="icon-btn" id="btn-fullscreen" aria-pressed="false" onclick="toggleFullscreen()" aria-label="Tela cheia">
          ${UI_ICONS.fullscreen}
        </button>
      </div>
    </header>
    <div class="deck-progress" aria-hidden="true"><span id="deck-progress-bar"></span></div>

    <main id="slide-stage" class="slide-stage justify-start" tabindex="-1" aria-roledescription="apresentação" aria-label="${escapeHtmlAttribute(deck.title)}">
    </main>
    <p id="slide-announcer" class="sr-only" aria-live="polite" aria-atomic="true"></p>

    <footer class="deck-footer">
      <button type="button" class="btn btn-secondary" onclick="prevSlide()" id="btn-prev">
        ${UI_ICONS.prev}<span class="nav-label">Anterior</span><span class="sr-only">Slide anterior</span>
      </button>
      <p class="slide-count" id="slide-indicator">Slide 1 de ${totalSlides}</p>
      <button type="button" class="btn btn-primary" onclick="nextSlide()" id="btn-next">
        <span id="btn-next-label">Próximo</span>${UI_ICONS.next}
      </button>
    </footer>

    <dialog class="tu-dialog" id="dlg-toc" aria-labelledby="dlg-toc-title">
      <div class="dialog-head">
        <h2 class="dialog-title" id="dlg-toc-title">Sumário</h2>
        <button type="button" class="icon-btn" onclick="closeDialog('dlg-toc')" aria-label="Fechar sumário">${UI_ICONS.close}</button>
      </div>
      <div class="dialog-body">
        <ol class="toc-list" id="toc-list"></ol>
      </div>
    </dialog>

    <dialog class="tu-dialog" id="dlg-reading" aria-labelledby="dlg-reading-title">
      <div class="dialog-head">
        <h2 class="dialog-title" id="dlg-reading-title">Ajustes de leitura</h2>
        <button type="button" class="icon-btn" onclick="closeDialog('dlg-reading')" aria-label="Fechar ajustes">${UI_ICONS.close}</button>
      </div>
      <div class="dialog-body">
        <fieldset class="pref">
          <legend>Tema</legend>
          <div class="seg">
            <label><input type="radio" name="pref-tema" value="auto" /><span>Automático</span></label>
            <label><input type="radio" name="pref-tema" value="claro" /><span>Claro</span></label>
            <label><input type="radio" name="pref-tema" value="escuro" /><span>Escuro</span></label>
          </div>
        </fieldset>
        <fieldset class="pref">
          <legend>Tamanho do texto</legend>
          <div class="seg">
            <label><input type="radio" name="pref-texto" value="padrao" /><span>Padrão</span></label>
            <label><input type="radio" name="pref-texto" value="grande" /><span>Grande</span></label>
            <label><input type="radio" name="pref-texto" value="maior" /><span>Maior</span></label>
          </div>
        </fieldset>
        <fieldset class="pref">
          <legend>Espaçamento</legend>
          <div class="seg">
            <label><input type="radio" name="pref-espaco" value="padrao" /><span>Padrão</span></label>
            <label><input type="radio" name="pref-espaco" value="amplo" /><span>Amplo</span></label>
          </div>
          <p class="pref-hint">Mais espaço entre linhas, letras e parágrafos.</p>
        </fieldset>
        <fieldset class="pref">
          <legend>Animações</legend>
          <div class="seg">
            <label><input type="radio" name="pref-movimento" value="sistema" /><span>Do aparelho</span></label>
            <label><input type="radio" name="pref-movimento" value="reduzido" /><span>Reduzir</span></label>
          </div>
        </fieldset>
        <fieldset class="pref">
          <legend>Sons</legend>
          <div class="seg">
            <label><input type="radio" name="pref-sons" value="ligado" /><span>Ligados</span></label>
            <label><input type="radio" name="pref-sons" value="desligado" /><span>Desligados</span></label>
          </div>
        </fieldset>
        <button type="button" id="btn-reset" class="btn btn-secondary" onclick="resetDeckProgress()">${UI_ICONS.restart}<span>Recomeçar respostas e XP</span></button>
      </div>
    </dialog>
  </div>

  <script>
    const deck = ${jsonForScript(deck)};
    const SLIDE_TITLES = ${jsonForScript(slideTitles)};
    let currentIndex = 0;
    let totalXp = 0;
    let audioCtx = null;
    let isNarrating = false;
    let slideDirection = 'next';
    let firstRender = true;

    function prefersReducedMotion() {
      const prefs = window.__deckPrefs || {};
      if (prefs.movimento === 'reduzido') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // Persisted Interaction State Engine
    const STORAGE_KEY = 'trailup_deck_save_' + (deck.id || deck.title.replace(/[^a-zA-Z0-9]/g, '_'));
    let savedData = {
      totalXp: 0,
      quizAnswers: {},   // { [slideIdx]: { optId, isCorrect, explanation } }
      checklist: {},     // { [itemId]: boolean }
      decisions: {},     // { [slideIdx]: { choiceId, xpReward, outcome } }
      secrets: {},       // { [slideIdx]: boolean }
      bossHp: {},        // { [slideIdx]: number }
      takeaways: {},     // { [takeawayKey]: boolean }
      uniqueInteractions: {}, // { [slideIdx]: { note, completed } }
    };

    function loadSavedState() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          savedData = {
            totalXp: parsed.totalXp || 0,
            quizAnswers: parsed.quizAnswers || {},
            checklist: parsed.checklist || {},
            decisions: parsed.decisions || {},
            secrets: parsed.secrets || {},
            bossHp: parsed.bossHp || {},
            takeaways: parsed.takeaways || {},
            uniqueInteractions: parsed.uniqueInteractions || {},
          };
          totalXp = savedData.totalXp;
        }
      } catch (e) {
        console.warn('Could not read from localStorage:', e);
      }
    }

    function persistState() {
      try {
        savedData.totalXp = totalXp;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedData));
      } catch (e) {
        console.warn('Could not save to localStorage:', e);
      }
    }

    // Reporta XP ganho pro app hospedeiro - o deck NUNCA tem acesso a
    // nenhuma credencial/sessao, so emite {itemKey, pontuacaoObtida,
    // pontuacaoMaxima}; quem grava no banco e o app (que ja tem a sessao
    // autenticada do aluno). Funciona nos dois ambientes: nativo injeta
    // window.ReactNativeWebView automaticamente (react-native-webview);
    // web usa postMessage pro parent (o deck roda num iframe).
    function reportProgressToHost(itemKey, pontuacaoObtida, pontuacaoMaxima) {
      try {
        const message = JSON.stringify({
          type: 'trailup:progress',
          itemKey: itemKey,
          pontuacaoObtida: pontuacaoObtida,
          pontuacaoMaxima: pontuacaoMaxima,
        });
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(message);
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, '*');
        }
      } catch (e) {}
    }

    function announce(text) {
      const el = document.getElementById('slide-announcer');
      if (!el) return;
      el.textContent = '';
      setTimeout(function () { el.textContent = text; }, 30);
    }

    function resetDeckProgress() {
      if (confirm('Deseja recomeçar todas as respostas e zerar o XP desta apresentação?')) {
        savedData = {
          totalXp: 0,
          quizAnswers: {},
          checklist: {},
          decisions: {},
          secrets: {},
          bossHp: {},
          takeaways: {},
          uniqueInteractions: {},
        };
        totalXp = 0;
        persistState();
        updateXpDisplay();
        closeDialog('dlg-reading');
        renderSlide();
        announce('Respostas e XP recomeçados.');
      }
    }

    loadSavedState();

    function updateXpDisplay() {
      const xpCounter = document.getElementById('xp-counter');
      if (xpCounter) {
        xpCounter.textContent = totalXp;
        const badge = document.getElementById('xp-badge-container');
        if (badge && !prefersReducedMotion()) {
          badge.classList.add('is-bump');
          setTimeout(() => badge.classList.remove('is-bump'), 220);
        }
      }
      persistState();
    }

    // XP ganho: anuncio para leitor de tela sempre; selo flutuante so' com
    // animacao ligada.
    function spawnFloatingXp(text, x, y) {
      announce(text);
      if (prefersReducedMotion()) return;
      const badge = document.createElement('div');
      badge.className = 'floating-xp-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.style.left = (x || (window.innerWidth / 2)) + 'px';
      badge.style.top = (y || (window.innerHeight / 2)) + 'px';
      badge.textContent = text;
      (document.querySelector('.tu-deck') || document.body).appendChild(badge);
      setTimeout(() => badge.remove(), 1300);
    }

    function triggerScreenShake() {
      if (prefersReducedMotion()) return;
      const wrapper = document.getElementById('deck-wrapper');
      if (wrapper) {
        wrapper.classList.remove('shake-impact');
        void wrapper.offsetWidth;
        wrapper.classList.add('shake-impact');
        setTimeout(() => wrapper.classList.remove('shake-impact'), 400);
      }
    }

    // Confete curto so' nos acertos. O laco de animacao para sozinho quando
    // nao ha particula (antes rodava para sempre, gastando bateria).
    const particleCanvas = document.getElementById('magic-particle-canvas');
    const pctx = particleCanvas ? particleCanvas.getContext('2d') : null;
    let particles = [];
    let particleLoopRunning = false;

    function resizeCanvas() {
      if (!particleCanvas) return;
      const rect = particleCanvas.parentElement.getBoundingClientRect();
      particleCanvas.width = rect.width;
      particleCanvas.height = rect.height;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function confettiColors() {
      const styles = getComputedStyle(document.querySelector('.tu-deck'));
      return ['--accent', '--success', '--warning', '--info'].map((v) => styles.getPropertyValue(v).trim() || '#ffffff');
    }

    function triggerConfettiBurst(originX, originY, count = 30) {
      if (!particleCanvas || !pctx || prefersReducedMotion()) return;
      const rect = particleCanvas.getBoundingClientRect();
      const ox = (originX !== undefined ? originX - rect.left : particleCanvas.width / 2);
      const oy = (originY !== undefined ? originY - rect.top : particleCanvas.height / 2);
      const colors = confettiColors();
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 6;
        particles.push({
          x: ox, y: oy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          size: 3 + Math.random() * 5,
          alpha: 1,
          decay: 0.02 + Math.random() * 0.02,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.2,
        });
      }
      if (!particleLoopRunning) {
        particleLoopRunning = true;
        requestAnimationFrame(animateParticles);
      }
    }

    function animateParticles() {
      if (!pctx || !particleCanvas) { particleLoopRunning = false; return; }
      pctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.vx *= 0.98;
        p.alpha -= p.decay;
        p.rotation += p.rotSpeed;
        if (p.alpha <= 0) { particles.splice(i, 1); continue; }
        pctx.save();
        pctx.globalAlpha = Math.max(0, p.alpha);
        pctx.translate(p.x, p.y);
        pctx.rotate(p.rotation);
        pctx.fillStyle = p.color;
        pctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
        pctx.restore();
      }
      if (particles.length > 0) {
        requestAnimationFrame(animateParticles);
      } else {
        particleLoopRunning = false;
      }
    }

    // Efeitos sonoros (Web Audio). Desligaveis em "Ajustes de leitura".
    function playAudio(type) {
      const prefs = window.__deckPrefs || {};
      if (prefs.sons === 'desligado') return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const tone = (freq, start, dur, kind, vol, endFreq) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = kind;
          osc.frequency.setValueAtTime(freq, now + start);
          if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + start + dur);
          gain.gain.setValueAtTime(vol, now + start);
          gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(now + start); osc.stop(now + start + dur);
        };
        if (type === 'correct' || type === 'checklist') tone(520, 0, 0.25, 'sine', 0.12, 880);
        else if (type === 'wrong') tone(220, 0, 0.25, 'sawtooth', 0.08, 140);
        else if (type === 'slash') tone(400, 0, 0.2, 'triangle', 0.15, 80);
        else if (type === 'secret') [440, 554, 659, 880].forEach((f, i) => tone(f, i * 0.08, 0.25, 'sine', 0.08));
        else if (type === 'victory') [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.1, 0.4, 'triangle', 0.12));
        else tone(440, 0, 0.08, 'sine', 0.04);
      } catch (e) {}
    }

    function setOptionState(btn, state) {
      btn.classList.remove('is-correct', 'is-wrong', 'pop-success', 'shake-error');
      btn.setAttribute('aria-pressed', state ? 'true' : 'false');
      const label = btn.querySelector('.option-state');
      if (label) label.textContent = state === 'correct' ? 'Correta' : state === 'wrong' ? 'Incorreta' : '';
      if (state === 'correct') btn.classList.add('is-correct');
      if (state === 'wrong') btn.classList.add('is-wrong');
    }

    function showQuizFeedback(feedback, isCorrect, explanation) {
      if (!feedback) return;
      feedback.hidden = false;
      feedback.className = 'quiz-feedback-box feedback ' + (isCorrect ? 'feedback--success' : 'feedback--danger');
      feedback.innerHTML = '';
      const title = document.createElement('p');
      title.className = 'feedback-title';
      title.textContent = isCorrect ? 'Resposta correta! +150 XP' : 'Ainda não. Tente outra alternativa.';
      const body = document.createElement('p');
      body.textContent = explanation;
      feedback.appendChild(title);
      if (explanation) feedback.appendChild(body);
    }

    // Interactive Quiz Option Handler with Persistence
    function handleQuizAnswer(target, isCorrect, explanationEncoded) {
      const btnEl = typeof target === 'string' ? document.getElementById('opt-' + target) || document.getElementById(target) : target;
      if (!btnEl) return;

      const container = btnEl.closest('.quiz-widget-container') || btnEl.closest('#slide-stage') || document;
      const feedback = container.querySelector('.quiz-feedback-box');
      let explanation = '';
      explanation = String(explanationEncoded || '');
      const rect = btnEl.getBoundingClientRect();
      const optId = btnEl.id ? btnEl.id.replace('opt-', '') : '';

      // xpAwarded (nao isCorrect) e sticky de proposito: um clique errado
      // depois de um acerto sobrescreve isCorrect pra false, mas nao pode
      // apagar o registro de que o XP ja foi dado - senao acerto->erro->acerto
      // premia de novo a cada volta.
      const wasAlreadyRewarded = !!savedData.quizAnswers[currentIndex]?.xpAwarded;

      container.querySelectorAll('.quiz-option-btn').forEach(btn => setOptionState(btn, null));

      if (isCorrect) {
        playAudio('correct');
        if (!wasAlreadyRewarded) {
          totalXp += 150;
          updateXpDisplay();
          triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 30);
          spawnFloatingXp('+150 XP', rect.left + rect.width / 2, rect.top);
          reportProgressToHost('slide:' + currentIndex + ':quiz', 150, 150);
        }
        setOptionState(btnEl, 'correct');
        if (!prefersReducedMotion()) btnEl.classList.add('pop-success');
        showQuizFeedback(feedback, true, explanation);

        savedData.quizAnswers[currentIndex] = { optId, isCorrect: true, explanation, xpAwarded: true };
        persistState();
      } else {
        playAudio('wrong');
        setOptionState(btnEl, 'wrong');
        if (!prefersReducedMotion()) btnEl.classList.add('shake-error');
        showQuizFeedback(feedback, false, explanation);

        savedData.quizAnswers[currentIndex] = {
          ...(savedData.quizAnswers[currentIndex] || {}),
          optId,
          isCorrect: false,
          explanation,
        };
        persistState();
      }
    }

    // Interactive Boss Battle Arena Handler with Persistence
    let currentBossHp = 1000;
    function paintBoss(stage) {
      const root = stage || document;
      const hpDisplay = root.querySelector('#boss-hp-display');
      if (hpDisplay) hpDisplay.textContent = currentBossHp + ' / 1000';
      const hpBar = root.querySelector('#boss-hp-bar');
      if (hpBar) hpBar.style.width = ((currentBossHp / 1000) * 100) + '%';
      const meter = root.querySelector('#boss-hp-meter');
      if (meter) meter.setAttribute('aria-valuenow', String(currentBossHp));
    }
    function showBossVictory(feedback) {
      if (!feedback) return;
      feedback.hidden = false;
      feedback.className = 'feedback feedback--success';
      feedback.innerHTML = '<p class="feedback-title">Guardião derrotado! +500 XP de vitória</p>';
      const actions = document.getElementById('boss-actions');
      if (actions) actions.hidden = true;
    }
    function attackBoss(damage, attackName) {
      if (currentBossHp <= 0) return;
      playAudio('slash');
      triggerScreenShake();
      currentBossHp = Math.max(0, currentBossHp - damage);
      savedData.bossHp[currentIndex] = currentBossHp;
      paintBoss();

      const feedback = document.getElementById('boss-feedback');
      if (feedback) {
        if (currentBossHp === 0) {
          playAudio('victory');
          totalXp += 500;
          updateXpDisplay();
          reportProgressToHost('slide:' + currentIndex + ':boss', 500, 500);
          triggerConfettiBurst(window.innerWidth / 2, window.innerHeight / 2, 60);
          spawnFloatingXp('Guardião derrotado! +500 XP', window.innerWidth / 2, window.innerHeight / 2);
          showBossVictory(feedback);
        } else {
          feedback.hidden = false;
          feedback.className = 'feedback feedback--accent';
          feedback.innerHTML = '';
          const p = document.createElement('p');
          p.className = 'feedback-title';
          p.textContent = attackName + ' acertou! −' + damage + ' de vida.';
          feedback.appendChild(p);
        }
      }
      persistState();
    }

    function setCheckRow(el, done) {
      el.classList.toggle('is-done', !!done);
      el.setAttribute('aria-pressed', done ? 'true' : 'false');
      const box = el.querySelector('.check-box');
      if (box) {
        if (!box.dataset.num) box.dataset.num = box.textContent.trim();
        box.textContent = done ? '✓' : box.dataset.num;
      }
    }

    // Interactive Checklist Item Toggle with Persistence
    function toggleChecklistItem(target, itemId, xp) {
      const el = typeof target === 'string' ? document.getElementById('chk-' + target) || document.getElementById(target) : target;
      if (!el) return;
      const isCompleted = el.getAttribute('aria-pressed') === 'true';
      const rect = el.getBoundingClientRect();
      const realItemId = itemId || (el.id ? el.id.replace('chk-', '') : '');

      // Chave por slide: o modelo repete ids (c1, c2...) entre slides, e a
      // chave so' pelo id abria o segundo checklist ja marcado.
      const storeKey = currentIndex + ':' + realItemId;

      if (isCompleted) {
        savedData.checklist[storeKey] = false;
        totalXp = Math.max(0, totalXp - (xp || 50));
        setCheckRow(el, false);
      } else {
        savedData.checklist[storeKey] = true;
        totalXp += (xp || 50);
        reportProgressToHost('slide:' + currentIndex + ':checklist:' + realItemId, xp || 50, xp || 50);
        playAudio('checklist');
        triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 18);
        spawnFloatingXp('+' + (xp || 50) + ' XP', rect.left + rect.width / 2, rect.top);
        setCheckRow(el, true);
      }
      updateXpDisplay();
    }

    // Interactive Key Takeaway Mastery Toggle with Persistence
    function toggleTakeawayMastery(target, keyId, xp) {
      const el = typeof target === 'string' ? document.getElementById('takeaway-' + target) || document.getElementById(target) : target;
      if (!el) return;
      const isMastered = el.getAttribute('aria-pressed') === 'true';
      const rect = el.getBoundingClientRect();
      const realKeyId = keyId || (el.id ? el.id.replace('takeaway-', '') : '');

      if (isMastered) {
        savedData.takeaways[realKeyId] = false;
        totalXp = Math.max(0, totalXp - (xp || 75));
        setCheckRow(el, false);
      } else {
        savedData.takeaways[realKeyId] = true;
        totalXp += (xp || 75);
        reportProgressToHost('slide:' + currentIndex + ':takeaway:' + realKeyId, xp || 75, xp || 75);
        playAudio('correct');
        triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 20);
        spawnFloatingXp('+' + (xp || 75) + ' XP', rect.left + rect.width / 2, rect.top);
        setCheckRow(el, true);
      }
      persistState();
      updateXpDisplay();
    }

    // Persist free-form reflection/action/code-inspection responses. XP is
    // awarded only on the first completion, while later saves update the note.
    function saveUniqueInteraction(slideIndex, xpReward) {
      const input = document.getElementById('unique-note-' + slideIndex);
      const status = document.getElementById('unique-status-' + slideIndex);
      if (!input) return;

      const note = String(input.value || '').trim();
      if (!note) {
        if (status) {
          status.textContent = 'Escreva uma resposta antes de salvar.';
          status.className = 'unique-interaction-status status-text is-warn';
        }
        input.focus();
        return;
      }

      const previous = savedData.uniqueInteractions[slideIndex];
      const firstCompletion = !previous?.completed;
      savedData.uniqueInteractions[slideIndex] = { note, completed: true };

      if (firstCompletion) {
        const earnedXp = xpReward || 100;
        totalXp += earnedXp;
        reportProgressToHost('slide:' + slideIndex + ':unique', earnedXp, earnedXp);
        playAudio('correct');
        const rect = input.getBoundingClientRect();
        triggerConfettiBurst(rect.left + rect.width / 2, rect.top, 24);
        spawnFloatingXp('+' + earnedXp + ' XP', rect.left + rect.width / 2, rect.top);
      }

      persistState();
      updateXpDisplay();
      if (status) {
        status.textContent = firstCompletion ? 'Resposta salva e XP conquistado.' : 'Resposta atualizada.';
        status.className = 'unique-interaction-status status-text is-ok';
      }
    }

    function showDecisionOutcome(container, cardEl, outcome) {
      container.querySelectorAll('.decision-card-btn').forEach(btn => {
        btn.classList.remove('is-selected', 'pop-success');
        btn.setAttribute('aria-pressed', 'false');
      });
      cardEl.classList.add('is-selected');
      cardEl.setAttribute('aria-pressed', 'true');
      const outcomeDiv = container.querySelector('.decision-outcome-box');
      if (outcomeDiv) {
        outcomeDiv.hidden = false;
        outcomeDiv.innerHTML = '';
        const title = document.createElement('p');
        title.className = 'feedback-title';
        title.textContent = 'Consequência';
        const body = document.createElement('p');
        body.textContent = outcome;
        outcomeDiv.appendChild(title);
        outcomeDiv.appendChild(body);
      }
    }

    // Interactive Decision Branching with Persistence
    function selectDecisionPath(target, choiceId, xpReward, outcomeEncoded) {
      playAudio('correct');
      // Compara com "alguma decisao ja foi tomada neste slide", nao com o
      // choiceId atual - o XP trava na primeira escolha. Comparar por
      // choiceId permitia XP infinito alternando entre as opcoes (cada troca
      // e uma "escolha nova" contra o valor anterior).
      const wasAlreadyChosen = !!savedData.decisions[currentIndex];
      if (!wasAlreadyChosen) {
        totalXp += (xpReward || 100);
        reportProgressToHost('slide:' + currentIndex + ':decision:' + choiceId, xpReward || 100, xpReward || 100);
        updateXpDisplay();
      }

      let outcome = '';
      outcome = String(outcomeEncoded || '');
      savedData.decisions[currentIndex] = { choiceId, xpReward, outcome };
      persistState();

      const cardEl = typeof target === 'string' ? document.getElementById('decision-' + target) || document.getElementById(target) : target;
      if (cardEl) {
        const rect = cardEl.getBoundingClientRect();
        if (!wasAlreadyChosen) {
          triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 20);
          spawnFloatingXp('+' + (xpReward || 100) + ' XP', rect.left + rect.width / 2, rect.top);
        }
        const container = cardEl.closest('.decision-widget-container') || document;
        showDecisionOutcome(container, cardEl, outcome);
        if (!prefersReducedMotion()) cardEl.classList.add('pop-success');
      }
    }

    function openSecret(btnEl) {
      const content = btnEl ? document.getElementById(btnEl.getAttribute('aria-controls')) : null;
      if (btnEl) {
        btnEl.setAttribute('aria-expanded', 'true');
        btnEl.hidden = true;
      }
      if (content) content.hidden = false;
      return content;
    }

    // Interactive Secret Lore Reveal with Persistence
    function revealSecretLore(target) {
      playAudio('secret');
      const btnEl = typeof target === 'string' ? document.getElementById(target) : target;
      const rect = btnEl ? btnEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
      const wasRevealed = !!savedData.secrets[currentIndex];
      if (!wasRevealed) {
        totalXp += 100;
        updateXpDisplay();
        reportProgressToHost('slide:' + currentIndex + ':secret', 100, 100);
        savedData.secrets[currentIndex] = true;
        persistState();
        triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 24);
        spawnFloatingXp('+100 XP', rect.left + rect.width / 2, rect.top);
      }
      const content = openSecret(btnEl);
      if (content) {
        content.setAttribute('tabindex', '-1');
        content.focus();
      }
    }

    // Narracao do slide (Web Speech; no app vira expo-speech pela ponte).
    function setNarrating(on) {
      isNarrating = on;
      const btn = document.getElementById('btn-narration');
      if (btn) {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.setAttribute('aria-label', on ? 'Parar narração' : 'Narrar este slide');
      }
      const label = document.getElementById('narration-label');
      if (label) label.textContent = on ? 'Parar' : 'Narrar';
    }
    function toggleNarration() {
      if (!('speechSynthesis' in window)) {
        announce('Este aparelho não tem leitura em voz alta.');
        return;
      }
      if (isNarrating) {
        window.speechSynthesis.cancel();
        setNarrating(false);
        return;
      }

      const s = deck.slides[currentIndex];
      let textToRead = s.title + '. ';
      if (s.subtitle) textToRead += s.subtitle + '. ';
      if (s.characterGuide && s.characterGuide.speechText) textToRead += s.characterGuide.name + ' diz: ' + s.characterGuide.speechText + '. ';
      if (s.narrativeText) textToRead += s.narrativeText + '. ';
      if (s.contentParagraphs) textToRead += s.contentParagraphs.join(' ');
      textToRead = textToRead.split('**').join('').split('\`').join('');

      const utterance = new SpeechSynthesisUtterance(textToRead);
      utterance.lang = 'pt-BR';
      utterance.rate = 1;
      utterance.onend = () => setNarrating(false);
      utterance.onerror = () => setNarrating(false);

      window.speechSynthesis.speak(utterance);
      setNarrating(true);
    }

    function toggleFullscreen() {
      const wrapper = document.getElementById('deck-wrapper');
      const on = wrapper.classList.toggle('mode-fullscreen');
      const btn = document.getElementById('btn-fullscreen');
      if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      setTimeout(resizeCanvas, 100);
    }

    // Dialogos (sumario e leitura). <dialog> nativo prende o foco e fecha com Esc.
    let dialogReturnFocus = null;
    function openDialog(id) {
      const dlg = document.getElementById(id);
      if (!dlg) return;
      dialogReturnFocus = document.activeElement;
      if (id === 'dlg-toc') renderToc();
      if (id === 'dlg-reading') syncPrefControls();
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      const focusTarget = id === 'dlg-toc' ? dlg.querySelector('[aria-current="true"]') : dlg.querySelector('input:checked');
      if (focusTarget) focusTarget.focus();
    }
    function closeDialog(id, keepFocus) {
      const dlg = document.getElementById(id);
      if (!dlg || !dlg.hasAttribute('open')) return;
      // Quem fecha para levar o foco a outro lugar (o sumario leva ao titulo
      // do slide) nao quer o foco de volta no botao que abriu o dialogo: o
      // evento close chega depois e o roubaria.
      if (keepFocus) dialogReturnFocus = null;
      if (typeof dlg.close === 'function') dlg.close();
      else {
        // Navegador sem <dialog> (iOS < 15.4): fecha e avisa como o nativo.
        dlg.removeAttribute('open');
        dlg.dispatchEvent(new Event('close'));
      }
    }
    document.querySelectorAll('.tu-dialog').forEach((dlg) => {
      dlg.addEventListener('close', () => {
        if (dialogReturnFocus && dialogReturnFocus.focus) dialogReturnFocus.focus();
      });
      dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDialog(dlg.id); });
    });

    function renderToc() {
      const list = document.getElementById('toc-list');
      if (!list) return;
      list.innerHTML = '';
      SLIDE_TITLES.forEach((title, i) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toc-item';
        if (i === currentIndex) btn.setAttribute('aria-current', 'true');
        const num = document.createElement('span');
        num.className = 'toc-num';
        num.textContent = String(i + 1);
        const text = document.createElement('span');
        text.textContent = title;
        btn.appendChild(num);
        btn.appendChild(text);
        btn.addEventListener('click', () => { closeDialog('dlg-toc', true); goToSlide(i, true); });
        li.appendChild(btn);
        list.appendChild(li);
      });
    }

    // Ajustes de leitura: guardados no aparelho, valem para todos os decks.
    const PREF_DEFAULTS = { tema: 'auto', texto: 'padrao', espaco: 'padrao', movimento: 'sistema', sons: 'ligado' };
    function syncPrefControls() {
      const prefs = window.__deckPrefs || {};
      Object.keys(PREF_DEFAULTS).forEach((key) => {
        const value = prefs[key] || PREF_DEFAULTS[key];
        document.querySelectorAll('input[name="pref-' + key + '"]').forEach((input) => {
          input.checked = input.value === value;
        });
      });
    }
    document.querySelectorAll('.pref input[type="radio"]').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.name.replace('pref-', '');
        const prefs = window.__deckPrefs || (window.__deckPrefs = {});
        prefs[key] = input.value;
        try { localStorage.setItem('${DECK_PREFS_STORAGE_KEY}', JSON.stringify(prefs)); } catch (e) {}
        if (window.__applyDeckPrefs) window.__applyDeckPrefs();
        resizeCanvas();
      });
    });

    window.__SLIDES__ = [
      ${deck.slides.map((sl, i) => jsonForScript(generateThemedSlideHtml(sl, deck, i))).join(',\n      ')}
    ];

    // Restore interactive visual state on the rendered slide
    function restoreSlideInteractions() {
      const stage = document.getElementById('slide-stage');
      if (!stage) return;

      // 1. Quiz
      const quizAnswer = savedData.quizAnswers[currentIndex];
      if (quizAnswer) {
        const btn = Array.from(stage.querySelectorAll('.quiz-option-btn')).find((b) => b.id === 'opt-' + quizAnswer.optId);
        if (btn) setOptionState(btn, quizAnswer.isCorrect ? 'correct' : 'wrong');
        const feedback = stage.querySelector('.quiz-feedback-box');
        if (feedback && quizAnswer.explanation) showQuizFeedback(feedback, !!quizAnswer.isCorrect, quizAnswer.explanation);
      }

      // 2. Checklist
      stage.querySelectorAll('.chk-item-row').forEach(el => {
        const id = el.dataset.itemId || el.id.replace('chk-', '');
        const bySlide = savedData.checklist[currentIndex + ':' + id];
        // Estado salvo antes da chave por slide: so' o id.
        if (bySlide === true || (bySlide === undefined && savedData.checklist[id])) setCheckRow(el, true);
      });

      // 3. Ideias-chave
      stage.querySelectorAll('.takeaway-item-row').forEach(el => {
        const id = el.id.replace('takeaway-', '');
        if (savedData.takeaways && savedData.takeaways[id]) setCheckRow(el, true);
      });

      // 4. Decisao
      const decision = savedData.decisions[currentIndex];
      if (decision && decision.choiceId) {
        const cardEl = Array.from(stage.querySelectorAll('.decision-card-btn')).find((b) => b.dataset.choiceId === String(decision.choiceId));
        const container = cardEl ? cardEl.closest('.decision-widget-container') : null;
        if (cardEl && container) showDecisionOutcome(container, cardEl, decision.outcome || '');
      }

      // 5. Segredo
      if (savedData.secrets[currentIndex]) {
        stage.querySelectorAll('.btn-reveal-secret').forEach((btn) => openSecret(btn));
      }

      // 6. Batalha
      currentBossHp = savedData.bossHp[currentIndex] !== undefined ? savedData.bossHp[currentIndex] : 1000;
      paintBoss(stage);
      if (currentBossHp === 0) showBossVictory(stage.querySelector('#boss-feedback'));

      // 7. Resposta livre
      const uniqueInteraction = savedData.uniqueInteractions?.[currentIndex];
      if (uniqueInteraction) {
        const input = stage.querySelector('#unique-note-' + currentIndex);
        if (input) input.value = uniqueInteraction.note || '';
        const status = stage.querySelector('#unique-status-' + currentIndex);
        if (status && uniqueInteraction.completed) {
          status.textContent = 'Resposta salva.';
          status.className = 'unique-interaction-status status-text is-ok';
        }
      }
    }

    function updateSlideIndicator() {
      const indicator = document.getElementById('slide-indicator');
      if (indicator) indicator.textContent = 'Slide ' + (currentIndex + 1) + ' de ' + deck.slides.length;
      const bar = document.getElementById('deck-progress-bar');
      if (bar) bar.style.width = (((currentIndex + 1) / Math.max(1, deck.slides.length)) * 100) + '%';
    }

    function renderSlide(moveFocus) {
      const stage = document.getElementById('slide-stage');
      if (stage) {
        stage.classList.remove('slide-enter-next', 'slide-enter-prev', 'fade-enter');
        if (!firstRender && !prefersReducedMotion()) {
          void stage.offsetWidth;
          stage.classList.add(slideDirection === 'prev' ? 'slide-enter-prev' : 'slide-enter-next');
        }
      }

      if (isNarrating) {
        window.speechSynthesis.cancel();
        setNarrating(false);
      }

      updateSlideIndicator();

      const xpCounter = document.getElementById('xp-counter');
      if (xpCounter) xpCounter.textContent = totalXp;

      const btnPrev = document.getElementById('btn-prev');
      if (btnPrev) btnPrev.disabled = currentIndex === 0;

      const isLast = currentIndex === deck.slides.length - 1;
      const btnNext = document.getElementById('btn-next');
      if (btnNext) btnNext.disabled = isLast;
      const btnNextLabel = document.getElementById('btn-next-label');
      if (btnNextLabel) btnNextLabel.textContent = isLast ? 'Fim' : 'Próximo';

      if (stage && window.__SLIDES__) {
        stage.innerHTML = window.__SLIDES__[currentIndex] || '';
        stage.scrollTop = 0;
        applyContentVisibilityFromQuery(stage);
        restoreSlideInteractions();
      }

      if (!firstRender) {
        announce('Slide ' + (currentIndex + 1) + ' de ' + deck.slides.length + ': ' + (SLIDE_TITLES[currentIndex] || ''));
        if (moveFocus) {
          const heading = stage ? stage.querySelector('.slide-title') : null;
          if (heading) heading.focus({ preventScroll: true });
        }
      }
      firstRender = false;
    }

    function nextSlide(moveFocus) {
      if (currentIndex < deck.slides.length - 1) {
        slideDirection = 'next';
        currentIndex++;
        playAudio('click');
        renderSlide(moveFocus);
      }
    }

    function prevSlide(moveFocus) {
      if (currentIndex > 0) {
        slideDirection = 'prev';
        currentIndex--;
        playAudio('prev');
        renderSlide(moveFocus);
      }
    }

    function goToSlide(idx, moveFocus) {
      if (idx >= 0 && idx < deck.slides.length) {
        slideDirection = idx < currentIndex ? 'prev' : 'next';
        currentIndex = idx;
        playAudio('click');
        renderSlide(moveFocus);
      }
    }

    // Teclado: setas, PageUp/PageDown, Home/End. Nunca dentro de campo de
    // texto (antes, digitar espaco ou mover o cursor numa resposta trocava
    // de slide) nem com um dialogo aberto.
    window.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      const openDlg = document.querySelector('.tu-dialog[open]');
      if (openDlg) {
        // O <dialog> nativo ja fecha com Esc; isto cobre o navegador sem ele
        // (o foco costuma estar num radio do painel, por isso vem antes do
        // filtro de campo de texto).
        if (e.key === 'Escape' && typeof openDlg.close !== 'function') closeDialog(openDlg.id);
        return;
      }
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      // Bloco de codigo rolavel: as setas rolam o codigo, nao trocam de slide.
      if (t && t.closest && t.closest('pre')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); nextSlide(true); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prevSlide(true); }
      else if (e.key === 'Home') { e.preventDefault(); goToSlide(0, true); }
      else if (e.key === 'End') { e.preventDefault(); goToSlide(deck.slides.length - 1, true); }
      else if ((e.key === 'f' || e.key === 'F') && tag !== 'button') toggleFullscreen();
      else if ((e.key === 'm' || e.key === 'M') && tag !== 'button') toggleNarration();
    });

    // Touch Swipe Support for Mobile Decks
    let touchStartX = 0;
    let touchStartY = 0;
    let touchSwipeBlocked = false;
    const deckWrapper = document.getElementById('deck-wrapper');
    if (deckWrapper) {
      deckWrapper.addEventListener('touchstart', (e) => {
        const target = e.target instanceof Element ? e.target : null;
        touchSwipeBlocked = !!target?.closest('.code-block, pre, code, button, input, textarea, select, a, dialog, [role="button"]');
        if (e.touches && e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
        }
      }, { passive: true });

      deckWrapper.addEventListener('touchend', (e) => {
        if (touchSwipeBlocked) {
          touchSwipeBlocked = false;
          return;
        }
        if (e.changedTouches && e.changedTouches.length === 1) {
          const deltaX = e.changedTouches[0].clientX - touchStartX;
          const deltaY = e.changedTouches[0].clientY - touchStartY;
          // So' quando o gesto horizontal domina e passa de 50px
          if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
            if (deltaX < 0) {
              nextSlide();
            } else {
              prevSlide();
            }
          }
        }
      }, { passive: true });
    }

    // Esconde widget(s) que pedem producao ativa do aluno (quiz, checklist,
    // anotacao/reflexao) quando o aluno prefere um modoOperacao diferente de
    // "Misto" - decidido no TrailUp/mobile (dono do enum modoOperacao) e
    // passado so' como flags na URL, ja que o deck e' compartilhado entre os
    // alunos do mesmo perfil. Roda a CADA slide renderizado: os slides vivem
    // em window.__SLIDES__ e so' entram no DOM na navegacao (antes isto rodava
    // uma vez, com o palco vazio, e nao escondia nada).
    function applyContentVisibilityFromQuery(stage) {
      const root = stage || document;
      const params = new URLSearchParams(window.location.search);
      const targets = [
        { param: 'hideQuiz', selector: '.quiz-widget-container' },
        { param: 'hideChecklist', selector: '.checklist-widget-container' },
        { param: 'hideNotes', selector: '.unique-interactive-widget' },
      ];

      targets.forEach(({ param, selector }) => {
        if (params.get(param) !== '1') return;

        root.querySelectorAll(selector).forEach((widgetEl) => {
          const aside = widgetEl.closest('.slide-aside');
          widgetEl.remove();
          // O widget era o unico conteudo da coluna lateral: tira a coluna
          // vazia e devolve a largura ao texto.
          if (aside && aside.children.length === 0) {
            const body = aside.closest('.slide-body');
            aside.remove();
            if (body) body.classList.remove('has-aside');
          }
        });
      });
    }

    renderSlide();
  </script>
</body>
</html>`;
}

/**
 * Pagina de um slide para o export de PDF do estudio (html2canvas). Leva a
 * propria folha de estilo, escopada em .tu-deck, e sempre o tema escuro.
 */
export function generatePdfPageHtml(
  slide: SlideData,
  deck: DeckData,
  idx: number,
  orientation: 'landscape' | 'portrait' = 'landscape'
): string {
  const slideContentHtml = generateThemedSlideHtml(slide, deck, idx);
  const minHeight = orientation === 'landscape' ? '630px' : '1120px';
  const width = orientation === 'landscape' ? '1120px' : '794px';
  const identity = getDeckProfileIdentity(deck.targetProfile);

  return `
    <div class="tu-deck" data-theme="dark" style="width: ${width}; min-height: ${minHeight}; position: relative; overflow: hidden; page-break-after: always; display: flex; flex-direction: column;">
      <style>${getDeckScopedCss(deck)}</style>
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 28px; background: var(--surface); border-bottom: 1px solid var(--border);">
        <span style="display: inline-flex; align-items: center; gap: 10px; font-weight: 800; font-size: 15px;">
          <span style="color: var(--accent); width: 22px; height: 22px; display: inline-flex;">${emblemSvg(deck.targetProfile)}</span>
          ${escapeHtmlText(deck.title)}
        </span>
        <span style="color: var(--ink-muted); font-size: 14px; font-weight: 700;">${escapeHtmlText(identity.label)} · Slide ${idx + 1} de ${deck.slides.length}</span>
      </div>
      <div style="flex: 1; padding: 28px 40px; display: flex; flex-direction: column; justify-content: center;">
        ${slideContentHtml}
      </div>
    </div>
  `;
}
