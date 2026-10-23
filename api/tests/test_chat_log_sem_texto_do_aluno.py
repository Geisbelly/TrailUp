"""O log da aplicacao nao recebe a mensagem que o aluno digitou (#195, item 4).

O verbatim do chat ja tem prazo no banco: `20261003_09` redige
`ia_decision_logs` aos 90 dias e expurga aos 365. **Log de aplicacao nao tem
como cumprir prazo nenhum** -- vai para o stdout do container, para o agregador
do Dokploy e para onde mais o operador encaminhar, cada um com sua retencao e
sua cadeia de custodia. Mesmo assim `POST /personalizar/chat` gravava
`payload.mensagem` inteira em `logger.info`, o que anulava na pratica o prazo
que a migracao criou.

O que estes testes protegem:

1. **Nenhum pedaco do texto do aluno aparece no resumo.** Nao basta tirar a
   chave `mensagem`: um trecho, um prefixo ou um "primeiros 50 caracteres"
   voltariam a vazar, e e assim que esse tipo de correcao costuma ser desfeita.
2. **O que servia para diagnostico continua.** Tirar o texto nao pode custar a
   capacidade de investigar: tamanho, guardrail de "me da a resposta" e tamanho
   do historico ficam.
3. **A regressao e barrada em todo o `api/app`**, nao so neste endpoint: a
   varredura pega qualquer `logger.*` que carregue texto livre de aluno.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest

from app.api.v1.personalizacao import _resumir_entrada_do_chat

APP = Path(__file__).resolve().parents[1] / "app"


class _PayloadFalso:
    def __init__(self, mensagem: str, historico: list[Any] | None = None) -> None:
        self.mensagem = mensagem
        self.classe_id = 7
        self.topico_id = 11
        self.conteudo_id = None
        self.escopo = "topico"
        self.historico = historico or []


@pytest.mark.parametrize(
    "mensagem",
    [
        "qual a resposta da questao 3",
        "nao entendi fotossintese, meu nome e Ana e moro na rua das Flores 42",
        "to muito ansioso com a prova de amanha",
        "",
    ],
)
def test_nenhuma_palavra_do_aluno_entra_no_resumo(mensagem: str) -> None:
    resumo = _resumir_entrada_do_chat(
        _PayloadFalso(mensagem), aluno_id="aluno-1", personalizacao_id=42
    )

    assert "mensagem" not in resumo, "a chave com o verbatim voltou"

    # Qualquer palavra de 4+ letras da mensagem aparecendo em qualquer valor do
    # resumo e vazamento -- pega trecho, prefixo e "primeiros N caracteres".
    serializado = " ".join(str(valor).lower() for valor in resumo.values())
    palavras = {p for p in re.findall(r"[a-zA-ZaàáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]{4,}", mensagem.lower())}
    vazadas = sorted(p for p in palavras if p in serializado)
    assert not vazadas, f"texto do aluno no log: {vazadas}"


def test_o_que_servia_para_diagnostico_continua() -> None:
    resumo = _resumir_entrada_do_chat(
        _PayloadFalso("qual a resposta da 3?", historico=[1, 2, 3]),
        aluno_id="aluno-1",
        personalizacao_id=42,
    )

    assert resumo["mensagem_chars"] == len("qual a resposta da 3?")
    assert resumo["mensagem_pede_resposta"] is True, "o guardrail precisa ser visivel no log"
    assert resumo["historico_count"] == 3
    # Sem isto o log nao serve para achar a linha correspondente no banco.
    assert resumo["aluno_id"] == "aluno-1"
    assert resumo["personalizacao_id"] == 42


def test_mensagem_que_nao_pede_resposta_marca_falso() -> None:
    resumo = _resumir_entrada_do_chat(
        _PayloadFalso("me explica fotossintese"), aluno_id="a", personalizacao_id=None
    )
    assert resumo["mensagem_pede_resposta"] is False


def test_nenhum_logger_de_api_app_carrega_texto_livre_do_aluno() -> None:
    """Varredura: `logger.*` com campo de texto livre de aluno no argumento.

    Nao olha so este arquivo de proposito -- o mesmo descuido cabe em qualquer
    endpoint que receba texto do aluno (resposta dissertativa, mensagem de
    guilda, bio). `violacao.mensagem` (texto da REGRA do guardrail) nao conta.
    """
    suspeitos = re.compile(
        r"logger\.(?:info|warning|error|debug|exception)\((?:[^()]|\([^()]*\))*"
        r"(?:payload\.(?:mensagem|resposta|texto|bio)\b|\bresposta_texto\b|\btexto_resposta\b)",
        re.S,
    )

    culpados = []
    for caminho in sorted(APP.rglob("*.py")):
        fonte = caminho.read_text(encoding="utf-8")
        if suspeitos.search(fonte):
            culpados.append(str(caminho.relative_to(APP.parent)))

    assert not culpados, (
        "texto livre de aluno indo para o log da aplicacao, que nao tem prazo de "
        "retencao -- registre a FORMA (tamanho, contagem, flag), como "
        "`_resumir_entrada_do_chat` e `_summarize_telemetria_payload` fazem:\n  "
        + "\n  ".join(culpados)
    )
