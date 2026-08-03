# Hash completo no path do fallback Python (MultiOutputPipeline)

## Contexto

Investigando um protótipo externo em busca de funcionalidades a portar,
descobri que o path de storage do fallback Python (`MultiOutputPipeline`,
usado quando o microservice não está disponível/configurado) usa só os 8
primeiros caracteres do `ciclo_id` como discriminador de versão:

`api/app/services/media_pipeline.py`, método `_context()`:
```python
ref_id = f"{ref_base}_{str(self.state.get('ciclo_id') or '')[:8]}"
```

Enquanto o path do microservice real usa um sha256 completo do
`generation_key` (`generationStorageSegment()` em
`microservice/src/constants/pipelineVersions.ts`).

Não há um bug de sobrescrita confirmado — o `UPSERT` em
`conteudo_personalizado` já bloqueia regravar quando `source_hash` não
mudou de verdade (`WHERE source_hash IS DISTINCT FROM EXCLUDED.source_hash`)
— mas os 32 bits de `ciclo_id[:8]` são um espaço de colisão bem menor que os
256 bits do sha256 completo do lado Node. É um ajuste de
consistência/hardening entre os dois lados do fallback, não correção de bug
ativo.

## Mudança

Trocar, em `api/app/services/media_pipeline.py`, método `_context()`:
```python
ref_id = f"{ref_base}_{str(self.state.get('ciclo_id') or '')[:8]}"
```
por:
```python
ciclo_id_raw = str(self.state.get("ciclo_id") or "")
digest = hashlib.sha256(ciclo_id_raw.encode("utf-8")).hexdigest()
ref_id = f"{ref_base}_{digest}"
```

`hashlib` precisa ser importado no topo do arquivo, se ainda não estiver.

## Fora de escopo

- `api/app/services/storage.py:upload_materiais` (camada por-aluno) — essa
  função já descarta `ref_id` deliberadamente (`_ = ref_id`), por ser uma
  camada leve que não versiona por design (reusa a mídia base do perfil,
  não regenera). Não é tocada.
- Não muda o formato do path do microservice (já usa sha256 completo).
- Não é uma correção de bug de produção confirmado — é hardening
  preventivo de consistência entre os dois esquemas de path.

## Teste de aceitação

- `api/tests/test_media_pipeline.py::test_multi_output_context_uses_brainhex_profile_prefix`
  continua passando (só verifica `"seeker" in ctx.base_prefix`, não depende
  do formato de `ref_id`).
- Novo teste confirma que `ctx.ref_id` contém um hex de 64 caracteres
  (sha256) derivado do `ciclo_id`, não mais os 8 caracteres truncados.
