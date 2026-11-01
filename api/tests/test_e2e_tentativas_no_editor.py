"""`20261101_15`: limite de tentativas no editor e a regra do cronômetro legível (#136, fase 3).

Banco local com o esqueleto de produção e o gatilho de `atividades` como estava (`20260827_03`), para
medir a diferença que a migration faz. A pergunta é se o gatilho dispara, então
`fn_enqueue_class_delta_job` é trocada por uma que só anota o disparo: a real precisa das constraints
de `personalizacao_job_targets`, que o esqueleto não tem, e engole o erro (falha da fila não derruba o
save do professor), o que daria zero job pelo motivo errado.
"""

from __future__ import annotations

import uuid

from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import POSSE, _trecho

M13 = f5.modulo("20261101_13_tentativas_com_tempo_do_servidor.py")
M15 = f5.modulo("20261101_15_tentativas_no_editor.py")
ENFILEIRAR = """
CREATE TABLE public.disparos_da_regeracao (op text NOT NULL, atividade bigint);
CREATE FUNCTION public.fn_enqueue_class_delta_job() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  INSERT INTO public.disparos_da_regeracao VALUES (TG_OP, CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END);
  RETURN NULL;
END $f$;
"""
ALUNOS_DO_PROF = _trecho(
    "20260826_09_rls_posse_por_tabela.py", "CREATE OR REPLACE FUNCTION public.app_alunos_do_professor()", "$$;"
)
RETENCAO = _trecho("20261024_03_retencao_e_expurgo.py", "CREATE TABLE IF NOT EXISTS public.retencao_politica (", "\n);")
LEITURA_DA_CONFIG = _trecho("20260909_02_rank_limite_visivel.py", "DROP POLICY IF EXISTS app_config_sel", "(publico);")
GRANTS = (
    "GRANT USAGE ON SCHEMA public TO authenticated, anon;"
    "GRANT SELECT ON public.app_config TO authenticated, anon;"
    "ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;"
)
ATIVIDADE = 500


def _banco():
    return f5.banco(
        POSSE, ALUNOS_DO_PROF, RETENCAO, GRANTS, LEITURA_DA_CONFIG, *f5.sql_de(M13), ENFILEIRAR, M15.GATILHO_ANTERIOR
    )


def _semear(c) -> None:
    f5.semear_turma(c)
    f5.afrouxa(c, "atividades")
    c.execute(
        "INSERT INTO public.atividades (id, topico_id, titulo, descricao, tipo, pontuacao_maxima)"
        " OVERRIDING SYSTEM VALUE VALUES (%s, 10, 'Quiz', 'Leia antes', 'quiz', 10)",
        (ATIVIDADE,),
    )
    c.execute("DELETE FROM public.disparos_da_regeracao")


def _jobs(c) -> int:
    return c.execute("SELECT count(*) FROM public.disparos_da_regeracao").fetchone()[0]


def _salvar_do_editor(c, **mudancas) -> None:
    """O UPDATE que `topicsApi.saveActivity` faz: título, descrição, tipo e prazo sempre vão no SET."""
    atual = dict(
        zip(
            ("titulo", "descricao", "tipo", "data_entrega", "tentativas_max"),
            c.execute(
                "SELECT titulo, descricao, tipo, data_entrega, tentativas_max FROM public.atividades WHERE id = %s",
                (ATIVIDADE,),
            ).fetchone(),
        )
    )
    atual.update(mudancas)
    c.execute(
        "UPDATE public.atividades SET titulo = %(titulo)s, descricao = %(descricao)s, tipo = %(tipo)s,"
        " data_entrega = %(data_entrega)s, tentativas_max = %(tentativas_max)s WHERE id = %(id)s",
        {**atual, "id": ATIVIDADE},
    )


def _upgrade(c) -> None:
    for sql in f5.sql_de(M15):
        c.execute(sql)


def _config_visivel(c, papel: str, quem: uuid.UUID | None) -> set[str]:
    c.execute("BEGIN")
    try:
        f5.como(c, quem)
        c.execute(f"SET LOCAL ROLE {papel}")
        return {
            r[0] for r in c.execute("SELECT chave FROM public.app_config WHERE chave LIKE 'cronometro%%'").fetchall()
        }
    finally:
        c.execute("ROLLBACK")


@f5.e2e
def test_sem_a_migration_salvar_so_o_limite_enfileira_regeracao() -> None:
    """O defeito que a migration corrige: `UPDATE OF` dispara pela coluna no SET, não pelo valor."""
    with _banco() as c:
        _semear(c)
        _salvar_do_editor(c, tentativas_max=3)
        assert _jobs(c) == 1


@f5.e2e
def test_limite_de_tentativas_nao_regera_e_conteudo_continua_regerando() -> None:
    with _banco() as c:
        _semear(c)
        _upgrade(c)

        _salvar_do_editor(c, tentativas_max=3)
        _salvar_do_editor(c, tentativas_max=None)
        _salvar_do_editor(c)  # salvar sem mudar nada
        assert _jobs(c) == 0

        _salvar_do_editor(c, descricao="Leia com calma")
        assert _jobs(c) == 1

        c.execute("DELETE FROM public.disparos_da_regeracao")
        c.execute("UPDATE public.atividades SET metadata = '{\"x\": 1}' WHERE id = %s", (ATIVIDADE,))
        assert _jobs(c) == 1

        c.execute("DELETE FROM public.disparos_da_regeracao")
        c.execute(
            "INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (501, 11, 'Nova')"
        )
        assert _jobs(c) == 1

        c.execute("DELETE FROM public.disparos_da_regeracao")
        c.execute("DELETE FROM public.atividades WHERE id = 501")
        assert _jobs(c) == 1


@f5.e2e
def test_regra_do_cronometro_legivel_pelo_cliente() -> None:
    with _banco() as c:
        _semear(c)
        assert _config_visivel(c, "authenticated", f5.PROF) == set()
        _upgrade(c)
        esperado = {"cronometro_atividade_padrao_seg", "cronometro_tolerancia_seg"}
        assert _config_visivel(c, "authenticated", f5.PROF) == esperado
        # `app_config_sel` vale para os dois papéis: público é público.
        assert _config_visivel(c, "anon", None) == esperado


@f5.e2e
def test_downgrade_volta_o_gatilho_e_fecha_a_regra() -> None:
    with _banco() as c:
        _semear(c)
        _upgrade(c)
        for sql in f5.sql_de(M15, "downgrade"):
            c.execute(sql)
        assert _config_visivel(c, "authenticated", f5.PROF) == set()
        _salvar_do_editor(c, tentativas_max=2)
        assert _jobs(c) == 1
        nomes = {
            r[0]
            for r in c.execute(
                "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.atividades'::regclass AND NOT tgisinternal"
            ).fetchall()
        }
        assert "trg_atividades_class_delta_job_ins_del" not in nomes


def test_limite_de_tentativas_nao_e_alteracao_do_professor() -> None:
    """`20261101_12` só compara os campos dela: mudar o limite não põe selo de alteração no aluno."""
    campos = f5.modulo("20261101_12_alteracao_do_professor.py").CAMPOS["atividades"]
    assert "tentativas_max" not in campos
    # E o gatilho de regeração compara as mesmas colunas do `UPDATE OF` de antes, nenhuma a menos.
    assert set(M15.COLUNAS_DA_REGERACAO) == {"titulo", "descricao", "tipo", "pontuacao_maxima", "data_entrega",
                                             "metadata", "topico_id"}
