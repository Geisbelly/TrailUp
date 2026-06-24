# DOCS API - ApiBrainHex

## 1. GET /api/health
Verifica se servico esta online.

Resposta:
```json
{
  "status": "ok",
  "supabase": true
}
```

## 2. POST /api/v1/archive
Uso orientado ao frontend da propria aplicacao.

Body esperado (resumo):
```json
{
  "profile": "mastermind",
  "class_name": "classe-x",
  "processed": {
    "markdown": "...",
    "audioScript": "...",
    "slides": []
  },
  "mp3Base64": "...",
  "wavBase64": "...",
  "slideImages": []
}
```

Efeito:
- gera/finaliza artefatos.
- faz upload no bucket `conteudo_aluno`.
- retorna URLs publicas.

## 3. POST /api/personalizar
Endpoint usado pela API TrailUp para processamento assincrono.

Body esperado (resumo):
```json
{
  "profile": "seeker",
  "personalizacao_id": 42,
  "classe_id": 30,
  "topico_id": 114,
  "ciclo_id": "uuid",
  "aluno_id": "uuid",
  "fontes": [
    { "url": "https://...", "mime_type": "application/pdf", "tipo": "pdf" }
  ]
}
```

Observacoes:
- `fontes[]` substitui o antigo `conteudo_estudado` (removido).
- Cada item exige `url` publica acessivel ao servico, `mime_type` e `tipo`.
- Servico baixa cada fonte (timeout 30s) e envia ao Gemini como `inlineData` ou parser local (PPTX/DOCX).

Resposta imediata:
```json
{
  "status": "processing",
  "personalizacao_id": 42
}
```

## 4. Contrato de persistencia
Artefatos sao refletidos em `conteudo_personalizado.materiais` com:
- `arquivo_url`
- `storage_path`
- `metadata.status` (`pending|completed|failed`)
- `metadata.media_kind`

## 5. Regras importantes
- Nao sobrescrever artefato ja `completed` ao fazer merge.
- Em caso de falha parcial, manter consistencia por artefato.
- Perfis validos devem bater com `src/constants/brainHex.ts`.
