"""Fase 2: `missoes` e `missao_aluno` viram entidade, com RLS no mesmo commit

Segunda fase de `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`.

Hoje missão é `atividades` com `tipo = 'missao'`, presa a um `topico_id` que o professor
criou. Missão diária não tem tópico de professor, e inventar um tópico sintético por aluno
poluiria a trilha e o denominador de `trailup_recalcular_topico_aluno` — exatamente onde o
CLAUDE.md avisa que "a conta certa nunca sobrevivia" (`20260826_18`).

## O que reusa, de propósito

- **`criterio` reusa o vocabulário de `fn_conquista_metrica_suportada`** (12 métricas). O
  avaliador dessas métricas já existe em `trg_eventos_aluno_after_iud`; a fase 3 o extrai
  para uma função compartilhada. Missão não ganha motor paralelo.
- **`recompensa_tipo` é chave de `eventos_pontuacao`, não número.** Pontos e moedas saem de
  lá, e `eventos_pontuacao_classe` já deixa o professor sobrescrever por turma. Gravar o
  número aqui duplicaria a tabela de recompensa e furaria o override.
- **O molde é `conquistas` / `conquistas_aluno`**, que guardam a mesma forma de coisa.

## Uma correção ao spec, achada ao implementar

O spec dizia que um índice `(classe_id, perfil_alvo, dia)` "impede duas missões do mesmo dia
para a mesma coorte". Isso **contradiz a decisão de 2 a 3 missões por dia**. O índice precisa
de um `slot`, e a chave é `(classe_id, coalesce(perfil_alvo, ''), dia, slot)`:

- `coalesce(perfil_alvo, '')` porque missão diária sem perfil alvo é legítima (vale para a
  turma toda), e num índice único vários NULL não colidem — o `coalesce` torna a colisão
  real em vez de depender de `NULLS NOT DISTINCT`;
- `slot` (1..3) dá idempotência ao gerador da fase 5: rodar o cron duas vezes no mesmo dia
  não duplica, e ainda caber 2 ou 3 missões.

O índice é **parcial** (`WHERE dia IS NOT NULL`), para não restringir missão de professor.
O CLAUDE.md avisa: `ON CONFLICT` sobre índice parcial **exige repetir o predicado**
(`ON CONFLICT (...) WHERE dia IS NOT NULL`). A fase 5 depende disso.

## `missao_aluno.status` NÃO é o enum `status_atividade`

É `text` com CHECK próprio (`pendente | em_andamento | concluida | expirada`). O enum do
banco tem rótulos acentuados de forma irregular — `não iniciado`, `em andamento`,
`concluido` (sem acento no í) — e o CLAUDE.md registra que escrever errado compila e só falha
em produção. Missão não herda essa armadilha: vocabulário próprio, sem acento em nenhum
rótulo.

## Unique que `conquistas_aluno` não tem

`conquistas_aluno` não tem chave única por `(aluno, conquista)` — só a PK por `id` —, e por
isso `fn_evento_classe_apurar` tem de proteger a posse com `NOT EXISTS`. `missao_aluno` nasce
com `UNIQUE (aluno_id, missao_id)`, o que torna a atribuição idempotente por construção e
permite `ON CONFLICT DO NOTHING` em vez de subconsulta.

## Guarda de escrita: GRANT grosso, trigger para a regra que depende da linha

O professor **não pode editar o texto que a IA escreveu** — mesma regra de `intervencoes`.
Mas ali a proteção é GRANT por coluna, que é por tabela e não sabe de que linha se trata;
aqui a regra depende de `origem`. Então a divisão é:

- **CHECKs e RLS** definem quem alcança a linha;
- **`fn_missoes_guarda` (BEFORE UPDATE)** congela o que é imutável sempre (`classe_id`,
  `origem`, `criado_por`, `dia`, `slot`, `perfil_alvo`) e congela **também** o conteúdo
  autoral (`titulo`, `descricao`, `criterio`, `recompensa_tipo`, janela) quando
  `origem <> 'professor'`. É o padrão de `trg_eventos_aluno_valor_do_banco`, que congela o
  que é histórico com `NEW.x := OLD.x`.

A validação de `criterio` e `recompensa_tipo` fica **no trigger, não numa RPC**, porque o
console escreve `missoes` direto (como já escreve `atividades`, `conteudos` e `cards`) e
validação em RPC não cobriria esse caminho. `fn_conquista_metrica_suportada` é `IMMUTABLE`
e caberia num CHECK, mas a casa valida em código de trigger/RPC — e um CHECK que chama
função cria ordem de dependência em dump/restore sem ganho aqui.

## RLS

Tabela nasce com RLS ligada (event trigger `ensure_rls`) e, sem policy, **invisível para o
cliente** — o `supabase-js` devolve lista vazia, não exceção. Por isso policy e tabela no
mesmo commit.

- `missoes`: professor da turma faz tudo; aluno da turma **lê** só o que está `ativa` e com
  aprovação resolvida. Missão `pendente` não aparece para o aluno.
- `missao_aluno`: aluno lê o que é dele, professor lê o dos alunos das turmas dele (predicado
  copiado de `conteudo_aluno_posse_sel`). **Sem policy de escrita, de propósito:** progresso é
  derivado, igual a `tempo_gasto_min` e `percentual_concluido`, e quem escreve é a fase 3 por
  trigger `SECURITY DEFINER`. Registrado aqui para a ausência ser decisão, não esquecimento.

## Migração de `atividades.tipo = 'missao'`

Em produção são **zero linhas** (conferido: `atividades` só tem 1 linha e `tipo` é nulo), mas
outros ambientes podem ter. A cópia preserva o vínculo em `atividade_origem_id`, e as
entregas **não** são movidas: continuam em `atividade_aluno`, e a atividade original continua
existindo. Enquanto as duas coisas coexistirem, quem lista missão tem de ler as duas fontes —
está nos limites do spec.

O `criterio` da missão migrada aponta a atividade de origem
(`{"metrica": "atividade_especifica", "atividade_id": N}`). **`atividade_especifica` não está
nas 12 métricas de `fn_conquista_metrica_suportada`**, e é por isso que a validação do trigger
a aceita explicitamente como exceção nomeada: ela existe só para a missão migrada, e a fase 3
precisa implementá-la no avaliador compartilhado.

Revision ID: 20261021_02
Revises: 20261021_01
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_02"
down_revision = "20261021_01"
branch_labels = None
depends_on = None


PERFIS = ("seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever")


def _lista(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'::text" for v in valores)


SQL = f"""
CREATE TABLE IF NOT EXISTS public.missoes (
  id                   bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  classe_id            bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  origem               text NOT NULL CHECK (origem = ANY (ARRAY['professor'::text, 'ia'::text, 'sistema'::text])),
  escopo               text NOT NULL CHECK (escopo = ANY (ARRAY['aluno'::text, 'turma'::text, 'guilda'::text])),
  titulo               text NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 3 AND 120),
  descricao            text NOT NULL DEFAULT '' CHECK (char_length(descricao) <= 500),
  criterio             jsonb NOT NULL CHECK (jsonb_typeof(criterio) = 'object'),
  recompensa_tipo      text NOT NULL,
  janela_inicio        timestamptz,
  janela_fim           timestamptz,
  dia                  date,
  slot                 smallint CHECK (slot IS NULL OR slot BETWEEN 1 AND 9),
  perfil_alvo          text CHECK (perfil_alvo IS NULL OR perfil_alvo = ANY (ARRAY[{_lista(PERFIS)}])),
  aprovacao            text NOT NULL DEFAULT 'nao_requer'
                         CHECK (aprovacao = ANY (ARRAY['nao_requer'::text, 'pendente'::text, 'aprovada'::text, 'recusada'::text])),
  motivo_recusa        text CHECK (motivo_recusa IS NULL OR char_length(motivo_recusa) <= 500),
  atividade_origem_id  bigint REFERENCES public.atividades(id) ON DELETE SET NULL,
  ativa                boolean NOT NULL DEFAULT true,
  criado_por           uuid,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT missoes_janela
    CHECK (janela_inicio IS NULL OR janela_fim IS NULL OR janela_fim > janela_inicio),
  -- Missao de guilda que a IA ou o sistema propoe nao vale sem o professor decidir.
  CONSTRAINT missoes_guilda_da_ia_exige_aprovacao
    CHECK (aprovacao <> 'nao_requer' OR origem = 'professor' OR escopo <> 'guilda'),
  CONSTRAINT missoes_recusa_tem_motivo
    CHECK (aprovacao <> 'recusada' OR motivo_recusa IS NOT NULL),
  -- Diaria e identificada por dia+slot; um sem o outro nao identifica nada.
  CONSTRAINT missoes_dia_e_slot_juntos
    CHECK ((dia IS NULL) = (slot IS NULL))
);

-- Parcial, para nao restringir missao de professor. `coalesce` porque diaria sem perfil alvo
-- e legitima e varios NULL nao colidem num indice unico.
CREATE UNIQUE INDEX IF NOT EXISTS missoes_diaria_unica
  ON public.missoes (classe_id, coalesce(perfil_alvo, ''), dia, slot)
  WHERE dia IS NOT NULL;

CREATE INDEX IF NOT EXISTS missoes_turma_idx ON public.missoes (classe_id, ativa, escopo);
CREATE INDEX IF NOT EXISTS missoes_pendentes_idx
  ON public.missoes (classe_id) WHERE aprovacao = 'pendente';

CREATE TABLE IF NOT EXISTS public.missao_aluno (
  id           bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  aluno_id     uuid NOT NULL,
  missao_id    bigint NOT NULL REFERENCES public.missoes(id) ON DELETE CASCADE,
  -- NAO e o enum `status_atividade`: vocabulario proprio, sem acento em nenhum rotulo.
  status       text NOT NULL DEFAULT 'pendente'
                 CHECK (status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'concluida'::text, 'expirada'::text])),
  progresso    numeric NOT NULL DEFAULT 0 CHECK (progresso >= 0 AND progresso <= 100),
  concluida_em timestamptz,
  guilda_id    uuid REFERENCES public.guildas(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- `conquistas_aluno` nao tem este unique, e por isso a posse dela precisa de NOT EXISTS.
  CONSTRAINT missao_aluno_unica UNIQUE (aluno_id, missao_id),
  CONSTRAINT missao_aluno_concluida_tem_data
    CHECK (status <> 'concluida' OR concluida_em IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS missao_aluno_do_aluno_idx ON public.missao_aluno (aluno_id, status);

-- ---------------------------------------------------------------------------
-- Guarda de escrita e validacao. Vale para o console (que escreve direto) e
-- para quem escrever por DEFINER.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_missoes_guarda()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
DECLARE
  v_metrica text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Imutaveis sempre: identidade e origem da missao nao mudam por UPDATE.
    NEW.classe_id   := OLD.classe_id;
    NEW.origem      := OLD.origem;
    NEW.criado_por  := OLD.criado_por;
    NEW.dia         := OLD.dia;
    NEW.slot        := OLD.slot;
    NEW.perfil_alvo := OLD.perfil_alvo;
    NEW.criado_em   := OLD.criado_em;

    -- O professor NAO edita o que a IA escreveu. Mesma regra de `intervencoes`, mas aqui
    -- depende da linha (`origem`), e GRANT por coluna nao sabe de linha.
    IF OLD.origem <> 'professor' THEN
      NEW.titulo          := OLD.titulo;
      NEW.descricao       := OLD.descricao;
      NEW.criterio        := OLD.criterio;
      NEW.recompensa_tipo := OLD.recompensa_tipo;
      NEW.janela_inicio   := OLD.janela_inicio;
      NEW.janela_fim      := OLD.janela_fim;
      NEW.escopo          := OLD.escopo;
      NEW.atividade_origem_id := OLD.atividade_origem_id;
    END IF;

    NEW.atualizado_em := now();
  END IF;

  v_metrica := NEW.criterio ->> 'metrica';

  -- `atividade_especifica` e a excecao nomeada da missao migrada de `atividades`: ela nao
  -- esta nas 12 metricas, e a fase 3 precisa implementa-la no avaliador compartilhado.
  IF v_metrica IS NULL THEN
    RAISE EXCEPTION 'A missao precisa de criterio.metrica.' USING ERRCODE = '22023';
  END IF;
  IF v_metrica <> 'atividade_especifica'
     AND NOT public.fn_conquista_metrica_suportada(v_metrica) THEN
    RAISE EXCEPTION 'Metrica nao suportada: %.', v_metrica USING ERRCODE = '22023';
  END IF;
  IF v_metrica = 'atividade_especifica'
     AND NULLIF(btrim(COALESCE(NEW.criterio ->> 'atividade_id', '')), '') IS NULL THEN
    RAISE EXCEPTION 'criterio.atividade_id e obrigatorio em atividade_especifica.' USING ERRCODE = '22023';
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

DROP TRIGGER IF EXISTS trg_missoes_guarda ON public.missoes;
CREATE TRIGGER trg_missoes_guarda
  BEFORE INSERT OR UPDATE ON public.missoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_missoes_guarda();

-- ---------------------------------------------------------------------------
-- RLS: tabela e policy no mesmo commit.
-- ---------------------------------------------------------------------------
ALTER TABLE public.missoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missao_aluno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS missoes_professor_all ON public.missoes;
CREATE POLICY missoes_professor_all ON public.missoes FOR ALL TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()))
  WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()));

-- Missao `pendente` nao existe para o aluno.
DROP POLICY IF EXISTS missoes_aluno_sel ON public.missoes;
CREATE POLICY missoes_aluno_sel ON public.missoes FOR SELECT TO authenticated
  USING (
    ativa
    AND aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])
    AND classe_id IN (SELECT public.app_classes_do_aluno())
  );

-- Predicado copiado de `conteudo_aluno_posse_sel`, para as tres tabelas de progresso
-- responderem igual.
DROP POLICY IF EXISTS missao_aluno_posse_sel ON public.missao_aluno;
CREATE POLICY missao_aluno_posse_sel ON public.missao_aluno FOR SELECT TO authenticated
  USING (
    aluno_id = auth.uid()
    OR aluno_id IN (SELECT public.app_alunos_do_professor())
  );

REVOKE ALL ON public.missoes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missoes TO authenticated;
REVOKE ALL ON public.missao_aluno FROM anon, authenticated;
GRANT SELECT ON public.missao_aluno TO authenticated;

-- ---------------------------------------------------------------------------
-- Os tipos de recompensa que esta fase precisa, valendo ZERO.
--
-- O trigger exige que `recompensa_tipo` exista em `eventos_pontuacao`, e a migracao abaixo
-- usa `missao_concluida` — que o spec coloca na fase 4. Sem estas linhas, a migracao
-- quebraria em qualquer ambiente que tenha `atividades.tipo = 'missao'` (producao tem zero,
-- mas isso nao e garantia).
--
-- Valer zero e seguro e intencional: `fn_pontos_do_evento` devolve 0 para tipo sem linha, e
-- o spec registra que "inserir o tipo antes da linha de pontuacao e seguro: a feature liga
-- sem pontuar". Aqui e o mesmo principio com a linha presente — a fase 4 troca os valores.
-- ---------------------------------------------------------------------------
INSERT INTO public.eventos_pontuacao (tipo, pontos, descricao, moedas) VALUES
  ('missao_concluida',        0, 'Concluiu uma missao. Valor definido na fase 4.', 0),
  ('missao_diaria_concluida', 0, 'Concluiu a missao do dia. Separado para o rank de constancia.', 0)
ON CONFLICT (tipo) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Migracao de `atividades.tipo = 'missao'`. Zero linhas em producao; outros
-- ambientes podem ter. A atividade original NAO e apagada e as entregas ficam
-- em `atividade_aluno`.
-- ---------------------------------------------------------------------------
INSERT INTO public.missoes (
  classe_id, origem, escopo, titulo, descricao, criterio, recompensa_tipo,
  janela_fim, atividade_origem_id, ativa, criado_por, criado_em
)
SELECT t.classe_id,
       'professor',
       'turma',
       left(COALESCE(NULLIF(btrim(a.titulo), ''), 'Missao ' || a.id::text), 120),
       left(COALESCE(a.descricao, ''), 500),
       jsonb_build_object('metrica', 'atividade_especifica', 'atividade_id', a.id),
       'missao_concluida',
       a.data_entrega,
       a.id,
       true,
       c.professor_id,
       COALESCE(a.created_at, now())
  FROM public.atividades a
  JOIN public.topicos t ON t.id = a.topico_id
  JOIN public.classe c ON c.id = t.classe_id
 WHERE a.tipo = 'missao'
   AND NOT EXISTS (SELECT 1 FROM public.missoes m WHERE m.atividade_origem_id = a.id);

NOTIFY pgrst, 'reload schema';
"""


ANTERIOR_SQL = """
DROP TRIGGER IF EXISTS trg_missoes_guarda ON public.missoes;
DROP FUNCTION IF EXISTS public.fn_missoes_guarda();
DROP TABLE IF EXISTS public.missao_aluno;
DROP TABLE IF EXISTS public.missoes;

-- Os dois tipos saem apenas se nenhum evento os usou. Apagar linha de
-- `eventos_pontuacao` que `eventos_aluno` ja referenciou mudaria pontuacao
-- historica em silencio.
DELETE FROM public.eventos_pontuacao ep
 WHERE ep.tipo IN ('missao_concluida', 'missao_diaria_concluida')
   AND NOT EXISTS (SELECT 1 FROM public.eventos_aluno e WHERE e.tipo = ep.tipo);

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(ANTERIOR_SQL)
