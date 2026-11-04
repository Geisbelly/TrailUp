"""Ponta a ponta da `20261104_03` (cópia anônima e revogação do arquivo da pesquisa, #17).

Mesmo banco do e2e da retenção, com a `20261104_02` e a `20261104_03` por cima. O que se prova:

- conta apagada de quem consentiu: o identificável **não** vai para a fila de exclusão enquanto a
  cópia anônima não existe; vira pedido com sal e perfil dominante;
- concluir a cópia apaga o pedido (e o sal) e só então enfileira o identificável;
- pedido parado há mais de 7 dias é abandonado pelo cron: o pedido do aluno vem primeiro;
- revogação apaga o arquivo identificável sem cópia anônima; versão nova do termo não dispara nada;
- cliente não alcança a fila de anonimização.
"""

from __future__ import annotations

import importlib.util
import uuid
from pathlib import Path

import pytest

from tests.test_e2e_arquivo_da_pesquisa import _arquivar_tudo, _Coletor, _fila_da_pesquisa
from tests.test_e2e_retencao_expurgo import COMUM, DSN, M02, PESQ, _banco, _telemetria, _um

pytestmark = pytest.mark.skipif(not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)")

if DSN:
    import psycopg

VERSOES = Path(__file__).resolve().parent.parent / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_anon_{arquivo[:11]}", VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M2 = _modulo("20261104_02_arquivo_da_pesquisa_no_r2.py")
M3 = _modulo("20261104_03_pesquisa_copia_anonima.py")


def _rodar(c, modulo, fn: str = "upgrade") -> None:
    coletor = _Coletor()
    original = modulo.op
    modulo.op = coletor
    try:
        getattr(modulo, fn)()
    finally:
        modulo.op = original
    for sql in coletor.sql:
        c.execute(sql)


def _preparar(c) -> None:
    _rodar(c, M2)
    _rodar(c, M3)
    # Em produção `afinidade` é numeric; o esqueleto traz text (ver AJUSTES_DO_ESQUELETO em
    # `_f5_banco`). Com text, '9' > '80' e o perfil dominante sairia errado.
    c.execute(
        f"""
ALTER TABLE public.aluno_perfil ALTER COLUMN afinidade DROP DEFAULT;
ALTER TABLE public.aluno_perfil ALTER COLUMN afinidade TYPE numeric USING afinidade::numeric;
INSERT INTO public.perfil (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Socializer'), (2, 'Seeker')
ON CONFLICT DO NOTHING;
INSERT INTO public.aluno_perfil (aluno_id, perfil_id, afinidade) VALUES
  ('{PESQ}', 1, 80), ('{PESQ}', 2, 9);
"""
    )


def _pedidos(c) -> list[tuple[str, str, str | None]]:
    return [
        (r[0], r[1], r[2])
        for r in c.execute("SELECT caminho, sal, perfil FROM public.pesquisa_anonimizacao ORDER BY caminho")
    ]


def test_exclusao_de_quem_consentiu_segura_o_identificavel_ate_a_copia() -> None:
    with _banco() as c:
        _preparar(c)
        _telemetria(c, PESQ, 10)
        assert _arquivar_tudo(c) == 4
        caminhos = {r[0] for r in c.execute("SELECT caminho FROM public.pesquisa_arquivo")}

        c.execute(f"DELETE FROM auth.users WHERE id = '{PESQ}'")

        assert _um(c, "SELECT count(*) FROM public.pesquisa_arquivo") == 0
        pedidos = _pedidos(c)
        assert {p[0] for p in pedidos} == caminhos
        # Um sal só por exclusão, de 256 bits, e o perfil dominante (maior afinidade).
        assert len({p[1] for p in pedidos}) == 1
        assert len(pedidos[0][1]) == 64
        assert {p[2] for p in pedidos} == {"Socializer"}
        # Nada do identificável na fila enquanto a cópia anônima não existe.
        assert _fila_da_pesquisa(c) == set()

        ids = [r[0] for r in c.execute("SELECT id FROM public.pesquisa_anonimizacao ORDER BY id")]
        assert _um(c, f"SELECT public.pesquisa_anonimizacao_concluir(ARRAY{ids}::bigint[])") == 4

        assert _pedidos(c) == []
        assert _fila_da_pesquisa(c) == caminhos


def test_exclusao_de_quem_nao_tem_arquivo_nao_cria_pedido() -> None:
    with _banco() as c:
        _preparar(c)
        _telemetria(c, COMUM, 10)
        _arquivar_tudo(c)
        c.execute(f"DELETE FROM auth.users WHERE id = '{COMUM}'")
        assert _pedidos(c) == []


def test_pedido_parado_ha_7_dias_sai_sem_copia() -> None:
    with _banco() as c:
        _preparar(c)
        _telemetria(c, PESQ, 10)
        _arquivar_tudo(c)
        c.execute(f"DELETE FROM auth.users WHERE id = '{PESQ}'")
        assert len(_pedidos(c)) == 4

        # 6 dias: ainda espera.
        c.execute("UPDATE public.pesquisa_anonimizacao SET criado_em = now() - interval '6 days'")
        _um(c, "SELECT public.pesquisa_arquivo_disparar()")
        assert len(_pedidos(c)) == 4

        c.execute("UPDATE public.pesquisa_anonimizacao SET criado_em = now() - interval '8 days'")
        # O cron vence os pedidos mesmo sem Edge Function (sem Vault, devolve NULL).
        assert _um(c, "SELECT public.pesquisa_arquivo_disparar()") is None
        assert _pedidos(c) == []
        assert len(_fila_da_pesquisa(c)) == 4


def test_falha_reagenda_e_sai_da_lista_de_pendentes() -> None:
    with _banco() as c:
        _preparar(c)
        _telemetria(c, PESQ, 10)
        _arquivar_tudo(c)
        c.execute(f"DELETE FROM auth.users WHERE id = '{PESQ}'")
        um = _um(c, "SELECT min(id) FROM public.pesquisa_anonimizacao")

        assert _um(c, f"""SELECT public.pesquisa_anonimizacao_falhou('[{{"id": {um}, "erro": "GET: HTTP 500"}}]'::jsonb)""") == 1

        tentativas, erro, futuro = c.execute(
            f"SELECT tentativas, ultimo_erro, proxima_tentativa_em > now() FROM public.pesquisa_anonimizacao WHERE id = {um}"
        ).fetchone()
        assert (tentativas, erro, futuro) == (1, "GET: HTTP 500", True)
        pendentes = {r[0] for r in c.execute("SELECT id FROM public.pesquisa_anonimizacao_pendentes(100)")}
        assert um not in pendentes and len(pendentes) == 3


def test_revogacao_apaga_o_identificavel_sem_copia_anonima() -> None:
    with _banco() as c:
        _preparar(c)
        _telemetria(c, PESQ, 10)
        _arquivar_tudo(c)
        caminhos = {r[0] for r in c.execute("SELECT caminho FROM public.pesquisa_arquivo")}

        c.execute(
            f"INSERT INTO public.consentimento_pesquisa (aluno_id, versao, status, decidido_em)"
            f" VALUES ('{PESQ}', '{M02.VERSAO_PESQUISA}', 'rejected', now() + interval '1 second')"
        )

        assert _um(c, "SELECT count(*) FROM public.pesquisa_arquivo") == 0
        assert _fila_da_pesquisa(c) == caminhos
        assert _pedidos(c) == []
        # E nada volta a ser arquivado.
        assert _um(c, f"SELECT count(*) FROM public.pesquisa_arquivo_pendentes(1000) WHERE aluno_id = '{PESQ}'") == 0


def test_reafirmar_o_consentimento_nao_apaga_nada() -> None:
    with _banco() as c:
        _preparar(c)
        _telemetria(c, PESQ, 10)
        _arquivar_tudo(c)
        c.execute(
            f"INSERT INTO public.consentimento_pesquisa (aluno_id, versao, status, decidido_em)"
            f" VALUES ('{PESQ}', '{M02.VERSAO_PESQUISA}', 'accepted', now() + interval '1 second')"
        )
        assert _um(c, "SELECT count(*) FROM public.pesquisa_arquivo") == 4
        assert _fila_da_pesquisa(c) == set()


@pytest.mark.parametrize("papel", ["anon", "authenticated"])
def test_cliente_nao_alcanca_a_fila_de_anonimizacao(papel: str) -> None:
    with _banco() as c:
        _preparar(c)
        for sql in (
            "SELECT count(*) FROM public.pesquisa_anonimizacao",
            "SELECT count(*) FROM public.pesquisa_anonimizacao_pendentes(10)",
            "SELECT public.pesquisa_anonimizacao_concluir(ARRAY[1]::bigint[])",
            "SELECT public.pesquisa_anonimizacao_falhou('[]'::jsonb)",
            "SELECT public.pesquisa_anonimizacao_vencidas()",
        ):
            c.execute("BEGIN")
            c.execute(f"SET LOCAL ROLE {papel}")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute(sql)
            c.execute("ROLLBACK")


def test_downgrade_solta_o_que_estava_preso_e_volta_o_gatilho() -> None:
    with _banco() as c:
        _preparar(c)
        _telemetria(c, PESQ, 10)
        _arquivar_tudo(c)
        c.execute(f"DELETE FROM auth.users WHERE id = '{PESQ}'")
        assert len(_pedidos(c)) == 4

        _rodar(c, M3, "downgrade")

        assert _um(c, "SELECT to_regclass('public.pesquisa_anonimizacao')") is None
        assert len(_fila_da_pesquisa(c)) == 4
        # O gatilho da _02 volta a enfileirar direto, e o disparo da _02 continua de pé.
        outro = uuid.UUID(int=77)
        c.execute(
            f"""
INSERT INTO auth.users (id, email) VALUES ('{outro}', 'outro@teste.invalid');
INSERT INTO public.alunos (id, nome, email) VALUES ('{outro}', 'outro', 'outro@teste.invalid');
INSERT INTO public.pesquisa_arquivo (origem, origem_id, aluno_id, bucket, caminho)
VALUES ('telemetria_lotes', gen_random_uuid(), '{outro}', 'b', 'pesquisa/lotes/{outro}/x.json');
DELETE FROM auth.users WHERE id = '{outro}';
"""
        )
        assert f"pesquisa/lotes/{outro}/x.json" in _fila_da_pesquisa(c)
        assert _um(c, "SELECT public.pesquisa_arquivo_disparar()") is None
