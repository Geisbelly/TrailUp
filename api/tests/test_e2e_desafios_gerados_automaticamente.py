"""`20261120_03`: desafios gerados sozinhos esperam a aprovação do professor.

Banco local montado como o e2e da `20261117_03` (`test_e2e_missao_desafio_criar`): o caminho real do
prêmio (`t1._cadeia()`), a `20261117_01`, a guarda de `missoes` com o gatilho, as policies de
`missoes`, a `20261102_20` inteira (`missao_ia_pedir` e o log), a caixa do professor (`20261102_17`)
com os CHECKs da `20261102_23`, a visibilidade do tópico (`20261110_10`, só as colunas e
`app_topico_liberado`), a orientação da turma (`20261115_01`, só a tabela), a `20261117_02`, a
`20261117_03` e, por cima, a migration daqui.

`fn_app_config_int` vem da `20261021_05` (os limites da `20261102_20` a leem). O worker chama como `service_role`; o professor e o aluno, como `authenticated` com as claims, como o
PostgREST faria. A trava entre o botão e o worker usa duas conexões de verdade. Dados sintéticos.
"""

from __future__ import annotations

import json
import threading
import time
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_desafio_na_missao as t2
from tests import test_e2e_missao_desafio_criar as t3
from tests import test_e2e_premio_de_missao_na_turma as t1

pytestmark = f5.e2e

M = f5.modulo("20261120_03_desafios_gerados_automaticamente.py")
M_T3 = f5.modulo("20261117_03_missao_desafio_criar.py")
M_T2 = f5.modulo("20261117_02_desafio_na_missao.py")
M_T1 = f5.modulo("20261117_01_premio_de_missao_na_turma.py")
M_IA = f5.modulo("20261102_20_missoes_sugeridas_pela_ia.py")
M_NOTIF = f5.modulo("20261102_17_professor_notificacoes.py")
M_ALERTA = f5.modulo("20261102_23_alerta_do_dono_do_painel.py")
M_VIS = f5.modulo("20261110_10_visibilidade_do_topico.py")
M_ORI = f5.modulo("20261115_01_orientacao_da_ia_por_turma.py")
M_DIARIA = f5.modulo("20261021_05_missao_diaria_deterministica.py")

TURMA = f5.TURMA
TURMA_2 = t2.TURMA_2  # do mesmo professor, sem aluno
TURMA_OUTRA = t2.TURMA_OUTRA  # de outro professor
PROF_2 = t2.PROF_2
CONTEUDO = t2.CONTEUDO  # 900, tópico 10
CONTEUDO_2 = t2.CONTEUDO_2  # 901, tópico 10
CONTEUDO_T2 = 902  # tópico 20 (turma 2)
CONTEUDO_OUTRA = 903  # tópico 30 (turma de outro professor)

LOGICA = t3.LOGICA
LOGICA_RESPOSTA = t3.LOGICA_RESPOSTA
CRUZADINHA = t3.CRUZADINHA
CRUZADINHA_RESPOSTA = t3.CRUZADINHA_RESPOSTA

ITENS = [
    {"desafio": LOGICA, "resposta": LOGICA_RESPOSTA},
    {"desafio": {**LOGICA, "enunciado": "Qual é o próximo? 1, 3, 5"}, "resposta": {"aceitas": ["7"]}},
    {"desafio": CRUZADINHA, "resposta": CRUZADINHA_RESPOSTA},
    {"desafio": CRUZADINHA, "resposta": CRUZADINHA_RESPOSTA, "perfis": ["socializer", "seeker"]},
]

# Só a regra de "liberado" da `20261110_10`: as demais funções de lá não entram neste banco.
_FUNCOES_VIS = M_VIS.FUNCOES
APP_TOPICO_LIBERADO = _FUNCOES_VIS[: _FUNCOES_VIS.index("-- Tópicos que EU")]


def _banco(com_migration: bool = True):
    return f5.banco(
        *t1._cadeia(),
        *f5.sql_de(M_T1),
        t2.METRICAS,
        t2.TABELA_RETENCAO,
        M_T2.M06.guarda(),
        t2.GATILHO_GUARDA,
        *t2._policies_de_missoes(),
        M_DIARIA.CONFIG,  # `fn_app_config_int`, que os limites da `20261102_20` leem
        *f5.sql_de(M_IA),
        M_NOTIF.TABELA,
        M_NOTIF.NOTIFICAR,
        M_ALERTA.TIPOS,
        M_VIS.COLUNAS,
        APP_TOPICO_LIBERADO,
        M_ORI.TABELA,
        *f5.sql_de(M_T2),
        *f5.sql_de(M_T3),
        *(f5.sql_de(M) if com_migration else []),
    )


def _envelhecer(c, conteudo: int, minutos: int = 120) -> None:
    """Só o dono do banco escreve `atualizado_em` por fora do gatilho (dado de teste)."""
    c.execute("ALTER TABLE public.conteudos DISABLE TRIGGER trg_conteudos_atualizado_em")
    c.execute(
        "UPDATE public.conteudos SET atualizado_em = now() - make_interval(mins => %s) WHERE id = %s",
        (minutos, conteudo),
    )
    c.execute("ALTER TABLE public.conteudos ENABLE TRIGGER trg_conteudos_atualizado_em")


def _semear(c) -> None:
    t2._semear(c)
    c.execute(
        f"""
INSERT INTO public.topicos (id, classe_id, nome, ordem) OVERRIDING SYSTEM VALUE VALUES (30, {TURMA_OUTRA}, 'Alheio', 1);
INSERT INTO auth.users (id, email) VALUES ('{uuid.UUID(int=24)}', 'd@teste.invalid');
INSERT INTO public.alunos (id, nome, email) VALUES ('{uuid.UUID(int=24)}', 'D', 'd@teste.invalid');
INSERT INTO public.classe_aluno (classe_id, aluno_id, created_at) VALUES ({TURMA_OUTRA}, '{uuid.UUID(int=24)}', now());
INSERT INTO public.conteudos (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES
  ({CONTEUDO_T2}, 20, 'Da turma 2'), ({CONTEUDO_OUTRA}, 30, 'Alheio');
UPDATE public.topicos SET publicacao = 'publicado';
UPDATE public.conteudos SET titulo = 'Estruturas de dados' WHERE id = {CONTEUDO};
UPDATE public.conteudos SET conteudo = 'Listas, pilhas e filas guardam dados em ordem.', tipo = 'texto';
"""
    )
    for conteudo in (CONTEUDO, CONTEUDO_2, CONTEUDO_T2, CONTEUDO_OUTRA):
        _envelhecer(c, conteudo)


def _servidor(c, sql: str, params: tuple = ()):
    """A chamada da API: `service_role`, sem claims."""
    with c.transaction():
        c.execute("SET LOCAL ROLE service_role")
        return c.execute(sql, params).fetchall()


def _candidatos(c, limite: int | None = None, classes: list[int] | None = None) -> list[int]:
    return [
        r[0]
        for r in _servidor(
            c, "SELECT conteudo_id FROM public.fn_desafios_auto_candidatos(%s, %s::bigint[])", (limite, classes)
        )
    ]


def _reivindicar(c, limite: int = 5, trava: int = 600, classes: list[int] | None = None) -> list[int]:
    return [
        r[0]
        for r in _servidor(
            c, "SELECT * FROM public.fn_desafios_auto_reivindicar(%s, %s, %s::bigint[])", (limite, trava, classes)
        )
    ]


def _registrar(c, conteudo: int, itens: list) -> dict:
    return _servidor(
        c, "SELECT public.fn_missao_desafio_registrar_auto(%s, %s)", (conteudo, json.dumps(itens))
    )[0][0]


def _falhou(c, conteudo: int, erro: str, espera: int | None) -> str:
    return _servidor(c, "SELECT public.fn_desafios_auto_falhou(%s, %s, %s)", (conteudo, erro, espera))[0][0]


def _tentativa(c, conteudo: int) -> tuple | None:
    return c.execute(
        "SELECT estado, tentativas, proxima_em, erro FROM public.desafios_auto_tentativas WHERE conteudo_id = %s",
        (conteudo,),
    ).fetchone()


def _config(c, chave: str, valor: str) -> None:
    c.execute("UPDATE public.app_config SET valor = %s WHERE chave = %s", (valor, chave))


def _decidir(c, quem: uuid.UUID, grupo: uuid.UUID, aprovar: bool, motivo: str | None = None) -> int:
    with c.transaction():
        t1._como_cliente(c, quem)
        return c.execute(
            "SELECT public.missao_desafio_decidir(%s, %s, %s)", (grupo, aprovar, motivo)
        ).fetchone()[0]


def _grupos(c, conteudo: int = CONTEUDO) -> list[uuid.UUID]:
    return [
        r[0]
        for r in c.execute(
            "SELECT DISTINCT desafio_grupo FROM public.missoes WHERE conteudo_id = %s AND desafio IS NOT NULL"
            " ORDER BY 1",
            (conteudo,),
        ).fetchall()
    ]


# --------------------------------------------------------------------------------------- candidatos


def test_candidato_entra_com_todas_as_regras() -> None:
    with _banco() as c:
        _semear(c)
        # 902 é de turma sem aluno; 903, de turma de outro professor (com aluno e geração ligada).
        assert _candidatos(c) == [CONTEUDO, CONTEUDO_2, CONTEUDO_OUTRA]
        assert _candidatos(c, 1) == [CONTEUDO]
        # Conteúdo só com arquivo, ou só com mídia, também tem material.
        c.execute("UPDATE public.conteudos SET conteudo = '  ' WHERE id IN (%s, %s)", (CONTEUDO, CONTEUDO_2))
        c.execute(
            "INSERT INTO public.fontes_personalizacao (classe_id, conteudo_id, tipo, metadata) VALUES"
            " (%s, %s, 'pdf', '{\"texto_extraido\": \"Texto do PDF\"}')",
            (TURMA, CONTEUDO),
        )
        c.execute(
            "UPDATE public.conteudos SET metadata = '{\"media_storage_path\": \"fontes/x.mp4\"}' WHERE id = %s",
            (CONTEUDO_2,),
        )
        _envelhecer(c, CONTEUDO)
        _envelhecer(c, CONTEUDO_2)
        assert _candidatos(c, classes=[TURMA]) == [CONTEUDO, CONTEUDO_2]


def _so_com_fonte(c, visibilidade: str, metadata: dict, descricao: str | None) -> list[int]:
    """O conteúdo 900 sem texto próprio, com uma fonte só; devolve os candidatos da turma."""
    c.execute("UPDATE public.conteudos SET conteudo = NULL WHERE id = %s", (CONTEUDO,))
    c.execute("DELETE FROM public.fontes_personalizacao WHERE conteudo_id = %s", (CONTEUDO,))
    c.execute(
        "INSERT INTO public.fontes_personalizacao (classe_id, conteudo_id, tipo, visibilidade, metadata, descricao,"
        " nome_arquivo) VALUES (%s, %s, 'pdf', %s, %s, %s, 'a.pdf')",
        (TURMA, CONTEUDO, visibilidade, json.dumps(metadata), descricao),
    )
    _envelhecer(c, CONTEUDO)
    return _candidatos(c, classes=[TURMA])


def test_fora_com_fonte_so_do_aluno() -> None:
    with _banco() as c:
        _semear(c)
        assert CONTEUDO not in _so_com_fonte(c, "aluno", {"texto_extraido": "Texto do aluno"}, "Descrição")


def test_fora_com_fonte_da_turma_sem_texto() -> None:
    with _banco() as c:
        _semear(c)
        assert CONTEUDO not in _so_com_fonte(c, "classe", {"outra": "x", "texto_extraido": "   "}, "  ")
        assert CONTEUDO not in _so_com_fonte(c, "classe", {}, None)


def test_dentro_com_fonte_da_turma_com_texto() -> None:
    with _banco() as c:
        _semear(c)
        for metadata, descricao in (
            ({"texto_extraido": "Texto do PDF"}, None),
            ({"transcricao": "Fala"}, None),
            ({"transcript": "Fala"}, None),
            ({"text": "Texto"}, None),
            ({}, "Slides da aula"),
        ):
            assert CONTEUDO in _so_com_fonte(c, "classe", metadata, descricao), (metadata, descricao)
            # E o contexto manda esse texto: candidato e contexto concordam.
            ctx = _servidor(c, "SELECT public.fn_desafios_auto_contexto(%s)", (CONTEUDO,))[0][0]
            assert ctx["fileContents"].strip(), (metadata, descricao)


def test_fora_se_geracao_automatica_desligada() -> None:
    with _banco() as c:
        _semear(c)
        c.execute("UPDATE public.professor SET geracao_automatica = false WHERE id = %s", (f5.PROF,))
        assert _candidatos(c) == [CONTEUDO_OUTRA]


def test_fora_sem_aluno() -> None:
    with _banco() as c:
        _semear(c)
        c.execute("DELETE FROM public.classe_aluno WHERE classe_id = %s", (TURMA,))
        assert _candidatos(c, classes=[TURMA, TURMA_2]) == []


@pytest.mark.parametrize("estado", ["pendente", "recusada", "inativa", "aprovada"])
def test_fora_com_desafio_em_qualquer_estado(estado: str) -> None:
    with _banco() as c:
        _semear(c)
        t3._criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind"])
        if estado == "pendente":
            c.execute("UPDATE public.missoes SET aprovacao = 'pendente' WHERE conteudo_id = %s", (CONTEUDO,))
        elif estado == "recusada":
            c.execute(
                "UPDATE public.missoes SET aprovacao = 'recusada', motivo_recusa = 'não' WHERE conteudo_id = %s",
                (CONTEUDO,),
            )
        elif estado == "inativa":
            c.execute("UPDATE public.missoes SET ativa = false WHERE conteudo_id = %s", (CONTEUDO,))
        assert CONTEUDO not in _candidatos(c)
        assert CONTEUDO_2 in _candidatos(c)


def test_fora_com_tentativa_gerado_ou_sem_desafio() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.desafios_auto_tentativas (conteudo_id, estado, iniciada_em) VALUES"
            " (%s, 'gerado', now()), (%s, 'sem_desafio', now())",
            (CONTEUDO, CONTEUDO_2),
        )
        assert _candidatos(c, classes=[TURMA]) == []


def test_fora_em_rascunho_e_agendado_futuro() -> None:
    with _banco() as c:
        _semear(c)
        c.execute("UPDATE public.topicos SET publicacao = 'rascunho' WHERE id = 10")
        assert _candidatos(c, classes=[TURMA]) == []
        c.execute("UPDATE public.topicos SET publicacao = 'agendado', publicar_em = now() + interval '1 day' WHERE id = 10")
        assert _candidatos(c, classes=[TURMA]) == []


def test_dentro_agendado_vencido() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "UPDATE public.topicos SET publicacao = 'agendado', publicar_em = now() - interval '1 minute' WHERE id = 10"
        )
        assert _candidatos(c, classes=[TURMA]) == [CONTEUDO, CONTEUDO_2]


def test_fora_editado_ha_menos_de_carencia() -> None:
    with _banco() as c:
        _semear(c)
        _envelhecer(c, CONTEUDO, 59)
        assert _candidatos(c, classes=[TURMA]) == [CONTEUDO_2]
        _config(c, "desafios_auto_carencia_min", "30")
        assert _candidatos(c, classes=[TURMA]) == [CONTEUDO, CONTEUDO_2]
        # Editar de verdade volta a contar a carência do zero.
        c.execute("UPDATE public.conteudos SET conteudo = 'Outro texto' WHERE id = %s", (CONTEUDO_2,))
        assert _candidatos(c, classes=[TURMA]) == [CONTEUDO]


def test_fora_so_com_titulo() -> None:
    with _banco() as c:
        _semear(c)
        c.execute("UPDATE public.conteudos SET conteudo = NULL WHERE id = %s", (CONTEUDO,))
        c.execute("UPDATE public.conteudos SET conteudo = ' ', metadata = '{\"outra\": 1}' WHERE id = %s", (CONTEUDO_2,))
        _envelhecer(c, CONTEUDO)
        _envelhecer(c, CONTEUDO_2)
        assert _candidatos(c, classes=[TURMA]) == []


def test_fora_de_p_classes() -> None:
    with _banco() as c:
        _semear(c)
        assert _candidatos(c, classes=[TURMA_OUTRA]) == [CONTEUDO_OUTRA]
        assert _candidatos(c, classes=[999]) == []


def test_ordem_por_topico_e_antiguidade() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.conteudos (id, topico_id, titulo, tipo, conteudo, created_at) OVERRIDING SYSTEM VALUE"
            " VALUES (910, 11, 'Tópico 2, antigo', 'texto', 'x', now() - interval '10 days'),"
            " (911, 10, 'Tópico 1, recente', 'texto', 'x', now() - interval '1 day'),"
            " (912, 10, 'Tópico 1, antigo', 'texto', 'x', now() - interval '5 days')"
        )
        c.execute("UPDATE public.conteudos SET created_at = now() WHERE id IN (%s, %s)", (CONTEUDO, CONTEUDO_2))
        for conteudo in (910, 911, 912, CONTEUDO, CONTEUDO_2):
            _envelhecer(c, conteudo)
        assert _candidatos(c, classes=[TURMA]) == [912, 911, CONTEUDO, CONTEUDO_2, 910]


def test_atualizado_em_ignora_valor_do_cliente() -> None:
    with _banco() as c:
        _semear(c)
        antes = c.execute("SELECT atualizado_em FROM public.conteudos WHERE id = %s", (CONTEUDO,)).fetchone()[0]
        # Só a coluna: não é edição, o valor fica como estava.
        c.execute("UPDATE public.conteudos SET atualizado_em = '2000-01-01' WHERE id = %s", (CONTEUDO,))
        assert c.execute("SELECT atualizado_em FROM public.conteudos WHERE id = %s", (CONTEUDO,)).fetchone()[0] == antes
        # Nada mudou: também não é edição.
        c.execute("UPDATE public.conteudos SET titulo = titulo WHERE id = %s", (CONTEUDO,))
        assert c.execute("SELECT atualizado_em FROM public.conteudos WHERE id = %s", (CONTEUDO,)).fetchone()[0] == antes
        # Edição com valor do cliente: vale now().
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            c.execute(
                "UPDATE public.conteudos SET titulo = 'Novo', atualizado_em = '2000-01-01' WHERE id = %s", (CONTEUDO,)
            )
            agora, gravado = c.execute(
                "SELECT now(), atualizado_em FROM public.conteudos WHERE id = %s", (CONTEUDO,)
            ).fetchone()
        assert gravado == agora
        # INSERT com valor do cliente: vale now().
        c.execute(
            "INSERT INTO public.conteudos (id, topico_id, titulo, tipo, atualizado_em) OVERRIDING SYSTEM VALUE"
            " VALUES (920, 10, 'X', 'texto', '2000-01-01')"
        )
        assert c.execute(
            "SELECT atualizado_em > now() - interval '1 minute' FROM public.conteudos WHERE id = 920"
        ).fetchone()[0]


def test_reordenar_nao_e_edicao() -> None:
    """O console reordena gravando só `ordem`, conteúdo por conteúdo: isso não reinicia a carência."""
    with _banco() as c:
        _semear(c)
        antes = c.execute("SELECT atualizado_em FROM public.conteudos WHERE id = %s", (CONTEUDO,)).fetchone()[0]
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            c.execute("UPDATE public.conteudos SET ordem = 7 WHERE id = %s", (CONTEUDO,))
        assert c.execute(
            "SELECT ordem, atualizado_em FROM public.conteudos WHERE id = %s", (CONTEUDO,)
        ).fetchone() == (7, antes)
        assert _candidatos(c, classes=[TURMA]) == [CONTEUDO, CONTEUDO_2]
        # Mudar o texto é edição.
        c.execute("UPDATE public.conteudos SET conteudo = 'Outro texto', ordem = 8 WHERE id = %s", (CONTEUDO,))
        assert c.execute(
            "SELECT atualizado_em > now() - interval '1 minute' FROM public.conteudos WHERE id = %s", (CONTEUDO,)
        ).fetchone()[0]
        assert _candidatos(c, classes=[TURMA]) == [CONTEUDO_2]


def test_backfill_usa_created_at_sem_disparar_gatilhos() -> None:
    with _banco(com_migration=False) as c:
        _semear_sem_migration(c)
        c.execute(
            "CREATE TABLE public.t_disparos (n int);"
            " CREATE FUNCTION public.t_conta() RETURNS trigger LANGUAGE plpgsql AS"
            " $$ BEGIN INSERT INTO public.t_disparos VALUES (1); RETURN NEW; END $$;"
            " CREATE TRIGGER t_conta AFTER UPDATE ON public.conteudos FOR EACH ROW EXECUTE FUNCTION public.t_conta();"
        )
        c.execute("UPDATE public.conteudos SET created_at = '2026-01-02T03:04:05Z' WHERE id = %s", (CONTEUDO,))
        c.execute("UPDATE public.conteudos SET created_at = NULL WHERE id = %s", (CONTEUDO_2,))
        c.execute("DELETE FROM public.t_disparos")
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert c.execute("SELECT count(*) FROM public.t_disparos").fetchone()[0] == 0
        assert c.execute(
            "SELECT atualizado_em = created_at FROM public.conteudos WHERE id = %s", (CONTEUDO,)
        ).fetchone()[0]
        assert c.execute(
            "SELECT atualizado_em IS NOT NULL FROM public.conteudos WHERE id = %s", (CONTEUDO_2,)
        ).fetchone()[0]
        # Rodar de novo não reescreve o que o gatilho já cuida.
        c.execute("UPDATE public.conteudos SET titulo = 'Editado' WHERE id = %s", (CONTEUDO,))
        editado = c.execute("SELECT atualizado_em FROM public.conteudos WHERE id = %s", (CONTEUDO,)).fetchone()[0]
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert c.execute("SELECT atualizado_em FROM public.conteudos WHERE id = %s", (CONTEUDO,)).fetchone()[0] == editado


def _semear_sem_migration(c) -> None:
    t2._semear(c)


# -------------------------------------------------------------------------------------- reivindicar


def test_reivindicar_respeita_teto_do_dia_e_ligado() -> None:
    with _banco() as c:
        _semear(c)
        _config(c, "desafios_auto_ligado", "false")
        assert _reivindicar(c) == []
        _config(c, "desafios_auto_ligado", "true")
        _config(c, "desafios_auto_por_dia", "2")
        assert _reivindicar(c, limite=1) == [CONTEUDO]
        assert _tentativa(c, CONTEUDO)[0:2] == ("gerando", 0)
        assert _reivindicar(c, limite=5) == [CONTEUDO_2]
        # O teto do dia acabou, mesmo sobrando candidato.
        assert CONTEUDO_OUTRA in _candidatos(c)
        assert _reivindicar(c, limite=5) == []
        # Tentativa de ontem (no fuso da cota) não conta.
        c.execute("UPDATE public.desafios_auto_tentativas SET iniciada_em = now() - interval '2 days', estado = 'gerado'")
        assert _reivindicar(c, limite=5) == [CONTEUDO_OUTRA]


def test_config_invalida_vira_padrao() -> None:
    with _banco() as c:
        _config(c, "desafios_auto_por_dia", "muitos")
        _config(c, "desafios_auto_ligado", "talvez")
        c.execute("DELETE FROM public.app_config WHERE chave = 'desafios_auto_carencia_min'")
        cfg = _servidor(c, "SELECT public.fn_desafios_auto_config()")[0][0]
        assert cfg == {"ligado": True, "por_passada": 2, "intervalo_seg": 600, "por_dia": 20, "carencia_min": 60}


def test_reivindicar_nao_pega_quem_esta_gerando() -> None:
    with _banco() as c:
        _semear(c)
        assert _reivindicar(c, limite=1, classes=[TURMA]) == [CONTEUDO]
        # Outro laço, na trava: pula o que está gerando e pega o próximo.
        assert _reivindicar(c, limite=5, classes=[TURMA]) == [CONTEUDO_2]
        assert _reivindicar(c, limite=5, classes=[TURMA]) == []


def test_reivindicar_retoma_trava_vencida() -> None:
    """Foco 2: a API caiu no meio, a linha ficou `gerando`. Passada a trava, volta sem contar falha."""
    with _banco() as c:
        _semear(c)
        assert _reivindicar(c, limite=1, classes=[TURMA]) == [CONTEUDO]
        c.execute(
            "UPDATE public.desafios_auto_tentativas SET iniciada_em = now() - interval '11 minutes' WHERE conteudo_id = %s",
            (CONTEUDO,),
        )
        assert _reivindicar(c, limite=1, trava=600, classes=[TURMA]) == [CONTEUDO]
        estado, tentativas, _, _ = _tentativa(c, CONTEUDO)
        assert (estado, tentativas) == ("gerando", 0)
        assert c.execute(
            "SELECT iniciada_em > now() - interval '1 minute' FROM public.desafios_auto_tentativas WHERE conteudo_id = %s",
            (CONTEUDO,),
        ).fetchone()[0]


# Os candidatos de verdade, e depois uma pausa: o laço já tem a lista e ainda não escreveu nada.
_PAUSA_NOS_CANDIDATOS = """
ALTER FUNCTION public.fn_desafios_auto_candidatos(integer, bigint[]) RENAME TO t_candidatos_reais;
CREATE FUNCTION public.fn_desafios_auto_candidatos(p_limite integer, p_classes bigint[] DEFAULT NULL)
RETURNS TABLE (conteudo_id bigint, classe_id bigint) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.t_candidatos_reais(p_limite, p_classes);
  PERFORM pg_advisory_xact_lock(4242);
END $$;
"""


def test_reivindicar_confere_carencia_de_novo() -> None:
    """Foco 5: editado (ou com desafio aplicado pelo botão) entre a lista e a reivindicação.

    Duas conexões de verdade. A segura a trava 4242; o laço (B) lê a lista, que traz 900 e 901, e fica
    preso antes do primeiro INSERT. Com ele preso, A edita o 900 e aplica um desafio no 901 pelo botão,
    com commit. Solto, o laço não pode pegar nenhum dos dois: só a reconferência dentro do INSERT vê isso.
    """
    with _banco() as c:
        _semear(c)
        c.execute(_PAUSA_NOS_CANDIDATOS)
        assert _candidatos(c, classes=[TURMA]) == [CONTEUDO, CONTEUDO_2]
        dsn = f5._dsn_para(c.info.dbname)
        resultado: dict = {}
        with psycopg.connect(dsn, autocommit=True) as a, psycopg.connect(dsn, autocommit=True) as b:
            a.execute("SELECT pg_advisory_lock(4242)")
            pid_b = b.info.backend_pid

            def laco() -> None:
                resultado["b"] = [r[0] for r in _servidor(
                    b, "SELECT * FROM public.fn_desafios_auto_reivindicar(5, 600, %s::bigint[])", ([TURMA],)
                )]

            fio = threading.Thread(target=laco)
            fio.start()
            preso = False
            for _ in range(100):
                preso = c.execute(
                    "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = %s AND locktype = 'advisory' AND NOT granted)",
                    (pid_b,),
                ).fetchone()[0]
                if preso:
                    break
                time.sleep(0.05)
            assert preso and fio.is_alive()
            a.execute("UPDATE public.conteudos SET conteudo = 'Mudou agora' WHERE id = %s", (CONTEUDO,))
            t3._criar(a, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind"], conteudo=CONTEUDO_2)
            a.execute("SELECT pg_advisory_unlock(4242)")
            fio.join(10)
            assert not fio.is_alive()
        assert resultado["b"] == []
        assert _tentativa(c, CONTEUDO) is None
        assert _tentativa(c, CONTEUDO_2) is None


def test_reivindicar_volta_depois_da_espera() -> None:
    with _banco() as c:
        _semear(c)
        _reivindicar(c, limite=1, classes=[TURMA])
        assert _falhou(c, CONTEUDO, "429 por minuto", 15) == "esperando"
        assert _reivindicar(c, limite=5, classes=[TURMA]) == [CONTEUDO_2]
        c.execute("UPDATE public.desafios_auto_tentativas SET proxima_em = now() - interval '1 second'")
        assert _reivindicar(c, limite=5, classes=[TURMA]) == [CONTEUDO]


def test_cliente_nao_executa_funcoes_de_servidor() -> None:
    with _banco() as c:
        _semear(c)
        for sql in (
            "SELECT public.fn_desafios_auto_config()",
            "SELECT * FROM public.fn_desafios_auto_candidatos(5)",
            "SELECT * FROM public.fn_desafios_auto_reivindicar(5, 600)",
            f"SELECT public.fn_desafios_auto_contexto({CONTEUDO})",
            f"SELECT public.fn_missao_desafio_registrar_auto({CONTEUDO}, '[]')",
            f"SELECT public.fn_desafios_auto_falhou({CONTEUDO}, 'x', NULL)",
            f"SELECT * FROM public.fn_missao_desafio_gravar({CONTEUDO}, '{{}}', '{{}}', ARRAY['mastermind'],"
            f" 'aprovada', '{f5.PROF}')",
        ):
            for papel in ("authenticated", "anon"):
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    with c.transaction():
                        t1._como_cliente(c, f5.PROF, papel)
                        c.execute(sql)
        assert c.execute("SELECT count(*) FROM public.desafios_auto_tentativas").fetchone()[0] == 0
        # A tabela é só do servidor: sem policy e sem GRANT para cliente.
        for papel in ("authenticated", "anon"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with c.transaction():
                    t1._como_cliente(c, f5.PROF, papel)
                    c.execute("SELECT count(*) FROM public.desafios_auto_tentativas")


# ----------------------------------------------------------------------------------------- registrar


def test_registrar_grava_pendente_ativa_e_criado_por_dono() -> None:
    with _banco() as c:
        _semear(c)
        assert _reivindicar(c, limite=1, classes=[TURMA]) == [CONTEUDO]
        assert _registrar(c, CONTEUDO, ITENS) == {"estado": "gerado", "gravados": 4, "pulados": 0}
        linhas = c.execute(
            "SELECT aprovacao, ativa, criado_por, origem, desafio_grupo, perfil_alvo, desafio->>'tipo'"
            " FROM public.missoes WHERE conteudo_id = %s AND desafio IS NOT NULL ORDER BY id",
            (CONTEUDO,),
        ).fetchall()
        assert len(linhas) == 8
        assert {(a, at, cp, o) for a, at, cp, o, *_ in linhas} == {("pendente", True, f5.PROF, "ia")}
        grupos = {g for *_, g, _, _ in linhas}
        assert len(grupos) == 4
        perfis = {}
        for *_, g, p, tipo in linhas:
            perfis.setdefault((g, tipo), set()).add(p)
        assert sorted((tipo, tuple(sorted(p))) for (_, tipo), p in perfis.items()) == [
            ("cruzadinha", ("mastermind", "seeker")),
            ("cruzadinha", ("seeker", "socializer")),
            ("logica", ("achiever", "mastermind")),
            ("logica", ("achiever", "mastermind")),
        ]
        assert c.execute(
            "SELECT count(*) FROM public.missao_desafio_gabarito WHERE desafio_grupo = ANY(%s)", (list(grupos),)
        ).fetchone()[0] == 4
        assert _tentativa(c, CONTEUDO)[0] == "gerado"
        # O sinal não sobra para o resto da transação do servidor.
        with c.transaction():
            c.execute("SET LOCAL ROLE service_role")
            c.execute("SELECT public.fn_missao_desafio_registrar_auto(%s, %s)", (CONTEUDO_2, json.dumps(ITENS[:1])))
            assert c.execute("SELECT current_setting('app.desafio_gravando', true)").fetchone()[0] in ("", None)
        # Fora do log da IA (#151).
        assert c.execute("SELECT count(*) FROM public.missoes_ia_log").fetchone()[0] == 0


def test_registrar_pula_item_invalido() -> None:
    with _banco() as c:
        _semear(c)
        grade_errada = {"palavras": {**t3.PALAVRAS, "4h": "ALE"}}
        itens = [ITENS[0], {"desafio": CRUZADINHA, "resposta": grade_errada}]
        assert _registrar(c, CONTEUDO, itens) == {"estado": "gerado", "gravados": 1, "pulados": 1}
        assert len(_grupos(c)) == 1


def test_registrar_nenhum_valido_marca_sem_desafio() -> None:
    with _banco() as c:
        _semear(c)
        itens = [
            {"desafio": {"tipo": "sudoku"}, "resposta": {}},
            {"desafio": LOGICA, "resposta": LOGICA_RESPOSTA, "perfis": ["gamer"]},
            "não é objeto",
        ]
        assert _registrar(c, CONTEUDO, itens) == {"estado": "sem_desafio", "gravados": 0, "pulados": 3}
        assert _registrar(c, CONTEUDO_2, []) == {"estado": "sem_desafio", "gravados": 0, "pulados": 0}
        assert _tentativa(c, CONTEUDO)[0] == "sem_desafio"
        assert _grupos(c) == []
        assert CONTEUDO not in _candidatos(c)
        assert c.execute("SELECT count(*) FROM public.professor_notificacoes").fetchone()[0] == 0


def test_registrar_depois_do_botao_devolve_ja_tinha() -> None:
    with _banco() as c:
        _semear(c)
        t3._criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind"])
        assert _registrar(c, CONTEUDO, ITENS) == {"estado": "ja_tinha", "gravados": 0, "pulados": 0}
        assert len(_grupos(c)) == 1
        assert _tentativa(c, CONTEUDO)[0] == "gerado"
        # O botão, ao contrário, continua somando ao que já existe.
        t3._criar(c, f5.PROF, CRUZADINHA, CRUZADINHA_RESPOSTA, ["seeker"])
        assert len(_grupos(c)) == 2


def test_botao_e_worker_concorrentes_gravam_um_so() -> None:
    """Foco 1: o professor aplica pelo botão enquanto o worker grava o mesmo conteúdo."""
    with _banco() as c:
        _semear(c)
        dsn = f5._dsn_para(c.info.dbname)
        resultado: dict = {}
        with psycopg.connect(dsn) as a, psycopg.connect(dsn, autocommit=True) as b:
            t1._como_cliente(a, f5.PROF)
            a.execute(
                "SELECT * FROM public.missao_desafio_criar(%s, %s, %s, %s::text[])",
                (CONTEUDO, json.dumps(LOGICA), json.dumps(LOGICA_RESPOSTA), ["mastermind"]),
            ).fetchall()
            pid_b = b.info.backend_pid

            def worker() -> None:
                with b.transaction():
                    b.execute("SET LOCAL ROLE service_role")
                    resultado["b"] = b.execute(
                        "SELECT public.fn_missao_desafio_registrar_auto(%s, %s)", (CONTEUDO, json.dumps(ITENS))
                    ).fetchone()[0]

            fio = threading.Thread(target=worker)
            fio.start()
            # B fica preso na trava consultiva de A.
            preso = False
            for _ in range(100):
                preso = c.execute(
                    "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = %s AND locktype = 'advisory' AND NOT granted)",
                    (pid_b,),
                ).fetchone()[0]
                if preso:
                    break
                time.sleep(0.05)
            assert preso
            assert fio.is_alive()
            a.commit()
            fio.join(10)
            assert not fio.is_alive()
        assert resultado["b"] == {"estado": "ja_tinha", "gravados": 0, "pulados": 0}
        assert len(_grupos(c)) == 1
        assert c.execute(
            "SELECT DISTINCT aprovacao FROM public.missoes WHERE conteudo_id = %s AND desafio IS NOT NULL", (CONTEUDO,)
        ).fetchall() == [("aprovada",)]


def test_pendente_invisivel_ao_aluno() -> None:
    with _banco() as c:
        _semear(c)
        _registrar(c, CONTEUDO, ITENS)
        assert t2._conta(c, f5.A, "SELECT count(*) FROM public.missoes WHERE desafio IS NOT NULL") == 0
        assert t2._conta(c, f5.A, "SELECT count(*) FROM public.missao_desafio_gabarito") == 0
        # O professor dono vê o que espera a decisão dele, com a resposta para conferir.
        assert t2._conta(c, f5.PROF, "SELECT count(*) FROM public.missoes WHERE desafio IS NOT NULL") == 8
        assert t2._conta(c, f5.PROF, "SELECT count(*) FROM public.missao_desafio_gabarito") == 4
        # Controle: aprovado, o aluno passa a ver a missão (o gabarito, nunca).
        assert _decidir(c, f5.PROF, _grupos(c)[0], True) == 2
        assert t2._conta(c, f5.A, "SELECT count(*) FROM public.missoes WHERE desafio IS NOT NULL") == 2
        assert t2._conta(c, f5.A, "SELECT count(*) FROM public.missao_desafio_gabarito") == 0


def test_notifica_uma_vez_por_turma_e_dia() -> None:
    with _banco() as c:
        _semear(c)
        _registrar(c, CONTEUDO, ITENS[:3])
        _registrar(c, CONTEUDO_2, ITENS[:1])
        linhas = c.execute(
            "SELECT professor_id, classe_id, tipo, destino, contagem, titulo, corpo, dedupe_key, lida_em"
            " FROM public.professor_notificacoes"
        ).fetchall()
        assert len(linhas) == 1
        prof, classe, tipo, destino, contagem, titulo, corpo, chave, lida = linhas[0]
        assert (prof, classe, tipo, destino, contagem, lida) == (f5.PROF, TURMA, "desafio_para_aprovar", "missoes", 2, None)
        assert titulo == "Desafios esperando aprovação"
        assert corpo == "4 desafios esperando aprovação em T"
        assert chave.startswith(f"desafios_auto:{TURMA}:")


# --------------------------------------------------------------------------------------------- falhas


def test_falhou_espera_2_elevado_n_e_para_na_terceira() -> None:
    with _banco() as c:
        _semear(c)
        _reivindicar(c, limite=1, classes=[TURMA])
        erro = "timeout ao chamar a edge\nlinha 2 com material do professor"
        assert _falhou(c, CONTEUDO, erro, None) == "falhou"
        estado, n, proxima, gravado = _tentativa(c, CONTEUDO)
        assert (estado, n, gravado) == ("falhou", 1, "timeout ao chamar a edge")
        horas = c.execute("SELECT round(extract(epoch FROM %s - now()) / 3600)", (proxima,)).fetchone()[0]
        assert horas == 2
        assert CONTEUDO not in _candidatos(c)
        assert _falhou(c, CONTEUDO, "x" * 1000, None) == "falhou"
        estado, n, proxima, gravado = _tentativa(c, CONTEUDO)
        assert n == 2 and len(gravado) == 300
        assert c.execute("SELECT round(extract(epoch FROM %s - now()) / 3600)", (proxima,)).fetchone()[0] == 4
        c.execute("UPDATE public.desafios_auto_tentativas SET proxima_em = now() - interval '1 second'")
        assert CONTEUDO in _candidatos(c)
        assert _falhou(c, CONTEUDO, "de novo", None) == "falhou"
        assert _tentativa(c, CONTEUDO)[1:3] == (3, None)
        assert CONTEUDO not in _candidatos(c)
        assert CONTEUDO not in _reivindicar(c, limite=5, classes=[TURMA])


def test_esperando_nao_conta_falha() -> None:
    with _banco() as c:
        _semear(c)
        _reivindicar(c, limite=1, classes=[TURMA])
        for _ in range(5):
            assert _falhou(c, CONTEUDO, "429 limite por minuto", 15) == "esperando"
        estado, n, proxima, _ = _tentativa(c, CONTEUDO)
        assert (estado, n) == ("esperando", 0)
        assert c.execute("SELECT round(extract(epoch FROM %s - now()) / 60)", (proxima,)).fetchone()[0] == 15
        assert CONTEUDO not in _candidatos(c)


def test_falhou_nao_desfaz_gerado() -> None:
    with _banco() as c:
        _semear(c)
        _registrar(c, CONTEUDO, ITENS[:1])
        assert _falhou(c, CONTEUDO, "atrasado", None) == "gerado"
        assert _tentativa(c, CONTEUDO)[0:2] == ("gerado", 0)


# ---------------------------------------------------------------------------------- missões da IA


def test_missao_ia_pedir_ignora_desafio_pendente() -> None:
    with _banco() as c:
        _semear(c)
        _registrar(c, CONTEUDO, ITENS)
        assert c.execute(
            "SELECT count(*) FROM public.missoes WHERE origem = 'ia' AND aprovacao = 'pendente'"
        ).fetchone()[0] == 8
        with c.transaction():
            t1._como_cliente(c, f5.PROF)
            pedido = c.execute("SELECT public.missao_ia_pedir(%s, NULL, NULL)", (TURMA,)).fetchone()[0]
        assert pedido is not None
        # Os títulos que vão ao modelo também não trazem os desafios.
        ctx = _servidor(c, "SELECT public.fn_missao_ia_contexto(%s)", (pedido,))[0][0]
        assert ctx["missoes_existentes"] == []
        # Controle: as sugestões comuns da IA continuam no teto.
        for i in range(5):
            c.execute(
                "INSERT INTO public.missoes (classe_id, origem, aprovacao, escopo, titulo, criterio, recompensa_tipo)"
                " VALUES (%s, 'ia', 'pendente', 'turma', %s, '{\"metrica\": \"eventos_totais\", \"minimo\": 3}',"
                " 'missao_concluida')",
                (TURMA_2, f"Missão {i}"),
            )
        with pytest.raises(psycopg.errors.ProgramLimitExceeded):
            with c.transaction():
                t1._como_cliente(c, f5.PROF)
                c.execute("SELECT public.missao_ia_pedir(%s, NULL, NULL)", (TURMA_2,))


# ------------------------------------------------------------------------------------------- decidir


def test_decidir_aprova_grupo_inteiro() -> None:
    with _banco() as c:
        _semear(c)
        _registrar(c, CONTEUDO, ITENS)
        grupo = _grupos(c)[0]
        assert _decidir(c, f5.PROF, grupo, True) == 2
        assert c.execute(
            "SELECT DISTINCT aprovacao, motivo_recusa FROM public.missoes WHERE desafio_grupo = %s", (grupo,)
        ).fetchall() == [("aprovada", None)]
        # Os outros grupos não mudam, e o grupo já decidido devolve 0.
        assert c.execute(
            "SELECT count(*) FROM public.missoes WHERE aprovacao = 'pendente' AND desafio IS NOT NULL"
        ).fetchone()[0] == 6
        assert _decidir(c, f5.PROF, grupo, False) == 0
        assert _decidir(c, f5.PROF, grupo, True) == 0


def test_decidir_recusa_com_motivo_padrao() -> None:
    with _banco() as c:
        _semear(c)
        _registrar(c, CONTEUDO, ITENS)
        g1, g2 = _grupos(c)[:2]
        assert _decidir(c, f5.PROF, g1, False) == 2
        assert _decidir(c, f5.PROF, g2, False, "  Fora do conteúdo  ") == 2
        assert c.execute(
            "SELECT DISTINCT aprovacao, motivo_recusa FROM public.missoes WHERE desafio_grupo = %s", (g1,)
        ).fetchall() == [("recusada", "Recusado pelo professor")]
        assert c.execute(
            "SELECT DISTINCT motivo_recusa FROM public.missoes WHERE desafio_grupo = %s", (g2,)
        ).fetchall() == [("Fora do conteúdo",)]
        # Recusar não regera.
        assert CONTEUDO not in _candidatos(c)


def test_decidir_recusa_outro_professor_42501() -> None:
    with _banco() as c:
        _semear(c)
        _registrar(c, CONTEUDO, ITENS)
        grupo = _grupos(c)[0]
        for quem, g in ((PROF_2, grupo), (f5.A, grupo), (f5.PROF, uuid.uuid4())):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                _decidir(c, quem, g, True)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with c.transaction():
                c.execute("SET LOCAL ROLE anon")
                c.execute("SELECT public.missao_desafio_decidir(%s, true)", (grupo,))
        assert c.execute(
            "SELECT DISTINCT aprovacao FROM public.missoes WHERE desafio IS NOT NULL"
        ).fetchall() == [("pendente",)]


def test_desligar_depois_nao_apaga_pendente() -> None:
    """Foco 4: o professor desliga a geração automática depois do desafio gerado."""
    with _banco() as c:
        _semear(c)
        _registrar(c, CONTEUDO, ITENS)
        c.execute("UPDATE public.professor SET geracao_automatica = false WHERE id = %s", (f5.PROF,))
        assert c.execute(
            "SELECT count(*) FROM public.missoes WHERE aprovacao = 'pendente' AND desafio IS NOT NULL"
        ).fetchone()[0] == 8
        assert _candidatos(c, classes=[TURMA]) == []
        assert _reivindicar(c, classes=[TURMA]) == []
        g1, g2 = _grupos(c)[:2]
        assert _decidir(c, f5.PROF, g1, True) == 2
        assert _decidir(c, f5.PROF, g2, False) == 2


# ------------------------------------------------------------------------------------------- contexto


def test_contexto_sem_dado_de_aluno_e_com_existentes() -> None:
    with _banco() as c:
        _semear(c)
        c.execute(
            "UPDATE public.topicos SET descricao = 'Como guardar dados' WHERE id = 10;"
            " INSERT INTO public.classe_orientacao_ia (classe_id, pedir, evitar) VALUES (1, 'Exemplos do dia a dia', 'Gírias');"
        )
        c.execute(
            "INSERT INTO public.fontes_personalizacao (classe_id, conteudo_id, tipo, nome_arquivo, descricao, metadata,"
            " visibilidade) VALUES"
            " (1, %s, 'pdf', 'aula.pdf', 'Slides da aula', '{\"transcricao\": \"T2\", \"texto_extraido\": \"Texto do PDF\"}',"
            "  'classe'),"
            " (1, %s, 'audio', 'fala.mp3', NULL, '{\"transcript\": \"Fala gravada\"}', 'classe'),"
            " (1, %s, 'pdf', 'do-aluno.pdf', 'Privado', '{\"texto_extraido\": \"Segredo do aluno\"}', 'aluno')",
            (CONTEUDO, CONTEUDO, CONTEUDO),
        )
        c.execute(
            "INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (50, 10, 'A');"
            " INSERT INTO public.questoes (atividade_id, enunciado) VALUES (50, 'O que é uma pilha?'), (50, 'O que é uma pilha?');"
            " INSERT INTO public.cards (conteudo_id, titulo) VALUES (901, 'Fila'), (900, 'Pilha');"
        )
        # Um desafio que já existe em outro conteúdo do tópico.
        t3._criar(c, f5.PROF, CRUZADINHA, CRUZADINHA_RESPOSTA, ["seeker"], conteudo=CONTEUDO_2)
        t3._criar(c, f5.PROF, LOGICA, LOGICA_RESPOSTA, ["mastermind", "achiever"], conteudo=CONTEUDO_2)
        ctx = _servidor(c, "SELECT public.fn_desafios_auto_contexto(%s)", (CONTEUDO,))[0][0]
        assert ctx["mode"] == "desafios"
        assert ctx["topicName"] == "Estruturas de dados"
        assert (ctx["topicoNome"], ctx["topicoDescricao"], ctx["classeNome"], ctx["materiaNome"]) == (
            "Um", "Como guardar dados", "T", "Mat",
        )
        assert ctx["contents"] == [
            {"titulo": "Estruturas de dados", "tipo": "texto", "conteudo": "Listas, pilhas e filas guardam dados em ordem."}
        ]
        assert ctx["fileContents"] == "Texto do PDF\n\nSlides da aula\n\nFala gravada"
        assert ctx["fileNames"] == ["aula.pdf", "fala.mp3"]
        assert ctx["orientacao"] == {"pedir": "Exemplos do dia a dia", "evitar": "Gírias"}
        assert ctx["tipoConteudo"] == "texto"
        assert ctx["corpoConteudo"] == "Listas, pilhas e filas guardam dados em ordem."
        questoes = ctx["existentes"]["questoes"]
        assert questoes.count("O que é uma pilha?") == 1
        assert LOGICA["enunciado"] in questoes and questoes.count(LOGICA["enunciado"]) == 1
        for palavra in t3.GRADE:
            assert palavra["pista"] in questoes
        assert sorted(ctx["existentes"]["cards"]) == ["Fila", "Pilha"]
        assert set(ctx) == {
            "mode", "topicName", "topicoNome", "topicoDescricao", "classeNome", "materiaNome", "contents",
            "fileContents", "fileNames", "orientacao", "existentes", "tipoConteudo", "corpoConteudo",
        }
        # Nenhum dado de aluno: nem fonte privada, nem resposta, nem e-mail, nem id.
        bruto = json.dumps(ctx, ensure_ascii=False)
        for proibido in ("Segredo do aluno", "teste.invalid", str(f5.A), str(f5.B), str(f5.C), "BANCO", "16"):
            assert proibido not in bruto, proibido
        # Sem orientação, ela fica ausente; texto longo é cortado; conteúdo que sumiu devolve NULL.
        c.execute("DELETE FROM public.classe_orientacao_ia")
        c.execute(
            "UPDATE public.fontes_personalizacao SET metadata = jsonb_build_object('texto_extraido', repeat('a', 30000))"
            " WHERE nome_arquivo = 'aula.pdf'"
        )
        ctx = _servidor(c, "SELECT public.fn_desafios_auto_contexto(%s)", (CONTEUDO,))[0][0]
        assert "orientacao" not in ctx
        assert len(ctx["fileContents"]) == 20000
        assert _servidor(c, "SELECT public.fn_desafios_auto_contexto(%s)", (999_999,))[0][0] is None


def test_contexto_teto_de_60() -> None:
    with _banco() as c:
        _semear(c)
        c.execute("INSERT INTO public.atividades (id, topico_id, titulo) OVERRIDING SYSTEM VALUE VALUES (50, 10, 'A')")
        c.execute(
            "INSERT INTO public.questoes (atividade_id, enunciado) SELECT 50, 'Pergunta ' || g FROM generate_series(1, 80) g"
        )
        c.execute("INSERT INTO public.cards (conteudo_id, titulo) SELECT 900, 'Card ' || g FROM generate_series(1, 80) g")
        ctx = _servidor(c, "SELECT public.fn_desafios_auto_contexto(%s)", (CONTEUDO,))[0][0]
        assert len(ctx["existentes"]["questoes"]) == 60
        assert len(ctx["existentes"]["cards"]) == 60


# ------------------------------------------------------------------------------------ o botão segue igual

_TESTES_DO_BOTAO = sorted(
    nome
    for nome in dir(t3)
    if nome.startswith("test_") and nome not in {"test_cadeia", "test_upgrade_repete_sem_erro", "test_downgrade_restaura"}
)


@pytest.mark.parametrize("nome", _TESTES_DO_BOTAO)
def test_botao_continua_igual(nome: str, monkeypatch) -> None:
    """Os e2e da `20261117_03`, agora com esta migration por cima: `missao_desafio_criar` não mudou."""
    monkeypatch.setattr(t3, "_banco", lambda com_migration=True: _banco())
    getattr(t3, nome)()


# ------------------------------------------------------------------------------- upgrade e downgrade


def _estado(c) -> dict:
    def um(sql: str):
        return c.execute(sql).fetchone()[0]

    return {
        "funcoes": um(
            "SELECT array_agg(p.oid::regprocedure::text || ':' || md5(p.prosrc) ORDER BY p.oid::regprocedure::text) FROM pg_proc p"
            " WHERE p.pronamespace = 'public'::regnamespace AND (p.proname LIKE '%desafio%' OR p.proname LIKE 'missao_ia%'"
            " OR p.proname LIKE 'fn_missao_ia%' OR p.proname LIKE '%conteudos_atualizado%')"
        ),
        "acl": um(
            "SELECT array_agg(p.oid::regprocedure::text || ':' || coalesce(p.proacl::text, '') ORDER BY p.oid::regprocedure::text)"
            " FROM pg_proc p"
            " WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE '%desafio%'"
        ),
        "checks": um(
            "SELECT array_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint"
            " WHERE conrelid = 'public.professor_notificacoes'::regclass"
        ),
        "colunas": um(
            "SELECT array_agg(column_name::text || is_nullable ORDER BY column_name) FROM information_schema.columns"
            " WHERE table_name = 'conteudos'"
        ),
        "gatilhos": um("SELECT array_agg(tgname::text ORDER BY tgname) FROM pg_trigger WHERE NOT tgisinternal"),
        "tabela": um("SELECT to_regclass('public.desafios_auto_tentativas') IS NOT NULL"),
        "chaves": um("SELECT count(*) FROM public.app_config WHERE chave LIKE 'desafios_auto%'"),
    }


def test_upgrade_repete_sem_erro() -> None:
    with _banco() as c:
        antes = _estado(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        assert _estado(c) == antes


def test_downgrade_restaura() -> None:
    with _banco(com_migration=False) as c:
        antes = _estado(c)
        for sql in f5.sql_de(M):
            c.execute(sql)
        depois = _estado(c)
        assert depois["tabela"] and depois["chaves"] == 5 and depois != antes
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert _estado(c) == antes
