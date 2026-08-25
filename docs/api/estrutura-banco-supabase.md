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

## Midias
- Legado/apoio: `midias`
- Principal no fluxo novo: `conteudo_personalizado.materiais` + Storage

## Observacao
Regras de rank e agregacoes de tempo/pontuacao dependem de SQL de views/triggers versionados no banco.
