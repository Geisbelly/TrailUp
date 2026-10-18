"""Medalhas do evento: ao encerrar, participação e destaque viram `conquistas` de escopo 'evento'

Decisão da issue #152: "medalha de evento é uma `conquista`, não uma tabela nova" — herda ícone,
pontos e a biblioteca de conquistas. Conferido no banco real (2026-10-16): `conquistas_escopo_check`
só aceitava `comum|perfil`, `conquistas_perfil_alvo_check` amarrava o escopo ao perfil e
`conquistas_metrica_suportada` exigia uma métrica conhecida. Esta migration:

1. aceita o escopo `evento` (sem perfil alvo) e a métrica `evento_medalha` — que o gatilho de
   conquistas NÃO conhece (não há ramo para ela), então a medalha nunca é concedida pelo gatilho,
   só pela apuração;
2. acrescenta `eventos_classe.conquista_participacao_id` / `conquista_destaque_id` (travadas pela
   guarda do evento: só mudam na transição de abrir/encerrar);
3. faz `fn_evento_classe_apurar` criar a conquista de cada medalha na primeira apuração e entregar
   a quem participou (e aos destaques) em `conquistas_aluno`, sem duplicar (não há chave única por
   aluno e conquista, então NOT EXISTS), com `pontos_recompensa = 0`;
4. `conquistas_da_turma` e o teto de `conquista_da_turma_salvar` ignoram o escopo `evento`: a
   medalha tem `classe_id` (a biblioteca do aluno filtra por turma), mas não pode lotar a lista nem
   consumir o teto de 20 do professor.

Fora daqui: pontos do evento (`eventos_classe.pontos`) seguem sem crédito; ícone da medalha fica
vazio até haver um conjunto.

As funções foram reescritas por inteiro a partir do texto das migrations anteriores, com os trechos
alterados marcados no teste. O `downgrade` restaura as versões anteriores e apaga as medalhas de evento.

Revision ID: 20261017_09
Revises: 20261017_08
Create Date: 2026-10-17
"""

from alembic import op

revision = "20261017_09"
down_revision = "20261017_08"
branch_labels = None
depends_on = None

SQL = r"""
ALTER TABLE public.eventos_classe
  ADD COLUMN IF NOT EXISTS conquista_participacao_id bigint REFERENCES public.conquistas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conquista_destaque_id bigint REFERENCES public.conquistas(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.fn_eventos_classe_guarda()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'rascunho';
    NEW.aberto_em := NULL;
    NEW.encerrado_em := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.aberto_em IS DISTINCT FROM OLD.aberto_em
     OR NEW.encerrado_em IS DISTINCT FROM OLD.encerrado_em
     OR NEW.conquista_participacao_id IS DISTINCT FROM OLD.conquista_participacao_id
     OR NEW.conquista_destaque_id IS DISTINCT FROM OLD.conquista_destaque_id THEN
    IF COALESCE(current_setting('app.evento_transicao', true), '') <> 'on' THEN
      RAISE EXCEPTION 'O estado do evento só muda ao abrir ou encerrar.' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.status <> 'rascunho' AND (
    NEW.classe_id IS DISTINCT FROM OLD.classe_id OR NEW.topico_id IS DISTINCT FROM OLD.topico_id
    OR NEW.inicio IS DISTINCT FROM OLD.inicio OR NEW.fim IS DISTINCT FROM OLD.fim
    OR NEW.modalidade_guilda IS DISTINCT FROM OLD.modalidade_guilda
    OR NEW.guilda_tamanho_max IS DISTINCT FROM OLD.guilda_tamanho_max
    OR NEW.pecas IS DISTINCT FROM OLD.pecas OR NEW.pontos IS DISTINCT FROM OLD.pontos
    OR NEW.moedas IS DISTINCT FROM OLD.moedas
    OR NEW.medalha_participacao IS DISTINCT FROM OLD.medalha_participacao
    OR NEW.medalha_destaque IS DISTINCT FROM OLD.medalha_destaque
    OR NEW.recompensa IS DISTINCT FROM OLD.recompensa
  ) THEN
    RAISE EXCEPTION 'Depois de aberto, o evento só aceita título e descrição.' USING ERRCODE = '42501';
  END IF;

  NEW.atualizado_em := now();
  RETURN NEW;
END
$function$;

ALTER TABLE public.conquistas DROP CONSTRAINT IF EXISTS conquistas_escopo_check;
ALTER TABLE public.conquistas ADD CONSTRAINT conquistas_escopo_check CHECK (escopo = ANY (ARRAY['comum'::text, 'perfil'::text, 'evento'::text]));
ALTER TABLE public.conquistas DROP CONSTRAINT IF EXISTS conquistas_perfil_alvo_check;
ALTER TABLE public.conquistas ADD CONSTRAINT conquistas_perfil_alvo_check CHECK (
  (escopo = ANY (ARRAY['comum'::text, 'evento'::text]) AND perfil_alvo IS NULL)
  OR (escopo = 'perfil'::text AND perfil_alvo = ANY (ARRAY['seeker'::text, 'achiever'::text, 'survivor'::text, 'daredevil'::text, 'mastermind'::text, 'conqueror'::text, 'socializer'::text]))
);

CREATE OR REPLACE FUNCTION public.fn_conquista_metrica_suportada(p_metrica text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_metrica IN ('eventos_totais', 'eventos_do_tipo', 'atividades_concluidas', 'topicos_concluidos', 'topicos_visitados', 'dias_seguidos', 'minutos_totais', 'acertos_percentual', 'trilha_percentual', 'atividade_rapida', 'atividades_rapidas', 'evento_medalha');
$function$;


CREATE OR REPLACE FUNCTION public.conquista_da_turma_salvar(
  p_classe_id bigint,
  p_id        bigint,
  p_nome      text,
  p_descricao text,
  p_escopo    text,
  p_perfil_alvo text,
  p_criterio  jsonb,
  p_pontos    integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_max_pontos integer;
  v_teto      integer;
  v_existentes integer;
  v_categoria text;
  v_id        bigint;
BEGIN
  IF v_professor IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF length(v_nome) < 3 OR length(v_nome) > 60 THEN
    RAISE EXCEPTION 'O nome precisa ter de 3 a 60 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(v_descricao) > 140 THEN
    RAISE EXCEPTION 'A descrição passa de 140 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_escopo NOT IN ('comum', 'perfil') THEN
    RAISE EXCEPTION 'Escopo inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_escopo = 'perfil' AND coalesce(p_perfil_alvo, '') NOT IN
     ('seeker', 'survivor', 'daredevil', 'mastermind', 'conqueror', 'socializer', 'achiever') THEN
    RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_escopo = 'comum' AND p_perfil_alvo IS NOT NULL THEN
    RAISE EXCEPTION 'Conquista geral não tem perfil.' USING ERRCODE = '22023';
  END IF;

  IF p_criterio IS NULL OR jsonb_typeof(p_criterio) <> 'object'
     OR NOT public.fn_conquista_metrica_suportada(p_criterio ->> 'metrica') THEN
    RAISE EXCEPTION 'Métrica não suportada.' USING ERRCODE = '22023';
  END IF;

  v_max_pontos := coalesce(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = 'conquista_recompensa_maxima'),
    100
  );
  IF p_pontos IS NULL OR p_pontos < 0 OR p_pontos > v_max_pontos THEN
    RAISE EXCEPTION 'Os pontos vão de 0 a %.', v_max_pontos USING ERRCODE = '22023';
  END IF;

  v_categoria := CASE
    WHEN p_escopo = 'perfil' THEN 'perfil_brainhex'
    WHEN p_criterio ->> 'metrica' IN ('dias_seguidos', 'minutos_totais') THEN 'habito'
    WHEN p_criterio ->> 'metrica' IN ('acertos_percentual', 'atividade_rapida') THEN 'desempenho'
    ELSE 'progresso'
  END;

  IF p_id IS NULL THEN
    -- Trava por turma para duas criações simultâneas não furarem o teto.
    PERFORM pg_advisory_xact_lock(hashtext('conquista_da_turma:' || p_classe_id::text));
    v_teto := coalesce(
      (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
         FROM public.app_config WHERE chave = 'conquistas_por_turma_max'),
      20
    );
    SELECT count(*) INTO v_existentes FROM public.conquistas WHERE classe_id = p_classe_id AND escopo <> 'evento';
    IF v_existentes >= v_teto THEN
      RAISE EXCEPTION 'Esta turma já tem % conquistas (o teto).', v_teto USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.conquistas (nome, descricao, categoria, escopo, perfil_alvo, criterio, pontos_recompensa, classe_id, criado_por)
    VALUES (v_nome, nullif(v_descricao, ''), v_categoria, p_escopo, p_perfil_alvo, p_criterio, p_pontos, p_classe_id, v_professor)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.conquistas
       SET nome = v_nome, descricao = nullif(v_descricao, ''), categoria = v_categoria, escopo = p_escopo,
           perfil_alvo = p_perfil_alvo, criterio = p_criterio, pontos_recompensa = p_pontos
     WHERE id = p_id AND classe_id = p_classe_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Conquista não encontrada nesta turma.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conquista_da_turma_alternar(p_id bigint, p_ativa boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_classe bigint;
BEGIN
  SELECT classe_id INTO v_classe FROM public.conquistas WHERE id = p_id;
  IF auth.uid() IS NULL OR v_classe IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_classe
  ) THEN
    RAISE EXCEPTION 'Conquista não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.conquistas SET ativa = coalesce(p_ativa, true) WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conquistas_da_turma(p_classe_id bigint)
RETURNS TABLE (
  id bigint,
  nome text,
  descricao text,
  escopo text,
  perfil_alvo text,
  criterio jsonb,
  pontos_recompensa integer,
  ativa boolean,
  concedidas bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id::bigint, c.nome::text, c.descricao::text, c.escopo::text, c.perfil_alvo::text, c.criterio::jsonb,
         c.pontos_recompensa::integer, c.ativa,
         (SELECT count(*) FROM public.conquistas_aluno ca WHERE ca.conquista_id = c.id AND ca.concluida IS TRUE)
    FROM public.conquistas c
   WHERE c.classe_id = p_classe_id AND c.escopo <> 'evento'
   ORDER BY c.created_at, c.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.conquista_da_turma_alternar(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquista_da_turma_alternar(bigint, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.conquistas_da_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquistas_da_turma(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';


CREATE OR REPLACE FUNCTION public.fn_evento_classe_apurar(p_evento_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_evento public.eventos_classe%ROWTYPE;
  v_participantes integer;
  v_conq_part bigint;
  v_conq_dest bigint;
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

  -- Medalhas (issue #152: medalha de evento é uma `conquista`, escopo 'evento'). A conquista é
  -- criada na primeira apuração e reaproveitada nas seguintes; `conquistas_aluno` não tem chave
  -- única por (aluno, conquista), então a posse é protegida por NOT EXISTS. `pontos_recompensa`
  -- fica em 0: a medalha não paga pontos (os pontos do evento são outra decisão).
  v_conq_part := v_evento.conquista_participacao_id;
  v_conq_dest := v_evento.conquista_destaque_id;

  IF v_evento.medalha_participacao AND v_conq_part IS NULL THEN
    INSERT INTO public.conquistas (nome, descricao, categoria, tipo, escopo, criterio, pontos_recompensa, classe_id, criado_por)
    VALUES (left('Participação — ' || v_evento.titulo, 120), 'Participou do evento “' || v_evento.titulo || '”.',
            'evento', 'evento_participacao', 'evento',
            jsonb_build_object('metrica', 'evento_medalha', 'evento_id', p_evento_id, 'tipo', 'participacao'),
            0, v_evento.classe_id, v_evento.criado_por)
    RETURNING id INTO v_conq_part;
  END IF;
  IF v_evento.medalha_destaque AND v_conq_dest IS NULL THEN
    INSERT INTO public.conquistas (nome, descricao, categoria, tipo, escopo, criterio, pontos_recompensa, classe_id, criado_por)
    VALUES (left('Destaque — ' || v_evento.titulo, 120), 'Entre os destaques do evento “' || v_evento.titulo || '”.',
            'evento', 'evento_destaque', 'evento',
            jsonb_build_object('metrica', 'evento_medalha', 'evento_id', p_evento_id, 'tipo', 'destaque'),
            0, v_evento.classe_id, v_evento.criado_por)
    RETURNING id INTO v_conq_dest;
  END IF;
  UPDATE public.eventos_classe SET conquista_participacao_id = v_conq_part, conquista_destaque_id = v_conq_dest
   WHERE id = p_evento_id;

  IF v_conq_part IS NOT NULL THEN
    INSERT INTO public.conquistas_aluno (aluno_id, conquista_id, concluida, progresso, data_conquista)
    SELECT r.aluno_id, v_conq_part, true, 100, now()
    FROM public.eventos_classe_resultado r
    WHERE r.evento_id = p_evento_id AND r.participou
      AND NOT EXISTS (SELECT 1 FROM public.conquistas_aluno x WHERE x.aluno_id = r.aluno_id AND x.conquista_id = v_conq_part);
  END IF;
  IF v_conq_dest IS NOT NULL THEN
    INSERT INTO public.conquistas_aluno (aluno_id, conquista_id, concluida, progresso, data_conquista)
    SELECT r.aluno_id, v_conq_dest, true, 100, now()
    FROM public.eventos_classe_resultado r
    WHERE r.evento_id = p_evento_id AND r.destaque
      AND NOT EXISTS (SELECT 1 FROM public.conquistas_aluno x WHERE x.aluno_id = r.aluno_id AND x.conquista_id = v_conq_dest);
  END IF;

  RETURN v_participantes;
END
$function$;
"""

DOWNGRADE_SQL = r"""
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


CREATE OR REPLACE FUNCTION public.conquista_da_turma_salvar(
  p_classe_id bigint,
  p_id        bigint,
  p_nome      text,
  p_descricao text,
  p_escopo    text,
  p_perfil_alvo text,
  p_criterio  jsonb,
  p_pontos    integer
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_professor uuid := auth.uid();
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_descricao text := btrim(coalesce(p_descricao, ''));
  v_max_pontos integer;
  v_teto      integer;
  v_existentes integer;
  v_categoria text;
  v_id        bigint;
BEGIN
  IF v_professor IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF length(v_nome) < 3 OR length(v_nome) > 60 THEN
    RAISE EXCEPTION 'O nome precisa ter de 3 a 60 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(v_descricao) > 140 THEN
    RAISE EXCEPTION 'A descrição passa de 140 caracteres.' USING ERRCODE = '22023';
  END IF;

  IF p_escopo NOT IN ('comum', 'perfil') THEN
    RAISE EXCEPTION 'Escopo inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_escopo = 'perfil' AND coalesce(p_perfil_alvo, '') NOT IN
     ('seeker', 'survivor', 'daredevil', 'mastermind', 'conqueror', 'socializer', 'achiever') THEN
    RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_escopo = 'comum' AND p_perfil_alvo IS NOT NULL THEN
    RAISE EXCEPTION 'Conquista geral não tem perfil.' USING ERRCODE = '22023';
  END IF;

  IF p_criterio IS NULL OR jsonb_typeof(p_criterio) <> 'object'
     OR NOT public.fn_conquista_metrica_suportada(p_criterio ->> 'metrica') THEN
    RAISE EXCEPTION 'Métrica não suportada.' USING ERRCODE = '22023';
  END IF;

  v_max_pontos := coalesce(
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
       FROM public.app_config WHERE chave = 'conquista_recompensa_maxima'),
    100
  );
  IF p_pontos IS NULL OR p_pontos < 0 OR p_pontos > v_max_pontos THEN
    RAISE EXCEPTION 'Os pontos vão de 0 a %.', v_max_pontos USING ERRCODE = '22023';
  END IF;

  v_categoria := CASE
    WHEN p_escopo = 'perfil' THEN 'perfil_brainhex'
    WHEN p_criterio ->> 'metrica' IN ('dias_seguidos', 'minutos_totais') THEN 'habito'
    WHEN p_criterio ->> 'metrica' IN ('acertos_percentual', 'atividade_rapida') THEN 'desempenho'
    ELSE 'progresso'
  END;

  IF p_id IS NULL THEN
    -- Trava por turma para duas criações simultâneas não furarem o teto.
    PERFORM pg_advisory_xact_lock(hashtext('conquista_da_turma:' || p_classe_id::text));
    v_teto := coalesce(
      (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::integer
         FROM public.app_config WHERE chave = 'conquistas_por_turma_max'),
      20
    );
    SELECT count(*) INTO v_existentes FROM public.conquistas WHERE classe_id = p_classe_id;
    IF v_existentes >= v_teto THEN
      RAISE EXCEPTION 'Esta turma já tem % conquistas (o teto).', v_teto USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.conquistas (nome, descricao, categoria, escopo, perfil_alvo, criterio, pontos_recompensa, classe_id, criado_por)
    VALUES (v_nome, nullif(v_descricao, ''), v_categoria, p_escopo, p_perfil_alvo, p_criterio, p_pontos, p_classe_id, v_professor)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.conquistas
       SET nome = v_nome, descricao = nullif(v_descricao, ''), categoria = v_categoria, escopo = p_escopo,
           perfil_alvo = p_perfil_alvo, criterio = p_criterio, pontos_recompensa = p_pontos
     WHERE id = p_id AND classe_id = p_classe_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Conquista não encontrada nesta turma.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conquista_da_turma_alternar(p_id bigint, p_ativa boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_classe bigint;
BEGIN
  SELECT classe_id INTO v_classe FROM public.conquistas WHERE id = p_id;
  IF auth.uid() IS NULL OR v_classe IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = v_classe
  ) THEN
    RAISE EXCEPTION 'Conquista não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.conquistas SET ativa = coalesce(p_ativa, true) WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.conquistas_da_turma(p_classe_id bigint)
RETURNS TABLE (
  id bigint,
  nome text,
  descricao text,
  escopo text,
  perfil_alvo text,
  criterio jsonb,
  pontos_recompensa integer,
  ativa boolean,
  concedidas bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id::bigint, c.nome::text, c.descricao::text, c.escopo::text, c.perfil_alvo::text, c.criterio::jsonb,
         c.pontos_recompensa::integer, c.ativa,
         (SELECT count(*) FROM public.conquistas_aluno ca WHERE ca.conquista_id = c.id AND ca.concluida IS TRUE)
    FROM public.conquistas c
   WHERE c.classe_id = p_classe_id
   ORDER BY c.created_at, c.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquista_da_turma_salvar(bigint, bigint, text, text, text, text, jsonb, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.conquista_da_turma_alternar(bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquista_da_turma_alternar(bigint, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.conquistas_da_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conquistas_da_turma(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';


CREATE OR REPLACE FUNCTION public.fn_conquista_metrica_suportada(p_metrica text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_metrica IN ('eventos_totais', 'eventos_do_tipo', 'atividades_concluidas', 'topicos_concluidos', 'topicos_visitados', 'dias_seguidos', 'minutos_totais', 'acertos_percentual', 'trilha_percentual', 'atividade_rapida', 'atividades_rapidas');
$function$;

DELETE FROM public.conquistas WHERE escopo = 'evento';
ALTER TABLE public.conquistas DROP CONSTRAINT IF EXISTS conquistas_escopo_check;
ALTER TABLE public.conquistas ADD CONSTRAINT conquistas_escopo_check CHECK (escopo = ANY (ARRAY['comum'::text, 'perfil'::text]));
ALTER TABLE public.conquistas DROP CONSTRAINT IF EXISTS conquistas_perfil_alvo_check;
ALTER TABLE public.conquistas ADD CONSTRAINT conquistas_perfil_alvo_check CHECK (
  (escopo = 'comum'::text AND perfil_alvo IS NULL)
  OR (escopo = 'perfil'::text AND perfil_alvo = ANY (ARRAY['seeker'::text, 'achiever'::text, 'survivor'::text, 'daredevil'::text, 'mastermind'::text, 'conqueror'::text, 'socializer'::text]))
);

CREATE OR REPLACE FUNCTION public.fn_eventos_classe_guarda()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'rascunho';
    NEW.aberto_em := NULL;
    NEW.encerrado_em := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.aberto_em IS DISTINCT FROM OLD.aberto_em
     OR NEW.encerrado_em IS DISTINCT FROM OLD.encerrado_em THEN
    IF COALESCE(current_setting('app.evento_transicao', true), '') <> 'on' THEN
      RAISE EXCEPTION 'O estado do evento só muda ao abrir ou encerrar.' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.status <> 'rascunho' AND (
    NEW.classe_id IS DISTINCT FROM OLD.classe_id OR NEW.topico_id IS DISTINCT FROM OLD.topico_id
    OR NEW.inicio IS DISTINCT FROM OLD.inicio OR NEW.fim IS DISTINCT FROM OLD.fim
    OR NEW.modalidade_guilda IS DISTINCT FROM OLD.modalidade_guilda
    OR NEW.guilda_tamanho_max IS DISTINCT FROM OLD.guilda_tamanho_max
    OR NEW.pecas IS DISTINCT FROM OLD.pecas OR NEW.pontos IS DISTINCT FROM OLD.pontos
    OR NEW.moedas IS DISTINCT FROM OLD.moedas
    OR NEW.medalha_participacao IS DISTINCT FROM OLD.medalha_participacao
    OR NEW.medalha_destaque IS DISTINCT FROM OLD.medalha_destaque
    OR NEW.recompensa IS DISTINCT FROM OLD.recompensa
  ) THEN
    RAISE EXCEPTION 'Depois de aberto, o evento só aceita título e descrição.' USING ERRCODE = '42501';
  END IF;

  NEW.atualizado_em := now();
  RETURN NEW;
END
$function$;

ALTER TABLE public.eventos_classe DROP COLUMN IF EXISTS conquista_destaque_id, DROP COLUMN IF EXISTS conquista_participacao_id;
"""


def upgrade() -> None:
    op.execute(SQL)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
    op.execute("NOTIFY pgrst, 'reload schema'")
