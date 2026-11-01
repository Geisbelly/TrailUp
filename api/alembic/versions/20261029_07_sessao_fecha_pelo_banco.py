"""O banco fecha a sessão de telemetria no lote terminal, e o upsert do app não a reabre

F2 (coletor) do plano de métricas. Faz a invariante I17 passar e faz a API e o caminho direto do app
escreverem a mesma linha de `telemetria_sessoes`, inclusive para os builds antigos que já estão no
campo.

## O que estava errado

Dois escritores gravam a mesma linha, cada um com uma regra própria para `ended_at`:

| Escritor | Quem é | Fecha em | Upsert seguinte com `ended_at` nulo |
| --- | --- | --- | --- |
| API (`TelemetriaRepository.upsert_sessao`) | `postgres`, sem claims | `session_end`, `app_background`, `screen_blur` | mantém o fim (`CASE ... IS NULL`) |
| App, caminho direto (`telemetriaApi.ts`, PostgREST) | `authenticated` | `session_end`, `app_background` (não `screen_blur`) | **reabre**: `ON CONFLICT (id) DO UPDATE SET ended_at = EXCLUDED.ended_at` |

Medido em produção (29/10, só leitura): `telemetria_sessoes` tem `id`, `aluno_id`, `classe_id`,
`topico_inicial_id`, `camera_opt_in`, `started_at`, `ended_at`, `created_at`, `updated_at`; nenhuma
trigger nela; as policies são `_insert_own`, `_update_own` (`aluno_id = auth.uid()`),
`_consentimento_ins/_upd` (RESTRICTIVE, `aluno_minha_finalidade_permitida('telemetria')`),
`_select_own`, `_professor_sel` e `_professor_del`. Em `telemetria_lotes` só há os gatilhos de
retenção (AFTER DELETE/UPDATE, por comando) e, no repo, o BEFORE INSERT de via da `20261029_01`.

O efeito: sessão que termina num `screen_blur` gravado direto fica com `ended_at` nulo para sempre,
e qualquer `interval` que o app grave depois de um fim (volta do segundo plano, lote atrasado na fila)
apaga o fim que já estava lá. A I17 (`20261029_03`) acusa exatamente isso.

## Por que no banco

O app em campo não se atualiza: builds antigos vão continuar mandando `ended_at: null` no upsert por
meses. Corrigir só o app deixaria a linha dependendo de qual build o aluno tem. E a regra de fronteira
do repo diz que isso é encanamento (fechar uma linha a partir de outra, sem modelo de linguagem), então
não é na API. No banco a regra vale para os dois escritores e para qualquer build.

## O que muda

- `fn_telemetria_sessoes_mescla()` (`trg_telemetria_sessoes_mescla`, BEFORE UPDATE, por linha): o
  UPDATE não volta o tempo. `ended_at` só avança (`GREATEST` ignora nulo, então nulo nunca apaga um
  fim), `started_at` só recua (`LEAST`) e `topico_inicial_id`, uma vez gravado, fica. É
  `SECURITY INVOKER`: só mexe em `NEW`, não lê tabela, e a RLS de quem escreve continua decidindo se o
  UPDATE acontece.
- `fn_telemetria_lote_fecha_sessao()` (`trg_telemetria_lotes_fecha_sessao`, AFTER INSERT, por linha):
  lote com motivo terminal (`session_end`, `app_background`, `screen_blur`, os mesmos da API e da I17)
  avança o `ended_at` da sessão para o `captured_at` dele (com o teto de relógio, abaixo). Lote ignorado por `ON CONFLICT DO NOTHING`
  não dispara (não houve INSERT), e é o que se quer: o original já disparou.
- Backfill: a mesma regra sobre os lotes terminais que já existem. Cada sessão com `ended_at` nulo
  recebe o maior `captured_at` dos seus lotes terminais do mesmo aluno, limitado ao teto de relógio
  (abaixo). Sessão que já tem fim não é tocada.

### Por que `SECURITY DEFINER` no fechamento pelo lote

Quem grava o lote é o aluno (`authenticated`). O lote já passou pela RLS para existir
(`telemetria_lotes_consentimento_ins`), e o fechamento é consequência dele, não uma escrita nova do
aluno. Hoje a `telemetria_sessoes_consentimento_upd` usa o mesmo predicado da `_ins` do lote
(`aluno_minha_finalidade_permitida('telemetria')`, `20261024_02`) na mesma requisição, então um `INVOKER`
também fecharia. A `DEFINER` mantém o fechamento independente de mudanças futuras nas policies de UPDATE
e de consentimento da sessão: se uma delas ficar mais estreita que a do lote, a sessão não volta a ficar
aberta com lote terminal gravado, que é a I17 de novo. O `AND aluno_id = NEW.aluno_id` do UPDATE é o
que um `_update_own` (`aluno_id = auth.uid()`) daria a um `INVOKER`, mantido explícito. A função é
`SET search_path = ''`, com tudo qualificado, e sem EXECUTE para cliente. Ela depende de o dono da função
(`postgres`) passar pela RLS de `telemetria_sessoes`, o que vale enquanto a tabela não tiver
`FORCE ROW LEVEL SECURITY`.

### Teto para o relógio do aparelho e a saída documentada

`captured_at` vem do relógio do aparelho, e a mescla é uma catraca de mão única: um único lote com o
relógio no futuro fixaria `ended_at` no futuro para sempre. Por isso o gatilho e o backfill limitam o fim
a `now() + interval '5 minutes'` (folga para deriva normal de relógio e para a latência da fila de envio).
Um fim mais adiantado que isso é recortado, não recusado: o lote entra, a sessão fecha no teto.

Se uma correção de manutenção precisar *recuar* um `ended_at` (o que a mescla impede de propósito), o
caminho é desligar o gatilho dentro da migration de manutenção e religá-lo no fim dela:
`ALTER TABLE public.telemetria_sessoes DISABLE TRIGGER trg_telemetria_sessoes_mescla;` ... UPDATE ...
`ALTER TABLE public.telemetria_sessoes ENABLE TRIGGER trg_telemetria_sessoes_mescla;`.

### Por que `AND aluno_id = NEW.aluno_id`

Como a função é `DEFINER`, nenhuma RLS segura o UPDATE. E a policy de INSERT do lote só confere
`aluno_id = auth.uid()`: um aluno B pode gravar um lote com o próprio `aluno_id` apontando para a
sessão de A (a FK é conferida pelo dono, não pela RLS). Sem o filtro, B fecharia a sessão de A. Com
ele, o lote de B entra e não fecha nada. O backfill usa o mesmo filtro.

## Downgrade

Derruba os dois gatilhos e as duas funções. **Não desfaz o backfill**: o `ended_at` que ele gravou é o
`captured_at` de um lote terminal da própria sessão (no máximo o teto de relógio), ou seja, o dado certo; voltar a nulo recriaria o
erro que a I17 acusa.
"""

from alembic import op

revision = "20261029_07"
down_revision = "20261029_06"
branch_labels = None
depends_on = None

MOTIVOS_TERMINAIS = ("session_end", "app_background", "screen_blur")
_LISTA = "(" + ",".join(f"'{m}'" for m in MOTIVOS_TERMINAIS) + ")"

MESCLA = """
CREATE OR REPLACE FUNCTION public.fn_telemetria_sessoes_mescla()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = ''
AS $function$
BEGIN
  -- GREATEST/LEAST ignoram nulo: o upsert com ended_at nulo nao apaga o fim.
  NEW.ended_at := GREATEST(OLD.ended_at, NEW.ended_at);
  NEW.started_at := LEAST(OLD.started_at, NEW.started_at);
  NEW.topico_inicial_id := COALESCE(OLD.topico_inicial_id, NEW.topico_inicial_id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_telemetria_sessoes_mescla() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_telemetria_sessoes_mescla ON public.telemetria_sessoes;
CREATE TRIGGER trg_telemetria_sessoes_mescla
  BEFORE UPDATE ON public.telemetria_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_telemetria_sessoes_mescla();
"""

FECHA = f"""
CREATE OR REPLACE FUNCTION public.fn_telemetria_lote_fecha_sessao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  IF NEW.flush_reason IN {_LISTA} THEN
    -- aluno_id: a funcao e DEFINER, nenhuma RLS impede o lote de um aluno fechar a sessao de outro.
    -- LEAST(now() + 5 min): captured_at e do relogio do aparelho e a mescla so avanca; sem o teto, um
    -- relogio no futuro fixaria o fim la para sempre.
    UPDATE public.telemetria_sessoes
       SET ended_at = GREATEST(ended_at, LEAST(NEW.captured_at, now() + interval '5 minutes'))
     WHERE id = NEW.sessao_id AND aluno_id = NEW.aluno_id;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_telemetria_lote_fecha_sessao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_telemetria_lotes_fecha_sessao ON public.telemetria_lotes;
CREATE TRIGGER trg_telemetria_lotes_fecha_sessao
  AFTER INSERT ON public.telemetria_lotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_telemetria_lote_fecha_sessao();
"""

BACKFILL = f"""
UPDATE public.telemetria_sessoes s
   SET ended_at = LEAST(t.fim, now() + interval '5 minutes')
  FROM (SELECT l.sessao_id, l.aluno_id, max(l.captured_at) AS fim
          FROM public.telemetria_lotes l
         WHERE l.flush_reason IN {_LISTA}
         GROUP BY l.sessao_id, l.aluno_id) t
 WHERE s.id = t.sessao_id
   AND s.aluno_id = t.aluno_id
   AND s.ended_at IS NULL;
"""

DOWNGRADE = """
DROP TRIGGER IF EXISTS trg_telemetria_lotes_fecha_sessao ON public.telemetria_lotes;
DROP TRIGGER IF EXISTS trg_telemetria_sessoes_mescla ON public.telemetria_sessoes;
DROP FUNCTION IF EXISTS public.fn_telemetria_lote_fecha_sessao();
DROP FUNCTION IF EXISTS public.fn_telemetria_sessoes_mescla();
"""


def upgrade() -> None:
    op.execute(MESCLA)
    op.execute(FECHA)
    op.execute(BACKFILL)


def downgrade() -> None:
    # O backfill fica: o fim gravado é o captured_at de um lote terminal da própria sessão.
    op.execute(DOWNGRADE)
