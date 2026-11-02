"""Worker das missões sugeridas pela IA (`app/services/missoes_ia.py`).

O banco (pedido, limites, regras do que entra, log, RLS) foi exercitado num Postgres real: ver o PR e
`test_migration_missoes_sugeridas_pela_ia.py`. Aqui fica o que a API faz: montar o que o modelo recebe,
passar a saída ao banco sem decidir nada e, sem modelo, registrar a falha.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.schemas.missoes_ia import MissoesIaSaida, PropostaDeMissao
from app.services import missoes_ia as worker
from app.services.llm import StructuredOutputError

PEDIDO = "8d0cf0cc-6f43-4a2a-8f0f-111111111111"
CONTEXTO = {
    "quantidade": 3,
    "classe": {"descricao": "Física I", "alunos": 24},
    "topico": {"titulo": "Aceleração", "descricao": "Variação da velocidade", "conteudos": [], "atividades": []},
    "topicos_da_turma": None,
    "missoes_existentes": [{"titulo": "Estude 100 minutos", "situacao": "ativa"}],
    "catalogo": [{"metrica": "minutos_totais", "unidade": "minutos", "minimo": 1, "maximo": 100000}],
}


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
        return self

    async def __aexit__(self, *_: Any) -> None:
        return None

    async def execute(self, sql: Any, params: dict[str, Any] | None = None) -> _Resultado:
        texto = str(sql)
        self.banco.setdefault("chamadas", []).append((texto, params))
        if "fn_missao_ia_reivindicar" in texto:
            fila = self.banco.setdefault("fila", [])
            return _Resultado(linhas=[fila.pop(0)] if fila else [])
        if "fn_missao_ia_contexto" in texto:
            # Como o asyncpg sem codec: jsonb chega como texto.
            return _Resultado(json.dumps(self.banco.get("contexto")))
        if "fn_missao_ia_registrar" in texto and self.banco.get("registrar_falha"):
            raise RuntimeError(self.banco["registrar_falha"])
        return _Resultado()

    async def commit(self) -> None:
        return None


class _Llm:
    def __init__(self, saida: MissoesIaSaida | Exception) -> None:
        self.saida, self.payloads = saida, []

    async def ainvoke_structured(self, *, prompt_name: str, payload: dict[str, Any], schema: Any) -> Any:
        assert prompt_name == worker.PROMPT
        assert schema is MissoesIaSaida
        self.payloads.append(payload)
        if isinstance(self.saida, Exception):
            raise self.saida
        return self.saida


def _app(banco: dict[str, Any]) -> Any:
    settings = SimpleNamespace(
        missoes_ia_lote=2,
        missoes_ia_trava_seconds=600,
        missoes_ia_classe_ids=[],
        personalizacao_jobs_classe_ids=[66],
    )
    return SimpleNamespace(state=SimpleNamespace(settings=settings, session_factory=lambda: _Sessao(banco)))


def _chamadas(banco: dict[str, Any], funcao: str) -> list[dict[str, Any]]:
    return [p for t, p in banco.get("chamadas", []) if funcao in t]


def _proposta(i: int = 1, **extra: Any) -> PropostaDeMissao:
    base = {"titulo": f"Missão {i}", "descricao": "Estude um pouco todos os dias.", "metrica": "minutos_totais", "alvo": 150}
    return PropostaDeMissao(**{**base, **extra})


def test_o_payload_nao_leva_nulo_nem_inventa_nada() -> None:
    payload = worker.montar_payload(CONTEXTO)
    assert "topicos_da_turma" not in payload
    assert payload["classe"] == {"descricao": "Física I", "alunos": 24}
    assert payload["catalogo"] == CONTEXTO["catalogo"]


def test_o_contexto_do_banco_nao_tem_dado_de_aluno() -> None:
    # O que a API repassa não pode conter nada que identifique uma pessoa: só a contagem.
    texto = json.dumps(worker.montar_payload(CONTEXTO))
    for proibido in ("aluno_id", "nome", "email", "e-mail", "telemetria"):
        assert proibido not in texto


def test_propostas_para_o_banco_corta_o_excesso_e_nao_valida() -> None:
    saida = MissoesIaSaida(propostas=[_proposta(i) for i in range(1, 11)])
    enviadas = worker.propostas_para_o_banco(saida, quantidade=3)
    # Uma folga sobre o pedido, porque o banco descarta as inválidas e fica no máximo com a quantidade.
    assert len(enviadas) == 6
    assert enviadas[0]["titulo"] == "Missão 1"


def test_o_alvo_do_modelo_passa_como_veio_para_o_banco_validar() -> None:
    saida = MissoesIaSaida(propostas=[_proposta(alvo="muitos"), _proposta(2, alvo=2.5)])
    enviadas = worker.propostas_para_o_banco(saida, quantidade=1)
    assert [p["alvo"] for p in enviadas] == ["muitos", 2.5]


async def test_passada_registra_pelo_banco_com_a_guarda_de_turmas() -> None:
    banco: dict[str, Any] = {"fila": [PEDIDO], "contexto": CONTEXTO}
    llm = _Llm(MissoesIaSaida(propostas=[_proposta(1), _proposta(2)]))
    assert await worker.processar_pedidos_uma_vez(_app(banco), llm) == {"registrada": 1, "sumiu": 0, "falhou": 0}
    assert _chamadas(banco, "fn_missao_ia_reivindicar")[0]["classes"] == [66]
    (registro,) = _chamadas(banco, "fn_missao_ia_registrar")
    assert registro["id"] == PEDIDO
    assert [p["titulo"] for p in json.loads(registro["propostas"])] == ["Missão 1", "Missão 2"]
    assert _chamadas(banco, "fn_missao_ia_falhou") == []
    assert llm.payloads[0]["quantidade"] == 3


async def test_sem_modelo_registra_a_falha_e_nao_inventa_missao() -> None:
    banco: dict[str, Any] = {"fila": [PEDIDO], "contexto": CONTEXTO}
    llm = _Llm(StructuredOutputError("Nenhum provedor LLM disponivel"))
    assert await worker.processar_pedidos_uma_vez(_app(banco), llm) == {"registrada": 0, "sumiu": 0, "falhou": 1}
    assert _chamadas(banco, "fn_missao_ia_registrar") == []
    (falha,) = _chamadas(banco, "fn_missao_ia_falhou")
    assert falha["id"] == PEDIDO and "Nenhum provedor" in falha["erro"]


async def test_modelo_que_so_manda_proposta_invalida_vira_falha_e_nao_conclusao() -> None:
    # O banco levanta quando nada passa; o pedido tem de ser tentado de novo, não fechado com zero.
    banco: dict[str, Any] = {"fila": [PEDIDO], "contexto": CONTEXTO, "registrar_falha": "o modelo não trouxe nenhuma proposta válida"}
    llm = _Llm(MissoesIaSaida(propostas=[_proposta(alvo="xyz")]))
    assert await worker.processar_pedidos_uma_vez(_app(banco), llm) == {"registrada": 0, "sumiu": 0, "falhou": 1}
    (falha,) = _chamadas(banco, "fn_missao_ia_falhou")
    assert "nenhuma proposta válida" in falha["erro"]


async def test_pedido_que_sumiu_nao_chama_o_modelo() -> None:
    banco: dict[str, Any] = {"fila": [PEDIDO], "contexto": None}
    llm = _Llm(MissoesIaSaida())
    assert await worker.processar_pedidos_uma_vez(_app(banco), llm) == {"registrada": 0, "sumiu": 1, "falhou": 0}
    assert llm.payloads == []


async def test_fila_vazia_nao_faz_nada() -> None:
    banco: dict[str, Any] = {"fila": []}
    assert await worker.processar_pedidos_uma_vez(_app(banco), _Llm(MissoesIaSaida())) == {
        "registrada": 0,
        "sumiu": 0,
        "falhou": 0,
    }


async def test_o_lote_limita_quantos_pedidos_por_passada() -> None:
    banco: dict[str, Any] = {"fila": [PEDIDO, PEDIDO + "x", PEDIDO + "y"], "contexto": CONTEXTO}
    llm = _Llm(MissoesIaSaida(propostas=[_proposta(1)]))
    resultado = await worker.processar_pedidos_uma_vez(_app(banco), llm)
    assert resultado["registrada"] == 2  # missoes_ia_lote = 2


def test_a_guarda_de_turmas_cai_na_dos_jobs_de_personalizacao() -> None:
    proprias = SimpleNamespace(missoes_ia_classe_ids=[5], personalizacao_jobs_classe_ids=[66])
    assert worker._turmas(proprias) == [5]
    so_jobs = SimpleNamespace(missoes_ia_classe_ids=[], personalizacao_jobs_classe_ids=[66])
    assert worker._turmas(so_jobs) == [66]
    nenhuma = SimpleNamespace(missoes_ia_classe_ids=[], personalizacao_jobs_classe_ids=[])
    assert worker._turmas(nenhuma) is None


@pytest.mark.parametrize("bruto, esperado", [('{"a": 1}', {"a": 1}), ("nao e json", None), ({"a": 1}, {"a": 1}), (None, None)])
def test_json_do_asyncpg_sem_codec(bruto: Any, esperado: Any) -> None:
    assert worker._json(bruto) == esperado
