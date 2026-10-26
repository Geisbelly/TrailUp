"""Pseudonimizacao do que vai aos provedores de IA (#195, LGPD art. 46).

Nome e e-mail de aluno nao saem do servidor. O modelo trabalha com:

- ``PLACEHOLDER_NOME`` (``{{nome}}``) quando o texto e para UM aluno; a API
  troca o placeholder pelo nome na resposta, antes de entregar ao usuario;
- referencias curtas (``A1``...``An``) quando o texto fala de varios alunos
  (Insights, Escriba); a API traduz cada ref para o nome na volta.

Emocao, BrainHex e desempenho seguem no payload como antes: isto so tira a
identificacao direta.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable, Mapping
from typing import Any

PLACEHOLDER_NOME = "{{nome}}"

# Tolerante ao que o modelo costuma devolver: espacos, caixa, chaves simples.
_PLACEHOLDER_RE = re.compile(r"\{\{?\s*nome\s*\}?\}", re.IGNORECASE)
_REF_RE = re.compile(r"(?<![\w-])A(\d{1,4})(?![\w-])")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


def primeiro_nome(nome: Any) -> str | None:
    partes = str(nome or "").split()
    return partes[0] if partes else None


def restaurar_nome(texto: str | None, nome: Any) -> str | None:
    """Troca ``{{nome}}`` pelo primeiro nome. Sem nome conhecido, o
    placeholder some sem deixar virgula/espaco sobrando ("Oi, {{nome}}!" ->
    "Oi!")."""
    if texto is None:
        return None
    exibido = primeiro_nome(nome)
    if exibido:
        return _PLACEHOLDER_RE.sub(lambda _m: exibido, texto)
    sem = re.sub(r"[,\s]*" + _PLACEHOLDER_RE.pattern + r"[,]?", "", texto, flags=re.IGNORECASE)
    sem = re.sub(r"\s{2,}", " ", sem).strip()
    return sem[:1].upper() + sem[1:] if sem else sem


def nomes_de_exibicao(nomes_por_ref: Mapping[str, Any]) -> dict[str, str]:
    """Primeiro nome; se dois alunos dividem o primeiro nome, acrescenta a
    inicial do sobrenome ("Ana S.") para o professor saber de quem e."""
    primeiros = {ref: primeiro_nome(nome) for ref, nome in nomes_por_ref.items()}
    repetidos = Counter(p.lower() for p in primeiros.values() if p)
    exibicao: dict[str, str] = {}
    for ref, nome in nomes_por_ref.items():
        primeiro = primeiros[ref]
        if not primeiro:
            exibicao[ref] = "um aluno"
            continue
        partes = str(nome).split()
        if repetidos[primeiro.lower()] > 1 and len(partes) > 1:
            exibicao[ref] = f"{primeiro} {partes[-1][0].upper()}."
        else:
            exibicao[ref] = primeiro
    return exibicao


def restaurar_refs(texto: str | None, nomes_por_ref: Mapping[str, Any]) -> str | None:
    """Troca ``A3`` pelo nome de exibicao do aluno A3. Ref que nao existe no
    mapa fica como esta (nao inventa aluno)."""
    if texto is None or not nomes_por_ref:
        return texto
    exibicao = nomes_de_exibicao(nomes_por_ref)
    return _REF_RE.sub(lambda m: exibicao.get(f"A{m.group(1)}", m.group(0)), texto)


def pseudonimizar_texto(texto: str | None, nomes_por_ref: Mapping[str, Any]) -> str | None:
    """Troca nomes conhecidos por refs num texto livre (pergunta e historico
    do professor) e remove e-mails. Nome completo primeiro, depois o primeiro
    nome; primeiro nome repetido na turma vira "A1 ou A4"."""
    if texto is None:
        return None
    saida = _EMAIL_RE.sub("[email]", texto)
    if not nomes_por_ref:
        return saida

    trocas: list[tuple[str, str]] = []
    por_primeiro: dict[str, list[str]] = {}
    for ref, nome in nomes_por_ref.items():
        completo = " ".join(str(nome or "").split())
        if not completo:
            continue
        if " " in completo:
            trocas.append((completo, ref))
        por_primeiro.setdefault(completo.split()[0].lower(), []).append(ref)
    for primeiro, refs in por_primeiro.items():
        trocas.append((primeiro, " ou ".join(sorted(refs, key=lambda r: int(r[1:]) if r[1:].isdigit() else 0))))

    # Mais longo primeiro: "Ana Clara Souza" antes de "Ana".
    for alvo, ref in sorted(trocas, key=lambda t: len(t[0]), reverse=True):
        saida = re.sub(rf"(?<!\w){re.escape(alvo)}(?!\w)", ref, saida, flags=re.IGNORECASE)
    return saida


def pseudonimizar_nome_proprio(texto: str | None, *nomes: Any) -> str | None:
    """Texto livre de UM aluno (mensagem e historico do mentor): o nome dele
    (completo, partes com 3+ letras, apelido) vira ``{{nome}}`` e e-mail vira
    ``[email]``. O historico volta do app ja com o nome restaurado, entao sem
    isto o nome iria ao provedor na rodada seguinte."""
    if texto is None:
        return None
    saida = _EMAIL_RE.sub("[email]", texto)
    alvos: set[str] = set()
    for nome in nomes:
        completo = " ".join(str(nome or "").split())
        if completo:
            alvos.add(completo)
            alvos.update(p for p in completo.split() if len(p) >= 3)
    for alvo in sorted(alvos, key=len, reverse=True):
        saida = re.sub(rf"(?<!\w){re.escape(alvo)}(?!\w)", PLACEHOLDER_NOME, saida, flags=re.IGNORECASE)
    # "{{nome}} {{nome}}" (nome e sobrenome trocados em separado) vira um so.
    return re.sub(r"\{\{nome\}\}(?:\s+\{\{nome\}\})+", PLACEHOLDER_NOME, saida)


def termos_identificadores(nomes: Iterable[Any], emails: Iterable[Any] = ()) -> set[str]:
    """Nomes completos, partes do nome (>= 3 letras) e e-mails: o que os
    testes procuram no payload para provar que nada identificador saiu."""
    termos: set[str] = set()
    for nome in nomes:
        completo = " ".join(str(nome or "").split())
        if completo:
            termos.add(completo)
            termos.update(p for p in completo.split() if len(p) >= 3)
    termos.update(str(e) for e in emails if e)
    return termos


__all__ = [
    "PLACEHOLDER_NOME",
    "nomes_de_exibicao",
    "primeiro_nome",
    "pseudonimizar_nome_proprio",
    "pseudonimizar_texto",
    "restaurar_nome",
    "restaurar_refs",
    "termos_identificadores",
]
