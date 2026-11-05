"""Página de gamificação e personalização: desenho, paleta, biblioteca de elementos e evidências.

Três fontes, e a página diz qual é qual:

- **Código:** paleta, guias e capacidades vêm de ``guardioes.ler_guardioes``; as artes vêm do app e são
  conferidas contra o catálogo. Se faltar arte de moldura, a geração para em vez de publicar buraco.
- **Catálogo medido:** ``docs/tcc/gamificacao/catalogo-2026-11-05.json``, retrato de produção com data.
- **Descrições dos PRs do Lab:** as evidências repetem o que cada PR afirmou ter visto e o que deixou
  de fora. O Lab é privado, então os PRs são citados por número, sem link, e as capturas foram copiadas
  para ``docs/tcc/gamificacao/evidencias/`` depois de conferidas: só dados simulados, sem nome de aluno.
"""

from __future__ import annotations

import html
import json
import shutil
from pathlib import Path

import guardioes

ORDEM = guardioes.ORDEM
PASTA = "docs/tcc/gamificacao"
CATALOGO = f"{PASTA}/catalogo-2026-11-05.json"
MOLDURAS = "mobile/src/assets/design/molduras"

FONTES = {
    "guardioes": "scripts/site_docs/guardioes.py",
    "catalogo": CATALOGO,
    "molduras": "mobile/src/constants/molduras.ts",
    "icones": "mobile/src/constants/profileUtilityIcons.ts",
    "capacidades": "mobile/src/utils/brainHexCapabilities.ts",
    "tema": "mobile/src/utils/profileShellPalette.ts",
    "console": "frontend/src/styles/console-theme.css",
    "desafios": "api/alembic/versions/20261105_24_molduras_tarefas_dificeis.py",
}

# Arquivo da arte, rótulo e chave em profileUtilityIcons. Ordem de leitura: economia, progresso, navegação.
UTILIDADES = [
    ("coin", "Moeda", "coin"), ("store", "Loja", "store"), ("bag", "Mochila", "bag"), ("deadline", "Prazo", "deadline"),
    ("retry", "Nova tentativa", "retry"), ("hint", "Dica", "hint"), ("book", "Livro", "book"), ("medal", "Medalha", "medal"),
    ("achievement-icon", "Conquista", "achievements"), ("achievements", "Ranking", "ranking"), ("social", "Social", "social"),
    ("notifications", "Avisos", "notifications"), ("settings", "Ajustes", "settings"),
]
OBJETOS = {
    "Economia": [("coin", "Moeda"), ("chest", "Baú"), ("bag", "Mochila")],
    "Pódio": [("gold", "Ouro"), ("silver", "Prata"), ("bronze", "Bronze"), ("trophy", "Troféu")],
    "Tempo e tentativa": [("deadline", "Prazo"), ("calendar", "Calendário"), ("retry", "Nova tentativa"), ("hint", "Dica")],
    "Percurso": [("map", "Mapa"), ("compass", "Bússola"), ("steps", "Passos"), ("completion", "Conclusão"), ("book", "Livro")],
    "Sinais": [("bell", "Sino"), ("bolt", "Raio"), ("community", "Comunidade")],
}
ORIGEM = {
    "loja": ("Compradas na loja", "Só com moedas, de 20 a 40. Comprar não muda XP nem posição."),
    "conquista": ("Ganhas por desafio", "Cada uma exige uma missão difícil e diferente das outras (#1011)."),
    "acao": ("Ganhas por uma ação", "Duas ações continuam valendo por decisão de produto (#1011)."),
}

# (tema, PRs, regra). Só o que o código ou uma descrição de PR sustenta.
MECANICAS = [
    ("XP e faixas", "#814, #916, #1008",
     "O XP sai de <code>eventos_aluno</code>, por turma. Dez faixas com título e barra até a próxima, lidas da tabela <code>xp_faixa</code>. "
     "Duelo contra adversário fica fora do XP, para recusar uma batalha não custar posição. Concluir conteúdo credita pelo banco, mesmo com a API fora do ar."),
    ("Conquistas", "#160, #514, #1011",
     "O banco avalia por métrica declarada no critério. Conquista de professor vale para a turma dele. Conquista de moldura não dá ponto: "
     "o prêmio é a moldura, e pontos mexeriam no ranking."),
    ("Moedas e loja", "#196, #198, #368",
     "Saldo é a soma de um livro-caixa (<code>moedas_ledger</code>), nunca uma coluna, e o cliente não fabrica moeda. Gastar não muda XP nem posição."),
    ("Molduras", "#895, #897, #1011",
     "Cosmético puro: 20 na loja, 18 por desafio, 2 por ação. Ninguém ganha vantagem por usar uma moldura."),
    ("Missões", "#180, #793, #796, #991",
     "O rastreador flutuante da Trilha leva ao que falta fazer pelo botão “Ir”. Lugar e tamanho são fixos; só a pele muda por perfil. "
     "Na missão de guilda, o alvo vale por membro, para o esforço individual ser o mesmo."),
    ("Ranking", "#162, #636",
     "O corte é de dados, não de tela: o aluno recebe o topo (parâmetro <code>rank_limite_visivel</code>, hoje 15) e a própria linha. "
     "O motivo está no estudo citado no PR: manter a disputa sem envergonhar quem está embaixo."),
    ("Eventos", "#495, #920, #923, #930",
     "Abrem e encerram pelo banco, no horário. O rank do evento é opcional: entrar ou sair não muda nota nem XP, e o texto na tela diz isso. Duelo no evento só entre inscritos."),
    ("Guildas", "#197, #541, #991, #1009",
     "Por turma, com convite, entrada e saída. O painel técnico compara o XP por atividade de quem está em guilda com o de quem não está, e não conclui nada com poucos alunos."),
    ("Arena e ranqueada", "#512, #792, #916, #995",
     "Lobby em dois passos: modo e depois regra e adversário. Sempre 5 questões, uma tentativa cada. O resumo do professor mostra vitórias e empates, sem coluna de derrota."),
    ("Boss", "#224, #763, #957",
     "Só Survivor, Daredevil e Conqueror batalham. O modelo escreve nome e falas por perfil; sem linha gerada, valem as falas fixas do app. "
     "Trocar o nome não zera o estado salvo da batalha."),
]

PERSONALIZACAO = [
    ("Base por perfil", "Texto, áudio e apresentação por tópico e perfil, reaproveitados entre alunos do mesmo perfil. É o que o microservice gera.", "#873, #911, #863"),
    ("Adequação por aluno", "Camada leve sobre a base, com preferências, emoção, estado mental e necessidades do grupo. Não regera mídia pesada por aluno.", "#47, #53, #804"),
    ("História da turma", "O professor escreve o arco narrativo no console. O arco diz onde e por quê; a assinatura do perfil diz como.", "#843"),
    ("Pele da interface", "Cor, emblema, moldura, arena, forma da trilha e título das folhas seguem o perfil. Lugar e tamanho dos controles não mudam.", "#796, #828, #930"),
    ("Capacidades", "Cronômetro e batalha só para alguns perfis. Todos conversam com o Guardião, mas só maiores de 18 anos confirmados têm a IA liberada.", "#951, #933"),
    ("Ordem aconselhada", "O motor sugere a ordem do material e registra cada decisão. É conselho: nada fica bloqueado por causa dela.", "#804"),
]

NAO_AFIRMA = [
    "<b>Não há resultado educacional.</b> São 7 alunos em produção, sem coorte nem comparação. Nada aqui mostra que a gamificação ou o perfil melhora a aprendizagem.",
    "<b>Casar conteúdo com perfil é hipótese.</b> Gerar todos os formatos é acesso e escolha, não “estilo de aprendizagem” (#710).",
    "<b>Eventos e guildas têm 0 linhas em produção</b> (05/11/2026). As telas e regras foram testadas com dados simulados e em banco local, sem uso real.",
    "<b>O questionário BrainHex é autoral</b>, sem validação local.",
    "<b>Desafios de precisão dependem do app novo.</b> Eles leem <code>atividade_tentativas</code>, vazia em 05/11. O percentual ainda sai do aparelho, então a conquista é cosmética de propósito.",
    "<b>“Vencer boss” não existe como desafio:</b> o banco guarda as falas, não o resultado da batalha.",
]

EVIDENCIAS = [
    ("Progressão", [
        {"pr": 814, "data": "02/11/2026", "titulo": "Faixas de XP com título e barra até a próxima",
         "visto": ["9 testes de estrutura e 9 em Postgres local: piso exato sobe de faixa, última faixa não tem próxima, XP negativo conta como 0",
                   "Em 320 e 360 px, sem rolagem lateral nem texto cortado",
                   "Prévia com dados de exemplo nas paletas Conqueror, Seeker, Achiever e Socializer"],
         "nao": ["Conta real: a migration ainda não tinha sido aplicada quando o PR foi escrito"],
         "imagens": [("xp-faixa.png", "Cartão da faixa nas paletas Conqueror, Seeker e Achiever")]},
        {"pr": 916, "data": "04/11/2026", "titulo": "Duelo contra adversário sai do XP",
         "visto": ["11 testes em Postgres local, com duelo e cooperativo lado a lado nas cinco contas de XP",
                   "Mutação: quebrar a marca, cada conta ou o piso derruba o teste correspondente",
                   "Upgrade, downgrade e novo upgrade sobre dado existente"],
         "nao": ["Produção não foi consultada: quantos pontos de duelo existiam", "A cadeia inteira do Alembic rodando do zero"]},
    ]),
    ("Conquistas e molduras", [
        {"pr": 160, "data": "09/09/2026", "titulo": "21 das 27 conquistas nunca destravavam",
         "visto": ["Medido em produção antes da correção: 6 avaliadas, 21 ignoradas em silêncio, 0 concessões de conquista de perfil",
                   "As que destravavam não pagavam: o rank soma eventos, e o gatilho não os gravava"],
         "nao": ["A migração não foi aplicada no PR; a decisão ficou para quem revisou"]},
        {"pr": 1011, "data": "05/11/2026", "titulo": "Molduras saem por desafios difíceis",
         "visto": ["84 testes em Postgres local entre molduras, paridade, XP e diagnóstico, cobrindo as 18 missões e os atalhos que cada uma recusa",
                   "Em produção, só leitura: cada trecho alterado aparece exatamente uma vez"],
         "nao": ["O fluxo completo a partir de um evento real"],
         "nota": "A dona do projeto recusou a primeira proposta, que só aumentava a quantidade: as missões tinham de ser diferentes."},
    ]),
    ("Economia", [
        {"pr": 196, "data": "15/09/2026", "titulo": "O aluno acumula moeda ao estudar",
         "visto": ["24 testes sobre o SQL gerado pela migração", "Saldo como soma do livro-caixa, para auditar a origem de cada moeda"],
         "nao": ["Uma suíte inteira verde: 36 falhas iguais às da main, por dependência ausente no ambiente local"]},
    ]),
    ("Missões", [
        {"pr": 793, "data": "01/11/2026", "titulo": "Missões na Trilha, com “Ir” até o que falta fazer",
         "visto": ["1.107 testes do app, sem falha", "Testes novos do critério da próxima missão, do destino do “Ir”, do prazo e da recompensa"],
         "nao": ["A descrição do PR não registra teste em aparelho nativo"]},
        {"pr": 991, "data": "05/11/2026", "titulo": "Na missão de guilda, o alvo vale por membro",
         "visto": ["5 testes em Postgres 17 local: com 3 membros o alvo é 6, com 3 atividades fica em 50% e sem prêmio, com 6 paga os 3",
                   "Missão antiga continua com o alvo da guilda inteira"],
         "nao": ["Quantas missões de guilda estavam abertas em produção: o banco não respondeu da máquina"]},
    ]),
    ("Ranking e eventos", [
        {"pr": 162, "data": "09/09/2026", "titulo": "Ranking mostra o topo e a própria posição",
         "visto": ["O corte vale na view, então nome e pontuação dos demais não chegam ao aparelho", "O professor continua vendo a turma inteira"],
         "nao": ["A descrição não traz medição com alunos: a justificativa vem da literatura citada no PR"]},
        {"pr": 930, "data": "04/11/2026", "titulo": "Rank do evento no desenho do TrailUp, com ênfase por perfil",
         "visto": ["1.310 testes do app, 0 falhas", "A ênfase dos 7 perfis e as frases dentro e fora do rank",
                   "No Expo web, “Entrar no rank” troca o cartão para posição, frase e vizinhança"],
         "nao": ["O banco real e o aparelho"],
         "imagens": [("evento-conqueror.jpg", "Conqueror: a frase fala de quem está à frente (nomes simulados)"),
                     ("evento-socializer.jpg", "Socializer: a frase fala de quem entrou (nomes simulados)")],
         "nota": "A mesma tela com ênfases diferentes: o Conqueror vê a distância até o próximo, e o Socializer vê os colegas."},
    ]),
    ("Arena e boss", [
        {"pr": 792, "data": "01/11/2026", "titulo": "Arena em fluxo de lobby",
         "visto": ["No navegador, logado: abrir o lobby, escolher e trocar o modo, sortear o adversário e liberar “Começar”", "Guilda x guilda desabilitado para quem não tem guilda"],
         "nao": ["O envio do convite pelo lobby", "Guilda x guilda com guilda de verdade", "Aparelho nativo"],
         "imagens": [("arena-1.jpg", "Escolha do modo, com o motivo de Guilda x guilda estar apagado")]},
        {"pr": 763, "data": "01/11/2026", "titulo": "Cada perfil ganha um nome de boss próprio",
         "visto": ["Medido em produção: 3 linhas com nomes iguais ou quase iguais e falas trocáveis entre perfis", "59 testes, incluindo o caso exato de produção e o limite de 60 caracteres"],
         "nao": ["A qualidade das falas que o modelo gera com o prompt novo: não havia chave do modelo na máquina"]},
    ]),
    ("Personalização", [
        {"pr": 804, "data": "02/11/2026", "titulo": "A recomendação cruza o conteúdo com o aluno",
         "visto": ["Medido em produção antes: 1 sugestão desde 25/08 e 0 revisões", "11 testes em Postgres local, com RLS lida como aluno e downgrade"],
         "nao": ["O app rodando, só testes", "A chamada real ao modelo para a demanda"]},
        {"pr": 843, "data": "02/11/2026", "titulo": "Arco narrativo da turma escrito pelo professor",
         "visto": ["Editar o arco enfileira a regeração da turma, e falha na fila não desfaz o que o professor salvou", "O teste pegou 35 alvos em vez de 28 numa fusão, e o gatilho novo passou a deduplicar"],
         "nao": ["A migration não estava aplicada em produção quando o PR foi escrito"]},
        {"pr": 917, "data": "04/11/2026", "titulo": "Exemplo na paleta do perfil, e slide dividido em vez de rolar",
         "visto": ["Playwright em 7 tamanhos, de 360×640 a 1920×1080: nenhuma página rola", "O exemplo visual usa os tokens do perfil"],
         "nao": ["Celular deitado: um bloco muito alto ainda rola de 11 a 60 px, como reserva para não cortar nada"]},
        {"pr": 710, "data": "30/10/2026", "titulo": "Personalização por perfil não é “estilo de aprendizagem”",
         "visto": ["Só texto: a documentação e os comentários deixam de usar estilos de aprendizagem como motivo"],
         "nao": ["Não muda comportamento, nem mede efeito"]},
    ]),
    ("Telas de referência", [
        {"pr": 839, "data": "02/11/2026", "titulo": "Mapa da Trilha larga cabe na coluna",
         "visto": ["1.279 testes do app, sem falha, com testes novos de quadro estreito e de 1280×720", "Capturas em 1024, 1280 e 1440 px com dados marcados como MOCK"],
         "nao": ["A árvore, a lista e o mapa do celular: só a vista de mapa em tela larga muda"],
         "imagens": [("mapa-web.jpg", "Mapa da jornada na web, perfil Conqueror (dados simulados)")]},
        {"pr": 790, "data": "01/11/2026", "titulo": "Rank sem classificação mostra um cartão no estilo do TrailUp",
         "visto": ["1.098 testes do app, com contraste de pelo menos 7:1 no texto nos 7 perfis", "Capturas no Expo web, com dados fictícios numa rota de prévia"],
         "nao": ["Android e iOS nativos", "A tela com dados reais, logado"],
         "imagens": [("rank-vazio.jpg", "Ranking vazio do Achiever, com arte do perfil e saída para a Trilha")]},
        {"pr": 782, "data": "01/11/2026", "titulo": "Perfil abre em Métricas e Conquistas, Loja ao lado da Bag",
         "visto": ["No navegador, com conta de teste e tela de celular: a Loja abre pelo topo e o Sair fica no fim", "1.056 testes do app"],
         "nao": ["Metas, Mistério e Squad, um a um"],
         "imagens": [("loja.jpg", "Loja com saldo e a frase de que gastar não muda XP nem ranking")]},
        {"pr": 785, "data": "01/11/2026", "titulo": "Métricas no padrão do TrailUp",
         "visto": ["No navegador, com conta de teste, em 360×640 e 430×932: estilos Painel Analítico e Arena Tática"],
         "nao": ["Android e iOS nativos", "Metas, Mistério e Squad, um a um"],
         "imagens": [("metricas-arena.jpg", "Métricas da Arena Tática, com conta de demonstração")]},
    ]),
]
LARGAS = {"evento-conqueror.jpg", "evento-socializer.jpg", "rank-vazio.jpg", "mapa-web.jpg"}


def _e(t: str | None) -> str:
    return html.escape(t or "")


def carregar_catalogo(raiz: Path) -> dict:
    cat = json.loads((raiz / CATALOGO).read_text(encoding="utf-8"))
    por_codigo = {m["codigo"] for m in cat["molduras"]}
    faltam = [c for c in por_codigo if not (raiz / MOLDURAS / f"{c}.webp").exists()]
    orfas = [c["nome"] for c in cat["conquistas"] if c.get("moldura") and c["moldura"] not in por_codigo]
    if faltam or orfas or len(cat["faixas"]) != 10 or len(cat["molduras"]) != 40:
        raise SystemExit(f"gamificacao: catálogo não bate com o app; artes faltando {faltam}, conquistas órfãs {orfas}")
    return cat


def copiar_midia(raiz: Path, saida: Path) -> None:
    destino = saida / "midia" / "gamificacao"
    for sub in ("biblioteca", "evidencias"):
        alvo = destino / sub
        if alvo.exists():
            shutil.rmtree(alvo)
        shutil.copytree(raiz / PASTA / sub, alvo)
    mold = destino / "biblioteca" / "molduras"
    mold.mkdir(parents=True, exist_ok=True)
    for f in (raiz / MOLDURAS).glob("*.webp"):
        shutil.copy(f, mold / f.name)


def _lum(hexa: str) -> float:
    canais = [int(hexa.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    r, g, b = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in canais]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a: str, b: str) -> float:
    x, y = sorted((_lum(a), _lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def _num(v: float) -> str:
    return f"{v:.1f}".replace(".", ",")


def _amostra(cor: str, nome: str) -> str:
    return f'<span class="amostra"><i style="background:{cor}"></i><b>{nome}</b><code>{cor.upper()}</code></span>'


def _paleta(gs: dict) -> str:
    linhas = []
    for p, g in gs.items():
        pal = g["paleta"]
        amostras = "".join(_amostra(pal[k], k) for k in ("primary", "secondary", "accent", "background"))
        linhas.append(
            f'<div class="paleta" style="--c:{pal["accent"]};--f:{pal["background"]}">'
            f'<div class="paleta-cab"><img src="midia/guardioes/emblema-{p}.png" alt="" loading="lazy">'
            f'<div><b>{guardioes.NOME_EN[p]}</b><span>{_e(g["rotulo"])} · {_e(g["guia"])}</span></div>'
            f'<em>{_num(contraste(pal["accent"], pal["background"]))}:1</em></div><div class="amostras">{amostras}</div></div>'
        )
    return '<div class="paletas">' + "".join(linhas) + "</div>"


def _capacidades(gs: dict) -> str:
    def sim(v: bool) -> str:
        return '<span class="chip ok">sim</span>' if v else '<span class="chip flat">não</span>'
    linhas = "".join(
        f'<tr><td><span class="dot" style="background:{g["cor"]}"></span> {guardioes.NOME_EN[p]}</td><td>{_e(g["trilha"])}</td>'
        f'<td>{_e(g["missoes"]["titulo"].replace("{guia}", g["guia"]))}</td><td>{sim(g["cronometro"])}</td><td>{sim(g["batalha"])}</td></tr>'
        for p, g in gs.items()
    )
    return ('<div class="tabela"><table><thead><tr><th>Perfil</th><th>Forma da trilha</th><th>Título das missões</th>'
            f"<th>Cronômetro</th><th>Batalha</th></tr></thead><tbody>{linhas}</tbody></table></div>")


def _faixas(cat: dict) -> str:
    fx = cat["faixas"]
    topo = fx[-1]["xp_minimo"]
    partes = []
    for i, f in enumerate(fx, 1):
        prox = f'até {fx[i]["xp_minimo"]:,} XP'.replace(",", ".") if i < len(fx) else "última faixa"
        largura = max(4, round(f["xp_minimo"] / topo * 100))
        partes.append(f'<li><span class="nivel">{i}</span><b>{_e(f["titulo"])}</b><span class="xp">{f["xp_minimo"]:,} XP · {prox}</span>'
                      f'<i style="width:{largura}%"></i></li>'.replace(",", "."))
    return f'<ol class="faixas">{"".join(partes)}</ol>'


def _conquistas(cat: dict, gs: dict) -> str:
    nomes = {m["codigo"]: m["nome"] for m in cat["molduras"]}
    comuns: dict[str, list[dict]] = {}
    for c in cat["conquistas"]:
        if not c.get("perfil"):
            comuns.setdefault(c["categoria"], []).append(c)
    grupos = []
    for cat_nome, itens in comuns.items():
        linhas = "".join(
            f'<li><b>{_e(c["nome"])}</b><span>{_e(c["descricao"])}</span>'
            + (f'<img src="midia/gamificacao/biblioteca/molduras/{c["moldura"]}.webp" alt="" title="Libera {_e(nomes[c["moldura"]])}" loading="lazy">' if c.get("moldura") else "")
            + "</li>" for c in itens)
        grupos.append(f'<div class="grupo-c"><h4>{_e(cat_nome)} <small>{len(itens)}</small></h4><ul>{linhas}</ul></div>')
    por_perfil = []
    for p in ORDEM:
        itens = [c for c in cat["conquistas"] if c.get("perfil") == p]
        linhas = "".join(f'<li><b>{_e(c["nome"])}</b><span>{_e(c["descricao"])}</span></li>' for c in itens)
        por_perfil.append(f'<div class="grupo-c" style="--c:{gs[p]["paleta"]["accent"]}"><h4><img src="midia/guardioes/emblema-{p}.png" alt="" loading="lazy">{guardioes.NOME_EN[p]} <small>{len(itens)}</small></h4><ul>{linhas}</ul></div>')
    return (f'<h3>Comuns a todos os perfis</h3><div class="grupos-c">{"".join(grupos)}</div>'
            f'<h3>Três por perfil</h3><div class="grupos-c">{"".join(por_perfil)}</div>')


def _loja(cat: dict) -> str:
    return '<div class="itens">' + "".join(
        f'<div class="item"><img src="midia/gamificacao/biblioteca/utilidade/{i["icone"]}-achiever.png" alt="" loading="lazy">'
        f'<div><b>{_e(i["nome"])}</b><span>{_e(i["descricao"])}</span></div><em>{i["preco_base"]}</em></div>' for i in cat["itens"]
    ) + "</div>"


def _molduras(cat: dict) -> str:
    desafio = {c["moldura"]: c for c in cat["conquistas"] if c.get("moldura")}
    acao = {a["moldura"]: a for a in cat["acoes"]}
    partes = []
    for origem, (titulo, texto) in ORIGEM.items():
        ms = [m for m in cat["molduras"] if m["origem"] == origem]
        cartoes = []
        for m in ms:
            if origem == "loja":
                como = f'{m["preco"]} moedas'
            elif origem == "conquista":
                como = f'<b>{_e(desafio[m["codigo"]]["nome"])}:</b> {_e(desafio[m["codigo"]]["descricao"])}'
            else:
                como = _e(acao[m["codigo"]]["rotulo"])
            cartoes.append(f'<figure class="moldura"><img src="midia/gamificacao/biblioteca/molduras/{m["codigo"]}.webp" alt="" loading="lazy">'
                           f'<figcaption><b>{_e(m["nome"])}</b><span>{como}</span></figcaption></figure>')
        partes.append(f'<h4>{titulo} <small>{len(ms)}</small></h4><p class="fine">{texto}</p>'
                      f'<div class="molduras {"curtas" if origem == "loja" else ""}">{"".join(cartoes)}</div>')
    return "".join(partes)


def _matriz_utilidades() -> str:
    cab = "".join(f"<th>{guardioes.NOME_EN[p]}</th>" for p in ORDEM)
    linhas = "".join(
        f'<tr><td><b>{rot}</b><code>{chave}</code></td>'
        + "".join(f'<td><img src="midia/gamificacao/biblioteca/utilidade/{arq}-{p}.png" alt="{rot}, {guardioes.NOME_EN[p]}" width="48" height="48" loading="lazy"></td>' for p in ORDEM)
        + "</tr>" for arq, rot, chave in UTILIDADES
    )
    return f'<div class="tabela matriz"><table><thead><tr><th>Ícone</th>{cab}</tr></thead><tbody>{linhas}</tbody></table></div>'


def _identidade(gs: dict) -> str:
    def linha(chave: str, rot: str, ext: str) -> str:
        return f'<div class="tira {"cena" if ext == "jpg" else ""}"><h4>{rot}</h4><div>' + "".join(
            f'<figure><img src="midia/gamificacao/biblioteca/perfil/{chave}-{p}.{ext}" alt="{rot}, {guardioes.NOME_EN[p]}" loading="lazy"><figcaption>{guardioes.NOME_EN[p]}</figcaption></figure>' for p in ORDEM
        ) + "</div></div>"
    return (linha("emblem", "Emblema", "png") + linha("frame", "Moldura do perfil", "png") + linha("totem", "Totem", "png")
            + linha("arena", "Arena", "jpg") + linha("map", "Mapa", "jpg") + linha("trail", "Trilha", "jpg"))


def _objetos() -> str:
    partes = []
    for grupo, itens in OBJETOS.items():
        partes.append(f'<div class="objs"><h4>{grupo}</h4><div>' + "".join(
            f'<figure><img src="midia/gamificacao/biblioteca/objetos/{a}.png" alt="" width="64" height="64" loading="lazy"><figcaption>{r}</figcaption></figure>' for a, r in itens
        ) + "</div></div>")
    return '<div class="objs-grade">' + "".join(partes) + "</div>"


def _componentes(gs: dict) -> str:
    botoes = "".join(
        f'<button type="button" data-tema-cor="{gs[p]["paleta"]["accent"]}" data-tema-primaria="{gs[p]["paleta"]["primary"]}" data-tema-fundo="{gs[p]["paleta"]["background"]}" '
        f'aria-pressed="{"true" if p == "conqueror" else "false"}"><span style="background:{gs[p]["cor"]}"></span>{guardioes.NOME_EN[p]}</button>' for p in ORDEM)
    c = gs["conqueror"]["paleta"]
    return (
        '<p>Modelos em HTML, com as medidas e a hierarquia das telas, para comparar os perfis. Eles não substituem os componentes em React Native. '
        'Troque o perfil para ver o que muda: só a cor. Os textos e valores são de exemplo.</p>'
        f'<div class="tema-trocar" role="group" aria-label="Perfil dos modelos">{botoes}</div>'
        f'<div class="vitrine" style="--c:{c["accent"]};--p:{c["primary"]};--f:{c["background"]}">'
        '<div class="peca"><h4>Faixa de XP</h4><div class="fx"><small>NÍVEL 2 DE 10</small><div><b>Primeiros passos</b><em>120 XP</em></div><i><u style="width:70%"></u></i><p>Faltam 30 XP para Trilha aberta</p></div></div>'
        '<div class="peca"><h4>Ações</h4><div class="acoes"><button type="button" class="b1">Entrar no rank</button><button type="button" class="b2">Sair do rank</button><button type="button" class="b3" disabled>Começar</button></div></div>'
        '<div class="peca"><h4>Abas e filtros</h4><div class="abas"><span class="on">Batalha</span><span>Pontuação</span><span>Missões</span></div><div class="pilulas"><span class="on">Precisão</span><span>Velocidade</span><span>Todos</span></div></div>'
        '<div class="peca"><h4>Selos</h4><div class="pilulas"><span>10 inscritos</span><span>até 09/11</span><span class="on">Você está no rank</span></div></div>'
        '<div class="peca"><h4>Modo da Arena</h4><div class="modo"><b>Duelo 1x1</b><span>Você contra um colega.</span></div><div class="modo off"><b>Guilda x guilda</b><span>Entre numa guilda para jogar.</span></div></div>'
        '<div class="peca"><h4>Missão</h4><div class="missao"><small>AGORA</small><b>Conclua 2 atividades</b><span>do dia · +50 pts · +20 moedas</span><i><u style="width:50%"></u></i></div></div>'
        '<div class="peca"><h4>Pódio</h4><div class="podio"><div><b>2º</b></div><div class="alto"><b>1º</b></div><div class="baixo"><b>3º</b></div></div></div>'
        '<div class="peca"><h4>Sua posição</h4><div class="posicao"><strong>7º</strong><div><b>Faltam 8 pts para passar o próximo</b><span>Só a sua turma vê.</span></div></div></div>'
        "</div>"
    )


def _tira_console(raiz: Path) -> str:
    """Lê os tokens do console, para a tabela não ficar para trás do CSS."""
    fonte = (raiz / FONTES["console"]).read_text(encoding="utf-8")
    bloco = fonte.split(":root[data-console-theme]", 1)[1].split("}", 1)[0]
    tokens = {}
    for linha in bloco.splitlines():
        linha = linha.strip()
        if linha.startswith("--") and ":" in linha:
            k, v = linha[2:].rstrip(";").split(":", 1)
            tokens[k.strip()] = v.strip()
    nomes = [("background", "Fundo"), ("card", "Cartão"), ("primary", "Primária"), ("accent", "Destaque"),
             ("console-violet", "Violeta (preenchimento)"), ("success", "Sucesso"), ("warning", "Alerta"), ("info", "Informação"), ("destructive", "Risco")]
    faltam = [k for k, _ in nomes if k not in tokens]
    if faltam:
        raise SystemExit(f"gamificacao: {FONTES['console']} mudou de formato; faltam {faltam}")
    return '<div class="amostras console">' + "".join(
        f'<span class="amostra"><i style="background:hsl({tokens[k].replace(" ", ",", 2)})"></i><b>{n}</b><code>hsl({tokens[k]})</code></span>' for k, n in nomes
    ) + "</div>"


def _evidencias(base: str) -> str:
    partes = []
    for grupo, lista in EVIDENCIAS:
        partes.append(f"<h3>{_e(grupo)}</h3>")
        for ev in lista:
            visto = "".join(f"<li>{_e(x)}</li>" for x in ev["visto"])
            nao = "".join(f"<li>{_e(x)}</li>" for x in ev.get("nao", [])) or '<li class="fine">A descrição não registra limites.</li>'
            imgs = ""
            if ev.get("imagens"):
                imgs = '<div class="galeria compacta">' + "".join(
                    f'<a class="{"larga" if f in LARGAS else ""}" href="{base}{f}" target="_blank" rel="noopener"><img src="{base}{f}" alt="{_e(leg)}" loading="lazy"><span>{_e(leg)}</span></a>'
                    for f, leg in ev["imagens"]) + "</div>"
            nota = f'<p class="fine">{_e(ev["nota"])}</p>' if ev.get("nota") else ""
            partes.append(
                f'<div class="evidencia"><div class="cab"><span class="pr">#{ev["pr"]}</span><span class="data">{ev["data"]}</span><b>{_e(ev["titulo"])}</b></div>'
                f'<div class="colunas"><div><div class="eyebrow">Verificado</div><ul>{visto}</ul></div><div><div class="eyebrow">Não verificado</div><ul>{nao}</ul></div></div>{nota}{imgs}</div>'
            )
    return "".join(partes)


def contar_evidencias() -> int:
    return sum(len(lista) for _, lista in EVIDENCIAS)


def corpo_gamificacao(raiz: Path) -> tuple[str, list[tuple[str, str]], int]:
    cat = carregar_catalogo(raiz)
    gs = guardioes.ler_guardioes(raiz)
    u = cat["uso"]
    comuns = sum(1 for c in cat["conquistas"] if not c.get("perfil"))
    perfil = len(cat["conquistas"]) - comuns
    n = {o: sum(1 for m in cat["molduras"] if m["origem"] == o) for o in ORIGEM}
    n_conq_moldura = sum(1 for c in cat["conquistas"] if c.get("moldura"))
    ficha = [(str(len(cat["faixas"])), "faixas de XP"), (str(len(cat["conquistas"])), f"conquistas do sistema ({comuns} comuns, {perfil} por perfil)"),
             (str(len(cat["molduras"])), f'molduras ({n["loja"]} loja, {n["conquista"]} desafio, {n["acao"]} ação)'),
             (str(len(cat["itens"])), "itens na loja"), (str(u["missoes"]), "missões cadastradas"), (str(u["alunos"]), "alunos em produção"),
             (str(u["eventos"]), "eventos em produção"), (str(u["guildas"]), "guildas em produção")]
    tiles = "".join(f'<div><span class="v">{a}</span><span class="k">{b}</span></div>' for a, b in ficha)
    mec = "".join(f'<tr><td><b>{t}</b></td><td>{r}</td><td class="prs">{p}</td></tr>' for t, p, r in MECANICAS)
    camadas = "".join(f'<div class="card"><div class="top"><span class="name">{_e(t)}</span></div><p>{_e(r)}</p><p class="fine">{_e(p)}</p></div>' for t, r, p in PERSONALIZACAO)
    avisos = "".join(f"<li>{x}</li>" for x in NAO_AFIRMA)
    fontes = "".join(f"<li><code>{_e(f)}</code></li>" for f in FONTES.values())
    if n_conq_moldura != n["conquista"]:
        raise SystemExit("gamificacao: toda moldura de desafio precisa de uma conquista")

    corpo = (
        "<p>O TrailUp é o mesmo jogo para todos, com sete peles. O percurso, as regras e o que vale nota são iguais. "
        "O que muda por perfil BrainHex é o tom do material, a cor, a arte, a forma da trilha e o que ganha destaque na tela. "
        "Esta página reúne o desenho, a paleta, os elementos visuais agrupados e o que os PRs verificaram.</p>"
        f'<div class="ficha">{tiles}</div>'
        f'<p class="fine">Catálogo e contagens medidos em produção em {cat["medido_em"]}, só leitura, na revisão <code>{cat["revisao_alembic"]}</code>. Os dados de tela nas capturas são simulados.</p>'
        '<h2 id="o-que-nao-afirma">O que esta página não afirma</h2>'
        f'<ul class="avisos">{avisos}</ul>'

        '<h2 id="design">Design</h2>'
        "<h3>Princípios</h3><div class=\"cards\">"
        '<div class="card"><div class="top"><span class="name">Uma estrutura, sete peles</span></div><p>Lugar e tamanho dos controles são fixos. Cor, emblema e título mudam, e o aluno de outro perfil continua reconhecendo a tela.</p><p class="fine">#796, #828, #930</p></div>'
        '<div class="card"><div class="top"><span class="name">Competir é opcional</span></div><p>Entrar no rank do evento não muda nota nem XP, e recusar um duelo não custa posição. O texto na tela diz isso.</p><p class="fine">#916, #923</p></div>'
        '<div class="card"><div class="top"><span class="name">Sem exposição</span></div><p>O aluno vê o topo e a própria linha, não quem está no fim da turma. O professor vê todos. O estado vazio aponta o que fazer.</p><p class="fine">#162, #790</p></div>'
        '<div class="card"><div class="top"><span class="name">Moeda não compra nota</span></div><p>Gastar nunca muda XP nem posição. Item ajuda a estudar, moldura é cosmética, e prêmio de desafio não mexe no ranking.</p><p class="fine">#196, #1011</p></div>'
        '<div class="card"><div class="top"><span class="name">A regra mora no banco</span></div><p>Saldo, conquista, abertura de evento e XP de concluir conteúdo são decididos no banco, e seguem com a API fora do ar. A exceção são os desafios de precisão, declarada acima.</p><p class="fine">#196, #495, #1008</p></div>'
        '<div class="card"><div class="top"><span class="name">Contraste antes de enfeite</span></div><p>A cor do perfil sobe de luminosidade até passar no contraste, sem misturar com branco, para não desbotar.</p><p class="fine">Regra do repositório</p></div>'
        "</div>"
        "<h3>Tipografia e forma</h3><ul>"
        "<li><b>Títulos em serifa</b> (Georgia), dando peso de jornada às telas. <b>Corpo e números na fonte do sistema</b>, para leitura rápida em tela pequena.</li>"
        "<li><b>Cartões escuros</b> com borda de 1 px na cor do perfil, cantos grandes e uma única ação principal preenchida.</li>"
        "<li><b>Três universos visuais</b> agrupam os perfis: mágico (Seeker, Socializer), medieval (Conqueror, Survivor, Daredevil) e real (Mastermind, Achiever). Ver <code>resolveSystemVisualTheme</code>.</li></ul>"

        '<h2 id="paleta">Paleta de cores</h2>'
        "<p><code>primary</code> é a cor-assinatura oficial, <code>secondary</code> é ela escurecida, <code>accent</code> é ela clareada e <code>background</code> é ela quase preta. "
        "O número à direita é o contraste do <code>accent</code> sobre o <code>background</code>, calculado nesta geração pela fórmula WCAG. O app deriva a variante final na hora, então a cor na tela pode ser mais clara que estas.</p>"
        + _paleta(gs)
        + "<h3>Console do professor</h3><p>Um único tema, sem pele por perfil: o professor trabalha com a turma inteira. As cores de estado são fixas e não derivam do perfil.</p>"
        + _tira_console(raiz)

        + '<h2 id="personalizacao">Personalização</h2>'
        f'<div class="cards">{camadas}</div>'
        "<h3>O que muda por perfil</h3>"
        + _capacidades(gs)
        + '<p class="fine">Fichas completas, com voz e assinatura editorial, em <a href="guardioes.html">Os sete Guardiões</a>.</p>'

        + '<h2 id="gamificacao">Gamificação</h2>'
        "<h3>As mecânicas</h3>"
        f'<div class="tabela"><table class="mec"><thead><tr><th>Mecânica</th><th>Regra</th><th>PRs</th></tr></thead><tbody>{mec}</tbody></table></div>'
        "<h3>Faixas de XP</h3>"
        + _faixas(cat)
        + "<h3>Itens da loja</h3><p>Preço-base em moedas. O professor pode ajustar o preço por turma.</p>"
        + _loja(cat)
        + '<h2 id="conquistas">Conquistas</h2>'
        "<p>A miniatura à direita é a moldura que a conquista libera.</p>"
        + _conquistas(cat, gs)

        + '<h2 id="biblioteca">Biblioteca de elementos</h2>'
        "<p>Todos os elementos visuais do app, agrupados por função. As imagens são reduções dos arquivos do app, geradas para esta página.</p>"
        '<h3 id="bib-componentes">Componentes de tela</h3>'
        + _componentes(gs)
        + '<h3 id="bib-molduras">Molduras</h3>'
        + _molduras(cat)
        + '<h3 id="bib-identidade">Identidade por perfil</h3><p>O conjunto que dá a cara de cada perfil.</p>'
        + _identidade(gs)
        + '<h3 id="bib-icones">Ícones por perfil</h3><p>O mesmo significado desenhado sete vezes. A matriz rola de lado no celular.</p>'
        + _matriz_utilidades()
        + '<h3 id="bib-objetos">Objetos</h3><p>Ilustrações neutras, sem perfil.</p>'
        + _objetos()
        + '<h3 id="bib-ranking">Ícones de ranking</h3><div class="linha-img">'
        + "".join(f'<img src="midia/gamificacao/biblioteca/rank/{i}.png" alt="Ícone de ranking {i}" width="72" height="72" loading="lazy">' for i in (1, 2, 3, 4))
        + '</div><h3 id="bib-bosses">Bosses</h3><p>Trinta artes que o professor escolhe por conteúdo. O nome e as falas vêm do modelo, por perfil.</p><div class="bosses">'
        + "".join(f'<img src="midia/gamificacao/biblioteca/bosses/boss-{i:02d}.png" alt="Boss {i}" width="96" height="96" loading="lazy">' for i in range(1, 31))
        + "</div>"

        + '<h2 id="evidencias">Evidências nos PRs</h2>'
        "<p>O que cada PR afirmou ter visto e o que deixou de fora. Os números são do repositório canônico, que é privado, então as capturas foram copiadas para cá. "
        "“Não verificado” repete o limite que o PR declarou. Quando a descrição não declara nenhum, a página diz isso, e isso não significa que nada faltou. "
        "A situação de cada migration é a da data do PR: hoje todas estão em produção.</p>"
        + _evidencias("midia/gamificacao/evidencias/")
        + '<h2 id="fontes">Fontes</h2>'
        f'<ul class="fontes">{fontes}</ul>'
    )
    toc = [("o-que-nao-afirma", "O que não afirma"), ("design", "Design"), ("paleta", "Paleta de cores"), ("personalizacao", "Personalização"),
           ("gamificacao", "Gamificação"), ("conquistas", "Conquistas"), ("biblioteca", "Biblioteca de elementos"), ("evidencias", "Evidências nos PRs"), ("fontes", "Fontes")]
    return corpo, toc, contar_evidencias()
