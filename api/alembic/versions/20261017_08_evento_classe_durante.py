"""evento_classe_durante(): o painel "Durante" do evento (quem começou, quem parou, guildas ativas)

Leitura do professor sobre um evento **aberto ou encerrado**. Confere a posse da turma antes de
ler qualquer linha de aluno (`NOT EXISTS` sobre `app_classes_do_professor()`). Só leitura.

Definições (padrões PROVISÓRIOS, trocar aqui sem refazer a tela):
- **Começou**: o aluno matriculado tem ao menos um `eventos_aluno` na janela do evento (início até
  agora/fim) — a classe do evento é a gravada ou a resolvida por `fn_eventos_aluno_resolve_classe_id`,
  como na apuração.
- **Parou**: começou, mas não fez nada nos últimos 3 dias, com o evento ainda aberto e a janela
  ainda correndo.
- **Não começou**: matriculado sem nenhum evento na janela.
- **Guilda ativa**: guilda da cópia congelada (`guilda_evento_snapshot`, gravada ao abrir) com ao
  menos um integrante que começou. Só existe com modalidade de guilda.

Devolve `{total, comecaram, pararam, nao_comecaram, guildas_ativas, guildas_total, por_modalidade,
alunos}`; `alunos` traz id, nome e a situação (`comecou|parou|nao_comecou`) para a lista de quem
precisa de um empurrão. Sem e-mail nem outro dado pessoal.

Revision ID: 20261017_08
Revises: 20261017_07
Create Date: 2026-10-17
"""

from alembic import op

revision = "20261017_08"
down_revision = "20261017_07"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.evento_classe_durante(p_evento_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
  v_fim timestamptz;
  v_resultado jsonb;
BEGIN
  SELECT * INTO v_evento FROM public.eventos_classe WHERE id = p_evento_id;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_evento.classe_id
  ) THEN
    RAISE EXCEPTION 'Evento não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF v_evento.status = 'rascunho' THEN
    RAISE EXCEPTION 'O evento ainda não foi aberto.' USING ERRCODE = '22023';
  END IF;

  v_fim := LEAST(v_evento.fim, now());

  WITH atividade AS (
    SELECT ca.aluno_id, a.nome,
           COUNT(ea.id) AS qtd,
           MAX(ea.criado_em) AS ultima
    FROM public.classe_aluno ca
    JOIN public.alunos a ON a.id = ca.aluno_id
    LEFT JOIN public.eventos_aluno ea
      ON ea.aluno_id = ca.aluno_id
     AND ea.criado_em >= v_evento.inicio
     AND ea.criado_em <= v_fim
     AND (
       ea.classe_id = v_evento.classe_id
       OR (ea.classe_id IS NULL AND public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia) = v_evento.classe_id)
     )
    WHERE ca.classe_id = v_evento.classe_id
    GROUP BY ca.aluno_id, a.nome
  ), estado AS (
    SELECT aluno_id, nome,
           CASE
             WHEN qtd = 0 THEN 'nao_comecou'
             WHEN v_evento.status = 'aberto' AND now() <= v_evento.fim AND ultima < now() - interval '3 days' THEN 'parou'
             ELSE 'comecou'
           END AS situacao
    FROM atividade
  ), guildas AS (
    SELECT s.guilda_id, bool_or(e.situacao <> 'nao_comecou') AS ativa
    FROM public.guilda_evento_snapshot s
    LEFT JOIN estado e ON e.aluno_id = s.aluno_id
    WHERE s.evento_id = p_evento_id::text
    GROUP BY s.guilda_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM estado),
    'comecaram', (SELECT count(*) FROM estado WHERE situacao <> 'nao_comecou'),
    'pararam', (SELECT count(*) FROM estado WHERE situacao = 'parou'),
    'nao_comecaram', (SELECT count(*) FROM estado WHERE situacao = 'nao_comecou'),
    'guildas_total', (SELECT count(*) FROM guildas),
    'guildas_ativas', (SELECT count(*) FROM guildas WHERE ativa),
    'por_modalidade', jsonb_build_object(
      'individual', (SELECT count(*) FROM estado WHERE situacao <> 'nao_comecou'),
      'guilda', (SELECT count(DISTINCT s.aluno_id) FROM public.guilda_evento_snapshot s JOIN estado e ON e.aluno_id = s.aluno_id
                  WHERE s.evento_id = p_evento_id::text AND e.situacao <> 'nao_comecou')
    ),
    'alunos', COALESCE((SELECT jsonb_agg(jsonb_build_object('aluno_id', aluno_id, 'nome', nome, 'situacao', situacao) ORDER BY nome) FROM estado), '[]'::jsonb)
  ) INTO v_resultado;

  RETURN v_resultado;
END
$function$;

REVOKE ALL ON FUNCTION public.evento_classe_durante(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evento_classe_durante(uuid) TO authenticated;
"""

DOWNGRADE_SQL = r"""
DROP FUNCTION IF EXISTS public.evento_classe_durante(uuid);
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
