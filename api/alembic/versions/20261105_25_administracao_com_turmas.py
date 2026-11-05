"""Administração passa a enxergar as turmas e a matricular aluno

A aba só mostrava vínculo direto (`professor_aluno`), e o dono não tinha como ver quem está em cada turma nem como
matricular: `classe_aluno` só deixa escrever o professor da turma. Por isso a matrícula pelo dono precisa de função.

- `admin_acessos()` acrescenta as turmas de cada professor, com os ids dos alunos matriculados. O formato anterior não
  muda: o console publicado continua lendo o que lia até o deploy.
- `admin_turma_matricular(classe, aluno)` só insere em `classe_aluno`. Os gatilhos dessa tabela provisionam a estrutura
  e enfileiram o material, como numa matrícula feita pelo professor, e nenhum deles usa a sessão. Devolve
  `matriculado = false` quando o aluno já estava na turma. Não há função de remover: tirar da turma apaga o progresso,
  e isso continua só no modal do professor.
- `admin_economia(...)` acrescenta `aluno_nome` e a lista de operações, para a tela filtrar por escolha e não mostrar id.

Revision ID: 20261105_25
Revises: 20261105_24
Create Date: 2026-11-05
"""

from __future__ import annotations

from alembic import op

revision = "20261105_25"
down_revision = "20261105_24"
branch_labels = None
depends_on = None

ACESSOS = r"""
CREATE OR REPLACE FUNCTION public.admin_acessos()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto administra acessos.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'professores', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'professor_id', p.id, 'nome', p.nome, 'descricao', p.descricao, 'instituicao', p.instituicao,
               'disciplina', p.disciplina, 'liberado', p.liberado,
               'alunos', coalesce((
                 SELECT jsonb_agg(jsonb_build_object('aluno_id', a.id, 'nome', a.nome, 'email', a.email)
                                  ORDER BY coalesce(a.nome, ''), a.id)
                   FROM public.professor_aluno pa
                   JOIN public.alunos a ON a.id = pa.aluno_id
                  WHERE pa.professor_id = p.id AND pa.has_acesso), '[]'::jsonb),
               'turmas', coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'classe_id', c.id, 'nome', c.descricao,
                          'alunos', coalesce((
                            SELECT jsonb_agg(ca.aluno_id ORDER BY ca.aluno_id)
                              FROM public.classe_aluno ca
                             WHERE ca.classe_id = c.id), '[]'::jsonb)
                        ) ORDER BY coalesce(c.descricao, ''), c.id)
                   FROM public.classe c
                  WHERE c.professor_id = p.id), '[]'::jsonb)
             ) ORDER BY coalesce(p.nome, ''), p.id)
        FROM public.professor p), '[]'::jsonb),
    'alunos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('aluno_id', a.id, 'nome', a.nome, 'email', a.email)
                       ORDER BY coalesce(a.nome, ''), a.id)
        FROM public.alunos a), '[]'::jsonb));
END;
$fn$;
"""

MATRICULAR = r"""
CREATE OR REPLACE FUNCTION public.admin_turma_matricular(p_classe bigint, p_aluno uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id bigint;
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto matricula por aqui.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classe c WHERE c.id = p_classe) THEN
    RAISE EXCEPTION 'Turma não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = p_aluno) THEN
    RAISE EXCEPTION 'Aluno não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.classe_aluno (classe_id, aluno_id)
  VALUES (p_classe, p_aluno)
  ON CONFLICT (aluno_id, classe_id) DO NOTHING
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('classe_id', p_classe, 'aluno_id', p_aluno, 'matriculado', v_id IS NOT NULL);
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_turma_matricular(bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_turma_matricular(bigint, uuid) TO authenticated;
"""

ECONOMIA = r"""
CREATE OR REPLACE FUNCTION public.admin_economia(p_operacao text DEFAULT NULL, p_limite integer DEFAULT 80)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_operacao text := nullif(btrim(left(p_operacao, 80)), '');
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto lê a auditoria.' USING ERRCODE = '42501';
  END IF;
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 200 THEN
    RAISE EXCEPTION 'O limite vai de 1 a 200.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'operacoes', coalesce((
      SELECT jsonb_agg(q.operacao ORDER BY q.operacao)
        FROM (SELECT DISTINCT e.operacao FROM public.economia_auditoria e WHERE e.operacao IS NOT NULL) q), '[]'::jsonb),
    'auditoria', coalesce((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.ocorrido_em DESC, q.id DESC)
        FROM (
          SELECT e.id, e.ocorrido_em, e.operacao, e.entidade, e.entidade_id, e.classe_id, e.aluno_id,
                 a.nome AS aluno_nome, e.antes, e.depois
            FROM public.economia_auditoria e
            LEFT JOIN public.alunos a ON a.id = e.aluno_id
           WHERE v_operacao IS NULL OR e.operacao = v_operacao
           ORDER BY e.ocorrido_em DESC, e.id DESC
           LIMIT p_limite
        ) q), '[]'::jsonb),
    'consistencia', coalesce((
      SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object('aluno_nome', a.nome))
        FROM public.economia_consistencia() c
        LEFT JOIN public.alunos a ON a.id = c.aluno_id), '[]'::jsonb));
END;
$fn$;
"""


def upgrade() -> None:
    op.execute(ACESSOS)
    op.execute(MATRICULAR)
    op.execute(ECONOMIA)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.admin_turma_matricular(bigint, uuid)")
    # `admin_acessos` e `admin_economia` só ganharam chaves: quem lê o formato anterior continua funcionando.
