"""evento_classe_abrir() e evento_classe_encerrar(): as duas transições do evento, no banco

Segundo passo do banco da tela Eventos. Agendar e abrir é encanamento (sem modelo de
linguagem), então mora no Postgres — a API pode estar fora do ar e o evento não pode parar.

`evento_classe_abrir`: confere a **posse antes de ler** (`NOT EXISTS` sobre
`app_classes_do_professor()`), exige rascunho, janela ainda não encerrada e pelo menos uma
peça. Se o evento tem modalidade de guilda, **congela a composição das guildas** com
`guilda_congelar_composicao(evento_id text, classe_id bigint)` (assinatura de `docs/mobile/sql/20260912_03`) — a apuração roda contra essa cópia, não contra
a guilda como ela estiver depois (aceite da #152). Devolve `{status, guildas_congeladas}`.

`evento_classe_encerrar`: só de aberto para encerrado, grava `encerrado_em`. A **persistência do
resultado** (ranking, medalhas, crédito de moedas) é a apuração, que fica para uma migration
própria — encerrar aqui só fecha o evento; não finge que apurou.

As duas ligam `app.evento_transicao` com `set_config(..., true)` (vale só nesta transação) para
passar pela guarda `trg_eventos_classe_guarda`.

Revision ID: 20261017_02
Revises: 20261017_01
Create Date: 2026-10-17
"""

from alembic import op

revision = "20261017_02"
down_revision = "20261017_01"
branch_labels = None
depends_on = None


SQL = r"""
CREATE OR REPLACE FUNCTION public.evento_classe_abrir(p_evento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
  v_guildas integer := 0;
BEGIN
  SELECT * INTO v_evento FROM public.eventos_classe WHERE id = p_evento_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_evento.classe_id
  ) THEN
    RAISE EXCEPTION 'Evento não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF v_evento.status <> 'rascunho' THEN
    RAISE EXCEPTION 'Só um rascunho pode ser aberto.' USING ERRCODE = '22023';
  END IF;
  IF v_evento.fim <= now() THEN
    RAISE EXCEPTION 'A janela do evento já terminou.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_evento.pecas) = 0 THEN
    RAISE EXCEPTION 'Escolha ao menos uma peça para o evento.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.evento_transicao', 'on', true);
  UPDATE public.eventos_classe SET status = 'aberto', aberto_em = now() WHERE id = p_evento_id;

  IF v_evento.modalidade_guilda THEN
    v_guildas := COALESCE(public.guilda_congelar_composicao(v_evento.id::text, v_evento.classe_id), 0);
  END IF;

  RETURN jsonb_build_object('status', 'aberto', 'guildas_congeladas', v_guildas);
END
$function$;

CREATE OR REPLACE FUNCTION public.evento_classe_encerrar(p_evento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
BEGIN
  SELECT * INTO v_evento FROM public.eventos_classe WHERE id = p_evento_id FOR UPDATE;
  IF auth.uid() IS NULL OR NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_evento.classe_id
  ) THEN
    RAISE EXCEPTION 'Evento não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF v_evento.status <> 'aberto' THEN
    RAISE EXCEPTION 'Só um evento aberto pode ser encerrado.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.evento_transicao', 'on', true);
  UPDATE public.eventos_classe SET status = 'encerrado', encerrado_em = now() WHERE id = p_evento_id;

  RETURN jsonb_build_object('status', 'encerrado');
END
$function$;

REVOKE ALL ON FUNCTION public.evento_classe_abrir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evento_classe_abrir(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.evento_classe_encerrar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evento_classe_encerrar(uuid) TO authenticated;
"""

DOWNGRADE_SQL = r"""
DROP FUNCTION IF EXISTS public.evento_classe_abrir(uuid);
DROP FUNCTION IF EXISTS public.evento_classe_encerrar(uuid);
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
