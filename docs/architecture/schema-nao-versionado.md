# Inventário: o schema que existe em produção e não está no git

**Medido em 2026-09-30**, contra o projeto Supabase `xrebtkmdewolzmpsdwgh` e o
`origin/main` do dia.

Este documento é um **retrato**, não um plano. Ele existe para que a decisão
sobre o que fazer seja tomada com o mapa na mão — a conclusão mudou duas vezes
durante o levantamento, sempre para pior, conforme a medição foi ficando mais
completa.

## O resumo

| | tabelas e views | funções |
| --- | ---: | ---: |
| descritas por migration da `main` | 88 de 92 | 119 de 168 |
| só na cadeia `port/*` (mesclada, mas nunca na `main`) | 2 | 5 |
| **em ref nenhum — existem apenas no banco** | **2** | **44** |

**26% das funções de produção não estão descritas em lugar nenhum do
repositório.** Medir só tabelas dá a impressão oposta (96% cobertas) e foi o
que levou à primeira conclusão errada.

## O sintoma que revelou tudo

```
SELECT version_num FROM alembic_version;  -->  20260927_02
```

Essa revisão **não existe em nenhum ref, nem em nenhum commit de toda a
história do repositório** — conferido com `git log --all -S "20260927"`, que
não retorna nada. O `alembic_version` de produção foi carimbado fora do git.

Consequências práticas:

- `alembic upgrade head` a partir da `main` **falha** contra produção: o
  alembic não localiza a revisão corrente para saber de onde continuar.
- Um banco novo criado pela `main` **não** reproduz produção.
- Some-se a isso que a `main` tem hoje **3 cabeças de alembic**
  (`20260922_03`, `20260922_03b`, `20260922_06`), o que já derruba o job `api`
  de todo PR. Corrigido no PR #254, ainda aberto.

## As 44 funções órfãs

Elas não são todas do mesmo tipo, e isso muda o tratamento.

### Legado pré-alembic (28) — risco baixo

A primeira migration é `20260405_01`, mas o banco existia antes dela. Estas
nunca foram versionadas porque o alembic entrou no meio do projeto. Estão
estáveis há meses:

`trg_alunos_after_insert`, `trg_topicos_after_insert`,
`trg_professor_after_insert`, `trg_atividades_after_insert`,
`trg_classe_aluno_after_insert`, `update_updated_at_column`,
`set_updated_at_timestamp`, `atualiza_updated_at`, `rls_auto_enable`,
`prevent_topico_cycle`, `professor_block_self_approve`,
`inscrever_aluno_em_classe`, `fn_cadastrar_aluno_com_perfis`,
`fn_atualizar_aluno_perfil`, `fn_auth_email_exists`, `fn_texto_comparavel`,
`fn_trilha_by_classe`, `questao_gabarito_do_aluno` e toda a família
`fn_questao_*` / `fn_questoes_*` (10 funções).

### Divergência recente (16) — é aqui que dói

Funcionalidade que entrou em produção sem passar pelo git:

| grupo | funções |
| --- | --- |
| **arena completa** | `arena_desafio`, `arena_desafio_criar`, `arena_listar`, `arena_responder`, `arena_encerrar`, `arena_convite_responder`, `fn_arena_equipes`, `fn_arena_placar` |
| **prazo** | `app_prazo_atraso_fator`, `fn_fator_de_atraso`, `fn_prazo_efetivo` |
| **percurso e telemetria** | `trailup_percurso_recalcular`, `trailup_progresso_percurso`, `trailup_sync_tempo_da_telemetria`, `trailup_tempo_telemetria_min_v2` |
| **rank** | `fn_rank_rebuild_for_classe` |

A arena é um subsistema inteiro — 8 funções — vivo em produção e invisível no
repositório.

## As 4 tabelas e views

| objeto | origem | observação |
| --- | --- | --- |
| `contato_envios` | `port/*` (`20260911_08`) | RLS ligada, 0 policies, 0 linhas |
| `vw_creditos_concedidos` | `port/*` (`20260911_05`) | depende de `fn_evento_creditado` |
| `desafio_participantes` | **ref nenhum** | RLS ligada, 0 policies, 0 linhas, 2 FKs |
| `solicitacoes_exclusao` | **ref nenhum** | RLS ligada, 2 policies |

`contato_envios` e `desafio_participantes` têm RLS ligada e **zero policies**.
Isso **não** é o bug de `personalizacao_job_targets`: aqui é deliberado — as
duas são escritas por funções `SECURITY DEFINER` (1 e 7 respectivamente), que
passam por cima da RLS, e negar o cliente é o comportamento correto.

## A cadeia `port/*`

24 branches, todas mescladas entre si mas **nenhuma na `main`** — cada PR
tinha como base o branch anterior, e o encadeamento nunca chegou ao branch
padrão. Contém **83 commits, 183 arquivos e 29 migrations** (de `20260831` a
`20260911`) ausentes da `main`.

Ela **não** explica a divergência: das 44 funções órfãs, **zero** estão nela.
São dois problemas independentes.

Atenção ao resgatá-la: a `main` reimplementou parte daquilo por outro caminho
nos 155 commits seguintes — há duas filas duráveis (`filaDuravel.ts` na
`port/*` contra `progressoOutbox.ts`/`telemetriaOutbox.ts` na `main`) e dois
sistemas de conquista. Mesclar em bloco colide.

## Como reproduzir esta medição

Lado do banco:

```sql
-- funções de produção, fora de extensões
SELECT string_agg(DISTINCT p.proname, ' ' ORDER BY p.proname)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
```

Lado do repositório, para cada nome:

```bash
git grep -q "<nome>" origin/main -- api/alembic   # descrita pela main?
```

> Cuidado com laços de shell aqui: um `for` aninhado com `git grep -q` deu
> falso negativo em 100% dos casos durante este levantamento, e a conclusão
> chegou a ser publicada errada. Verifique o método contra um caso conhecido
> (`fn_enviar_contato_sendgrid` **está** em `port/api-local-e-contato`) antes
> de confiar no resultado.

## O que este documento não decide

Deliberadamente, nada. Mas o levantamento fecha uma porta: **uma migration de
reconciliação escrita à mão não é o instrumento certo nesta escala.**
Reproduzir 44 corpos de função a partir de introspecção, na ordem certa de
dependência (`vw_creditos_concedidos` já depende de `fn_evento_creditado`, que
depende de outras), é onde se introduz o erro silencioso.

O caminho que resta é um baseline gerado de `pg_dump --schema-only`, seguido
de `alembic stamp` na produção — que, por o banco já ter tudo, não roda DDL
nenhum. E o PR #254 precisa entrar antes: com 3 cabeças, qualquer migration
nova vira uma quarta.
