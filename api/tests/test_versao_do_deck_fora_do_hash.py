"""Subir a versao do deck refaz so os slides, nunca texto e audio (#863)."""

from __future__ import annotations

from pathlib import Path

from app.services import media_contract, personalizacao


def test_hash_congelado_nos_valores_que_ja_estao_gravados() -> None:
    # Trocar estes valores muda o source_hash de todo material: regera tudo.
    assert media_contract.SOURCE_HASH_PRESENTATION_ENGINE_VERSION == "brainhexpdf-v1"
    assert media_contract.SOURCE_HASH_PRESENTATION_DESIGN_VERSION == "slidesgo-editorial-v3"
    # O hash nao pode voltar a importar as versoes vivas do deck.
    assert not hasattr(personalizacao, "PRESENTATION_DESIGN_VERSION")
    assert not hasattr(personalizacao, "PRESENTATION_ENGINE_VERSION")


def test_versao_do_deck_igual_na_api_e_no_microservice() -> None:
    ts = (
        Path(__file__).resolve().parents[2] / "microservice/src/constants/pipelineVersions.ts"
    ).read_text(encoding="utf-8")
    assert f'PRESENTATION_DESIGN_VERSION = "{media_contract.PRESENTATION_DESIGN_VERSION}"' in ts
    assert f'PRESENTATION_ENGINE_VERSION = "{media_contract.PRESENTATION_ENGINE_VERSION}"' in ts
    assert f'MEDIA_PIPELINE_VERSION = "{media_contract.MEDIA_PIPELINE_VERSION}"' in ts
