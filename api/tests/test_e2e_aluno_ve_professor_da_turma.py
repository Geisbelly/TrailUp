"""`20261106_01`: o aluno vê o professor da turma, e só o que deve ver.

Banco local com o esqueleto da produção e as policies medidas lá em 2026-11-06. A RLS só age com o
papel de verdade, então toda leitura aqui é feita como `authenticated`, com o JWT de quem pergunta.
`test_antes_o_nome_vinha_nulo` reproduz o defeito na view como ela estava.
"""

from __future__ import annotations

import uuid

from tests import _f5_banco as f5

pytestmark = f5.e2e

M = f5.modulo("20261106_01_aluno_ve_professor_da_turma.py")
M_ARQUIVOS = f5.modulo("20261024_09_buckets_privados.py")

PROF = uuid.UUID(int=101)
OUTRO_PROF = uuid.UUID(int=102)
ALUNO = uuid.UUID(int=201)
COLEGA = uuid.UUID(int=202)
DE_FORA = uuid.UUID(int=203)
FOTO = f"{PROF}/foto.png"

ESTRUTURA = """
ALTER TABLE public.professor
  ADD COLUMN IF NOT EXISTS liberado boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS instituicao text,
  ADD COLUMN IF NOT EXISTS disciplina text,
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.classe ADD COLUMN IF NOT EXISTS descricao text;

CREATE FUNCTION public.app_e_dono() RETURNS boolean LANGUAGE sql STABLE AS $f$ SELECT false $f$;
CREATE FUNCTION public.app_classes_do_professor() RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $f$ SELECT id FROM public.classe WHERE professor_id = auth.uid() $f$;
CREATE FUNCTION public.app_classes_do_aluno() RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $f$ SELECT classe_id FROM public.classe_aluno WHERE aluno_id = auth.uid() $f$;
CREATE FUNCTION public.app_minhas_classes() RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $f$ SELECT public.app_classes_do_professor() UNION SELECT public.app_classes_do_aluno() $f$;
CREATE FUNCTION public.trailup_dono_do_arquivo(p_nome text) RETURNS uuid
LANGUAGE sql IMMUTABLE
AS $f$ SELECT CASE WHEN length(coalesce(p_nome, '')) >= 36 THEN left(p_nome, 36)::uuid END $f$;

ALTER TABLE public.professor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classe_aluno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."iaDescricao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY professor_select_own_or_owner ON public.professor FOR SELECT TO authenticated
  USING (auth.uid() = id);
CREATE POLICY classe_posse_sel ON public.classe FOR SELECT TO authenticated
  USING (professor_id = auth.uid() OR id IN (SELECT public.app_minhas_classes()));
CREATE POLICY classe_aluno_sel ON public.classe_aluno FOR SELECT TO authenticated
  USING (aluno_id = auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor()));
CREATE POLICY materia_sel ON public.materia FOR SELECT TO authenticated USING (true);
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, anon;
"""

VIEW_DE_ANTES = """
CREATE VIEW public.vw_aluno_classe_resumo WITH (security_invoker = on) AS
 SELECT ca.aluno_id, c.id AS classe_id, m.nome AS materia_nome, m.descricao AS materia_descricao,
    p.nome AS professor_nome, p.descricao AS professor_descricao,
    ca."notaMedia", ca."tempoMedioPorAtividade", ca."acertosPercentual", ca."porcentagemConcluida",
    ca."ultimaAtividade", ca."tempoGastoMin", ca."isComplete", ca."atividadesConcluidas",
    iad."recomendacaoTrilha", iad."modoOperacao", iad.insights, iad."perfisDetectados"
   FROM public.classe_aluno ca
     JOIN public.classe c ON c.id = ca.classe_id
     LEFT JOIN public.materia m ON m.id = c.materia_id
     LEFT JOIN public.professor p ON p.id = c.professor_id
     LEFT JOIN public."iaDescricao" iad ON iad.aluno_id = ca.aluno_id;
GRANT SELECT ON public.vw_aluno_classe_resumo TO authenticated;
"""


def _semear(c) -> None:
    for tabela in ("professor", "classe", "materia", "alunos"):
        f5.afrouxa(c, tabela)
    c.execute(
        f"""
INSERT INTO auth.users (id, email) VALUES
  ('{PROF}', 'p@teste.invalid'), ('{OUTRO_PROF}', 'o@teste.invalid'), ('{ALUNO}', 'a@teste.invalid'),
  ('{COLEGA}', 'c@teste.invalid'), ('{DE_FORA}', 'f@teste.invalid');
INSERT INTO public.professor (id, nome, descricao, instituicao, disciplina, foto_url, liberado) VALUES
  ('{PROF}', 'Ana', 'Gosta de grafos', 'Ulbra', 'Computação', 'perfil_fotos/{FOTO}', true),
  ('{OUTRO_PROF}', 'Bia', NULL, NULL, NULL, NULL, true);
INSERT INTO public.alunos (id, nome, email) VALUES
  ('{ALUNO}', 'Aluno', 'a@teste.invalid'), ('{COLEGA}', 'Colega', 'c@teste.invalid'),
  ('{DE_FORA}', 'Fora', 'f@teste.invalid');
INSERT INTO public.materia (id, nome) OVERRIDING SYSTEM VALUE VALUES (1, 'Algoritmos');
INSERT INTO public.classe (id, materia_id, professor_id, descricao) OVERRIDING SYSTEM VALUE VALUES
  (1, 1, '{PROF}', '3º período'),
  (2, NULL, '{PROF}', 'Reforço'),
  (3, 1, '{PROF}', 'Turma alheia'),
  (4, 1, '{OUTRO_PROF}', 'De outro professor');
INSERT INTO public.classe_aluno (classe_id, aluno_id, created_at) VALUES
  (1, '{ALUNO}', now()), (2, '{ALUNO}', now()), (4, '{ALUNO}', now()),
  (1, '{COLEGA}', now()), (3, '{DE_FORA}', now());
"""
    )


def _banco(*, com_migration: bool = True):
    return f5.banco(
        ESTRUTURA,
        M_ARQUIVOS.FUNCOES_SQL,
        VIEW_DE_ANTES,
        *(f5.sql_de(M) if com_migration else []),
    )


def _como(c, quem: uuid.UUID) -> None:
    c.execute("RESET ROLE")
    f5.como(c, quem)
    c.execute("SET ROLE authenticated")


def _perfil(c, classe: int):
    return c.execute("SELECT public.aluno_ver_professor_da_turma(%s)", (classe,)).fetchone()[0]


def _resumo(c, aluno: uuid.UUID):
    return c.execute(
        "SELECT classe_id, materia_nome, professor_nome, classe_nome FROM public.vw_aluno_classe_resumo"
        " WHERE aluno_id = %s ORDER BY classe_id",
        (aluno,),
    ).fetchall()


def test_antes_o_nome_vinha_nulo():
    with _banco(com_migration=False) as c:
        _semear(c)
        _como(c, ALUNO)
        nomes = c.execute(
            "SELECT professor_nome FROM public.vw_aluno_classe_resumo WHERE aluno_id = %s", (ALUNO,)
        ).fetchall()
        assert nomes == [(None,), (None,), (None,)]


def test_card_recebe_professor_materia_e_nome_da_turma():
    with _banco() as c:
        _semear(c)
        _como(c, ALUNO)
        assert _resumo(c, ALUNO) == [
            (1, "Algoritmos", "Ana", "3º período"),
            (2, None, "Ana", "Reforço"),
            (4, "Algoritmos", "Bia", "De outro professor"),
        ]


def test_aluno_continua_sem_ler_a_tabela_professor():
    with _banco() as c:
        _semear(c)
        _como(c, ALUNO)
        assert c.execute("SELECT count(*) FROM public.professor").fetchone()[0] == 0


def test_perfil_tem_so_os_campos_publicos():
    with _banco() as c:
        _semear(c)
        _como(c, ALUNO)
        perfil = _perfil(c, 1)
        assert set(perfil) == {"nome", "foto_url", "descricao", "instituicao", "disciplina", "turmas"}
        assert perfil["nome"] == "Ana"
        assert perfil["instituicao"] == "Ulbra"
        assert perfil["disciplina"] == "Computação"


def test_perfil_lista_so_as_turmas_em_comum():
    with _banco() as c:
        _semear(c)
        _como(c, ALUNO)
        assert _perfil(c, 1)["turmas"] == [
            {"classe_id": 1, "nome": "3º período", "materia": "Algoritmos"},
            {"classe_id": 2, "nome": "Reforço", "materia": None},
        ]


def test_fora_da_turma_nao_ve_nada():
    with _banco() as c:
        _semear(c)
        _como(c, DE_FORA)
        assert _perfil(c, 1) is None
        assert c.execute("SELECT * FROM public.trailup_professor_da_turma(1)").fetchall() == []
        assert _perfil(c, 999) is None


def test_anonimo_nao_executa():
    with _banco() as c:
        _semear(c)
        c.execute("SET ROLE anon")
        for chamada in ("aluno_ver_professor_da_turma(1)", "trailup_professor_da_turma(1)"):
            try:
                c.execute(f"SELECT public.{chamada}")
            except Exception as erro:  # noqa: BLE001
                assert "permission denied" in str(erro)
            else:
                raise AssertionError(f"anon executou {chamada}")


def test_foto_do_professor_so_para_quem_esta_na_turma_dele():
    with _banco() as c:
        _semear(c)
        pode = "SELECT public.trailup_pode_ler_arquivo('perfil_fotos', %s)"
        sem_turma = uuid.UUID(int=204)
        for quem, esperado in ((ALUNO, True), (COLEGA, True), (DE_FORA, True), (OUTRO_PROF, False), (sem_turma, False)):
            _como(c, quem)
            assert c.execute(pode, (FOTO,)).fetchone()[0] is esperado, quem


def test_foto_de_colega_continua_como_estava():
    with _banco() as c:
        _semear(c)
        foto_do_colega = f"{COLEGA}/x.png"
        pode = "SELECT public.trailup_pode_ler_arquivo('perfil_fotos', %s)"
        for quem, esperado in ((ALUNO, True), (DE_FORA, False), (PROF, True), (OUTRO_PROF, False)):
            _como(c, quem)
            assert c.execute(pode, (foto_do_colega,)).fetchone()[0] is esperado, quem


def test_o_professor_ve_o_proprio_perfil():
    with _banco() as c:
        _semear(c)
        _como(c, PROF)
        perfil = _perfil(c, 3)
        assert perfil["nome"] == "Ana"
        assert [t["classe_id"] for t in perfil["turmas"]] == [1, 2, 3]


def test_downgrade_volta_ao_defeito_sem_quebrar():
    with _banco() as c:
        _semear(c)
        for sql in f5.sql_de(M, "downgrade"):
            c.execute(sql)
        _como(c, ALUNO)
        assert c.execute(
            "SELECT professor_nome FROM public.vw_aluno_classe_resumo WHERE aluno_id = %s", (ALUNO,)
        ).fetchall() == [(None,), (None,), (None,)]
        c.execute("RESET ROLE")
        ausente = c.execute("SELECT to_regproc('public.aluno_ver_professor_da_turma')").fetchone()[0]
        assert ausente is None
