"""`20261101_10`: a nota média da matrícula passa a ser calculada pelo banco (decisão de 01/11).

10 × pontos obtidos ÷ pontos possíveis; prazo vencido sem entrega conta 0 até o professor dar nota;
entregue e sem correção não entra; sem nada avaliado é NULL. O aluno não grava a própria nota.
"""

from __future__ import annotations

from decimal import Decimal

from tests import _f5_banco as f5
from tests.test_e2e_colunas_antigas_e_modelo_so_com_evento import NOVA as M01
from tests.test_e2e_colunas_antigas_e_modelo_so_com_evento import _sql_da_cadeia

M02 = f5.modulo("20261101_02_modelo_roda_com_pendencia.py")
M08 = f5.modulo("20261101_08_nota_sem_nota_e_acento_da_conquista.py")
M09 = f5.modulo("20261101_09_modelo_so_com_atividade_avaliavel.py")
M10 = f5.modulo("20261101_10_nota_media_da_matricula.py")

# Dublê de `trailup_recalcular_classe_aluno` com a mesma âncora da real (20260913_15), e o gatilho de
# `atividade_aluno` que em produção a chama (`trailup_progresso_after_item`).
RECALCULO = """
CREATE FUNCTION public.trailup_recalcular_classe_aluno(p_aluno uuid, p_classe bigint)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_aluno IS NULL OR p_classe IS NULL THEN RETURN; END IF;
  UPDATE classe_aluno SET "porcentagemConcluida" = COALESCE("porcentagemConcluida", 0)
   WHERE aluno_id = p_aluno AND classe_id = p_classe;
END;
$function$;
CREATE FUNCTION public.trailup_progresso_after_item() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  PERFORM public.trailup_recalcular_classe_aluno(
    NEW.aluno_id, (SELECT t.classe_id FROM topicos t JOIN atividades a ON a.topico_id = t.id WHERE a.id = NEW.atividade_id));
  RETURN NULL;
END;
$function$;
CREATE TRIGGER trg_atividade_aluno_progresso AFTER INSERT OR UPDATE ON public.atividade_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trailup_progresso_after_item();
"""
# Em produção `authenticated` tem GRANT em tudo e a RLS decide; o esqueleto não traz GRANT.
GRANTS = (
    "GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;"
    "GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;"
)


def _banco(*, com_10: bool = True, extra: tuple[str, ...] = ()):
    sql = [*_sql_da_cadeia(), *f5.sql_de(M01), *f5.sql_de(M02), *f5.sql_de(M08), *f5.sql_de(M09), RECALCULO, GRANTS]
    if com_10:
        sql += f5.sql_de(M10)
    return f5.banco(*sql, *extra)


def _semear(c) -> None:
    f5.semear_turma(c)
    for t in ("atividades", "atividade_aluno"):
        f5.afrouxa(c, t)


def _atividade(c, id_: int, maxima, *, prazo_vencido: bool = False) -> None:
    prazo = "now() - interval '1 day'" if prazo_vencido else "NULL"
    c.execute(
        "INSERT INTO public.atividades (id, topico_id, titulo, pontuacao_maxima, data_entrega) OVERRIDING SYSTEM VALUE"
        f" VALUES (%s, 10, 'A', %s, {prazo})",
        (id_, maxima),
    )


def _linha(c, atividade: int, *, obtida=None, status="em andamento", aluno=f5.A) -> None:
    c.execute(
        "INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status, pontuacao_obtida) VALUES (%s, %s, %s, %s)",
        (aluno, atividade, status, obtida),
    )


def _nota(c, aluno=f5.A):
    return c.execute(
        'SELECT "notaMedia" FROM public.classe_aluno WHERE aluno_id = %s AND classe_id = %s', (aluno, f5.TURMA)
    ).fetchone()[0]


def _recalcula(c, aluno=f5.A) -> None:
    c.execute("SELECT public.trailup_recalcular_classe_aluno(%s, %s)", (aluno, f5.TURMA))


@f5.e2e
def test_antes_ninguem_gravava_a_nota() -> None:
    with _banco(com_10=False) as c:
        _semear(c)
        _atividade(c, 500, 10)
        _linha(c, 500, obtida=0, status="concluido")
        assert _nota(c) is None


@f5.e2e
def test_ponderada_pelos_pontos_e_zero_e_zero() -> None:
    with _banco() as c:
        _semear(c)
        _atividade(c, 500, 10)
        _atividade(c, 501, 20)
        _linha(c, 500, obtida=0, status="concluido")
        assert _nota(c) == Decimal("0")  # o 0/10 da turma 66: zero, não "sem nota"
        _linha(c, 501, obtida=20, status="concluido")
        assert _nota(c) == Decimal("6.67")  # 10 × 20 ÷ 30, e não a média simples (5,0)


@f5.e2e
def test_prazo_vencido_sem_entrega_conta_zero_ate_o_professor_dar_nota() -> None:
    with _banco() as c:
        _semear(c)
        _atividade(c, 500, 10, prazo_vencido=True)  # não entregue
        _atividade(c, 501, 10, prazo_vencido=True)  # entregue, ainda sem correção: não entra
        _atividade(c, 502, 10)  # sem prazo e sem nota: não entra
        _linha(c, 501, status="concluido")
        _recalcula(c)
        assert _nota(c) == Decimal("0")
        # O professor corrige (avaliar_entrega grava pontuacao_obtida): vale no lugar do 0.
        c.execute("UPDATE public.atividade_aluno SET pontuacao_obtida = 8 WHERE atividade_id = 501 AND aluno_id = %s", (f5.A,))
        assert _nota(c) == Decimal("4.00")  # 10 × (0 + 8) ÷ 20
        _linha(c, 500, obtida=6)
        assert _nota(c) == Decimal("7.00")  # 10 × (6 + 8) ÷ 20


@f5.e2e
def test_sem_nada_avaliado_e_null() -> None:
    with _banco() as c:
        _semear(c)
        _atividade(c, 500, 10)
        _linha(c, 500, status="concluido")
        _recalcula(c)
        assert _nota(c) is None


@f5.e2e
def test_o_aluno_nao_grava_a_propria_nota_mas_a_conta_dele_grava() -> None:
    with _banco() as c:
        _semear(c)
        _atividade(c, 500, 10)
        c.execute("BEGIN")
        f5.como(c, f5.A)
        c.execute("SET LOCAL ROLE authenticated")
        c.execute('UPDATE public.classe_aluno SET "notaMedia" = 10 WHERE aluno_id = %s', (f5.A,))
        assert _nota(c) is None
        _linha(c, 500, obtida=5, status="concluido")  # a resposta do aluno dispara a conta do banco
        assert _nota(c) == Decimal("5.00")
        c.execute('UPDATE public.classe_aluno SET "notaMedia" = 10 WHERE aluno_id = %s', (f5.A,))
        assert _nota(c) == Decimal("5.00")
        c.execute("COMMIT")


@f5.e2e
def test_matricula_feita_pelo_cliente_nasce_sem_nota() -> None:
    with _banco() as c:
        _semear(c)
        c.execute("DELETE FROM public.classe_aluno WHERE aluno_id = %s", (f5.B,))
        c.execute("BEGIN")
        f5.como(c, f5.B)
        c.execute("SET LOCAL ROLE authenticated")
        c.execute(
            'INSERT INTO public.classe_aluno (classe_id, aluno_id, "notaMedia") VALUES (%s, %s, 10)', (f5.TURMA, f5.B)
        )
        c.execute("COMMIT")
        assert _nota(c, f5.B) is None


@f5.e2e
def test_a_varredura_pega_o_prazo_que_venceu_sem_ninguem_gravar() -> None:
    with _banco() as c:
        _semear(c)
        _atividade(c, 500, 10)
        c.execute("UPDATE public.atividades SET data_entrega = now() + interval '1 hour' WHERE id = 500")
        _recalcula(c)
        assert _nota(c) is None
        c.execute("UPDATE public.atividades SET data_entrega = now() - interval '1 minute' WHERE id = 500")
        assert c.execute("SELECT public.trailup_recalcular_notas_com_prazo()").fetchone()[0] == 3
        assert _nota(c) == Decimal("0")


@f5.e2e
def test_zero_real_entra_no_risco_e_na_rosca_como_zero() -> None:
    with _banco() as c:
        _semear(c)
        _atividade(c, 500, 10, prazo_vencido=True)
        _recalcula(c)
        assert c.execute(
            "SELECT faixa FROM public.vw_metricas_distribuicao_turma_classe"
            " WHERE classe_id = %s AND metrica = 'nota_media' AND faixa = 'baixa'",
            (f5.TURMA,),
        ).fetchone() == ("baixa",)
        assert c.execute(
            "SELECT pg_get_viewdef('public.vw_metricas_engajamento_aluno_classe'::regclass)"
        ).fetchone()[0].count("m.nota_media = 0") == 0


@f5.e2e
def test_upgrade_repetido_nao_duplica_o_gancho_e_o_downgrade_tira() -> None:
    with _banco(extra=tuple(f5.sql_de(M10))) as c:
        corpo = c.execute("SELECT prosrc FROM pg_proc WHERE proname = 'trailup_recalcular_classe_aluno'").fetchone()[0]
        assert corpo.count("trailup_recalcular_nota_classe_aluno") == 1
        for sql in f5.sql_de(M10, "downgrade"):
            c.execute(sql)
        corpo = c.execute("SELECT prosrc FROM pg_proc WHERE proname = 'trailup_recalcular_classe_aluno'").fetchone()[0]
        assert "trailup_recalcular_nota_classe_aluno" not in corpo
        assert c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname IN ('trailup_recalcular_nota_classe_aluno',"
            " 'trailup_recalcular_notas_com_prazo', 'trg_classe_aluno_nota_pelo_banco')"
        ).fetchone()[0] == 0
