"""Portao: RPC que o app chama tem de ser criada por alguma migracao.

Um banco construido do zero a partir do Alembic tem de servir o app. Hoje nao
serve: 22 das 61 RPCs que os clientes chamam nao sao criadas por migracao
nenhuma -- existem so porque alguem as fez pelo painel do Supabase (ver
`docs/architecture/schema-nao-versionado.md`).

Isso nao e teoria. Os dois piores defeitos que achei nesta base vieram dessa
fatia: `fn_questao_gabarito_em_texto`, que impedia salvar questao dissertativa
(22004), e `social_presenca_turma`, que entregava a lista de alunos de
qualquer turma. Nenhuma das duas passou por revisao de migracao, porque nao ha
migracao.

Este portao nao conserta a divida -- ele impede que ela cresca. RPC nova
chamada pelo app sem migracao que a crie entra vermelha.

## O parser precisa ver TODAS as chamadas

Tres servicos embrulham a chamada e passam o nome por variavel
(`socialService.socialAction`, `guildService.action`, `notificacoesDb.chamar`).
Um parser que olhasse so `.rpc("nome")` perderia 27 RPCs e daria a impressao
de cobertura. Por isso:

  - le `.rpc("nome")` direto;
  - le o primeiro literal passado aos wrappers conhecidos;
  - e FALHA se achar `.rpc(variavel)` num arquivo que nao esta no mapa de
    wrappers -- wrapper novo nao pode criar ponto cego calado.
"""

from __future__ import annotations

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CLIENTES = (RAIZ / "frontend" / "src", RAIZ / "mobile" / "src")
VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"

# Arquivo -> funcao que embrulha `supabase.rpc`. O nome da RPC e o primeiro
# literal passado a ela. Mapa explicito: ver o docstring.
WRAPPERS = {
    "mobile/src/services/social/socialService.ts": "socialAction",
    "mobile/src/services/social/guildService.ts": "action",
    "mobile/src/services/notificacoesDb.ts": "chamar",
}

# RPCs que o app chama e que NENHUMA migracao cria. Entrada aqui e divida
# registrada, nao permissao: trazer a funcao para o Alembic tira a linha.
FORA_DO_ALEMBIC: dict[str, str] = {
    **{
        fn: (
            "Guildas: o recurso inteiro foi criado pelo painel, sem migracao. "
            "Banco novo nasce sem guilda nenhuma."
        )
        for fn in (
            "guilda_aceitar_convite", "guilda_atualizar_config", "guilda_chat_enviar",
            "guilda_chat_listar", "guilda_chat_questao_responder", "guilda_convidar",
            "guilda_desafio_criar", "guilda_dissolver", "guilda_entrar",
            "guilda_recusar_convite", "guilda_sair",
        )
    },
    **{
        fn: (
            "Social: mesmo caso das guildas. `social_presenca_turma` entregava a "
            "lista de alunos de qualquer turma (corrigida em 20261018_04, que "
            "tambem e a primeira vez que ela entra no Alembic)."
        )
        for fn in (
            "social_bloquear", "social_chat_enviar", "social_chat_listar",
            "social_desbloquear", "social_desfazer_amizade", "social_presenca_aluno",
            "social_presenca_turma", "social_recusar_convite",
        )
    },
    "fn_atualizar_aluno_perfil": (
        "Perfil do aluno, criada pelo painel. SECURITY DEFINER e confere a sessao."
    ),
    "fn_cadastrar_aluno_com_perfis": (
        "Cadastro do aluno, criada pelo painel. SECURITY INVOKER, entao a RLS "
        "do chamador continua valendo."
    ),
    "fn_auth_email_exists": (
        "Criada pelo painel. E a issue #329: permite enumerar e-mail cadastrado "
        "sem autenticar. Trazer para o Alembic so faz sentido junto da correcao."
    ),
}


def _fontes_do_cliente() -> list[tuple[str, str]]:
    saida: list[tuple[str, str]] = []
    for base in CLIENTES:
        for f in base.rglob("*"):
            if f.suffix not in (".ts", ".tsx") or ".test." in f.name:
                continue
            saida.append((
                str(f.relative_to(RAIZ)).replace("\\", "/"),
                f.read_text(encoding="utf-8", errors="replace"),
            ))
    return saida


def _rpcs_chamadas() -> set[str]:
    nomes: set[str] = set()
    for caminho, texto in _fontes_do_cliente():
        nomes |= set(re.findall(r'\.rpc\(\s*["\'`]([a-z_][a-z0-9_]*)', texto))
        wrapper = WRAPPERS.get(caminho)
        for w in {wrapper} | set(WRAPPERS.values()):
            if not w:
                continue
            nomes |= set(re.findall(r"\b" + w + r'(?:<[^>]*>)?\(\s*["\'`]([a-z_][a-z0-9_]*)', texto))
    return nomes


def _chamadas_dinamicas_sem_wrapper() -> list[str]:
    fora: list[str] = []
    for caminho, texto in _fontes_do_cliente():
        if re.search(r"\.rpc\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*,", texto):
            if caminho not in WRAPPERS:
                fora.append(caminho)
    return fora


def _criadas_por_migracao() -> set[str]:
    texto = "\n".join(
        f.read_text(encoding="utf-8", errors="replace") for f in sorted(VERSOES.glob("*.py"))
    )
    return {
        n.lower()
        for n in re.findall(
            r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?\"?([a-z_][a-z0-9_]*)",
            texto,
            re.I,
        )
    }


def test_toda_rpc_chamada_nasce_de_uma_migracao() -> None:
    novas = sorted(_rpcs_chamadas() - _criadas_por_migracao() - set(FORA_DO_ALEMBIC))
    assert not novas, (
        "O app chama estas RPCs e nenhuma migracao as cria:\n  " + "\n  ".join(novas) +
        "\n\nUm banco novo, construido a partir do Alembic, nasce sem elas. "
        "Crie a migracao, ou registre em FORA_DO_ALEMBIC com o motivo."
    )


def test_nenhum_wrapper_novo_cria_ponto_cego() -> None:
    """`.rpc(variavel)` num arquivo fora do mapa esconde todas as RPCs que
    passam por ele. Foi assim que a primeira versao deste parser viu 34 de 61."""
    fora = _chamadas_dinamicas_sem_wrapper()
    assert not fora, (
        "Estes arquivos chamam `.rpc(` com nome em variavel e nao estao em "
        "WRAPPERS:\n  " + "\n  ".join(fora) +
        "\n\nAcrescente o arquivo e o nome da funcao que embrulha, senao as "
        "RPCs que passam por ali ficam invisiveis para este portao."
    )


def test_o_parser_enxerga_as_chamadas_por_wrapper() -> None:
    """Guarda contra vacuidade: se o trecho dos wrappers quebrar, o portao
    passa a aprovar tudo que passa por eles."""
    nomes = _rpcs_chamadas()
    assert "social_bloquear" in nomes, "literal passado a socialAction nao foi visto"
    assert "notificacoes_registrar_login" in nomes, "literal passado a chamar nao foi visto"
    assert len(nomes) > 50, f"so {len(nomes)} RPCs vistas; o parser provavelmente quebrou"


def test_a_divida_registrada_tem_motivo_escrito() -> None:
    for nome, motivo in FORA_DO_ALEMBIC.items():
        assert len(motivo.strip()) > 40, f"{nome} precisa de um motivo de verdade"
