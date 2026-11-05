"""Worker do diagnóstico antes do tópico (`app/services/diagnostico_topico.py`, #137).

O banco (pedir, uma vez só, só antes de começar, validar o que o modelo devolveu, gabarito fora do cliente,
`sem_ia` na terceira falha, turma retida) foi exercitado num Postgres real: ver o PR e
`test_migration_diagnostico_do_topico.py`. Aqui fica o que a API faz: montar o que o modelo recebe, passar a
saída ao banco sem decidir nada, registrar a falha quando o modelo não responde, e levar o nível ao grafo.
"""

from __future__ import annotations

import inspect
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.agent.graph.state import TrailUpState
from app.schemas.diagnostico import DiagnosticoSaida, PerguntaDeDiagnostico
from app.services import diagnostico_topico as worker
from app.services import state_builder
from app.services.llm import StructuredOutputError

PEDIDO = "8d0cf0cc-6f43-4a2a-8f0f-222222222222"
CONTEXTO = {
    "topico": "Fotossíntese",
    "descricao": "Como as plantas fazem energia",
    "max_perguntas": 5,
    "conteudos": [{"titulo": "Introdução", "trecho": "A fotossíntese ocorre nos cloroplastos..."}],
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
        if "fn_diagnostico_reivindicar" in texto:
            fila = self.banco.setdefault("fila", [])
            return _Resultado(linhas=[fila.pop(0)] if fila else [])
        if "fn_diagnostico_contexto" in texto:
            # Como o asyncpg sem codec: jsonb chega como texto.
            return _Resultado(json.dumps(self.banco.get("contexto")))
        if "fn_diagnostico_registrar" in texto:
            if self.banco.get("registrar_falha"):
                raise RuntimeError(self.banco["registrar_falha"])
            return _Resultado(valor=self.banco.get("registradas", 4))
        return _Resultado()

    async def commit(self) -> None:
        self.banco["commits"] = self.banco.get("commits", 0) + 1


class _Llm:
    def __init__(self, saida: DiagnosticoSaida | Exception) -> None:
        self.saida, self.payloads = saida, []

    async def ainvoke_structured(self, *, prompt_name: str, payload: dict[str, Any], schema: Any) -> Any:
        assert prompt_name == worker.PROMPT
        assert schema is DiagnosticoSaida
        self.payloads.append(payload)
        if isinstance(self.saida, Exception):
            raise self.saida
        return self.saida


def _app(banco: dict[str, Any]) -> Any:
    settings = SimpleNamespace(
        diagnostico_lote=2,
        diagnostico_trava_seconds=600,
        diagnostico_classe_ids=[],
        personalizacao_jobs_classe_ids=[66],
    )
    return SimpleNamespace(state=SimpleNamespace(settings=settings, session_factory=lambda: _Sessao(banco)))


def _chamadas(banco: dict[str, Any], funcao: str) -> list[dict[str, Any]]:
    return [p for t, p in banco.get("chamadas", []) if funcao in t]


def _pergunta(i: int = 1, **extra: Any) -> PerguntaDeDiagnostico:
    base = {"enunciado": f"Qual o papel da etapa {i} da fotossíntese?", "opcoes": ["luz", "água", "solo"], "correta": 1}
    return PerguntaDeDiagnostico(**{**base, **extra})


def test_o_payload_nao_leva_nulo_nem_inventa_nada() -> None:
    payload = worker.montar_payload({**CONTEXTO, "descricao": None})
    assert "descricao" not in payload
    assert payload["topico"] == "Fotossíntese" and payload["max_perguntas"] == 5


def test_o_modelo_so_recebe_o_topico_e_nao_dado_de_aluno() -> None:
    texto = json.dumps(worker.montar_payload(CONTEXTO), ensure_ascii=False)
    for proibido in ("aluno", "nome", "email", "e-mail", "telemetria", "perfil"):
        assert proibido not in texto.lower().replace("fotossíntese", "")


def test_a_correta_e_as_opcoes_passam_como_vieram_para_o_banco_validar() -> None:
    saida = DiagnosticoSaida(perguntas=[_pergunta(correta="b"), _pergunta(2, opcoes=["a", 7], correta=9)])
    enviadas = worker.perguntas_para_o_banco(saida, maximo=5)
    assert [p["correta"] for p in enviadas] == ["b", 9]
    assert enviadas[1]["opcoes"] == ["a", 7]


def test_perguntas_para_o_banco_corta_o_excesso() -> None:
    saida = DiagnosticoSaida(perguntas=[_pergunta(i) for i in range(1, 21)])
    assert len(worker.perguntas_para_o_banco(saida, maximo=5)) == 10


async def test_passada_registra_pelo_banco_com_a_guarda_de_turmas() -> None:
    banco: dict[str, Any] = {"fila": [PEDIDO], "contexto": CONTEXTO}
    llm = _Llm(DiagnosticoSaida(perguntas=[_pergunta(1), _pergunta(2), _pergunta(3)]))
    assert await worker.processar_diagnosticos_uma_vez(_app(banco), llm) == {"registrado": 1, "sumiu": 0, "falhou": 0}
    assert _chamadas(banco, "fn_diagnostico_reivindicar")[0]["classes"] == [66]
    (registro,) = _chamadas(banco, "fn_diagnostico_registrar")
    assert registro["id"] == PEDIDO and len(json.loads(registro["perguntas"])) == 3
    assert _chamadas(banco, "fn_diagnostico_falhou") == []
    assert llm.payloads[0]["max_perguntas"] == 5


async def test_sem_modelo_ou_cota_estourada_registra_a_falha_e_nao_inventa_pergunta() -> None:
    banco: dict[str, Any] = {"fila": [PEDIDO], "contexto": CONTEXTO}
    llm = _Llm(StructuredOutputError("429: cota diária do modelo esgotada"))
    assert await worker.processar_diagnosticos_uma_vez(_app(banco), llm) == {"registrado": 0, "sumiu": 0, "falhou": 1}
    assert _chamadas(banco, "fn_diagnostico_registrar") == []
    (falha,) = _chamadas(banco, "fn_diagnostico_falhou")
    assert falha["id"] == PEDIDO and "cota" in falha["erro"]


async def test_pergunta_ruim_demais_vira_falha_porque_o_banco_recusa() -> None:
    # `fn_diagnostico_registrar` levanta `diagnostico_poucas_perguntas` com menos de 3 válidas.
    banco: dict[str, Any] = {"fila": [PEDIDO], "contexto": CONTEXTO, "registrar_falha": "diagnostico_poucas_perguntas"}
    llm = _Llm(DiagnosticoSaida(perguntas=[_pergunta(correta=99)]))
    assert await worker.processar_diagnosticos_uma_vez(_app(banco), llm) == {"registrado": 0, "sumiu": 0, "falhou": 1}
    (falha,) = _chamadas(banco, "fn_diagnostico_falhou")
    assert "poucas_perguntas" in falha["erro"]


async def test_pedido_dispensado_enquanto_o_modelo_pensava_nao_vira_falha() -> None:
    banco: dict[str, Any] = {"fila": [PEDIDO], "contexto": CONTEXTO, "registradas": 0}
    llm = _Llm(DiagnosticoSaida(perguntas=[_pergunta(i) for i in range(1, 5)]))
    assert await worker.processar_diagnosticos_uma_vez(_app(banco), llm) == {"registrado": 0, "sumiu": 1, "falhou": 0}
    assert _chamadas(banco, "fn_diagnostico_falhou") == []


async def test_pedido_que_sumiu_nao_chama_o_modelo() -> None:
    banco: dict[str, Any] = {"fila": [PEDIDO], "contexto": None}
    llm = _Llm(DiagnosticoSaida())
    assert await worker.processar_diagnosticos_uma_vez(_app(banco), llm) == {"registrado": 0, "sumiu": 1, "falhou": 0}
    assert llm.payloads == []


async def test_fila_vazia_e_o_lote_limita_a_passada() -> None:
    vazio: dict[str, Any] = {"fila": []}
    assert await worker.processar_diagnosticos_uma_vez(_app(vazio), _Llm(DiagnosticoSaida())) == {
        "registrado": 0,
        "sumiu": 0,
        "falhou": 0,
    }
    banco: dict[str, Any] = {"fila": [PEDIDO, PEDIDO + "x", PEDIDO + "y"], "contexto": CONTEXTO}
    resultado = await worker.processar_diagnosticos_uma_vez(_app(banco), _Llm(DiagnosticoSaida(perguntas=[_pergunta()])))
    assert resultado["registrado"] == 2  # diagnostico_lote = 2


def test_a_guarda_de_turmas_cai_na_dos_jobs_de_personalizacao() -> None:
    assert worker._turmas(SimpleNamespace(diagnostico_classe_ids=[5], personalizacao_jobs_classe_ids=[66])) == [5]
    assert worker._turmas(SimpleNamespace(diagnostico_classe_ids=[], personalizacao_jobs_classe_ids=[66])) == [66]
    assert worker._turmas(SimpleNamespace(diagnostico_classe_ids=[], personalizacao_jobs_classe_ids=[])) is None


@pytest.mark.parametrize("bruto, esperado", [('{"a": 1}', {"a": 1}), ("nao e json", None), ({"a": 1}, {"a": 1}), (None, None)])
def test_json_do_asyncpg_sem_codec(bruto: Any, esperado: Any) -> None:
    assert worker._json(bruto) == esperado


def test_o_prompt_existe_e_proibe_pressao_e_dado_pessoal() -> None:
    prompt = (Path(__file__).resolve().parent.parent / "app" / "agent" / "prompts" / worker.PROMPT).read_text(encoding="utf-8")
    assert '"perguntas"' in prompt and '"correta"' in prompt
    assert "não vale nota, ponto nem posição" in prompt
    assert "Não há nenhum dado do aluno no payload" in prompt


# --- o nível chega ao grafo -------------------------------------------------------------------------------


def test_o_estado_declara_a_chave_senao_o_langgraph_a_descarta() -> None:
    assert "diagnosticos_topico" in TrailUpState.__annotations__
    assert '"diagnosticos_topico": diagnosticos_topico' in inspect.getsource(state_builder.build_initial_state)


async def test_o_nivel_do_aluno_chega_ao_estado_e_falha_de_leitura_nao_derruba_o_ciclo() -> None:
    nivel = [{"topico_id": 10, "nivel": "intermediario", "acertos": 3, "total": 5}]

    class Repo:
        def __init__(self, valor: Any) -> None:
            self.valor = valor

        async def fetch_diagnosticos_do_aluno(self, **_: Any) -> Any:
            if isinstance(self.valor, Exception):
                raise self.valor
            return self.valor

    assert await state_builder._diagnosticos(Repo(nivel), aluno_id="a", classe_id=1) == nivel
    assert await state_builder._diagnosticos(Repo(RuntimeError("tabela sumiu")), aluno_id="a", classe_id=1) == []
    # Repositório sem o método (testes antigos): o ciclo segue sem diagnóstico.
    assert await state_builder._diagnosticos(object(), aluno_id="a", classe_id=1) == []


def test_so_le_o_respondido_e_nao_gera_nada() -> None:
    from app.repositories.context import ContextRepository

    fonte = inspect.getsource(ContextRepository.fetch_diagnosticos_do_aluno)
    assert "d.status = 'respondido'" in fonte
    assert "INSERT" not in fonte and "UPDATE" not in fonte
    assert "begin_nested" in fonte
