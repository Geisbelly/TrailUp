"""O audio do caminho Python sai na voz do Guardiao do perfil, ou nao sai."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest

from app.services import media_pipeline
from app.services.media_pipeline import AudioPipeline, MediaPipelineContext
from app.services.personalizacao import _BRAINHEX_GUIDE_PERSONAS

REPO = Path(__file__).resolve().parents[2]
VOZES_DO_MICROSERVICE = REPO / "microservice" / "src" / "constants" / "guardianVoices.ts"
PERFIL_NO_MICROSERVICE = {"Socialiser": "socializer"}


def _contexto(perfil_editorial: dict[str, Any]) -> MediaPipelineContext:
    return MediaPipelineContext(
        state={"perfil_editorial": perfil_editorial},
        settings=object(),  # type: ignore[arg-type]
        storage=None,  # type: ignore[arg-type]
        base_prefix="aluno/1/2",
        ref_id="ref",
    )


@pytest.fixture
def chamadas(monkeypatch) -> list[dict[str, Any]]:
    registradas: list[dict[str, Any]] = []

    async def _falso(**kwargs: Any) -> bytes:
        registradas.append(kwargs)
        return b"ID3audio"

    monkeypatch.setattr(media_pipeline, "gerar_audio_gemini_tts", _falso)
    return registradas


def test_os_sete_perfis_tem_guardiao_completo() -> None:
    assert len(_BRAINHEX_GUIDE_PERSONAS) == 7
    for perfil, persona in _BRAINHEX_GUIDE_PERSONAS.items():
        assert persona.get("guia_voz"), perfil
        assert persona.get("guia_direcao_voz"), perfil


def test_vozes_da_api_e_do_microservice_sao_as_mesmas() -> None:
    fonte = VOZES_DO_MICROSERVICE.read_text(encoding="utf-8")
    vozes = dict(re.findall(r'^\s*(\w+): \{\s*voice: "(\w+)"', fonte, re.MULTILINE))
    assert len(vozes) == 7
    for perfil, persona in _BRAINHEX_GUIDE_PERSONAS.items():
        chave = PERFIL_NO_MICROSERVICE.get(perfil, perfil.lower())
        assert persona["guia_voz"] == vozes[chave], perfil
    secundaria = re.search(r'secondaryVoice: "(\w+)"', fonte)
    assert secundaria
    assert _BRAINHEX_GUIDE_PERSONAS["Socialiser"]["guia_voz_secundario"] == secundaria.group(1)


@pytest.mark.asyncio
@pytest.mark.parametrize("perfil", sorted(set(_BRAINHEX_GUIDE_PERSONAS) - {"Socialiser"}))
async def test_narracao_sai_na_voz_do_guardiao(perfil: str, chamadas: list[dict[str, Any]]) -> None:
    persona = _BRAINHEX_GUIDE_PERSONAS[perfil]
    material = {"payload": {"roteiro": "Uma fracao e parte de um todo."}}

    await AudioPipeline().render(material, _contexto(persona))

    assert len(chamadas) == 1
    assert chamadas[0]["voz"] == persona["guia_voz"]
    assert chamadas[0]["direcao_voz"] == persona["guia_direcao_voz"]
    assert "speaker_secundario" not in chamadas[0]


@pytest.mark.asyncio
async def test_socializer_sai_em_dialogo_com_uma_fala_por_linha(chamadas: list[dict[str, Any]]) -> None:
    persona = _BRAINHEX_GUIDE_PERSONAS["Socialiser"]
    # normalize_script entrega o roteiro em uma linha so.
    material = {"payload": {"roteiro": "Oi, turma. Zuri: Ola, Mateo! Mateo: Vamos la."}}

    await AudioPipeline().render(material, _contexto(persona))

    assert chamadas[0]["texto"] == "Mateo: Oi, turma.\nZuri: Ola, Mateo!\nMateo: Vamos la."
    assert chamadas[0]["voz"] == persona["guia_voz"]
    assert chamadas[0]["speaker_secundario"] == ("Zuri", persona["guia_voz_secundario"])
    assert chamadas[0]["nome_speaker_principal"] == "Mateo"


@pytest.mark.asyncio
@pytest.mark.parametrize("editorial", [{}, {"guia_voz": "Charon"}, {"guia_direcao_voz": "serena"}])
async def test_sem_guardiao_nao_ha_audio(editorial: dict[str, str], chamadas: list[dict[str, Any]]) -> None:
    material = {"payload": {"roteiro": "Uma fracao e parte de um todo."}}

    with pytest.raises(RuntimeError, match="audio_sem_guardiao"):
        await AudioPipeline().render(material, _contexto(editorial))

    assert chamadas == []


def test_nenhum_outro_provedor_de_voz_na_api() -> None:
    proibido = re.compile(r"gtts|audio/speech|audio\.speech|gpt-4o-mini-tts|tts-1|elevenlabs", re.IGNORECASE)
    achados = [
        str(arquivo.relative_to(REPO))
        for arquivo in sorted((REPO / "api" / "app").rglob("*.py"))
        if proibido.search(arquivo.read_text(encoding="utf-8"))
    ]
    assert achados == []
