"""Allow private messages between classmates who are not blocked."""

from alembic import op

revision = "20260913_10"
down_revision = "20260913_09"
branch_labels = None
depends_on = None


CHAT_POLICY = """
  IF NOT EXISTS (
    SELECT 1
      FROM public.classe_aluno mine
      JOIN public.classe_aluno other ON other.classe_id = mine.classe_id
     WHERE mine.aluno_id = auth.uid()
       AND other.aluno_id = p_destinatario_id
  ) THEN RAISE EXCEPTION 'social_chat_fora_da_turma'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.social_relacionamentos r
     WHERE r.aluno_a_id=LEAST(auth.uid(),p_destinatario_id)
       AND r.aluno_b_id=GREATEST(auth.uid(),p_destinatario_id)
       AND r.status='blocked'
  ) THEN RAISE EXCEPTION 'social_chat_bloqueado'; END IF;
"""


def _function(name: str, return_body: str, action: str) -> str:
    declaration = "v_id uuid; v_texto text := btrim(COALESCE(p_texto,''));" if name.endswith("enviar") else ""
    return f"""
CREATE OR REPLACE FUNCTION public.{name}(p_destinatario_id uuid{', p_texto text' if name.endswith('enviar') else ''})
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE {declaration}
BEGIN
  IF auth.uid() IS NULL OR p_destinatario_id IS NULL OR p_destinatario_id = auth.uid()
    THEN RAISE EXCEPTION 'social_chat_destinatario_invalido'; END IF;
  {"IF char_length(v_texto) < 1 OR char_length(v_texto) > 500 THEN RAISE EXCEPTION 'social_chat_texto_invalido'; END IF;" if name.endswith('enviar') else ''}
{CHAT_POLICY}
  {action}
END;
$fn$;
"""


LISTAR = """
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',m.id,'remetente_id',m.remetente_id,'destinatario_id',m.destinatario_id,
    'texto',m.texto,'created_at',m.created_at,'remetente_nome',a.nome,
    'remetente_foto_url',a.foto_url
  ) ORDER BY m.created_at)
    FROM public.social_mensagens m
    JOIN public.alunos a ON a.id=m.remetente_id
   WHERE (m.remetente_id=auth.uid() AND m.destinatario_id=p_destinatario_id)
      OR (m.remetente_id=p_destinatario_id AND m.destinatario_id=auth.uid())), '[]'::jsonb);
"""

ENVIAR = """
  INSERT INTO public.social_mensagens(remetente_id,destinatario_id,texto)
  VALUES(auth.uid(),p_destinatario_id,v_texto) RETURNING id INTO v_id;
  RETURN jsonb_build_object('status','sent','id',v_id);
"""


def upgrade() -> None:
    op.execute(_function("social_chat_listar", "", LISTAR))
    op.execute(_function("social_chat_enviar", "", ENVIAR))
    op.execute("GRANT EXECUTE ON FUNCTION public.social_chat_listar(uuid), public.social_chat_enviar(uuid,text) TO authenticated")


def downgrade() -> None:
    raise RuntimeError("Downgrade manual: manter chat entre colegas")
