"""O agente_perfil grava no mesmo contrato do cadastro: 7 perfis, inteiros, somando 100.

Dois defeitos medidos em produção (11/11) motivam estes testes:

* `perfil.nome` está em minúsculas (`seeker`, `socializer`), e é o que `ContextRepository`
  devolve. O fallback usava chaves capitalizadas (`Seeker`, `Socialiser`) e acabava com 14
  entradas: as reais e as de default 10. Como o repositório cruza por `lower()`, as duas caíam
  na mesma linha e a gravação mais baixa vencia. Um aluno de produção tinha os 7 em 10.
* O prompt e o fallback escreviam `Socialiser`, que não casa com `socializer`: a afinidade do
  Socializador nunca era atualizada, e sumia em silêncio.
"""

from importlib import import_module

import pytest

from app.agent.graph.nodes.agente_perfil import _fallback_perfil, agente_perfil
from app.core.settings import Settings
from app.schemas.perfil import PerfilScore, PerfilUpdate
from app.services.llm import StructuredOutputError

# `nodes/__init__` reexporta a função `agente_perfil`, que esconde o módulo de mesmo nome.
modulo = import_module("app.agent.graph.nodes.agente_perfil")

_CANONICOS = {"Seeker", "Survivor", "Daredevil", "Mastermind", "Conqueror", "Socializer", "Achiever"}

# Vetor real de produção (nomes como o banco devolve).
_VETOR_DO_BANCO = [
    {"perfil": "daredevil", "afinidade": 18.0},
    {"perfil": "conqueror", "afinidade": 16.0},
    {"perfil": "achiever", "afinidade": 14.0},
    {"perfil": "mastermind", "afinidade": 14.0},
    {"perfil": "seeker", "afinidade": 13.0},
    {"perfil": "survivor", "afinidade": 13.0},
    {"perfil": "socializer", "afinidade": 12.0},
]


def _mapa(perfis):
    return {item["perfil"]: item["afinidade"] for item in perfis}


def _assert_contrato(perfis):
    nomes = [item["perfil"] for item in perfis]
    assert sorted(nomes) == sorted(_CANONICOS), nomes
    valores = [item["afinidade"] for item in perfis]
    assert all(float(v).is_integer() and 1 <= v <= 100 for v in valores), valores
    assert sum(valores) == 100


def test_fallback_com_nomes_do_banco_nao_duplica_perfis() -> None:
    resultado = _fallback_perfil(
        {"perfil_brainhex": _VETOR_DO_BANCO, "desempenho_recente": {"media_acertos": 80}, "eventos_novos": []}
    )

    _assert_contrato(resultado["perfis"])
    # Sem evento nenhum, a ordem do vetor do aluno se mantém: nada achata para o default.
    afinidades = _mapa(resultado["perfis"])
    assert afinidades["Daredevil"] > afinidades["Conqueror"] > afinidades["Socializer"]
    assert resultado["justificativa"] == "perfil dominante inferido: Daredevil"


def test_fallback_atualiza_o_socializador() -> None:
    resultado = _fallback_perfil(
        {
            "perfil_brainhex": _VETOR_DO_BANCO,
            "desempenho_recente": {"media_acertos": 80},
            "eventos_novos": [{"tipo": "forum_interacao"}],
        }
    )

    _assert_contrato(resultado["perfis"])
    assert "Socialiser" not in {item["perfil"] for item in resultado["perfis"]}
    afinidades = _mapa(resultado["perfis"])
    # 12 + 15 = 27 pontos: passa de último a primeiro.
    assert max(afinidades, key=afinidades.get) == "Socializer"


def test_fallback_sem_perfil_nenhum_sai_no_contrato() -> None:
    zerado = [{"perfil": nome, "afinidade": 0} for nome in ["Seeker", "Socialiser", "Achiever"]]
    resultado = _fallback_perfil({"perfil_brainhex": zerado, "desempenho_recente": {}, "eventos_novos": []})

    _assert_contrato(resultado["perfis"])


@pytest.mark.asyncio
async def test_resposta_parcial_do_llm_e_completada_e_normalizada(monkeypatch) -> None:
    async def _resposta(self, **kwargs):
        return PerfilUpdate(
            perfis=[PerfilScore(perfil="Achiever", afinidade=75), PerfilScore(perfil="Socialiser", afinidade=40)],
            justificativa="llm",
        )

    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", _resposta)
    resultado = await agente_perfil(
        {"perfil_brainhex": _VETOR_DO_BANCO, "historico_eventos": [], "eventos_novos": []},
        settings=Settings(openai_api_key=None),
    )

    perfis = resultado["perfil_update"]["perfis"]
    _assert_contrato(perfis)
    afinidades = _mapa(perfis)
    # O que o modelo não citou fica com o valor atual do aluno, não some nem vira zero.
    assert afinidades["Achiever"] > afinidades["Socializer"] > afinidades["Daredevil"]
    assert resultado["perfil_update"]["justificativa"] == "llm"


@pytest.mark.asyncio
async def test_fallback_do_no_tambem_sai_no_contrato(monkeypatch) -> None:
    async def _falha(self, **kwargs):
        raise StructuredOutputError("sem modelo")

    monkeypatch.setattr(modulo.JsonLLMService, "ainvoke_structured", _falha)
    resultado = await agente_perfil(
        {"perfil_brainhex": _VETOR_DO_BANCO, "historico_eventos": [], "eventos_novos": [{"tipo": "atividade_concluida"}]},
        settings=Settings(openai_api_key=None),
    )

    _assert_contrato(resultado["perfil_update"]["perfis"])
