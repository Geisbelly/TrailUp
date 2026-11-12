"""`20261111_04`: o peso do perfil na ordem das notificações sai dos perfis representativos.

Fase 3 do roteiro de diversidade de perfis, parte das notificações. Antes, `notificacoes_peso_perfil`
lia a matriz de Monterrat só no perfil da tela. Agora, com `perfil_peso_modo = representativos`, o
peso é a média da matriz nos perfis representativos do aluno, ponderada pela afinidade. O texto
continua no perfil da tela: só a ordem muda.

Mesmo banco do e2e da `20261105_04`, com o vetor único (`20261111_01`) e a `20261111_04` por cima.
Alunos da `_semear` da `_18`: A é Socialiser (90) com Mastermind (40); B é Socialiser (70) com
Conqueror (20); C é Conqueror (85) com Socialiser (10). O nome `Socialiser` é de propósito: o banco
antigo grafava assim, e a matriz usa `socializer`.

Matriz de produção (11/11): rank = conqueror 1, achiever 0,75, daredevil 0,63, mastermind 0,63,
socializer 0,13; amigo_rank = socializer 1.
"""

from __future__ import annotations

import hashlib

import pytest

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_fala_com_o_aluno_no_perfil as fala
from tests import test_e2e_notificacao_por_perfil_e_foco as p
from tests import test_e2e_notificacao_so_com_texto_da_guarda as g
from tests import test_e2e_notificacoes_v2_motor as v2

MIGRATION = "20261111_04_notificacao_peso_pelo_vetor.py"
M = f5.modulo(MIGRATION)
VETOR = f5.modulo("20261111_01_vetor_perfil_no_banco.py")
A, B, C = p.A, p.B, p.C


# --------------------------------------------------------------------------- estrutura


def test_estrutura_da_migration() -> None:
    assert M.down_revision == "20261111_03"
    sql = "\n".join(f5.sql_de(M))
    assert "CREATE OR REPLACE FUNCTION public.notificacoes_peso_perfil(p_aluno uuid, p_tipo text)" in sql
    assert "public.app_vetor_perfil(p_aluno)" in sql
    assert "'perfil_peso_modo'" in sql and "'representativos'" in sql
    assert "SECURITY DEFINER" in sql
    assert "REVOKE ALL ON FUNCTION public.notificacoes_peso_perfil(uuid, text) FROM PUBLIC, anon, authenticated" in sql


def test_downgrade_devolve_o_corpo_que_esta_em_producao() -> None:
    # md5 de `prosrc` de notificacoes_peso_perfil em produção, lido em 11/11/2026 (alembic em _02).
    corpo = M.PESO_ANTERIOR.split("AS $fn$", 1)[1].split("$fn$;", 1)[0]
    assert hashlib.md5(corpo.encode()).hexdigest() == "289a29852af56fa3357d36960a2dcfb8"


def test_downgrade_devolve_o_peso_do_perfil_da_tela_e_tira_a_chave() -> None:
    sql = "\n".join(f5.sql_de(M, "downgrade"))
    assert "app_vetor_perfil" not in sql
    assert "notificacoes_perfil_do_aluno(p_aluno)" in sql
    assert "DELETE FROM public.notificacoes_config WHERE chave = 'perfil_peso_modo'" in sql


# --------------------------------------------------------------------------- contra Postgres real


@pytest.fixture()
def c():
    if not f5.DSN:
        pytest.skip("TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)")
    with f5.banco(
        *p.h._motor(),
        *f5.sql_de(p.M01),
        p.ANTES,
        p.RETENCAO,
        p.M_LIMITE.TABELA_CONFIG,
        p.M_LIMITE.FUNCAO_LIMITE,
        *f5.sql_de(p.M),
        *f5.sql_de(g.M),
        *f5.sql_de(fala.M),
        *f5.sql_de(v2.M),
        *f5.sql_de(VETOR),
        *f5.sql_de(M),
    ) as conn:
        p._semear(conn)
        yield conn


def _peso(c, aluno, tipo: str) -> float:
    return float(c.execute("SELECT public.notificacoes_peso_perfil(%s, %s)", (aluno, tipo)).fetchone()[0])


def _modo(c, valor: str | None) -> None:
    if valor is None:
        c.execute("DELETE FROM public.notificacoes_config WHERE chave = 'perfil_peso_modo'")
    else:
        c.execute("UPDATE public.notificacoes_config SET valor = %s WHERE chave = 'perfil_peso_modo'", (valor,))


@f5.e2e
def test_a_migration_liga_o_modo_representativos(c) -> None:
    valor = c.execute("SELECT valor FROM public.notificacoes_config WHERE chave = 'perfil_peso_modo'").fetchone()[0]
    assert valor == "representativos"


@f5.e2e
def test_peso_e_a_media_da_matriz_nos_representativos_pela_afinidade(c) -> None:
    # A: (90 x 0,13 + 40 x 0,63) / 130; o Socialiser do banco casa com o socializer da matriz.
    assert _peso(c, A, "rank") == pytest.approx((90 * 0.13 + 40 * 0.63) / 130, abs=1e-6)
    assert _peso(c, A, "amigo_rank") == pytest.approx(90 / 130, abs=1e-6)
    # C: (85 x 1 + 10 x 0,13) / 95 — o Socialiser com 10 é representativo por ser o 2º.
    assert _peso(c, C, "rank") == pytest.approx((85 * 1 + 10 * 0.13) / 95, abs=1e-6)


@f5.e2e
def test_modo_tela_e_o_peso_de_antes(c) -> None:
    _modo(c, "tela")
    assert _peso(c, A, "rank") == pytest.approx(0.13)
    assert _peso(c, C, "rank") == pytest.approx(1.0)


@f5.e2e
def test_chave_ausente_ou_invalida_vale_o_perfil_da_tela(c) -> None:
    _modo(c, None)
    assert _peso(c, A, "rank") == pytest.approx(0.13)
    c.execute(
        "INSERT INTO public.notificacoes_config (chave, valor, descricao) VALUES ('perfil_peso_modo', 'vetor', 'x')"
    )
    assert _peso(c, A, "rank") == pytest.approx(0.13)


@f5.e2e
def test_tipo_fora_da_matriz_continua_neutro(c) -> None:
    assert _peso(c, A, "missao_nova") == pytest.approx(0.5)


@f5.e2e
def test_perfil_sem_peso_na_matriz_conta_zero_e_puxa_a_media(c) -> None:
    # B: Socialiser 70 e Conqueror 20 no amigo_rank (só socializer na matriz): 70 / 90.
    assert _peso(c, B, "amigo_rank") == pytest.approx(70 / 90, abs=1e-6)


@f5.e2e
def test_aluno_sem_vetor_fica_com_o_peso_do_perfil_da_tela(c) -> None:
    c.execute("DELETE FROM public.aluno_perfil WHERE aluno_id = %s", (B,))
    no_vetor = _peso(c, B, "rank")
    _modo(c, "tela")
    assert no_vetor == pytest.approx(_peso(c, B, "rank"))


@f5.e2e
def test_perfil_da_tela_escolhido_nao_decide_mais_a_ordem_sozinho(c) -> None:
    # A escolheu Mastermind na tela (representativo), mas é 90 Socialiser. Pelo perfil da tela, rank
    # (0,63) sai antes de amigo_rank (0); pelo vetor, amigo_rank (0,69) sai antes de rank (0,28).
    c.execute("UPDATE public.alunos SET perfil_ativo = 'mastermind' WHERE id = %s", (A,))

    def primeiro(modo: str) -> str:
        _modo(c, modo)
        c.execute("DELETE FROM public.notificacoes WHERE aluno_id = %s", (A,))
        c.execute("DELETE FROM public.notificacoes_pendentes WHERE aluno_id = %s", (A,))
        v2._evento(c, A, "rank", motivo=f"rank-{modo}")
        v2._evento(c, A, "amigo_rank", motivo=f"amigo-{modo}")
        v2._entregar(c, A)
        return v2._caixa(c, A)[0][0]

    assert primeiro("tela") == "rank"
    assert primeiro("representativos") == "amigo_rank"


@f5.e2e
def test_downgrade_volta_ao_perfil_da_tela(c) -> None:
    c.execute("UPDATE public.alunos SET perfil_ativo = 'mastermind' WHERE id = %s", (A,))
    for sql in f5.sql_de(M, "downgrade"):
        c.execute(sql)
    chave = c.execute("SELECT count(*) FROM public.notificacoes_config WHERE chave = 'perfil_peso_modo'").fetchone()[0]
    assert chave == 0
    assert _peso(c, A, "rank") == pytest.approx(0.63)


@f5.e2e
def test_upgrade_e_idempotente_e_nao_sobrescreve_o_modo_escolhido(c) -> None:
    _modo(c, "tela")
    for sql in f5.sql_de(M):
        c.execute(sql)
    valor = c.execute("SELECT valor FROM public.notificacoes_config WHERE chave = 'perfil_peso_modo'").fetchone()[0]
    assert valor == "tela"
