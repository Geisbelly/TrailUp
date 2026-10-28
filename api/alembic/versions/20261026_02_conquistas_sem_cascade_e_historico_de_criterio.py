"""Conquista da turma sobrevive à turma, e a troca de critério fica registrada (#158)

## A cascata apagava o que o aluno ganhou

A `20261016_01` criou `conquistas.classe_id` com `ON DELETE CASCADE`. `conquistas_aluno`
referencia `conquista_id` também com `CASCADE`, então apagar uma turma levava junto **a posse**
de todo aluno que ganhou uma conquista dela: a medalha sumia da biblioteca e o prêmio já pago
ficava sem origem. Isso contraria a regra de 2026-10-24 (`20261024_07`): o professor que exclui a
conta apaga as turmas dele com tudo o que é **da turma**, mas a conta do aluno, e o que ele
conquistou, fica.

## Agora: `SET NULL` + desativação no mesmo passo

- A FK `conquistas.classe_id → classe` passa a `ON DELETE SET NULL`. O nome da constraint é
  procurado no catálogo (em produção é `conquistas_classe_id_fkey`), não suposto.
- `fn_conquistas_guarda_orfa` (BEFORE UPDATE em `conquistas`): quando `classe_id` deixa de ter
  turma (`OLD.classe_id IS NOT NULL AND NEW.classe_id IS NULL`), a linha vira `ativa = false` e
  ganha `classe_removida_em = now()`. Como o `SET NULL` da FK é um UPDATE na tabela que referencia,
  o gatilho vale para **qualquer** caminho que apague a turma: `trailup_apagar_turma_inteira`,
  a exclusão da conta do professor (`trg_professor_removido_apaga_turmas`) ou um `DELETE` à mão.
  Ficar no lado de `conquistas` (e não num BEFORE DELETE em `classe`) evita marcar a conquista
  como órfã quando outro gatilho cancela o DELETE da turma.
- Sem a desativação, `classe_id IS NULL` faria a conquista órfã virar **global**: o gatilho de
  avaliação (`trg_eventos_aluno_after_iud`, `20261021_04`) aceita `c.classe_id IS NULL` para
  qualquer aluno. Com `ativa = false` ela cai no filtro `c.ativa IS NOT FALSE` e não é avaliada
  para ninguém; quem já ganhou continua com ela (`conquistas_aluno` não é tocada).
- A mesma guarda recusa (`22023`) reativar uma órfã: não há turma a que ela volte, e reativá-la a
  tornaria global.

## Histórico de critério: tabela dedicada `conquistas_criterio_log`

Trocar o critério de uma conquista não revoga quem já ganhou (regra da #158), então a mudança
precisa ficar registrada para explicar por que dois alunos ganharam a mesma conquista com metas
diferentes. Uma linha por troca: conquista, turma, quem trocou (`auth.uid()`; `NULL` quando é o
`service_role` ou uma migration), quando, critério anterior e novo, métrica anterior e nova e o
limiar anterior e novo (o critério sem `metrica`, `aparencia` e `resumo`, porque a chave do
limiar muda com a métrica: `minimo`, `dias_seguidos`, `minutos`, `max_tempo`...).

- Escrita só pelo gatilho `trg_conquistas_criterio_log` (AFTER UPDATE OF criterio, função
  `SECURITY DEFINER`). Trocar só ícone/cor (`criterio.aparencia`) ou o `resumo` **não** gera linha.
- RLS: ligada, com uma policy de SELECT para o professor da turma
  (`app_classes_do_professor()`) e para o dono/admin (`app_e_dono()`). Nenhuma policy de escrita
  e nenhum GRANT de escrita para `anon`/`authenticated`: ninguém grava direto.
- `classe_id` com `ON DELETE CASCADE`: o histórico é da turma e sai com ela (mesma regra de
  2026-10-24). A política de retenção é registrada aqui (`vida_da_conta`).
"""

from __future__ import annotations

from alembic import op

revision = "20261026_02"
down_revision = "20261026_01"
branch_labels = None
depends_on = None


FK_SET_NULL = r"""
ALTER TABLE public.conquistas ADD COLUMN IF NOT EXISTS classe_removida_em timestamptz;
COMMENT ON COLUMN public.conquistas.classe_removida_em IS
  'Quando a turma dona desta conquista foi apagada (classe_id virou NULL pela FK). Conquista orfa: inativa, nao e avaliada e nao pode ser reativada; quem ja ganhou mantem (#158).';

DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'public.conquistas'::regclass
       AND c.contype = 'f'
       AND c.confrelid = 'public.classe'::regclass
       AND a.attname = 'classe_id'
  LOOP
    EXECUTE format('ALTER TABLE public.conquistas DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$do$;

ALTER TABLE public.conquistas
  ADD CONSTRAINT conquistas_classe_id_fkey
  FOREIGN KEY (classe_id) REFERENCES public.classe(id) ON DELETE SET NULL;
"""

GUARDA_ORFA = r"""
CREATE OR REPLACE FUNCTION public.fn_conquistas_guarda_orfa()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A turma foi apagada (SET NULL da FK) ou alguem tirou a turma da conquista:
  -- sem isso ela viraria global, avaliada para todo aluno.
  IF OLD.classe_id IS NOT NULL AND NEW.classe_id IS NULL THEN
    NEW.ativa := false;
    NEW.classe_removida_em := COALESCE(NEW.classe_removida_em, now());
  END IF;

  IF NEW.classe_removida_em IS NOT NULL AND NEW.ativa IS NOT FALSE THEN
    RAISE EXCEPTION 'Conquista % e de uma turma que foi apagada e nao pode ser reativada', NEW.id
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_conquistas_guarda_orfa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conquistas_guarda_orfa ON public.conquistas;
CREATE TRIGGER trg_conquistas_guarda_orfa
  BEFORE UPDATE ON public.conquistas
  FOR EACH ROW EXECUTE FUNCTION public.fn_conquistas_guarda_orfa();
"""

HISTORICO = r"""
CREATE TABLE IF NOT EXISTS public.conquistas_criterio_log (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conquista_id      bigint NOT NULL REFERENCES public.conquistas(id) ON DELETE CASCADE,
  classe_id         bigint REFERENCES public.classe(id) ON DELETE CASCADE,
  alterado_por      uuid,
  alterado_em       timestamptz NOT NULL DEFAULT now(),
  metrica_anterior  text,
  metrica_nova      text,
  limiar_anterior   jsonb NOT NULL DEFAULT '{}'::jsonb,
  limiar_novo       jsonb NOT NULL DEFAULT '{}'::jsonb,
  criterio_anterior jsonb,
  criterio_novo     jsonb
);

COMMENT ON TABLE public.conquistas_criterio_log IS
  'Uma linha por troca de criterio (metrica ou limiar) de uma conquista. Escrita so pelo gatilho trg_conquistas_criterio_log; leitura do professor da turma e do dono (#158).';

CREATE INDEX IF NOT EXISTS ix_conquistas_criterio_log_conquista
  ON public.conquistas_criterio_log (conquista_id, alterado_em DESC);
CREATE INDEX IF NOT EXISTS ix_conquistas_criterio_log_classe
  ON public.conquistas_criterio_log (classe_id) WHERE classe_id IS NOT NULL;

ALTER TABLE public.conquistas_criterio_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conquistas_criterio_log_leitura ON public.conquistas_criterio_log;
CREATE POLICY conquistas_criterio_log_leitura ON public.conquistas_criterio_log
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()) OR public.app_e_dono());

REVOKE ALL ON TABLE public.conquistas_criterio_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.conquistas_criterio_log TO authenticated;
GRANT ALL ON TABLE public.conquistas_criterio_log TO service_role;

-- So o que decide quem ganha: a metrica e o limiar. Aparencia (icone/cor) e resumo, nao.
CREATE OR REPLACE FUNCTION public.fn_conquista_criterio_essencial(p_criterio jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(p_criterio, '{}'::jsonb) - 'aparencia' - 'resumo';
$function$;

CREATE OR REPLACE FUNCTION public.trg_conquistas_criterio_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_antes  jsonb := public.fn_conquista_criterio_essencial(OLD.criterio);
  v_depois jsonb := public.fn_conquista_criterio_essencial(NEW.criterio);
BEGIN
  IF v_antes IS NOT DISTINCT FROM v_depois THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.conquistas_criterio_log (
    conquista_id, classe_id, alterado_por, alterado_em,
    metrica_anterior, metrica_nova, limiar_anterior, limiar_novo,
    criterio_anterior, criterio_novo
  ) VALUES (
    NEW.id, COALESCE(NEW.classe_id, OLD.classe_id), auth.uid(), now(),
    v_antes ->> 'metrica', v_depois ->> 'metrica', v_antes - 'metrica', v_depois - 'metrica',
    OLD.criterio, NEW.criterio
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_conquistas_criterio_log() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conquistas_criterio_log ON public.conquistas;
CREATE TRIGGER trg_conquistas_criterio_log
  AFTER UPDATE OF criterio ON public.conquistas
  FOR EACH ROW
  WHEN (OLD.criterio IS DISTINCT FROM NEW.criterio)
  EXECUTE FUNCTION public.trg_conquistas_criterio_log();

INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('conquistas_criterio_log', 'vida_da_conta', 'alterado_por', 'vida_da_conta',
   'historico de criterio da conquista da turma (alterado_por = professor); sai com a turma pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

DOWNGRADE = r"""
DELETE FROM public.retencao_politica WHERE tabela = 'conquistas_criterio_log';
DROP TRIGGER IF EXISTS trg_conquistas_criterio_log ON public.conquistas;
DROP FUNCTION IF EXISTS public.trg_conquistas_criterio_log();
DROP FUNCTION IF EXISTS public.fn_conquista_criterio_essencial(jsonb);
DROP TABLE IF EXISTS public.conquistas_criterio_log;

DROP TRIGGER IF EXISTS trg_conquistas_guarda_orfa ON public.conquistas;
DROP FUNCTION IF EXISTS public.fn_conquistas_guarda_orfa();

-- Volta a CASCADE. Orfa nao tem turma a que voltar: fica como esta (inativa, classe_id NULL).
ALTER TABLE public.conquistas DROP CONSTRAINT IF EXISTS conquistas_classe_id_fkey;
ALTER TABLE public.conquistas
  ADD CONSTRAINT conquistas_classe_id_fkey
  FOREIGN KEY (classe_id) REFERENCES public.classe(id) ON DELETE CASCADE;
ALTER TABLE public.conquistas DROP COLUMN IF EXISTS classe_removida_em;
"""


def upgrade() -> None:
    op.execute(FK_SET_NULL)
    op.execute(GUARDA_ORFA)
    op.execute(HISTORICO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DOWNGRADE)
    op.execute("NOTIFY pgrst, 'reload schema'")
