"""Tentativas de atividade com o relógio do servidor, cronômetro por perfil e bônus de XP no tempo (#136, fase 1)

## Por quê

O app decide sozinho tudo o que envolve tempo: prazo, contagem regressiva e "terminou no tempo". O
relógio é o do aparelho, que é do aluno. A #136 pede o contrário: **prazo expirado é recusado no
servidor, mesmo com relógio adiantado**.

## Decisões (01/11, Geisbelly)

- **O cronômetro é ligado pelo perfil**, com a mesma lista do app (`TIMER_PROFILES` em
  `mobile/src/utils/brainHexCapabilities.ts`): todos menos Seeker e Socializer, os dois a que a matriz
  de Monterrat dá 0,0 para timer. O aluno pode desligar, e a IA também (`aluno_cronometro`, com a
  `origem`).
- **Tempo não mexe na nota, só no XP.** Terminar a tentativa cronometrada dentro do tempo paga um
  bônus por faixa de acerto (10/20/30 para 70–79%, 80–89%, 90–100%, como no estudo UCT), uma vez por
  atividade, pela melhor faixa. São três tipos de evento de 10 pontos cada, cumulativos, ajustáveis em
  `eventos_pontuacao`. O app não consegue gravá-los: só a RPC.
- **Vale a última tentativa** para a nota.
- **A pontuação continua sendo calculada pelo app**, com as regras de correção dele. O gabarito
  continua no aparelho por enquanto, e corrigir no servidor sem tirá-lo de lá não protege nada. A RPC
  limita os valores (acerto entre 0 e 100, pontos entre 0 e o máximo da atividade) e grava.

## O que entra

- `atividades.tentativas_max`: NULL é ilimitado. O professor configura na fase 3.
- `aluno_cronometro`: a escolha do aluno ou da IA, que vence o padrão do perfil.
- `atividade_tentativas`: uma linha por tentativa, com início, entrega, `no_tempo` e o que foi gravado,
  tudo pelo relógio do banco.
- `atividade_iniciar_tentativa(atividade)`:
  - confere sessão, matrícula, prazo efetivo (`fn_prazo_efetivo`) e tentativas restantes;
  - se já há uma tentativa aberta, devolve a mesma, para reabrir o app não zerar o relógio.
- `atividade_responder_tentativa(tentativa, acertos, pontos, metadata)`:
  - recusa prazo vencido e tentativa já respondida;
  - grava a tentativa e `atividade_aluno` (última tentativa vale);
  - paga o bônus quando é o caso;
  - devolve o retorno da tentativa.
- `aluno_definir_cronometro(ligado)`: o interruptor do aluno.

**A duração** é `app_config.cronometro_atividade_padrao_seg` (120 s, o mesmo padrão do app), mais
`cronometro_tolerancia_seg` (5 s) de rede. O `activity_timer` da IA calcularia por atividade em
`conteudo_personalizado.ai_patch`, mas esse campo não é gravado em produção desde abril (todos os
registros estão NULL em 01/11). Quando voltar, o limite deve vir dele.

**Nada muda para o app atual.** Ele continua gravando direto em `atividade_aluno` até a fase 2. A
guarda que impede isso é a fase 5, depois que o build novo estiver com os alunos.

Tabelas com dado de pessoa: `retencao_politica` como `vida_da_conta`, igual a `atividade_aluno`. RLS
ligada, só leitura (aluno o seu, professor o da turma). Escrita só pelas RPCs `SECURITY DEFINER`, que
conferem `auth.uid()` antes de qualquer coisa.

Revision ID: 20261101_13
Revises: 20261101_12
Create Date: 2026-11-01
"""

from alembic import op

revision = "20261101_13"
down_revision = "20261101_12"
branch_labels = None
depends_on = None

# Perfis com cronômetro ligado por padrão: o `TIMER_PROFILES` do app.
PERFIS_COM_CRONOMETRO = ("survivor", "mastermind", "achiever", "conqueror", "daredevil")
FAIXAS = ((70, 10), (80, 10), (90, 10))  # (acerto mínimo, pontos): cumulativo dá 10/20/30

ESTRUTURA = r"""
ALTER TABLE public.atividades
  ADD COLUMN IF NOT EXISTS tentativas_max integer CHECK (tentativas_max IS NULL OR tentativas_max > 0);
COMMENT ON COLUMN public.atividades.tentativas_max IS
  'Tentativas permitidas por aluno; NULL = ilimitadas (#136). Conferido por atividade_iniciar_tentativa.';

CREATE TABLE IF NOT EXISTS public.aluno_cronometro (
  aluno_id      uuid PRIMARY KEY REFERENCES public.alunos(id) ON DELETE CASCADE,
  ligado        boolean NOT NULL,
  origem        text NOT NULL CHECK (origem IN ('aluno', 'ia')),
  motivo        text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.aluno_cronometro IS
  'Escolha do aluno ou da IA sobre o cronometro das atividades; sem linha vale o perfil (#136).';

CREATE TABLE IF NOT EXISTS public.atividade_tentativas (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aluno_id           uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  atividade_id       bigint NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  classe_id          bigint NOT NULL,
  numero             integer NOT NULL CHECK (numero > 0),
  iniciada_em        timestamptz NOT NULL DEFAULT now(),
  respondida_em      timestamptz,
  cronometrada       boolean NOT NULL,
  limite_seg         integer CHECK (limite_seg IS NULL OR limite_seg > 0),
  no_tempo           boolean,
  acertos_percentual numeric CHECK (acertos_percentual IS NULL OR acertos_percentual BETWEEN 0 AND 100),
  pontuacao_obtida   numeric CHECK (pontuacao_obtida IS NULL OR pontuacao_obtida >= 0),
  pontuacao_maxima   numeric,
  UNIQUE (aluno_id, atividade_id, numero)
);
CREATE INDEX IF NOT EXISTS ix_atividade_tentativas_classe ON public.atividade_tentativas (classe_id);
COMMENT ON TABLE public.atividade_tentativas IS
  'Cada tentativa de atividade, com inicio e entrega pelo relogio do banco (#136). Escrita so pelas RPCs.';
"""

RLS = r"""
ALTER TABLE public.aluno_cronometro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividade_tentativas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.aluno_cronometro, public.atividade_tentativas FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.aluno_cronometro, public.atividade_tentativas FROM authenticated;
GRANT SELECT ON public.aluno_cronometro, public.atividade_tentativas TO authenticated;

DROP POLICY IF EXISTS aluno_cronometro_sel ON public.aluno_cronometro;
CREATE POLICY aluno_cronometro_sel ON public.aluno_cronometro
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid() OR aluno_id IN (SELECT public.app_alunos_do_professor()));

DROP POLICY IF EXISTS atividade_tentativas_sel ON public.atividade_tentativas;
CREATE POLICY atividade_tentativas_sel ON public.atividade_tentativas
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor()));
"""

RETENCAO = r"""
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('aluno_cronometro', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'escolha do aluno ou da IA sobre o cronometro; sai com a conta pela FK'),
  ('atividade_tentativas', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'tentativas de atividade, como atividade_aluno; sai com a conta ou com a atividade pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

CONFIG = r"""
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('cronometro_atividade_padrao_seg', '120',
   'Duracao da tentativa cronometrada, em segundos (o mesmo padrao do app). #136.', false),
  ('cronometro_tolerancia_seg', '5',
   'Folga de rede somada ao limite antes de a tentativa sair do tempo. #136.', false)
ON CONFLICT (chave) DO NOTHING;
"""

PONTOS = (
    "INSERT INTO public.eventos_pontuacao (tipo, pontos, descricao) VALUES\n"
    + ",\n".join(
        f"  ('atividade_no_tempo_{minimo}', {pontos}, "
        f"'Atividade cronometrada dentro do tempo com {minimo}% ou mais de acerto (cumulativo, #136)')"
        for minimo, pontos in FAIXAS
    )
    + "\nON CONFLICT (tipo) DO NOTHING;\n"
)

TRAVA = r"""
-- O bonus de tempo so sai pela RPC: o app consegue inserir qualquer tipo em eventos_aluno.
CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_bonus_tempo_so_do_servidor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.tipo LIKE 'atividade\_no\_tempo\_%' AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'eventos_aluno: o bonus de tempo e do servidor'
      USING ERRCODE = '42501', HINT = 'Use atividade_responder_tentativa.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_eventos_aluno_bonus_tempo ON public.eventos_aluno;
CREATE TRIGGER trg_eventos_aluno_bonus_tempo
  BEFORE INSERT OR UPDATE ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_eventos_aluno_bonus_tempo_so_do_servidor();

-- Uma vez por atividade e faixa, mesmo com duas respostas simultaneas.
CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_bonus_tempo_unico
  ON public.eventos_aluno (aluno_id, tipo, referencia)
  WHERE tipo LIKE 'atividade\_no\_tempo\_%';
"""

FUNCOES = (
    r"""
CREATE OR REPLACE FUNCTION public.fn_cronometro_ligado(p_aluno uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    (SELECT ac.ligado FROM public.aluno_cronometro ac WHERE ac.aluno_id = p_aluno),
    -- Perfil dominante: maior afinidade, desempate pelo nome (a regra de listar_alunos_classe_com_perfil_dominante).
    -- Sem perfil, o app trata como seeker: desligado.
    (SELECT lower(p.nome) IN ("""
    + ", ".join(f"'{p}'" for p in PERFIS_COM_CRONOMETRO)
    + r""")
       FROM public.aluno_perfil ap
       JOIN public.perfil p ON p.id = ap.perfil_id
      WHERE ap.aluno_id = p_aluno
      ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC
      LIMIT 1),
    false
  );
$function$;
REVOKE ALL ON FUNCTION public.fn_cronometro_ligado(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_cronometro_config(p_chave text, p_padrao integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((SELECT NULLIF(c.valor, '')::integer FROM public.app_config c WHERE c.chave = p_chave), p_padrao);
$function$;
REVOKE ALL ON FUNCTION public.fn_cronometro_config(text, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.aluno_definir_cronometro(p_ligado boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno uuid := auth.uid();
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF p_ligado IS NULL THEN
    RAISE EXCEPTION 'Informe se o cronometro fica ligado.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.aluno_cronometro (aluno_id, ligado, origem, motivo, atualizado_em)
  VALUES (v_aluno, p_ligado, 'aluno', NULL, now())
  ON CONFLICT (aluno_id) DO UPDATE
    SET ligado = EXCLUDED.ligado, origem = 'aluno', motivo = NULL, atualizado_em = now();
  RETURN p_ligado;
END;
$function$;
REVOKE ALL ON FUNCTION public.aluno_definir_cronometro(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aluno_definir_cronometro(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.atividade_iniciar_tentativa(p_atividade bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno uuid := auth.uid();
  v_classe bigint;
  v_max integer;
  v_prazo timestamptz;
  v_aberta public.atividade_tentativas%ROWTYPE;
  v_feitas integer;
  v_total integer;
  v_cronometrada boolean;
  v_limite integer;
  v_tent public.atividade_tentativas%ROWTYPE;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;

  SELECT t.classe_id, a.tentativas_max INTO v_classe, v_max
    FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id
   WHERE a.id = p_atividade;
  IF v_classe IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.classe_aluno ca WHERE ca.classe_id = v_classe AND ca.aluno_id = v_aluno) THEN
    RAISE EXCEPTION 'sem_matricula' USING ERRCODE = '42501';
  END IF;

  v_prazo := public.fn_prazo_efetivo(v_aluno, p_atividade);
  IF v_prazo IS NOT NULL AND v_prazo < now() THEN
    RAISE EXCEPTION 'prazo_expirado' USING ERRCODE = 'P0001', HINT = v_prazo::text;
  END IF;

  -- Tentativa aberta continua a mesma: reabrir o app não zera o relógio.
  SELECT * INTO v_aberta FROM public.atividade_tentativas
   WHERE aluno_id = v_aluno AND atividade_id = p_atividade AND respondida_em IS NULL
   ORDER BY numero DESC LIMIT 1;

  SELECT count(*) FILTER (WHERE respondida_em IS NOT NULL), count(*)
    INTO v_feitas, v_total
    FROM public.atividade_tentativas WHERE aluno_id = v_aluno AND atividade_id = p_atividade;

  IF v_aberta.id IS NOT NULL THEN
    v_tent := v_aberta;
  ELSE
    IF v_max IS NOT NULL AND v_feitas >= v_max THEN
      RAISE EXCEPTION 'sem_tentativas' USING ERRCODE = 'P0001', HINT = v_max::text;
    END IF;
    v_cronometrada := public.fn_cronometro_ligado(v_aluno);
    IF v_cronometrada THEN
      v_limite := public.fn_cronometro_config('cronometro_atividade_padrao_seg', 120);
    END IF;
    INSERT INTO public.atividade_tentativas (aluno_id, atividade_id, classe_id, numero, cronometrada, limite_seg)
    VALUES (v_aluno, p_atividade, v_classe, v_total + 1, v_cronometrada, v_limite)
    RETURNING * INTO v_tent;
  END IF;

  RETURN jsonb_build_object(
    'tentativa_id', v_tent.id,
    'numero', v_tent.numero,
    'cronometrada', v_tent.cronometrada,
    'limite_seg', v_tent.limite_seg,
    'iniciada_em', v_tent.iniciada_em,
    'agora', now(),
    'prazo', v_prazo,
    'restantes', CASE WHEN v_max IS NULL THEN NULL ELSE greatest(0, v_max - v_feitas - 1) END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.atividade_iniciar_tentativa(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atividade_iniciar_tentativa(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.atividade_responder_tentativa(
  p_tentativa bigint,
  p_acertos_percentual numeric,
  p_pontuacao_obtida numeric,
  p_avaliacao_metadata jsonb DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno uuid := auth.uid();
  v_tent public.atividade_tentativas%ROWTYPE;
  v_prazo timestamptz;
  v_maxima numeric;
  v_max_tent integer;
  v_acertos numeric;
  v_pontos numeric;
  v_no_tempo boolean;
  v_tolerancia integer;
  v_meta jsonb;
  v_bonus numeric := 0;
  v_faixa record;
  v_valor numeric;
  v_feitas integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tent FROM public.atividade_tentativas WHERE id = p_tentativa FOR UPDATE;
  IF v_tent.id IS NULL OR v_tent.aluno_id <> v_aluno THEN
    RAISE EXCEPTION 'tentativa_nao_encontrada' USING ERRCODE = '42501';
  END IF;
  IF v_tent.respondida_em IS NOT NULL THEN
    RAISE EXCEPTION 'tentativa_ja_respondida' USING ERRCODE = 'P0001';
  END IF;

  v_prazo := public.fn_prazo_efetivo(v_aluno, v_tent.atividade_id);
  IF v_prazo IS NOT NULL AND v_prazo < now() THEN
    RAISE EXCEPTION 'prazo_expirado' USING ERRCODE = 'P0001', HINT = v_prazo::text;
  END IF;

  SELECT a.pontuacao_maxima, a.tentativas_max INTO v_maxima, v_max_tent
    FROM public.atividades a WHERE a.id = v_tent.atividade_id;
  v_maxima := COALESCE(NULLIF(v_maxima, 0),
                       (SELECT NULLIF(aa.pontuacao_maxima, 0) FROM public.atividade_aluno aa
                         WHERE aa.aluno_id = v_aluno AND aa.atividade_id = v_tent.atividade_id));
  -- A pontuação é do app (com as regras de correção dele); aqui só não passa dos limites.
  v_acertos := greatest(0, least(100, COALESCE(p_acertos_percentual, 0)));
  v_pontos := CASE WHEN p_pontuacao_obtida IS NULL THEN NULL
                   ELSE greatest(0, least(COALESCE(v_maxima, p_pontuacao_obtida), p_pontuacao_obtida)) END;

  v_tolerancia := public.fn_cronometro_config('cronometro_tolerancia_seg', 5);
  v_no_tempo := v_tent.cronometrada
                AND now() <= v_tent.iniciada_em + make_interval(secs => v_tent.limite_seg + v_tolerancia);

  UPDATE public.atividade_tentativas
     SET respondida_em = now(), no_tempo = v_no_tempo, acertos_percentual = v_acertos,
         pontuacao_obtida = v_pontos, pontuacao_maxima = v_maxima
   WHERE id = v_tent.id;

  -- `professor` em avaliacao_metadata é de avaliar_entrega; o app não escreve essa chave.
  v_meta := COALESCE(p_avaliacao_metadata, '{}'::jsonb) - 'professor' - 'tentativa';
  v_meta := v_meta || jsonb_build_object('tentativa', jsonb_build_object(
    'id', v_tent.id, 'numero', v_tent.numero, 'cronometrada', v_tent.cronometrada, 'no_tempo', v_no_tempo));

  -- Vale a última tentativa (decisão de 01/11).
  INSERT INTO public.atividade_aluno AS aa
    (aluno_id, atividade_id, status, percentual_concluido, acertos_percentual, pontuacao_obtida,
     pontuacao_maxima, avaliacao_metadata, ultima_visualizacao, updated_at)
  VALUES
    (v_aluno, v_tent.atividade_id, 'concluido', 100, v_acertos, v_pontos, v_maxima, v_meta, now(), now())
  ON CONFLICT (aluno_id, atividade_id) DO UPDATE
    SET status = 'concluido', percentual_concluido = 100, acertos_percentual = EXCLUDED.acertos_percentual,
        pontuacao_obtida = EXCLUDED.pontuacao_obtida, pontuacao_maxima = EXCLUDED.pontuacao_maxima,
        avaliacao_metadata = (COALESCE(aa.avaliacao_metadata, '{}'::jsonb) - 'tentativa')
                             || (EXCLUDED.avaliacao_metadata - 'professor'),
        ultima_visualizacao = now(), updated_at = now();

  -- Tempo vale XP, não nota: cada faixa atingida paga uma vez por atividade.
  IF v_no_tempo THEN
    FOR v_faixa IN
      SELECT x.minimo, 'atividade_no_tempo_' || x.minimo AS tipo
        FROM (VALUES """
    + ", ".join(f"({minimo})" for minimo, _ in FAIXAS)
    + r""") AS x(minimo)
       WHERE v_acertos >= x.minimo
    LOOP
      INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, criado_em)
      VALUES (v_aluno, v_faixa.tipo, 'atividade:' || v_tent.atividade_id, now() AT TIME ZONE 'UTC')
      ON CONFLICT (aluno_id, tipo, referencia) WHERE tipo LIKE 'atividade\_no\_tempo\_%' DO NOTHING
      RETURNING valor INTO v_valor;
      v_bonus := v_bonus + COALESCE(v_valor, 0);
      v_valor := NULL;
    END LOOP;
  END IF;

  SELECT count(*) INTO v_feitas FROM public.atividade_tentativas
   WHERE aluno_id = v_aluno AND atividade_id = v_tent.atividade_id AND respondida_em IS NOT NULL;

  RETURN jsonb_build_object(
    'tentativa_id', v_tent.id,
    'numero', v_tent.numero,
    'cronometrada', v_tent.cronometrada,
    'no_tempo', v_no_tempo,
    'acertos_percentual', v_acertos,
    'pontuacao_obtida', v_pontos,
    'pontuacao_maxima', v_maxima,
    'xp_bonus', v_bonus,
    'restantes', CASE WHEN v_max_tent IS NULL THEN NULL ELSE greatest(0, v_max_tent - v_feitas) END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.atividade_responder_tentativa(bigint, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atividade_responder_tentativa(bigint, numeric, numeric, jsonb) TO authenticated;
"""
)


def upgrade() -> None:
    op.execute(ESTRUTURA)
    op.execute(RLS)
    op.execute(RETENCAO)
    op.execute(CONFIG)
    op.execute(PONTOS)
    op.execute(TRAVA)
    op.execute(FUNCOES)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.atividade_responder_tentativa(bigint, numeric, numeric, jsonb)")
    op.execute("DROP FUNCTION IF EXISTS public.atividade_iniciar_tentativa(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.aluno_definir_cronometro(boolean)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_cronometro_config(text, integer)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_cronometro_ligado(uuid)")
    op.execute("DROP TRIGGER IF EXISTS trg_eventos_aluno_bonus_tempo ON public.eventos_aluno")
    op.execute("DROP FUNCTION IF EXISTS public.fn_eventos_aluno_bonus_tempo_so_do_servidor()")
    op.execute("DROP INDEX IF EXISTS public.eventos_aluno_bonus_tempo_unico")
    # Os eventos de bônus já pagos ficam: são histórico do rank. A pontuação deles também.
    op.execute("DELETE FROM public.app_config WHERE chave IN ('cronometro_atividade_padrao_seg', 'cronometro_tolerancia_seg')")
    op.execute("DELETE FROM public.retencao_politica WHERE tabela IN ('aluno_cronometro', 'atividade_tentativas')")
    op.execute("DROP TABLE IF EXISTS public.atividade_tentativas")
    op.execute("DROP TABLE IF EXISTS public.aluno_cronometro")
    op.execute("ALTER TABLE public.atividades DROP COLUMN IF EXISTS tentativas_max")
    op.execute("NOTIFY pgrst, 'reload schema'")
