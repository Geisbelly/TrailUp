"""`20261031_02`: com evento de guilda aberto, ninguém entra em guilda da turma (#153).

Duas camadas:

- **estrutura** (roda sempre, sem banco): o SQL offline traz a guarda nas quatro RPCs que põem
  alguém numa guilda, a trava nas duas pontas, e o downgrade volta ao texto de produção;
- **ponta a ponta** (só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL):
  banco descartável com o esqueleto de produção, as RPCs desta migration e a cópia congelada da
  `20261025_04`. Inclui a corrida da issue com duas conexões de verdade, e o mesmo roteiro contra o
  texto anterior, para mostrar que a corrida existia.
"""

from __future__ import annotations

import json
import threading
import time
import uuid

import pytest

from tests.test_migration_conquistas_sem_cascade import (
    DSN,
    ESQUELETO,
    PAPEIS,
    _afrouxa,
    _dsn_para,
    _modulo,
    _sql,
    e2e,
)

ARQUIVO = "20261031_02_guilda_trava_com_evento_aberto.py"
M = _modulo(ARQUIVO)
FORMACAO = ("guilda_criar", "guilda_convidar", "guilda_aceitar_convite", "guilda_entrar")

if DSN:
    import psycopg


# --------------------------------------------------------------------------- estrutura


def _corpo(sql: str, funcao: str) -> str:
    a = sql.index(f"CREATE OR REPLACE FUNCTION public.{funcao}(")
    return sql[a : sql.index("$function$;", a)]


def test_encadeia_depois_da_validacao_das_conquistas() -> None:
    assert (M.revision, M.down_revision) == ("20261031_02", "20261031_01")


def test_as_quatro_rpcs_de_formacao_param_com_evento_aberto() -> None:
    sql = _sql("20261031_01", "20261031_02")
    for funcao in FORMACAO:
        corpo = _corpo(sql, funcao)
        assert "public.fn_guilda_composicao_congelada(" in corpo, funcao
        assert "RAISE EXCEPTION 'guilda_evento_aberto'" in corpo, funcao
        # Depois da janela, antes de gravar membro ou convite.
        assert corpo.index("guilda_janela_fechada") < corpo.index("guilda_evento_aberto"), funcao
        assert corpo.index("guilda_evento_aberto") < corpo.index("INSERT INTO public."), funcao


def test_sair_e_dissolver_nao_mudam() -> None:
    sql = _sql("20261031_01", "20261031_02")
    assert "FUNCTION public.guilda_sair(" not in sql
    assert "FUNCTION public.guilda_dissolver(" not in sql


def test_as_duas_pontas_tomam_a_mesma_trava() -> None:
    sql = _sql("20261031_01", "20261031_02")
    trava = "pg_advisory_xact_lock(hashtext('guilda_composicao:' || p_classe_id::text))"
    helper = _corpo(sql, "fn_guilda_composicao_congelada")
    congelar = _corpo(sql, "fn_guilda_congelar_composicao")
    assert trava in helper
    assert trava in congelar
    # A trava vem antes da leitura, nos dois lados.
    assert helper.index(trava) < helper.index("FROM public.eventos_classe")
    assert congelar.index(trava) < congelar.index("INSERT INTO public.guilda_evento_snapshot")


def test_o_helper_e_interno() -> None:
    sql = _sql("20261031_01", "20261031_02")
    assert (
        "REVOKE ALL ON FUNCTION public.fn_guilda_composicao_congelada(bigint) FROM PUBLIC, anon, authenticated;"
        in sql
    )
    assert "GRANT EXECUTE ON FUNCTION public.fn_guilda_composicao_congelada(bigint) TO service_role;" in sql
    # As RPCs mantêm o EXECUTE de quem já tinha (o conjunto da `20261021_23`).
    for assinatura in (
        "public.guilda_criar(bigint, text, text, text, text, text, text)",
        "public.guilda_convidar(uuid, uuid)",
        "public.guilda_aceitar_convite(uuid)",
        "public.guilda_entrar(uuid)",
    ):
        assert f"REVOKE ALL ON FUNCTION {assinatura} FROM PUBLIC, anon;" in sql, assinatura
        assert f"GRANT EXECUTE ON FUNCTION {assinatura} TO authenticated, service_role;" in sql, assinatura


def test_o_downgrade_volta_ao_texto_anterior() -> None:
    sql = _sql("20261031_02", "20261031_01", down=True)
    assert "guilda_evento_aberto" not in sql
    assert "pg_advisory_xact_lock" not in sql
    assert "DROP FUNCTION IF EXISTS public.fn_guilda_composicao_congelada(bigint)" in sql
    # As três que a `20261021_21` versiona voltam byte a byte ao texto de lá.
    texto_21 = (_modulo("20261021_21_guildas_ciclo_de_vida_no_alembic.py")).VERSIONADAS
    for funcao in ("guilda_convidar", "guilda_aceitar_convite", "guilda_entrar"):
        de_la = _corpo(texto_21, funcao)
        daqui = _corpo(M.FORMACAO_ANTERIOR, funcao)
        assert de_la[de_la.index("AS $function$") :] == daqui[daqui.index("AS $function$") :], funcao


# --------------------------------------------------------------------------- ponta a ponta

PROF, A, B, C = (uuid.UUID(int=i) for i in (11, 21, 22, 23))
G1 = uuid.UUID(int=301)
EVENTO = uuid.UUID(int=901)

# Os helpers de turma/janela/bloqueio não são o objeto do teste: dublês com o mesmo contrato.
DUBLES = """
CREATE OR REPLACE FUNCTION public.guilda_e_colega(p_aluno uuid, p_classe bigint) RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.classe_aluno WHERE aluno_id = p_aluno AND classe_id = p_classe) $$;
CREATE OR REPLACE FUNCTION public.guilda_classe_atual(p bigint) RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT p $$;
CREATE OR REPLACE FUNCTION public.guilda_janela_aberta(p bigint) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.guilda_bloqueio_ativo(a uuid, b uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
-- Os índices únicos que os ON CONFLICT das funções exigem (o esqueleto só traz as PKs).
CREATE UNIQUE INDEX IF NOT EXISTS guilda_convites_pendente_uidx
  ON public.guilda_convites (guilda_id, convidado_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS guilda_evento_snapshot_uidx
  ON public.guilda_evento_snapshot (evento_id, guilda_id, aluno_id);
"""


def _seed() -> str:
    return f"""
INSERT INTO auth.users (id, email) VALUES
  ('{PROF}', 'prof@teste.invalid'), ('{A}', 'a@teste.invalid'), ('{B}', 'b@teste.invalid'), ('{C}', 'c@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof');
INSERT INTO public.alunos (id, nome, email) VALUES
  ('{A}', 'A', 'a@teste.invalid'), ('{B}', 'B', 'b@teste.invalid'), ('{C}', 'C', 'c@teste.invalid');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES (1, 1, '{PROF}', 'T');
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, '{A}'), (1, '{B}'), (1, '{C}');
INSERT INTO public.guildas (id, classe_id, nome, criado_por, limite_membros) VALUES ('{G1}', 1, 'Guilda 1', '{A}', 10);
INSERT INTO public.guilda_membros (guilda_id, classe_id, aluno_id) VALUES ('{G1}', 1, '{A}');
INSERT INTO public.eventos_classe (id, classe_id, titulo, status, inicio, fim, criado_por, modalidade_guilda)
VALUES ('{EVENTO}', 1, 'Maratona', 'rascunho', now(), now() + interval '1 day', '{PROF}', true);
"""


def _instalar(c, *, versao: str) -> None:
    c.execute(PAPEIS)
    c.execute(ESQUELETO.read_text(encoding="utf-8"))
    c.execute(DUBLES)
    for tabela in ("professor", "classe", "materia", "alunos", "guildas", "eventos_classe"):
        _afrouxa(c, tabela)
    if versao == "nova":
        c.execute(M.HELPER)
        c.execute(M.FORMACAO)
        c.execute(M.CONGELAR)
    else:
        c.execute(M.FORMACAO_ANTERIOR)
        c.execute(M.CONGELAR_ANTERIOR)
    c.execute(_seed())


@pytest.fixture(params=["nova"])
def banco(request):
    nome = f"tu153t_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            _instalar(c, versao=request.param)
        yield _dsn_para(nome)
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


@pytest.fixture
def banco_anterior():
    nome = f"tu153a_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(_dsn_para(nome), autocommit=True) as c:
            _instalar(c, versao="anterior")
        yield _dsn_para(nome)
    finally:
        with psycopg.connect(DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _como(c, quem: uuid.UUID | None) -> None:
    sub = str(quem) if quem else ""
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (sub,))
    c.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps({"sub": sub}) if quem else "",))


def _abrir_evento(c) -> None:
    """O que `fn_evento_classe_abrir_agora` faz: marca aberto e tira a cópia, na mesma transação."""
    c.execute("UPDATE public.eventos_classe SET status = 'aberto', aberto_em = now() WHERE id = %s", (EVENTO,))
    c.execute("SELECT public.fn_guilda_congelar_composicao(%s, 1)", (str(EVENTO),))


def _na_copia(c) -> set[uuid.UUID]:
    return {
        r[0]
        for r in c.execute(
            "SELECT aluno_id FROM public.guilda_evento_snapshot WHERE evento_id = %s", (str(EVENTO),)
        ).fetchall()
    }


def _na_guilda(c) -> set[uuid.UUID]:
    return {
        r[0]
        for r in c.execute(
            "SELECT aluno_id FROM public.guilda_membros WHERE guilda_id = %s AND left_at IS NULL", (G1,)
        ).fetchall()
    }


@e2e
def test_sem_evento_aberto_entrar_e_criar_continuam_valendo(banco) -> None:
    with psycopg.connect(banco, autocommit=True) as c:
        _como(c, B)
        c.execute("SELECT public.guilda_entrar(%s)", (G1,))
        _como(c, C)
        c.execute("SELECT public.guilda_criar(1, 'Outra')")
        _como(c, None)
        assert B in _na_guilda(c)


@e2e
def test_com_evento_de_guilda_aberto_as_quatro_recusam(banco) -> None:
    with psycopg.connect(banco, autocommit=True) as c:
        # Um convite pendente, feito antes de o evento abrir.
        _como(c, A)
        c.execute("SELECT public.guilda_convidar(%s, %s)", (G1, C))
        convite = c.execute("SELECT id FROM public.guilda_convites WHERE convidado_id = %s", (C,)).fetchone()[0]
        _como(c, None)
        _abrir_evento(c)

        tentativas = [
            (B, "SELECT public.guilda_entrar(%s)", (G1,)),
            (C, "SELECT public.guilda_aceitar_convite(%s)", (convite,)),
            (A, "SELECT public.guilda_convidar(%s, %s)", (G1, B)),
            (B, "SELECT public.guilda_criar(1, 'Nova')", ()),
        ]
        for quem, sql, args in tentativas:
            _como(c, quem)
            with pytest.raises(psycopg.errors.RaiseException, match="guilda_evento_aberto"):
                c.execute(sql, args)
        _como(c, None)
        assert _na_guilda(c) == {A}
        assert _na_copia(c) == {A}


@e2e
def test_evento_sem_modalidade_de_guilda_nao_trava(banco) -> None:
    with psycopg.connect(banco, autocommit=True) as c:
        c.execute("UPDATE public.eventos_classe SET modalidade_guilda = false, status = 'aberto' WHERE id = %s", (EVENTO,))
        _como(c, B)
        c.execute("SELECT public.guilda_entrar(%s)", (G1,))
        _como(c, None)
        assert B in _na_guilda(c)


@e2e
def test_sair_continua_livre_com_evento_aberto_e_a_copia_nao_muda(banco) -> None:
    with psycopg.connect(banco, autocommit=True) as c:
        _abrir_evento(c)
        # `guilda_sair` não é desta migration; o corpo de produção marca `left_at`.
        c.execute("UPDATE public.guilda_membros SET left_at = now() WHERE guilda_id = %s AND aluno_id = %s", (G1, A))
        assert _na_copia(c) == {A}


@e2e
def test_encerrado_o_evento_a_turma_volta_a_se_reorganizar(banco) -> None:
    with psycopg.connect(banco, autocommit=True) as c:
        _abrir_evento(c)
        c.execute("UPDATE public.eventos_classe SET status = 'encerrado' WHERE id = %s", (EVENTO,))
        _como(c, B)
        c.execute("SELECT public.guilda_entrar(%s)", (G1,))
        _como(c, None)
        assert B in _na_guilda(c)


def _corrida_entrada_primeiro(dsn: str) -> tuple[set[uuid.UUID], set[uuid.UUID]]:
    """B entra na guilda e NÃO confirma; enquanto isso a abertura tira a cópia; depois B confirma."""
    entrada = psycopg.connect(dsn)
    abertura = psycopg.connect(dsn)
    try:
        _como(entrada, B)
        entrada.execute("SELECT public.guilda_entrar(%s)", (G1,))  # transação aberta

        def abrir() -> None:
            _abrir_evento(abertura)
            abertura.commit()

        t = threading.Thread(target=abrir)
        t.start()
        time.sleep(0.5)  # a abertura chega à cópia enquanto a entrada ainda não confirmou
        entrada.commit()
        t.join(timeout=10)
        assert not t.is_alive()
        with psycopg.connect(dsn, autocommit=True) as c:
            return _na_guilda(c), _na_copia(c)
    finally:
        entrada.close()
        abertura.close()


@e2e
def test_corrida_entrada_antes_da_copia_entra_na_copia(banco) -> None:
    na_guilda, na_copia = _corrida_entrada_primeiro(banco)
    assert na_guilda == {A, B}
    assert na_copia == {A, B}, "a cópia esperou a entrada confirmar e a viu"


@e2e
def test_corrida_antes_desta_migration_deixava_membro_fora_da_copia(banco_anterior) -> None:
    """O defeito que a trava fecha: mesmo roteiro, texto anterior. B fica na guilda e fora da cópia."""
    na_guilda, na_copia = _corrida_entrada_primeiro(banco_anterior)
    assert na_guilda == {A, B}
    assert na_copia == {A}


@e2e
def test_corrida_copia_antes_da_entrada_recusa_a_entrada(banco) -> None:
    abertura = psycopg.connect(banco)
    entrada = psycopg.connect(banco, autocommit=True)
    erro: list[BaseException] = []
    try:
        _abrir_evento(abertura)  # transação aberta, com a trava da turma
        _como(entrada, B)

        def entrar() -> None:
            try:
                entrada.execute("SELECT public.guilda_entrar(%s)", (G1,))
            except BaseException as e:  # noqa: BLE001 - o erro é o resultado esperado
                erro.append(e)

        t = threading.Thread(target=entrar)
        t.start()
        time.sleep(0.5)
        assert t.is_alive(), "a entrada esperou a trava da abertura"
        abertura.commit()
        t.join(timeout=10)
        assert erro and "guilda_evento_aberto" in str(erro[0])
        with psycopg.connect(banco, autocommit=True) as c:
            assert _na_guilda(c) == {A}
            assert _na_copia(c) == {A}
    finally:
        abertura.close()
        entrada.close()


# --------------------------------------------------------------------------- uma guilda por aluno no evento

G2, G3 = uuid.UUID(int=302), uuid.UUID(int=303)


def test_a_copia_poe_cada_aluno_em_uma_guilda_so() -> None:
    sql = _sql("20261031_01", "20261031_02")
    congelar = _corpo(sql, "fn_guilda_congelar_composicao")
    assert "SELECT DISTINCT ON (m.aluno_id)" in congelar
    assert "ORDER BY m.aluno_id, m.joined_at, g.id" in congelar
    # A posição dentro da guilda é contada depois de escolher a guilda do aluno.
    assert congelar.index("DISTINCT ON") > congelar.index("row_number() OVER (PARTITION BY x.guilda_id")


@e2e
def test_aluno_em_duas_guildas_entra_na_copia_so_pela_primeira(banco) -> None:
    """A entrou na G1 (seed) e depois na G2; B entrou na G2 e depois na G1; C só na G3.
    Na cópia: A só na G1, B só na G2, C na G3 — e as posições recomeçam em cada guilda."""
    with psycopg.connect(banco, autocommit=True) as c:
        c.execute(
            "INSERT INTO public.guildas (id, classe_id, nome, criado_por, limite_membros) VALUES "
            "(%s, 1, 'Guilda 2', %s, 10), (%s, 1, 'Guilda 3', %s, 10)",
            (G2, B, G3, C),
        )
        c.execute("UPDATE public.guilda_membros SET joined_at = now() - interval '5 hour' WHERE aluno_id = %s", (A,))
        c.execute(
            "INSERT INTO public.guilda_membros (guilda_id, classe_id, aluno_id, joined_at) VALUES "
            "(%s, 1, %s, now() - interval '4 hour'), "  # B na G2 primeiro
            "(%s, 1, %s, now() - interval '3 hour'), "  # A na G2 depois
            "(%s, 1, %s, now() - interval '2 hour'), "  # B na G1 depois
            "(%s, 1, %s, now() - interval '1 hour')",  # C só na G3
            (G2, B, G2, A, G1, B, G3, C),
        )
        _abrir_evento(c)
        copia = c.execute(
            "SELECT aluno_id, guilda_id, posicao FROM public.guilda_evento_snapshot WHERE evento_id = %s",
            (str(EVENTO),),
        ).fetchall()
        assert sorted(copia) == sorted([(A, G1, 1), (B, G2, 1), (C, G3, 1)])
        # Fora do evento nada muda: A e B continuam membros das duas guildas.
        assert _na_guilda(c) == {A, B}


@e2e
def test_empate_de_entrada_decide_pelo_id_da_guilda(banco) -> None:
    with psycopg.connect(banco, autocommit=True) as c:
        c.execute(
            "INSERT INTO public.guildas (id, classe_id, nome, criado_por, limite_membros) VALUES (%s, 1, 'G2', %s, 10)",
            (G2, B),
        )
        instante = c.execute("SELECT joined_at FROM public.guilda_membros WHERE aluno_id = %s", (A,)).fetchone()[0]
        c.execute(
            "INSERT INTO public.guilda_membros (guilda_id, classe_id, aluno_id, joined_at) VALUES (%s, 1, %s, %s)",
            (G2, A, instante),
        )
        _abrir_evento(c)
        guildas = {
            r[0]
            for r in c.execute(
                "SELECT guilda_id FROM public.guilda_evento_snapshot WHERE evento_id = %s AND aluno_id = %s",
                (str(EVENTO), A),
            ).fetchall()
        }
        assert guildas == {min(G1, G2)}
