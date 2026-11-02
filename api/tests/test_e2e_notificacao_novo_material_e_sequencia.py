"""`20261102_20`: os produtores de `novo_material` e `sequencia` (#149).

Postgres local, esqueleto da produção e o motor de notificações como a `20261102_19` o deixa (o mesmo
banco do e2e dela), com a `20261102_20` por cima. Além dos dublês daquele e2e (`net.http_post` e a
view do rank), entram a tabela `estudo_coorte` da `20261102_02` e as funções da trava da
`20261102_05`, recortadas das migrações, porque o produtor de `novo_material` pergunta à trava.

O cliente entra como o PostgREST entraria: `SET ROLE authenticated` com o `sub` do JWT.
Dados sintéticos.
"""

from __future__ import annotations

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_no_horario_do_aluno as h
from tests import test_e2e_notificacao_por_perfil_e_foco as p
from tests.test_e2e_kpis_por_topico import _trecho

pytestmark = f5.e2e

M = f5.modulo("20261102_20_notificacao_novo_material_e_sequencia.py")
M05 = f5.modulo("20261102_05_trava_da_personalizacao.py")

COORTE = _trecho("20261102_02_estudo_coorte_e_marcos.py", "CREATE TABLE IF NOT EXISTS public.estudo_coorte (", "\n);")

SEE, ACH, CON = 4, 5, 6
A, B, C = f5.A, f5.B, f5.C  # A: Achiever, B: Seeker, C: Conqueror
UM, DOIS = 10, 11  # tópicos "Um" e "Dois" da turma
C100, C101, C110 = 100, 101, 110  # conteúdos: dois no tópico Um, um no Dois


def _banco():
    return f5.banco(
        *h._motor(),
        *f5.sql_de(p.M01),
        p.ANTES,
        p.RETENCAO,
        p.M_LIMITE.TABELA_CONFIG,
        p.M_LIMITE.FUNCAO_LIMITE,
        *f5.sql_de(p.M),
        COORTE,
        M05.FUNCOES,
        *f5.sql_de(M),
    )


def _semear(c) -> None:
    f5.semear_turma(c)
    for t in ("conteudo_personalizado", "personalizacao_jobs", "personalizacao_job_targets", "notificacoes_agendamentos"):
        f5.afrouxa(c, t)
    c.execute(
        f"""
INSERT INTO public.perfil (id, nome) OVERRIDING SYSTEM VALUE VALUES
  ({SEE}, 'Seeker'), ({ACH}, 'Achiever'), ({CON}, 'Conqueror');
INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES
  ('{A}', {ACH}, 90), ('{A}', {SEE}, 30),
  ('{B}', {SEE}, 80), ('{B}', {ACH}, 20),
  ('{C}', {CON}, 85), ('{C}', {ACH}, 10);
INSERT INTO public.conteudos (id, topico_id, titulo, tipo) OVERRIDING SYSTEM VALUE VALUES
  ({C100}, {UM}, 'c100', 'texto'), ({C101}, {UM}, 'c101', 'texto'), ({C110}, {DOIS}, 'c110', 'texto');
"""
    )
    h._sem_silencio(c)
    for aluno in (A, B, C):
        h._token(c, aluno)


def _material(c, *, perfil: str, conteudo: int = C100, topico: int = UM, status: str = "pronto",
              aluno=None) -> int:
    return c.execute(
        "INSERT INTO public.conteudo_personalizado"
        " (aluno_id, classe_id, topico_id, conteudo_id, brainhex_profile_key, status, ciclo_id)"
        " VALUES (%s, %s, %s, %s, %s, %s, 'c') RETURNING id",
        (aluno, f5.TURMA, topico, conteudo, perfil, status),
    ).fetchone()[0]


def _status(c, pid: int, status: str) -> None:
    c.execute("UPDATE public.conteudo_personalizado SET status = %s WHERE id = %s", (status, pid))


def _avisos(c, aluno) -> list[tuple]:
    return c.execute(
        "SELECT titulo, corpo, contexto->>'topico_id' FROM public.notificacoes_pendentes"
        " WHERE aluno_id = %s AND tipo = 'novo_material' ORDER BY id",
        (aluno,),
    ).fetchall()


def _registrados(c) -> list[tuple]:
    return c.execute(
        "SELECT aluno_id, topico_id, pendente_id IS NOT NULL FROM public.notificacoes_material_pronto"
        " ORDER BY aluno_id, topico_id"
    ).fetchall()


def _quebrar_a_porta(c) -> None:
    c.execute(
        "ALTER FUNCTION public.notificacoes_enfileirar_evento(uuid, text, text, text, text, jsonb, integer, integer)"
        " RENAME TO notificacoes_enfileirar_evento_fora"
    )


# --------------------------------------------------------------------------- novo_material


def test_topico_pronto_avisa_quem_le_aquele_perfil_e_a_matriz_decide():
    with _banco() as c:
        _semear(c)
        _material(c, perfil="achiever")
        _material(c, perfil="seeker")
        _material(c, perfil="conqueror")
        a, b, cc = _avisos(c, A), _avisos(c, B), _avisos(c, C)
        registrados = _registrados(c)
        c.execute("SELECT public.notificacoes_varrer()")
        caixa = c.execute(
            "SELECT aluno_id, tipo, titulo FROM public.notificacoes ORDER BY aluno_id"
        ).fetchall()
    assert a == [("Material novo para você", "Um ganhou material no seu estilo.", str(UM))]
    assert b == [("Material novo para você", "Um ganhou material no seu estilo.", str(UM))]
    # Conqueror não está na matriz de novo_material: fica registrado, sem aviso.
    assert cc == []
    assert registrados == [(A, UM, True), (B, UM, True), (C, UM, False)]
    assert caixa == [(A, "novo_material", "Material novo para você"), (B, "novo_material", "Material novo para você")]


def test_espera_o_ultimo_conteudo_do_topico():
    with _banco() as c:
        _semear(c)
        um = _material(c, perfil="achiever", conteudo=C100, status="processando_midias")
        _material(c, perfil="achiever", conteudo=C101)
        com_um_gerando = _avisos(c, A)
        _status(c, um, "pronto")
        depois = _avisos(c, A)
    assert com_um_gerando == []
    assert len(depois) == 1


def test_alvo_de_outro_conteudo_num_job_ativo_segura_o_aviso():
    with _banco() as c:
        _semear(c)
        job = c.execute(
            "INSERT INTO public.personalizacao_jobs (kind, status, classe_id, trigger_source)"
            " VALUES ('class_delta_sync', 'processing', %s, 'teste') RETURNING id",
            (f5.TURMA,),
        ).fetchone()[0]
        c.execute(
            "INSERT INTO public.personalizacao_job_targets (job_id, topico_id, conteudo_id, status, brainhex_profile_key)"
            " VALUES (%s, %s, %s, 'pending', 'achiever'), (%s, %s, %s, 'processing', 'achiever')",
            (job, UM, C101, job, UM, C100),
        )
        _material(c, perfil="achiever", conteudo=C100)  # o alvo do próprio conteúdo não segura
        com_alvo = _avisos(c, A)
        c.execute("UPDATE public.personalizacao_job_targets SET status = 'completed'")
        _material(c, perfil="achiever", conteudo=C101)
        depois = _avisos(c, A)
    assert com_alvo == []
    assert len(depois) == 1


def test_ultimo_conteudo_que_falha_nao_cala_o_que_ficou_pronto():
    with _banco() as c:
        _semear(c)
        dois = _material(c, perfil="achiever", conteudo=C101, status="processando_midias")
        _material(c, perfil="achiever", conteudo=C100)
        antes = _avisos(c, A)
        _status(c, dois, "failed")
        depois = _avisos(c, A)
    assert antes == []
    assert len(depois) == 1


def test_topico_so_com_falha_nao_avisa():
    with _banco() as c:
        _semear(c)
        _material(c, perfil="achiever", status="failed")
        avisos = _avisos(c, A)
    assert avisos == []


def test_regeracao_nao_e_novidade():
    with _banco() as c:
        _semear(c)
        pid = _material(c, perfil="achiever")
        c.execute("SELECT public.notificacoes_varrer()")
        _status(c, pid, "processando_midias")
        _status(c, pid, "pronto")
        c.execute("SELECT public.notificacoes_varrer()")
        n = c.execute(
            "SELECT count(*) FROM public.notificacoes WHERE aluno_id = %s AND tipo = 'novo_material'", (A,)
        ).fetchone()[0]
    assert n == 1


def test_um_aviso_por_turma_por_dia_conta_os_topicos():
    with _banco() as c:
        _semear(c)
        _material(c, perfil="achiever", conteudo=C100, topico=UM)
        _material(c, perfil="achiever", conteudo=C110, topico=DOIS)
        pend = c.execute(
            "SELECT corpo, contexto->>'topicos', status FROM public.notificacoes_pendentes"
            " WHERE aluno_id = %s AND tipo = 'novo_material'",
            (A,),
        ).fetchall()
    assert pend == [("2 tópicos ganharam material no seu estilo.", "2", "pendente")]


def test_depois_que_o_aviso_do_dia_sai_o_proximo_topico_fica_quieto():
    with _banco() as c:
        _semear(c)
        _material(c, perfil="achiever", conteudo=C100, topico=UM)
        c.execute("SELECT public.notificacoes_varrer()")
        _material(c, perfil="achiever", conteudo=C110, topico=DOIS)
        c.execute("SELECT public.notificacoes_varrer()")
        caixa = c.execute(
            "SELECT corpo FROM public.notificacoes WHERE aluno_id = %s AND tipo = 'novo_material'", (A,)
        ).fetchall()
        registrados = [(t, tem) for a, t, tem in _registrados(c) if a == A]
    assert caixa == [("Um ganhou material no seu estilo.",)]
    assert registrados == [(UM, True), (DOIS, False)]


def test_matricula_recente_nao_recebe_nem_depois():
    with _banco() as c:
        _semear(c)
        c.execute("UPDATE public.classe_aluno SET created_at = now() - interval '2 hours' WHERE aluno_id = %s", (A,))
        pid = _material(c, perfil="achiever")
        recente = _avisos(c, A)
        c.execute("UPDATE public.classe_aluno SET created_at = now() - interval '3 days' WHERE aluno_id = %s", (A,))
        _status(c, pid, "processando_midias")
        _status(c, pid, "pronto")
        depois = _avisos(c, A)
        registrados = _registrados(c)
    assert recente == [] and depois == []
    assert registrados == [(A, UM, False)]


def test_turma_retida_pelo_estudo_nao_avisa_nem_registra():
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.estudo_coorte (classe_id, estudo, rotulo, braco, baseline_inicio, corte, timezone)"
            " VALUES (%s, 'e', 'r', 'intervencao', current_date, current_date + 10, 'UTC')",
            (f5.TURMA,),
        )
        _material(c, perfil="achiever")
        avisos = _avisos(c, A)
        registrados = _registrados(c)
    assert avisos == []
    assert registrados == []


def test_camada_do_aluno_avisa_so_o_dono():
    with _banco() as c:
        _semear(c)
        c.execute(f"UPDATE public.aluno_perfil SET afinidade = 95 WHERE aluno_id = '{B}' AND perfil_id = {ACH}")
        _material(c, perfil="achiever", aluno=A)
        a, b = _avisos(c, A), _avisos(c, B)
    assert len(a) == 1
    assert b == []


def test_quem_silenciou_nao_recebe():
    with _banco() as c:
        _semear(c)
        c.execute("INSERT INTO public.notificacoes_silenciadas (aluno_id, tipo) VALUES (%s, 'novo_material')", (A,))
        _material(c, perfil="achiever")
        avisos = _avisos(c, A)
    assert avisos == []


def test_falha_no_aviso_nao_derruba_a_geracao():
    with _banco() as c:
        _semear(c)
        _quebrar_a_porta(c)
        pid = _material(c, perfil="achiever")
        gravado = c.execute("SELECT status FROM public.conteudo_personalizado WHERE id = %s", (pid,)).fetchone()[0]
        registrados = _registrados(c)
    assert gravado == "pronto"
    assert registrados == []  # a subtransação do aviso voltou inteira


# --------------------------------------------------------------------------- sequencia


def _dias_antes(c, aluno, *dias_atras: int, segundos: int = 900) -> None:
    for d in dias_atras:
        c.execute(
            "INSERT INTO public.aluno_atividade_diaria (aluno_id, dia, timezone, tempo_uso_seg)"
            " VALUES (%s, (now() AT TIME ZONE 'UTC')::date - %s, 'UTC', %s)",
            (aluno, d, segundos),
        )


def _batida(c, aluno, segundos: int) -> dict:
    p._como(c, aluno)
    r = c.execute("SELECT public.notificacoes_heartbeat(%s, 'UTC')", (segundos,)).fetchone()[0]
    p._dono(c)
    return r


def _sequencias(c, aluno) -> list[tuple]:
    return c.execute(
        "SELECT titulo, corpo FROM public.notificacoes WHERE aluno_id = %s AND tipo = 'sequencia' ORDER BY id",
        (aluno,),
    ).fetchall()


def test_sequencia_avisa_no_marco_quando_o_dia_passa_a_contar():
    with _banco() as c:
        _semear(c)
        _dias_antes(c, A, 1, 2)
        _batida(c, A, 300)  # 5 min: o dia ainda não conta
        antes = _sequencias(c, A)
        r = _batida(c, A, 300)  # 10 min: passa a contar, terceiro dia seguido
        depois = _sequencias(c, A)
        _batida(c, A, 600)
        mais_tarde = _sequencias(c, A)
        posts = c.execute("SELECT count(*) FROM net.posts").fetchone()[0]
    assert antes == []
    assert r["entregues"] == 1
    assert depois == [("Sequência de 3 dias", "Você estudou 3 dias seguidos. Marco alcançado!")]
    assert mais_tarde == depois  # uma vez por dia
    assert posts == 1


def test_fora_do_marco_nao_avisa():
    with _banco() as c:
        _semear(c)
        _dias_antes(c, A, 1, 2, 3)
        _batida(c, A, 600)  # quarto dia
        avisos = _sequencias(c, A)
    assert avisos == []


def test_buraco_recomeca_a_conta_e_dia_so_com_aviso_nao_conta():
    with _banco() as c:
        _semear(c)
        _dias_antes(c, A, 1, 3, 4)  # buraco no dia 2
        _batida(c, A, 600)
        com_buraco = _sequencias(c, A)
        h._cfg(c, "sequencia_minimo_min", 15)  # dias com 15 min; hoje passa a ter 20
        c.execute(
            "UPDATE public.aluno_atividade_diaria SET tempo_uso_seg = 0, notificacoes_dia = 3"
            " WHERE aluno_id = %s AND dia = (now() AT TIME ZONE 'UTC')::date - 1",
            (A,),
        )
        _batida(c, A, 600)
        so_aviso = _sequencias(c, A)
    assert com_buraco == []  # hoje + ontem = 2 dias
    assert so_aviso == []  # ontem só teve aviso, nenhum minuto


def test_marcos_sao_configuraveis():
    with _banco() as c:
        _semear(c)
        c.execute("UPDATE public.notificacoes_config SET valor = '2, 4' WHERE chave = 'sequencia_marcos'")
        _dias_antes(c, A, 1)
        _batida(c, A, 600)
        avisos = _sequencias(c, A)
    assert [t for t, _ in avisos] == ["Sequência de 2 dias"]


def test_sequencia_so_para_o_achiever():
    with _banco() as c:
        _semear(c)
        for aluno in (B, C):
            _dias_antes(c, aluno, 1, 2)
            _batida(c, aluno, 600)
        avisos = c.execute("SELECT count(*) FROM public.notificacoes_pendentes WHERE tipo = 'sequencia'").fetchone()[0]
    assert avisos == 0


def test_heartbeat_nao_cai_quando_o_aviso_falha():
    with _banco() as c:
        _semear(c)
        _dias_antes(c, A, 1, 2)
        _quebrar_a_porta(c)
        r = _batida(c, A, 600)
    assert r["tempo_uso_seg"] == 600


# --------------------------------------------------------------------------- acesso, downgrade


def test_cliente_nao_le_a_memoria_do_material():
    with _banco() as c:
        _semear(c)
        _material(c, perfil="achiever")
        p._como(c, A)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("SELECT count(*) FROM public.notificacoes_material_pronto")
        p._dono(c)


def test_downgrade_desliga_os_produtores():
    with _banco() as c:
        _semear(c)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        _material(c, perfil="achiever")
        _dias_antes(c, A, 1, 2)
        _batida(c, A, 600)
        pend = c.execute("SELECT count(*) FROM public.notificacoes_pendentes").fetchone()[0]
        tabela = c.execute("SELECT to_regclass('public.notificacoes_material_pronto')").fetchone()[0]
        chaves = c.execute(
            "SELECT count(*) FROM public.notificacoes_config WHERE chave = ANY(%s)", (M.CHAVES_CONFIG,)
        ).fetchone()[0]
    assert pend == 0
    assert tabela is None
    assert chaves == 0


def test_upgrade_e_idempotente():
    with _banco() as c:
        for sql in f5.sql_de(M):
            c.execute(sql)
        gatilhos = c.execute(
            "SELECT count(*) FROM pg_trigger WHERE tgname = ANY(%s)", ([M.TRIGGER_MATERIAL, M.TRIGGER_SEQUENCIA],)
        ).fetchone()[0]
    assert gatilhos == 2
