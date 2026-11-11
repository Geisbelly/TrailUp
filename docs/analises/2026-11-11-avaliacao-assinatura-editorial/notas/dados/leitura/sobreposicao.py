import json, re, sys
c = json.load(open(sys.argv[1])); b = {x["id"]: x for x in json.load(open(sys.argv[2]))}
tok = lambda t: re.findall(r"[a-zà-ÿ0-9]+", re.sub(r"\[Tom:[^\]]*\]", " ", t.lower()))
def grams(ws, n=5): return {tuple(ws[i:i+n]) for i in range(len(ws)-n+1)}
for k, v in c.items():
    for ch in v["chapters"]:
        src = b[ch["blockId"]]; s = " ".join([src["conteudo_base"], src["conteudo_aprofundado"], src["ponte_proximo_bloco"]] + src["objetivos"] + src["exemplos_contextos"])
        a, m, g = grams(tok(ch["audioScript"])), grams(tok(ch["markdown"])), grams(tok(s))
        print(f"{k:24s} {ch['blockId']}  audio∩md={len(a&m)/len(a):.0%}  audio∩fonte={len(a&g)/len(a):.0%}  md∩fonte={len(m&g)/len(m):.0%}")
