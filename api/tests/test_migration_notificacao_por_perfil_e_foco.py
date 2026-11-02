"""Estrutura da `20261102_18` (notificação por perfil, por amizade e com modo de foco, #149)."""

from __future__ import annotations

import json
import re

from tests import _f5_banco as f5

M = f5.modulo("20261102_18_notificacao_por_perfil_e_foco.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))

TABELAS_NOVAS = (
    "aluno_modo_foco",
    "aluno_estado_atencao",
    "notificacoes_silenciadas",
    "notificacoes_silenciamento_log",
    "rank_posicao_anterior",
)


def test_encadeia_depois_da_17_de_02_11():
    assert M.revision == "20261102_18"
    assert M.down_revision == "20261102_17"


def test_sem_porcentagem_literal():
    # O SQL offline do Alembic dobra `%` e corrompe plpgsql sem erro (memória do projeto).
    assert "%" not in UP
    assert "%" not in DOWN


def test_toda_tabela_nova_nasce_com_rls_e_policy_ou_com_a_ausencia_documentada():
    for tabela in TABELAS_NOVAS:
        assert f"ALTER TABLE public.{tabela} ENABLE ROW LEVEL SECURITY" in UP
        assert f"REVOKE ALL ON TABLE public.{tabela} FROM PUBLIC, anon, authenticated" in UP
    for tabela in ("aluno_modo_foco", "notificacoes_silenciadas", "notificacoes_silenciamento_log"):
        assert f"CREATE POLICY {tabela}_sel ON public.{tabela}\n  FOR SELECT TO authenticated USING (aluno_id = auth.uid())" in UP
        assert f"GRANT SELECT ON TABLE public.{tabela} TO authenticated" in UP
    for tabela in ("aluno_estado_atencao", "rank_posicao_anterior"):
        assert f"CREATE POLICY {tabela}" not in UP
        comentario = re.search(rf"COMMENT ON TABLE public\.{tabela} IS(.*?);", UP, re.S).group(1)
        assert "Sem" in comentario and "policy de" in comentario


def test_toda_tabela_nova_tem_prazo_em_retencao_politica():
    for tabela in TABELAS_NOVAS:
        assert f"('{tabela}', 'vida_da_conta', 'aluno_id'" in M.RETENCAO
        assert f"'{tabela}'" in DOWN.split("DELETE FROM public.retencao_politica", 1)[1].split(")", 1)[0]
    assert UP.index("CREATE TABLE IF NOT EXISTS public.rank_posicao_anterior") < UP.index(
        "INSERT INTO public.retencao_politica"
    )


def test_cliente_nao_escreve_nas_tabelas_novas():
    assert not re.search(r"GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated", UP)


def test_so_as_rpcs_do_app_tem_execute_para_o_aluno():
    concedidas = set(re.findall(r"GRANT EXECUTE ON FUNCTION public\.(\w+)\(", UP))
    assert concedidas == {
        "notificacoes_meu_foco",
        "notificacoes_iniciar_foco",
        "notificacoes_encerrar_foco",
        "notificacoes_silenciar_tipo",
    }
    for interna in (
        "notificacoes_em_foco(uuid)",
        "notificacoes_destino(uuid, text)",
        "notificacoes_enfileirar_evento(uuid, text, text, text, text, jsonb, integer, integer)",
        "notificacoes_entregar(uuid, text[])",
        "notificacoes_rank_varrer()",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{interna} FROM PUBLIC, anon, authenticated" in UP


def test_funcoes_definer_fixam_search_path():
    cabecalhos = re.findall(r"CREATE OR REPLACE FUNCTION public\.\w+\(.*?\bAS \$fn\$", M.FUNCOES, re.S)
    assert len(cabecalhos) == 9
    for cabecalho in cabecalhos:
        assert "SECURITY DEFINER SET search_path = public, pg_temp" in cabecalho


def test_matriz_de_monterrat_entra_na_config():
    pesos = {
        chave.removeprefix("perfil_pesos_"): json.loads(valor)
        for chave, valor in re.findall(r"\('(perfil_pesos_\w+)', '(\{[^']*\})'", UP)
    }
    assert pesos["rank"] == {
        "conqueror": 1.0, "achiever": 0.75, "daredevil": 0.63, "mastermind": 0.63, "socializer": 0.13
    }
    assert pesos["amigo_rank"] == {"socializer": 1.0}
    assert pesos["novo_material"] == {"seeker": 0.88, "achiever": 1.0}
    assert pesos["sequencia"] == {"achiever": 1.0}
    for chave in ("perfil_peso_minimo_pct", "atencao_limiar_baixa_pct", "atencao_validade_min",
                  "foco_por_atencao", "rank_notificar_descida", "tipos_silenciaveis"):
        assert f"('{chave}'," in UP
    assert "ON CONFLICT (chave) DO NOTHING" in UP


def test_funcoes_recortadas_mudam_so_onde_precisam():
    promover = M.promover_nova()
    assert promover.replace(
        "\n\n  -- Para quem (#149): perfil dominante e tipo silenciado decidem antes da fila.\n"
        "  v_barra := public.notificacoes_destino(NEW.aluno_id, NEW.tipo);\n"
        "  IF v_barra IS NOT NULL THEN\n"
        "    UPDATE notificacoes_ia SET status = 'suprimida', motivo = v_barra WHERE id = NEW.id;\n"
        "    RETURN NEW;\n"
        "  END IF;\n",
        "\n",
    ).replace("  v_barra  text;\n", "") == M.promover_anterior()
    assert M.varrer_nova().count("gatilho = 'fim_foco'") == 1
    push = M.push_nova()
    assert "notificacoes_em_foco(p_aluno) IS NOT NULL" in push
    assert push.count("net.http_post(") == M.push_anterior().count("net.http_post(") == 1


def test_entrega_nova_mantem_teto_expiracao_e_caixa_antes_do_push():
    entregar = re.search(
        r"CREATE OR REPLACE FUNCTION public\.notificacoes_entregar\(.*?\$fn\$;", M.FUNCOES, re.S
    ).group(0)
    assert "status = 'expirada'" in entregar
    assert "ultimo_erro = 'teto diario'" in entregar
    assert entregar.index("INSERT INTO notificacoes (") < entregar.index("notificacoes_enviar_push(")
    # Em foco a função sai antes de entregar qualquer coisa.
    assert entregar.index("IF v_foco IS NOT NULL THEN") < entregar.index("FOR v_reg IN")


def test_rank_so_nomeia_amigo_dentro_do_corte():
    rank = re.search(
        r"CREATE OR REPLACE FUNCTION public\.notificacoes_rank_varrer\(.*?\$fn\$;", M.FUNCOES, re.S
    ).group(0)
    assert "app_rank_limite_visivel()" in rank
    corte = rank.index("IF v_reg.posicao <= v_limite THEN")
    assert corte < rank.index("FROM social_relacionamentos sr")
    assert "sr.status = 'accepted'" in rank


def test_cron_do_rank_e_best_effort():
    assert "IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')" in M.CRON_SQL
    assert f"cron.schedule('{M.JOB_RANK}', '*/10 * * * *'" in M.CRON_SQL


def test_downgrade_volta_funcoes_antes_de_tirar_tabelas():
    for tabela in TABELAS_NOVAS:
        assert f"DROP TABLE IF EXISTS public.{tabela}" in DOWN
    assert DOWN.index("CREATE OR REPLACE FUNCTION public.notificacoes_entregar(") < DOWN.index(
        "DROP TABLE IF EXISTS public.aluno_modo_foco"
    )
    assert "CHECK (gatilho IN ('horario', 'login', 'tempo_uso'))" in DOWN
