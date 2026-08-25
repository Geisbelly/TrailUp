# Seguranca - API TrailUp

## Controles
- Autenticacao por JWT Supabase.
- Secrets via variaveis de ambiente.
- Endpoints administrativos protegidos.
- Isolamento de operacoes de escrita no banco por camada de servico.

## Riscos monitorados
- uso indevido de service role
- payloads malformados
- repeticao de jobs sem dedupe

## Mitigacoes
- dedupe por chave de negocio (incluindo perfil BrainHex)
- validacao de schema
- logs estruturados e retries controlados
