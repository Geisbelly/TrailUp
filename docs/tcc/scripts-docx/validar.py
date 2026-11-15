import re, sys, unicodedata
from lxml import etree
W="http://schemas.openxmlformats.org/wordprocessingml/2006/main"; X="{%s}"%W; NS={"w":W}
AUT="Claude (capítulo 5, 13/11/2026)"
ac=etree.parse("ac/word/document.xml").getroot().find(X+"body")
def texto(p): return "".join(x.text or "" for x in p.iter(X+"t"))
def estilo(p):
    st=p.find("w:pPr/w:pStyle",NS); return st.get(X+"val") if st is not None else ""
ps=[p for p in ac.iter(X+"p")]
# 1) legendas
for est,rot in (("LegendaQuadro","Quadro"),("LegendaFigura","Figura")):
    seq=[int(re.match(rot+r" (\d+)",texto(p)).group(1)) for p in ps if estilo(p)==est]
    print(rot, len(seq), "em sequência" if seq==list(range(1,len(seq)+1)) else "FORA DE ORDEM")
leg={(m.group(1),int(m.group(2))) for p in ps if estilo(p) in("LegendaQuadro","LegendaFigura") for m in [re.match(r"(Quadro|Figura) (\d+)",texto(p))]}
corpo=[p for p in ps if estilo(p) not in("LegendaQuadro","LegendaFigura","TableofFigures","TOC1","TOC2","TOC3")]
orf={m.group(0) for p in corpo for m in re.finditer(r"(Quadro|Figura) (\d+)",texto(p)) if (m.group(1),int(m.group(2))) not in leg}
print("referências a quadro/figura sem legenda:", sorted(orf) or "nenhuma")
# 2) remissões a seção
tit={re.match(r"(\d+(?:\.\d+)*)",texto(p)).group(1) for p in ps if estilo(p).startswith("Heading") and re.match(r"\d",texto(p))}
faltam=set()
for p in corpo:
    for m in re.finditer(r"se(?:ção|ções) ((?:\d+(?:\.\d+)+)(?:(?:, | e | a )\d+(?:\.\d+)+)*)",texto(p)):
        for n in re.findall(r"\d+(?:\.\d+)+",m.group(1)):
            if n not in tit: faltam.add(n)
    for m in re.finditer(r"se(?:ção|ções) (\d+)(?![\.\d])",texto(p)):
        if m.group(1) not in tit: faltam.add(m.group(1))
print("títulos numerados:",len(tit),"| remissões a seção inexistente:", sorted(faltam) or "nenhuma")
# 3) citações x referências
i0=next(i for i,p in enumerate(ps) if texto(p).strip()=="REFERÊNCIAS" and estilo(p)=="Heading1")
i1=next(i for i,p in enumerate(ps) if i>i0 and texto(p).startswith("APÊNDICE A"))
def chave(nome): return unicodedata.normalize("NFKD",nome).encode("ascii","ignore").decode().upper().strip()
refs={}
for p in ps[i0+1:i1]:
    t=texto(p).strip()
    if not t: continue
    autor=re.split(r"[,.]",t,1)[0]
    anos=re.findall(r"(?<![\d/\.])((?:19|20)\d{2}[a-z]?)(?=[\.,;]| |$)",t)
    ano=re.findall(r"((?:19|20)\d{2}[a-z]?)\.(?: (?:DOI|Disponível|Base|Reposit|\(|p\.)|$)",t)
    refs[(chave(autor),(ano or anos)[-1] if (ano or anos) else "s.d.")]=t[:60]
txt=" ".join(texto(p) for p in ps[:i0]+ps[i1:] if estilo(p) not in("TableofFigures","TOC1","TOC2","TOC3"))
cit=set()
for m in re.finditer(r"([A-ZÀ-Ý][A-ZÀ-Ý&\.\- ]{2,}?)(?:;[^()]{0,90}?)?(?: et al\.)?, (\[?(?:19|20)\d{2}[a-z]?|\[20--\])",txt):
    cit.add((chave(m.group(1)),m.group(2).strip("[]")))
for m in re.finditer(r"([A-ZÀ-Ý][a-zà-ÿ]+(?: [A-Z][a-zà-ÿ]+)?)(?:, [A-ZÀ-Ý][a-zà-ÿ]+)*(?: e [A-ZÀ-Ý][a-zà-ÿ]+| et al\.)? \(((?:19|20)\d{2}[a-z]?)",txt):
    cit.add((chave(m.group(1)),m.group(2)))
rk=set(refs)
nao_cit=sorted(k for k in rk if not any(c[1]==k[1] and (c[0]==k[0] or k[0].startswith(c[0]) or c[0].startswith(k[0].split()[0])) for c in cit))
print("referências na lista:",len(rk),"| sem citação no texto:", [f"{a} {y}" for a,y in nao_cit] or "nenhuma")
sem_ref=sorted(c for c in cit if len(c[0])>3 and not any(c[1]==k[1] and (c[0]==k[0] or k[0].startswith(c[0]) or c[0].startswith(k[0].split()[0])) for k in rk))
print("citações sem entrada na lista:", [f"{a} {y}" for a,y in sem_ref][:25] or "nenhuma")
# 4) banlist e estilo no texto desta rodada
out=etree.parse("out/word/document.xml").getroot()
novos=[]
for p in out.iter(X+"p"):
    t="".join(x.text or "" for i in p.iter(X+"ins") if i.get(X+"author")==AUT for x in i.iter(X+"t"))
    if len(t)>60: novos.append(t)
ban=[l.strip().lower() for l in open("/Users/user/.claude/skills/escrever-artigo/assets/banlist-ia.txt",encoding="utf-8") if l.strip() and not l.startswith("#")]
junto=" ".join(novos).lower()
print("termos da banlist no texto desta rodada:", sorted({b for b in ban if re.search(r"\b"+re.escape(b)+r"\b",junto)}) or "nenhum")
fr=[s for t in novos for s in re.split(r"(?<=[.!?]) ",t)]
print("texto novo: %d blocos, %d frases, média %.1f palavras; frases com mais de 45 palavras: %d; 1ª pessoa: %s; 'demonstra|comprova': %s" % (
    len(novos), len(fr), sum(len(s.split()) for s in fr)/len(fr), sum(1 for s in fr if len(s.split())>45),
    bool(re.search(r"\b(nós|fizemos|nosso|nossa|eu)\b",junto)), sorted(set(re.findall(r"\b(demonstr\w+|comprov\w+)\b",junto))) or "não"))
