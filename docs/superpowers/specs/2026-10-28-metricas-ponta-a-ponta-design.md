# Métricas de ponta a ponta — catálogo, validação constante e IA

Spec-guarda-chuva. Define **o que** cada métrica significa, **para quem** ela aparece, **como**
se prova que está certa e **em que ordem** o sistema é consertado. Cada fase (F0–F7) ganha
spec e plano curtos próprios, derivados daqui, e vira um PR.

Levantado em 2026-10-28 contra a produção (Supabase `xrebtkmdewolzmpsdwgh`, só leitura) e o
código da `main` em `cd9fec1b`. Base de partida: o
[mapa do Luís](../../architecture/mapa-dados-metricas-kpis.md) (#565/#566), validado linha a
linha. Julgado por um painel de sete pareceres — crente, cético, educação, gamificação, IA,
auditor de dados e juiz —, cujas divergências o juiz decidiu com evidência (§9).

## 1. Por que

Medido hoje, nenhum KPI do console mede o que o rótulo diz:

| Achado | Medida |
|---|---|
| Tempo de uso inflado por fan-out em `vw_metricas_engajamento_aluno_classe` | 2×, 10× e **81×** contra a soma direta das sessões |
| "Abandono" = tópicos não concluídos / tópicos com linha | aluno no meio da trilha sai **60%**, e `risco.ts` o marca "crítico" |
| "Retorno" = dias ativos / intervalo de dias | 1 dia de uso = 100% |
| Tempo médio de conclusão de tópico | ~1 s (82 de 93 aberturas sem conclusão entram como 0) |
| Acerto com quatro livros-caixa | a mesma atividade (1367) dá 0%, 50%, 50% e NULL; 37 de 38 respostas de `eventos_aluno` apontam para atividade apagada |
| `tempo_gasto_min` com dois gravadores | 7,19 min (telemetria) × 79,42 min (sessões); um tópico tem 4 números |
| Ranking | a view dá `42501` para todo aluno; o mobile cai num cálculo local que expõe a turma inteira |
| Ciclo de IA | **150 de 150** lotes sem análise; 0 linhas em `aluno_mental_state_history` e `ia_decision_logs` |
| Pontos | 48% do XP em turmas apagadas; 10 conquistas pagas sem linha em `conquistas_aluno` |

E a base é estreita: **um** aluno tem telemetria, numa sessão de QA concentrada em 22/10. Nenhum
modelo pode ser treinado nem validado com dado próprio hoje.

"Funcionar 100%" não é mensurável. Esta spec troca a meta por **invariantes que passam ou
falham** (§5) e por uma regra de exibição: número sabidamente errado não aparece (§4).

## 2. Já resolvido em 2026-10-28 (fora desta spec)

- **Causa dos 150 lotes sem análise:** a API estava em `*.traefik.me`, que serve o certificado
  autoassinado do Traefik. O `fetch` do aparelho falhava como rede e caía em
  `persistTelemetryBatchDirect`. Domínios com Let's Encrypt criados: `api.`, `brainhex.` e
  `slides.trailup.promora.dev.br`. Build: [#689](https://github.com/BitStudioLabs/trail-up/pull/689).
- **33 URLs de apresentação** apontavam para `https://trailup-microservice-gmgqkw:3000`
  (container interno, outro serviço). `APP_URL` do slides corrigido e as 33 reescritas.
- **Worker de jobs** registrava `NoneType: None` em vez do traceback (2.305 vezes em 4 h), e
  missão diária ficava presa em `processing` por conexão somente leitura:
  [#688](https://github.com/BitStudioLabs/trail-up/pull/688). A origem da conexão somente
  leitura **não está provada** (hipótese: pooler em modo transação).

## 3. Decisões

| # | Decisão | Consequência |
|---|---|---|
| D-1 | **Tempo de estudo = tempo ativo** (`active_sec`, escopo `topic`) | `tempo_gasto_min` passa a ser tempo ativo; o trigger não versionado `trg_tme_sync_tempo_*` sai; presença (`dwell`) vira métrica própria, "tempo com o material aberto". Números já vistos caem. |
| D-2 | **Métrica cuja invariante falha não é exibida** — aparece "em revisão" | O console e o mobile consultam a disponibilidade antes de desenhar. |
| D-3 | **Pontos órfãos são reconciliados e o aluno é avisado** | Sai do ranking o que é de turma apagada; conquista paga ganha a linha que falta ou é revertida; notificação explica o ajuste. |
| D-4 | **Texto do aluno pode ir a LLM externo**, com pseudonimização, `store=False`, base legal e aceite do responsável (`20261024_02`) | O juiz LLM roda em sombra; nota automática nunca vale para menor antes da promoção (§7). Câmera/emoção ficam fora até o termo biométrico. |
| D-5 | **Uma fonte por fato** | Respostas: `questao_aluno`. Gamificação: `eventos_aluno`. Tempo: `active_sec`. As outras fontes deixam de alimentar KPI. |
| D-6 | **Catálogo e status no banco**, não em arquivo | Funciona com a API fora do ar; respeita a fronteira (CLAUDE.md): nada disto passa pela API, que só lê features e grava decisões. |

## 4. Arquitetura

```
coletor (mobile) ──► banco: uma fonte por fato ──► views/RPCs versionadas (security_invoker)
                                                    │
                       metricas_catalogo ◄──────────┤ cada métrica declara fonte + invariantes
                       invariante_resultado ◄── pg_cron diário (fn_auditoria_metricas_rodar)
                                                    │
                       vw_metricas_disponibilidade ─┴─► aluno (mobile) · professor (console) · dev
API (IA) ──► lê features declaradas como `publico ∋ 'ia'` ──► grava ia_decision_logs
```

### 4.1 Tabelas novas (F0)

- **`metricas_catalogo`** — uma linha por métrica: `chave` (pk), `nome`, `descricao`,
  `publico text[]` (`aluno|professor|dev|ia`), `unidade`, `janela`, `fonte` (view/RPC),
  `formula_versao int`, `nulo_significa`, `n_minimo int`, `requer_validacao`
  (`nenhuma|ml|llm`), `validacao_promovida bool`, `invariantes text[]`. Não é dado pessoal:
  policy de SELECT `true` para `authenticated`; escrita só por migration.
- **`metricas_invariante_resultado`** — `invariante`, `rodado_em`, `ok`, `linhas`. Sem
  identificadores. SELECT para `authenticated`; escrita só pela função de auditoria.
- **`metricas_invariante_amostra`** — até 20 ids das linhas que falharam, para investigação.
  **Sem policy** — só `service_role` (decisão registrada no docstring da migration, como pede o
  CLAUDE.md).
- **`vw_metricas_disponibilidade`** (`security_invoker = on`) — por métrica: `disponivel` =
  todas as suas invariantes `ok` na última rodada **e** rodada há menos de 26 h. Rodada velha
  conta como indisponível: auditoria parada não pode virar "tudo certo".

Invariantes são funções `fn_inv_<id>() returns table (id text)` (as linhas que violam), não SQL
guardado em texto e executado dinamicamente. `fn_auditoria_metricas_rodar()` é
`SECURITY DEFINER`, `search_path=''`, sem GRANT para `anon`/`authenticated`, e roda pelo
`pg_cron` às 03:30 de São Paulo.

### 4.2 Regra de exibição (D-2)

Todo card de métrica, no console e no mobile, tem quatro estados distintos — nunca
colapsados em zero:

| Estado | Quando | O que aparece |
|---|---|---|
| valor | disponível e há observação | o número, com `n` e a data |
| sem dado | disponível e não há observação | "sem dado" (≠ 0) |
| em revisão | invariante falhou ou rodada velha | "em revisão" |
| erro | leitura falhou (RLS, rede) | mensagem de erro (≠ vazio, ≠ 0) |

Segmento com `n < n_minimo` (padrão 5) fica oculto.

## 5. Validação constante

### 5.1 Invariantes (cada uma deve retornar 0)

As I1–I15 vêm do parecer do auditor (SQL completo no apêndice A). Estado em 2026-10-28:

| Id | O que garante | Hoje |
|---|---|---|
| I1 | telemetria idempotente por `(lote_id, scope, entry_key)` | passa |
| I2 | `active + idle ≈ dwell`, nada negativo | passa |
| I3 | escopo aninhado: `content ≤ topic` no mesmo lote | passa |
| I4 | status × percentual de `topico_aluno` coerentes | passa |
| I5 | percentual gravado = regra de `trailup_recalcular_topico_aluno` | passa |
| I6 | `tempo_gasto_min` com fórmula única | **falha** (dois gravadores) |
| I7 | tempo da matrícula = soma dos tópicos | passa |
| I8 | `eventos_aluno.classe_id` aponta para turma existente | **falha** (145 eventos) |
| I9 | ponto positivo tem turma atribuível | **falha** (580 pontos) |
| I10 | o cliente consegue ler o ranking | **falha** (`fn_app_config_int` sem EXECUTE) |
| I11 | view sem invoker com GRANT de cliente só na allowlist | **falha** (`vw_ranks_info_por_classe`) |
| I12 | progresso personalizado entre 0 e 100 | passa |
| I13 | conquista paga tem linha em `conquistas_aluno` | **falha** (10) |
| I14 | matriculado tem os 7 perfis BrainHex | **falha** |
| I15 | lote com mais de 1 h sem análise nem erro | **falha** (150) |

Novas, desta spec:

| Id | O que garante | Fase que a faz passar |
|---|---|---|
| I16 | tempo de uso da view de engajamento ÷ soma de `vw_metricas_sessoes_aluno_dia` = 1,00 (D1 do juiz) | F5 |
| I17 | sessão cujo último lote é terminal (`session_end`, `app_background`, `screen_blur`) tem `ended_at` | F2 |
| I18 | lote gravado pela via direta tem `fallback_motivo` | F0 |
| I19 | resposta não aponta para atividade inexistente | F4 |
| I20 | lotes analisados ÷ recebidos ≥ 0,95 na semana (alerta, não bloqueia KPI) | F3 |

A brecha de `criado_em`/`referencia` em `eventos_aluno` (D9 do juiz) não vira invariante de
runtime — não há coluna que diga quando a linha foi inserida. Ela é provada por teste de papel
simulado na migration da F1 (`SET LOCAL ROLE authenticated` dentro de `BEGIN/ROLLBACK`).

### 5.2 Testes por KPI

Cada métrica exibida ganha um pytest com fixture Postgres **com os gatilhos do caminho real**
(memória: fixture sem gatilho dá verde em código que aborta em produção), resultado calculado à
mão, e o mesmo número conferido em SQL, console e mobile. O CI está parado por cobrança desde
19/10: rodar localmente antes de abrir PR é obrigatório, e o `pg_cron` é a rede de verdade.

### 5.3 Quando falha

A métrica dependente fica "em revisão" sozinha. Quem investiga lê
`metricas_invariante_amostra` como `service_role`, abre issue com a consulta e as linhas, e
corrige por migration revisada — nunca dado editado à mão.

## 6. Catálogo

Valores entre colchetes são a chave em `metricas_catalogo`. Toda métrica tem `n`, data e os
estados do §4.2.

### 6.1 Aluno

| Métrica | Fonte | Validação antes de exibir |
|---|---|---|
| Progresso da própria trilha [`aluno.progresso`] | `topico_aluno` (trigger) | nenhuma |
| Tempo ativo na semana × semana anterior [`aluno.tempo_ativo_semana`] | `active_sec`, escopo `topic`, fuso do aluno | nenhuma |
| Sequência atual de dias, com congelamento [`aluno.sequencia`] | atividade acadêmica, fuso do aluno, sem evento de IA | nenhuma |
| Conquistas [`aluno.conquistas`] | `conquistas_aluno` reconciliado | nenhuma |
| Explicação por questão | gabarito do professor | nenhuma |
| Ranking top-15, ocultável [`aluno.ranking`] | `vw_rank_posicoes_por_classe` | nenhuma |
| Domínio por tópico [`aluno.dominio`] | M2 | **ml** (AUC ≥ 0,70, ECE ≤ 0,05 em dado próprio) |
| Nota sugerida em resposta aberta | juiz LLM | **llm** (§7.1) — e nunca automática para menor antes disso |
| Sugestão de próximo material | `sugestao_material.py` | **ml** (aderência medida em `personalizacao_sugestao_log`) |

Por perfil BrainHex, o **destaque** muda, não a métrica: Achiever vê domínio e coleção;
Conqueror, desafio vencido e recorde pessoal; Mastermind, acerto de primeira; Seeker, mapa de
tópicos explorados; Socializer, contribuição à guilda; Survivor, "voltou depois de errar";
Daredevil, desafio cronometrado **opcional**.

**Nunca ao aluno:** risco, emoção, estado mental, percentil baixo, tempo comparado com colega,
rótulo de perfil como sentença.

### 6.2 Professor (cada métrica tem ação)

| Métrica | Ação |
|---|---|
| Questão com `p < 0,30` ou discriminação `< 0,10` (negativa = alerta de gabarito) [`prof.questao_problema`] | revisar enunciado/gabarito |
| Conteúdo onde a turma trava (mediana) [`prof.conteudo_trava`] | retomar em aula |
| Inatividade: 7 dias letivos sem atividade acadêmica [`prof.inatividade`] | contato — botão "contatei" |
| Tópico estagnado: 14 dias e atrás da mediana da turma [`prof.estagnado`] | apoio direcionado |
| Entregas vencidas [`prof.vencidas`] | ajustar prazo |
| Cobertura: alunos sem dado × com zero [`prof.cobertura`] | — (contexto) |
| Material personalizado faltando [`prof.sem_material`] | gerar |

Sinal de risco: só ao professor, com fato e data ("sem atividade há 9 dias"), expira quando o
aluno volta, e "sem dado" (inclusive quem recusou telemetria ou está em modo restrito) **não**
conta como inativo. Nota baixa não soma com inatividade para virar "crítico".

**Não exibir ao professor:** interrupções, scroll, "interações", tempo total como esforço,
`eficiencia_aprendizagem`, emoção, segmento com `n < 5`, "crítico" derivado da taxa antiga.

### 6.3 Dev (eficácia da plataforma e da IA)

| Grupo | Métricas |
|---|---|
| Transporte | lotes analisados ÷ recebidos, por `via` e `fallback_motivo`; atraso de ingestão |
| Operação | jobs `failed`/`partial`/presos, latência p95 por `kind`, custo por aluno/mês |
| Uso | retorno D7/D28 por coorte contando **atividade acadêmica** (não login); sessões por aluno após F2 |
| Aprendizagem | acerto de primeira por item; ganho pré/pós (F7) |
| Gamificação | parcela de XP vinda de estudo; taxa de farming (eventos repetidos por `(tipo, referencia)`, revisões por resposta); conclusão de missão por molde e perfil |
| IA | AUC/Brier/ECE em sombra × baseline; κ juiz LLM × professor; taxa de fallback para regra; PSI semanal (drift); alucinação medida por juiz de grounding |

Ficam numa aba do console restrita a uma lista de contas de dev, lida por RPC
`SECURITY DEFINER` que confere a lista — nunca view com GRANT aberto.

### 6.4 Coleta para as IAs

| Sinal | Para quê |
|---|---|
| Por resposta: questão (identidade estável — F4), alternativa, tentativa, latência, dica/segunda chance | dificuldade, domínio |
| Exposição antes da resposta: `active_sec` por material e formato | efeito do material |
| Decisão da IA: o que recomendou, se foi seguida, desfecho seguinte | avaliação em sombra |
| Rótulos humanos: "contatei", desfecho, aceite/descarte de insight, dupla correção | rótulo de abandono, κ do juiz |
| Autorrelato de dificuldade 1–5 | substitui a câmera |
| `via`, `fallback_motivo`; versão de prompt, modelo e pipeline | cobertura e reprodutibilidade |

**Não coletar:** câmera sem o termo biométrico; texto de chat sem finalidade declarada;
`input_summary` com payload bruto (passa a guardar agregados).

## 7. ML e LLM

Tudo começa em **sombra**: calcula, grava em `ia_decision_logs`, não aparece. Só é exibido
depois do gatilho, registrado em `metricas_catalogo.validacao_promovida`. Dados de QA de 22/10 e
anteriores a `20261024_02` ficam fora de qualquer treino.

| Alvo | Baseline já | Gatilho de promoção | Enquanto não há dado |
|---|---|---|---|
| **Correção de resposta aberta** (juiz LLM, rubrica analítica com âncoras e evidência citada) | rubrica + similaridade com gabarito | QWK ≥ 0,70 contra o professor em ≥ 200 respostas (50–100 por rubrica); sem viés por perfil ou tamanho do texto | sombra cega; professor decide; menor nunca recebe nota automática |
| **Dificuldade de questão** | `p` da 1ª tentativa (TCT) numa view; prior LLM com `m = 10` pseudo-respostas | exibir com `n ≥ 10`, "preliminar" até 30; prior LLM fica se Spearman ≥ 0,4 com ≥ 30 itens; Rasch com 100–200 respostas por item | só o prior LLM, rotulado "estimativa" |
| **Risco de abandono** | regra SQL dos três construtos (inatividade, estagnação, evasão) | rótulo de evasão (30 dias ou sem avaliação final) definido antes; ≥ 100 eventos, ~500 alunos-período; validação temporal; supera a regra em AUC-PR e Brier; ECE ≤ 0,05 | regra exibida como "sinal", só ao professor |
| **Domínio (M2)** | regra atual | corrigir os 6 bugs de `m2_features.py`; sombra; recalibrar (isotônica) com ≥ 500 desfechos de ≥ 50 alunos; AUC ≥ 0,70 e ECE ≤ 0,05 | `decision_model_provider` continua na regra |

Bugs do M2 (confirmados no código): `lat_rel` (feature posterior) gravada em
`build_m2_overrides`, o que faz `score_dominio` cair sempre em regra; `latencies.sort()` antes de
`[-1]` (lê a máxima, não a última); sem `atividade_id` lê as 50 tentativas **mais antigas**;
acerto contínuo (`percentual/100`) contra treino binário; `qidx` nunca passado; setting
`m2_calibrated` inexistente.

Observabilidade por chamada: hash do prompt, versão do pipeline, rota, snapshot de features,
latência, tokens, custo, fallback. Amostra humana de 5%.

## 8. Fases

Cada fase é um PR (ou poucos), com spec/plano próprios e critério de pronto **medível**. Ordem
obrigatória: **coletor antes das views** — corrigir view contra dado de coletor quebrado valida
artefato.

| Fase | Conteúdo | Pronto quando | Depende de |
|---|---|---|---|
| **F0 — medir** | `telemetria_lotes.via` + `fallback_motivo` gravados pelo mobile; catálogo, resultado, amostra, disponibilidade; funções I1–I20; `pg_cron` | I18 passa; `vw_metricas_disponibilidade` reflete as falhas de hoje | — |
| **F1 — segurança e economia** | `criado_em := now()` no INSERT e `criado_em`/`referencia` congelados no UPDATE de `eventos_aluno`; `vw_ranks_info_por_classe` com invoker ou sem GRANT; ranking legível pelo aluno e fallback local removido; métricas de conquista/missão contam `DISTINCT (tipo, referencia)` com valor > 0; tipo fora do catálogo rejeitado; RLS de `consentimento_telemetria` conferida | I10, I11 passam; teste de papel simulado da brecha | F0 |
| **F2 — coletor** | fim normal = `session_end`; `inactive` do iOS não corta sessão; caminho direto fecha sessão no `screen_blur` e não regrava `ended_at` nulo | I17 passa; os dois caminhos produzem a mesma linha | F0 |
| **F3 — transporte da IA** | build EAS com #689; trigger enfileira `analise_pendente` e worker da API consome (fora do request de 120 s); backfill dos lotes antigos | I15 e I20 passam por 2 semanas | F0, F2 |
| **F4 — fontes únicas** | tempo ativo canônico (D-1) e saída do trigger não versionado; livro único de respostas com identidade estável de questão e política de exclusão (soft delete); reconciliação de pontos com aviso (D-3) | I6, I8, I9, I13, I19 passam | F1 |
| **F5 — views e RPC** | versionar no Alembic as `vw_metricas_*` e corrigir fan-out, abandono, retorno, nulos e fuso; mesclar `kpis_engajamento_turma`; console nos quatro estados (§4.2); `risco.ts` com os três construtos | I16 passa; teste por KPI (§5.2) | F2, F4 |
| **F6 — IA em sombra** | bugs do M2; juiz LLM; view de dificuldade; `ia_decision_logs` com versões e tokens; rótulos humanos no console | modelos gravando em sombra; aba de dev mostrando AUC/κ | F3, F5 |
| **F7 — estudo do TCC** | pré/pós com formas paralelas, desenho cruzado AB/BA por tópico, retenção em 2–4 semanas; CEP e TCLE/TALE | protocolo aprovado | F5 |

F1 e F2 são independentes entre si e podem correr em paralelo depois da F0.

## 9. Divergências decididas pelo juiz

- **Fonte do acerto:** não é `eventos_aluno` (37 de 38 órfãs) — é `questao_aluno` com política
  de exclusão (D-5).
- **Ligar já a RPC `kpis_engajamento_turma`:** não. Ela não está em produção e herda a
  fragmentação de sessão; entra na F5.
- **B8 (`session_interrupt` em 90 de 93 sessões):** o defeito é o coletor (F2), não só o nome.
- **150 lotes sem análise:** a hipótese "URL aponta para o frontend" foi refutada; TLS
  autoassinado é a causa provada em curl, build sem variável é concorrente.
- **M2 como ordenação já:** não — hoje ele nem pontua (bug de `lat_rel`).
- **Limiar do juiz LLM:** QWK ≥ 0,70, não 0,6 (alunos menores).

## 10. Riscos e o que continua com humanos

1. **Aplicar migration em produção** é do time; esta spec e os PRs dela nunca são mesclados
   pela sessão que os abre.
2. Origem da conexão somente leitura do worker (pooler) — confirmar com o traceback do #688.
3. Reconciliar pontos muda XP visível (D-3): comunicar antes de aplicar.
4. Consentimento biométrico e base legal para LLM com texto de menor (D-4): RIPD antes da F6.
5. CEP e TCLE/TALE para a F7; resultado apresentado como piloto de viabilidade.
6. CLAUDE.md desatualizado em dois pontos (fórmula de tempo; exceções de view sem invoker) —
   corrigir junto da F4 e da F1.

## Apêndice A — SQL das invariantes I1–I15

Do parecer do auditor, conferidas contra a produção em 2026-10-28. Na F0 cada uma vira
`fn_inv_iNN()`.

```sql
-- I1 idempotência da telemetria
SELECT lote_id,scope,entry_key FROM telemetria_time_metric_entries GROUP BY 1,2,3 HAVING count(*)>1;
-- I2 coerência interna do intervalo
SELECT id FROM telemetria_time_metric_entries WHERE active_sec<0 OR idle_sec<0 OR active_sec>dwell_sec+0.5
  OR abs(active_sec+idle_sec-dwell_sec)>1;
-- I3 escopo aninhado: content ≤ topic no mesmo lote
SELECT lote_id FROM telemetria_time_metric_entries GROUP BY 1
  HAVING sum(active_sec) FILTER (WHERE scope='content') > sum(active_sec) FILTER (WHERE scope='topic')+1;
-- I4 status × percentual do tópico
SELECT id FROM topico_aluno WHERE (percentual_concluido>=100)<>(status::text='concluido')
  OR (percentual_concluido=0 AND status::text<>'não iniciado');
-- I5 percentual gravado = regra do trigger
SELECT ta.id FROM topico_aluno ta CROSS JOIN LATERAL (
  SELECT (SELECT count(*) FROM conteudos WHERE topico_id=ta.topico_id)+(SELECT count(*) FROM atividades WHERE topico_id=ta.topico_id) pt,
   (SELECT count(*) FROM conteudos c JOIN conteudo_aluno x ON x.conteudo_id=c.id AND x.aluno_id=ta.aluno_id WHERE c.topico_id=ta.topico_id
      AND (x.status::text LIKE 'concl%' OR coalesce(x.percentual_concluido,0)>=100))
  +(SELECT count(*) FROM atividades a JOIN atividade_aluno x ON x.atividade_id=a.id AND x.aluno_id=ta.aluno_id WHERE a.topico_id=ta.topico_id
      AND (x.status::text LIKE 'concl%' OR coalesce(x.percentual_concluido,0)>=100)) pf,
   (SELECT coalesce(sum(total),0) FROM trailup_progresso_percurso(ta.aluno_id,(SELECT classe_id FROM topicos WHERE id=ta.topico_id)) p WHERE p.topico_id=ta.topico_id) qt,
   (SELECT coalesce(sum(feitos),0) FROM trailup_progresso_percurso(ta.aluno_id,(SELECT classe_id FROM topicos WHERE id=ta.topico_id)) p WHERE p.topico_id=ta.topico_id) qf) k
WHERE ta.percentual_concluido <> CASE WHEN k.qt>0 THEN round(100.0*k.qf/k.qt,2) WHEN k.pt>0 THEN round(100.0*k.pf/k.pt,2) ELSE 0 END;
-- I6 tempo com fórmula única. Na F4 passa a comparar com o tempo ativo (D-1)
SELECT id FROM topico_aluno WHERE abs(coalesce(tempo_gasto_min,0)-(tempo_direto_min+trailup_tempo_sessao_min(aluno_id,'topic',topico_id,NULL,NULL)))>0.01;
-- I7 tempo da matrícula = soma dos tópicos
SELECT ca.id FROM classe_aluno ca WHERE abs(coalesce(ca."tempoGastoMin",0)-(SELECT coalesce(sum(greatest(0,ta.tempo_gasto_min)),0)
  FROM topico_aluno ta JOIN topicos t ON t.id=ta.topico_id WHERE t.classe_id=ca.classe_id AND ta.aluno_id=ca.aluno_id))>0.01;
-- I8 FK de eventos_aluno respeitada
SELECT id FROM eventos_aluno e WHERE classe_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM classe c WHERE c.id=e.classe_id);
-- I9 ponto sem turma atribuível
SELECT id FROM eventos_aluno WHERE coalesce(valor,0)>0 AND classe_id IS NULL AND referencia NOT LIKE 'classe:%'
  AND split_part(referencia,':',1) NOT IN ('topico','conteudo','atividade');
-- I10 o cliente consegue ler o ranking
SELECT 1 WHERE NOT has_function_privilege('authenticated','public.fn_app_config_int(text,integer)','EXECUTE');
-- I11 view sem invoker com GRANT de cliente, fora da allowlist
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('v','m') AND NOT coalesce(c.reloptions @> '{security_invoker=on}',false)
  AND (has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'SELECT'))
  AND c.relname NOT IN ('vw_rank_posicoes_por_classe');
-- I12 progresso personalizado na faixa
SELECT id FROM personalizacao_item_progresso WHERE percentual_concluido NOT BETWEEN 0 AND 100;
-- I13 conquista pontuada sem registro
SELECT e.id FROM eventos_aluno e WHERE tipo='conquista_desbloqueada' AND NOT EXISTS (SELECT 1 FROM conquistas_aluno c
  WHERE c.aluno_id=e.aluno_id AND c.conquista_id::text=split_part(e.referencia,':',2));
-- I14 aluno matriculado sem vetor BrainHex completo
SELECT DISTINCT ca.aluno_id FROM classe_aluno ca WHERE (SELECT count(*) FROM aluno_perfil ap WHERE ap.aluno_id=ca.aluno_id)<>7;
-- I15 lote com mais de 1 h sem análise nem erro
SELECT id FROM telemetria_lotes WHERE analysis_ciclo_id IS NULL AND analysis_error IS NULL AND created_at<now()-interval '1 hour';
```
