# Operacao e Observabilidade

## Logs criticos
- entrada de chamada `/api/personalizar`
- erro de Gemini por etapa (texto, audio, imagem)
- erro de upload no Supabase
- resultado do merge em `conteudo_personalizado`

## Sinais de saude
- `GET /api/health` respondendo `ok`
- crescimento de artefatos no bucket `conteudo_aluno`
- `materiais[*].metadata.status` coerente com execucao

## Falhas comuns
- credencial Gemini invalida
- service role sem permissao de storage/update
- payload incompleto (sem `personalizacao_id` ou `conteudo_estudado`)

## Boas praticas
- tratar cada artefato como unidade independente (`completed/failed`).
- nao apagar artefatos completados em reprocessamento.
- manter idempotencia por `personalizacao_id` + referencia de storage.
