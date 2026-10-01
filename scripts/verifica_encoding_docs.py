#!/usr/bin/env python3
"""Falha se algum .md de `docs/` tiver BOM ou mojibake.

O CLAUDE.md pede "UTF-8 sem BOM, sempre" e registra que mojibake ja foi
commitado mais de uma vez. Em 2026-10-01 havia 65 arquivos com BOM e 6 com
mojibake em `docs/` -- 270 linhas, incluindo tabelas inteiras de documentacao
de arquitetura.

Roda como job proprio porque mudanca so em `docs/` nao dispara nenhum dos
jobs por servico (o filtro de `changes` cobre api/microservice/frontend/mobile
e nada mais): uma guarda dentro de uma suite de servico nunca veria um commit
de documentacao.

Cobre SO `docs/`. A api contem mojibake de proposito -- `text_cleanup.py`
existe para conserta-lo e guarda os padroes que procura --, e por isso a
guarda de la (`api/tests/test_encoding_utf8_sem_bom.py`) cobre apenas BOM.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BOM = b"\xef\xbb\xbf"
RAIZ = Path(__file__).resolve().parents[1] / "docs"

# Bytes 0x80-0x9F como o Windows-1252 os mostra.
_ESPECIAIS = "".join(
    chr(c)
    for c in (
        0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030,
        0x0160, 0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022,
        0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
    )
)
_CONT = f"[{chr(0x80)}-{chr(0xBF)}{re.escape(_ESPECIAIS)}]"
# Byte inicial + continuacao(oes) -- nunca a letra sozinha, senao "NAO" e
# "QUESTAO" corretos acusariam.
MOJIBAKE = re.compile(f"[{chr(0xC2)}{chr(0xC3)}]{_CONT}|{chr(0xE2)}{_CONT}{_CONT}")


def main() -> int:
    com_bom: list[str] = []
    com_mojibake: list[str] = []

    for caminho in sorted(RAIZ.rglob("*.md")):
        relativo = caminho.relative_to(RAIZ.parent)
        if caminho.read_bytes().startswith(BOM):
            com_bom.append(str(relativo))
        texto = caminho.read_text(encoding="utf-8")
        for numero, linha in enumerate(texto.splitlines(), start=1):
            if MOJIBAKE.search(linha):
                com_mojibake.append(f"{relativo}:{numero}")

    for titulo, achados in (("BOM", com_bom), ("mojibake", com_mojibake)):
        if achados:
            print(f"{len(achados)} ocorrencia(s) de {titulo}:")
            for achado in achados[:40]:
                print(f"  {achado}")
            if len(achados) > 40:
                print(f"  ... e mais {len(achados) - 40}")

    if com_bom or com_mojibake:
        print("\nUTF-8 sem BOM, sempre (CLAUDE.md). Para reparar mojibake, a volta e")
        print("`texto.encode('cp1252').decode('utf-8')` por ocorrencia -- o arquivo")
        print("inteiro nao funciona quando ha texto correto e corrompido misturado.")
        return 1

    print(f"ok: {len(list(RAIZ.rglob('*.md')))} arquivos sem BOM e sem mojibake")
    return 0


if __name__ == "__main__":
    sys.exit(main())
