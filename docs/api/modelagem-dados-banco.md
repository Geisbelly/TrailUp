# Modelagem de Dados - API

## Entidades centrais
- Academico: classe, topicos, conteudos, atividades, questoes.
- Progresso: topico_aluno, conteudo_aluno, atividade_aluno, classe_aluno.
- Personalizacao: conteudo_personalizado, fontes_personalizacao.
- Jobs: personalizacao_jobs, personalizacao_job_targets.
- Eventos: eventos_aluno.

## Notas de modelagem
- `conteudo_personalizado.materiais` e o contrato central de artefatos.
- Regras de ranking sao derivadas em SQL (view + trigger), nao em tabela manual pelo cliente.
