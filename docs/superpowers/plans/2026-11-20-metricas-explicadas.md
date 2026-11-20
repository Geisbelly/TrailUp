# Métricas explicadas: plano de implementação

> **Para agentes:** sub-skill obrigatória: superpowers:subagent-driven-development (recomendada) ou
> superpowers:executing-plans, tarefa por tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** cada métrica do console do professor e do Perfil/ranking do aluno ganha um ícone de
informação que abre uma explicação fiel ao código: o que mede, como coleta, quando atualiza, selo de
confiança, limites e o que não significa.

**Arquitetura:** um catálogo JSON por cliente (mesmas chaves e mesmo selo; teste de paridade no
frontend) e um componente `ExplicacaoDaMetrica` por cliente (Popover no console, Modal no app). Os
textos são escritos a partir da leitura da fonte de verdade (função ou view do banco, coletor,
cálculo no cliente), registrada em `referencia`.

**Stack:** React + Vite + shadcn/Radix Popover + lucide (frontend, vitest com
`renderToStaticMarkup`); Expo/React Native + MaterialCommunityIcons (mobile, `node:test` via
`tsx`, só lógica).

**Spec:** `docs/superpowers/specs/2026-11-20-metricas-explicadas-design.md`

## Restrições globais

- Todo texto em PT-BR, UTF-8 sem BOM.
- Ícone: `Info` (lucide) no console e `information-outline` no app. Nunca `CircleHelp`/`HelpCircle`
  nem `help-circle-outline`.
- Selos: `"medido" | "regra" | "estimativa"`. O que tem `requer_validacao` `ml`/`llm` em
  `metricas_catalogo` é sempre `"estimativa"`.
- Rótulo do chip. Console: `Medido`, `Calculado com regra`, `Estimativa`. App: `Medido`,
  `Calculado`, `Estimativa`.
- Frase fixa por selo, exibida sob o chip, copiada exatamente:
  - console, `medido`: "Medido: contagem ou soma direta do que o sistema registrou."
  - console, `regra`: "Calculado com regra: conta fixa sobre dados registrados. O número depende da
    regra, descrita abaixo."
  - console, `estimativa`: "Estimativa: sai de um modelo ou de uma regra aproximada e ainda não foi
    validada com alunos."
  - app, `medido`: "Medido: o app contou direto o que aconteceu."
  - app, `regra`: "Calculado: uma conta feita em cima do que o app registrou."
  - app, `estimativa`: "Estimativa: um palpite do sistema, ainda não conferido com alunos."
- Tamanho por campo. Professor: no máximo 360 caracteres. Aluno: no máximo 220. `limites`: de 0 a 3
  itens.
- `referencia` é obrigatória e nunca aparece na tela.
- Abrir por clique, toque ou teclado. Nunca só por hover.
- Contraste AAA (7:1) para todo texto da explicação.
- Nenhuma conta muda. Conta suspeita vai para `docs/superpowers/specs/2026-11-20-metricas-explicadas-follow-ups.md`.
- Os textos respeitam o CLAUDE.md:
  - tempo de estudo = tempo **ativo** (`trailup_tempo_telemetria_min`), nunca `dwell_sec` nem
    cronômetro;
  - nota calculada pelo banco;
  - XP = `eventos_aluno.valor` sem `fora_do_xp`, faixas em `xp_faixa`;
  - abaixo de `n_minimo`, a célula volta nula;
  - o vetor observado do perfil é sombra e não é usado pelo produto;
  - nada de "o Guia ajudou" nem de amostra validada.
- Fontes do banco são lidas só com `SELECT` (`pg_get_functiondef`, `pg_get_viewdef`) pelo MCP do
  Supabase. Nada de `SET` nem escrita.
- Não rodar `graphify update`. Push e PR só com a conta gh Geisbelly, no BitStudioLabs/trail-up, sem
  merge.

## Foco da revisão

1. **Ícone dentro de algo clicável** (linha da `TabelaAlunos`, item de `PrecisamDeAtencao`, card do
   app). O clique no ícone abre só a explicação, sem abrir o aluno. Console: `onClick` com
   `stopPropagation`, coberto por teste na Tarefa 2. App: o `Pressable` interno captura o toque,
   conferido no Android na Tarefa 9.
2. **Card sem dado, em revisão ou com erro.** É quando a explicação mais importa, então o ícone
   continua lá. Coberto por teste na Tarefa 3.
3. **Rótulo longo a 375 px.** O ícone não empurra o número para fora: o botão é `shrink-0` e o rótulo
   quebra linha. Conferido no navegador e no Android na Tarefa 9.
4. **O mesmo dado com rótulos temáticos diferentes.** Todo `<StatTile`, `<ProgressLine` e
   `<SectionTitle` com número em `ProfileMetricsViews.tsx` recebe `explicacao`. Coberto pelo teste de
   fonte da Tarefa 8.
5. **Botão voltar do Android com a explicação aberta.** Ela fecha e a tela continua no lugar
   (`onRequestClose`). Conferido na Tarefa 9.

---

### Task 1: catálogo do console e regras de integridade

**Arquivos:**
- Criar: `frontend/src/lib/metricas/explicacoes.json` (começa com `prof.tempo_ativo` completo, como
  modelo).
- Criar: `frontend/src/lib/metricas/explicacoes.ts`
- Teste: `frontend/src/lib/metricas/explicacoes.test.ts`

**Interfaces (produz):**
- `export type Selo = "medido" | "regra" | "estimativa"`
- `export type ExplicacaoMetrica = { nome: string; selo: Selo; oQueMede: string; comoColeta: string; atualiza: string; limites?: string[]; naoSignifica: string; referencia: string }`
- `export type ChaveMetrica = keyof typeof dados` (o tipo sai do JSON: chave inexistente não compila).
- `export function explicacaoDe(chave: ChaveMetrica): ExplicacaoMetrica`
- `export const ROTULO_DO_SELO: Record<Selo, string>` e `export const FRASE_DO_SELO: Record<Selo, string>`
  (textos das restrições globais).
- `export function problemasDoCatalogo(cat: Record<string, unknown>, maxCaracteres: number): string[]`
  devolve uma lista de problemas legíveis. Lista vazia = catálogo válido.

- [ ] **Passo 1: teste que falha.** `explicacoes.test.ts`:
  - `problemasDoCatalogo(catalogo, 360)` deve ser `[]`;
  - com um selo inválido, devolve um item contendo `"selo"`;
  - com `naoSignifica: ""`, devolve um item contendo `"naoSignifica"`;
  - com 361 caracteres em `oQueMede`, devolve um item contendo `"361"`;
  - com `limites` de 4 itens, devolve um item contendo `"limites"`;
  - sem `referencia`, devolve um item contendo `"referencia"`;
  - `ROTULO_DO_SELO.regra === "Calculado com regra"`;
  - `FRASE_DO_SELO.estimativa` igual à frase das restrições globais.
- [ ] **Passo 2:** `cd frontend && npx vitest run src/lib/metricas`. Esperado: FALHA (o módulo não existe).
- [ ] **Passo 3: implementar `explicacoes.ts` e o JSON com `prof.tempo_ativo`.** Antes de escrever,
  ler `vw_metricas_engajamento_aluno_classe` e `trailup_tempo_telemetria_min` no banco e o
  `runStudyBatchFlush` do mobile. O texto diz:
  - que só conta o escopo de tópico;
  - que é só tempo com toque, rolagem ou mídia tocando;
  - que o material aberto e parado não conta;
  - que vem do envio do app em lotes.
- [ ] **Passo 4:** mesmo comando. Esperado: PASSA.
- [ ] **Passo 5: commit** `feat(console): catálogo das explicações de métricas`.

### Task 2: componente `ExplicacaoDaMetrica` no console

**Arquivos:**
- Criar: `frontend/src/components/console/comum/ExplicacaoDaMetrica.tsx`
- Teste: `frontend/src/components/console/comum/ExplicacaoDaMetrica.test.tsx`
- Modificar: `frontend/src/components/console/dashboard/contrasteTokens.test.ts` (acrescentar a
  superfície `popover`)

**Interfaces:**
- Consome: `explicacaoDe`, `ChaveMetrica`, `ROTULO_DO_SELO`, `FRASE_DO_SELO` (Tarefa 1).
- Produz:
  - `export default function ExplicacaoDaMetrica({ chave, className }: { chave: ChaveMetrica; className?: string })`:
    gatilho mais Popover.
  - `export function ConteudoDaExplicacao({ explicacao }: { explicacao: ExplicacaoMetrica })`:
    o miolo puro, testável com `renderToStaticMarkup`.
  - `export function pararPropagacao(e: { stopPropagation(): void }): void`

- [ ] **Passo 1: teste que falha.** Casos:
  - o gatilho renderiza um `<button` com `type="button"` e `aria-label="Como funciona: Tempo ativo"`
    (o nome vem do JSON);
  - o markup do gatilho contém o svg do `Info` (classe `lucide-info`) e não contém `lucide-circle-help`;
  - `ConteudoDaExplicacao` renderiza, nesta ordem: nome, rótulo do selo, frase do selo,
    "O que mede", "Como é coletado", "Atualiza", "Limites" (só se houver), "O que não significa";
  - `referencia` não aparece no HTML;
  - `pararPropagacao` chama `stopPropagation` uma vez.
- [ ] **Passo 2:** `npx vitest run src/components/console/comum`. Esperado: FALHA.
- [ ] **Passo 3: implementar.**
  - Gatilho: `PopoverTrigger asChild` sobre o `<button>`, com `onClick={pararPropagacao}`, ícone
    `h-3.5 w-3.5`, área de `h-6 w-6`, `shrink-0` e foco visível com o `ring` do tema.
  - Conteúdo: `PopoverContent` com `w-80 max-w-[calc(100vw-32px)]`.
  - Chip: texto `text-foreground` sobre `bg-muted`, sem cor de status.
  - Títulos das seções em `console-label-sm`.
- [ ] **Passo 4:** acrescentar em `contrasteTokens.test.ts` que `foreground` e `muted-foreground`
  atingem pelo menos 7 sobre `popover`, e que `foreground` atinge pelo menos 7 sobre `muted` (o
  chip). Rodar `npx vitest run src/components/console`. Esperado: PASSA.
- [ ] **Passo 5: commit** `feat(console): ícone de explicação das métricas`.

### Task 3: KPIs da visão geral

**Arquivos:**
- Modificar: `frontend/src/components/console/dashboard/KpisPrincipais.tsx`, `KpisSecundarios.tsx`,
  `frontend/src/lib/metricas/explicacoes.json`
- Teste: `frontend/src/components/console/dashboard/Kpis.explicacao.test.tsx`

**Interfaces:** consome `ExplicacaoDaMetrica` (Tarefa 2). `KpiPrincipal` e `KpiSecundario` ganham
`explicacao: ChaveMetrica`.

- [ ] **Passo 1: teste que falha.** Em `renderToStaticMarkup`:
  - `KpisPrincipais` contém os três `aria-label`: "Como funciona: Total de alunos", "… Média de
    notas" e "… Conclusão média";
  - `KpisSecundarios`, com `turmaResumo` todo nulo e `erroTurma` preenchido, ainda contém os seis
    `aria-label` (foco 2).
- [ ] **Passo 2:** rodar o teste. Esperado: FALHA.
- [ ] **Passo 3: ler as fontes e escrever as entradas.** Chaves e selos:

  | Chave | Selo |
  |-------|------|
  | `prof.total_alunos` | medido |
  | `prof.media_notas` | regra |
  | `prof.conclusao_media` | regra |
  | `prof.taxa_acertos` | regra |
  | `prof.risco_abandono` | estimativa |
  | `prof.retorno_semanal` | regra |
  | `prof.chat_apos_erro` | regra |
  | `prof.tempo_uso` | medido |

  Fontes:
  - `DashboardSection.tsx:465-469`;
  - `trg_classe_aluno_nota_pelo_banco`;
  - `vw_metricas_turma_geral_classe`;
  - a descrição de `prof.risco_abandono` e `prof.retorno_semanal` em `metricas_catalogo`;
  - quem grava `classe_aluno."acertosPercentual"`: `personalizacao_progresso.py:236-265` e o RPC de
    tentativa.

  Registrar no arquivo de follow-ups que `acertosPercentual` não tem guarda no banco.
  "Conclusão média" divide pelo total de alunos, contando 0 para quem não tem dado: o texto diz isso.
- [ ] **Passo 4: plugar** o ícone ao lado de `console-label` e `console-label-sm`, dentro de um
  `flex items-center gap-1`, com o ícone do card à direita sem mudar.
- [ ] **Passo 5:** `npx vitest run src/components/console src/lib/metricas`. Esperado: PASSA.
- [ ] **Passo 6: commit** `feat(console): KPIs da turma explicam como são medidos`.

### Task 4: seções da visão geral e tabela de alunos

**Arquivos:**
- Modificar, em `frontend/src/components/console/dashboard/`: `PrecisamDeAtencao.tsx`,
  `AbandonoPorPerfil.tsx`, `DistribuicaoNotas.tsx`, `InatividadePorPerfil.tsx`,
  `AbandonoPorEtapa.tsx`, `RiscoDeReprovacao.tsx`, `GargalosDePersonalizacao.tsx`,
  `FilaDePersonalizacao.tsx`, `TabelaAlunos.tsx`. Também o JSON.
- Teste: `frontend/src/components/console/dashboard/Secoes.explicacao.test.tsx`

- [ ] **Passo 1: teste que falha.** Renderizar cada seção com o estado mínimo que os testes vizinhos
  já usam (copiar as fixtures de `risco.test.ts`, `gargalos.test.ts` e similares). Cada uma contém o
  `aria-label` da sua chave. A `TabelaAlunos` contém o ícone em cada cabeçalho com número, e o markup
  do ícone fica fora do elemento clicável da linha.
- [ ] **Passo 2:** rodar o teste. Esperado: FALHA.
- [ ] **Passo 3: ler as fontes e escrever as entradas.**
  - `prof.precisam_atencao`: selo pelo que `risco.ts` e `sinais.ts` fazem (regra fixa = `regra`;
    modelo = `estimativa`).
  - `prof.abandono_por_perfil`: `estimativa`, porque usa o mesmo modelo de evasão.
  - `prof.distribuicao_notas`: `regra`, a partir de `vw_metricas_distribuicao_turma_classe`.
  - `prof.inatividade`: `medido`.
  - `prof.abandono_por_etapa`: `regra`, "14 dias abaixo da mediana".
  - `prof.risco_reprovacao`: selo pelo que `riscoReprovacao.ts` e a RPC fazem.
  - `prof.gargalos_personalizacao` e `prof.fila_personalizacao`: `medido`, a partir dos jobs e
    targets.
  - Onde houver `n_minimo` (`useNMinimo.ts`), entra em `limites`: "aparece só com pelo menos N
    alunos".
- [ ] **Passo 4: plugar** o ícone ao lado do `<h3>` de cada seção, com o `id` do título intocado.
- [ ] **Passo 5:** `npx vitest run src/components/console`. Esperado: PASSA.
- [ ] **Passo 6: commit** `feat(console): seções da visão geral explicam a origem dos números`.

### Task 5: abas Evolução, Conteúdo, Insights e Guia

**Arquivos:**
- Modificar: `AbaEvolucao.tsx`, `AbaConteudo.tsx`, `AbaInsights.tsx` (ou `CartaoDeInsight.tsx`),
  `AbaGuia.tsx` e o JSON.
- Teste: estender `AbaGuia.test.tsx` e `AbaInsights.test.ts`; criar
  `AbaEvolucao.explicacao.test.tsx` e `AbaConteudo.explicacao.test.tsx`.

- [ ] **Passo 1: teste que falha.** Cada aba contém os `aria-label` das chaves abaixo.
- [ ] **Passo 2:** rodar os testes. Esperado: FALHA.
- [ ] **Passo 3: ler as fontes e escrever as entradas.**
  - `prof.evolucao` e `prof.mudancas_relevantes`: `evolucao.ts`, `useEvolucaoDaTurma.ts`.
  - `prof.conteudo_por_topico`: `conteudo.ts` e `vw_metricas_cobertura_material`; selo `regra`.
  - `prof.insights`: `estimativa`. Escrito pela IA; sem modelo, nada é gravado.
  - `prof.guia_conceitos`: `estimativa` (a dificuldade é classificada por modelo).
  - `prof.guia_topicos`: `medido`.
  - `prof.guia_por_aluno`: `regra`. O `naoSignifica` repete o subtítulo: não prova que o Guia ajudou.
- [ ] **Passo 4: plugar** o ícone junto ao título de cada seção. No `Secao` do `AbaGuia`, entra uma
  prop `explicacao`.
- [ ] **Passo 5:** `npx vitest run src/components/console`. Esperado: PASSA.
- [ ] **Passo 6: commit** `feat(console): abas da turma explicam suas métricas`.

### Task 6: detalhe do aluno e ranking no console

**Arquivos:**
- Modificar: `dashboard/aluno/CabecalhoAluno.tsx`, `AbaVisaoGeral.tsx`, `AbaPerfil.tsx`,
  `AbaPersonalizacao.tsx`, `AbaTentativas.tsx`, `SinalDeAtencao.tsx`,
  `frontend/src/components/console/RanksSection.tsx` (ou o componente de `rankings/` que desenha
  pontos e posição) e o JSON.
- Teste: estender `AbaPerfil.test.tsx`; criar `DetalheAluno.explicacao.test.tsx`.

- [ ] **Passo 1: teste que falha.**
  - Cada número do cabeçalho (`n.rotulo`) tem ícone.
  - `AbaPerfil` contém "Como funciona: Afinidade entre os perfis".
  - O texto de `aluno.afinidades` contém "questionário" e **não** contém "observado", "comportamento"
    nem "telemetria". O vetor observado é sombra e o texto não pode sugerir que o produto o usa.
- [ ] **Passo 2:** rodar o teste. Esperado: FALHA.
- [ ] **Passo 3: ler as fontes e escrever as entradas.** As chaves reusam as `aluno.*` do app quando o
  número é o mesmo:
  - `aluno.progresso`, `aluno.acertos`, `aluno.tempo_total`, `aluno.afinidades`, `aluno.ranking`,
    `aluno.xp`;
  - novas: `prof.tentativas`, `prof.sinal_atencao`, `prof.consumo_personalizado`.

  O selo das `aluno.*` é decidido aqui e copiado igual para o app na Tarefa 7.
- [ ] **Passo 4: plugar** os ícones.
- [ ] **Passo 5:** `npx vitest run`. Esperado: PASSA.
- [ ] **Passo 6: commit** `feat(console): detalhe do aluno e ranking explicam seus números`.

### Task 7: catálogo do app e paridade de selo

**Arquivos:**
- Criar: `mobile/src/constants/metricasExplicadas.json`
- Criar: `mobile/src/services/metricas/explicacoes.ts`
- Teste: `mobile/src/services/metricas/explicacoes.test.ts` (acrescentar em
  `mobile/testes/principal.txt`)
- Teste: `frontend/src/lib/metricas/paridade.test.ts`

**Interfaces (produz):** no mobile, as mesmas formas da Tarefa 1 (`Selo`, `ExplicacaoMetrica`,
`ChaveMetrica`, `explicacaoDe`, `ROTULO_DO_SELO`, `FRASE_DO_SELO`, `problemasDoCatalogo`), mais:
- `export function rotuloAcessivel(chave: ChaveMetrica): string` devolve `"Como funciona: <nome>"`.
- `export const CHAVE_DO_CAMPO: Partial<Record<keyof ProfileMetricsViewModel, ChaveMetrica>>`. Mapeia
  `progresso`, `acertos`, `taxaExploracao`, `topicosDescobertos`, `conteudosConcluidos`,
  `atividadesConcluidas`, `totalConquistas`, `diasAtivos`, `melhorPosicao`, `sessionEngajamento`,
  `touchTotal`, `afinidades`, `tempo`, `tempoTopicoAcumuladoMin`, `tempoTopico`, `danoTotal`,
  `melhorTempoMin`, `emotionLabel`, `analysisSummary` e os demais campos que algum painel desenha.

- [ ] **Passo 1: testes que falham.**
  - Mobile (`node:test`):
    - `problemasDoCatalogo(catalogo, 220)` é `[]`, com os mesmos casos negativos da Tarefa 1 e o
      limite de 221;
    - `rotuloAcessivel("aluno.sequencia") === "Como funciona: Sequência de dias"`;
    - `ROTULO_DO_SELO.regra === "Calculado"`;
    - todo valor de `CHAVE_DO_CAMPO` existe no catálogo.
  - Frontend: `paridade.test.ts` lê `../../../../mobile/src/constants/metricasExplicadas.json` com
    `readFileSync` e `new URL(..., import.meta.url)`. Para cada chave presente nos dois arquivos, o
    `selo` é igual. Há pelo menos 10 chaves em comum (o teste não pode passar com a interseção vazia).
- [ ] **Passo 2:** no mobile, `node --require ./scripts/stub-de-imagens.cjs --import tsx --test src/services/metricas/explicacoes.test.ts`;
  no frontend, `npx vitest run src/lib/metricas/paridade.test.ts`. Esperado: FALHA nos dois.
- [ ] **Passo 3: ler as fontes e escrever o JSON do app** (textos de aluno, curtos e em segunda
  pessoa). Fontes:
  - `profileMetricsViewModel.ts:308-507`;
  - `sequenciaDeDias`: olha só os últimos 7 dias, então a sequência nunca passa de 7. O texto diz
    isso;
  - `services/faixaXp` e `xp_faixa`;
  - a origem de `presenca` (`StudyPresence`) para `diasAtivos`;
  - `sessionEngajamento` é ativo ÷ (ativo + parado) só desde que o app abriu;
  - "recente" é a telemetria desde a abertura do app, já incluída no total.

  As chaves `aluno.*` vindas da Tarefa 6 usam o mesmo selo.
- [ ] **Passo 4:** os dois comandos. Esperado: PASSA.
- [ ] **Passo 5: commit** `feat(mobile): catálogo das explicações de métricas, com paridade de selo`.

### Task 8: componente do app e painéis do Perfil

**Arquivos:**
- Criar: `mobile/src/components/metricas/ExplicacaoDaMetrica.tsx`
- Modificar: `mobile/src/components/perfil/ProfileMetricsViews.tsx` (`StatTile`, `ProgressLine`,
  `SectionTitle` e os cinco painéis, mais `TempoEstudoSection`, `BossSection` e
  `MelhorTempoSection`)
- Teste: `mobile/src/components/perfil/explicacoesNosPaineis.test.ts` (em `testes/principal.txt`)

**Interfaces:**
- Consome: `explicacaoDe`, `rotuloAcessivel`, `CHAVE_DO_CAMPO`, `FRASE_DO_SELO`, `ROTULO_DO_SELO`
  (Tarefa 7).
- Produz:
  - `export type CoresDaExplicacao = { texto: string; suave: string; fundo: string; borda: string; destaque: string }`
    (neutro de propósito: o painel usa `ThemePalette` com `text`, `muted`, `card`, `border` e
    `accent`; a faixa e o topo do Perfil usam `ProfileShellPalette` com `text`, `textMuted`,
    `surface`, `border` e `accent`. Cada chamador monta o objeto);
  - `export function ExplicacaoDaMetrica({ chave, cores }: { chave: ChaveMetrica; cores: CoresDaExplicacao })`;
  - prop opcional `explicacao?: ChaveMetrica` em `StatTile`, `ProgressLine` e `SectionTitle`.

- [ ] **Passo 1: teste que falha (fonte).** Ler `ProfileMetricsViews.tsx` como texto e confirmar:
  - toda ocorrência de `<StatTile` e de `<ProgressLine` (até o `/>` seguinte) contém `explicacao=`;
  - todo `explicacao=` usa `CHAVE_DO_CAMPO.<campo>`, e não uma string solta, para o rótulo temático
    nunca decidir a chave (foco 4);
  - `ExplicacaoDaMetrica.tsx` contém `information-outline` e não contém `help-circle-outline`.
- [ ] **Passo 2:** rodar o teste. Esperado: FALHA.
- [ ] **Passo 3: implementar o componente.**
  - `Pressable` com `hitSlop` até 44×44 pt, `accessibilityRole="button"` e
    `accessibilityLabel={rotuloAcessivel(chave)}`, mostrando `information-outline` com `size={16}`.
  - `Modal` `transparent`, `animationType="fade"`, `onRequestClose` fechando (foco 5).
  - Cartão com `cores.fundo` e `cores.borda`, texto `cores.texto`, títulos e frase do selo em
    `cores.suave`, ícone em `cores.destaque`, num `ScrollView` com altura máxima de 80%.
  - Contraste: o teste da Tarefa 8 confere, nos 7 perfis, `texto` e `suave` sobre `fundo` com pelo
    menos 7:1 usando `tinycolor.readability`, para as duas paletas de onde as cores saem.
  - Botão "Entendi" para fechar.
- [ ] **Passo 4: plugar.**
  - No celular, o ícone vai ao lado do rótulo (`kpiCelularRotulo`). No largo, ao lado de `statLabel`.
  - O ícone fica num `Pressable` próprio. No celular o card não é tocável hoje; onde for, o toque no
    ícone não chega ao card (foco 1).
  - Em cada painel, passar `explicacao={CHAVE_DO_CAMPO.<campo do value>}`.
- [ ] **Passo 5:** `npm test` e `npm run typecheck` no mobile. Esperado: PASSA.
- [ ] **Passo 6: commit** `feat(mobile): o Perfil explica cada métrica`.

### Task 9: topo do Perfil, ranking, conferência visual, CI local e PR

**Arquivos:**
- Modificar: `mobile/src/components/perfil/FaixaXpCartao.tsx`, o componente que recebe
  `sequencia={...}` em `app/(tabs)/perfil/index.tsx:433`, `app/(tabs)/ranking/[id].tsx` (posição e
  pontos).
- Teste: estender `explicacoesNosPaineis.test.ts` para que esses três arquivos contenham
  `<ExplicacaoDaMetrica` com `aluno.faixa_xp`, `aluno.sequencia` e `aluno.ranking`.

- [ ] **Passo 1:** estender o teste. Rodar. Esperado: FALHA.
- [ ] **Passo 2: plugar** os três. No `FaixaXpCartao`, o ícone fica ao lado do título do nível; o
  comentário "sem ícone" fala de medalha, troféu e estrela, então acrescentar que o de informação é
  a explicação, não um enfeite.
- [ ] **Passo 3:** rodar o teste. Esperado: PASSA. Commit
  `feat(mobile): faixa, sequência e ranking explicam como são contados`.
- [ ] **Passo 4: CI local, comandos exatos do `ci.yml`.**
  - Raiz: `python scripts/verifica_encoding_docs.py`.
  - Frontend: `npm run lint && npm run typecheck && npm test && npm run build`.
  - Mobile: `npm run lint && npm run typecheck && npm test`, mais os 5 grupos isolados:
    `test:social-chat`, `test:class-selection`, `test:engagement`, `test:presence` e
    `test:trail-resume`.
  - Esperado: tudo verde. Saída guardada para o corpo do PR.
- [ ] **Passo 5: console no navegador do app.** Painel da turma, largo e 375 px: abrir ao menos um
  ícone por aba. Conferir que o clique no ícone da tabela não abre o aluno (foco 1), que o rótulo
  longo quebra sem empurrar o número (foco 3) e que a explicação abre pelo teclado (Tab, Enter).
  Tirar capturas.
- [ ] **Passo 6: Android.** Emulador e APK de dev. Abrir o Perfil em dois painéis temáticos e abrir
  uma explicação em cada; voltar com o botão do Android (foco 5); faixa, sequência e ranking. Só
  encerrar o emulador que esta sessão abriu.
- [ ] **Passo 7: PR.**
  - Antes: `gh auth status` (conta Geisbelly) e `git push -u origin feat/metricas-explicadas`.
  - `gh pr create --repo BitStudioLabs/trail-up` com: o que mudou, a tabela de chaves e selos, os
    follow-ups, a saída do CI local, as capturas e a nota de que o CI do GitHub está sem cota.
  - Nunca mesclar.
