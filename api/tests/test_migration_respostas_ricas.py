"""`20261110_02`: código, numérica e expressão, com o gabarito fora de `questoes` (spec B, PR 1).

Estrutura do SQL offline. O comportamento, com os gatilhos, a RLS e o papel de verdade, está em
`test_e2e_respostas_ricas.py`.
"""

import importlib.util
import re
from io import StringIO
from pathlib import Path

from app.db import migrations
from tests.test_migrations import _offline_alembic_config

REV = "20261110_02"
ANT = "20261110_01"
NOVOS_QUESTAO = ("codigo", "numerica", "expressao")
NOVOS_ATIVIDADE = ("code", "numeric", "expression")
VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), f"{ANT}:{REV}", sql=True)
    return output.getvalue()


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), f"{REV}:{ANT}", sql=True)
    return output.getvalue()


def _funcao(sql: str, nome: str) -> str:
    inicio = sql.index(f"CREATE OR REPLACE FUNCTION public.{nome}(")
    delimitador = re.search(r"AS (\$\w*\$)", sql[inicio:]).group(1)
    return sql[inicio : sql.index(f"{delimitador};", inicio)]


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_check_de_atividades_aceita_os_tipos_novos_e_o_null() -> None:
    sql = _upgrade_sql()
    assert "ALTER TABLE public.atividades DROP CONSTRAINT IF EXISTS atividades_tipo_conhecido" in sql
    check = re.search(r"ADD CONSTRAINT atividades_tipo_conhecido CHECK \((.*?)\);", sql, re.S).group(1)
    assert check.startswith("tipo IS NULL OR tipo IN (")
    for tipo in ("quiz", "true_false", "fill_blank", "essay", "missao", *NOVOS_ATIVIDADE):
        assert f"'{tipo}'" in check


def test_colunas_novas_sao_aditivas() -> None:
    sql = _upgrade_sql()
    assert "ALTER TABLE public.questoes ADD COLUMN IF NOT EXISTS config_resposta jsonb" in sql
    assert "ALTER TABLE public.questao_gabarito ADD COLUMN IF NOT EXISTS criterios jsonb" in sql


def test_tipos_novos_nao_guardam_gabarito_em_questoes() -> None:
    sql = _upgrade_sql()
    check = re.search(r"ADD CONSTRAINT questoes_gabarito_fora_dos_tipos_novos CHECK \((.*?)\);", sql, re.S).group(1)
    assert "resposta_correta IS NULL" in check
    for tipo in NOVOS_QUESTAO:
        assert f"'{tipo}'" in check


def test_espelho_nao_copia_os_tipos_novos_e_fica_versionado() -> None:
    sql = _upgrade_sql()
    espelho = _funcao(sql, "fn_questoes_espelha_gabarito")
    pula = espelho.index("RETURN NEW")
    assert pula < espelho.index("INSERT INTO public.questao_gabarito")
    for tipo in NOVOS_QUESTAO:
        assert f"'{tipo}'" in espelho[:pula]
    assert "CREATE TRIGGER trg_questoes_espelha_gabarito AFTER INSERT OR UPDATE ON public.questoes" in sql


def test_questao_responder_recusa_os_tipos_novos_antes_de_conferir() -> None:
    responder = _funcao(_upgrade_sql(), "questao_responder")
    recusa = responder.index("'questao_corrigida_no_servidor'")
    assert recusa < responder.index("public.fn_questao_confere(p_questao_id, p_resposta)")
    for tipo in NOVOS_QUESTAO:
        assert f"'{tipo}'" in responder[:recusa]


def test_codigo_e_corrigido_pela_ia_e_nunca_libera_a_esperada() -> None:
    sql = _upgrade_sql()
    ajudante = _funcao(sql, "fn_questao_corrigida_por_ia")
    assert "public.fn_questao_e_dissertativa(p_questao_id)" in ajudante
    assert "q.tipo = 'codigo'" in ajudante
    assert "REVOKE ALL ON FUNCTION public.fn_questao_corrigida_por_ia(bigint) FROM PUBLIC, anon, authenticated" in sql
    for nome in (
        "fn_questao_registrar_resposta",
        "questao_revelar_gabarito",
        "questao_correcao_ia_contexto",
        "questao_registrar_correcao_ia",
        "questao_gabarito_do_aluno",
    ):
        corpo = _funcao(sql, nome)
        assert "public.fn_questao_corrigida_por_ia(p_questao_id)" in corpo, nome
        assert "fn_questao_e_dissertativa" not in corpo, nome
    registrar = _funcao(sql, "fn_questao_registrar_resposta")
    assert "v_liberado := NOT v_dissertativa AND" in registrar


def test_gabarito_do_aluno_nao_devolve_a_esperada_da_ia() -> None:
    funcao = _funcao(_upgrade_sql(), "questao_gabarito_do_aluno")
    guarda = funcao.index("public.fn_questao_corrigida_por_ia(p_questao_id)")
    assert guarda < funcao.index("FROM public.questao_gabarito g")


def test_contexto_da_ia_devolve_linguagem_e_criterios() -> None:
    contexto = _funcao(_upgrade_sql(), "questao_correcao_ia_contexto")
    for chave in ("'tipo'", "'config_resposta'", "'criterios'", "'resposta_esperada'"):
        assert chave in contexto


def test_rpcs_novas_so_para_o_servidor() -> None:
    sql = _upgrade_sql()
    for assinatura in (
        "questao_conferencia_contexto(uuid, bigint)",
        "questao_registrar_correcao_servidor(uuid, bigint, text, boolean, integer)",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon, authenticated" in sql
        assert f"GRANT EXECUTE ON FUNCTION public.{assinatura} TO service_role" in sql
    contexto = _funcao(sql, "questao_conferencia_contexto")
    assert contexto.index("public.fn_questao_acesso(p_aluno, p_questao_id)") < contexto.index("questao_gabarito")
    for chave in ("'tipo'", "'resposta_esperada'", "'criterios'", "'config_resposta'"):
        assert chave in contexto
    registrar = _funcao(sql, "questao_registrar_correcao_servidor")
    assert "public.fn_questao_registrar_resposta(" in registrar
    assert "CASE WHEN COALESCE(p_correta, false) THEN 100 ELSE 0 END" in registrar
    # Código vai pela IA: as duas só aceitam numérica e expressão.
    for corpo in (contexto, registrar):
        assert "('numerica', 'expressao')" in corpo
        assert "'codigo'" not in corpo


def test_as_tres_copias_levam_config_e_a_linha_do_gabarito() -> None:
    sql = _upgrade_sql()
    for nome in ("duplicar_classe", "duplicar_topico", "duplicar_atividade"):
        corpo = _funcao(sql, nome)
        listas = re.findall(r"INSERT INTO public\.questoes \(([^)]*)\)", corpo)
        assert len(listas) == 1, nome
        assert {"config_resposta", "formato_texto"} <= {c.strip() for c in listas[0].split(",")}
        assert "v_questao.config_resposta" in corpo
        assert "LEFT JOIN public.questao_gabarito g ON g.questao_id = q.id" in corpo
        assert "INSERT INTO public.questao_gabarito (questao_id, resposta_correta, criterios)" in corpo
        # O espelho já gravou a resposta dos tipos de antes: a cópia só acrescenta os critérios.
        assert "ON CONFLICT (questao_id) DO UPDATE SET criterios = EXCLUDED.criterios" in corpo
        for proibido in ("questao_aluno", "telemetria"):
            assert proibido not in corpo


def test_notas_fila_reconhece_codigo_e_le_o_gabarito_de_questao_gabarito() -> None:
    funcao = _funcao(_upgrade_sql(), "notas_fila")
    assert "IN ('essay', 'dissertativa', 'questao', 'texto', 'code')" in funcao
    assert "LEFT JOIN public.questao_gabarito g1 ON g1.questao_id = q1.id" in funcao
    assert "COALESCE(g1.resposta_correta, q1.resposta_correta)" in funcao


def test_tipos_novos_ficam_fora_da_recorrecao_automatica() -> None:
    objetivos = _modulo("20261101_12_alteracao_do_professor.py").TIPOS_OBJETIVOS
    for tipo in (*NOVOS_QUESTAO, *NOVOS_ATIVIDADE):
        assert tipo not in objetivos
    assert "fn_alteracao_questao_objetiva" not in _upgrade_sql()


def test_downgrade_volta_check_e_funcoes_e_tira_as_colunas() -> None:
    down = _downgrade_sql()
    check = re.search(r"ADD CONSTRAINT atividades_tipo_conhecido CHECK \((.*?)\);", down, re.S).group(1)
    assert "'missao'" in check
    for tipo in NOVOS_ATIVIDADE:
        assert f"'{tipo}'" not in check
    assert "DROP CONSTRAINT IF EXISTS questoes_gabarito_fora_dos_tipos_novos" in down
    assert "DROP COLUMN IF EXISTS config_resposta" in down
    assert "DROP COLUMN IF EXISTS criterios" in down
    for assinatura in (
        "questao_conferencia_contexto(uuid, bigint)",
        "questao_registrar_correcao_servidor(uuid, bigint, text, boolean, integer)",
        "fn_questao_corrigida_por_ia(bigint)",
    ):
        assert f"DROP FUNCTION IF EXISTS public.{assinatura}" in down
    # As funções voltam antes de a coluna sumir, e sem o que esta migration acrescentou.
    assert "config_resposta" not in _funcao(down, "duplicar_classe")
    assert "fn_questao_corrigida_por_ia" not in _funcao(down, "fn_questao_registrar_resposta")
    assert "questao_corrigida_no_servidor" not in _funcao(down, "questao_responder")
    assert "'codigo'" not in _funcao(down, "fn_questoes_espelha_gabarito")
    assert "'code'" not in _funcao(down, "notas_fila")
    assert down.index("CREATE OR REPLACE FUNCTION public.duplicar_classe(") < down.index(
        "DROP COLUMN IF EXISTS config_resposta"
    )
    # Não devolve gabarito a `questoes`: nada de UPDATE nela.
    assert "UPDATE public.questoes" not in down
