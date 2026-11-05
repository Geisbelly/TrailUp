"""`20261105_01`: o aviso de material novo vai para quem vê aquele perfil na tela.

Mesmo banco do e2e da `20261102_21`, com a guarda da `20261102_24`, a `20261103_12` (que traz
`notificacoes_perfil_do_aluno`) e a `20261105_01` por cima, na ordem do histórico. Dados sintéticos.

Alunos da `_semear` da `20261102_21`: A é Achiever (90) com Seeker (30); B é Seeker (80) com
Achiever (20); C é Conqueror (85) com Achiever (10).
"""

from __future__ import annotations

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_novo_material_e_sequencia as nm
from tests import test_e2e_notificacao_so_com_texto_da_guarda as g

pytestmark = f5.e2e

M12 = f5.modulo("20261103_12_notificacao_fala_com_o_aluno_no_perfil.py")
M = f5.modulo("20261105_01_novo_material_no_perfil_da_tela.py")
A, B, C, UM = nm.A, nm.B, nm.C, nm.UM


def _banco(*, com_correcao: bool = True):
    p = nm.p
    return f5.banco(
        *nm.h._motor(),
        *f5.sql_de(p.M01),
        p.ANTES,
        p.RETENCAO,
        p.M_LIMITE.TABELA_CONFIG,
        p.M_LIMITE.FUNCAO_LIMITE,
        *f5.sql_de(p.M),
        nm.COORTE,
        nm.M05.FUNCOES,
        *f5.sql_de(nm.M),
        *f5.sql_de(g.M),
        *f5.sql_de(M12),
        *(f5.sql_de(M) if com_correcao else []),
    )


def _ativo(c, aluno, perfil: str | None) -> None:
    c.execute("UPDATE public.alunos SET perfil_ativo = %s WHERE id = %s", (perfil, aluno))


def _avisados(c) -> list:
    return [
        r[0]
        for r in c.execute(
            "SELECT aluno_id FROM public.notificacoes_pendentes WHERE tipo = 'novo_material' ORDER BY aluno_id"
        ).fetchall()
    ]


def test_quem_escolheu_o_secundario_e_avisado_pelo_material_que_a_tela_abre():
    with _banco() as c:
        nm._semear(c)
        _ativo(c, A, "seeker")  # A: Achiever dominante, Seeker é o 2º com afinidade: representativo
        nm._material(c, perfil="achiever")
        assert _avisados(c) == []  # A não vê Achiever na tela; B tem Seeker como tela
        nm._material(c, perfil="seeker")
        assert sorted(_avisados(c)) == sorted([A, B])


def test_perfil_escolhido_sem_sinal_volta_ao_dominante():
    with _banco() as c:
        nm._semear(c)
        _ativo(c, B, "conqueror")  # B não tem Conqueror: volta ao dominante, Seeker
        nm._material(c, perfil="seeker")
        assert _avisados(c) == [B]


def test_sem_a_correcao_o_aviso_ia_pelo_dominante():
    """A falha que a migração corrige, reproduzida: A escolheu Seeker e era avisado do Achiever."""
    with _banco(com_correcao=False) as c:
        nm._semear(c)
        _ativo(c, A, "seeker")
        nm._material(c, perfil="achiever")
        assert _avisados(c) == [A]


def test_downgrade_devolve_a_funcao_da_20261102_21():
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        corpo = c.execute(
            "SELECT prosrc FROM pg_proc WHERE proname = 'notificacoes_novo_material_produzir'"
        ).fetchone()[0]
    assert "notificacoes_perfil_dominante(ca.aluno_id)" in corpo
    assert "notificacoes_perfil_do_aluno(ca.aluno_id)" not in corpo
