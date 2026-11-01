"""Catálogo das regras que o motor de sugestão usa, com a evidência de cada uma (#66).

O motor de sugestão continua determinístico (reescopo da #66 em ``docs/rag/triagem-corpus.md``):
o RAG não entra na decisão. O que entra é a **base de evidências** já avaliada documento a
documento em ``docs/rag/avaliacao-documentos.md``. Os textos abaixo são "texto derivado" no
sentido daquela página: regra escrita por nós, citando a fonte (``DAT-xx``) e a confiança — no
formato da #73, para que possam subir ao Vector Store sem reescrita quando o corpus existir.

Duas regras de honestidade que valem mais do que o catálogo parecer completo:

* **Casar formato com perfil BrainHex é hipótese.** A avaliação não achou evidência de que
  aprender no formato "preferido" melhore o resultado (DAT-14, DAT-35, DAT-40); o único resultado
  a favor é de tempo de uso (DAT-03), e há resultado sem efeito (DAT-41). O peso por perfil
  continua sendo o ponto de partida do motor, mas a sugestão diz que é hipótese.
* **Telemetria mede engajamento comportamental, não emoção nem atenção** (DAT-45, DAT-04). Por
  isso a emoção do aluno não reordena material: não existe regra do corpus que ligue emoção a
  formato.

``confianca`` segue a avaliação: ``forte`` (guia de prática com evidência forte), ``moderada``,
``hipotese`` (sem evidência de efeito) e ``dado_do_aluno`` (a evidência é o resultado do próprio
aluno, não um estudo).

Ao mudar uma regra (texto, fontes ou confiança), suba ``CATALOGO_VERSAO``: o log de cada decisão
grava a versão, e uma auditoria precisa saber com que texto a decisão foi justificada.
"""

from __future__ import annotations

from typing import Any

CATALOGO_VERSAO = "2026-11-01"

CONFIANCAS = ("forte", "moderada", "hipotese", "dado_do_aluno")

_REGRAS: dict[str, dict[str, Any]] = {
    "perfil_formato": {
        "enunciado": (
            "Ordem inicial pelo perfil BrainHex. É hipótese: não há evidência de que aprender no "
            "formato preferido melhore o resultado; todos os formatos ficam disponíveis."
        ),
        "construto": "personalização por perfil",
        "fontes": ["DAT-14", "DAT-35", "DAT-40", "DAT-03", "DAT-41"],
        "confianca": "hipotese",
    },
    "modo_operacao": {
        "enunciado": (
            "Ajuste pelo modo de estudo que o próprio aluno declarou. Respeita a escolha dele, "
            "sem evidência de efeito no resultado."
        ),
        "construto": "preferência declarada",
        "fontes": ["DAT-14", "DAT-40"],
        "confianca": "hipotese",
    },
    "engajamento_comportamental": {
        "enunciado": (
            "Tempo ativo, leitura rápida demais e abandono medem engajamento com o material, não "
            "emoção nem atenção."
        ),
        "construto": "engajamento comportamental",
        "fontes": ["DAT-45", "DAT-04"],
        "confianca": "moderada",
    },
    "desempenho_do_aluno": {
        "enunciado": "Acerto do próprio aluno depois de estudar só por este formato.",
        "construto": "desempenho",
        "fontes": [],
        "confianca": "dado_do_aluno",
    },
    "reexposicao_quiz": {
        "enunciado": (
            "Com dificuldade no tópico, praticar com quiz e cards que reexpõem o conteúdo central "
            "ajuda a reter: evidência forte."
        ),
        "construto": "prática de recuperação",
        "fontes": ["DAT-21", "DAT-36"],
        "confianca": "forte",
    },
}


def regra(regra_id: str) -> dict[str, Any]:
    """A regra do catálogo, com o id. Levanta ``KeyError`` para id desconhecido.

    Levantar é de propósito: uma evidência citando regra que não existe no catálogo é bug do
    motor, e virar evidência vazia em silêncio esconderia justamente o que o log quer mostrar.
    """
    return {"regra": regra_id, **_REGRAS[regra_id]}


def evidencia(regra_id: str, **dados: Any) -> dict[str, Any]:
    """Uma evidência pronta para a sugestão: a regra que moveu o item e os números do aluno.

    ``dados`` são os números que esta decisão viu (afinidade, tempo ativo, acerto…): snapshot,
    não referência, pelo mesmo motivo do ``evidencia`` do log — a telemetria muda depois.
    """
    item = regra(regra_id)
    return {
        "regra": regra_id,
        "enunciado": item["enunciado"],
        "fontes": list(item["fontes"]),
        "confianca": item["confianca"],
        "dados": {chave: valor for chave, valor in dados.items() if valor is not None},
    }


def catalogo() -> list[dict[str, Any]]:
    """Todas as regras, na ordem em que foram declaradas (para console e testes)."""
    return [regra(regra_id) for regra_id in _REGRAS]
