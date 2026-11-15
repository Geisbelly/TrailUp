"""`20261115_03`: o professor enfileira a geração personalizada em lote pelo banco.

Banco descartável com o esqueleto de produção, os GRANTs que o Supabase dá por padrão, o
`app_classes_do_professor()` e o vetor de perfil (`20261111_01`) de verdade. O professor é dono da
turma 1 (tópicos 10, 11 e 12; conteúdos 100 e 101 no 10, 110 no 11, nenhum no 12), com os alunos
A (Seeker 90, Achiever 40), B (Socialiser 80) e C (sem perfil = mastermind). OUTRO é professor da
turma 2 (tópico 20, conteúdo 200).
"""

from __future__ import annotations

import json
import uuid

import psycopg
import pytest

from tests import _f5_banco as f5
from tests import test_e2e_estudo_coorte as e
from tests.test_e2e_kpis_por_topico import POSSE

M = f5.modulo("20261115_03_personalizacao_em_lote.py")
VETOR = f5.modulo("20261111_01_vetor_perfil_no_banco.py")
OUTRO = uuid.UUID(int=12)

# Os índices únicos de produção que o esqueleto não tem: o INSERT da RPC tem de passar por eles.
INDICES = """
CREATE UNIQUE INDEX uq_job_target_base ON public.personalizacao_job_targets
  (job_id, topico_id, conteudo_id, brainhex_profile_key) WHERE media_kind IS NULL AND aluno_id IS NULL;
"""


def _banco():
    return f5.banco(e.GRANTS_SUPABASE, POSSE, *f5.sql_de(VETOR), INDICES, *f5.sql_de(M))


def _semear(c, *, com_alunos: bool = True) -> None:
    f5.semear_turma(c)
    for tabela in ("conteudos", "perfil"):
        f5.afrouxa(c, tabela)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{OUTRO}', 'outro@teste.invalid');
INSERT INTO public.professor (id, nome) VALUES ('{OUTRO}', 'Outro');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES (2, 1, '{OUTRO}', 'T2');
INSERT INTO public.topicos (id, classe_id, nome, ordem) OVERRIDING SYSTEM VALUE VALUES (20, 2, 'Outro', 1);
INSERT INTO public.conteudos (id, topico_id, titulo, tipo, ordem) OVERRIDING SYSTEM VALUE VALUES
  (100, 10, 'a', 'texto', 1), (101, 10, 'b', 'texto', 2), (110, 11, 'c', 'texto', 1), (200, 20, 'd', 'texto', 1);
INSERT INTO public.perfil (id, nome) OVERRIDING SYSTEM VALUE VALUES
  (1, 'Seeker'), (2, 'Achiever'), (3, 'Socialiser'), (4, 'Mastermind');
INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES
  ('{f5.A}', 1, 90), ('{f5.A}', 2, 40), ('{f5.B}', 3, 80);
"""
    )
    if not com_alunos:
        c.execute("DELETE FROM public.classe_aluno")


def _como(c, quem: uuid.UUID | None, papel: str = "authenticated") -> None:
    f5.como(c, quem)
    c.execute(f"SET ROLE {papel}")


def _voltar(c) -> None:
    c.execute("RESET ROLE")
    f5.como(c, None)


def _lote(c, topicos=None, conteudos=None, perfis=None, *, quem=f5.PROF, papel="authenticated", classe=f5.TURMA) -> dict:
    _como(c, quem, papel)
    try:
        return c.execute(
            "SELECT public.personalizacao_gerar_em_lote(%s, %s::bigint[], %s::bigint[], %s::text[])",
            (classe, topicos, conteudos, perfis),
        ).fetchone()[0]
    finally:
        _voltar(c)


def _job(c, job_id) -> dict:
    linha = c.execute(
        "SELECT kind, status, aluno_id, topico_id, conteudo_id, trigger_source, payload, total_targets"
        " FROM public.personalizacao_jobs WHERE id = %s",
        (job_id,),
    ).fetchone()
    return dict(zip(("kind", "status", "aluno_id", "topico_id", "conteudo_id", "trigger_source", "payload", "total_targets"), linha))


def _alvos(c, job_id) -> list[tuple]:
    return c.execute(
        "SELECT topico_id, conteudo_id, brainhex_profile_key FROM public.personalizacao_job_targets"
        " WHERE job_id = %s AND aluno_id IS NULL AND is_profile_template AND status = 'pending'"
        " ORDER BY id",
        (job_id,),
    ).fetchall()


@f5.e2e
def test_perfis_da_turma_sao_os_principais_e_os_representativos() -> None:
    with _banco() as c:
        _semear(c)
        _como(c, f5.PROF)
        assert c.execute("SELECT public.personalizacao_perfis_da_turma(%s)", (f5.TURMA,)).fetchone()[0] == [
            "seeker", "mastermind", "socializer", "achiever",
        ]
        _voltar(c)
        _como(c, OUTRO)
        assert c.execute("SELECT public.personalizacao_perfis_da_turma(%s)", (f5.TURMA,)).fetchone()[0] == []
        _voltar(c)


@f5.e2e
def test_turma_inteira_nos_perfis_da_turma_e_o_job_do_gerar_tudo() -> None:
    with _banco() as c:
        _semear(c)
        r = _lote(c)
        assert (r["kind"], r["existente"], r["retomado"], r["total_targets"]) == ("manual_profile_generate_all", False, False, 16)
        job = _job(c, r["job_id"])
        assert (job["kind"], job["status"], job["aluno_id"], job["topico_id"], job["conteudo_id"]) == (
            "manual_profile_generate_all", "pending", None, None, None,
        )
        assert job["trigger_source"] == "web_console"
        # As chaves que a API grava e que a deduplicação dela lê.
        assert job["payload"] == {
            "reason": "geracao_em_lote_turma_console",
            "topico_ids": [10, 11, 12],
            "conteudo_ids": [],
            "target_profile_map": {},
            # Vazio: o worker continua filtrando pelos perfis da turma na hora de processar.
            "brainhex_profile_keys": [],
        }
        perfis = ["seeker", "mastermind", "socializer", "achiever"]
        esperado = [(t, co, p) for t, co in ((10, 100), (10, 101), (11, 110), (12, None)) for p in perfis]
        assert sorted(_alvos(c, r["job_id"]), key=str) == sorted(esperado, key=str)


@f5.e2e
def test_topico_escolhido_nos_perfis_pedidos() -> None:
    with _banco() as c:
        _semear(c)
        r = _lote(c, topicos=[11], perfis=["Daredevil", " socialiser ", "nao_existe"])
        job = _job(c, r["job_id"])
        assert (job["kind"], job["topico_id"], job["conteudo_id"]) == ("manual_profile_generate", 11, 110)
        assert job["payload"]["brainhex_profile_keys"] == ["daredevil", "socializer"]
        assert job["payload"]["conteudo_ids"] == []
        assert _alvos(c, r["job_id"]) == [(11, 110, "daredevil"), (11, 110, "socializer")]


@f5.e2e
def test_conteudos_escolhidos_ignoram_o_de_outra_turma() -> None:
    with _banco() as c:
        _semear(c)
        sete = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"]
        r = _lote(c, conteudos=[100, 200], perfis=sete)
        job = _job(c, r["job_id"])
        assert job["payload"]["topico_ids"] == [10]
        assert job["payload"]["conteudo_ids"] == [100]
        assert job["payload"]["brainhex_profile_keys"] == sorted(sete)
        # Alvos na ordem canônica dos perfis (a da API).
        assert _alvos(c, r["job_id"]) == [(10, 100, p) for p in sete]


@f5.e2e
def test_topico_sem_conteudo_e_conteudo_avulso_no_mesmo_pedido() -> None:
    with _banco() as c:
        _semear(c)
        r = _lote(c, topicos=[12], conteudos=[101], perfis=["achiever"])
        job = _job(c, r["job_id"])
        assert job["payload"]["topico_ids"] == [10, 12]
        assert job["payload"]["conteudo_ids"] == [101]
        assert sorted(_alvos(c, r["job_id"]), key=str) == sorted([(10, 101, "achiever"), (12, None, "achiever")], key=str)


@f5.e2e
def test_pedido_igual_aberto_devolve_o_mesmo_job() -> None:
    with _banco() as c:
        _semear(c)
        primeiro = _lote(c, topicos=[10], perfis=["seeker", "achiever"])
        # Mesmo pedido em outra ordem e com perfil repetido: o mesmo job.
        de_novo = _lote(c, topicos=[10, 10], perfis=["Achiever", "seeker"])
        assert de_novo["job_id"] == primeiro["job_id"] and de_novo["existente"] is True
        outro = _lote(c, topicos=[10], perfis=["seeker"])
        assert outro["job_id"] != primeiro["job_id"] and outro["existente"] is False
        assert c.execute("SELECT count(*) FROM public.personalizacao_jobs").fetchone()[0] == 2


@f5.e2e
def test_pedido_igual_que_terminou_com_falha_retoma_so_o_que_falta() -> None:
    with _banco() as c:
        _semear(c)
        r = _lote(c, conteudos=[100, 101], perfis=["seeker"])
        c.execute("UPDATE public.personalizacao_jobs SET status = 'partial', finished_at = now(), last_error = 'x' WHERE id = %s", (r["job_id"],))
        c.execute(
            "UPDATE public.personalizacao_job_targets SET status = CASE WHEN conteudo_id = 100 THEN 'completed' ELSE 'failed' END,"
            " attempts = 3, last_error = 'cota' WHERE job_id = %s",
            (r["job_id"],),
        )
        retomado = _lote(c, conteudos=[101, 100], perfis=["seeker"])
        assert retomado["job_id"] == r["job_id"]
        assert (retomado["retomado"], retomado["alvos_reabertos"]) == (True, 1)
        assert c.execute(
            "SELECT status, finished_at, last_error FROM public.personalizacao_jobs WHERE id = %s", (r["job_id"],)
        ).fetchone() == ("pending", None, None)
        assert c.execute(
            "SELECT conteudo_id, status, attempts, last_error FROM public.personalizacao_job_targets WHERE job_id = %s ORDER BY conteudo_id",
            (r["job_id"],),
        ).fetchall() == [(100, "completed", 3, "cota"), (101, "pending", 0, None)]


@f5.e2e
def test_quem_nao_e_dono_nao_enfileira() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _lote(c, quem=OUTRO)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _lote(c, quem=f5.A)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _lote(c, quem=None, papel="anon")
        assert c.execute("SELECT count(*) FROM public.personalizacao_jobs").fetchone()[0] == 0


@f5.e2e
def test_pedido_sem_nada_desta_turma_e_erro_e_nao_vira_a_turma_inteira() -> None:
    with _banco() as c:
        _semear(c)
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="Nada a gerar"):
            _lote(c, topicos=[20], conteudos=[200], perfis=["seeker"])
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="Nenhum perfil"):
            _lote(c, perfis=["nao_existe"])
        assert c.execute("SELECT count(*) FROM public.personalizacao_jobs").fetchone()[0] == 0


@f5.e2e
def test_turma_sem_aluno_precisa_dos_perfis_escolhidos() -> None:
    with _banco() as c:
        _semear(c, com_alunos=False)
        with pytest.raises(psycopg.errors.InvalidParameterValue, match="não tem aluno"):
            _lote(c)
        r = _lote(c, perfis=["conqueror"])
        assert r["total_targets"] == 4
        assert json.dumps(_job(c, r["job_id"])["payload"]["brainhex_profile_keys"]) == '["conqueror"]'
