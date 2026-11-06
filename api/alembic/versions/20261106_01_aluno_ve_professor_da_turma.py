"""O aluno vê o professor da turma: nome nos cards e perfil próprio.

## O defeito, medido em produção em 2026-11-06

Os cards de turma do app já escreviam "Prof. X" com `vw_aluno_classe_resumo.professor_nome`, mas o
nome nunca aparecia. A view é `security_invoker` e a RLS de `professor` só libera a própria linha
(`professor_select_own_or_owner`). Com o papel `authenticated` e o JWT de um aluno, a coluna vinha
nula em toda turma de outro professor, sem erro nenhum.

Abrir a tabela por policy não serve: policy libera a linha inteira, e o aluno passaria a ler também
`liberado`, `geracao_automatica` e o que mais entrar em `professor`. Por isso a leitura sai por duas
funções `SECURITY DEFINER`, que escolhem as colunas e conferem a matrícula. A view continua invoker.

- `trailup_professor_da_turma(classe)`: nome e descrição, para a view.
- `aluno_ver_professor_da_turma(classe)`: o perfil. Entrega nome, foto, descrição, instituição,
  disciplina e as turmas que quem pergunta tem com esse professor. **Não** entrega e-mail nem nada
  da conta. Fora da turma devolve NULL, sem distinguir "não existe" de "não pode".

## Foto

`perfil_fotos` só deixava ler a foto do colega ou do próprio aluno; a do professor dava 403 para o
aluno. `trailup_pode_ler_arquivo` ganha esse caso, só para quem está matriculado numa turma dele.

## Nome da turma

A view ganha `classe_nome` no fim da lista de colunas (o console grava o nome em `classe.descricao`).
Sem ela, o título do card repetia a matéria da pílula, e turma sem matéria virava "Turma / Turma".

A definição anterior da view não está na cadeia (schema não versionado); o `downgrade` volta ao que
foi lido em produção nesta data.

Revision ID: 20261106_01
Revises: 20261105_30
Create Date: 2026-11-06
"""

from alembic import op

revision = "20261106_01"
down_revision = "20261105_30"
branch_labels = None
depends_on = None

COLUNAS_DA_VIEW = """
    ca.aluno_id,
    c.id AS classe_id,
    m.nome AS materia_nome,
    m.descricao AS materia_descricao,
    p.nome AS professor_nome,
    p.descricao AS professor_descricao,
    ca."notaMedia",
    ca."tempoMedioPorAtividade",
    ca."acertosPercentual",
    ca."porcentagemConcluida",
    ca."ultimaAtividade",
    ca."tempoGastoMin",
    ca."isComplete",
    ca."atividadesConcluidas",
    iad."recomendacaoTrilha",
    iad."modoOperacao",
    iad.insights,
    iad."perfisDetectados"
"""

JUNCOES_DA_VIEW = """
     JOIN public.classe c ON c.id = ca.classe_id
     LEFT JOIN public.materia m ON m.id = c.materia_id
"""


def _pode_ler_arquivo(clausula_do_professor: str) -> str:
    return f"""
CREATE OR REPLACE FUNCTION public.trailup_pode_ler_arquivo(p_bucket text, p_nome text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_dono uuid;
  v_m text[];
  v_classe bigint;
BEGIN
  IF v_uid IS NULL OR p_nome IS NULL OR p_bucket IS NULL THEN
    RETURN false;
  END IF;
  IF public.app_e_dono() THEN
    RETURN true;
  END IF;

  IF p_bucket IN ('perfil_fotos', 'banners_fotos') THEN
    v_dono := public.trailup_dono_do_arquivo(p_nome);
    IF v_dono IS NULL THEN
      RETURN false;
    END IF;
    RETURN v_dono = v_uid
        OR EXISTS (SELECT 1 FROM public.classe_aluno a
                     JOIN public.classe_aluno b ON b.classe_id = a.classe_id
                    WHERE a.aluno_id = v_dono AND b.aluno_id = v_uid)
        OR EXISTS (SELECT 1 FROM public.classe_aluno a
                     JOIN public.classe c ON c.id = a.classe_id
                    WHERE a.aluno_id = v_dono AND c.professor_id = v_uid){clausula_do_professor};
  END IF;

  IF p_bucket = 'conteudo_aluno' THEN
    -- Pasta do proprio aluno (avatar do chefe).
    IF substr(p_nome, 37, 1) = '/' AND public.trailup_dono_do_arquivo(p_nome) = v_uid THEN
      RETURN true;
    END IF;
    v_m := regexp_match(p_nome, '^(brainhex/[^/]+|fontes)/classe-([0-9]{{1,18}})/');
    IF v_m IS NULL THEN
      RETURN false;
    END IF;
    v_classe := v_m[2]::bigint;
    IF EXISTS (SELECT 1 FROM public.classe WHERE id = v_classe AND professor_id = v_uid) THEN
      RETURN true;
    END IF;
    IF v_m[1] = 'fontes' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.fontes_personalizacao f
         WHERE f.classe_id = v_classe AND f.storage_path = p_nome
           AND (f.aluno_id = v_uid
                OR (f.visibilidade <> 'individual'
                    AND EXISTS (SELECT 1 FROM public.classe_aluno ca
                                 WHERE ca.classe_id = v_classe AND ca.aluno_id = v_uid))));
    END IF;
    RETURN EXISTS (SELECT 1 FROM public.classe_aluno
                    WHERE classe_id = v_classe AND aluno_id = v_uid);
  END IF;

  RETURN false;
END;
$f$;
"""


CLAUSULA_FOTO_DO_PROFESSOR = """
        OR EXISTS (SELECT 1 FROM public.classe_aluno a
                     JOIN public.classe c ON c.id = a.classe_id
                    WHERE a.aluno_id = v_uid AND c.professor_id = v_dono)"""

UPGRADE_SQL = f"""
CREATE OR REPLACE FUNCTION public.trailup_professor_da_turma(p_classe_id bigint)
RETURNS TABLE (nome text, descricao text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
  SELECT p.nome, p.descricao
    FROM public.classe c
    JOIN public.professor p ON p.id = c.professor_id
   WHERE c.id = p_classe_id
     AND (c.id IN (SELECT public.app_minhas_classes()) OR public.app_e_dono())
$f$;

REVOKE ALL ON FUNCTION public.trailup_professor_da_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trailup_professor_da_turma(bigint) TO authenticated, service_role;

COMMENT ON FUNCTION public.trailup_professor_da_turma(bigint) IS
  'Nome e descricao do professor para vw_aluno_classe_resumo (20261106_01): a RLS de professor barra o aluno.';

CREATE OR REPLACE VIEW public.vw_aluno_classe_resumo WITH (security_invoker = on) AS
 SELECT {COLUNAS_DA_VIEW},
    c.descricao AS classe_nome
   FROM public.classe_aluno ca
     {JUNCOES_DA_VIEW}
     LEFT JOIN LATERAL public.trailup_professor_da_turma(c.id) p ON true
     LEFT JOIN public."iaDescricao" iad ON iad.aluno_id = ca.aluno_id;

CREATE OR REPLACE FUNCTION public.aluno_ver_professor_da_turma(p_classe_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $f$
  SELECT jsonb_build_object(
    'nome', p.nome,
    'foto_url', p.foto_url,
    'descricao', p.descricao,
    'instituicao', p.instituicao,
    'disciplina', p.disciplina,
    'turmas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'classe_id', outra.id,
        'nome', outra.descricao,
        'materia', m.nome
      ) ORDER BY outra.id)
        FROM public.classe outra
        LEFT JOIN public.materia m ON m.id = outra.materia_id
       WHERE outra.professor_id = p.id
         AND outra.id IN (SELECT public.app_minhas_classes())
    ), '[]'::jsonb)
  )
    FROM public.classe c
    JOIN public.professor p ON p.id = c.professor_id
   WHERE c.id = p_classe_id
     AND c.id IN (SELECT public.app_minhas_classes())
$f$;

REVOKE ALL ON FUNCTION public.aluno_ver_professor_da_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aluno_ver_professor_da_turma(bigint) TO authenticated, service_role;

COMMENT ON FUNCTION public.aluno_ver_professor_da_turma(bigint) IS
  'Perfil do professor para quem esta na turma (20261106_01). Sem e-mail nem dado da conta; fora da turma, NULL.';

{_pode_ler_arquivo(CLAUSULA_FOTO_DO_PROFESSOR)}
"""

DOWNGRADE_SQL = f"""
DROP VIEW public.vw_aluno_classe_resumo;

CREATE VIEW public.vw_aluno_classe_resumo WITH (security_invoker = on) AS
 SELECT {COLUNAS_DA_VIEW}
   FROM public.classe_aluno ca
     {JUNCOES_DA_VIEW}
     LEFT JOIN public.professor p ON p.id = c.professor_id
     LEFT JOIN public."iaDescricao" iad ON iad.aluno_id = ca.aluno_id;

REVOKE ALL ON public.vw_aluno_classe_resumo FROM PUBLIC, anon;
GRANT SELECT ON public.vw_aluno_classe_resumo TO authenticated;
GRANT ALL ON public.vw_aluno_classe_resumo TO service_role;

DROP FUNCTION IF EXISTS public.trailup_professor_da_turma(bigint);
DROP FUNCTION IF EXISTS public.aluno_ver_professor_da_turma(bigint);

{_pode_ler_arquivo("")}
"""


def upgrade() -> None:
    op.execute(UPGRADE_SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
