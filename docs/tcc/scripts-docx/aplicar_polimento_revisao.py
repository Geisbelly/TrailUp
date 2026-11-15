"""Itens de polimento do parecer de revisao (docs/tcc/parecer-revisao-2026-11-14.md), itens 8 e 10.

Uso: python aplicar_polimento_revisao.py <pasta do docx descompactado>
Base: o docx da revisao de 15/11 (com alteracoes). O item 7 (sumario e listas) nao se resolve aqui:
o settings.xml ja tem w:updateFields, e o Word atualiza os campos ao abrir.
O item 9 (marcas pendentes) depende da autora e do orientador.
"""
import sys
from pathlib import Path

from lxml import etree

from lib import X, Doc

PASTA = Path(sys.argv[1])
d = Doc(str(PASTA / "word" / "document.xml"), "Claude (polimento da revisão, 15/11/2026)", "2026-11-15T14:00:00Z")
falhas = []


def faz(ident, fn, *args):
    try:
        fn(*args)
    except SystemExit as e:
        falhas.append((ident, str(e)[:120]))


def unico(texto_exato):
    ps = [p for p in d.root.iter(X + "p") if d.texto(p).strip() == texto_exato]
    if len(ps) != 1:
        raise SystemExit(f"esperava 1 paragrafo igual a {texto_exato!r}, achei {len(ps)}")
    return ps[0]


# ---- 8. grafia do perfil: Socializer, como no sistema e nas outras 10 ocorrencias
faz("8a", d.trocar, d.achar("O modelo descreve sete arquétipos"), "Socialiser", "Socializer")
faz("8b", d.trocar, unico("Socialiser"), "Socialiser", "Socializer")

# ---- 10a. Quadro 35: linha de 8/11 que ficou no fim volta para a ordem das datas
velha = d.linha_de(unico("Documento inteiro e Referências"))
textos = [" ".join(d.texto(p) for p in tc.findall(X + "p")).strip() for tc in d.celulas(velha)]
primeira_8 = d.linha_de(unico("Agradecimentos (rascunho), Resumo, Abstract, seções 1.1, 1.6 e 1.7, seções 4 a 10, "
                              "Apêndices A, B, D, F, G, H e I"))
d.nova_linha(primeira_8, textos)
trpr = velha.find(X + "trPr")
if trpr is None:
    trpr = etree.Element(X + "trPr")
    velha.insert(1 if velha.find(X + "tblPrEx") is not None else 0, trpr)
trpr.append(d.mark("del"))
for tc in d.celulas(velha):
    for p in tc.findall(X + "p"):
        faz("10a", d.apagar_paragrafo, p)

# ---- 10b. 1.7: a turma de comparacao do cap. 7 nao e sorteada
faz("10b", d.inserir_apos, d.achar("A própria documentação do projeto exclui, neste ciclo"),
    "outras extensões de maior complexidade.",
    " A turma de comparação do estudo proposto no capítulo 7 não é sorteada e, por isso, não constitui esse tipo "
    "de experimento.")

# ---- Quadro 35: registro desta rodada
tbl = velha.getparent()
d.nova_linha(tbl.findall(X + "tr")[-1], [
    "15 nov. 2026",
    "Seções 1.7 e 2.7, Quadro 1 e Apêndice J",
    "Polimento da revisão de 15/11: grafia Socializer, ordem cronológica do Quadro 35 e esclarecimento de que a "
    "turma de comparação não é sorteada",
])

if falhas:
    for f in falhas:
        print("FALHOU", f)
    raise SystemExit(1)
d.salvar(str(PASTA / "word" / "document.xml"))
print("ok")
