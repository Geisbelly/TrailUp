"""Ponta a ponta da `20261029_02` (catálogo de métricas, resultado/amostra das invariantes, disponibilidade).

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria um
banco descartável com o ESQUELETO do schema public da produção, reproduz os GRANTs que o Supabase dá
por padrão a `anon`/`authenticated`/`service_role` em toda tabela nova de `public` (o esqueleto não os
traz, e sem eles o teste de permissão passaria por acidente) e aplica o `upgrade()` da migration.

As linhas de `metricas_invariante_resultado` são semeadas à mão: é o que o executor da `20261029_03`
fará, e a view precisa funcionar só com elas. O papel de cliente é de verdade
(`SET LOCAL ROLE authenticated` + claims), não só claims soltas.

Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager

import pytest

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e do catalogo de metricas recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402

M_CATALOGO = base._modulo("20261029_02_catalogo_de_metricas.py")

ALUNO = uuid.UUID(int=21)
TODAS = [f"I{n:02d}" for n in range(1, 21)]

# O que o Supabase faz por padrão em toda tabela criada em `public`.
GRANTS_SUPABASE = """
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
"""


@contextmanager
def _banco():
    nome = f"tu_met_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(base.DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(base._dsn_para(nome), autocommit=True) as c:
            c.execute(base.PAPEIS)
            c.execute(GRANTS_SUPABASE)
            c.execute(base.ESQUELETO.read_text(encoding="utf-8"))
            for sql in base._sql_de(M_CATALOGO, "upgrade"):
                c.execute(sql)
            yield c
    finally:
        with psycopg.connect(base.DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _rodada(c, invariante: str, *, ok: bool = True, horas: float = 0, linhas: int | None = None) -> None:
    c.execute(
        """
        INSERT INTO public.metricas_invariante_resultado (invariante, rodado_em, ok, linhas)
        VALUES (%s, now() - make_interval(secs => %s), %s, %s)
        """,
        (invariante, horas * 3600, ok, linhas if linhas is not None else (0 if ok else 3)),
    )


def _todas_verdes(c, *, horas: float = 0) -> None:
    for inv in TODAS:
        _rodada(c, inv, ok=True, horas=horas)


def _disponibilidade(c) -> dict[str, tuple[bool, str | None]]:
    return {
        chave: (disponivel, motivo)
        for chave, disponivel, motivo in c.execute(
            "SELECT chave, disponivel, motivo FROM public.vw_metricas_disponibilidade"
        ).fetchall()
    }


def _como_cliente(c, papel: str = "authenticated") -> None:
    """Dentro de `c.transaction()`: o papel de verdade, com as claims que o PostgREST preenche."""
    c.execute(f"SET LOCAL ROLE {papel}")
    claims = json.dumps({"sub": str(ALUNO), "role": papel})
    c.execute("SELECT set_config('request.jwt.claims', %s, true)", (claims,))


def test_catalogo_nasce_com_21_linhas_e_o_esqueleto_concede_como_o_supabase():
    with _banco() as c:
        assert c.execute("SELECT count(*) FROM public.metricas_catalogo").fetchone()[0] == 21
        assert c.execute("SELECT count(*) FROM public.metricas_invariante_resultado").fetchone()[0] == 0
        # controle: uma tabela qualquer criada agora recebe o GRANT padrão. Se isto falhar, o teste de
        # permissão abaixo estaria passando por falta de GRANT, não pelo REVOKE da migration.
        c.execute("CREATE TABLE public.controle_grants (id int)")
        assert c.execute("SELECT has_table_privilege('authenticated', 'public.controle_grants', 'INSERT')").fetchone()[0]


def test_semente_e_idempotente_e_nao_desfaz_promocao():
    with _banco() as c:
        c.execute("UPDATE public.metricas_catalogo SET validacao_promovida = true, n_minimo = 9 WHERE chave = 'aluno.dominio'")
        for sql in base._sql_de(M_CATALOGO, "upgrade"):
            c.execute(sql)
        assert c.execute("SELECT count(*) FROM public.metricas_catalogo").fetchone()[0] == 21
        assert c.execute(
            "SELECT validacao_promovida, n_minimo FROM public.metricas_catalogo WHERE chave = 'aluno.dominio'"
        ).fetchone() == (True, 9)


def test_sem_rodada_fica_auditoria_atrasada():
    """Auditoria nunca rodou (cron desligado, banco novo): nenhuma métrica com invariante é 'disponível'."""
    with _banco() as c:
        disp = _disponibilidade(c)
        assert len(disp) == 21
        for chave, invs in (
            ("aluno.progresso", ["I04", "I05"]),
            ("aluno.ranking", ["I08", "I09", "I10"]),
            ("legado.tempo_uso", ["I16"]),
        ):
            assert disp[chave] == (False, "auditoria_atrasada"), (chave, invs)
        # precedência: modelo sem promoção vem antes de auditoria atrasada
        assert disp["aluno.dominio"] == (False, "aguardando_validacao")
        # sem invariante e sem validação, não há o que auditar
        assert disp["prof.vencidas"] == (True, None)
        assert disp["prof.sem_material"] == (True, None)
        # R7: o card de transporte não depende de invariante (I20 é alerta; a I18 não o desliga)
        assert disp["dev.transporte"] == (True, None)
        # o resto: toda métrica que depende de alguma invariante está indisponível
        no_catalogo = dict(c.execute("SELECT chave, invariantes FROM public.metricas_catalogo").fetchall())
        for chave, (disponivel, _) in disp.items():
            if no_catalogo[chave]:
                assert not disponivel, chave


def test_rodada_de_27h_fica_auditoria_atrasada():
    with _banco() as c:
        _todas_verdes(c, horas=27)
        disp = _disponibilidade(c)
        assert disp["aluno.ranking"] == (False, "auditoria_atrasada")
        assert disp["aluno.progresso"] == (False, "auditoria_atrasada")
        assert disp["prof.vencidas"] == (True, None)


def test_rodada_de_25h_ainda_vale():
    with _banco() as c:
        _todas_verdes(c, horas=25)
        disp = _disponibilidade(c)
        assert disp["aluno.ranking"] == (True, None)
        assert disp["aluno.progresso"] == (True, None)


def test_uma_invariante_velha_derruba_so_quem_depende_dela():
    with _banco() as c:
        _todas_verdes(c)
        c.execute("DELETE FROM public.metricas_invariante_resultado WHERE invariante = 'I16'")
        _rodada(c, "I16", ok=True, horas=40)
        disp = _disponibilidade(c)
        assert disp["legado.tempo_uso"] == (False, "auditoria_atrasada")
        assert disp["legado.abandono"] == (False, "auditoria_atrasada")
        assert disp["aluno.progresso"] == (True, None)


def test_invariante_falhando_lista_os_ids_no_motivo():
    with _banco() as c:
        _todas_verdes(c)
        c.execute("DELETE FROM public.metricas_invariante_resultado WHERE invariante IN ('I08','I09')")
        _rodada(c, "I08", ok=False)
        _rodada(c, "I09", ok=False)
        disp = _disponibilidade(c)
        assert disp["aluno.ranking"] == (False, "invariante_falhou:I08,I09")
        assert disp["aluno.sequencia"] == (False, "invariante_falhou:I08")
        assert disp["dev.gamificacao"] == (False, "invariante_falhou:I08,I09")
        assert disp["aluno.progresso"] == (True, None)


def test_so_a_ultima_rodada_de_cada_invariante_conta():
    with _banco() as c:
        _todas_verdes(c)
        _rodada(c, "I04", ok=False, horas=5)  # falhou há 5 h, mas a de agora (verde) é a última
        assert _disponibilidade(c)["aluno.progresso"] == (True, None)
        _rodada(c, "I05", ok=False, horas=-0.001)  # e uma falha mais nova que a verde vence
        assert _disponibilidade(c)["aluno.progresso"] == (False, "invariante_falhou:I05")


def test_rodada_atrasada_vence_invariante_falhando():
    with _banco() as c:
        _todas_verdes(c, horas=30)
        c.execute("UPDATE public.metricas_invariante_resultado SET ok = false WHERE invariante = 'I08'")
        assert _disponibilidade(c)["aluno.ranking"] == (False, "auditoria_atrasada")


def test_ml_sem_promocao_fica_aguardando_validacao():
    with _banco() as c:
        _todas_verdes(c)
        disp = _disponibilidade(c)
        assert disp["aluno.dominio"] == (False, "aguardando_validacao")
        assert disp["aluno.sugestao_material"] == (False, "aguardando_validacao")
        # llm sem nenhuma invariante: a validação é a única coisa que falta
        assert disp["aluno.nota_sugerida"] == (False, "aguardando_validacao")
        # com a auditoria verde, só as de modelo ficam de fora
        assert {chave for chave, (d, _) in disp.items() if not d} == {
            "aluno.dominio", "aluno.nota_sugerida", "aluno.sugestao_material"
        }

        c.execute("UPDATE public.metricas_catalogo SET validacao_promovida = true WHERE chave = 'aluno.dominio'")
        assert _disponibilidade(c)["aluno.dominio"] == (True, None)
        # promover não passa por cima de invariante falhando
        c.execute("DELETE FROM public.metricas_invariante_resultado WHERE invariante = 'I15'")
        _rodada(c, "I15", ok=False)
        assert _disponibilidade(c)["aluno.dominio"] == (False, "invariante_falhou:I15")


def test_metrica_sem_invariante_e_disponivel():
    with _banco() as c:
        assert _disponibilidade(c)["prof.vencidas"] == (True, None)
        row = c.execute("SELECT rodado_em FROM public.vw_metricas_disponibilidade WHERE chave = 'prof.vencidas'").fetchone()
        assert row == (None,)


def test_rodado_em_e_a_rodada_mais_antiga_das_dependencias():
    with _banco() as c:
        _rodada(c, "I04", horas=1)
        _rodada(c, "I05", horas=3)
        antes = c.execute(
            "SELECT rodado_em FROM public.vw_metricas_disponibilidade WHERE chave = 'aluno.progresso'"
        ).fetchone()[0]
        mais_antiga = c.execute(
            "SELECT min(rodado_em) FROM public.metricas_invariante_resultado WHERE invariante IN ('I04','I05')"
        ).fetchone()[0]
        assert antes == mais_antiga


def test_ids_de_invariante_fora_do_formato_sao_recusados():
    with _banco() as c:
        for invalida in ("I8", "i08", "I21", "I00"):
            with pytest.raises(psycopg.errors.CheckViolation):
                _rodada(c, invalida)
            with pytest.raises(psycopg.errors.CheckViolation):
                c.execute("UPDATE public.metricas_catalogo SET invariantes = %s WHERE chave = 'prof.vencidas'", ([invalida],))
            with pytest.raises(psycopg.errors.CheckViolation):
                c.execute("INSERT INTO public.metricas_invariante_amostra (invariante, ids) VALUES (%s, '{}')", (invalida,))


def test_publico_fora_da_lista_e_recusado():
    with _banco() as c:
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute("UPDATE public.metricas_catalogo SET publico = '{admin}' WHERE chave = 'dev.ia'")
        with pytest.raises(psycopg.errors.CheckViolation):
            c.execute("UPDATE public.metricas_catalogo SET requer_validacao = 'x' WHERE chave = 'dev.ia'")


def test_aluno_nao_le_amostra_nem_escreve():
    with _banco() as c:
        # a amostra tem ids de aluno: gravada pelo executor, nunca lida por cliente
        c.execute(
            "INSERT INTO public.metricas_invariante_amostra (invariante, ids) VALUES ('I08', ARRAY[%s])",
            (str(ALUNO),),
        )
        _todas_verdes(c)

        # SELECT na amostra: 42501 (sem GRANT); 0 linhas também seria aceitável, mas aqui é a regra mais forte
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                _como_cliente(c)
                c.execute("SELECT * FROM public.metricas_invariante_amostra").fetchall()
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                _como_cliente(c, "anon")
                c.execute("SELECT * FROM public.metricas_invariante_amostra").fetchall()

        # escrita em catálogo e resultado
        escritas = [
            "INSERT INTO public.metricas_catalogo (chave, nome, descricao, publico, fonte) "
            "VALUES ('x.y', 'n', 'd', '{aluno}', 'f')",
            "UPDATE public.metricas_catalogo SET validacao_promovida = true WHERE chave = 'aluno.dominio'",
            "DELETE FROM public.metricas_catalogo WHERE chave = 'prof.vencidas'",
            "INSERT INTO public.metricas_invariante_resultado (invariante, ok) VALUES ('I08', true)",
            "UPDATE public.metricas_invariante_resultado SET ok = true",
            "DELETE FROM public.metricas_invariante_resultado",
            "INSERT INTO public.metricas_invariante_amostra (invariante, ids) VALUES ('I08', '{}')",
        ]
        for sql in escritas:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    _como_cliente(c)
                    c.execute(sql)

        # e nada mudou
        assert c.execute("SELECT validacao_promovida FROM public.metricas_catalogo WHERE chave = 'aluno.dominio'").fetchone() == (False,)
        assert c.execute("SELECT count(*) FROM public.metricas_catalogo").fetchone()[0] == 21


def test_aluno_le_catalogo_resultado_e_a_view():
    with _banco() as c:
        _todas_verdes(c)
        with c.transaction():
            _como_cliente(c)
            assert c.execute("SELECT count(*) FROM public.metricas_catalogo").fetchone()[0] == 21
            assert c.execute("SELECT count(*) FROM public.metricas_invariante_resultado").fetchone()[0] == 20
            disp = c.execute("SELECT chave, disponivel FROM public.vw_metricas_disponibilidade").fetchall()
            assert len(disp) == 21
            assert dict(disp)["aluno.ranking"] is True


def test_aluno_le_o_resultado_sem_a_coluna_erro():
    """R10: `erro` guarda SQLSTATE e texto de exceção; o cliente lê as outras colunas e a view, não ela."""
    with _banco() as c:
        _todas_verdes(c)
        c.execute("UPDATE public.metricas_invariante_resultado SET erro = '42883: function ausente' WHERE invariante = 'I01'")
        with c.transaction():
            _como_cliente(c)
            assert c.execute(
                "SELECT count(id), count(invariante), count(rodado_em), count(ok), count(linhas) "
                "FROM public.metricas_invariante_resultado"
            ).fetchone() == (20, 20, 20, 20, 20)
            # a view (security_invoker) não lê `erro`: continua respondendo ao authenticated
            assert len(c.execute("SELECT chave FROM public.vw_metricas_disponibilidade").fetchall()) == 21
        for sql in (
            "SELECT erro FROM public.metricas_invariante_resultado",
            "SELECT * FROM public.metricas_invariante_resultado",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    _como_cliente(c)
                    c.execute(sql).fetchall()


def test_anonimo_nao_le_nada_disto():
    with _banco() as c:
        for tabela in ("metricas_catalogo", "metricas_invariante_resultado", "metricas_invariante_amostra",
                       "vw_metricas_disponibilidade"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    _como_cliente(c, "anon")
                    c.execute(f"SELECT 1 FROM public.{tabela}").fetchall()


def test_service_role_le_e_escreve_tudo():
    with _banco() as c:
        with c.transaction():
            _como_cliente(c, "service_role")
            c.execute("INSERT INTO public.metricas_invariante_resultado (invariante, ok) VALUES ('I01', true)")
            c.execute("INSERT INTO public.metricas_invariante_amostra (invariante, ids) VALUES ('I01', '{a,b}')")
            assert c.execute("SELECT count(*) FROM public.metricas_invariante_amostra").fetchone()[0] == 1
            assert c.execute("SELECT count(*) FROM public.vw_metricas_disponibilidade").fetchone()[0] == 21


def test_view_e_security_invoker_e_as_tabelas_tem_rls():
    with _banco() as c:
        assert c.execute(
            "SELECT reloptions FROM pg_class WHERE oid = 'public.vw_metricas_disponibilidade'::regclass"
        ).fetchone()[0] == ["security_invoker=on"]
        for tabela in ("metricas_catalogo", "metricas_invariante_resultado", "metricas_invariante_amostra"):
            assert c.execute("SELECT relrowsecurity FROM pg_class WHERE oid = %s::regclass", (f"public.{tabela}",)).fetchone() == (True,)
        # amostra: nenhuma policy
        assert c.execute("SELECT count(*) FROM pg_policies WHERE tablename = 'metricas_invariante_amostra'").fetchone()[0] == 0


def test_downgrade_remove_tudo():
    with _banco() as c:
        for sql in base._sql_de(M_CATALOGO, "downgrade"):
            c.execute(sql)
        assert c.execute(
            "SELECT count(*) FROM pg_class WHERE relname LIKE 'metricas\\_%' OR relname = 'vw_metricas_disponibilidade'"
        ).fetchone()[0] == 0
