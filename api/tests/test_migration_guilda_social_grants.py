"""`20261021_23`: as funções de guilda e social deixam de nascer executáveis pelo anônimo.

O teste que importa aqui não é de forma — é o de **cobertura**
(`test_nenhuma_funcao_do_dominio_fica_sem_revoke`): ele recalcula, a partir do SQL que a cadeia
emite, quais funções dos dois domínios ficam sem `REVOKE`. Foi exatamente essa conta que ninguém
tinha feito, e por isso 20 funções `SECURITY DEFINER` nasciam abertas enquanto o portão
`test_rpc_chamada_tem_migracao` dizia que o problema era outro (falta de migration).
"""

import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config
from tests.test_rpc_chamada_tem_migracao import _criadas_por_migracao, _texto_emitido

_VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", _VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


_M23 = _modulo("20261021_23_guilda_e_social_sem_execute_de_publico.py")

# O dominio é DERIVADO da cadeia, não fixado à mão.
#
# A primeira versão deste arquivo trazia as 39 funções medidas na produção em 20/10 numa tupla
# literal — e com isso o teste de cobertura não podia cumprir o que o próprio docstring promete:
# **função nova** no domínio não estaria na lista, o laço não a visitaria, e o teste passaria
# verde justamente no caso que ele existe para pegar. Fixar a lista repetia, em miniatura, o erro
# de método que esta leva corrigiu no portão: tratar um retrato como se fosse a medição.
#
# `_criadas_por_migracao()` vê o SQL que a cadeia emite, inclusive os `.sql` externos, então
# qualquer `guilda_*`/`social_*` criada por migração entra sozinha.
def _dominio() -> set[str]:
    return {n for n in _criadas_por_migracao() if n.startswith(("guilda_", "social_"))}


# Piso anti-vacuidade: as 39 medidas na produção em 2026-10-20. Se a derivação quebrar e passar a
# devolver pouco (ou nada), o teste de cobertura ficaria verde por vacuidade — este conjunto é o
# que impede isso. Derivado e medido coincidem hoje, nos 39.
_DOMINIO_MEDIDO_NA_PRODUCAO = frozenset({
    "guilda_aceitar_convite", "guilda_atualizar", "guilda_atualizar_config",
    "guilda_bloqueio_ativo", "guilda_cancelar_convite", "guilda_chat_enviar",
    "guilda_chat_listar", "guilda_chat_questao_responder", "guilda_classe_atual",
    "guilda_configurar_turma", "guilda_congelar_composicao", "guilda_convidar",
    "guilda_criar", "guilda_desafio_criar", "guilda_desafio_responder", "guilda_dissolver",
    "guilda_e_colega", "guilda_entrar", "guilda_formacao_da_turma", "guilda_janela_aberta",
    "guilda_janela_da_turma", "guilda_listar", "guilda_recusar_convite", "guilda_sair",
    "social_aceitar_convite", "social_bloquear", "social_chat_enviar", "social_chat_listar",
    "social_desbloquear", "social_desfazer_amizade", "social_enviar_convite",
    "social_listar_pessoas", "social_notificar_evento", "social_par", "social_perfil_publico",
    "social_presenca_aluno", "social_presenca_turma", "social_recusar_convite",
    "social_sao_colegas",
})

_REVOGA_POR_TEMPLATE = {
    "20261002_02_social_notificar_sem_grant_de_aluno.py": ("social_notificar_evento",),
}

# Decisão registrada, não esquecimento: ver o docstring da `_23`. `IMMUTABLE`, não é DEFINER,
# e o corpo é `LEAST`/`GREATEST` de dois uuid — não toca tabela, então PUBLIC não entrega dado.
_SEM_REVOKE_DE_PROPOSITO = {"social_par"}

# As 20 que a `_23` fecha, com a assinatura exata da produção.
_ASSINATURAS_ESPERADAS = (
    "public.guilda_bloqueio_ativo(uuid, uuid)",
    "public.guilda_cancelar_convite(uuid)",
    "public.guilda_classe_atual(bigint)",
    "public.guilda_congelar_composicao(text, bigint)",
    "public.guilda_criar(bigint, text, text, text, text, text, text)",
    "public.guilda_janela_aberta(bigint)",
    "public.guilda_listar(bigint)",
    "public.social_aceitar_convite(uuid)",
    "public.social_bloquear(uuid)",
    "public.social_chat_enviar(uuid, text)",
    "public.social_chat_listar(uuid)",
    "public.social_desbloquear(uuid)",
    "public.social_desfazer_amizade(uuid)",
    "public.social_enviar_convite(uuid)",
    "public.social_listar_pessoas()",
    "public.social_listar_pessoas(bigint)",
    "public.social_perfil_publico(uuid, bigint)",
    "public.social_presenca_aluno(uuid)",
    "public.social_presenca_turma(bigint)",
    "public.social_recusar_convite(uuid)",
)


def _funcoes_com_revoke_na_cadeia() -> set[str]:
    emitido = "\n".join(_texto_emitido(a) for a in sorted(_VERSOES.glob("*.py")))
    com: set[str] = set()
    for nome in _dominio():
        if re.search(r"REVOKE[^;]*ON FUNCTION\s+public\." + nome + r"\s*\(", emitido, re.I):
            com.add(nome)
    for nomes in _REVOGA_POR_TEMPLATE.values():
        com |= set(nomes)
    return com


def test_encadeia_depois_da_22() -> None:
    assert _M23.revision == "20261021_23"
    assert _M23.down_revision == "20261021_22"


def test_nenhuma_funcao_do_dominio_fica_sem_revoke() -> None:
    """A conta que faltava. Sem ela, função nova no domínio volta a nascer aberta ao anônimo —
    e nada reclama, porque o padrão do Postgres (PUBLIC) e o `ALTER DEFAULT PRIVILEGES` da
    produção (anon) concedem EXECUTE sozinhos. Falha verde é o pior caso aqui."""
    dominio = _dominio()
    faltando_no_derivado = sorted(_DOMINIO_MEDIDO_NA_PRODUCAO - dominio)
    assert not faltando_no_derivado, (
        "A derivação do domínio deixou de ver funções que a produção tem:\n  "
        + "\n  ".join(faltando_no_derivado)
        + "\n\nSem isto o teste abaixo passaria por vacuidade."
    )
    sem = sorted(dominio - _funcoes_com_revoke_na_cadeia() - _SEM_REVOKE_DE_PROPOSITO)
    assert not sem, (
        "Estas funções de guilda/social não têm REVOKE em nenhum ponto da cadeia, então um banco "
        "construído do zero as entrega ao anônimo:\n  " + "\n  ".join(sem) +
        "\n\nAcrescente o REVOKE na migration que cria a função."
    )


def test_as_vinte_assinaturas_revogam_antes_de_conceder() -> None:
    sql = _M23.PRIVILEGIOS
    assert sql.count("REVOKE ALL ON FUNCTION") == 20
    for assinatura in _ASSINATURAS_ESPERADAS:
        assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon;" in sql, assinatura
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role;" in sql, assinatura
        # GRANT antes do REVOKE seria revogado em seguida — o bug silencioso deste tipo de migration.
        assert sql.index(f"REVOKE ALL ON FUNCTION {assinatura}") < sql.index(
            f"GRANT EXECUTE ON FUNCTION {assinatura}"
        ), assinatura


def test_revoga_de_publico_e_nao_so_de_anon() -> None:
    """`anon` é o papel do Supabase; `PUBLIC` é todo mundo, e é o que o Postgres concede sozinho.
    Revogar só de `anon` deixaria a função aberta num Postgres comum (Docker local)."""
    sql = _M23.PRIVILEGIOS
    assert "FROM PUBLIC, anon;" in sql
    assert re.search(r"REVOKE ALL ON FUNCTION [^;]+ FROM anon;", sql) is None


def test_nao_mexe_nas_que_sao_fechadas_de_proposito() -> None:
    """`guilda_e_colega` e `social_sao_colegas` perderam EXECUTE até para `authenticated` na
    `20261018_04`. Incluí-las aqui as reabriria para o aluno — regressão de uma correção de
    segurança, com cara de padronização."""
    sql = _M23.PRIVILEGIOS
    for nome in ("guilda_e_colega", "social_sao_colegas", "social_par"):
        assert f"public.{nome}(" not in sql, nome


def test_o_downgrade_nao_reconcede() -> None:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_23:20261021_22", sql=True)
    sql = output.getvalue()
    assert "GRANT" not in sql.upper()


def test_sobrecarga_das_duas_social_listar_pessoas() -> None:
    """Ela tem duas assinaturas na produção (`()` e `(bigint)`). `REVOKE` sem a lista de tipos
    não é ambíguo no Postgres só quando há uma única função com o nome — com sobrecarga, erra."""
    sql = _M23.PRIVILEGIOS
    assert "public.social_listar_pessoas()" in sql
    assert "public.social_listar_pessoas(bigint)" in sql
