import json, re, sys, unicodedata
c = json.load(open(sys.argv[1]))
V = "aeiouáéíóúâêôãõàüy"
STRONG = set("aeoáéóâêôãõà")
def sil(w):
    w = w.lower()
    # hiatus with accented í/ú
    groups = re.findall(r"[%s]+" % V, w)
    n = 0
    for g in groups:
        k = 1
        for a, b in zip(g, g[1:]):
            if (a in STRONG and b in STRONG) and not (a in "ãõ" or a+b in ("ão","õe","ãe")):
                k += 1
            elif b in "íú" or (a in "íú"):
                k += 1
        # 'qu'/'gu' + vowel: u is not a syllable nucleus -> handled crudely below
        n += k
    n -= len(re.findall(r"[qg]u[eiéíêa]", w))
    return max(1, n)

TAG = re.compile(r"\[Tom:[^\]]*\]", re.I)
def limpar(t, md):
    t = re.sub(r"```.*?```", " ", t, flags=re.S)
    if not md:
        pass
    t = TAG.sub(" ", t)
    t = re.sub(r"^#+ .*$", lambda m: m.group(0).lstrip('#').strip()+".", t, flags=re.M)
    t = re.sub(r"`[^`]*`", " CODIGO ", t)
    t = re.sub(r"^\s*(def |    ).*$", " ", t, flags=re.M)  # codigo nao cercado (mastermind)
    t = re.sub(r"^\s*[-*]\s*\[ \]\s*", "", t, flags=re.M)
    t = re.sub(r"^\s*([-*]|\d+\.)\s+", "", t, flags=re.M)
    t = t.replace("**", "").replace("*", "")
    # linhas de lista sem ponto final viram frases
    linhas = [l.strip() for l in t.split("\n") if l.strip()]
    linhas = [l if re.search(r"[.!?:;]$", l) else l + "." for l in linhas]
    return " ".join(linhas)

def frases(t):
    t = re.sub(r"(\d)\.(\d)", r"\1\2", t)
    fs = [f for f in re.split(r"(?<=[.!?:])\s+", t) if re.search(r"[A-Za-zÀ-ú]", f)]
    return fs

NOMI = re.compile(r"\w+(ção|ções|mento|mentos|dade|dades|ência|ências|ância|âncias|agem|agens)$", re.I)
def medir(texto, md):
    raw = texto
    t = limpar(texto, md)
    fs = frases(t)
    ws = re.findall(r"[A-Za-zÀ-ÿ]+(?:-[A-Za-zÀ-ÿ]+)*", t)
    ws = [w for w in ws if w != "CODIGO"]
    sy = [sum(sil(p) for p in w.split("-")) for w in ws]
    n = len(ws)
    asl = n / len(fs)
    asw = sum(sy) / n
    flesch = 248.835 - 1.015 * asl - 84.6 * asw
    longas = sum(1 for s in sy if s >= 4) / n
    longas7 = sum(1 for w in ws if len(w) >= 10) / n
    nom = sum(1 for w in ws if NOMI.match(w))
    low = raw.lower()
    return dict(
        palavras=n, frases=len(fs), ASL=round(asl,1), ASW=round(asw,2), flesch_pt=round(flesch,1),
        pal_4silabas_mais=round(100*longas,1), pal_10letras_mais=round(100*longas7,1),
        nominaliz_mil=round(1000*nom/n,1),
        exclam=raw.count("!"), pergunta=raw.count("?"),
        voce=len(re.findall(r"\bvocê\b", low)), seu_sua=len(re.findall(r"\b(seu|sua|seus|suas)\b", low)),
        vamos_nos=len(re.findall(r"\b(vamos|nós|nosso|nossa|nossos|nossas)\b", low)),
        tags_tom=len(TAG.findall(raw)), h2=len(re.findall(r"^## ", raw, re.M)), h3=len(re.findall(r"^### ", raw, re.M)),
        cerca_codigo=raw.count("```")//2,
    )

IMP = r"\b(imagine|imagine-se|pense|lembre-se|lembre|veja|observe|considere|preste|fique|evite|garanta|atente|compare|olha|repare|cuidado|convido)\b"
TEMA = r"\b(grimório|feitiço\w*|arcan\w*|místic\w*|jornada|territóri\w*|viajante|travessia|mágic\w*|magia|poder|vitória|fragmento|sabedoria|forjar|habit\w*|selva|sobreviv\w*|suprimento|inventário|poço|missão|tátic\w*|terreno|jogada|explorador|aprendizes|atalho|universo|oceano|terras|alquím\w*|ancestral|arte|fronteira\w*|resgate|recurso\w*|água|ração|escuro|explorar|explorando|exploração|descobri\w*|mapear|mapeamos|mapeou|mapeando|mapeamento|mapa|pista\w*|evidência|hipótese|trade-off|modelo|mitigar|resiliência|evite falhas|passo a passo)\b"
res = {}
for k, v in c.items():
    for ch in v["chapters"]:
        for campo, md in (("markdown", True), ("audioScript", False)):
            m = medir(ch[campo], md)
            low = ch[campo].lower()
            m["imperativos"] = len(re.findall(IMP, low))
            from collections import Counter
            m["lexico_tematico"] = dict(Counter(re.findall(TEMA, low)))
            res[f"{k}|{ch['blockId']}|{'md' if md else 'audio'}"] = m
    # agregado por texto
    for campo, md, tag in (("markdown", True, "md"), ("audioScript", False, "audio")):
        tudo = "\n\n".join(ch[campo] for ch in v["chapters"])
        m = medir(tudo, md)
        m["imperativos"] = len(re.findall(IMP, tudo.lower()))
        res[f"{k}|TOTAL|{tag}"] = m
json.dump(res, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
cols = ["palavras","frases","ASL","ASW","flesch_pt","pal_4silabas_mais","pal_10letras_mais","nominaliz_mil","exclam","pergunta","voce","seu_sua","vamos_nos","imperativos","tags_tom","h2","h3","cerca_codigo"]
print("chave".ljust(36), " ".join(c[:7].rjust(7) for c in cols))
for k, m in res.items():
    print(k.ljust(36), " ".join(str(m[c]).rjust(7) for c in cols))
print()
for k, m in res.items():
    if "TOTAL" not in k: print(k, m["lexico_tematico"])
