# Guia de Uso - ApiBrainHex

## Modo 1: Integrado com ApiTraiUp (principal)
1. Subir o servico ApiBrainHex.
2. Configurar `brainhex_api_url` no ApiTraiUp.
3. Enfileirar job de personalizacao na API TrailUp.
4. Worker TrailUp chama `POST /api/personalizar`.
5. ApiBrainHex gera e persiste midias.

## Modo 2: Uso direto (frontend)
- Chamar `POST /api/v1/archive` com material ja processado.
- Servico persiste artefatos no Storage e retorna URLs.

## Checklist de configuracao
- `GEMINI_API_KEY` valida.
- `SUPABASE_URL` valida.
- `SUPABASE_SERVICE_ROLE_KEY` com permissao de upload e update.

## Troubleshooting
- `503` em health/archive: variaveis Supabase ausentes.
- Falha de geracao de imagem: limite/modelo Gemini; aplicar retry.
- Audio nulo: validar retorno TTS e conversao mp3.
- `materiais` sem update: validar `personalizacao_id` e permissao service role.
