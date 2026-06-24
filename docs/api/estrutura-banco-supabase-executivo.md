# Estrutura do Banco (Supabase) - Resumo Executivo

## Objetivo
Documentar as tabelas e views criticas para operacao do ecossistema TrailUp.

## Blocos principais
- Base academica: `classe`, `topicos`, `conteudos`, `atividades`, `questoes`.
- Progresso do aluno: `classe_aluno`, `topico_aluno`, `conteudo_aluno`, `atividade_aluno`.
- Personalizacao: `conteudo_personalizado`, `fontes_personalizacao`.
- Jobs: `personalizacao_jobs`, `personalizacao_job_targets`, `personalizacao_item_progresso`.
- Eventos: `eventos_aluno`.
- Ranking: `ranks`, `rank_tipo`, `rank_posicoes` + view `vw_rank_posicoes_por_classe`.

## Regras de ranking (estado atual)
- Leitura de ranking nos clientes deve usar a view `vw_rank_posicoes_por_classe`.
- Tempo para ranking deve refletir estudo ativo em topicos/conteudos/atividades.
- Atualizacao de ranking depende de eventos validos em `eventos_aluno` e recalculo no banco.

## Midias
- `midias` permanece como tabela de compatibilidade de leitura para app/web.
- Pipeline novo de personalizacao prioriza artefatos em `conteudo_personalizado.materiais` + Storage.

## Recomendacao operacional
- Evitar consultas diretas em tabelas derivadas quando existir view oficial.
- Tratar SQL de trigger/view como parte da camada de dominio, com versionamento por migration.
