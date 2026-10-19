"""Ponta a ponta da economia contra um Postgres de verdade, com a RLS agindo.

Roda só quando `TRAILUP_E2E_DATABASE_URL` aponta para um banco DESCARTÁVEL já
migrado até a head (o schema de produção recriado localmente e `alembic
upgrade head` por cima; ver `scripts/e2e_economia/README.md`). Sem a variável,
o módulo inteiro é pulado, então o CI normal não muda.

Cada papel entra como o PostgREST entraria: `SET ROLE authenticated` (ou
`anon`) e `request.jwt.claims` com o `sub`. Nada aqui usa o papel do banco para
ler o que o cliente leria. Os testes seguem a ordem do arquivo: o mundo é um só
(professor monta, aluno ganha, compra, usa, professor estorna, dev audita).

NUNCA aponte isto para produção: o fixture cria e apaga turmas e usuários.
"""

from __future__ import annotations

import json
import os
import random
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

DSN = os.environ.get("TRAILUP_E2E_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_DATABASE_URL não definido (e2e só em banco descartável)"
)

if DSN:  # import tardio: o CI sem banco nem precisa do driver
    import psycopg
    from psycopg import errors
    from psycopg.rows import dict_row

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e da economia recusa banco hospedado: use um banco local descartável")


# ---------------------------------------------------------------- utilidades


def _admin():
    return psycopg.connect(DSN, autocommit=True, row_factory=dict_row)


@contextmanager
def como(uid: uuid.UUID | None, papel: str = "authenticated"):
    """Conexão no papel do cliente, com o JWT que o PostgREST montaria."""
    c = psycopg.connect(DSN, autocommit=True, row_factory=dict_row)
    try:
        c.execute(f"SET ROLE {papel}")
        claims = {"role": papel}
        if uid is not None:
            claims["sub"] = str(uid)
        c.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps(claims),))
        # auth.uid() antigo lê o GUC legado; o novo lê o `sub` de claims. Os dois.
        c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(uid) if uid else "",))
        c.execute("SELECT set_config('request.jwt.claim.role', %s, false)", (papel,))
        yield c
    finally:
        c.close()


def rpc(c, fn: str, **kw):
    args = ", ".join(f"{k} => %({k})s" for k in kw)
    return c.execute(f"SELECT public.{fn}({args}) AS r", kw).fetchone()["r"]


def linhas(c, sql: str, params=None):
    return c.execute(sql, params or {}).fetchall()


def saldo(uid) -> Decimal:
    with _admin() as a:
        return a.execute(
            "SELECT COALESCE(SUM(delta), 0) s FROM public.moedas_ledger WHERE aluno_id = %s", (uid,)
        ).fetchone()["s"]


def conceder(uid, classe_id, valor):
    """Crédito manual pelo papel do banco (o que um ajuste de suporte faria)."""
    with _admin() as a:
        a.execute(
            "INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, classe_id, referencia)"
            " VALUES (%s, %s, 'concessao', %s, %s)",
            (uid, valor, classe_id, f"e2e:{uuid.uuid4()}"),
        )


def chave() -> str:
    return f"e2e-{uuid.uuid4()}"


# -------------------------------------------------------------------- mundo


EVENTOS = [
    ("atividade_concluida", 15, 3),
    ("atividade_acertada", 5, 1),
]


@pytest.fixture(scope="module")
def m():
    s = {k: uuid.uuid4() for k in ("profA", "profB", "aluno1", "aluno2", "aluno3", "dev")}
    base = random.randint(10_000_000, 90_000_000)
    s["classeA"], s["classeB"] = base, base + 1
    agora = datetime.now(timezone.utc).replace(microsecond=0)
    s["prazo1"] = agora + timedelta(days=2)
    with _admin() as a:
        for tipo, pontos, moedas in EVENTOS:
            a.execute(
                "INSERT INTO public.eventos_pontuacao (tipo, pontos, moedas) VALUES (%s,%s,%s)"
                " ON CONFLICT DO NOTHING",
                (tipo, pontos, moedas),
            )
        for k, uid in s.items():
            if not isinstance(uid, uuid.UUID):
                continue
            a.execute(
                "INSERT INTO auth.users (id, email, aud, role) VALUES (%s, %s, 'authenticated', 'authenticated')",
                (uid, f"{k}-{uid.hex[:8]}@e2e.local"),
            )
        for k in ("profA", "profB"):
            a.execute(
                "INSERT INTO public.professor (id, nome, liberado) VALUES (%s, %s, true)", (s[k], k)
            )
        for k in ("aluno1", "aluno2", "aluno3"):
            a.execute(
                "INSERT INTO public.alunos (id, nome, email) VALUES (%s, %s, %s)",
                (s[k], k, f"{k}-{s[k].hex[:8]}@e2e.local"),
            )
        a.execute(
            "INSERT INTO public.classe (id, professor_id, descricao) VALUES (%s,%s,'e2e A'), (%s,%s,'e2e B')",
            (s["classeA"], s["profA"], s["classeB"], s["profB"]),
        )
        for k, cl in (("aluno1", "classeA"), ("aluno2", "classeA"), ("aluno3", "classeB")):
            a.execute(
                "INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (%s,%s)", (s[cl], s[k])
            )
        s["topA"] = a.execute(
            "INSERT INTO public.topicos (classe_id, nome) VALUES (%s,'Tópico e2e') RETURNING id",
            (s["classeA"],),
        ).fetchone()["id"]
        s["topB"] = a.execute(
            "INSERT INTO public.topicos (classe_id, nome) VALUES (%s,'Tópico e2e B') RETURNING id",
            (s["classeB"],),
        ).fetchone()["id"]
        for nome, prazo in (("at1", s["prazo1"]), ("at2", None), ("at3", agora + timedelta(days=5))):
            s[nome] = a.execute(
                "INSERT INTO public.atividades (topico_id, titulo, pontuacao_maxima, data_entrega)"
                " VALUES (%s,%s,10,%s) RETURNING id",
                (s["topA"], nome, prazo),
            ).fetchone()["id"]
        s["atB"] = a.execute(
            "INSERT INTO public.atividades (topico_id, titulo, pontuacao_maxima) VALUES (%s,'atB',10) RETURNING id",
            (s["topB"],),
        ).fetchone()["id"]
        s["q1"] = a.execute(
            "INSERT INTO public.questoes (atividade_id, enunciado, tipo, alternativas, resposta_correta)"
            " VALUES (%s,'Quanto é 2+2?','multipla_escolha','[\"3\",\"4\",\"5\"]','4') RETURNING id",
            (s["at1"],),
        ).fetchone()["id"]
        for at in ("at1", "at2", "at3"):
            a.execute(
                "INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status) VALUES (%s,%s,'em andamento')"
                " ON CONFLICT (aluno_id, atividade_id) DO UPDATE SET status = 'em andamento'",
                (s["aluno1"], s[at]),
            )
        a.execute(
            "INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status) VALUES (%s,%s,'em andamento')"
            " ON CONFLICT (aluno_id, atividade_id) DO UPDATE SET status = 'em andamento'",
            (s["aluno2"], s["at1"]),
        )
        a.execute(
            "INSERT INTO public.plataforma_dev (user_id, email) VALUES (%s,'dev@e2e.local')", (s["dev"],)
        )
    yield s
    with _admin() as a:
        a.execute(
            "DELETE FROM public.economia_auditoria WHERE classe_id IN (%s,%s) OR ator_id = ANY(%s)",
            (s["classeA"], s["classeB"], [v for v in s.values() if isinstance(v, uuid.UUID)]),
        )
        a.execute("DELETE FROM public.plataforma_dev WHERE user_id = %s", (s["dev"],))
        a.execute("DELETE FROM public.classe WHERE id IN (%s,%s)", (s["classeA"], s["classeB"]))
        for k in ("aluno1", "aluno2", "aluno3"):
            a.execute("DELETE FROM public.alunos WHERE id = %s", (s[k],))
        for k in ("profA", "profB"):
            a.execute("DELETE FROM public.professor WHERE id = %s", (s[k],))
        a.execute(
            "DELETE FROM auth.users WHERE id = ANY(%s)",
            ([v for v in s.values() if isinstance(v, uuid.UUID)],),
        )


# --------------------------------------------------- 1. professor configura


def test_professor_configura_a_economia_e_tudo_fica_auditado(m):
    with como(m["profA"]) as p:
        r = rpc(p, "economia_salvar_config_classe", p_classe_id=m["classeA"],
                p_prazo_max_dias_total=3, p_prazo_max_por_ativ=2, p_retry_max_por_topico=1,
                p_prazo_extensao_min_dias=1, p_prazo_extensao_max_dias=2,
                p_tempo_extra_min_minutos=5, p_tempo_extra_max_minutos=15, p_tempo_max_por_ativ=20)
        assert r == {"ok": True}
        # máximo de extensão maior que o teto da atividade: recusa
        r = rpc(p, "economia_salvar_config_classe", p_classe_id=m["classeA"],
                p_prazo_max_dias_total=3, p_prazo_max_por_ativ=2, p_retry_max_por_topico=1,
                p_prazo_extensao_min_dias=1, p_prazo_extensao_max_dias=3,
                p_tempo_extra_min_minutos=5, p_tempo_extra_max_minutos=15, p_tempo_max_por_ativ=20)
        assert r["erro"] == "faixa_invalida"
        assert rpc(p, "economia_salvar_escopo", p_classe_id=m["classeA"], p_escopo="atividade",
                   p_alvo_id=m["at1"], p_moedas_conclusao=4, p_moedas_aprovacao=6, p_pontos=None,
                   p_prazo_extensao_min_dias=None, p_prazo_extensao_max_dias=None, p_prazo_max_por_ativ=None,
                   p_tempo_extra_min_minutos=None, p_tempo_extra_max_minutos=None, p_tempo_max_por_ativ=None,
                   p_uso_max_prazo=None, p_uso_max_tempo=None, p_uso_max_retry=None) == {"ok": True}
        # tempo extra da at3 tem máximo de 6 por uso (corta o pedido de 10)
        assert rpc(p, "economia_salvar_escopo", p_classe_id=m["classeA"], p_escopo="atividade",
                   p_alvo_id=m["at3"], p_moedas_conclusao=None, p_moedas_aprovacao=None, p_pontos=None,
                   p_prazo_extensao_min_dias=None, p_prazo_extensao_max_dias=None, p_prazo_max_por_ativ=None,
                   p_tempo_extra_min_minutos=None, p_tempo_extra_max_minutos=6, p_tempo_max_por_ativ=None,
                   p_uso_max_prazo=None, p_uso_max_tempo=None, p_uso_max_retry=None) == {"ok": True}
        # alvo de outra turma
        assert rpc(p, "economia_salvar_escopo", p_classe_id=m["classeA"], p_escopo="atividade",
                   p_alvo_id=m["atB"], p_moedas_conclusao=1, p_moedas_aprovacao=None, p_pontos=None,
                   p_prazo_extensao_min_dias=None, p_prazo_extensao_max_dias=None, p_prazo_max_por_ativ=None,
                   p_tempo_extra_min_minutos=None, p_tempo_extra_max_minutos=None, p_tempo_max_por_ativ=None,
                   p_uso_max_prazo=None, p_uso_max_tempo=None, p_uso_max_retry=None)["erro"] == "alvo_de_outra_turma"
        assert rpc(p, "economia_salvar_preco_classe", p_classe_id=m["classeA"], p_item="prazo_extra",
                   p_preco_base=10, p_estoque=3, p_uso_max_por_aluno=2, p_ativo=True) == {"ok": True}
        assert rpc(p, "economia_salvar_valores_evento", p_classe_id=m["classeA"],
                   p_tipo="atividade_concluida", p_pontos=15, p_moedas=5) == {"ok": True}
        meta = rpc(p, "economia_salvar_meta", p_id=None, p_classe_id=m["classeA"], p_escopo="classe",
                   p_alvo_id=None, p_titulo="Primeira entrega", p_criterio="atividades_concluidas",
                   p_limiar=1, p_moedas=7, p_pontos=3)
        assert meta["ok"] is True
        m["meta"] = meta["id"]
        m["meta_lixo"] = rpc(p, "economia_salvar_meta", p_id=None, p_classe_id=m["classeA"],
                             p_escopo="classe", p_alvo_id=None, p_titulo="Arquivar", p_criterio="presencas",
                             p_limiar=99, p_moedas=1, p_pontos=0)["id"]
        # segunda gravação do preço: a auditoria guarda o antes
        assert rpc(p, "economia_salvar_preco_classe", p_classe_id=m["classeA"], p_item="prazo_extra",
                   p_preco_base=10, p_estoque=4, p_uso_max_por_aluno=2, p_ativo=True) == {"ok": True}
        # professor lê a própria config, mas não a auditoria
        assert len(linhas(p, "SELECT * FROM public.loja_preco_classe WHERE classe_id = %(c)s", {"c": m["classeA"]})) == 1
        with pytest.raises(errors.InsufficientPrivilege):
            linhas(p, "SELECT * FROM public.economia_auditoria")

    with como(m["profB"]) as outro:
        assert rpc(outro, "economia_salvar_preco_classe", p_classe_id=m["classeA"], p_item="prazo_extra",
                   p_preco_base=1, p_estoque=None, p_uso_max_por_aluno=None, p_ativo=True)["erro"] == "sem_permissao"
        assert linhas(outro, "SELECT * FROM public.loja_preco_classe WHERE classe_id = %(c)s", {"c": m["classeA"]}) == []
        # turma B: dica barata para o teste de concorrência
        assert rpc(outro, "economia_salvar_preco_classe", p_classe_id=m["classeB"], p_item="dica",
                   p_preco_base=5, p_estoque=None, p_uso_max_por_aluno=None, p_ativo=True) == {"ok": True}

    with _admin() as a:
        aud = linhas(a, "SELECT operacao, antes, depois, ator_id FROM public.economia_auditoria"
                        " WHERE classe_id = %(c)s ORDER BY id", {"c": m["classeA"]})
    ops = [x["operacao"] for x in aud]
    for op in ("config_classe", "config_escopo", "config_preco", "config_valores", "config_meta"):
        assert op in ops, op
    precos = [x for x in aud if x["operacao"] == "config_preco"]
    assert precos[0]["antes"] is None and precos[-1]["antes"]["estoque"] == 3
    assert precos[-1]["depois"]["estoque"] == 4
    assert all(x["ator_id"] == m["profA"] for x in aud)


def test_professor_nao_grava_config_direto_na_tabela(m):
    """Toda mudança de config passa pela RPC auditada; escrita direta é recusada."""
    with como(m["profA"]) as p:
        with pytest.raises(errors.InsufficientPrivilege):
            p.execute("UPDATE public.loja_config_classe SET prazo_max_dias_total = 14,"
                      " prazo_max_por_ativ = 14 WHERE classe_id = %s", (m["classeA"],))
        with pytest.raises(errors.InsufficientPrivilege):
            p.execute("INSERT INTO public.loja_dotacao (classe_id, item_codigo, quantidade)"
                      " VALUES (%s, 'prazo_extra', 50)", (m["classeA"],))
        assert linhas(p, "SELECT prazo_max_dias_total FROM public.loja_config_classe WHERE classe_id = %(c)s",
                      {"c": m["classeA"]})[0]["prazo_max_dias_total"] == 3


def test_arquivar_meta_sem_sessao_e_recusado(m):
    with como(None, "anon") as anon:
        assert rpc(anon, "economia_arquivar_meta", p_id=m["meta_lixo"])["erro"] == "sem_permissao"
    with como(None) as sem_sub:
        assert rpc(sem_sub, "economia_arquivar_meta", p_id=m["meta_lixo"])["erro"] == "sem_permissao"
    with como(m["profB"]) as outro:
        assert rpc(outro, "economia_arquivar_meta", p_id=m["meta_lixo"])["erro"] == "sem_permissao"
    with _admin() as a:
        assert a.execute("SELECT ativa FROM public.economia_meta WHERE id = %s", (m["meta_lixo"],)).fetchone()["ativa"]
    with como(m["profA"]) as p:
        assert rpc(p, "economia_arquivar_meta", p_id=m["meta_lixo"]) == {"ok": True}


def _recusado(c, fn, erro, **kw):
    """Sem GRANT (42501) ou a própria função recusando: os dois servem."""
    try:
        r = rpc(c, fn, **kw)
    except errors.InsufficientPrivilege:
        return True
    return r in (0, None) or (isinstance(r, dict) and r.get("ok") is False and r.get("erro") == erro)


def test_anon_nao_mexe_em_nada_da_economia(m):
    with como(None, "anon") as anon:
        assert _recusado(anon, "loja_comprar", "sem_sessao", p_item="dica", p_classe_id=m["classeA"],
                         p_idempotency_key=chave())
        assert _recusado(anon, "loja_usar", "sem_sessao", p_compra_id=1, p_alvo_tipo="atividade",
                         p_alvo_id=m["at1"], p_idempotency_key=chave())
        assert _recusado(anon, "loja_estornar", "sem_sessao", p_compra_id=1)
        assert _recusado(anon, "economia_salvar_config_classe", "sem_permissao", p_classe_id=m["classeA"],
                         p_prazo_max_dias_total=14, p_prazo_max_por_ativ=14, p_retry_max_por_topico=5,
                         p_prazo_extensao_min_dias=1, p_prazo_extensao_max_dias=14,
                         p_tempo_extra_min_minutos=5, p_tempo_extra_max_minutos=15, p_tempo_max_por_ativ=20)
        assert _recusado(anon, "economia_salvar_dotacao", "sem_permissao", p_classe_id=m["classeA"],
                         p_item="prazo_extra", p_quantidade=99)
        assert _recusado(anon, "economia_avaliar_metas", "", p_classe_id=m["classeA"])
        with pytest.raises(errors.InsufficientPrivilege):
            linhas(anon, "SELECT * FROM public.economia_extrato(%(a)s)", {"a": m["aluno1"]})
        try:
            assert linhas(anon, "SELECT * FROM public.moedas_ledger") == []
        except errors.InsufficientPrivilege:
            pass
        assert linhas(anon, "SELECT * FROM public.economia_config_efetiva(%(c)s, %(a)s)",
                      {"c": m["classeA"], "a": m["at1"]}) == []


# ----------------------------------------------------------- 2. aluno ganha


def _razao_eventos(uid):
    with _admin() as a:
        led = linhas(a, "SELECT evento_tipo, referencia, delta FROM public.moedas_ledger"
                        " WHERE aluno_id = %(a)s AND motivo = 'evento' ORDER BY id", {"a": uid})
    return led, {(x["evento_tipo"], x["referencia"]): x["delta"] for x in led}


def test_concluir_sozinho_nao_paga_moeda(m):
    """Marcar 'concluido' e inserir o evento de conclusão são do próprio aluno: 0 moeda."""
    a1 = m["aluno1"]
    with como(a1) as al:
        for status in ("concluido", "em andamento", "concluido"):
            al.execute("UPDATE public.atividade_aluno SET status = %s WHERE aluno_id = %s AND atividade_id = %s",
                       (status, a1, m["at1"]))
        # o evento de conclusão continua valendo ponto, mas não paga moeda
        al.execute("INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor) VALUES"
                   " (%s, 'atividade_concluida', %s, 1)", (a1, f"atividade:{m['at2']}"))
        assert rpc(al, "economia_avaliar_metas", p_classe_id=m["classeA"]) == 0  # meta conta só aprovada
    led, _ = _razao_eventos(a1)
    assert led == [], led
    assert saldo(a1) == 0
    with _admin() as a:
        assert a.execute("SELECT count(*) n FROM public.eventos_aluno WHERE aluno_id = %s"
                         " AND tipo = 'atividade_concluida'", (a1,)).fetchone()["n"] == 1


def test_aprovacao_do_professor_paga_conclusao_uma_vez(m):
    a1 = m["aluno1"]
    with como(m["profB"]) as outro:
        with pytest.raises(errors.InsufficientPrivilege):
            rpc(outro, "avaliar_entrega", p_atividade_id=m["at1"], p_aluno_id=a1, p_nota=10)
    with como(m["profA"]) as p:
        assert rpc(p, "avaliar_entrega", p_atividade_id=m["at1"], p_aluno_id=a1, p_nota=8) == 8
        assert rpc(p, "avaliar_entrega", p_atividade_id=m["at1"], p_aluno_id=a1, p_nota=9) == 9  # reavaliação
    led, got = _razao_eventos(a1)
    assert got[("atividade_conclusao_config", f"atividade:{m['at1']}")] == 4  # valor da atividade
    assert got[("atividade_aprovada", f"atividade:{m['at1']}")] == 6
    assert got[("meta_atingida", f"meta:{m['meta']}")] == 7  # 1 aprovada bate a meta
    assert len(led) == 3, led
    assert saldo(a1) == 17


def test_reprovado_nao_conclui_e_reavaliacao_aprova(m):
    """Nota abaixo de 60% não paga conclusão nem conta na meta; a reavaliação sim.

    As duas avaliações vão na MESMA transação: prova que a trava de reentrada
    das metas é solta no fim (antes, a segunda avaliação não avaliava meta).
    """
    a1 = m["aluno1"]
    with como(m["profA"]) as p:
        meta = rpc(p, "economia_salvar_meta", p_id=None, p_classe_id=m["classeA"], p_escopo="atividade",
                   p_alvo_id=m["at2"], p_titulo="Nota 7 na at2", p_criterio="nota_minima",
                   p_limiar=70, p_moedas=3, p_pontos=0)
        m["meta_at2"] = meta["id"]
        p.autocommit = False
        assert rpc(p, "avaliar_entrega", p_atividade_id=m["at2"], p_aluno_id=a1, p_nota=5) == 5
        assert rpc(p, "avaliar_entrega", p_atividade_id=m["at2"], p_aluno_id=a1, p_nota=7) == 7
        p.commit()
    led, got = _razao_eventos(a1)
    # sem moedas_conclusao no escopo: vale o evento da turma (5)
    assert got[("atividade_conclusao_config", f"atividade:{m['at2']}")] == 5
    assert got[("meta_atingida", f"meta:{meta['id']}")] == 3
    assert ("atividade_aprovada", f"atividade:{m['at2']}") not in got  # at2 não paga aprovação
    assert len(led) == 5, led
    with _admin() as a:
        ap = a.execute("SELECT nota, nota_maxima, aprovada FROM public.atividade_aprovacao"
                       " WHERE aluno_id = %s AND atividade_id = %s", (a1, m["at2"])).fetchone()
    assert (ap["nota"], ap["nota_maxima"], ap["aprovada"]) == (7, 10, True)
    with como(m["profA"]) as p:
        # reprovar depois não estorna, e aprovar de novo não paga de novo
        rpc(p, "avaliar_entrega", p_atividade_id=m["at2"], p_aluno_id=a1, p_nota=2)
        rpc(p, "avaliar_entrega", p_atividade_id=m["at2"], p_aluno_id=a1, p_nota=10)
        rpc(p, "economia_arquivar_meta", p_id=meta["id"])
    assert len(_razao_eventos(a1)[0]) == 5
    with como(a1) as al:
        assert rpc(al, "economia_avaliar_metas", p_classe_id=m["classeA"]) == 0  # já creditadas
        assert rpc(al, "loja_saldo") == 25
    assert saldo(a1) == 25


def test_meta_de_conclusao_conta_so_aprovadas(m):
    """aluno2 conclui sozinho 2 atividades; só a aprovada entra na meta de 2."""
    a2 = m["aluno2"]
    with como(m["profA"]) as p:
        meta = rpc(p, "economia_salvar_meta", p_id=None, p_classe_id=m["classeA"], p_escopo="classe",
                   p_alvo_id=None, p_titulo="Duas aprovadas", p_criterio="atividades_concluidas",
                   p_limiar=2, p_moedas=9, p_pontos=0)
    with como(a2) as al2:
        for at in (m["at1"], m["at2"]):
            al2.execute("INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status) VALUES (%s,%s,'concluido')"
                        " ON CONFLICT (aluno_id, atividade_id) DO UPDATE SET status = 'concluido'", (a2, at))
    with como(m["profA"]) as p:
        rpc(p, "avaliar_entrega", p_atividade_id=m["at1"], p_aluno_id=a2, p_nota=10)
        rpc(p, "avaliar_entrega", p_atividade_id=m["at2"], p_aluno_id=a2, p_nota=3)  # reprovada
    _, got = _razao_eventos(a2)
    assert ("meta_atingida", f"meta:{meta['id']}") not in got, "meta contou atividade não aprovada"
    assert ("atividade_conclusao_config", f"atividade:{m['at2']}") not in got
    with como(m["profA"]) as p:
        rpc(p, "avaliar_entrega", p_atividade_id=m["at2"], p_aluno_id=a2, p_nota=6)  # 60%: aprova
        rpc(p, "economia_arquivar_meta", p_id=meta["id"])
    _, got = _razao_eventos(a2)
    assert got[("meta_atingida", f"meta:{meta['id']}")] == 9
    assert got[("atividade_conclusao_config", f"atividade:{m['at2']}")] == 5


def test_aprovacao_so_o_professor_escreve(m):
    a1, a2 = m["aluno1"], m["aluno2"]
    with como(a1) as al:
        assert {x["aluno_id"] for x in linhas(al, "SELECT aluno_id FROM public.atividade_aprovacao")} == {a1}
        for sql in (
            "INSERT INTO public.atividade_aprovacao (aluno_id, atividade_id, classe_id, nota, nota_maxima, aprovada)"
            " VALUES (%(a)s, %(t)s, %(c)s, 10, 10, true)",
            "UPDATE public.atividade_aprovacao SET aprovada = true, nota = 10 WHERE aluno_id = %(a)s",
            "DELETE FROM public.atividade_aprovacao WHERE aluno_id = %(a)s",
        ):
            with pytest.raises(errors.InsufficientPrivilege):
                al.execute(sql, {"a": a1, "t": m["at3"], "c": m["classeA"]})
    with como(m["profA"]) as p:
        assert {x["aluno_id"] for x in linhas(p, "SELECT aluno_id FROM public.atividade_aprovacao")} == {a1, a2}
        with pytest.raises(errors.InsufficientPrivilege):
            p.execute("UPDATE public.atividade_aprovacao SET aprovada = true")
    with como(m["profB"]) as outro:
        assert linhas(outro, "SELECT * FROM public.atividade_aprovacao") == []
    with como(None, "anon") as anon:
        with pytest.raises(errors.InsufficientPrivilege):
            anon.execute("SELECT * FROM public.atividade_aprovacao")


def test_aluno_de_outra_turma_nao_ganha_com_atividade_alheia(m):
    a3 = m["aluno3"]  # turma B; at1 é da turma A
    antes = saldo(a3)
    with como(a3) as al3:
        try:
            al3.execute("INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status) VALUES (%s,%s,'concluido')"
                        " ON CONFLICT (aluno_id, atividade_id) DO UPDATE SET status = 'concluido'", (a3, m["at1"]))
        except errors.Error:
            pass
        try:
            al3.execute("INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor) VALUES"
                        " (%s, 'atividade_concluida', %s, 1)", (a3, f"atividade:{m['at2']}"))
        except errors.Error:
            pass
    assert saldo(a3) == antes, "aluno da turma B ganhou moedas da turma A"


def test_aluno_nao_forja_nota_para_bater_meta(m):
    """Meta de nota mínima só vale nota do professor, não nota escrita pelo aluno."""
    with como(m["profA"]) as p:
        meta = rpc(p, "economia_salvar_meta", p_id=None, p_classe_id=m["classeA"], p_escopo="atividade",
                   p_alvo_id=m["at3"], p_titulo="Nota 9 na at3", p_criterio="nota_minima",
                   p_limiar=90, p_moedas=50, p_pontos=0)
    antes = saldo(m["aluno1"])
    with como(m["aluno1"]) as al:
        try:
            al.execute("UPDATE public.atividade_aluno SET pontuacao_obtida = 10, pontuacao_maxima = 10"
                       " WHERE aluno_id = %s AND atividade_id = %s", (m["aluno1"], m["at3"]))
        except errors.Error:
            pass  # recusar a escrita também resolve
        rpc(al, "economia_avaliar_metas", p_classe_id=m["classeA"])
    assert saldo(m["aluno1"]) == antes, "aluno se pagou 50 moedas escrevendo a própria nota"
    with como(m["profA"]) as p:
        rpc(p, "avaliar_entrega", p_atividade_id=m["at3"], p_aluno_id=m["aluno1"], p_nota=10)
        rpc(p, "economia_arquivar_meta", p_id=meta["id"])
    m["bonus_nota"] = saldo(m["aluno1"]) - antes
    _, got = _razao_eventos(m["aluno1"])
    assert got[("meta_atingida", f"meta:{meta['id']}")] == 50
    assert got[("atividade_conclusao_config", f"atividade:{m['at3']}")] == 5  # aprovada: conclusão da turma
    assert m["bonus_nota"] == 55


# ---------------------------------------------------------- 3. aluno compra


def test_compra_respeita_saldo_limite_estoque_e_idempotencia(m):
    a1, a2 = m["aluno1"], m["aluno2"]
    base = saldo(a1)
    with como(a1) as al:
        k = chave()
        r1 = rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeA"], p_idempotency_key=k)
        assert r1["ok"] and r1["preco"] == 10 and r1["origem"] == "compra"
        rep = rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeA"], p_idempotency_key=k)
        assert rep["repetido"] is True and rep["compra_id"] == r1["compra_id"]
        assert saldo(a1) == base - 10
        m["prazo_c1"] = r1["compra_id"]
        assert rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeB"],
                   p_idempotency_key=chave())["erro"] == "fora_da_turma"
        assert rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeA"],
                   p_idempotency_key="  ")["erro"] == "chave_ausente"
    # zera o saldo menos 1 para provar que não fica negativo
    with _admin() as a:
        a.execute("INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, classe_id, referencia)"
                  " VALUES (%s, %s, 'concessao', %s, 'e2e:ajuste')", (a1, -(saldo(a1) - 19), m["classeA"]))
    assert saldo(a1) == 19
    with como(a1) as al:
        r = rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeA"], p_idempotency_key=chave())
        assert r["erro"] == "saldo_insuficiente" and r["preco"] == 20  # fator 2: segunda custa 20
    assert saldo(a1) == 19
    conceder(a1, m["classeA"], 200)
    with como(a1) as al:
        r2 = rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeA"], p_idempotency_key=chave())
        assert r2["ok"] and r2["preco"] == 20
        m["prazo_c2"] = r2["compra_id"]
        assert rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeA"],
                   p_idempotency_key=chave())["erro"] == "limite_de_compras"
    conceder(a2, m["classeA"], 200)
    with como(a2) as al2:
        assert rpc(al2, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeA"], p_idempotency_key=chave())["ok"]
        assert rpc(al2, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeA"], p_idempotency_key=chave())["ok"]
        # estoque 4: aluno1 2 + aluno2 2 = esgotado; aluno2 já bateu o limite também
        cat = {x["codigo"]: x for x in linhas(al2, "SELECT * FROM public.loja_catalogo(%(c)s)", {"c": m["classeA"]})}
        assert cat["prazo_extra"]["estoque_restante"] == 0 and cat["prazo_extra"]["disponivel"] is False
    with como(m["profA"]) as p:
        assert rpc(p, "economia_salvar_preco_classe", p_classe_id=m["classeA"], p_item="prazo_extra",
                   p_preco_base=10, p_estoque=4, p_uso_max_por_aluno=None, p_ativo=True) == {"ok": True}
    with como(a2) as al2:
        assert rpc(al2, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeA"],
                   p_idempotency_key=chave())["erro"] == "estoque_esgotado"


def test_duas_compras_simultaneas_nao_estouram_o_saldo(m):
    a3 = m["aluno3"]
    falta = 7 - saldo(a3)  # deixa exatamente 7: dá para UMA dica de 5
    if falta:
        conceder(a3, m["classeB"], falta)
    resultados = []
    barreira = threading.Barrier(2)

    def comprar():
        with como(a3) as c:
            c.autocommit = False
            barreira.wait()
            r = rpc(c, "loja_comprar", p_item="dica", p_classe_id=m["classeB"], p_idempotency_key=chave())
            c.commit()
            resultados.append(r)

    ts = [threading.Thread(target=comprar) for _ in range(2)]
    for t in ts:
        t.start()
    for t in ts:
        t.join(30)
    oks = [r for r in resultados if r.get("ok")]
    assert len(resultados) == 2 and len(oks) == 1, resultados
    assert [r["erro"] for r in resultados if not r.get("ok")] == ["saldo_insuficiente"]
    assert saldo(a3) == 2


def test_cliente_nao_escreve_no_razao_nem_na_auditoria(m):
    with como(m["aluno1"]) as al:
        for sql in (
            "INSERT INTO public.moedas_ledger (aluno_id, delta, motivo) VALUES (%(a)s, 1000, 'concessao')",
            "UPDATE public.moedas_ledger SET delta = 1000 WHERE aluno_id = %(a)s",
            "DELETE FROM public.moedas_ledger WHERE aluno_id = %(a)s AND delta < 0",
            "INSERT INTO public.economia_auditoria (operacao, entidade) VALUES ('x', 'y')",
            "UPDATE public.loja_compras SET status = 'ativa' WHERE aluno_id = %(a)s",
            "INSERT INTO public.plataforma_dev (user_id) VALUES (%(a)s)",
        ):
            try:
                al.execute(sql, {"a": m["aluno1"]})
                afetadas = al.rowcount
            except errors.Error:
                afetadas = 0
            assert afetadas == 0, sql
        with pytest.raises(errors.InsufficientPrivilege):
            al.execute("SELECT public.economia_auditar('x','y','1',NULL,NULL,NULL,NULL)")
        with pytest.raises(errors.InsufficientPrivilege):
            al.execute("SELECT * FROM public.economia_consistencia()")


# ------------------------------------------------------------ 4. aluno usa


def test_mais_prazo_respeita_minmax_e_os_tetos(m):
    a1 = m["aluno1"]
    with como(a1) as al:
        k = chave()
        r = rpc(al, "loja_usar", p_compra_id=m["prazo_c1"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=k)
        assert r["ok"] and r["dias"] == 1
        rep = rpc(al, "loja_usar", p_compra_id=m["prazo_c1"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=k)
        assert rep["repetido"] is True and rep["dias"] == 1
        assert rpc(al, "loja_usar", p_compra_id=m["prazo_c1"], p_alvo_tipo="atividade", p_alvo_id=m["at1"],
                   p_idempotency_key=chave())["erro"] == "ja_consumida"
        # padrão: 1 mais prazo por atividade
        r = rpc(al, "loja_usar", p_compra_id=m["prazo_c2"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=chave())
        assert r["erro"] == "limite_por_atividade" and r["limite"] == 1 and r["usados"] == 1
    with como(m["profA"]) as p:  # a turma libera: o que segura agora são os tetos de dias
        assert rpc(p, "economia_salvar_limite_uso", p_classe_id=m["classeA"], p_escopo="classe", p_alvo_id=None,
                   p_item="prazo_extra", p_por_atividade=-1, p_por_questao=None, p_por_topico=None,
                   p_por_dia=None, p_por_semana=None, p_por_turma=None) == {"ok": True}
    with como(a1) as al:
        r = rpc(al, "loja_usar", p_compra_id=m["prazo_c2"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=chave())
        assert r["ok"] and r["dias"] == 1
        pz = linhas(al, "SELECT dias_extras, prazo_efetivo FROM public.atividade_prazo_aluno WHERE atividade_id = %(a)s",
                    {"a": m["at1"]})[0]
        assert pz["dias_extras"] == 2 and pz["prazo_efetivo"] == m["prazo1"] + timedelta(days=2)
    with como(m["aluno2"]) as al2:  # posse de outro aluno
        assert rpc(al2, "loja_usar", p_compra_id=m["prazo_c2"], p_alvo_tipo="atividade", p_alvo_id=m["at1"],
                   p_idempotency_key=chave())["erro"] == "compra_nao_encontrada"
        assert linhas(al2, "SELECT * FROM public.atividade_prazo_aluno WHERE aluno_id = %(a)s", {"a": a1}) == []
    # dotação: 3 grátis para seguir testando os tetos
    with como(m["profA"]) as p:
        assert rpc(p, "economia_salvar_dotacao", p_classe_id=m["classeA"], p_item="prazo_extra", p_quantidade=3) == {"ok": True}
    with como(a1) as al:
        gratis = [rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=m["classeA"], p_idempotency_key=chave())
                  for _ in range(3)]
        assert all(g["ok"] and g["origem"] == "dotacao" and g["preco"] == 0 for g in gratis)
        r = rpc(al, "loja_usar", p_compra_id=gratis[0]["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=chave())
        assert r["erro"] == "teto_da_atividade" and r["teto"] == 2
        r = rpc(al, "loja_usar", p_compra_id=gratis[0]["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at2"], p_idempotency_key=chave())
        assert r["ok"] and r["prazo_efetivo"] is None  # at2 sem data: guarda os dias
        r = rpc(al, "loja_usar", p_compra_id=gratis[1]["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at3"], p_idempotency_key=chave())
        assert r["erro"] == "teto_da_turma" and r["teto"] == 3 and r["usado"] == 3
        m["prazo_ativo"] = gratis[1]["compra_id"]
        m["prazo_ativo2"] = gratis[2]["compra_id"]
        assert rpc(al, "loja_usar", p_compra_id=gratis[1]["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["atB"],
                   p_idempotency_key=chave())["erro"] == "alvo_de_outra_turma"


def test_prazo_comprado_vale_no_calculo_de_atraso(m):
    """Quem comprou mais prazo não leva multa de atraso dentro do prazo novo."""
    with _admin() as a:
        efetivo = a.execute("SELECT public.fn_prazo_efetivo(%s, %s) p", (m["aluno1"], m["at1"])).fetchone()["p"]
        assert efetivo == m["prazo1"] + timedelta(days=2)
        fator = a.execute("SELECT public.fn_fator_de_atraso(%s, %s, %s) f",
                          (m["aluno1"], f"atividade:{m['at1']}", m["prazo1"] + timedelta(days=1))).fetchone()["f"]
        assert fator == 1
        # quem não comprou continua com o prazo da atividade
        assert a.execute("SELECT public.fn_prazo_efetivo(%s, %s) p", (m["aluno2"], m["at1"])).fetchone()["p"] == m["prazo1"]
        # atividade sem data: os dias comprados esperam a data aparecer
        a.execute("UPDATE public.atividades SET data_entrega = %s WHERE id = %s", (m["prazo1"], m["at2"]))
        assert a.execute("SELECT public.fn_prazo_efetivo(%s, %s) p", (m["aluno1"], m["at2"])).fetchone()["p"] == m["prazo1"] + timedelta(days=1)


def test_mais_tempo_registra_minutos_corta_no_maximo_e_respeita_o_teto(m):
    a1 = m["aluno1"]
    with como(a1) as al:
        cs = [rpc(al, "loja_comprar", p_item="tempo_extra", p_classe_id=m["classeA"], p_idempotency_key=chave()) for _ in range(4)]
        assert [c["preco"] for c in cs] == [8, 16, 32, 64]
        r = rpc(al, "loja_usar", p_compra_id=cs[0]["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=chave())
        assert r["ok"] and r["minutos"] == 10 and r["minutos_na_atividade"] == 10
        r = rpc(al, "loja_usar", p_compra_id=cs[1]["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=chave())
        assert r["minutos_na_atividade"] == 20
        r = rpc(al, "loja_usar", p_compra_id=cs[2]["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=chave())
        assert r["erro"] == "teto_da_atividade" and r["teto"] == 20
        r = rpc(al, "loja_usar", p_compra_id=cs[2]["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at3"], p_idempotency_key=chave())
        assert r["ok"] and r["minutos"] == 6 and r["minutos_cortados"] == 4
        assert linhas(al, "SELECT minutos_extras FROM public.atividade_tempo_aluno WHERE atividade_id = %(a)s",
                      {"a": m["at1"]})[0]["minutos_extras"] == 20
        log = linhas(al, "SELECT efeito, resultado FROM public.loja_uso_log WHERE efeito = 'tempo_extra' ORDER BY id")
        assert len(log) == 3 and log[-1]["resultado"]["minutos_cortados"] == 4
        m["tempo_ativo"] = cs[3]["compra_id"]


def test_segunda_chance_so_quando_elegivel(m):
    a1 = m["aluno1"]
    with como(a1) as al:
        c = rpc(al, "loja_comprar", p_item="segunda_chance", p_classe_id=m["classeA"], p_idempotency_key=chave())
        assert c["ok"]
    with _admin() as a:
        a.execute("INSERT INTO public.atividade_tentativa (aluno_id, atividade_id, ordem, percentual, criado_em)"
                  " VALUES (%s, %s, 1, 40, now() - interval '1 hour')", (a1, m["at1"]))
    with como(a1) as al:
        r = rpc(al, "loja_usar", p_compra_id=c["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=chave())
        assert r["erro"] == "cooldown_24h"
    with _admin() as a:
        a.execute("UPDATE public.atividade_tentativa SET criado_em = now() - interval '2 days' WHERE aluno_id = %s", (a1,))
    with como(a1) as al:
        r = rpc(al, "loja_usar", p_compra_id=c["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=chave())
        assert r["erro"] == "revise_o_material"
    # revisou o material depois da tentativa (>= 120 s ativos)
    with _admin() as a:
        cl, top = m["classeA"], m["topA"]
        sessao, lote = uuid.uuid4(), uuid.uuid4()
        a.execute("INSERT INTO public.telemetria_sessoes (id, aluno_id, classe_id, started_at) VALUES (%s,%s,%s,now())",
                  (sessao, a1, cl))
        a.execute("INSERT INTO public.telemetria_lotes (id, sessao_id, aluno_id, classe_id, screen_name, route_name,"
                  " flush_reason, captured_at, study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count,"
                  " scroll_distance_px, max_depth_px, payload) VALUES (%s,%s,%s,%s,'material','material','e2e',now(),"
                  " 150,150,150,0,0,0,0,'{}')", (lote, sessao, a1, cl))
        a.execute("INSERT INTO public.telemetria_time_metric_entries (lote_id, sessao_id, aluno_id, classe_id, topico_id,"
                  " scope, active_sec, captured_at) VALUES (%s,%s,%s,%s,%s,'material',150,now())",
                  (lote, sessao, a1, cl, top))
        pers = a.execute("INSERT INTO public.conteudo_personalizado (ciclo_id, classe_id, aluno_id, topico_id)"
                         " VALUES ('e2e',%s,%s,%s) RETURNING id", (cl, a1, top)).fetchone()["id"]
        a.execute("INSERT INTO public.personalizacao_item_progresso (personalizacao_id, aluno_id, classe_id, topico_id,"
                  " item_key, item_kind, item_title, updated_at) VALUES (%s,%s,%s,%s,'e2e','material','Material',now())",
                  (pers, a1, cl, top))
    with como(a1) as al:
        r = rpc(al, "loja_usar", p_compra_id=c["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at1"], p_idempotency_key=chave())
        assert r["ok"] and r["efeito"] == "segunda_chance"
        c2 = rpc(al, "loja_comprar", p_item="segunda_chance", p_classe_id=m["classeA"], p_idempotency_key=chave())
        r = rpc(al, "loja_usar", p_compra_id=c2["compra_id"], p_alvo_tipo="atividade", p_alvo_id=m["at3"], p_idempotency_key=chave())
        assert r["erro"] == "limite_por_topico" and r["limite"] == 1  # 1 por tópico (retry_max_por_topico)
        m["retry_ativo"] = c2["compra_id"]


# ------------------------------------------------------ 5. professor estorna


def test_estorno_so_de_posse_ativa(m):
    a1 = m["aluno1"]
    antes = saldo(a1)
    with como(m["profB"]) as outro:
        assert rpc(outro, "loja_estornar", p_compra_id=m["tempo_ativo"])["erro"] == "sem_permissao"
    with como(a1) as al:
        assert rpc(al, "loja_estornar", p_compra_id=m["tempo_ativo"])["erro"] == "sem_permissao"
    with como(m["profA"]) as p:
        r = rpc(p, "loja_estornar", p_compra_id=m["tempo_ativo"], p_motivo="comprou sem querer")
        assert r["ok"] and r["devolvido"] == 64
        assert rpc(p, "loja_estornar", p_compra_id=m["tempo_ativo"])["repetido"] is True
        assert rpc(p, "loja_estornar", p_compra_id=m["prazo_c1"])["erro"] == "ja_usado"
        # estorno de dotação devolve 0 moedas e libera o grátis de novo
        assert rpc(p, "loja_estornar", p_compra_id=m["prazo_ativo2"])["devolvido"] == 0
    assert saldo(a1) == antes + 64
    with como(a1) as al:
        assert rpc(al, "loja_usar", p_compra_id=m["tempo_ativo"], p_alvo_tipo="atividade", p_alvo_id=m["at2"],
                   p_idempotency_key=chave())["erro"] == "estornada"
        assert rpc(al, "loja_saldo_item", p_classe_id=m["classeA"], p_item="prazo_extra") == 1


# ------------------------------------------------------ 6. extrato e RLS


def test_extrato_aluno_ve_o_seu_professor_ve_a_turma_e_mais_ninguem(m):
    a1, a2, a3 = m["aluno1"], m["aluno2"], m["aluno3"]
    with como(a1) as al:
        donos = {x["aluno_id"] for x in linhas(al, "SELECT aluno_id FROM public.moedas_ledger")}
        assert donos == {a1}
        ext = linhas(al, "SELECT * FROM public.economia_extrato()")
        assert ext and sum(x["delta"] for x in ext) == saldo(a1) or len(ext) == 50
        so_compras = linhas(al, "SELECT * FROM public.economia_extrato(NULL, 'compra')")
        assert so_compras and all(x["motivo"] == "compra" for x in so_compras)
        with pytest.raises(errors.InsufficientPrivilege):
            linhas(al, "SELECT * FROM public.economia_extrato(%(a)s)", {"a": a2})
        assert {x["aluno_id"] for x in linhas(al, "SELECT aluno_id FROM public.loja_compras")} == {a1}
        assert {x["aluno_id"] for x in linhas(al, "SELECT aluno_id FROM public.loja_uso_log")} == {a1}
    with como(m["profA"]) as p:
        donos = {x["aluno_id"] for x in linhas(p, "SELECT aluno_id FROM public.moedas_ledger")}
        assert donos == {a1, a2}
        assert linhas(p, "SELECT * FROM public.economia_extrato(%(a)s)", {"a": a1})
        with pytest.raises(errors.InsufficientPrivilege):
            linhas(p, "SELECT * FROM public.economia_extrato(%(a)s)", {"a": a3})
        assert {x["aluno_id"] for x in linhas(p, "SELECT aluno_id FROM public.loja_uso_log")} == {a1}
    with como(m["profB"]) as outro:
        assert {x["aluno_id"] for x in linhas(outro, "SELECT aluno_id FROM public.moedas_ledger")} == {a3}
        with pytest.raises(errors.InsufficientPrivilege):
            linhas(outro, "SELECT * FROM public.economia_extrato(%(a)s)", {"a": a1})
        assert linhas(outro, "SELECT * FROM public.loja_uso_log WHERE aluno_id = %(a)s", {"a": a1}) == []
        assert linhas(outro, "SELECT * FROM public.atividade_tempo_aluno WHERE aluno_id = %(a)s", {"a": a1}) == []
    with como(a3) as al3:
        assert linhas(al3, "SELECT * FROM public.moedas_ledger WHERE aluno_id = %(a)s", {"a": a1}) == []
        assert linhas(al3, "SELECT * FROM public.economia_meta WHERE classe_id = %(c)s", {"c": m["classeA"]}) == []


# ------------------------------------------------------------ 7. auditoria


def test_auditoria_so_dev_le_e_cobre_as_operacoes(m):
    for quem in ("aluno1", "profA"):
        with como(m[quem]) as c:
            with pytest.raises(errors.InsufficientPrivilege):
                linhas(c, "SELECT * FROM public.economia_auditoria")
    with como(m["dev"]) as dev:
        # a leitura da auditoria é do painel admin da API (papel do banco): o
        # cliente, nem dev, tem GRANT. Dev lê o extrato de qualquer aluno.
        with pytest.raises(errors.InsufficientPrivilege):
            linhas(dev, "SELECT * FROM public.economia_auditoria")
        assert linhas(dev, "SELECT * FROM public.economia_extrato(%(a)s)", {"a": m["aluno3"]})
        with pytest.raises(errors.InsufficientPrivilege):
            linhas(dev, "SELECT * FROM public.economia_consistencia()")
    with _admin() as dev:
        aud = linhas(dev, "SELECT operacao, antes, depois, aluno_id FROM public.economia_auditoria"
                          " WHERE classe_id = %(c)s", {"c": m["classeA"]})
        ops = {x["operacao"] for x in aud}
        assert {"compra", "uso", "estorno", "config_dotacao", "arquivar_meta"} <= ops, ops
        compra = next(x for x in aud if x["operacao"] == "compra" and x["depois"]["preco"] == 10)
        assert compra["antes"]["saldo"] is not None and compra["depois"]["saldo"] is not None
        assert all(x["aluno_id"] is not None for x in aud if x["operacao"] in ("compra", "uso", "estorno"))


def test_consistencia_limpa_e_acusa_o_que_foi_quebrado(m):
    ids = [m["aluno1"], m["aluno2"], m["aluno3"]]
    with _admin() as a:
        sujos = [x for x in linhas(a, "SELECT * FROM public.economia_consistencia()") if x["aluno_id"] in ids]
        assert sujos == []
        compra = a.execute(
            "INSERT INTO public.loja_compras (aluno_id, classe_id, item_codigo, origem, preco_pago, idempotency_key)"
            " VALUES (%s, %s, 'dica', 'compra', 5, %s) RETURNING id", (m["aluno3"], m["classeB"], chave())
        ).fetchone()["id"]
        a.execute("INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, classe_id, referencia)"
                  " VALUES (%s, %s, 'concessao', %s, 'e2e:quebra')", (m["aluno2"], -(saldo(m["aluno2"]) + 50), m["classeA"]))
        acusados = {x["aluno_id"]: x for x in linhas(a, "SELECT * FROM public.economia_consistencia()") if x["aluno_id"] in ids}
        assert acusados[m["aluno3"]]["compras_sem_debito"] == 1
        assert m["aluno2"] in acusados  # saldo negativo
        a.execute("DELETE FROM public.loja_compras WHERE id = %s", (compra,))
        a.execute("DELETE FROM public.moedas_ledger WHERE referencia = 'e2e:quebra' AND aluno_id = %s", (m["aluno2"],))
        assert [x for x in linhas(a, "SELECT * FROM public.economia_consistencia()") if x["aluno_id"] in ids] == []
        # saldo do razão bate com o saldo exposto ao aluno
    with como(m["aluno1"]) as al:
        assert rpc(al, "loja_saldo") == saldo(m["aluno1"])


# ------------------------------------------------- 8. excluir a turma depois


def test_excluir_turma_com_itens_usados(m):
    """`excluir_classe` confia nas cascatas: posse e log de uso caem com a turma."""
    with _admin() as a:
        usos = a.execute("SELECT count(*) n FROM public.loja_uso_log WHERE classe_id = %s", (m["classeA"],)).fetchone()["n"]
        razao = a.execute("SELECT count(*) n FROM public.moedas_ledger WHERE aluno_id = %s", (m["aluno1"],)).fetchone()["n"]
    assert usos > 0
    with como(m["profB"]) as outro:
        with pytest.raises(errors.InsufficientPrivilege):
            rpc(outro, "excluir_classe", p_classe_id=m["classeA"])
    with como(m["profA"]) as p:
        assert rpc(p, "excluir_classe", p_classe_id=m["classeA"]) is True
    with _admin() as a:
        assert a.execute("SELECT count(*) n FROM public.loja_compras WHERE classe_id = %s", (m["classeA"],)).fetchone()["n"] == 0
        assert a.execute("SELECT count(*) n FROM public.loja_uso_log WHERE classe_id = %s", (m["classeA"],)).fetchone()["n"] == 0
        # o razão fica (classe_id vira NULL) e a auditoria também
        assert a.execute("SELECT count(*) n FROM public.moedas_ledger WHERE aluno_id = %s", (m["aluno1"],)).fetchone()["n"] == razao
        assert a.execute("SELECT count(*) n FROM public.economia_auditoria WHERE classe_id = %s", (m["classeA"],)).fetchone()["n"] > 0
