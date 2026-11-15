"""Despeja o texto (alteracoes aceitas) com indice, estilo e marca de tabela."""
import sys
from lxml import etree
W="http://schemas.openxmlformats.org/wordprocessingml/2006/main"; X="{%s}"%W; NS={"w":W}
t=etree.parse(sys.argv[1]); body=t.getroot().find(X+"body")
def texto(p): return "".join(x.text or "" for x in p.iter(X+"t"))
i=0
for el in body:
    if el.tag==X+"p":
        st=el.find("w:pPr/w:pStyle",NS); est=st.get(X+"val") if st is not None else ""
        tx=texto(el).strip()
        fig=" [IMAGEM]" if el.find(".//"+X+"drawing") is not None else ""
        if tx or fig: print(f"§{i} [{est}]{fig} {tx}")
        i+=1
    elif el.tag==X+"tbl":
        for r,tr in enumerate(el.findall(X+"tr")):
            print(f"§{i} [TAB l{r}] "+" | ".join(texto(c).strip() for c in tr.findall(X+"tc")))
        i+=1
