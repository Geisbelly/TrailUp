# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown-it-py>=3,<4"]
# ///
"""Gera o site de documentação do TrailUp (GitHub Pages do espelho).

Lê os documentos do próprio repositório (modelagem, dossiê, inventário, RAG,
ADRs, artigos), monta a página dos Guardiões a partir do código, aplica a
identidade do site e do console (estrela da marca, Cinzel e Inter, paleta de
`frontend/src/index.css`) e grava HTML estático. Os
diagramas Mermaid são desenhados no navegador, com o tema escuro do site.

Uso, a partir da raiz do repositório:
    uv run scripts/site_docs/construir.py --saida /caminho/do/docs

A saída é o `docs/` do branch do Pages no espelho (`Geisbelly/TrailUp`):
`index.html` na raiz, as páginas em `documentacao/` e o tema em `assets/`.
Os relatórios semanais (`sprint/`) já estão lá e não são tocados.

Os números do banco (tabelas, rotinas) são os remedidos em 05/11/2026; o histórico (commits, PRs por semana) sai do git na hora.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from markdown_it import MarkdownIt

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gamificacao
import guardioes

RAIZ = Path(__file__).resolve().parents[2]
AQUI = Path(__file__).resolve().parent
REPO_PUBLICO = "https://github.com/Geisbelly/TrailUp"
FONTES_GOOGLE = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800'
    "&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap\">"
)
SITE = "https://trailup.vercel.app"
# Onde usar o TrailUp. O app está em teste fechado na Play Store: a página pública da loja dá 404,
# o link que funciona é o de testadores (o mesmo de frontend/src/pages/Download.tsx).
ACESSOS = [
    ("Site", f"{SITE}/", "trailup.vercel.app", "Página pública: o que é o TrailUp, blog, contato e cadastro.", "--seeker"),
    ("Console do professor", f"{SITE}/login", "trailup.vercel.app/login",
     "Entre como professor para montar trilhas e acompanhar a turma, as personalizações, os insights e a Lumi.", "--mastermind"),
    ("TrailUp na web (aluno)", f"{SITE}/aluno/login", "trailup.vercel.app/aluno/login",
     "Entre como aluno para estudar a trilha no navegador.", "--conqueror"),
    ("App Android", "https://play.google.com/apps/test/com.seuprojeto.trailup/20", "Google Play · teste fechado",
     "O app do aluno. Entre como testador na Play Store, ou baixe pela página de download do site.", "--achiever"),
]
# Identificadores de infraestrutura que não precisam estar numa página pública.
SUBSTITUICOES = (
    ("projeto `xrebtkmdewolzmpsdwgh`", "projeto de produção"),
    ("banco `xrebtkmdewolzmpsdwgh`", "banco de produção"),
    ("projeto xrebtkmdewolzmpsdwgh", "projeto de produção"),
    ("xrebtkmdewolzmpsdwgh", "produção"),
)


GUARDIOES = ("guardioes", "Os sete Guardiões")
GAMIFICACAO = ("gamificacao", "Gamificação e personalização")


@dataclass
class Pagina:
    slug: str
    titulo: str
    grupo: str
    descricao: str
    fontes: list[str]
    cortar: list[str] = field(default_factory=list)  # headings (prefixo) cuja seção sai


PAGINAS: list[Pagina] = [
    Pagina("visao-geral", "Visão geral do sistema", "Sistema",
           "O sistema inteiro em uma página: arquitetura, app, console, API e IA, geração, perfis, RAG, "
           "telemetria, gamificação, banco e privacidade, com a procedência de cada dado.",
           ["docs/tcc/sistema-para-a-monografia-2026-11-04.md"], cortar=["## 16."]),
    Pagina("inventario", "Inventário completo", "Sistema",
           "Catálogo peça por peça: cada módulo da API, do microservice, do app e do console, e cada "
           "tabela, função e rotina do banco.",
           ["docs/tcc/inventario-completo-2026-11-04.md"]),
    Pagina("rotas", "Rotas dos serviços", "Sistema",
           "Todas as rotas da API, do microservice, das Edge Functions, da web e do app, geradas do código.",
           ["docs/rotas.md"]),
    Pagina("modelagem", "Sobre a modelagem", "Modelagem",
           "Como os 72 diagramas foram feitos, conferidos no código e no banco, e o que eles não afirmam.",
           ["docs/tcc/modelagem/README.md"]),
    Pagina("arquitetura", "Arquitetura", "Modelagem",
           "Contexto, contêineres, a regra de fronteira entre banco e API, implantação e camadas.",
           ["docs/tcc/modelagem/01-arquitetura.md"]),
    Pagina("casos-de-uso", "Casos de uso", "Modelagem",
           "Atores, casos de uso do aluno, do professor e da dona do projeto.",
           ["docs/tcc/modelagem/02-casos-de-uso.md"]),
    Pagina("pipeline", "Pipeline de ponta a ponta", "Modelagem",
           "Do professor salvando a trilha ao material adaptado e de volta à análise, em 13 fluxos.",
           ["docs/tcc/modelagem/03-pipeline-ponta-a-ponta.md"]),
    Pagina("ia", "IA: grafo e análise", "Modelagem",
           "O grafo LangGraph e suas regras de roteamento, o pipeline de seis estágios e a escolha do modelo.",
           ["docs/tcc/modelagem/04-ia-grafo-e-analise.md"]),
    Pagina("dados", "Modelo de dados", "Modelagem",
           "Entidades e relações por domínio, a partir das chaves estrangeiras de produção.",
           ["docs/tcc/modelagem/05-dados.md"]),
    Pagina("estados", "Diagramas de estado", "Modelagem",
           "O ciclo de vida de jobs, materiais, progresso, eventos, notificações e intervenções.",
           ["docs/tcc/modelagem/06-estados.md"]),
    Pagina("classes", "Diagramas de classes", "Modelagem",
           "Onde a orientação a objetos é decisão de projeto: o pipeline, os serviços de IA e o app.",
           ["docs/tcc/modelagem/07-classes.md"]),
    Pagina("rag", "RAG no sistema", "Evidência e RAG",
           "Onde a busca na Evidence Base entra, o que falta para ligá-la e como será avaliada.",
           ["docs/rag/mapa-do-rag-no-sistema.md"]),
    Pagina("rag-teste", "Teste com e sem RAG", "Evidência e RAG",
           "Plano de teste em massa para medir o efeito da busca, com critério de decisão fixado antes.",
           ["docs/rag/plano-teste-com-e-sem-rag.md"]),
    Pagina("adr", "Decisões de arquitetura", "Evidência e RAG",
           "Os registros de decisão (ADR) do armazenamento vetorial do RAG.",
           ["docs/adr/0001-rag-vector-store.md", "docs/adr/0002-rag-openai-vector-store.md"]),
    Pagina("artigo-ia-onde-importa", "IA onde importa", "Artigos",
           "Resumo expandido (JIC 2026): cinco princípios arquiteturais para acoplar IA generativa a uma plataforma "
           "educacional, avaliados em seis cenários, com custos e limites.",
           ["docs/tcc/artigos/2026-jic-ia-onde-importa.md"]),
    Pagina("artigo-da-tipologia-a-trilha", "Da tipologia à trilha", "Artigos",
           "Resumo expandido (JIC 2026): o TrailUp como artefato e um experimento com 252 textos sobre se o modelo "
           "segue as características de cada perfil BrainHex.",
           ["docs/tcc/artigos/2026-jic-da-tipologia-a-trilha.md"]),
]

# Linhas medidas na varredura de 04/11/2026 (docs/tcc/sistema-para-a-monografia-2026-11-04.md); o banco foi remedido em 05/11.
BANCO = {"tabelas": 186, "funcoes": 678, "gatilhos": 147, "policies": 291, "cron": 21}  # remedido em 05/11/2026, revisão 20261105_24
LINHAS_POR_SERVICO = [  # sem testes, medido em 04/11/2026
    ("App do aluno", 93567), ("Console web", 59024), ("API", 46413),
    ("BrainHexPDF", 26845), ("Microservice", 12506),
]
PERFIS = [  # microservice/src/constants/brainHex.ts; cor = tom clareado do tema (contraste no fundo escuro)
    ("Seeker", "Explorador", "--seeker", "Ama descobrir novos caminhos e segredos escondidos.", "Amara"),
    ("Survivor", "Sobrevivente", "--survivor", "Foca em superar desafios e proteger o que conquistou.", "Kenji"),
    ("Daredevil", "Aventureiro", "--daredevil", "Vive pela adrenalina e riscos calculados.", "Ember"),
    ("Mastermind", "Estrategista", "--mastermind", "Resolve problemas complexos com lógica e sabedoria.", "Idris"),
    ("Conqueror", "Conquistador", "--conqueror", "Busca poder, influência e vitórias gloriosas.", "Amina"),
    ("Socializer", "Socializador", "--socializer", "Valoriza conexões e histórias compartilhadas.", "Mateo"),
    ("Achiever", "Realizador", "--achiever", "Adora completar coleções e atingir metas.", "Kwame"),
]
MARCOS = [  # docs/segundo-cerebro/02-Timeline/timeline.md e histórico de PRs do Lab
    ("jul/2025", "Proposta do TCC", "A ideia nasce como NeuroNauta: aprendizagem com IA sensível à emoção."),
    ("set/2025", "BrainHex no TCC 1", "A tipologia de jogadores BrainHex entra como base da personalização."),
    ("out/2025", "Pesquisa de validação", "Questionários com professores e alunos para o desenho da experiência."),
    ("out–dez/2025", "UX e protótipos", "Protótipos no Figma e no Expo, documento de UX, relatório técnico e os primeiros APKs."),
    ("jun/2026", "TCC 1 e repositório público", "Desenvolvimento do TCC 1 atualizado; criação de Geisbelly/TrailUp."),
    ("25/08/2026", "Monorepo", "Primeiro commit do monorepo: API, microservice, console e app em um só lugar. Começa o TCC 2 (Evidence Base)."),
    ("set/2026", "Dados e leitura da literatura", "Leituras aprovadas, dashboard e insights do professor, telemetria do app."),
    ("01/10/2026", "Incidente: dados do console", "Perda de dados no banco do plano gratuito, sem recuperação pontual. Vira rotina de backup e de restauração documentada."),
    ("03–09/10", "Segurança e visão local", "RLS revista tabela a tabela, CI, emoção por imagem (FER+) rodando no próprio servidor, câmera só com consentimento."),
    ("13–20/10", "Console V9 e gamificação", "Conquistas, notas, missões, eventos, ranks e economia, com as regras no banco."),
    ("22–26/10", "LGPD e RAG", "Consentimentos, conversas cifradas, retenção, buckets privados; RAG do Guardião no Vector Store; eventos abrem e fecham sozinhos."),
    ("28–31/10", "App novo e métricas", "O app mobile-v1 chega à main; métricas F0–F5 com fila de análise no banco; insights e intervenção."),
    ("01/11/2026", "Nota e tentativas pelo banco", "Nota, risco de evasão e tentativas decididos no servidor; falas do boss por perfil; incidente de API fora por migration adiantada."),
    ("04/11/2026", "Privacidade fechada e modelagem", "Link curto assinado para a mídia e aviso de inatividade (#632); IA só para maiores (#933); corpus v1 do RAG; modelagem em 44 diagramas."),
    ("05/11/2026", "Monitor e rotas fechadas", "Sondas pelo banco a cada minuto, com meta de 24 horas e alerta por e-mail; saúde dos clientes gravada no Supabase; rotas do BrainHexPDF com segredo; administração do dono no banco; duelo no evento."),
    ("05/11/2026", "Modelagem completa", "72 diagramas, 68 casos de uso, 21 fluxos e as 188 tabelas por domínio, com as transições de estado auditadas nas funções do banco."),
    ("05/11/2026", "Molduras por desafio e diagnóstico", "18 molduras saem por desafios difíceis e diferentes; XP de conteúdo pelo banco; diagnóstico curto antes do tópico; paridade entre guilda e individual no painel técnico."),
]


# ---------------------------------------------------------------- git

def git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(RAIZ), *args], capture_output=True, text=True, check=True).stdout


def referencia_principal() -> str:
    for ref in ("origin/main", "main", "HEAD"):
        try:
            git("rev-parse", "--verify", "--quiet", ref)
            return ref
        except subprocess.CalledProcessError:
            continue
    return "HEAD"


def historico_semanal(ref: str) -> list[dict]:
    """Commits e PRs que entraram na main, por semana ISO.

    PR = commit de squash terminado em '(#N)' ou merge commit 'Merge pull request #N'. O total do
    GitHub é maior porque conta também PRs mesclados em outros branches.
    """
    commits: Counter[str] = Counter()
    prs: Counter[str] = Counter()
    for linha in git("log", ref, "--format=%ad|%s", "--date=format:%G-W%V").splitlines():
        semana, assunto = linha.split("|", 1)
        commits[semana] += 1
        if re.search(r"\(#\d+\)\s*$", assunto) or assunto.startswith("Merge pull request #"):
            prs[semana] += 1
    atual = date.today().strftime("%G-W%V")
    return [{"semana": s, "commits": commits[s], "prs": prs[s], "parcial": s == atual} for s in sorted(commits)]


def ultima_data(caminho: str, ref: str) -> str:
    saida = git("log", "-1", "--format=%ad", "--date=format:%d/%m/%Y", ref, "--", caminho).strip()
    return saida or date.today().strftime("%d/%m/%Y")


# ---------------------------------------------------------------- markdown

def slug_github(texto: str) -> str:
    texto = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", texto).replace("`", "").replace("*", "")
    texto = "".join(c for c in texto.lower() if c.isalnum() or c in " -_")
    return texto.replace(" ", "-")


class Conversor:
    def __init__(self, mapa_fontes: dict[str, str], saida: Path) -> None:
        self.mapa = mapa_fontes  # caminho .md no repo -> slug da página
        self.saida = saida
        self.md = MarkdownIt("commonmark", {"html": True}).enable(["table", "strikethrough"])
        # O markdown-it amarra a regra ao renderer (primeiro argumento); por isso as funções intermediárias.
        self.md.add_render_rule("heading_open", lambda _r, *a: self._heading_open(*a))
        self.md.add_render_rule("fence", lambda _r, *a: self._fence(*a))
        self.md.add_render_rule("link_open", lambda _r, *a: self._link_open(*a))
        self.md.add_render_rule("image", lambda _r, *a: self._image(*a))
        self.md.add_render_rule("table_open", lambda *a: '<div class="tabela"><table>\n')
        self.md.add_render_rule("table_close", lambda *a: "</table></div>\n")

    def _heading_open(self, tokens, idx, options, env):
        tok = tokens[idx]
        texto = tokens[idx + 1].content
        base = slug_github(texto) or "secao"
        vistos = env.setdefault("ids", Counter())
        ident = base if vistos[base] == 0 else f"{base}-{vistos[base]}"
        vistos[base] += 1
        if tok.tag == "h2":
            env.setdefault("toc", []).append((ident, re.sub(r"[`*]", "", texto)))
        env["ultimo_id"] = ident
        return f'<{tok.tag} id="{ident}">'

    def _fence(self, tokens, idx, options, env):
        tok = tokens[idx]
        if tok.info.strip() == "mermaid":
            env["n_diagramas"] = env.get("n_diagramas", 0) + 1
            n = env["n_diagramas"]
            return (
                f'<figure class="diagrama" id="diagrama-{n}"><div class="area"><pre class="mermaid">'
                f"{html.escape(tok.content)}</pre></div>"
                f'<figcaption><span>Diagrama {n}</span><button class="ampliar" type="button">ampliar</button>'
                "</figcaption></figure>\n"
            )
        lang = html.escape(tok.info.strip())
        return f'<pre><code class="language-{lang}">{html.escape(tok.content)}</code></pre>\n'

    def _link_open(self, tokens, idx, options, env):
        tok = tokens[idx]
        href = tok.attrGet("href") or ""
        if href.startswith(("http://", "https://")):
            tok.attrSet("target", "_blank")
            tok.attrSet("rel", "noopener")
        elif href and not href.startswith(("#", "mailto:")):
            tok.attrSet("href", self._resolver(href, env["fonte"]))
        return self.md.renderer.renderToken(tokens, idx, options, env)

    def _image(self, tokens, idx, options, env):
        # Imagem do repositório vai para documentacao/midia/docs/, com o caminho achatado no nome.
        tok = tokens[idx]
        src = tok.attrGet("src") or ""
        if src and not src.startswith(("http://", "https://", "data:")):
            alvo = (RAIZ / env["fonte"]).parent.joinpath(src).resolve()
            nome = alvo.relative_to(RAIZ).as_posix().replace("/", "-")
            destino = self.saida / "documentacao" / "midia" / "docs"
            destino.mkdir(parents=True, exist_ok=True)
            shutil.copy(alvo, destino / nome)
            tok.attrSet("src", f"midia/docs/{nome}")
        tok.attrSet("loading", "lazy")
        return self.md.renderer.image(tokens, idx, options, env)

    def _resolver(self, href: str, fonte: str) -> str:
        caminho, _, ancora = href.partition("#")
        alvo = (RAIZ / fonte).parent.joinpath(caminho).resolve()
        try:
            rel = alvo.relative_to(RAIZ).as_posix()
        except ValueError:
            return href
        frag = f"#{ancora}" if ancora else ""
        if rel in self.mapa:
            return f"{self.mapa[rel]}.html{frag}"
        tipo = "tree" if alvo.is_dir() else "blob"
        return f"{REPO_PUBLICO}/{tipo}/main/{rel}{frag}"

    def converter(self, texto: str, fonte: str, env: dict) -> str:
        env["fonte"] = fonte
        return self.md.render(texto, env)


def preparar(texto: str, cortar: list[str], tirar_h1: bool) -> str:
    for antigo, novo in SUBSTITUICOES:
        texto = texto.replace(antigo, novo)
    linhas = texto.splitlines()
    if tirar_h1:
        for i, linha in enumerate(linhas):
            if linha.startswith("# "):
                del linhas[i]
                break
    saida: list[str] = []
    pulando: int | None = None
    em_bloco = False
    for linha in linhas:
        if linha.startswith("```"):
            em_bloco = not em_bloco
        nivel = len(linha) - len(linha.lstrip("#")) if (linha.startswith("#") and not em_bloco) else 0
        if pulando is not None and nivel and nivel <= pulando:
            pulando = None
        if nivel and any(linha.startswith(c) for c in cortar):
            pulando = nivel
        if pulando is None:
            saida.append(linha)
    while saida and saida[-1].strip() in {"", "---"}:
        saida.pop()
    return "\n".join(saida) + "\n"


# ---------------------------------------------------------------- moldura

def cabecalho_html(titulo: str, base: str, descricao: str) -> str:
    return (
        '<!DOCTYPE html>\n<html lang="pt-BR" translate="no"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="google" content="notranslate">'
        f"<title>{html.escape(titulo)} · TrailUp</title>"
        f'<meta name="description" content="{html.escape(descricao)}">'
        f"{FONTES_GOOGLE}"
        f'<link rel="stylesheet" href="{base}assets/site.css">'
        f'<link rel="icon" type="image/png" href="{base}assets/trailup-estrela.png">'
        '</head><body class="notranslate"><div class="bg-glow"></div><div class="bg-stars"></div>'
    )


def topo_html(base: str) -> str:
    return (
        '<header class="topbar">'
        f'<a class="wordmark" href="{base}index.html"><img src="{base}assets/trailup-estrela.png" alt="" width="34" height="34">'
        "TrailUp<small>documentação</small></a>"
        f'<nav><a href="{base}documentacao/visao-geral.html">Sistema</a>'
        f'<a href="{base}documentacao/guardioes.html">Guardiões</a>'
        f'<a href="{base}documentacao/gamificacao.html">Gamificação</a>'
        f'<a href="{base}documentacao/arquitetura.html">Modelagem</a>'
        f'<a href="{base}documentacao/rag.html">RAG</a>'
        f'<a href="{base}documentacao/artigo-ia-onde-importa.html">Artigos</a>'
        f'<a href="{base}documentacao/historico.html">Histórico</a>'
        f'<a href="{REPO_PUBLICO}" target="_blank" rel="noopener">GitHub</a>'
        f'<a class="abrir" href="{SITE}/" target="_blank" rel="noopener">Abrir o TrailUp ↗</a></nav>'
        '<button class="menu-btn" type="button" aria-label="Abrir menu">menu</button>'
        "</header>"
    )


def lateral_html(atual: str) -> str:
    grupos: dict[str, list[tuple[str, str]]] = {}
    for p in PAGINAS:
        grupos.setdefault(p.grupo, []).append((p.slug, p.titulo))
    grupos["Sistema"].extend((GUARDIOES, GAMIFICACAO))
    grupos["Projeto"] = [("historico", "Histórico e números")]
    partes = ['<aside class="side" aria-label="Navegação"><h4>Início</h4><ul><li><a href="../index.html">Página inicial</a></li></ul>']
    for grupo, itens in grupos.items():
        partes.append(f"<h4>{html.escape(grupo)}</h4><ul>")
        for slug, titulo in itens:
            atual_attr = ' aria-current="page"' if slug == atual else ""
            partes.append(f'<li><a href="{slug}.html"{atual_attr}>{html.escape(titulo)}</a></li>')
        partes.append("</ul>")
    partes.append("<h4>Usar o TrailUp</h4><ul>" + "".join(
        f'<li><a href="{url}" target="_blank" rel="noopener">{html.escape(nome)} ↗</a></li>' for nome, url, *_ in ACESSOS
    ) + "</ul>")
    partes.append('<h4>Relatórios</h4><ul><li><a href="historico.html#relatorios-semanais">Relatórios semanais</a></li></ul></aside>')
    return "".join(partes)


def rodape_html(ref_curta: str, hoje: str) -> str:
    return (
        '<footer class="rodape">'
        f"<span>Gerado de <code>{ref_curta}</code> em {hoje} por <code>scripts/site_docs/construir.py</code>.</span>"
        f'<span>Código: <a href="{REPO_PUBLICO}" target="_blank" rel="noopener">Geisbelly/TrailUp</a></span>'
        "</footer>"
    )


def pagina_html(*, slug: str, titulo: str, grupo: str, descricao: str, corpo: str, toc: list[tuple[str, str]],
                chips: str, anterior: tuple[str, str] | None, proxima: tuple[str, str] | None,
                ref_curta: str, hoje: str, extra_head: str = "") -> str:
    toc_html = ""
    if toc:
        itens = "".join(f'<li><a href="#{i}">{html.escape(t)}</a></li>' for i, t in toc)
        toc_html = f'<nav class="toc" aria-label="Nesta página"><div class="eyebrow">Nesta página</div><ol>{itens}</ol></nav>'
    nav = '<nav class="nav-paginas">'
    nav += (f'<a href="{anterior[0]}.html"><span class="k">← anterior</span><span class="t">{html.escape(anterior[1])}</span></a>'
            if anterior else "<span></span>")
    nav += (f'<a class="prox" href="{proxima[0]}.html"><span class="k">próxima →</span><span class="t">{html.escape(proxima[1])}</span></a>'
            if proxima else "<span></span>")
    nav += "</nav>"
    return (
        cabecalho_html(titulo, "../", descricao) + extra_head + topo_html("../")
        + '<div class="shell">' + lateral_html(slug)
        + '<main class="main"><article class="prose">'
        + f'<header class="page-head"><div class="eyebrow"><span class="diamond" style="width:.55rem;height:.55rem"></span>{html.escape(grupo)}</div>'
        + f"<h1>{html.escape(titulo)}</h1><p class=\"lede\">{html.escape(descricao)}</p><div class=\"meta\">{chips}</div></header>"
        + corpo + nav + "</article>" + toc_html + rodape_html(ref_curta, hoje) + "</main></div>"
        + '<script type="module" src="../assets/site.js"></script></body></html>\n'
    )


# ---------------------------------------------------------------- páginas especiais

def bloco_grafico(chave: str, titulo: str, sub: str, linhas: list[tuple[str, str]], cab: tuple[str, str]) -> str:
    corpo = "".join(f"<tr><td>{html.escape(a)}</td><td>{html.escape(b)}</td></tr>" for a, b in linhas)
    return (
        f'<figure class="grafico" data-grafico="{chave}"><h3>{html.escape(titulo)}</h3><div class="sub">{sub}</div>'
        f'<div class="plot"></div><div class="tabela"><table><thead><tr><th>{cab[0]}</th><th>{cab[1]}</th></tr></thead>'
        f"<tbody>{corpo}</tbody></table></div>"
        '<div class="acoes"><span>passe o mouse para ver o valor</span><button class="alternar" type="button">ver tabela</button></div></figure>'
    )


def relatorios_html(saida: Path, base: str) -> str:
    rels = sorted({m.group(1) for f in (saida / "sprint").glob("relatorio-semanal-*.html")
                   if (m := re.match(r"relatorio-semanal-(\d{4}-W\d{2})", f.name))}, reverse=True)
    if not rels:
        return '<p class="fine">Nenhum relatório encontrado em <code>sprint/</code>.</p>'
    linhas = []
    for r in rels:
        links = [f'<a href="{base}sprint/relatorio-semanal-{r}.html">relatório</a>']
        if (saida / "sprint" / f"relatorio-semanal-{r}-apresentacao.html").exists():
            links.append(f'<a href="{base}sprint/relatorio-semanal-{r}-apresentacao.html">apresentação</a>')
        if (saida / "sprint" / f"relatorio-semanal-{r}.pdf").exists():
            links.append(f'<a href="{base}sprint/relatorio-semanal-{r}.pdf">PDF</a>')
        ano, sem = r.split("-W")
        linhas.append(f'<div><span class="id">{r}</span><span>Semana {int(sem)} de {ano}</span>'
                      f'<span class="links">{"".join(links)}</span></div>')
    return '<div class="lista-rel">' + "".join(linhas) + "</div>"


def historico_pagina(saida: Path, semanas: list[dict], ref_curta: str, hoje: str, n_commits: int, n_prs: int) -> str:
    rotulo = lambda s: "S" + s["semana"].split("-W")[1]
    dados = {
        "prs": {"tipo": "colunas", "titulo": "PRs que entraram na main por semana", "unidade": "PRs",
                "pontos": [{"r": rotulo(s), "v": s["prs"], "parcial": s["parcial"]} for s in semanas]},
        "commits": {"tipo": "colunas", "titulo": "Commits na main por semana", "unidade": "commits",
                    "pontos": [{"r": rotulo(s), "v": s["commits"], "parcial": s["parcial"]} for s in semanas]},
        "linhas": {"tipo": "barras", "titulo": "Linhas de código por serviço", "unidade": "linhas",
                   "pontos": [{"r": n, "v": v} for n, v in LINHAS_POR_SERVICO]},
    }
    parcial = next((s["semana"] for s in semanas if s["parcial"]), None)
    nota_parcial = f" A semana {parcial.split('-W')[1]} ainda está em curso (barra mais clara)." if parcial else ""
    marcos = "".join(
        f'<li><span class="quando">{html.escape(q)}</span><span class="oque"><b>{html.escape(t)}</b>'
        f"<span>{html.escape(d)}</span></span></li>" for q, t, d in MARCOS
    )
    corpo = (
        f'<h2 id="em-numeros">Em números</h2>'
        f'<div class="ficha"><div><span class="v">{n_commits:,}</span><span class="k">commits na main</span><span class="sub">desde 25/08/2026</span></div>'
        f'<div><span class="v">{n_prs:,}</span><span class="k">PRs na main</span><span class="sub">squash e merge</span></div>'
        f'<div><span class="v">{len(semanas)}</span><span class="k">semanas de monorepo</span><span class="sub">S{semanas[0]["semana"][-2:]}–S{semanas[-1]["semana"][-2:]}</span></div>'
        f'<div><span class="v">{sum(v for _, v in LINHAS_POR_SERVICO):,}</span><span class="k">linhas de código</span><span class="sub">sem testes</span></div></div>'.replace(",", ".")
        + '<h2 id="ritmo">Ritmo de desenvolvimento</h2>'
        + f"<p>Cada coluna é uma semana ISO da <code>main</code> do repositório canônico.{nota_parcial} "
        "A partir da semana 40, quase todo commit da <code>main</code> chega por um PR.</p>"
        + '<div class="graficos">'
        + bloco_grafico("prs", "PRs que entraram na main por semana", "squash terminado em (#N) ou merge de pull request",
                        [(rotulo(s) + (" (parcial)" if s["parcial"] else ""), str(s["prs"])) for s in semanas], ("Semana", "PRs"))
        + bloco_grafico("commits", "Commits na main por semana", "todos os commits, inclusive merges e syncs",
                        [(rotulo(s) + (" (parcial)" if s["parcial"] else ""), str(s["commits"])) for s in semanas], ("Semana", "Commits"))
        + "</div>"
        + '<h2 id="tamanho">Tamanho por serviço</h2><p>Linhas de código sem testes, medidas em 04/11/2026.</p>'
        + bloco_grafico("linhas", "Linhas de código por serviço", "TypeScript, Python e TSX, sem arquivos de teste",
                        [(n, f"{v:,}".replace(",", ".")) for n, v in LINHAS_POR_SERVICO], ("Serviço", "Linhas"))
        + '<h2 id="marcos">Marcos</h2><ol class="fases">' + marcos + "</ol>"
        + '<h2 id="relatorios-semanais">Relatórios semanais</h2>'
        + "<p>Os relatórios de sprint publicados toda semana, com a versão para apresentação e o PDF.</p>"
        + relatorios_html(saida, "../")
    )
    extra = f'<script type="application/json" id="dados-graficos">{json.dumps(dados, ensure_ascii=False)}</script>'
    toc = [("em-numeros", "Em números"), ("ritmo", "Ritmo de desenvolvimento"), ("tamanho", "Tamanho por serviço"),
           ("marcos", "Marcos"), ("relatorios-semanais", "Relatórios semanais")]
    return pagina_html(
        slug="historico", titulo="Histórico e números", grupo="Projeto",
        descricao="Da proposta de 2025 ao sistema de hoje: marcos, ritmo de desenvolvimento e os relatórios semanais.",
        corpo=corpo + extra, toc=toc, chips='<span class="chip flat">calculado do git na geração</span>',
        anterior=(PAGINAS[-1].slug, PAGINAS[-1].titulo), proxima=None, ref_curta=ref_curta, hoje=hoje,
    )


def inicio_html(saida: Path, ref_curta: str, hoje: str, n_commits: int, n_migrations: int, n_diagramas: int) -> str:
    perfis = "".join(
        f'<a class="perfil" style="--c:var({c})" href="documentacao/guardioes.html#{g.split()[0].lower()}-{en.lower()}">'
        f'<img class="retrato" src="documentacao/midia/guardioes/{en.lower()}.webp" alt="" loading="lazy">'
        f'<span class="pt">{html.escape(pt)}</span>'
        f'<span class="n">{html.escape(en)}</span><p>{html.escape(d)}</p><span class="g">Guardião: {html.escape(g)}</span></a>'
        for en, pt, c, d, g in PERFIS
    )
    grupos: dict[str, list[Pagina]] = {}
    for p in PAGINAS:
        grupos.setdefault(p.grupo, []).append(p)
    cores = {"Sistema": "--seeker", "Modelagem": "--mastermind", "Evidência e RAG": "--achiever", "Artigos": "--socializer"}
    mapa = ""
    for grupo, paginas in grupos.items():
        extra = ""
        if grupo == "Sistema":
            extra = (f'<a class="card" href="documentacao/{GUARDIOES[0]}.html"><div class="top"><span class="dot2" style="background:var(--seeker)"></span>'
                     f'<span class="name">{GUARDIOES[1]}</span></div><p>Os guias de cada perfil: cartões, voz, assinatura editorial, '
                     "tokens, especificação de uso e as evidências dos PRs.</p></a>"
                     f'<a class="card" href="documentacao/{GAMIFICACAO[0]}.html"><div class="top"><span class="dot2" style="background:var(--achiever)"></span>'
                     f'<span class="name">{GAMIFICACAO[1]}</span></div><p>Design, paleta, biblioteca de elementos agrupada, conquistas, molduras '
                     "e as evidências dos PRs, com o que não foi verificado.</p></a>")
        cards = extra + "".join(
            f'<a class="card" href="documentacao/{p.slug}.html"><div class="top"><span class="dot2" style="background:var({cores[grupo]})"></span>'
            f'<span class="name">{html.escape(p.titulo)}</span></div><p>{html.escape(p.descricao)}</p></a>'
            for p in paginas
        )
        mapa += f'<div class="bloco"><div class="eyebrow">{html.escape(grupo)}</div><div class="cards">{cards}</div></div>'
    numeros = [
        ("7", "perfis BrainHex", "cada um com voz e guardião"),
        ("5", "serviços", "app, console, API, microservice, PDF"),
        (str(BANCO["tabelas"]), "tabelas", "com RLS em todas"),
        (str(n_migrations), "migrations", "Alembic, versionadas"),
        (str(BANCO["cron"]), "rotinas no banco", "pg_cron"),
        (str(n_diagramas), "diagramas", "conferidos no código"),
        (f"{n_commits:,}".replace(",", "."), "commits", "desde 25/08/2026"),
    ]
    ficha = "".join(f'<div><span class="v">{v}</span><span class="k">{k}</span><span class="sub">{s}</span></div>' for v, k, s in numeros)
    principios = [
        ("Fronteira", "A API só faz IA", "Fila, agenda, progresso, notificação e autorização vivem no Postgres. Se a API cair, nada que dependa de relógio para."),
        ("Duas camadas", "Base por perfil + ajuste por aluno", "O material pesado é gerado uma vez por turma, tópico e perfil. Cada aluno recebe só uma camada leve por cima."),
        ("Honestidade", "Hipótese é hipótese", "Casar formato com perfil não tem evidência de ganho de aprendizagem; o sistema oferece todos os formatos a todos e diz isso."),
        ("Privacidade", "IA só para maiores", "Sem data de nascimento confirmada, nenhuma chamada a modelo sai. A mídia passa por link curto e assinado."),
    ]
    princ = "".join(
        f'<div class="card"><div class="top"><span class="handle">{html.escape(a)}</span></div>'
        f'<span class="name">{html.escape(b)}</span><p>{html.escape(c)}</p></div>' for a, b, c in principios
    )
    acessos = "".join(
        f'<a class="card acesso" href="{url}" target="_blank" rel="noopener"><div class="top"><span class="dot2" style="background:var({c})"></span>'
        f'<span class="name">{html.escape(nome)} ↗</span></div><span class="handle">{html.escape(rot)}</span><p>{html.escape(d)}</p></a>'
        for nome, url, rot, d, c in ACESSOS
    )
    corpo = (
        '<main class="home">'
        '<section class="hero"><div class="eyebrow"><span class="diamond" style="width:.55rem;height:.55rem"></span>'
        "Plataforma educacional adaptativa · TCC</div>"
        '<img class="logo" src="assets/trailup-estrela.png" alt="" width="88" height="88">'
        "<h1>Trail<span>Up</span></h1>"
        '<p class="lede">Trilhas de estudo gamificadas que se adaptam ao perfil de jogador de cada aluno. '
        "O professor monta a trilha; a IA gera o material para os sete perfis BrainHex, observa como o aluno estuda "
        "e ajusta o caminho. Esta é a documentação completa do sistema: arquitetura, modelagem, dados, IA e histórico.</p>"
        f'<div class="acoes"><a class="btn primario" href="{SITE}/" target="_blank" rel="noopener">Abrir o TrailUp ↗</a>'
        '<a class="btn" href="documentacao/visao-geral.html">Ver o sistema</a>'
        '<a class="btn" href="documentacao/pipeline.html">Pipeline de ponta a ponta</a>'
        '<a class="btn" href="documentacao/historico.html">Histórico</a></div></section>'
        f'<section class="bloco" id="acessar"><h2>Acessar o TrailUp</h2><div class="cards">{acessos}</div></section>'
        f'<section class="bloco"><h2>Em números</h2><div class="ficha">{ficha}</div>'
        f'<p class="fine">Banco medido em produção em 05/11/2026; commits e migrations contados na geração ({hoje}).</p></section>'
        '<section class="bloco"><h2>Os sete Guardiões</h2><p class="lede">Cada perfil BrainHex tem um guia, com voz, tom, ritmo e cor '
        'próprios. <a href="documentacao/guardioes.html">Ver a ficha de cada um →</a></p>'
        f'<div class="perfis">{perfis}</div></section>'
        f'<section class="bloco"><h2>Princípios de projeto</h2><div class="cards">{princ}</div></section>'
        f'<section class="bloco"><h2>Documentação</h2>{mapa}</section>'
        '<section class="bloco"><h2 id="relatorios-semanais">Relatórios semanais</h2>'
        + relatorios_html(saida, "") + "</section>"
        + rodape_html(ref_curta, hoje) + "</main>"
    )
    return (
        cabecalho_html("Documentação", "", "Documentação do TrailUp: arquitetura, modelagem, dados, IA e histórico.")
        + topo_html("") + corpo + '<script type="module" src="assets/site.js"></script></body></html>\n'
    )


# ---------------------------------------------------------------- principal

def construir(saida: Path) -> None:
    ref = referencia_principal()
    ref_curta = git("rev-parse", "--short", ref).strip()
    hoje = date.today().strftime("%d/%m/%Y")
    (saida / "documentacao").mkdir(parents=True, exist_ok=True)
    (saida / "assets").mkdir(exist_ok=True)
    shutil.copy(AQUI / "site.css", saida / "assets" / "site.css")
    shutil.copy(AQUI / "site.js", saida / "assets" / "site.js")
    shutil.copy(AQUI / "trailup-estrela.png", saida / "assets" / "trailup-estrela.png")
    guardioes.copiar_midia(RAIZ, saida / "documentacao")
    gamificacao.copiar_midia(RAIZ, saida / "documentacao")

    mapa = {p.fontes[0]: p.slug for p in PAGINAS}
    for p in PAGINAS:
        for f in p.fontes[1:]:
            mapa[f] = p.slug
    conversor = Conversor(mapa, saida)
    total_diagramas = 0
    for i, p in enumerate(PAGINAS):
        env: dict = {}
        partes = []
        for fonte in p.fontes:
            texto = (RAIZ / fonte).read_text(encoding="utf-8")
            if len(p.fontes) > 1:
                texto = re.sub(r"^# ", "## ", preparar(texto, p.cortar, tirar_h1=False), count=1, flags=re.MULTILINE)
            else:
                texto = preparar(texto, p.cortar, tirar_h1=True)
            partes.append(conversor.converter(texto, fonte, env))
        if p.grupo == "Modelagem":
            total_diagramas += env.get("n_diagramas", 0)
        datas = sorted({ultima_data(f, ref) for f in p.fontes})
        chips = "".join(
            f'<a class="chip flat" href="{REPO_PUBLICO}/blob/main/{f}" target="_blank" rel="noopener">{html.escape(f)}</a>'
            for f in p.fontes
        ) + f'<span class="chip ok">atualizado {datas[-1]}</span>'
        if env.get("n_diagramas"):
            chips += f'<span class="chip warn">{env["n_diagramas"]} diagramas</span>'
        anterior = (PAGINAS[i - 1].slug, PAGINAS[i - 1].titulo) if i else None
        proxima = (PAGINAS[i + 1].slug, PAGINAS[i + 1].titulo) if i + 1 < len(PAGINAS) else ("historico", "Histórico e números")
        (saida / "documentacao" / f"{p.slug}.html").write_text(
            pagina_html(slug=p.slug, titulo=p.titulo, grupo=p.grupo, descricao=p.descricao, corpo="".join(partes),
                        toc=env.get("toc", []), chips=chips, anterior=anterior, proxima=proxima,
                        ref_curta=ref_curta, hoje=hoje),
            encoding="utf-8",
        )

    corpo_g, toc_g, n_evid = guardioes.corpo_guardioes(RAIZ)
    fontes_g = "".join(
        f'<a class="chip flat" href="{REPO_PUBLICO}/blob/main/{f}" target="_blank" rel="noopener">{html.escape(Path(f).name)}</a>'
        for f in guardioes.FONTES.values())
    (saida / "documentacao" / f"{GUARDIOES[0]}.html").write_text(
        pagina_html(slug=GUARDIOES[0], titulo=GUARDIOES[1], grupo="Sistema",
                    descricao="Os guias de cada perfil BrainHex: quem são, como falam, que voz e cor têm, onde aparecem no app "
                              "e o que os PRs verificaram.",
                    corpo=corpo_g, toc=toc_g, chips=f'<span class="chip ok">lido do código em {hoje}</span>'
                    f'<span class="chip warn">{n_evid} PRs com evidência</span>' + fontes_g,
                    anterior=(PAGINAS[1].slug, PAGINAS[1].titulo), proxima=(PAGINAS[2].slug, PAGINAS[2].titulo),
                    ref_curta=ref_curta, hoje=hoje),
        encoding="utf-8")

    corpo_j, toc_j, n_evid_j = gamificacao.corpo_gamificacao(RAIZ)
    (saida / "documentacao" / f"{GAMIFICACAO[0]}.html").write_text(
        pagina_html(slug=GAMIFICACAO[0], titulo=GAMIFICACAO[1], grupo="Sistema",
                    descricao="O desenho da gamificação e da personalização: princípios, paleta de cada perfil, biblioteca de elementos "
                              "agrupada e o que cada PR verificou ou deixou de fora.",
                    corpo=corpo_j, toc=toc_j, chips='<span class="chip ok">catálogo medido em 05/11/2026</span>'
                    f'<span class="chip warn">{n_evid_j} PRs com evidência</span><span class="chip flat">sem resultado educacional</span>',
                    anterior=(GUARDIOES[0], GUARDIOES[1]), proxima=(PAGINAS[2].slug, PAGINAS[2].titulo),
                    ref_curta=ref_curta, hoje=hoje),
        encoding="utf-8")

    semanas = historico_semanal(ref)
    n_commits = sum(s["commits"] for s in semanas)
    n_prs = sum(s["prs"] for s in semanas)
    n_migrations = len(list((RAIZ / "api" / "alembic" / "versions").glob("*.py")))
    (saida / "documentacao" / "historico.html").write_text(
        historico_pagina(saida, semanas, ref_curta, hoje, n_commits, n_prs), encoding="utf-8")
    (saida / "index.html").write_text(
        inicio_html(saida, ref_curta, hoje, n_commits, n_migrations, total_diagramas), encoding="utf-8")
    print(f"{len(PAGINAS) + 3} páginas, {total_diagramas} diagramas da modelagem, ref {ref_curta} → {saida}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--saida", type=Path, required=True, help="pasta docs/ do branch do Pages")
    construir(parser.parse_args().saida.resolve())


if __name__ == "__main__":
    main()
