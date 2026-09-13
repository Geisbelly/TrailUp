import { DeckData, SlideData, ThemeConfig } from '../types';
import {
  generateThematicSvgIcon,
  generateThematicSvgBorder,
  generateMedievalSvgDivider,
} from '../components/ThematicDecorations';
import {
  getBrainHexBorderClassName,
  getBrainHexBorderCss,
} from './brainHexBorderStyles';
import { getProfileCoverCopy } from './profileCoverCopy';

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

/**
 * Generate atmospheric SVG Vector Backdrop Scene for any archetype / BrainHex profile
 */
export function generateBackgroundSceneSvgHtml(
  archetype: string = 'medieval-rpg',
  profile: string = 'Achiever',
  theme: ThemeConfig
): string {
  const arch = String(archetype || '').toLowerCase();
  const prof = String(profile || '').toLowerCase();

  if (
    arch === 'medieval-rpg' ||
    prof.includes('achiever') ||
    prof.includes('mastermind') ||
    prof.includes('conqueror') ||
    prof.includes('seeker') ||
    prof.includes('survivor') ||
    prof.includes('daredevil') ||
    prof.includes('socializer')
  ) {
    return `
      <div class="absolute inset-0 bg-gradient-to-b from-[#160B24] via-[#0E0617] to-[#06020A] opacity-95"></div>
      <div class="absolute -top-10 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20" style="background-color: var(--primary);"></div>
      <div class="absolute bottom-0 right-1/4 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-15" style="background-color: var(--accent);"></div>
      <svg viewBox="0 0 1000 200" class="absolute top-0 left-0 right-0 w-full h-20 text-white/5 pointer-events-none" preserveAspectRatio="none">
        <path d="M0 0 L100 60 L200 0 L300 60 L400 0 L500 60 L600 0 L700 60 L800 0 L900 60 L1000 0 L1000 0 L0 0 Z" fill="currentColor"/>
      </svg>
      <div class="absolute bottom-2 left-6 font-mono text-[9px] text-white/20 tracking-wider">TRAILUP • MEDIEVAL BRAINHEX HERITAGE</div>
    `;
  } else if (arch === 'indian-heritage') {
    return `
      <div class="absolute inset-0 bg-gradient-to-b from-[#EA580C] via-[#C2410C] to-[#431407] opacity-95"></div>
      <svg viewBox="0 0 1000 160" class="absolute top-0 left-0 right-0 w-full h-24 text-amber-300/20" preserveAspectRatio="none">
        <path d="M0 60 Q120 10 250 50 Q380 90 520 40 Q680 10 820 60 Q940 90 1000 50 L1000 0 L0 0 Z" fill="currentColor" />
      </svg>
      <div class="absolute bottom-0 left-0 right-0 h-36 opacity-85">
        <svg viewBox="0 0 1200 240" class="w-full h-full" preserveAspectRatio="none">
          <path d="M0 240 L0 180 L40 180 L40 130 Q50 90 60 130 L60 180 L140 180 Q190 120 240 180 L320 180 L320 110 Q340 70 360 110 L360 180 L480 180 Q560 60 640 180 L760 180 L760 110 Q780 70 800 110 L800 180 L880 180 Q930 120 980 180 L1060 180 L1060 130 Q1070 90 1080 130 L1080 180 L1200 180 L1200 240 Z" fill="#7C2D12" />
        </svg>
      </div>
    `;
  } else if (arch === 'islamic-ramadan') {
    return `
      <div class="absolute inset-0 bg-gradient-to-b from-[#042F2E] via-[#0F766E] to-[#021817] opacity-95"></div>
      <div class="absolute top-2 right-6 w-40 h-40 opacity-90">
        <svg viewBox="0 0 200 200" class="w-full h-full">
          <path d="M100 20 C144 20 180 56 180 100 C180 144 144 180 100 180 C130 160 145 130 145 100 C145 70 130 40 100 20 Z" fill="#F59E0B" />
        </svg>
      </div>
    `;
  } else if (arch === 'nature-eco') {
    return `
      <div class="absolute inset-0 bg-gradient-to-b from-[#2E1065] via-[#1E1B4B] to-[#0F172A] opacity-95"></div>
      <div class="absolute bottom-0 left-0 right-0 h-20 opacity-40">
        <svg viewBox="0 0 600 100" class="w-full h-full" preserveAspectRatio="none">
          <path d="M0 60 Q150 20 300 50 T600 40 L600 100 L0 100 Z" fill="#10B981" />
        </svg>
      </div>
    `;
  } else if (arch === 'cyber-tech') {
    return `
      <div class="absolute inset-0 bg-gradient-to-b from-[#022C22] via-[#041E19] to-[#01100D] opacity-95"></div>
      <div class="absolute bottom-3 left-6 font-mono text-[9px] text-cyan-400/60">SYS // 0x48A2 • NEURAL NETWORK v1.3</div>
    `;
  } else {
    return `
      <div class="absolute inset-0 bg-gradient-to-b from-[#180B2E] via-[#0F071D] to-[#080310] opacity-95"></div>
      <div class="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-purple-600/10 blur-3xl pointer-events-none"></div>
    `;
  }
}

/**
 * Generate pure themed HTML markup for a single slide with all vector assets, full narrative immersion and zero overlap
 */
export function generateThemedSlideHtml(
  s: SlideData,
  deck: DeckData,
  idx: number,
  activeArchetype: string = 'medieval-rpg'
): string {
  const theme = deck.themeConfig;

  // Dynamic BrainHex profile CSS border
  const profileBorderClass = getBrainHexBorderClassName(deck.targetProfile);
  let frameClass = `frame-medieval ${profileBorderClass} p-3 sm:p-4 md:p-5 w-full max-w-full overflow-hidden break-words shadow-2xl relative`;
  if (activeArchetype === 'indian-heritage') frameClass = `frame-indian ${profileBorderClass} p-3 sm:p-4 md:p-5 w-full max-w-full overflow-hidden break-words shadow-2xl relative`;
  else if (activeArchetype === 'islamic-ramadan') frameClass = `frame-islamic ${profileBorderClass} p-3 sm:p-4 md:p-5 w-full max-w-full overflow-hidden break-words shadow-2xl relative`;
  else if (activeArchetype === 'nature-eco') frameClass = `frame-eco ${profileBorderClass} p-3 sm:p-4 md:p-5 w-full max-w-full overflow-hidden break-words shadow-2xl relative`;
  else if (activeArchetype === 'scrapbook-stickers') frameClass = `frame-scrapbook ${profileBorderClass} p-3 sm:p-4 md:p-5 w-full max-w-full overflow-hidden break-words shadow-2xl relative`;
  else if (activeArchetype === 'cyber-tech') frameClass = `frame-cyber ${profileBorderClass} p-3 sm:p-4 md:p-5 w-full max-w-full overflow-hidden break-words shadow-2xl relative`;
  else if (activeArchetype === 'royal-luxury') frameClass = `frame-royal ${profileBorderClass} p-3 sm:p-4 md:p-5 w-full max-w-full overflow-hidden break-words shadow-2xl relative`;

  // SVG Decorations & Prompt Badge
  const dec = s.aiDecorations || {};
  const iconSvg = dec.customIconSvg || generateThematicSvgIcon(s.title, deck.targetProfile);
  const dividerSvg = dec.customDividerSvg || generateMedievalSvgDivider(deck.targetProfile);
  const coverCopy = getProfileCoverCopy(deck.targetProfile);
  const promptDescription = dec.medievalPromptDescription || dec.motifDescription || '';
  const classArchetype = dec.medievalClassArchetype || deck.targetProfile;

  // max-h subiu de 40/56 (160px/224px) pra 56/80 (224px/320px) - imagem
  // pequena demais dentro de um card 9:16 inteiro era queixa recorrente de
  // professor. Legenda deixou de ser um rodapé genérico ("Fonte: material
  // de referência", que não explica NADA sobre a imagem em si) e passa a
  // nomear o que a imagem ilustra (subtopic/title do slide).
  const referenceImageCaption = escapeHtmlText(s.subtopic || s.title || 'Ilustração do tópico');
  // Mais de uma imagem do professor pode cair no mesmo slide quando o deck
  // tem mais anexos que slides elegiveis (ver resolveSlideIllustrations,
  // additionalReferenceImageDataUris) - grid 2 colunas em vez de perder as
  // que sobram ou esticar so a primeira.
  const allReferenceImages = s.referenceImageDataUri
    ? [s.referenceImageDataUri, ...(s.additionalReferenceImageDataUris || [])]
    : [];
  const referenceImageAlt = escapeHtmlAttribute(s.subtopic || s.title);
  const referenceImageHtml = allReferenceImages.length > 1
    ? `
      <div class="rounded-lg border border-stone-800 bg-stone-950/70 p-1.5 mb-2">
        <div class="grid grid-cols-2 gap-1.5">
          ${allReferenceImages.map(uri => `<img src="${uri}" alt="${referenceImageAlt}" class="w-full max-h-28 sm:max-h-40 object-contain rounded" />`).join('')}
        </div>
        <p class="text-[10px] text-stone-300 mt-1 px-0.5 leading-snug">${referenceImageCaption}</p>
      </div>
    `
    : allReferenceImages.length === 1
      ? `
      <div class="rounded-lg border border-stone-800 bg-stone-950/70 p-1.5 mb-2">
        <img src="${allReferenceImages[0]}" alt="${referenceImageAlt}" class="w-full max-h-56 sm:max-h-80 object-contain rounded" />
        <p class="text-[10px] text-stone-300 mt-1 px-0.5 leading-snug">${referenceImageCaption}</p>
      </div>
    `
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

  // --- 1. Compact Header Bar ---
  const headerHtml = `
    <div class="border-b border-white/10 pb-2 flex items-start justify-between gap-2.5">
      <div class="flex items-start gap-2.5 min-w-0 flex-1">
        ${iconSvg ? `<div class="w-7 h-7 sm:w-8 sm:h-8 shrink-0 mt-0.5 drop-shadow-[0_0_8px_var(--accent)]" style="color: var(--accent);">${iconSvg}</div>` : ''}
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${s.subtopic ? `<span class="text-[9px] sm:text-[10px] font-bold font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-900 border border-white/10 truncate max-w-[240px]" style="color: var(--accent);">Módulo: ${s.subtopic}</span>` : ''}
            ${s.pedagogicalObjective ? `
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-[9px] font-mono max-w-[280px] min-w-0" title="${escapeHtmlAttribute(s.pedagogicalObjective)}">
                <span class="font-bold shrink-0">OBJ:</span>
                <span class="truncate min-w-0">${s.pedagogicalObjective}</span>
              </span>
            ` : ''}
          </div>
          <h2 class="text-base sm:text-lg md:text-xl font-bold font-cinzel text-white break-words leading-tight mt-1">${s.title}</h2>
          ${s.subtitle ? `<p class="text-[11px] sm:text-xs font-semibold mt-0.5 break-words" style="color: var(--accent);">${s.subtitle}</p>` : ''}
        </div>
      </div>

      ${promptDescription ? `
        <div class="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[9px] font-mono shadow-sm shrink-0 bg-stone-950/80" style="border-color: ${theme.palette.accent}50; color: ${theme.palette.accent};" title="${promptDescription}">
          <span class="w-1.5 h-1.5 rounded-full" style="background-color: var(--accent);"></span>
          <span class="font-bold text-white">${classArchetype}</span>
        </div>
      ` : ''}
    </div>
  `;

  // --- 2. Sleek Storytelling & Mentor Immersion Strip ---
  const hasStory = !!s.thematicStorytelling;
  const hasGuide = !!s.characterGuide;
  let immersionStripHtml = '';

  if (hasStory || hasGuide) {
    immersionStripHtml = `
      <div class="immersion-strip my-2 p-2 sm:p-2.5 rounded-xl border bg-stone-950/85 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow" style="border-color: ${theme.palette.primary}40;">
        <!-- Left: Guide info & Speech -->
        <div class="flex items-start sm:items-center gap-2 min-w-0 flex-1">
          <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg shrink-0 overflow-hidden border border-amber-400/60 bg-stone-900 p-0.5 flex items-center justify-center text-amber-300 font-bold text-xs shadow-inner">
            ✦
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-cinzel text-[10px] font-bold uppercase tracking-wider text-amber-300">
                ${s.characterGuide?.name || 'Mentor TrailUp'}
              </span>
              ${s.thematicStorytelling?.storyArcPhase ? `
                <span class="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  ${s.thematicStorytelling.storyArcPhase}
                </span>
              ` : ''}
            </div>
            <p class="text-[11px] sm:text-xs text-stone-200 italic leading-snug whitespace-normal break-words">
              "${s.characterGuide?.speechText || s.thematicStorytelling?.narrativeBeat || 'Foque no aprendizado aplicado e consolide sua maestria.'}"
            </p>
          </div>
        </div>
      </div>
    `;
  }

  // --- 3. Interactive Component Builders ---
  let interactiveWidgetHtml = '';

  // A. Quiz
  if (resolvedQuiz || (s.type === 'interactive_challenge' && resolvedChecklist.length === 0 && resolvedDecisionChoices.length === 0)) {
    const q = resolvedQuiz || {
      question: s.contentParagraphs && s.contentParagraphs[0] ? s.contentParagraphs[0] : 'Desafio Prático: Selecione a melhor abordagem arquitetural:',
      options: [
        { id: 'opt-1', text: s.keyTakeaways && s.keyTakeaways[0] ? s.keyTakeaways[0] : 'Aplicar os padrões e boas práticas de arquitetura recomendadas.', isCorrect: true, explanation: 'Excelente! Abordagem recomendada para garantir integridade e qualidade.' },
        { id: 'opt-2', text: 'Ignorar o desacoplamento e juntar todas as dependências sem testes automatizados.', isCorrect: false, explanation: 'Incorreto. Essa prática introduz fragilidade e eleva riscos técnicos.' },
        { id: 'opt-3', text: 'Remover observabilidade e monitoramento em produção.', isCorrect: false, explanation: 'Incorreto. Sem observabilidade é impossível monitorar a saúde do sistema.' }
      ]
    };
    interactiveWidgetHtml = `
      <div class="quiz-widget-container p-3 sm:p-3.5 rounded-xl bg-stone-950/85 border border-stone-800 space-y-2 relative z-20 w-full">
        <div class="flex items-center justify-between gap-1.5 pb-1 border-b border-white/10">
          <span class="text-[10px] font-bold uppercase tracking-wider font-mono text-amber-400">✦ DESAFIO COGNITIVO • QUIZ</span>
          <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">+150 XP</span>
        </div>
        <p class="text-sm sm:text-base font-semibold text-white leading-relaxed break-words">${q.question}</p>
        <div class="quiz-options-group space-y-1.5 pt-0.5" id="quiz-options-group-${idx}">
          ${(q.options || []).map((opt, oidx) => {
            const optId = opt.id || ('opt-' + idx + '-' + oidx);
            const isCorrectBool = opt.isCorrect === true || (opt as any).isCorrect === 'true';
            const letter = String.fromCharCode(65 + oidx);
            return `
              <button
                type="button"
                onclick="handleQuizAnswer(this, ${isCorrectBool}, '${encodeURIComponent(opt.explanation || '')}')"
                class="quiz-option-btn w-full text-left p-2 sm:p-2.5 rounded-lg bg-stone-900/90 border border-stone-800 hover:border-amber-400/80 hover:bg-stone-800 text-xs text-stone-200 transition-all flex items-start gap-2 group cursor-pointer relative z-30 break-words"
                id="opt-${optId}"
              >
                <span class="quiz-letter-badge font-bold font-mono text-[11px] shrink-0 px-1.5 py-0.2 rounded bg-stone-800 text-stone-300 group-hover:bg-amber-500 group-hover:text-black transition-colors">${letter}</span>
                <span class="leading-snug flex-1 min-w-0 break-words text-xs sm:text-sm">${opt.text}</span>
              </button>
            `;
          }).join('')}
        </div>
        <div class="quiz-feedback-box hidden p-2.5 rounded-lg text-xs transition-all mt-1 break-words"></div>
      </div>
    `;
  }
  // B. Checklist
  else if (resolvedChecklist.length > 0) {
    interactiveWidgetHtml = `
      <div class="checklist-widget-container p-3 sm:p-3.5 rounded-xl bg-stone-950/85 border border-stone-800 space-y-2 relative z-20 w-full">
        <div class="flex items-center justify-between pb-1 border-b border-white/10 gap-2">
          <span class="text-[10px] font-bold uppercase tracking-wider font-mono text-emerald-400">✦ MARCOS DE MAESTRIA</span>
          <span class="text-[10px] text-stone-400 font-mono">Clique para marcar</span>
        </div>
        <div class="space-y-1.5">
          ${resolvedChecklist.map((item, cidx) => `
            <div
              id="chk-${item.id}"
              onclick="toggleChecklistItem(this, '${item.id}', ${item.xp || 50})"
              class="chk-item-row flex items-center justify-between gap-2 p-2 sm:p-2.5 rounded-lg border border-stone-800 bg-stone-900/70 hover:border-emerald-500/60 cursor-pointer transition-all text-stone-200 relative z-30 select-none"
            >
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <span class="chk-status-box shrink-0 flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-mono font-bold bg-stone-800 text-stone-400 border border-stone-700 transition-colors">
                  ${String(cidx + 1).padStart(2, '0')}
                </span>
                <span class="chk-text text-[11px] sm:text-xs font-medium break-words">${item.text}</span>
              </div>
              <span class="chk-xp-badge shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded text-emerald-300 bg-emerald-950/40 border border-emerald-500/20">
                +${item.xp || 50} XP
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  // C. Decision Choices
  else if (resolvedDecisionChoices.length > 0) {
    interactiveWidgetHtml = `
      <div class="decision-widget-container p-3 sm:p-3.5 rounded-xl bg-stone-950/85 border border-stone-800 space-y-2 relative z-20 w-full">
        <span class="text-[10px] font-bold uppercase tracking-wider font-mono text-amber-400 block pb-1 border-b border-white/10">✦ ESCOLHA SEU CAMINHO ESTRATÉGICO</span>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
          ${resolvedDecisionChoices.map(c => `
            <div
              id="decision-${c.id}"
              onclick="selectDecisionPath(this, '${c.id}', ${c.xpReward || 100}, '${encodeURIComponent(c.outcome)}')"
              class="decision-card-btn p-2.5 sm:p-3 rounded-lg border border-stone-800 bg-stone-900/70 hover:border-amber-400/80 cursor-pointer transition-all flex flex-col justify-between relative z-30 break-words"
            >
              <div>
                <div class="flex items-center justify-between gap-1 mb-1">
                  <h4 class="font-bold text-xs text-white break-words">${c.label}</h4>
                  <span class="text-[9px] font-bold text-amber-400 font-mono shrink-0">+${c.xpReward || 100} XP</span>
                </div>
                <p class="text-[10px] sm:text-[11px] text-stone-300 leading-snug break-words">${c.description}</p>
              </div>
              <div class="decision-outcome-box hidden mt-2 pt-1.5 border-t border-amber-500/30 text-[10px] text-amber-200 font-medium break-words"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  // D. Boss Battle Arena
  else if (s.type === 'boss_battle') {
    interactiveWidgetHtml = `
      <div class="p-3 sm:p-3.5 rounded-xl bg-stone-950/85 border border-rose-900/60 space-y-2 relative z-20 w-full shadow-lg">
        <div class="flex items-center justify-between pb-1 border-b border-rose-900/50 gap-2">
          <span class="text-[10px] font-bold uppercase tracking-wider font-mono text-rose-400">ARENA DE COMBATE COGNITIVO</span>
          <span class="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-600/50 text-[10px] font-bold text-rose-300 font-mono" id="boss-hp-display">
            1000 / 1000
          </span>
        </div>
        <div class="w-full h-2.5 bg-stone-900 rounded-full overflow-hidden border border-rose-950">
          <div id="boss-hp-bar" class="h-full bg-gradient-to-r from-rose-600 via-amber-500 to-emerald-400 transition-all duration-300" style="width: 100%;"></div>
        </div>
        <div id="boss-actions" class="grid grid-cols-2 gap-2 pt-1 relative z-30">
          <button type="button" onclick="attackBoss(350, 'Golpe Técnico')" class="py-2 px-2.5 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white shadow transition-transform active:scale-95 cursor-pointer text-center">
            ✦ Golpe Técnico (-350)
          </button>
          <button type="button" onclick="attackBoss(650, 'Crítico Arquitetural')" class="py-2 px-2.5 rounded-lg text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-white shadow transition-transform active:scale-95 cursor-pointer text-center">
            ✦ Crítico (-650)
          </button>
        </div>
        <div id="boss-feedback" class="hidden p-2 rounded-lg text-xs text-center font-bold transition-all mt-1 break-words"></div>
      </div>
    `;
  }
  // E. Timeline Steps
  else if (s.timelineSteps && s.timelineSteps.length > 0) {
    interactiveWidgetHtml = `
      <div class="p-3 sm:p-3.5 rounded-xl bg-stone-950/85 border border-stone-800 space-y-2 relative z-20 w-full">
        <span class="text-[10px] font-bold uppercase tracking-wider font-mono text-amber-400 block pb-1 border-b border-white/10">✦ ROTEIRO PEDAGÓGICO & ETAPAS</span>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
          ${s.timelineSteps.map(step => `
            <div class="p-2.5 rounded-lg bg-stone-900/80 border ${step.highlight ? 'border-amber-400/80' : 'border-stone-800'} flex flex-col justify-between shadow">
              <div>
                <div class="flex items-center justify-between mb-1 gap-1">
                  <span class="text-[9px] font-bold px-1.5 py-0.2 rounded text-black shrink-0" style="background-color: var(--primary);">Etapa ${step.stepNumber}</span>
                  ${step.highlight ? '<span class="text-[9px] text-amber-300 font-bold">✦ Foco</span>' : ''}
                </div>
                <h4 class="text-xs font-bold text-white mb-0.5 break-words">${step.title}</h4>
                <p class="text-[10px] sm:text-[11px] text-stone-300 leading-snug break-words">${step.description}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  // F. Bento Cards
  else if (s.bentoCards && s.bentoCards.length > 0) {
    interactiveWidgetHtml = `
      <div class="p-3 sm:p-3.5 rounded-xl bg-stone-950/85 border border-stone-800 space-y-2 relative z-20 w-full">
        <span class="text-[10px] font-bold uppercase tracking-wider font-mono text-amber-400 block pb-1 border-b border-white/10">✦ ESTRUTURA MODULAR BENTO</span>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-0.5">
          ${s.bentoCards.map(b => `
            <div class="p-2.5 rounded-lg bg-stone-900/80 border ${b.highlight ? 'border-amber-400/80' : 'border-stone-800'} flex flex-col justify-between shadow">
              <div>
                <div class="flex items-center justify-between mb-1 gap-1">
                  ${b.tag ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded text-black" style="background-color: var(--primary);">${b.tag}</span>` : '<span></span>'}
                  ${b.stat ? `<span class="text-[11px] font-mono font-bold text-amber-300">${b.stat}</span>` : ''}
                </div>
                <h4 class="text-xs font-bold text-white mb-0.5 break-words">${b.title}</h4>
                <p class="text-[10px] sm:text-[11px] text-stone-300 leading-snug break-words">${b.description}</p>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  // G. Comparison Matrix
  else if (s.comparisonColumns && s.comparisonColumns.length > 0) {
    interactiveWidgetHtml = `
      <div class="p-3 sm:p-3.5 rounded-xl bg-stone-950/85 border border-stone-800 space-y-2 relative z-20 w-full">
        <span class="text-[10px] font-bold uppercase tracking-wider font-mono text-amber-400 block pb-1 border-b border-white/10">✦ MATRIZ COMPARATIVA & TRADE-OFFS</span>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
          ${s.comparisonColumns.map(col => `
            <div class="p-2.5 rounded-lg border ${col.highlight ? 'border-amber-400/80 bg-amber-950/30' : 'border-stone-800 bg-stone-900/70'} flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-1.5 pb-1 border-b border-white/10">
                  <h4 class="font-bold text-xs text-white">${col.title}</h4>
                  ${col.badge ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded text-black" style="background-color: var(--primary);">${col.badge}</span>` : ''}
                </div>
                <ul class="space-y-1 text-[11px] text-stone-300">
                  ${(col.items || []).map(item => `
                    <li class="flex items-start gap-1.5">
                      <span class="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                      <span class="break-words leading-snug">${item}</span>
                    </li>
                  `).join('')}
                </ul>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  // H. Metric Cards
  else if (s.metricCards && s.metricCards.length > 0) {
    interactiveWidgetHtml = `
      <div class="p-3 sm:p-3.5 rounded-xl bg-stone-950/85 border border-stone-800 space-y-2 relative z-20 w-full">
        <span class="text-[10px] font-bold uppercase tracking-wider font-mono text-amber-400 block pb-1 border-b border-white/10">✦ MÉTRICAS & IMPACTO</span>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-0.5">
          ${s.metricCards.map(m => `
            <div class="p-2.5 rounded-lg bg-stone-900/80 border border-stone-800 flex flex-col justify-between shadow">
              <span class="text-xl sm:text-2xl font-extrabold font-mono" style="color: var(--primary);">${m.value}</span>
              <div class="mt-1">
                <p class="text-xs font-bold text-white break-words">${m.label}</p>
                ${m.sublabel ? `<p class="text-[10px] text-stone-400">${m.sublabel}</p>` : ''}
                ${m.trend ? `<span class="inline-block mt-0.5 text-[9px] text-emerald-400 font-bold">${m.trend}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  // I. Key Takeaways as Primary Widget if no other widget present
  else if (s.keyTakeaways && s.keyTakeaways.length > 0) {
    interactiveWidgetHtml = `
      <div class="p-3 sm:p-3.5 rounded-xl border space-y-2 shadow-inner w-full" style="border-color: ${theme.palette.secondary}80; background-color: rgba(10,6,18,0.85);">
        <div class="flex items-center justify-between pb-1 border-b border-stone-800">
          <span class="text-[10px] font-bold uppercase tracking-wider text-amber-300">✦ PONTOS CARDEAIS DE MAESTRIA</span>
          <span class="text-[9px] text-stone-400">Clique para dominar (+25 XP)</span>
        </div>
        <div class="space-y-1.5">
          ${s.keyTakeaways.map((t, tidx) => `
            <div
              id="takeaway-${idx}-${tidx}"
              onclick="toggleTakeawayMastery(this, '${idx}-${tidx}', 25)"
              class="takeaway-item-row p-2 rounded-lg border border-stone-800 bg-stone-950/70 hover:border-emerald-500/60 cursor-pointer flex items-center justify-between gap-2 text-[11px] sm:text-xs text-stone-300 transition-all select-none"
            >
              <div class="flex items-start gap-2 min-w-0 flex-1">
                <span class="takeaway-status-badge shrink-0 flex h-4 w-4 rounded-full items-center justify-center bg-stone-800 text-[9px] text-stone-400 font-mono">
                  ${tidx + 1}
                </span>
                <span class="takeaway-text break-words leading-snug">${t}</span>
              </div>
              <span class="takeaway-xp-badge text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-stone-800 text-stone-400 shrink-0">
                +25 XP
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // The current deck schema guarantees one unique interactive element per
  // slide. Quiz/checklist/decision variants are adapted to the legacy widgets
  // above; the remaining variants need their own standalone control instead
  // of disappearing from exported HTML.
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
      reflection_point: 'REFLEXÃO APLICADA',
      action_prompt: 'MISSÃO PRÁTICA',
      code_inspect: 'INSPEÇÃO DE CÓDIGO',
    };

    interactiveWidgetHtml += `
      <div class="unique-interactive-widget mt-2 p-3 sm:p-3.5 rounded-xl bg-stone-950/85 border border-amber-500/30 space-y-2 relative z-20 w-full">
        <div class="flex items-start justify-between gap-2 pb-1.5 border-b border-white/10">
          <div class="min-w-0">
            <span class="text-[9px] font-bold uppercase tracking-wider font-mono text-amber-400 block">
              ✦ ${uniqueTypeLabel[uniqueInteractive.type] || 'DESAFIO INTERATIVO'}
            </span>
            <h3 class="text-xs sm:text-sm font-bold text-white leading-snug break-words">${escapeHtmlText(uniqueInteractive.title)}</h3>
          </div>
          <span class="shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
            +${uniqueInteractive.xpReward || 100} XP
          </span>
        </div>
        ${uniqueInteractive.badge ? `<span class="inline-flex max-w-full text-[9px] font-mono px-2 py-0.5 rounded bg-stone-900 border border-stone-800 text-stone-300 break-words">${escapeHtmlText(uniqueInteractive.badge)}</span>` : ''}
        <p class="text-[11px] sm:text-xs text-stone-200 leading-relaxed break-words">${escapeHtmlText(uniqueInteractive.prompt)}</p>
        ${uniqueInteractive.contextHint ? `<p class="text-[10px] sm:text-[11px] text-stone-400 leading-relaxed break-words">${escapeHtmlText(uniqueInteractive.contextHint)}</p>` : ''}
        ${guidanceItems.length > 0 ? `
          <ol class="space-y-1 text-[10px] sm:text-[11px] text-stone-300">
            ${guidanceItems.map((item, itemIndex) => `<li class="flex items-start gap-2"><span class="shrink-0 font-mono text-amber-400">${itemIndex + 1}.</span><span class="break-words min-w-0">${escapeHtmlText(item)}</span></li>`).join('')}
          </ol>
        ` : ''}
        ${uniqueInteractive.codeSnippet ? `
          <div class="rounded-lg border border-stone-800 bg-black/70 overflow-x-auto">
            <div class="px-2.5 py-1 border-b border-stone-800 text-[9px] font-mono text-stone-400">${escapeHtmlText(uniqueInteractive.codeSnippet.language || 'Código')}</div>
            <pre class="p-2.5 text-[10px] sm:text-[11px] text-amber-200 whitespace-pre min-w-max">${escapeHtmlText(uniqueInteractive.codeSnippet.code)}</pre>
          </div>
          ${uniqueInteractive.codeSnippet.inspectionHint ? `<p class="text-[10px] text-amber-200/80 break-words">${escapeHtmlText(uniqueInteractive.codeSnippet.inspectionHint)}</p>` : ''}
        ` : ''}
        ${uniqueInteractive.sampleReflection ? `<details class="rounded-lg border border-stone-800 bg-stone-900/60 p-2 text-[10px] text-stone-300"><summary class="cursor-pointer font-bold text-amber-300">Ver exemplo de resposta</summary><p class="pt-1.5 leading-relaxed break-words">${escapeHtmlText(uniqueInteractive.sampleReflection)}</p></details>` : ''}
        ${uniqueInteractive.suggestedAction ? `<p class="rounded-lg border border-emerald-500/20 bg-emerald-950/30 p-2 text-[10px] sm:text-[11px] text-emerald-200 break-words"><strong>Ação sugerida:</strong> ${escapeHtmlText(uniqueInteractive.suggestedAction)}</p>` : ''}
        ${uniqueInteractive.expectedDeliverable ? `<p class="text-[10px] sm:text-[11px] text-stone-300 break-words"><strong class="text-white">Entrega esperada:</strong> ${escapeHtmlText(uniqueInteractive.expectedDeliverable)}</p>` : ''}
        <label class="block text-[9px] font-mono font-bold uppercase tracking-wider text-stone-400" for="unique-note-${idx}">Sua resposta</label>
        <textarea
          id="unique-note-${idx}"
          class="unique-note-input w-full min-h-20 resize-y rounded-lg border border-stone-700 bg-stone-950 p-2.5 text-[11px] sm:text-xs text-stone-100 placeholder:text-stone-600 focus:border-amber-400 focus:outline-none"
          placeholder="${escapeHtmlAttribute(uniqueInteractive.userNotePlaceholder || 'Registre sua análise, decisão ou plano de ação...')}"
        ></textarea>
        <div class="flex flex-col min-[380px]:flex-row min-[380px]:items-center gap-2 min-w-0">
          <button
            type="button"
            onclick="saveUniqueInteraction(${idx}, ${uniqueInteractive.xpReward || 100})"
            class="btn-trailup justify-center text-[11px] sm:text-xs min-h-9 w-full min-[380px]:w-auto"
          >Salvar resposta</button>
          <span id="unique-status-${idx}" class="unique-interaction-status min-w-0 text-[10px] text-stone-400 break-words" aria-live="polite"></span>
        </div>
      </div>
    `;
  }

  // --- 4. Sub-blocks: Written Example, Code, Sticky Note, Secret Lore ---
  const writtenExampleHtml = s.writtenExample ? `
    <div class="p-2.5 sm:p-3 rounded-xl border my-1.5 shadow bg-stone-950/80" style="border-color: ${theme.palette.primary}60;">
      <div class="flex items-center justify-between gap-2 mb-1 pb-1 border-b border-white/10">
        <span class="text-[9px] uppercase font-bold tracking-wider text-amber-300 truncate">
          ${s.writtenExample.visualType === 'code' ? 'Exemplo de Código' : s.writtenExample.visualType === 'diagram' ? 'Diagrama Conceitual' : 'Aplicação Prática'}
        </span>
        <span class="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded text-black shrink-0" style="background-color: var(--accent);">Prática</span>
      </div>
      <h4 class="text-xs font-bold text-white mb-1">${s.writtenExample.title}</h4>
      <p class="text-[11px] text-stone-300 leading-snug mb-1.5">${s.writtenExample.explanation}</p>
      ${s.writtenExample.codeOrDiagram ? `
        <div class="rounded-lg bg-stone-950 border border-stone-800 p-2 font-mono text-[10px] text-amber-200 overflow-x-auto">
          <pre class="whitespace-pre">${s.writtenExample.codeOrDiagram}</pre>
        </div>
      ` : ''}
    </div>
  ` : '';

  const codeSnippetHtml = s.codeSnippet ? `
    <div class="my-1.5 rounded-lg border border-stone-800 bg-stone-950 p-2.5 font-mono text-[10px] sm:text-[11px] text-amber-200 overflow-x-auto shadow-inner">
      <div class="flex items-center justify-between border-b border-stone-800 pb-1 mb-1.5 text-stone-400 text-[9px]">
        <span class="font-bold text-amber-300">${s.codeSnippet.language || 'Código'}</span>
      </div>
      <pre class="whitespace-pre">${s.codeSnippet.code}</pre>
    </div>
  ` : '';

  const stickyNoteHtml = s.stickyNote ? `
    <div class="my-1.5 p-2.5 rounded-xl border border-amber-500/40 bg-amber-950/30 text-amber-200 text-[11px] shadow">
      <span class="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold font-mono text-black mb-0.5" style="background-color: var(--accent);">${s.stickyNote.badge || 'Nota'}</span>
      <p class="italic text-stone-200 leading-snug">${s.stickyNote.text}</p>
    </div>
  ` : '';

  const secretLoreHtml = s.secretLore ? `
    <div class="secret-lore-widget my-1.5 p-2.5 rounded-xl border border-stone-800 bg-stone-950/85 text-center relative z-20 w-full">
      <button
        type="button"
        id="btn-reveal-secret-${idx}"
        onclick="revealSecretLore(this, '${encodeURIComponent(s.secretLore.revealedContent)}')"
        class="btn-reveal-secret w-full py-2 px-3 rounded-lg text-xs font-bold text-black shadow transition-transform hover:scale-[1.02] flex items-center justify-center gap-1.5 cursor-pointer relative z-30"
        style="background-color: var(--primary);"
      >
        <span>✦</span>
        <span class="break-words">${s.secretLore.hint || 'Desbloquear Revelação Secreta (+100 XP)'}</span>
      </button>
      <div class="secret-revealed-content hidden text-left space-y-1 p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 mt-1.5 break-words"></div>
    </div>
  ` : '';

  const quoteHtml = s.quote ? `
    <div class="text-center pt-1.5 border-t border-white/5 break-words">
      <p class="text-[11px] italic" style="color: var(--accent);">"${s.quote.text}"</p>
      <p class="text-[9px] text-stone-400 mt-0.5">— ${s.quote.author}</p>
    </div>
  ` : '';

  let bodyHtml = '';

  // --- SPECIAL CASE: Cover Slide ---
  if (s.type === 'cover') {
    bodyHtml = `
      <div class="${frameClass} text-center max-w-2xl mx-auto space-y-3 sm:space-y-4 shadow-2xl relative z-10">
        <div class="flex items-center justify-center gap-2">
          <span class="inline-block px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold font-mono tracking-wider border border-white/20" style="background-color: var(--primary); color: #000;">
            ${coverCopy.missionBadge}
          </span>
        </div>

        ${iconSvg ? `<div class="w-12 h-12 sm:w-14 sm:h-14 mx-auto my-1 drop-shadow-[0_0_12px_var(--accent)]" style="color: var(--accent);">${iconSvg}</div>` : ''}

        <h1 class="text-xl sm:text-2xl md:text-3xl font-bold font-cinzel text-white leading-tight break-words">
          ${s.title}
        </h1>

        ${dividerSvg ? `<div class="w-full h-3 sm:h-4 my-1 flex items-center justify-center overflow-hidden opacity-85" style="color: var(--accent);">${dividerSvg}</div>` : ''}

        ${s.characterGuide ? `
          <div class="p-2.5 sm:p-3 rounded-xl bg-stone-950/70 border border-stone-800 text-left space-y-1 break-words max-w-lg mx-auto">
            <div class="text-[11px] font-bold flex items-center gap-1" style="color: var(--accent);">
              <span class="text-amber-400">✦</span> ${s.characterGuide.name} (${s.characterGuide.title || 'Mentor TrailUp'})
            </div>
            <p class="text-xs italic text-stone-200 leading-relaxed">"${s.characterGuide.speechText}"</p>
          </div>
        ` : ''}

        <div class="space-y-1.5 pt-1">
          ${(s.contentParagraphs || []).map(p => `<p class="text-xs sm:text-sm leading-relaxed text-stone-300 font-medium break-words">${p}</p>`).join('')}
        </div>
      </div>
    `;
  }
  // --- SPECIAL CASE: Epic Conclusion (No fake certificate!) ---
  else if (s.type === 'epic_conclusion' || s.type === 'reward_certificate') {
    bodyHtml = `
      <div class="${frameClass} max-w-2xl mx-auto w-full text-center p-4 sm:p-6 space-y-3 sm:space-y-4 shadow-2xl relative z-10">
        <div class="w-12 h-12 mx-auto rounded-2xl flex items-center justify-center text-xl font-bold shadow-lg text-black border-2 border-amber-400" style="background-color: var(--primary);">
          ✦
        </div>
        <div>
          <span class="font-cinzel text-[10px] sm:text-xs font-bold uppercase tracking-widest text-amber-400 block mb-0.5">
            ✦ ${coverCopy.conclusionBadge} ✦
          </span>
          <h2 class="font-cinzel text-lg sm:text-xl md:text-2xl font-extrabold text-white break-words">
            ${s.title || 'Jornada Concluída com Sucesso!'}
          </h2>
        </div>
        <p class="text-xs sm:text-sm text-stone-200 max-w-lg mx-auto leading-relaxed break-words">
          ${(s.contentParagraphs && s.contentParagraphs[0]) || `Você completou com excelência todos os módulos e desafios práticos da trilha ${deck.title}.`}
        </p>

        <div class="pt-2 flex items-center justify-center gap-3">
          <button type="button" onclick="goToSlide(0)" class="px-3.5 py-1.5 rounded-xl bg-stone-900 border border-stone-700 text-stone-300 text-xs font-bold hover:text-white transition-all cursor-pointer">
            ↺ Revisar Trilha
          </button>
        </div>
        ${interactiveWidgetHtml}
      </div>
    `;
  }
  // --- SPECIAL CASE: Reflection Checkpoint (guided note-taking, deliberately sparse) ---
  else if (s.type === 'reflection_checkpoint') {
    bodyHtml = `
      <div class="${frameClass} max-w-2xl mx-auto w-full text-center space-y-3 sm:space-y-4 shadow-2xl relative z-10">
        <span class="inline-block px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold font-mono tracking-wider border border-white/20" style="background-color: var(--primary); color: #000;">
          PONTO DE REFLEXÃO
        </span>
        <h2 class="text-lg sm:text-xl md:text-2xl font-bold font-cinzel text-white leading-tight break-words">${s.title}</h2>
        <div class="space-y-3 text-left max-w-lg mx-auto pt-1">
          ${(s.guidingQuestions || []).map((q, qi) => `
            <div class="p-3 rounded-xl bg-stone-950/80 border border-stone-800">
              <p class="text-xs sm:text-sm font-semibold text-white mb-2 break-words">${qi + 1}. ${q}</p>
              <div class="border-b border-dashed border-stone-700 h-5"></div>
              <div class="border-b border-dashed border-stone-700 h-5 mt-2"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  // --- SPECIAL CASE: Pre-Conclusion Reflection (widget extracted from the final slide, own space) ---
  else if (s.type === 'pre_conclusion_reflection') {
    bodyHtml = `
      <div class="${frameClass} max-w-2xl mx-auto w-full text-center space-y-3 sm:space-y-4 shadow-2xl relative z-10">
        <h2 class="text-lg sm:text-xl md:text-2xl font-bold font-cinzel text-white leading-tight break-words">${s.title}</h2>
        ${interactiveWidgetHtml}
      </div>
    `;
  }
  // --- STANDARD SLIDES: High-Craft 2-Column Responsive Layout (Zero Overlap & Full Immersion) ---
  else {
    const hasRightWidget = !!interactiveWidgetHtml || !!referenceImageHtml;
    const paragraphs = s.contentParagraphs || [];
    // Slide com pouco conteudo (tipico de uma "Parte 2/2" apos divisao por
    // paragrafo - ver slidePagination.ts) ficava com fonte minuscula boiando
    // pequena no meio do card, que tem altura FIXA (ver decisao de nao
    // esticar/encolher entre slides) - card grande, texto minusculo,
    // parecia "tamanho errado"/mal aproveitamento de espaco. Fonte/respiro
    // maiores preenchem melhor o espaco disponivel num slide assim.
    const isSparse =
      !hasRightWidget &&
      paragraphs.length <= 1 &&
      !s.writtenExample &&
      !s.codeSnippet &&
      !s.stickyNote &&
      !s.secretLore &&
      !s.quote;
    const sparseParagraphClass = isSparse
      ? 'text-base sm:text-lg md:text-xl leading-relaxed text-stone-200 font-normal break-words'
      : 'text-xs sm:text-sm leading-relaxed text-stone-200 font-normal break-words';
    const sparseFlowClass = isSparse ? 'space-y-4 sm:space-y-5 pt-2' : 'space-y-2 pt-1';
    const sparseParagraphWrapClass = isSparse ? 'space-y-3 sm:space-y-4' : 'space-y-1.5';

    bodyHtml = `
      <div class="${frameClass} max-w-4xl mx-auto w-full space-y-2 shadow-2xl relative z-10">
        ${headerHtml}
        ${immersionStripHtml}

        ${dividerSvg ? `<div class="w-full h-2.5 flex items-center justify-center overflow-hidden opacity-70 my-0.5" style="color: var(--accent);">${dividerSvg}</div>` : ''}

        ${hasRightWidget ? `
          <!-- 2-Column Responsive Grid Layout (Desktop 16:9 Fits Without Scrolling) -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start pt-1">
            <!-- Left Column: Core Narrative & Conceptual Explanations (5 cols) -->
            <div class="lg:col-span-5 space-y-2">
              <div class="space-y-1.5">
                ${paragraphs.map(p => `<p class="text-xs sm:text-sm leading-relaxed text-stone-200 font-normal break-words">${p}</p>`).join('')}
              </div>
              ${writtenExampleHtml}
              ${codeSnippetHtml}
              ${stickyNoteHtml}
              ${secretLoreHtml}
              ${quoteHtml}
            </div>

            <!-- Right Column: Reference Image + Interactive Challenge or Structured Grid (7 cols) -->
            <div class="lg:col-span-7">
              ${referenceImageHtml}
              ${interactiveWidgetHtml}
            </div>
          </div>
        ` : `
          <!-- Single Full-Width Fluid Flow -->
          <div class="${sparseFlowClass}">
            ${referenceImageHtml}
            <div class="${sparseParagraphWrapClass}">
              ${paragraphs.map(p => `<p class="${sparseParagraphClass}">${p}</p>`).join('')}
            </div>
            ${writtenExampleHtml}
            ${codeSnippetHtml}
            ${stickyNoteHtml}
            ${secretLoreHtml}
            ${quoteHtml}
          </div>
        `}
      </div>
    `;
  }

  // Backdrop Overlay Image
  const ambientBgHtml = s.backgroundImage ? `
    <div class="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-0">
      <img src="${s.backgroundImage}" class="w-full h-full object-cover opacity-35 filter ${s.ambientBlur ? `blur-[${s.ambientBlur}px]` : 'blur-[0.5px]'}" referrerPolicy="no-referrer" alt="Ambient Backdrop" />
      <div class="absolute inset-0 bg-stone-950/65"></div>
    </div>
  ` : '';

  return `
    <div class="w-full max-w-4xl mx-auto relative flex flex-col justify-center my-auto">
      ${ambientBgHtml}
      ${bodyHtml}
    </div>
  `;
}

/**
 * Generate a complete standalone, fully-featured interactive HTML presentation
 */
export function generateInteractiveHtml(
  deck: DeckData,
  selectedArchetypeOverride?: string,
  exportedState?: any
): string {
  const theme = deck.themeConfig;
  const activeArchetype = selectedArchetypeOverride || deck.visualThematicArchetype || theme.archetype || 'medieval-rpg';
  // Antes duplicado em 2 cartoes separados (capa "XP Estimado", final "XP
  // Total") - agora so no header, ao lado do XP ao vivo ja obtido (ver
  // docs/superpowers/specs/2026-08-24-capa-final-redesign-design.md).
  const estimatedTotalXp = (deck.slides?.length || 8) * 150;

  const archetypeNameMap: Record<string, string> = {
    'medieval-rpg': 'RPG Medieval & Alta Fantasia',
    'indian-heritage': 'Indian Palace & Heritage',
    'islamic-ramadan': 'Ramadan Blue & Gold',
    'nature-eco': 'Eco Planet & Nature',
    'scrapbook-stickers': 'Pastel Washi Scrapbook',
    'cyber-tech': 'Cyber Tech & Hologram',
    'royal-luxury': 'Royal Luxury & Gold',
    'trailup-astral': 'TrailUp Astral & Runas',
  };

  const themeDisplayTitle = archetypeNameMap[activeArchetype] || 'TrailUp Imersivo';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${deck.title} • TrailUp BrainHex (${deck.targetProfile})</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: ${theme.palette.primary};
      --secondary: ${theme.palette.secondary};
      --accent: ${theme.palette.accent};
      --bg: ${theme.palette.background};
    }
    * { box-sizing: border-box; }
    body {
      background-color: var(--bg);
      color: #F9FAFB;
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 12px;
      margin: 0;
      overflow-x: hidden;
    }
    .font-cinzel { font-family: 'Cinzel', serif; }
    .font-mono { font-family: 'JetBrains Mono', monospace; }
    
    /* Viewport Stage Modes */
    /* Altura fixa (nao min/max guiado por conteudo) de proposito: um piso+
       teto flexivel faz o card esticar/encolher a cada slide conforme a
       densidade do conteudo, o que e pior que ter espaco sobrando num slide
       curto. O card mede sempre o mesmo por modo/breakpoint; slide curto so
       ganha respiro vertical dentro desse espaco (#slide-stage centraliza via
       margem automatica do filho, comentario abaixo). */
    .deck-container {
      width: 100%;
      max-width: 1080px;
      height: 94vh;
      border-radius: 20px;
      box-shadow: 0 30px 60px -15px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.12);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .deck-container.mode-portrait {
      max-width: 440px;
      height: 94vh;
    }

    .deck-container.mode-fullscreen {
      max-width: 100vw;
      max-width: 100dvw;
      width: 100vw;
      width: 100dvw;
      height: 100vh;
      height: 100dvh;
      max-height: 100vh;
      max-height: 100dvh;
      aspect-ratio: auto;
      border-radius: 0;
      position: fixed;
      inset: 0;
      z-index: 9999;
    }

    @media (max-width: 768px) {
      body {
        padding: 4px;
      }
      .deck-container {
        height: calc(100vh - 8px);
        height: calc(100dvh - 8px);
        border-radius: 14px;
      }
      .deck-container.mode-portrait {
        max-width: 100%;
        height: calc(100vh - 8px);
        height: calc(100dvh - 8px);
      }
    }

    #slide-stage {
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent;
      /* A scroll container must start at the top. Centering an overflowing
         flex child puts half of the slide above scrollTop=0, making titles
         and controls permanently unreachable. Short slides remain centered
         by the child's auto block margins. */
      justify-content: flex-start;
    }
    #slide-stage > * {
      flex-shrink: 0;
    }
    .immersion-context {
      width: 100%;
      max-width: 100%;
    }
    @media (min-width: 640px) {
      .immersion-context {
        flex: 0 1 18rem;
        width: min(38%, 18rem);
        max-width: 38%;
      }
    }
    @media (max-width: 480px) {
      .deck-header-title {
        display: none;
      }
      .deck-controls {
        width: 100%;
        justify-content: space-between;
        gap: 4px;
      }
      #btn-reset,
      .deck-controls .deck-viewport-toggle {
        display: none !important;
      }
    }
    @media (max-width: 360px) {
      #slide-indicator {
        font-size: 10px;
        padding-left: 0;
      }
    }
    #slide-stage::-webkit-scrollbar {
      width: 5px;
    }
    #slide-stage::-webkit-scrollbar-track {
      background: transparent;
    }
    #slide-stage::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.2);
      border-radius: 4px;
    }

    /* Glass Panels & Modern Animations */
    .thematic-glass {
      background: rgba(15, 12, 24, 0.82);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 16px;
    }

    /* Buttons */
    .btn-trailup {
      background-color: var(--primary);
      color: #000;
      font-weight: 800;
      padding: 8px 18px;
      border-radius: 10px;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.15s, box-shadow 0.2s;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-trailup:hover {
      transform: translateY(-2px) scale(1.03);
      opacity: 0.95;
      box-shadow: 0 4px 20px var(--primary);
    }
    .btn-trailup:active {
      transform: translateY(0) scale(0.98);
    }
    .btn-trailup:disabled {
      opacity: 0.35;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    /* Directional Slide Entrance Animations */
    .slide-enter-next {
      animation: slideInRight 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .slide-enter-prev {
      animation: slideInLeft 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .fade-enter {
      animation: fadeInZoom 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    @keyframes slideInRight {
      from {
        opacity: 0;
        transform: translateX(45px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }

    @keyframes slideInLeft {
      from {
        opacity: 0;
        transform: translateX(-45px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
    }

    @keyframes fadeInZoom {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* Staggered Children Animation on Slide Render */
    .stagger-anim > * {
      animation: staggerFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    .stagger-anim > *:nth-child(1) { animation-delay: 0.04s; }
    .stagger-anim > *:nth-child(2) { animation-delay: 0.10s; }
    .stagger-anim > *:nth-child(3) { animation-delay: 0.16s; }
    .stagger-anim > *:nth-child(4) { animation-delay: 0.22s; }
    .stagger-anim > *:nth-child(5) { animation-delay: 0.28s; }
    .stagger-anim > *:nth-child(6) { animation-delay: 0.34s; }

    @keyframes staggerFadeIn {
      from {
        opacity: 0;
        transform: translateY(14px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Floating XP Text Animation */
    .floating-xp-badge {
      position: fixed;
      pointer-events: none;
      z-index: 99999;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 800;
      font-size: 15px;
      padding: 6px 14px;
      border-radius: 20px;
      box-shadow: 0 8px 25px rgba(0,0,0,0.8), 0 0 20px currentColor;
      animation: floatXpAnim 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes floatXpAnim {
      0% {
        opacity: 0;
        transform: translate(-50%, 0) scale(0.6);
      }
      20% {
        opacity: 1;
        transform: translate(-50%, -20px) scale(1.15);
      }
      70% {
        opacity: 1;
        transform: translate(-50%, -60px) scale(1);
      }
      100% {
        opacity: 0;
        transform: translate(-50%, -95px) scale(0.85);
      }
    }

    /* Combat Screen Shake */
    .shake-impact {
      animation: combatShake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
    }
    @keyframes combatShake {
      10%, 90% { transform: translate3d(-3px, 1px, 0) rotate(-0.5deg); }
      20%, 80% { transform: translate3d(4px, -2px, 0) rotate(0.5deg); }
      30%, 50%, 70% { transform: translate3d(-5px, 3px, 0) rotate(-1deg); }
      40%, 60% { transform: translate3d(5px, -3px, 0) rotate(1deg); }
    }

    /* Option Error Wobble */
    .shake-error {
      animation: wobbleErr 0.4s ease both;
    }
    @keyframes wobbleErr {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-6px); }
      40% { transform: translateX(6px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }

    /* Option Success Pop */
    .pop-success {
      animation: popSuc 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    @keyframes popSuc {
      0% { transform: scale(1); }
      50% { transform: scale(1.04); }
      100% { transform: scale(1); }
    }

    /* Glowing Pulsing Aura for interactive elements */
    .pulse-glow {
      animation: auraPulse 2.5s infinite alternate ease-in-out;
    }
    @keyframes auraPulse {
      0% { box-shadow: 0 0 5px rgba(245, 158, 11, 0.2); }
      100% { box-shadow: 0 0 22px rgba(245, 158, 11, 0.6); }
    }

    /* Hover transitions for interactive cards */
    .quiz-option-btn, .decision-card-btn, .chk-item-row {
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .quiz-option-btn:hover, .decision-card-btn:hover {
      transform: translateY(-2px);
    }
    .chk-item-row:hover {
      transform: translateX(4px);
    }

    /* Archetype Thematic Card Backgrounds */
    .frame-medieval {
      border: 1.5px solid ${theme.palette.accent}50;
      border-radius: 16px;
      background: radial-gradient(circle at top, ${theme.palette.primary}20, transparent 75%), rgba(12, 8, 22, 0.88);
      box-shadow: inset 0 0 30px rgba(0,0,0,0.6);
    }
    .frame-indian {
      border: 2px solid var(--accent);
      border-radius: 20px;
      background: radial-gradient(circle at top, rgba(245,158,11,0.2), transparent 70%), rgba(26, 10, 5, 0.88);
    }
    .frame-islamic {
      border: 2px solid var(--primary);
      border-radius: 18px;
      background: radial-gradient(circle at top right, rgba(56,189,248,0.2), transparent 60%), rgba(4, 30, 30, 0.9);
    }
    .frame-eco {
      border: 2px solid var(--primary);
      border-radius: 20px;
      background: radial-gradient(circle at top, rgba(16,185,129,0.2), transparent 70%), rgba(15, 23, 42, 0.9);
    }
    .frame-scrapbook {
      border: 2px dashed var(--accent);
      border-radius: 16px;
      background: rgba(30, 15, 55, 0.92);
    }
    .frame-cyber {
      border: 1px solid var(--primary);
      border-radius: 12px;
      background: rgba(2, 25, 20, 0.92);
      box-shadow: inset 0 0 25px rgba(6, 182, 212, 0.25);
    }
    .frame-royal {
      border: 2px solid var(--accent);
      border-radius: 16px;
      background: rgba(11, 19, 43, 0.92);
    }

    ${getBrainHexBorderCss(theme)}
  </style>
</head>
<body>
  <!-- Main Presentation Deck Container with Dynamic Profile Border -->
  <div class="deck-container ${getBrainHexBorderClassName(deck.targetProfile)}" id="deck-wrapper">
    <!-- Atmospheric SVG Vector Background Layer (defined by content & profile palette) -->
    <div id="bg-scene-container" class="absolute inset-0 pointer-events-none z-0">
      <!-- Injected via JavaScript based on content-defined archetype -->
    </div>

    <!-- Magical Interactive Particle & Confetti Canvas -->
    <canvas id="magic-particle-canvas" class="absolute inset-0 pointer-events-none z-[1] w-full h-full"></canvas>

    <!-- Deck Header Bar (Clean Minimal Controls & XP Display) -->
    <header class="deck-header relative z-10 flex items-center justify-between px-3 sm:px-5 py-2 sm:py-2.5 border-b border-white/10 backdrop-blur-md bg-stone-950/70 gap-2 min-w-0">
      <div class="deck-header-title flex items-center gap-2 min-w-0 flex-1 overflow-hidden mr-1">
        <span class="font-cinzel font-bold text-xs text-stone-200 truncate" title="${deck.title}">
          ${deck.title}
        </span>
      </div>

      <!-- Controls & Progress -->
      <div class="deck-controls flex items-center gap-1.5 sm:gap-2 font-mono shrink-0 min-w-0">
        <!-- Live Gamified XP Badge with Auto-save Indicator -->
        <div class="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold shadow-sm transition-transform cursor-default select-none shrink-0" id="xp-badge-container" title="XP Acumulado (Respostas Salvas Automaticamente)">
          <span class="text-amber-400">✦</span>
          <span id="xp-counter">0</span>
          <span class="text-amber-300/60">/${estimatedTotalXp}</span>
          <span>XP</span>
        </div>

        <button id="btn-reset" onclick="resetDeckProgress()" class="px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-400 hover:text-rose-300 hover:border-rose-500/50 transition-colors cursor-pointer shrink-0" title="Reiniciar Respostas e Progresso">
          <svg class="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          <span class="hidden lg:inline">Reiniciar</span>
        </button>

        <button onclick="toggleNarration()" id="btn-narration" class="px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer shrink-0" title="Ouvir Narração da Aula via Áudio">
          <svg class="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          <span class="hidden md:inline" id="narration-label">Narrar</span>
        </button>

        <button onclick="toggleViewportMode()" class="deck-viewport-toggle px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer shrink-0" title="Alternar Formato (16:9 / 9:16 Stories)">
          <svg class="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path></svg>
          <span class="hidden md:inline" id="viewport-label">16:9</span>
        </button>

        <button onclick="toggleFullscreen()" class="px-2 py-1 rounded bg-stone-900 border border-stone-700 text-[11px] text-stone-300 hover:text-white transition-colors cursor-pointer shrink-0" title="Tela Cheia (F)">
          <svg class="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>

        <span class="text-[11px] sm:text-xs font-bold text-stone-300 font-mono shrink-0 pl-1" id="slide-indicator">
          1 / ${deck.slides.length}
        </span>
      </div>
    </header>

    <!-- Slide Content Stage -->
    <main id="slide-stage" class="relative z-10 flex-1 min-h-0 flex flex-col justify-start px-3 sm:px-6 md:px-10 py-3 sm:py-4 overflow-y-auto slide-enter-next">
      <!-- Dynamic slide HTML will be inserted here -->
    </main>

    <!-- Deck Footer Navigation -->
    <footer class="relative z-10 flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-t border-white/10 backdrop-blur-md bg-stone-950/70 gap-2">
      <button class="px-3 sm:px-4 py-2 rounded-xl bg-stone-900/80 border border-stone-700 text-stone-300 text-xs font-bold hover:bg-stone-800 transition-all flex items-center gap-1.5 cursor-pointer shrink-0" onclick="prevSlide()" id="btn-prev">
        ❮ <span class="hidden sm:inline">Anterior</span>
      </button>

      <div class="flex items-center gap-1.5 max-w-[50%] sm:max-w-[60%] overflow-x-auto py-1 px-1" id="slide-dots" style="scrollbar-width: none;">
        <!-- Interactive slide dots -->
      </div>

      <button class="btn-trailup cursor-pointer shrink-0 text-xs sm:text-sm py-2 px-3 sm:px-4" onclick="nextSlide()" id="btn-next">
        <span>Próximo</span> ❯
      </button>
    </footer>
  </div>

  <script>
    const deck = ${JSON.stringify(deck)};
    let currentIndex = 0;
    let totalXp = 0;
    let audioCtx = null;
    let isNarrating = false;
    let isPortrait = false;
    let slideDirection = 'next';
    const currentArchetype = "${activeArchetype}";

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

    function resetDeckProgress() {
      if (confirm('Deseja reiniciar todas as respostas e zerar o XP desta apresentação?')) {
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
        renderSlide();
        playAudio('secret');
        spawnFloatingXp('Progresso Reiniciado!', window.innerWidth / 2, window.innerHeight / 2, '#38BDF8');
      }
    }

    loadSavedState();

    function updateXpDisplay() {
      const xpCounter = document.getElementById('xp-counter');
      if (xpCounter) {
        xpCounter.innerText = totalXp;
        const badge = document.getElementById('xp-badge-container');
        if (badge) {
          badge.classList.add('scale-125', 'bg-amber-800', 'border-amber-400');
          setTimeout(() => badge.classList.remove('scale-125', 'bg-amber-800', 'border-amber-400'), 250);
        }
      }
      persistState();
    }

    // Spawn Floating XP Notifications with Physics
    function spawnFloatingXp(text, x, y, color = '#F59E0B') {
      const badge = document.createElement('div');
      badge.className = 'floating-xp-badge';
      badge.style.left = (x || (window.innerWidth / 2)) + 'px';
      badge.style.top = (y || (window.innerHeight / 2)) + 'px';
      badge.style.color = color;
      badge.style.backgroundColor = 'rgba(15, 10, 25, 0.92)';
      badge.style.borderColor = color;
      badge.style.border = '1.5px solid ' + color;
      badge.innerHTML = text;
      document.body.appendChild(badge);
      setTimeout(() => badge.remove(), 1400);
    }

    // Trigger Combat / Impact Screen Shake
    function triggerScreenShake() {
      const wrapper = document.getElementById('deck-wrapper');
      if (wrapper) {
        wrapper.classList.remove('shake-impact');
        void wrapper.offsetWidth;
        wrapper.classList.add('shake-impact');
        setTimeout(() => wrapper.classList.remove('shake-impact'), 450);
      }
    }

    // Interactive Magical Particle Canvas System
    const particleCanvas = document.getElementById('magic-particle-canvas');
    const pctx = particleCanvas ? particleCanvas.getContext('2d') : null;
    let particles = [];
    let mouse = { x: -1000, y: -1000, active: false };

    function resizeCanvas() {
      if (!particleCanvas) return;
      const rect = particleCanvas.parentElement.getBoundingClientRect();
      particleCanvas.width = rect.width;
      particleCanvas.height = rect.height;
    }
    window.addEventListener('resize', () => {
      resizeCanvas();
      updateSlideIndicator();
    });
    resizeCanvas();

    const RUNIC_SYMBOLS = ['✦', '✧', '◈', '◇', '⬡', 'ᚱ', 'ᚨ', 'ᛟ', 'λ', '01'];
    function initAmbientParticles() {
      if (!particleCanvas) return;
      particles = [];
      const count = 35;
      const width = particleCanvas.width || 800;
      const height = particleCanvas.height || 600;

      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -0.2 - Math.random() * 0.5,
          size: 1.5 + Math.random() * 3,
          alpha: 0.15 + Math.random() * 0.45,
          symbol: Math.random() > 0.6 ? RUNIC_SYMBOLS[Math.floor(Math.random() * RUNIC_SYMBOLS.length)] : null,
          color: Math.random() > 0.5 ? 'var(--primary)' : 'var(--accent)',
        });
      }
    }
    initAmbientParticles();

    // Trigger Burst of Confetti & Sparkles
    function triggerConfettiBurst(originX, originY, count = 40, colors = ['#F59E0B', '#10B981', '#38BDF8', '#EC4899', '#A855F7', '#FBBF24']) {
      if (!particleCanvas) return;
      const rect = particleCanvas.getBoundingClientRect();
      const ox = (originX !== undefined ? originX - rect.left : particleCanvas.width / 2);
      const oy = (originY !== undefined ? originY - rect.top : particleCanvas.height / 2);

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.5 + Math.random() * 7.5;
        particles.push({
          x: ox,
          y: oy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          size: 3 + Math.random() * 6,
          alpha: 1,
          decay: 0.015 + Math.random() * 0.02,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.2,
          isConfetti: true,
          symbol: Math.random() > 0.7 ? '✦' : null,
        });
      }
    }

    if (particleCanvas) {
      particleCanvas.parentElement.addEventListener('mousemove', (e) => {
        const rect = particleCanvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        mouse.active = true;
      });
      particleCanvas.parentElement.addEventListener('mouseleave', () => {
        mouse.active = false;
      });
    }

    function animateParticles() {
      if (!pctx || !particleCanvas) return;
      pctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      const width = particleCanvas.width;
      const height = particleCanvas.height;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.isConfetti) {
          p.vy += 0.15;
          p.vx *= 0.98;
          p.alpha -= (p.decay || 0.02);
          if (p.rotation !== undefined) p.rotation += (p.rotSpeed || 0.05);

          if (p.alpha <= 0) {
            particles.splice(i, 1);
            continue;
          }

          pctx.save();
          pctx.globalAlpha = Math.max(0, p.alpha);
          pctx.translate(p.x, p.y);
          if (p.rotation) pctx.rotate(p.rotation);
          pctx.fillStyle = p.color;

          if (p.symbol) {
            pctx.font = 'bold ' + (p.size * 2.5) + 'px serif';
            pctx.fillText(p.symbol, 0, 0);
          } else {
            pctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
          }
          pctx.restore();
        } else {
          if (mouse.active) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 80) {
              const force = (80 - dist) / 80;
              p.x += (dx / dist) * force * 3;
              p.y += (dy / dist) * force * 3;
            }
          }

          if (p.y < -10) { p.y = height + 10; p.x = Math.random() * width; }
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;

          pctx.save();
          pctx.globalAlpha = p.alpha;
          pctx.fillStyle = p.color === 'var(--primary)' ? '#F59E0B' : '#38BDF8';

          if (p.symbol) {
            pctx.font = (p.size * 2) + 'px monospace';
            pctx.fillText(p.symbol, p.x, p.y);
          } else {
            pctx.beginPath();
            pctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            pctx.fill();
          }
          pctx.restore();
        }
      }

      requestAnimationFrame(animateParticles);
    }
    requestAnimationFrame(animateParticles);

    // Web Audio Synthesizer for Interactive Effects & SFX
    function playAudio(type) {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;

        if (type === 'correct' || type === 'checklist') {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(); osc.stop(now + 0.25);
        } else if (type === 'wrong') {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.exponentialRampToValueAtTime(140, now + 0.25);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(); osc.stop(now + 0.25);
        } else if (type === 'slash') {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(400, now);
          osc.frequency.exponentialRampToValueAtTime(80, now + 0.18);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(); osc.stop(now + 0.2);
        } else if (type === 'secret') {
          [440, 554, 659, 880].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.08);
            gain.gain.setValueAtTime(0.1, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.25);
          });
        } else if (type === 'victory') {
          [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
            gain.gain.setValueAtTime(0.15, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now + i * 0.1); osc.stop(now + i * 0.1 + 0.4);
          });
        } else {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.connect(gain); gain.connect(audioCtx.destination);
          osc.start(); osc.stop(now + 0.08);
        }
      } catch (e) {}
    }

    // Interactive Quiz Option Handler with Persistence
    function handleQuizAnswer(target, isCorrect, explanationEncoded) {
      const btnEl = typeof target === 'string' ? document.getElementById('opt-' + target) || document.getElementById(target) : target;
      if (!btnEl) return;
      
      const container = btnEl.closest('.quiz-widget-container') || btnEl.closest('#slide-stage') || document;
      const feedback = container.querySelector('.quiz-feedback-box') || document.getElementById('quiz-feedback');
      const explanation = decodeURIComponent(explanationEncoded || '');
      const rect = btnEl.getBoundingClientRect();
      const optId = btnEl.id ? btnEl.id.replace('opt-', '') : '';

      // xpAwarded (nao isCorrect) e sticky de proposito: um clique errado
      // depois de um acerto sobrescreve isCorrect pra false, mas nao pode
      // apagar o registro de que o XP ja foi dado - senao acerto->erro->acerto
      // premia de novo a cada volta.
      const wasAlreadyRewarded = !!savedData.quizAnswers[currentIndex]?.xpAwarded;

      // Clear previous styles on all options in this group
      container.querySelectorAll('.quiz-option-btn').forEach(btn => {
        btn.classList.remove('border-emerald-500', 'bg-emerald-950/70', 'border-rose-500', 'bg-rose-950/70', 'ring-2', 'ring-emerald-400', 'ring-rose-400', 'pop-success', 'shake-error');
        const badge = btn.querySelector('.quiz-letter-badge');
        if (badge) {
          badge.classList.remove('bg-emerald-500', 'bg-rose-500', 'text-black', 'text-white');
          badge.classList.add('bg-stone-800', 'text-stone-300');
        }
      });

      if (isCorrect) {
        playAudio('correct');
        if (!wasAlreadyRewarded) {
          totalXp += 150;
          updateXpDisplay();
          triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 35);
          spawnFloatingXp('+150 XP ✦', rect.left + rect.width / 2, rect.top, '#10B981');
          reportProgressToHost('slide:' + currentIndex + ':quiz', 150, 150);
        }

        btnEl.classList.add('border-emerald-500', 'bg-emerald-950/70', 'ring-2', 'ring-emerald-400', 'pop-success');
        const badge = btnEl.querySelector('.quiz-letter-badge');
        if (badge) {
          badge.classList.remove('bg-stone-800', 'text-stone-300');
          badge.classList.add('bg-emerald-500', 'text-black');
        }
        if (feedback) {
          feedback.classList.remove('hidden');
          feedback.style.display = 'block';
          feedback.className = 'quiz-feedback-box mt-3 p-3.5 rounded-xl text-xs bg-emerald-950/90 border border-emerald-500 text-emerald-100 shadow-lg fade-enter';
          feedback.innerHTML = '<strong class="text-emerald-300 flex items-center gap-1.5 mb-1"><span class="text-base">✓</span> Resposta Correta! (+150 XP)</strong><span class="block text-stone-200 leading-relaxed">' + explanation + '</span>';
        }

        savedData.quizAnswers[currentIndex] = { optId, isCorrect: true, explanation, xpAwarded: true };
        persistState();
      } else {
        playAudio('wrong');
        btnEl.classList.add('border-rose-500', 'bg-rose-950/70', 'ring-2', 'ring-rose-400', 'shake-error');
        const badge = btnEl.querySelector('.quiz-letter-badge');
        if (badge) {
          badge.classList.remove('bg-stone-800', 'text-stone-300');
          badge.classList.add('bg-rose-500', 'text-white');
        }
        if (feedback) {
          feedback.classList.remove('hidden');
          feedback.style.display = 'block';
          feedback.className = 'quiz-feedback-box mt-3 p-3.5 rounded-xl text-xs bg-rose-950/90 border border-rose-500 text-rose-100 shadow-lg fade-enter';
          feedback.innerHTML = '<strong class="text-rose-300 flex items-center gap-1.5 mb-1"><span class="text-base">✗</span> Quase lá (Tente outra opção):</strong><span class="block text-stone-200 leading-relaxed">' + explanation + '</span>';
        }

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
    function attackBoss(damage, attackName) {
      if (currentBossHp <= 0) return;
      playAudio('slash');
      triggerScreenShake();
      currentBossHp = Math.max(0, currentBossHp - damage);
      savedData.bossHp[currentIndex] = currentBossHp;

      const hpDisplay = document.getElementById('boss-hp-display');
      if (hpDisplay) hpDisplay.innerText = currentBossHp + ' / 1000';

      const hpBar = document.getElementById('boss-hp-bar');
      if (hpBar) hpBar.style.width = ((currentBossHp / 1000) * 100) + '%';

      const feedback = document.getElementById('boss-feedback');
      if (feedback) {
        feedback.classList.remove('hidden');
        feedback.style.display = 'block';
        if (currentBossHp === 0) {
          playAudio('victory');
          totalXp += 500;
          updateXpDisplay();
          reportProgressToHost('slide:' + currentIndex + ':boss', 500, 500);
          triggerConfettiBurst(window.innerWidth / 2, window.innerHeight / 2, 70);
          spawnFloatingXp('GUARDIÃO DERROTADO! +500 XP', window.innerWidth / 2, window.innerHeight / 2, '#10B981');
          feedback.className = 'p-3.5 rounded-xl text-xs text-center font-bold bg-emerald-950/90 border border-emerald-500 text-emerald-200 shadow-xl pop-success';
          feedback.innerHTML = '<span class="flex items-center justify-center gap-1.5"><svg class="w-4 h-4 text-amber-400 inline" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h12v6a6 6 0 0 1-6 6 6 6 0 0 1-6-6V2zm-4 4h4v2H2V6zm16 0h4v2h-4V6zM8 18h8v2H8v-2zm-2 2h12v2H6v-2z"/></svg> <span>GUARDIÃO DERROTADO COM SUCESSO! (+500 XP DE VITÓRIA)</span></span>';
          const actions = document.getElementById('boss-actions');
          if (actions) actions.style.display = 'none';
        } else {
          spawnFloatingXp('-' + damage + ' HP ⚔️', window.innerWidth / 2, window.innerHeight / 2 - 40, '#EF4444');
          triggerConfettiBurst(window.innerWidth / 2, window.innerHeight / 2 - 30, 15, ['#EF4444', '#F59E0B']);
          feedback.className = 'p-2 rounded-xl text-xs text-center font-bold bg-rose-950/80 border border-rose-500/60 text-amber-300 animate-pulse';
          feedback.innerText = attackName + ' acertou em cheio! -' + damage + ' HP!';
        }
      }
      persistState();
    }

    // Interactive Checklist Item Toggle with Persistence
    function toggleChecklistItem(target, itemId, xp) {
      const el = typeof target === 'string' ? document.getElementById('chk-' + target) || document.getElementById(target) : target;
      if (!el) return;
      const isCompleted = el.getAttribute('data-completed') === 'true';
      const statusBox = el.querySelector('.chk-status-box') || el.querySelector('.chk-num');
      const rect = el.getBoundingClientRect();
      const realItemId = itemId || (el.id ? el.id.replace('chk-', '') : '');
      
      if (isCompleted) {
        el.setAttribute('data-completed', 'false');
        savedData.checklist[realItemId] = false;
        totalXp = Math.max(0, totalXp - (xp || 50));
        el.classList.remove('border-emerald-500', 'bg-emerald-950/60', 'ring-1', 'ring-emerald-400', 'pop-success');
        el.classList.add('border-stone-800', 'bg-stone-900/70');
        if (statusBox) {
          statusBox.classList.remove('bg-emerald-500', 'text-black');
          statusBox.classList.add('bg-stone-800', 'text-stone-400');
        }
      } else {
        el.setAttribute('data-completed', 'true');
        savedData.checklist[realItemId] = true;
        totalXp += (xp || 50);
        reportProgressToHost('slide:' + currentIndex + ':checklist:' + realItemId, xp || 50, xp || 50);
        playAudio('checklist');
        triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 20);
        spawnFloatingXp('+' + (xp || 50) + ' XP ✦', rect.left + rect.width / 2, rect.top, '#10B981');
        
        el.classList.remove('border-stone-800', 'bg-stone-900/70');
        el.classList.add('border-emerald-500', 'bg-emerald-950/60', 'ring-1', 'ring-emerald-400', 'pop-success');
        if (statusBox) {
          statusBox.classList.remove('bg-stone-800', 'text-stone-400');
          statusBox.classList.add('bg-emerald-500', 'text-black');
        }
      }
      updateXpDisplay();
    }

    // Interactive Key Takeaway Mastery Toggle with Persistence
    function toggleTakeawayMastery(target, keyId, xp) {
      const el = typeof target === 'string' ? document.getElementById('takeaway-' + target) || document.getElementById(target) : target;
      if (!el) return;
      const isMastered = el.getAttribute('data-mastered') === 'true';
      const statusBox = el.querySelector('.takeaway-status-box') || el.querySelector('.takeaway-num');
      const rect = el.getBoundingClientRect();
      const realKeyId = keyId || (el.id ? el.id.replace('takeaway-', '') : '');

      if (isMastered) {
        el.setAttribute('data-mastered', 'false');
        savedData.takeaways[realKeyId] = false;
        totalXp = Math.max(0, totalXp - (xp || 75));
        el.classList.remove('border-amber-400', 'bg-amber-950/60', 'ring-1', 'ring-amber-400', 'pop-success');
        el.classList.add('border-stone-800', 'bg-stone-900/70');
        if (statusBox) {
          statusBox.classList.remove('bg-amber-400', 'text-black');
          statusBox.classList.add('bg-stone-800', 'text-stone-400');
        }
      } else {
        el.setAttribute('data-mastered', 'true');
        savedData.takeaways[realKeyId] = true;
        totalXp += (xp || 75);
        reportProgressToHost('slide:' + currentIndex + ':takeaway:' + realKeyId, xp || 75, xp || 75);
        playAudio('correct');
        triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 25, ['#F59E0B', '#FBBF24', '#10B981']);
        spawnFloatingXp('+' + (xp || 75) + ' XP ✦ Dominado!', rect.left + rect.width / 2, rect.top, '#F59E0B');

        el.classList.remove('border-stone-800', 'bg-stone-900/70');
        el.classList.add('border-amber-400', 'bg-amber-950/60', 'ring-1', 'ring-amber-400', 'pop-success');
        if (statusBox) {
          statusBox.classList.remove('bg-stone-800', 'text-stone-400');
          statusBox.classList.add('bg-amber-400', 'text-black');
        }
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
          status.className = 'unique-interaction-status min-w-0 text-[10px] text-amber-300 break-words';
        }
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
        triggerConfettiBurst(rect.left + rect.width / 2, rect.top, 30);
        spawnFloatingXp('+' + earnedXp + ' XP âœ¦', rect.left + rect.width / 2, rect.top, '#F59E0B');
      }

      persistState();
      updateXpDisplay();
      if (status) {
        status.textContent = firstCompletion ? 'Resposta salva e XP conquistado.' : 'Resposta atualizada.';
        status.className = 'unique-interaction-status min-w-0 text-[10px] text-emerald-300 break-words';
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

      savedData.decisions[currentIndex] = { choiceId, xpReward, outcome: decodeURIComponent(outcomeEncoded || '') };
      persistState();

      const cardEl = typeof target === 'string' ? document.getElementById('decision-' + target) || document.getElementById(target) : target;
      if (cardEl) {
        const rect = cardEl.getBoundingClientRect();
        if (!wasAlreadyChosen) {
          triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 25);
          spawnFloatingXp('+' + (xpReward || 100) + ' XP ✦', rect.left + rect.width / 2, rect.top, '#F59E0B');
        }

        const container = cardEl.closest('.decision-widget-container') || document;
        container.querySelectorAll('.decision-card-btn').forEach(btn => {
          btn.classList.remove('border-amber-400', 'bg-amber-950/50', 'ring-1', 'ring-amber-400');
          const oc = btn.querySelector('.decision-outcome-box');
          if (oc) oc.classList.add('hidden');
        });

        cardEl.classList.add('border-amber-400', 'bg-amber-950/50', 'ring-1', 'ring-amber-400', 'pop-success');
        const outcomeDiv = cardEl.querySelector('.decision-outcome-box') || document.getElementById('decision-outcome-' + choiceId);
        if (outcomeDiv) {
          outcomeDiv.classList.remove('hidden');
          outcomeDiv.style.display = 'block';
          outcomeDiv.className = 'decision-outcome-box mt-2.5 pt-2 border-t border-amber-500/30 text-[11px] text-amber-200 font-medium fade-enter';
          outcomeDiv.innerHTML = '<span class="font-bold text-amber-400">✦ Consequência:</span> ' + decodeURIComponent(outcomeEncoded || '');
        }
      }
    }

    // Interactive Secret Lore Reveal with Persistence
    function revealSecretLore(target, revealedContentEncoded) {
      playAudio('secret');
      const wasRevealed = !!savedData.secrets[currentIndex];
      if (!wasRevealed) {
        totalXp += 100;
        updateXpDisplay();
        reportProgressToHost('slide:' + currentIndex + ':secret', 100, 100);
        savedData.secrets[currentIndex] = true;
        persistState();
      }

      const btnEl = typeof target === 'string' ? document.getElementById('btn-reveal-secret') : target;
      const rect = btnEl ? btnEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
      if (!wasRevealed) {
        triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 35, ['#F59E0B', '#FBBF24', '#F43F5E']);
        spawnFloatingXp('+100 XP ✦', rect.left + rect.width / 2, rect.top, '#F59E0B');
      }

      if (btnEl) btnEl.style.display = 'none';

      const container = btnEl ? btnEl.parentElement : document;
      const content = container.querySelector('.secret-revealed-content') || document.getElementById('secret-revealed-content');
      if (content) {
        content.classList.remove('hidden');
        content.style.display = 'block';
        content.className = 'secret-revealed-content text-left space-y-1.5 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 mt-2 pop-success';
        content.innerHTML = '<strong class="text-amber-300 block mb-1">✦ Segredo Revelado (+100 XP):</strong><p class="italic text-stone-200">' + decodeURIComponent(revealedContentEncoded || '') + '</p>';
      }
    }

    // Toggle Speech Narration
    function toggleNarration() {
      if (!('speechSynthesis' in window)) {
        alert('Seu navegador não suporta síntese de voz.');
        return;
      }
      if (isNarrating) {
        window.speechSynthesis.cancel();
        isNarrating = false;
        document.getElementById('narration-label').innerText = 'Narrar';
        return;
      }

      const s = deck.slides[currentIndex];
      let textToRead = s.title + '. ';
      if (s.subtitle) textToRead += s.subtitle + '. ';
      if (s.characterGuide) textToRead += s.characterGuide.name + ' diz: ' + s.characterGuide.speechText + '. ';
      if (s.narrativeText) textToRead += s.narrativeText + '. ';
      if (s.contentParagraphs) textToRead += s.contentParagraphs.join(' ');

      const utterance = new SpeechSynthesisUtterance(textToRead);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.05;
      utterance.onend = () => {
        isNarrating = false;
        document.getElementById('narration-label').innerText = 'Narrar';
      };
      utterance.onerror = () => {
        isNarrating = false;
        document.getElementById('narration-label').innerText = 'Narrar';
      };

      window.speechSynthesis.speak(utterance);
      isNarrating = true;
      document.getElementById('narration-label').innerText = 'Pausar';
    }

    function toggleViewportMode() {
      const wrapper = document.getElementById('deck-wrapper');
      isPortrait = !isPortrait;
      if (isPortrait) {
        wrapper.classList.add('mode-portrait');
        document.getElementById('viewport-label').innerText = '9:16';
      } else {
        wrapper.classList.remove('mode-portrait');
        document.getElementById('viewport-label').innerText = '16:9';
      }
      resizeCanvas();
    }

    function toggleFullscreen() {
      const wrapper = document.getElementById('deck-wrapper');
      wrapper.classList.toggle('mode-fullscreen');
      setTimeout(resizeCanvas, 100);
    }

    // Render Atmospheric Vector Backdrops (defined by content & profile)
    function renderBackgroundScene() {
      const bgContainer = document.getElementById('bg-scene-container');
      const prof = String(deck.targetProfile || '').toLowerCase();
      const arch = currentArchetype;

      if (arch === 'medieval-rpg' || prof.includes('achiever') || prof.includes('mastermind') || prof.includes('conqueror') || prof.includes('seeker') || prof.includes('survivor') || prof.includes('daredevil') || prof.includes('socializer')) {
        bgContainer.innerHTML = \`
          <div class="absolute inset-0 bg-gradient-to-b from-[#160B24] via-[#0E0617] to-[#06020A] opacity-95"></div>
          <div class="absolute -top-10 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20" style="background-color: var(--primary);"></div>
          <div class="absolute bottom-0 right-1/4 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-15" style="background-color: var(--accent);"></div>
          <svg viewBox="0 0 1000 200" class="absolute top-0 left-0 right-0 w-full h-20 text-white/5 pointer-events-none" preserveAspectRatio="none">
            <path d="M0 0 L100 60 L200 0 L300 60 L400 0 L500 60 L600 0 L700 60 L800 0 L900 60 L1000 0 L1000 0 L0 0 Z" fill="currentColor"/>
          </svg>
          <div class="absolute bottom-2 left-6 font-mono text-[9px] text-white/20 tracking-wider">TRAILUP • MEDIEVAL BRAINHEX HERITAGE</div>
        \`;
      } else if (arch === 'indian-heritage') {
        bgContainer.innerHTML = \`
          <div class="absolute inset-0 bg-gradient-to-b from-[#EA580C] via-[#C2410C] to-[#431407] opacity-95"></div>
          <svg viewBox="0 0 1000 160" class="absolute top-0 left-0 right-0 w-full h-24 text-amber-300/20" preserveAspectRatio="none">
            <path d="M0 60 Q120 10 250 50 Q380 90 520 40 Q680 10 820 60 Q940 90 1000 50 L1000 0 L0 0 Z" fill="currentColor" />
          </svg>
          <div class="absolute bottom-0 left-0 right-0 h-36 opacity-85">
            <svg viewBox="0 0 1200 240" class="w-full h-full" preserveAspectRatio="none">
              <path d="M0 240 L0 180 L40 180 L40 130 Q50 90 60 130 L60 180 L140 180 Q190 120 240 180 L320 180 L320 110 Q340 70 360 110 L360 180 L480 180 Q560 60 640 180 L760 180 L760 110 Q780 70 800 110 L800 180 L880 180 Q930 120 980 180 L1060 180 L1060 130 Q1070 90 1080 130 L1080 180 L1200 180 L1200 240 Z" fill="#7C2D12" />
            </svg>
          </div>
        \`;
      } else if (arch === 'islamic-ramadan') {
        bgContainer.innerHTML = \`
          <div class="absolute inset-0 bg-gradient-to-b from-[#042F2E] via-[#0F766E] to-[#021817] opacity-95"></div>
          <div class="absolute top-2 right-6 w-40 h-40 opacity-90">
            <svg viewBox="0 0 200 200" class="w-full h-full">
              <path d="M100 20 C144 20 180 56 180 100 C180 144 144 180 100 180 C130 160 145 130 145 100 C145 70 130 40 100 20 Z" fill="#F59E0B" />
            </svg>
          </div>
        \`;
      } else if (arch === 'nature-eco') {
        bgContainer.innerHTML = \`
          <div class="absolute inset-0 bg-gradient-to-b from-[#2E1065] via-[#1E1B4B] to-[#0F172A] opacity-95"></div>
          <div class="absolute bottom-0 left-0 right-0 h-20 opacity-40">
            <svg viewBox="0 0 600 100" class="w-full h-full" preserveAspectRatio="none">
              <path d="M0 60 Q150 20 300 50 T600 40 L600 100 L0 100 Z" fill="#10B981" />
            </svg>
          </div>
        \`;
      } else if (arch === 'cyber-tech') {
        bgContainer.innerHTML = \`
          <div class="absolute inset-0 bg-gradient-to-b from-[#022C22] via-[#041E19] to-[#01100D] opacity-95"></div>
          <div class="absolute bottom-3 left-6 font-mono text-[9px] text-cyan-400/60">SYS // 0x48A2 • NEURAL NETWORK v1.3</div>
        \`;
      } else {
        bgContainer.innerHTML = \`
          <div class="absolute inset-0 bg-gradient-to-b from-[#180B2E] via-[#0F071D] to-[#080310] opacity-95"></div>
          <div class="absolute top-1/4 left-1/4 w-72 h-72 rounded-full bg-purple-600/10 blur-3xl pointer-events-none"></div>
        \`;
      }
    }

    function renderDots() {
      const dots = document.getElementById('slide-dots');
      dots.innerHTML = deck.slides.map((_, i) => \`
        <button
          onclick="goToSlide(\${i})"
          class="slide-dot-hit w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
          title="Slide \${i + 1}"
          aria-label="Ir para o slide \${i + 1}"
          aria-current="\${i === currentIndex ? 'true' : 'false'}"
        >
          <span class="h-2.5 rounded-full transition-all \${i === currentIndex ? 'w-6 bg-amber-400' : 'w-2.5 bg-stone-700'}"></span>
        </button>
      \`).join('');

      const activeDot = dots.querySelector('[aria-current="true"]');
      if (activeDot) {
        requestAnimationFrame(() => activeDot.scrollIntoView({ block: 'nearest', inline: 'center' }));
      }
    }

    window.__SLIDES__ = [
      ${deck.slides.map((sl, i) => JSON.stringify(generateThemedSlideHtml(sl, deck, i, activeArchetype))).join(',\n      ')}
    ];

    // Restore interactive visual state on the rendered slide
    function restoreSlideInteractions() {
      const stage = document.getElementById('slide-stage');
      if (!stage) return;

      // 1. Restore Quiz State if previously answered
      const quizAnswer = savedData.quizAnswers[currentIndex];
      if (quizAnswer) {
        const btn = stage.querySelector('#opt-' + quizAnswer.optId) || (quizAnswer.optId ? document.getElementById(quizAnswer.optId) : null);
        if (btn) {
          if (quizAnswer.isCorrect) {
            btn.classList.add('border-emerald-500', 'bg-emerald-950/70', 'ring-2', 'ring-emerald-400');
            const badge = btn.querySelector('.quiz-letter-badge');
            if (badge) {
              badge.classList.remove('bg-stone-800', 'text-stone-300');
              badge.classList.add('bg-emerald-500', 'text-black');
            }
          } else {
            btn.classList.add('border-rose-500', 'bg-rose-950/70', 'ring-2', 'ring-rose-400');
            const badge = btn.querySelector('.quiz-letter-badge');
            if (badge) {
              badge.classList.remove('bg-stone-800', 'text-stone-300');
              badge.classList.add('bg-rose-500', 'text-white');
            }
          }
        }
        const feedback = stage.querySelector('.quiz-feedback-box') || document.getElementById('quiz-feedback');
        if (feedback && quizAnswer.explanation) {
          feedback.classList.remove('hidden');
          feedback.style.display = 'block';
          if (quizAnswer.isCorrect) {
            feedback.className = 'quiz-feedback-box mt-3 p-3.5 rounded-xl text-xs bg-emerald-950/90 border border-emerald-500 text-emerald-100 shadow-lg';
            feedback.innerHTML = '<strong class="text-emerald-300 flex items-center gap-1.5 mb-1"><span class="text-base">✓</span> Resposta Correta! (+150 XP)</strong><span class="block text-stone-200 leading-relaxed">' + quizAnswer.explanation + '</span>';
          } else {
            feedback.className = 'quiz-feedback-box mt-3 p-3.5 rounded-xl text-xs bg-rose-950/90 border border-rose-500 text-rose-100 shadow-lg';
            feedback.innerHTML = '<strong class="text-rose-300 flex items-center gap-1.5 mb-1"><span class="text-base">✗</span> Quase lá (Tente outra opção):</strong><span class="block text-stone-200 leading-relaxed">' + quizAnswer.explanation + '</span>';
          }
        }
      }

      // 2. Restore Checklist States
      stage.querySelectorAll('[id^="chk-"]').forEach(el => {
        const id = el.id.replace('chk-', '');
        if (savedData.checklist[id]) {
          el.setAttribute('data-completed', 'true');
          el.classList.remove('border-stone-800', 'bg-stone-900/70');
          el.classList.add('border-emerald-500', 'bg-emerald-950/60', 'ring-1', 'ring-emerald-400');
          const statusBox = el.querySelector('.chk-status-box') || el.querySelector('.chk-num');
          if (statusBox) {
            statusBox.classList.remove('bg-stone-800', 'text-stone-400');
            statusBox.classList.add('bg-emerald-500', 'text-black');
          }
        }
      });

      // 3. Restore Takeaway Mastery States
      stage.querySelectorAll('[id^="takeaway-"]').forEach(el => {
        const id = el.id.replace('takeaway-', '');
        if (savedData.takeaways && savedData.takeaways[id]) {
          el.setAttribute('data-mastered', 'true');
          el.classList.remove('border-stone-800', 'bg-stone-900/70');
          el.classList.add('border-amber-400', 'bg-amber-950/60', 'ring-1', 'ring-amber-400');
          const statusBox = el.querySelector('.takeaway-status-box') || el.querySelector('.takeaway-num');
          if (statusBox) {
            statusBox.classList.remove('bg-stone-800', 'text-stone-400');
            statusBox.classList.add('bg-amber-400', 'text-black');
          }
        }
      });

      // 4. Restore Decision Choices
      const decision = savedData.decisions[currentIndex];
      if (decision && decision.choiceId) {
        const cardEl = stage.querySelector('#decision-' + decision.choiceId);
        if (cardEl) {
          cardEl.classList.add('border-amber-400', 'bg-amber-950/50', 'ring-1', 'ring-amber-400');
          const outcomeDiv = cardEl.querySelector('.decision-outcome-box');
          if (outcomeDiv) {
            outcomeDiv.classList.remove('hidden');
            outcomeDiv.style.display = 'block';
            outcomeDiv.className = 'decision-outcome-box mt-2.5 pt-2 border-t border-amber-500/30 text-[11px] text-amber-200 font-medium';
            outcomeDiv.innerHTML = '<span class="font-bold text-amber-400">✦ Consequência:</span> ' + decision.outcome;
          }
        }
      }

      // 4. Restore Secret Lore
      if (savedData.secrets[currentIndex]) {
        const btn = stage.querySelector('#btn-reveal-secret');
        if (btn) btn.style.display = 'none';
        const content = stage.querySelector('.secret-revealed-content');
        if (content) {
          content.classList.remove('hidden');
          content.style.display = 'block';
        }
      }

      // 5. Restore Boss Battle State
      if (savedData.bossHp[currentIndex] !== undefined) {
        currentBossHp = savedData.bossHp[currentIndex];
        const hpDisplay = stage.querySelector('#boss-hp-display');
        if (hpDisplay) hpDisplay.innerText = currentBossHp + ' / 1000';
        const hpBar = stage.querySelector('#boss-hp-bar');
        if (hpBar) hpBar.style.width = ((currentBossHp / 1000) * 100) + '%';
        if (currentBossHp === 0) {
          const feedback = stage.querySelector('#boss-feedback');
          if (feedback) {
            feedback.classList.remove('hidden');
            feedback.style.display = 'block';
            feedback.className = 'p-3.5 rounded-xl text-xs text-center font-bold bg-emerald-950/90 border border-emerald-500 text-emerald-200 shadow-xl';
            feedback.innerHTML = '<span class="flex items-center justify-center gap-1.5"><svg class="w-4 h-4 text-amber-400 inline" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h12v6a6 6 0 0 1-6 6 6 6 0 0 1-6-6V2zm-4 4h4v2H2V6zm16 0h4v2h-4V6zM8 18h8v2H8v-2zm-2 2h12v2H6v-2z"/></svg> <span>GUARDIÃO DERROTADO! (+500 XP DE VITÓRIA)</span></span>';
          }
          const actions = stage.querySelector('#boss-actions');
          if (actions) actions.style.display = 'none';
        }
      }

      // 6. Restore free-form unique interaction state
      const uniqueInteraction = savedData.uniqueInteractions?.[currentIndex];
      if (uniqueInteraction) {
        const input = stage.querySelector('#unique-note-' + currentIndex);
        if (input) input.value = uniqueInteraction.note || '';
        const status = stage.querySelector('#unique-status-' + currentIndex);
        if (status && uniqueInteraction.completed) {
          status.textContent = 'Resposta salva.';
          status.className = 'unique-interaction-status min-w-0 text-[10px] text-emerald-300 break-words';
        }
      }

    }

    function updateSlideIndicator() {
      const indicator = document.getElementById('slide-indicator');
      if (!indicator) return;
      const prefix = window.matchMedia('(max-width: 480px)').matches ? '' : 'Slide ';
      indicator.innerText = \`\${prefix}\${currentIndex + 1} / \${deck.slides.length}\`;
    }

    function renderSlide() {
      const stage = document.getElementById('slide-stage');
      if (stage) {
        stage.classList.remove('slide-enter-next', 'slide-enter-prev', 'fade-enter');
        void stage.offsetWidth;
        const animClass = slideDirection === 'prev' ? 'slide-enter-prev' : 'slide-enter-next';
        stage.classList.add(animClass);
      }

      if (isNarrating) {
        window.speechSynthesis.cancel();
        isNarrating = false;
        const narrLabel = document.getElementById('narration-label');
        if (narrLabel) narrLabel.innerText = 'Narrar';
      }

      updateSlideIndicator();
      
      const xpCounter = document.getElementById('xp-counter');
      if (xpCounter) xpCounter.innerText = totalXp;

      const btnPrev = document.getElementById('btn-prev');
      if (btnPrev) btnPrev.disabled = currentIndex === 0;

      const btnNext = document.getElementById('btn-next');
      if (btnNext) btnNext.innerText = currentIndex === deck.slides.length - 1 ? 'Concluir' : 'Próximo ❯';

      if (stage && window.__SLIDES__) {
        stage.innerHTML = window.__SLIDES__[currentIndex] || '';
        stage.scrollTop = 0;
        restoreSlideInteractions();
      }
      renderDots();
    }

    function nextSlide() {
      if (currentIndex < deck.slides.length - 1) {
        slideDirection = 'next';
        currentIndex++;
        playAudio('click');
        renderSlide();
      }
    }

    function prevSlide() {
      if (currentIndex > 0) {
        slideDirection = 'prev';
        currentIndex--;
        playAudio('prev');
        renderSlide();
      }
    }

    function goToSlide(idx) {
      if (idx >= 0 && idx < deck.slides.length) {
        slideDirection = idx < currentIndex ? 'prev' : 'next';
        currentIndex = idx;
        playAudio('click');
        renderSlide();
      }
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') nextSlide();
      if (e.key === 'ArrowLeft') prevSlide();
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'm' || e.key === 'M') toggleNarration();
    });

    // Touch Swipe Support for Mobile Decks
    let touchStartX = 0;
    let touchStartY = 0;
    let touchSwipeBlocked = false;
    const deckWrapper = document.getElementById('deck-wrapper');
    if (deckWrapper) {
      deckWrapper.addEventListener('touchstart', (e) => {
        const target = e.target instanceof Element ? e.target : null;
        touchSwipeBlocked = !!target?.closest('#slide-dots, .overflow-x-auto, pre, code, button, input, textarea, select, a, [role="button"]');
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
          // Only trigger if horizontal swipe is dominant and > 50px
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
    // anotacao/reflexao) quando o aluno que esta vendo o deck prefere um
    // modoOperacao diferente de "Misto" - decidido no lado do TrailUp/mobile
    // (que e dono do enum modoOperacao) e passado aqui so como flags booleanos
    // na URL, ja que este deck e compartilhado entre todos os alunos do mesmo
    // perfil e nao pode ser regenerado por aluno. Roda uma unica vez no
    // carregamento (o script fica no fim do <body>, entao o DOM ja esta todo
    // presente - nenhum slide e criado dinamicamente via JS, so a navegacao
    // entre eles e feita depois por renderSlide()).
    function applyContentVisibilityFromQuery() {
      const params = new URLSearchParams(window.location.search);
      const targets = [
        { param: 'hideQuiz', selector: '.quiz-widget-container' },
        { param: 'hideChecklist', selector: '.checklist-widget-container' },
        { param: 'hideNotes', selector: '.unique-interactive-widget' },
      ];

      targets.forEach(({ param, selector }) => {
        if (params.get(param) !== '1') return;

        document.querySelectorAll(selector).forEach((widgetEl) => {
          const rightColumn = widgetEl.closest('.lg\\\\:col-span-7');
          widgetEl.remove();
          // O widget era o unico conteudo da coluna direita (sem imagem de
          // referencia nesse slide) - remove a coluna vazia e expande a
          // coluna de texto pra largura cheia, senao reintroduz o mesmo bug
          // de espaco desperdicado corrigido no PR de correcoes visuais.
          // Estilo inline (nao classe Tailwind nova) pra nao depender do
          // MutationObserver do Play CDN reprocessar a classe depois do load.
          if (rightColumn && rightColumn.children.length === 0) {
            const grid = rightColumn.parentElement;
            rightColumn.remove();
            const leftColumn = grid ? grid.querySelector('.lg\\\\:col-span-5') : null;
            if (leftColumn) leftColumn.style.gridColumn = '1 / -1';
          }
        });
      });
    }

    applyContentVisibilityFromQuery();
    renderBackgroundScene();
    renderSlide();
  </script>
</body>
</html>`;
}

/**
 * Generate High-Fidelity Themed HTML page specifically for PDF rendering
 */
export function generatePdfPageHtml(
  slide: SlideData,
  deck: DeckData,
  idx: number,
  orientation: 'landscape' | 'portrait' = 'landscape'
): string {
  const theme = deck.themeConfig;
  const activeArchetype = deck.visualThematicArchetype || theme.archetype || 'medieval-rpg';
  const bgHtml = generateBackgroundSceneSvgHtml(activeArchetype, deck.targetProfile, theme);
  const slideContentHtml = generateThemedSlideHtml(slide, deck, idx, activeArchetype);

  const minHeight = orientation === 'landscape' ? '630px' : '1120px';
  const width = orientation === 'landscape' ? '1120px' : '794px';

  return `
    <div style="width: ${width}; min-height: ${minHeight}; position: relative; overflow: hidden; box-sizing: border-box; page-break-after: always; display: flex; flex-direction: column; justify-content: space-between; background-color: ${theme.palette.background}; color: #FFFFFF; font-family: 'Plus Jakarta Sans', sans-serif;">
      <!-- Atmospheric Backdrop -->
      <div style="position: absolute; inset: 0; pointer-events: none; z-index: 0;">
        ${bgHtml}
      </div>

      <!-- Top Header Bar (Clean) -->
      <div style="position: relative; z-index: 10; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); background-color: rgba(10,6,18,0.6); padding: 10px 24px;">
        <span style="color: #E2E8F0; font-size: 12px; font-weight: 600; font-family: 'Cinzel', serif;">
          ${deck.title}
        </span>
        <span style="color: #94A3B8; font-size: 11px; font-family: 'JetBrains Mono', monospace;">
          Slide ${idx + 1} / ${deck.slides.length}
        </span>
      </div>

      <!-- Main Slide Content Stage -->
      <div style="position: relative; z-index: 10; flex: 1; padding: 24px 36px; display: flex; flex-direction: column; justify-content: center;">
        ${slideContentHtml}
      </div>
    </div>
  `;
}
