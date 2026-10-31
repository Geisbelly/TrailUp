"""Guilda: aceitar convite reconfere o bloqueio feito depois do convite (#153)

## O que estava errado

`guilda_convidar` recusa convite entre quem tem bloqueio (`social_bloqueio_impede_guilda`), mas
`guilda_aceitar_convite` não olhava o bloqueio. Se A convida B e depois um dos dois bloqueia o outro, B
aceitava e entrava na guilda de A, o contorno do bloqueio que a #153 proíbe ("quem bloqueou alguém
não pode receber convite dessa pessoa por via de guilda").

## O que muda

Logo depois de achar o convite, `guilda_aceitar_convite` confere `guilda_bloqueio_ativo(convidante,
convidado)`. Com bloqueio, o convite vira `cancelled` (o mesmo status que `guilda_dissolver` usa) e a
função devolve `{"status": "cancelled"}`, **sem exceção**:
- a mudança de status persiste, e o convite some da lista do aluno no próximo recarregamento;
- não se revela quem bloqueou quem. Uma exceção própria contaria ao convidado que o convidante o
  bloqueou. O app mostra só "Este convite não está mais disponível.".

O resto do corpo é o da `20261031_02`, com a trava de evento aberto.

## Downgrade

Volta ao corpo da `20261031_02`.

Revision ID: 20261031_09
Revises: 20261031_08
Create Date: 2026-10-31
"""

from alembic import op

revision = "20261031_09"
down_revision = "20261031_08"
branch_labels = None
depends_on = None

ACEITAR = r"""
CREATE OR REPLACE FUNCTION public.guilda_aceitar_convite(p_convite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_i public.guilda_convites%ROWTYPE; v_g public.guildas%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_i FROM public.guilda_convites WHERE id=p_convite_id AND convidado_id=auth.uid() AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_convite_nao_encontrado'; END IF;
  -- Bloqueio feito DEPOIS do convite (#153: a guilda não pode virar o contorno do bloqueio). O
  -- convite deixa de valer: cancela e devolve 'cancelled', sem exceção e sem dizer quem bloqueou
  -- quem. Uma exceção própria contaria ao convidado que o convidante o bloqueou.
  IF public.guilda_bloqueio_ativo(v_i.convidante_id, v_i.convidado_id) THEN
    UPDATE public.guilda_convites SET status='cancelled',responded_at=now() WHERE id=v_i.id;
    RETURN jsonb_build_object('status','cancelled','guilda_id',v_i.guilda_id);
  END IF;
  IF NOT public.guilda_janela_aberta(v_i.classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF public.fn_guilda_composicao_congelada(v_i.classe_id) THEN RAISE EXCEPTION 'guilda_evento_aberto'; END IF;
  SELECT * INTO v_g FROM public.guildas WHERE id=v_i.guilda_id AND ativa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_nao_encontrada'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=v_g.id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_g.id,v_i.classe_id,auth.uid());
  UPDATE public.guilda_convites SET status='accepted',responded_at=now() WHERE id=v_i.id;
  RETURN jsonb_build_object('status','accepted','guilda_id',v_g.id);
END; $function$;

REVOKE ALL ON FUNCTION public.guilda_aceitar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_aceitar_convite(uuid) TO authenticated, service_role;
"""

# O corpo da `20261031_02`.
ACEITAR_ANTERIOR = r"""
CREATE OR REPLACE FUNCTION public.guilda_aceitar_convite(p_convite_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_i public.guilda_convites%ROWTYPE; v_g public.guildas%ROWTYPE; v_count integer;
BEGIN
  SELECT * INTO v_i FROM public.guilda_convites WHERE id=p_convite_id AND convidado_id=auth.uid() AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_convite_nao_encontrado'; END IF;
  IF NOT public.guilda_janela_aberta(v_i.classe_id) THEN RAISE EXCEPTION 'guilda_janela_fechada'; END IF;
  IF public.fn_guilda_composicao_congelada(v_i.classe_id) THEN RAISE EXCEPTION 'guilda_evento_aberto'; END IF;
  SELECT * INTO v_g FROM public.guildas WHERE id=v_i.guilda_id AND ativa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guilda_nao_encontrada'; END IF;
  SELECT count(*) INTO v_count FROM public.guilda_membros WHERE guilda_id=v_g.id AND left_at IS NULL;
  IF v_count >= v_g.limite_membros THEN RAISE EXCEPTION 'guilda_cheia'; END IF;
  INSERT INTO public.guilda_membros(guilda_id,classe_id,aluno_id) VALUES(v_g.id,v_i.classe_id,auth.uid());
  UPDATE public.guilda_convites SET status='accepted',responded_at=now() WHERE id=v_i.id;
  RETURN jsonb_build_object('status','accepted','guilda_id',v_g.id);
END; $function$;

REVOKE ALL ON FUNCTION public.guilda_aceitar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guilda_aceitar_convite(uuid) TO authenticated, service_role;
"""


def upgrade() -> None:
    op.execute(ACEITAR)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(ACEITAR_ANTERIOR)
    op.execute("NOTIFY pgrst, 'reload schema'")
