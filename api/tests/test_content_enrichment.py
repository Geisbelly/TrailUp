from types import SimpleNamespace

import pytest

from app.services.content_enrichment import enrich_content_blocks


@pytest.mark.asyncio
async def test_enrichment_fallback_decomposes_class_content_in_order() -> None:
    context = {
        "topico_id": 9,
        "source_hash": "hash-9",
        "conteudo_classe": {
            "topico": {"nome": "Redes", "objetivo": "Compreender comunicação distribuída."},
            "conteudos": [
                {"id": 1, "titulo": "DNS", "conteudo": "DNS resolve nomes.\n\nEle usa consultas."},
                {"id": 2, "titulo": "HTTP", "conteudo": "HTTP transporta representações."},
            ],
            "atividades": [],
        },
        "fontes_contexto": [],
    }
    settings = SimpleNamespace(
        llm_provider="gemini",
        gemini_model_default="gemini-test",
        openai_model_default="openai-test",
        gemini_api_key="",
        openai_api_key="",
    )

    result = await enrich_content_blocks(context=context, settings=settings)

    assert result["schema_version"] == "trailup.content-blocks.v1"
    assert result["source_hash"] == "hash-9"
    assert len(result["blocos"]) == 4
    assert [item["ordem"] for item in result["blocos"]] == [1, 2, 3, 4]
    assert result["blocos"][1]["source_ids"] == ["conteudo:1"]
    assert result["blocos"][-1]["topico"] == "HTTP"
