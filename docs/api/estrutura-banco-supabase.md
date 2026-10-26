# Estrutura do Banco Supabase

## Tabelas de dominio
- `classe`, `topicos`, `conteudos`, `atividades`, `questoes`

## Tabelas de progresso
- `classe_aluno`, `topico_aluno`, `conteudo_aluno`, `atividade_aluno`
- `eventos_aluno`

## Tabelas de personalizacao
- `conteudo_personalizado`
- `fontes_personalizacao`
- `personalizacao_jobs`
- `personalizacao_job_targets`
- `personalizacao_item_progresso`

## Ranking
- Base: `ranks`, `rank_tipo`, `rank_posicoes`
- Consumo recomendado: `vw_rank_posicoes_por_classe`
- `ranks.periodo` (#155, migration `20261025_02`) é o NOME do período e não entra na conta: a janela
  que soma pontos é `inicio`/`fim`. Formato: 1 a 40 caracteres, sem espaço nas pontas (o gatilho
  `trg_ranks_periodo_formato` apara e recusa o resto com `22023`). Sugestão `AAAA.S` (ex.: `2026.2`),
  como o console propõe, mas não é obrigatória. Um nome por tipo + turma, sem diferenciar
  maiúsculas. `NULL` e rótulos antigos fora do formato continuam valendo, porque só rótulo novo ou
  trocado é validado.
- `percentual_do_lider` (o "progresso" da linha) é `pontuacao / maior * 100`, limitado a 0..100. Vem
  `NULL` em três casos: no critério `elo`, em rank com menos de `rank_progresso_min_participantes`
  alunos (`app_config`, padrão 8) e quando o líder não tem ponto. Cliente que mostra barra trata
  `NULL` como "sem barra" e mostra posição e valor.

## Midias
- Legado/apoio: `midias`
- Principal no fluxo novo: `conteudo_personalizado.materiais` + Storage

## Observacao
Regras de rank e agregacoes de tempo/pontuacao dependem de SQL de views/triggers versionados no banco.
