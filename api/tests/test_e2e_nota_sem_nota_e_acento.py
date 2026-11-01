"""`20261101_08`: aluno sem nota sai da faixa "baixa", e a notificação de conquista ganha acento."""

from __future__ import annotations

from tests import _f5_banco as f5
from tests.test_e2e_colunas_antigas_e_modelo_so_com_evento import NOVA as M01
from tests.test_e2e_colunas_antigas_e_modelo_so_com_evento import _sql_da_cadeia

M = f5.modulo("20261101_08_nota_sem_nota_e_acento_da_conquista.py")
M02 = f5.modulo("20261101_02_modelo_roda_com_pendencia.py")
# Dublê do gatilho: só o trecho que a migration troca, no mesmo formato de literal.
GATILHO = """
CREATE FUNCTION public.trg_eventos_aluno_after_iud() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  PERFORM 'Nova conquista desbloqueada!', 'Parabens! Voce desbloqueou a conquista "' || 'X' || '".';
  RETURN NEW;
END
$function$
"""


def _banco(*depois: str):
    return f5.banco(*_sql_da_cadeia(), *f5.sql_de(M01), *f5.sql_de(M02), GATILHO, *depois)


def _faixas(c) -> dict:
    linhas = c.execute(
        "SELECT faixa, total_alunos FROM public.vw_metricas_distribuicao_turma_classe"
        " WHERE classe_id = %s AND metrica = 'nota_media'",
        (f5.TURMA,),
    ).fetchall()
    return dict(linhas)


def _semear(c) -> None:
    f5.semear_turma(c)
    # A: nunca corrigido (NULL); B: o 0 que o classe_aluno grava sem progresso; C: nota 4 de verdade.
    c.execute('UPDATE public.classe_aluno SET "notaMedia" = NULL, "porcentagemConcluida" = 100 WHERE aluno_id = %s', (f5.A,))
    c.execute('UPDATE public.classe_aluno SET "notaMedia" = 0, "porcentagemConcluida" = 0 WHERE aluno_id = %s', (f5.B,))
    c.execute('UPDATE public.classe_aluno SET "notaMedia" = 4, "porcentagemConcluida" = 50 WHERE aluno_id = %s', (f5.C,))


def _texto_do_gatilho(c) -> str:
    return c.execute("SELECT prosrc FROM pg_proc WHERE proname = 'trg_eventos_aluno_after_iud'").fetchone()[0]


@f5.e2e
def test_antes_sem_nota_contava_como_baixa() -> None:
    with _banco() as c:
        _semear(c)
        assert _faixas(c) == {"baixa": 3}


@f5.e2e
def test_sem_nota_vira_sem_dado_e_so_a_nota_real_fica_baixa() -> None:
    with _banco(*f5.sql_de(M)) as c:
        _semear(c)
        assert _faixas(c) == {"sem_dado": 2, "baixa": 1}
        # Zero COM progresso é nota de verdade.
        c.execute('UPDATE public.classe_aluno SET "porcentagemConcluida" = 30 WHERE aluno_id = %s', (f5.B,))
        assert _faixas(c) == {"sem_dado": 1, "baixa": 2}


@f5.e2e
def test_acento_entra_so_na_frase_e_o_upgrade_repete_sem_erro() -> None:
    with _banco(*f5.sql_de(M), *f5.sql_de(M)) as c:
        texto = _texto_do_gatilho(c)
        assert 'Parabéns! Você desbloqueou a conquista "' in texto
        assert "Parabens! Voce" not in texto
        assert "Nova conquista desbloqueada!" in texto


@f5.e2e
def test_downgrade_volta_a_view_e_o_texto() -> None:
    with _banco(*f5.sql_de(M), *f5.sql_de(M, "downgrade")) as c:
        _semear(c)
        assert _faixas(c) == {"baixa": 3}
        assert "Parabens! Voce desbloqueou" in _texto_do_gatilho(c)
