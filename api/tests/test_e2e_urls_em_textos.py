"""Ponta a ponta da `20261024_11` (URLs dentro de texto + versao minima, #195) num Postgres de verdade.

Usa o banco descartavel da `test_e2e_bucket_conteudos_privado` (esqueleto da
producao + 02/03/07/09/10) e aplica a 11 por cima. Dados sinteticos. Recusa
banco hospedado.
"""

from __future__ import annotations

import json
from contextlib import contextmanager

import pytest

from app.services import retencao_externa as rx
from tests.test_e2e_bucket_conteudos_privado import ALUNO, ALUNO2, BASE, OUTRO, PROF, _banco, _como
from tests.test_e2e_buckets_privados import DSN, _colunas_obrigatorias_de, _modulo, _sql_de

pytestmark = pytest.mark.skipif(
    not DSN, reason="TRAILUP_E2E_RETENCAO_DATABASE_URL nao definido (e2e so em banco local)"
)

M11 = _modulo("20261024_11_urls_em_textos_e_versao_minima.py")

OBJ = f"{BASE}/storage/v1/object"
EMB = f"{PROF}/1/figura embutida.png"
EMB_URL = f"{EMB.replace(' ', '%20')}"
FOTO = "aluno-x/foto.jpg"
SLIDE = "slides/a.png"


def _texto(modo: str) -> str:
    return (
        f"# Aula\n\n![fig]({OBJ}/{modo}/conteudos/{EMB_URL})\n"
        f"Foto: {OBJ}/{modo}/perfil_fotos/{FOTO}\n"
        f"Slide publico de verdade: {OBJ}/public/trailup-slides/{SLIDE}\n"
        f"Ja assinada: {OBJ}/sign/conteudos/{EMB_URL}?token=t\n"
    )


@contextmanager
def _banco11():
    with _banco() as (c, p):
        for tabela in ("personalizacao_blocos_gerados", "personalizacao_jobs", "materiais_gerados", "bag_itens"):
            _colunas_obrigatorias_de(c.cursor(), tabela)
        # Gatilhos de regeracao com o nome da producao, registrando em log; o de
        # questoes ja' desligado por alguem antes.
        c.execute(
            """
CREATE TABLE public._log_regeracao (tabela text, op text);
CREATE FUNCTION public._registra_regeracao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN INSERT INTO public._log_regeracao VALUES (TG_TABLE_NAME, TG_OP); RETURN NULL; END $$;
CREATE TRIGGER trg_conteudos_class_delta_job AFTER UPDATE ON public.conteudos
  FOR EACH ROW EXECUTE FUNCTION public._registra_regeracao();
CREATE TRIGGER trg_questoes_class_delta_job AFTER UPDATE ON public.questoes
  FOR EACH ROW EXECUTE FUNCTION public._registra_regeracao();
ALTER TABLE public.questoes DISABLE TRIGGER trg_questoes_class_delta_job;
"""
        )
        for sql in _sql_de(M11, "upgrade"):
            c.execute(sql)
        t1 = c.execute("SELECT id FROM public.topicos WHERE classe_id = 1").fetchone()[0]
        texto = _texto("public")
        cid = c.execute(
            "INSERT INTO public.conteudos (topico_id, titulo, tipo, conteudo, metadata) VALUES (%s, 'Md', 'texto', %s, %s)"
            " RETURNING id",
            (t1, texto, json.dumps({"resumo": texto})),
        ).fetchone()[0]
        c.execute("UPDATE public.questoes SET enunciado = %s", (texto,))
        job = c.execute("INSERT INTO public.personalizacao_jobs (classe_id) VALUES (1) RETURNING id").fetchone()[0]
        c.execute(
            "INSERT INTO public.personalizacao_blocos_gerados (job_id, block_id, markdown, slides) VALUES (%s, 'b1', %s, %s)",
            (job, texto, json.dumps([{"img": f"{OBJ}/public/conteudo_aluno/classe-1/x.png"}])),
        )
        c.execute(
            "INSERT INTO public.materiais_gerados (conteudo_id, tipo, payload) VALUES (%s, 'markdown', %s::json)",
            (cid, json.dumps({"markdown": texto})),
        )
        c.execute("INSERT INTO storage.objects (bucket_id, name) VALUES ('conteudos', %s)", (EMB,))
        c.execute("TRUNCATE public._log_regeracao")
        yield c, p, cid


def _colunas(c, cid):
    return {
        "conteudo": c.execute("SELECT conteudo FROM public.conteudos WHERE id = %s", (cid,)).fetchone()[0],
        "metadata": c.execute("SELECT metadata ->> 'resumo' FROM public.conteudos WHERE id = %s", (cid,)).fetchone()[0],
        "enunciado": c.execute("SELECT enunciado FROM public.questoes").fetchone()[0],
        "markdown": c.execute("SELECT markdown FROM public.personalizacao_blocos_gerados").fetchone()[0],
        "slides": c.execute("SELECT slides FROM public.personalizacao_blocos_gerados").fetchone()[0][0]["img"],
        "payload": c.execute("SELECT payload ->> 'markdown' FROM public.materiais_gerados").fetchone()[0],
    }


def test_fechar_reescreve_urls_no_meio_do_texto_e_e_idempotente():
    with _banco11() as (c, _p, cid):
        r = c.execute("SELECT public.trailup_fechar_buckets_privados()").fetchone()[0]
        assert r["buckets_fechados"] == 4
        assert r["urls_em_textos"] == {
            "conteudos.conteudo": 1,
            "conteudos.metadata": 1,
            "questoes.enunciado": 1,
            "personalizacao_blocos_gerados.markdown": 1,
            "personalizacao_blocos_gerados.slides": 1,
            "materiais_gerados.payload": 1,
        }
        col = _colunas(c, cid)
        esperado = _texto("authenticated")
        for nome in ("conteudo", "metadata", "enunciado", "markdown", "payload"):
            assert col[nome] == esperado, nome
        # bucket publico de verdade e URL ja assinada ficaram como estavam
        assert f"{OBJ}/public/trailup-slides/{SLIDE}" in esperado
        assert col["slides"] == f"{OBJ}/authenticated/conteudo_aluno/classe-1/x.png"

        r2 = c.execute("SELECT public.trailup_fechar_buckets_privados()").fetchone()[0]
        assert r2["urls_em_textos"] == {}
        assert _colunas(c, cid) == col


def test_reabrir_desfaz_a_reescrita_dos_textos():
    with _banco11() as (c, _p, cid):
        antes = _colunas(c, cid)
        c.execute("SELECT public.trailup_fechar_buckets_privados()")
        r = c.execute("SELECT public.trailup_reabrir_buckets_publicos(%s)", (BASE,)).fetchone()[0]
        assert r["buckets_reabertos"] == 4
        assert r["urls_em_textos_revertidas"]["conteudos.conteudo"] == 1
        assert _colunas(c, cid) == antes
        assert (
            c.execute("SELECT public.trailup_reabrir_buckets_publicos(%s)", (BASE,)).fetchone()[0][
                "urls_em_textos_revertidas"
            ]
            == {}
        )


def test_reescrita_nao_enfileira_regeracao_e_devolve_os_gatilhos_como_estavam():
    with _banco11() as (c, _p, cid):
        c.execute("SELECT public.trailup_fechar_buckets_privados()")
        c.execute("SELECT public.trailup_reabrir_buckets_publicos(%s)", (BASE,))
        assert c.execute("SELECT count(*) FROM public._log_regeracao").fetchone()[0] == 0
        estado = dict(
            c.execute("SELECT tgname, tgenabled FROM pg_trigger WHERE tgname LIKE 'trg_%%_class_delta_job'").fetchall()
        )
        assert estado == {"trg_conteudos_class_delta_job": "O", "trg_questoes_class_delta_job": "D"}
        # e o gatilho religado volta a valer para edicao de verdade
        c.execute("UPDATE public.conteudos SET titulo = 'Outro' WHERE id = %s", (cid,))
        assert c.execute("SELECT count(*) FROM public._log_regeracao").fetchone()[0] == 1


def test_falha_no_meio_nao_deixa_gatilho_desligado():
    with _banco11() as (c, _p, _cid):
        c.execute("ALTER TABLE public.midias ADD CONSTRAINT _sem_caminho_puro CHECK (url LIKE 'http%%') NOT VALID")
        with pytest.raises(Exception):
            c.execute("SELECT public.trailup_fechar_buckets_privados()")
        assert (
            c.execute("SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_conteudos_class_delta_job'").fetchone()[0]
            == "O"
        )
        assert c.execute("SELECT bool_and(public) FROM storage.buckets").fetchone()[0] is True


def test_arquivo_citado_no_texto_assina_para_a_turma_e_conta_como_em_uso():
    with _banco11() as (c, _p, _cid):
        c.execute("SELECT public.trailup_fechar_buckets_privados()")

        def le(uid) -> bool:
            with _como(c, uid):
                return bool(
                    c.execute(
                        "SELECT count(*) FROM storage.objects WHERE bucket_id = 'conteudos' AND name = %s", (EMB,)
                    ).fetchone()[0]
                )

        assert le(ALUNO) is True  # turma 1 cita a figura no markdown
        assert le(ALUNO2) is False
        assert le(OUTRO) is False
        assert le(None) is False

        c.execute("CREATE VIEW public.vw_material_storage_paths AS SELECT NULL::text AS storage_path WHERE false")
        material = str(rx.AINDA_USADO_SQL["material"]).replace(":caminho", "%(caminho)s")
        assert c.execute(material, {"caminho": EMB}).fetchone()[0] is True
        assert c.execute(material, {"caminho": f"{PROF}/1/nao_citado.png"}).fetchone()[0] is False


def test_bolsa_do_aluno_nao_abre_arquivo_para_a_turma():
    with _banco11() as (c, _p, _cid):
        alvo = f"{PROF}/99/so_na_bolsa.png"
        c.execute("INSERT INTO storage.objects (bucket_id, name) VALUES ('conteudos', %s)", (alvo,))
        c.execute(
            "INSERT INTO public.bag_itens (aluno_id, classe_id, tipo, titulo, conteudo) VALUES (%s, 1, 'nota', 'x', %s)",
            (str(ALUNO), f"![x]({OBJ}/authenticated/conteudos/{alvo})"),
        )
        with _como(c, ALUNO):
            n = c.execute(
                "SELECT count(*) FROM storage.objects WHERE bucket_id = 'conteudos' AND name = %s", (alvo,)
            ).fetchone()[0]
        assert n == 0


def test_versao_minima_nasce_desligada_e_publica():
    with _banco11() as (c, _p, _cid):
        linhas = {
            chave: (valor, publico)
            for chave, valor, publico in c.execute(
                "SELECT chave, valor, publico FROM public.app_config WHERE chave LIKE 'app\\_%%'"
            ).fetchall()
        }
        assert linhas == {"app_versao_minima": ("", True), "app_atualizacao_url": ("", True)}
        # rodar a migration de novo nao sobrescreve o que foi ligado
        c.execute("UPDATE public.app_config SET valor = '1.0.5' WHERE chave = 'app_versao_minima'")
        for sql in _sql_de(M11, "upgrade"):
            c.execute(sql)
        assert (
            c.execute("SELECT valor FROM public.app_config WHERE chave = 'app_versao_minima'").fetchone()[0] == "1.0.5"
        )


def test_funcoes_novas_so_para_o_servico():
    with _banco11() as (c, _p, _cid):
        for fn in (
            "trailup_reescrever_urls_nos_textos(boolean)",
            "trailup_gatilhos_de_regeracao(boolean, text[])",
            "trailup_fechar_buckets_privados()",
            "trailup_reabrir_buckets_publicos(text)",
        ):
            for papel in ("authenticated", "anon"):
                assert not c.execute(f"SELECT has_function_privilege('{papel}', 'public.{fn}', 'EXECUTE')").fetchone()[
                    0
                ], (papel, fn)
            assert c.execute(f"SELECT has_function_privilege('service_role', 'public.{fn}', 'EXECUTE')").fetchone()[0]


def test_downgrade_volta_a_10():
    with _banco11() as (c, _p, cid):
        c.execute("UPDATE public.app_config SET valor = 'https://loja' WHERE chave = 'app_atualizacao_url'")
        for sql in _sql_de(M11, "downgrade"):
            c.execute(sql)
        for fn in (
            "trailup_reescrever_urls_nos_textos",
            "trailup_gatilhos_de_regeracao",
            "trailup_texto_cita_conteudo",
        ):
            assert c.execute("SELECT count(*) FROM pg_proc WHERE proname = %s", (fn,)).fetchone()[0] == 0, fn
        chaves = {k for (k,) in c.execute("SELECT chave FROM public.app_config WHERE chave LIKE 'app\\_%%'")}
        assert chaves == {"app_atualizacao_url"}  # a que foi preenchida fica
        r = c.execute("SELECT public.trailup_fechar_buckets_privados()").fetchone()[0]
        assert "urls_em_textos" not in r and r["buckets_fechados"] == 4
        # a 10 nao mexe no meio do texto
        assert c.execute("SELECT conteudo FROM public.conteudos WHERE id = %s", (cid,)).fetchone()[0] == _texto(
            "public"
        )
        # e volta a so' contar campo inteiro
        with _como(c, ALUNO):
            n = c.execute(
                "SELECT count(*) FROM storage.objects WHERE bucket_id = 'conteudos' AND name = %s", (EMB,)
            ).fetchone()[0]
        assert n == 0
