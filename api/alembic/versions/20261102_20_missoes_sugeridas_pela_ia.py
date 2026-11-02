"""Missões sugeridas pela IA, aprovadas pelo professor (#151)

## O que já existia (e não muda)

`missoes` já guarda tudo o que a aprovação precisa: `origem = 'ia'`, `aprovacao` (`pendente`,
`aprovada`, `recusada`), `motivo_recusa` e a policy `missoes_aluno_sel`, que só entrega ao aluno o que
está `ativa` **e** `nao_requer`/`aprovada`. O console (aba Missões) já decide por UPDATE direto, sem
a API. O que **não existia** era quem propõe: nenhuma linha `origem = 'ia'` nasce hoje.

## O que muda

**1. Nada chega ao aluno sem aprovação, garantido pelo banco.** `CHECK (origem <> 'ia' OR aprovacao <>
'nao_requer')`: antes só a missão de guilda da IA era obrigada a passar por aprovação, e uma linha
`ia` + `turma` + `nao_requer` seria entregue na hora.

**2. O pedido é do professor, nunca automático** (decisão da #151): `missao_ia_pedir` grava uma linha em
`missoes_ia_pedidos` e devolve na hora. Salvar um tópico não chama nada, e o professor não espera a
API acordar: o worker da API reivindica o pedido quando puder.

**3. Quantidade, faixa e teto num lugar só: `app_config`** (privadas, `publico = false`; saber o teto
ajuda a burlá-lo, como em `contato_envios_por_hora`). `missao_ia_padrao` (3), `missao_ia_min` (1),
`missao_ia_max` (5) e `missao_ia_pedidos_por_dia` (3). O professor escolhe dentro da faixa; o teto é
do sistema e existe para a cota do modelo, que é o que a geração de material usa. Fora da faixa o
banco recusa (`22023`); acima do teto diário, `54000`. Quem tem sugestões pendentes demais também não
pede mais: revisar custa mais do que escrever.

**4. A IA só propõe; o banco decide o que entra.** O worker passa o que o modelo devolveu a
`fn_missao_ia_registrar`, que aplica as regras que não são do modelo: métrica do catálogo
(`fn_missao_ia_catalogo`, o único lugar onde a chave de parâmetro de cada métrica está escrita), alvo
dentro do teto da métrica, texto sem link e sem e-mail, tamanhos, sem repetir título de missão que já
existe (inclusive as recusadas) e no máximo a quantidade pedida. Sem modelo, nada é inventado: o
pedido falha, espaça as tentativas e para.

**5. Aprovação e recusa gravadas desde a primeira versão** (`missoes_ia_log`, só de acréscimo): cada
proposta, aprovação e recusa, com o motivo da recusa. A taxa de aprovação sai daqui, e é o dado que
vai dizer se a IA presta. Ela **não** realimenta o prompt (decisão da #151: sem forma de avaliar,
realimentar é ajustar a ruído).

## O que ficou de fora

- Editar a missão antes de aprovar: `trg_missoes_guarda` congela texto, critério e janela de missão que
  não é do professor, e congela em silêncio. Quem quiser mudar, recusa e cria a sua.
- Só missão-meta, escopo `turma`. Entrega cria `atividades` com nota e moedas, e isso a IA não faz.
- Janela (prazo): sem prazo. A aprovação não carrega data.
"""

from __future__ import annotations

from alembic import op

revision = "20261102_20"
down_revision = "20261102_19"
branch_labels = None
depends_on = None

# Espelham `frontend/src/components/console/missoes/criterio.ts` (CHAVE_DO_ALVO e `max`); um teste
# compara os dois lados. A chave errada não dá erro: o avaliador lê `COALESCE(..., 0)` e a missão
# fecha na hora para todo mundo.
CATALOGO = (
    ("minutos_totais", "minutos", "minutos", 100000),
    ("dias_seguidos", "dias_seguidos", "dias", 365),
    ("topicos_concluidos", "minimo", "tópicos", 1000),
    ("atividades_concluidas", "minimo", "atividades", 1000),
    ("acertos_percentual", "percentual", "%", 100),
    ("trilha_percentual", "percentual", "%", 100),
)

MAX_TENTATIVAS = 5
ESPERA_MAXIMA_MIN = 120


def _valores_do_catalogo() -> str:
    return ",\n    ".join(f"('{m}', '{c}', '{u}', {mx})" for m, c, u, mx in CATALOGO)


CONFIG = """
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('missao_ia_padrao', '3', 'Missões sugeridas pela IA: quantidade padrão por pedido do professor.', false),
  ('missao_ia_min', '1', 'Missões sugeridas pela IA: menor quantidade que o professor pode pedir.', false),
  ('missao_ia_max', '5', 'Missões sugeridas pela IA: maior quantidade por pedido (protege a cota do modelo).', false),
  ('missao_ia_pedidos_por_dia', '3', 'Missões sugeridas pela IA: pedidos por professor em 24 h.', false)
ON CONFLICT (chave) DO NOTHING;
"""


COLUNAS_E_REGRA = """
ALTER TABLE public.missoes ADD COLUMN IF NOT EXISTS base_ia text;
ALTER TABLE public.missoes ADD COLUMN IF NOT EXISTS pedido_ia_id uuid;

ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_base_ia_curta;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_base_ia_curta
  CHECK (base_ia IS NULL OR char_length(base_ia) <= 300);

-- Nada da IA chega ao aluno sem decisão: a missão de guilda já tinha esta regra; agora vale para toda.
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_ia_exige_aprovacao;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_ia_exige_aprovacao
  CHECK (origem <> 'ia' OR aprovacao <> 'nao_requer');
"""


PEDIDOS = """
CREATE TABLE IF NOT EXISTS public.missoes_ia_pedidos (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  classe_id            bigint      NOT NULL REFERENCES public.classe (id) ON DELETE CASCADE,
  topico_id            bigint      REFERENCES public.topicos (id) ON DELETE SET NULL,
  quantidade           integer     NOT NULL,
  status               text        NOT NULL DEFAULT 'pendente',
  solicitado_por       uuid        NOT NULL,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  tentativas           integer     NOT NULL DEFAULT 0,
  travado_em           timestamptz,
  gerados              integer,
  ultimo_erro          text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  finalizado_em        timestamptz,
  CONSTRAINT missoes_ia_pedidos_status_ck CHECK (status IN ('pendente', 'concluido', 'falhou')),
  CONSTRAINT missoes_ia_pedidos_qtd_ck CHECK (quantidade BETWEEN 1 AND 20)
);

CREATE INDEX IF NOT EXISTS missoes_ia_pedidos_fila_idx
  ON public.missoes_ia_pedidos (proxima_tentativa_em) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS missoes_ia_pedidos_classe_idx
  ON public.missoes_ia_pedidos (classe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS missoes_ia_pedidos_prof_idx
  ON public.missoes_ia_pedidos (solicitado_por, created_at DESC);

ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_pedido_ia_fk;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_pedido_ia_fk
  FOREIGN KEY (pedido_ia_id) REFERENCES public.missoes_ia_pedidos (id) ON DELETE SET NULL;

ALTER TABLE public.missoes_ia_pedidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS missoes_ia_pedidos_sel ON public.missoes_ia_pedidos;
CREATE POLICY missoes_ia_pedidos_sel ON public.missoes_ia_pedidos
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));

-- Só leitura para o cliente: quem escreve é `missao_ia_pedir` (e o worker, por funções de service_role).
REVOKE ALL ON public.missoes_ia_pedidos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.missoes_ia_pedidos TO authenticated;
"""


LOG = """
CREATE TABLE IF NOT EXISTS public.missoes_ia_log (
  id          bigserial   PRIMARY KEY,
  missao_id   bigint      REFERENCES public.missoes (id) ON DELETE SET NULL,
  classe_id   bigint      NOT NULL REFERENCES public.classe (id) ON DELETE CASCADE,
  evento      text        NOT NULL,
  motivo      text,
  decidido_por uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT missoes_ia_log_evento_ck CHECK (evento IN ('proposta', 'aprovada', 'recusada')),
  CONSTRAINT missoes_ia_log_motivo_ck CHECK (motivo IS NULL OR char_length(motivo) <= 500)
);
CREATE INDEX IF NOT EXISTS missoes_ia_log_classe_idx ON public.missoes_ia_log (classe_id, created_at DESC);

ALTER TABLE public.missoes_ia_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS missoes_ia_log_sel ON public.missoes_ia_log;
CREATE POLICY missoes_ia_log_sel ON public.missoes_ia_log
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));

-- Só de acréscimo: ninguém reescreve o histórico de decisões, nem o professor.
REVOKE ALL ON public.missoes_ia_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.missoes_ia_log TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_missoes_ia_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.origem <> 'ia' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.missoes_ia_log (missao_id, classe_id, evento) VALUES (NEW.id, NEW.classe_id, 'proposta');
  ELSIF NEW.aprovacao IS DISTINCT FROM OLD.aprovacao AND NEW.aprovacao IN ('aprovada', 'recusada') THEN
    INSERT INTO public.missoes_ia_log (missao_id, classe_id, evento, motivo, decidido_por)
    VALUES (NEW.id, NEW.classe_id,
            CASE NEW.aprovacao WHEN 'aprovada' THEN 'aprovada' ELSE 'recusada' END,
            CASE WHEN NEW.aprovacao = 'recusada' THEN NEW.motivo_recusa END,
            auth.uid());
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- O histórico nunca pode impedir o professor de decidir.
  RAISE WARNING 'missoes_ia_log: %', SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missoes_ia_log() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_missoes_ia_log ON public.missoes;
CREATE TRIGGER trg_missoes_ia_log
  AFTER INSERT OR UPDATE OF aprovacao ON public.missoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_missoes_ia_log();
"""


LIMITES = """
-- Padrão, faixa e teto lidos de um lugar só (`app_config`), com piso de sanidade: valor quebrado na
-- tabela não pode abrir a porta para pedidos sem limite.
CREATE OR REPLACE FUNCTION public.fn_missao_ia_limites(
  OUT padrao integer, OUT minimo integer, OUT maximo integer, OUT pedidos_dia integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  minimo := GREATEST(1, public.fn_app_config_int('missao_ia_min', 1));
  maximo := LEAST(20, GREATEST(minimo, public.fn_app_config_int('missao_ia_max', 5)));
  padrao := LEAST(maximo, GREATEST(minimo, public.fn_app_config_int('missao_ia_padrao', 3)));
  pedidos_dia := GREATEST(1, public.fn_app_config_int('missao_ia_pedidos_por_dia', 3));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_ia_limites() FROM PUBLIC, anon, authenticated;

-- O console mostra a faixa e quantos pedidos ainda cabem hoje; a config em si continua privada.
CREATE OR REPLACE FUNCTION public.missao_ia_limites()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v record;
  v_usados integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão necessária.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v FROM public.fn_missao_ia_limites();
  SELECT count(*)::integer INTO v_usados
    FROM public.missoes_ia_pedidos p
   WHERE p.solicitado_por = auth.uid() AND p.created_at > now() - interval '1 day';
  RETURN jsonb_build_object(
    'padrao', v.padrao, 'minimo', v.minimo, 'maximo', v.maximo,
    'pedidos_por_dia', v.pedidos_dia, 'pedidos_restantes', GREATEST(0, v.pedidos_dia - v_usados));
END;
$function$;

REVOKE ALL ON FUNCTION public.missao_ia_limites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.missao_ia_limites() TO authenticated;
"""


PEDIR = """
CREATE OR REPLACE FUNCTION public.missao_ia_pedir(
  p_classe_id bigint,
  p_topico_id bigint DEFAULT NULL,
  p_quantidade integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v           record;
  v_qtd       integer;
  v_id        uuid;
  v_usados    integer;
  v_pendentes integer;
BEGIN
  -- A posse vem antes de qualquer leitura (mesmo molde de `duplicar_classe`): quem não é dono nem
  -- descobre se a turma existe.
  IF v_uid IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  IF p_topico_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.topicos t WHERE t.id = p_topico_id AND t.classe_id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'O tópico não é desta turma.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v FROM public.fn_missao_ia_limites();
  v_qtd := COALESCE(p_quantidade, v.padrao);
  IF v_qtd < v.minimo OR v_qtd > v.maximo THEN
    RAISE EXCEPTION 'A quantidade vai de % a %.', v.minimo, v.maximo USING ERRCODE = '22023';
  END IF;

  -- Clique duplo, ou pedido igual a um que ainda espera: devolve o que já existe.
  SELECT p.id INTO v_id
    FROM public.missoes_ia_pedidos p
   WHERE p.classe_id = p_classe_id AND p.topico_id IS NOT DISTINCT FROM p_topico_id AND p.status = 'pendente'
   ORDER BY p.created_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Revisar custa mais do que escrever: não empilha sugestão que ninguém decidiu.
  SELECT count(*)::integer INTO v_pendentes
    FROM public.missoes m
   WHERE m.classe_id = p_classe_id AND m.origem = 'ia' AND m.aprovacao = 'pendente';
  IF v_pendentes >= v.maximo THEN
    RAISE EXCEPTION 'Você ainda tem % sugestões para decidir. Decida essas antes de pedir mais.', v_pendentes
      USING ERRCODE = '54000';
  END IF;

  SELECT count(*)::integer INTO v_usados
    FROM public.missoes_ia_pedidos p
   WHERE p.solicitado_por = v_uid AND p.created_at > now() - interval '1 day';
  IF v_usados >= v.pedidos_dia THEN
    RAISE EXCEPTION 'Limite de % pedidos por dia atingido. Tente amanhã.', v.pedidos_dia USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.missoes_ia_pedidos (classe_id, topico_id, quantidade, solicitado_por)
  VALUES (p_classe_id, p_topico_id, v_qtd, v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.missao_ia_pedir(bigint, bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.missao_ia_pedir(bigint, bigint, integer) TO authenticated;
"""


CATALOGO_SQL = f"""
-- O único lugar onde a chave de parâmetro de cada métrica está escrita para a IA. Copia o avaliador
-- (`trg_eventos_aluno_after_iud`) e o catálogo do console; um teste trava os três.
CREATE OR REPLACE FUNCTION public.fn_missao_ia_catalogo()
RETURNS TABLE (metrica text, chave text, unidade text, maximo integer)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT * FROM (VALUES
    {_valores_do_catalogo()}
  ) AS c (metrica, chave, unidade, maximo);
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_ia_catalogo() FROM PUBLIC, anon, authenticated;
"""


WORKER = f"""
-- Texto comparável: sem caixa, sem acento, sem pontuação solta. Dois títulos que só diferem nisso são
-- a mesma missão ("Missão X!" e "missao x"). Os acentos saem por `translate`, e não por `lower()` ou
-- `unaccent`: o resultado não pode depender da localidade do banco nem de extensão instalada.
CREATE OR REPLACE FUNCTION public.fn_missao_ia_chave_do_titulo(p_titulo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $function$
  SELECT btrim(regexp_replace(
    lower(translate(coalesce(p_titulo, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
      'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
    '\\W+', ' ', 'g'));
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_ia_chave_do_titulo(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_missao_ia_reivindicar(
  p_limite integer, p_trava_seg integer, p_classe_ids bigint[] DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN QUERY
  WITH alvo AS (
    SELECT p.id
      FROM public.missoes_ia_pedidos p
     WHERE p.status = 'pendente'
       AND p.proxima_tentativa_em <= now()
       AND p.tentativas < {MAX_TENTATIVAS}
       AND (p.travado_em IS NULL OR p.travado_em < now() - make_interval(secs => p_trava_seg))
       AND (p_classe_ids IS NULL OR p.classe_id = ANY (p_classe_ids))
     ORDER BY p.proxima_tentativa_em, p.created_at
     LIMIT p_limite
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.missoes_ia_pedidos p
     SET travado_em = now(), tentativas = p.tentativas + 1
    FROM alvo
   WHERE p.id = alvo.id
  RETURNING p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_ia_reivindicar(integer, integer, bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_missao_ia_reivindicar(integer, integer, bigint[]) TO service_role;

-- O que o modelo recebe. Nada de aluno: nem nome, nem e-mail, nem telemetria. A turma pode ter menor
-- de idade, e a missão é da turma, não de uma pessoa.
CREATE OR REPLACE FUNCTION public.fn_missao_ia_contexto(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ped     public.missoes_ia_pedidos%ROWTYPE;
  v_classe  jsonb;
  v_topico  jsonb;
  v_topicos jsonb;
BEGIN
  SELECT * INTO v_ped FROM public.missoes_ia_pedidos WHERE id = p_pedido_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
           'descricao', coalesce(nullif(btrim(c.descricao), ''), 'Turma'),
           'alunos', (SELECT count(*) FROM public.classe_aluno ca WHERE ca.classe_id = c.id))
    INTO v_classe
    FROM public.classe c WHERE c.id = v_ped.classe_id;

  IF v_ped.topico_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'titulo', t.nome,
             'descricao', left(coalesce(t.descricao, ''), 400),
             'conteudos', coalesce((
               SELECT jsonb_agg(jsonb_build_object('titulo', left(co.titulo, 120), 'tipo', co.tipo) ORDER BY co.id)
                 FROM public.conteudos co WHERE co.topico_id = t.id), '[]'::jsonb),
             'atividades', coalesce((
               SELECT jsonb_agg(jsonb_build_object('titulo', left(a.titulo, 120), 'tipo', a.tipo) ORDER BY a.id)
                 FROM public.atividades a WHERE a.topico_id = t.id), '[]'::jsonb))
      INTO v_topico
      FROM public.topicos t WHERE t.id = v_ped.topico_id;
  ELSE
    SELECT coalesce(jsonb_agg(left(t.nome, 120) ORDER BY t.ordem, t.id), '[]'::jsonb)
      INTO v_topicos
      FROM (SELECT nome, ordem, id FROM public.topicos WHERE classe_id = v_ped.classe_id ORDER BY ordem, id LIMIT 12) t;
  END IF;

  RETURN jsonb_build_object(
    'quantidade', v_ped.quantidade,
    'classe', v_classe,
    'topico', v_topico,
    'topicos_da_turma', v_topicos,
    -- Para não repetir o que já existe, inclusive o que o professor recusou.
    'missoes_existentes', coalesce((
      SELECT jsonb_agg(jsonb_build_object('titulo', m.titulo, 'situacao',
               CASE WHEN m.aprovacao = 'recusada' THEN 'recusada' WHEN m.aprovacao = 'pendente' THEN 'pendente' ELSE 'ativa' END))
        FROM (SELECT titulo, aprovacao FROM public.missoes
               WHERE classe_id = v_ped.classe_id AND origem <> 'sistema'
               ORDER BY criado_em DESC LIMIT 40) m), '[]'::jsonb),
    'catalogo', (SELECT jsonb_agg(jsonb_build_object(
                   'metrica', c.metrica, 'unidade', c.unidade, 'minimo', 1, 'maximo', c.maximo) ORDER BY c.metrica)
                   FROM public.fn_missao_ia_catalogo() c));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_ia_contexto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_missao_ia_contexto(uuid) TO service_role;

-- As regras que não são do modelo. O que não passa é descartado em silêncio; se nada passar, o pedido
-- falha (e o worker tenta de novo), em vez de fechar "concluído" com zero missão.
CREATE OR REPLACE FUNCTION public.fn_missao_ia_registrar(p_pedido_id uuid, p_propostas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_ped     public.missoes_ia_pedidos%ROWTYPE;
  v_item    jsonb;
  v_cat     record;
  v_titulo  text;
  v_desc    text;
  v_base    text;
  v_alvo    numeric;
  v_chave   text;
  v_vistos  text[] := ARRAY[]::text[];
  v_gerados integer := 0;
BEGIN
  SELECT * INTO v_ped FROM public.missoes_ia_pedidos WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND OR v_ped.status <> 'pendente' THEN
    RETURN 0;
  END IF;
  IF p_propostas IS NULL OR jsonb_typeof(p_propostas) <> 'array' THEN
    RAISE EXCEPTION 'propostas deve ser uma lista' USING ERRCODE = '22023';
  END IF;

  -- Títulos que já existem na turma (de qualquer origem e situação) entram como já vistos.
  SELECT coalesce(array_agg(public.fn_missao_ia_chave_do_titulo(m.titulo)), ARRAY[]::text[])
    INTO v_vistos FROM public.missoes m WHERE m.classe_id = v_ped.classe_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_propostas) LOOP
    EXIT WHEN v_gerados >= v_ped.quantidade;
    IF jsonb_typeof(v_item) <> 'object' THEN CONTINUE; END IF;

    v_titulo := btrim(coalesce(v_item ->> 'titulo', ''));
    v_desc   := btrim(coalesce(v_item ->> 'descricao', ''));
    v_base   := nullif(btrim(coalesce(v_item ->> 'base', '')), '');
    v_chave  := public.fn_missao_ia_chave_do_titulo(v_titulo);

    IF char_length(v_titulo) NOT BETWEEN 3 AND 80 THEN CONTINUE; END IF;
    IF char_length(v_desc) NOT BETWEEN 10 AND 500 THEN CONTINUE; END IF;
    IF v_base IS NOT NULL AND char_length(v_base) > 300 THEN v_base := left(v_base, 300); END IF;
    -- Link e e-mail: o público inclui menores e a missão aparece na tela deles.
    IF (v_titulo || ' ' || v_desc || ' ' || coalesce(v_base, '')) ~* '(https?://|www\\.|@[a-z0-9])' THEN CONTINUE; END IF;
    IF v_chave = ANY (v_vistos) THEN CONTINUE; END IF;

    SELECT c.* INTO v_cat FROM public.fn_missao_ia_catalogo() c WHERE c.metrica = (v_item ->> 'metrica');
    IF NOT FOUND THEN CONTINUE; END IF;
    BEGIN
      v_alvo := (v_item ->> 'alvo')::numeric;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
    IF v_alvo IS NULL OR v_alvo <> trunc(v_alvo) OR v_alvo < 1 OR v_alvo > v_cat.maximo THEN CONTINUE; END IF;

    INSERT INTO public.missoes
      (classe_id, origem, escopo, titulo, descricao, criterio, recompensa_tipo, aprovacao, ativa,
       base_ia, pedido_ia_id)
    VALUES
      (v_ped.classe_id, 'ia', 'turma', v_titulo, v_desc,
       jsonb_build_object('metrica', v_cat.metrica, v_cat.chave, v_alvo::integer),
       'missao_concluida', 'pendente', true, v_base, v_ped.id);
    v_vistos := v_vistos || v_chave;
    v_gerados := v_gerados + 1;
  END LOOP;

  IF v_gerados = 0 THEN
    RAISE EXCEPTION 'o modelo não trouxe nenhuma proposta válida' USING ERRCODE = '22023';
  END IF;

  UPDATE public.missoes_ia_pedidos
     SET status = 'concluido', gerados = v_gerados, finalizado_em = now(), ultimo_erro = NULL, travado_em = NULL
   WHERE id = p_pedido_id;
  RETURN v_gerados;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_ia_registrar(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_missao_ia_registrar(uuid, jsonb) TO service_role;

-- Falha espaça a próxima tentativa (2^n min, até {ESPERA_MAXIMA_MIN}); na {MAX_TENTATIVAS}ª o pedido para como `falhou`
-- e o professor vê isso no console, em vez de uma fila que nunca anda.
CREATE OR REPLACE FUNCTION public.fn_missao_ia_falhou(p_pedido_id uuid, p_erro text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.missoes_ia_pedidos p
     SET ultimo_erro = left(coalesce(p_erro, ''), 500),
         travado_em = NULL,
         status = CASE WHEN p.tentativas >= {MAX_TENTATIVAS} THEN 'falhou' ELSE p.status END,
         finalizado_em = CASE WHEN p.tentativas >= {MAX_TENTATIVAS} THEN now() ELSE p.finalizado_em END,
         proxima_tentativa_em = now() + make_interval(mins => LEAST({ESPERA_MAXIMA_MIN}, power(2, p.tentativas)::integer))
   WHERE p.id = p_pedido_id AND p.status = 'pendente';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_ia_falhou(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_missao_ia_falhou(uuid, text) TO service_role;
"""


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(COLUNAS_E_REGRA)
    op.execute(PEDIDOS)
    op.execute(LOG)
    op.execute(LIMITES)
    op.execute(PEDIR)
    op.execute(CATALOGO_SQL)
    op.execute(WORKER)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_missoes_ia_log ON public.missoes")
    for assinatura in (
        "public.fn_missao_ia_falhou(uuid, text)",
        "public.fn_missao_ia_registrar(uuid, jsonb)",
        "public.fn_missao_ia_contexto(uuid)",
        "public.fn_missao_ia_reivindicar(integer, integer, bigint[])",
        "public.fn_missao_ia_chave_do_titulo(text)",
        "public.fn_missao_ia_catalogo()",
        "public.missao_ia_pedir(bigint, bigint, integer)",
        "public.missao_ia_limites()",
        "public.fn_missao_ia_limites()",
        "public.fn_missoes_ia_log()",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS {assinatura}")
    op.execute("ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_pedido_ia_fk")
    op.execute("DROP TABLE IF EXISTS public.missoes_ia_log")
    op.execute("DROP TABLE IF EXISTS public.missoes_ia_pedidos")
    op.execute("ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_ia_exige_aprovacao")
    op.execute("ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_base_ia_curta")
    op.execute("ALTER TABLE public.missoes DROP COLUMN IF EXISTS pedido_ia_id")
    op.execute("ALTER TABLE public.missoes DROP COLUMN IF EXISTS base_ia")
    op.execute(
        "DELETE FROM public.app_config WHERE chave IN "
        "('missao_ia_padrao', 'missao_ia_min', 'missao_ia_max', 'missao_ia_pedidos_por_dia')"
    )
