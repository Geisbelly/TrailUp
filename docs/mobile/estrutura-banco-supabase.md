# Estrutura do Banco Supabase (Consumo Mobile)

## Leitura principal
- `vw_aluno_classe_detalhado`
- `vw_aluno_classe_resumo`
- `vw_rank_posicoes_por_classe`

## Escrita principal
- `topico_aluno`
- `conteudo_aluno`
- `atividade_aluno`
- `questao_aluno`
- `eventos_aluno`

## Personalizacao
- `conteudo_personalizado` (materiais por topico/aluno)
- `fontes_personalizacao`

## Ranking
- O app deve ler ranking por view (`vw_rank_posicoes_por_classe`).
- Atualizacao depende de eventos e SQL de consolidacao no banco.

## Midias
- Fluxo atual prioriza URLs de artefatos em `materiais`.
- `midias` segue como compatibilidade para cenarios legados.
