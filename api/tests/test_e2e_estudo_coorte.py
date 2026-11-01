"""`20261102_02` e `_03`: cohort, baseline, marcos e PR1/PR2 lado a lado (#13).

Banco local com o esqueleto de produção, os GRANTs que o Supabase dá por padrão a toda tabela nova
(para que o REVOKE das migrations seja posto à prova, e não passe por acidente), os helpers de posse
reais, `app_e_dev`, o catálogo de métricas e a tabela de tentativas da #136. As RPCs e a view são
chamadas como `authenticated` com as claims de quem chama, como o PostgREST faria.

Os números esperados foram calculados à mão; cada asserção diz a conta.
"""

from __future__ import annotations

import json
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import POSSE, _trecho

M_COORTE = f5.modulo("20261102_02_estudo_coorte_e_marcos.py")
M_RPC = f5.modulo("20261102_03_metricas_estudo_coortes.py")
M_CATALOGO = f5.modulo("20261029_02_catalogo_de_metricas.py")
APP_E_DEV = f5.modulo("20261020_01_economia_configuracao.py").DEV
TENTATIVAS = _trecho(
    "20261101_13_tentativas_com_tempo_do_servidor.py", "CREATE TABLE IF NOT EXISTS public.atividade_tentativas (", "\n);"
)
RETENCAO = _trecho("20261024_03_retencao_e_expurgo.py", "CREATE TABLE IF NOT EXISTS public.retencao_politica (", "\n);")
GRANTS_SUPABASE = """
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
"""

OUTRO_PROF = uuid.UUID(int=12)
D = uuid.UUID(int=24)  # matriculado depois do corte: não é pareado
TURMA2 = 2
UTC = "UTC"


def _banco(*depois: str):
    return f5.banco(
        GRANTS_SUPABASE, POSSE, APP_E_DEV, TENTATIVAS, RETENCAO, *f5.sql_de(M_CATALOGO),
        *f5.sql_de(M_COORTE), *f5.sql_de(M_RPC), *depois,
    )


def _como(c, quem, sql: str, params=()):
    c.execute("BEGIN")
    try:
        f5.como(c, quem)
        c.execute("SET LOCAL ROLE authenticated")
        r = c.execute(sql, params).fetchall()
        c.execute("COMMIT")
        return r
    except Exception:
        c.execute("ROLLBACK")
        raise
    finally:
        f5.como(c, None)


def _anon(c, sql: str):
    c.execute("BEGIN")
    try:
        c.execute("SET LOCAL ROLE anon")
        return c.execute(sql).fetchall()
    finally:
        c.execute("ROLLBACK")


def _coorte(c, classe: int, braco: str, baseline: str, corte: str, fim: str | None, rotulo: str = "A") -> None:
    """Direto como dono: o RPC recusa baseline no passado, que é o que estes testes precisam."""
    c.execute(
        "INSERT INTO public.estudo_coorte (classe_id, estudo, rotulo, braco, baseline_inicio, corte, fim, timezone)"
        " VALUES (%s, 'tcc-piloto', %s, %s, %s, %s, %s, %s)",
        (classe, rotulo, braco, baseline, corte, fim, UTC),
    )


def _n_minimo(c, n: int) -> None:
    c.execute("UPDATE public.metricas_catalogo SET n_minimo = %s WHERE left(chave, 7) = 'estudo.'", (n,))


def _semear(c) -> None:
    f5.semear_turma(c)
    for tabela in ("atividades", "questoes", "questao_aluno", "conteudo_personalizado"):
        f5.afrouxa(c, tabela)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{OUTRO_PROF}', 'p2@teste.invalid'), ('{D}', 'd@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{OUTRO_PROF}', 'Outro');
INSERT INTO public.alunos (id, nome, email) VALUES ('{D}', 'D', 'd@teste.invalid');
INSERT INTO public.classe_aluno (classe_id, aluno_id, created_at) VALUES ({f5.TURMA}, '{D}', '2026-10-25T12:00:00Z');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE
  VALUES ({TURMA2}, 1, '{f5.PROF}', 'T2'), (3, 1, '{OUTRO_PROF}', 'T3');
INSERT INTO public.topicos (id, classe_id, nome, ordem) OVERRIDING SYSTEM VALUE VALUES (20, {TURMA2}, 'Vinte', 1);
INSERT INTO public.classe_aluno (classe_id, aluno_id, created_at) VALUES
  ({TURMA2}, '{f5.B}', '2026-10-01T12:00:00Z'), ({TURMA2}, '{f5.C}', '2026-10-01T12:00:00Z');
INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (500, 10, 'Quiz'), (501, 11, 'Quiz 2');
INSERT INTO public.questoes (id, atividade_id, enunciado) OVERRIDING SYSTEM VALUE VALUES (900, 500, 'Q'), (901, 501, 'Q2');
"""
    )


def _dados_da_turma1(c) -> None:
    """Intervenção: baseline 04/10–17/10 (2 semanas), pós 18/10–31/10 (2 semanas). A, B, C pareados."""
    _coorte(c, f5.TURMA, "intervencao", "2026-10-04", "2026-10-18", "2026-10-31")
    s = uuid.uuid4()
    f5.sessao(c, s, f5.A, "2026-10-02T10:00:00Z", None)
    # PR1, escopo topic. Pré: A 600 s. Pós: A 1200 s, B 300 s. Fora: antes do baseline e escopo content.
    f5.tempo(c, s, f5.A, "topic", 10, 600, 30, "2026-10-06T10:00:00Z")
    f5.tempo(c, s, f5.A, "topic", 11, 1200, 0, "2026-10-20T10:00:00Z")
    f5.tempo(c, s, f5.B, "topic", 11, 300, 0, "2026-10-21T10:00:00Z")
    f5.tempo(c, s, f5.A, "topic", 10, 5000, 0, "2026-10-02T10:00:00Z")
    f5.tempo(c, s, f5.A, "content", 11, 999, 0, "2026-10-20T10:00:00Z")
    f5.tempo(c, s, D, "topic", 11, 3000, 0, "2026-10-26T10:00:00Z")  # D não é pareado
    # Exposição a material personalizado no baseline (contaminação): A em 08/10.
    f5.tempo(c, s, f5.A, "material", 10, 60, 0, "2026-10-08T10:00:00Z")
    # PR2: conclusões (pré 1, pós 2).
    c.execute(
        "INSERT INTO public.topico_aluno_conclusao (aluno_id, topico_id, classe_id, concluido_em) VALUES"
        " (%s, 10, 1, '2026-10-10T10:00:00Z'), (%s, 11, 1, '2026-10-22T10:00:00Z'),"
        " (%s, 10, 1, '2026-10-23T10:00:00Z')",
        (f5.A, f5.A, f5.B),
    )
    # PR2: entregas (pré: B na 501; pós: A na 500, duas tentativas contam uma).
    c.execute(
        "INSERT INTO public.atividade_tentativas (aluno_id, atividade_id, classe_id, numero, iniciada_em,"
        " respondida_em, cronometrada) VALUES"
        " (%s, 501, 1, 1, '2026-10-12T09:00:00Z', '2026-10-12T10:00:00Z', false),"
        " (%s, 500, 1, 1, '2026-10-24T09:00:00Z', '2026-10-24T10:00:00Z', false),"
        " (%s, 500, 1, 2, '2026-10-25T09:00:00Z', '2026-10-25T10:00:00Z', false)",
        (f5.B, f5.A, f5.A),
    )
    # PR2: acerto na 1ª tentativa. Pré: A errou, B acertou (50%). Pós: A, B, C acertaram (100%);
    # a 2ª tentativa de C, errada, não entra.
    c.execute(
        "INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, tentativa, resposta, correta, criado_em)"
        " VALUES (%s, 900, 500, 1, 'x', false, '2026-10-07T10:00:00Z'),"
        " (%s, 900, 500, 1, 'x', true, '2026-10-07T10:00:00Z'),"
        " (%s, 901, 501, 1, 'x', true, '2026-10-20T10:00:00Z'),"
        " (%s, 901, 501, 1, 'x', true, '2026-10-20T10:00:00Z'),"
        " (%s, 901, 501, 1, 'x', true, '2026-10-20T10:00:00Z'),"
        " (%s, 901, 501, 2, 'x', false, '2026-10-21T10:00:00Z')",
        (f5.A, f5.B, f5.A, f5.B, f5.C, f5.C),
    )
    # Material pronto antes do corte: o baseline está contaminado.
    c.execute(
        "INSERT INTO public.conteudo_personalizado (classe_id, topico_id, ciclo_id, status, gerado_em, materiais)"
        " VALUES (1, 10, 'ciclo-1', 'pronto', '2026-10-10T10:00:00Z', '{}')"
    )
    # Marcos: global no baseline, da turma no pós, um fora do estudo; e uma versão nova do app.
    c.execute(
        "INSERT INTO public.marco_produto (ocorrido_em, tipo, descricao, classe_id, origem) VALUES"
        " ('2026-10-10T10:00:00Z', 'api', 'deploy da api', NULL, 'manual'),"
        " ('2026-10-19T10:00:00Z', 'aula', 'aula de revisao', 1, 'manual'),"
        " ('2026-09-01T10:00:00Z', 'api', 'antes do estudo', NULL, 'manual')"
    )
    c.execute(
        "INSERT INTO public.telemetria_lotes (id, sessao_id, aluno_id, classe_id, flush_reason, captured_at, payload)"
        " VALUES (%s, %s, %s, 1, 'interval', '2026-10-20T11:00:00Z', %s)",
        (uuid.uuid4(), s, f5.A, json.dumps({"cliente": {"app_version": "1.0.4", "plataforma": "web"}})),
    )


def _rpc(c, quem, classes: list[int]) -> dict:
    return _como(c, quem, "SELECT public.metricas_estudo_coortes(%s)", (classes,))[0][0]


# ------------------------------------------------------------------------------------- números


@f5.e2e
def test_pr1_e_pr2_antes_e_depois_do_corte() -> None:
    with _banco() as c:
        _semear(c)
        _dados_da_turma1(c)
        _n_minimo(c, 1)
        r = _rpc(c, f5.PROF, [f5.TURMA])
        t = r["coortes"][0]
        pre, pos = t["pre"], t["pos"]
        assert (t["braco"], t["fase_atual"]) == ("intervencao", "encerrado")
        assert (pre["dias"], pos["dias"]) == (14, 14)
        assert pre["pareados"] == pos["pareados"] == 3  # D entrou depois do corte
        # PR1: 600 s = 10 min / 3 alunos / 2 semanas; pós: 1500 s = 25 min / 3 / 2.
        assert pre["pr1"]["tempo_ativo_min_por_aluno_semana"] == pytest.approx(1.67)
        assert pos["pr1"]["tempo_ativo_min_por_aluno_semana"] == pytest.approx(4.17)
        assert (pre["pr1"]["alunos_ativos_pct"], pos["pr1"]["alunos_ativos_pct"]) == (33.33, 66.67)
        # PR2: conclusões 1 e 2, entregas 1 e 1, por 6 aluno-semanas.
        assert pre["pr2"]["topicos_concluidos_por_aluno_semana"] == pytest.approx(0.167)
        assert pos["pr2"]["topicos_concluidos_por_aluno_semana"] == pytest.approx(0.333)
        assert pre["pr2"]["atividades_entregues_por_aluno_semana"] == pytest.approx(0.167)
        assert pos["pr2"]["atividades_entregues_por_aluno_semana"] == pytest.approx(0.167)
        assert (pre["pr2"]["acerto_primeira_tentativa_pct"], pos["pr2"]["acerto_primeira_tentativa_pct"]) == (50, 100)
        assert (pre["pr2"]["respostas_primeira_tentativa"], pos["pr2"]["respostas_primeira_tentativa"]) == (2, 3)


@f5.e2e
def test_contaminacao_marcos_e_plataforma() -> None:
    with _banco() as c:
        _semear(c)
        _dados_da_turma1(c)
        _n_minimo(c, 1)
        t = _rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]
        assert t["contaminacao"] == {
            "material_pronto_antes_do_corte": True,
            "comparacao_recebeu_personalizacao": None,
            "baseline_contaminado": True,
        }
        assert t["pre"]["exposicao"] == {"alunos_expostos_pct": 33.33, "ciclos_personalizacao": 1}
        marcos = [(m["descricao"], m["escopo"], m["fase"]) for m in t["marcos"]]
        assert marcos == [
            ("deploy da api", "global", "pre"),
            ("aula de revisao", "turma", "pos"),
            ("primeiro lote da versao 1.0.4", "global", "pos"),
        ]
        assert t["pos"]["lotes_por_plataforma"] == {"sem_cliente": 3, "web": 1}  # D não é pareado


@f5.e2e
def test_serie_semanal_relativa_ao_corte() -> None:
    with _banco() as c:
        _semear(c)
        _dados_da_turma1(c)
        _n_minimo(c, 1)
        serie = _rpc(c, f5.PROF, [f5.TURMA])["coortes"][0]["serie_semanal"]
        assert [(s["semana"], s["fase"], s["dias"]) for s in serie] == [
            (-2, "pre", 7), (-1, "pre", 7), (0, "pos", 7), (1, "pos", 7),
        ]
        # Semana 0 (18/10–24/10): A 1200 s + B 300 s = 25 min / 3 alunos / 1 semana.
        assert serie[2]["pr1"]["tempo_ativo_min_por_aluno_semana"] == pytest.approx(8.33)
        assert serie[1]["pr1"]["tempo_ativo_min_por_aluno_semana"] == 0
        assert [s["marcos"] for s in serie] == [1, 0, 1, 0]  # só os gravados; a versão do app é derivada


@f5.e2e
def test_diferenca_em_diferencas_com_turma_de_comparacao() -> None:
    with _banco() as c:
        _semear(c)
        _dados_da_turma1(c)
        _coorte(c, TURMA2, "comparacao", "2026-10-04", "2026-10-18", "2026-10-31", rotulo="B")
        s = uuid.uuid4()
        f5.sessao(c, s, f5.B, "2026-10-05T10:00:00Z", None)
        c.execute("UPDATE public.telemetria_sessoes SET classe_id = %s WHERE id = %s", (TURMA2, s))
        for quando in ("2026-10-07T10:00:00Z", "2026-10-20T10:00:00Z"):
            f5.tempo(c, s, f5.B, "topic", 20, 420, 0, quando)
        for tabela in ("telemetria_time_metric_entries", "telemetria_lotes"):
            c.execute(f"UPDATE public.{tabela} SET classe_id = %s WHERE topico_id = 20", (TURMA2,))
        _n_minimo(c, 1)
        r = _rpc(c, f5.PROF, [f5.TURMA, TURMA2])
        assert [t["rotulo"] for t in r["coortes"]] == ["A", "B"]
        comp = r["coortes"][1]
        # Comparação: 7 min / 2 alunos / 2 semanas nas duas janelas.
        assert comp["pre"]["pr1"]["tempo_ativo_min_por_aluno_semana"] == 1.75
        assert comp["pos"]["pr1"]["tempo_ativo_min_por_aluno_semana"] == 1.75
        assert comp["contaminacao"]["comparacao_recebeu_personalizacao"] is False
        # (25/6 − 10/6) − (1,75 − 1,75) = 2,5.
        did = r["comparacao"]["diferenca_em_diferencas"]
        assert did["tempo_ativo_min_por_aluno_semana"] == 2.5
        assert r["comparacao"]["cortes_alinhados"] is True
        assert {(b["braco"], b["fase"]) for b in r["comparacao"]["bracos"]} == {
            ("intervencao", "pre"), ("intervencao", "pos"), ("comparacao", "pre"), ("comparacao", "pos"),
        }


# -------------------------------------------------------------------------------- anonimização


@f5.e2e
def test_amostra_menor_que_o_minimo_volta_nula() -> None:
    with _banco() as c:
        _semear(c)
        _dados_da_turma1(c)  # n_minimo do catálogo: 5, e há 3 pareados
        r = _rpc(c, f5.PROF, [f5.TURMA])
        pre = r["coortes"][0]["pre"]
        assert r["n_minimo"] == 5
        assert pre["amostra_insuficiente"] is True
        assert pre["pareados"] is None
        assert pre["pr1"] == {"tempo_ativo_min_por_aluno_semana": None, "alunos_ativos_pct": None}
        assert pre["pr2"]["acerto_primeira_tentativa_pct"] is None
        assert pre["pr2"]["acerto_amostra_insuficiente"] is True
        assert r["comparacao"]["diferenca_em_diferencas"]["tempo_ativo_min_por_aluno_semana"] is None
        texto = json.dumps(r)
        for aluno in (f5.A, f5.B, f5.C, D):
            assert str(aluno) not in texto


@f5.e2e
def test_rpc_so_para_o_professor_dono_e_turma_com_coorte() -> None:
    with _banco() as c:
        _semear(c)
        _dados_da_turma1(c)
        for quem in (f5.A, OUTRO_PROF, None):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _rpc(c, quem, [f5.TURMA])
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _rpc(c, f5.PROF, [f5.TURMA, 3])  # a turma 3 é de outro professor
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="turma_sem_coorte"):
            _rpc(c, f5.PROF, [TURMA2])
        for interna in ("estudo_indicadores_janela(1, '2026-10-01', '2026-10-02', '2026-10-02', 'UTC')",
                        "estudo_indicadores_publicos('{}', 1)"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _como(c, f5.PROF, f"SELECT public.{interna}")


# ------------------------------------------------------------------------------------ RLS e view


@f5.e2e
def test_participante_diz_coorte_e_data_de_entrada() -> None:
    with _banco() as c:
        _semear(c)
        _dados_da_turma1(c)
        linhas = _como(
            c, f5.PROF,
            "SELECT aluno_id, rotulo, braco, pareado, entrada_intervencao::text, exposto_no_baseline, fase_atual"
            " FROM public.vw_estudo_participantes ORDER BY aluno_id",
        )
        assert linhas == [
            (f5.A, "A", "intervencao", True, "2026-10-18", True, "encerrado"),
            (f5.B, "A", "intervencao", True, "2026-10-18", False, "encerrado"),
            (f5.C, "A", "intervencao", True, "2026-10-18", False, "encerrado"),
            (D, "A", "intervencao", False, "2026-10-25", False, "encerrado"),
        ]


@f5.e2e
def test_aluno_e_outro_professor_nao_veem_e_anon_nao_le() -> None:
    with _banco() as c:
        _semear(c)
        _dados_da_turma1(c)
        c.execute(
            "INSERT INTO public.topico_aluno_conclusao (aluno_id, topico_id, classe_id) VALUES (%s, 12, 1)", (f5.C,)
        )
        for tabela in ("estudo_coorte", "marco_produto", "vw_estudo_participantes", "topico_aluno_conclusao"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _anon(c, f"SELECT count(*) FROM public.{tabela}")
        for tabela in ("estudo_coorte", "marco_produto", "vw_estudo_participantes"):
            assert _como(c, f5.A, f"SELECT count(*) FROM public.{tabela}") == [(0,)], tabela
        for tabela in ("estudo_coorte", "vw_estudo_participantes", "topico_aluno_conclusao"):
            assert _como(c, OUTRO_PROF, f"SELECT count(*) FROM public.{tabela}") == [(0,)], tabela
        # Outro professor dá aula (turma 3): vê os dois marcos globais, nenhum da turma 1.
        assert _como(
            c, OUTRO_PROF, "SELECT count(*) FILTER (WHERE classe_id IS NULL), count(*) FROM public.marco_produto"
        ) == [(2, 2)]
        assert _como(c, f5.PROF, "SELECT count(*) FROM public.estudo_coorte") == [(1,)]
        # Conclusão: o aluno vê a própria, o professor vê a turma.
        assert _como(c, f5.A, "SELECT count(*) FROM public.topico_aluno_conclusao") == [(2,)]
        assert _como(c, f5.PROF, "SELECT count(*) FROM public.topico_aluno_conclusao") == [(4,)]


@f5.e2e
def test_cliente_nao_escreve_direto() -> None:
    with _banco() as c:
        _semear(c)
        for sql in (
            "INSERT INTO public.estudo_coorte (classe_id, estudo, rotulo, braco, baseline_inicio, corte)"
            " VALUES (1, 'x', 'x', 'intervencao', '2030-01-01', '2030-01-15')",
            "INSERT INTO public.marco_produto (tipo, descricao, origem) VALUES ('api', 'x', 'manual')",
            "INSERT INTO public.topico_aluno_conclusao (aluno_id, topico_id, classe_id) VALUES"
            f" ('{f5.A}', 10, 1)",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _como(c, f5.PROF, sql)


# ---------------------------------------------------------------------------- registro e trava


@f5.e2e
def test_registro_prospectivo_e_protocolo_travado() -> None:
    with _banco() as c:
        _semear(c)
        reg = "SELECT public.estudo_coorte_registrar(%s, 'tcc', 'A', 'intervencao', %s::date, %s::date, NULL, 'UTC')"
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="baseline_no_passado"):
            _como(c, f5.PROF, reg, (f5.TURMA, "2020-01-01", "2020-01-15"))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _como(c, OUTRO_PROF, reg, (f5.TURMA, "2030-01-01", "2030-01-15"))
        with pytest.raises(psycopg.errors.CheckViolation):  # baseline de menos de uma semana
            _como(c, f5.PROF, reg, (f5.TURMA, "2030-01-01", "2030-01-05"))
        cid = _como(c, f5.PROF, reg, (f5.TURMA, "2030-01-01", "2030-01-15"))[0][0]
        # Antes de começar, muda à vontade; a mudança vira marco de protocolo.
        assert _como(c, f5.PROF, reg, (f5.TURMA, "2030-01-08", "2030-01-22"))[0][0] == cid
        protocolo = c.execute(
            "SELECT descricao FROM public.marco_produto WHERE tipo = 'protocolo' ORDER BY id"
        ).fetchall()
        assert protocolo == [("turma entra no estudo",), ("protocolo da turma alterado",)]
        assert _como(c, f5.PROF, "SELECT public.estudo_coorte_remover(%s)", (f5.TURMA,)) == [(True,)]

        # Já começou: o dono do banco põe datas passadas; o corte e o baseline travam.
        _coorte(c, f5.TURMA, "intervencao", "2026-10-04", "2026-10-18", None)
        with pytest.raises(psycopg.errors.ObjectNotInPrerequisiteState, match="baseline_ja_comecou"):
            _como(c, f5.PROF, "SELECT public.estudo_coorte_remover(%s)", (f5.TURMA,))
        with pytest.raises(psycopg.errors.ObjectNotInPrerequisiteState, match="corte_ja_passou"):
            c.execute("UPDATE public.estudo_coorte SET corte = '2026-10-25' WHERE classe_id = 1")
        with pytest.raises(psycopg.errors.ObjectNotInPrerequisiteState, match="baseline_ja_comecou"):
            c.execute("UPDATE public.estudo_coorte SET braco = 'comparacao' WHERE classe_id = 1")
        # Encerrar (pôr `fim`) continua possível.
        _como(
            c, f5.PROF,
            "SELECT public.estudo_coorte_registrar(1, 'tcc-piloto', 'A', 'intervencao', '2026-10-04', '2026-10-18',"
            " '2026-12-20', 'UTC')",
        )
        assert c.execute("SELECT fim::text FROM public.estudo_coorte WHERE classe_id = 1").fetchone() == ("2026-12-20",)


@f5.e2e
def test_marco_manual_e_automatico_da_migracao() -> None:
    with _banco() as c:
        _semear(c)
        reg = "SELECT public.marco_produto_registrar(%s, %s, 'mudou', 'pr-1', %s::timestamptz)"
        assert _como(c, f5.PROF, reg, (f5.TURMA, "conteudo", "2026-10-20T10:00:00Z"))[0][0] > 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="marco_global_so_dev"):
            _como(c, f5.PROF, reg, (None, "api", "2026-10-20T10:00:00Z"))
        c.execute("INSERT INTO public.plataforma_dev (user_id) VALUES (%s)", (f5.PROF,))
        assert _como(c, f5.PROF, reg, (None, "api", "2026-10-20T10:00:00Z"))[0][0] > 0
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="tipo_de_marco_invalido"):
            _como(c, f5.PROF, reg, (f5.TURMA, "migracao", "2026-10-20T10:00:00Z"))
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="marco_no_futuro"):
            _como(c, f5.PROF, reg, (f5.TURMA, "aula", "2099-01-01T00:00:00Z"))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _como(c, OUTRO_PROF, reg, (f5.TURMA, "aula", "2026-10-20T10:00:00Z"))

        c.execute("INSERT INTO public.alembic_version (version_num) VALUES ('20261102_02')")
        c.execute("UPDATE public.alembic_version SET version_num = '20261102_03'")
        assert c.execute(
            "SELECT referencia, origem FROM public.marco_produto WHERE tipo = 'migracao' ORDER BY id"
        ).fetchall() == [("20261102_02", "automatico"), ("20261102_03", "automatico")]


@f5.e2e
def test_marco_da_migracao_nunca_derruba_a_migracao() -> None:
    with _banco() as c:
        c.execute("ALTER TABLE public.marco_produto ADD CONSTRAINT quebra CHECK (tipo <> 'migracao')")
        c.execute("INSERT INTO public.alembic_version (version_num) VALUES ('20261102_03')")
        assert c.execute("SELECT version_num FROM public.alembic_version").fetchone() == ("20261102_03",)


@f5.e2e
def test_primeira_conclusao_do_topico_fica_com_a_data() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.topico_aluno (aluno_id, topico_id, status) VALUES (%s, 10, 'não iniciado')", (f5.A,)
        )
        assert c.execute("SELECT count(*) FROM public.topico_aluno_conclusao").fetchone() == (0,)
        c.execute("UPDATE public.topico_aluno SET status = 'concluido' WHERE aluno_id = %s", (f5.A,))
        primeira = c.execute(
            "SELECT classe_id, concluido_em FROM public.topico_aluno_conclusao WHERE aluno_id = %s", (f5.A,)
        ).fetchone()
        assert primeira[0] == f5.TURMA
        c.execute(
            "UPDATE public.topico_aluno_conclusao SET concluido_em = '2026-10-10T10:00:00Z' WHERE aluno_id = %s",
            (f5.A,),
        )
        # Volta para "em andamento" (o professor pôs material novo) e conclui de novo: a data não muda.
        c.execute("UPDATE public.topico_aluno SET status = 'em andamento' WHERE aluno_id = %s", (f5.A,))
        c.execute("UPDATE public.topico_aluno SET status = 'concluido' WHERE aluno_id = %s", (f5.A,))
        assert c.execute(
            "SELECT count(*), min(concluido_em)::date::text FROM public.topico_aluno_conclusao"
        ).fetchone() == (1, "2026-10-10")
        # O aluno grava o próprio tópico como authenticated: o gatilho grava por ele.
        _como(c, f5.B, "INSERT INTO public.topico_aluno (aluno_id, topico_id, status) VALUES (%s, 11, 'concluido')"
              " RETURNING id", (f5.B,))
        assert c.execute("SELECT count(*) FROM public.topico_aluno_conclusao").fetchone() == (2,)


@f5.e2e
def test_downgrade_limpa() -> None:
    with _banco(*f5.sql_de(M_RPC, "downgrade"), *f5.sql_de(M_COORTE, "downgrade")) as c:
        restos = c.execute(
            "SELECT count(*) FROM pg_class WHERE relname IN"
            " ('estudo_coorte', 'marco_produto', 'topico_aluno_conclusao', 'vw_estudo_participantes')"
        ).fetchone()
        assert restos == (0,)
        assert c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname IN ('metricas_estudo_coortes', 'estudo_indicadores_janela',"
            " 'fn_marco_da_migracao', 'fn_topico_aluno_conclusao')"
        ).fetchone() == (0,)
        assert c.execute(
            "SELECT count(*) FROM public.metricas_catalogo WHERE left(chave, 7) = 'estudo.'"
        ).fetchone() == (0,)
        assert c.execute("SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_marco_da_migracao'").fetchone() == (0,)
