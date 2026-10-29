"""Ponta a ponta da `20261029_06`: o aluno não grava `criado_em` nem altera o próprio evento depois de gravado.

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria um
banco descartável com o ESQUELETO do schema public da produção e os privilégios que o Supabase dá por
padrão (toda tabela e função nova de `public` nasce com tudo para `anon`/`authenticated`), e monta
`eventos_aluno` como a produção a tem:

- RLS ligada, com as policies de posse da `20260826_09` (`_sel`, `_upd`) e a de INSERT da `20260909_03`
  (o aluno não se dá presença);
- o gatilho de valor REAL da `20261021_06` (aposta, piso, atraso), com os dois gatilhos da
  `20260909_05` (`_valor_ins` em INSERT; `_valor_upd` em `UPDATE OF valor, tipo`), e o que ele chama:
  `fn_eventos_aluno_resolve_classe_id`/`fn_evento_de_conclusao` (`20261003_01`),
  `fn_evento_creditado` (`20261025_01`), `fn_pontos_do_evento` (`20260909_05`) e os leitores da
  aposta e do piso (`20261021_06`).

Divergência conhecida: na PRODUÇÃO `trg_eventos_aluno_valor_upd` é `BEFORE UPDATE` sem lista de
colunas, enquanto o repositório (`20260909_05`) diz `BEFORE UPDATE OF valor, tipo`. Aqui vale o do
repositório, recortado de lá. Para esta trava a diferença não pesa: ela recusa o UPDATE do cliente
antes de qualquer gatilho de valor, qualquer que seja a lista de colunas dele.

`fn_fator_de_atraso` é schema não versionado (`docs/architecture/schema-nao-versionado.md`), sem fonte
no git. Aqui ela é um dublê que só olha o argumento que importa, o instante julgado: evento de mais de
um dia atrás é "atrasado" e vale metade. É o suficiente para ver de qual data o gatilho de valor parte.

O papel de cliente é de verdade: `SET LOCAL ROLE authenticated` + claims (e `request.jwt.claim.sub`,
que é o que o `auth.uid()` do esqueleto lê). Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager
from datetime import timedelta

import pytest

DSN = os.environ.get("TRAILUP_E2E_RETENCAO_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

if DSN:
    import psycopg

    if any(h in DSN for h in ("supabase.co", "supabase.com", "pooler.")):
        raise RuntimeError("e2e da trava de eventos_aluno recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402
from tests import test_e2e_invariantes_das_metricas as inv  # noqa: E402

M_POSSE = base._modulo("20260826_09_rls_posse_por_tabela.py")
M_PRESENCA = base._modulo("20260909_03_presenca_concedida.py")
M_PONTUACAO = base._modulo("20260909_05_pontuacao_decidida_pelo_banco.py")
M_CREDITADO = base._modulo("20261025_01_pontos_do_evento_no_rank.py")
M_VALOR = base.M_GATILHO  # 20261021_06
M_REF = base.M_REF  # 20261003_01
M_TRAVA = base._modulo("20261029_06_eventos_aluno_trava_do_cliente.py")

# Os dois gatilhos de valor, recortados de onde nasceram (a `20261021_06` só troca a função).
GATILHO_VALOR_INS = base._trecho(
    "20260909_05_pontuacao_decidida_pelo_banco.py",
    "CREATE TRIGGER trg_eventos_aluno_valor_ins",
    "EXECUTE FUNCTION public.trg_eventos_aluno_valor_do_banco();",
)
GATILHO_VALOR_UPD = base._trecho(
    "20260909_05_pontuacao_decidida_pelo_banco.py",
    "CREATE TRIGGER trg_eventos_aluno_valor_upd",
    "EXECUTE FUNCTION public.trg_eventos_aluno_valor_do_banco();",
)
assert "BEFORE UPDATE OF valor, tipo" in GATILHO_VALOR_UPD

# Dublê de `fn_fator_de_atraso` (sem fonte no git): só o instante julgado decide.
FATOR_DE_ATRASO = """
CREATE OR REPLACE FUNCTION public.fn_fator_de_atraso(p_aluno uuid, p_referencia text, p_quando timestamptz)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_quando < now() - interval '1 day' THEN 0.5 ELSE 1 END::numeric
$$;
"""

SEQUENCIA = "public.eventos_aluno_id_seq"

PROF, A, B = (uuid.UUID(int=i) for i in (11, 21, 22))
PONTOS = 10  # preço de `atividade_concluida` neste banco


def _seed() -> str:
    return f"""
INSERT INTO auth.users (id, email) VALUES
  ('{PROF}', 'prof@teste.invalid'), ('{A}', 'a@teste.invalid'), ('{B}', 'b@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof');
INSERT INTO public.alunos (id, nome, email) VALUES ('{A}', 'A', 'a@teste.invalid'), ('{B}', 'B', 'b@teste.invalid');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES (1, 1, '{PROF}', 'A');
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, '{A}'), (1, '{B}');
INSERT INTO public.eventos_pontuacao (tipo, pontos) VALUES ('atividade_concluida', {PONTOS});
"""


def _policies_de_eventos_aluno() -> list[str]:
    """As policies da `20260826_09` só para `eventos_aluno` (o laço dela cobre oito tabelas)."""
    sql = [s for s in base._sql_de(M_POSSE, "upgrade") if 'ON "eventos_aluno"' in s]
    assert any("eventos_aluno_posse_upd" in s for s in sql)
    return sql


@contextmanager
def _banco(aplica_trava: bool = True, sequencia_fechada: bool = False):
    nome = f"tu_trv_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(base.DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(base._dsn_para(nome), autocommit=True) as c:
            c.execute(base.PAPEIS)
            c.execute(inv.GRANTS_SUPABASE)
            c.execute(base.ESQUELETO.read_text(encoding="utf-8"))
            for tabela in ("professor", "classe", "materia"):
                base._afrouxa(c, tabela)
            c.execute(M_POSSE.HELPERS)
            c.execute("ALTER TABLE public.eventos_aluno ENABLE ROW LEVEL SECURITY")
            for sql in _policies_de_eventos_aluno():
                c.execute(sql)
            c.execute(M_CREDITADO.CREDITADO)
            c.execute(M_PRESENCA.POLICY_INSERT)
            c.execute(
                "CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_referencia_id(p text) RETURNS bigint "
                "LANGUAGE sql IMMUTABLE AS $$ SELECT NULL::bigint $$"
            )
            for sql in base._sql_de(M_REF, "upgrade"):
                c.execute(sql)
            c.execute(M_PONTUACAO.FUNCAO)
            c.execute(M_VALOR.LEITORES)
            c.execute(FATOR_DE_ATRASO)
            c.execute(M_VALOR.GATILHO)
            c.execute(GATILHO_VALOR_INS)
            c.execute(GATILHO_VALOR_UPD)
            c.execute(_seed())
            if sequencia_fechada:
                # Papel só com INSERT na tabela: o default IDENTITY não confere privilégio na
                # sequência, um `nextval()` explícito confere. (As default privileges do Supabase,
                # acima, dão ALL ON SEQUENCES e esconderiam a dependência.)
                c.execute(f"REVOKE ALL ON SEQUENCE {SEQUENCIA} FROM authenticated, anon")
            if aplica_trava:
                for sql in base._sql_de(M_TRAVA, "upgrade"):
                    c.execute(sql)
            yield c
    finally:
        with psycopg.connect(base.DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _como_cliente(c, uid: uuid.UUID, papel: str = "authenticated") -> None:
    c.execute(f"SET LOCAL ROLE {papel}")
    c.execute("SELECT set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(uid), "role": papel}),))
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, true)", (str(uid),))


def _agora_utc(c):
    return c.execute("SELECT now() AT TIME ZONE 'UTC'").fetchone()[0]


def _linha(c, eid: int) -> tuple:
    return c.execute(
        "SELECT referencia, criado_em, valor, idempotencia_key FROM public.eventos_aluno WHERE id = %s", (eid,)
    ).fetchone()


def _cliente_insere(c, uid: uuid.UUID, tipo: str, referencia: str, dias_atras: int) -> int:
    with c.transaction():
        _como_cliente(c, uid)
        return c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em) "
            "VALUES (%s, %s, %s, 999, (now() AT TIME ZONE 'UTC') - make_interval(days => %s)) RETURNING id",
            (uid, tipo, referencia, dias_atras),
        ).fetchone()[0]


def _servidor_insere(c, uid: uuid.UUID, tipo: str, referencia: str, horas_atras: int) -> int:
    """Seed como o dono (`postgres`): é o caminho do servidor, a trava não se aplica."""
    return c.execute(
        "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, criado_em) "
        "VALUES (%s, %s, %s, (now() AT TIME ZONE 'UTC') - make_interval(hours => %s)) RETURNING id",
        (uid, tipo, referencia, horas_atras),
    ).fetchone()[0]


def _repetida_valendo_zero(c) -> tuple[int, int]:
    """Duas conclusões da mesma atividade: a primeira paga, a repetida grava com valor 0."""
    primeira = _servidor_insere(c, A, "atividade_concluida", "classe:1:atividade:7", 2)
    repetida = _servidor_insere(c, A, "atividade_concluida", "classe:1:atividade:7", 1)
    assert _linha(c, primeira)[2] == PONTOS
    assert _linha(c, repetida)[2] == 0
    return primeira, repetida


def _cliente_atualiza_repetida(c, repetida: int) -> int:
    with c.transaction():
        _como_cliente(c, A)
        cur = c.execute(
            "UPDATE public.eventos_aluno SET referencia = 'classe:1:atividade:8', valor = 999, "
            "criado_em = '2020-01-01', idempotencia_key = %s WHERE id = %s",
            (uuid.UUID(int=77), repetida),
        )
        return cur.rowcount


# --------------------------------------------------------------------------------------------------
# Controle: sem a trava, o defeito existe neste banco (o teste enxerga o que corrige)
# --------------------------------------------------------------------------------------------------
def test_controle_sem_a_trava_o_aluno_data_o_evento_e_recebe_de_novo():
    with _banco(aplica_trava=False) as c:
        agora = _agora_utc(c)
        eid = _cliente_insere(c, A, "atividade_concluida", "classe:1:atividade:30", 30)
        _, criado_em, valor, _ = _linha(c, eid)
        assert agora - criado_em > timedelta(days=29)
        assert valor == PONTOS * 0.5  # o atraso foi julgado pela data que o cliente mandou

        _, repetida = _repetida_valendo_zero(c)
        assert _cliente_atualiza_repetida(c, repetida) == 1
        referencia, criado_em, valor, _ = _linha(c, repetida)
        assert referencia == "classe:1:atividade:8"
        assert criado_em.year == 2020
        # A conclusão repetida passou a pagar, e com o atraso julgado pela data que o aluno escolheu.
        assert valor == PONTOS * 0.5


# --------------------------------------------------------------------------------------------------
# A trava
# --------------------------------------------------------------------------------------------------
def test_aluno_insere_com_data_passada_e_grava_agora():
    with _banco() as c:
        eid = _cliente_insere(c, A, "topico_iniciado", "classe:1:topico:1", 30)
        _, criado_em, _, _ = _linha(c, eid)
        assert abs(_agora_utc(c) - criado_em) < timedelta(seconds=5)


def test_insert_sem_data_continua_igual_ao_default():
    with _banco() as c:
        with c.transaction():
            _como_cliente(c, A)
            eid, agora = c.execute(
                "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia) "
                "VALUES (%s, 'topico_iniciado', 'classe:1:topico:2') RETURNING id, now() AT TIME ZONE 'UTC'",
                (A,),
            ).fetchone()
        assert _linha(c, eid)[1] == agora


def test_fuso_da_sessao_nao_desloca_a_data():
    """O PostgREST aceita `Prefer: timezone=...`, que vira `SET LOCAL timezone`. `now()` gravado direto
    numa coluna sem fuso cairia na hora local; a trava grava o instante em UTC, como o resto do banco lê."""
    with _banco() as c:
        with c.transaction():
            c.execute("SET LOCAL TIME ZONE 'America/Sao_Paulo'")
            _como_cliente(c, A)
            eid = c.execute(
                "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, criado_em) "
                "VALUES (%s, 'topico_iniciado', 'classe:1:topico:3', '2020-01-01') RETURNING id",
                (A,),
            ).fetchone()[0]
        assert abs(_agora_utc(c) - _linha(c, eid)[1]) < timedelta(seconds=5)


RECUSA = "não altera evento depois de gravado"


def _valores(c) -> list[tuple[int, int]]:
    return [
        (i, int(v))
        for i, v in c.execute(
            "SELECT id, valor FROM public.eventos_aluno WHERE aluno_id = %s AND tipo = 'atividade_concluida' "
            "ORDER BY id",
            (A,),
        ).fetchall()
    ]


def test_aluno_nao_troca_referencia_nem_data_no_update():
    """Nenhum cliente faz UPDATE em `eventos_aluno` (medido no app), então o UPDATE do cliente é recusado
    inteiro, com 42501 -- e não congelado em silêncio."""
    with _banco() as c:
        _, repetida = _repetida_valendo_zero(c)
        antes = _linha(c, repetida)

        with pytest.raises(psycopg.errors.InsufficientPrivilege, match=RECUSA):
            _cliente_atualiza_repetida(c, repetida)

        assert _linha(c, repetida) == antes
        assert antes[2] == 0  # a repetida continua sem pagar


def test_update_simples_de_data_ou_referencia_e_recusado():
    with _banco() as c:
        eid = _servidor_insere(c, A, "topico_iniciado", "classe:1:topico:9", 1)
        antes = _linha(c, eid)
        for sets in ("criado_em = '2020-01-01'", "referencia = 'classe:1:topico:10'", "idempotencia_key = gen_random_uuid()"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege, match=RECUSA):
                with c.transaction():
                    _como_cliente(c, A)
                    c.execute(f"UPDATE public.eventos_aluno SET {sets} WHERE id = %s", (eid,))
        assert _linha(c, eid) == antes


def test_lote_e_troca_de_id_nao_paga_duas_vezes():
    """Variante 1 do review. No mesmo INSERT as duas linhas têm o mesmo `criado_em` (a trava), e a dedup
    do UPDATE desempata por `(criado_em, id)`: baixar o `id` da repetida a tornava "a primeira"."""
    with _banco() as c:
        with c.transaction():
            _como_cliente(c, A)
            ids = [
                i
                for (i,) in c.execute(
                    "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia) VALUES "
                    "(%s, 'atividade_concluida', 'classe:1:atividade:7'), "
                    "(%s, 'atividade_concluida', 'classe:1:atividade:7') RETURNING id",
                    (A, A),
                ).fetchall()
            ]
        assert _valores(c) == [(ids[0], PONTOS), (ids[1], 0)]

        with pytest.raises(psycopg.errors.InsufficientPrivilege, match=RECUSA):
            with c.transaction():
                _como_cliente(c, A)
                c.execute("UPDATE public.eventos_aluno SET id = -1, valor = 1 WHERE id = %s", (ids[1],))

        assert _valores(c) == [(ids[0], PONTOS), (ids[1], 0)]


def test_id_explicito_negativo_nao_paga_duas_vezes():
    """Variante 2 do review: a repetida nascia com `id` menor que a original e, num UPDATE com `valor`,
    a dedup a lia como a primeira. Agora o `id` pedido nem é gravado, e o UPDATE é recusado."""
    with _banco() as c:
        with c.transaction():
            _como_cliente(c, A)
            original = c.execute(
                "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia) "
                "VALUES (%s, 'atividade_concluida', 'classe:1:atividade:7') RETURNING id",
                (A,),
            ).fetchone()[0]
            repetida = c.execute(
                "INSERT INTO public.eventos_aluno (id, aluno_id, tipo, referencia) "
                "VALUES (-5, %s, 'atividade_concluida', 'classe:1:atividade:7') RETURNING id",
                (A,),
            ).fetchone()[0]
        assert repetida > original  # o -5 não foi aceito: a repetida segue a original
        assert _valores(c) == [(original, PONTOS), (repetida, 0)]

        with pytest.raises(psycopg.errors.InsufficientPrivilege, match=RECUSA):
            with c.transaction():
                _como_cliente(c, A)
                c.execute("UPDATE public.eventos_aluno SET id = -5, valor = 1 WHERE id = %s", (repetida,))

        assert _valores(c) == [(original, PONTOS), (repetida, 0)]


def test_upsert_pela_pk_nao_alcanca_a_linha_existente():
    """`INSERT ... ON CONFLICT (id) DO UPDATE` (o `Prefer: resolution=merge-duplicates` do PostgREST):
    como o `id` do cliente sai da sequência antes do teste de conflito, a PK nunca casa com a linha
    alheia. Vira um INSERT novo, e a linha que existia fica intocada."""
    with _banco() as c:
        _, repetida = _repetida_valendo_zero(c)
        antes = _linha(c, repetida)

        with c.transaction():
            _como_cliente(c, A)
            novo = c.execute(
                "INSERT INTO public.eventos_aluno (id, aluno_id, tipo, referencia) "
                "VALUES (%s, %s, 'atividade_concluida', 'classe:1:atividade:8') "
                "ON CONFLICT (id) DO UPDATE SET referencia = EXCLUDED.referencia, valor = 1 RETURNING id",
                (repetida, A),
            ).fetchone()[0]

        assert novo != repetida
        assert _linha(c, repetida) == antes


def test_upsert_que_cai_no_update_e_recusado():
    """Se houver chave única que o cliente alcance, o ramo de UPDATE do upsert passa pelo mesmo gatilho.

    A PK não serve mais para chegar lá (teste acima). A chave que o cliente alcança é a da produção,
    `eventos_aluno_idempotencia_unico` = UNIQUE (idempotencia_key) WHERE idempotencia_key IS NOT NULL
    (sem fonte no git; o esqueleto só traz PK/UNIQUE de constraint). O índice abaixo a espelha, com o
    mesmo predicado -- e o `ON CONFLICT` o repete, como o índice parcial exige."""
    with _banco() as c:
        c.execute(
            "CREATE UNIQUE INDEX eventos_aluno_idempotencia_unico ON public.eventos_aluno (idempotencia_key) "
            "WHERE idempotencia_key IS NOT NULL"
        )
        chave = uuid.UUID(int=55)
        c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, idempotencia_key) "
            "VALUES (%s, 'atividade_concluida', 'classe:1:atividade:40', %s)",
            (A, chave),
        )
        eid = c.execute("SELECT id FROM public.eventos_aluno WHERE idempotencia_key = %s", (chave,)).fetchone()[0]
        antes = _linha(c, eid)

        with pytest.raises(psycopg.errors.InsufficientPrivilege, match=RECUSA):
            with c.transaction():
                _como_cliente(c, A)
                c.execute(
                    "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, idempotencia_key) "
                    "VALUES (%s, 'atividade_concluida', 'classe:1:atividade:41', %s) "
                    "ON CONFLICT (idempotencia_key) WHERE idempotencia_key IS NOT NULL "
                    "DO UPDATE SET referencia = EXCLUDED.referencia",
                    (A, chave),
                )

        assert _linha(c, eid) == antes


def test_update_do_servidor_continua_passando():
    """RPC `SECURITY DEFINER` e `service_role` não são cliente: o UPDATE deles passa."""
    with _banco() as c:
        eid = _servidor_insere(c, A, "topico_iniciado", "classe:1:topico:11", 1)
        c.execute(
            """
            CREATE FUNCTION public.teste_rpc_corrige(p_id bigint) RETURNS void
            LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
              UPDATE public.eventos_aluno SET criado_em = '2026-01-01', referencia = 'classe:1:topico:12'
               WHERE id = p_id;
            $$;
            """
        )
        with c.transaction():
            _como_cliente(c, PROF)
            c.execute("SELECT public.teste_rpc_corrige(%s)", (eid,))
        referencia, criado_em, _, _ = _linha(c, eid)
        assert (referencia, criado_em.date().isoformat()) == ("classe:1:topico:12", "2026-01-01")

        with c.transaction():
            c.execute("SET LOCAL ROLE service_role")
            c.execute("UPDATE public.eventos_aluno SET referencia = 'classe:1:topico:13' WHERE id = %s", (eid,))
        assert _linha(c, eid)[0] == "classe:1:topico:13"


def test_rpc_do_servidor_preserva_criado_em_retroativo():
    """Review Focus 1: `avaliar_entrega` grava a data da entrega e a presença, a data da aula.

    As claims continuam `authenticated` dentro da RPC; o que muda é o `current_user`, que vira o dono.
    Por isso a trava decide pelo `current_user`."""
    with _banco() as c:
        c.execute(
            """
            CREATE FUNCTION public.teste_rpc_retroativa(p_aluno uuid)
            RETURNS TABLE (quem text, papel_nas_claims text)
            LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
            BEGIN
              INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, concedido_por)
              VALUES (p_aluno, 'presenca_aula', 'classe:1:aula:9', 7,
                      (now() AT TIME ZONE 'UTC') - interval '3 days', auth.uid());
              INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, criado_em)
              VALUES (p_aluno, 'atividade_concluida', 'classe:1:atividade:20',
                      (now() AT TIME ZONE 'UTC') - interval '3 days');
              RETURN QUERY SELECT current_user::text,
                                  current_setting('request.jwt.claims', true)::jsonb ->> 'role';
            END $$;
            """
        )
        assert c.execute("SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE proname = 'teste_rpc_retroativa'").fetchone()[0] == "postgres"
        with c.transaction():
            _como_cliente(c, PROF)
            quem, papel = c.execute("SELECT * FROM public.teste_rpc_retroativa(%s)", (A,)).fetchone()
        assert (quem, papel) == ("postgres", "authenticated")

        agora = _agora_utc(c)
        linhas = c.execute(
            "SELECT tipo, criado_em, valor FROM public.eventos_aluno WHERE aluno_id = %s "
            "AND referencia IN ('classe:1:aula:9', 'classe:1:atividade:20') ORDER BY tipo",
            (A,),
        ).fetchall()
        assert [t for t, _, _ in linhas] == ["atividade_concluida", "presenca_aula"]
        for _, criado_em, _ in linhas:
            assert abs((agora - criado_em) - timedelta(days=3)) < timedelta(seconds=5)
        valores = {t: v for t, _, v in linhas}
        assert valores["presenca_aula"] == 7
        assert valores["atividade_concluida"] == PONTOS * 0.5  # o atraso julga a data que a RPC informou


def test_service_role_direto_nao_e_travado():
    """A API escreve como `service_role`; não é cliente."""
    with _banco() as c:
        with c.transaction():
            c.execute("SET LOCAL ROLE service_role")
            eid = c.execute(
                "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, criado_em) "
                "VALUES (%s, 'topico_iniciado', 'classe:1:topico:4', (now() AT TIME ZONE 'UTC') - interval '3 days') "
                "RETURNING id",
                (A,),
            ).fetchone()[0]
        assert _agora_utc(c) - _linha(c, eid)[1] > timedelta(days=2)


def test_fator_de_atraso_ve_a_data_travada():
    """O gatilho de valor tem de ver a data JÁ travada. É a ordem de nome que garante isso, e o
    controle no fim mostra que ela importa: com a trava renomeada para depois, o atraso volta a
    julgar a data do cliente, mesmo com a data gravada certa."""
    with _banco() as c:
        antes = c.execute(
            "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.eventos_aluno'::regclass "
            "AND NOT tgisinternal AND (tgtype & 2) = 2 ORDER BY tgname"
        ).fetchall()
        assert [n for (n,) in antes] == [
            "trg_eventos_aluno_a_trava_cliente",
            "trg_eventos_aluno_valor_ins",
            "trg_eventos_aluno_valor_upd",
        ]

        eid = _cliente_insere(c, A, "atividade_concluida", "classe:1:atividade:30", 30)
        assert _linha(c, eid)[2] == PONTOS

        c.execute(
            "ALTER TRIGGER trg_eventos_aluno_a_trava_cliente ON public.eventos_aluno "
            "RENAME TO trg_eventos_aluno_z_trava_cliente"
        )
        fora_de_ordem = _cliente_insere(c, A, "atividade_concluida", "classe:1:atividade:31", 30)
        _, criado_em, valor, _ = _linha(c, fora_de_ordem)
        assert abs(_agora_utc(c) - criado_em) < timedelta(seconds=5)
        assert valor == PONTOS * 0.5


def test_id_do_cliente_sai_da_sequencia():
    """O cliente escolhia o `id` (`GENERATED BY DEFAULT`). Um `id` à frente da sequência fazia o INSERT
    seguinte de qualquer um -- servidor incluído -- bater na PK quando a sequência chegasse nele."""
    with _banco() as c:
        seq = c.execute("SELECT pg_get_serial_sequence('public.eventos_aluno', 'id')").fetchone()[0]
        assert seq == SEQUENCIA  # o nome que a migration usa no GRANT
        proximo = c.execute(
            f"SELECT CASE WHEN is_called THEN last_value + 1 ELSE last_value END FROM {seq}"
        ).fetchone()[0]
        # Um à frente do próximo: o segundo INSERT padrão do servidor cairia nele. (Pedir o próprio
        # `proximo` não serviria de prova: a sequência o daria de qualquer jeito.)
        a_frente = proximo + 1

        with c.transaction():
            _como_cliente(c, A)
            devolvido = c.execute(
                "INSERT INTO public.eventos_aluno (id, aluno_id, tipo, referencia) "
                "VALUES (%s, %s, 'topico_iniciado', 'classe:1:topico:20') RETURNING id",
                (a_frente, A),
            ).fetchone()[0]

        # O servidor, com id padrão, não colide (como `postgres` e como `service_role`). Sem a trava,
        # o primeiro destes recebe da sequência exatamente o id que o cliente ocupou.
        for papel in (None, "service_role"):
            with c.transaction():
                if papel:
                    c.execute(f"SET LOCAL ROLE {papel}")
                c.execute(
                    "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia) "
                    "VALUES (%s, 'topico_iniciado', 'classe:1:topico:21')",
                    (A,),
                )

        # O mobile faz `.insert().select().single()`: a linha volta, com o id que o banco deu.
        assert devolvido == proximo != a_frente
        assert c.execute("SELECT count(*) FROM public.eventos_aluno WHERE id = %s", (devolvido,)).fetchone()[0] == 1
        assert c.execute(
            "SELECT aluno_id FROM public.eventos_aluno WHERE id = %s", (a_frente,)
        ).fetchone()[0] == A  # o id que o cliente pediu ficou com uma linha do servidor
        assert c.execute(
            "SELECT referencia FROM public.eventos_aluno WHERE id = %s", (a_frente,)
        ).fetchone()[0] == "classe:1:topico:21"


def test_servidor_mantem_o_id_que_informa():
    with _banco() as c:
        eid = c.execute(
            "INSERT INTO public.eventos_aluno (id, aluno_id, tipo, referencia) "
            "VALUES (900000, %s, 'topico_iniciado', 'classe:1:topico:22') RETURNING id",
            (A,),
        ).fetchone()[0]
        assert eid == 900000


def _cliente_insere_padrao(c, referencia: str) -> int:
    with c.transaction():
        _como_cliente(c, A)
        return c.execute(
            "INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia) "
            "VALUES (%s, 'topico_iniciado', %s) RETURNING id",
            (A, referencia),
        ).fetchone()[0]


def test_controle_sem_usage_o_default_identity_insere():
    """A premissa: sem privilégio na sequência, o INSERT pelo default IDENTITY passa."""
    with _banco(aplica_trava=False, sequencia_fechada=True) as c:
        assert not c.execute(f"SELECT has_sequence_privilege('authenticated', '{SEQUENCIA}', 'USAGE')").fetchone()[0]
        assert _cliente_insere_padrao(c, "classe:1:topico:30") > 0


def test_migration_concede_usage_na_sequencia_que_a_trava_usa():
    """O `nextval()` da trava confere privilégio; o default não conferia. A migration concede USAGE."""
    with _banco(sequencia_fechada=True) as c:
        assert _cliente_insere_padrao(c, "classe:1:topico:31") > 0
        assert c.execute(f"SELECT has_sequence_privilege('authenticated', '{SEQUENCIA}', 'USAGE')").fetchone()[0]
