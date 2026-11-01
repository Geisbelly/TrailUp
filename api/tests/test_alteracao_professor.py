"""Worker da alteração do professor (`app/services/alteracao_professor.py`).

O banco (registro, fila, regras de quem revisa) é medido em `test_e2e_alteracao_do_professor.py`; aqui
fica o que a API faz: pseudonimizar, validar a saída do modelo, passar a decisão ao banco e, sem
modelo, registrar a falha sem decidir nada.
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Any

import pytest

from app.schemas.alteracao_professor import AlteracaoProfessorSaida, DecisaoDoAluno
from app.services import alteracao_professor as worker
from app.services.llm import StructuredOutputError

CONTEXTO = {
    "alteracao": {"id": 7, "alvo_tipo": "atividade", "mudancas": [{"tabela": "questoes", "id": 1}]},
    "topico": {"id": 10, "nome": "Frações"},
    "alvo": {"id": 500, "titulo": "Frações"},
    "alunos": [
        {"aluno_id": "u-a", "situacao": "fez", "perfil_dominante": "seeker", "nota_na_atividade": 5},
        {"aluno_id": "u-b", "situacao": "viu", "perfil_dominante": "survivor", "nota_na_atividade": None},
    ],
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
        if "fn_alteracao_reivindicar" in texto:
            fila = self.banco.setdefault("fila", [])
            return _Resultado(linhas=[fila.pop(0)] if fila else [])
        if "fn_alteracao_contexto" in texto:
            # Como o asyncpg sem codec: jsonb chega como texto.
            return _Resultado(json.dumps(self.banco.get("contexto")))
        return _Resultado()

    async def commit(self) -> None:
        return None


class _Llm:
    def __init__(self, saida: AlteracaoProfessorSaida | Exception) -> None:
        self.saida, self.payloads = saida, []

    async def ainvoke_structured(self, *, prompt_name: str, payload: dict[str, Any], schema: Any) -> Any:
        assert prompt_name == worker.PROMPT
        self.payloads.append(payload)
        if isinstance(self.saida, Exception):
            raise self.saida
        return self.saida


@asynccontextmanager
async def _rota(_session: Any, _ids: Any):
    yield "padrao"


@pytest.fixture(autouse=True)
def _sem_rota_de_menor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(worker, "rota_ia_para_turma", _rota)


def _app(banco: dict[str, Any]) -> Any:
    settings = SimpleNamespace(
        alteracao_professor_lote=5,
        alteracao_professor_trava_seconds=600,
        alteracao_professor_classe_ids=[],
        personalizacao_jobs_classe_ids=[66],
    )
    return SimpleNamespace(state=SimpleNamespace(settings=settings, session_factory=lambda: _Sessao(banco)))


def _chamadas(banco: dict[str, Any], funcao: str) -> list[dict[str, Any]]:
    return [p for t, p in banco.get("chamadas", []) if funcao in t]


def test_payload_troca_uuid_por_ref() -> None:
    payload, refs = worker.montar_payload(CONTEXTO)
    assert refs == {"A1": "u-a", "A2": "u-b"}
    assert [a["ref"] for a in payload["alunos"]] == ["A1", "A2"]
    assert "u-a" not in json.dumps(payload)


def test_validar_descarta_ref_inventada_repetida_e_cosmetica() -> None:
    refs = {"A1": "u-a", "A2": "u-b"}
    saida = AlteracaoProfessorSaida(
        classificacao="relevante",
        alunos=[
            DecisaoDoAluno(aluno_ref="a1", revisar=True, motivo="  Respondeu   antes. "),
            DecisaoDoAluno(aluno_ref="A1", revisar=False, motivo="repetida"),
            DecisaoDoAluno(aluno_ref="A9", revisar=True, motivo="inventado"),
        ],
    )
    assert worker.validar_decisao(saida, refs) == [{"aluno_id": "u-a", "revisar": True, "motivo": "Respondeu antes."}]
    assert worker.validar_decisao(saida.model_copy(update={"classificacao": "cosmetica"}), refs) == []


async def test_passada_decide_e_passa_ao_banco_com_a_guarda_de_turmas() -> None:
    banco: dict[str, Any] = {"fila": [7], "contexto": CONTEXTO}
    llm = _Llm(
        AlteracaoProfessorSaida(
            classificacao="relevante",
            resumo="A questão 1 foi reescrita.",
            motivo="Mudou o sentido.",
            alunos=[DecisaoDoAluno(aluno_ref="A1", revisar=True, motivo="Fez antes da mudança.")],
        )
    )
    assert await worker.processar_alteracoes_uma_vez(_app(banco), llm) == {"decidida": 1, "sumiu": 0, "falhou": 0}
    assert _chamadas(banco, "fn_alteracao_reivindicar")[0]["classes"] == [66]
    (decisao,) = _chamadas(banco, "fn_alteracao_registrar_decisao")
    assert decisao["id"] == 7 and decisao["classificacao"] == "relevante"
    assert decisao["resumo"] == "A questão 1 foi reescrita."
    assert json.loads(decisao["alunos"]) == [{"aluno_id": "u-a", "revisar": True, "motivo": "Fez antes da mudança."}]
    assert _chamadas(banco, "fn_alteracao_falhou") == []


async def test_cosmetica_nao_leva_resumo_ao_aluno() -> None:
    banco: dict[str, Any] = {"fila": [7], "contexto": CONTEXTO}
    llm = _Llm(AlteracaoProfessorSaida(classificacao="cosmetica", resumo="Corrigido um acento.", motivo="Typo."))
    await worker.processar_alteracoes_uma_vez(_app(banco), llm)
    (decisao,) = _chamadas(banco, "fn_alteracao_registrar_decisao")
    assert decisao["resumo"] == "" and json.loads(decisao["alunos"]) == []


async def test_sem_modelo_registra_a_falha_e_nao_decide() -> None:
    banco: dict[str, Any] = {"fila": [7], "contexto": CONTEXTO}
    llm = _Llm(StructuredOutputError("Nenhum provedor LLM disponivel"))
    assert await worker.processar_alteracoes_uma_vez(_app(banco), llm) == {"decidida": 0, "sumiu": 0, "falhou": 1}
    assert _chamadas(banco, "fn_alteracao_registrar_decisao") == []
    (falha,) = _chamadas(banco, "fn_alteracao_falhou")
    assert falha["id"] == 7 and "Nenhum provedor" in falha["erro"]


async def test_alteracao_que_sumiu_nao_chama_o_modelo() -> None:
    banco: dict[str, Any] = {"fila": [7], "contexto": None}
    llm = _Llm(AlteracaoProfessorSaida(classificacao="relevante"))
    assert await worker.processar_alteracoes_uma_vez(_app(banco), llm) == {"decidida": 0, "sumiu": 1, "falhou": 0}
    assert llm.payloads == []
