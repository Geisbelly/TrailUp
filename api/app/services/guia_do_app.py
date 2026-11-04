"""O que os Guardiões sabem sobre o app do aluno, e para onde podem levá-lo.

Texto estático, sem dado de aluno: a mesma base serve ao Guardião e à Lumi do professor
(`escriba.guia_do_produto`). Os códigos de `DESTINOS_DO_APP` têm paridade testada com
`mobile/src/utils/destinosDoGuia.ts`, que os traduz em rotas. A web do aluno (`/aluno/`) é o
build Expo do mesmo `mobile/`: painel, rotas e lista de destinos são os mesmos.
"""

from functools import lru_cache

from app.services.llm import load_prompt

MAX_DESTINOS = 3

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
