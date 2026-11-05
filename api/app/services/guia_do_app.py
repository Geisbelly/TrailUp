"""O que os Guardiões sabem sobre o app do aluno, e para onde podem levá-lo.

Texto estático, sem dado de aluno: a mesma base serve ao Guardião e à Lumi do professor
(`escriba.guia_do_produto`). Os códigos de `DESTINOS_DO_APP` têm paridade testada com
`mobile/src/utils/destinosDoGuia.ts`, que os traduz em rotas. A web do aluno (`/aluno/`) é o
build Expo do mesmo `mobile/`: painel, rotas e lista de destinos são os mesmos.
"""

import re
from collections.abc import Callable
from functools import lru_cache
from typing import Any

from app.services.llm import load_prompt

MAX_DESTINOS = 6
MAX_SECOES = 6
MAX_TITULO = 120
MAX_TEXTO_DA_SECAO = 500

DESTINOS_DO_APP = frozenset(
    {
        "trilha",
        "notificacoes",
        "social",
        "ranking",
        "perfil",
        "perfil.loja",
        "perfil.conquistas",
        "perfil.molduras",
        "perfil.metricas",
        "perfil.modo_foco",
        "perfil.lembrete",
        "perfil.coleta",
        "perfil.relatorio",
        "perfil.erro",
        "perfil.senha",
        "perfil.excluir",
    }
)


# Paridade testada com `mobile/src/utils/tutoriaisDoGuia.ts`. O modelo só escolhe o código: um
# passo escrito por ele apontaria para um botão que não existe.
TUTORIAIS_DO_APP = frozenset(
    {
        "conhecer_app",
        "continuar_estudo",
        "gastar_moedas",
        "ver_conquistas",
        "ler_notificacoes",
        "ver_ranking",
        "fazer_amizades",
        "controlar_coleta",
        "gerar_relatorio",
        "mudar_metricas",
        "modo_foco",
        "lembrete_diario",
    }
)

# Nome que só existe como tela: aparece no texto e já é o destino.
_TELAS: dict[str, str] = {
    "Loja": "perfil.loja",
    "Biblioteca de conquistas": "perfil.conquistas",
    "Molduras": "perfil.molduras",
    "Estilo das métricas": "perfil.metricas",
    "Modo foco e avisos": "perfil.modo_foco",
    "Modo foco": "perfil.modo_foco",
    "Lembrete diário": "perfil.lembrete",
    "Coleta e acessos": "perfil.coleta",
    "Gerar relatório dos dados": "perfil.relatorio",
    "Relatório dos dados": "perfil.relatorio",
    "Reportar um erro": "perfil.erro",
    "Redefinir senha": "perfil.senha",
    "Solicitar exclusão da conta": "perfil.excluir",
}
# Nome de aba é palavra comum: só conta com "na", "aba", "abra" ou "Perfil >".
_ABAS: dict[str, str] = {
    "Trilha": "trilha",
    "Notificações": "notificacoes",
    "Social": "social",
    "Ranking": "ranking",
    "Perfil": "perfil",
}
_NOME_EXATO = {nome.casefold(): codigo for nome, codigo in (_ABAS | _TELAS).items()}


def _alternativas(nomes: dict[str, str]) -> str:
    return "|".join(re.escape(nome) for nome in sorted(nomes, key=len, reverse=True))


_TELA = re.compile(rf"\b({_alternativas(_TELAS)})\b")
_ABA = re.compile(
    rf"(?:\b(?:[Ee]m|[Aa]ba|[Mm]enu|[Aa]bra|[Nn]a|[Nn]o)\s+({_alternativas(_ABAS)})\b)"
    rf"|\b({_alternativas(_ABAS)})\s*[>›]"
)


def _destinos_citados(texto: str) -> list[str]:
    """As telas que o texto cita, em ordem. O botão não depende só de o modelo preencher `destinos`."""
    achados = [(m.start(), _TELAS[m.group(1)]) for m in _TELA.finditer(texto)]
    achados += [(m.start(), _ABAS[m.group(1) or m.group(2)]) for m in _ABA.finditer(texto)]
    codigos = [codigo for _, codigo in sorted(achados, key=lambda item: item[0])]
    if any(c.startswith("perfil.") for c in codigos):
        codigos = [c for c in codigos if c != "perfil"]
    return list(dict.fromkeys(codigos))


def _destino_da_secao(secao: Any) -> str | None:
    """O que o modelo disse; senão o título, se for nome de tela; senão a tela citada."""
    validos = destinos_do_app_validos([secao.destino])
    if validos:
        return validos[0]
    pelo_titulo = _NOME_EXATO.get(secao.titulo.strip().casefold())
    if pelo_titulo:
        return pelo_titulo
    citados = _destinos_citados(f"{secao.titulo}: {secao.texto}")
    return citados[0] if citados else None


@lru_cache(maxsize=1)
def guia_do_app() -> str:
    return load_prompt("guia_do_app_aluno.md")


def destinos_do_app_validos(destinos: list[str] | None) -> list[str]:
    """Só código conhecido, sem repetir: o modelo pode inventar, o app não pode receber."""
    vistos: list[str] = []
    for destino in destinos or []:
        d = str(destino).strip().lower()
        if d in DESTINOS_DO_APP and d not in vistos:
            vistos.append(d)
    return vistos[:MAX_DESTINOS]


def montar_resposta_do_guia(saida: Any, restaurar: Callable[[str], str]) -> dict[str, Any]:
    """Do que o modelo devolveu ao que o app desenha. `restaurar` troca `{{nome}}` em CADA texto:
    a seção não pode ser o lugar por onde o placeholder chega à tela."""
    introducao = restaurar(saida.reply).strip()
    secoes: list[dict[str, Any]] = []
    for secao in saida.secoes:
        titulo = restaurar(secao.titulo).strip()[:MAX_TITULO]
        texto = restaurar(secao.texto).strip()[:MAX_TEXTO_DA_SECAO]
        if titulo and texto and len(secoes) < MAX_SECOES:
            secoes.append({"titulo": titulo, "texto": texto, "destino": _destino_da_secao(secao)})

    tutorial = str(saida.tutorial or "").strip().lower()
    return {
        "reply": "\n\n".join([introducao, *(f"{s['titulo']}: {s['texto']}" for s in secoes)]).strip(),
        "introducao": introducao if secoes else "",
        "secoes": secoes,
        "destinos": destinos_do_app_validos(
            [*(s["destino"] for s in secoes if s["destino"]), *saida.destinos, *_destinos_citados(saida.reply)]
        ),
        "tutorial": tutorial if tutorial in TUTORIAIS_DO_APP else None,
    }
