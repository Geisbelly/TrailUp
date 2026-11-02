"""Estrutura da `20261102_21` (quem produz `novo_material` e `sequencia`, #149)."""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261102_21_notificacao_novo_material_e_sequencia.py")
M18 = f5.modulo("20261102_18_notificacao_por_perfil_e_foco.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))

PRODUTORES = ("notificacoes_novo_material_produzir", "notificacoes_sequencia_produzir")


def _funcao(nome: str) -> str:
    return re.search(rf"CREATE OR REPLACE FUNCTION public\.{nome}\(.*?\$fn\$;", M.FUNCOES, re.S).group(0)


def test_encadeia_depois_da_18_de_02_11():
    assert M.revision == "20261102_21"
    assert M.down_revision == "20261102_20"


def test_sem_porcentagem_literal():
    # O SQL offline do Alembic dobra `%` e corrompe plpgsql sem erro (memória do projeto).
    assert "%" not in UP
    assert "%" not in DOWN


def test_tipos_produzidos_ja_estao_na_matriz_e_sao_silenciaveis():
    for tipo in ("novo_material", "sequencia"):
        assert tipo in M18.PESOS
        assert tipo in M18.TIPOS_SILENCIAVEIS.split(",")
        assert f"'{tipo}'" in M.FUNCOES


def test_tabela_nova_nasce_fechada_e_com_a_ausencia_de_policy_documentada():
    assert "ALTER TABLE public.notificacoes_material_pronto ENABLE ROW LEVEL SECURITY" in UP
    assert "REVOKE ALL ON TABLE public.notificacoes_material_pronto FROM PUBLIC, anon, authenticated" in UP
    assert "CREATE POLICY" not in UP
    assert not re.search(r"GRANT [^;]*TO (anon|authenticated)", UP)
    comentario = re.search(r"COMMENT ON TABLE public\.notificacoes_material_pronto IS(.*?);", UP, re.S).group(1)
    assert "Sem policy de" in comentario


def test_tabela_nova_tem_prazo_em_retencao_politica():
    assert "('notificacoes_material_pronto', 'vida_da_conta', 'aluno_id'" in M.RETENCAO
    assert UP.index("CREATE TABLE IF NOT EXISTS public.notificacoes_material_pronto") < UP.index(
        "INSERT INTO public.retencao_politica"
    )
    assert "DELETE FROM public.retencao_politica WHERE tabela IN ('notificacoes_material_pronto')" in DOWN


def test_um_aviso_por_aluno_e_topico_pela_chave_da_tabela():
    assert "PRIMARY KEY (aluno_id, topico_id)" in M.TABELA
    material = _funcao("notificacoes_novo_material_produzir")
    assert "ON CONFLICT (aluno_id, topico_id) DO NOTHING" in material
    # A tabela é gravada antes da carência: matrícula recente não recebe nem depois.
    assert material.index("INSERT INTO notificacoes_material_pronto") < material.index("make_interval(hours => v_carencia)")


def test_produtores_entram_pela_porta_dos_eventos_e_nunca_derrubam_quem_escreve():
    for nome in PRODUTORES:
        corpo = _funcao(nome)
        assert "SECURITY DEFINER SET search_path = public, pg_temp" in corpo
        assert "public.notificacoes_enfileirar_evento(" in corpo
        assert "INSERT INTO notificacoes_pendentes" not in corpo
        assert "EXCEPTION WHEN OTHERS THEN" in corpo
        assert "RAISE WARNING" in corpo
        assert f"REVOKE ALL ON FUNCTION public.{nome}() FROM PUBLIC, anon, authenticated" in UP


def test_novo_material_respeita_a_trava_do_estudo_antes_de_registrar():
    material = _funcao("notificacoes_novo_material_produzir")
    assert "public.estudo_personalizacao_retida(NEW.classe_id)" in material
    assert material.index("estudo_personalizacao_retida") < material.index("INSERT INTO notificacoes_material_pronto")


def test_novo_material_espera_o_topico_inteiro():
    material = _funcao("notificacoes_novo_material_produzir")
    assert "cp.status = 'processando_midias'" in material
    assert "j.status IN ('pending', 'processing')" in material
    assert "t.conteudo_id IS DISTINCT FROM NEW.conteudo_id" in material
    assert "'classe:' || NEW.classe_id::text" in material  # um aviso por turma por dia


def test_sequencia_age_so_ao_cruzar_o_limiar_e_so_nos_marcos():
    sequencia = _funcao("notificacoes_sequencia_produzir")
    assert "v_antes >= v_limiar OR COALESCE(NEW.tempo_uso_seg, 0) < v_limiar" in sequencia
    assert "v_dias::text = ANY(" in sequencia


def test_gatilhos():
    assert (
        f"CREATE TRIGGER {M.TRIGGER_MATERIAL}\n  AFTER INSERT OR UPDATE OF status ON public.conteudo_personalizado"
        in UP
    )
    assert (
        f"CREATE TRIGGER {M.TRIGGER_SEQUENCIA}\n  AFTER INSERT OR UPDATE OF tempo_uso_seg ON public.aluno_atividade_diaria"
        in UP
    )
    assert f"DROP TRIGGER IF EXISTS {M.TRIGGER_MATERIAL} ON public.conteudo_personalizado;" in UP


def test_config_nao_sobrescreve_o_que_o_professor_ajustou():
    for chave in M.CHAVES_CONFIG:
        assert f"('{chave}'," in UP
    assert "ON CONFLICT (chave) DO NOTHING" in UP


def test_downgrade_tira_tudo():
    for trecho in (
        f"DROP TRIGGER IF EXISTS {M.TRIGGER_SEQUENCIA} ON public.aluno_atividade_diaria",
        f"DROP TRIGGER IF EXISTS {M.TRIGGER_MATERIAL} ON public.conteudo_personalizado",
        "DROP FUNCTION IF EXISTS public.notificacoes_sequencia_produzir()",
        "DROP FUNCTION IF EXISTS public.notificacoes_novo_material_produzir()",
        "DROP TABLE IF EXISTS public.notificacoes_material_pronto",
    ):
        assert trecho in DOWN
    assert DOWN.index("DROP TRIGGER") < DOWN.index("DROP FUNCTION") < DOWN.index("DROP TABLE")
    for chave in M.CHAVES_CONFIG:
        assert f"'{chave}'" in DOWN
