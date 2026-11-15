"""Funcoes para aplicar alteracoes controladas (w:ins / w:del) num document.xml.

Baseado no aplicar.py da rodada de 13/11 (enquadramento integrativo), com tres
mudancas: `trocar` e `apagar_paragrafo` tratam texto inserido por rodadas
anteriores (o w:del fica dentro do w:ins antigo, como o Word grava), ha
construtores de figura e de titulo, e a renumeracao aceita um mapa por numero.
"""
import copy
import re

from lxml import etree

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS = {"w": W}
X = "{%s}" % W
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"


class Doc:
    def __init__(self, caminho, autor, data):
        self.tree = etree.parse(caminho)
        self.root = self.tree.getroot()
        self.body = self.root.find(X + "body")
        self.autor = autor
        self.data = data
        self._next = max(int(v) for v in self.root.xpath("//@w:id", namespaces=NS)) + 1000

    # ------------------------------------------------------------ marcas
    def nid(self):
        self._next += 1
        return str(self._next)

    def mark(self, tag):
        el = etree.Element(X + tag)
        el.set(X + "id", self.nid())
        el.set(X + "author", self.autor)
        el.set(X + "date", self.data)
        return el

    def _clone_ins(self, orig):
        """w:ins novo com o autor e a data de um w:ins de rodada anterior."""
        el = etree.Element(X + "ins")
        el.set(X + "id", self.nid())
        el.set(X + "author", orig.get(X + "author"))
        el.set(X + "date", orig.get(X + "date"))
        return el

    def intocavel(self, el):
        """Texto apagado, ou inserido por esta rodada."""
        a = el.getparent()
        while a is not None:
            if a.tag == X + "del":
                return True
            if a.tag == X + "ins" and a.get(X + "author") == self.autor:
                return True
            a = a.getparent()
        return False

    def texto(self, p):
        return "".join(t.text or "" for t in p.iter(X + "t") if not self.intocavel(t))

    # ------------------------------------------------------------ runs
    @staticmethod
    def run(text, rpr=None, deleted=False):
        r = etree.Element(X + "r")
        if rpr is not None:
            r.append(copy.deepcopy(rpr))
        t = etree.SubElement(r, X + ("delText" if deleted else "t"))
        t.text = text
        t.set(XML_SPACE, "preserve")
        return r

    def ins_runs(self, runs):
        w = self.mark("ins")
        for r in runs:
            w.append(r)
        return w

    @staticmethod
    def rpr_de(p):
        for r in p.iter(X + "r"):
            if r.find(X + "t") is not None:
                return r.find(X + "rPr")
        return None

    # ------------------------------------------------------------ busca
    def achar(self, trecho, estilo_excluido=("TableofFigures", "TOC1", "TOC2", "TOC3")):
        achados = []
        for p in self.body.iter(X + "p"):
            st = p.find("w:pPr/w:pStyle", NS)
            if st is not None and st.get(X + "val") in estilo_excluido:
                continue
            if trecho in self.texto(p):
                achados.append(p)
        if len(achados) != 1:
            raise SystemExit(f"esperava 1 paragrafo com {trecho!r}, achei {len(achados)}")
        return achados[0]

    # ------------------------------------------------------------ edicao dentro do paragrafo
    def _partir(self, p, ancora):
        """Acha o w:t (editavel) que contem `ancora` e devolve (t, run, rpr, antes, depois)."""
        for t in p.iter(X + "t"):
            if self.intocavel(t) or t.text is None or ancora not in t.text:
                continue
            r = t.getparent()
            if len(r.findall(X + "t")) != 1 or any(c.tag not in (X + "rPr", X + "t") for c in r):
                raise SystemExit(f"run complexo em {ancora!r}")
            antes, depois = t.text.split(ancora, 1)
            return t, r, r.find(X + "rPr"), antes, depois
        raise SystemExit(f"trecho nao achado: {ancora!r}")

    def _recolocar(self, r, pecas_fora, pecas_dentro_esq, pecas_dentro_dir):
        """Troca o run `r` por uma sequencia de pecas.

        Se `r` esta direto no paragrafo, as pecas entram no lugar dele. Se esta
        dentro de um w:ins de rodada anterior, esse w:ins e partido em tres: o
        que ficava antes de `r`, as pecas novas, o que ficava depois.
        `pecas_dentro_esq/dir` sao runs que continuam pertencendo ao autor
        antigo (o texto que sobrou do proprio run).
        """
        pai = r.getparent()
        if pai.tag == X + "ins":
            avo = pai.getparent()
            i = avo.index(pai)
            filhos = list(pai)
            k = filhos.index(r)
            esq, dir_ = filhos[:k], filhos[k + 1:]
            seq = []
            if esq or pecas_dentro_esq:
                a = self._clone_ins(pai)
                for c in esq:
                    a.append(c)
                for c in pecas_dentro_esq:
                    a.append(c)
                seq.append(a)
            for peca in pecas_fora:
                if peca.tag == X + "del":
                    b = self._clone_ins(pai)  # apagar texto inserido: del dentro do ins antigo
                    b.append(peca)
                    seq.append(b)
                else:
                    seq.append(peca)
            if dir_ or pecas_dentro_dir:
                c2 = self._clone_ins(pai)
                for c in pecas_dentro_dir:
                    c2.append(c)
                for c in dir_:
                    c2.append(c)
                seq.append(c2)
            avo.remove(pai)
            for j, e in enumerate(seq):
                avo.insert(i + j, e)
        elif pai.tag == X + "p":
            i = pai.index(r)
            seq = list(pecas_dentro_esq) + list(pecas_fora) + list(pecas_dentro_dir)
            pai.remove(r)
            for j, e in enumerate(seq):
                pai.insert(i + j, e)
        else:
            raise SystemExit(f"run em lugar inesperado: {pai.tag}")

    def trocar(self, p, antigo, novo):
        """Troca controlada de um trecho que esta inteiro dentro de um w:t."""
        _, r, rpr, antes, depois = self._partir(p, antigo)
        d = self.mark("del")
        d.append(self.run(antigo, rpr, deleted=True))
        fora = [d]
        if novo:
            fora.append(self.ins_runs([self.run(novo, rpr)]))
        self._recolocar(
            r, fora,
            [self.run(antes, rpr)] if antes else [],
            [self.run(depois, rpr)] if depois else [],
        )

    def inserir_apos(self, p, ancora, novo):
        """Insere `novo` logo depois de `ancora`, sem apagar nada."""
        _, r, rpr, antes, depois = self._partir(p, ancora)
        self._recolocar(
            r, [self.ins_runs([self.run(novo, rpr)])],
            [self.run(antes + ancora, rpr)],
            [self.run(depois, rpr)] if depois else [],
        )

    def acrescentar(self, p, novo, rpr=None):
        """Insere `novo` no fim do paragrafo."""
        p.append(self.ins_runs([self.run(novo, rpr if rpr is not None else self.rpr_de(p))]))

    # ------------------------------------------------------------ paragrafo inteiro
    def apagar_paragrafo(self, p):
        for c in list(p):
            if c.tag == X + "r":
                if c.find(X + "t") is None:
                    continue  # referencia de comentario, quebra etc.: fica
                if any(k.tag not in (X + "rPr", X + "t") for k in c):
                    raise SystemExit("run complexo ao apagar paragrafo")
                d = self.mark("del")
                p.replace(c, d)
                for t in c.findall(X + "t"):
                    t.tag = X + "delText"
                d.append(c)
            elif c.tag == X + "ins":
                if c.get(X + "author") == self.autor:
                    raise SystemExit("paragrafo ja alterado nesta rodada")
                d = self.mark("del")
                for r in list(c):
                    if r.tag != X + "r" or any(k.tag not in (X + "rPr", X + "t") for k in r):
                        raise SystemExit("conteudo inesperado em w:ins antigo")
                    for t in r.findall(X + "t"):
                        t.tag = X + "delText"
                    d.append(r)
                c.append(d)

    def substituir_paragrafo(self, p, texto_novo):
        rpr = self.rpr_de(p)
        self.apagar_paragrafo(p)
        p.append(self.ins_runs([self.run(texto_novo, rpr)]))

    def novo_paragrafo(self, ppr_modelo, runs):
        p = etree.Element(X + "p")
        ppr = copy.deepcopy(ppr_modelo) if ppr_modelo is not None else etree.Element(X + "pPr")
        rpr = ppr.find(X + "rPr")
        if rpr is None:
            rpr = etree.SubElement(ppr, X + "rPr")
        for velho in rpr.findall(X + "ins"):
            rpr.remove(velho)
        rpr.insert(0, self.mark("ins"))
        p.append(ppr)
        if runs:
            p.append(self.ins_runs(runs))
        return p

    @staticmethod
    def inserir_depois(ref, *novos):
        pai = ref.getparent()
        i = pai.index(ref)
        for k, n in enumerate(novos):
            pai.insert(i + 1 + k, n)
        return novos[-1]

    @staticmethod
    def inserir_antes(ref, *novos):
        pai = ref.getparent()
        i = pai.index(ref)
        for k, n in enumerate(novos):
            pai.insert(i + k, n)

    # ------------------------------------------------------------ legenda, quadro, figura
    def legenda(self, modelo, rotulo, numero, titulo):
        """Legenda nova com campo SEQ. `rotulo` e 'Quadro' ou 'Figura'."""
        leg = etree.Element(X + "p")
        ppr = copy.deepcopy(modelo.find(X + "pPr"))
        rp = ppr.find(X + "rPr")
        if rp is None:
            rp = etree.SubElement(ppr, X + "rPr")
        rp.insert(0, self.mark("ins"))
        leg.append(ppr)
        negrito = etree.fromstring(
            '<w:rPr xmlns:w="%s"><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' % W)
        pequeno = etree.fromstring('<w:rPr xmlns:w="%s"><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>' % W)
        r = etree.Element(X + "r")
        r.append(negrito)
        t = etree.SubElement(r, X + "t")
        t.text = rotulo + " "
        t.set(XML_SPACE, "preserve")
        etree.SubElement(r, X + "fldChar").set(X + "fldCharType", "begin")
        it = etree.SubElement(r, X + "instrText")
        it.text = f" SEQ {rotulo} \\* ARABIC "
        it.set(XML_SPACE, "preserve")
        etree.SubElement(r, X + "fldChar").set(X + "fldCharType", "separate")
        etree.SubElement(r, X + "t").text = str(numero)
        etree.SubElement(r, X + "fldChar").set(X + "fldCharType", "end")
        ins = self.mark("ins")
        ins.append(r)
        ins.append(self.run(" – " + titulo, pequeno))
        leg.append(ins)
        return leg

    def fonte(self, modelo, texto_fonte):
        f = etree.Element(X + "p")
        ppr = copy.deepcopy(modelo.find(X + "pPr"))
        rpr_mod = self.rpr_de(modelo)
        rp = ppr.find(X + "rPr")
        if rp is None:
            rp = etree.SubElement(ppr, X + "rPr")
        rp.insert(0, self.mark("ins"))
        f.append(ppr)
        f.append(self.ins_runs([self.run(texto_fonte, rpr_mod)]))
        return f

    def quadro(self, modelo_tbl, larguras, linhas):
        """Tabela nova, linha a linha marcada como inserida, no formato do modelo."""
        tbl = etree.Element(X + "tbl")
        tbl.append(copy.deepcopy(modelo_tbl.find(X + "tblPr")))
        grid = etree.SubElement(tbl, X + "tblGrid")
        for wd in larguras:
            etree.SubElement(grid, X + "gridCol").set(X + "w", str(wd))
        trs = modelo_tbl.findall(X + "tr")
        modelo_cab, modelo_lin = trs[0], trs[1]
        for n_l, linha in enumerate(linhas):
            base = modelo_cab if n_l == 0 else modelo_lin
            tr = etree.SubElement(tbl, X + "tr")
            trpr = copy.deepcopy(base.find(X + "trPr"))
            if trpr is None:
                trpr = etree.Element(X + "trPr")
            trpr.append(self.mark("ins"))
            tr.append(trpr)
            tcs = base.findall(X + "tc")
            for c, (txt, wd) in enumerate(zip(linha, larguras)):
                tc_mod = tcs[min(c, len(tcs) - 1)]
                tc = etree.SubElement(tr, X + "tc")
                tcpr = copy.deepcopy(tc_mod.find(X + "tcPr"))
                for sobra in tcpr.findall(X + "gridSpan"):
                    tcpr.remove(sobra)
                tcw = tcpr.find(X + "tcW")
                if tcw is None:
                    tcw = etree.Element(X + "tcW")
                    tcw.set(X + "type", "dxa")
                    tcpr.insert(0, tcw)
                tcw.set(X + "w", str(wd))
                tc.append(tcpr)
                p_mod = tc_mod.find(X + "p")
                tc.append(self.novo_paragrafo(p_mod.find(X + "pPr"), [self.run(txt, self.rpr_de(p_mod))]))
        return tbl

    def titulo(self, modelo, texto_titulo):
        """Titulo de secao (Heading) novo, no formato do modelo."""
        ppr = copy.deepcopy(modelo.find(X + "pPr"))
        return self.novo_paragrafo(ppr, [self.run(texto_titulo, self.rpr_de(modelo))])

    def desenho(self, modelo_p, rid, nome, id_doc, cx, cy):
        """Paragrafo com a imagem, copiado do modelo e marcado como inserido."""
        p = copy.deepcopy(modelo_p)
        for a in list(p.attrib):
            del p.attrib[a]
        ppr = p.find(X + "pPr")
        rp = ppr.find(X + "rPr")
        if rp is None:
            rp = etree.SubElement(ppr, X + "rPr")
        rp.insert(0, self.mark("ins"))
        r = p.find(X + "r")
        xml = etree.tostring(r, encoding="unicode")
        for el in r.iter():
            tag = etree.QName(el).localname
            if tag in ("extent", "ext") and el.get("cx") is not None:
                el.set("cx", str(cx))
                el.set("cy", str(cy))
            elif tag == "docPr":
                el.set("id", str(id_doc))
                el.set("name", nome)
            elif tag == "cNvPr":
                el.set("id", str(id_doc))
                el.set("name", nome)
            elif tag == "blip":
                el.set("{%s}embed" % R, rid)
        assert xml  # so para deixar claro que `r` foi alterado no lugar
        ins = self.mark("ins")
        p.replace(r, ins)
        ins.append(r)
        return p

    # ------------------------------------------------------------ renumeracao
    def renumerar(self, rotulo, mapa, estilo_legenda):
        """Renumera 'Rotulo N' no texto corrido (controlado) e o numero em cache das legendas."""
        n_txt = n_leg = 0
        padrao = re.compile(r"%s (\d+)\b" % rotulo)
        for p in list(self.body.iter(X + "p")):
            st = p.find("w:pPr/w:pStyle", NS)
            estilo = st.get(X + "val") if st is not None else ""
            if estilo in ("TableofFigures", "TOC1", "TOC2", "TOC3"):
                continue  # listas geradas por campo: atualizar os campos no Word
            if estilo == estilo_legenda:
                # resultado do campo SEQ: troca no lugar, sem marca (o Word recalcula)
                depois_do_separador = False
                for el in p.iter():
                    if el.tag == X + "fldChar" and el.get(X + "fldCharType") == "separate":
                        depois_do_separador = True
                    elif el.tag == X + "fldChar" and el.get(X + "fldCharType") == "end":
                        depois_do_separador = False
                    elif (el.tag == X + "t" and depois_do_separador and el.text
                          and el.text.strip().isdigit() and not self._em_del(el)
                          and not self._nesta_rodada(el)):
                        n = int(el.text.strip())
                        if mapa.get(n, n) != n:
                            el.text = str(mapa[n])
                            n_leg += 1
                continue
            for _ in range(12):
                alvo = None
                for t in p.iter(X + "t"):
                    if self.intocavel(t) or not t.text:
                        continue
                    for m in padrao.finditer(t.text):
                        n = int(m.group(1))
                        if mapa.get(n, n) != n:
                            alvo = (m.group(0), f"{rotulo} {mapa[n]}")
                            break
                    if alvo:
                        break
                if not alvo:
                    break
                self.trocar(p, alvo[0], alvo[1])
                n_txt += 1
        return n_txt, n_leg

    @staticmethod
    def _em_del(el):
        a = el.getparent()
        while a is not None:
            if a.tag == X + "del":
                return True
            a = a.getparent()
        return False

    def _nesta_rodada(self, el):
        a = el.getparent()
        while a is not None:
            if a.tag == X + "ins" and a.get(X + "author") == self.autor:
                return True
            a = a.getparent()
        return False

    # ------------------------------------------------------------ tabelas existentes
    @staticmethod
    def linha_de(p):
        for a in p.iterancestors():
            if a.tag == X + "tr":
                return a
        raise SystemExit("paragrafo fora de tabela")

    @staticmethod
    def celulas(tr):
        return tr.findall(X + "tc")

    def nova_linha(self, tr_modelo, textos):
        """Linha nova logo abaixo de `tr_modelo`, com o mesmo formato."""
        tr = etree.Element(X + "tr")
        trpr = copy.deepcopy(tr_modelo.find(X + "trPr"))
        if trpr is None:
            trpr = etree.Element(X + "trPr")
        for velho in trpr.findall(X + "ins"):
            trpr.remove(velho)
        trpr.append(self.mark("ins"))
        tr.append(trpr)
        for tc_mod, txt in zip(tr_modelo.findall(X + "tc"), textos):
            tc = etree.SubElement(tr, X + "tc")
            tc.append(copy.deepcopy(tc_mod.find(X + "tcPr")))
            p_mod = tc_mod.find(X + "p")
            rpr = None
            for r in p_mod.iter(X + "r"):
                if r.find(X + "t") is not None or r.find(X + "delText") is not None:
                    rpr = r.find(X + "rPr")
                    break
            tc.append(self.novo_paragrafo(p_mod.find(X + "pPr"), [self.run(txt, rpr)]))
        self.inserir_depois(tr_modelo, tr)
        return tr

    def salvar(self, caminho):
        self.tree.write(caminho, xml_declaration=True, encoding="UTF-8", standalone=True)
