"""Ponta a ponta: várias unidades do mesmo item e limite de uso por situação.

Mesmo banco descartável e mesmas regras de `test_e2e_economia_banco.py` (pulado
sem `TRAILUP_E2E_DATABASE_URL`). Turma própria, para não depender dos saldos
daquele módulo. Os testes seguem a ordem do arquivo.
"""

from __future__ import annotations

import random
import threading
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.test_e2e_economia_banco import DSN, _admin, chave, como, conceder, linhas, rpc, saldo

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_DATABASE_URL não definido (e2e só em banco descartável)"
)

if DSN:
    from psycopg import errors


def preco(p, classe, item, base, *, estoque=None, limite=None, fator=None):
    assert rpc(p, "economia_salvar_preco_classe", p_classe_id=classe, p_item=item, p_preco_base=base,
               p_estoque=estoque, p_uso_max_por_aluno=limite, p_ativo=True, p_preco_fator=fator) == {"ok": True}


def limite(p, classe, item, escopo="classe", alvo=None, **lim):
    campos = {f"p_{k}": lim.get(k) for k in ("por_atividade", "por_questao", "por_topico", "por_dia",
                                             "por_semana", "por_turma")}
    return rpc(p, "economia_salvar_limite_uso", p_classe_id=classe, p_escopo=escopo, p_alvo_id=alvo,
               p_item=item, **campos)


def inventario(c, classe):
    return {x["item_codigo"]: x for x in linhas(c, "SELECT * FROM public.loja_inventario(%(c)s)", {"c": classe})}


def usar(c, classe, item, tipo, alvo, k=None):
    return rpc(c, "loja_usar_item", p_item=item, p_classe_id=classe, p_alvo_tipo=tipo, p_alvo_id=alvo,
               p_idempotency_key=k or chave())


@pytest.fixture(scope="module")
def q():
    s = {k: uuid.uuid4() for k in ("profC", "profD", "alunoX", "alunoY", "alunoZ")}
    base = random.randint(10_000_000, 90_000_000)
    s["C"], s["D"] = base, base + 1
    agora = datetime.now(timezone.utc).replace(microsecond=0)
    with _admin() as a:
        for k, uid in list(s.items()):
            if isinstance(uid, uuid.UUID):
                a.execute("INSERT INTO auth.users (id, email, aud, role) VALUES (%s,%s,'authenticated','authenticated')",
                          (uid, f"{k}-{uid.hex[:8]}@e2e.local"))
        for k in ("profC", "profD"):
            a.execute("INSERT INTO public.professor (id, nome, liberado) VALUES (%s,%s,true)", (s[k], k))
        for k in ("alunoX", "alunoY", "alunoZ"):
            a.execute("INSERT INTO public.alunos (id, nome, email) VALUES (%s,%s,%s)",
                      (s[k], k, f"{k}-{s[k].hex[:8]}@e2e.local"))
        a.execute("INSERT INTO public.classe (id, professor_id, descricao) VALUES (%s,%s,'e2e C'), (%s,%s,'e2e D')",
                  (s["C"], s["profC"], s["D"], s["profD"]))
        for k, cl in (("alunoX", "C"), ("alunoY", "C"), ("alunoZ", "D")):
            a.execute("INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (%s,%s)", (s[cl], s[k]))
        for t, cl in (("T1", "C"), ("T2", "C"), ("TD", "D")):
            s[t] = a.execute("INSERT INTO public.topicos (classe_id, nome) VALUES (%s,%s) RETURNING id",
                             (s[cl], t)).fetchone()["id"]
        for at, t, prazo in (("a1", "T1", agora + timedelta(days=3)), ("a2", "T1", agora + timedelta(days=3)),
                             ("a3", "T2", None), ("aD", "TD", None)):
            s[at] = a.execute("INSERT INTO public.atividades (topico_id, titulo, pontuacao_maxima, data_entrega)"
                              " VALUES (%s,%s,10,%s) RETURNING id", (s[t], at, prazo)).fetchone()["id"]
        for qn, at in (("q1", "a1"), ("q2", "a1"), ("q4", "a1"), ("q3", "a3"), ("q5", "a3"), ("q6", "a3"),
                       ("qD", "aD")):
            s[qn] = a.execute(
                "INSERT INTO public.questoes (atividade_id, enunciado, tipo, alternativas, resposta_correta)"
                " VALUES (%s,%s,'multipla_escolha','[\"1\",\"2\"]','1') RETURNING id", (s[at], qn)
            ).fetchone()["id"]
        for k in ("alunoX", "alunoY"):
            for at in ("a1", "a2", "a3"):
                a.execute("INSERT INTO public.atividade_aluno (aluno_id, atividade_id, status) VALUES (%s,%s,'em andamento')"
                          " ON CONFLICT (aluno_id, atividade_id) DO UPDATE SET status = 'em andamento'", (s[k], s[at]))
    yield s
    with _admin() as a:
        ids = [v for v in s.values() if isinstance(v, uuid.UUID)]
        a.execute("DELETE FROM public.economia_auditoria WHERE classe_id IN (%s,%s) OR ator_id = ANY(%s)",
                  (s["C"], s["D"], ids))
        a.execute("DELETE FROM public.classe WHERE id IN (%s,%s)", (s["C"], s["D"]))
        a.execute("DELETE FROM public.moedas_ledger WHERE aluno_id = ANY(%s)", (ids,))
        for k in ("alunoX", "alunoY", "alunoZ"):
            a.execute("DELETE FROM public.alunos WHERE id = %s", (s[k],))
        for k in ("profC", "profD"):
            a.execute("DELETE FROM public.professor WHERE id = %s", (s[k],))
        a.execute("DELETE FROM auth.users WHERE id = ANY(%s)", (ids,))


# ------------------------------------------------------------------ compra


def test_compra_varias_unidades_num_pedido(q):
    x, C = q["alunoX"], q["C"]
    with como(q["profC"]) as p:
        preco(p, C, "prazo_extra", 10, fator=1)  # aumento por compra desligado
    conceder(x, C, 100)
    with como(x) as al:
        k = chave()
        r = rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=C, p_idempotency_key=k, p_quantidade=3)
        assert r["ok"] and r["quantidade"] == 3 and r["preco"] == 30 and r["precos"] == [10, 10, 10]
        assert len(r["compra_ids"]) == 3 and r["origens"] == ["compra"] * 3
        rep = rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=C, p_idempotency_key=k, p_quantidade=3)
        assert rep["repetido"] is True and rep["compra_ids"] == r["compra_ids"]
        assert saldo(x) == 70
        q["prazos"] = r["compra_ids"]
        for ruim in (0, 21, None):
            assert rpc(al, "loja_comprar", p_item="prazo_extra", p_classe_id=C, p_idempotency_key=chave(),
                       p_quantidade=ruim)["erro"] == "quantidade_invalida"
        inv = inventario(al, C)
        assert (inv["prazo_extra"]["ativos"], inv["prazo_extra"]["usados"], inv["prazo_extra"]["estornados"]) == (3, 0, 0)
        cat = {c["codigo"]: c for c in linhas(al, "SELECT * FROM public.loja_catalogo(%(c)s)", {"c": C})}
        assert cat["prazo_extra"]["em_posse"] == 3 and cat["prazo_extra"]["compradas"] == 3
        assert cat["prazo_extra"]["preco"] == 10 and cat["prazo_extra"]["preco_fator"] == 1
        assert cat["prazo_extra"]["limite_compras"] is None and cat["prazo_extra"]["compras_restantes"] is None
    with _admin() as a:
        razao = linhas(a, "SELECT compra_id, delta FROM public.moedas_ledger WHERE motivo = 'compra' AND aluno_id = %(x)s"
                          " ORDER BY compra_id", {"x": x})
        assert [(r["compra_id"], r["delta"]) for r in razao] == [(i, -10) for i in q["prazos"]]
        aud = linhas(a, "SELECT depois FROM public.economia_auditoria WHERE operacao = 'compra' AND aluno_id = %(x)s"
                        " ORDER BY id", {"x": x})
        assert [d["depois"]["unidade"] for d in aud] == [1, 2, 3]
        assert [d["depois"]["saldo"] for d in aud] == [90, 80, 70]


def test_aumento_por_compra_e_opcao_da_turma(q):
    x, C = q["alunoX"], q["C"]
    with como(q["profC"]) as p:
        preco(p, C, "tempo_extra", 8)  # fator do catálogo (2): o comportamento de antes
    with como(x) as al:
        r = rpc(al, "loja_comprar", p_item="tempo_extra", p_classe_id=C, p_idempotency_key=chave(), p_quantidade=3)
        assert r["precos"] == [8, 16, 32] and r["preco"] == 56
    with como(q["profC"]) as p:
        preco(p, C, "tempo_extra", 8, fator=1)
        assert rpc(p, "economia_salvar_preco_classe", p_classe_id=C, p_item="tempo_extra", p_preco_base=8,
                   p_estoque=None, p_uso_max_por_aluno=None, p_ativo=True, p_preco_fator=6)["erro"] == "faixa_invalida"
    with como(x) as al:
        cat = {c["codigo"]: c for c in linhas(al, "SELECT * FROM public.loja_catalogo(%(c)s)", {"c": C})}
        assert cat["tempo_extra"]["preco"] == 8 and cat["tempo_extra"]["em_posse"] == 3
    assert saldo(x) == 14


def test_varias_unidades_respeitam_limite_estoque_saldo_e_dotacao(q):
    x, y, C = q["alunoX"], q["alunoY"], q["C"]
    conceder(x, C, 100)
    conceder(y, C, 100)
    with como(q["profC"]) as p:
        preco(p, C, "dica", 5, estoque=4, limite=3, fator=1)
    with como(x) as al:
        r = rpc(al, "loja_comprar", p_item="dica", p_classe_id=C, p_idempotency_key=chave(), p_quantidade=4)
        assert r["erro"] == "limite_de_compras" and r["limite"] == 3 and r["restantes"] == 3
        assert rpc(al, "loja_comprar", p_item="dica", p_classe_id=C, p_idempotency_key=chave(), p_quantidade=3)["ok"]
        cat = {c["codigo"]: c for c in linhas(al, "SELECT * FROM public.loja_catalogo(%(c)s)", {"c": C})}
        assert cat["dica"]["compras_restantes"] == 0 and cat["dica"]["estoque_restante"] == 1
    with como(y) as al:
        r = rpc(al, "loja_comprar", p_item="dica", p_classe_id=C, p_idempotency_key=chave(), p_quantidade=2)
        assert r["erro"] == "estoque_esgotado" and r["restantes"] == 1
        assert rpc(al, "loja_comprar", p_item="dica", p_classe_id=C, p_idempotency_key=chave(), p_quantidade=1)["ok"]
    assert saldo(y) == 95
    with como(q["profC"]) as p:
        preco(p, C, "tempo_extra", 50, fator=1)
        assert rpc(p, "economia_salvar_dotacao", p_classe_id=C, p_item="segunda_chance", p_quantidade=2) == {"ok": True}
        preco(p, C, "segunda_chance", 7, fator=1)
    with como(y) as al:
        r = rpc(al, "loja_comprar", p_item="tempo_extra", p_classe_id=C, p_idempotency_key=chave(), p_quantidade=2)
        assert r["erro"] == "saldo_insuficiente" and r["preco"] == 100
        assert "tempo_extra" not in inventario(al, C)  # tudo ou nada
        r = rpc(al, "loja_comprar", p_item="segunda_chance", p_classe_id=C, p_idempotency_key=chave(), p_quantidade=3)
        assert r["origens"] == ["dotacao", "dotacao", "compra"] and r["precos"] == [0, 0, 7]
    assert saldo(y) == 88


def test_dois_pedidos_de_varias_unidades_ao_mesmo_tempo(q):
    y, C = q["alunoY"], q["C"]
    with como(q["profC"]) as p:
        preco(p, C, "troca_formato", 10, fator=1)
    with _admin() as a:  # deixa saldo para UM pedido de 3
        a.execute("INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, classe_id, referencia)"
                  " VALUES (%s, %s, 'concessao', %s, 'e2e:ajuste')", (y, 40 - saldo(y), C))
    assert saldo(y) == 40
    barreira = threading.Barrier(2)
    resultados = []

    def comprar():
        with como(y) as c:
            c.autocommit = False
            barreira.wait()
            r = rpc(c, "loja_comprar", p_item="troca_formato", p_classe_id=C, p_idempotency_key=chave(), p_quantidade=3)
            c.commit()
            resultados.append(r)

    ts = [threading.Thread(target=comprar) for _ in range(2)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert sorted(bool(r.get("ok")) for r in resultados) == [False, True]
    assert next(r for r in resultados if not r.get("ok"))["erro"] == "saldo_insuficiente"
    assert saldo(y) == 10
    with como(y) as al:
        assert inventario(al, C)["troca_formato"]["ativos"] == 3


# --------------------------------------------------------------------- uso


def test_usar_gasta_uma_unidade_a_mais_antiga_com_idempotencia(q):
    x, C = q["alunoX"], q["C"]
    with como(x) as al:
        k = chave()
        r = usar(al, C, "prazo_extra", "atividade", q["a1"], k)
        assert r["ok"] and r["compra_id"] == q["prazos"][0]
        rep = usar(al, C, "prazo_extra", "atividade", q["a1"], k)
        assert rep["repetido"] is True and rep["compra_id"] == q["prazos"][0]
        inv = inventario(al, C)["prazo_extra"]
        assert (inv["ativos"], inv["usados"]) == (2, 1)
        # padrão: 1 mais prazo por atividade
        perm = rpc(al, "loja_usos_permitidos", p_classe_id=C, p_item="prazo_extra", p_alvo_tipo="atividade", p_alvo_id=q["a1"])
        assert perm["bloqueio"] == "limite_por_atividade" and perm["restantes"] == 0 and perm["ativos"] == 2
        r = usar(al, C, "prazo_extra", "atividade", q["a1"])
        assert r["erro"] == "limite_por_atividade" and r["limite"] == 1 and r["usados"] == 1
        perm = rpc(al, "loja_usos_permitidos", p_classe_id=C, p_item="prazo_extra", p_alvo_tipo="atividade", p_alvo_id=q["a2"])
        assert perm["bloqueio"] is None and perm["restantes"] == 1 and perm["limites"]["por_atividade"] == 1
        r = usar(al, C, "prazo_extra", "atividade", q["a2"])
        assert r["ok"] and r["compra_id"] == q["prazos"][1]
        # unidade de outra turma não entra
        assert usar(al, C, "prazo_extra", "atividade", q["aD"])["erro"] == "alvo_de_outra_turma"
    with _admin() as a:
        log = linhas(a, "SELECT compra_id, atividade_id, topico_id FROM public.loja_uso_log WHERE aluno_id = %(x)s"
                        " AND item_codigo = 'prazo_extra' ORDER BY id", {"x": x})
        assert [(u["compra_id"], u["atividade_id"], u["topico_id"]) for u in log] == [
            (q["prazos"][0], q["a1"], q["T1"]), (q["prazos"][1], q["a2"], q["T1"])]
        assert len(linhas(a, "SELECT 1 FROM public.economia_auditoria WHERE operacao = 'uso' AND aluno_id = %(x)s",
                          {"x": x})) == 2


def test_limites_por_questao_atividade_topico_dia_semana_turma(q):
    x, C = q["alunoX"], q["C"]
    with como(q["profC"]) as p:
        preco(p, C, "dica", 5, fator=1)  # sem estoque nem limite de compra
        assert limite(p, C, "dica", por_atividade=1) == {"ok": True}
    with como(x) as al:
        rpc(al, "loja_comprar", p_item="dica", p_classe_id=C, p_idempotency_key=chave(), p_quantidade=5)
        assert usar(al, C, "dica", "questao", q["q1"])["ok"]
        assert usar(al, C, "dica", "questao", q["q1"])["erro"] == "limite_por_questao"
        r = usar(al, C, "dica", "questao", q["q2"])
        assert r["erro"] == "limite_por_atividade" and r["limite"] == 1
    with como(q["profC"]) as p:  # a atividade sobrepõe a turma
        assert limite(p, C, "dica", "atividade", q["a1"], por_atividade=5) == {"ok": True}
        assert limite(p, C, "dica", "topico", q["T1"], por_topico=2) == {"ok": True}
    with como(x) as al:
        assert usar(al, C, "dica", "questao", q["q2"])["ok"]
        r = usar(al, C, "dica", "questao", q["q4"])
        assert r["erro"] == "limite_por_topico" and r["limite"] == 2 and r["usados"] == 2
    with como(q["profC"]) as p:
        assert limite(p, C, "dica", por_atividade=-1, por_dia=3) == {"ok": True}
    with como(x) as al:
        assert usar(al, C, "dica", "questao", q["q3"])["ok"]  # T2, a3: 3º uso do dia
        assert usar(al, C, "dica", "questao", q["q5"])["erro"] == "limite_por_dia"
    with como(q["profC"]) as p:
        assert limite(p, C, "dica", por_atividade=-1, por_dia=-1, por_semana=3) == {"ok": True}
    with como(x) as al:
        assert usar(al, C, "dica", "questao", q["q5"])["erro"] == "limite_por_semana"
    with como(q["profC"]) as p:
        assert limite(p, C, "dica", por_atividade=-1, por_turma=3) == {"ok": True}
    with como(x) as al:
        r = usar(al, C, "dica", "questao", q["q5"])
        assert r["erro"] == "limite_por_turma" and r["usados"] == 3
        perm = rpc(al, "loja_usos_permitidos", p_classe_id=C, p_item="dica", p_alvo_tipo="questao", p_alvo_id=q["q6"])
        assert perm["bloqueio"] == "limite_por_turma" and perm["restantes"] == 0
    with como(q["profC"]) as p:
        assert limite(p, C, "dica", por_atividade=-1, por_turma=4) == {"ok": True}
        assert limite(p, C, "dica", "atividade", q["a3"], por_atividade=0) == {"ok": True}  # 0 bloqueia
    with como(x) as al:
        assert usar(al, C, "dica", "questao", q["q5"])["erro"] == "limite_por_atividade"
    with como(q["profC"]) as p:
        assert limite(p, C, "dica", "atividade", q["a3"]) == {"ok": True}  # tudo vazio: apaga a sobreposição
    with como(x) as al:
        perm = rpc(al, "loja_usos_permitidos", p_classe_id=C, p_item="dica", p_alvo_tipo="questao", p_alvo_id=q["q5"])
        assert perm["bloqueio"] is None and perm["restantes"] == 1 and perm["ativos"] == 5
        assert usar(al, C, "dica", "questao", q["q5"])["ok"]
        assert usar(al, C, "dica", "questao", q["q6"])["erro"] == "limite_por_turma"
        # responder novamente: por questão (1) e por tópico (1) por padrão; aceita mirar a questão
        perm = rpc(al, "loja_usos_permitidos", p_classe_id=C, p_item="segunda_chance", p_alvo_tipo="questao",
                   p_alvo_id=q["q1"])
        assert perm["limites"]["por_questao"] == 1 and perm["limites"]["por_topico"] == 1
        assert perm["bloqueio"] == "sem_unidade"


def test_estorno_devolve_uma_unidade_nao_usada(q):
    x, C = q["alunoX"], q["C"]
    antes = saldo(x)
    with como(q["profC"]) as p:
        assert rpc(p, "loja_estornar", p_compra_id=q["prazos"][0])["erro"] == "ja_usado"
        r = rpc(p, "loja_estornar", p_compra_id=q["prazos"][2])
        assert r["ok"] and r["devolvido"] == 10
    assert saldo(x) == antes + 10
    with como(x) as al:
        inv = inventario(al, C)["prazo_extra"]
        assert (inv["ativos"], inv["usados"], inv["estornados"]) == (0, 2, 1)
        assert usar(al, C, "prazo_extra", "atividade", q["a1"])["erro"] == "sem_unidade"
        cat = {c["codigo"]: c for c in linhas(al, "SELECT * FROM public.loja_catalogo(%(c)s)", {"c": C})}
        assert cat["prazo_extra"]["compradas"] == 2  # estornada não conta


def test_limites_so_o_professor_da_turma_escreve(q):
    C = q["C"]
    with como(q["profD"]) as outro:
        assert limite(outro, C, "dica", por_dia=1)["erro"] == "sem_permissao"
        assert linhas(outro, "SELECT * FROM public.loja_limite_uso WHERE classe_id = %(c)s", {"c": C}) == []
    with como(q["profC"]) as p:
        assert limite(p, C, "dica", "atividade", q["aD"], por_dia=1)["erro"] == "alvo_de_outra_turma"
        assert limite(p, C, "dica", por_dia=-2)["erro"] == "faixa_invalida"
        assert limite(p, C, "dica", "topico", None, por_dia=1)["erro"] == "escopo_invalido"
        assert linhas(p, "SELECT * FROM public.loja_limite_uso WHERE classe_id = %(c)s", {"c": C})
        with pytest.raises(errors.InsufficientPrivilege):
            p.execute("UPDATE public.loja_limite_uso SET por_dia = 50")
    with como(q["alunoX"]) as al:
        assert limite(al, C, "dica", por_dia=50)["erro"] == "sem_permissao"
        assert linhas(al, "SELECT * FROM public.loja_limite_uso WHERE classe_id = %(c)s", {"c": C})
        with pytest.raises(errors.InsufficientPrivilege):
            al.execute("INSERT INTO public.loja_limite_uso (classe_id, escopo, alvo_id, item_codigo, por_dia)"
                       " VALUES (%s, 'classe', 0, 'dica', 50)", (C,))
        with pytest.raises(errors.InsufficientPrivilege):
            al.execute("SELECT public.fn_loja_checa_limite(%s, %s, 'dica', NULL, NULL, NULL)", (q["alunoX"], C))
    with como(q["alunoY"]) as al:
        meus = inventario(al, C)
        assert "prazo_extra" not in meus  # só o próprio
    with como(q["alunoZ"]) as fora:
        assert linhas(fora, "SELECT * FROM public.loja_limite_uso WHERE classe_id = %(c)s", {"c": C}) == []
        assert rpc(fora, "loja_usos_permitidos", p_classe_id=C, p_item="dica", p_alvo_tipo="questao",
                   p_alvo_id=q["q1"])["erro"] == "fora_da_turma"
        assert usar(fora, C, "dica", "questao", q["q1"])["erro"] == "sem_unidade"
    with como(None, "anon") as anon:
        for sql in ("SELECT public.loja_usar_item('dica', 1, 'questao', 1, 'k')",
                    "SELECT public.loja_comprar('dica', 1, 'k', NULL, NULL, NULL, 2)",
                    "SELECT * FROM public.loja_inventario(1)"):
            with pytest.raises(errors.InsufficientPrivilege):
                anon.execute(sql)
    with _admin() as a:
        ops = {x["operacao"] for x in linhas(a, "SELECT operacao FROM public.economia_auditoria WHERE classe_id = %(c)s",
                                             {"c": C})}
        assert {"config_limite_uso", "config_preco", "compra", "uso", "estorno"} <= ops
