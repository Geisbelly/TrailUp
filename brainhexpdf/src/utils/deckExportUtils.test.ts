import assert from 'node:assert/strict';
import test from 'node:test';

import { BRAIN_HEX_PROFILES } from '../data/brainHexProfiles';
import type { DeckData } from '../types';
import { generateInteractiveHtml } from './deckExportUtils';

const minimalDeck: DeckData = {
  id: 'deck-export-layout-test',
  title: 'Apresentação de teste',
  subtitle: 'Teste de regressão do layout exportado',
  subject: 'Testes',
  targetProfile: 'Survivor',
  rankLevel: 'Guardião',
  slides: [
    {
      id: 'slide-1',
      type: 'cover',
      title: 'Conteúdo alto deve começar no topo',
      contentParagraphs: ['Conteúdo de teste.'],
      layout: 'full-banner',
    },
  ],
  themeConfig: BRAIN_HEX_PROFILES.Survivor,
  createdAt: '2026-08-19',
  author: 'TrailUp',
  estimatedMinutes: 1,
  tags: ['teste'],
};

test('HTML exportado não centraliza verticalmente o contêiner rolável de slides', () => {
  const html = generateInteractiveHtml(minimalDeck);
  const stageTag = html.match(/<main id="slide-stage"[^>]*>/)?.[0];

  assert.ok(stageTag, 'esperava encontrar o contêiner #slide-stage');
  assert.match(stageTag, /\bjustify-start\b/);
  assert.doesNotMatch(stageTag, /\bsm:justify-center\b/);
  assert.match(html, /#slide-stage > \* \{\s*flex-shrink: 0;/);
});

test('HTML exportado não renderiza mais o badge de ambiente (colapsava para "R…" sob pressão de espaço)', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        thematicStorytelling: {
          storyArcPhase: 'Fase de teste',
          environmentSetting: 'Descrição de ambiente deliberadamente extensa para validar que não aparece mais como badge truncado.',
          voiceTone: 'Objetivo',
          narrativeBeat: 'Narrativa de teste.',
        },
        characterGuide: {
          name: 'Mentor',
          speechText: 'Esta fala precisa continuar aparecendo normalmente.',
          analogy: 'Uma analogia de teste',
        },
      },
    ],
  });

  assert.doesNotMatch(html, /immersion-environment/);
  assert.match(html, /Esta fala precisa continuar aparecendo normalmente\./);
});

test('HTML exportado não renderiza mais o badge "💡 Analogia" (so mostrava a analogia num tooltip invisivel)', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        characterGuide: {
          name: 'Mentor',
          speechText: 'Fala do mentor.',
          analogy: 'Uma analogia de teste',
        },
      },
    ],
  });

  // deck e serializado inteiro num <script> pra uso client-side (presenter
  // notes, narracao, etc.) - o campo characterGuide.analogy continua ali,
  // so o BADGE visual (span com o emoji) e que precisa sumir.
  assert.doesNotMatch(html, /💡 Analogia/);
  assert.doesNotMatch(html, /Right: Analogy Badge/);
  assert.match(html, /Fala do mentor\./);
});

test('badge "OBJ:" trunca com reticências em vez de cortar a palavra crua', () => {
  const objetivoLongo = 'Compreender o fluxo completo de resolução recursiva de um nome de domínio, do resolvedor local até o servidor autoritativo final';
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        pedagogicalObjective: objetivoLongo,
      },
    ],
  });

  assert.match(html, /class=\\"truncate min-w-0\\"/);
  assert.match(html, /class=\\"inline-flex items-center gap-1[^"]*min-w-0\\"/);
  assert.doesNotMatch(html, /class=\\"inline-flex items-center gap-1[^"]*truncate max-w-\[280px\]\\"/);
});

test('deck-container usa altura FIXA por modo/breakpoint, nao piso+teto guiado por conteudo (evita esticar/encolher entre slides)', () => {
  const html = generateInteractiveHtml(minimalDeck);

  assert.doesNotMatch(html, /\.deck-container \{[^}]*aspect-ratio/);
  assert.doesNotMatch(html, /\.deck-container \{[^}]*min-height/);
  assert.match(html, /\.deck-container \{[^}]*height: 94vh;/);
  assert.doesNotMatch(html, /\.deck-container\.mode-portrait \{[^}]*aspect-ratio/);
  assert.doesNotMatch(html, /\.deck-container\.mode-portrait \{[^}]*min-height/);
  assert.match(html, /\.deck-container\.mode-portrait \{[^}]*height: 94vh;/);
  assert.match(html, /@media \(max-width: 768px\)[\s\S]*?\.deck-container \{[^}]*\n\s*height: calc/);
  assert.doesNotMatch(html, /@media \(max-width: 768px\)[\s\S]*?\.deck-container \{[^}]*min-height/);
});

test('divisor SVG isola o ornamento num SVG proprio (w-auto), so as linhas esticam (none)', () => {
  const html = generateInteractiveHtml(minimalDeck);

  // ornamento com viewport proprio, nao esmagado pelo esticamento das linhas
  assert.match(html, /class=\\"h-full w-auto shrink-0\\"/);
  // linhas dos lados podem esticar livre - nao tem forma pra distorcer
  assert.match(html, /preserveAspectRatio=\\"none\\"/);
  // wrapper do divisor no header do slide de capa (deckExportUtils.ts:619)
  assert.match(html, /class=\\"w-full h-3 sm:h-4 my-1 flex items-center justify-center overflow-hidden opacity-85\\"/);
});

test('mantém controles e navegação utilizáveis em telas móveis', () => {
  const html = generateInteractiveHtml(minimalDeck);

  assert.match(html, /height: 100dvh;/);
  assert.match(html, /\.deck-controls \.deck-viewport-toggle \{\s*display: none !important;/);
  assert.match(html, /class="slide-dot-hit w-7 h-7/);
  assert.match(html, /touchSwipeBlocked/);
  assert.match(html, /target\?\.closest\('#slide-dots, \.overflow-x-auto/);
});

test('adapta quizOptions do interactiveElement quando o quiz legado não possui alternativas', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'interactive_challenge',
        quiz: { question: 'Qual alternativa está correta?' } as any,
        interactiveElement: {
          id: 'quiz-atual',
          type: 'mini_quiz',
          title: 'Quiz atual',
          prompt: 'Escolha uma opção.',
          xpReward: 150,
          quizOptions: [
            { id: 'a', text: 'Alternativa correta', isCorrect: true, explanation: 'Correto.' },
            { id: 'b', text: 'Alternativa incorreta', isCorrect: false, explanation: 'Tente novamente.' },
          ],
        },
      },
    ],
  });

  assert.match(html, /Alternativa correta/);
  assert.match(html, /Alternativa incorreta/);
  assert.equal((html.match(/class=\\"quiz-option-btn/g) || []).length, 2);
});

test('renderiza a imagem de referencia real e forca layout de 2 colunas mesmo sem widget interativo', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        subtopic: 'Arquitetura de Filas',
        referenceImageDataUri: 'data:image/png;base64,AAAA',
      },
    ],
  });

  assert.match(html, /<img src=\\"data:image\/png;base64,AAAA\\"/);
  assert.match(html, /lg:col-span-7/);
  // Legenda deixou de ser um rodape generico ("Fonte: material de
  // referencia") e passa a nomear o que a imagem ilustra.
  assert.match(html, /Arquitetura de Filas/);
  assert.doesNotMatch(html, /Fonte: material de refer\u00eancia/);
  // Legenda nao usa emoji (pedido explicito do usuario)
  assert.doesNotMatch(html, /\u{1F5BC}/u);
});

test('slide com additionalReferenceImageDataUris: renderiza todas as imagens num grid, nao so a primaria', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        subtopic: 'Arquitetura de Filas',
        referenceImageDataUri: 'data:image/png;base64,AAAA',
        additionalReferenceImageDataUris: ['data:image/png;base64,BBBB', 'data:image/png;base64,CCCC'],
      } as any,
    ],
  });

  assert.match(html, /<img src=\\"data:image\/png;base64,AAAA\\"/);
  assert.match(html, /<img src=\\"data:image\/png;base64,BBBB\\"/);
  assert.match(html, /<img src=\\"data:image\/png;base64,CCCC\\"/);
  assert.match(html, /grid grid-cols-2/);
});

test('slide so com imagem primaria (sem additionalReferenceImageDataUris): nao usa o grid, imagem unica grande como antes', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        subtopic: 'Arquitetura de Filas',
        referenceImageDataUri: 'data:image/png;base64,AAAA',
      },
    ],
  });

  assert.match(html, /<img src=\\"data:image\/png;base64,AAAA\\" alt=\\"Arquitetura de Filas\\" class=\\"w-full max-h-56 sm:max-h-80 object-contain rounded\\"/);
  assert.doesNotMatch(html, /grid grid-cols-2/);
});

test('layout de 2 colunas (com widget/imagem na direita): paragrafo do lado esquerdo usa fonte legivel, nao mais minuscula', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        contentParagraphs: ['Par\u00e1grafo curto ao lado de um widget.'],
        keyTakeaways: ['Conceito principal deste slide'],
      },
    ],
  });

  assert.match(html, /class=\\"text-xs sm:text-sm leading-relaxed text-stone-200 font-normal break-words\\"/);
  assert.doesNotMatch(html, /class=\\"text-\[11px\] sm:text-xs leading-relaxed text-stone-200 font-normal break-words\\"/);
});

test('slide reflection_checkpoint renderiza as perguntas guia sem os demais componentes ricos', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        id: 'checkpoint-1',
        type: 'reflection_checkpoint',
        title: 'Ponto de Reflexão',
        contentParagraphs: [],
        layout: 'monumental-card',
        guidingQuestions: ['O que você aprendeu sobre: Filas assíncronas', 'O que você aprendeu sobre: Idempotência'],
      },
    ],
  });

  assert.match(html, /PONTO DE REFLEX\u00c3O/);
  assert.match(html, /O que voc\u00ea aprendeu sobre: Filas ass\u00edncronas/);
  assert.match(html, /O que voc\u00ea aprendeu sobre: Idempot\u00eancia/);
});

test('slide pre_conclusion_reflection renderiza titulo e o widget interativo centralizado, sem colunas', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        id: 'reflexao-final',
        type: 'pre_conclusion_reflection',
        title: 'Antes de Concluir...',
        contentParagraphs: [],
        layout: 'monumental-card',
        interactiveElement: {
          id: 'acao-final',
          type: 'reflection_point',
          title: 'Reflex\u00e3o Aplicada',
          prompt: 'Como voc\u00ea aplicaria isso no seu dia a dia?',
          xpReward: 50,
        },
      },
    ],
  });

  assert.match(html, /Antes de Concluir\.\.\./);
  assert.match(html, /Reflex\u00e3o Aplicada/);
  assert.match(html, /Como voc\u00ea aplicaria isso no seu dia a dia\?/);
});

test('exporta e persiste interactiveElement de ação em vez de descartá-lo', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        interactiveElement: {
          id: 'acao-atual',
          type: 'action_prompt',
          title: 'Aplicação prática',
          prompt: 'Registre um plano de ação.',
          xpReward: 125,
          actionInstructions: ['Identifique o problema.', 'Valide a solução.'],
          userNotePlaceholder: 'Descreva seu plano...',
        },
      },
    ],
  });

  assert.match(html, /class=\\"unique-interactive-widget/);
  assert.match(html, /Registre um plano de ação\./);
  assert.match(html, /id=\\"unique-note-0\\"/);
  assert.match(html, /onclick=\\"saveUniqueInteraction\(0, 125\)\\"/);
  assert.match(html, /function saveUniqueInteraction\(slideIndex, xpReward\)/);
  assert.match(html, /uniqueInteractions: \{\}/);
});

test('slide cover nunca renderiza interactiveElement/checklist/keyTakeaways - widget de desafio nao pertence a capa', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        interactiveElement: {
          id: 'acao-capa',
          type: 'action_prompt',
          title: 'Missão prática',
          prompt: 'Isso nao deveria aparecer na capa.',
          xpReward: 155,
        },
      },
    ],
  });

  // O interactiveElement continua no blob JSON do deck (uso legitimo em
  // narracao/estado do cliente) - o que nao pode acontecer e o WIDGET
  // VISUAL renderizar na capa.
  assert.doesNotMatch(html, /class=\\"unique-interactive-widget/);
});

test('script exportado le hideQuiz/hideChecklist/hideNotes da query string e esconde os widgets correspondentes', () => {
  const html = generateInteractiveHtml(minimalDeck);

  assert.match(html, /function applyContentVisibilityFromQuery/);
  assert.match(html, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(html, /param: 'hideQuiz', selector: '\.quiz-widget-container'/);
  assert.match(html, /param: 'hideChecklist', selector: '\.checklist-widget-container'/);
  assert.match(html, /param: 'hideNotes', selector: '\.unique-interactive-widget'/);
  assert.match(html, /params\.get\(param\) !== '1'/);
  // 2 barras aqui (nao 1): este e o HTML/JS-fonte ainda como texto bruto,
  // que o NAVEGADOR vai reinterpretar como string literal ao executar o
  // <script> - '\\\\:' no arquivo .ts produz '\\:' (2 barras) no HTML, que
  // o parser JS do navegador entao le como 1 barra literal + ':' na string
  // final usada pelo seletor CSS. So 1 barra aqui (como no seletor CSS
  // '.lg\:col-span-7' em si) faria o navegador descartar a barra
  // (escape JS invalido) e quebrar o seletor - bug real ja pego uma vez
  // durante a verificacao visual manual (ver Step 6 do plano).
  assert.match(html, /closest\('\.lg\\\\:col-span-7'\)/);
  assert.match(html, /querySelector\('\.lg\\\\:col-span-5'\)/);
  assert.match(html, /applyContentVisibilityFromQuery\(\);\s*\n\s*renderBackgroundScene\(\);/);
});

test('script exportado reporta XP de quiz pro host via postMessage, so na primeira vez que acerta', () => {
  const html = generateInteractiveHtml(minimalDeck);

  assert.match(html, /function reportProgressToHost/);
  assert.match(html, /window\.ReactNativeWebView && typeof window\.ReactNativeWebView\.postMessage === 'function'/);
  assert.match(html, /window\.parent\.postMessage\(message, '\*'\)/);
  assert.match(html, /'trailup:progress'/);
  // a chamada tem que estar DENTRO do bloco !wasAlreadyRewarded (so reporta
  // na primeira vez que ganha o XP, nao em toda re-renderizacao)
  assert.match(html, /if \(!wasAlreadyRewarded\) \{[\s\S]*?reportProgressToHost\('slide:' \+ currentIndex \+ ':quiz', 150, 150\);[\s\S]*?\}/);
});

test('handleQuizAnswer nao apaga o XP ja premiado quando o aluno erra depois de ter acertado (acerto->erro->acerto nao premia 2x)', () => {
  const html = generateInteractiveHtml(minimalDeck);

  // O gate le xpAwarded (nao isCorrect) - isCorrect pode virar false de novo
  // num erro subsequente, mas xpAwarded tem que ser sticky.
  assert.match(html, /const wasAlreadyRewarded = !!savedData\.quizAnswers\[currentIndex\]\?\.xpAwarded;/);
  // acerto grava xpAwarded: true
  assert.match(html, /savedData\.quizAnswers\[currentIndex\] = \{ optId, isCorrect: true, explanation, xpAwarded: true \};/);
  // erro faz spread do registro anterior (preserva xpAwarded), nao substitui o objeto inteiro
  assert.match(html, /savedData\.quizAnswers\[currentIndex\] = \{\s*\n\s*\.\.\.\(savedData\.quizAnswers\[currentIndex\] \|\| \{\}\),\s*\n\s*optId,\s*\n\s*isCorrect: false,/);
});

test('attackBoss reporta XP pro host so no golpe final (bossHp chega a 0)', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /if \(currentBossHp === 0\) \{[\s\S]*?reportProgressToHost\('slide:' \+ currentIndex \+ ':boss', 500, 500\);[\s\S]*?\}/);
});

test('toggleChecklistItem reporta XP pro host so ao marcar, nunca ao desmarcar', () => {
  const html = generateInteractiveHtml(minimalDeck);
  // "marcar" (ganha XP): totalXp += ... e imediatamente seguido do report
  assert.match(html, /totalXp \+= \(xp \|\| 50\);\s*\n\s*reportProgressToHost\('slide:' \+ currentIndex \+ ':checklist:' \+ realItemId, xp \|\| 50, xp \|\| 50\);/);
  // "desmarcar" (perde XP): a linha que subtrai NUNCA e seguida do report
  assert.doesNotMatch(html, /totalXp = Math\.max\(0, totalXp - \(xp \|\| 50\)\);\s*\n\s*reportProgressToHost/);
});

test('toggleTakeawayMastery reporta XP pro host so ao dominar, nunca ao desfazer', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /reportProgressToHost\('slide:' \+ currentIndex \+ ':takeaway:' \+ realKeyId, xp \|\| 75, xp \|\| 75\);/);
});

test('saveUniqueInteraction reporta XP pro host so na primeira conclusao', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /if \(firstCompletion\) \{[\s\S]*?reportProgressToHost\('slide:' \+ slideIndex \+ ':unique', earnedXp, earnedXp\);[\s\S]*?\}/);
});

test('selectDecisionPath trava o XP na primeira decisao do slide - trocar de opcao depois nao premia de novo', () => {
  const html = generateInteractiveHtml(minimalDeck);
  // wasAlreadyChosen tem que ser "ja existe alguma decisao neste slide",
  // NAO "a escolha atual e igual a anterior" - comparar por choiceId permite
  // XP infinito alternando entre as opcoes (bug real reportado: 3250 XP
  // depois de alternar Estrategia A/B repetidas vezes).
  assert.match(html, /const wasAlreadyChosen = !!savedData\.decisions\[currentIndex\];/);
  assert.doesNotMatch(html, /savedData\.decisions\[currentIndex\]\?\.choiceId === choiceId/);
  assert.match(html, /if \(!wasAlreadyChosen\) \{\s*\n\s*totalXp \+= \(xpReward \|\| 100\);\s*\n\s*reportProgressToHost\('slide:' \+ currentIndex \+ ':decision:' \+ choiceId, xpReward \|\| 100, xpReward \|\| 100\);/);
});

test('revealSecretLore reporta XP pro host so na primeira revelacao', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /if \(!wasRevealed\) \{\s*\n\s*totalXp \+= 100;\s*\n\s*updateXpDisplay\(\);\s*\n\s*reportProgressToHost\('slide:' \+ currentIndex \+ ':secret', 100, 100\);/);
});

test('slide esparso (1 paragrafo, sem widget/imagem/exemplo) ganha fonte e respiro maiores', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        contentParagraphs: ['Único parágrafo curto, sem mais nada no slide.'],
      },
    ],
  });

  assert.match(html, /class=\\"text-base sm:text-lg md:text-xl leading-relaxed text-stone-200 font-normal break-words\\"/);
  assert.match(html, /class=\\"space-y-4 sm:space-y-5 pt-2\\"/);
  assert.doesNotMatch(html, /class=\\"text-xs sm:text-sm leading-relaxed text-stone-200 font-normal break-words\\"/);
});

test('slide com 2+ paragrafos NAO e tratado como esparso (mantem fonte padrao)', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        contentParagraphs: ['Primeiro parágrafo.', 'Segundo parágrafo.'],
      },
    ],
  });

  assert.match(html, /class=\\"text-xs sm:text-sm leading-relaxed text-stone-200 font-normal break-words\\"/);
  assert.doesNotMatch(html, /class=\\"text-base sm:text-lg md:text-xl leading-relaxed text-stone-200 font-normal break-words\\"/);
});

test('slide com 1 paragrafo mas com writtenExample NAO e tratado como esparso (ja tem conteudo suficiente)', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        contentParagraphs: ['Único parágrafo.'],
        writtenExample: { title: 'Exemplo', explanation: 'Explicação.', visualType: 'code' },
      } as any,
    ],
  });

  assert.match(html, /class=\\"text-xs sm:text-sm leading-relaxed text-stone-200 font-normal break-words\\"/);
});

test('capa: sem cartoes de Rank/XP Estimado/Perfil, badge usa texto tematico do perfil', () => {
  const html = generateInteractiveHtml(minimalDeck); // slides[0] e type: cover, perfil Survivor

  assert.doesNotMatch(html, /summary-grid/);
  assert.doesNotMatch(html, /XP Estimado/);
  assert.match(html, /MISSÃO DE SOBREVIVÊNCIA/);
  assert.doesNotMatch(html, /MISSÃO DE APRENDIZADO/);
});

test('conclusao: sem cartoes de Perfil/Rank/XP Total nem botao Exportar, mantem Revisar Trilha, badge tematico', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'epic_conclusion',
        title: 'Fim da Jornada',
      },
    ],
  });

  assert.doesNotMatch(html, /summary-grid/);
  assert.doesNotMatch(html, /XP Total/);
  assert.doesNotMatch(html, /Exportar \/ Imprimir/);
  assert.doesNotMatch(html, /certificate-xp-display/);
  assert.match(html, /Revisar Trilha/);
  assert.match(html, /FORTALEZA CONSOLIDADA/);
});

test('header mostra XP obtido/estimado (nao so o obtido) - estimado = slides.length * 150', () => {
  const html = generateInteractiveHtml(minimalDeck); // 1 slide -> estimado = 150

  assert.match(html, /id="xp-counter">0<\/span>\s*<span[^>]*>\/150<\/span>/);
});
