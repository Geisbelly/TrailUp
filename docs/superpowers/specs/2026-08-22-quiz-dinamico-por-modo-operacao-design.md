# Quiz dinâmico por modoOperacao — Design

## Contexto

Sub-projeto B de uma pilha maior de pedidos sobre o deck de apresentação
gerado pelo BrainHexPDF (sub-projeto A — correções visuais rápidas — já
entregue via
[BrainHexPDF#11](https://github.com/Geisbelly/BrainHexPDF/pull/11)).

Pedido: "remover os excessos de desafios cognitivos deixando eles dinamicos
de acordo com as preferencias do usuario = modoOperacao no banco de dados
(misto aparecer do jeito que tá, caso contrario pode deixar sem aparecer)".

O deck é gerado **uma vez por (classe × tópico × perfil BrainHex)** e
compartilhado entre todos os alunos daquele perfil — a decisão de
mostrar/esconder quiz por aluno **não pode** ser assada na geração do HTML
(afetaria todos os alunos daquele perfil igualmente). Precisa ser aplicada no
momento da **exibição**, por aluno.

## Descoberta técnica que muda o mecanismo

A investigação inicial (antes deste documento) cogitou usar
`injectedJavaScript` numa `react-native-webview`. **Isso não funciona no app
web**: `mobile/src/components/WebContentFrame.tsx` renderiza o conteúdo via
`<iframe src={uri}>` quando `Platform.OS === "web"` (linhas 43-58) — iframes
não aceitam `injectedJavaScript` de fora, e mesmo scripts customizados
esbarrariam em restrição de cross-origin (o deck fica no Storage do
Supabase, origem diferente do app).

**Mecanismo escolhido:** passar um parâmetro de query string na própria URL
do deck (`?hideQuiz=1`), que já é só uma URL comum passada como `uri` — tanto
o `<iframe src={uri}>` do modo web quanto o `source: {uri}` da
`react-native-webview` no nativo funcionam identicamente, sem precisar de
nenhuma ponte JS↔RN nova. O próprio HTML exportado do BrainHexPDF lê esse
parâmetro no carregamento (`location.search`) e decide se esconde o quiz.

**Separação de responsabilidades:** o parâmetro é um booleano
(`hideQuiz=1`/ausente), não o valor cru de `modoOperacao`. A regra de negócio
"Misto mostra, os demais escondem" fica inteira no lado do TrailUp/mobile
(onde o enum `modoOperacao` de fato vive); o BrainHexPDF só obedece a um
flag simples, sem precisar conhecer os valores do enum de outro repositório.

## Valores reais de `modoOperacao.nome`

Confirmado em `frontend/src/components/auth/StudentModeStep.tsx`: `"Conteúdo
Primeiro"`, `"Pergunta Primeiro"`, `"Misto"`, `"Perguntas Final"`. Persistido
em `aluno.modooperacao_id` → tabela `modoOperacao` (Supabase), lido no mobile
como `usuario.modoOperacao_nome` (via `useUsuario()` em
`mobile/src/context/SessaoContext.tsx`, já populado nesse formato em
`mobile/src/models/Aluno.ts`).

## Mudanças — TrailUp (mobile)

**Arquivo:** `mobile/src/components/DocumentBlock.tsx`, dentro do `useMemo`
que monta `viewer` (linha ~934), no branch `tipo === "embed"` (linha
947-953, que é o branch que atende o deck do BrainHexPDF — `.html` cai nesse
tipo). `usuario` já está disponível no componente via `useUsuario()` (linha
681).

Regra: comparação case-insensitive e com trim contra `"misto"` (evita
quebrar por variação de capitalização/espaço na gravação). Quando o valor é
`null`/`undefined`/string vazia (aluno sem o campo preenchido — cadastro
antigo, por exemplo), o quiz **aparece** (fail-open: preserva o
comportamento atual quando não há dado suficiente pra decidir — só esconde
quando o valor é explicitamente um modo diferente de "Misto").

Só afeta o branch `tipo === "embed"` — os branches `pdf`/`apresentacao`/
`documento` (visualizadores de PDF/Office, não geram deck do BrainHexPDF)
ficam inalterados.

## Mudanças — BrainHexPDF

**Arquivo:** `src/utils/deckExportUtils.ts`, dentro do `<script>` já
existente em `generateInteractiveHtml`.

1. No carregamento, ler `new URLSearchParams(location.search).get('hideQuiz')
   === '1'`.
2. Se verdadeiro, para cada `.quiz-widget-container` no documento:
   - Esconder o elemento (`display: none` ou remoção do DOM).
   - **Colapsar o grid de 2 colunas quando necessário**: o layout de 2
     colunas (`lg:col-span-5` texto / `lg:col-span-7`
     imagem+widget) é decidido no servidor, no momento da geração
     (`hasRightWidget = !!interactiveWidgetHtml || !!referenceImageHtml`).
     Se o quiz era o único conteúdo da coluna direita (sem
     `referenceImageDataUri` nesse slide), esconder só o widget deixaria uma
     coluna vazia — reintroduzindo o mesmo bug de espaço desperdiçado corrigido
     no sub-projeto A. O script precisa checar se a coluna direita
     (`lg:col-span-7`) ficou sem filhos visíveis após esconder o quiz e, nesse
     caso, escondê-la também e expandir a coluna de texto pra largura cheia.
   - Slides que ficam sem nenhum conteúdo restante (ex.: um slide
     `interactive_challenge` que só tinha o quiz, sem parágrafos) **não são
     removidos da navegação** — viram um card curto (título + pouco/nada de
     texto), já suportado pela altura flexível (piso+teto) do sub-projeto A.
     Não mexe em `goToSlide`/índices/contagem de bolinhas do indicador.

Escopo do "esconder": só o widget de **quiz** (`.quiz-widget-container`,
rotulado "✦ DESAFIO COGNITIVO • QUIZ" no HTML — é literalmente isso que o
pedido chama de "desafios cognitivos"). Checklist, decisão, boss battle e
outros widgets interativos não são afetados.

## Testes

- **TrailUp** (`mobile`): teste do `DocumentBlock` (ou de uma função
  extraída, ex. `buildEmbedUri`/`shouldHideQuiz`) cobrindo: `modoOperacao_nome
  = "Misto"` → sem parâmetro/`hideQuiz` ausente; `"Pergunta Primeiro"` →
  `hideQuiz=1`; `null`/`undefined`/`""` → sem parâmetro (mostra); variação de
  capitalização (`"misto"`, `" Misto "`) → tratada como Misto.
- **BrainHexPDF**: o projeto não usa jsdom — os testes existentes de
  `deckExportUtils.ts` já são 100% asserção em string sobre o HTML gerado
  (não simulam DOM/execução real de JS). Mantendo essa mesma convenção:
  `generateInteractiveHtml` é testado verificando que o `<script>` gerado
  contém a leitura de `hideQuiz` via `URLSearchParams` e o seletor
  `.quiz-widget-container`/a lógica de colapso da coluna direita — não uma
  simulação de execução. A cobertura de comportamento real (visual, com o
  parâmetro de fato aplicado) é feita por **verificação visual manual** via
  `claude-in-chrome`, mesmo padrão usado no sub-projeto A: gerar um deck de
  exemplo, abrir com `?hideQuiz=1` e sem o parâmetro, e comparar.
