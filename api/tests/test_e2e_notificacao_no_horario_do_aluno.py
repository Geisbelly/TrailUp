"""`20261102_01`: horário habitual, escolha do aluno, texto por perfil e promoção da sugestão (#66).

Postgres local, esqueleto da produção, e o motor de notificações como o Alembic o deixa
(`20260826_03` índices, `_04`, `_07`, `_14`, `_16`) com a `20261102_01` por cima. O push
(`notificacoes_enviar_push`) é um dublê: o pg_net não existe no Postgres local, e o que se mede aqui
é a fila, não a entrega no aparelho.

O relógio é o do banco (`now()`); os casos que dependem da janela de silêncio a configuram em volta
da hora atual em vez de supor que horas são.
"""

from __future__ import annotations

from datetime import timedelta, timezone

import psycopg
import pytest

from tests import _f5_banco as f5

pytestmark = f5.e2e

M = f5.modulo("20261102_01_notificacao_no_horario_do_aluno.py")
M04 = f5.modulo("20260826_04_notificacoes_motor_sql.py")
M07 = f5.modulo("20260826_07_push_em_expo_tokens.py")
M14 = f5.modulo("20260826_14_notificacoes_texto_pt_br.py")
M16 = f5.modulo("20260826_16_revisao_diaria_pula_quem_estudou.py")


# Os índices da 20260826_03 de que o motor depende (ON CONFLICT sobre eles).
INDICES = """
CREATE UNIQUE INDEX notificacoes_pendentes_dedupe_uidx
  ON notificacoes_pendentes (aluno_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE UNIQUE INDEX notificacoes_ia_resposta_hash_uidx
  ON notificacoes_ia (resposta_hash) WHERE resposta_hash IS NOT NULL;
CREATE UNIQUE INDEX notificacoes_agendamentos_aluno_tipo_uidx
  ON notificacoes_agendamentos (aluno_id, tipo) WHERE aluno_id IS NOT NULL;
CREATE UNIQUE INDEX aluno_atividade_diaria_uidx ON aluno_atividade_diaria (aluno_id, dia);
"""
PROMOVER_07 = M._funcao("\n".join(f5.sql_de(M07)), "notificacoes_ia_promover", "07")
PUSH_DUBLE = """
CREATE OR REPLACE FUNCTION public.notificacoes_enviar_push(
  p_aluno uuid, p_notificacao_id bigint, p_titulo text, p_corpo text, p_dados jsonb, p_prioridade integer DEFAULT 0
) RETURNS integer LANGUAGE sql AS $$ SELECT 0 $$;
"""

TZ = "America/Sao_Paulo"
SOC, MAS = 1, 2


def _motor() -> list[str]:
    return [
        INDICES,
        M04.FUNCOES,
        PROMOVER_07,
        *f5.sql_de(M14),
        *f5.sql_de(M16),
        PUSH_DUBLE,
    ]


def _banco():
    return f5.banco(*_motor(), *f5.sql_de(M))


def _semear(c) -> None:
    f5.semear_turma(c)
    for t in ("topico_aluno", "notificacoes_agendamentos"):
        f5.afrouxa(c, t)
    c.execute(
        f"""
INSERT INTO public.perfil (id, nome) OVERRIDING SYSTEM VALUE VALUES ({SOC}, 'Socialiser'), ({MAS}, 'Mastermind');
INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES
  ('{f5.A}', {SOC}, 90), ('{f5.A}', {MAS}, 40), ('{f5.B}', {MAS}, 80);
"""
    )


def _sessoes(c, aluno, hora_local: int, dias: list[int], duracao: int = 600, tz: str = TZ) -> None:
    """Uma sessão por dia em `dias` (dias atrás), começando em `hora_local` no fuso `tz`."""
    for d in dias:
        c.execute(
            """
INSERT INTO public.aluno_sessoes_app (aluno_id, timezone, iniciada_em, encerrada_em, duracao_seg)
SELECT %(a)s, %(tz)s, t, t + make_interval(secs => %(dur)s), %(dur)s
  FROM (SELECT ((date_trunc('day', now() AT TIME ZONE %(tz)s) - make_interval(days => %(d)s)
                 + make_interval(hours => %(h)s)) AT TIME ZONE %(tz)s) AS t) x
""",
            {"a": aluno, "tz": tz, "d": d, "h": hora_local, "dur": duracao},
        )


def _cfg(c, chave: str, valor: int) -> None:
    c.execute(
        "INSERT INTO public.notificacoes_config (chave, valor) VALUES (%s, %s) "
        "ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor",
        (chave, str(valor)),
    )


def _sem_silencio(c) -> None:
    # início = fim desliga a janela (notificacoes_em_silencio devolve FALSE).
    _cfg(c, "janela_silencio_inicio", 0)
    _cfg(c, "janela_silencio_fim", 0)


def _preferido(c, aluno) -> dict:
    return c.execute("SELECT public.notificacoes_horario_preferido(%s)", (aluno,)).fetchone()[0]


# --------------------------------------------------------------------------- horário habitual


def test_sem_historico_vale_o_padrao_das_19h():
    with _banco() as c:
        _semear(c)
        pref = _preferido(c, f5.A)
    assert (pref["hora"], pref["minuto"], pref["origem"]) == (19, 0, "padrao")
    assert pref["dias_uso"] == 0


def test_habito_em_dias_distintos_vira_envio_30_min_antes():
    with _banco() as c:
        _semear(c)
        _sessoes(c, f5.A, 21, [1, 3, 5, 8])
        pref = _preferido(c, f5.A)
    assert (pref["hora"], pref["minuto"], pref["origem"]) == (20, 30, "inferida")
    assert pref["hora_habitual"] == 21
    assert pref["dias_na_hora"] == 4


def test_conta_dias_e_nao_sessoes():
    # 30 aberturas num único dia às 10h não vencem três dias às 20h.
    with _banco() as c:
        _semear(c)
        for _ in range(30):
            _sessoes(c, f5.A, 10, [2])
        _sessoes(c, f5.A, 20, [1, 4, 6])
        pref = _preferido(c, f5.A)
    assert pref["hora_habitual"] == 20
    assert (pref["hora"], pref["minuto"]) == (19, 30)


def test_sessao_curta_e_sessao_no_silencio_nao_contam():
    with _banco() as c:
        _semear(c)
        _sessoes(c, f5.A, 21, [1, 2, 3, 4], duracao=0)
        _sessoes(c, f5.A, 21, [5, 6], duracao=59)
        _sessoes(c, f5.A, 23, [1, 2, 3, 4])  # silêncio 22h–7h
        _sessoes(c, f5.A, 18, [1, 2])
        pref = _preferido(c, f5.A)
    # Sobram dois dias às 18h: abaixo do mínimo de três dias de uso.
    assert pref["origem"] == "padrao"
    assert pref["dias_uso"] == 2


def test_duracao_zero_com_encerramento_conta_pelo_intervalo():
    # As 205 sessões medidas com duracao_seg = 0 não são todas de zero segundo.
    with _banco() as c:
        _semear(c)
        _sessoes(c, f5.A, 21, [1, 2, 3], duracao=600)
        c.execute("UPDATE public.aluno_sessoes_app SET duracao_seg = 0")
        pref = _preferido(c, f5.A)
    assert pref["origem"] == "inferida"


def test_sessoes_antigas_ficam_fora_da_janela():
    with _banco() as c:
        _semear(c)
        _sessoes(c, f5.A, 21, [29, 30, 31])
        pref = _preferido(c, f5.A)
    assert pref["origem"] == "padrao"


def test_antecedencia_que_cai_no_silencio_vai_para_o_fim_dele():
    with _banco() as c:
        _semear(c)
        _sessoes(c, f5.A, 7, [1, 2, 3])
        pref = _preferido(c, f5.A)
    assert pref["hora_habitual"] == 7
    assert (pref["hora"], pref["minuto"]) == (7, 0)


def test_cada_sessao_no_proprio_fuso():
    # 00h UTC é 21h em São Paulo: a sessão conta como 21h, não como madrugada.
    with _banco() as c:
        _semear(c)
        _sessoes(c, f5.A, 0, [1, 2, 3], tz="UTC")
        c.execute("UPDATE public.aluno_sessoes_app SET timezone = %s", (TZ,))
        pref = _preferido(c, f5.A)
    assert pref["hora_habitual"] == 21


# --------------------------------------------------------------------------- escolha do aluno


def _salvar(c, aluno, hora: int, minuto: int = 0, ativo: bool = True) -> None:
    f5.como(c, aluno)
    c.execute(
        "SELECT public.notificacoes_salvar_rotina('revisao_diaria', 'diaria', 'horario', NULL, NULL,"
        " %s::smallint, %s::smallint, %s, 0, '{}'::jsonb, %s)",
        (hora, minuto, TZ, ativo),
    )
    f5.como(c, None)


def _rotina(c, aluno) -> dict:
    cur = c.execute(
        "SELECT hora_local, minuto_local, hora_origem, titulo, corpo, proxima_execucao, ativo"
        " FROM public.notificacoes_agendamentos WHERE aluno_id = %s AND tipo = 'revisao_diaria'",
        (aluno,),
    )
    cols = [d.name for d in cur.description]
    return dict(zip(cols, cur.fetchone()))


def test_salvar_marca_aluno_so_quando_a_hora_muda():
    with _banco() as c:
        _semear(c)
        c.execute("SELECT public.notificacoes_garantir_rotinas(%s, %s)", (f5.A, TZ))
        assert _rotina(c, f5.A)["hora_origem"] == "padrao"
        c.execute(
            "UPDATE public.notificacoes_agendamentos SET hora_local = 20, minuto_local = 30,"
            " hora_origem = 'inferida' WHERE aluno_id = %s",
            (f5.A,),
        )

        # Liga/desliga manda a mesma hora: não é escolha.
        _salvar(c, f5.A, 20, 30, ativo=False)
        assert _rotina(c, f5.A)["hora_origem"] == "inferida"
        _salvar(c, f5.A, 20, 30, ativo=True)
        assert _rotina(c, f5.A)["hora_origem"] == "inferida"

        _salvar(c, f5.A, 22, 0)
        assert _rotina(c, f5.A)["hora_origem"] == "aluno"


def test_rotina_criada_pela_tela_nasce_como_escolha():
    with _banco() as c:
        _semear(c)
        _salvar(c, f5.B, 8)
        assert _rotina(c, f5.B)["hora_origem"] == "aluno"


def test_backfill_trata_hora_fora_do_padrao_como_escolha():
    with f5.banco(*_motor()) as c:
        _semear(c)
        c.execute("SELECT public.notificacoes_garantir_rotinas(%s, %s)", (f5.A, TZ))
        c.execute("SELECT public.notificacoes_garantir_rotinas(%s, %s)", (f5.B, TZ))
        c.execute(
            "UPDATE public.notificacoes_agendamentos SET hora_local = 22"
            " WHERE aluno_id = %s AND tipo = 'revisao_diaria'",
            (f5.B,),
        )
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert _rotina(c, f5.A)["hora_origem"] == "padrao"
        assert _rotina(c, f5.B)["hora_origem"] == "aluno"


# --------------------------------------------------------------------------- texto por perfil


def _em_andamento(c, aluno, topico: int, percentual: float) -> None:
    c.execute(
        "INSERT INTO public.topico_aluno (aluno_id, topico_id, status, percentual_concluido, updated_at)"
        " VALUES (%s, %s, 'em andamento', %s, now())",
        (aluno, topico, percentual),
    )


def test_texto_no_tom_do_perfil_com_topico_e_percentual():
    with _banco() as c:
        _semear(c)
        _em_andamento(c, f5.A, 11, 42.6)
        texto = c.execute("SELECT public.notificacoes_texto_revisao(%s)", (f5.A,)).fetchone()[0]
    # Socialiser no banco vira socializer (mesma normalização da matrícula).
    assert texto["perfil"] == "socializer"
    assert texto["variante"] == "com_topico"
    assert texto["corpo"] == "Você está em 43" + chr(37) + " de Dois. Que tal seguir junto com a turma hoje?"


def test_sem_topico_em_andamento_usa_a_variante_sem_topico():
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.topico_aluno (aluno_id, topico_id, status, percentual_concluido)"
            " VALUES (%s, 10, 'concluido', 100)",
            (f5.B,),
        )
        texto = c.execute("SELECT public.notificacoes_texto_revisao(%s)", (f5.B,)).fetchone()[0]
    assert texto["perfil"] == "mastermind"
    assert texto["variante"] == "sem_topico"
    assert "{" not in texto["corpo"]


def test_topico_de_turma_que_o_aluno_deixou_nao_entra():
    with _banco() as c:
        _semear(c)
        _em_andamento(c, f5.A, 11, 50)
        c.execute("DELETE FROM public.classe_aluno WHERE aluno_id = %s", (f5.A,))
        texto = c.execute("SELECT public.notificacoes_texto_revisao(%s)", (f5.A,)).fetchone()[0]
    assert texto["variante"] == "sem_topico"


def test_aluno_sem_perfil_e_mastermind():
    with _banco() as c:
        _semear(c)
        perfil = c.execute("SELECT public.notificacoes_perfil_dominante(%s)", (f5.C,)).fetchone()[0]
    assert perfil == "mastermind"


def test_todo_perfil_tem_as_duas_variantes():
    with _banco() as c:
        n = c.execute(
            "SELECT count(*) FROM public.notificacoes_modelos_texto WHERE tipo = 'revisao_diaria'"
        ).fetchone()[0]
        perfis = c.execute(
            "SELECT count(DISTINCT perfil) FROM public.notificacoes_modelos_texto"
            " GROUP BY variante"
        ).fetchall()
    assert n == 14
    assert perfis == [(7,), (7,)]


# --------------------------------------------------------------------------- job diário


def test_job_troca_hora_de_quem_nao_escolheu_e_texto_de_todos():
    with _banco() as c:
        _semear(c)
        for aluno in (f5.A, f5.B):
            c.execute("SELECT public.notificacoes_garantir_rotinas(%s, %s)", (aluno, TZ))
        _salvar(c, f5.B, 22)
        _sessoes(c, f5.A, 21, [1, 2, 4])
        _sessoes(c, f5.B, 21, [1, 2, 4])
        _em_andamento(c, f5.A, 11, 50)

        resultado = c.execute("SELECT public.notificacoes_recalcular_rotinas()").fetchone()[0]
        a, b = _rotina(c, f5.A), _rotina(c, f5.B)
        segunda = c.execute("SELECT public.notificacoes_recalcular_rotinas()").fetchone()[0]
        local = c.execute("SELECT %s::timestamptz AT TIME ZONE %s", (a["proxima_execucao"], TZ)).fetchone()[0]

    assert resultado == {"pulou": False, "textos": 2, "horarios": 1, "falhas": 0}
    assert (a["hora_local"], a["minuto_local"], a["hora_origem"]) == (20, 30, "inferida")
    assert (local.hour, local.minute) == (20, 30)
    assert "Dois" in a["corpo"]
    # Escolha do aluno: hora intacta, texto atualizado.
    assert (b["hora_local"], b["hora_origem"]) == (22, "aluno")
    assert b["titulo"] == "O próximo padrão te espera"
    assert segunda == {"pulou": False, "textos": 0, "horarios": 0, "falhas": 0}


def test_login_nao_desfaz_o_texto_personalizado():
    with _banco() as c:
        _semear(c)
        c.execute("SELECT public.notificacoes_garantir_rotinas(%s, %s)", (f5.A, TZ))
        _em_andamento(c, f5.A, 11, 50)
        c.execute("SELECT public.notificacoes_recalcular_rotinas()")
        antes = _rotina(c, f5.A)["corpo"]
        c.execute("SELECT public.notificacoes_garantir_rotinas(%s, %s)", (f5.A, TZ))
        depois = _rotina(c, f5.A)
        pausa = c.execute(
            "SELECT corpo FROM public.notificacoes_agendamentos WHERE aluno_id = %s AND tipo = 'pausa_saudavel'",
            (f5.A,),
        ).fetchone()[0]
    assert "Dois" in antes
    assert depois["corpo"] == antes
    assert pausa.startswith("Você já estudou bastante hoje")


def test_job_sem_habito_volta_ao_padrao():
    with _banco() as c:
        _semear(c)
        c.execute("SELECT public.notificacoes_garantir_rotinas(%s, %s)", (f5.A, TZ))
        c.execute(
            "UPDATE public.notificacoes_agendamentos SET hora_local = 20, minuto_local = 30,"
            " hora_origem = 'inferida' WHERE aluno_id = %s",
            (f5.A,),
        )
        c.execute("SELECT public.notificacoes_recalcular_rotinas()")
        a = _rotina(c, f5.A)
    assert (a["hora_local"], a["minuto_local"], a["hora_origem"]) == (19, 0, "padrao")


# --------------------------------------------------------------------------- promoção da sugestão


def _token(c, aluno, tz: str = "UTC") -> None:
    c.execute(
        "INSERT INTO public.expo_tokens (aluno_id, token, timezone, ativo) VALUES (%s, %s, %s, true)",
        (aluno, f"tok-{aluno}", tz),
    )


def _sugerir(c, aluno, tipo: str, sugerido: str | None = None, motivo: str = "engajamento") -> dict:
    c.execute(
        "INSERT INTO public.notificacoes_ia (aluno_id, tipo, contexto, titulo, corpo, horario_sugerido)"
        " VALUES (%s, %s, jsonb_build_object('motivo', %s::text), 't', 'c', %s::timestamptz)",
        (aluno, tipo, motivo, sugerido),
    )
    cur = c.execute(
        "SELECT horario, expira_em, contexto, gatilho, now() AS agora FROM public.notificacoes_pendentes"
        " WHERE aluno_id = %s ORDER BY id DESC LIMIT 1",
        (aluno,),
    )
    cols = [d.name for d in cur.description]
    return dict(zip(cols, cur.fetchone()))


def _agora(p: dict) -> bool:
    """A promoção usou o `now()` dela: autocommit, então a leitura vem um instante depois."""
    return timedelta(0) <= p["agora"] - p["horario"] < timedelta(seconds=5)


def test_suporte_sai_agora():
    with _banco() as c:
        _semear(c)
        _sem_silencio(c)
        _token(c, f5.A)
        p = _sugerir(c, f5.A, "suporte", "2099-01-01T12:00:00Z", motivo="emocao_negativa")
    assert _agora(p)
    assert p["contexto"]["horario_origem"] == "agora"
    assert p["expira_em"] - p["horario"] == timedelta(hours=48)


def test_lembrete_vai_para_o_horario_habitual():
    with _banco() as c:
        _semear(c)
        _sem_silencio(c)
        _token(c, f5.A, TZ)
        _sessoes(c, f5.A, 21, [1, 2, 4])
        p = _sugerir(c, f5.A, "lembrete", "2099-01-01T12:00:00Z")
        local = c.execute("SELECT %s::timestamptz AT TIME ZONE %s", (p["horario"], TZ)).fetchone()[0]
    assert (local.hour, local.minute) == (20, 30)
    assert p["agora"] < p["horario"] <= p["agora"] + timedelta(hours=24)
    assert p["contexto"]["horario_origem"] == "habito"


def test_lembrete_sem_habito_usa_o_horario_do_modelo():
    with _banco() as c:
        _semear(c)
        _sem_silencio(c)
        _token(c, f5.A)
        agora = c.execute("SELECT now()").fetchone()[0]
        sugerido = agora + timedelta(hours=3)
        p = _sugerir(c, f5.A, "lembrete", sugerido.isoformat())
    assert p["horario"] == sugerido
    assert p["contexto"]["horario_origem"] == "modelo"


def test_horario_do_modelo_no_passado_vira_agora():
    with _banco() as c:
        _semear(c)
        _sem_silencio(c)
        _token(c, f5.A)
        p = _sugerir(c, f5.A, "conquista", "2020-01-01T12:00:00Z")
    assert _agora(p)


def test_silencio_empurra_ate_o_fim_dele_no_fuso_do_aluno():
    # A janela é montada em volta da hora atual (UTC): o bug medido foi entregar às 00:34.
    with _banco() as c:
        _semear(c)
        hora = c.execute("SELECT EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC')::int").fetchone()[0]
        _cfg(c, "janela_silencio_inicio", hora)
        _cfg(c, "janela_silencio_fim", (hora + 2) % 24)
        _token(c, f5.A, "UTC")
        p = _sugerir(c, f5.A, "suporte", motivo="emocao_negativa")
    esperado = p["agora"].astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0) + timedelta(hours=2)
    assert p["horario"] == esperado
    assert p["contexto"]["dia"] == esperado.date().isoformat()


def test_varredura_entrega_pendente_vencida_sem_rotina_vencida():
    with _banco() as c:
        _semear(c)
        _sem_silencio(c)
        _token(c, f5.A)
        agora = c.execute("SELECT now()").fetchone()[0]
        _sugerir(c, f5.A, "conquista", (agora + timedelta(hours=2)).isoformat(), motivo="m1")
        c.execute(
            "INSERT INTO public.notificacoes_pendentes (aluno_id, tipo, titulo, corpo, horario, gatilho,"
            " expira_em, dedupe_key) VALUES (%s, 'conquista', 'x', 'y', now() - interval '1 minute',"
            " 'horario', now() + interval '1 day', 'vencida')",
            (f5.A,),
        )
        resultado = c.execute("SELECT public.notificacoes_varrer()").fetchone()[0]
        estados = c.execute(
            "SELECT dedupe_key = 'vencida', status FROM public.notificacoes_pendentes WHERE aluno_id = %s ORDER BY 1",
            (f5.A,),
        ).fetchall()
    assert resultado["entregues"] == 1
    assert estados == [(False, "pendente"), (True, "entregue")]


# --------------------------------------------------------------------------- acesso e downgrade


def test_cliente_nao_le_modelos_nem_chama_funcoes_internas():
    with _banco() as c:
        _semear(c)
        c.execute("SET ROLE authenticated")
        f5.como(c, f5.A)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT count(*) FROM public.notificacoes_modelos_texto")
        for chamada in (
            "SELECT public.notificacoes_horario_preferido(%s)",
            "SELECT public.notificacoes_texto_revisao(%s)",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute(chamada, (f5.A,))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT public.notificacoes_recalcular_rotinas()")
        c.execute("RESET ROLE")


def test_downgrade_volta_as_funcoes_e_tira_as_colunas():
    with _banco() as c:
        _semear(c)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        colunas = {
            r[0]
            for r in c.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name IN"
                " ('notificacoes_ia', 'notificacoes_agendamentos')"
            ).fetchall()
        }
        promover = c.execute(
            "SELECT prosrc FROM pg_proc WHERE proname = 'notificacoes_ia_promover'"
        ).fetchone()[0]
        tabela = c.execute("SELECT to_regclass('public.notificacoes_modelos_texto')").fetchone()[0]
        # E o motor antigo continua funcionando.
        _token(c, f5.A)
        c.execute(
            "INSERT INTO public.notificacoes_ia (aluno_id, tipo, contexto, titulo, corpo)"
            " VALUES (%s, 'lembrete', '{}'::jsonb, 't', 'c')",
            (f5.A,),
        )
        pendentes = c.execute(
            "SELECT count(*) FROM public.notificacoes_pendentes WHERE aluno_id = %s", (f5.A,)
        ).fetchone()[0]
    assert "horario_sugerido" not in colunas and "hora_origem" not in colunas
    assert "horario_sugerido" not in promover
    assert tabela is None
    assert pendentes == 1


def test_upgrade_e_idempotente():
    with _banco() as c:
        for sql in f5.sql_de(M):
            c.execute(sql)
        n = c.execute("SELECT count(*) FROM public.notificacoes_modelos_texto").fetchone()[0]
    assert n == 14

