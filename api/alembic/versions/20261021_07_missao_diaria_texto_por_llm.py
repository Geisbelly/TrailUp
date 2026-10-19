"""Fase 6: o texto da missão diária é reescrito pela LLM, por coorte, sem tocar no que ela mede

Fase 6 de `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`.

## A ordem é determinístico primeiro, LLM depois

A fase 5b grava a missão às `0 3 * * *` (meia-noite de Brasília) com texto de molde. Esta
fase só **reescreve título e descrição** depois, quando a API roda. O aluno tem missão mesmo
com a API fora do ar, e nunca existe o estado "sem missão hoje" — a API é auto-hospedada e cai;
o banco não.

```
pg_cron 0 3 * * *   fn_missao_diaria_gerar()            missão com texto de molde (5b)
pg_cron 5 3 * * *   fn_missao_diaria_enfileirar_texto()  um job `missao_diaria` por coorte
worker da API       Gemini por coorte                    fn_missao_diaria_reescrever_texto()
```

Dois cron em vez de um comando com dois `SELECT`: o pg_cron roda o comando numa transação só,
e uma falha ao enfileirar desfaria a geração. Separados, o pior caso da fila é "texto de
molde o dia todo", que é exatamente o estado da 5b.

`personalizacao_jobs.kind` não tem CHECK (conferido no spec), então `missao_diaria` entra sem
migração de constraint. O job não tem target: é um por `(turma × perfil × dia)`, e a fila já
reivindica job sem target (é o que `class_theme_sync` faz).

## Por que precisa de uma função, e não de um UPDATE do worker

`fn_missoes_guarda` (20261021_02, com a correção de métrica da 5b) congela `titulo` e `descricao` quando `origem <> 'professor'`,
com `NEW.x := OLD.x` — **sem erro**. Um UPDATE direto do worker afetaria uma linha e não mudaria
nada: a mesma escrita fantasma que o #540 achou em `rank_tipo`. A guarda é a regra certa (o
professor não edita o texto do sistema), então ela fica, e ganha **uma** exceção nomeada:

- só com o sinal de sessão `app.missao_texto_llm = 'on'`, que só
  `fn_missao_diaria_reescrever_texto` liga (`set_config(..., true)`, local à transação, e
  desligado de novo antes de retornar — o mesmo padrão de `app.missao_premiando` em 20261021_04);
- só para `current_user` fora de `authenticated`/`anon` — se o cliente achasse um jeito de
  ligar o sinal, o UPDATE dele continuaria congelado;
- só em missão `origem = 'sistema'` com `dia` (a diária);
- e só libera `titulo`, `descricao` e as três colunas `texto_*`. `criterio`, recompensa e
  janela continuam congelados também nesse caminho: **a LLM nunca muda o que a missão mede**.

A função devolve `boolean` e o worker confere: `false` é "não reescrevi", nunca sucesso
silencioso.

## Uma vez só, e reversível

- `texto_enriquecido_em IS NULL` no `WHERE`: o texto muda **uma** vez por missão. Um segundo
  job (reprocessado, duplicado) não troca o texto debaixo do aluno.
- `texto_molde` guarda o título e a descrição do molde, então voltar ao determinístico é um
  UPDATE (pela mesma função de guarda), sem regerar nada.
- `janela_fim > now()`: missão de dia que já acabou não é reescrita. Se a API passou o dia fora,
  o job de ontem vira no-op em vez de mexer em histórico.

## Custo

`missao_diaria_llm_max_coortes` (padrão 30, privada) é o teto de coortes enfileiradas por dia;
`0` desliga a fase 6 sem deploy. Hoje são 11 coortes em produção, então o teto não corta
nada — ele existe pelo limite que o spec registra ("sete perfis × N turmas por dia; com 50
turmas são 350 chamadas/dia, vale medir antes de ligar para todas").

Revision ID: 20261021_07
Revises: 20261021_06
Create Date: 2026-10-19
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261021_07"
down_revision = "20261021_06"
branch_labels = None
depends_on = None


COLUNAS = """
ALTER TABLE public.missoes
  ADD COLUMN IF NOT EXISTS texto_molde          jsonb,
  ADD COLUMN IF NOT EXISTS texto_enriquecido_em timestamptz,
  ADD COLUMN IF NOT EXISTS texto_modelo         text;

ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_texto_molde_forma;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_texto_molde_forma
  CHECK (texto_molde IS NULL
         OR (jsonb_typeof(texto_molde) = 'object'
             AND texto_molde ? 'titulo' AND texto_molde ? 'descricao'));

-- Reescrita e molde andam juntos: texto da LLM sem o molde guardado nao teria volta.
ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_texto_enriquecido_tem_molde;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_texto_enriquecido_tem_molde
  CHECK ((texto_enriquecido_em IS NULL) = (texto_molde IS NULL));

ALTER TABLE public.missoes DROP CONSTRAINT IF EXISTS missoes_texto_modelo_curto;
ALTER TABLE public.missoes ADD CONSTRAINT missoes_texto_modelo_curto
  CHECK (texto_modelo IS NULL OR char_length(texto_modelo) <= 120);
"""


GUARDA = r"""
CREATE OR REPLACE FUNCTION public.fn_missoes_guarda()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
DECLARE
  v_metrica text;
  v_texto_llm boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Missao nasce com o texto de quem a escreveu; "ja enriquecida" nao e estado de nascimento.
    NEW.texto_molde          := NULL;
    NEW.texto_enriquecido_em := NULL;
    NEW.texto_modelo         := NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Imutaveis sempre: identidade e origem da missao nao mudam por UPDATE.
    NEW.classe_id   := OLD.classe_id;
    NEW.origem      := OLD.origem;
    NEW.criado_por  := OLD.criado_por;
    NEW.dia         := OLD.dia;
    NEW.slot        := OLD.slot;
    NEW.perfil_alvo := OLD.perfil_alvo;
    NEW.criado_em   := OLD.criado_em;

    -- A unica excecao a guarda de texto: a reescrita da fase 6, pelo sinal que so'
    -- `fn_missao_diaria_reescrever_texto` liga, fora dos papeis do cliente, e so' na diaria
    -- do sistema.
    v_texto_llm := COALESCE(current_setting('app.missao_texto_llm', true), '') = 'on'
                   AND current_user NOT IN ('authenticated', 'anon')
                   AND OLD.origem = 'sistema'
                   AND OLD.dia IS NOT NULL;

    -- O professor NAO edita o que a IA escreveu. Mesma regra de `intervencoes`, mas aqui
    -- depende da linha (`origem`), e GRANT por coluna nao sabe de linha.
    IF OLD.origem <> 'professor' THEN
      IF NOT v_texto_llm THEN
        NEW.titulo          := OLD.titulo;
        NEW.descricao       := OLD.descricao;
      END IF;
      -- Tambem no caminho da LLM: ela reescreve o texto, nunca o que a missao mede.
      NEW.criterio        := OLD.criterio;
      NEW.recompensa_tipo := OLD.recompensa_tipo;
      NEW.janela_inicio   := OLD.janela_inicio;
      NEW.janela_fim      := OLD.janela_fim;
      NEW.escopo          := OLD.escopo;
      NEW.atividade_origem_id := OLD.atividade_origem_id;
    END IF;

    IF NOT v_texto_llm THEN
      NEW.texto_molde          := OLD.texto_molde;
      NEW.texto_enriquecido_em := OLD.texto_enriquecido_em;
      NEW.texto_modelo         := OLD.texto_modelo;
    END IF;

    NEW.atualizado_em := now();
  END IF;

  v_metrica := NEW.criterio ->> 'metrica';

  -- `atividade_especifica` e a excecao nomeada da missao migrada de `atividades`: ela nao
  -- esta nas 12 metricas, e a fase 3 precisa implementa-la no avaliador compartilhado.
  IF v_metrica IS NULL THEN
    RAISE EXCEPTION 'A missao precisa de criterio.metrica.' USING ERRCODE = '22023';
  END IF;
  -- Fase 5b: as de DELTA sao de missao, nao de conquista -- por isso ficam fora de
  -- `fn_conquista_metrica_suportada` e entram aqui pelo nome.
  IF v_metrica NOT IN ('atividade_especifica', 'minutos_no_dia', 'eventos_no_dia')
     AND NOT public.fn_conquista_metrica_suportada(v_metrica) THEN
    RAISE EXCEPTION 'Metrica nao suportada: %.', v_metrica USING ERRCODE = '22023';
  END IF;
  IF v_metrica = 'atividade_especifica'
     AND NULLIF(btrim(COALESCE(NEW.criterio ->> 'atividade_id', '')), '') IS NULL THEN
    RAISE EXCEPTION 'criterio.atividade_id e obrigatorio em atividade_especifica.' USING ERRCODE = '22023';
  END IF;

  -- Sem `dia` o avaliador compara com NULL e a missao nunca completa, em silencio.
  IF v_metrica IN ('minutos_no_dia', 'eventos_no_dia')
     AND NULLIF(btrim(COALESCE(NEW.criterio ->> 'dia', '')), '') IS NULL THEN
    RAISE EXCEPTION 'criterio.dia e obrigatorio em %.', v_metrica USING ERRCODE = '22023';
  END IF;

  -- Recompensa e chave de `eventos_pontuacao`, nao numero. Tipo inexistente valeria zero em
  -- silencio (`fn_pontos_do_evento` devolve 0 para desconhecido), e a missao pareceria paga.
  IF NOT EXISTS (SELECT 1 FROM public.eventos_pontuacao ep WHERE ep.tipo = NEW.recompensa_tipo) THEN
    RAISE EXCEPTION 'recompensa_tipo % nao existe em eventos_pontuacao.', NEW.recompensa_tipo
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missoes_guarda() FROM PUBLIC, anon, authenticated;
"""


REESCREVER = r"""
CREATE OR REPLACE FUNCTION public.fn_missao_diaria_reescrever_texto(
  p_missao_id bigint,
  p_titulo    text,
  p_descricao text,
  p_modelo    text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_titulo    text := btrim(COALESCE(p_titulo, ''));
  v_descricao text := btrim(COALESCE(p_descricao, ''));
  v_n         int;
BEGIN
  -- Os limites de `missoes` dariam erro de CHECK; aqui a resposta e' "nao reescrevi", e o
  -- molde fica.
  IF char_length(v_titulo) NOT BETWEEN 3 AND 120 OR char_length(v_descricao) NOT BETWEEN 1 AND 500 THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.missao_texto_llm', 'on', true);
  BEGIN
    UPDATE public.missoes m
       SET titulo               = v_titulo,
           descricao            = v_descricao,
           -- Lado direito do SET le a linha ANTES do UPDATE: e' o molde que fica guardado.
           texto_molde          = jsonb_build_object('titulo', m.titulo, 'descricao', m.descricao),
           texto_enriquecido_em = now(),
           texto_modelo         = left(NULLIF(btrim(COALESCE(p_modelo, '')), ''), 120)
     WHERE m.id = p_missao_id
       AND m.origem = 'sistema'
       AND m.dia IS NOT NULL
       AND m.texto_enriquecido_em IS NULL
       AND (m.janela_fim IS NULL OR m.janela_fim > now());
    GET DIAGNOSTICS v_n = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.missao_texto_llm', '', true);
    RAISE;
  END;
  -- Desliga antes de sair: `set_config(..., true)` vale pela transacao inteira, e o resto
  -- dela nao pode herdar a excecao da guarda.
  PERFORM set_config('app.missao_texto_llm', '', true);

  RETURN v_n = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_diaria_reescrever_texto(bigint, text, text, text)
  FROM PUBLIC, anon, authenticated;
-- O worker da API e' quem chama. Se ele conecta como dono das funcoes isto nao muda nada; se
-- conecta como `service_role`, sem isto a fase 6 falharia em toda coorte com 42501.
GRANT EXECUTE ON FUNCTION public.fn_missao_diaria_reescrever_texto(bigint, text, text, text)
  TO service_role;
"""


ENFILEIRAR = r"""
CREATE OR REPLACE FUNCTION public.fn_missao_diaria_enfileirar_texto(p_dia date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_dia      date := COALESCE(p_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_teto     int := public.fn_app_config_int('missao_diaria_llm_max_coortes', 30);
  v_ja       int;
  v_total    int;
BEGIN
  IF v_teto <= 0 THEN
    RETURN 0;
  END IF;

  -- O teto e' do dia, nao da chamada: rodar de novo nao enfileira mais 30.
  SELECT count(*) INTO v_ja
    FROM public.personalizacao_jobs j
   WHERE j.kind = 'missao_diaria'
     AND j.payload ->> 'dia' = v_dia::text;

  IF v_ja >= v_teto THEN
    RETURN 0;
  END IF;

  INSERT INTO public.personalizacao_jobs (
    id, kind, status, classe_id, trigger_source, payload,
    total_targets, processed_targets, error_count, created_at, updated_at
  )
  SELECT gen_random_uuid(), 'missao_diaria', 'pending', c.classe_id, 'db_cron_missao_diaria',
         jsonb_build_object('reason', 'missao_diaria_texto', 'dia', v_dia::text, 'perfil', c.perfil),
         0, 0, 0, now(), now()
    FROM (
      SELECT DISTINCT m.classe_id, COALESCE(m.perfil_alvo, '') AS perfil
        FROM public.missoes m
       WHERE m.dia = v_dia
         AND m.origem = 'sistema'
         AND m.ativa
         AND m.texto_enriquecido_em IS NULL
    ) c
   WHERE NOT EXISTS (
           SELECT 1 FROM public.personalizacao_jobs j
            WHERE j.kind = 'missao_diaria'
              AND j.classe_id = c.classe_id
              AND j.payload ->> 'dia' = v_dia::text
              AND j.payload ->> 'perfil' = c.perfil)
   ORDER BY c.classe_id, c.perfil
   LIMIT v_teto - v_ja;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_missao_diaria_enfileirar_texto(date) FROM PUBLIC, anon, authenticated;
"""


CONFIG = """
INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('missao_diaria_llm_max_coortes', '30',
   'Teto diario de coortes com o texto da missao diaria reescrito pela LLM. 0 desliga a fase 6.',
   false)
ON CONFLICT (chave) DO NOTHING;
"""


CRON = """
-- Cinco minutos depois da geracao (0 3), em job proprio: falhar ao enfileirar nao pode
-- desfazer a missao do dia.
SELECT cron.unschedule('trailup_missao_diaria_texto')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trailup_missao_diaria_texto');

SELECT cron.schedule('trailup_missao_diaria_texto', '5 3 * * *',
                     $$SELECT public.fn_missao_diaria_enfileirar_texto()$$);
"""


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo} para restaurar o downgrade")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def guarda_anterior() -> str:
    """`fn_missoes_guarda` como a fase 5b (20261021_05) a deixa — uma cópia só, para o downgrade
    e para o teste que confere que nenhuma regra saiu."""
    return _modulo("20261021_05_missao_diaria_deterministica.py").guarda()


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(GUARDA)
    op.execute(REESCREVER)
    op.execute(ENFILEIRAR)
    op.execute(CONFIG)
    op.execute(CRON)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(
        "SELECT cron.unschedule('trailup_missao_diaria_texto') "
        "WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trailup_missao_diaria_texto')"
    )
    op.execute("DROP FUNCTION IF EXISTS public.fn_missao_diaria_enfileirar_texto(date)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_missao_diaria_reescrever_texto(bigint, text, text, text)")
    # A guarda volta ao corpo da fase 5b antes das colunas sairem: o corpo desta fase as cita.
    op.execute(guarda_anterior())
    op.execute(
        "ALTER TABLE public.missoes "
        "DROP CONSTRAINT IF EXISTS missoes_texto_molde_forma, "
        "DROP CONSTRAINT IF EXISTS missoes_texto_enriquecido_tem_molde, "
        "DROP CONSTRAINT IF EXISTS missoes_texto_modelo_curto, "
        "DROP COLUMN IF EXISTS texto_molde, "
        "DROP COLUMN IF EXISTS texto_enriquecido_em, "
        "DROP COLUMN IF EXISTS texto_modelo"
    )
    op.execute("DELETE FROM public.app_config WHERE chave = 'missao_diaria_llm_max_coortes'")
    # Job `missao_diaria` ainda pendente apontaria para uma funcao que deixou de existir; vira
    # `failed` com o motivo, em vez de sumir. Os ja concluidos ficam como historico da fila.
    op.execute(
        "UPDATE public.personalizacao_jobs SET status = 'failed', "
        "last_error = 'fase 6 desfeita (downgrade de 20261021_07)', finished_at = now(), updated_at = now() "
        "WHERE kind = 'missao_diaria' AND status IN ('pending', 'processing', 'partial')"
    )
    op.execute("NOTIFY pgrst, 'reload schema'")
