"""`ia_decision_logs.source` só aceita o que o CHECK aceita, e a auditoria do grafo não derruba o ciclo (#96).

Medido em produção (01/11): 6 lotes de telemetria ficaram sem análise com
`CheckViolationError ... ck_ia_decision_logs_source`. O `agente_trilha` auditava a violação de guardrail
com `source="graph"`, o INSERT abortava e a exceção subia pelo grafo até o `run_analysis`.
"""

import ast
import asyncio
import importlib
import re
from pathlib import Path

from app.agent.graph.guardrails import GuardrailViolation
from app.schemas.trilha_config import TrilhaConfig

API = Path(__file__).resolve().parents[1]
# `app.agent.graph.nodes.agente_trilha` como atributo e a funcao (o pacote a reexporta); o modulo vem do sys.modules.
modulo_trilha = importlib.import_module("app.agent.graph.nodes.agente_trilha")


def _sources_do_check() -> set[str]:
    migration = (API / "alembic" / "versions" / "20260410_02_ia_decision_logs.py").read_text(encoding="utf-8")
    check = re.search(r"source IN \(([^)]*)\)", migration)
    assert check, "CHECK de source nao encontrado na migration de ia_decision_logs"
    return set(re.findall(r"'([^']+)'", check.group(1)))


def _sources_literais_gravados() -> list[tuple[str, int, str]]:
    """Todo `source="..."` literal numa chamada `.log(...)` de arquivo que usa o `IADecisionLogRepository`."""
    achados: list[tuple[str, int, str]] = []
    for arquivo in sorted((API / "app").rglob("*.py")):
        texto = arquivo.read_text(encoding="utf-8")
        if "IADecisionLogRepository" not in texto:
            continue
        for no in ast.walk(ast.parse(texto)):
            if not (isinstance(no, ast.Call) and isinstance(no.func, ast.Attribute) and no.func.attr == "log"):
                continue
            for kw in no.keywords:
                if kw.arg == "source" and isinstance(kw.value, ast.Constant) and isinstance(kw.value.value, str):
                    achados.append((str(arquivo.relative_to(API)), no.lineno, kw.value.value))
    return achados


def test_todo_source_gravado_passa_no_check() -> None:
    permitidos = _sources_do_check()
    gravados = _sources_literais_gravados()

    assert gravados, "a varredura nao achou nenhuma chamada; o teste ficaria verde a toa"
    fora = [g for g in gravados if g[2] not in permitidos]
    assert not fora, f"source fora do CHECK {sorted(permitidos)}: {fora}"


class _SessaoFalsa:
    def __init__(self) -> None:
        self.rollbacks = 0
        self.commits = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


def _prepara(monkeypatch, *, log_falha: bool):
    sessao = _SessaoFalsa()
    gravados: list[dict] = []

    class _RepoTopicos:
        def __init__(self, _session) -> None:
            pass

        async def listar_topicos_classe(self, _classe_id):
            return [{"id": 10, "ordem": 1}]

    class _RepoLog:
        def __init__(self, _session) -> None:
            pass

        async def log(self, **kwargs) -> None:
            gravados.append(kwargs)
            if log_falha:
                raise RuntimeError("new row violates check constraint ck_ia_decision_logs_source")

    async def _gerar_validado(_llm, *, on_violation, fallback_factory, **_kwargs):
        # O LLM violou o guardrail nas duas tentativas: audita e cai no fallback.
        await on_violation(GuardrailViolation(regra="ordem_sequencial", mensagem="pulou topico"), "fallback_final")
        return TrilhaConfig.model_validate(fallback_factory())

    monkeypatch.setattr(modulo_trilha, "JsonLLMService", lambda _settings: object())
    monkeypatch.setattr(modulo_trilha, "ConteudoClasseRepository", _RepoTopicos)
    monkeypatch.setattr(modulo_trilha, "IADecisionLogRepository", _RepoLog)
    monkeypatch.setattr(modulo_trilha, "gerar_validado", _gerar_validado)
    return sessao, gravados


def _estado() -> dict:
    return {
        "aluno_id": "00000000-0000-0000-0000-000000000001",
        "classe_id": 1,
        "progresso_trilha": {"10": {"percentual_concluido": 40}},
        "desempenho_recente": {},
    }


def test_auditoria_do_guardrail_grava_source_aceito(monkeypatch) -> None:
    sessao, gravados = _prepara(monkeypatch, log_falha=False)

    resultado = asyncio.run(modulo_trilha.agente_trilha(_estado(), settings=None, session_factory=lambda: sessao))

    assert [g["source"] for g in gravados] == ["telemetria"]
    assert gravados[0]["source"] in _sources_do_check()
    assert gravados[0]["stage"] == "agente_trilha"
    assert sessao.commits == 1
    assert resultado["trilha_config"]["topico_foco"] == 10


def test_auditoria_que_falha_nao_derruba_o_ciclo(monkeypatch) -> None:
    sessao, gravados = _prepara(monkeypatch, log_falha=True)

    resultado = asyncio.run(modulo_trilha.agente_trilha(_estado(), settings=None, session_factory=lambda: sessao))

    assert len(gravados) == 1
    assert sessao.rollbacks == 1
    assert resultado["completed_nodes"] == ["agente_trilha"]
    assert resultado["trilha_config"]["topico_foco"] == 10
