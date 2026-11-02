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

test('objetivo pedagogico aparece inteiro, quebrando linha, em vez de truncado num badge', () => {
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

  // Texto cortado com reticencias escondia justamente o objetivo do slide.
  assert.match(html, /class=\\"slide-objective\\"><strong>Objetivo:<\\\/strong> Compreender o fluxo completo de resolução recursiva de um nome de domínio, do resolvedor local até o servidor autoritativo final/);
  assert.doesNotMatch(html, /class=\\"truncate/);
});

test('deck-container usa altura FIXA por modo/breakpoint, nao piso+teto guiado por conteudo (evita esticar/encolher entre slides)', () => {
  const html = generateInteractiveHtml(minimalDeck);

  assert.doesNotMatch(html, /\.deck-container \{[^}]*aspect-ratio/);
  assert.doesNotMatch(html, /\.deck-container \{[^}]*min-height/);
  // Ocupa a tela do WebView inteira (o app ja tem o proprio cabecalho)...
  assert.match(html, /\.deck-container \{[^}]*height: 100dvh;/);
  // ...e, so em tela larga e alta, vira um cartao com respiro.
  assert.match(html, /@media \(min-width: 900px\) and \(min-height: 560px\)[\s\S]*?\.deck-container \{[^}]*height: calc\(100dvh - 32px\)/);
  assert.doesNotMatch(html, /mode-portrait/);
});

test('divisor SVG isola o ornamento num SVG proprio (w-auto), so as linhas esticam (none)', () => {
  const html = generateInteractiveHtml(minimalDeck);

  // ornamento com viewport proprio, nao esmagado pelo esticamento das linhas
  assert.match(html, /class=\\"h-full w-auto shrink-0\\"/);
  // linhas dos lados podem esticar livre - nao tem forma pra distorcer
  assert.match(html, /preserveAspectRatio=\\"none\\"/);
  // wrapper do divisor no cabecalho da capa (decorativo, fora do leitor de tela)
  assert.match(html, /class=\\"slide-divider\\" aria-hidden=\\"true\\"/);
  // as classes utilitarias do divisor ganham CSS proprio (sem Tailwind no deck)
  assert.match(html, /\.tu-deck \.slide-divider \.w-auto \{/);
});

test('mantém controles e navegação utilizáveis em telas móveis', () => {
  const html = generateInteractiveHtml(minimalDeck);

  assert.match(html, /height: 100dvh;/);
  // Alvos de toque de 44px (WCAG 2.5.5 AAA) nos botoes de icone.
  assert.match(html, /\.tu-deck \.icon-btn \{[^}]*min-width: 44px; height: 44px;/);
  // Anterior/Proximo sao botoes de verdade e o contador nao some no celular.
  assert.match(html, /<button type="button" class="btn btn-secondary" onclick="prevSlide\(\)" id="btn-prev">/);
  assert.match(html, /<button type="button" class="btn btn-primary" onclick="nextSlide\(\)" id="btn-next">/);
  assert.match(html, /<p class="slide-count" id="slide-indicator">Slide 1 de 1<\/p>/);
  // Sem alternador 16:9/9:16: o deck segue a tela que tem.
  assert.doesNotMatch(html, /deck-viewport-toggle/);
  assert.match(html, /touchSwipeBlocked/);
  assert.match(html, /target\?\.closest\('\.code-block, pre, code, button, input, textarea/);
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
  assert.match(html, /class=\\"slide-body has-aside\\"/);
  assert.match(html, /<figure class=\\"figure\\">/);
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
  assert.match(html, /class=\\"figure-grid\\"/);
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

  assert.match(html, /<img src=\\"data:image\/png;base64,AAAA\\" alt=\\"Arquitetura de Filas\\" \/>/);
  assert.doesNotMatch(html, /class=\\"figure-grid/);
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

  // Texto ao lado do widget usa o corpo normal (17-19px), nao o "lead"
  // nem um tamanho reduzido.
  assert.match(html, /<div class=\\"prose\\"><p>Par\u00e1grafo curto ao lado de um widget\.<\\\/p>/);
  // Corpo com piso de 17px (1.0625rem); o antigo era 12px no celular.
  assert.match(html, /--fs-body: calc\(var\(--scale\) \* clamp\(1\.0625rem,/);
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
  // Os slides so entram no DOM ao navegar: a funcao tem de rodar DEPOIS de
  // cada troca de slide (antes rodava uma vez, com o palco vazio).
  assert.match(html, /stage\.innerHTML = window\.__SLIDES__\[currentIndex\] \|\| '';\s*\n\s*stage\.scrollTop = 0;\s*\n\s*applyContentVisibilityFromQuery\(stage\);/);
  // Coluna lateral que ficou vazia sai, e o texto ganha a largura.
  assert.match(html, /widgetEl\.closest\('\.slide-aside'\)/);
  assert.match(html, /body\.classList\.remove\('has-aside'\)/);
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

  assert.match(html, /class=\\"slide slide--sparse\\"/);
  assert.match(html, /<div class=\\"prose prose--lead\\">/);
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

  assert.match(html, /<div class=\\"prose\\">/);
  assert.doesNotMatch(html, /class=\\"prose prose--lead/);
  assert.doesNotMatch(html, /class=\\"slide slide--sparse/);
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

  assert.match(html, /<div class=\\"prose\\">/);
  assert.doesNotMatch(html, /class=\\"slide slide--sparse/);
});

test('capa: sem cartoes de Rank/XP Estimado/Perfil, badge usa texto tematico do perfil', () => {
  const html = generateInteractiveHtml(minimalDeck); // slides[0] e type: cover, perfil Survivor

  assert.doesNotMatch(html, /summary-grid/);
  assert.doesNotMatch(html, /XP Estimado/);
  assert.match(html, /MISSÃO DE SOBREVIVÊNCIA/);
  assert.doesNotMatch(html, /MISSÃO DE APRENDIZADO/);
});

test('conclusao: sem cartoes de Perfil/Rank/XP Total nem botao Exportar, mantem Revisar trilha, badge tematico', () => {
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
  assert.match(html, /Revisar trilha/);
  assert.match(html, /FORTALEZA CONSOLIDADA/);
});

test('header mostra XP obtido/estimado (nao so o obtido) - estimado = slides.length * 150', () => {
  const html = generateInteractiveHtml(minimalDeck); // 1 slide -> estimado = 150

  assert.match(html, /id="xp-counter">0<\/span>\s*<span[^>]*>\/150<\/span>/);
});

test('deck nao depende do Tailwind por CDN: o estilo vai embutido e escopado em .tu-deck', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
  assert.match(html, /<body class="tu-deck">/);
  assert.match(html, /<html lang="pt-BR" translate="no" class="notranslate">/);
});

test('modo claro e escuro: escolha do aluno > ?tema= do app > preferencia do sistema', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /<meta name="color-scheme" content="dark light" \/>/);
  assert.match(html, /localStorage\.getItem\('trailup_deck_prefs'\)/);
  assert.match(html, /get\('tema'\)/);
  assert.match(html, /prefers-color-scheme: light/);
  // Os dois conjuntos de tokens do perfil estao no CSS.
  assert.match(html, /html\[data-theme="light"\] \.tu-deck/);
  assert.match(html, /html\[data-theme="dark"\] \.tu-deck/);
  // Ajustes de leitura: tamanho, espacamento (WCAG 1.4.12), animacoes e sons.
  for (const name of ['pref-tema', 'pref-texto', 'pref-espaco', 'pref-movimento', 'pref-sons']) {
    assert.match(html, new RegExp(`name="${name}"`));
  }
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
});

test('texto do modelo e escapado; apostrofo nao quebra o onclick e so **negrito**/`codigo` viram marcacao', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        title: 'Título com <script>alert(1)</script>',
        contentParagraphs: ['Use **sempre** o `await` e <b>nada</b> mais.'],
        decisionChoices: [
          { id: "d'1", label: "Caminho d'água", description: 'Descrição.', outcome: "Resultado com ' e \" juntos", xpReward: 100 },
        ],
      } as any,
    ],
  });

  // Nenhuma tag do modelo vira tag de verdade (nem fecha o <script> do deck).
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<\\\/script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;b&gt;nada&lt;\/b&gt;/);
  assert.match(html, /<strong>sempre<\\\/strong>/);
  assert.match(html, /<code>await<\\\/code>/);
  // Valores vao por data-*, nao colados dentro da string do onclick.
  assert.match(html, /data-choice-id=\\"d&#39;1\\"/);
  assert.match(html, /onclick=\\"selectDecisionPath\(this, this\.dataset\.choiceId, 100, this\.dataset\.outcome\)\\"/);
  assert.match(html, /data-outcome=\\"Resultado com &#39; e &quot; juntos\\"/);
});

test('teclado: setas trocam de slide, mas nunca dentro de campo de texto ou com dialogo aberto', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /if \(tag === 'input' \|\| tag === 'textarea' \|\| tag === 'select' \|\| \(t && t\.isContentEditable\)\) return;/);
  assert.match(html, /const openDlg = document\.querySelector\('\.tu-dialog\[open\]'\);\s*\n\s*if \(openDlg\) \{/);
  // Num bloco de codigo rolavel, as setas rolam o codigo.
  assert.match(html, /if \(t && t\.closest && t\.closest\('pre'\)\) return;/);
  assert.match(html, /e\.key === 'Home'/);
  assert.match(html, /e\.key === 'End'/);
});

test('leitor de tela: titulo do slide recebe foco e a troca e anunciada', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [minimalDeck.slides[0], { ...minimalDeck.slides[0], id: 's2', type: 'concept_breakdown', title: 'Segundo' }],
  });
  assert.match(html, /<p id="slide-announcer" class="sr-only" aria-live="polite" aria-atomic="true"><\/p>/);
  assert.match(html, /class=\\"slide-title\\" id=\\"slide-title-1\\" tabindex=\\"-1\\"/);
  assert.match(html, /announce\('Slide ' \+ \(currentIndex \+ 1\) \+ ' de ' \+ deck\.slides\.length/);
  // Sumario substitui as bolinhas de navegacao.
  assert.match(html, /<dialog class="tu-dialog" id="dlg-toc"/);
  assert.doesNotMatch(html, /slide-dot-hit/);
});

test('quiz, checklist e decisao sao botoes com aria-pressed; feedback numa regiao viva', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'interactive_challenge',
        quiz: {
          question: 'Pergunta?',
          options: [
            { id: 'a', text: 'Certa', isCorrect: true, explanation: 'Porque sim.' },
            { id: 'b', text: 'Errada', isCorrect: false, explanation: 'Porque não.' },
          ],
        },
      } as any,
    ],
  });
  assert.match(html, /class=\\"quiz-option-btn option\\"[\s\S]*?aria-pressed=\\"false\\"/);
  assert.match(html, /class=\\"quiz-feedback-box feedback\\" role=\\"status\\" aria-live=\\"polite\\" hidden/);
  // Estado do quiz nao depende so de cor: rotulo "Correta"/"Incorreta".
  assert.match(html, /state === 'correct' \? 'Correta' : state === 'wrong' \? 'Incorreta'/);
});

test('animacoes respeitam "reduzir movimento": confete, tremida e selo flutuante desligam', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /function triggerConfettiBurst[\s\S]*?prefersReducedMotion\(\)\) return;/);
  assert.match(html, /function triggerScreenShake\(\) \{\s*\n\s*if \(prefersReducedMotion\(\)\) return;/);
  // O laco do confete para quando nao ha particula (antes rodava para sempre).
  assert.match(html, /particleLoopRunning = false;/);
});

test('cada perfil leva o proprio emblema e guia no cabecalho do deck', () => {
  const seeker = generateInteractiveHtml({ ...minimalDeck, targetProfile: 'Seeker', themeConfig: BRAIN_HEX_PROFILES.Seeker });
  const survivor = generateInteractiveHtml(minimalDeck);
  assert.match(seeker, /Explorador · Atlas das Descobertas/);
  assert.match(survivor, /Sobrevivente · Manual de Campo/);
  assert.match(seeker, /com <strong>Amara<\\\/strong>/);
  assert.match(survivor, /com <strong>Kenji<\\\/strong>/);
});

test('fechamento mantem as ideias-chave marcaveis (+25 XP cada), como na versao anterior', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'epic_conclusion',
        title: 'Fim',
        keyTakeaways: ['Levar isto', 'Levar aquilo'],
      },
    ],
  });
  // O app soma esse XP (slide:N:takeaway:N-i); uma lista estatica o tiraria do aluno.
  assert.equal((html.match(/class=\\"takeaway-item-row check-row\\"/g) || []).length, 2);
  assert.match(html, /onclick=\\"toggleTakeawayMastery\(this, '0-1', 25\)\\"/);
  assert.match(html, /O que levar deste tópico/);
});

test('capa mostra o titulo do guia quando o modelo manda', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [{ ...minimalDeck.slides[0], characterGuide: { name: 'Kenji', title: 'Guardião do Campo', speechText: 'Vamos.' } } as any],
  });
  assert.match(html, /Kenji <span class=\\"guide-phase\\">· Guardião do Campo<\\\/span>/);
});

test('caractere que o modelo corta ao meio (surrogate solitario) nao derruba o render', () => {
  assert.doesNotThrow(() => generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'interactive_challenge',
        quiz: { question: 'Q?', options: [{ id: 'a', text: 'A', isCorrect: true, explanation: 'corte no meio \ud835' }] },
        decisionChoices: [{ id: 'd', label: 'L', description: 'D', outcome: 'fim \udc65', xpReward: 100 }],
      } as any,
    ],
  }));
});

test('divisor SVG do estudio so entra se for SVG sem script, handler ou link', () => {
  // So' a marcacao dos slides importa: o JSON do deck (dado, nao HTML) leva o texto cru.
  const comDivisor = (svg: string) => generateInteractiveHtml({
    ...minimalDeck,
    slides: [{ ...minimalDeck.slides[0], aiDecorations: { customDividerSvg: svg } } as any],
  }).split('window.__SLIDES__ = [')[1].split('];')[0];
  assert.match(comDivisor('<svg viewBox="0 0 10 1"><path d="M0 0h10" id="meu-divisor"/></svg>'), /meu-divisor/);
  assert.doesNotMatch(comDivisor('<svg onload="alert(1)" id="mau"></svg>'), /onload/);
  assert.doesNotMatch(comDivisor('<svg id="mau2"><script>alert(1)<\/script></svg>'), /mau2/);
  assert.doesNotMatch(comDivisor('<img src=x onerror=alert(1)>'), /onerror/);
});

test('checklist guarda o estado por slide e ainda le o estado salvo so pelo id', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /const storeKey = currentIndex \+ ':' \+ realItemId;/);
  assert.match(html, /savedData\.checklist\[storeKey\] = true;/);
  assert.match(html, /bySlide === true \|\| \(bySlide === undefined && savedData\.checklist\[id\]\)/);
});

test('atalho "Ir para o conteudo" nao navega (no iframe srcdoc do console o # tirava o deck da tela)', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /<a class="skip-link" href="#slide-stage" onclick="event\.preventDefault\(\); document\.getElementById\('slide-stage'\)\.focus\(\);">/);
});

test('sumario fecha sem devolver o foco ao botao (o foco vai para o titulo do slide)', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /closeDialog\('dlg-toc', true\); goToSlide\(i, true\);/);
  // Navegador sem <dialog>: o CSS esconde o fechado.
  assert.match(html, /\.tu-deck \.tu-dialog:not\(\[open\]\) \{ display: none; \}/);
});
