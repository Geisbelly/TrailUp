"""`20261104_08`: conteúdo idêntico se vincula, e editar desvincula só a linha editada.

Banco descartável com o esqueleto da produção. O que se prova, com o papel de verdade onde importa:

- o vínculo cita os arquivos da origem, com chave de geração própria, e copia cards e `materiais_gerados`;
- a origem que mudou desde a decisão do worker não vincula;
- o aluno da turma nova lê a linha e o caminho da turma de origem pela view do gateway;
- editar a turma vinculada ou a de origem desvincula só aquela linha, e o material da outra não muda;
- apagar a origem não leva o vínculo, e o arquivo continua referenciado;
- cliente não forja impressão nem vínculo, e não chama a função;
- o SQL do repositório roda com o driver de verdade (asyncpg);
- o downgrade tira tudo.
"""

from __future__ import annotations

import asyncio
import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from tests import _f5_banco as f5
from tests.test_e2e_kpis_por_topico import _trecho

M = f5.modulo("20261104_08_reuso_de_personalizacao.py")

INDICES = """
CREATE UNIQUE INDEX uq_conteudo_personalizado_base_topico_conteudo_perfil
  ON public.conteudo_personalizado (classe_id, topico_id, conteudo_id, brainhex_profile_key)
  WHERE aluno_id IS NULL AND topico_id IS NOT NULL AND conteudo_id IS NOT NULL;
DO $i$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'materiais_gerados' AND column_name = 'generation_key') THEN
    ALTER TABLE public.materiais_gerados
      ADD COLUMN generation_key text GENERATED ALWAYS AS (metadata ->> 'generation_key') STORED;
  END IF;
END $i$;
CREATE UNIQUE INDEX uq_materiais_gerados_personalizacao_tipo_generation
  ON public.materiais_gerados (personalizacao_id, tipo, generation_key);
"""

VIEW = _trecho("20260922_02_gateway_cobre_fontes_personalizacao.py", "CREATE OR REPLACE VIEW", "fp.storage_path IS NOT NULL").replace(
    "{VIEW}", "public.vw_material_storage_paths"
)

PERFIL = "seeker"
IMPRESSAO = "f" * 64
CAMINHO = "brainhex/seeker/classe-1/topico-10/conteudo-1/generation-abc/audio/material.mp3"
ALUNO_B = uuid.UUID(int=31)


def _materiais(chave: str) -> str:
    return json.dumps(
        {
            "audio": {"storage_path": CAMINHO, "metadata": {"status": "completed", "generation_key": chave}},
            "markdown": {"metadata": {"status": "completed", "generation_key": chave}, "payload": {"markdown": "# Oi"}},
        }
    )


def _banco():
    return f5.banco(INDICES, *f5.sql_de(M), VIEW)


def _semear(c) -> int:
    """Turma 1 com o material pronto; turma 2 com o mesmo conteúdo, sem material; aluno em cada uma."""
    f5.semear_turma(c)
    for tabela in ("conteudos", "conteudo_personalizado", "cards_personalizados", "materiais_gerados"):
        f5.afrouxa(c, tabela)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES ('{ALUNO_B}', 'x@teste.invalid');
INSERT INTO public.alunos (id, nome, email) VALUES ('{ALUNO_B}', 'X', 'x@teste.invalid');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE
  VALUES (2, 1, '{f5.PROF}', 'Outra');
INSERT INTO public.topicos (id, classe_id, nome, ordem) OVERRIDING SYSTEM VALUE VALUES (20, 2, 'Outro nome', 1);
INSERT INTO public.classe_aluno (classe_id, aluno_id) VALUES (2, '{ALUNO_B}');
INSERT INTO public.conteudos (id, topico_id, titulo, tipo, conteudo) OVERRIDING SYSTEM VALUE VALUES
  (1, 10, 'Frações', 'texto', 'Igual'), (2, 20, 'Frações', 'texto', 'Igual');
"""
    )
    origem = c.execute(
        """
        INSERT INTO public.conteudo_personalizado
          (aluno_id, classe_id, topico_id, conteudo_id, brainhex_profile_key, ciclo_id, plano, materiais,
           formato_prioritario, formatos_gerados, status, source_hash, impressao_conteudo)
        VALUES (NULL, 1, 10, 1, %s, 'ciclo-a', %s, %s, 'cards', ARRAY['cards', 'audio'], 'pronto', 'hash-a', %s)
        RETURNING id
        """,
        (
            PERFIL,
            json.dumps({"content_enrichment": {"source_hash": "hash-a", "blocos": [{"id": "b1"}]}}),
            _materiais("ciclo-a:hash-a"),
            IMPRESSAO,
        ),
    ).fetchone()[0]
    card = c.execute(
        """
        INSERT INTO public.cards_personalizados
          (classe_id, topico_id, conteudo_id, ciclo_id, ordem, titulo, descricao, metadata)
        VALUES (1, 10, 1, 'ciclo-a', 1, 'Pergunta', '', %s) RETURNING id
        """,
        (json.dumps({"brainhex_profile_key": PERFIL, "classe_id": 1, "frente": "P", "verso": "R"}),),
    ).fetchone()[0]
    c.execute(
        """UPDATE public.conteudo_personalizado
              SET plano = plano || jsonb_build_object('cards_personalizados_ids', jsonb_build_array(%s::bigint))
            WHERE id = %s""",
        (card, origem),
    )
    c.execute(
        """
        INSERT INTO public.materiais_gerados (conteudo_id, tipo, personalizacao_id, storage_path, metadata)
        VALUES (1, 'audio', %s, %s, %s)
        """,
        (origem, CAMINHO, json.dumps({"generation_key": "ciclo-a:hash-a"})),
    )
    return origem


def _vincular(c, origem: int, *, conteudo: int = 2, topico: int = 20, classe: int = 2, impressao: str = IMPRESSAO):
    return c.execute(
        "SELECT public.trailup_vincular_personalizacao(%s, %s, %s, %s, %s, 'ciclo-b', 'hash-b', %s)",
        (origem, classe, topico, conteudo, PERFIL, impressao),
    ).fetchone()[0]


def _linha(c, id_: int) -> dict:
    colunas = ("status", "ciclo_id", "source_hash", "materiais", "plano", "impressao_conteudo", "vinculado_de_id")
    return dict(zip(colunas, c.execute(
        f"SELECT {', '.join(colunas)} FROM public.conteudo_personalizado WHERE id = %s", (id_,)
    ).fetchone(), strict=True))


def _editar(c, id_: int) -> None:
    """O que `claim_new_generation` faz quando o professor edita: troca a geração na linha."""
    c.execute(
        """UPDATE public.conteudo_personalizado
              SET source_hash = 'hash-editado', ciclo_id = 'ciclo-editado', materiais = '{}',
                  status = 'processando_midias'
            WHERE id = %s""",
        (id_,),
    )


@f5.e2e
def test_vinculo_cita_os_arquivos_da_origem_com_geracao_propria() -> None:
    with _banco() as c:
        origem = _semear(c)
        antes = _linha(c, origem)

        vinculo = _vincular(c, origem)

        linha = _linha(c, vinculo)
        assert (linha["status"], linha["ciclo_id"], linha["source_hash"]) == ("pronto", "ciclo-b", "hash-b")
        assert (linha["impressao_conteudo"], linha["vinculado_de_id"]) == (IMPRESSAO, origem)
        assert linha["materiais"]["audio"]["storage_path"] == CAMINHO
        assert linha["materiais"]["audio"]["metadata"]["generation_key"] == "ciclo-b:hash-b"
        assert linha["materiais"]["markdown"]["payload"] == {"markdown": "# Oi"}
        assert linha["plano"]["content_enrichment"]["source_hash"] == "hash-b"
        assert linha["plano"]["reuso_origem_id"] == origem
        assert _linha(c, origem) == antes


@f5.e2e
def test_vinculo_copia_cards_e_materiais_gerados_para_a_turma() -> None:
    with _banco() as c:
        origem = _semear(c)

        vinculo = _vincular(c, origem)

        cards = c.execute(
            "SELECT id, classe_id, topico_id, conteudo_id, ciclo_id, metadata ->> 'classe_id', metadata ->> 'verso'"
            " FROM public.cards_personalizados WHERE classe_id = 2"
        ).fetchall()
        assert len(cards) == 1
        assert cards[0][1:] == (2, 20, 2, "ciclo-b", "2", "R")
        assert _linha(c, vinculo)["plano"]["cards_personalizados_ids"] == [cards[0][0]]
        assert c.execute(
            "SELECT storage_path, generation_key FROM public.materiais_gerados WHERE personalizacao_id = %s",
            (vinculo,),
        ).fetchall() == [(CAMINHO, "ciclo-b:hash-b")]


@f5.e2e
def test_repetir_o_vinculo_nao_duplica_cards() -> None:
    with _banco() as c:
        origem = _semear(c)

        primeiro = _vincular(c, origem)
        segundo = _vincular(c, origem)

        assert primeiro == segundo
        assert c.execute(
            "SELECT count(*) FROM public.cards_personalizados WHERE classe_id = 2 AND ativo"
        ).fetchone() == (1,)


@f5.e2e
def test_origem_que_mudou_nao_vincula() -> None:
    with _banco() as c:
        origem = _semear(c)

        assert _vincular(c, origem, impressao="outra") is None
        c.execute("UPDATE public.conteudo_personalizado SET status = 'failed' WHERE id = %s", (origem,))
        assert _vincular(c, origem) is None
        assert c.execute("SELECT count(*) FROM public.conteudo_personalizado").fetchone() == (1,)


@f5.e2e
def test_aluno_da_turma_nova_le_o_material_da_origem_pelo_gateway() -> None:
    with _banco() as c:
        origem = _semear(c)
        _vincular(c, origem)
        c.execute(
            """
CREATE FUNCTION public.app_classes_do_aluno() RETURNS SETOF bigint LANGUAGE sql STABLE AS
  $f$ SELECT classe_id FROM public.classe_aluno WHERE aluno_id = auth.uid() $f$;
ALTER TABLE public.conteudo_personalizado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_gerados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fontes_personalizacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY aluno_classe_conteudo_personalizado_sel ON public.conteudo_personalizado FOR SELECT TO authenticated
  USING (aluno_id = auth.uid() OR (aluno_id IS NULL AND classe_id IN (SELECT public.app_classes_do_aluno())));
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT ON public.conteudo_personalizado, public.materiais_gerados, public.fontes_personalizacao,
  public.vw_material_storage_paths, public.classe_aluno TO authenticated;
"""
        )
        f5.como(c, ALUNO_B)
        c.execute("SET ROLE authenticated")
        try:
            assert c.execute(
                "SELECT storage_path FROM public.vw_material_storage_paths WHERE storage_path = %s", (CAMINHO,)
            ).fetchone() == (CAMINHO,)
            assert c.execute(
                "SELECT classe_id FROM public.conteudo_personalizado"
            ).fetchall() == [(2,)]
        finally:
            c.execute("RESET ROLE")


@f5.e2e
def test_editar_a_turma_vinculada_desvincula_so_ela() -> None:
    with _banco() as c:
        origem = _semear(c)
        vinculo = _vincular(c, origem)
        antes = _linha(c, origem)

        _editar(c, vinculo)

        linha = _linha(c, vinculo)
        assert (linha["impressao_conteudo"], linha["vinculado_de_id"]) == (None, None)
        assert _linha(c, origem) == antes


@f5.e2e
def test_editar_a_turma_de_origem_nao_mexe_no_material_da_outra() -> None:
    with _banco() as c:
        origem = _semear(c)
        vinculo = _vincular(c, origem)
        antes = _linha(c, vinculo)

        _editar(c, origem)

        assert _linha(c, origem)["impressao_conteudo"] is None
        assert _linha(c, vinculo) == antes


@f5.e2e
def test_reivindicar_com_impressao_nova_mantem_a_impressao_nova() -> None:
    """O `DO UPDATE` de `claim_new_generation` também passa pelo gatilho."""
    with _banco() as c:
        origem = _semear(c)
        vinculo = _vincular(c, origem)

        c.execute(
            """
            INSERT INTO public.conteudo_personalizado
              (classe_id, topico_id, conteudo_id, brainhex_profile_key, ciclo_id, materiais, status,
               source_hash, impressao_conteudo)
            VALUES (2, 20, 2, %s, 'ciclo-c', '{}', 'processando_midias', 'hash-c', 'nova')
            ON CONFLICT (classe_id, topico_id, conteudo_id, brainhex_profile_key)
              WHERE aluno_id IS NULL AND topico_id IS NOT NULL AND conteudo_id IS NOT NULL
            DO UPDATE SET source_hash = EXCLUDED.source_hash, impressao_conteudo = EXCLUDED.impressao_conteudo
            """,
            (PERFIL,),
        )

        assert _linha(c, vinculo)["impressao_conteudo"] == "nova"


@f5.e2e
def test_apagar_a_origem_nao_leva_o_vinculo_nem_o_arquivo() -> None:
    with _banco() as c:
        origem = _semear(c)
        vinculo = _vincular(c, origem)

        c.execute("DELETE FROM public.materiais_gerados WHERE personalizacao_id = %s", (origem,))
        c.execute("DELETE FROM public.conteudo_personalizado WHERE id = %s", (origem,))

        linha = _linha(c, vinculo)
        assert linha["vinculado_de_id"] is None
        assert linha["impressao_conteudo"] == IMPRESSAO
        assert c.execute(
            "SELECT EXISTS (SELECT 1 FROM public.vw_material_storage_paths WHERE storage_path = %s)", (CAMINHO,)
        ).fetchone() == (True,)


@f5.e2e
def test_cliente_nao_forja_impressao_nem_vinculo() -> None:
    with _banco() as c:
        origem = _semear(c)
        vinculo = _vincular(c, origem)
        c.execute("GRANT USAGE ON SCHEMA public TO authenticated")
        c.execute("GRANT SELECT, INSERT, UPDATE ON public.conteudo_personalizado TO authenticated")
        c.execute("SET ROLE authenticated")
        try:
            c.execute(
                "UPDATE public.conteudo_personalizado SET impressao_conteudo = 'forjada', vinculado_de_id = NULL WHERE id = %s",
                (vinculo,),
            )
            assert _linha(c, vinculo)["impressao_conteudo"] == IMPRESSAO
            assert _linha(c, vinculo)["vinculado_de_id"] == origem

            c.execute(
                """UPDATE public.conteudo_personalizado SET materiais = '{"audio": {}}', impressao_conteudo = %s
                    WHERE id = %s""",
                (IMPRESSAO, origem),
            )
            assert _linha(c, origem)["impressao_conteudo"] == "editado"

            inserida = c.execute(
                """
                INSERT INTO public.conteudo_personalizado
                  (classe_id, topico_id, conteudo_id, brainhex_profile_key, ciclo_id, materiais, status,
                   source_hash, impressao_conteudo)
                VALUES (1, 11, NULL, %s, 'c', '{}', 'pronto', 'h', %s) RETURNING impressao_conteudo
                """,
                (PERFIL, IMPRESSAO),
            ).fetchone()[0]
            assert inserida == "editado"
        finally:
            c.execute("RESET ROLE")


@f5.e2e
def test_cliente_nao_chama_a_funcao_de_vinculo() -> None:
    with _banco() as c:
        assert c.execute(
            """
            SELECT has_function_privilege(r, 'public.trailup_vincular_personalizacao(bigint, bigint, bigint, bigint, text, text, text, text)', 'EXECUTE')
              FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r
            """
        ).fetchall() == [(False,), (False,), (True,)]


@f5.e2e
def test_repositorio_com_o_driver_de_verdade() -> None:
    """Parâmetro sem tipo só falha em execução, no asyncpg, e mock nenhum vê isso."""

    async def _rodar(dsn: str, origem: int) -> None:
        engine = create_async_engine(dsn.replace("postgresql://", "postgresql+asyncpg://", 1))
        try:
            async with AsyncSession(engine) as session:
                repo = ConteudoPersonalizadoRepository(session)
                await repo.travar_impressao(impressao=IMPRESSAO, perfil=PERFIL)
                candidatas = await repo.listar_bases_por_impressao(
                    impressao=IMPRESSAO, perfil=PERFIL, classe_id=2, topico_id=20, conteudo_id=2,
                    stale_processing_min=15,
                )
                assert [(x["id"], x["recente"]) for x in candidatas] == [(origem, True)]
                assert candidatas[0]["materiais"]["audio"]["storage_path"] == CAMINHO
                assert await repo.listar_bases_por_impressao(
                    impressao=IMPRESSAO, perfil=PERFIL, classe_id=1, topico_id=10, conteudo_id=1,
                    stale_processing_min=15,
                ) == []

                enriquecimento = await repo.buscar_enriquecimento_por_impressao(impressao=IMPRESSAO)
                assert enriquecimento["blocos"] == [{"id": "b1"}]
                assert await repo.buscar_enriquecimento_por_impressao(impressao="outra") is None

                vinculo = await repo.vincular_a_origem(
                    origem_id=origem, classe_id=2, topico_id=20, conteudo_id=2, perfil=PERFIL,
                    ciclo_id="ciclo-b", source_hash="hash-b", impressao=IMPRESSAO,
                )
                assert vinculo is not None
                await session.commit()

                await repo.marcar_material_editado(record_id=vinculo)
                await repo.gravar_impressao(record_id=vinculo, impressao=IMPRESSAO)
                await session.commit()

                reservou = await repo.claim_new_generation(
                    aluno_id=None, classe_id=1, topico_id=11, conteudo_id=3,
                    brainhex_profile_key=PERFIL, ciclo_id="ciclo-n", source_hash="hash-n",
                    impressao_conteudo=IMPRESSAO,
                )
                assert reservou is True
        finally:
            await engine.dispose()

    with _banco() as c:
        origem = _semear(c)
        c.execute(
            "INSERT INTO public.conteudos (id, topico_id, titulo, tipo, conteudo) OVERRIDING SYSTEM VALUE"
            " VALUES (3, 11, 'Frações', 'texto', 'Igual')"
        )
        asyncio.run(_rodar(f5._dsn_para(c.info.dbname), origem))

        assert c.execute(
            "SELECT impressao_conteudo, vinculado_de_id FROM public.conteudo_personalizado WHERE classe_id = 2"
        ).fetchone() == ("editado", None)
        assert c.execute(
            "SELECT impressao_conteudo, status FROM public.conteudo_personalizado WHERE conteudo_id = 3"
        ).fetchone() == (IMPRESSAO, "processando_midias")


@f5.e2e
def test_downgrade_tira_tudo() -> None:
    with _banco() as c:
        c.execute("DROP VIEW public.vw_material_storage_paths")
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        assert c.execute(
            """
            SELECT count(*) FROM information_schema.columns
             WHERE table_name = 'conteudo_personalizado'
               AND column_name IN ('impressao_conteudo', 'vinculado_de_id')
            """
        ).fetchone() == (0,)
        assert c.execute(
            "SELECT count(*) FROM pg_proc WHERE proname IN ('trailup_vincular_personalizacao', 'trg_conteudo_personalizado_reuso')"
        ).fetchone() == (0,)
