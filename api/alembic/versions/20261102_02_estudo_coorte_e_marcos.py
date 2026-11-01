"""Cohort, baseline e marcos de mudança de produto para medir a efetividade (#13)

A #12 deixou os KPIs no banco; a `20261027_01` segmenta a turma por perfil, mas se declara
`comparacao_causal = false`. Faltava o que a metodologia (TCC 09 §4 e §6) pede para comparar:
saber a que cohort cada aluno pertence, quando começou a intervenção e o que mudou no produto no
meio da coleta.

## Medido em produção em 01/11, antes de desenhar

4 turmas (3 de teste), 3 alunos matriculados, telemetria de **um** aluno (QA) nas quatro, uma
única personalização `pronto`, 2 respostas em `questao_aluno`. Não há cohort nem baseline para
reconstruir: o desenho é **prospectivo**, e o registro tem de existir antes de o estudo começar.

## Decisões (aprovadas em 01/11)

- **Cohort = turma com data de corte.** O material-base é compartilhado por `classe × tópico ×
  perfil`, e ranking e guilda comparam colegas: sortear alunos dentro da turma contaminaria a
  comparação. `estudo_coorte` tem uma linha por turma: `baseline_inicio`, `corte`, `fim` e o
  `braco`. A turma de **comparação também tem `corte`** (data de referência), para a
  diferença-em-diferenças; desenho escalonado é outra turma de intervenção com corte mais tarde.
- **Baseline = `[baseline_inicio, corte)` da própria turma**, com no mínimo 7 dias. Registrar é
  prospectivo: `estudo_coorte_registrar` recusa baseline que já começou, e o gatilho trava
  `baseline_inicio`, `braco` e `corte` depois que a data passa. Escolher a janela depois de ver o
  dado é o que isto impede.
- **Entrada do aluno** (`vw_estudo_participantes`, `security_invoker`): a **atribuída** (o maior
  entre corte e matrícula, intenção de tratar) e a **observada** (primeiro tempo ativo no escopo
  `material`, que só o `PersonalizedTopicView` grava). `pareado` = matriculado antes do corte,
  ou seja, tem baseline.
- **Marcos** (`marco_produto`): manuais por turma (RPC do professor dono), globais pelo dev
  (`app_e_dev()`), e automáticos — cada migration aplicada (gatilho em `alembic_version`, a única
  forma de dar data a ela) e cada mudança de protocolo em `estudo_coorte`.
- **Conclusão com data** (`topico_aluno_conclusao`): a primeira vez que o tópico chegou a
  `concluido`, gravada por gatilho em `topico_aluno`. `topico_aluno` é só estado atual, e o
  evento `topic_complete` depende do app e do consentimento de telemetria. Conclusões anteriores a
  esta migration ficam sem linha: não há data confiável para elas.

## O que esta migration NÃO faz

Não segura a personalização durante o baseline nem na turma de comparação. Hoje nenhuma chave faz
isso, e a geração dispara na matrícula e na edição da trilha. A trava é uma PR à parte, pré-requisito
para iniciar o estudo; até ela existir, `metricas_estudo_coortes` (`20261102_03`) acusa o baseline
contaminado em vez de fingir que é limpo.

## RLS (conferida com o papel `authenticated` no e2e)

| tabela | professor dono | aluno | escrita |
|---|---|---|---|
| `estudo_coorte` | lê | nada | só RPC |
| `marco_produto` | lê os da turma e os globais | nada | só RPC e gatilhos |
| `topico_aluno_conclusao` | lê os da turma | lê os próprios | só gatilho |

Retenção (#195): as três em `vida_da_conta`. `registrado_por` aponta para `auth.users` com
`ON DELETE SET NULL`: o protocolo e o marco sobrevivem à conta de quem registrou, o identificador não.

## Cadeia

Vem depois da `20261102_01` (#66), que a PR #770 re-encadeou sobre a `20261101_15` (#136): as duas
nasceram sobre a `20261101_14` e a `main` ficou com duas cabeças.

Revision ID: 20261102_02
Revises: 20261102_01
Create Date: 2026-11-02
"""

from alembic import op

revision = "20261102_02"
down_revision = "20261102_01"
branch_labels = None
depends_on = None


TABELAS = r"""
CREATE TABLE IF NOT EXISTS public.estudo_coorte (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classe_id       bigint NOT NULL UNIQUE REFERENCES public.classe(id) ON DELETE CASCADE,
  estudo          text NOT NULL CHECK (btrim(estudo) <> '' AND length(estudo) <= 80),
  rotulo          text NOT NULL CHECK (btrim(rotulo) <> '' AND length(rotulo) <= 40),
  braco           text NOT NULL CHECK (braco IN ('intervencao', 'comparacao')),
  baseline_inicio date NOT NULL,
  corte           date NOT NULL,
  fim             date,
  timezone        text NOT NULL DEFAULT 'America/Sao_Paulo',
  registrado_por  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  registrado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT estudo_coorte_baseline_de_uma_semana CHECK (corte - baseline_inicio >= 7),
  CONSTRAINT estudo_coorte_fim_depois_do_corte CHECK (fim IS NULL OR fim >= corte)
);
COMMENT ON TABLE public.estudo_coorte IS
  'Cohort do estudo de efetividade (#13): uma turma, seu braco e as janelas. Baseline = [baseline_inicio, corte). Escrita so pelas RPCs.';

CREATE TABLE IF NOT EXISTS public.marco_produto (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocorrido_em    timestamptz NOT NULL DEFAULT now(),
  tipo           text NOT NULL CHECK (tipo IN (
                   'migracao', 'protocolo', 'app', 'api', 'personalizacao', 'conteudo', 'aula', 'outro')),
  descricao      text NOT NULL CHECK (btrim(descricao) <> '' AND length(descricao) <= 500),
  referencia     text CHECK (referencia IS NULL OR length(referencia) <= 200),
  classe_id      bigint REFERENCES public.classe(id) ON DELETE CASCADE,
  origem         text NOT NULL CHECK (origem IN ('automatico', 'manual')),
  registrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  registrado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_marco_produto_ocorrido_em ON public.marco_produto (ocorrido_em);
CREATE INDEX IF NOT EXISTS ix_marco_produto_classe ON public.marco_produto (classe_id) WHERE classe_id IS NOT NULL;
COMMENT ON TABLE public.marco_produto IS
  'Mudancas de produto durante a coleta (TCC 09 7). classe_id NULL = global. Append-only: escrita so por RPC e gatilho.';

CREATE TABLE IF NOT EXISTS public.topico_aluno_conclusao (
  aluno_id     uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  topico_id    bigint NOT NULL REFERENCES public.topicos(id) ON DELETE CASCADE,
  classe_id    bigint NOT NULL,
  concluido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, topico_id)
);
CREATE INDEX IF NOT EXISTS ix_topico_aluno_conclusao_classe
  ON public.topico_aluno_conclusao (classe_id, concluido_em);
COMMENT ON TABLE public.topico_aluno_conclusao IS
  'Primeira vez que o topico chegou a concluido para o aluno (#13). Gravada so pelo gatilho em topico_aluno.';
"""


RETENCAO = r"""
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('estudo_coorte', 'vida_da_conta', 'registrado_por', 'vida_da_conta',
   'protocolo do estudo (registrado_por = professor); sai com a turma pela FK, e quem registrou vira NULL com a conta'),
  ('marco_produto', 'vida_da_conta', 'registrado_por', 'vida_da_conta',
   'marco de produto (registrado_por = professor ou dev); o da turma sai com ela, e quem registrou vira NULL com a conta'),
  ('topico_aluno_conclusao', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'data da primeira conclusao do topico, como topico_aluno; sai com a conta ou com o topico pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""


RLS = r"""
ALTER TABLE public.estudo_coorte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marco_produto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topico_aluno_conclusao ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.estudo_coorte, public.marco_produto, public.topico_aluno_conclusao FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.estudo_coorte, public.marco_produto, public.topico_aluno_conclusao FROM authenticated;
GRANT SELECT ON public.estudo_coorte, public.marco_produto, public.topico_aluno_conclusao TO authenticated;

DROP POLICY IF EXISTS estudo_coorte_professor_sel ON public.estudo_coorte;
CREATE POLICY estudo_coorte_professor_sel ON public.estudo_coorte
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()));

-- Global: quem dá aula em alguma turma, e o dev. Da turma: o professor dono.
DROP POLICY IF EXISTS marco_produto_professor_sel ON public.marco_produto;
CREATE POLICY marco_produto_professor_sel ON public.marco_produto
  FOR SELECT TO authenticated
  USING (
    CASE
      WHEN classe_id IS NULL
        THEN EXISTS (SELECT 1 FROM public.app_classes_do_professor()) OR public.app_e_dev()
      ELSE classe_id IN (SELECT public.app_classes_do_professor())
    END
  );

DROP POLICY IF EXISTS topico_aluno_conclusao_sel ON public.topico_aluno_conclusao;
CREATE POLICY topico_aluno_conclusao_sel ON public.topico_aluno_conclusao
  FOR SELECT TO authenticated
  USING (
    aluno_id = auth.uid()
    OR classe_id IN (SELECT public.app_classes_do_professor())
  );
"""


GATILHOS = r"""
-- Protocolo travado: o que já começou não muda, e toda mudança vira marco.
CREATE OR REPLACE FUNCTION public.fn_estudo_coorte_trava()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_hoje date := (now() AT TIME ZONE OLD.timezone)::date;
BEGIN
  IF OLD.baseline_inicio <= v_hoje THEN
    IF NEW.baseline_inicio IS DISTINCT FROM OLD.baseline_inicio
       OR NEW.braco IS DISTINCT FROM OLD.braco
       OR NEW.timezone IS DISTINCT FROM OLD.timezone
       OR NEW.classe_id IS DISTINCT FROM OLD.classe_id THEN
      RAISE EXCEPTION 'baseline_ja_comecou' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF OLD.corte <= v_hoje AND NEW.corte IS DISTINCT FROM OLD.corte THEN
    RAISE EXCEPTION 'corte_ja_passou' USING ERRCODE = '55000';
  END IF;
  IF OLD.fim IS NOT NULL AND OLD.fim < v_hoje AND NEW.fim IS DISTINCT FROM OLD.fim THEN
    RAISE EXCEPTION 'estudo_ja_encerrado' USING ERRCODE = '55000';
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_estudo_coorte_trava ON public.estudo_coorte;
CREATE TRIGGER trg_estudo_coorte_trava
  BEFORE UPDATE ON public.estudo_coorte
  FOR EACH ROW EXECUTE FUNCTION public.fn_estudo_coorte_trava();

CREATE OR REPLACE FUNCTION public.fn_estudo_coorte_marco()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  r public.estudo_coorte;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  INSERT INTO public.marco_produto (tipo, descricao, referencia, classe_id, origem, registrado_por)
  VALUES (
    'protocolo',
    CASE TG_OP
      WHEN 'INSERT' THEN 'turma entra no estudo'
      WHEN 'UPDATE' THEN 'protocolo da turma alterado'
      ELSE 'turma sai do estudo'
    END,
    r.estudo || ' / ' || r.rotulo || ' / ' || r.braco || ' / baseline ' || r.baseline_inicio
      || ' / corte ' || r.corte || ' / fim ' || COALESCE(r.fim::text, 'aberto'),
    -- Saída da turma: o marco fica global, porque a linha da turma pode estar sumindo junto.
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE r.classe_id END,
    'automatico',
    auth.uid()
  );
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_estudo_coorte_marco() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_estudo_coorte_marco ON public.estudo_coorte;
CREATE TRIGGER trg_estudo_coorte_marco
  AFTER INSERT OR UPDATE OR DELETE ON public.estudo_coorte
  FOR EACH ROW EXECUTE FUNCTION public.fn_estudo_coorte_marco();

-- Cada migration aplicada vira marco. Nunca derruba a migration: falha vira WARNING.
CREATE OR REPLACE FUNCTION public.fn_marco_da_migracao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  BEGIN
    INSERT INTO public.marco_produto (tipo, descricao, referencia, origem)
    VALUES ('migracao', 'banco passa a estar em ' || NEW.version_num, NEW.version_num, 'automatico');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING USING MESSAGE = 'marco da migracao nao gravado: ' || SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_marco_da_migracao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_marco_da_migracao ON public.alembic_version;
CREATE TRIGGER trg_marco_da_migracao
  AFTER INSERT OR UPDATE ON public.alembic_version
  FOR EACH ROW EXECUTE FUNCTION public.fn_marco_da_migracao();

-- Primeira conclusão do tópico, com data. Voltar de concluído e concluir de novo não mexe nela.
CREATE OR REPLACE FUNCTION public.fn_topico_aluno_conclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  INSERT INTO public.topico_aluno_conclusao (aluno_id, topico_id, classe_id)
  SELECT NEW.aluno_id, NEW.topico_id, t.classe_id
    FROM public.topicos t
   WHERE t.id = NEW.topico_id AND t.classe_id IS NOT NULL
  ON CONFLICT (aluno_id, topico_id) DO NOTHING;
  RETURN NULL;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_topico_aluno_conclusao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_topico_aluno_conclusao ON public.topico_aluno;
CREATE TRIGGER trg_topico_aluno_conclusao
  AFTER INSERT OR UPDATE OF status ON public.topico_aluno
  FOR EACH ROW
  WHEN (NEW.status::text = 'concluido')
  EXECUTE FUNCTION public.fn_topico_aluno_conclusao();
"""


RPCS = r"""
CREATE OR REPLACE FUNCTION public.estudo_coorte_registrar(
  p_classe_id bigint,
  p_estudo text,
  p_rotulo text,
  p_braco text,
  p_baseline_inicio date,
  p_corte date,
  p_fim date DEFAULT NULL,
  p_timezone text DEFAULT 'America/Sao_Paulo'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_atual public.estudo_coorte;
  v_id bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao' USING ERRCODE = '42501';
  END IF;
  IF p_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_timezone
  ) THEN
    RAISE EXCEPTION 'timezone_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_atual FROM public.estudo_coorte WHERE classe_id = p_classe_id FOR UPDATE;

  IF v_atual.id IS NULL THEN
    -- Prospectivo: a janela do baseline é escolhida antes de existir dado nela.
    IF p_baseline_inicio < (now() AT TIME ZONE p_timezone)::date THEN
      RAISE EXCEPTION 'baseline_no_passado' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.estudo_coorte
      (classe_id, estudo, rotulo, braco, baseline_inicio, corte, fim, timezone, registrado_por)
    VALUES
      (p_classe_id, btrim(p_estudo), btrim(p_rotulo), p_braco, p_baseline_inicio, p_corte, p_fim,
       p_timezone, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    IF p_baseline_inicio IS DISTINCT FROM v_atual.baseline_inicio
       AND p_baseline_inicio < (now() AT TIME ZONE p_timezone)::date THEN
      RAISE EXCEPTION 'baseline_no_passado' USING ERRCODE = '22023';
    END IF;
    UPDATE public.estudo_coorte
       SET estudo = btrim(p_estudo), rotulo = btrim(p_rotulo), braco = p_braco,
           baseline_inicio = p_baseline_inicio, corte = p_corte, fim = p_fim, timezone = p_timezone
     WHERE id = v_atual.id
       AND (estudo, rotulo, braco, baseline_inicio, corte, fim, timezone)
           IS DISTINCT FROM
           (btrim(p_estudo), btrim(p_rotulo), p_braco, p_baseline_inicio, p_corte, p_fim, p_timezone);
    v_id := v_atual.id;
  END IF;
  RETURN v_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.estudo_coorte_remover(p_classe_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_atual public.estudo_coorte;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_atual FROM public.estudo_coorte WHERE classe_id = p_classe_id FOR UPDATE;
  IF v_atual.id IS NULL THEN
    RETURN false;
  END IF;
  -- Depois que o baseline começou, sair do estudo apagaria dado já coletado da análise.
  IF v_atual.baseline_inicio <= (now() AT TIME ZONE v_atual.timezone)::date THEN
    RAISE EXCEPTION 'baseline_ja_comecou' USING ERRCODE = '55000';
  END IF;
  DELETE FROM public.estudo_coorte WHERE id = v_atual.id;
  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.marco_produto_registrar(
  p_classe_id bigint,
  p_tipo text,
  p_descricao text,
  p_referencia text DEFAULT NULL,
  p_ocorrido_em timestamptz DEFAULT now()
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  IF p_classe_id IS NULL THEN
    IF NOT public.app_e_dev() THEN
      RAISE EXCEPTION 'marco_global_so_dev' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao' USING ERRCODE = '42501';
  END IF;
  -- 'migracao' e 'protocolo' são do banco; marco manual não se passa por eles.
  IF p_tipo NOT IN ('app', 'api', 'personalizacao', 'conteudo', 'aula', 'outro') THEN
    RAISE EXCEPTION 'tipo_de_marco_invalido' USING ERRCODE = '22023';
  END IF;
  IF p_ocorrido_em IS NULL OR p_ocorrido_em > now() THEN
    RAISE EXCEPTION 'marco_no_futuro' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.marco_produto (ocorrido_em, tipo, descricao, referencia, classe_id, origem, registrado_por)
  VALUES (p_ocorrido_em, p_tipo, btrim(p_descricao), NULLIF(btrim(p_referencia), ''), p_classe_id, 'manual', auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.estudo_coorte_registrar(bigint, text, text, text, date, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.estudo_coorte_remover(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.marco_produto_registrar(bigint, text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estudo_coorte_registrar(bigint, text, text, text, date, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estudo_coorte_remover(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marco_produto_registrar(bigint, text, text, text, timestamptz) TO authenticated;
"""


VIEW = r"""
CREATE OR REPLACE VIEW public.vw_estudo_participantes
WITH (security_invoker = on) AS
SELECT
  ec.id AS coorte_id,
  ec.estudo,
  ec.rotulo,
  ec.braco,
  ec.classe_id,
  m.aluno_id,
  m.matriculado_em,
  ec.baseline_inicio,
  ec.corte,
  ec.fim,
  (m.matriculado_em AT TIME ZONE ec.timezone)::date < ec.corte AS pareado,
  CASE WHEN ec.braco = 'intervencao'
       THEN GREATEST(ec.corte, (m.matriculado_em AT TIME ZONE ec.timezone)::date)
  END AS entrada_intervencao,
  exp.primeira_exposicao,
  exp.primeira_exposicao IS NOT NULL
    AND exp.primeira_exposicao < (ec.corte::timestamp AT TIME ZONE ec.timezone) AS exposto_no_baseline,
  CASE
    WHEN hoje.d < ec.baseline_inicio THEN 'pre_estudo'
    WHEN hoje.d < ec.corte THEN 'baseline'
    WHEN ec.fim IS NOT NULL AND hoje.d > ec.fim THEN 'encerrado'
    ELSE ec.braco
  END AS fase_atual
FROM public.estudo_coorte ec
JOIN (
  SELECT ca.classe_id, ca.aluno_id, min(ca.created_at) AS matriculado_em
    FROM public.classe_aluno ca
   WHERE ca.aluno_id IS NOT NULL
   GROUP BY ca.classe_id, ca.aluno_id
) m ON m.classe_id = ec.classe_id
CROSS JOIN LATERAL (SELECT (now() AT TIME ZONE ec.timezone)::date AS d) hoje
LEFT JOIN LATERAL (
  SELECT min(e.captured_at) AS primeira_exposicao
    FROM public.telemetria_time_metric_entries e
   WHERE e.aluno_id = m.aluno_id
     AND e.classe_id = ec.classe_id
     AND e.scope = 'material'
     AND e.active_sec > 0
) exp ON true;

COMMENT ON VIEW public.vw_estudo_participantes IS
  'A que cohort cada aluno pertence e quando entrou (#13): atribuida (corte ou matricula) e observada (1o tempo ativo em material personalizado).';

REVOKE ALL ON public.vw_estudo_participantes FROM PUBLIC, anon;
GRANT SELECT ON public.vw_estudo_participantes TO authenticated;

NOTIFY pgrst, 'reload schema';
"""


DOWNGRADE = r"""
DROP VIEW IF EXISTS public.vw_estudo_participantes;
DROP FUNCTION IF EXISTS public.marco_produto_registrar(bigint, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.estudo_coorte_remover(bigint);
DROP FUNCTION IF EXISTS public.estudo_coorte_registrar(bigint, text, text, text, date, date, date, text);
DROP TRIGGER IF EXISTS trg_topico_aluno_conclusao ON public.topico_aluno;
DROP TRIGGER IF EXISTS trg_marco_da_migracao ON public.alembic_version;
DROP FUNCTION IF EXISTS public.fn_topico_aluno_conclusao();
DROP FUNCTION IF EXISTS public.fn_marco_da_migracao();
DROP TABLE IF EXISTS public.estudo_coorte;
DROP FUNCTION IF EXISTS public.fn_estudo_coorte_marco();
DROP FUNCTION IF EXISTS public.fn_estudo_coorte_trava();
DROP TABLE IF EXISTS public.topico_aluno_conclusao;
DROP TABLE IF EXISTS public.marco_produto;
DELETE FROM public.retencao_politica
 WHERE acao = 'vida_da_conta' AND tabela IN ('estudo_coorte', 'marco_produto', 'topico_aluno_conclusao');

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(RETENCAO)
    op.execute(RLS)
    op.execute(GATILHOS)
    op.execute(RPCS)
    op.execute(VIEW)


def downgrade() -> None:
    op.execute(DOWNGRADE)
