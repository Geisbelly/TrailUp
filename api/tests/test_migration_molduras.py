"""Molduras (20261103_09): o catálogo bate com os arquivos do app, e o banco cobra, entrega e protege.

A parte estrutural roda sempre. A parte e2e roda num Postgres LOCAL com o esqueleto do schema de
produção (`TRAILUP_E2E_RETENCAO_DATABASE_URL`, o mesmo banco descartável da F5), com o CHECK de
critério das conquistas instalado: semente com chave de critério errada falharia ali, e não no
gatilho de eventos de um aluno.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest

from tests._f5_banco import banco, como, e2e, modulo, sql_de

MIGRACAO = "20261103_09_molduras_loja_conquistas_acoes.py"
RAIZ = Path(__file__).resolve().parents[2]
ASSETS = RAIZ / "mobile" / "src" / "assets" / "design" / "molduras"
CATALOGO_TS = RAIZ / "mobile" / "src" / "constants" / "molduras.ts"

mod = modulo(MIGRACAO)


# --------------------------------------------------------------------------- estrutura


def _codigos() -> list[str]:
    return [c for c, *_ in mod.LOJA] + [c for c, *_ in mod.CONQUISTA] + [a[3] for a in mod.ACOES]


def test_quarenta_molduras_vinte_dez_dez():
    assert len(mod.LOJA) == 20
    assert len(mod.CONQUISTA) == 10
    assert len(mod.ACOES) == 10
    assert len(set(_codigos())) == 40


def test_loja_custa_20_30_ou_40():
    assert {preco for *_, preco in mod.LOJA} == {20, 30, 40}


def test_cada_moldura_tem_arquivo_no_app_e_entrada_no_catalogo():
    catalogo = CATALOGO_TS.read_text(encoding="utf-8")
    for codigo in _codigos():
        assert (ASSETS / f"{codigo}.webp").is_file(), codigo
        assert re.search(rf"\b{codigo}: \{{", catalogo), f"{codigo} fora de molduras.ts"


def test_acoes_do_app_sao_as_do_banco():
    """Ação que o app manda e o banco não conhece volta `acao_desconhecida` e não entrega nada."""
    app = (RAIZ / "mobile" / "src" / "services" / "moldurasModel.ts").read_text(encoding="utf-8")
    bloco = re.search(r"export type AcaoDeMoldura =([^;]+);", app)
    assert bloco
    no_app = set(re.findall(r'"([a-z_]+)"', bloco.group(1)))
    assert no_app == {a[0] for a in mod.ACOES}


def test_criterio_usa_a_chave_que_o_avaliador_le():
    chave = {
        "dias_seguidos": "dias_seguidos",
        "minutos_totais": "minutos",
        "topicos_concluidos": "minimo",
        "atividades_concluidas": "minimo",
        "acertos_percentual": "percentual",
    }
    for _codigo, _nome, _c, _d, _cat, criterio, _i, _cor in mod.CONQUISTA:
        assert chave[criterio["metrica"]] in criterio, criterio


def test_admin_sem_grant_para_cliente():
    sql = "\n".join(sql_de(mod))
    assert "molduras_admin_salvar(text, boolean, integer, text) FROM PUBLIC, anon, authenticated" in sql
    assert "molduras_admin_salvar_acao(text, boolean, text, text) FROM PUBLIC, anon, authenticated" in sql
    assert "GRANT EXECUTE ON FUNCTION public.molduras_admin" not in sql


def test_toda_tabela_nova_nasce_com_policy():
    sql = "\n".join(sql_de(mod))
    for tabela in ("molduras", "moldura_aluno", "molduras_acoes", "moldura_acao_aluno"):
        assert re.search(rf"CREATE POLICY \w+ ON public\.{tabela}\s+FOR SELECT", sql), tabela


# --------------------------------------------------------------------------- e2e

PRE = """
CREATE OR REPLACE FUNCTION public.loja_saldo() RETURNS numeric LANGUAGE sql STABLE AS
$$ SELECT COALESCE(SUM(delta), 0) FROM public.moedas_ledger WHERE aluno_id = auth.uid() $$;
CREATE OR REPLACE FUNCTION public.economia_auditar(
  p_operacao text, p_entidade text, p_entidade_id text, p_classe_id bigint, p_aluno_id uuid,
  p_antes jsonb, p_depois jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.economia_auditoria (ator_id, operacao, entidade, entidade_id, classe_id, aluno_id, antes, depois)
  VALUES (auth.uid(), p_operacao, p_entidade, p_entidade_id, p_classe_id, p_aluno_id, p_antes, p_depois) $$;
-- O esqueleto é de 24/10, anterior à `retencao_politica` (20261024_03): só as colunas que a semente usa.
CREATE TABLE public.retencao_politica (
  tabela text, acao text, coluna_aluno text, categoria text, motivo text, PRIMARY KEY (tabela, acao));
ALTER TABLE public.moedas_ledger ADD CONSTRAINT moedas_ledger_motivo_check
  CHECK (motivo IN ('evento','dotacao','compra','estorno','concessao'));
-- O índice como está em produção (não como o Alembic o cria): uma conquista do sistema por `tipo`.
-- Sem ele, a semente que gravava as dez com `tipo = 'moldura'` passou aqui e derrubou a API (03/11).
DROP INDEX IF EXISTS public.conquistas_tipo_comum_uq;
CREATE UNIQUE INDEX conquistas_tipo_comum_uq
  ON public.conquistas (COALESCE(classe_id, -1), tipo) WHERE escopo = 'comum';
"""

A, B = uuid.UUID(int=31), uuid.UUID(int=32)


@pytest.fixture
def c():
    validador = modulo("20261031_01_conquista_valida_limiar_e_aparencia.py")
    with banco(PRE, validador.VALIDADOR, validador.CHECK_SQL, *sql_de(mod)) as conn:
        conn.execute(
            f"""
INSERT INTO auth.users (id, email) VALUES ('{A}', 'a@teste.invalid'), ('{B}', 'b@teste.invalid');
INSERT INTO public.alunos (id, nome, email) VALUES ('{A}', 'A', 'a@teste.invalid'), ('{B}', 'B', 'b@teste.invalid');
INSERT INTO public.moedas_ledger (aluno_id, delta, motivo) VALUES ('{A}', 50, 'concessao');
"""
        )
        yield conn


def _rpc(c, quem, sql, *args):
    como(c, quem)
    try:
        return c.execute(sql, args).fetchone()[0]
    finally:
        como(c, None)


def _saldo(c, quem) -> float:
    return float(
        c.execute("SELECT COALESCE(SUM(delta),0) FROM public.moedas_ledger WHERE aluno_id=%s", (quem,)).fetchone()[0]
    )


@e2e
def test_semente(c):
    linhas = dict(c.execute("SELECT origem, count(*) FROM public.molduras GROUP BY origem").fetchall())
    assert linhas == {"loja": 20, "conquista": 10, "acao": 10}
    conq = c.execute(
        "SELECT count(DISTINCT tipo) FROM public.conquistas"
        " WHERE tipo LIKE 'moldura\\_%' AND classe_id IS NULL AND escopo='comum'"
    ).fetchone()[0]
    assert conq == 10
    assert (
        c.execute("SELECT count(*) FROM public.molduras_acoes WHERE ativa AND moldura_codigo IS NOT NULL").fetchone()[0]
        == 10
    )


@e2e
def test_compra_debita_uma_vez_e_respeita_o_saldo(c):
    r = _rpc(c, A, "SELECT public.moldura_comprar(%s)", "rubi_real")  # 40
    assert r["ok"] and r["preco"] == 40
    assert _saldo(c, A) == 10
    de_novo = _rpc(c, A, "SELECT public.moldura_comprar(%s)", "rubi_real")
    assert de_novo["repetido"] is True
    assert _saldo(c, A) == 10
    sem = _rpc(c, A, "SELECT public.moldura_comprar(%s)", "folhagem")  # 20
    assert sem == {"ok": False, "erro": "saldo_insuficiente", "saldo": 10, "preco": 20}
    linha = c.execute(
        "SELECT motivo, evento_tipo, referencia, delta FROM public.moedas_ledger WHERE aluno_id=%s AND delta<0", (A,)
    ).fetchall()
    assert [(m, e, r, float(d)) for m, e, r, d in linha] == [("compra", "moldura", "rubi_real", -40.0)]
    assert c.execute("SELECT count(*) FROM public.economia_auditoria WHERE entidade='moldura_aluno'").fetchone()[0] == 1


@e2e
def test_nao_compra_rara_nem_de_conquista(c):
    for codigo in ("geada", "estrela_guia", "nao_existe"):
        assert _rpc(c, A, "SELECT public.moldura_comprar(%s)", codigo)["erro"] == "moldura_indisponivel"
    assert _saldo(c, A) == 50


@e2e
def test_equipar_so_o_que_tem(c):
    assert _rpc(c, A, "SELECT public.moldura_equipar(%s)", "folhagem")["erro"] == "moldura_nao_e_sua"
    _rpc(c, A, "SELECT public.moldura_comprar(%s)", "folhagem")
    assert _rpc(c, A, "SELECT public.moldura_equipar(%s)", "folhagem")["ok"]
    assert c.execute("SELECT moldura_equipada FROM public.alunos WHERE id=%s", (A,)).fetchone()[0] == "folhagem"
    # O aluno tem UPDATE na própria linha: o gatilho é a barreira, não a RPC.
    import psycopg

    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("UPDATE public.alunos SET moldura_equipada='rubi_real' WHERE id=%s", (A,))
    assert _rpc(c, A, "SELECT public.moldura_equipar(NULL)")["ok"]
    assert c.execute("SELECT moldura_equipada FROM public.alunos WHERE id=%s", (A,)).fetchone()[0] is None


@e2e
def test_conquista_concluida_entrega_a_moldura(c):
    geada, diamante = (
        c.execute("SELECT conquista_id FROM public.molduras WHERE codigo=%s", (k,)).fetchone()[0]
        for k in ("geada", "diamante")
    )
    # Os dois caminhos de `trg_eventos_aluno_after_iud`: INSERT já concluído e UPDATE que conclui.
    c.execute(
        "INSERT INTO public.conquistas_aluno (aluno_id, conquista_id, concluida, progresso) VALUES (%s,%s,true,100)",
        (A, geada),
    )
    c.execute(
        "INSERT INTO public.conquistas_aluno (aluno_id, conquista_id, concluida, progresso) VALUES (%s,%s,false,40)",
        (A, diamante),
    )
    assert c.execute("SELECT count(*) FROM public.moldura_aluno WHERE aluno_id=%s", (A,)).fetchone()[0] == 1
    c.execute("UPDATE public.conquistas_aluno SET concluida=true WHERE aluno_id=%s AND conquista_id=%s", (A, diamante))
    posse = c.execute(
        "SELECT moldura_codigo, origem FROM public.moldura_aluno WHERE aluno_id=%s ORDER BY 1", (A,)
    ).fetchall()
    assert posse == [("diamante", "conquista"), ("geada", "conquista")]


@e2e
def test_acao_entrega_uma_vez_e_o_dev_desliga(c):
    r = _rpc(c, A, "SELECT public.moldura_registrar_acao(%s)", "avaliar_app")
    assert r == {"ok": True, "nova": True, "moldura": "estrela_guia", "nome": "Estrela-Guia"}
    assert _rpc(c, A, "SELECT public.moldura_registrar_acao(%s)", "avaliar_app") == {"ok": True, "nova": False}
    assert _rpc(c, A, "SELECT public.moldura_registrar_acao(%s)", "inventada")["erro"] == "acao_desconhecida"

    c.execute("SELECT public.molduras_admin_salvar_acao('avaliar_app', false, 'estrela_guia', 'dev')")
    assert _rpc(c, B, "SELECT public.moldura_registrar_acao(%s)", "avaliar_app") == {"ok": True, "nova": False}
    # A ação fica registrada: ligar depois não credita sozinho, mas a métrica existe.
    assert c.execute("SELECT count(*) FROM public.moldura_acao_aluno WHERE acao='avaliar_app'").fetchone()[0] == 2
    assert c.execute("SELECT count(*) FROM public.moldura_aluno WHERE aluno_id=%s", (B,)).fetchone()[0] == 0


@e2e
def test_admin_valida_e_audita(c):
    import psycopg

    with pytest.raises(psycopg.errors.InvalidParameterValue):
        c.execute("SELECT public.molduras_admin_salvar('folhagem', true, 0, 'dev')")
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        c.execute("SELECT public.molduras_admin_salvar_acao('avaliar_app', true, 'folhagem', 'dev')")
    r = c.execute("SELECT public.molduras_admin_salvar('folhagem', false, 25, 'dev')").fetchone()[0]
    assert r == {"codigo": "folhagem", "ativa": False, "preco": 25}
    depois = c.execute(
        "SELECT depois FROM public.economia_auditoria WHERE entidade='molduras' AND entidade_id='folhagem'"
    ).fetchone()[0]
    assert depois == {"ativa": False, "preco": 25, "ator": "dev"}
    # Desligada não se compra.
    assert _rpc(c, A, "SELECT public.moldura_comprar(%s)", "folhagem")["erro"] == "moldura_indisponivel"


@e2e
def test_catalogo_mostra_posse_e_esconde_rara_desligada(c):
    _rpc(c, A, "SELECT public.moldura_comprar(%s)", "louros")
    _rpc(c, A, "SELECT public.moldura_equipar(%s)", "louros")
    como(c, A)
    linhas = c.execute("SELECT codigo, tenho, equipada, como_ganhar FROM public.molduras_catalogo()").fetchall()
    como(c, None)
    assert len(linhas) == 40
    por = {k: (t, e, g) for k, t, e, g in linhas}
    assert por["louros"][:2] == (True, True)
    assert por["geada"][2] == "Conquista: Uma semana sem parar"
    assert por["estrela_guia"][2] == "Dê uma nota para o TrailUp nas configurações."

    c.execute("SELECT public.molduras_admin_salvar_acao('avaliar_app', false, 'estrela_guia', 'dev')")
    como(c, A)
    codigos = {k for (k,) in c.execute("SELECT codigo FROM public.molduras_catalogo()").fetchall()}
    como(c, None)
    assert "estrela_guia" not in codigos
    assert "louros" in codigos


@e2e
def test_rls_posse_e_so_do_dono(c):
    _rpc(c, A, "SELECT public.moldura_comprar(%s)", "louros")
    c.execute("GRANT USAGE ON SCHEMA public, auth TO authenticated")
    c.execute("BEGIN")
    try:
        c.execute("SET LOCAL ROLE authenticated")
        como(c, B)
        assert c.execute("SELECT count(*) FROM public.moldura_aluno").fetchone()[0] == 0
        assert c.execute("SELECT count(*) FROM public.molduras").fetchone()[0] == 40
        como(c, A)
        assert c.execute("SELECT count(*) FROM public.moldura_aluno").fetchone()[0] == 1
        import psycopg

        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute(
                "INSERT INTO public.moldura_aluno (aluno_id, moldura_codigo, origem) VALUES (%s, 'rubi_real', 'compra')",
                (A,),
            )
    finally:
        c.execute("ROLLBACK")
        como(c, None)


@e2e
def test_downgrade_limpa(c):
    for sql in sql_de(mod, "downgrade"):
        c.execute(sql)
    assert c.execute("SELECT to_regclass('public.molduras')").fetchone()[0] is None
    assert c.execute("SELECT count(*) FROM public.conquistas WHERE tipo LIKE 'moldura\\_%'").fetchone()[0] == 0
