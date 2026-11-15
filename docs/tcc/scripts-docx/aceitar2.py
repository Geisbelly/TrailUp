"""Gera um document.xml com todas as alteracoes aceitas, inclusive linhas de tabela
e marcas de paragrafo apagadas (o aceitar.py antigo nao tratava esses dois casos)."""
import sys
from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
X = "{%s}" % W
t = etree.parse(sys.argv[1])
root = t.getroot()

# linhas apagadas
for tr in list(root.iter(X + "tr")):
    trpr = tr.find(X + "trPr")
    if trpr is not None and trpr.find(X + "del") is not None:
        tbl = tr.getparent()
        tbl.remove(tr)
        if tbl.find(X + "tr") is None:
            tbl.getparent().remove(tbl)
# paragrafos com a marca apagada
marcados = [p for p in root.iter(X + "p")
            if p.find(X + "pPr") is not None and p.find(X + "pPr").find(X + "rPr") is not None
            and p.find(X + "pPr").find(X + "rPr").find(X + "del") is not None]
for d in list(root.iter(X + "del")):
    d.getparent().remove(d)
for p in marcados:
    tem = any(c.tag in (X + "r", X + "ins", X + "hyperlink") and
              (c.find(".//" + X + "t") is not None or c.find(".//" + X + "drawing") is not None) for c in p)
    if not tem and p.getparent().tag != X + "tc":
        p.getparent().remove(p)
for i in list(root.iter(X + "ins")):
    pai = i.getparent()
    if pai is None:
        continue
    if pai.tag in (X + "rPr", X + "trPr"):
        pai.remove(i)
        continue
    k = pai.index(i)
    for j, c in enumerate(list(i)):
        pai.insert(k + j, c)
    pai.remove(i)
t.write(sys.argv[2], xml_declaration=True, encoding="UTF-8", standalone=True)
