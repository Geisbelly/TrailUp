"""Ponta a ponta da `20261121_02` (momentos de cuidado) num Postgres de verdade.

Mesmo banco descartavel do e2e do consentimento (`TRAILUP_E2E_CUIDADO_DATABASE_URL`, Postgres
LOCAL), com as migrations `20261024_02`, `20261121_01` e `20261121_02` aplicadas como o
`upgrade()` emite. As RPCs sao chamadas como `authenticated` com as claims do aluno.
"""

from __future__ import annotations

import json
import uuid

import pytest

from tests import test_e2e_consentimento_cuidado as base
from tests.test_e2e_consentimento_cuidado import DSN, _admin, _um, como, registrar

pytestmark = pytest.mark.skipif(not DSN, reason="TRAILUP_E2E_CUIDADO_DATABASE_URL nao definido")

if DSN:
    import psycopg

ADULTO, COLEGA, OUTRO_ALUNO = base.ADULTO, base.MENOR_COM, base.MENOR_SEM
PROFESSOR, OUTRO_PROF = uuid.UUID(int=100), uuid.UUID(int=101)
CLASSE, OUTRA_CLASSE, TOPICO, ATIVIDADE = 1, 2, 10, 20


@pytest.fixture()
def db():
    with base._banco() as dsn:
        _admin(dsn, "INSERT INTO public.classe VALUES (%s, %s) RETURNING 1", (CLASSE, PROFESSOR))
        _admin(dsn, "INSERT INTO public.classe VALUES (%s, %s) RETURNING 1", (OUTRA_CLASSE, OUTRO_PROF))
        _admin(dsn, "INSERT INTO public.topicos VALUES (%s, %s) RETURNING 1", (TOPICO, CLASSE))
        _admin(dsn, "INSERT INTO public.atividades VALUES (%s, %s) RETURNING 1", (ATIVIDADE, TOPICO))
        for aluno in (ADULTO, COLEGA):
            _admin(dsn, "INSERT INTO public.classe_aluno VALUES (%s, %s) RETURNING 1", (CLASSE, aluno))
        for aluno in (ADULTO, COLEGA, OUTRO_ALUNO):
            base._nasc(dsn, aluno, base.NASC_ADULTO)
        yield dsn


@pytest.fixture()
def adulto_com_cuidado(db):
    registrar(db, ADULTO, aceito=True)
    return ADULTO


def registrar_app(dsn, uid=ADULTO, *, classe=CLASSE, topico=None, origem="sinais_de_uso",
                  fatos=None, acoes=None):
    return _um(dsn, uid, "SELECT public.cuidado_registrar(%s,%s,%s,%s::jsonb,%s::jsonb)",
               (classe, topico, origem, json.dumps(fatos or {}), json.dumps(acoes or {})))


def registrar_api(dsn, uid=ADULTO, *, classe=CLASSE, topico=None, origem="aluno_disse",
                  nivel="desconforto", fatos=None, acoes=None):
    return _admin(dsn, "SELECT public.fn_cuidado_registrar(%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb)",
                  (uid, classe, topico, origem, nivel, json.dumps(fatos or {}), json.dumps(acoes or {})))


def contar(dsn) -> int:
    return _admin(dsn, "SELECT count(*) FROM public.aluno_momento_cuidado")


def ultimo(dsn) -> dict:
    return _admin(dsn, "SELECT to_jsonb(m) FROM public.aluno_momento_cuidado m ORDER BY id DESC LIMIT 1")


def expirar(dsn):
    _admin(dsn, "UPDATE public.aluno_momento_cuidado SET expira_em = now() - interval '1 minute' RETURNING 1")


def cronometro(dsn, uid=ADULTO) -> bool:
    return _admin(dsn, "SELECT public.fn_cronometro_ligado(%s)", (uid,))


def test_sem_consentimento_nao_grava(db):
    assert registrar_app(db, fatos={"erros_seguidos": 5}) == {"ok": False, "motivo": "sem_consentimento"}
    assert contar(db) == 0


def test_grava_com_consentimento_e_devolve_expira_em(db, adulto_com_cuidado):
    r = registrar_app(db, fatos={"erros_seguidos": 5, "minutos_sem_parar": 50},
                      acoes={"pausa_sugerida": True})
    assert r["ok"] is True and r["atualizado"] is False and r["momento_id"]
    minutos = _admin(db, "SELECT extract(epoch FROM (expira_em - now())) / 60 FROM public.aluno_momento_cuidado")
    assert 119 <= float(minutos) <= 120
    assert ultimo(db)["nivel"] is None


def test_fato_fora_da_lista_e_recusado(db, adulto_com_cuidado):
    assert registrar_app(db, fatos={"texto": "oi"})["motivo"] == "fato_invalido"
    assert registrar_app(db, fatos={"erros_seguidos": "5"})["motivo"] == "fato_invalido"
    assert registrar_app(db, fatos={"erros_seguidos": 1001})["motivo"] == "fato_invalido"
    assert registrar_app(db, fatos={"erros_seguidos": 2.5})["motivo"] == "fato_invalido"
    assert registrar_app(db, acoes={"outra": True})["motivo"] == "acao_invalida"
    assert registrar_app(db, acoes={"cvv_indicado": "sim"})["motivo"] == "acao_invalida"
    assert contar(db) == 0


def test_cliente_so_registra_sinais_de_uso(db, adulto_com_cuidado):
    assert registrar_app(db, origem="aluno_disse") == {"ok": False, "motivo": "origem_invalida"}
    assert registrar_app(db, origem="qualquer") == {"ok": False, "motivo": "origem_invalida"}
    assert contar(db) == 0


def test_intervalo_vale_por_origem(db, adulto_com_cuidado):
    assert registrar_app(db)["ok"] is True
    assert registrar_app(db)["motivo"] == "intervalo"
    assert registrar_api(db, origem="aluno_disse", nivel="desconforto")["ok"] is True
    assert contar(db) == 2


def test_nivel_mais_alto_atualiza_o_momento_aberto(db, adulto_com_cuidado):
    registrar_api(db, nivel="desconforto")
    r = registrar_api(db, nivel="risco", acoes={"cvv_indicado": True})
    assert r["atualizado"] is True and contar(db) == 1
    m = ultimo(db)
    assert m["nivel"] == "risco" and m["acoes"] == {"cvv_indicado": True}
    # nivel igual ou menor dentro do intervalo nao grava
    assert registrar_api(db, nivel="crise")["motivo"] == "intervalo"
    assert registrar_api(db, nivel="risco")["motivo"] == "intervalo"
    assert contar(db) == 1


def test_nivel_obrigatorio_so_para_aluno_disse(db, adulto_com_cuidado):
    assert registrar_api(db, origem="aluno_disse", nivel=None)["motivo"] == "nivel_invalido"
    assert registrar_api(db, origem="aluno_disse", nivel="grave")["motivo"] == "nivel_invalido"
    assert registrar_api(db, origem="sinais_de_uso", nivel="crise")["motivo"] == "nivel_invalido"


def test_aluno_de_outra_turma_e_recusado(db, adulto_com_cuidado):
    assert registrar_app(db, classe=OUTRA_CLASSE)["motivo"] == "sem_matricula"
    assert registrar_app(db, topico=999)["motivo"] == "topico_invalido"
    assert contar(db) == 0


def test_cuidado_ativo_respeita_expira_em(db, adulto_com_cuidado):
    def ativo():
        return _um(db, ADULTO, "SELECT public.cuidado_ativo(%s)", (CLASSE,))

    assert ativo()["ativo"] is False
    registrar_app(db)
    r = ativo()
    assert r["ativo"] is True and r["origem"] == "sinais_de_uso" and r["expira_em"]
    expirar(db)
    assert ativo() == {"ativo": False, "expira_em": None, "origem": None}


def test_cronometro_desligado_durante_o_cuidado_mesmo_ligado_pelo_aluno(db, adulto_com_cuidado):
    _admin(db, "INSERT INTO public.aluno_cronometro VALUES (%s, true, 'aluno') RETURNING 1", (ADULTO,))
    assert cronometro(db) is True
    registrar_app(db)
    assert cronometro(db) is False
    expirar(db)
    assert cronometro(db) is True
    assert _admin(db, "SELECT origem FROM public.aluno_cronometro WHERE aluno_id = %s", (ADULTO,)) == "aluno"


def test_cronometro_dentro_de_funcao_definer_enxerga_o_momento(db, adulto_com_cuidado):
    # A funcao nao e SECURITY DEFINER; quem a chama sao as RPCs DEFINER (dono, por cima da RLS).
    with psycopg.connect(db, autocommit=True) as c:
        c.execute("CREATE FUNCTION public.t_liga(p uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER"
                  " SET search_path TO 'public' AS $$ SELECT public.fn_cronometro_ligado(p) $$")
        c.execute("GRANT EXECUTE ON FUNCTION public.t_liga(uuid) TO authenticated")
        c.execute("INSERT INTO public.aluno_cronometro VALUES (%s, true, 'aluno')", (ADULTO,))
    registrar_app(db)
    assert _um(db, ADULTO, "SELECT public.t_liga(%s)", (ADULTO,)) is False
    # O cliente nao a chama direto (sem EXECUTE), como antes.
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        _um(db, ADULTO, "SELECT public.fn_cronometro_ligado(%s)", (ADULTO,))


def _momento_risco(dsn):
    registrar_api(dsn, topico=TOPICO, nivel="risco", acoes={"cvv_indicado": True})


def test_professor_le_a_turma_sem_nivel(db, adulto_com_cuidado):
    _momento_risco(db)
    with como(db, PROFESSOR) as c:
        cur = c.execute("SELECT * FROM public.cuidado_da_turma(%s, %s)", (CLASSE, ADULTO))
        colunas = [d.name for d in cur.description]
        linhas = [dict(zip(colunas, r, strict=True)) for r in cur.fetchall()]
    assert "nivel" not in colunas and len(linhas) == 1
    assert linhas[0]["acoes"]["cvv_indicado"] is True and linhas[0]["topico_id"] == TOPICO


def test_acerto_antes_e_depois_do_momento(db, adulto_com_cuidado):
    for horas, pct in ((-3, 40), (-2, 60), (1, 90)):
        _admin(db, "INSERT INTO public.atividade_tentativas (aluno_id, classe_id, atividade_id,"
                   " respondida_em, acertos_percentual) VALUES (%s,%s,%s, now() + make_interval(hours => %s), %s)"
                   " RETURNING 1", (ADULTO, CLASSE, ATIVIDADE, horas, pct))
    _momento_risco(db)
    with como(db, PROFESSOR) as c:
        r = c.execute("SELECT tentativas_antes, acerto_antes_pct, tentativas_depois, acerto_depois_pct"
                      " FROM public.cuidado_da_turma(%s, %s)", (CLASSE, ADULTO)).fetchone()
    assert [float(x) for x in r] == [2, 50.0, 1, 90.0]


def test_professor_de_outra_turma_nao_le(db, adulto_com_cuidado):
    _momento_risco(db)
    with como(db, OUTRO_PROF) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("SELECT * FROM public.cuidado_da_turma(%s, %s)", (CLASSE, ADULTO)).fetchall()


def test_professor_nao_le_a_tabela_base(db, adulto_com_cuidado):
    _momento_risco(db)
    assert _um(db, PROFESSOR, "SELECT count(*) FROM public.aluno_momento_cuidado") == 0


def test_aluno_le_os_proprios_com_nivel(db, adulto_com_cuidado):
    _momento_risco(db)
    assert _um(db, ADULTO, "SELECT nivel FROM public.aluno_momento_cuidado") == "risco"
    assert _um(db, COLEGA, "SELECT count(*) FROM public.aluno_momento_cuidado") == 0


def test_cliente_nao_escreve_na_tabela_nem_chama_a_funcao_interna(db, adulto_com_cuidado):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        _um(db, ADULTO, "INSERT INTO public.aluno_momento_cuidado (aluno_id, classe_id, origem, expira_em)"
                        " VALUES (%s, 1, 'sinais_de_uso', now()) RETURNING 1", (ADULTO,))
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        _um(db, ADULTO, "SELECT public.fn_cuidado_registrar(%s,1,NULL,'aluno_disse','risco','{}','{}')", (ADULTO,))


def test_resposta_ao_aviso_grava_uma_vez_e_so_do_proprio(db, adulto_com_cuidado):
    registrar(db, COLEGA, aceito=True)
    m = registrar_app(db)["momento_id"]
    assert _um(db, COLEGA, "SELECT public.cuidado_responder(%s, 'pausou')", (m,)) is False
    assert _um(db, ADULTO, "SELECT public.cuidado_responder(%s, 'talvez')", (m,)) is False
    assert _um(db, ADULTO, "SELECT public.cuidado_responder(%s, 'pausou')", (m,)) is True
    assert _um(db, ADULTO, "SELECT public.cuidado_responder(%s, 'continuou')", (m,)) is False
    assert ultimo(db)["resposta"] == "pausou"


def test_config_e_retencao(db):
    cfg = _admin(db, "SELECT json_object_agg(chave, valor) FROM public.app_config WHERE chave LIKE 'cuidado_%%'")
    assert cfg == {"cuidado_erros_seguidos": "5", "cuidado_minutos_sem_parar": "50", "cuidado_abandonos": "2",
                   "cuidado_intervalo_min": "120", "cuidado_duracao_min": "120"}
    assert _admin(db, "SELECT bool_and(publico) FROM public.app_config WHERE chave LIKE 'cuidado_%%'") is True
    linha = _admin(db, "SELECT to_jsonb(r) FROM public.retencao_politica r WHERE tabela = 'aluno_momento_cuidado'")
    assert (linha["acao"], linha["coluna_aluno"], linha["coluna_tempo"], linha["dias"], linha["dias_pesquisa"]) == (
        "apagar", "aluno_id", "criado_em", 180, 180)
