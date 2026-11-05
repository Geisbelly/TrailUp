"""O cache do provedor só vale até a primeira diferença do pedido: o que muda vem por último."""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock

from app.core.settings import Settings
from app.services import personalizacao


def _capturar_payload(**campos: Any) -> dict[str, Any]:
    llm = AsyncMock()
    llm.ainvoke_json = AsyncMock(return_value={})
    asyncio.run(
        personalizacao._invoke_media_stage_llm(
            llm=llm,
            settings=Settings(supabase_jwt_secret="x", admin_panel_password="x", cors_allow_origins=["https://a"]),
            stage="planejamento",
            formato="cards",
            context_payload=campos,
            fallback_payload=None,
        )
    )
    return llm.ainvoke_json.await_args.kwargs["payload"]


def test_etapa_e_formato_vem_depois_do_que_as_etapas_compartilham() -> None:
    payload = _capturar_payload(
        etapa="planejamento", formato="cards", perfil_editorial={"perfil": "Seeker"},
        topico={"titulo_modulo": "Frações"}, fontes_chunks=["a"], arco_narrativo_turma={"tema": "t"},
    )

    assert list(payload) == ["topico", "fontes_chunks", "arco_narrativo_turma", "etapa", "formato", "perfil_editorial"]


def test_reordenar_nao_perde_nem_muda_campo() -> None:
    campos = {"formato": "audio", "topico": {"a": 1}, "extra": [1, 2]}

    assert _capturar_payload(**campos) == campos
