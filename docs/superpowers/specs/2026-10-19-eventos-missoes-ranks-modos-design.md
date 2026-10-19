# Eventos, missões, ranks e modos — desenho

> Estado antes desta mudança: **a maior parte dos primitivos já existe.** 27
> tabelas e ~50 funções cobrem evento, guilda, arena, rank, conquista e moeda.
> O que falta não é motor — é (1) missão como entidade, (2) missão diária por
> IA, (3) o eixo treino/ranqueada, e (4) o vocabulário de modos.

Este documento parte do que está no banco em 2026-10-19, conferido com
`pg_class`/`pg_proc`/`pg_policy`, não com leitura de código.

## O vocabulário: dez "modos" são três eixos

O pedido lista solo, guilda, batalha, treino, rápido, difícil, ranqueada,
competição em grupo. Isso **não** são oito modos: são combinações de três eixos,
e dois deles já existem em `guilda_desafios`.

| Eixo | Pergunta que responde | Hoje | Valores |
| --- | --- | --- | --- |
| **Composição** | quem joga junto | `guilda_desafios.formato` | `solo`, `dupla`, `guilda`, `turma` (novo) |
| **Regra** | como se pontua | `guilda_desafios.modo` | `todos`, `velocidade`, `precisao` |
| **Dificuldade** | quanto aperta | **não existe** | `normal`, `dificil` |
| **Consequência** | se conta para algo | **não existe** | `treino`, `ranqueada`, `evento` |

"Modo rápido" é `regra = velocidade`. "Modo treino" e "ranqueada" são o mesmo
confronto com `consequencia` diferente. Achatar os eixos num enum único dá
4 × 3 × 2 × 3 = 72 rótulos para manter em quatro lugares (banco, API, console,
mobile); como eixos, são quatro colunas e quatro listas curtas.

**Dificuldade é eixo, não valor de `regra`.** "Modo difícil" foi definido como
quatro coisas ao mesmo tempo — questão mais difícil, menos tempo, menos
tentativas e aposta maior. Isso é um **preset de parâmetros**, ortogonal a *como
se pontua*: dá para ter difícil-por-velocidade e difícil-por-precisão. Colocar
`dificuldade` como valor de `modo` misturaria os dois e tornaria essas duas
combinações inexpressáveis.

O preset vive em `app_config`, não no código, porque os quatro números vão ser
ajustados por sensação de jogo:

| chave | normal | dificil |
| --- | --- | --- |
| `desafio_tempo_seg_*` | 60 | 30 |
| `desafio_tentativas_*` | 2 | 1 |
| `desafio_aposta_fator_*` | 1.0 | 2.0 |
| `desafio_dificuldade_min` | — | **pendente** (ver limites) |

Uma chave por parâmetro e dificuldade (`_normal` / `_dificil`), como o resto de
`app_config`, que é escalar plano. Todas `publico = false`: a policy
`app_config_sel` é `USING (publico)` para `anon` **e** `authenticated`, então
marcar público abriria o parâmetro para quem não fez login. O cliente recebe os
valores efetivos pela RPC do desafio.

**A consequência é o eixo que carrega a regra de negócio:** `treino` não escreve
em `eventos_aluno`, então não pontua, não move rank e não paga moeda — e é isso
que o torna um lugar seguro para errar. `ranqueada` e `evento` escrevem.

> **Correção, feita na fase 1.** Este documento dizia que o default devia ser
> `treino`, por "na dúvida, não pontua". Está errado, e a medição mostrou por quê:
> `arena_encerrar` **já** escreve em `eventos_aluno` (`desafio_vencido`,
> `desafio_empate`, `desafio_participou`), e os três já têm linha em
> `eventos_pontuacao` valendo 12/6/3 pontos e 3/1/0 moedas. A arena está ligada
> para pontuar; há zero linhas só porque ninguém a usou ainda. Com `treino` como
> default, a fase 4 desligaria a pontuação de todo desafio existente em silêncio.
> **O default é `ranqueada`**, e `treino` é escolha explícita de quem cria.
> "Na dúvida não pontua" vale para superfície nova, não para coluna acrescentada
> a uma superfície que já pontua.

### Aposta: perder ponto já funciona, e isso é bom e perigoso

"Aposta maior" só significa algo se também se puder perder. Conferido no banco:

- `eventos_aluno.valor` **não tem CHECK `>= 0`** (o mínimo em produção hoje é 0);
- `vw_rank_posicoes_por_classe_todas` faz **`sum(e.valor)` bruta** — negativo
  reduz a pontuação da turma.

Então a derrota ranqueada não precisa de schema novo: é uma linha em
`eventos_pontuacao` com `pontos` negativo (`ranqueada_derrota`), que
`trg_eventos_aluno_valor_do_banco` propaga como qualquer outro tipo. O fator de
atraso nem se aplica, porque ele só roda `IF COALESCE(NEW.valor,0) > 0`.

> **Correção, feita na fase 4.** Três coisas no parágrafo acima não funcionam
> como escritas.
>
> **a) `eventos_pontuacao` TEM `CHECK (pontos >= 0)`.** Este documento conferiu
> que `eventos_aluno.valor` não tem (verdade) e concluiu que a tabela de
> **preços** também não. O INSERT da derrota falharia na própria migração. O
> CHECK não foi derrubado — ele é o que impede um dígito errado numa linha de
> preço virar pontuação negativa para todo mundo (só `service_role` escreve ali;
> o cliente tem SELECT e nada mais, verificado). A coluna `penalidade` marca
> quem pode ser negativo, e o CHECK vira `pontos >= 0 OR penalidade`: as outras
> 18 linhas seguem protegidas.
>
> **b) O nome é `desafio_derrota`, não `ranqueada_derrota`** — a família
> existente é `desafio_vencido` / `desafio_empate` / `desafio_participou`, e o
> valor sai de `fn_pontos_do_evento(tipo)` por nome de tipo.
>
> **c) O fator de dificuldade não pode vir no INSERT.**
> `trg_eventos_aluno_valor_do_banco` descarta o `valor` do cliente e o recalcula
> por `fn_pontos_do_evento(tipo)`, então a aposta seria descartada uma linha
> depois; e um tipo de evento por dificuldade multiplicaria a tabela de preços
> por cada eixo novo. Virou `fn_fator_de_aposta(referencia)`, irmã de
> `fn_fator_de_atraso`, aplicada no mesmo lugar — **com a guarda em `<> 0` e não
> `> 0`**, senão nunca alcançaria a derrota, que é o único valor negativo do
> sistema (com `> 0` a dificuldade dobraria o prêmio e deixaria o risco igual).

**O perigo é uma inconsistência que já existe:** `fn_evento_classe_apurar` soma
`GREATEST(ea.valor, 0)`. Logo uma derrota **reduz o rank da turma mas não reduz
a pontuação dentro de um evento**. Isso não é bug hoje (não há valor negativo),
mas passa a ser no instante em que a aposta existir. Decidir qual das duas está
certa é parte da fase 4, e a decisão tem de ser a mesma nos dois lugares.

> **Decisão, tomada na fase 4: unificado em `sum(valor)` — a derrota desconta
> nos DOIS.** O `GREATEST` nunca foi uma posição sobre economia; foi escrito
> quando valor negativo não existia. O que torna isso viável sem a espiral é o
> piso do parágrafo seguinte, que este documento já previa.
>
> **E tirar o `GREATEST` não bastou, o que só a execução mostrou:**
> `eventos_classe_resultado` e `eventos_classe_resultado_guilda` têm cada uma
> `CHECK (pontos >= 0)` na coluna de **destino**. A primeira apuração com uma
> derrota abortava inteira com `23514` — o evento não fecha, ninguém recebe
> medalha, e o erro aparece longe da causa. Os dois CHECKs saíram. São diferentes
> do de `eventos_pontuacao` (que ficou, marcado por `penalidade`): lá a linha é
> preço escrito à mão, aqui a coluna é resultado de um `sum()` que passa a poder
> ser negativo por desenho. Placar negativo é menos grave que apuração que não
> roda.
>
> `participou` continua `COUNT(ea.id) > 0` (jogar conta como participar mesmo
> perdendo) e `destaque` continua exigindo `pontos > 0`.

Aposta também pede teto: sem piso, uma sequência de derrotas leva o aluno a
pontuação negativa e ao fim da lista — o que é desmotivador justamente para quem
já está perdendo. O piso vai em `app_config` (`ranqueada_piso_pontos`), e a
checagem é no banco, no mesmo lugar que recalcula o valor.

## Mapa do pedido para o que já existe

| Pedido | Onde vive hoje | Falta |
| --- | --- | --- |
| Eventos | `eventos_classe` + `_missoes` + `_resultado` + `_resultado_guilda`, `fn_evento_classe_apurar`, 4 RPCs | nada estrutural |
| Competição em grupo | `eventos_classe.modalidade_guilda` + `guilda_evento_snapshot` | nada |
| Batalhas | `guilda_desafios` + `_questoes` + `_respostas` + `desafio_participantes`, 7 RPCs `arena_*` | eixo de consequência **e o fim do jogo** — ver fase 8 |
| Solo / dupla / guilda | `guilda_desafios.formato` | `turma` **e quem CRIA cada formato** — ver fase 10 |
| Rápido / difícil | `guilda_desafios.modo` | `dificuldade` |
| Ranks | `ranks`, `rank_tipo`, `vw_rank_posicoes_por_classe` | linha de `rank_tipo` para ranqueada |
| Ranqueada | — | `consequencia = 'ranqueada'` + rank próprio |
| Treino | — | `consequencia = 'treino'` |
| Missões do professor | `atividades` com `tipo = 'missao'` | virar entidade própria |
| Missões diárias por IA | — | tudo |
| Missões de guilda | — | `missoes.escopo = 'guilda'` |

## Missão vira entidade

Hoje missão é `atividades` com `tipo = 'missao'`, presa a um `topico_id` que o
professor criou. Missão diária não tem tópico de professor, e inventar um tópico
sintético por aluno polui a trilha e o denominador de
`trailup_recalcular_topico_aluno` — que é exatamente onde o CLAUDE.md avisa que
"a conta certa nunca sobrevivia".

```
missoes
  id, classe_id, origem, escopo, titulo, descricao,
  criterio jsonb, recompensa_tipo text, janela_inicio, janela_fim,
  perfil_alvo text, ativa, criado_por, criado_em
```

- **`origem`** `professor | ia | sistema` — quem a criou. Define quem pode editar.
- **`escopo`** `aluno | turma | guilda` — quem a cumpre. `guilda` é a missão de
  guilda do pedido, sem tabela nova.
- **`criterio`** reusa **o vocabulário de `fn_conquista_metrica_suportada`**
  (`dias_seguidos`, `minutos_totais`, `acertos_percentual`, `topicos_concluidos`,
  `atividades_rapidas`, …). Isso é o ponto mais importante do desenho: o motor
  que avalia essas 12 métricas **já existe** em `trg_eventos_aluno_after_iud`.
  Missão não ganha motor paralelo.
- **`recompensa_tipo`** é uma chave de `eventos_pontuacao`, não um número. Pontos
  e moedas saem de lá, e `eventos_pontuacao_classe` já permite o professor
  sobrescrever por turma. Gravar o número na missão duplicaria a tabela de
  recompensa e furaria o override.

`missao_aluno (aluno_id, missao_id, status, progresso, concluida_em)` espelha
`conquistas_aluno`. A migração de `atividades.tipo='missao'` é um `INSERT ... SELECT`
mantendo o id antigo em `metadata.atividade_origem_id`; as entregas existentes
continuam em `atividade_aluno` e não são movidas.

## Missão diária: lote por coorte

Decisão: **um lote por coorte, não por aluno.** Coorte é
`(classe × perfil BrainHex dominante)`. É o mesmo recorte que o CLAUDE.md já usa
para o material base — "material compartilhável por `(classe × tópico × perfil)`,
reusado entre alunos do mesmo perfil". Sete perfis por turma em vez de N alunos.

A fila já existe e já tem o formato de coorte:
`personalizacao_job_targets.brainhex_profile_key` + `is_profile_template`. E
`personalizacao_jobs.kind` **não tem CHECK** (conferido), então o tipo novo
`missao_diaria` entra sem migração de constraint.

```
pg_cron (banco)          →  enfileira missao_diaria por (classe × perfil)
worker da API (Gemini)   →  gera texto/tom por coorte, grava em missoes
trigger/RPC (banco)      →  atribui a cada aluno do perfil em missao_aluno
```

Isso respeita a regra de fronteira nos dois sentidos: **enfileirar e atribuir
não têm modelo de linguagem no meio, então ficam no banco**; gerar tem, então
fica na API.

### Quando a LLM cai

`fn_missao_diaria_deterministica(p_classe_id, p_perfil)` escolhe entre um
conjunto fixo de moldes, parametrizados por telemetria e progresso do próprio
aluno (dias seguidos, minutos do dia anterior, tópico mais atrasado,
`acertos_percentual` recente). Sem LLM nenhum.

A ordem é **determinístico primeiro, LLM enriquece depois**: o `pg_cron` grava a
missão determinística na hora, e o job da API apenas **reescreve título e
descrição** quando roda. Assim o aluno tem missão mesmo com a API fora do ar, e
nunca existe o estado "sem missão hoje".

### Correção: o índice da diária precisa de `slot`

Este documento dizia que um índice `(classe_id, perfil_alvo, dia)` "impede duas missões do
mesmo dia para a mesma coorte". Isso **contradiz as 2–3 por dia** decididas logo abaixo. A
chave é `(classe_id, coalesce(perfil_alvo, ''), dia, slot)`, parcial em `dia IS NOT NULL`:

- `slot` permite 2–3 por dia **e** dá idempotência ao gerador;
- `coalesce` porque diária sem perfil alvo é legítima, e vários NULL **não** colidem num
  índice único — medido: sem ele o gerador duplicaria;
- parcial para não restringir missão de professor, que tem `dia` nulo.

`ON CONFLICT` sobre índice parcial exige repetir o predicado. Feito em `20261021_02`.

### Quantas, e a que hora

**2 a 3 por dia**, por `app_config` (`missao_diaria_min` = 2,
`missao_diaria_max` = 3) e não no código — a quantidade vai mudar por sensação.
Com 2–3 o gerador tem de evitar repetir métrica no mesmo dia: duas missões de
`dias_seguidos` são a mesma missão com texto diferente.

**Vira à meia-noite de `America/Sao_Paulo`.** Três detalhes que custam caro:

- `pg_cron` agenda em **UTC**. Meia-noite de Brasília é `0 3 * * *`. O Brasil não
  tem horário de verão desde 2019, então o deslocamento é fixo em -3 hoje — mas
  o cálculo da data usa o **nome** do fuso (`AT TIME ZONE 'America/Sao_Paulo'`),
  não `-3`, para não quebrar se o horário de verão voltar.
- `missoes` guarda o **dia como `date`** naquele fuso, não um `timestamptz` de
  corte. É o que torna "a missão de hoje" uma comparação de igualdade em vez de
  uma janela, e o que impede duas missões do mesmo dia para a mesma coorte (basta
  um único índice `(classe_id, perfil_alvo, dia)`).
- O CLAUDE.md avisa que `criado_em` em `eventos_aluno` é `timestamp without time
  zone` gravado por `now()` numa sessão UTC. Derivar o dia do aluno a partir
  dessa coluna exige `AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'` — na
  ordem certa, senão o dia desliza três horas e a missão da madrugada conta no
  dia errado.

### Missão de guilda precisa de aprovação

Professor **e** sistema podem propor missão de guilda, mas a do sistema só vale
depois que o professor aprova. Isso já tem padrão pronto neste banco:
`intervencoes` deixa o professor aceitar ou descartar o que a IA escreveu, e
**GRANT por coluna** garante que ele mexa só em `status`, `motivo_descarte` e
`resolved_at` — nunca no texto gerado (conferido em
`information_schema.column_privileges`).

`missoes` reusa isso:

- `aprovacao` `nao_requer | pendente | aprovada | recusada`;
- `origem = 'professor'` nasce `nao_requer`; `origem IN ('ia','sistema')` com
  `escopo = 'guilda'` nasce `pendente`;
- UPDATE para `authenticated` **só** nas colunas de aprovação, pelo mesmo
  mecanismo de `intervencoes`;
- missão `pendente` não aparece para o aluno e não é atribuída.

> **Assunção a confirmar:** aprovação exigida só para `escopo = 'guilda'`. A
> missão diária individual (`escopo = 'aluno'`) continua automática — se ela
> também precisasse de aprovação, o desenho de meia-noite cai por terra, porque
> dependeria de um professor acordado às 3h UTC.

> Isso inverte o que parecia natural (LLM gera, fallback cobre). Gerar primeiro
> pela LLM deixa uma janela em que o aluno abre o app e não tem nada —
> justamente de manhã, que é quando ele abre. A API é auto-hospedada no Dokploy
> e cai; o banco não.

Gemini, como o resto do projeto (`geminiService.ts` no microservice,
`langchain-google-genai` na API).

### Furo: as 12 métricas são acumuladas, não de delta — **resolvido na 5b**

Achado ao implementar. `minutos_totais` é a soma de toda a vida, `dias_seguidos` é a maior
sequência, `topicos_concluidos` é contagem total. Uma missão **diária** sobre elas nasce
cumprida para aluno ativo, ou pede um alvo de vida inteira que não tem nada a ver com hoje.

Duas saídas, e a segunda está errada:

1. **Métricas de delta novas** (`minutos_no_dia`, `eventos_no_dia`), com o dia vindo no
   próprio `criterio`. Ramos novos em `fn_avaliar_metrica`, que é aditivo e seguro. E o
   insumo **já existe**: `aluno_atividade_diaria` tem `dia`, `tempo_uso_seg` e até a coluna
   `timezone` (236 linhas em produção) — nenhuma tabela nova.
2. ~~Alvo como "valor atual + delta", fotografado por coorte na geração.~~ Não serve: a
   coorte é heterogênea, então um alvo derivado do agregado dela é inalcançável para quem
   está atrás e trivial para quem está à frente.

A fase 5b fez (1). Ver a seção da 5b abaixo pelas ressalvas de fuso que ficaram abertas.

## Ranks

Decisão: **por turma, pontos acumulados.** Nada de rating tipo Elo nesta fase, e
nada de ladder global — ladder global quebraria o isolamento por turma que a RLS
garante, e isso é decisão de privacidade, não de produto.

**Competição em grupo é entre guildas da mesma turma, só.** Mesma razão, e com
uma consequência prática boa: `eventos_classe.classe_id` já amarra o evento à
turma, e `guilda_evento_snapshot` congela a composição dentro dela. Nenhuma
tabela nova, e nenhuma policy que cruze turma — o que significa que nada aqui
depende de `app_alunos_do_professor()`, o helper que o PR #538 está consertando.

O caminho mais curto já está pronto: **tudo que pontua escreve em
`eventos_aluno`**, e `vw_rank_posicoes_por_classe` já agrega. Então rank de
evento, de missão e de ranqueada não são três ranks — são linhas novas em
`eventos_pontuacao` e, para quem quiser um rank separado na tela, linhas em
`ranks` apontando para um `rank_tipo`.

Tipos de evento novos a inserir em `eventos_pontuacao`:

| tipo | quando | observação |
| --- | --- | --- |
| `missao_concluida` | missão de qualquer origem | moedas via a mesma linha |
| `missao_diaria_concluida` | só a diária | separado para o rank de constância |
| `ranqueada_vitoria` / `_empate` | `consequencia = 'ranqueada'` | treino não escreve |
| `evento_destaque` | top 3 de `eventos_classe_resultado` | já há medalha; isto é o ponto |

`fn_pontos_do_evento` devolve 0 para tipo desconhecido — "o evento fica
registrado, mas não pontua". Então **inserir o tipo antes da linha de pontuação
é seguro**: a feature liga sem pontuar e começa a pontuar quando o professor (ou
o seed) define o valor.

**`rank_tipo` é catálogo global e `criterio` é conjunto fechado** comparado
contra literais no mobile. Rank novo = linha nova em `rank_tipo` **e** tratamento
do `criterio` no mobile e no console, no mesmo commit. Ver PR #540: o console
oferecia criar tipo de ranking e a escrita nunca funcionou.

## Fases

Cada fase é mesclável sozinha e não quebra a anterior.

> **Numeração.** As fases encadeiam **depois** de economia (#544), que já está aplicada em
> produção: a cadeia é `20261017_10 → 20261018_* → 20261019_* → 20261020_* (economia) →
> 20261021_* (estas fases)`. A numeração `20261019_04…_06` da primeira versão criava segunda
> head ao lado de economia.

1. **Eixos.** `consequencia` (default `ranqueada` — ver a correção acima) e
   `dificuldade` (default `normal`) em `guilda_desafios`, `turma` em `formato`.
   Só colunas, CHECKs e seis chaves de preset em `app_config`, todas privadas.
   A arena continua funcionando porque os defaults preservam o comportamento
   medido. `desafio_dificuldade_min` fica de fora: depende da decisão sobre
   marcação de dificuldade em `questoes`. **Feita** — `20261021_01`.
   (Essa decisão foi tomada e implementada na **fase 9**: coluna explícita, e a chave passou
   a existir como *preferência*. Esta linha ficava dizendo "fica de fora" muito depois de a
   peça existir.)
2. **`missoes` + `missao_aluno`**, com RLS e policy **no mesmo commit** (regra do
   CLAUDE.md: tabela nasce com RLS ligada e, sem policy, invisível). Migração de
   `atividades.tipo='missao'`. Console lê e escreve missão de professor.
3. **Critério compartilhado.** Extrair de `trg_eventos_aluno_after_iud` o
   avaliador das 12 métricas para `fn_avaliar_metrica(p_aluno, p_criterio)`, e
   fazer conquista **e** missão chamarem a mesma função. Fase de maior risco —
   ver limites.
4. **Pontuação e aposta.** Linhas novas em `eventos_pontuacao` (incluindo
   `desafio_derrota` com `pontos` negativo); `ranqueada` passa a escrever em
   `eventos_aluno` e `treino` passa a não escrever nada; piso em `app_config`;
   **a divergência `sum(valor)` × `GREATEST(valor,0)` é resolvida nos dois
   lugares no mesmo commit**; `rank_tipo` ganha os tipos e o mobile/console
   ganham o `criterio`. **Feita** — `20261021_06` (+ as correções da seção
   "Aposta", acima, e as duas abaixo).

   > **O `ELSE 0` da view do rank ranqueia a turma inteira em zero, em
   > silêncio.** `vw_rank_posicoes_por_classe_todas` tem
   > `CASE rt.criterio WHEN 'percentual' / 'pontuacao' / 'tempo' ELSE 0`, e
   > `ELSE 0` não é erro. Duas consequências medidas em produção, as duas da
   > família do PR #540:
   >
   > - o console oferecia `acertos` e ele **não existia no CASE** — todo ranking
   >   de acertos sempre mostrou zero para todos. A coluna existe
   >   (`classe_aluno."acertosPercentual"`) e a view já faz join em
   >   `classe_aluno`, então o ramo é uma linha: consertou-se o cálculo em vez de
   >   tirar a opção;
   > - `percentual` existia no CASE e tem linha na tabela, mas não existia no
   >   console: `criterioValido` reescrevia o critério para `pontuacao` ao abrir
   >   a edição.
   >
   > Corolário para quem acrescentar critério: **o ramo do CASE e a lista do
   > cliente são o mesmo commit.** O mobile entra na conta — `formatRankScore`
   > trata `percentual` e `acertos` como porcentagem, e `ranqueada` como número
   > que pode ser **negativo**.

   > **O console mentia nas escritas de `rank_tipo`.** `20260826_09` a
   > classificou como "referência sem dono: qualquer autenticado lê, ninguém
   > escreve pelo app". Medido com papel simulado: `SELECT` devolve 3 linhas,
   > `INSERT` dá `42501`, e **`UPDATE` e `DELETE` afetam 0 linhas sem erro
   > nenhum** — que é o pior caso, porque o console exibia "Tipo de ranking
   > atualizado!" / "excluido!" com o banco intacto (o delete até sumia da tela e
   > voltava no próximo `loadData`). `.select()` nos três handlers transforma a
   > mentira em erro visível. A escrita **não** foi aberta ao cliente: isso
   > contradiria uma decisão registrada. Tipo novo nasce em migração.
5a. **A missão passa a ser avaliada.** O laço de `missoes` entra no gatilho, reusando os
   mesmos agregados, com guarda de recursão por sinal de sessão e `EXCEPTION` próprio.
   **Esta fase não existia neste plano** — a 3 dizia "a fase seguinte percorre `missoes`" e a
   4 é pontuação, então a peça ficou sem dono. Sem ela a missão da fase 2 nunca completa.
   **Feita** — `20261021_04`.

5b. **Missão diária determinística.** `fn_missao_diaria_gerar`, índice único
   `(classe_id, coalesce(perfil_alvo,''), dia, slot)` parcial e `pg_cron` em
   `0 3 * * *` (meia-noite de `America/Sao_Paulo`). Já entrega valor sem nenhuma
   LLM. Moldes usam só métricas de delta (`minutos_no_dia`, `eventos_no_dia`).
   Aprovação de missão de guilda entra aqui, junto com o GRANT por coluna.
   **Feita** — `20261021_05` (+ correção da guarda, abaixo).

   > **Correção da guarda (achada pela fase 6).** `fn_missoes_guarda` da fase 2
   > só aceitava as 12 métricas de conquista + `atividade_especifica`. O primeiro
   > INSERT do gerador levantava `22023 Metrica nao suportada: minutos_no_dia`,
   > e **o cron das 0h abortaria inteiro toda noite**. A guarda foi recriada a
   > partir do corpo da fase 2 trocando só a checagem de métrica, e passa a
   > **exigir `criterio.dia`** nas duas de delta. Sem isso, nenhuma missão diária
   > seria gravada. Medido de novo: 29 missões / 11 coortes, 2ª passada 0, molde
   > repetido 0.

   > **Ressalvas a não enterrar** (medidas na 5b, mantidas de propósito):
   > - O teste de ordem da conversão de fuso deu **1 vs 1** — com um evento só no
   >   dia, ele não distingue `AT TIME ZONE 'UTC' AT TIME ZONE <fuso>` da ordem
   >   invertida. A ordem está certa por princípio, não por medição.
   > - `aluno_atividade_diaria` fecha o dia no **fuso do aparelho**. Há quatro em
   >   uso na base; três são UTC-3 e coincidem (`Sao_Paulo`, `Araguaina`,
   >   `Fortaleza`). Só `UTC` divergiria: `minutos_no_dia` pode contar a atividade
   >   do fim da noite no dia seguinte. Não tratado: re-bucketizar exige o
   >   timestamp cru, e a tabela guarda só o agregado.

6. **Enriquecimento por LLM.** Dois crons separados (um comando com dois
   `SELECT` desharia a geração se o enfileirar falhasse): às 0h o molde; às
   0h05 `fn_missao_diaria_enfileirar_texto` abre um job `missao_diaria` por
   coorte. O worker da API chama Gemini **só para título/descrição**, uma vez
   por missão (`fn_missao_diaria_reescrever_texto`, com sinal
   `app.missao_texto_llm` — UPDATE direto é escrita fantasma pela guarda).
   Filtro de texto na API: mesma meta numérica, sem outro número, unidade
   certa, sem falar de recompensa, sem markdown/link, tamanhos fechados.
   Qualquer recusa, timeout (90s), LLM fora ou schema inválido **mantém o
   molde**. Teto `missao_diaria_llm_max_coortes` padrão **30** (privado); com
   **0** a fase 6 desliga sem deploy. O console esconde esses jobs da trilha e
   do dashboard (não são material). **Feita** — `20261021_07`.

7. **Mobile e console.** Telas de missão diária, seletor de modo nos três eixos,
   rank de missão, painel do professor. **Feita** — `20261021_08` (#555).

   > **O que o banco precisou para a tela existir.** A UI sozinha não bastava:
   > - `guilda_desafio_criar` passou a receber `consequencia` e `dificuldade` —
   >   sem isso o seletor do mobile gravaria só o default;
   > - `fn_desafio_params_efetivos` devolve tempo, tentativas e fator de aposta
   >   do preset, porque as chaves de `app_config` são privadas (fase 1). **Só
   >   outra função a chama**: sem `EXECUTE` para `anon`/`authenticated` (o
   >   portão do #534 pegou isso);
   > - `arena_professor_resumo` devolve os eixos de cada batalha, senão o
   >   console não tem o que mostrar;
   > - critério `missoes` (constância: missões cumpridas por turma) entra no
   >   `CASE` da view **e** em `rank_tipo` no mesmo commit — a lição do `ELSE 0`
   >   da fase 4;
   > - `missoes_diarias_resumo(classe, dia)` alimenta o painel do professor com
   >   quantos alunos de cada perfil cumpriram cada missão do dia.
   >
   > No cliente: painel **Missões do dia** e eixos nas batalhas no console,
   > critério **Missões** nos rankings; seletor dos três eixos ao criar desafio
   > no chat da guilda e cartão **Missões do dia** no Social, no mobile.

8. **O desafio fecha e paga.** `20261021_09`.

   > **Esta fase não existia neste plano, e a falta dela deixava as fases 1 e 4 sem
   > efeito nenhum.** O mapa acima dizia "Batalhas: nada estrutural"; a medição no banco
   > mostra que o fluxo vivo é
   > `guilda_desafio_criar` → mensagem no chat → **nada**. Três juntas abertas:
   >
   > - **`guilda_desafio_criar` não registrava ninguém em `desafio_participantes`.** Como
   >   `fn_arena_placar` lê essa tabela, o placar de todo desafio do caminho vivo era vazio —
   >   e `arena_professor_resumo` (fase 7) mostrava `aceitaram: 0` e `equipes: []` para todos.
   > - **`guilda_desafio_responder` não é chamada por cliente nenhum** e não gravava `tempo_ms`
   >   nem tentativa. Sem `tempo_ms`, `modo = 'velocidade'` não desempata: `t1*n2 <> t2*n1`
   >   com tudo em zero é falso, e o desafio sai `empate`.
   > - **`arena_encerrar` é a única função que fecha e paga** (varrido com
   >   `pg_get_functiondef` sobre as 12 funções que mencionam `guilda_desafio`), e dos sete
   >   `arena_*` os clientes chamam só `arena_professor_resumo`.
   >
   > A fase registra os participantes na criação, cobra `desafio_tentativas_*` de verdade
   > (coluna `tentativas` nova, porque a chave única é `(desafio, questao, aluno)` e o
   > `ON CONFLICT` sobrescrevia a resposta), e torna o fechamento alcançável: o miolo sai
   > para `fn_desafio_encerrar` **sem** checagem de `auth.uid()` — medido: durante o cron
   > `auth.uid()` é `NULL`, então a checagem de participante abortaria toda varredura.
   > `arena_encerrar` mantém a checagem e delega.
   >
   > Dois gatilhos de fechamento, e os dois são necessários: a última resposta fecha, e
   > `fn_desafio_varrer_abandonados` (cron, `*/5`) fecha o que passou de
   > `desafio_encerra_apos_min`. Só o automático não basta — ele exige que **todos** tenham
   > respondido, então um participante que desiste deixaria os outros sem pagamento para
   > sempre.
   >
   > **O limite de TEMPO continua do cliente, de propósito:** para o banco julgar
   > `desafio_tempo_seg_*` ele precisaria saber quando a questão foi ABERTA, e esse registro
   > não existe. Uma guarda a partir de `created_at` do desafio puniria quem abre e responde
   > depois, que é o uso normal.

9. **`questoes.dificuldade`.** `20261021_10`.

   > "Questões difíceis" era a única das quatro definições de difícil sem nada atrás: a
   > seleção do desafio é `ORDER BY random()` e `questoes` não tinha como dizer que uma
   > questão é difícil. Tempo, tentativas e aposta já estavam entregues (preset da fase 1,
   > cobrança da fase 8, fator da fase 4).
   >
   > **Coluna explícita, e foi a medição que decidiu** entre ela e o *proxy* que este
   > documento propunha (a questão que a turma mais errou, por `questao_aluno`): a base tem
   > **1 questão e 2 respostas**. E o problema do proxy não é a base estar vazia hoje — ele
   > **nunca** classifica questão nova, porque questão recém-criada não tem resposta nenhuma,
   > e é exatamente aí que o professor quer marcar. Proxy refina marcação; não substitui.
   >
   > `NULL` é "não marcada" e é o default de propósito: `'media'` afirmaria uma dificuldade
   > que ninguém informou.
   >
   > **Preferência, não filtro — a decisão que mais importa.** O nome
   > `desafio_dificuldade_min` sugere filtro, e filtro não serve: com a base de hoje, todo
   > desafio difícil levantaria `guilda_sem_questoes_liberadas` e o modo ficaria inutilizável
   > até alguém anotar o banco inteiro — **em silêncio**, porque o erro fala de liberação, não
   > de dificuldade. Então a dificuldade entra como ordem: nível pedido (ou acima) primeiro,
   > embaralhado entre si; o resto completa. Medido: com 2 difíceis no banco, as duas são
   > sempre escolhidas; com `min = media`, nenhuma fácil entra; sem anotação nenhuma, o
   > difícil ainda cria.
   >
   > O peso do **não marcado é o meio, não zero** — mandá-lo para o fim faria o difícil de um
   > banco sem anotação preferir justamente as fáceis marcadas.
   >
   > E o `LIMIT 30` teve de sair do caminho, **só no difícil**: antes da ordenação ele faria a
   > preferência olhar 30 questões arbitrárias. Sem ele, `fn_questao_liberada` roda para a
   > turma inteira, então o ramo novo vale apenas para `dificil` — o normal não muda nem em
   > comportamento nem em custo.
   >
   > No cliente, `nivelParaOBanco("") === null` é o ponto crítico: o formulário manda `""`
   > para "não marcada" e `''` **viola o CHECK** (medido). **Ordem de deploy:** a migração
   > tem de ser aplicada antes de o frontend subir — o PostgREST recusa coluna desconhecida
   > na escrita, e no intervalo o console não salvaria questão nenhuma.

10. **O eixo de composição passa a existir.** `20261021_11`.

   > A fase 1 abriu o CHECK para `solo | dupla | guilda | turma` e este documento listou
   > `turma` como a lacuna. Medido depois: **nenhum dos quatro era escolhível.**
   > `guilda_desafio_criar` gravava `formato = 'guilda'` fixo, e `arena_desafio_criar` — a
   > única RPC que recebia `p_formato` — recusa `'turma'` e não é chamada por cliente nenhum.
   > (Para ser preciso: **não havia seletor de formato**; `FORMATOS` existe em
   > `eixosDoDesafio.ts` e nunca foi renderizado. Eixo não entregue, não bug silencioso.)
   >
   > Três coisas que a implementação revelou:
   >
   > - **`guilda_id` tem de ser NULL fora do formato guilda.**
   >   `guilda_desafios_guilda_do_formato` é `(formato = 'guilda') = (guilda_id IS NOT NULL)`,
   >   e o reflexo de gravar `p_guilda_id` sempre viola o CHECK. O desafio não-guilda nasce
   >   sem guilda, e ela fica sendo só o lugar de onde ele foi anunciado — coerente com o que
   >   a fase 1 registrou sobre `turma`.
   > - **Cooperativo passou a ser "não existe equipe 2"**, não `formato = 'guilda' AND rival
   >   IS NULL`. Com os quatro formatos existindo, solo/dupla/turma cairiam no ramo
   >   competitivo, onde `v_jog2 = 0` dá `sem_adversario`: **ninguém venceria nunca.** E o
   >   predicado antigo nunca foi um teste de "sem adversário" — o duelo solo da arena tem
   >   equipe 2 e rival nulo; ele só funcionava porque o formato estava preso a `guilda`.
   > - **A RPC aceitava `modo` que a tabela recusa.** `guilda_desafios_modo_check` permite
   >   três valores; a validação da fase 7 permitia cinco (`duelo`, `duplo`). Pedir `duelo`
   >   passava e estourava `23514` no INSERT, longe da causa. A lista da RPC passa a ser a da
   >   tabela.
   >
   > `dupla` **exige** `p_aliado` (sem ele seria solo com outro nome) e o aliado entra
   > `'aceito'`, não `'convidado'`: não existe fluxo de aceite no caminho vivo
   > (`arena_convite_responder` não é chamada por ninguém), e com `'convidado'` o fechamento
   > automático da fase 8 — que conta só `aceito` — fecharia a dupla sem o parceiro. Enquanto
   > não houver seletor de parceiro, o seletor do mobile filtra `dupla` por um campo
   > explícito (`pedeAliado`) em vez de escondê-la por acidente.

## Decisões que são fáceis de errar

- **`treino` não escreve em `eventos_aluno`.** É o que impede o aluno de moer
  treino para subir no rank. A guarda tem de estar no banco, não na tela:
  `trg_eventos_aluno_valor_do_banco` já congela `tipo` e recalcula `valor`, e é
  ali que o `consequencia` do desafio precisa ser consultado — não no cliente.
- **Recompensa é chave, não número.** Gravar `pontos` em `missoes` furaria o
  override por turma de `eventos_pontuacao_classe`.
- **Missão diária é por coorte, e a coorte pode mudar.** O perfil dominante do
  aluno muda quando `aluno_perfil.afinidade` muda. A missão **já atribuída** não
  se move: `missao_aluno` guarda o vínculo, e trocar de perfil só afeta a missão
  do dia seguinte. Sem isso, o aluno perderia progresso no meio do dia.
- **`escopo = 'guilda'` precisa da composição congelada.**
  `guilda_congelar_composicao` já existe para evento; missão de guilda deve usar
  a mesma, senão entrar na guilda no fim do dia herda o progresso dos outros.
- **Toda tabela nova nasce com policy no mesmo commit.** Dez tabelas deste
  domínio (as nove `guilda_*` mais `desafio_participantes`) hoje têm RLS ligada e
  **zero** policy — elas escapam porque o acesso é só por RPC `SECURITY DEFINER`.
  Isso é decisão, não defeito, e o docstring da migração tem de dizer isso.
  `guildas` mostra o custo de não dizer: o console passou a lê-la direto e
  recebeu lista vazia em silêncio (PR #541).
- **Rótulo com acento.** `status_atividade` é `não iniciado | em andamento | concluido`
  — acento no "não", **sem** acento no "concluido". Escrever errado compila e só
  falha em produção.

## Limites conhecidos

- **A fase 3 mexe no gatilho mais sensível do banco.**
  `trg_eventos_aluno_after_iud` avalia conquista, paga prêmio e tem guarda de
  recursão. Extrair o avaliador é a coisa certa, mas é a única fase que pode
  regredir conquista. Ela deveria vir com teste de estrutura e uma comparação
  antes/depois sobre os dados reais, e não deveria ser mesclada junto com outra
  fase.
- **Sem Elo, "ranqueada" mede volume, não habilidade.** Pontos acumulados
  favorecem quem joga mais. Foi a escolha desta fase; se virar problema, o
  caminho é uma tabela de rating ao lado, não trocar a métrica de `ranks`.
- **Aposta com perda e ladder acumulada se atritam.** Com Elo, perder é neutro a
  longo prazo; com pontos acumulados, perder é dano permanente, e o aluno
  racional **para de jogar ranqueada** depois de abrir vantagem. O piso ameniza,
  não resolve. Se a aposta virar central, é o argumento mais forte para Elo.
- **O piso é do acumulado da turma, não da janela do evento.** Achado ao
  implementar a fase 4: `ranqueada_piso_pontos` impede o **acumulado** do aluno
  naquela turma de descer do piso, e é isso que o rank mostra. Dentro de um
  evento (que é uma janela de tempo) a soma **pode** ficar negativa — foi medido:
  perdedor com `-3`. Isso é coerente (o placar daquele evento é outro placar),
  mas não é o mesmo invariante, e quem for mexer no piso precisa saber qual dos
  dois está protegendo.
- **`eventos_pontuacao_classe.pontos` é coluna morta.** Existe, tem o mesmo
  `CHECK (pontos >= 0)`, e **nunca é lida**: `fn_pontos_do_evento(text)` não tem
  sobrecarga por classe — só `fn_moedas_do_evento(tipo, classe)` consulta a
  versão por classe. A fase 4 não a tocou (abrir o CHECK dela seria superfície
  sem efeito), mas quem ligar preço por turma vai topar nela, e aí o CHECK volta
  a importar.
- ~~**O preset difícil não existe sem questão marcada como difícil.**~~
  **Resolvido na fase 9** (`20261021_10`): `questoes.dificuldade`, com `NULL` para "não
  marcada". O proxy proposto aqui (a questão que a turma mais errou, por `questao_aluno`) foi
  descartado por medição — a base tem 1 questão e 2 respostas, e o proxy **nunca** classifica
  questão nova, que é justamente quando o professor quer marcar.

  O limite que **sobra** é outro, e é o de adoção: enquanto o banco não for anotado, o modo
  difícil escolhe como antes. Por desenho — a dificuldade é preferência, não filtro, senão o
  modo ficaria inutilizável até o último professor marcar a última questão. Então "difícil"
  melhora conforme marcam, e não existe um momento em que ele "liga".
- **Custo da LLM cai, mas não é zero.** Sete perfis × N turmas por dia. Com 50
  turmas são 350 chamadas/dia. Vale medir antes de ligar a fase 6 para todas as
  turmas.
- **A missão diária determinística é tão boa quanto os moldes.** Se os moldes
  ficarem repetitivos, o aluno percebe antes de a fase 6 existir. Vale escrever
  mais moldes do que parece necessário.
- **`atividades.tipo` é texto livre.** Depois da fase 2, `'missao'` em
  `atividades` passa a ser legado. Enquanto as duas coisas coexistirem, a
  listagem de missões do console tem de ler as duas fontes — ou a migração tem de
  ser completa num único passo.
