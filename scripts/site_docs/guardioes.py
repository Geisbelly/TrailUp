"""Página dos Guardiões: os sete guias do TrailUp, lidos do código na hora de gerar.

Cada número e cada texto desta página vem de um arquivo do repositório (cor, voz, assinatura
editorial, paleta, capacidades, missões, carregamento, Social, áudio e bosses). Se um arquivo
mudar de formato e o leitor deixar de achar os sete perfis, a geração para com erro em vez de
publicar uma página pela metade. As evidências vêm das descrições dos PRs do Lab e as capturas
estão em ``docs/tcc/guardioes/evidencias/``.
"""

from __future__ import annotations

import ast
import html
import re
import shutil
from pathlib import Path

ORDEM = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"]
NOME_EN = {p: p.capitalize() for p in ORDEM}
CHAVE_API = {**NOME_EN, "socializer": "Socialiser"}  # a API grafa "Socialiser"

# A forma da trilha não mora num mapa único: cada view escolhe a sua. O valor abaixo é o da
# Figura 2 do resumo "Da tipologia à trilha" e das capturas da PR #796.
FORMA_DA_TRILHA = {"seeker": "mapa", "conqueror": "mapa", "daredevil": "mapa",
                   "mastermind": "árvore", "survivor": "árvore", "socializer": "lista", "achiever": "lista"}

FONTES = {
    "config": "microservice/src/constants/brainHex.ts",
    "voz": "microservice/src/constants/guardianVoices.ts",
    "assinatura": "api/app/services/personalizacao.py",
    "paleta": "frontend/src/lib/personalizacao-theme-guide.ts",
    "capacidades": "mobile/src/utils/brainHexCapabilities.ts",
    "missoes": "mobile/src/components/missoes/variantesDoRastreador.ts",
    "carregamento": "mobile/src/utils/telaCarregamento.ts",
    "social": "mobile/src/services/social/socialDestaque.ts",
    "audio": "microservice/src/utils/audioJunction.ts",
    "bosses": "mobile/src/utils/contentBossVisual.ts",
}

RITMO = {"medio": "médio", "medio-lento": "médio-lento", "dinamico": "dinâmico"}
MOLDURA = {"circulo": "círculo", "placa": "placa com rebites", "hexagono": "hexágono"}
PROGRESSO = {"pontilhado": "pontilhado (pegadas)", "contorno": "contorno da moldura", "grosso": "anel grosso",
             "anel": "anel", "fino": "anel fino", "segmentos": "um segmento por missão"}


def _ler(raiz: Path, chave: str) -> str:
    return (raiz / FONTES[chave]).read_text(encoding="utf-8")


def _sete(nome: str, achados: dict) -> dict:
    faltam = [p for p in ORDEM if p not in achados]
    if faltam:
        raise SystemExit(f"guardioes: {FONTES.get(nome, nome)} mudou de formato; faltam {faltam}")
    return achados


def _dict_python(fonte: str, nome: str) -> dict:
    for no in ast.parse(fonte).body:
        if isinstance(no, ast.AnnAssign) and getattr(no.target, "id", None) == nome:
            return ast.literal_eval(no.value)
    raise SystemExit(f"guardioes: {nome} não encontrado em {FONTES['assinatura']}")


def ler_guardioes(raiz: Path) -> dict[str, dict]:
    cfg = _sete("config", {
        m[1]: {"cor": m[2], "rotulo": m[3], "guia": m[4], "descricao": m[5], "guia2": m[6]}
        for m in re.finditer(r'(\w+): \{\s*color: "(#\w+)",[\s\S]*?label: "([^"]+)",\s*guideName: "([^"]+)",'
                             r'[\s\S]*?description: "([^"]+)",(?:\s*secondaryGuideName: "([^"]+)",)?', _ler(raiz, "config"))
    })
    voz = _sete("voz", {
        m[1]: {"voz": m[2], "direcao": m[3], "voz2": m[4], "direcao2": m[5]}
        for m in re.finditer(r'(\w+): \{\s*voice: "(\w+)",\s*direction:\s*"([^"]+)",'
                             r'(?:\s*secondaryVoice: "(\w+)",\s*secondaryDirection:\s*"([^"]+)",)?', _ler(raiz, "voz"))
    })
    py = _ler(raiz, "assinatura")
    assin = _dict_python(py, "_BRAINHEX_EDITORIAL_SIGNATURES")
    persona = _dict_python(py, "_BRAINHEX_GUIDE_PERSONAS")
    paleta = _sete("paleta", {
        m[1].lower(): {"primary": m[2], "secondary": m[3], "accent": m[4], "background": m[5], "tom": m[6]}
        for m in re.finditer(r'perfil: "(\w+)",\s*palette: \{ primary: "(#\w+)", secondary: "(#\w+)", '
                             r'accent: "(#\w+)", background: "(#\w+)" \},\s*tom: "([^"]+)"', _ler(raiz, "paleta"))
    })
    cap = _ler(raiz, "capacidades")
    conjunto = lambda nome: set(re.findall(r'"(\w+)"', re.search(nome + r" = new Set<[^>]+>\(\[([^\]]*)\]", cap)[1]))
    cronometro, batalha = conjunto("TIMER_PROFILES"), conjunto("BATTLE_PROFILES")
    missoes = _sete("missoes", {
        m[1]: {"moldura": m[2], "emblema": m[3], "progresso": m[4], "titulo": m[5]}
        for m in re.finditer(r'(\w+): \{\s*moldura: "(\w+)",\s*emblema: "([^"]+)",\s*progresso: "(\w+)",'
                             r'[\s\S]*?tituloDaFolha: "([^"]+)"', _ler(raiz, "missoes"))
    })
    carreg = _sete("carregamento", {
        m[1]: {"modo": m[2], "ritmo": m[3], "frase": m[4]}
        for m in re.finditer(r'(\w+): \{\s*movimento: \{ modo: "(\w+)", ritmo: "([^"]+)"[\s\S]*?frases: \[\s*"([^"]+)"',
                             _ler(raiz, "carregamento"))
    })
    bloco_social = re.search(r"ICONE_DO_SOCIAL[^=]*= \{([\s\S]*?)\n\};", _ler(raiz, "social"))[1]
    social = _sete("social", {m[1]: (m[2], m[3]) for m in re.finditer(r'(\w+): \{ inativo: "([^"]+)", ativo: "([^"]+)" \}', bloco_social)})
    audio = _sete("audio", {
        m[1]: tuple(int(x.replace("_", "")) for x in m.groups()[1:])
        for m in re.finditer(r"(\w+): \{ targetChars: ([\d_]+), maxChars: ([\d_]+), minChars: ([\d_]+) \}", _ler(raiz, "audio"))
    })
    bosses = _sete("bosses", {m[1]: re.findall(r"boss-\d+", m[2])
                              for m in re.finditer(r"(\w+): \[([^\]]*)\]", _ler(raiz, "bosses").split("BOSSES_DO_PERFIL", 1)[1].split("};")[0])})
    saida = {}
    for p in ORDEM:
        a = assin[CHAVE_API[p]]
        saida[p] = {
            **cfg[p], **voz[p], "assinatura": a, "framing": persona[CHAVE_API[p]]["framing_narrativo"],
            "relacao2": persona[CHAVE_API[p]].get("guia_relacao_secundaria"),
            "paleta": paleta[p], "cronometro": p in cronometro, "batalha": p in batalha,
            "missoes": missoes[p], "carregamento": carreg[p], "social": social[p], "audio": audio[p],
            "bosses": bosses[p], "trilha": FORMA_DA_TRILHA[p],
        }
    return saida


# ---------------------------------------------------------------- evidências dos PRs

EVIDENCIAS = [
    {"pr": 953, "data": "04/11/2026", "titulo": "O Guardião responde em seções, com botão por parte e tutorial guiado",
     "visto": ["Seções com botão por tela; Ranking fechado não ganha botão (Conqueror adulto, 390×844 e tela larga)",
               "“Me mostre como” abre o tour na tela certa e termina em “Entendi”",
               "Gemini de verdade, dados fictícios: três perguntas devolveram seções com destino, duas com o tutorial certo",
               "pytest 3371 · mobile 1323 testes, 0 falhas"],
     "nao": ["Android e iOS", "11 dos 12 tutoriais percorridos em tela", "o fluxo inteiro com API e modelo reais"]},
    {"pr": 951, "data": "04/11/2026", "titulo": "Os 7 perfis conversam com o Guardião",
     "visto": ["Conqueror em tela larga: Amina aparece na Trilha e o chat abre",
               "No módulo com batalha, o botão do Guardião saiu de cima do cartão (tela larga e 390×844)"],
     "nao": ["Android e iOS", "Mastermind, Achiever, Survivor e Daredevil no módulo", "resposta do modelo para os perfis novos"]},
    {"pr": 944, "data": "04/11/2026", "titulo": "Os Guardiões conhecem o app e levam à tela certa",
     "visto": ["Seeker adulto: o painel responde e mostra os botões Loja e Coleta e acessos",
               "Social fechado: o botão do Social não aparece mesmo com o destino na resposta",
               "Menor de idade: campo travado em “Mentor de IA desligado (só para maiores de 18)” e nenhuma requisição sai",
               "Gemini, dados fictícios: função existente leva à tela certa; função inexistente responde que não encontrou"],
     "nao": ["Android e iOS", "tela estreita", "o subcaminho /aluno/ publicado"]},
    {"pr": 892, "data": "03/11/2026", "titulo": "O guia chama o aluno pelo primeiro nome de vez em quando",
     "visto": ["O nome não vai ao modelo: ele escreve {{nome}} e a API troca pelo primeiro nome",
               "O histórico volta pseudonimizado, então o modelo vê quando acabou de usar o nome"],
     "nao": ["com que frequência o Gemini passa a usar o nome"]},
    {"pr": 901, "data": "03/11/2026", "titulo": "Notificação fala com o aluno pelo nome, com o guia e no tom do perfil",
     "visto": ["Texto por tipo × perfil no banco, com {nome} e {guia} trocados por gatilho",
               "E2E no Postgres local: 8 casos, inclusive aluno sem nome e falha que não derruba a escrita"],
     "nao": ["paridade automática dos nomes dos guias com brainHex.ts (conferida à mão)"]},
    {"pr": 824, "data": "02/11/2026", "titulo": "Tela de carregamento por perfil, com variante neutra e movimento reduzido",
     "visto": ["Todo texto passa de 7:1 sobre o fundo e sobre o cartão nos 8 casos",
               "Matiz e saturação da cor-assinatura preservados: só a luminosidade sobe",
               "Em 320 px nada vaza, nem “Socializador · Mateo e Zuri”"],
     "nao": ["aparelho nativo", "“Reduzir movimento” ao vivo na web", "a transição na duração real, quadro a quadro"],
     "imagens": [("carregamento-neutro.jpg", "Neutra"), ("carregamento-seeker.jpg", "Explorador · Amara"),
                 ("carregamento-survivor.jpg", "Sobrevivente · Kenji"), ("carregamento-daredevil.jpg", "Aventureiro · Ember"),
                 ("carregamento-mastermind.jpg", "Estrategista · Idris"), ("carregamento-conqueror.jpg", "Conquistador · Amina"),
                 ("carregamento-socializer.jpg", "Socializador · Mateo e Zuri"), ("carregamento-achiever.jpg", "Realizador · Kwame"),
                 ("carregamento-conqueror-demora.jpg", "Aviso de demora, aos 10 s")]},
    {"pr": 873, "data": "02/11/2026", "titulo": "Base por perfil só para os perfis que a turma tem",
     "visto": ["22 casos em test_base_so_perfis_da_turma: principais e secundários, turma vazia, pedido explícito, falas do boss"],
     "nao": ["as consultas novas contra o banco real"]},
    {"pr": 828, "data": "02/11/2026", "titulo": "Ícone do Social por perfil, que troca ao tocar",
     "visto": ["Os 7 perfis na barra de baixo, fechado e aberto (360 pt)",
               "Lateral do desktop: Social bloqueado antes da turma, com contador depois"],
     "nao": ["em aparelho", "o número zerando ao abrir uma conversa de verdade"],
     "nota": "A captura é da versão desta PR. Os pares mudaram depois, com a usuária; os de hoje estão nas fichas acima, lidos do código.",
     "imagens": [("social-icones.png", "Social fechado e aberto, do Conqueror ao Mastermind")]},
    {"pr": 796, "data": "01/11/2026", "titulo": "Ícone de missões da Trilha com a cara de cada perfil",
     "visto": ["Os 7 perfis em 360×640 e 430×932, com a folha aberta",
               "variantesDoRastreador.test.ts falha se um emblema de missão aparecer fora das missões"],
     "nao": ["o ícone com uma conta real (as capturas usam dados de exemplo)"],
     "imagens": [("missoes-pequena.png", "Trilha dos 7 perfis em 360×640: mapa, árvore e lista"),
                 ("missoes-folhas.png", "A folha de missões com o título de cada perfil"),
                 ("missoes-icones.png", "O ícone de perto")]},
    {"pr": 791, "data": "01/11/2026", "titulo": "A aba de disputa segue o perfil: Arena para quem batalha, Eventos para os demais",
     "visto": ["No navegador: Achiever e Socializer veem “Eventos”; Conqueror vê “Arena”"], "nao": ["aparelho nativo"],
     "imagens": [("social-perfil-achiever-360.jpg", "Achiever: Eventos"), ("social-perfil-socializer-360.jpg", "Socializer: Conversa primeiro"),
                 ("social-tres-conqueror-360-arena.jpg", "Conqueror: Arena, com Amina")]},
    {"pr": 911, "data": "03/11/2026", "titulo": "Áudio juntado por bloco e por perfil, não só por tamanho",
     "visto": ["Medido no conteúdo 282: socializer e survivor tinham 8 blocos de texto e só 2 áudios",
               "microservice: 506 de 506 testes"],
     "nao": ["a contagem real de blocos do enriquecimento do conteúdo 282"]},
    {"pr": 767, "data": "01/11/2026", "titulo": "Voz de reserva na OpenAI quando o Gemini TTS recusa",
     "visto": ["Produção, só leitura: 7 de 7 áudios falharam (5 por cota 429, 2 por crédito 402)",
               "Com o código antigo, o teste reproduz os 30 s de espera e o 402; com a correção, 1 pedido à OpenAI e sem espera"],
     "nao": ["a geração da turma com a correção no ar"]},
    {"pr": 763, "data": "01/11/2026", "titulo": "Cada perfil ganha um nome de boss próprio",
     "visto": ["Produção, só leitura: conqueror e daredevil tinham o mesmo boss, “Sentinela das Partes Fracionadas”",
               "59 testes de boss_falas; a trava do tópico esperou 0,51 s num Postgres 16 local"],
     "nao": ["a qualidade das falas que o modelo gera com o prompt novo"]},
    {"pr": 751, "data": "01/11/2026", "titulo": "O boss segue a paleta do perfil do aluno",
     "visto": ["O teste decodifica cada PNG de boss e confere o matiz contra a cor oficial (tolerância de 25°)",
               "Teste de mutação: pôr o boss-29 no Conqueror faz o teste falhar"],
     "nao": ["no app logado, com um aluno de cada perfil"]},
    {"pr": 661, "data": "28/10/2026", "titulo": "Rosto do Guardião no “Você parou aqui”",
     "visto": ["Num Samsung de verdade, com o perfil Estrategista: o rosto do Idris aparece no balão da árvore",
               "Duas formas de recorte falharam no Android antes da terceira"],
     "nao": ["a linha da lista, vista em tela"]},
]


# Capturas largas (os 7 perfis lado a lado) ocupam a linha inteira da galeria.
LARGAS = {"missoes-pequena.png", "missoes-folhas.png", "missoes-icones.png", "social-icones.png"}


# ---------------------------------------------------------------- HTML

def _e(t: str | None) -> str:
    return html.escape(t or "")


def _sim(v: bool) -> str:
    return '<span class="chip ok">sim</span>' if v else '<span class="chip flat">não</span>'


def copiar_midia(raiz: Path, saida: Path) -> None:
    destino = saida / "midia" / "guardioes"
    destino.mkdir(parents=True, exist_ok=True)
    for p in ORDEM:
        shutil.copy(raiz / f"frontend/src/assets/guardioes/{p}.webp", destino / f"{p}.webp")
        shutil.copy(raiz / f"frontend/src/assets/design/guide-world-{p}.webp", destino / f"mundo-{p}.webp")
        shutil.copy(raiz / f"frontend/src/assets/design/emblem-{p}.png", destino / f"emblema-{p}.png")
    evid = saida / "midia" / "evidencias"
    evid.mkdir(parents=True, exist_ok=True)
    for f in (raiz / "docs/tcc/guardioes/evidencias").iterdir():
        shutil.copy(f, evid / f.name)


def _nome_guia(g: dict) -> str:
    return g["guia"] + (f" e {g['guia2']}" if g["guia2"] else "")


def _ancora(p: str, g: dict) -> str:
    return f"{g['guia'].lower()}-{p}"


def _cartao(p: str, g: dict) -> str:
    chips = (f'<span class="chip flat">trilha em {g["trilha"]}</span>'
             + ('<span class="chip flat">batalha</span>' if g["batalha"] else "")
             + ('<span class="chip flat">cronômetro</span>' if g["cronometro"] else ""))
    return (
        f'<a class="guardiao" href="#{_ancora(p, g)}" style="--c:var(--{p})">'
        f'<div class="cena" style="background-image:url(\'midia/guardioes/mundo-{p}.webp\')">'
        f'<img class="retrato" src="midia/guardioes/{p}.webp" alt="{_e(_nome_guia(g))}, guia do perfil {_e(g["rotulo"])}" loading="lazy">'
        f'<img class="emblema" src="midia/guardioes/emblema-{p}.png" alt="" loading="lazy"></div>'
        f'<div class="corpo"><span class="pt">{_e(g["rotulo"])} · {NOME_EN[p]}</span>'
        f'<span class="n">{_e(_nome_guia(g))}</span><p>{_e(g["descricao"])}</p>'
        f'<span class="framing">{_e(g["framing"])}</span><div class="chips">{chips}</div></div></a>'
    )


def _swatch(nome: str, cor: str) -> str:
    return f'<div class="sw"><span class="amostra" style="background:{cor}"></span><span class="k">{nome}</span><code>{cor.upper()}</code></div>'


def _ficha(p: str, g: dict) -> str:
    a, m, c, s = g["assinatura"], g["missoes"], g["carregamento"], g["social"]
    alvo, teto, minimo = g["audio"]
    fmt = lambda n: f"{n:,}".replace(",", ".")
    voz = f'<code>{_e(g["voz"])}</code>, Gemini TTS. {_e(g["direcao"])}'
    if g["voz2"]:
        voz += f'<br><b>{_e(g["guia2"])}:</b> <code>{_e(g["voz2"])}</code>. {_e(g["direcao2"])}'
    linhas = [
        ("Perfil", f"{_e(g['rotulo'])} ({NOME_EN[p]}). {_e(g['descricao'])}"),
        ("Enquadramento narrativo", _e(g["framing"])),
        ("Voz", voz),
    ]
    if g["relacao2"]:
        linhas.append(("Dupla", f"{_e(g['guia2'])} é {_e(g['relacao2'])}. O áudio do material vira diálogo em duas vozes."))
    linhas += [
        ("Trilha", f"desenhada em <b>{g['trilha']}</b>"),
        ("Mecânicas", f"chat com o Guardião {_sim(True)} cronômetro {_sim(g['cronometro'])} batalha com boss {_sim(g['batalha'])}"),
        ("Missões", (f"folha “{_e(m['titulo'].replace('{guia}', _nome_guia(g)))}”; moldura {MOLDURA.get(m['moldura'], m['moldura'])}, "
                     f"emblema <code>{_e(m['emblema'])}</code>, progresso em {PROGRESSO.get(m['progresso'], m['progresso'])}")),
        ("Tela de carregamento", f"marcos no modo <b>{_e(c['modo'])}</b>, ritmo {RITMO.get(c['ritmo'], c['ritmo'])}: “{_e(c['frase'])}”"),
        ("Ícone do Social", f"<code>{_e(s[0])}</code> fechado → <code>{_e(s[1])}</code> aberto"),
        ("Áudio por bloco", f"alvo {fmt(alvo)}, teto {fmt(teto)} e mínimo {fmt(minimo)} caracteres por áudio"),
        ("Bosses", (", ".join(f"<code>{b}</code>" for b in g["bosses"]) + " (variantes na cor do perfil)") if g["batalha"]
         else "sem batalha no app; a aba de disputa abre em Eventos"),
    ]
    tabela = "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in linhas)
    marcadores = "".join(f'<span class="chip flat">{_e(x)}</span>' for x in a["marcadores_linguisticos"])
    proib = "".join(f'<span class="chip warn">{_e(x)}</span>' for x in a["proibicoes_estilo"])
    assin = [
        ("Tom de voz", a["tom_voz"]), ("Ritmo", RITMO.get(a["ritmo"], a["ritmo"])), ("Abertura", a["abertura_estilo"]),
        ("Convencimento", a["convencimento_estilo"]), ("Progressão", a["progressao_narrativa"]), ("Fechamento", a["fechamento_estilo"]),
    ]
    assin_html = "".join(f"<tr><th>{k}</th><td>{_e(v)}</td></tr>" for k, v in assin)
    pal = g["paleta"]
    return (
        f'<h2 id="{_ancora(p, g)}">{_e(_nome_guia(g))} · {_e(g["rotulo"])}</h2>'
        f'<div class="ficha-guardiao" style="--c:var(--{p})">'
        f'<img class="retrato" src="midia/guardioes/{p}.webp" alt="{_e(_nome_guia(g))}" loading="lazy">'
        f'<div class="tabela"><table class="spec"><tbody>{tabela}</tbody></table></div></div>'
        f'<h3>Assinatura editorial</h3><div class="tabela"><table class="spec"><tbody>{assin_html}'
        f'<tr><th>Marcadores</th><td><div class="chips">{marcadores}</div></td></tr>'
        f'<tr><th>Proibições</th><td><div class="chips">{proib}</div></td></tr></tbody></table></div>'
        f'<h3>Tokens de cor</h3><div class="swatches">{_swatch("assinatura", g["cor"])}'
        f'{_swatch("primary", pal["primary"])}{_swatch("secondary", pal["secondary"])}{_swatch("accent", pal["accent"])}'
        f'{_swatch("background", pal["background"])}</div>'
        f'<p class="fine">Tom no console: {_e(pal["tom"])}.</p>'
    )


def _evidencias(base_midia: str) -> str:
    partes = []
    for ev in EVIDENCIAS:
        visto = "".join(f"<li>{_e(x)}</li>" for x in ev["visto"])
        nao = "".join(f"<li>{_e(x)}</li>" for x in ev.get("nao", []))
        imgs = ""
        if ev.get("imagens"):
            imgs = '<div class="galeria">' + "".join(
                f'<a class="{"larga" if f in LARGAS else ""}" href="{base_midia}{f}" target="_blank" rel="noopener"><img src="{base_midia}{f}" alt="{_e(leg)}" loading="lazy">'
                f"<span>{_e(leg)}</span></a>" for f, leg in ev["imagens"]) + "</div>"
        nota = f'<p class="fine">{_e(ev["nota"])}</p>' if ev.get("nota") else ""
        partes.append(
            f'<div class="evidencia"><div class="cab"><span class="pr">#{ev["pr"]}</span><span class="data">{ev["data"]}</span>'
            f'<b>{_e(ev["titulo"])}</b></div><div class="colunas"><div><div class="eyebrow">Verificado</div><ul>{visto}</ul></div>'
            f'<div><div class="eyebrow">Não verificado</div><ul>{nao}</ul></div></div>{nota}{imgs}</div>'
        )
    return "".join(partes)


def corpo_guardioes(raiz: Path) -> tuple[str, list[tuple[str, str]], int]:
    gs = ler_guardioes(raiz)
    cartoes = "".join(_cartao(p, g) for p, g in gs.items())
    fichas = "".join(_ficha(p, g) for p, g in gs.items())
    tokens = "".join(
        f'<tr><td><span class="dot" style="background:{g["cor"]}"></span> {_e(_nome_guia(g))} · {NOME_EN[p]}</td>'
        + "".join(f'<td><code>{g["paleta"][k].upper()}</code></td>' for k in ("primary", "secondary", "accent", "background"))
        + "</tr>" for p, g in gs.items()
    )
    fontes = "".join(f"<li><code>{_e(f)}</code></li>" for f in FONTES.values())
    corpo = (
        "<p>Cada perfil BrainHex tem um Guardião: o personagem que guia o aluno pela trilha, narra o material, "
        "conversa no chat e assina as notificações. A ficha de cada um é lida do código na hora de gerar esta página, "
        "e a última seção reúne o que os PRs verificaram, com as capturas.</p>"
        f'<div class="guardioes">{cartoes}</div>'
        '<h2 id="especificacao-de-uso">Especificação de uso</h2>'
        "<h3>Qual Guardião o aluno vê</h3><ul>"
        "<li>O do <b>perfil que o app mostra</b>: o <code>perfil_ativo</code> quando ele é representativo; senão, o de maior afinidade.</li>"
        "<li>A <b>base do material</b> é gerada só para os perfis que a turma tem como principal ou secundário (#873). "
        "Aluno sem perfil gravado conta como Estrategista, e o Idris o acompanha.</li></ul>"
        "<h3>Onde ele aparece</h3><div class=\"tabela\"><table><thead><tr><th>Lugar</th><th>O que o Guardião faz</th><th>Regra</th></tr></thead><tbody>"
        "<tr><td>Trilha</td><td>Rosto no balão “Você parou aqui”; botão do guia com o tutorial da tela</td><td>Rosto recortado pelo próprio <code>Image</code>, sem <code>overflow</code> (#661)</td></tr>"
        "<tr><td>Material em áudio</td><td>Narra o texto do tópico com a voz e a direção da ficha; Mateo e Zuri conversam</td><td>Sem caricatura de sotaque; se o Gemini TTS recusar, a voz de reserva da OpenAI segue o gênero do Guardião e o diálogo vira voz única (#767)</td></tr>"
        "<tr><td>Chat</td><td>Responde em seções, com um botão por tela e o tutorial “Me mostre como”</td><td>Só para maiores de 18 anos confirmados; menor vê o campo travado e a API recusa com 403. Destinos e tutoriais são catálogos fechados (#944, #951, #953)</td></tr>"
        "<tr><td>Notificações</td><td>Assina avisos e rotinas com <code>{guia}</code> e chama o aluno por <code>{nome}</code></td><td>O nome nunca vai ao modelo: a IA escreve o marcador e o banco ou a API o trocam (#892, #901)</td></tr>"
        "<tr><td>Carregamento</td><td>Frase na voz do guia e marcos no ritmo da assinatura</td><td>Texto acima de 7:1; nada se move com “Reduzir movimento” (#824)</td></tr>"
        "<tr><td>Missões</td><td>A folha ganha o título do perfil</td><td>Lugar e tamanho fixos; só a pele muda (#796)</td></tr>"
        "<tr><td>Batalha</td><td>O boss do tópico fala no tom do perfil</td><td>Só Survivor, Daredevil e Conqueror batalham; nome do boss único por perfil (#763)</td></tr>"
        "</tbody></table></div>"
        "<h3>Regras que valem para todos</h3><ul>"
        "<li><b>Contraste por luminosidade.</b> A cor-assinatura sobe de luminosidade HSL até passar no contraste, sem misturar com branco, "
        "para não desbotar o perfil. Cores de estado (sucesso, alerta, informação) são fixas.</li>"
        "<li><b>Um ícone, um significado.</b> Emblema de missão, ícone do Social e ícone da Trilha não se repetem dentro do mesmo perfil, "
        "e nenhum tem outro dono no app. Os testes conferem.</li>"
        "<li><b>A resposta passa por um juiz.</b> O chat confere se a resposta se apoia no tópico e no guia do app; "
        "quando reprova, entra a resposta de reserva.</li>"
        "<li><b>Personalização é hipótese.</b> Casar Guardião, tom e formato com o perfil não tem ganho de aprendizagem demonstrado. "
        "O resumo “Da tipologia à trilha” mede só a aderência do texto à assinatura.</li></ul>"
        '<h2 id="tokens">Tokens</h2>'
        "<h3>Tokens de cor</h3>"
        "<p>A paleta que o console envia ao gerador. <code>primary</code> é a cor-assinatura, <code>secondary</code> é ela escurecida, "
        "<code>accent</code> é ela clareada e <code>background</code> é ela quase preta. O app e o backend derivam a variante de contraste na hora; "
        "não assuma que mudar um arquivo muda os outros.</p>"
        '<div class="tabela"><table><thead><tr><th>Guardião</th><th>primary</th><th>secondary</th><th>accent</th><th>background</th></tr></thead>'
        f"<tbody>{tokens}</tbody></table></div>"
        "<h3>Custo em tokens</h3>"
        "<p>Projeção do resumo “IA onde importa” (preços de 3 e 4/11/2026), não medição:</p><ul>"
        "<li><b>Um material-base</b> (texto e áudio de um tópico para um perfil): cerca de 38 mil tokens de entrada e 31,2 mil de saída no Gemini 3.6 Flash, "
        "mais 350 de entrada e 2.336 de saída no TTS, com 50% de folga para novas tentativas. Dá US$ 0,254, cerca de R$ 1,39.</li>"
        "<li><b>Cada mensagem no chat</b> leva o guia do app inteiro, cerca de 8 mil caracteres a mais, na resposta e no juiz (#944).</li>"
        "<li><b>Chamadas do TTS</b>: o preço é por caractere, mas o limite do plano gratuito é por pedido. Por isso o áudio é juntado por bloco, "
        "com o tamanho de cada perfil na ficha (#911).</li></ul>"
        '<h2 id="evidencias-nos-prs">Evidências nos PRs</h2>'
        "<p>O que cada PR afirmou ter visto e o que deixou de fora, nas palavras da própria descrição. Os números são do repositório canônico, "
        "que é privado; as capturas foram copiadas para cá.</p>"
        + _evidencias("midia/evidencias/")
        + '<h2 id="fontes">Fontes</h2><p>Os dados das fichas vêm destes arquivos, lidos na geração:</p>'
        f'<ul class="fontes">{fontes}</ul>'
        "<p>A forma da trilha (mapa, árvore ou lista) é escolhida por view, sem um mapa único no código. "
        "Ela vem da Figura 2 do resumo “Da tipologia à trilha” e das capturas da #796.</p>"
    )
    toc = [(_ancora(p, g), f"{_nome_guia(g)} · {NOME_EN[p]}") for p, g in gs.items()]
    toc += [("especificacao-de-uso", "Especificação de uso"), ("tokens", "Tokens"), ("evidencias-nos-prs", "Evidências nos PRs"), ("fontes", "Fontes")]
    return corpo.replace('<h2 id="especificacao-de-uso">', fichas + '<h2 id="especificacao-de-uso">', 1), toc, len(EVIDENCIAS)
