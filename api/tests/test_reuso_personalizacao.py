"""Camada antes da expansão: conteúdo idêntico se vincula ao material que já existe."""

from __future__ import annotations

import hashlib
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository as Repo
from app.services import personalizacao_jobs as jobs
from app.services.media_contract import (
    MEDIA_PIPELINE_VERSION,
    PRESENTATION_DESIGN_VERSION,
    PRESENTATION_ENGINE_VERSION,
)
from app.services.reuso_personalizacao import (
    fontes_com_hash_do_arquivo,
    impressao_do_conteudo,
    normalizar_texto,
)

VERSOES = {"pipeline": "v1"}
CONTEUDO = {"id": 1, "titulo": "Frações", "tipo": "texto", "conteudo": "Uma fração é parte de um todo.", "metadata": {}}
ATIVIDADE = {"id": 9, "titulo": "Quiz", "descricao": "Treine", "enunciado": None}
FONTE_TEXTO = {"source_id": "fonte:1", "tipo": "texto", "titulo": "Frações", "texto_base": "Uma fração é parte."}
FONTE_ARQUIVO = {
    "source_id": "fonte:2",
    "tipo": "documento",
    "titulo": "aula.pdf",
    "mime_type": "application/pdf",
    "storage_path": "prof/1/aula.pdf",
    "bucket": "conteudos",
    "conteudo_sha256": "a" * 64,
}


def _impressao(**trocas):
    base = {
        "conteudos": [CONTEUDO],
        "atividades": [ATIVIDADE],
        "fontes": [FONTE_TEXTO],
        "arco_narrativo": None,
        "versoes": VERSOES,
    }
    return impressao_do_conteudo(**{**base, **trocas})


def test_mesmo_conteudo_em_outra_turma_tem_a_mesma_impressao() -> None:
    outra_turma = {**CONTEUDO, "id": 77, "topico_id": 500, "classe_id": 8, "ordem": 4}
    outra_atividade = {**ATIVIDADE, "id": 88}
    outra_fonte = {**FONTE_TEXTO, "source_id": "fonte:900", "classe_id": 8, "conteudo_id": 77}

    assert _impressao() == _impressao(
        conteudos=[outra_turma], atividades=[outra_atividade], fontes=[outra_fonte]
    )


def test_espaco_nao_muda_a_impressao_e_uma_palavra_muda() -> None:
    com_espacos = {**CONTEUDO, "conteudo": "  Uma  fração\né parte de um todo. "}
    outra_palavra = {**CONTEUDO, "conteudo": "Uma fração é pedaço de um todo."}

    assert _impressao(conteudos=[com_espacos]) == _impressao()
    assert _impressao(conteudos=[outra_palavra]) != _impressao()


def test_maiuscula_e_acento_sao_outras_palavras() -> None:
    assert normalizar_texto("Fração") != normalizar_texto("fração")
    assert normalizar_texto("Fração") != normalizar_texto("Fracao")


def test_nfc_e_nfd_sao_o_mesmo_texto() -> None:
    assert normalizar_texto("fra\u00e7\u00e3o") == normalizar_texto("frac\u0327a\u0303o")


@pytest.mark.parametrize(
    "troca",
    [
        {"conteudos": [{**CONTEUDO, "titulo": "Outro título"}]},
        {"conteudos": [{**CONTEUDO, "tipo": "video"}]},
        {"conteudos": [{**CONTEUDO, "metadata": {"files": [{"name": "lista.pdf", "size": 10}]}}]},
        {"atividades": [{**ATIVIDADE, "descricao": "Outra"}]},
        {"atividades": []},
        {"fontes": [{**FONTE_TEXTO, "texto_base": "Outro texto."}]},
        {"fontes": [FONTE_TEXTO, FONTE_ARQUIVO]},
        {"arco_narrativo": "A turma é uma tripulação."},
        {"versoes": {"pipeline": "v2"}},
    ],
)
def test_cada_detalhe_que_entra_na_geracao_muda_a_impressao(troca) -> None:
    assert _impressao(**troca) != _impressao()


def test_tipo_de_arquivo_com_caminho_diferente_compara_pelos_bytes() -> None:
    uma = {**CONTEUDO, "tipo": "arquivo", "conteudo": "prof/1/aula.pdf"}
    outra = {**CONTEUDO, "tipo": "arquivo", "conteudo": "prof/2/copia.pdf"}
    fonte_copia = {**FONTE_ARQUIVO, "storage_path": "prof/2/copia.pdf"}

    assert _impressao(conteudos=[uma], fontes=[FONTE_ARQUIVO]) == _impressao(
        conteudos=[outra], fontes=[fonte_copia]
    )
    assert _impressao(fontes=[FONTE_ARQUIVO]) != _impressao(
        fontes=[{**FONTE_ARQUIVO, "conteudo_sha256": "b" * 64}]
    )


def test_arquivo_sem_hash_nao_afirma_nada() -> None:
    sem_hash = {key: value for key, value in FONTE_ARQUIVO.items() if key != "conteudo_sha256"}

    assert _impressao(fontes=[sem_hash]) is None


def test_sem_conteudo_nao_ha_impressao() -> None:
    assert _impressao(conteudos=[]) is None


@pytest.mark.asyncio
async def test_hash_do_arquivo_baixa_uma_vez_e_fica_guardado() -> None:
    storage = SimpleNamespace(download_bytes=AsyncMock(return_value=b"bytes do pdf"))
    repo = SimpleNamespace(atualizar_enriquecimento=AsyncMock(return_value=True))
    fonte = {key: value for key, value in FONTE_ARQUIVO.items() if key != "conteudo_sha256"}

    [saida] = await fontes_com_hash_do_arquivo(fontes=[fonte], storage=storage, fontes_repo=repo)

    esperado = hashlib.sha256(b"bytes do pdf").hexdigest()
    assert saida["conteudo_sha256"] == esperado
    assert repo.atualizar_enriquecimento.await_args.kwargs == {
        "fonte_id": 2,
        "metadata_patch": {"conteudo_sha256": esperado, "conteudo_sha256_caminho": "prof/1/aula.pdf"},
    }

    guardada = {**fonte, "metadata": {"conteudo_sha256": esperado, "conteudo_sha256_caminho": "prof/1/aula.pdf"}}
    [de_novo] = await fontes_com_hash_do_arquivo(fontes=[guardada], storage=storage, fontes_repo=repo)
    assert de_novo["conteudo_sha256"] == esperado
    assert storage.download_bytes.await_count == 1


@pytest.mark.asyncio
async def test_hash_guardado_de_outro_caminho_nao_vale() -> None:
    storage = SimpleNamespace(download_bytes=AsyncMock(return_value=b"novo"))
    repo = SimpleNamespace(atualizar_enriquecimento=AsyncMock(return_value=True))
    fonte = {
        **{key: value for key, value in FONTE_ARQUIVO.items() if key != "conteudo_sha256"},
        "metadata": {"conteudo_sha256": "c" * 64, "conteudo_sha256_caminho": "prof/1/antigo.pdf"},
    }

    [saida] = await fontes_com_hash_do_arquivo(fontes=[fonte], storage=storage, fontes_repo=repo)

    assert saida["conteudo_sha256"] == hashlib.sha256(b"novo").hexdigest()


@pytest.mark.asyncio
async def test_arquivo_que_nao_baixa_ou_grande_demais_fica_sem_hash() -> None:
    storage = SimpleNamespace(download_bytes=AsyncMock(return_value=None))
    repo = SimpleNamespace(atualizar_enriquecimento=AsyncMock())
    fonte = {key: value for key, value in FONTE_ARQUIVO.items() if key != "conteudo_sha256"}

    [falhou] = await fontes_com_hash_do_arquivo(fontes=[fonte], storage=storage, fontes_repo=repo)
    [grande] = await fontes_com_hash_do_arquivo(
        fontes=[{**fonte, "tamanho_bytes": 1024**3}], storage=storage, fontes_repo=repo
    )

    assert "conteudo_sha256" not in falhou
    assert "conteudo_sha256" not in grande
    assert storage.download_bytes.await_count == 1


# ------------------------------------------------------------------------------- o desvio no worker

IMPRESSAO = "f" * 64
CICLO_NOVO = "ciclo-novo"
HASH_NOVO = "hash-da-turma-nova"


def _materiais(chave: str) -> dict:
    completo = {"status": "completed", "generation_key": chave}
    return {
        "audio": {"metadata": dict(completo), "storage_path": "brainhex/seeker/classe-1/a.mp3"},
        "markdown": {"metadata": dict(completo), "storage_path": "brainhex/seeker/classe-1/a.md"},
        "apresentacao": {
            "metadata": {
                **completo,
                "engine": PRESENTATION_ENGINE_VERSION,
                "design_system": PRESENTATION_DESIGN_VERSION,
                "media_pipeline_version": MEDIA_PIPELINE_VERSION,
            },
            "storage_path": "brainhex/seeker/classe-1/a.html",
        },
    }


def _candidata(**trocas) -> dict:
    return {
        "id": 500,
        "ciclo_id": "ciclo-origem",
        "source_hash": "hash-origem",
        "status": "pronto",
        "materiais": _materiais("ciclo-origem:hash-origem"),
        "recente": True,
        **trocas,
    }


class _Sessao:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1

    async def execute(self, *args, **kwargs):
        raise AssertionError("repositório mockado: nada deve ir ao banco")


@pytest.fixture
def cenario(monkeypatch):
    """Worker com tudo que gasta cota mockado, para provar o que foi ou não foi chamado."""
    ctx = {
        "source_hash": HASH_NOVO,
        "ciclo_id": CICLO_NOVO,
        "impressao_conteudo": IMPRESSAO,
        "fontes": [],
        "perfil_dominante": "Seeker",
        "perfil_brainhex": [],
        "conteudo_classe": {},
        "contexto_aluno": {},
    }
    mocks = SimpleNamespace(
        ctx=ctx,
        enriquecer=AsyncMock(return_value={"blocos": [{"id": "gerado"}]}),
        cards=AsyncMock(return_value=[]),
        disparar=AsyncMock(return_value=True),
        existente=AsyncMock(return_value=None),
        travar=AsyncMock(),
        listar=AsyncMock(return_value=[]),
        vincular=AsyncMock(return_value=901),
        gravar=AsyncMock(),
        reservar=AsyncMock(return_value=False),
        buscar_id=AsyncMock(return_value={"id": 901, "status": "pronto"}),
    )
    monkeypatch.setattr(jobs, "brainhex_contract_ready", AsyncMock(return_value=True))
    monkeypatch.setattr(jobs, "fetch_personalizacao_context", AsyncMock(return_value=ctx))
    monkeypatch.setattr(jobs, "enrich_content_blocks", mocks.enriquecer)
    monkeypatch.setattr(jobs, "gerar_cards_direto", mocks.cards)
    monkeypatch.setattr(jobs, "disparar_brainhex_async", mocks.disparar)
    monkeypatch.setattr(jobs.ConteudoClasseRepository, "buscar_topico_id_por_conteudo", AsyncMock(return_value=20))
    monkeypatch.setattr(Repo, "buscar_mais_recente_por_perfil", mocks.existente)
    monkeypatch.setattr(Repo, "travar_impressao", mocks.travar)
    monkeypatch.setattr(Repo, "listar_bases_por_impressao", mocks.listar)
    monkeypatch.setattr(Repo, "vincular_a_origem", mocks.vincular)
    monkeypatch.setattr(Repo, "gravar_impressao", mocks.gravar)
    monkeypatch.setattr(Repo, "claim_new_generation", mocks.reservar)
    monkeypatch.setattr(Repo, "buscar_por_id", mocks.buscar_id)
    return mocks


async def _processar(aluno_id=None, conteudo_id=30, kind="class_delta_sync"):
    app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(personalizacao_job_stale_processing_min=15)))
    job = {"id": "job-1", "classe_id": 2, "kind": kind, "payload": {}}
    target = {
        "id": 1,
        "aluno_id": aluno_id,
        "topico_id": 20,
        "conteudo_id": conteudo_id,
        "brainhex_profile_key": "seeker",
    }
    return await jobs._process_media_render_target(app=app, session=_Sessao(), job=job, target=target)


def _nada_gerado(cenario) -> None:
    assert cenario.enriquecer.await_count == 0
    assert cenario.cards.await_count == 0
    assert cenario.disparar.await_count == 0


@pytest.mark.asyncio
async def test_conteudo_identico_vincula_sem_enriquecer_gerar_nem_tts(cenario) -> None:
    cenario.listar.return_value = [_candidata()]

    resultado = await _processar()

    assert resultado == {"record": {"id": 901, "status": "pronto"}, "vinculado_de": 500}
    _nada_gerado(cenario)
    assert cenario.reservar.await_count == 0
    assert cenario.vincular.await_args.kwargs == {
        "origem_id": 500,
        "classe_id": 2,
        "topico_id": 20,
        "conteudo_id": 30,
        "perfil": "seeker",
        "ciclo_id": CICLO_NOVO,
        "source_hash": HASH_NOVO,
        "impressao": IMPRESSAO,
    }


@pytest.mark.asyncio
async def test_vincula_tambem_em_pedido_manual_e_no_lugar_de_repetir_a_falha(cenario) -> None:
    cenario.listar.return_value = [_candidata()]
    cenario.existente.return_value = {
        "id": 900,
        "status": "failed",
        "ciclo_id": "ciclo-velho",
        "source_hash": HASH_NOVO,
        "materiais": {},
    }

    resultado = await _processar(kind="manual_retry")

    assert resultado["vinculado_de"] == 500
    _nada_gerado(cenario)


@pytest.mark.asyncio
async def test_conteudo_diferente_segue_o_fluxo_e_reserva_com_a_impressao(cenario) -> None:
    resultado = await _processar()

    assert resultado["deferred"] is True  # `reservar` perdeu a corrida: basta provar que chegou lá
    assert cenario.vincular.await_count == 0
    assert cenario.reservar.await_args.kwargs["impressao_conteudo"] == IMPRESSAO


@pytest.mark.asyncio
async def test_outra_turma_gerando_o_mesmo_conteudo_faz_esperar(cenario) -> None:
    cenario.listar.return_value = [_candidata(status="processando_midias", materiais={})]

    resultado = await _processar()

    assert resultado["deferred"] is True
    assert resultado["reason"] == jobs._MOTIVO_ESPERA_IRMA
    _nada_gerado(cenario)
    assert cenario.reservar.await_count == 0


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "candidata",
    [
        _candidata(status="processando_midias", materiais={}, recente=False),
        _candidata(status="failed"),
        _candidata(materiais={}),
        _candidata(materiais={**_materiais("ciclo-origem:hash-origem"), "apresentacao": {
            "metadata": {
                "status": "completed",
                "generation_key": "ciclo-origem:hash-origem",
                "engine": "motor-antigo",
            }
        }}),
    ],
    ids=["parada", "com_falha", "sem_midia", "deck_de_versao_antiga"],
)
async def test_origem_que_nao_serve_nao_vincula_nem_espera(cenario, candidata) -> None:
    cenario.listar.return_value = [candidata]

    await _processar()

    assert cenario.vincular.await_count == 0
    assert cenario.reservar.await_count == 1


@pytest.mark.asyncio
async def test_origem_que_mudou_no_meio_cai_na_geracao(cenario) -> None:
    cenario.listar.return_value = [_candidata()]
    cenario.vincular.return_value = None

    await _processar()

    assert cenario.reservar.await_count == 1


@pytest.mark.asyncio
async def test_sem_impressao_nao_ha_reuso(cenario) -> None:
    cenario.ctx["impressao_conteudo"] = None

    await _processar()

    assert cenario.travar.await_count == 0
    assert cenario.reservar.await_args.kwargs["impressao_conteudo"] is None


@pytest.mark.asyncio
async def test_linha_do_aluno_nao_entra_no_reuso(cenario) -> None:
    await _processar(aluno_id="b49f2e21-a6f9-4c8d-9533-5a32bb219754")

    assert cenario.travar.await_count == 0


@pytest.mark.asyncio
async def test_linha_pronta_anterior_a_camada_ganha_a_impressao_e_nao_gera(cenario) -> None:
    chave = f"ciclo-velho:{HASH_NOVO}"
    cenario.existente.return_value = {
        "id": 900,
        "status": "pronto",
        "ciclo_id": "ciclo-velho",
        "source_hash": HASH_NOVO,
        "materiais": _materiais(chave),
    }

    resultado = await _processar()

    assert resultado["skipped"] is True
    assert cenario.gravar.await_args.kwargs == {"record_id": 900, "impressao": IMPRESSAO}
    assert cenario.travar.await_count == 0
    _nada_gerado(cenario)


@pytest.mark.asyncio
async def test_expansao_de_outra_turma_e_reaproveitada_com_o_hash_proprio(monkeypatch) -> None:
    gravada = {"blocos": [{"id": "b1"}], "source_hash": "hash-origem", "tema": "Frações"}
    monkeypatch.setattr(Repo, "buscar_enriquecimento_por_impressao", AsyncMock(return_value=gravada))

    class _Fabrica:
        async def __aenter__(self):
            return _Sessao()

        async def __aexit__(self, *args):
            return False

    app = SimpleNamespace(state=SimpleNamespace(session_factory=_Fabrica))

    saida = await jobs._enriquecimento_reaproveitado(
        app, {"impressao_conteudo": IMPRESSAO, "source_hash": HASH_NOVO}
    )

    assert saida == {**gravada, "source_hash": HASH_NOVO}


@pytest.mark.asyncio
async def test_sem_impressao_nao_procura_expansao() -> None:
    assert await jobs._enriquecimento_reaproveitado(SimpleNamespace(), {"source_hash": "x"}) is None
