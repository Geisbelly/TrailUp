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

**O perigo é uma inconsistência que já existe:** `fn_evento_classe_apurar` soma
`GREATEST(ea.valor, 0)`. Logo uma derrota **reduz o rank da turma mas não reduz
a pontuação dentro de um evento**. Isso não é bug hoje (não há valor negativo),
mas passa a ser no instante em que a aposta existir. Decidir qual das duas está
certa é parte da fase 4, e a decisão tem de ser a mesma nos dois lugares.

Aposta também pede teto: sem piso, uma sequência de derrotas leva o aluno a
pontuação negativa e ao fim da lista — o que é desmotivador justamente para quem
já está perdendo. O piso vai em `app_config` (`ranqueada_piso_pontos`), e a
checagem é no banco, no mesmo lugar que recalcula o valor.

## Mapa do pedido para o que já existe

| Pedido | Onde vive hoje | Falta |
| --- | --- | --- |
| Eventos | `eventos_classe` + `_missoes` + `_resultado` + `_resultado_guilda`, `fn_evento_classe_apurar`, 4 RPCs | nada estrutural |
| Competição em grupo | `eventos_classe.modalidade_guilda` + `guilda_evento_snapshot` | nada |
| Batalhas | `guilda_desafios` + `_questoes` + `_respostas` + `desafio_participantes`, 7 RPCs `arena_*` | eixo de consequência |
| Solo / dupla / guilda | `guilda_desafios.formato` | `turma` |
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
2. **`missoes` + `missao_aluno`**, com RLS e policy **no mesmo commit** (regra do
   CLAUDE.md: tabela nasce com RLS ligada e, sem policy, invisível). Migração de
   `atividades.tipo='missao'`. Console lê e escreve missão de professor.
3. **Critério compartilhado.** Extrair de `trg_eventos_aluno_after_iud` o
   avaliador das 12 métricas para `fn_avaliar_metrica(p_aluno, p_criterio)`, e
   fazer conquista **e** missão chamarem a mesma função. Fase de maior risco —
   ver limites.
4. **Pontuação e aposta.** Linhas novas em `eventos_pontuacao` (incluindo
   `ranqueada_derrota` com `pontos` negativo); `ranqueada` passa a escrever em
   `eventos_aluno`; piso em `app_config`; **a divergência
   `sum(valor)` × `GREATEST(valor,0)` é resolvida nos dois lugares no mesmo
   commit**; `rank_tipo` ganha os tipos e o mobile/console ganham o `criterio`.
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
   rank de missão, painel do professor.

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
- **O preset difícil não existe sem questão marcada como difícil.**
  `desafio_dificuldade_min` pressupõe uma marcação de dificuldade em `questoes`,
  que **não existe hoje** (as colunas são enunciado, tipo, alternativas,
  resposta_correta, midia_url, nota_estabelecida). Ou a fase 1 acrescenta essa
  marcação, ou "questão mais difícil" começa como proxy (ex.: a questão que a
  turma mais errou, por `questao_aluno`) — que é medível e não pede coluna nova.
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
