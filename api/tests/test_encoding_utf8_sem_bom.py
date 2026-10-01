"""Guarda de encoding: UTF-8 sem BOM.

O CLAUDE.md pede "UTF-8 sem BOM, sempre", e havia 14 arquivos com BOM na api
(13 `.py` -- entre eles `deps.py`, `auth.py` e `access.py` -- mais o
`README.md`). BOM nao quebra o interpretador, entao ninguem percebia: o que ele
quebra e ferramenta que le o arquivo como texto. `ast.parse()` sobre conteudo
lido com `encoding="utf-8"` levanta
`SyntaxError: invalid non-printable character U+FEFF`, e qualquer script de
analise, geracao ou lint caseiro tropeca nisso.

POR QUE AQUI NAO HA GUARDA DE MOJIBAKE, ao contrario do espelho no mobile
(`src/utils/semMojibake.test.ts`): a api contem sequencias de mojibake DE
PROPOSITO. `app/services/text_cleanup.py` existe para consertar mojibake e
guarda os padroes que procura (`_SUSPECT_MOJIBAKE_TOKENS`);
`app/services/personalizacao.py` tem regex com alternativas que casam texto ja
corrompido (`quest(?:ao|Ã£o)`); e `tests/test_personalizacao_service.py` tem
fixtures corrompidas para exercitar o reparo. Sao 52 ocorrencias legitimas. Um
detector igual ao do mobile acusaria todas e travaria o CI -- o mobile pode
te-lo porque nao tem codigo que lide com mojibake.
"""

from pathlib import Path

BOM = b"\xef\xbb\xbf"
API_ROOT = Path(__file__).resolve().parents[1]
EXTENSOES = {".py", ".md", ".txt", ".toml", ".ini", ".json"}
IGNORADOS = {".venv", "venv", "__pycache__", ".pytest_cache", "node_modules", ".git"}


def test_nenhum_arquivo_da_api_comeca_com_bom() -> None:
    com_bom = [
        str(caminho.relative_to(API_ROOT))
        for caminho in API_ROOT.rglob("*")
        if caminho.is_file()
        and caminho.suffix in EXTENSOES
        and not IGNORADOS & set(caminho.relative_to(API_ROOT).parts)
        and caminho.read_bytes().startswith(BOM)
    ]
    assert com_bom == [], f"arquivos com BOM: {com_bom}"
