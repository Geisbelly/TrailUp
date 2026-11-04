"""Ponta a ponta da `20261104_02` (arquivo da pesquisa no R2, #17) num Postgres de verdade.

Usa o mesmo banco do e2e da retenção (esqueleto + `20261024_02` + `20261024_03`, com os gatilhos de
verdade da fila externa) e aplica a `20261104_02` por cima. O que se prova:

- só a telemetria de quem consentiu pesquisa entra na fila de arquivo;
- de quem consentiu, a retenção não tira do Postgres nada que ainda não foi arquivado — nem pela
  cascata da sessão;
- depois de arquivado, o prazo segue o de antes, e **nenhum** objeto de `pesquisa/` vai para a fila
  de exclusão por prazo;
- conta apagada põe todo o arquivo do aluno na fila de exclusão do R2;
- cliente (`anon`/`authenticated`) não lê o arquivo nem chama as funções.

Roda com `TRAILUP_E2E_RETENCAO_DATABASE_URL` apontando para um Postgres LOCAL.
"""

from __future__ import annotations

import importlib.util
import json
import uuid
from pathlib import Path

import pytest

from tests.test_e2e_retencao_expurgo import COMUM, DSN, PESQ, _banco, _telemetria, _um

pytestmark = pytest.mark.skipif(not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)")

if DSN:
    import psycopg

VERSOES = Path(__file__).resolve().parent.parent / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"e2e_arq_{arquivo[:11]}", VERSOES / arquivo)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M = _modulo("20261104_02_arquivo_da_pesquisa_no_r2.py")


class _Coletor:
    def __init__(self) -> None:
        self.sql: list[str] = []

    def execute(self, sql: str) -> None:
        self.sql.append(sql)


def _aplicar(c, fn: str = "upgrade") -> None:
    coletor = _Coletor()
    original = M.op
    M.op = coletor
    try:
        getattr(M, fn)()
    finally:
        M.op = original
    for sql in coletor.sql:
        c.execute(sql)


def _pendentes(c) -> list[tuple[str, uuid.UUID, uuid.UUID]]:
    return [
        (r[0], r[1], r[2])
        for r in c.execute("SELECT origem, origem_id, aluno_id FROM public.pesquisa_arquivo_pendentes(1000)")
    ]


def _arquivar_tudo(c) -> int:
    """Faz o papel da Edge Function: registra cada pendente como se o upload tivesse dado certo."""
    itens = [
        {
            "origem": origem,
            "origem_id": str(oid),
            "aluno_id": str(aluno),
            "bucket": "b",
            "caminho": f"pesquisa/{origem}/{aluno}/{oid}.json",
        }
        for origem, oid, aluno in _pendentes(c)
    ]
    resultado = _um(c, f"SELECT public.pesquisa_arquivo_registrar('{json.dumps(itens)}'::jsonb)")
    assert resultado["orfaos_na_fila"] == 0
    return resultado["registrados"]


def _contagem(c, tabela: str, aluno: uuid.UUID, extra: str = "") -> int:
    return _um(c, f"SELECT count(*) FROM public.{tabela} WHERE aluno_id = '{aluno}' {extra}")


def _aplicar_retencao(c) -> dict:
    c.execute("UPDATE public.app_config SET valor = 'aplicar' WHERE chave = 'retencao_modo'")
    return _um(c, "SELECT public.trailup_retencao()")


def _fila_da_pesquisa(c) -> set[str]:
    return {
        r[0]
        for r in c.execute(
            "SELECT caminho FROM public.retencao_fila_externa WHERE destino = 'r2' AND left(caminho, 9) = 'pesquisa/'"
        )
    }


def test_so_quem_consentiu_entra_e_registro_recente_espera() -> None:
    with _banco() as c:
        _aplicar(c)
        _telemetria(c, PESQ, 1)
        _telemetria(c, COMUM, 1)
        # Recém-gravado (menos de 15 min) ainda não arquiva.
        c.execute(
            f"INSERT INTO public.telemetria_sessoes (id, aluno_id, classe_id, started_at, created_at)"
            f" VALUES ('{uuid.uuid4()}', '{PESQ}', 1, now(), now())"
        )

        pendentes = _pendentes(c)
        assert {aluno for _, _, aluno in pendentes} == {PESQ}
        # 1 sessão encerrada há 1 dia (sem ended_at, mas com mais de 1 dia), 1 lote, 2 eventos.
        assert sorted(o for o, _, _ in pendentes) == [
            "telemetria_eventos_app",
            "telemetria_eventos_app",
            "telemetria_lotes",
            "telemetria_sessoes",
        ]

        assert _arquivar_tudo(c) == 4
        assert _pendentes(c) == []
        # Registrar de novo não duplica.
        assert _arquivar_tudo(c) == 0


def test_retencao_nao_tira_de_quem_consentiu_o_que_nao_foi_arquivado() -> None:
    with _banco() as c:
        _aplicar(c)
        for aluno in (PESQ, COMUM):
            for dias in (100, 200, 400, 800):
                _telemetria(c, aluno, dias)

        _aplicar_retencao(c)

        # Quem consentiu: nada saiu, nem pela cascata da sessão.
        assert _contagem(c, "telemetria_sessoes", PESQ) == 4
        assert _contagem(c, "telemetria_lotes", PESQ, "AND payload ? '_r2'") == 4
        assert _contagem(c, "telemetria_eventos_app", PESQ) == 8
        # Quem não consentiu: o prazo de sempre (mesmos números do e2e da 20261024_03).
        assert _contagem(c, "telemetria_sessoes", COMUM) == 2
        assert _contagem(c, "telemetria_eventos_app", COMUM) == 0
        assert _contagem(c, "telemetria_lotes", COMUM, "AND payload ? '_r2'") == 0


def test_arquivado_segue_o_prazo_e_o_arquivo_nunca_sai_por_prazo() -> None:
    with _banco() as c:
        _aplicar(c)
        for dias in (100, 200, 400, 800):
            _telemetria(c, PESQ, dias)
        assert _arquivar_tudo(c) == 16

        _aplicar_retencao(c)

        # Os mesmos números do e2e da 20261024_03 para quem consentiu (180 / 730 dias).
        assert _contagem(c, "telemetria_eventos_app", PESQ) == 2
        assert _contagem(c, "telemetria_lotes", PESQ, "AND payload ? '_r2'") == 1
        assert _contagem(c, "telemetria_sessoes", PESQ) == 3
        # O registro do arquivo e os objetos ficam: nada de `pesquisa/` na fila de exclusão.
        assert _um(c, f"SELECT count(*) FROM public.pesquisa_arquivo WHERE aluno_id = '{PESQ}'") == 16
        assert _fila_da_pesquisa(c) == set()


def test_sessao_com_um_lote_sem_copia_nao_sai() -> None:
    with _banco() as c:
        _aplicar(c)
        sessao = _telemetria(c, PESQ, 800)
        _arquivar_tudo(c)
        # Um lote novo na sessão velha, ainda sem cópia.
        c.execute(
            f"""
INSERT INTO public.telemetria_lotes (id, sessao_id, aluno_id, classe_id, screen_name, route_name,
  flush_reason, captured_at, study_elapsed_sec, screen_dwell_sec, active_sec, idle_sec, touch_count,
  scroll_distance_px, max_depth_px, payload, created_at)
VALUES ('{uuid.uuid4()}', '{sessao}', '{PESQ}', 1, 's', 'r', 'f', now(), 1, 1, 1, 0, 3, 0, 0, '{{}}', now())
"""
        )

        _aplicar_retencao(c)

        assert _um(c, f"SELECT count(*) FROM public.telemetria_sessoes WHERE id = '{sessao}'") == 1


def test_conta_apagada_poe_o_arquivo_inteiro_na_fila_do_r2() -> None:
    with _banco() as c:
        _aplicar(c)
        _telemetria(c, PESQ, 10)
        _telemetria(c, PESQ, 20)
        _arquivar_tudo(c)
        caminhos = {r[0] for r in c.execute("SELECT caminho FROM public.pesquisa_arquivo")}
        assert len(caminhos) == 8

        c.execute(f"DELETE FROM auth.users WHERE id = '{PESQ}'")

        assert _um(c, "SELECT count(*) FROM public.pesquisa_arquivo") == 0
        assert _fila_da_pesquisa(c) == caminhos
        ref = c.execute(
            "SELECT DISTINCT ref ->> 'tabela' FROM public.retencao_fila_externa WHERE left(caminho, 9) = 'pesquisa/'"
        ).fetchall()
        assert ref == [("pesquisa_arquivo",)]


def test_aluno_que_sumiu_no_meio_do_upload_vai_direto_para_a_fila() -> None:
    with _banco() as c:
        _aplicar(c)
        sumiu = uuid.uuid4()
        itens = [
            {
                "origem": "telemetria_lotes",
                "origem_id": str(uuid.uuid4()),
                "aluno_id": str(sumiu),
                "bucket": "b",
                "caminho": f"pesquisa/lotes/{sumiu}/x.json",
            }
        ]
        resultado = _um(c, f"SELECT public.pesquisa_arquivo_registrar('{json.dumps(itens)}'::jsonb)")

        assert resultado == {"registrados": 0, "orfaos_na_fila": 1}
        assert _fila_da_pesquisa(c) == {f"pesquisa/lotes/{sumiu}/x.json"}


def test_registrar_ignora_caminho_fora_de_pesquisa() -> None:
    with _banco() as c:
        _aplicar(c)
        itens = [
            {
                "origem": "telemetria_lotes",
                "origem_id": str(uuid.uuid4()),
                "aluno_id": str(PESQ),
                "bucket": "b",
                "caminho": "brainhex/deck.html",
            }
        ]
        assert _um(c, f"SELECT public.pesquisa_arquivo_registrar('{json.dumps(itens)}'::jsonb)")["registrados"] == 0


@pytest.mark.parametrize("papel", ["anon", "authenticated"])
def test_cliente_nao_le_o_arquivo_nem_chama_as_funcoes(papel: str) -> None:
    with _banco() as c:
        _aplicar(c)
        _telemetria(c, PESQ, 1)
        _arquivar_tudo(c)
        for sql in (
            "SELECT count(*) FROM public.pesquisa_arquivo",
            "SELECT count(*) FROM public.pesquisa_arquivo_pendentes(10)",
            "SELECT public.pesquisa_arquivo_registrar('[]'::jsonb)",
            "SELECT public.pesquisa_arquivo_disparar()",
        ):
            c.execute("BEGIN")
            c.execute(f"SET LOCAL ROLE {papel}")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute(sql)
            c.execute("ROLLBACK")


def test_disparar_sem_segredo_nao_faz_nada() -> None:
    with _banco() as c:
        _aplicar(c)
        assert _um(c, "SELECT public.pesquisa_arquivo_disparar()") is None


def test_downgrade_volta_os_filtros_da_retencao() -> None:
    with _banco() as c:
        antes = dict(
            ((t, a), f) for t, a, f in c.execute("SELECT tabela, acao, filtro FROM public.retencao_politica")
        )
        _aplicar(c)
        _aplicar(c, "downgrade")
        depois = dict(
            ((t, a), f) for t, a, f in c.execute("SELECT tabela, acao, filtro FROM public.retencao_politica")
        )
        assert depois == antes
