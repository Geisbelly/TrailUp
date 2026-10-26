"""Ponta a ponta da `20261025_04` (o evento abre e encerra sozinho no horário, #141).

Roda só com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL. Cada teste cria um
banco descartável com o ESQUELETO do schema public da produção, instala a apuração inteira como a
`20261025_03` a deixa (mesma montagem do e2e da #153), a guarda de estado do evento
(`20261017_01`/`20261017_09`), as funções de posse (`20260826_09`) e o que a `20261025_04` emite no
`upgrade()`. Sem `pg_cron` no banco local, a varredura é chamada como o job a chamaria:
`SELECT public.fn_eventos_classe_varrer()`, numa conexão SEM sessão de usuário.

Dados sintéticos. Recusa banco hospedado.
"""

from __future__ import annotations

import json
import os
import threading
import time
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
        raise RuntimeError("e2e do evento no horario recusa banco hospedado: use um Postgres local")

from tests import test_e2e_guilda_mantem_quem_saiu_da_turma as base  # noqa: E402

M_HORARIO = base._modulo("20261025_04_evento_abre_e_encerra_no_horario.py")

POSSE = base._trecho(
    "20260826_09_rls_posse_por_tabela.py",
    "CREATE OR REPLACE FUNCTION public.app_classes_do_professor()",
    "$$;",
)
GUARDA = base._trecho(
    "20261017_09_evento_medalhas.py",
    "CREATE OR REPLACE FUNCTION public.fn_eventos_classe_guarda()",
    "$function$;",
)
GUARDA_TRIGGER = base._trecho(
    "20261017_01_eventos_classe_tabela.py",
    "CREATE TRIGGER trg_eventos_classe_guarda",
    "EXECUTE FUNCTION public.fn_eventos_classe_guarda();",
)

PROF, OUTRO, A, B = (uuid.UUID(int=i) for i in (11, 12, 21, 22))
G1 = uuid.UUID(int=301)


def _seed() -> str:
    return f"""
INSERT INTO auth.users (id, email) VALUES
  ('{PROF}', 'prof@teste.invalid'), ('{OUTRO}', 'outro@teste.invalid'),
  ('{A}', 'a@teste.invalid'), ('{B}', 'b@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{PROF}', 'Prof'), ('{OUTRO}', 'Outro');
INSERT INTO public.alunos (id, nome, email) VALUES ('{A}', 'A', 'a@teste.invalid'), ('{B}', 'B', 'b@teste.invalid');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Mat');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES (1, 1, '{PROF}', 'A');
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (1, '{A}'), (1, '{B}');
INSERT INTO public.guildas (id, classe_id, nome, criado_por) VALUES ('{G1}', 1, 'Guilda 1', '{A}');
INSERT INTO public.guilda_membros (guilda_id, classe_id, aluno_id) VALUES ('{G1}', 1, '{A}'), ('{G1}', 1, '{B}');
-- Atividade de A dentro de qualquer janela que comece antes de 2 h atrás.
INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, concedido_por) VALUES
  ('{A}', 'presenca_aula', 'classe:1:aula:1', 7, now() - interval '1 hour', '{PROF}');
"""


@contextmanager
def _banco():
    nome = f"tu141_{uuid.uuid4().hex[:12]}"
    with psycopg.connect(base.DSN, autocommit=True) as adm:
        adm.execute(f"CREATE DATABASE {nome}")
    try:
        dsn = base._dsn_para(nome)
        with psycopg.connect(dsn, autocommit=True) as c:
            c.execute(base.PAPEIS)
            c.execute(base.ESQUELETO.read_text(encoding="utf-8"))
            c.execute(base.DUBLES)
            for tabela in ("professor", "classe", "materia"):
                base._afrouxa(c, tabela)
            for sql in base._sql_de(base.M_REF, "upgrade"):
                c.execute(sql)
            c.execute(base.M_GATILHO.GATILHO)
            c.execute(base.GATILHOS)
            c.execute(base.SAIDAS)
            c.execute(base.GATILHO_SAIDA)
            for sql in base._sql_de(base.M_PONTOS, "upgrade"):
                c.execute(sql)
            for sql in base._sql_de(base.M_GUILDA, "upgrade"):
                c.execute(sql)
            c.execute(POSSE)
            c.execute(GUARDA)
            c.execute(GUARDA_TRIGGER)
            for sql in base._sql_de(M_HORARIO, "upgrade"):
                c.execute(sql)
            c.execute(_seed())
            yield dsn, c
    finally:
        with psycopg.connect(base.DSN, autocommit=True) as adm:
            adm.execute(f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def _evento(c, *, inicio: str, fim: str, status: str = "rascunho", agendado: bool = False,
            guilda: bool = True, pontos: int = 10, moedas: int = 5, pecas: str = '["missoes"]') -> uuid.UUID:
    """Cria o evento pelo caminho do professor (a guarda força rascunho) e, se pedido, o põe aberto."""
    eid = uuid.uuid4()
    c.execute(
        f"""
        INSERT INTO public.eventos_classe (id, classe_id, titulo, inicio, fim, pecas, pontos, moedas,
                                           criado_por, medalha_participacao, modalidade_guilda,
                                           guilda_tamanho_max, abrir_no_inicio)
        VALUES (%s, 1, 'Maratona', {inicio}, {fim}, %s::jsonb, %s, %s, %s, false, %s, %s, %s)
        """,
        (eid, pecas, pontos, moedas, PROF, guilda, 5 if guilda else None, agendado),
    )
    if status == "aberto":
        with c.transaction():
            c.execute("SELECT set_config('app.evento_transicao', 'on', true)")
            c.execute("UPDATE public.eventos_classe SET status = 'aberto', aberto_em = now() WHERE id = %s", (eid,))
    return eid


def _status(c, eid) -> str:
    return c.execute("SELECT status FROM public.eventos_classe WHERE id = %s", (eid,)).fetchone()[0]


def _varrer(c) -> dict:
    return c.execute("SELECT public.fn_eventos_classe_varrer()").fetchone()[0]


def _como_professor(c, quem: uuid.UUID = PROF) -> None:
    c.execute("SELECT set_config('request.jwt.claim.sub', %s, false)", (str(quem),))
    c.execute("SELECT set_config('request.jwt.claims', %s, false)", (json.dumps({"sub": str(quem)}),))


def _creditos(c, eid) -> dict[str, int]:
    pontos = c.execute(
        "SELECT count(*) FROM public.eventos_aluno WHERE tipo = 'evento_classe_pontos' AND referencia = %s",
        (f"classe:1:evento:{eid}",),
    ).fetchone()[0]
    moedas = c.execute(
        "SELECT count(*) FROM public.moedas_ledger WHERE referencia = %s", (f"evento_classe:{eid}",)
    ).fetchone()[0]
    resultado = c.execute(
        "SELECT count(*) FROM public.eventos_classe_resultado WHERE evento_id = %s", (eid,)
    ).fetchone()[0]
    return {"pontos": pontos, "moedas": moedas, "resultado": resultado}


def _snapshot(c, eid) -> int:
    return c.execute(
        "SELECT count(*) FROM public.guilda_evento_snapshot WHERE evento_id = %s", (str(eid),)
    ).fetchone()[0]


# --------------------------------------------------------------------------------------------------
# Abre no horário
# --------------------------------------------------------------------------------------------------
def test_rascunho_agendado_abre_no_inicio_e_congela_as_guildas():
    with _banco() as (_, c):
        chegou = _evento(c, inicio="now() - interval '30 seconds'", fim="now() + interval '1 day'", agendado=True)
        r = _varrer(c)
        assert r == {"pulou": False, "abertos": 1, "encerrados": 0, "falhas": 0}
        assert _status(c, chegou) == "aberto"
        assert c.execute("SELECT aberto_em IS NOT NULL FROM public.eventos_classe WHERE id = %s", (chegou,)).fetchone()[0]
        # A mesma cópia congelada que o clique do professor grava: A e B na G1.
        assert _snapshot(c, chegou) == 2


def test_so_abre_quem_foi_agendado_e_so_quando_o_inicio_chega():
    with _banco() as (_, c):
        sem_marca = _evento(c, inicio="now() - interval '1 minute'", fim="now() + interval '1 day'")
        cedo = _evento(c, inicio="now() + interval '10 minutes'", fim="now() + interval '1 day'", agendado=True)
        passou = _evento(c, inicio="now() - interval '2 days'", fim="now() - interval '1 day'", agendado=True)
        assert _varrer(c)["abertos"] == 0
        # O rascunho sem marca espera o clique (a promessa do console); o cedo espera a hora; o que
        # perdeu a janela inteira não vai ao ar fora dela.
        assert [_status(c, e) for e in (sem_marca, cedo, passou)] == ["rascunho"] * 3
        assert _varrer(c)["falhas"] == 0


def test_agendar_rascunho_sem_peca_e_recusado():
    with _banco() as (_, c):
        with pytest.raises(psycopg.errors.CheckViolation):
            _evento(c, inicio="now() + interval '1 hour'", fim="now() + interval '1 day'", agendado=True, pecas="[]")


def test_a_janela_e_instante_o_fuso_da_sessao_nao_muda_nada():
    """A hora vem do console como em São Paulo; o `pg_cron` do Supabase roda em UTC."""
    with _banco() as (_, c):
        c.execute("SET TimeZone = 'America/Sao_Paulo'")
        # Texto SEM fuso, lido no fuso de São Paulo: o mesmo que o professor digita no navegador.
        agora_sp = c.execute("SELECT to_char(localtimestamp, 'YYYY-MM-DD HH24:MI:SS')").fetchone()[0]
        ja = _evento(c, inicio=f"'{agora_sp}'::timestamptz - interval '1 minute'",
                     fim=f"'{agora_sp}'::timestamptz + interval '1 hour'", agendado=True)
        daqui_a_pouco = _evento(c, inicio=f"'{agora_sp}'::timestamptz + interval '2 minutes'",
                                fim=f"'{agora_sp}'::timestamptz + interval '1 hour'", agendado=True)
        c.execute("SET TimeZone = 'UTC'")
        _varrer(c)
        assert _status(c, ja) == "aberto"
        assert _status(c, daqui_a_pouco) == "rascunho"


# --------------------------------------------------------------------------------------------------
# Encerra no horário
# --------------------------------------------------------------------------------------------------
def test_evento_aberto_encerra_no_fim_e_apura_como_o_clique():
    with _banco() as (_, c):
        acabou = _evento(c, status="aberto", inicio="now() - interval '2 hours'", fim="now() - interval '10 seconds'")
        corre = _evento(c, status="aberto", inicio="now() - interval '2 hours'", fim="now() + interval '1 hour'")
        r = _varrer(c)
        assert r == {"pulou": False, "abertos": 0, "encerrados": 1, "falhas": 0}
        assert _status(c, acabou) == "encerrado"
        assert _status(c, corre) == "aberto"
        # A apuração inteira: resultado de A e B, pontos do evento e moedas para quem participou (A).
        assert _creditos(c, acabou) == {"pontos": 1, "moedas": 1, "resultado": 2}
        valor, quem = c.execute(
            "SELECT valor, concedido_por FROM public.eventos_aluno WHERE tipo = 'evento_classe_pontos'"
        ).fetchone()
        # Sem sessão no cron, o crédito sai em nome de quem criou o evento.
        assert (valor, quem) == (10, PROF)
        assert c.execute(
            "SELECT count(*) FROM public.eventos_classe_resultado_guilda WHERE evento_id = %s", (acabou,)
        ).fetchone()[0] == 0  # nada congelado: o evento foi aberto por UPDATE no teste, sem cópia


def test_abre_e_depois_encerra_sozinho_com_a_guilda_congelada():
    with _banco() as (_, c):
        eid = _evento(c, inicio="now() - interval '2 hours'", fim="now() + interval '1 hour'", agendado=True)
        _varrer(c)
        assert _status(c, eid) == "aberto"
        # O fim chega (o guarda não deixa mudar a janela depois de aberto; o teste move o relógio
        # do evento pela porta de transição só para não esperar uma hora).
        with c.transaction():
            c.execute("SELECT set_config('app.evento_transicao', 'on', true)")
            c.execute("ALTER TABLE public.eventos_classe DISABLE TRIGGER trg_eventos_classe_guarda")
            c.execute("UPDATE public.eventos_classe SET fim = now() - interval '1 second' WHERE id = %s", (eid,))
            c.execute("ALTER TABLE public.eventos_classe ENABLE TRIGGER trg_eventos_classe_guarda")
        assert _varrer(c)["encerrados"] == 1
        assert _status(c, eid) == "encerrado"
        assert c.execute(
            "SELECT pontos, membros FROM public.eventos_classe_resultado_guilda WHERE evento_id = %s", (eid,)
        ).fetchone() == (7, 2)


# --------------------------------------------------------------------------------------------------
# Não credita duas vezes
# --------------------------------------------------------------------------------------------------
def test_varrer_de_novo_e_encerrar_de_novo_nao_credita_duas_vezes():
    with _banco() as (_, c):
        eid = _evento(c, status="aberto", inicio="now() - interval '2 hours'", fim="now() - interval '1 minute'")
        _varrer(c)
        antes = _creditos(c, eid)
        assert antes == {"pontos": 1, "moedas": 1, "resultado": 2}
        assert _varrer(c) == {"pulou": False, "abertos": 0, "encerrados": 0, "falhas": 0}
        miolo = c.execute("SELECT public.fn_evento_classe_encerrar_agora(%s)", (eid,)).fetchone()[0]
        assert miolo == {"status": "encerrado", "participantes": 1, "novo": False}
        _como_professor(c)
        manual = c.execute("SELECT public.evento_classe_encerrar(%s)", (eid,)).fetchone()[0]
        assert manual["novo"] is False
        assert _creditos(c, eid) == antes


def test_encerramento_manual_continua_funcionando_e_a_varredura_nao_reapura():
    with _banco() as (dsn, c):
        eid = _evento(c, status="aberto", inicio="now() - interval '2 hours'", fim="now() + interval '1 hour'")
        with psycopg.connect(dsn, autocommit=True) as prof:
            _como_professor(prof)
            r = prof.execute("SELECT public.evento_classe_encerrar(%s)", (eid,)).fetchone()[0]
            assert r == {"status": "encerrado", "participantes": 1, "novo": True}
        assert _varrer(c)["encerrados"] == 0
        assert _creditos(c, eid) == {"pontos": 1, "moedas": 1, "resultado": 2}
        # A porta do cliente segue conferindo a posse.
        with psycopg.connect(dsn, autocommit=True) as outro:
            _como_professor(outro, OUTRO)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                outro.execute("SELECT public.evento_classe_encerrar(%s)", (eid,))
        with psycopg.connect(dsn, autocommit=True) as anon:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                anon.execute("SELECT public.evento_classe_abrir(%s)", (eid,))


def test_encerrar_rascunho_continua_recusado():
    with _banco() as (_, c):
        eid = _evento(c, inicio="now() - interval '2 hours'", fim="now() + interval '1 hour'")
        _como_professor(c)
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="Só um evento aberto"):
            c.execute("SELECT public.evento_classe_encerrar(%s)", (eid,))


# --------------------------------------------------------------------------------------------------
# Corridas
# --------------------------------------------------------------------------------------------------
def test_corrida_professor_encerra_enquanto_a_varredura_passa():
    """O professor pegou a trava primeiro: a varredura pula o evento (SKIP LOCKED) e não espera."""
    with _banco() as (dsn, c):
        eid = _evento(c, status="aberto", inicio="now() - interval '2 hours'", fim="now() - interval '1 minute'")
        with psycopg.connect(dsn) as prof:  # transação aberta, sem commit ainda
            _como_professor(prof)
            assert prof.execute("SELECT public.evento_classe_encerrar(%s)", (eid,)).fetchone()[0]["novo"] is True
            inicio = time.monotonic()
            assert _varrer(c) == {"pulou": False, "abertos": 0, "encerrados": 0, "falhas": 0}
            assert time.monotonic() - inicio < 2
            prof.commit()
        assert _status(c, eid) == "encerrado"
        assert _varrer(c)["encerrados"] == 0
        assert _creditos(c, eid) == {"pontos": 1, "moedas": 1, "resultado": 2}


def test_corrida_varredura_encerra_enquanto_o_professor_clica():
    """A varredura pegou a trava primeiro: o clique espera, vê encerrado e responde sem erro."""
    with _banco() as (dsn, c):
        eid = _evento(c, status="aberto", inicio="now() - interval '2 hours'", fim="now() - interval '1 minute'")
        resposta: dict = {}

        def clicar() -> None:
            with psycopg.connect(dsn, autocommit=True) as prof:
                _como_professor(prof)
                try:
                    resposta["r"] = prof.execute("SELECT public.evento_classe_encerrar(%s)", (eid,)).fetchone()[0]
                except Exception as e:  # noqa: BLE001 - o teste quer ver qualquer erro
                    resposta["erro"] = e

        with psycopg.connect(dsn) as cron:  # transação do job, ainda sem commit
            assert _varrer(cron)["encerrados"] == 1
            t = threading.Thread(target=clicar)
            t.start()
            t.join(1.5)
            assert t.is_alive(), "o clique deveria esperar a trava da linha"
            cron.commit()
        t.join(10)
        assert not t.is_alive()
        assert "erro" not in resposta, resposta.get("erro")
        assert resposta["r"]["novo"] is False and resposta["r"]["status"] == "encerrado"
        assert _creditos(c, eid) == {"pontos": 1, "moedas": 1, "resultado": 2}


def test_corrida_duas_varreduras_ao_mesmo_tempo():
    with _banco() as (dsn, c):
        eid = _evento(c, status="aberto", inicio="now() - interval '2 hours'", fim="now() - interval '1 minute'")
        with psycopg.connect(dsn) as primeira:
            assert _varrer(primeira)["encerrados"] == 1
            # A segunda passada (job duplicado) não disputa: sai na hora.
            assert _varrer(c) == {"pulou": True, "abertos": 0, "encerrados": 0, "falhas": 0}
            primeira.commit()
        assert _varrer(c) == {"pulou": False, "abertos": 0, "encerrados": 0, "falhas": 0}
        assert _creditos(c, eid) == {"pontos": 1, "moedas": 1, "resultado": 2}


def test_corrida_professor_abre_enquanto_a_varredura_abre():
    with _banco() as (dsn, c):
        eid = _evento(c, inicio="now() - interval '1 minute'", fim="now() + interval '1 day'", agendado=True)
        resposta: dict = {}

        def clicar() -> None:
            with psycopg.connect(dsn, autocommit=True) as prof:
                _como_professor(prof)
                try:
                    resposta["r"] = prof.execute("SELECT public.evento_classe_abrir(%s)", (eid,)).fetchone()[0]
                except Exception as e:  # noqa: BLE001
                    resposta["erro"] = e

        with psycopg.connect(dsn) as cron:
            assert _varrer(cron)["abertos"] == 1
            t = threading.Thread(target=clicar)
            t.start()
            t.join(1.5)
            assert t.is_alive()
            cron.commit()
        t.join(10)
        assert "erro" not in resposta, resposta.get("erro")
        assert resposta["r"] == {"status": "aberto", "guildas_congeladas": 0, "novo": False}
        # Congelou uma vez só.
        assert _snapshot(c, eid) == 2


def test_um_evento_com_problema_nao_trava_os_outros():
    with _banco() as (_, c):
        ruim = _evento(c, status="aberto", inicio="now() - interval '2 hours'", fim="now() - interval '2 minutes'")
        bom = _evento(c, status="aberto", inicio="now() - interval '2 hours'", fim="now() - interval '1 minute'")
        # Quebra a apuração só para o evento ruim.
        c.execute(
            f"""
            CREATE OR REPLACE FUNCTION public.trg_quebra() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.evento_id = '{ruim}' THEN RAISE EXCEPTION 'quebrado de proposito'; END IF;
              RETURN NEW;
            END $$;
            CREATE TRIGGER trg_quebra BEFORE INSERT ON public.eventos_classe_resultado
              FOR EACH ROW EXECUTE FUNCTION public.trg_quebra();
            """
        )
        r = _varrer(c)
        assert r == {"pulou": False, "abertos": 0, "encerrados": 1, "falhas": 1}
        # O ruim voltou inteiro (savepoint): continua aberto, sem crédito; a próxima passada tenta de novo.
        assert _status(c, ruim) == "aberto"
        assert _creditos(c, ruim) == {"pontos": 0, "moedas": 0, "resultado": 0}
        assert _status(c, bom) == "encerrado"


# --------------------------------------------------------------------------------------------------
# Downgrade
# --------------------------------------------------------------------------------------------------
def test_downgrade_volta_o_clique_antigo_e_o_upgrade_reaplica():
    with _banco() as (_, c):
        for sql in base._sql_de(M_HORARIO, "downgrade"):
            c.execute(sql)
        assert c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname IN ('fn_eventos_classe_varrer', "
            "'fn_evento_classe_abrir_agora', 'fn_evento_classe_encerrar_agora', 'fn_guilda_congelar_composicao')"
        ).fetchone()[0] == 0
        assert c.execute(
            "SELECT count(*) FROM information_schema.columns WHERE table_name = 'eventos_classe' "
            "AND column_name = 'abrir_no_inicio'"
        ).fetchone()[0] == 0
        # As portas antigas seguem abrindo (com cópia da guilda) e encerrando (com apuração).
        c.execute(
            "INSERT INTO public.eventos_classe (id, classe_id, titulo, inicio, fim, pecas, pontos, moedas, "
            "criado_por, medalha_participacao, modalidade_guilda, guilda_tamanho_max) VALUES "
            "(%s, 1, 'Maratona', now() - interval '2 hours', now() + interval '1 hour', '[\"missoes\"]'::jsonb, "
            "10, 5, %s, false, true, 5)",
            (eid := uuid.uuid4(), PROF),
        )
        _como_professor(c)
        c.execute("SELECT public.evento_classe_abrir(%s)", (eid,))
        assert _snapshot(c, eid) == 2
        c.execute("SELECT public.evento_classe_encerrar(%s)", (eid,))
        assert _creditos(c, eid) == {"pontos": 1, "moedas": 1, "resultado": 2}
        for sql in base._sql_de(M_HORARIO, "upgrade"):
            c.execute(sql)
        assert _varrer(c)["falhas"] == 0
