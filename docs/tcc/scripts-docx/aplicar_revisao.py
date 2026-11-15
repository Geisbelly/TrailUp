"""Correcoes obrigatorias do parecer de revisao (docs/tcc/parecer-revisao-2026-11-14.md), itens 1 a 5.

Uso: python aplicar_revisao.py <pasta do docx descompactado>
Base: o docx de 14/11 com os acrescimos de fontes (com alteracoes).
"""
import sys
from pathlib import Path

from lib import X, Doc

PASTA = Path(sys.argv[1])
d = Doc(str(PASTA / "word" / "document.xml"), "Claude (revisão, 15/11/2026)", "2026-11-15T12:00:00Z")
achar = d.achar
falhas = []


def faz(ident, fn, *args):
    try:
        fn(*args)
    except SystemExit as e:
        falhas.append((ident, str(e)[:120]))


# ---- 1. a analise critica foi feita com IA (secao 4.6 e 8.1)
P46 = achar("O que se fez foi uma análise crítica da literatura.")
faz("1a", d.inserir_apos, P46, "a transferência para a graduação.",
    " A leitura pelas três lentes foi feita com apoio de inteligência artificial (Claude, da Anthropic), em 30 de "
    "outubro de 2026: a ferramenta leu cada documento e registrou um parecer ao lado da decisão da curadora, sem "
    "substituí-la. Nos documentos que já tinham decisão, o parecer diz se concorda com ela; nos que não tinham, "
    "sugere um veredito, que a curadora revisou depois.")

P81 = achar("A análise crítica partiu de 47 documentos.")
# ---- 2. funil completo
faz("2a", d.trocar, P81, "os 19 restantes foram revisados depois, e a decisão final está na planilha de leituras.",
    "os 19 restantes não tinham decisão, e para eles o parecer da IA sugeriu aprovar 11, 10 deles com ressalvas, "
    "e reprovar 8; a curadora revisou essas sugestões depois, e a decisão final de cada um está na planilha de leituras.")
faz("1b", d.trocar, P81, "A análise inicial concordou com 14 decisões da curadora",
    "Nos 28 já decididos, o parecer da IA concordou com 14 decisões da curadora")
faz("2b", d.acrescentar, P81,
    " [CONFERIR: acrescente o total final de aprovados e reprovados entre os 47, tirado da planilha revisada. "
    "A cópia da planilha no Drive é de 30/10 e não traz as decisões finais dos 19 documentos.]")
P81b = achar("Nenhum documento foi destinado ao corpus do RAG, e 12 regras derivadas")
faz("2c", d.trocar, P81b, "12 regras derivadas foram escritas a partir dos aprovados.",
    "12 regras derivadas foram escritas a partir dos 12 documentos aprovados com destino texto derivado, "
    "uma regra por documento.")

# ---- 3. integracao continua (secao 5.12)
P512 = achar("A verificação é automática e separada por serviço.")
faz("3", d.trocar, P512, "a suíte de testes e a aplicação de todas as migrações num PostgreSQL limpo.",
    "a suíte de testes e um teste do executor de migrações num PostgreSQL descartável, que não aplica a cadeia "
    "completa de migrações (seção 4.4).")

# ---- 4. desfecho primario no Quadro 21
C1 = [p for p in d.root.iter(X + "p") if d.texto(p).strip() == "Variação pré-pós"]
C2 = [p for p in d.root.iter(X + "p") if d.texto(p).strip() == "Acertos, erros, retenção, desempenho por tópico"]
if len(C1) == 1 and len(C2) == 1:
    faz("4a", d.trocar, C1[0], "Variação pré-pós", "Acerto por atividade (desfecho primário, com a conclusão)")
    faz("4b", d.trocar, C2[0], "Acertos, erros, retenção, desempenho por tópico",
        "Variação pré-pós, se houver instrumento; erros, retenção, desempenho por tópico")
else:
    falhas.append(("4", f"celulas do Quadro 21: {len(C1)} e {len(C2)}"))

# ---- 5. numeros do banco numa so data (12/11, Quadro 24)
P52 = achar("o banco tinha 189 tabelas")
# o paragrafo tem tres runs: o texto, "pg_cron" (formatado a parte) e o resto
faz("5a", d.trocar, P52,
    "Em 8 de novembro de 2026, o banco tinha 189 tabelas, 705 funções, 149 gatilhos, 292 políticas de RLS e 21 rotinas",
    "Em 12 de novembro de 2026, o banco tinha 192 tabelas, 734 funções, 311 políticas de RLS e 23 rotinas")
faz("5a2", d.trocar, P52, "(TRAILUP, 2026b). A API", "(Quadro 24). A API")
P511 = achar("As 189 tabelas existentes em 8 de novembro de 2026")
faz("5b", d.trocar, P511, "As 189 tabelas existentes em 8 de novembro de 2026",
    "As 192 tabelas existentes em 12 de novembro de 2026")
P511b = achar("As automações do banco incluem 21 rotinas agendadas")
faz("5c", d.trocar, P511b, "incluem 21 rotinas agendadas", "incluem 23 rotinas agendadas")

# ---- Quadro 35 (Apendice J): linha de 30/10 no lugar cronologico e linha desta rodada no fim
primeira = d.linha_de([p for p in d.root.iter(X + "p") if d.texto(p).strip() == "4 e 5 nov. 2026"][0])
nova = d.nova_linha(primeira, [
    "30 out. 2026",
    "Seções 4.6 e 8.1 e Apêndice M",
    "Leitura dos 47 documentos da planilha pelas três lentes, com parecer registrado ao lado da decisão da "
    "curadora nos 28 já decididos e veredito sugerido nos 19 sem decisão; as decisões finais são da autora",
])
primeira.addprevious(nova)  # sobe para antes de 4 e 5 nov.
tbl = primeira.getparent()
ultima = tbl.findall(X + "tr")[-1]
d.nova_linha(ultima, [
    "15 nov. 2026",
    "Seções 4.6, 5.2, 5.11, 5.12, 7.4 e 8.1 e Apêndice J",
    "Correções da revisão de 15/11: declaração do uso de IA na análise da literatura, funil da Evidence Base, "
    "descrição da integração contínua, desfecho primário no Quadro 21 e números do banco numa só data",
])

if falhas:
    for f in falhas:
        print("FALHOU", f)
    raise SystemExit(1)
d.salvar(str(PASTA / "word" / "document.xml"))
print("ok: 11 alteracoes e 2 linhas no Quadro 35")
