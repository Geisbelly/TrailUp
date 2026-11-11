"""Estrutura da `20261110_10` (visibilidade do tópico: rascunho, publicado, agendado).

O comportamento (o que cada papel lê) foi medido num Postgres descartável com papéis e
policies de posse como as de produção; aqui fica o que não pode regredir no texto.
"""

from __future__ import annotations

import re

from tests import _f5_banco as f5

M = f5.modulo("20261110_10_visibilidade_do_topico.py")
UP = "\n".join(f5.sql_de(M))
DOWN = "\n".join(f5.sql_de(M, "downgrade"))


def test_encadeia_depois_da_aprovacao_do_personalizado():
    assert M.revision == "20261110_10"
    assert M.down_revision == "20261110_09"


def test_sem_porcentagem_nem_bind():
    assert "%" not in UP and "%" not in DOWN
    assert not re.search(r"(?<!:):[A-Za-z_]", UP)


def test_o_que_existe_fica_publicado_e_o_novo_nasce_rascunho():
    # A ordem importa: a coluna nasce com `publicado` (linhas atuais) e só depois o default muda.
    nasce = UP.index("ADD COLUMN IF NOT EXISTS publicacao text NOT NULL DEFAULT 'publicado'")
    muda = UP.index("ALTER COLUMN publicacao SET DEFAULT 'rascunho'")
    assert nasce < muda


def test_estados_e_agendado_com_data():
    assert "CHECK (publicacao IN ('rascunho', 'publicado', 'agendado'))" in UP
    assert "CHECK (publicacao <> 'agendado' OR publicar_em IS NOT NULL)" in UP


def test_agendado_abre_pela_hora_e_a_varredura_so_acerta_as_contas():
    # A visibilidade sai da leitura (now()); o cron não decide quem vê, só o estado e as contas.
    assert "p_publicar_em <= now()" in UP
    assert f"cron.schedule('{M.JOB}', '* * * * *', 'SELECT public.fn_topicos_abrir_agendados()')" in UP
    corpo = UP[UP.index("FUNCTION public.fn_topicos_abrir_agendados"):]
    corpo = corpo[: corpo.index("$fn$;")]
    assert "SET publicacao = 'publicado'" in corpo
    assert "publicar_em = " not in corpo  # a data de abertura fica como registro
    assert "trailup_recalcular_classe_aluno" in corpo
    assert f"cron.unschedule('{M.JOB}')" in DOWN


def test_contas_so_contam_topico_liberado():
    # Âncora + filtro, trocados no texto vivo das duas funções.
    for assinatura, de, para in (M.PERCENTUAL, M.NOTA):
        assert para.count(M.MARCA_DAS_CONTAS) == 1
        assert de not in para or para.startswith(de)
        assert f"to_regprocedure('{assinatura}')" in UP
        assert f"to_regprocedure('{assinatura}')" in DOWN
    # Sem a âncora, para (não segue sem o filtro); no downgrade, só sai se não houver o que tirar.
    assert UP.count("sem a ancora esperada';") == 2
    assert "RAISE EXCEPTION" not in DOWN


def test_mudar_visibilidade_recalcula_uma_vez_por_aluno():
    assert "REFERENCING OLD TABLE AS velhos NEW TABLE AS novos" in UP
    assert "FOR EACH STATEMENT EXECUTE FUNCTION public.fn_topicos_visibilidade_recalcular()" in UP
    corpo = UP[UP.index("FUNCTION public.fn_topicos_visibilidade_recalcular"):]
    corpo = corpo[: corpo.index("$fn$;")]
    assert "SECURITY DEFINER" in corpo
    assert "SELECT DISTINCT ca.aluno_id, ca.classe_id" in corpo
    assert "IS DISTINCT FROM public.app_topico_liberado(v.publicacao, v.publicar_em)" in corpo
    # Publicar nunca é desfeito por falha na conta.
    assert "EXCEPTION WHEN OTHERS THEN" in corpo
    for fn in ("fn_topicos_visibilidade_recalcular()", "fn_topicos_abrir_agendados()"):
        assert f"REVOKE ALL ON FUNCTION public.{fn} FROM PUBLIC, anon, authenticated" in UP, fn


def test_downgrade_tira_o_filtro_antes_de_derrubar_o_helper():
    assert DOWN.index("trailup_recalcular_classe_aluno(uuid, bigint)") < DOWN.index(
        "DROP FUNCTION IF EXISTS public.app_topico_liberado"
    )
    assert "DROP TRIGGER IF EXISTS trg_topicos_visibilidade_recalcular" in DOWN


def test_restricoes_sao_restritivas_e_so_de_leitura():
    politicas = re.findall(r"CREATE POLICY (\w+) ON public\.(\w+)\s+AS (\w+) FOR (\w+) TO (\w+)", UP)
    assert politicas, "nenhuma policy encontrada"
    assert all(p[2:] == ("RESTRICTIVE", "SELECT", "authenticated") for p in politicas), politicas
    tabelas = {p[1] for p in politicas}
    # O material do tópico oculto não pode vazar por nenhuma das tabelas-filhas.
    for tabela in (
        "topicos", "conteudos", "atividades", "questoes", "atividade_conteudos", "cards", "midias",
        "conteudo_personalizado", "cards_personalizados", "boss_falas",
    ):
        assert tabela in tabelas, tabela


def test_professor_dono_continua_vendo_o_rascunho():
    assert "classe_id IN (SELECT public.app_classes_do_professor())" in UP
    assert "c.professor_id = auth.uid()" in UP


def test_lista_de_ocultos_e_calculada_uma_vez():
    # ARRAY(subconsulta sem correlação) vira InitPlan; `coalesce` deixa passar linha sem tópico.
    assert "coalesce(topico_id <> ALL (ARRAY(SELECT public.app_topicos_ocultos_para_mim())), true)" in UP
    assert "NOT IN (SELECT" not in UP


def test_em_breve_nao_leva_nada_do_topico():
    corpo = UP[UP.index("FUNCTION public.topicos_em_breve"):]
    corpo = corpo[: corpo.index("$fn$;")]
    assert "RETURNS TABLE(abre_em timestamptz)" in corpo
    selecionado = corpo[corpo.index("SELECT") : corpo.index("FROM topicos")]
    for campo in ("nome", "descricao", "t.id,", "ordem"):
        assert campo not in selecionado, campo
    assert "ca.classe_id = p_classe_id AND ca.aluno_id = auth.uid()" in corpo


def test_helpers_sem_anonimo():
    for fn in (
        "app_topico_liberado(text, timestamptz)",
        "app_topicos_ocultos_para_mim()",
        "app_conteudos_ocultos_para_mim()",
        "app_atividades_ocultas_para_mim()",
        "topicos_em_breve(bigint)",
    ):
        assert f"REVOKE ALL ON FUNCTION public.{fn} FROM PUBLIC, anon" in UP, fn


def test_downgrade_desfaz_tudo():
    for trecho in (
        "DROP POLICY IF EXISTS topicos_publicado_sel",
        "DROP FUNCTION IF EXISTS public.topicos_em_breve(bigint)",
        "DROP FUNCTION IF EXISTS public.app_topicos_ocultos_para_mim()",
        "DROP COLUMN IF EXISTS publicacao",
        "DROP COLUMN IF EXISTS publicar_em",
    ):
        assert trecho in DOWN, trecho
    assert DOWN.count("_topico_publicado_sel ON public.") == len(M.RESTRICOES)
