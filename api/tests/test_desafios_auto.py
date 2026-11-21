"""Laço dos desafios gerados automaticamente (`app/services/desafios_auto.py`).

O banco (quem entra, reivindicação, gravação como pendente, espera e tentativas) é exercitado num
Postgres real na Tarefa 1 (`test_migration_desafios_gerados_automaticamente*`). Aqui fica o que a API
faz: montar o corpo da edge, chamá-la com a chave de serviço, devolver a resposta ao banco sem decidir
nada e, com erro, dizer ao banco quanto esperar. A edge é sempre falsa (`httpx.MockTransport`).
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from app.services import desafios_auto as worker

CHAVE = "chave-de-servico-de-teste"
URL = "https://projeto.supabase.co"
CONFIG = {"ligado": True, "por_passada": 2, "intervalo_seg": 600, "por_dia": 20, "carencia_min": 60}
CONTEXTO = {
    "mode": "desafios",
    "topicName": "Leis de Newton",
    "topicoNome": "Dinâmica",
    "contents": [{"titulo": "Leis de Newton", "tipo": "texto", "conteudo": "F = m.a"}],
    "fileContents": "",
    "fileNames": [],
    "existentes": {"questoes": [], "cards": []},
    "tipoConteudo": "texto",
    "corpoConteudo": "F = m.a",
}
QUATRO = [
    {"desafio": {"tipo": "logica", "enunciado": "a"}, "resposta": {"x": 1}},
    {"desafio": {"tipo": "logica", "enunciado": "b"}, "resposta": {"x": 2}},
    {"desafio": {"tipo": "cruzadinha", "palavras": []}, "resposta": {"y": 1}},
    {"desafio": {"tipo": "cruzadinha", "palavras": []}, "resposta": {"y": 2}},
]


# ------------------------------------------------------------------------------------- banco falso
class _Resultado:
    def __init__(self, valor: Any = None, linhas: list[Any] | None = None) -> None:
        self._valor, self._linhas = valor, linhas or []

    def scalar(self) -> Any:
        return self._valor

    def scalars(self) -> Any:
        return SimpleNamespace(all=lambda: self._linhas)


class _Sessao:
    def __init__(self, banco: dict[str, Any]) -> None:
        self.banco = banco

    async def __aenter__(self) -> _Sessao:
        if self.banco.get("fora"):
            raise ConnectionError("banco fora")
        return self

    async def __aexit__(self, *_: Any) -> None:
        return None

    async def execute(self, sql: Any, params: dict[str, Any] | None = None) -> _Resultado:
        texto = str(sql)
        self.banco.setdefault("chamadas", []).append((texto, params))
        if "fn_desafios_auto_config" in texto:
            # Como o asyncpg sem codec: jsonb chega como texto.
            return _Resultado(json.dumps(self.banco.get("config", CONFIG)))
        if "fn_desafios_auto_reivindicar" in texto:
            fila = self.banco.setdefault("fila", [])
            return _Resultado(linhas=[fila.pop(0)] if fila else [])
        if "fn_desafios_auto_contexto" in texto:
            return _Resultado(json.dumps(self.banco.get("contexto", CONTEXTO)))
        if "fn_missao_desafio_registrar_auto" in texto:
            if self.banco.get("registrar_falha"):
                raise RuntimeError("registrar caiu")
            gravados = len(json.loads(params["desafios"]))
            estado = self.banco.get("registrar_estado") or ("gerado" if gravados else "sem_desafio")
            return _Resultado(json.dumps({"estado": estado, "gravados": gravados, "pulados": 0}))
        if "fn_desafios_auto_falhou" in texto:
            return _Resultado("esperando" if params["espera"] is not None else "falhou")
        return _Resultado()

    async def commit(self) -> None:
        self.banco["commits"] = self.banco.get("commits", 0) + 1


def _app(banco: dict[str, Any], **extra: Any) -> Any:
    settings = SimpleNamespace(
        supabase_url=URL,
        supabase_service_key=CHAVE,
        desafios_auto_trava_seconds=600,
        desafios_auto_timeout_seconds=150,
        desafios_auto_espera_indisponivel_min=60,
        desafios_auto_classe_ids=[],
        personalizacao_jobs_classe_ids=[],
    )
    for chave, valor in extra.items():
        setattr(settings, chave, valor)
    return SimpleNamespace(state=SimpleNamespace(settings=settings, session_factory=lambda: _Sessao(banco)))


def _chamadas(banco: dict[str, Any], funcao: str) -> list[dict[str, Any]]:
    return [p or {} for t, p in banco.get("chamadas", []) if funcao in t]


# -------------------------------------------------------------------------------------- edge falsa
class _Edge:
    """Responde em sequência; a última resposta se repete. Guarda cada pedido."""

    def __init__(self, *respostas: Any) -> None:
        self.respostas = list(respostas)
        self.pedidos: list[httpx.Request] = []

    def __call__(self, pedido: httpx.Request) -> httpx.Response:
        self.pedidos.append(pedido)
        resposta = self.respostas.pop(0) if len(self.respostas) > 1 else self.respostas[0]
        if isinstance(resposta, BaseException):
            raise resposta
        status, corpo = resposta
        if corpo is None:
            return httpx.Response(status)
        return httpx.Response(status, json=corpo)

    def cliente(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self))


def _gemini_429(*quota_ids: str, upstream: int = 429) -> dict[str, Any]:
    violacoes = [{"quotaMetric": "generate_content", "quotaId": q} for q in quota_ids]
    return {
        "error": "Gemini rate limit",
        "code": "gemini_rate_limit",
        "details": {
            "upstream_status": upstream,
            "response": {
                "error": {
                    "code": upstream,
                    "status": "RESOURCE_EXHAUSTED",
                    "details": [
                        {"@type": "type.googleapis.com/google.rpc.Help"},
                        {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": violacoes},
                    ],
                }
            },
        },
    }


POR_MINUTO = _gemini_429("GenerateRequestsPerMinutePerProjectPerModel-FreeTier")
POR_DIA = _gemini_429("GenerateRequestsPerDayPerProjectPerModel-FreeTier")


# ---------------------------------------------------------------------------------- classificação
def test_classificar_402_e_perday_sao_cota_do_dia() -> None:
    assert worker.classificar_erro(429, _gemini_429(upstream=402)) == "cota_do_dia"
    assert worker.classificar_erro(429, POR_DIA) == "cota_do_dia"
    # Basta uma violação diária entre várias.
    assert worker.classificar_erro(429, _gemini_429("PerMinute", "GenerateRequestsPerDayPerProject")) == "cota_do_dia"


def test_classificar_429_sem_perday_e_por_minuto() -> None:
    assert worker.classificar_erro(429, POR_MINUTO) == "por_minuto"
    # Sem como distinguir, é por minuto (a spec manda tratar assim).
    assert worker.classificar_erro(429, None) == "por_minuto"
    assert worker.classificar_erro(429, {"code": "gemini_rate_limit"}) == "por_minuto"
    assert worker.classificar_erro(429, {"details": {"response": "texto cru"}}) == "por_minuto"
    assert worker.classificar_erro(429, "nao e json") == "por_minuto"


@pytest.mark.parametrize("status", [0, 401, 403, 404, 503])
def test_classificar_401_403_404_0_e_503_sao_indisponivel(status: int) -> None:
    # A edge não aceitou o servidor (credencial, deploy antigo, rota) ou nem respondeu: o conteúdo
    # não tem culpa. Vale até com corpo de cota, que não é o que a edge manda nesses status.
    assert worker.classificar_erro(status, {"code": "unauthorized"}) == "indisponivel"
    assert worker.classificar_erro(status, {"code": "gemini_not_configured"}) == "indisponivel"
    assert worker.classificar_erro(status, None) == "indisponivel"


# O que a plataforma devolve com o projeto restrito (medido em 21/11, depois do deploy da v77).
PROJETO_RESTRITO = {
    "message": "Service for this project is restricted due to the following violations: exceed_egress_quota. "
    "The project owner must upgrade their plan or remove spend caps to restore service."
}


def test_402_da_plataforma_e_indisponivel() -> None:
    # A edge nunca devolve 402: o do Gemini ela converte em 429. Todo 402 na URL da função é a
    # plataforma barrando o projeto (cota de egress, plano), e vale para todo conteúdo.
    assert worker.classificar_erro(402, PROJETO_RESTRITO) == "indisponivel"
    assert worker.classificar_erro(402, None) == "indisponivel"


async def test_projeto_restrito_espera_sem_contar_falha_e_guarda_codigo_proprio() -> None:
    banco: dict[str, Any] = {"fila": [11, 12]}
    async with _Edge((402, PROJETO_RESTRITO)).cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    (falha,) = _chamadas(banco, "fn_desafios_auto_falhou")
    # A mensagem livre não vai ao banco; o código diz o que foi, para o aviso do monitor.
    assert falha == {"id": 11, "erro": "402 projeto_restrito", "espera": 60}
    assert contagem["esperando"] == 1 and contagem["falhou"] == 0 and contagem["sem_culpa"] == 1
    assert banco["fila"] == [12]


@pytest.mark.parametrize("status", [400, 422, 500, 502, 504, 546])
def test_classificar_timeout_e_502_sao_outro(status: int) -> None:
    assert worker.classificar_erro(status, {"code": "gemini_error"}) == "outro"
    # 402 do Gemini sem o 429 da edge não é cota: o contrato da edge sempre devolve 429.
    assert worker.classificar_erro(status, _gemini_429(upstream=402)) == "outro"


def _gemini_erro(upstream: int, razao: str | None = None) -> dict[str, Any]:
    """O 502 `gemini_error` da edge (`geminiHttpError`), com a resposta crua do Gemini em `details`."""
    detalhes = [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": razao}] if razao else []
    return {
        "error": "Gemini API error",
        "code": "gemini_error",
        "details": {
            "upstream_status": upstream,
            "response": {"error": {"code": upstream, "status": "X", "details": detalhes}},
        },
    }


@pytest.mark.parametrize("upstream", [401, 403, 404, 500, 503])
def test_gemini_fora_por_chave_modelo_ou_servidor_e_pane(upstream: int) -> None:
    # Chave sem permissão, modelo retirado ou o Gemini fora depois do rodízio: vale para todo
    # conteúdo, então não é culpa deste.
    assert worker.classificar_erro(502, _gemini_erro(upstream)) == "pane"


def test_chave_invalida_do_gemini_e_pane() -> None:
    # A rotação devolve o 400 na hora, sem tentar a próxima chave: uma chave inválida na frente da
    # lista derruba todo pedido.
    assert worker.classificar_erro(502, _gemini_erro(400, "API_KEY_INVALID")) == "pane"


def test_400_do_gemini_por_outro_motivo_e_do_conteudo() -> None:
    # Pedido grande demais, argumento inválido: é este pedido, e contar tentativa para na 3ª.
    assert worker.classificar_erro(502, _gemini_erro(400)) == "outro"
    assert worker.classificar_erro(502, _gemini_erro(400, "INVALID_ARGUMENT")) == "outro"


def test_rede_do_gemini_e_500_sem_codigo_sao_pane() -> None:
    assert worker.classificar_erro(502, {"error": "x", "code": "gemini_network_error"}) == "pane"
    # O `catch` final da edge: exceção que ninguém tratou, sem `code`.
    assert worker.classificar_erro(500, {"error": "Unexpected error"}) == "pane"
    assert worker.classificar_erro(500, None) == "pane"


def test_falha_do_proprio_pedido_continua_contando() -> None:
    assert worker.classificar_erro(502, {"error": "invalid_ai_response", "message": "x"}) == "outro"
    assert worker.classificar_erro(422, {"error": "x", "code": "ai_truncated"}) == "outro"
    assert worker.classificar_erro(504, {"error": "x", "code": "ai_timeout"}) == "outro"
    assert worker.classificar_erro(500, {"error": "x", "code": "gemini_error"}) == "outro"


@pytest.mark.parametrize("excecao", ["ReadTimeout", "ReadError", "RemoteProtocolError"])
def test_pedido_que_chegou_e_nao_voltou_e_outro(excecao: str) -> None:
    # O pedido chegou à edge, que pode ter chamado o Gemini: espera sem contar não tem limite.
    assert worker.classificar_erro(0, {"code": excecao}) == "outro"


# ------------------------------------------------------------------------------- virada do Pacífico
def test_virada_do_pacifico_no_horario_de_verao_e_fora() -> None:
    # Julho: PDT (UTC-7). Meia-noite em Los Angeles é 07:00 UTC.
    verao = worker.proxima_virada_do_pacifico(datetime(2026, 7, 1, 12, 0, tzinfo=UTC))
    assert verao == datetime(2026, 7, 2, 7, 0, tzinfo=UTC)
    # Dezembro: PST (UTC-8). 08:00 UTC.
    inverno = worker.proxima_virada_do_pacifico(datetime(2026, 12, 1, 12, 0, tzinfo=UTC))
    assert inverno == datetime(2026, 12, 2, 8, 0, tzinfo=UTC)
    # Antes da virada do mesmo dia UTC: ainda é a meia-noite de hoje em Los Angeles.
    cedo = worker.proxima_virada_do_pacifico(datetime(2026, 12, 1, 3, 0, tzinfo=UTC))
    assert cedo == datetime(2026, 12, 1, 8, 0, tzinfo=UTC)
    # Exatamente na virada: a próxima, não ela mesma.
    assert worker.proxima_virada_do_pacifico(inverno) == datetime(2026, 12, 3, 8, 0, tzinfo=UTC)
    assert verao.tzinfo is not None and verao.utcoffset().total_seconds() == 0


# ------------------------------------------------------------------------------------ o corpo
def test_enderecos_youtube_link_e_texto() -> None:
    esperado = {"videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
    for corpo in (
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ?t=42",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "https://youtube.com/shorts/dQw4w9WgXcQ",
        '  <iframe width="560" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe>',
    ):
        assert worker.enderecos("video", corpo) == esperado, corpo
    assert worker.enderecos("video", "https://vimeo.com/123456789") == {}
    assert worker.enderecos("video", "videos/aula.mp4") == {}
    assert worker.enderecos("link", "  https://pt.wikipedia.org/wiki/Isaac_Newton  ") == {
        "linkUrl": "https://pt.wikipedia.org/wiki/Isaac_Newton"
    }
    assert worker.enderecos("link", "veja https://a.b e https://c.d") == {}
    assert worker.enderecos("link", "ftp://a.b/c") == {}
    assert worker.enderecos("texto", "https://www.youtube.com/watch?v=dQw4w9WgXcQ") == {}
    assert worker.enderecos("video", "") == {}


def test_corpo_sem_campos_internos_nem_nulos() -> None:
    contexto = {
        **CONTEXTO,
        "orientacao": None,
        "tipoConteudo": "video",
        "corpoConteudo": "https://youtu.be/dQw4w9WgXcQ",
    }
    corpo = worker.corpo_do_pedido(contexto)
    assert "tipoConteudo" not in corpo and "corpoConteudo" not in corpo
    assert "orientacao" not in corpo
    assert corpo["videoUrl"] == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert corpo["mode"] == "desafios"
    assert corpo["topicName"] == "Leis de Newton"
    # O contexto do banco não é alterado.
    assert contexto["tipoConteudo"] == "video"
    # Conteúdo de texto não ganha endereço; nulos no tipo/corpo não quebram.
    assert "videoUrl" not in worker.corpo_do_pedido({**CONTEXTO, "tipoConteudo": None, "corpoConteudo": None})


# ------------------------------------------------------------------------------------- as passadas
async def test_passada_sucesso_registra_lista_inteira() -> None:
    banco: dict[str, Any] = {"fila": [11]}
    edge = _Edge((200, {"desafios": QUATRO, "descartados": 1}))
    async with edge.cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    assert contagem["gerado"] == 1 and contagem["falhou"] == 0
    (registro,) = _chamadas(banco, "fn_missao_desafio_registrar_auto")
    assert registro["id"] == 11
    assert json.loads(registro["desafios"]) == QUATRO
    (pedido,) = edge.pedidos
    assert str(pedido.url) == f"{URL}/functions/v1/generate-content-ai"
    assert pedido.method == "POST"
    enviado = json.loads(pedido.content)
    assert enviado["mode"] == "desafios" and "tipoConteudo" not in enviado
    assert _chamadas(banco, "fn_desafios_auto_falhou") == []


async def test_passada_lista_vazia_vai_ao_banco() -> None:
    banco: dict[str, Any] = {"fila": [11]}
    edge = _Edge((200, {"desafios": [], "descartados": 4}))
    async with edge.cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    (registro,) = _chamadas(banco, "fn_missao_desafio_registrar_auto")
    assert json.loads(registro["desafios"]) == []
    assert contagem["sem_desafio"] == 1
    assert _chamadas(banco, "fn_desafios_auto_falhou") == []


async def test_passada_429_por_minuto_espera_15_e_para() -> None:
    banco: dict[str, Any] = {"fila": [11, 12]}
    edge = _Edge((429, POR_MINUTO))
    async with edge.cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    (falha,) = _chamadas(banco, "fn_desafios_auto_falhou")
    assert falha == {"id": 11, "erro": "429 gemini_rate_limit", "espera": 15}
    # A passada para: o segundo nem é reivindicado.
    assert len(_chamadas(banco, "fn_desafios_auto_reivindicar")) == 1
    assert banco["fila"] == [12]
    assert contagem["esperando"] == 1 and contagem["falhou"] == 0
    assert "pausa_ate" not in contagem


async def test_429_por_minuto_em_toda_chamada_nunca_e_falha_definitiva() -> None:
    # Foco 3: a edge devolve 429 por minuto sempre, passada após passada, inclusive sem detalhe
    # nenhum. Nenhum conteúdo chega a `fn_desafios_auto_falhou` sem espera (o que contaria tentativa).
    banco: dict[str, Any] = {}
    edge = _Edge((429, POR_MINUTO), (429, {"code": "gemini_rate_limit"}), (429, None), (429, POR_MINUTO))
    async with edge.cliente() as cliente:
        for passada in range(8):
            banco["fila"] = [100 + passada, 200 + passada]
            await worker.processar_uma_vez(_app(banco), cliente)
    falhas = _chamadas(banco, "fn_desafios_auto_falhou")
    assert len(falhas) == 8
    assert all(f["espera"] == 15 for f in falhas)
    assert _chamadas(banco, "fn_missao_desafio_registrar_auto") == []


async def test_passada_402_pausa_ate_a_virada(monkeypatch: pytest.MonkeyPatch) -> None:
    agora = datetime(2026, 12, 1, 20, 30, tzinfo=UTC)  # 12:30 em Los Angeles
    monkeypatch.setattr(worker, "_agora", lambda: agora)
    banco: dict[str, Any] = {"fila": [11, 12]}
    edge = _Edge((429, _gemini_429(upstream=402)))
    async with edge.cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    (falha,) = _chamadas(banco, "fn_desafios_auto_falhou")
    # Virada às 08:00 UTC do dia 2: 11h30 = 690 minutos.
    assert falha == {"id": 11, "erro": "429 gemini_rate_limit", "espera": 690}
    assert contagem["pausa_ate"] == int(datetime(2026, 12, 2, 8, 0, tzinfo=UTC).timestamp())
    assert contagem["esperando"] == 1
    assert banco["fila"] == [12]


async def test_passada_timeout_conta_falha() -> None:
    # O 504 `ai_timeout` é a edge dizendo que o modelo não terminou: falha do pedido, conta tentativa.
    # (O timeout do próprio cliente, sem resposta nenhuma, espera: ver o teste abaixo.)
    banco: dict[str, Any] = {"fila": [11, 12]}
    edge = _Edge((504, {"error": "x", "code": "ai_timeout"}), (502, {"error": "x", "code": "gemini_error"}))
    async with edge.cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    falhas = _chamadas(banco, "fn_desafios_auto_falhou")
    assert [f["id"] for f in falhas] == [11, 12]
    assert all(f["espera"] is None for f in falhas)
    assert falhas[0]["erro"] == "504 ai_timeout"
    assert falhas[1]["erro"] == "502 gemini_error"
    assert contagem["falhou"] == 2


async def test_edge_inalcancavel_espera_sem_contar_falha() -> None:
    for excecao in (httpx.ConnectError("sem rede"), httpx.ConnectTimeout("sem rede"), httpx.PoolTimeout("cheio")):
        banco: dict[str, Any] = {"fila": [11, 12]}
        async with _Edge(excecao).cliente() as cliente:
            contagem = await worker.processar_uma_vez(_app(banco), cliente)
        (falha,) = _chamadas(banco, "fn_desafios_auto_falhou")
        assert falha == {"id": 11, "erro": f"0 {type(excecao).__name__}", "espera": 60}
        assert contagem["esperando"] == 1 and contagem["falhou"] == 0
        assert contagem["sem_culpa"] == 1
        assert banco["fila"] == [12]


async def test_resposta_que_nao_volta_conta_falha() -> None:
    for excecao in (httpx.ReadTimeout("demorou"), httpx.RemoteProtocolError("cortou")):
        banco: dict[str, Any] = {"fila": [11, 12]}
        async with _Edge(excecao).cliente() as cliente:
            contagem = await worker.processar_uma_vez(_app(banco), cliente)
        falhas = _chamadas(banco, "fn_desafios_auto_falhou")
        assert falhas[0] == {"id": 11, "erro": f"0 {type(excecao).__name__}", "espera": None}
        assert contagem["falhou"] == 2 and contagem["esperando"] == 0


async def test_pane_do_gemini_em_toda_chamada_nunca_e_falha_definitiva(caplog: pytest.LogCaptureFixture) -> None:
    # Modelo retirado (404), chave inválida, Gemini fora: três dias assim queimavam ~20 conteúdos.
    banco: dict[str, Any] = {}
    edge = _Edge(
        (502, _gemini_erro(404)),
        (502, _gemini_erro(400, "API_KEY_INVALID")),
        (502, {"error": "x", "code": "gemini_network_error"}),
        (500, {"error": "Unexpected error"}),
        (502, _gemini_erro(503)),
    )
    with caplog.at_level("WARNING"):
        async with edge.cliente() as cliente:
            for passada in range(6):
                banco["fila"] = [900 + passada, 1900 + passada]
                contagem = await worker.processar_uma_vez(_app(banco), cliente)
                assert banco["fila"] == [1900 + passada]
                assert contagem["esperando"] == 1 and contagem["falhou"] == 0 and contagem["sem_culpa"] == 1
    falhas = _chamadas(banco, "fn_desafios_auto_falhou")
    assert len(falhas) == 6 and all(f["espera"] == 60 for f in falhas)
    assert falhas[0]["erro"] == "502 gemini_error" and falhas[3]["erro"] == "500 sem_codigo"
    assert sum("o Gemini nao respondeu" in r.getMessage() for r in caplog.records) == 6


def test_alarme_a_partir_da_sexta_passada_seguida_e_depois_a_cada_seis() -> None:
    assert [n for n in range(1, 20) if worker.deve_alarmar(n)] == [6, 12, 18]


async def test_laco_alarma_em_erro_quando_a_espera_nao_passa(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    passadas: list[int] = []

    async def processar(_app: Any, _cliente: Any, *, config: Any = None) -> dict[str, int]:
        passadas.append(1)
        # Seis passadas paradas sem culpa com uma vazia no meio (a 3ª: fila curta, todos esperando),
        # uma que gerou (a 8ª), e mais seis paradas.
        n = len(passadas)
        if n == 3:
            return dict.fromkeys(worker.RESULTADOS, 0)
        return {"esperando": 1, "sem_culpa": 1} if n != 8 else {"gerado": 1}

    async def dormir(_: float) -> None:
        if len(passadas) >= 14:
            raise asyncio.CancelledError

    monkeypatch.setattr(worker, "processar_uma_vez", processar)
    monkeypatch.setattr(worker.asyncio, "sleep", dormir)
    with caplog.at_level("WARNING"), pytest.raises(asyncio.CancelledError):
        await worker.desafios_auto_loop(_app({}))
    erros = [r for r in caplog.records if r.levelname == "ERROR"]
    # A passada vazia não zera nem conta; a que gerou zera: a segunda sequência alarma na sexta de novo.
    assert len(erros) == 2
    assert all("6 passadas seguidas" in r.getMessage() for r in erros)


async def test_edge_401_em_toda_chamada_nunca_e_falha_definitiva(caplog: pytest.LogCaptureFixture) -> None:
    # A API publicou pelo sync do espelho antes do deploy manual da edge: a edge antiga responde 401
    # a todo pedido do servidor. Nenhum conteúdo pode perder tentativa por isso.
    banco: dict[str, Any] = {}
    edge = _Edge(
        (401, {"error": "nao autorizado", "code": "unauthorized"}),
        (401, None),
        (403, {"code": "forbidden"}),
        (404, None),
        (503, {"error": "x", "code": "gemini_not_configured"}),
        (401, None),
    )
    with caplog.at_level("WARNING"):
        async with edge.cliente() as cliente:
            for passada in range(8):
                banco["fila"] = [900 + passada, 1900 + passada]
                contagem = await worker.processar_uma_vez(_app(banco), cliente)
                # A passada para no primeiro: o segundo nem é reivindicado.
                assert banco["fila"] == [1900 + passada]
                assert contagem["esperando"] == 1 and contagem["falhou"] == 0
    falhas = _chamadas(banco, "fn_desafios_auto_falhou")
    assert len(falhas) == 8
    assert all(f["espera"] == 60 for f in falhas)
    assert not any(f["espera"] is None for f in falhas)
    assert falhas[0]["erro"] == "401 unauthorized" and falhas[1]["erro"] == "401 sem_codigo"
    assert len(edge.pedidos) == 8
    avisos = [r.getMessage() for r in caplog.records if "nao aceitou o servidor" in r.getMessage()]
    assert len(avisos) == 8  # um por passada
    assert all(CHAVE not in r.getMessage() for r in caplog.records)


async def test_espera_de_indisponivel_vem_do_setting() -> None:
    banco: dict[str, Any] = {"fila": [11]}
    async with _Edge((401, None)).cliente() as cliente:
        await worker.processar_uma_vez(_app(banco, desafios_auto_espera_indisponivel_min=5), cliente)
    assert _chamadas(banco, "fn_desafios_auto_falhou")[0]["espera"] == 5


@pytest.mark.parametrize(
    "proprias, jobs, esperado",
    [
        ([66, 70], [5], "turmas: 66, 70 (de desafios_auto_classe_ids)"),
        ([], [5], "turmas: 5 (de personalizacao_jobs_classe_ids (recuo))"),
        ([], [], "turmas: todas (de nenhuma lista)"),
    ],
)
async def test_loga_turmas_efetivas_ao_subir(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, proprias: list[int], jobs: list[int], esperado: str
) -> None:
    async def dormir(_: float) -> None:
        raise asyncio.CancelledError

    monkeypatch.setattr(worker.asyncio, "sleep", dormir)
    banco: dict[str, Any] = {"fila": []}
    app = _app(banco, desafios_auto_classe_ids=proprias, personalizacao_jobs_classe_ids=jobs)
    with caplog.at_level("INFO"), pytest.raises(asyncio.CancelledError):
        await worker.desafios_auto_loop(app)
    assert any(esperado in r.getMessage() for r in caplog.records), [r.getMessage() for r in caplog.records]


async def test_erro_guardado_nao_leva_material() -> None:
    banco: dict[str, Any] = {"fila": [11]}
    edge = _Edge((502, {"error": "Resposta inválida: F = m.a", "code": "invalid_ai_response", "details": "F = m.a"}))
    async with edge.cliente() as cliente:
        await worker.processar_uma_vez(_app(banco), cliente)
    (falha,) = _chamadas(banco, "fn_desafios_auto_falhou")
    assert falha["erro"] == "502 invalid_ai_response"
    # 546 vem sem corpo.
    banco = {"fila": [11]}
    async with _Edge((546, None)).cliente() as cliente:
        await worker.processar_uma_vez(_app(banco), cliente)
    (falha,) = _chamadas(banco, "fn_desafios_auto_falhou")
    assert falha["erro"] == "546 sem_codigo" and falha["espera"] is None


async def test_erro_guardado_usa_error_quando_falta_code() -> None:
    # A 502 `invalid_ai_response` da edge só traz `error`: sem isso, a falha mais comum do conteúdo
    # ficava "502 sem_codigo", igual a uma 502 do gateway.
    banco: dict[str, Any] = {"fila": [11]}
    edge = _Edge((502, {"error": "invalid_ai_response", "message": "Não foi possível: F = m.a", "raw": "F = m.a"}))
    async with edge.cliente() as cliente:
        await worker.processar_uma_vez(_app(banco), cliente)
    (falha,) = _chamadas(banco, "fn_desafios_auto_falhou")
    assert falha["erro"] == "502 invalid_ai_response"
    # Frase livre em `error` não entra: pode levar o material.
    banco = {"fila": [11]}
    async with _Edge((502, {"error": "Resposta inválida: F = m.a"})).cliente() as cliente:
        await worker.processar_uma_vez(_app(banco), cliente)
    (falha,) = _chamadas(banco, "fn_desafios_auto_falhou")
    assert falha["erro"] == "502 sem_codigo"


async def test_conteudo_que_sumiu_nao_chama_a_edge() -> None:
    banco: dict[str, Any] = {"fila": [11], "contexto": None}
    edge = _Edge((200, {"desafios": QUATRO}))
    async with edge.cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    assert contagem["sumiu"] == 1
    assert edge.pedidos == []


async def test_ja_tinha_e_contado() -> None:
    banco: dict[str, Any] = {"fila": [11], "registrar_estado": "ja_tinha"}
    async with _Edge((200, {"desafios": QUATRO})).cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    assert contagem["ja_tinha"] == 1


async def test_banco_fora_nao_derruba_o_laco(monkeypatch: pytest.MonkeyPatch) -> None:
    banco: dict[str, Any] = {"fora": True}
    sonos: list[float] = []

    async def dormir(segundos: float) -> None:
        sonos.append(segundos)
        if len(sonos) >= 3:
            raise asyncio.CancelledError

    monkeypatch.setattr(worker.asyncio, "sleep", dormir)
    with pytest.raises(asyncio.CancelledError):
        await worker.desafios_auto_loop(_app(banco))
    # Três voltas, cada uma com o intervalo padrão: o laço segue vivo.
    assert sonos == [600, 600, 600]


async def test_registrar_que_cai_vira_falha_e_segue() -> None:
    banco: dict[str, Any] = {"fila": [11, 12], "registrar_falha": True}
    async with _Edge((200, {"desafios": QUATRO})).cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    falhas = _chamadas(banco, "fn_desafios_auto_falhou")
    assert [f["id"] for f in falhas] == [11, 12]
    assert falhas[0]["erro"] == "banco RuntimeError" and falhas[0]["espera"] is None
    assert contagem["falhou"] == 2


async def test_cancelamento_sobe_do_meio_da_passada() -> None:
    banco: dict[str, Any] = {"fila": [11]}
    async with _Edge(asyncio.CancelledError()).cliente() as cliente:
        with pytest.raises(asyncio.CancelledError):
            await worker.processar_uma_vez(_app(banco), cliente)
    assert _chamadas(banco, "fn_desafios_auto_falhou") == []


async def test_desligado_nao_reivindica(monkeypatch: pytest.MonkeyPatch) -> None:
    banco: dict[str, Any] = {"fila": [11], "config": {**CONFIG, "ligado": False, "intervalo_seg": 900}}
    edge = _Edge((200, {"desafios": QUATRO}))
    async with edge.cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    assert _chamadas(banco, "fn_desafios_auto_reivindicar") == []
    assert edge.pedidos == [] and not any(contagem.values())

    sonos: list[float] = []

    async def dormir(segundos: float) -> None:
        sonos.append(segundos)
        raise asyncio.CancelledError

    monkeypatch.setattr(worker.asyncio, "sleep", dormir)
    with pytest.raises(asyncio.CancelledError):
        await worker.desafios_auto_loop(_app(banco))
    assert sonos == [900]
    assert _chamadas(banco, "fn_desafios_auto_reivindicar") == []


async def test_sem_credencial_loga_uma_vez_e_dorme(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    banco: dict[str, Any] = {"fila": [11]}
    sonos: list[float] = []

    async def dormir(segundos: float) -> None:
        sonos.append(segundos)
        if len(sonos) >= 3:
            raise asyncio.CancelledError

    monkeypatch.setattr(worker.asyncio, "sleep", dormir)
    with caplog.at_level("WARNING"), pytest.raises(asyncio.CancelledError):
        await worker.desafios_auto_loop(_app(banco, supabase_service_key=None))
    assert len(sonos) == 3
    assert sum("sem SUPABASE" in r.getMessage() for r in caplog.records) == 1
    assert _chamadas(banco, "fn_desafios_auto_reivindicar") == []


async def test_header_leva_a_chave_de_servico(caplog: pytest.LogCaptureFixture) -> None:
    banco: dict[str, Any] = {"fila": [11, 12]}

    def edge(pedido: httpx.Request) -> httpx.Response:
        if pedido.headers.get("authorization") != f"Bearer {CHAVE}" or pedido.headers.get("apikey") != CHAVE:
            return httpx.Response(401, json={"error": "nao autorizado", "code": "unauthorized"})
        assert pedido.headers.get("content-type") == "application/json"
        return httpx.Response(200, json={"desafios": QUATRO})

    with caplog.at_level("DEBUG"):
        async with httpx.AsyncClient(transport=httpx.MockTransport(edge)) as cliente:
            contagem = await worker.processar_uma_vez(_app(banco), cliente)
    assert contagem["gerado"] == 2
    assert all(CHAVE not in r.getMessage() for r in caplog.records)


async def test_respeita_classe_ids() -> None:
    banco: dict[str, Any] = {"fila": []}
    await worker.processar_uma_vez(_app(banco, desafios_auto_classe_ids=[66, 70]), _Edge((200, {})).cliente())
    (reivindicar,) = _chamadas(banco, "fn_desafios_auto_reivindicar")
    assert reivindicar == {"limite": 1, "trava": 600, "classes": [66, 70]}
    # Vazia, cai na guarda dos jobs de personalização (#652); as duas vazias, todas as turmas.
    banco = {"fila": []}
    await worker.processar_uma_vez(_app(banco, personalizacao_jobs_classe_ids=[5]), _Edge((200, {})).cliente())
    assert _chamadas(banco, "fn_desafios_auto_reivindicar")[0]["classes"] == [5]
    banco = {"fila": []}
    await worker.processar_uma_vez(_app(banco), _Edge((200, {})).cliente())
    assert _chamadas(banco, "fn_desafios_auto_reivindicar")[0]["classes"] is None


async def test_por_passada_limita_quantos() -> None:
    banco: dict[str, Any] = {"fila": [1, 2, 3], "config": {**CONFIG, "por_passada": 2}}
    async with _Edge((200, {"desafios": QUATRO})).cliente() as cliente:
        contagem = await worker.processar_uma_vez(_app(banco), cliente)
    assert contagem["gerado"] == 2 and banco["fila"] == [3]


@pytest.mark.parametrize("bruto, esperado", [('{"a": 1}', {"a": 1}), ("nao e json", None), ({"a": 1}, {"a": 1}), (None, None)])
def test_json_do_asyncpg_sem_codec(bruto: Any, esperado: Any) -> None:
    assert worker._json(bruto) == esperado
