# Apresentação: visual nativo no mobile (substitui bullets de texto): Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Quando um material "apresentação" tem `payload.slides` inline (caso normal — sempre que a geração de mídia funcionou), o app hoje mostra o conteúdo como blocos de markdown puro (título + bullet points de texto), ignorando cor do perfil, retrato do guardião e a cena de fundo gerada por IA que já estão nos dados. Todo esse trabalho de personalização visual por perfil BrainHex — que existe e é gerado — nunca chega ao aluno no mobile. Este design troca **apenas o desenho** (não o texto, que continua todo presente) por um componente nativo que usa a paleta/identidade visual já disponível no app.

**Architecture:** Novo bloco de conteúdo `apresentacao-slides` (payload com o array completo de slides, em vez de N blocos de markdown), renderizado por um componente novo `PresentationSlidesBlock.tsx` — preview inline + visualizador em tela cheia (`Modal`), seguindo o mesmo padrão já usado por `StudyCardsBlock.tsx`/`tipo === "cards"`. Reaproveita `getProfileShellPalette()` (paleta AAA por perfil, já calculada com contraste correto) e `getBrainHexConfig()`/`getBrainHexGuideName()` (cor, retrato, nome do guardião) — nenhum desses precisa ser criado.

**Tech Stack:** React Native, Expo Router, `expo-linear-gradient` (já é dependência do projeto, usado em outras telas), `Modal` do React Native (já usado em outras telas do app).

**Spec anterior relacionada:** `docs/api/superpowers/specs/2026-07-30-apresentacao-html-direto-design.md` (troca do PDF por HTML no `microservice` — essa spec documentou, como fora de escopo, exatamente a lacuna que este design resolve).

---

## Contexto — a lacuna encontrada

Durante o planejamento da troca de PDF por HTML no `microservice` (spec irmã acima), foi descoberto que `mobile/src/utils/personalization.ts` (`tipo === "apresentacao"`, `hasInlineSlides`) **nunca abre o arquivo da apresentação** — quando há `slides[]` inline no payload (sempre que a geração funcionou), ele monta blocos de `markdown` simples via `normalizePresentationSlides()`, que descarta `explanation`, `characterQuote`, `imagem_referencia` e `icones`, mantendo só `title`/`points`. O arquivo (PDF antes, HTML agora) só é aberto no fallback raro (`!hasInlineSlides`). Ou seja: todo o investimento visual por perfil (cor-assinatura, retrato do guardião, cena de fundo gerada por IA) é gerado no `microservice` mas nunca chega ao aluno — ele só vê texto puro.

---

## Decisões (resultado das perguntas de esclarecimento)

| Decisão | Escolha |
|---|---|
| Escopo da troca | Só o **desenho** do material "apresentação" muda. O texto (título, tópicos, explicação, fala do guia) continua todo presente, só passa a aparecer num visual com cor/imagem/ícone do perfil em vez de bullet cru. O material "markdown" (outro tipo de conteúdo, gerado separadamente) **não é tocado** |
| Interação | **Tela cheia / imersivo** — preview compacto inline, toque abre um visualizador full-screen com navegação por botões anterior/próximo no rodapé (sem swipe/áreas de toque nas laterais — decidido durante a implementação: exigiria biblioteca de gestos ou empilhamento de views que eu não teria como verificar interativamente sem rodar num device de verdade; botões são acessíveis e testáveis) |
| Riqueza visual | Subconjunto mobile-first (decisão do assistente, ver Seção 2) — não tenta replicar cada elemento decorativo do template HTML desktop |
| Dados antigos (sem `imagem_referencia`/`icones`) | Degrada bem sozinho — cai pra cor sólida do perfil, nunca trava |

---

## Seção 1: Arquitetura e fluxo de dados

```
mobile/src/utils/personalization.ts
  tipo === "apresentacao" && hasInlineSlides
    │
    ├─ [REMOVIDO nesse caminho] normalizePresentationSlides() → {title, points} apenas
    │                            → N blocos tipo "markdown" (1 por slide + abertura)
    │
    └─ [NOVO] normalizeRichPresentationSlides() → title, points, explanation,
              characterQuote, imagem_referencia, icones (mantido no dado,
              não desenhado nesta versão — ver Seção 2)
              → 1 bloco tipo "apresentacao-slides", payload = { title, abertura, slides[] }

mobile/src/components/ContentRenderer.tsx
  block.tipo === "apresentacao-slides"          [NOVO — mesmo padrão de "cards" → StudyCardsBlock]
    → <PresentationSlidesBlock payload={block.payload} />

mobile/src/components/PresentationSlidesBlock.tsx    [NOVO]
  → card de prévia inline (capa do slide 1 + botão "Ver apresentação")
  → toque abre <Modal> tela cheia: navegação por botões anterior/próximo,
    usa getProfileShellPalette()/getBrainHexConfig() (já existentes, AAA)
```

**Por que 1 bloco em vez de N:** hoje cada slide vira um `ContentBlock` de markdown separado, perdendo a noção de "conjunto/apresentação". Com um único bloco carregando o array de slides, o componente controla a navegação internamente — mesmo padrão já usado por `StudyCardsBlock` para `tipo === "cards"`.

**O que não muda:**
- O material `markdown` (content type separado, gerado independentemente) — intocado.
- O fallback de arquivo (`!hasInlineSlides && url && isPresentationUrl(url)`), que abre `DocumentBlock`/WebView apontando pro `.html` — intocado (já corrigido pra reconhecer `.html` na spec/plano da troca PDF→HTML).
- `normalizePresentationSlides()` em si — permanece como está para qualquer outro consumidor que dependa do formato `{title, points}` mínimo; a versão rica é uma função nova, não uma alteração da existente.

---

## Seção 2: Visual por slide (subconjunto mobile-first)

**Entram:**
- Fundo full-bleed: `imagem_referencia` (cena gerada por IA) quando existir; caso contrário, gradiente sólido `palette.background → palette.surfaceElevated` na cor do perfil, via `expo-linear-gradient`.
- Gradiente escuro na base do slide (legibilidade do texto sobre a imagem), mesma técnica.
- Selo do guardião: retrato (`getBrainHexConfig().image`) + nome (`getBrainHexGuideName()`) num canto fixo, moldura na cor-assinatura do perfil.
- Título (`titulo`) em destaque.
- Tópicos (`topics[]`) como lista/chips compactos.
- Balão de fala do guia (`characterQuote`).
- Explicação (`explanation`) como texto de apoio, abaixo dos tópicos.
- Indicador de progresso (slide X de N).

**Fica de fora nesta versão (decisão consciente, não removida dos dados):**
- Ícones decorativos (`icones[]`) — puramente ornamentais no HTML; numa tela pequena competem por espaço com o conteúdo textual. O campo continua disponível em `normalizeRichPresentationSlides()` para uso futuro, só não é desenhado agora.
- Composição variada por índice do slide (layouts diferentes pra capa/miolo/encerramento) — usa um layout único e consistente nesta primeira versão.

---

## Seção 3: Componentes e dados

**`normalizeRichPresentationSlides(value: unknown)`** — nova função em `mobile/src/utils/personalization.ts`, ao lado de `normalizePresentationSlides` (não a substitui). Mesma extração de `title`/`points` (reaproveitando `pickString`/`normalizeTextList` já usados na função existente), acrescentando:
```ts
type RichPresentationSlide = {
  title: string;
  points: string[];
  explanation: string | null;
  characterQuote: string | null;
  imagemReferencia: string | null;
  icones: string[];
};
```

**Bloco `apresentacao-slides`**: payload = `{ title: string, slides: RichPresentationSlide[] }`. Perfil **não** vem no payload — `PresentationSlidesBlock` resolve via `useUsuario()` (`usuario?.perfis?.[0]?.nome`) e `getProfileShellPalette()`, exatamente como `StudyCardsBlock` já faz hoje.

**`ContentRenderer.tsx`**: novo `if (block.tipo === "apresentacao-slides")` — case adicional na mesma cadeia de `if`s onde `"cards"` já está (linha ~262), mesma estrutura (`<View key={block.id}><PresentationSlidesBlock payload={block.payload} /></View>`).

**`PresentationSlidesBlock.tsx`** (novo componente):
- Estado: `index` (slide atual), `modalVisible` (boolean).
- Preview inline (sempre visível): título do material + `abertura` (quando presente) como subtítulo/gancho + botão "Ver apresentação" estilizado na cor do perfil (`palette.accent`). `abertura` vem do payload (ver Seção 1) — no caminho microservice costuma ser só a 1ª linha do markdown (baixo valor), mas no fallback Python é uma abertura narrativa própria gerada pela IA; preservado nos dois casos em vez de descartado.
- `<Modal visible={modalVisible} animationType="fade">`: tela cheia, `LinearGradient` de fundo (imagem ou cor sólida conforme Seção 2), conteúdo do slide atual sobreposto, rodapé com botões anterior/próximo (desabilitados nas pontas) + indicador "slide X de N" + botão fechar.
- Sem `imagem_referencia` no slide atual: `LinearGradient` usa só as cores do perfil (`palette.background`/`palette.surfaceElevated`), sem tentar carregar `<Image>` vazia.

---

## Seção 4: Degradação

- Sem `imagem_referencia`: fundo cai pro gradiente sólido do perfil — nunca tenta renderizar uma `<Image source={{uri: ""}}>` ou similar.
- Sem `characterQuote`, `explanation` ou `topics` (array vazio): a seção correspondente simplesmente não renderiza (`{campo ? <View>...</View> : null}`) — mesmo princípio do HTML no `microservice` (nunca elemento vazio).
- `slides.length === 0` mesmo com `hasInlineSlides` teoricamente true (não deveria acontecer, mas defensivamente): `PresentationSlidesBlock` retorna `null` — mesmo padrão de guarda que `StudyCardsBlock` já usa (`if (!card) return null`).

---

## Seção 5: Testes

`mobile/` não tem test runner configurado (`package.json` sem script `test`, sem Jest/Vitest instalado — confirmado durante a implementação da spec irmã de PDF→HTML). Sem testes automatizados aqui, mesma convenção já estabelecida no projeto para este pacote. Validação: rodar o app mobile em dev, abrir um tópico com apresentação gerada (`payload.slides` populado), conferir visualmente os 7 perfis BrainHex (cor/retrato corretos, contraste legível) e o caso sem `imagem_referencia` (degrada pro gradiente sólido, sem quebrar).

---

## Fora de escopo

- Ícones decorativos por slide, variação de layout por índice do slide, exportar/compartilhar a apresentação, geração de PDF a partir do visual nativo.
- Qualquer alteração no material `markdown` (content type separado, intocado).
- O fallback de arquivo (`!hasInlineSlides`) — já resolvido na spec/plano de troca PDF→HTML (`isPresentationUrl` reconhece `.html`).
- Web (`frontend/`) — é o console do professor, não tem essa tela de aluno; fora do escopo deste design.
