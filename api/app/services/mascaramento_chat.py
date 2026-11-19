"""O que fica de cada pergunta ao Guia, e a memória que volta para ele (`chat_guia_registros`).

Tudo puro, sem banco: a rota monta o registro com `normalizar_registro`, o repositório grava, e
`resumir_memoria` / `resumir_turma` transformam as linhas de volta em contexto para o prompt.

**O texto do aluno nunca é gravado.** Quem escreve `assunto` e `conceitos` é o modelo, na mesma
chamada que responde (campo `registro` de `MentorChatLLMResult`), e ele é instruído a falar da
matéria, não da pessoa. O mascarador abaixo é a segunda barreira, para o que o modelo deixar passar:
nome do aluno e dos colegas da turma, e-mail, telefone, CPF, link, @usuário e número longo.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

VERSAO_REGISTRO = "v1"

INTENCOES = (
    "duvida_materia",
    "pedido_resposta",
    "navegacao_app",
    "personalizacao",
    "estrategia_estudo",
    "desabafo",
    "outro",
)
DIFICULDADES = ("nenhuma", "alguma", "travado")

MAX_ASSUNTO = 120
MAX_CONCEITO = 60
MAX_CONCEITOS = 5

# Memória que volta ao Guia: o que cabe num prompt sem pesar no custo.
MAX_CONCEITOS_MEMORIA = 5
MAX_DUVIDAS_MEMORIA = 3
# Dificuldade da turma só aparece com pelo menos este número de alunos: com menos, "a turma trava
# em X" apontaria uma pessoa.
MIN_ALUNOS_TURMA = 3

MARCA_NOME = "[nome]"

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_LINK = re.compile(r"(?:https?://|www\.)\S+", re.IGNORECASE)
_CPF = re.compile(r"(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)")
_TELEFONE = re.compile(r"(?<!\d)(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}(?!\d)")
_NUMERO_LONGO = re.compile(r"(?<!\d)\d{8,}(?!\d)")
_USUARIO = re.compile(r"(?<![\w.])@[\w.]{2,}")
_PLACEHOLDER = re.compile(r"\{\{?\s*nome\s*\}?\}", re.IGNORECASE)
_ESPACOS = re.compile(r"\s+")
# Sobra de máscara que não diz nada: "[nome]", "[nome] [telefone]".
_SO_MARCAS = re.compile(r"^(?:\s*\[(?:nome|email|link|documento|telefone|numero|usuario)\]\s*[,.;:!?-]*)+$")


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def nomes_para_mascarar(pessoas: Iterable[Mapping[str, Any] | tuple[Any, ...] | Any]) -> set[str]:
    """Nome completo, cada parte com 3 letras ou mais e o apelido de cada pessoa.

    Aceita dicts (`nome`, `apelido`), tuplas ou textos soltos."""
    alvos: set[str] = set()
    for pessoa in pessoas:
        if isinstance(pessoa, Mapping):
            valores = (pessoa.get("nome"), pessoa.get("apelido"))
        elif isinstance(pessoa, tuple):
            valores = pessoa
        else:
            valores = (pessoa,)
        for valor in valores:
            completo = " ".join(str(valor or "").split())
            if not completo:
                continue
            alvos.add(completo)
            alvos.update(p for p in completo.split() if len(p) >= 3)
    return alvos


def mascarar(texto: Any, nomes: Iterable[str] = ()) -> str:
    """Troca dado pessoal por marcas. Nome casa sem diferenciar caixa nem acento."""
    if not isinstance(texto, str):
        return ""
    # NFC antes de tudo: a comparação sem acento abaixo precisa de um caractere por letra.
    saida = _EMAIL.sub("[email]", unicodedata.normalize("NFC", texto))
    saida = _LINK.sub("[link]", saida)
    saida = _CPF.sub("[documento]", saida)
    saida = _TELEFONE.sub("[telefone]", saida)
    saida = _NUMERO_LONGO.sub("[numero]", saida)
    saida = _USUARIO.sub("[usuario]", saida)
    saida = _PLACEHOLDER.sub(MARCA_NOME, saida)

    # Compara sem acento, mas troca no texto original: "Joao" pega "João".
    base = _sem_acento(saida).lower()
    trechos: list[tuple[int, int]] = []
    for nome in sorted({n for n in nomes if n}, key=len, reverse=True):
        alvo = _sem_acento(nome).lower()
        for m in re.finditer(rf"(?<!\w){re.escape(alvo)}(?!\w)", base):
            if not any(m.start() < fim and inicio < m.end() for inicio, fim in trechos):
                trechos.append((m.start(), m.end()))
    for inicio, fim in sorted(trechos, reverse=True):
        saida = saida[:inicio] + MARCA_NOME + saida[fim:]
    saida = re.sub(r"\[nome\](?:\s+\[nome\])+", MARCA_NOME, saida)
    return _ESPACOS.sub(" ", saida).strip()


def _cortar(texto: str, limite: int) -> str:
    return texto if len(texto) <= limite else texto[: limite - 1].rstrip() + "…"


def _limpo(texto: Any, nomes: Iterable[str], limite: int) -> str | None:
    saida = mascarar(texto, nomes)
    if not saida or _SO_MARCAS.match(saida):
        return None
    return _cortar(saida, limite)


@dataclass(frozen=True)
class RegistroDoChat:
    intencao: str
    assunto: str | None
    conceitos: list[str] = field(default_factory=list)
    dificuldade: str = "nenhuma"


def normalizar_registro(bruto: Any, nomes: Iterable[str] = ()) -> RegistroDoChat:
    """O que o modelo devolveu em `registro`, dentro dos limites da tabela.

    Valor fora da lista vira `outro`/`nenhuma` em vez de falhar: um registro ruim não pode custar
    a resposta que o aluno já recebeu."""
    dados = bruto.model_dump() if hasattr(bruto, "model_dump") else (bruto if isinstance(bruto, Mapping) else {})
    nomes = set(nomes)

    intencao = str(dados.get("intencao") or "").strip().lower()
    intencao = intencao if intencao in INTENCOES else "outro"
    dificuldade = str(dados.get("dificuldade") or "").strip().lower()
    dificuldade = dificuldade if dificuldade in DIFICULDADES else "nenhuma"

    conceitos: list[str] = []
    vistos: set[str] = set()
    brutos = dados.get("conceitos") if isinstance(dados.get("conceitos"), list) else []
    for item in brutos:
        conceito = _limpo(item, nomes, MAX_CONCEITO)
        if not conceito or MARCA_NOME in conceito:
            continue
        chave = _sem_acento(conceito).lower()
        if chave in vistos:
            continue
        vistos.add(chave)
        conceitos.append(conceito.lower())
        if len(conceitos) == MAX_CONCEITOS:
            break

    return RegistroDoChat(
        intencao=intencao,
        assunto=_limpo(dados.get("assunto"), nomes, MAX_ASSUNTO),
        conceitos=conceitos,
        dificuldade=dificuldade,
    )


def registro_de_navegacao(destinos: Iterable[str]) -> RegistroDoChat:
    """Pergunta de navegação respondida sem modelo (`respostas_do_guia.py`): o assunto é a tela."""
    tela = next((d for d in destinos if d), "")
    return RegistroDoChat(intencao="navegacao_app", assunto=f"onde fica: {tela}" if tela else None)


def resumir_memoria(registros: Iterable[Mapping[str, Any]], topico_id: Any = None) -> dict[str, Any]:
    """Linhas recentes do aluno (mais recente primeiro) → o que o Guia recebe como memória.

    Vazio quando não há nada: o prompt trata a ausência como "primeira conversa"."""
    linhas = [r for r in registros if isinstance(r, Mapping)]
    if not linhas:
        return {}

    def _mesmo_topico(r: Mapping[str, Any]) -> bool:
        return topico_id is not None and r.get("topico_id") == topico_id

    dificeis: Counter[str] = Counter()
    for r in linhas:
        if r.get("dificuldade") in ("alguma", "travado"):
            peso = 2 if _mesmo_topico(r) else 1
            for conceito in r.get("conceitos") or []:
                dificeis[str(conceito)] += peso

    duvidas: list[str] = []
    for r in linhas:
        if _mesmo_topico(r) and r.get("intencao") == "duvida_materia" and r.get("assunto"):
            assunto = str(r["assunto"])
            if assunto not in duvidas:
                duvidas.append(assunto)
        if len(duvidas) == MAX_DUVIDAS_MEMORIA:
            break

    memoria: dict[str, Any] = {
        "perguntas_recentes": len(linhas),
        "conceitos_com_dificuldade": [c for c, _ in dificeis.most_common(MAX_CONCEITOS_MEMORIA)],
        "duvidas_recentes_neste_topico": duvidas,
        "pedidos_de_resposta": sum(1 for r in linhas if r.get("intencao") == "pedido_resposta"),
        "travou_neste_topico": any(_mesmo_topico(r) and r.get("dificuldade") == "travado" for r in linhas),
    }
    return memoria


def resumir_turma(linhas: Iterable[Mapping[str, Any]]) -> list[str]:
    """Conceitos em que a turma tem dificuldade no tópico, só os de `MIN_ALUNOS_TURMA` alunos ou mais."""
    saida: list[str] = []
    for linha in linhas:
        if not isinstance(linha, Mapping):
            continue
        if int(linha.get("alunos") or 0) >= MIN_ALUNOS_TURMA and linha.get("conceito"):
            saida.append(str(linha["conceito"]))
        if len(saida) == MAX_CONCEITOS_MEMORIA:
            break
    return saida


__all__ = [
    "DIFICULDADES",
    "INTENCOES",
    "MIN_ALUNOS_TURMA",
    "RegistroDoChat",
    "VERSAO_REGISTRO",
    "mascarar",
    "nomes_para_mascarar",
    "normalizar_registro",
    "registro_de_navegacao",
    "resumir_memoria",
    "resumir_turma",
]
