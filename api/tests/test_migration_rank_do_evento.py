"""Estrutura da `20261104_01` (rank do evento, #155 fase 2). O comportamento está no e2e."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261104_01_rank_do_evento.py")


def test_encadeia_depois_da_20261103_15():
    assert M.revision == "20261104_01"
    assert M.down_revision == "20261103_15"


def test_sql_novo_sem_porcentagem():
    # O SQL offline do Alembic dobra `%` e corrompe o plpgsql sem erro. O que vem de migration
    # anterior (o `"%"` do RAISE da `20261021_16`, o `%ROWTYPE` dos miolos da `20261025_04`) já está
    # em produção assim; o que esta migration escreve não acrescenta nenhum.
    for sql in (
        M.TABELA,
        M.COLUNAS,
        M.RPCS,
        M.DESFAZ,
        M.APAGA_RANKS_DE_EVENTO,
        M.guarda_evento_nova(),
        M.guarda_ranks_nova(),
        M.view_nova(),
        M.notificacoes_nova(),
    ):
        assert "%" not in sql
    assert M.novo_periodo_novo().count("%") == M.novo_periodo_antigo().count("%")
    assert M.miolos_novos().count("%") == M.miolos_antigos().count("%")


def test_tabela_nova_nasce_com_rls_policy_e_retencao_no_mesmo_bloco():
    sql = M.TABELA
    assert "ALTER TABLE public.evento_inscricoes ENABLE ROW LEVEL SECURITY" in sql
    assert "CREATE POLICY evento_inscricoes_sel ON public.evento_inscricoes FOR SELECT TO authenticated" in sql
    assert "app_classes_do_professor()" in sql
    assert "INSERT INTO public.retencao_politica" in sql


def test_cliente_so_le_a_tabela():
    sql = M.TABELA
    assert "REVOKE ALL ON public.evento_inscricoes FROM PUBLIC, anon, authenticated;" in sql
    assert "GRANT SELECT ON public.evento_inscricoes TO authenticated;" in sql
    assert not re.search(r"CREATE POLICY \w+ ON public\.evento_inscricoes FOR (INSERT|UPDATE|DELETE|ALL)", sql)


def test_rpcs_conferem_a_posse_antes_de_ler_e_nao_abrem_para_anon():
    for nome in ("evento_classe_inscrever", "evento_classe_sair"):
        corpo = M._funcao(M.RPCS, nome, "RPCS")
        assert corpo.index("app_classes_do_aluno()") < corpo.index("RAISE EXCEPTION")
        assert "SECURITY DEFINER" in corpo
        assert f"REVOKE ALL ON FUNCTION public.{nome}(uuid) FROM PUBLIC, anon;" in M.RPCS
        assert f"GRANT EXECUTE ON FUNCTION public.{nome}(uuid) TO authenticated, service_role;" in M.RPCS


def test_criterios_aceitos_sao_os_que_respeitam_a_janela():
    assert M.CRITERIOS == ("pontuacao", "missoes", "ranqueada")
    assert "ARRAY['pontuacao', 'missoes', 'ranqueada']::text[]" in M.COLUNAS
    assert M.CRITERIO_PADRAO in M.CRITERIOS


def test_view_nao_ganha_funcao_nova():
    # Função chamada na view precisa de EXECUTE para o cliente: foi o 42501 de 29/10.
    antiga, nova = M.view_antiga(), M.view_nova()
    assert re.findall(r"public\.\w+\(", nova) == re.findall(r"public\.\w+\(", antiga)
    assert "security_invoker" not in nova  # a `_todas` segue sem invoker e sem GRANT de cliente


def test_view_filtra_inscritos_e_conta_duelo_so_no_rank_do_evento():
    nova = M.view_nova()
    assert "WHERE r.evento_id IS NULL\n             OR EXISTS (SELECT 1 FROM evento_inscricoes i" in nova
    assert "AND (NOT e.fora_do_xp OR rj.evento_id IS NOT NULL)" in nova


def test_abrir_nao_levanta_por_criterio_sem_tipo():
    # `fn_eventos_classe_varrer` engole exceção como `falhas`: o evento agendado não abriria.
    abrir = M._funcao(M.miolos_novos(), "fn_evento_classe_abrir_agora", "miolos_novos")
    trecho = abrir[abrir.index("IF v_evento.pecas ? 'arena'") :]
    assert "RAISE" not in trecho[: trecho.index("RETURN jsonb_build_object('status', 'aberto', 'guildas_congeladas', v_guildas, 'ranks'")]
    assert "WHERE t.tipo_id IS NOT NULL" in trecho


def test_encerrar_encurta_o_rank_antes_de_apurar():
    encerrar = M._funcao(M.miolos_novos(), "fn_evento_classe_encerrar_agora", "miolos_novos")
    assert encerrar.index("UPDATE public.ranks") < encerrar.index("fn_evento_classe_apurar")


def test_flag_do_rank_e_desligada_depois_de_usar():
    for sql in (M.miolos_novos(), M.APAGA_RANKS_DE_EVENTO):
        assert sql.count("set_config('app.rank_periodo', 'on', true)") == sql.count(
            "set_config('app.rank_periodo', '', true)"
        )


def test_notificacao_de_rank_ignora_rank_de_evento():
    assert "AND r.evento_id IS NULL" in M.notificacoes_nova()
    assert "AND r.evento_id IS NULL" not in M.notificacoes_antiga()


def test_downgrade_volta_a_view_antes_de_tirar_a_coluna():
    sql = f5.sql_de(M, "downgrade")
    assert sql.index(M.APAGA_RANKS_DE_EVENTO) < sql.index(M.guarda_ranks_antiga())
    assert sql.index(M.view_antiga()) < sql.index(M.DESFAZ)
    assert sql.index(M.miolos_antigos()) < sql.index(M.DESFAZ)
