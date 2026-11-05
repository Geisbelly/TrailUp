"""Diagnóstico curto antes do tópico: o banco guarda, corrige e decide o nível (#137, fase 1)

## O que a #137 pede

O TrailUp mede o jogador (quiz BrainHex), não o que o aluno já sabe. Falta a "metade didática": um
diagnóstico curto antes do tópico, cujo resultado define o ponto de partida. Esta é a fase 1, **só o banco**;
o worker que escreve as perguntas (IA) é a fase 2 e a tela no app é a fase 3.

## Regra de fronteira

Escrever as perguntas é IA e mora na API. Todo o resto é banco: pedir, guardar, corrigir, decidir o nível,
dispensar, e o que fazer quando a IA não responde. A API não escreve em tabela: passa o que o modelo devolveu
a `fn_diagnostico_registrar`, que aplica as regras (tamanho, quantidade, gabarito dentro das opções).

## Decisões (as da issue, fechadas)

- **O diagnóstico NÃO dispara geração de material.** Ele só lê o conteúdo do tópico e grava um nível. O
  `source_hash` não muda, e a cota do Gemini (o gargalo) paga uma chamada curta por aluno e tópico, não um
  pipeline.
- **Uma vez por aluno e tópico**, e só **antes de começar o tópico**: com `topico_aluno.percentual_concluido > 0`
  o pedido nem nasce (`ja_iniciado`). É o limite do custo.
- **Opcional, sem pressão.** O aluno pode dispensar (`diagnostico_dispensar`). Dispensar não custa ponto nem
  posição, como a regra do épico.
- **Cota estourada ou modelo fora do ar:** o pedido tenta de novo com espera crescente (2^n minutos, no máximo
  120) e, na terceira falha, vira `sem_ia` e o aluno segue o tópico como sempre. Nada bloqueia, nada é inventado.
- **O gabarito não chega ao cliente.** Vive em `diagnostico_topico_gabarito`, sem policy e sem GRANT: só as
  funções `SECURITY DEFINER` leem. A correção é `diagnostico_responder`, não o app.
- **Turma retida pelo estudo (#13) não recebe:** `diagnostico_pedir` devolve `retido` e a policy `RESTRICTIVE`
  esconde a linha, como as outras tabelas que entregam personalização ao aluno (`20261102_05`).
- Faixas e teto em `app_config` (privadas), não em constante.

Nada aplicado em produção.
"""

from __future__ import annotations

from alembic import op

revision = "20261105_22"
down_revision = "20261105_21"
branch_labels = None
depends_on = None

MAX_TENTATIVAS = 3
ESPERA_MAXIMA_MIN = 120

CONFIG = """
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('diagnostico_perguntas_max', '5',
   'Teto de perguntas do diagnostico antes do topico. #137.', false),
  ('diagnostico_faixa_intermediario_pct', '40',
   'Acerto minimo, em %, para o nivel intermediario do diagnostico. Abaixo disso, inicial. #137.', false),
  ('diagnostico_faixa_avancado_pct', '80',
   'Acerto minimo, em %, para o nivel avancado do diagnostico. #137.', false)
ON CONFLICT (chave) DO NOTHING;
"""

TABELAS = """
CREATE TABLE IF NOT EXISTS public.diagnostico_topico (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id             uuid   NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  topico_id            bigint NOT NULL REFERENCES public.topicos(id) ON DELETE CASCADE,
  classe_id            bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  status               text   NOT NULL DEFAULT 'pendente'
    CONSTRAINT diagnostico_topico_status_ck CHECK (status IN ('pendente', 'pronto', 'respondido', 'sem_ia', 'dispensado')),
  perguntas            jsonb,
  nivel                text
    CONSTRAINT diagnostico_topico_nivel_ck CHECK (nivel IS NULL OR nivel IN ('inicial', 'intermediario', 'avancado')),
  acertos              integer,
  total                integer,
  tentativas           integer NOT NULL DEFAULT 0,
  proxima_tentativa_em timestamptz NOT NULL DEFAULT now(),
  travado_em           timestamptz,
  ultimo_erro          text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  respondido_em        timestamptz,
  finalizado_em        timestamptz,
  CONSTRAINT diagnostico_topico_unico UNIQUE (aluno_id, topico_id)
);

CREATE INDEX IF NOT EXISTS diagnostico_topico_fila_idx
  ON public.diagnostico_topico (proxima_tentativa_em) WHERE status = 'pendente';

-- O gabarito mora sozinho: sem policy e sem GRANT, so as funcoes SECURITY DEFINER chegam nele.
CREATE TABLE IF NOT EXISTS public.diagnostico_topico_gabarito (
  diagnostico_id uuid PRIMARY KEY REFERENCES public.diagnostico_topico(id) ON DELETE CASCADE,
  gabarito       jsonb NOT NULL
);

ALTER TABLE public.diagnostico_topico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostico_topico_gabarito ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.diagnostico_topico FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.diagnostico_topico_gabarito FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.diagnostico_topico TO authenticated;

DROP POLICY IF EXISTS diagnostico_topico_aluno_sel ON public.diagnostico_topico;
CREATE POLICY diagnostico_topico_aluno_sel ON public.diagnostico_topico
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());

-- Turma com a personalizacao retida pelo estudo nao ve (o mesmo molde da 20261102_05).
DROP POLICY IF EXISTS diagnostico_topico_retida ON public.diagnostico_topico;
CREATE POLICY diagnostico_topico_retida ON public.diagnostico_topico
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (classe_id NOT IN (SELECT public.app_classes_retidas_do_aluno()));

INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('diagnostico_topico', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'diagnostico de conhecimento antes do topico; sai com a conta ou com o topico pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

DO_ALUNO = """
CREATE OR REPLACE FUNCTION public.diagnostico_pedir(p_topico_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_aluno  uuid := auth.uid();
  v_classe bigint;
  v_id     uuid;
  v_status text;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'diagnostico_sem_sessao' USING ERRCODE = '42501';
  END IF;

  SELECT t.classe_id INTO v_classe FROM public.topicos t WHERE t.id = p_topico_id;
  IF v_classe IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.classe_aluno ca WHERE ca.aluno_id = v_aluno AND ca.classe_id = v_classe
  ) THEN
    RAISE EXCEPTION 'diagnostico_sem_acesso' USING ERRCODE = '42501';
  END IF;

  -- O estudo (#13) retem a personalizacao desta turma: o diagnostico e' personalizacao.
  IF public.estudo_personalizacao_retida(v_classe) THEN
    RETURN jsonb_build_object('status', 'retido');
  END IF;

  -- Ja existe: devolve o que ha, sem outra chamada ao modelo.
  SELECT d.id, d.status INTO v_id, v_status
    FROM public.diagnostico_topico d WHERE d.aluno_id = v_aluno AND d.topico_id = p_topico_id;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_id, 'status', v_status);
  END IF;

  -- So' antes de comecar o topico: depois disso o ponto de partida ja passou, e a cota e' o gargalo.
  IF EXISTS (
    SELECT 1 FROM public.topico_aluno ta
     WHERE ta.aluno_id = v_aluno AND ta.topico_id = p_topico_id AND COALESCE(ta.percentual_concluido, 0) > 0
  ) THEN
    RETURN jsonb_build_object('status', 'ja_iniciado');
  END IF;

  INSERT INTO public.diagnostico_topico (aluno_id, topico_id, classe_id)
  VALUES (v_aluno, p_topico_id, v_classe)
  ON CONFLICT (aluno_id, topico_id) DO NOTHING
  RETURNING id, status INTO v_id, v_status;

  IF v_id IS NULL THEN
    SELECT d.id, d.status INTO v_id, v_status
      FROM public.diagnostico_topico d WHERE d.aluno_id = v_aluno AND d.topico_id = p_topico_id;
  END IF;
  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.diagnostico_pedir(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.diagnostico_pedir(bigint) TO authenticated;

-- A correcao e' do banco: o gabarito nunca vai ao aparelho. `p_respostas` e' a lista de indices escolhidos,
-- na ordem das perguntas; `null` e' pergunta pulada.
CREATE OR REPLACE FUNCTION public.diagnostico_responder(p_id uuid, p_respostas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_aluno   uuid := auth.uid();
  v_gab     jsonb;
  v_total   integer;
  v_acertos integer := 0;
  v_pct     numeric;
  v_inter   numeric;
  v_avanc   numeric;
  v_nivel   text;
  i         integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'diagnostico_sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF p_respostas IS NULL OR jsonb_typeof(p_respostas) <> 'array' THEN
    RAISE EXCEPTION 'diagnostico_respostas_invalidas' USING ERRCODE = '22023';
  END IF;

  SELECT g.gabarito INTO v_gab
    FROM public.diagnostico_topico d
    JOIN public.diagnostico_topico_gabarito g ON g.diagnostico_id = d.id
   WHERE d.id = p_id AND d.aluno_id = v_aluno AND d.status = 'pronto'
     FOR UPDATE OF d;
  IF v_gab IS NULL THEN
    RAISE EXCEPTION 'diagnostico_indisponivel' USING ERRCODE = '42501';
  END IF;

  v_total := jsonb_array_length(v_gab);
  FOR i IN 0 .. v_total - 1 LOOP
    IF jsonb_typeof(p_respostas -> i) = 'number' AND (p_respostas ->> i) = (v_gab ->> i) THEN
      v_acertos := v_acertos + 1;
    END IF;
  END LOOP;

  v_pct := 100.0 * v_acertos / GREATEST(v_total, 1);
  SELECT COALESCE((SELECT valor::numeric FROM public.app_config WHERE chave = 'diagnostico_faixa_intermediario_pct'), 40),
         COALESCE((SELECT valor::numeric FROM public.app_config WHERE chave = 'diagnostico_faixa_avancado_pct'), 80)
    INTO v_inter, v_avanc;
  v_nivel := CASE WHEN v_pct >= v_avanc THEN 'avancado' WHEN v_pct >= v_inter THEN 'intermediario' ELSE 'inicial' END;

  UPDATE public.diagnostico_topico
     SET status = 'respondido', nivel = v_nivel, acertos = v_acertos, total = v_total,
         respondido_em = now(), finalizado_em = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('nivel', v_nivel, 'acertos', v_acertos, 'total', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.diagnostico_responder(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.diagnostico_responder(uuid, jsonb) TO authenticated;

-- Opcional e sem custo: dispensar nao tira ponto nem posicao.
CREATE OR REPLACE FUNCTION public.diagnostico_dispensar(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'diagnostico_sem_sessao' USING ERRCODE = '42501';
  END IF;
  UPDATE public.diagnostico_topico
     SET status = 'dispensado', finalizado_em = now(), travado_em = NULL
   WHERE id = p_id AND aluno_id = auth.uid() AND status IN ('pendente', 'pronto');
END;
$function$;

REVOKE ALL ON FUNCTION public.diagnostico_dispensar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.diagnostico_dispensar(uuid) TO authenticated;
"""

DO_WORKER = f"""
CREATE OR REPLACE FUNCTION public.fn_diagnostico_reivindicar(
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
    SELECT d.id
      FROM public.diagnostico_topico d
     WHERE d.status = 'pendente'
       AND d.proxima_tentativa_em <= now()
       AND d.tentativas < {MAX_TENTATIVAS}
       AND (d.travado_em IS NULL OR d.travado_em < now() - make_interval(secs => p_trava_seg))
       AND (p_classe_ids IS NULL OR d.classe_id = ANY (p_classe_ids))
     ORDER BY d.proxima_tentativa_em, d.created_at
     LIMIT p_limite
       FOR UPDATE SKIP LOCKED
  )
  UPDATE public.diagnostico_topico d
     SET travado_em = now(), tentativas = d.tentativas + 1
    FROM alvo
   WHERE d.id = alvo.id
  RETURNING d.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_diagnostico_reivindicar(integer, integer, bigint[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diagnostico_reivindicar(integer, integer, bigint[]) TO service_role;

-- O que o modelo recebe: so' o topico e o conteudo do professor. Nada do aluno.
CREATE OR REPLACE FUNCTION public.fn_diagnostico_contexto(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_topico bigint;
  v_max    integer;
BEGIN
  SELECT d.topico_id INTO v_topico FROM public.diagnostico_topico d WHERE d.id = p_id AND d.status = 'pendente';
  IF v_topico IS NULL THEN
    RETURN NULL;
  END IF;
  v_max := COALESCE((SELECT valor::integer FROM public.app_config WHERE chave = 'diagnostico_perguntas_max'), 5);
  RETURN (
    SELECT jsonb_build_object(
      'topico', t.nome,
      'descricao', COALESCE(t.descricao, ''),
      'max_perguntas', v_max,
      'conteudos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('titulo', c.titulo, 'trecho', left(COALESCE(c.conteudo, ''), 1500)) ORDER BY c.ordem, c.id)
          FROM public.conteudos c WHERE c.topico_id = t.id
      ), jsonb_build_array())
    )
    FROM public.topicos t WHERE t.id = v_topico
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_diagnostico_contexto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diagnostico_contexto(uuid) TO service_role;

-- A API passa o que o modelo devolveu: lista de objetos com enunciado, opcoes e correta (indice). As regras
-- que nao sao do modelo ficam aqui: tamanho, quantidade, resposta dentro das opcoes, sem link.
CREATE OR REPLACE FUNCTION public.fn_diagnostico_registrar(p_id uuid, p_perguntas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_max      integer;
  v_p        jsonb;
  v_ops      jsonb;
  v_correta  integer;
  v_validas  jsonb := jsonb_build_array();
  v_gabarito jsonb := jsonb_build_array();
  v_n        integer := 0;
BEGIN
  IF p_perguntas IS NULL OR jsonb_typeof(p_perguntas) <> 'array' THEN
    RAISE EXCEPTION 'diagnostico_perguntas_invalidas' USING ERRCODE = '22023';
  END IF;
  v_max := COALESCE((SELECT valor::integer FROM public.app_config WHERE chave = 'diagnostico_perguntas_max'), 5);

  FOR v_p IN SELECT e FROM jsonb_array_elements(p_perguntas) AS e LOOP
    EXIT WHEN v_n >= v_max;
    v_ops := v_p -> 'opcoes';
    CONTINUE WHEN jsonb_typeof(v_p -> 'enunciado') <> 'string'
               OR char_length(btrim(v_p ->> 'enunciado')) NOT BETWEEN 10 AND 300
               OR jsonb_typeof(v_ops) <> 'array'
               OR jsonb_array_length(v_ops) NOT BETWEEN 2 AND 5
               OR jsonb_typeof(v_p -> 'correta') <> 'number'
               OR (v_p ->> 'enunciado') ~* '(https?://|www\\.|@)';
    v_correta := (v_p ->> 'correta')::integer;
    CONTINUE WHEN v_correta NOT BETWEEN 0 AND jsonb_array_length(v_ops) - 1
               OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(v_ops) AS o
                     WHERE jsonb_typeof(o) <> 'string' OR char_length(btrim(o #>> '{{}}')) NOT BETWEEN 1 AND 160
                  );
    v_validas := v_validas || jsonb_build_array(jsonb_build_object(
      'id', v_n, 'enunciado', btrim(v_p ->> 'enunciado'), 'opcoes', v_ops));
    v_gabarito := v_gabarito || to_jsonb(v_correta);
    v_n := v_n + 1;
  END LOOP;

  IF v_n < 3 THEN
    RAISE EXCEPTION 'diagnostico_poucas_perguntas' USING ERRCODE = '22023';
  END IF;

  UPDATE public.diagnostico_topico
     SET perguntas = v_validas, status = 'pronto', travado_em = NULL, ultimo_erro = NULL
   WHERE id = p_id AND status = 'pendente';
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  INSERT INTO public.diagnostico_topico_gabarito (diagnostico_id, gabarito)
  VALUES (p_id, v_gabarito)
  ON CONFLICT (diagnostico_id) DO UPDATE SET gabarito = EXCLUDED.gabarito;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_diagnostico_registrar(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diagnostico_registrar(uuid, jsonb) TO service_role;

-- Modelo fora, cota estourada ou resposta ruim: espera crescente e, na terceira falha, `sem_ia`. O aluno
-- segue o topico como sempre: o diagnostico e' um extra, nunca uma porta.
CREATE OR REPLACE FUNCTION public.fn_diagnostico_falhou(p_id uuid, p_erro text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  UPDATE public.diagnostico_topico d
     SET ultimo_erro = left(COALESCE(p_erro, ''), 500),
         travado_em = NULL,
         status = CASE WHEN d.tentativas >= {MAX_TENTATIVAS} THEN 'sem_ia' ELSE d.status END,
         finalizado_em = CASE WHEN d.tentativas >= {MAX_TENTATIVAS} THEN now() ELSE d.finalizado_em END,
         proxima_tentativa_em = now() + make_interval(mins => LEAST({ESPERA_MAXIMA_MIN}, power(2, d.tentativas)::integer))
   WHERE d.id = p_id AND d.status = 'pendente';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_diagnostico_falhou(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_diagnostico_falhou(uuid, text) TO service_role;
"""

SEM_TUDO = """
DROP FUNCTION IF EXISTS public.fn_diagnostico_falhou(uuid, text);
DROP FUNCTION IF EXISTS public.fn_diagnostico_registrar(uuid, jsonb);
DROP FUNCTION IF EXISTS public.fn_diagnostico_contexto(uuid);
DROP FUNCTION IF EXISTS public.fn_diagnostico_reivindicar(integer, integer, bigint[]);
DROP FUNCTION IF EXISTS public.diagnostico_dispensar(uuid);
DROP FUNCTION IF EXISTS public.diagnostico_responder(uuid, jsonb);
DROP FUNCTION IF EXISTS public.diagnostico_pedir(bigint);
DROP TABLE IF EXISTS public.diagnostico_topico_gabarito;
DROP TABLE IF EXISTS public.diagnostico_topico;
DELETE FROM public.retencao_politica WHERE tabela = 'diagnostico_topico';
DELETE FROM public.app_config WHERE chave IN
  ('diagnostico_perguntas_max', 'diagnostico_faixa_intermediario_pct', 'diagnostico_faixa_avancado_pct');
"""


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(TABELAS)
    op.execute(DO_ALUNO)
    op.execute(DO_WORKER)


def downgrade() -> None:
    op.execute(SEM_TUDO)
