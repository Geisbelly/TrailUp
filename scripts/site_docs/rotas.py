"""Gera `docs/rotas.md`: as rotas de cada serviço do TrailUp, lidas do código.

A API sai do app FastAPI montado, inclusive as rotas fora do OpenAPI (`/api/v1/admin`). O resto sai do
fonte: `microservice/server.ts`, as Edge Functions, `frontend/src/App.tsx` e `mobile/src/app`.
Rota nova sem descrição aqui faz o script falhar, em vez de ir para o documento em branco.

Uso, a partir da raiz, com o Python da API:
    api/.venv/bin/python scripts/site_docs/rotas.py

`docs/rotas.md` vira página do site público (`construir.py`). Do BrainHexPDF só entram as rotas que
o TrailUp usa, ver `BRAINHEXPDF`.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "docs" / "rotas.md"

ACESSO_API = {
    "require_admin": "Admin (senha do `.env`)",
    "require_aluno": "Aluno",
    "require_professor": "Professor",
    "get_current_user": "Login",
}

API = {
    "GET /health": "Saúde da API.",
    "POST /api/v1/admin/personalizacao/media/backfill": "Refaz a mídia que faltou nas personalizações.",
    "POST /api/v1/emocoes/analisar": "Analisa a emoção do aluno.",
    "POST /api/v1/emocoes/analisar-stream": "Analisa a emoção do aluno em fluxo contínuo.",
    "POST /api/v1/escriba/perguntar": "Chat da Lumi, a assistente do professor.",
    "POST /api/v1/insights/turma/{classe_id}/gerar": "Gera os insights da turma em segundo plano.",
    "GET /api/v1/insights/turma/{classe_id}/status": "Situação da geração de insights da turma.",
    "GET /api/v1/materiais/{aluno_id}": "Materiais do aluno.",
    "POST /api/v1/personalizar": "Roda o grafo de personalização para o aluno.",
    "POST /api/v1/personalizar/chat": "Chat do aluno com o Guardião.",
    "POST /api/v1/personalizar/fontes": "Envia fontes do professor (arquivo ou link).",
    "POST /api/v1/personalizar/progresso": "Grava o progresso em um item personalizado.",
    "GET /api/v1/personalizar/perfis/{classe_id}/{topico_id}": "Visão do professor: personalização por perfil.",
    "POST /api/v1/personalizar/perfis/{classe_id}/{topico_id}/regenerar/documento": "Regera o texto base do perfil.",
    "POST /api/v1/personalizar/perfis/{classe_id}/{topico_id}/regenerar/slide": "Regera um slide da base do perfil.",
    "GET /api/v1/personalizar/grupo/{classe_id}": "Distribuição de perfis e desempenho da turma.",
    "GET /api/v1/personalizar/contexto/{aluno_id}": "Contexto do aluno para o professor.",
    "POST /api/v1/personalizar/jobs/enrollment": "Enfileira a matrícula de um aluno. O banco já faz isso sozinho.",
    "POST /api/v1/personalizar/jobs/class-delta": "Enfileira o que mudou na turma. O banco já faz isso sozinho.",
    "POST /api/v1/personalizar/jobs/manual-retry": "Botão \"tentar novamente\" do console.",
    "POST /api/v1/personalizar/jobs/class-theme": "Enfileira a troca de tema da turma. O banco já faz isso sozinho.",
    "POST /api/v1/personalizar/jobs/manual-generate": "Botão \"gerar\" de um tópico e perfil.",
    "POST /api/v1/personalizar/jobs/manual-generate-all": "Botão \"gerar tudo\" da aba Personalizações.",
    "POST /api/v1/personalizar/jobs/student-cleanup": "Limpa as personalizações de um aluno que saiu.",
    "POST /api/v1/personalizar/jobs/full-sync": "Sincroniza a turma inteira.",
    "GET /api/v1/personalizar/jobs": "Lista os jobs da fila.",
    "GET /api/v1/personalizar/jobs/{job_id}": "Detalhe de um job.",
    "GET /api/v1/personalizar/{personalizacao_id}/media-status": "Situação da mídia de uma personalização.",
    "GET /api/v1/personalizar/sugestao/{aluno_id}/historico": "Sugestão atual, histórico e efetividade.",
    "GET /api/v1/personalizar/sugestao/{aluno_id}/{topico_id}": "Ordem aconselhada do material do aluno.",
    "GET /api/v1/personalizar/{aluno_id}": "Personalizações do aluno.",
    "POST /api/v1/telemetria/lotes": "Recebe um lote de telemetria e dispara a análise.",
}

MICROSERVICE = {
    "GET /api/health": "Saúde do serviço.",
    "POST /api/personalizar": "Gera a mídia base de um perfil.",
    "POST /api/v1/archive": "Guarda markdown, áudio e apresentação, gerando as imagens que faltam.",
    "POST /api/v1/generate/block": "Enriquece um bloco de texto.",
    "POST /api/v1/generate/part-audio": "Gera o áudio de uma parte.",
    "POST /api/v1/generate/part-presentation": "Gera a apresentação de uma parte.",
    "POST /api/v1/regenerate/chapter": "Regera um capítulo.",
    "POST /api/v1/regenerate/document": "Regera o documento.",
    "POST /api/v1/regenerate/slide": "Regera um slide.",
}

# O servidor também guarda as rotas da tela de demonstração, que o TrailUp não chama. Elas ficam
# fora desta página pública de propósito.
BRAINHEXPDF = {
    "GET /health": ("Saúde do serviço (também em `/api/health` e `/api/v1/health`).", "Aberta"),
    "GET /openapi.json": ("Contrato do serviço.", "Aberta"),
    "GET /api/v1/docs": ("Documentação do serviço.", "Aberta"),
    "POST /api/v1/render-and-store": ("Gera o deck, monta o HTML e sobe o arquivo.", "Segredo do serviço"),
}

EDGE = {
    "generate-content-ai": ("Console: gera a proposta de trilha e conteúdo.", "Login"),
    "validate-essay-answer-ai": ("App: confere a resposta dissertativa.", "Login"),
    "storage-redirect": ("Gateway de arquivos: redireciona para o R2.", "Link assinado ou sessão"),
    "storage-upload-url": ("URL assinada de upload no R2, para os serviços que geram arquivo.", "Chave de serviço"),
    "pesquisa-arquivar": ("Copia para o R2 a telemetria de quem consentiu. Chamada pelo `pg_cron`.", "Segredo do banco"),
}

WEB = {
    "/": ("Página inicial.", "Aberta"),
    "/cadastro-aluno": ("Cadastro do aluno.", "Aberta"),
    "/cadastro-professor": ("Cadastro do professor.", "Aberta"),
    "/auth/confirmacao": ("Confirmação do e-mail.", "Aberta"),
    "/aluno": ("Introdução do aluno depois do cadastro.", "Login"),
    "/login": ("Entrada.", "Aberta"),
    "/esqueci-senha": ("Pede a troca de senha.", "Aberta"),
    "/redefinir-senha": ("Define a senha nova.", "Link do e-mail"),
    "/console/personalizacoes/material": ("Console: material de uma personalização.", "Professor liberado"),
    "/console/trilha/:topicoId/editar": ("Console: editor do tópico.", "Professor liberado"),
    "/blog": ("Blog.", "Aberta"),
    "/blog/:id": ("Artigo do blog.", "Aberta"),
    "/sobre": ("Sobre o projeto.", "Aberta"),
    "/contato": ("Contato.", "Aberta"),
    "/privacidade": ("Política de privacidade.", "Aberta"),
    "/termos": ("Termos de uso.", "Aberta"),
    "/download": ("Download do app.", "Aberta"),
}

MOBILE = {
    "/": ("Boas-vindas sem login, início com login.", "Aberta"),
    "/login": ("Entrada.", "Aberta"),
    "/recuperarSenha": ("Recuperação de senha.", "Aberta"),
    "/tela": ("Tela de abertura.", "Aberta"),
    "/modal": ("Modal genérico.", "Login"),
    "/services/tela_de_entrada/login": ("Entrada antiga, ainda no roteador.", "Aberta"),
    "/notificacoes": ("Caixa de entrada.", "Login"),
    "/notificacoes/[id]": ("Uma notificação.", "Login"),
    "/perfil": ("Perfil do aluno.", "Login"),
    "/perfil/appearance": ("Aparência.", "Login"),
    "/perfil/biblioteca-conquistas": ("Biblioteca de conquistas.", "Login"),
    "/perfil/coleta-dados": ("Consentimentos de coleta.", "Login"),
    "/perfil/excluir": ("Exclusão da conta.", "Login"),
    "/perfil/feedback": ("Feedback.", "Login"),
    "/perfil/info": ("Informações.", "Login"),
    "/perfil/info-app": ("Sobre o app.", "Login"),
    "/perfil/info-versao": ("Versão instalada.", "Login"),
    "/perfil/lembrete-diario": ("Lembrete diário.", "Login"),
    "/perfil/loja": ("Loja.", "Login"),
    "/perfil/metricas-estilo": ("Métricas e estilo de jogo.", "Login"),
    "/perfil/modo-foco": ("Modo foco.", "Login"),
    "/perfil/molduras": ("Molduras.", "Login"),
    "/perfil/notifications": ("Preferências de notificação.", "Login"),
    "/perfil/relatorio": ("Relatório do aluno.", "Login"),
    "/perfil/resetar-senha": ("Troca de senha.", "Login"),
    "/perfil/settings": ("Configurações.", "Login"),
    "/perfil/study": ("Preferências de estudo.", "Login"),
    "/ranking": ("Ranking.", "Login"),
    "/ranking/[id]": ("Ranking de uma turma.", "Login"),
    "/social": ("Social.", "Login"),
    "/trilha": ("Trilha.", "Login"),
    "/trilha/[id]": ("Tópico da trilha.", "Login"),
}


def rotas_da_api() -> list[tuple[str, str]]:
    os.environ.setdefault("SUPABASE_JWT_SECRET", "x" * 32)
    os.environ.setdefault("ADMIN_PANEL_PASSWORD", "x")
    sys.path.insert(0, str(RAIZ / "api"))
    from fastapi.routing import APIRoute

    from app.main import create_app

    def percorrer(rotas, prefixo=""):
        for rota in rotas:
            if hasattr(rota, "original_router"):
                yield from percorrer(rota.original_router.routes, prefixo + rota.include_context.prefix)
            elif isinstance(rota, APIRoute):
                yield prefixo + rota.path, rota

    def dependencias(dependant):
        for dep in dependant.dependencies:
            yield getattr(dep.call, "__name__", "")
            yield from dependencias(dep)

    achadas = []
    for caminho, rota in percorrer(create_app().routes):
        nomes = set(dependencias(rota.dependant))
        acesso = next((rotulo for nome, rotulo in ACESSO_API.items() if nome in nomes), "Aberta")
        achadas += [(f"{metodo} {caminho}", acesso) for metodo in sorted(rota.methods)]
    return sorted(achadas, key=lambda r: r[0].split(" ", 1)[1])


def rotas_do_microservice() -> list[tuple[str, str]]:
    fonte = (RAIZ / "microservice" / "server.ts").read_text(encoding="utf-8")
    achadas = re.findall(r'app\.(get|post|put|patch|delete)\("(/[^"]+)"(, requireSecret)?', fonte)
    return sorted((f"{m.upper()} {c}", "Segredo do serviço" if s else "Aberta") for m, c, s in achadas)


def rotas_do_brainhexpdf() -> list[str]:
    fonte = (RAIZ / "brainhexpdf" / "server.ts").read_text(encoding="utf-8")
    return [f"{m.upper()} {c}" for m, c in re.findall(r"app\.(get|post|put|patch|delete)\('(/[^']+)'", fonte)]


def rotas_da_web() -> list[str]:
    fonte = (RAIZ / "frontend" / "src" / "App.tsx").read_text(encoding="utf-8")
    achadas = [c for c in re.findall(r'path="([^"]+)"', fonte) if c != "*"]
    constantes = (RAIZ / "frontend" / "src" / "features" / "auth" / "resetPasswordRoute.ts").read_text(encoding="utf-8")
    achadas += re.findall(r'_PATH = "([^"]+)"', constantes)
    achadas.append("/console/personalizacoes/material")
    return achadas


def abas_do_console() -> list[tuple[str, str]]:
    fonte = (RAIZ / "frontend" / "src" / "pages" / "consoleSections.ts").read_text(encoding="utf-8")
    rotulos = dict(re.findall(r'^\s+(\w+): "([^"]+)",$', fonte, re.M))
    return [(f"/console/{slug}".rstrip("/"), rotulos[view])
            for view, slug in re.findall(r'\{ view: "(\w+)", slug: "([^"]*)" \}', fonte)]


def telas_do_app() -> list[str]:
    base = RAIZ / "mobile" / "src" / "app"
    telas = []
    for arquivo in base.rglob("*.tsx"):
        partes = [p for p in arquivo.relative_to(base).with_suffix("").parts if not p.startswith("(")]
        if partes[-1] == "_layout":
            continue
        if partes[-1] == "index":
            partes.pop()
        telas.append("/" + "/".join(partes))
    return sorted(set(telas))


def funcoes_de_borda() -> list[str]:
    return sorted(p.name for p in (RAIZ / "frontend" / "supabase" / "functions").iterdir() if p.is_dir())


def conferir(nome: str, achadas, descritas) -> None:
    faltam = sorted(set(achadas) - set(descritas))
    if faltam:
        sys.exit(f"{nome}: rotas sem descrição em rotas.py: {faltam}")


def tabela(cabecalho: tuple[str, ...], linhas: list[tuple[str, ...]]) -> str:
    saida = ["| " + " | ".join(cabecalho) + " |", "|" + " --- |" * len(cabecalho)]
    saida += ["| " + " | ".join(linha) + " |" for linha in linhas]
    return "\n".join(saida)


def montar() -> str:
    api = rotas_da_api()
    micro = rotas_do_microservice()
    pdf = rotas_do_brainhexpdf()
    web = rotas_da_web()
    abas = abas_do_console()
    telas = telas_do_app()
    edge = funcoes_de_borda()

    conferir("API", [r for r, _ in api], API)
    conferir("microservice", [r for r, _ in micro], MICROSERVICE)
    conferir("web", web, WEB)
    conferir("app", telas, MOBILE)
    conferir("Edge Functions", edge, EDGE)
    if faltam := set(BRAINHEXPDF) - set(pdf):
        sys.exit(f"BrainHexPDF: rotas listadas que não existem mais: {sorted(faltam)}")

    def linha_de_rota(rota: str, acesso: str, descricoes: dict[str, str]) -> tuple[str, str, str]:
        return f"`{rota}`", acesso, descricoes[rota]

    return "\n\n".join([
        "# Rotas dos serviços",
        "Gerado por `scripts/site_docs/rotas.py`, a partir do código. Não edite à mão.",
        "A maior parte do sistema não passa por estas rotas. O app e o console falam direto com o "
        "Supabase, por tabela e RPC, sob RLS. A API existe para a IA, ver a regra de fronteira no "
        "`CLAUDE.md`.",
        f"## API ({len(api)})",
        "FastAPI, em `https://api.trailup.promora.dev.br`. O console chega nela por `/trailup-api/*`, "
        "um rewrite do Vercel. Contrato interativo em `/docs` e `/redoc`, e em `/openapi.json`, sem "
        "as rotas de `/api/v1/admin`. **Login** é o JWT do Supabase, de aluno ou professor, e a rota confere "
        "a posse do dado.",
        tabela(("Rota", "Acesso", "Para quê"), [linha_de_rota(r, a, API) for r, a in api]),
        f"## Microservice ({len(micro)})",
        "Gerador de mídia por perfil. Só a API chama, com o segredo no cabeçalho `x-api-secret`.",
        tabela(("Rota", "Acesso", "Para quê"), [linha_de_rota(r, a, MICROSERVICE) for r, a in micro]),
        "## BrainHexPDF",
        "Render das apresentações, em `https://slides.trailup.promora.dev.br`. Aqui estão as rotas "
        "que o TrailUp usa.",
        tabela(("Rota", "Acesso", "Para quê"),
               [(f"`{r}`", acesso, texto) for r, (texto, acesso) in BRAINHEXPDF.items()]),
        f"## Edge Functions ({len(edge)})",
        "No Supabase, em `/functions/v1/<nome>`. O app ainda chama `personalize_path`, que está "
        "publicada sem fonte neste repositório.",
        tabela(("Função", "Acesso", "Para quê"),
               [(f"`{n}`", EDGE[n][1], EDGE[n][0]) for n in edge]),
        f"## Web ({len(web) + len(abas)})",
        "Vite e React, em `https://trailup.vercel.app`. Qualquer outro caminho cai na página 404.",
        tabela(("Caminho", "Acesso", "Tela"),
               [(f"`{c}`", WEB[c][1], WEB[c][0]) for c in sorted(web)]),
        "### Abas do console",
        "Uma rota por aba, geradas de `frontend/src/pages/consoleSections.ts`. Exigem professor "
        "liberado. **Administração** e **Painel técnico** são do dono do projeto, e quem protege é o banco.",
        tabela(("Caminho", "Aba"), [(f"`{c}`", rotulo) for c, rotulo in abas]),
        f"## App do aluno ({len(telas)})",
        "Expo Router, a partir de `mobile/src/app`. Os grupos `(auth)` e `(tabs)` não entram no caminho. "
        "O mesmo app é exportado para a web e abre em `https://trailup.vercel.app/aluno/login`.",
        tabela(("Caminho", "Acesso", "Tela"),
               [(f"`{t}`", MOBILE[t][1], MOBILE[t][0]) for t in telas]),
    ]) + "\n"


if __name__ == "__main__":
    SAIDA.write_text(montar(), encoding="utf-8")
    print(f"gravado: {SAIDA.relative_to(RAIZ)}")
