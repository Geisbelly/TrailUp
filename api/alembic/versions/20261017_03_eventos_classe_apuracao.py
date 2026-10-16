"""Apuração do evento: encerrar persiste o resultado individual e o ranking de guildas

Terceiro passo do banco da tela Eventos. Aceite da #152: "encerrar o evento **persiste o
resultado**. Recalcular depois é frágil" — `eventos_aluno.aluno_id` tem `ON DELETE CASCADE`,
então excluir uma conta mudaria o total de um evento encerrado.

`fn_evento_classe_apurar(evento)` (interna: sem GRANT para nenhum papel de cliente; só
`evento_classe_encerrar` a chama, depois de conferir a posse) grava:
- `eventos_classe_resultado`: uma linha por aluno matriculado — pontos feitos NA JANELA do evento
  (soma dos `valor` positivos de `eventos_aluno` da turma entre `inicio` e `fim`; valor negativo
  nunca desconta, como pede o protótipo), `participou` (fez ao menos um evento), `posicao`
  (empate divide a posição; quem não participou fica sem posição) e `destaque`.
- `eventos_classe_resultado_guilda`: o agregado por guilda, calculado sobre a **cópia congelada**
  (`guilda_evento_snapshot`, gravada ao abrir), nunca sobre a guilda de hoje. Fica FORA do
  rank individual (decisão da #152).

Padrões PROVISÓRIOS (trocar aqui sem refazer a tela): destaque = os 3 primeiros colocados com
pontos > 0, e só quando o evento concede medalha de destaque. As **moedas** do evento são
creditadas a cada participante em `moedas_ledger` (motivo `evento`, tipo `evento_classe`,
referência `evento_classe:<id>`; o índice único `moedas_ledger_ganho_unico` impede dobrar).
A pontuação do evento (`eventos_classe.pontos`) e a medalha como `conquistas_aluno` NÃO são
creditadas ainda — a medalha só é registrada em `destaque`. A classe de cada `eventos_aluno`
é a gravada ou, se nula, a resolvida por `fn_eventos_aluno_resolve_classe_id` (a mesma que o
gatilho de inserção e a view de rank usam; ~70% das linhas antigas não têm `classe_id`).

RLS: professor lê o resultado das turmas dele; aluno lê a PRÓPRIA linha e as 10 primeiras
posições (o corte de visibilidade do #134: não expor quem está em desvantagem). Ninguém escreve
pelo cliente. `encerrar` é redefinida aqui para chamar a apuração.

Revision ID: 20261017_03
Revises: 20261017_02
Create Date: 2026-10-17
"""

from alembic import op

revision = "20261017_03"
down_revision = "20261017_02"
branch_labels = None
depends_on = None


SQL = r"""
CREATE TABLE IF NOT EXISTS public.eventos_classe_resultado (
  evento_id uuid NOT NULL REFERENCES public.eventos_classe(id) ON DELETE CASCADE,
  aluno_id uuid NOT NULL,
  pontos numeric NOT NULL DEFAULT 0 CHECK (pontos >= 0),
  participou boolean NOT NULL DEFAULT false,
  posicao integer CHECK (posicao IS NULL OR posicao >= 1),
  destaque boolean NOT NULL DEFAULT false,
  apurado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, aluno_id)
);

CREATE TABLE IF NOT EXISTS public.eventos_classe_resultado_guilda (
  evento_id uuid NOT NULL REFERENCES public.eventos_classe(id) ON DELETE CASCADE,
  guilda_id uuid NOT NULL,
  pontos numeric NOT NULL DEFAULT 0 CHECK (pontos >= 0),
  membros integer NOT NULL DEFAULT 0 CHECK (membros >= 0),
  posicao integer CHECK (posicao IS NULL OR posicao >= 1),
  apurado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, guilda_id)
);

ALTER TABLE public.eventos_classe_resultado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_classe_resultado_guilda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eventos_classe_resultado_professor_sel ON public.eventos_classe_resultado;
CREATE POLICY eventos_classe_resultado_professor_sel ON public.eventos_classe_resultado FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.eventos_classe e
    JOIN public.app_classes_do_professor() AS minha(id) ON minha.id = e.classe_id
    WHERE e.id = eventos_classe_resultado.evento_id
  ));

DROP POLICY IF EXISTS eventos_classe_resultado_aluno_sel ON public.eventos_classe_resultado;
CREATE POLICY eventos_classe_resultado_aluno_sel ON public.eventos_classe_resultado FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.eventos_classe e
      JOIN public.app_minhas_classes() AS minha(id) ON minha.id = e.classe_id
      WHERE e.id = eventos_classe_resultado.evento_id AND e.status = 'encerrado'
    )
    AND (aluno_id = auth.uid() OR posicao <= 10)
  );

DROP POLICY IF EXISTS eventos_classe_resultado_guilda_professor_sel ON public.eventos_classe_resultado_guilda;
CREATE POLICY eventos_classe_resultado_guilda_professor_sel ON public.eventos_classe_resultado_guilda FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.eventos_classe e
    JOIN public.app_classes_do_professor() AS minha(id) ON minha.id = e.classe_id
    WHERE e.id = eventos_classe_resultado_guilda.evento_id
  ));

DROP POLICY IF EXISTS eventos_classe_resultado_guilda_aluno_sel ON public.eventos_classe_resultado_guilda;
CREATE POLICY eventos_classe_resultado_guilda_aluno_sel ON public.eventos_classe_resultado_guilda FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.eventos_classe e
      JOIN public.app_minhas_classes() AS minha(id) ON minha.id = e.classe_id
      WHERE e.id = eventos_classe_resultado_guilda.evento_id AND e.status = 'encerrado'
    )
    AND posicao <= 10
  );

REVOKE ALL ON public.eventos_classe_resultado FROM anon, authenticated;
REVOKE ALL ON public.eventos_classe_resultado_guilda FROM anon, authenticated;
GRANT SELECT ON public.eventos_classe_resultado TO authenticated;
GRANT SELECT ON public.eventos_classe_resultado_guilda TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_evento_classe_apurar(p_evento_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
  v_participantes integer;
BEGIN
  SELECT * INTO v_evento FROM public.eventos_classe WHERE id = p_evento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.eventos_classe_resultado WHERE evento_id = p_evento_id;
  DELETE FROM public.eventos_classe_resultado_guilda WHERE evento_id = p_evento_id;

  INSERT INTO public.eventos_classe_resultado (evento_id, aluno_id, pontos, participou, posicao, destaque)
  SELECT p_evento_id, t.aluno_id, t.pontos, t.participou, t.posicao,
         (v_evento.medalha_destaque AND t.participou AND t.pontos > 0 AND t.posicao <= 3)
  FROM (
    SELECT b.aluno_id, b.pontos, b.participou,
           CASE WHEN b.participou THEN dense_rank() OVER (PARTITION BY b.participou ORDER BY b.pontos DESC) END AS posicao
    FROM (
      SELECT ca.aluno_id,
             COALESCE(SUM(GREATEST(ea.valor, 0)), 0) AS pontos,
             COUNT(ea.id) > 0 AS participou
      FROM public.classe_aluno ca
      LEFT JOIN public.eventos_aluno ea
        ON ea.aluno_id = ca.aluno_id
       AND ea.criado_em >= v_evento.inicio
       AND ea.criado_em <= v_evento.fim
       AND (
         ea.classe_id = v_evento.classe_id
         OR (ea.classe_id IS NULL AND public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia) = v_evento.classe_id)
       )
      WHERE ca.classe_id = v_evento.classe_id
      GROUP BY ca.aluno_id
    ) b
  ) t;
  GET DIAGNOSTICS v_participantes = ROW_COUNT;

  IF v_evento.modalidade_guilda THEN
    INSERT INTO public.eventos_classe_resultado_guilda (evento_id, guilda_id, pontos, membros, posicao)
    SELECT p_evento_id, g.guilda_id, g.pontos, g.membros,
           CASE WHEN g.pontos > 0 THEN dense_rank() OVER (ORDER BY g.pontos DESC) END
    FROM (
      SELECT s.guilda_id, COALESCE(SUM(r.pontos), 0) AS pontos, COUNT(*)::integer AS membros
      FROM public.guilda_evento_snapshot s
      LEFT JOIN public.eventos_classe_resultado r ON r.evento_id = p_evento_id AND r.aluno_id = s.aluno_id
      WHERE s.evento_id = p_evento_id::text
      GROUP BY s.guilda_id
    ) g;
  END IF;

  SELECT COUNT(*)::integer INTO v_participantes
  FROM public.eventos_classe_resultado WHERE evento_id = p_evento_id AND participou;

  -- Moedas do evento: uma vez por participante. O índice parcial `moedas_ledger_ganho_unico`
  -- (aluno, evento_tipo, referencia, motivo = 'evento') torna reapurar inofensivo.
  IF v_evento.moedas > 0 THEN
    INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
    SELECT r.aluno_id, v_evento.moedas, 'evento', 'evento_classe', 'evento_classe:' || p_evento_id::text, v_evento.classe_id
    FROM public.eventos_classe_resultado r
    WHERE r.evento_id = p_evento_id AND r.participou
    ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento' DO NOTHING;
  END IF;

  RETURN v_participantes;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_evento_classe_apurar(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.evento_classe_encerrar(p_evento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
  v_participantes integer;
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
  v_participantes := public.fn_evento_classe_apurar(p_evento_id);

  RETURN jsonb_build_object('status', 'encerrado', 'participantes', v_participantes);
END
$function$;
"""

DOWNGRADE_SQL = r"""
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
DROP FUNCTION IF EXISTS public.fn_evento_classe_apurar(uuid);
DROP TABLE IF EXISTS public.eventos_classe_resultado_guilda;
DROP TABLE IF EXISTS public.eventos_classe_resultado;
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
