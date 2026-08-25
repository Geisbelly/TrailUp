# Design: Progresso, Persistência, Mídias e Atividades

**Data:** 2026-04-18  
**Branch:** base-teste  
**Escopo:** Correção de A (progresso + persistência) e B (mídias + atividades)

---

## 1. Progresso da Trilha + Persistência

### Problema

Dois bugs relacionados:

1. **Percentual incorreto** — após concluir conteúdo ou atividade, o percentual na tela não reflete o progresso real.
2. **Persistência quebrada** — o progresso some ou regride após fechar/reabrir o app.

### Causa Raiz

**Race condition no round-trip:** após o upsert no Supabase, `refreshTopico` chama imediatamente `Classe.loadDetalhado` (leitura completa do banco). O Supabase ainda não indexou a escrita → retorna dado antigo → estado local regride.

**`atualizarProgressoClasse` também tem round-trip:** recarrega todos os tópicos via `Classe.loadDetalhado` antes de calcular métricas, mesma race condition.

**Subscription RT dispara `fetchGraphData` sem debounce:** qualquer mudança em `conteudo_aluno`, `atividade_aluno` ou `topico_aluno` chama a Edge Function `personalize_path`, que pode retornar dado desatualizado e sobrescrever o progresso local.

### Design da Correção

#### A1 — Atualizar estado local antes do round-trip

Em `marcarConteudoVisto`, `registrarAtividadeConcluida` e similares no `TrilhaContext`:

1. Mutar o objeto local (`conteudo.status`, `conteudo.percentual_concluido`, `topico.percentual_concluido = topico.calcularPercentual()`) antes de qualquer await.
2. Chamar `syncClasseLocally` imediatamente após a mutação local.
3. Só então disparar o upsert no Supabase.
4. `refreshTopico` e `atualizarProgressoClasse` ficam como operações secundárias, com delay mínimo de 500ms para dar tempo do índice do Supabase ser atualizado.

#### A2 — Remover round-trip do caminho crítico

`atualizarProgressoClasse` deve usar o estado local já presente em `classeAtual` (já sincronizado via `syncClasseLocally`) em vez de chamar `Classe.loadDetalhado`. A chamada a `Classe.loadDetalhado` dentro de `atualizarProgressoClasse` deve ser removida — ela é redundante e é a principal fonte da race.

#### A3 — Debounce na subscription realtime

A subscription `rt_trilha` não deve chamar `fetchGraphData()` diretamente. Adicionar debounce de 2000ms: se múltiplos eventos chegarem em sequência (comportamento normal ao salvar conteúdo + atividade no mesmo tópico), só dispara uma vez depois que o fluxo terminar.

#### A4 — `refreshTopico` com delay

Adicionar `setTimeout(() => refreshTopico(topicoId), 500)` nos fluxos de conclusão em vez de `await refreshTopico(topicoId)` síncrono no caminho crítico.

### Arquivos Afetados

- `src/context/TrilhaContext.tsx` — métodos `marcarConteudoVisto`, `registrarAtividadeConcluida`, `atualizarProgressoClasse`, subscription `rt_trilha`

---

## 2. Mídias + Atividades

### 2.1 PDF → Markdown Nativo + Paginação

**Problema:** `PdfBlock` usa `WebView` com URL raw e altura fixa (360px) → texto truncado, paginação quebrada.

**Decisão:** conteúdo do tipo `pdf` passa a ser renderizado como Markdown nativo.

**Design:**
- `PdfBlock` é substituído por `MarkdownBlock` para todos os casos onde o payload contém texto Markdown (campo `conteudo` ou `texto`).
- `MarkdownBlock` usa `react-native-markdown-display` para renderização nativa (sem WebView).
- Paginação: dividir o documento em páginas usando `##` (h2) como delimitador de página. Headings `###` e abaixo ficam dentro da mesma página. Navegação via botões "← Anterior" / "Próximo →" na parte inferior do bloco.
- Se o conteúdo não tiver `##` headings, exibir tudo em página única com scroll.
- O componente `PdfBlock` (WebView) permanece apenas para URLs externas reais (campo `url` presente no payload).

**Arquivos:**
- `src/components/MarkdownBlock.tsx` — adicionar paginação por `##`, usar `react-native-markdown-display`
- `src/components/PdfBlock.tsx` — manter só para URL externa
- `src/components/ContentRenderer.tsx` — rotear `pdf` para `MarkdownBlock` quando não há URL, ou quando há campo `conteudo`/`texto`

### 2.2 Atividades Abrindo com Resposta Destacada

**Problema:** `QuestionActivity` inicializa estado a partir de `atividade.resposta_aluno` diretamente → resposta já vem selecionada no primeiro render.

**Design:**
- Separar estado de exibição do estado persistido.
- Na abertura padrão: inicializar `selectedAnswer = null`, independente de `resposta_aluno`.
- Adicionar prop `reviewMode: boolean` em `QuestionActivity` e `ActivityRenderer`.
- Quando `reviewMode = true` (atividade já concluída, aluno quer revisar): inicializar com `resposta_aluno`, mostrar gabarito, desabilitar nova submissão.
- `reviewMode` é determinado pelo chamador (`[id].tsx`) com base em `isAtividadeConcluida`.

**Arquivos:**
- `src/components/QuestionActivity.tsx`
- `src/components/ActivityRenderer.tsx`
- `src/app/(tabs)/trilha/[id].tsx` — passar `reviewMode` para `ActivityRenderer`

### 2.3 Atividades Respondidas Travando o Fluxo

**Problema:** quando `isAtividadeConcluida = true`, a tela bloqueia em vez de permitir continuar.

**Design:**
- Quando atividade já concluída: mostrar tela de resumo (resultado obtido, acertos, botão "Continuar").
- O botão "Continuar" chama `onComplete` normalmente, avançando o fluxo.
- Não exibir o formulário de resposta novamente — apenas o resumo com opção de revisão.

**Arquivos:**
- `src/components/ActivityRenderer.tsx`
- `src/app/(tabs)/trilha/[id].tsx`

### 2.4 Cards: Ordem e Renderização de Mídia

**Problema — ordem:** em `[id].tsx`, `buildBlocksForTopico` usa `groupAtividadesByConteudo` que reordena por `conteudo_ids`, quebrando a ordem dos steps da API (onde cards vêm antes das questões).

**Design:**
- Quando há `PersonalizedTopicPayload` com `steps`, usar a ordem dos steps diretamente em `PersonalizedTopicView` sem passar pelo `buildBlocksForTopico`.
- `buildBlocksForTopico` permanece apenas para o fallback (sem payload personalizado).

**Problema — mídia nos cards:** `StudyCardsBlock` tem campos `videoUrl`, `audioUrl`, `imagemUrl`, `pdfUrl` no tipo `StudyCard` mas não renderiza.

**Design:**
- Adicionar renderização condicional no verso do card:
  - `imagemUrl` → `Image`
  - `audioUrl` → `AudioPlayer`
  - `videoUrl` → `VideoPlayer`
  - `pdfUrl` / `documentoUrl` → `MarkdownBlock` (se texto) ou `DocumentBlock` (se URL)

**Arquivos:**
- `src/components/StudyCardsBlock.tsx`
- `src/components/PersonalizedTopicView.tsx`

### 2.5 Vídeo: Controles de Seek

**Problema:** `VideoPlayer` não expõe barra de progresso nem controles de seek.

**Design:**
- Adicionar barra de progresso com posição atual / duração total.
- Botões ±10s para avançar/retroceder.
- Usar `setPositionAsync` da API `expo-av` para seek.
- Controles visíveis com tap na área do vídeo (auto-hide após 3s).

**Arquivos:**
- `src/components/funcionais/VideoPlayer.tsx`

### 2.6 Markdown: Renderização Nativa e Integrada

**Problema:** `MarkdownBlock` detecta markdown rico e cai para `WebContentFrame` (WebView) → quebra integração visual, scroll independente, performance ruim.

**Design:**
- Substituir `WebContentFrame` dentro de `MarkdownBlock` por `react-native-markdown-display`.
- Estilizar os elementos (`h1`, `h2`, `p`, `code`, `blockquote`, `li`) com as cores do tema do app (`palette`).
- Paginação: dividir por `##` (h2) headings, navegação com botões no rodapé. `###` e abaixo ficam na mesma página.
- Imagens dentro do markdown renderizadas com `Image` nativo (substituir `![](url)` por `<Image>`).

**Arquivos:**
- `src/components/MarkdownBlock.tsx`
- `src/components/WebContentFrame.tsx` — manter apenas para embeds externos reais

---

## 3. Dependências

- `react-native-markdown-display` — **não está no projeto**, precisa ser instalada (`npx expo install react-native-markdown-display`).
- `expo-av` — já instalada (`~16.0.7`); ampliar uso para seek.

---

## 4. Ordem de Implementação

1. **TrilhaContext** — race condition e debounce RT (base para tudo)
2. **MarkdownBlock** — paginação nativa (afeta PDF + conteúdo rico)
3. **QuestionActivity / ActivityRenderer** — reviewMode e fluxo de atividades concluídas
4. **StudyCardsBlock** — ordem de cards + mídia
5. **VideoPlayer** — controles de seek
6. **ContentRenderer / PdfBlock** — roteamento PDF → Markdown
