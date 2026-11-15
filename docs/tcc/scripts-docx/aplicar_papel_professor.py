"""Papel do professor como validador do que a IA gera (item 11 do parecer de revisao).

Uso: python aplicar_papel_professor.py <pasta do docx descompactado>
Base: o docx da revisao de 15/11 (com alteracoes), ja com o polimento.
Propostas em docs/tcc/propostas-papel-do-professor-2026-11-15.md. O CONFERIR da 4.3 foi resolvido no
codigo: o aluno recebe na hora o retorno do modelo (20261108_01), a nota fica na fila de correcao
ate o professor (20261016_04/_05) e as moedas da atividade so entram depois da decisao dele (20261017_07).
"""
import sys
from pathlib import Path

from lib import NS, X, Doc

PASTA = Path(sys.argv[1])
d = Doc(str(PASTA / "word" / "document.xml"), "Claude (papel do professor, 15/11/2026)", "2026-11-15T18:00:00Z")
achar, T, run = d.achar, d.texto, d.run
falhas = []


def faz(ident, fn, *args):
    try:
        return fn(*args)
    except SystemExit as e:
        falhas.append((ident, str(e)[:160]))


def estilo(p):
    st = p.find("w:pPr/w:pStyle", NS)
    return st.get(X + "val") if st is not None else ""


def legenda_de(comeco):
    ach = [p for p in d.body.iter(X + "p") if estilo(p) == "LegendaQuadro" and comeco in T(p)]
    if len(ach) != 1:
        raise SystemExit(f"legenda {comeco!r}: {len(ach)}")
    return ach[0]


def celula(texto_exato):
    ps = [p for p in d.body.iter(X + "p") if T(p).strip() == texto_exato]
    if len(ps) != 1:
        raise SystemExit(f"celula {texto_exato!r}: {len(ps)}")
    return ps[0]


def par_como(modelo, texto):
    return d.novo_paragrafo(modelo.find(X + "pPr"), [run(texto, d.rpr_de(modelo))])


def larguras_de(tbl):
    return [int(g.get(X + "w")) for g in tbl.find(X + "tblGrid").findall(X + "gridCol")]


# ------------------------------------------------------------------ modelos, antes de qualquer alteracao
P462 = achar("O professor permanece como agente da decisão pedagógica.")
LEG10 = legenda_de("Tipos de questão e onde cada um é corrigido")
TBL10 = LEG10.getnext()
FONTE10 = TBL10.getnext()
assert TBL10.tag == X + "tbl" and "Fonte" in T(FONTE10)

# ------------------------------------------------------------------ 4.1 quadro dos pontos de decisao (5.4)
ENTRADA = (
    "O Quadro 8 reúne os pontos em que o professor decide sobre o que a IA gerou. Em cada um, a geração é "
    "automática, mas a entrega ao aluno depende de uma decisão dele, e a maior parte dessas decisões é garantida "
    "pelo banco, e não apenas pela interface. O que não foi aprovado não é lido pelo aplicativo do aluno, e nenhum "
    "caminho de geração consegue aprovar o próprio material. A regra de aprovação do material é uma decisão de "
    "projeto da autora, tomada em 10 de novembro de 2026, e não uma regra derivada da Evidence Base."
)
LINHAS = [
    ["O que a IA gera", "O que o professor decide", "Como o sistema garante"],
    ["Proposta de trilha (tópicos, conteúdos, atividades, questões e cards)",
     "Ajusta, remove ou refaz tópicos e aplica ou descarta a proposta",
     "A proposta fica em rascunho, fora do alcance do aluno; o tópico aplicado nasce em rascunho"],
    ["Publicação do tópico", "Rascunho, publicado ou agendado",
     "O aluno não lê o tópico não liberado nem nada do que pende dele"],
    ["Material por perfil (texto, áudio, apresentação e cards)",
     "Aprova ou recusa, por item, por tópico ou pela turma",
     "O material nasce pendente e volta a pendente quando muda; só o professor dono decide, sobre a versão que viu"],
    ["Missões sugeridas", "Aprova ou recusa", "Missão da IA não chega ao aluno sem aprovação, por regra do banco"],
    ["Insights e intervenções", "Aceita ou descarta", "O professor não altera o texto gravado pela IA"],
    ["Nota de dissertativa e de código", "Confirma ou ajusta",
     "A nota do modelo fica na fila de correção até a decisão do professor"],
    ["Classificação de alteração do professor", "Decide quando não há modelo",
     "Sem modelo, nada é classificado automaticamente"],
]
FORA = (
    "Nem tudo o que a IA produz passa por esse filtro. As perguntas do diagnóstico do tópico, as respostas do "
    "Guardião, as falas do boss e o texto das notificações chegam ao aluno sem decisão do professor, porque são "
    "geradas sob demanda ou em tempo real. Nesses casos o controle é automático: o diagnóstico é opcional e não "
    "vale nota, a resposta do Guardião passa pela verificação de grounding, as falas do boss têm reserva fixa e as "
    "notificações passam pela guarda de texto do banco (seção 5.5)."
)
d.inserir_depois(
    P462,
    par_como(P462, ENTRADA),
    d.legenda(LEG10, "Quadro", 8, "Pontos de decisão do professor sobre o que a IA gera"),
    d.quadro(TBL10, larguras_de(TBL10), LINHAS),
    d.fonte(FONTE10, "Fonte: elaborado pela autora a partir das migrações do banco e do código do console "
                     "(TRAILUP, 2026a)."),
    par_como(P462, FORA),
)

# ------------------------------------------------------------------ 4.4 §462
faz("4.4a", d.trocar, P462, "não entrega ao aluno material gerado sem", "não entrega ao aluno material de estudo gerado sem")
faz("4.4b", d.inserir_apos, P462, "fora das regras definidas pelo professor",
    ", não fecha a nota de uma resposta aberta sem a confirmação dele")

# ------------------------------------------------------------------ 4.2 §460
P460 = achar("O professor pode pedir à IA uma proposta de trilha")
faz("4.2", d.trocar, P460, "Nada entra na turma sem que o professor aplique a proposta.",
    "Antes de aplicar, o professor pode ajustar, remover ou refazer tópicos da proposta. Nada entra na turma sem "
    "que ele a aplique, e o tópico aplicado nasce em rascunho, como qualquer tópico novo: a trilha proposta pela IA "
    "passa por duas decisões do professor antes de chegar ao aluno.")

# ------------------------------------------------------------------ 4.3 Quadro 10 e §510
FILA = "; a nota do modelo fica na fila de correção do professor, que a confirma ou ajusta"
faz("4.3a", d.acrescentar, faz("c1", celula, "Numa Edge Function, que lê no servidor a resposta esperada definida pelo "
                                            "professor; a resposta equivalente à esperada é aceita pela mesma "
                                            "comparação de texto da lacuna"), FILA)
faz("4.3b", d.acrescentar, faz("c2", celula, "Numa Edge Function, sem devolver ao aluno o código de referência"), FILA)
P510 = achar("Questões e cards funcionam como recursos de prática e reforço.")
faz("4.3c", d.inserir_apos, P510, "que não devolve ao aluno o código de referência.",
    " Nas dissertativas e nas de código, o aluno recebe na hora o retorno do modelo, mas a nota é uma sugestão: ela "
    "entra na fila de correção da aba Notas, onde o professor a confirma ou ajusta. A resposta que o modelo não "
    "consegue corrigir fica sem nota até a decisão dele, e as moedas da atividade só são creditadas depois dessa "
    "decisão.")

# ------------------------------------------------------------------ 4.5 Resumo e Abstract
P81 = achar("O TrailUp é uma plataforma adaptativa de aprendizagem para estudantes de graduação")
faz("4.5a", d.inserir_apos, P81, "agendamentos e autorização.",
    " O professor continua responsável pelo conteúdo: a trilha proposta pela IA só entra na turma quando ele a "
    "aplica, e o material gerado para cada perfil só chega ao aluno depois de aprovado por ele, regra garantida "
    "pelo banco.")
P84 = achar("TrailUp is an adaptive learning platform for undergraduate students")
faz("4.5b", d.inserir_apos, P84, "schedules, and authorization.",
    " The teacher remains responsible for the content: the trail proposed by the AI only enters the class when the "
    "teacher applies it, and the material generated for each profile only reaches the student after the teacher "
    "approves it, a rule enforced by the database.")

# ------------------------------------------------------------------ 4.6 objetivo especifico
P258 = celula("preservar o conteúdo curricular original produzido pelo professor como referência principal da "
              "disciplina;")
faz("4.6", d.trocar, P258, "como referência principal da disciplina;",
    "como referência principal da disciplina e manter com ele a decisão sobre o que a IA gera antes que chegue ao "
    "aluno;")

# ------------------------------------------------------------------ 4.7 justificativa
P268 = achar("A contribuição prática consiste em levar essa abordagem a uma aplicação concreta")
faz("4.7a", d.trocar, P268, "geração de materiais, validação, persistência e publicação",
    "geração de materiais, validação automática, aprovação pelo professor e publicação")
faz("4.7b", d.acrescentar, P268,
    " O material gerado por modelo de linguagem pode conter erro de conteúdo, e quem conhece a disciplina é o "
    "professor; por isso o sistema gera, mas é ele quem decide o que o aluno recebe.")

# ------------------------------------------------------------------ 4.9 capitulo 7
P650 = achar("O estudo usa três fontes de dado:")
faz("4.9a", d.inserir_apos, P650, "códigos iniciais de análise.",
    " O roteiro inclui o tempo que o professor gasta para revisar o material gerado e as notas sugeridas pela IA, "
    "e o que ele recusou e por quê.")
q21 = faz("4.9b", celula, "Experiência")
if q21 is not None:
    d.nova_linha(d.linha_de(q21), [
        "Operação",
        "Decisão do professor sobre o material gerado",
        "Taxa de aprovação e de recusa, tempo até a decisão, notas da IA ajustadas pelo professor",
        "Indica o trabalho de validação que o sistema exige do professor",
    ])

# ------------------------------------------------------------------ 4.8 seção 8.2
P713 = achar("Quatro leituras decorrem desses números.")
d.inserir_depois(P713, par_como(P713,
    "A validação pelo professor tem pouca medida até aqui. Das 7 missões sugeridas pela IA até 5 de novembro de "
    "2026, o professor aprovou 5 (seção 5.9). A aprovação do material personalizado entrou em 10 de novembro, e em "
    "12 de novembro nenhum material novo tinha passado por decisão do professor; o material anterior foi aprovado "
    "pela migração que criou a regra (seção 5.4)."))

# ------------------------------------------------------------------ 4.10 seção 8.5
P731 = achar("A regra de fronteira levou para o banco o que depende de relógio")
d.inserir_depois(P731, par_como(P731,
    "A aprovação muda o tipo de sistema: a geração é automática, mas a entrega é supervisionada. Ela tem dois "
    "custos que este trabalho não mediu. O primeiro é o trabalho do professor: com sete perfis e quatro materiais "
    "por perfil, um tópico pode ter até 28 itens para revisar, e a aprovação em lote por tópico ou pela turma reduz "
    "os cliques, mas não o tempo de leitura. O segundo é a aprovação por inércia: a conferência da versão garante "
    "que o professor decidiu sobre o material que viu, e não que o leu. Se a revisão virar um clique sem leitura, o "
    "portão continua existindo no banco, mas deixa de ser uma validação."))

# ------------------------------------------------------------------ 4.11 limitacao k
P746 = achar("a aprovação do material pelo professor e as questões numéricas")
faz("4.11", d.trocar, P746, "existia em produção;",
    "existia em produção; a revisão pelo professor não cobre o diagnóstico do tópico, "
    "as respostas do Guardião, as falas do boss nem o texto das notificações, e o tempo que ela custa ao professor "
    "não foi medido;")

# ------------------------------------------------------------------ 4.12 conclusao
P757 = achar("A segunda contribuição é de engenharia.")
faz("4.12", d.inserir_apos, P757, "progresso e autorização para o banco.",
    " Pelo mesmo princípio, o professor continua responsável pelo que o aluno recebe: o material gerado só é "
    "entregue depois da aprovação dele, e essa regra está no banco, não apenas na interface.")

# ------------------------------------------------------------------ renumeracao: o novo Quadro 8 empurra 8..37
print("quadros (texto, legendas):", d.renumerar("Quadro", {n: n + 1 for n in range(8, 38)}, "LegendaQuadro"))

# ------------------------------------------------------------------ Apendice J: registro desta rodada
ult = [p for p in d.body.iter(X + "p") if T(p).strip() == "15 nov. 2026"]
tbl = d.linha_de(ult[-1]).getparent()
d.nova_linha(tbl.findall(X + "tr")[-1], [
    "15 nov. 2026",
    "Resumo, Abstract, seções 1.5, 1.6, 5.4, 5.7, 7.3, 7.4, 8.2 e 8.5 e capítulos 9 e 10, Apêndice J",
    "Destaque do papel do professor como validador do que a IA gera, a pedido da autora: quadro dos pontos de "
    "decisão, o que chega ao aluno sem passar por ele, revisão da nota dada pela IA e custos da validação; "
    "conferido nas migrações do banco",
])

if falhas:
    for f in falhas:
        print("FALHOU", f)
    raise SystemExit(1)
d.salvar(str(PASTA / "word" / "document.xml"))
print("ok")
