"""Administração do dono sai do HTML da API e vem para RPCs do banco

As páginas `/admin` da API (liberar professor, vínculo direto com aluno, molduras, auditoria da economia) são
encanamento: nenhum modelo de linguagem no meio, e caem junto com a API. Pela regra de fronteira do `CLAUDE.md`,
isso é banco. O console do dono passa a chamar estas funções.

Todas conferem `app_e_dono()` antes de qualquer leitura (42501 para quem não é), são `SECURITY DEFINER` e abrem
EXECUTE só para `authenticated`:

- `admin_acessos()`, `admin_professor_liberar(...)` e `admin_professor_aluno(...)`;
- `admin_molduras()`, `admin_moldura_salvar(...)` e `admin_moldura_acao_salvar(...)`, que delegam a
  `molduras_admin_salvar` e `molduras_admin_salvar_acao`, sem GRANT para cliente. O ator gravado em
  `economia_auditoria` é o e-mail do dono, não o usuário do login básico;
- `admin_economia(...)`: auditoria e `economia_consistencia()`, que o cliente não lê direto.

Devolvem `aluno_id`, nome e e-mail, como o painel da API: é a tela de quem administra e resolve caso de um aluno.
Não vão para o painel técnico, que continua só com agregado.

`professor_aluno` só deixa escrever quem é o próprio professor, por isso o vínculo feito pelo dono precisa de
função. `liberado` continua passando por `professor_block_self_approve` e `trg_professor_liberado_em`.

O reprocessamento de mídia (`/api/v1/admin/personalizacao/media/backfill`) fica na API: ele usa o pipeline de geração.

Revision ID: 20261105_18
Revises: 20261105_17
Create Date: 2026-11-05
"""

from __future__ import annotations

from alembic import op

revision = "20261105_18"
down_revision = "20261105_17"
branch_labels = None
depends_on = None

FUNCOES = r"""
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
                  WHERE pa.professor_id = p.id AND pa.has_acesso), '[]'::jsonb)
             ) ORDER BY coalesce(p.nome, ''), p.id)
        FROM public.professor p), '[]'::jsonb),
    'alunos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('aluno_id', a.id, 'nome', a.nome, 'email', a.email)
                       ORDER BY coalesce(a.nome, ''), a.id)
        FROM public.alunos a), '[]'::jsonb));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_professor_liberar(p_professor uuid, p_liberado boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto libera professor.' USING ERRCODE = '42501';
  END IF;
  IF p_liberado IS NULL THEN
    RAISE EXCEPTION 'Diga se libera ou bloqueia.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.professor p SET liberado = p_liberado WHERE p.id = p_professor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Professor não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('professor_id', p_professor, 'liberado', p_liberado);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_professor_aluno(p_professor uuid, p_aluno uuid, p_has_acesso boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto vincula aluno.' USING ERRCODE = '42501';
  END IF;
  IF p_has_acesso IS NULL THEN
    RAISE EXCEPTION 'Diga se vincula ou remove.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professor p WHERE p.id = p_professor) THEN
    RAISE EXCEPTION 'Professor não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = p_aluno) THEN
    RAISE EXCEPTION 'Aluno não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.professor_aluno AS v (professor_id, aluno_id, has_acesso)
  VALUES (p_professor, p_aluno, p_has_acesso)
  ON CONFLICT (professor_id, aluno_id) DO UPDATE SET has_acesso = EXCLUDED.has_acesso;
  RETURN jsonb_build_object('professor_id', p_professor, 'aluno_id', p_aluno, 'has_acesso', p_has_acesso);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_molduras()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto administra molduras.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'molduras', coalesce((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.grupo, q.ordem)
        FROM (
          SELECT m.codigo, m.nome, m.origem, m.preco, m.ativa, c.nome AS conquista, m.ordem,
                 CASE m.origem WHEN 'loja' THEN 0 WHEN 'conquista' THEN 1 ELSE 2 END AS grupo,
                 (SELECT count(*) FROM public.moldura_aluno ma WHERE ma.moldura_codigo = m.codigo) AS donos
            FROM public.molduras m
            LEFT JOIN public.conquistas c ON c.id = m.conquista_id
        ) q), '[]'::jsonb),
    'acoes', coalesce((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.rotulo)
        FROM (
          SELECT a.acao, a.rotulo, a.descricao, a.moldura_codigo, a.ativa,
                 (SELECT count(*) FROM public.moldura_acao_aluno x WHERE x.acao = a.acao) AS feitas
            FROM public.molduras_acoes a
        ) q), '[]'::jsonb));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_moldura_salvar(p_codigo text, p_ativa boolean, p_preco integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto administra molduras.' USING ERRCODE = '42501';
  END IF;
  RETURN public.molduras_admin_salvar(p_codigo, p_ativa, p_preco, coalesce(auth.jwt() ->> 'email', 'console'));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_moldura_acao_salvar(p_acao text, p_ativa boolean, p_moldura text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto administra molduras.' USING ERRCODE = '42501';
  END IF;
  RETURN public.molduras_admin_salvar_acao(p_acao, p_ativa, p_moldura, coalesce(auth.jwt() ->> 'email', 'console'));
END;
$fn$;

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
    'auditoria', coalesce((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.ocorrido_em DESC, q.id DESC)
        FROM (
          SELECT e.id, e.ocorrido_em, e.operacao, e.entidade, e.entidade_id, e.classe_id, e.aluno_id, e.antes, e.depois
            FROM public.economia_auditoria e
           WHERE v_operacao IS NULL OR e.operacao = v_operacao
           ORDER BY e.ocorrido_em DESC, e.id DESC
           LIMIT p_limite
        ) q), '[]'::jsonb),
    'consistencia', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.economia_consistencia() c), '[]'::jsonb));
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_acessos() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_professor_liberar(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_professor_aluno(uuid, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_molduras() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_moldura_salvar(text, boolean, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_moldura_acao_salvar(text, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_economia(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_acessos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_professor_liberar(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_professor_aluno(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_molduras() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moldura_salvar(text, boolean, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moldura_acao_salvar(text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_economia(text, integer) TO authenticated;
"""


def upgrade() -> None:
    op.execute(FUNCOES)


def downgrade() -> None:
    for funcao in (
        "admin_economia(text, integer)",
        "admin_moldura_acao_salvar(text, boolean, text)",
        "admin_moldura_salvar(text, boolean, integer)",
        "admin_molduras()",
        "admin_professor_aluno(uuid, uuid, boolean)",
        "admin_professor_liberar(uuid, boolean)",
        "admin_acessos()",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS public.{funcao}")
