"""`20261115_06`: aderência à ordem aconselhada e o acerto depois dela.

Turma 1, janela de outubro, sugestões gravadas em 05/10. A, B e C consentiram pesquisa; D não.

| sugestão         | recomendado  | primeiro material aberto depois de 05/10      | seguiu? |
|------------------|--------------|-----------------------------------------------|---------|
| A, tópico 10     | audio        | `audio` em 10/10 (o `markdown` de 03/10 é antes) | sim  |
| B, tópico 10     | apresentacao | `apresentacao-slides` em 11/10                 | sim     |
| C, tópico 10     | cards        | `texto` (= markdown) em 11/10                  | não     |
| A, tópico 11, conteúdo 7 | markdown | `markdown` do conteúdo 8 em 12/10 não conta; `pdf` do 7 em 13/10 | não |
| B, tópico 11     | audio        | nenhum                                         | sem decisão |
| D, tópico 10     | audio        | `audio`, mas D não consentiu                   | fora    |

Desfecho (1ª tentativa, depois da decisão, nas atividades do tópico):

- seguiu: A no 10 (900 certa; a 2ª tentativa fica fora) e B no 10 (900 errada) → 1 de 2;
- não seguiu: C no 10 (900 e 903 certas) e A no 11 (901 errada; a 904 de 12/10 é antes da decisão)
  → 2 de 3.
"""

from __future__ import annotations

import math
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_agregados_so_quem_consentiu as ac
from tests import test_e2e_estudo_coorte as e
from tests.test_e2e_kpis_por_topico import POSSE
from tests.test_e2e_retencao_expurgo import CARIMBO

M_ANTES = f5.modulo("20261115_05_girando_em_falso.py")
M = f5.modulo("20261115_06_aderencia_sugestao.py")
OUTUBRO = ("2026-10-01", "2026-10-31")
DEV = uuid.UUID(int=31)


def _banco(*depois: str):
    return f5.banco(
        e.GRANTS_SUPABASE, POSSE, CARIMBO, *f5.sql_de(ac.M_CONSENTIMENTO), e.APP_E_DEV, e.TENTATIVAS, e.RETENCAO,
        *f5.sql_de(e.M_CATALOGO), *f5.sql_de(M), *depois,
    )


def _n_minimo(c, n: int) -> None:
    c.execute("UPDATE public.metricas_catalogo SET n_minimo = %s WHERE chave = 'dev.aderencia_sugestao'", (n,))


def _rpc(c, quem, classes: list[int], janela=OUTUBRO) -> dict:
    return e._como(c, quem, "SELECT public.metricas_aderencia_sugestao(%s, %s, %s)", (classes, *janela))[0][0]


def _sugestao(c, aluno, topico: int, ordem: list[str], conteudo: int | None = None,
              atualizado: str = "2026-10-05T12:00:00Z") -> None:
    import json

    c.execute(
        "INSERT INTO public.personalizacao_sugestao (aluno_id, classe_id, topico_id, conteudo_id, formato_inicial,"
        " ordem, criado_em, atualizado_em) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
        (aluno, f5.TURMA, topico, conteudo, ordem[0], json.dumps([{"formato": f, "score": 1} for f in ordem]),
         atualizado, atualizado),
    )


def _material(c, sid, aluno, topico: int, tipo: str, quando: str, conteudo: int = 5) -> None:
    """Escopo `material`, `item_key` como o app grava (medido em produção), `conteudo_id` vazio."""
    item = f"content:{conteudo}:personalization:7:personalized:3:content:{conteudo}"
    lote = uuid.uuid4()
    c.execute(
        "INSERT INTO public.telemetria_lotes (id, sessao_id, aluno_id, classe_id, topico_id, screen_name, route_name,"
        " flush_reason, captured_at, study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count,"
        " scroll_distance_px, max_depth_px, payload)"
        " VALUES (%s, %s, %s, %s, %s, 't', 'r', 'interval', %s, 0, 60, 60, 0, 0, 0, 0, '{}')",
        (lote, sid, aluno, f5.TURMA, topico, quando),
    )
    c.execute(
        "INSERT INTO public.telemetria_time_metric_entries (lote_id, sessao_id, aluno_id, classe_id, topico_id, scope,"
        " item_key, material_tipo, dwell_sec, active_sec, idle_sec, captured_at)"
        " VALUES (%s, %s, %s, %s, %s, 'material', %s, %s, 60, 60, 0, %s)",
        (lote, sid, aluno, f5.TURMA, topico, item, tipo, quando),
    )


def _semear(c) -> None:
    e._semear(c)
    ac._consentir(c, f5.A, f5.B, f5.C)
    c.execute("INSERT INTO public.plataforma_dev (user_id) VALUES (%s)", (DEV,))
    c.execute(
        "INSERT INTO public.questoes (id, atividade_id, enunciado) OVERRIDING SYSTEM VALUE VALUES"
        " (903, 500, 'Q3'), (904, 501, 'Q4')"
    )
    _sugestao(c, f5.A, 10, ["audio", "markdown"])
    _sugestao(c, f5.B, 10, ["apresentacao", "markdown"])
    _sugestao(c, f5.C, 10, ["cards", "markdown"])
    _sugestao(c, f5.A, 11, ["markdown", "audio"], conteudo=7)
    _sugestao(c, f5.B, 11, ["audio"])
    _sugestao(c, e.D, 10, ["audio"])
    s, sb, sc, sd = (uuid.uuid4() for _ in range(4))
    for sid, aluno in ((s, f5.A), (sb, f5.B), (sc, f5.C), (sd, e.D)):
        f5.sessao(c, sid, aluno, "2026-10-01T10:00:00Z", None)
    _material(c, s, f5.A, 10, "markdown", "2026-10-03T12:00:00Z")  # antes da sugestão
    _material(c, s, f5.A, 10, "audio", "2026-10-10T12:00:00Z")
    _material(c, s, f5.A, 10, "markdown", "2026-10-10T13:00:00Z")  # segundo: não decide
    _material(c, sb, f5.B, 10, "apresentacao-slides", "2026-10-11T12:00:00Z")
    _material(c, sc, f5.C, 10, "texto", "2026-10-11T12:00:00Z")
    _material(c, s, f5.A, 11, "markdown", "2026-10-12T12:00:00Z", conteudo=8)  # outro conteúdo
    _material(c, s, f5.A, 11, "pdf", "2026-10-13T12:00:00Z", conteudo=7)
    _material(c, sd, e.D, 10, "audio", "2026-10-10T12:00:00Z")
    c.cursor().executemany(
        "INSERT INTO public.questao_aluno (aluno_id, questao_id, atividade_id, tentativa, resposta, correta, criado_em)"
        " VALUES (%s, %s, %s, %s, 'x', %s, %s)",
        [
            (f5.A, 900, 500, 1, True, "2026-10-10T15:00:00Z"),
            (f5.A, 900, 500, 2, False, "2026-10-10T16:00:00Z"),  # 2ª tentativa: fora
            (f5.B, 900, 500, 1, False, "2026-10-11T15:00:00Z"),
            (f5.C, 900, 500, 1, True, "2026-10-11T15:00:00Z"),
            (f5.C, 903, 500, 1, True, "2026-10-11T15:30:00Z"),
            (f5.A, 904, 501, 1, True, "2026-10-12T15:00:00Z"),  # antes da decisão de 13/10: fora
            (f5.A, 901, 501, 1, False, "2026-10-14T15:00:00Z"),
            (e.D, 900, 500, 1, True, "2026-10-10T15:00:00Z"),  # sem consentimento: fora
        ],
    )


def _wilson(k: int, n: int) -> list[float]:
    p, z = k / n, 1.96
    centro = (p + z * z / (2 * n)) / (1 + z * z / n)
    meia = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return [round(100 * max(centro - meia, 0), 2), round(100 * min(centro + meia, 1), 2)]


@f5.e2e
def test_aderencia_por_formato_e_desfecho() -> None:
    with _banco() as c:
        _semear(c)
        _n_minimo(c, 1)
        r = _rpc(c, DEV, [f5.TURMA])

        assert r["populacao"] == {"alunos": 3, "sugestoes_vigentes": 5, "sem_decisao": 1}

        ad = r["aderencia"]
        assert (ad["alunos"], ad["decididas"], ad["seguiram"], ad["seguiu_pct"]) == (3, 4, 2, 50)
        assert ad["ic95_pct"] == pytest.approx(_wilson(2, 4), abs=0.01)

        formatos = {f["formato"]: (f["decididas"], f["seguiram"]) for f in r["por_formato_recomendado"]}
        assert formatos == {"apresentacao": (1, 1), "audio": (1, 1), "cards": (1, 0), "markdown": (1, 0)}

        seguiu, nao = r["desfecho"]["seguiu"], r["desfecho"]["nao_seguiu"]
        assert (seguiu["alunos"], seguiu["topicos"], seguiu["respostas"]) == (2, 2, 2)
        assert seguiu["acerto_primeira_tentativa_pct"] == 50
        assert seguiu["ic95_pct"] == pytest.approx(_wilson(1, 2), abs=0.01)
        assert (nao["alunos"], nao["topicos"], nao["respostas"]) == (2, 2, 3)
        assert nao["acerto_primeira_tentativa_pct"] == pytest.approx(66.67)
        assert r["diferenca_pp"] == pytest.approx(50 - 66.67)
        assert "observacional" in r["limitacoes"][0]


@f5.e2e
def test_sugestao_revisada_conta_a_partir_da_revisao() -> None:
    """A sugestão de A no tópico 10 revisada em 20/10: nenhum material depois, vira sem decisão."""
    with _banco() as c:
        _semear(c)
        _n_minimo(c, 1)
        c.execute(
            "UPDATE public.personalizacao_sugestao SET atualizado_em = '2026-10-20T12:00:00Z'"
            " WHERE aluno_id = %s AND topico_id = 10",
            (f5.A,),
        )
        r = _rpc(c, DEV, [f5.TURMA])
        assert r["populacao"]["sem_decisao"] == 2
        assert (r["aderencia"]["decididas"], r["aderencia"]["seguiram"]) == (3, 1)
        # Sem a decisão de A no 10, o grupo "seguiu" fica só com B: 0 de 1.
        assert r["desfecho"]["seguiu"]["respostas"] == 1
        assert r["desfecho"]["seguiu"]["acerto_primeira_tentativa_pct"] == 0


@f5.e2e
def test_abaixo_do_minimo_volta_nulo() -> None:
    with _banco() as c:
        _semear(c)
        _n_minimo(c, 3)
        r = _rpc(c, DEV, [f5.TURMA])
        assert r["aderencia"]["amostra_insuficiente"] is False  # 3 alunos decidiram
        assert r["aderencia"]["seguiu_pct"] == 50
        for grupo in ("seguiu", "nao_seguiu"):  # 2 alunos em cada
            d = r["desfecho"][grupo]
            assert d["amostra_insuficiente"] is True
            assert d["acerto_primeira_tentativa_pct"] is None and d["ic95_pct"] is None
        assert r["diferenca_pp"] is None
        assert all(f["seguiu_pct"] is None for f in r["por_formato_recomendado"])


@f5.e2e
def test_so_dev_chama_e_a_entrada_e_validada() -> None:
    with _banco() as c:
        _semear(c)
        for quem in (f5.PROF, f5.A):  # o professor dono também não: é métrica de dev
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _rpc(c, quem, [f5.TURMA])
        for classes, janela in (([], OUTUBRO), ([f5.TURMA], ("2026-10-31", "2026-10-01")),
                                (list(range(1, 22)), OUTUBRO)):
            with pytest.raises(psycopg.errors.InvalidParameterValue):
                _rpc(c, DEV, classes, janela)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            e._anon(c, "SELECT public.metricas_aderencia_sugestao(ARRAY[1]::bigint[], NULL, NULL)")


@f5.e2e
def test_downgrade_limpa_e_sobe_de_novo() -> None:
    with _banco() as c:
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute("SELECT to_regproc('public.metricas_aderencia_sugestao')").fetchone()[0] is None
        assert c.execute(
            "SELECT count(*) FROM public.metricas_catalogo WHERE chave = 'dev.aderencia_sugestao'"
        ).fetchone()[0] == 0
        for sql in f5.sql_de(M):
            c.execute(sql)


def test_sql_sem_porcento_nem_parametro_acidental_e_cadeia() -> None:
    from sqlalchemy import text

    assert (M.revision, M.down_revision) == ("20261115_06", M_ANTES.revision)
    for sql in (M.RPC, M.CATALOGO, M.DOWNGRADE):
        assert "%" not in sql
        assert text(sql).compile().params == {}
    assert "public.app_e_dev()" in M.RPC
    assert "vw_alunos_pesquisa_elegiveis" in M.RPC
    assert "'{dev}'" in M.CATALOGO


def test_mapa_de_formatos_cobre_os_tipos_de_bloco_do_app() -> None:
    """Todo tipo de bloco do app que vira um formato do motor precisa estar no CASE da função."""
    from pathlib import Path

    from app.services.sugestao_material import FORMATOS_CANONICOS

    raiz = Path(__file__).resolve().parents[2]
    bag = (raiz / "mobile/src/services/bag/bagModel.ts").read_text(encoding="utf-8")
    mapa = M.RPC[M.RPC.index("SELECT CASE"):M.RPC.index("END AS formato")]
    for tipo in ("audio", "apresentacao", "apresentacao-slides", "embed", "markdown", "texto", "pdf"):
        assert f'case "{tipo}"' in bag, tipo
        assert f"'{tipo}'" in mapa, tipo
    # Todo formato que o motor pode recomendar sai do mapa, ou nunca daria "seguiu".
    for formato in FORMATOS_CANONICOS:
        assert f"'{formato}'" in mapa, formato
