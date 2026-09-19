"""`pronto` significa "o ciclo fechou inteiro" -- e o caminho legacy mentia.

Ha tres gravadores de `status = 'pronto'` em `conteudo_personalizado`:

  1. `_normalize_completed_generation_status` -- exige as tres midias
     obrigatorias `completed` com o `generation_key` corrente;
  2. a RPC `merge_personalizacao_materiais_v2` -- a mesma conta em SQL, e
     ainda rebaixa um `pronto` velho para `processando_midias`;
  3. o ramo "legacy media_snapshot" de `_process_media_render_target` -- que
     gravava `pronto` INCONDICIONALMENTE.

E o guard desse terceiro era `media_snapshot is not None`. Como o valor vem de
`job.get("media_snapshot") if isinstance(..., dict) else {}`, ele e um dict --
e `{} is not None` e sempre verdadeiro. Resultado: qualquer target com
`personalizacao_id` caia no ramo legacy, mesmo com snapshot vazio, o que ao
mesmo tempo:

  - curto-circuitava o caminho de geracao de verdade (que fica ACIMA), e
  - gravava `pronto` sem ter materializado nada.

Medido no topico 128 (classe 32), job 6d21ec28 com `media_snapshot = '{}'` e
os 7 targets carregando `personalizacao_id` de uma tentativa anterior:

    perfil       markdown  audio   apresentacao        status
    achiever     6/6       6/6     0/6 (6 falhas)      pronto
    daredevil    6/6       6/6     0/6 (6 falhas)      pronto
    seeker       6/6       3/6     4/6 (2 falhas)      pronto
    socializer   6/6       6/6     3/6 (3 falhas)      pronto

Os targets desses quatro viraram `completed`, porque target `completed` e
derivado de record `pronto`. O aluno abriria a trilha e encontraria um deck
que nao existe -- e `formatos_gerados`, que e o INDICE que o app consulta
(ver 20260831_02_formatos_gerados_reflete_o_que_existe), seguia em `{cards}`.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.services import personalizacao_jobs
from app.services.personalizacao_jobs import (
    _build_generation_key,
    _process_media_render_target,
)

CICLO = "ciclo-abc"
HASH = "hash-def"
CHAVE = _build_generation_key(ciclo_id=CICLO, source_hash=HASH)


def _midia_completa(kind: str) -> dict[str, Any]:
    """Metadata que passa o gate: `completed` + generation_key corrente. A
    apresentacao exige tambem engine/design/pipeline batendo com as constantes
    do modulo -- e por isso que elas sao lidas de la, nao escritas a mao."""
    metadata: dict[str, Any] = {
        "status": "completed",
        "media_kind": kind,
        "generation_key": CHAVE,
    }
    if kind == "apresentacao":
        metadata.update(
            {
                "engine": personalizacao_jobs.PRESENTATION_ENGINE_VERSION,
                "design_system": personalizacao_jobs.PRESENTATION_DESIGN_VERSION,
                "media_pipeline_version": personalizacao_jobs.MEDIA_PIPELINE_VERSION,
            }
        )
    return {"arquivo_url": f"https://exemplo/{kind}", "metadata": metadata}


def _midia_pendente(kind: str) -> dict[str, Any]:
    return {
        "arquivo_url": None,
        "metadata": {"status": "pending", "media_kind": kind, "generation_key": CHAVE},
    }


def _registro(materiais: dict[str, Any], *, status: str) -> dict[str, Any]:
    return {
        "id": 3699,
        "aluno_id": None,
        "classe_id": 32,
        "topico_id": 128,
        "conteudo_id": 177,
        "ciclo_id": CICLO,
        "source_hash": HASH,
        "status": status,
        "materiais": materiais,
    }


def _alvo() -> dict[str, Any]:
    return {
        "id": 7,
        "aluno_id": None,
        "topico_id": 128,
        "conteudo_id": 177,
        "personalizacao_id": 3699,
        "status": "pending",
        "attempts": 0,
        "brainhex_profile_key": "achiever",
        "is_profile_template": True,
    }


def _instalar_fakes(monkeypatch, registro: dict[str, Any]) -> list[dict[str, Any]]:
    """Devolve a lista onde cada gravacao de status fica registrada."""
    gravacoes: list[dict[str, Any]] = []

    async def buscar_por_id(_self, _record_id):
        return dict(registro)

    async def atualizar_materiais_e_status(_self, *, record_id, materiais, status):
        gravacoes.append({"record_id": record_id, "materiais": materiais, "status": status})
        return {**registro, "materiais": materiais, "status": status}

    async def listar_por_personalizacao(_self, *, personalizacao_id):
        del personalizacao_id
        return []

    async def resolver_ids_por_tipo_recente(_self, **_kwargs):
        return {}

    async def update_job_media_snapshot(_self, *, job_id, media_snapshot):
        del job_id, media_snapshot

    # `_process_media_render_target` confere o contrato do microservice ANTES
    # de qualquer coisa cara e devolve {"deferred": True} se ele nao responde.
    # Sem isto, todo teste aqui pararia nesse adiamento.
    async def contrato_ok(**_kwargs):
        return True

    monkeypatch.setattr(personalizacao_jobs, "brainhex_contract_ready", contrato_ok)

    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        buscar_por_id,
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository"
        ".atualizar_materiais_e_status",
        atualizar_materiais_e_status,
    )
    monkeypatch.setattr(
        "app.repositories.materiais.MateriaisRepository.listar_por_personalizacao",
        listar_por_personalizacao,
    )
    monkeypatch.setattr(
        "app.repositories.materiais.MateriaisRepository.resolver_ids_por_tipo_recente",
        resolver_ids_por_tipo_recente,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository"
        ".update_job_media_snapshot",
        update_job_media_snapshot,
    )
    return gravacoes


def _app() -> SimpleNamespace:
    return SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace()))


@pytest.mark.asyncio
async def test_legacy_nao_grava_pronto_com_apresentacao_incompleta(monkeypatch) -> None:
    """O caso medido: markdown e audio prontos, apresentacao ainda pendente.

    Antes gravava `pronto`. Agora o status anterior fica, e a retentativa
    segue -- quem declara falha e o caminho explicito, que sabe o motivo."""
    registro = _registro(
        {
            "markdown": _midia_completa("markdown"),
            "audio": _midia_completa("audio"),
            "apresentacao": _midia_pendente("apresentacao"),
        },
        status="processando_midias",
    )
    gravacoes = _instalar_fakes(monkeypatch, registro)

    # Snapshot NAO vazio (senao o ramo legacy nem e alcancado), mas o que ele
    # traz para a apresentacao continua pendente.
    job = {
        "id": "job-1",
        "classe_id": 32,
        "kind": "manual_retry",
        "payload": {},
        "media_snapshot": {
            "shared_rendered_media": {"apresentacao": _midia_pendente("apresentacao")},
        },
    }

    await _process_media_render_target(
        app=_app(), session=object(), job=job, target=_alvo()
    )

    assert len(gravacoes) == 1
    assert gravacoes[0]["status"] != "pronto"
    assert gravacoes[0]["status"] == "processando_midias"


@pytest.mark.asyncio
async def test_legacy_grava_pronto_quando_as_tres_fecham(monkeypatch) -> None:
    """O gate nao pode ser um `return` disfarcado: quando a geracao de fato
    fechou, `pronto` continua sendo gravado."""
    registro = _registro(
        {
            "markdown": _midia_completa("markdown"),
            "audio": _midia_completa("audio"),
            "apresentacao": _midia_pendente("apresentacao"),
        },
        status="processando_midias",
    )
    gravacoes = _instalar_fakes(monkeypatch, registro)

    job = {
        "id": "job-2",
        "classe_id": 32,
        "kind": "manual_retry",
        "payload": {},
        "media_snapshot": {
            "shared_rendered_media": {"apresentacao": _midia_completa("apresentacao")},
        },
    }

    await _process_media_render_target(
        app=_app(), session=object(), job=job, target=_alvo()
    )

    assert len(gravacoes) == 1
    assert gravacoes[0]["status"] == "pronto"


@pytest.mark.asyncio
async def test_snapshot_vazio_nao_entra_no_ramo_legacy(monkeypatch) -> None:
    """`{} is not None` e verdadeiro -- era assim que um snapshot vazio
    sequestrava o fluxo e impedia a geracao de verdade de rodar.

    Com o guard por veracidade, o fluxo passa do ramo legacy. Para provar isso
    com uma saida limpa e assertavel, `buscar_topico_id_por_conteudo` devolve
    None: o proprio codigo trata conteudo removido retornando
    `{"skipped": True, "reason": "conteudo_removido"}` -- que so e alcancavel
    DEPOIS do ramo legacy."""
    registro = _registro(
        {"markdown": _midia_completa("markdown"), "audio": _midia_pendente("audio")},
        status="processando_midias",
    )
    gravacoes = _instalar_fakes(monkeypatch, registro)

    async def buscar_topico_id_por_conteudo(_self, _conteudo_id):
        return None

    monkeypatch.setattr(
        "app.repositories.conteudo_classe.ConteudoClasseRepository"
        ".buscar_topico_id_por_conteudo",
        buscar_topico_id_por_conteudo,
    )

    job = {
        "id": "job-3",
        "classe_id": 32,
        "kind": "manual_retry",
        "payload": {},
        "media_snapshot": {},
    }

    resultado = await _process_media_render_target(
        app=_app(), session=object(), job=job, target=_alvo()
    )

    assert resultado.get("skipped") is True
    assert resultado.get("reason") == "conteudo_removido"
    assert gravacoes == [], "o ramo legacy nao deveria ter gravado status nenhum"
