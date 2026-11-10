"""E2E da `20261110_09` (aprovação do material personalizado) num Postgres LOCAL.

A RLS só se vê agindo com o papel de verdade: cada leitura do aluno e do professor roda como
`authenticated`, com o JWT que o PostgREST poria na sessão. A API e o worker entram como o dono
(sem JWT), que é como eles escrevem em produção.
"""

from __future__ import annotations

import json
import uuid

import pytest

from tests import _f5_banco as f5

pytestmark = f5.e2e

M = f5.modulo("20261110_09_aprovacao_do_personalizado.py")
UP = f5.sql_de(M)
DOWN = f5.sql_de(M, "downgrade")

OUTRO_PROF = uuid.UUID(int=12)

# O que já existe em produção e a migração pressupõe: helpers de posse, as policies de sempre
# (permissivas) e as dependências do aviso de material novo, aqui só registrando a chamada.
ANTES = """
CREATE OR REPLACE FUNCTION public.app_classes_do_professor()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id FROM classe c WHERE c.professor_id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.app_classes_do_aluno()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ca.classe_id FROM classe_aluno ca WHERE ca.aluno_id = auth.uid()
$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conteudo_personalizado, public.cards_personalizados
  TO authenticated;

ALTER TABLE public.conteudo_personalizado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards_personalizados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Aluno read own conteudo_personalizado" ON public.conteudo_personalizado
  FOR SELECT TO authenticated USING (auth.uid() = aluno_id);
CREATE POLICY aluno_classe_conteudo_personalizado_sel ON public.conteudo_personalizado
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid() OR (aluno_id IS NULL AND classe_id IN (SELECT app_classes_do_aluno())));
CREATE POLICY professor_all_conteudo_personalizado ON public.conteudo_personalizado
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM classe c WHERE c.id = conteudo_personalizado.classe_id AND c.professor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM classe c WHERE c.id = conteudo_personalizado.classe_id AND c.professor_id = auth.uid()));
CREATE POLICY aluno_classe_cards_personalizados_sel ON public.cards_personalizados
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid() OR (aluno_id IS NULL AND classe_id IN (SELECT app_classes_do_aluno())));
CREATE POLICY professor_all_cards_personalizados ON public.cards_personalizados
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM classe c WHERE c.id = cards_personalizados.classe_id AND c.professor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM classe c WHERE c.id = cards_personalizados.classe_id AND c.professor_id = auth.uid()));

CREATE TABLE public.avisos_enfileirados (aluno_id uuid, topico_id bigint);
CREATE TABLE public.notificacoes_material_pronto (
  aluno_id uuid, topico_id bigint, classe_id bigint, perfil text, personalizacao_id bigint,
  pendente_id bigint, PRIMARY KEY (aluno_id, topico_id)
);
CREATE OR REPLACE FUNCTION public.notificacoes_cfg_int(p text, d integer) RETURNS integer
  LANGUAGE sql AS $$ SELECT d $$;
CREATE OR REPLACE FUNCTION public.estudo_personalizacao_retida(p bigint) RETURNS boolean
  LANGUAGE sql AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.notificacoes_perfil_do_aluno(p uuid) RETURNS text
  LANGUAGE sql AS $$ SELECT 'seeker' $$;
CREATE OR REPLACE FUNCTION public.notificacoes_enfileirar_evento(
  p_aluno uuid, p_tipo text, p_chave text, p_titulo text, p_corpo text, p_ctx jsonb, p_a integer, p_b integer
) RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.avisos_enfileirados VALUES (p_aluno, (p_ctx ->> 'topico_id')::bigint);
  RETURN 1;
END $$;
CREATE OR REPLACE FUNCTION public.notificacoes_novo_material_produzir() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
"""

MATERIAIS = {"markdown": {"payload": {"texto": "v1"}, "revisao": 1}}


def _insere(c, *, topico: int = 10, conteudo: int | None = 100, perfil: str = "seeker",
            status: str = "pronto", aluno: uuid.UUID | None = None) -> int:
    """Como a API grava: dono, sem JWT."""
    f5.como(c, None)
    return c.execute(
        "INSERT INTO public.conteudo_personalizado (aluno_id, conteudo_id, topico_id, ciclo_id, plano,"
        " materiais, classe_id, status, source_hash, brainhex_profile_key)"
        " VALUES (%s, %s, %s, 'c1', '{}', %s, %s, %s, 'h1', %s) RETURNING id",
        (aluno, conteudo, topico, json.dumps(MATERIAIS), f5.TURMA, status, perfil),
    ).fetchone()[0]


def _linha(c, rid: int) -> dict:
    f5.como(c, None)
    cur = c.execute(
        "SELECT aprovacao, aprovacao_por, aprovacao_em, aprovacao_motivo, conteudo_versao"
        " FROM public.conteudo_personalizado WHERE id = %s",
        (rid,),
    )
    nomes = [d.name for d in cur.description]
    return dict(zip(nomes, cur.fetchone()))


def _conta_como(c, quem: uuid.UUID, tabela: str = "conteudo_personalizado") -> int:
    f5.como(c, quem)
    c.execute("SET ROLE authenticated")
    try:
        return c.execute(f"SELECT count(*) FROM public.{tabela}").fetchone()[0]
    finally:
        c.execute("RESET ROLE")
        f5.como(c, None)


def _decide(c, quem: uuid.UUID, itens: list[dict], decisao: str, motivo: str | None = None) -> int:
    f5.como(c, quem)
    c.execute("SET ROLE authenticated")
    try:
        return c.execute(
            "SELECT public.personalizacao_decidir(%s::jsonb, %s, %s)",
            (json.dumps(itens), decisao, motivo),
        ).fetchone()[0]
    finally:
        c.execute("RESET ROLE")
        f5.como(c, None)


@pytest.fixture()
def c():
    with f5.banco(ANTES) as conn:
        f5.semear_turma(conn)
        conn.execute(
            f"INSERT INTO auth.users (id, email) VALUES ('{OUTRO_PROF}', 'p2@teste.invalid');"
            f"INSERT INTO public.professor (id, nome) VALUES ('{OUTRO_PROF}', 'P2');"
        )
        f5.afrouxa(conn, "conteudos")
        conn.execute(
            "INSERT INTO public.conteudos (id, topico_id, titulo) OVERRIDING SYSTEM VALUE"
            " VALUES (100, 10, 'C1'), (200, 11, 'C2')"
        )
        # Material de antes da migração.
        conn.execute(
            "INSERT INTO public.conteudo_personalizado (conteudo_id, topico_id, ciclo_id, materiais,"
            " classe_id, status, brainhex_profile_key) VALUES (200, 11, 'antigo', '{}', 1, 'pronto', 'seeker')"
        )
        for sql in UP:
            conn.execute(sql)
        conn.execute("GRANT SELECT ON public.classe, public.classe_aluno TO authenticated")
        yield conn


def test_material_anterior_segue_a_decisao_do_legado(c):
    linha = c.execute(
        "SELECT aprovacao, aprovacao_em IS NOT NULL, aprovacao_por FROM public.conteudo_personalizado"
        " WHERE ciclo_id = 'antigo'"
    ).fetchone()
    if M.LEGADO_APROVADO:
        assert linha == ("aprovado", True, None)
    else:
        assert linha == ("pendente", False, None)


def test_material_novo_nasce_pendente_e_o_aluno_nao_le(c):
    rid = _insere(c)
    assert _linha(c, rid)["aprovacao"] == "pendente"
    antigos = 1 if M.LEGADO_APROVADO else 0
    assert _conta_como(c, f5.A) == antigos
    # O professor dono vê o pendente (precisa ver para decidir); o de outra turma, nada.
    assert _conta_como(c, f5.PROF) == 2
    assert _conta_como(c, OUTRO_PROF) == 0


def test_api_nao_aprova_nem_no_insert_nem_no_update(c):
    f5.como(c, None)
    rid = c.execute(
        "INSERT INTO public.conteudo_personalizado (conteudo_id, topico_id, ciclo_id, materiais, classe_id,"
        " aprovacao, aprovacao_por) VALUES (100, 10, 'x', '{}', 1, 'aprovado', %s) RETURNING id",
        (f5.PROF,),
    ).fetchone()[0]
    assert _linha(c, rid)["aprovacao"] == "pendente"
    assert _linha(c, rid)["aprovacao_por"] is None
    c.execute("UPDATE public.conteudo_personalizado SET aprovacao = 'aprovado' WHERE id = %s", (rid,))
    assert _linha(c, rid)["aprovacao"] == "pendente"


def test_professor_aprova_pela_rpc_e_o_aluno_passa_a_ler(c):
    rid = _insere(c)
    antes = _conta_como(c, f5.A)
    assert _decide(c, f5.PROF, [{"id": rid, "versao": 1}], "aprovado") == 1
    linha = _linha(c, rid)
    assert linha["aprovacao"] == "aprovado"
    assert linha["aprovacao_por"] == f5.PROF
    assert linha["aprovacao_em"] is not None
    assert _conta_como(c, f5.A) == antes + 1


def test_versao_vista_diferente_recusa_a_decisao(c):
    rid = _insere(c)
    with pytest.raises(Exception) as erro:
        _decide(c, f5.PROF, [{"id": rid, "versao": 7}], "aprovado")
    assert erro.value.sqlstate == "40001"
    assert _linha(c, rid)["aprovacao"] == "pendente"


def test_outro_professor_e_aluno_nao_decidem(c):
    rid = _insere(c)
    for quem in (OUTRO_PROF, f5.A):
        with pytest.raises(Exception) as erro:
            _decide(c, quem, [{"id": rid, "versao": 1}], "aprovado")
        assert erro.value.sqlstate == "42501"
    assert _linha(c, rid)["aprovacao"] == "pendente"


def test_update_direto_do_aluno_nao_aprova(c):
    rid = _insere(c)
    f5.como(c, f5.A)
    c.execute("SET ROLE authenticated")
    try:
        c.execute("UPDATE public.conteudo_personalizado SET aprovacao = 'aprovado' WHERE id = %s", (rid,))
    finally:
        c.execute("RESET ROLE")
    assert _linha(c, rid)["aprovacao"] == "pendente"


def test_regerar_volta_para_pendente_e_sobe_a_versao(c):
    rid = _insere(c)
    _decide(c, f5.PROF, [{"id": rid, "versao": 1}], "aprovado")
    f5.como(c, None)
    c.execute(
        "UPDATE public.conteudo_personalizado"
        " SET materiais = jsonb_set(materiais, '{markdown,revisao}', '2') WHERE id = %s",
        (rid,),
    )
    linha = _linha(c, rid)
    assert (linha["aprovacao"], linha["conteudo_versao"], linha["aprovacao_por"]) == ("pendente", 2, None)


def test_contador_de_falha_do_worker_nao_derruba_a_aprovacao(c):
    rid = _insere(c)
    _decide(c, f5.PROF, [{"id": rid, "versao": 1}], "aprovado")
    f5.como(c, None)
    c.execute(
        "UPDATE public.conteudo_personalizado SET materiais = jsonb_set(materiais, '{_geracao_falhas}',"
        " '{\"streak\": 1}') WHERE id = %s",
        (rid,),
    )
    linha = _linha(c, rid)
    assert (linha["aprovacao"], linha["conteudo_versao"]) == ("aprovado", 1)


def test_nao_aprova_material_em_geracao(c):
    rid = _insere(c, status="processando_midias")
    with pytest.raises(Exception) as erro:
        _decide(c, f5.PROF, [{"id": rid, "versao": 1}], "aprovado")
    assert erro.value.sqlstate == "22023"


def test_recusa_guarda_motivo_e_o_aluno_nao_le(c):
    rid = _insere(c)
    _decide(c, f5.PROF, [{"id": rid, "versao": 1}], "aprovado")
    antes = _conta_como(c, f5.A)
    assert _decide(c, f5.PROF, [{"id": rid, "versao": 1}], "recusado", "  tom errado  ") == 1
    linha = _linha(c, rid)
    assert (linha["aprovacao"], linha["aprovacao_motivo"]) == ("recusado", "tom errado")
    assert linha["aprovacao_por"] == f5.PROF
    assert _conta_como(c, f5.A) == antes - 1


def test_cards_seguem_a_aprovacao_do_registro(c):
    rid = _insere(c)
    f5.como(c, None)
    c.execute(
        "INSERT INTO public.cards_personalizados (classe_id, topico_id, conteudo_id, ciclo_id, titulo,"
        " descricao, metadata) VALUES (1, 10, 100, 'c1', 'P', '', '{\"brainhex_profile_key\": \"seeker\"}'),"
        " (1, 10, 100, 'c1', 'Q', '', '{\"brainhex_profile_key\": \"mastermind\"}')"
    )
    assert _conta_como(c, f5.A, "cards_personalizados") == 0
    assert _conta_como(c, f5.PROF, "cards_personalizados") == 2
    _decide(c, f5.PROF, [{"id": rid, "versao": 1}], "aprovado")
    # Só o card do perfil aprovado (seeker) aparece.
    assert _conta_como(c, f5.A, "cards_personalizados") == 1


def test_aviso_de_material_novo_sai_na_aprovacao(c):
    # A função real (não o esboço do ANTES) já está instalada pela migração.
    rid = _insere(c)
    assert c.execute("SELECT count(*) FROM public.avisos_enfileirados").fetchone()[0] == 0
    c.execute("UPDATE public.classe_aluno SET created_at = now() - interval '30 days'")
    _decide(c, f5.PROF, [{"id": rid, "versao": 1}], "aprovado")
    assert c.execute("SELECT count(*) FROM public.avisos_enfileirados").fetchone()[0] == 3


def test_percurso_conta_so_material_aprovado(c):
    rid = _insere(c)
    f5.como(c, None)
    f5.afrouxa(c, "personalizacao_item_progresso")
    c.execute("UPDATE public.alunos SET perfil_ativo = 'seeker'")
    c.execute(
        "INSERT INTO public.personalizacao_percurso (aluno_id, personalizacao_id, classe_id, topico_id, item_keys)"
        " VALUES (%s, %s, 1, 10, '[\"texto:1\", \"audio:1\"]')",
        (f5.A, rid),
    )
    percurso = "SELECT coalesce(sum(total), 0) FROM public.trailup_progresso_percurso(%s, 1)"
    assert c.execute(percurso, (f5.A,)).fetchone()[0] == 0
    _decide(c, f5.PROF, [{"id": rid, "versao": 1}], "aprovado")
    assert c.execute(percurso, (f5.A,)).fetchone()[0] == 2


def test_downgrade_desfaz_sem_erro(c):
    for sql in DOWN:
        c.execute(sql)
    colunas = {
        r[0]
        for r in c.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'conteudo_personalizado'"
        ).fetchall()
    }
    assert "aprovacao" not in colunas
    assert "conteudo_versao" not in colunas
