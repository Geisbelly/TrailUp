from __future__ import annotations

import hashlib
from typing import Any

import pytest

from app.core.settings import Settings
from app.services.media_pipeline import (
    MarkdownPipeline,
    MediaPipeline,
    MediaPipelineContext,
    MultiOutputPipeline,
    SlidesPipeline,
)


class _DummyPipeline(MediaPipeline):
    kind = "markdown"

    async def render(self, material: dict[str, Any], context):
        return b"ok"

    async def output(self, rendered: bytes, material: dict[str, Any], context):
        return {**material, "arquivo_url": "https://cdn.example.com/material.md"}


class _BrokenPipeline(MediaPipeline):
    kind = "audio"

    async def render(self, material: dict[str, Any], context):
        raise RuntimeError("render_failed")


def _context(perfil_dominante: str = "seeker") -> MediaPipelineContext:
    return MediaPipelineContext(
        state={
            "topico_contexto": {"nome": "SPD", "descricao": "Fundamentos de sistemas distribuídos"},
            "perfil_editorial": {"guia_voz": "Puck", "guia_nome": "Amara"},
            "perfil_brainhex": [{"perfil": perfil_dominante, "afinidade": 0.9}],
            "perfil_dominante": perfil_dominante,
        },
        settings=Settings(openai_api_key=None),
        storage=None,  # type: ignore[arg-type]
        base_prefix="aluno/classe-1/topico-1",
        ref_id="content_abc123",
    )


@pytest.mark.asyncio
async def test_multi_output_split_new_formats() -> None:
    pipeline = MultiOutputPipeline(
        settings=Settings(openai_api_key=None),
        state={"aluno_id": "a", "classe_id": 1, "payload_topico_id": 2, "ciclo_id": "ciclo"},
    )
    fast, media = pipeline.split(
        {
            "cards": {"payload": []},
            "audio": {"payload": {"roteiro": "R"}},
            "apresentacao": {"payload": {"titulo": "T"}},
            "markdown": {"payload": {"texto": "# H"}},
        }
    )
    assert sorted(fast.keys()) == ["cards"]
    assert sorted(media.keys()) == ["apresentacao", "audio", "markdown"]


def test_multi_output_mark_pending_sets_metadata() -> None:
    pipeline = MultiOutputPipeline(
        settings=Settings(openai_api_key=None),
        state={"aluno_id": "a", "classe_id": 1, "payload_topico_id": 2, "ciclo_id": "ciclo"},
    )
    pending = pipeline.mark_pending({"markdown": {"payload": {"texto": "# Guia"}}})
    assert pending["markdown"]["metadata"]["status"] == "pending"


def test_multi_output_context_uses_brainhex_profile_prefix() -> None:
    pipeline = MultiOutputPipeline(
        settings=Settings(openai_api_key=None),
        state={
            "aluno_id": "a",
            "classe_id": 1,
            "payload_topico_id": 2,
            "ciclo_id": "ciclo",
            "perfil_brainhex": [{"perfil": "seeker", "afinidade": 0.9}],
        },
    )
    ctx = pipeline._context()
    assert "seeker" in ctx.base_prefix


def test_multi_output_context_ref_id_uses_full_sha256_of_ciclo_id() -> None:
    ciclo_id = "ciclo-ação-üñíçø-2026"
    pipeline = MultiOutputPipeline(
        settings=Settings(openai_api_key=None),
        state={
            "aluno_id": "a",
            "classe_id": 1,
            "payload_topico_id": 2,
            "ciclo_id": ciclo_id,
            "perfil_brainhex": [{"perfil": "seeker", "afinidade": 0.9}],
        },
    )
    ctx = pipeline._context()
    expected_digest = hashlib.sha256(ciclo_id.encode("utf-8")).hexdigest()
    assert ctx.ref_id.endswith(expected_digest)
    assert len(expected_digest) == 64


@pytest.mark.asyncio
async def test_markdown_pipeline_render() -> None:
    pipeline = MarkdownPipeline()
    ctx = _context()
    material = {"payload": {"texto": "# Título\n\nConteúdo do grimório"}}
    normalized = await pipeline.normalize(material, ctx)
    rendered = await pipeline.render(normalized, ctx)
    assert rendered == "# Título\n\nConteúdo do grimório".encode("utf-8")
    assert pipeline.extension == "md"
    assert pipeline.content_type == "text/markdown"
    assert pipeline.kind == "markdown"


@pytest.mark.asyncio
async def test_markdown_pipeline_normalize_raises_on_empty() -> None:
    pipeline = MarkdownPipeline()
    ctx = _context()
    with pytest.raises(RuntimeError, match="markdown_empty_content"):
        await pipeline.normalize({"payload": {"texto": ""}}, ctx)


@pytest.mark.asyncio
async def test_slides_pipeline_normalize_new_schema() -> None:
    pipeline = SlidesPipeline()
    ctx = _context()
    material = {
        "payload": {
            "titulo": "Apresentação de Teste",
            "abertura": "Introdução ao tema",
            "slides": [
                {
                    "titulo": "Conceito Central",
                    "topics": ["Pista 1", "Pista 2"],
                    "explanation": "Insight da Jornada sobre o tema",
                    "visualDescription": "Mapa com trilha luminosa",
                    "characterQuote": "Amara diz: siga a estrela guia",
                    "characterAction": "explaining",
                    "imagePrompt": "2D magical glowing compass in forest",
                    "sourceIds": ["src-1", "src-2"],
                }
            ],
        }
    }
    result = await pipeline.normalize(material, ctx)
    slides = result["payload"]["slides"]
    assert len(slides) == 1
    slide = slides[0]
    assert slide["titulo"] == "Conceito Central"
    assert slide["topics"] == ["Pista 1", "Pista 2"]
    assert slide["characterAction"] == "explaining"
    assert slide["characterQuote"] == "Amara diz: siga a estrela guia"
    assert slide["imagePrompt"] == "2D magical glowing compass in forest"
    assert slide["sourceIds"] == ["src-1", "src-2"]
    assert "pontos" not in slide
    assert "layout" not in slide


@pytest.mark.asyncio
async def test_audio_pipeline_uses_guia_voz_from_state() -> None:
    class _FakeSettings:
        gemini_api_key = None
        openai_api_key = None

    ctx = MediaPipelineContext(
        state={
            "perfil_editorial": {"guia_voz": "Puck"},
            "perfil_brainhex": [{"perfil": "seeker", "afinidade": 0.9}],
            "perfil_dominante": "seeker",
        },
        settings=_FakeSettings(),  # type: ignore[arg-type]
        storage=None,  # type: ignore[arg-type]
        base_prefix="aluno/1/2",
        ref_id="ref",
    )
    voz = (ctx.state.get("perfil_editorial") or {}).get("guia_voz")
    assert voz == "Puck"


def test_guardian_tts_prompt_separa_direcao_da_transcricao() -> None:
    from app.services.media_agents import _build_guardian_tts_prompt

    prompt = _build_guardian_tts_prompt(
        texto="O mapa começa aqui.",
        direcao_voz="Amara: voz feminina jovem e curiosa.",
    )

    assert "DIRECAO DE VOZ: Amara: voz feminina jovem e curiosa." in prompt
    assert prompt.endswith("TRANSCRICAO:\nO mapa começa aqui.")
    assert "Nao leia estas instrucoes em voz alta" in prompt


def test_guardian_tts_prompt_dirige_mateo_e_zuri_separadamente() -> None:
    from app.services.media_agents import _build_guardian_tts_prompt

    prompt = _build_guardian_tts_prompt(
        texto="Mateo: Vamos juntos.\nZuri: Sempre.",
        direcao_voz="voz masculina jovem e amigavel",
        nome_speaker_principal="Mateo",
        nome_speaker_secundario="Zuri",
        direcao_voz_secundaria="voz feminina jovem e calorosa",
    )

    assert "DIRECAO DE Mateo: voz masculina jovem e amigavel" in prompt
    assert "DIRECAO DE Zuri: voz feminina jovem e calorosa" in prompt
    assert prompt.endswith("TRANSCRICAO:\nMateo: Vamos juntos.\nZuri: Sempre.")
