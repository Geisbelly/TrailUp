"""O professor aprova o material personalizado antes de o aluno ver

## Por quê

Pedido da autora: "O professor precisa aprovar claramente os conteúdos personalizados para
eles ficarem disponíveis para o aluno (SEMPRE PRECISA DE CONFIRMAÇÃO)". Até aqui o que a IA
gerava ia direto para o aluno: a RLS de `conteudo_personalizado` só olhava turma e dono.

## O que entra

**Estado de aprovação por registro de `conteudo_personalizado`**, cinco colunas:

- `aprovacao` (`pendente` | `aprovado` | `recusado`), nasce `pendente`;
- `aprovacao_por` e `aprovacao_em`: quem decidiu e quando (aprovar **ou** recusar);
- `aprovacao_motivo`: o porquê da recusa, opcional;
- `conteudo_versao`: sobe a cada mudança do material. O console manda a versão que o professor
  viu, e a RPC recusa a decisão se o material mudou desde então (aprovar o que não viu não é
  aprovar "claramente").

**Gatilho `trg_conteudo_personalizado_aprovacao`** (BEFORE INSERT OR UPDATE, todos os papéis):

- INSERT nasce `pendente`, sempre. Inclusive o material reaproveitado de outra turma
  (`vinculado_de_id`): é outro professor, outra decisão.
- UPDATE que muda o material volta para `pendente` e sobe a versão. "Mudar" é `materiais`,
  `plano` ou `source_hash` diferentes, **ignorando as chaves de controle** que começam com `_`
  (`_geracao_falhas` é contador de falha do worker; contar como mudança derrubaria a aprovação
  a cada retentativa sem material novo), ou o registro entrar em `processando_midias`.
  `ai_patch` fica de fora de propósito: é a adequação leve por aluno (estado mental), não o
  material.
- Só o **professor dono da turma**, identificado pelo JWT (`auth.uid()`), muda o estado. A API e
  o worker escrevem como `postgres`, sem JWT: o gatilho mantém o estado antigo em silêncio, então
  nenhum caminho de geração aprova sozinho, e os upserts que reenviam a linha inteira não quebram.
  Quem decide é carimbado pelo gatilho, não pelo cliente.
- Material em `processando_midias` não pode ser aprovado (ainda não existe por inteiro).

**RPC `personalizacao_decidir(p_itens, p_decisao, p_motivo)`**: aprova, recusa ou devolve para
pendente uma lista de registros (`[{"id": 1, "versao": 3}, ...]`). É o caminho do console, em
lote por tópico × perfil ou pela turma inteira. Confere a posse **antes** de ler (`NOT EXISTS`
sobre `app_classes_do_professor()`), trava as linhas e confere a versão; ou decide tudo, ou nada.
Supabase direto, sem a API: decidir não tem modelo de linguagem no meio (regra de fronteira).

**RLS — policies RESTRICTIVE, não reescrita das permissivas.** O aluno continua alcançando o
registro pelas policies de sempre (`aluno_classe_conteudo_personalizado_sel` e a legada
`Aluno read own conteudo_personalizado`), e a nova `conteudo_personalizado_aprovado_sel` exige,
por cima de todas, `aprovacao = 'aprovado'` — a não ser para o professor dono, que precisa ver o
pendente para decidir. Restritiva compõe com a `estudo_trava_sel` e com qualquer regra que outra
frente acrescente (ex.: visibilidade do tópico) sem que uma apague a outra.

**`cards_personalizados` herda a aprovação do registro**, sem coluna própria: a policy restritiva
`cards_personalizados_aprovado_sel` pede um `conteudo_personalizado` aprovado do mesmo
(turma, tópico, conteúdo, perfil do card), pelo helper `app_personalizacao_aprovada`, que é
`SECURITY INVOKER`: lê com a RLS de quem pergunta. Os cards são gerados junto com o registro e o app só os
mostra pendurados num registro; uma segunda aprovação para a mesma coisa seria um clique a mais
sem decisão nova. `atividades_personalizadas` e `questoes_personalizadas` não existem em produção
(medido em 10/11/2026), então não entram.

**Progresso conta só o aprovado.** `trailup_progresso_percurso` (schema não versionado até aqui;
corpo copiado de produção em 10/11/2026) passa a exigir `cp.aprovacao = 'aprovado'`. Ela roda
dentro de `trailup_recalcular_topico_aluno`, que o gatilho chama com o papel de quem escreve: pelo
aluno, a RLS já esconderia o pendente; pela API (`postgres`), não. Sem o filtro, material que o
aluno nem vê viraria o denominador do tópico (decisão 5 do CLAUDE.md). Enquanto nada estiver
aprovado, o percurso volta a ser o material do professor, como quando a personalização não existe.

**O aviso "Material novo para você" sai na aprovação, não na geração.** O gatilho
`trg_conteudo_personalizado_novo_material` passa a disparar também em `UPDATE OF aprovacao` e só
com o registro aprovado; dentro da função, "algo pronto para o perfil" passa a ser "algo pronto
**e aprovado**". Avisar de material que o aluno não consegue abrir seria mentira.

## Material que já existia

`LEGADO_APROVADO` decide: os registros anteriores a esta migração nascem aprovados (com
`aprovacao_em` = agora e `aprovacao_por` nulo, que é a marca de "aprovado pela migração") ou
pendentes. Decisão da autora em 10/11/2026: **aprovados** — nada sai do ar para os alunos; daqui
em diante, todo material novo ou regerado espera a aprovação. (Medido em 10/11: 18 registros, 4
prontos e 14 com falha, e 46 cards.)

## Downgrade

Volta o aviso e o percurso como estavam, derruba RPC, gatilho, helper e policies, e as colunas
(as decisões tomadas se perdem; o material não).

Revision ID: 20261110_09
Revises: 20261110_08
Create Date: 2026-11-10
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261110_09"
down_revision = "20261110_08"
branch_labels = None
depends_on = None

# Registros que já existiam antes desta migração: aprovados (True) ou pendentes (False).
LEGADO_APROVADO = True

# Teto de itens por chamada da RPC (uma turma grande cabe; um laço descontrolado, não).
ITENS_MAXIMO = 2000
MOTIVO_MAXIMO = 500

ESTADOS = ("pendente", "aprovado", "recusado")


def colunas() -> str:
    legado = "aprovado" if LEGADO_APROVADO else "pendente"
    aprovado_em = (
        "UPDATE public.conteudo_personalizado SET aprovacao_em = now() WHERE aprovacao = 'aprovado';"
        if LEGADO_APROVADO
        else ""
    )
    estados = ", ".join(f"'{e}'" for e in ESTADOS)
    return f"""
ALTER TABLE public.conteudo_personalizado
  ADD COLUMN IF NOT EXISTS aprovacao text NOT NULL DEFAULT '{legado}',
  ADD COLUMN IF NOT EXISTS aprovacao_por uuid NULL,
  ADD COLUMN IF NOT EXISTS aprovacao_em timestamp with time zone NULL,
  ADD COLUMN IF NOT EXISTS aprovacao_motivo text NULL,
  ADD COLUMN IF NOT EXISTS conteudo_versao integer NOT NULL DEFAULT 1;

-- O default do ADD COLUMN só serve para quem já existia; daqui em diante nasce pendente.
ALTER TABLE public.conteudo_personalizado ALTER COLUMN aprovacao SET DEFAULT 'pendente';
{aprovado_em}

ALTER TABLE public.conteudo_personalizado
  DROP CONSTRAINT IF EXISTS conteudo_personalizado_aprovacao_chk;
ALTER TABLE public.conteudo_personalizado
  ADD CONSTRAINT conteudo_personalizado_aprovacao_chk CHECK (aprovacao IN ({estados}));
ALTER TABLE public.conteudo_personalizado
  DROP CONSTRAINT IF EXISTS conteudo_personalizado_aprovacao_motivo_chk;
ALTER TABLE public.conteudo_personalizado
  ADD CONSTRAINT conteudo_personalizado_aprovacao_motivo_chk
  CHECK (aprovacao_motivo IS NULL OR char_length(aprovacao_motivo) <= {MOTIVO_MAXIMO});

-- O console lista o que espera decisão por turma.
CREATE INDEX IF NOT EXISTS conteudo_personalizado_pendente_idx
  ON public.conteudo_personalizado (classe_id, topico_id)
  WHERE aprovacao = 'pendente';
"""


SEM_CONTROLE = """
CREATE OR REPLACE FUNCTION public.fn_personalizacao_sem_controle(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  -- O material sem as chaves de controle do worker (as que começam com sublinhado).
  SELECT CASE
    WHEN jsonb_typeof(p) = 'object' THEN (
      SELECT coalesce(jsonb_object_agg(e.chave, e.valor), '{}'::jsonb)
        FROM jsonb_each(p) AS e(chave, valor)
       WHERE left(e.chave, 1) <> '_'
    )
    ELSE p
  END
$fn$;
"""

GATILHO = """
CREATE OR REPLACE FUNCTION public.fn_conteudo_personalizado_aprovacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Todo material nasce esperando o professor, venha de onde vier.
    NEW.aprovacao := 'pendente';
    NEW.aprovacao_por := NULL;
    NEW.aprovacao_em := NULL;
    NEW.aprovacao_motivo := NULL;
    NEW.conteudo_versao := 1;
    RETURN NEW;
  END IF;

  NEW.conteudo_versao := OLD.conteudo_versao;

  IF public.fn_personalizacao_sem_controle(NEW.materiais)
       IS DISTINCT FROM public.fn_personalizacao_sem_controle(OLD.materiais)
     OR public.fn_personalizacao_sem_controle(NEW.plano)
       IS DISTINCT FROM public.fn_personalizacao_sem_controle(OLD.plano)
     OR NEW.source_hash IS DISTINCT FROM OLD.source_hash
     OR (NEW.status = 'processando_midias' AND OLD.status IS DISTINCT FROM 'processando_midias') THEN
    -- Material mudou (regeração, mídia nova, edição): o que foi aprovado não é mais isto.
    NEW.conteudo_versao := OLD.conteudo_versao + 1;
    NEW.aprovacao := 'pendente';
    NEW.aprovacao_por := NULL;
    NEW.aprovacao_em := NULL;
    NEW.aprovacao_motivo := NULL;
    RETURN NEW;
  END IF;

  IF NEW.aprovacao IS NOT DISTINCT FROM OLD.aprovacao
     AND NEW.aprovacao_motivo IS NOT DISTINCT FROM OLD.aprovacao_motivo
     AND NEW.aprovacao_por IS NOT DISTINCT FROM OLD.aprovacao_por
     AND NEW.aprovacao_em IS NOT DISTINCT FROM OLD.aprovacao_em THEN
    RETURN NEW;
  END IF;

  -- Só o professor dono da turma decide. API e worker (sem JWT) não aprovam nem recusam:
  -- o estado fica como estava.
  IF v_uid IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.classe c WHERE c.id = NEW.classe_id AND c.professor_id = v_uid
     ) THEN
    NEW.aprovacao := OLD.aprovacao;
    NEW.aprovacao_por := OLD.aprovacao_por;
    NEW.aprovacao_em := OLD.aprovacao_em;
    NEW.aprovacao_motivo := OLD.aprovacao_motivo;
    RETURN NEW;
  END IF;

  IF NEW.aprovacao = 'aprovado' AND NEW.status = 'processando_midias' THEN
    RAISE EXCEPTION 'Material ainda em geracao: espere terminar para aprovar.'
      USING ERRCODE = '22023';
  END IF;

  NEW.aprovacao_motivo := CASE
    WHEN NEW.aprovacao = 'recusado' THEN NULLIF(btrim(NEW.aprovacao_motivo), '')
    ELSE NULL
  END;
  IF NEW.aprovacao = 'pendente' THEN
    NEW.aprovacao_por := NULL;
    NEW.aprovacao_em := NULL;
  ELSE
    NEW.aprovacao_por := v_uid;
    NEW.aprovacao_em := now();
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_conteudo_personalizado_aprovacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_conteudo_personalizado_aprovacao ON public.conteudo_personalizado;
CREATE TRIGGER trg_conteudo_personalizado_aprovacao
  BEFORE INSERT OR UPDATE ON public.conteudo_personalizado
  FOR EACH ROW EXECUTE FUNCTION public.fn_conteudo_personalizado_aprovacao();
"""

RPC = f"""
CREATE OR REPLACE FUNCTION public.personalizacao_decidir(
  p_itens jsonb,
  p_decisao text,
  p_motivo text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_ids bigint[];
  v_n integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao obrigatoria.' USING ERRCODE = '42501';
  END IF;
  IF p_decisao IS NULL OR p_decisao NOT IN ('aprovado', 'recusado', 'pendente') THEN
    RAISE EXCEPTION 'Decisao invalida: use aprovado, recusado ou pendente.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Nenhum material para decidir.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_itens) > {ITENS_MAXIMO} THEN
    RAISE EXCEPTION 'Itens demais numa decisao so.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_itens) AS e(item)
        WHERE jsonb_typeof(e.item) IS DISTINCT FROM 'object'
           OR jsonb_typeof(e.item -> 'id') IS DISTINCT FROM 'number'
           OR jsonb_typeof(e.item -> 'versao') IS DISTINCT FROM 'number'
     ) THEN
    RAISE EXCEPTION 'Cada item precisa de id e versao.' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT (e.item ->> 'id')::bigint)
    INTO v_ids
    FROM jsonb_array_elements(p_itens) AS e(item);

  -- Posse antes de ler: todo item existe e é de uma turma deste professor.
  IF EXISTS (
       SELECT 1 FROM unnest(v_ids) AS i(id)
        WHERE NOT EXISTS (
          SELECT 1
            FROM public.conteudo_personalizado cp
           WHERE cp.id = i.id
             AND EXISTS (
               SELECT 1 FROM public.app_classes_do_professor() AS k(classe_id)
                WHERE k.classe_id = cp.classe_id
             )
        )
     ) THEN
    RAISE EXCEPTION 'Material nao encontrado nas suas turmas.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.conteudo_personalizado cp
    WHERE cp.id = ANY (v_ids) ORDER BY cp.id FOR UPDATE;

  -- Aprovar o que o professor viu: se a versão mudou, ele não viu isto.
  IF EXISTS (
       SELECT 1
         FROM jsonb_array_elements(p_itens) AS e(item)
         JOIN public.conteudo_personalizado cp ON cp.id = (e.item ->> 'id')::bigint
        WHERE cp.conteudo_versao <> (e.item ->> 'versao')::integer
     ) THEN
    RAISE EXCEPTION 'O material mudou depois que voce o abriu. Atualize e confira de novo.'
      USING ERRCODE = '40001';
  END IF;

  IF p_decisao = 'aprovado' AND EXISTS (
       SELECT 1 FROM public.conteudo_personalizado cp
        WHERE cp.id = ANY (v_ids) AND cp.status = 'processando_midias'
     ) THEN
    RAISE EXCEPTION 'Material ainda em geracao: espere terminar para aprovar.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.conteudo_personalizado cp
     SET aprovacao = p_decisao,
         aprovacao_motivo = CASE
           WHEN p_decisao = 'recusado' THEN left(NULLIF(btrim(p_motivo), ''), {MOTIVO_MAXIMO})
           ELSE NULL
         END
   WHERE cp.id = ANY (v_ids)
     AND (cp.aprovacao IS DISTINCT FROM p_decisao
          OR (p_decisao = 'recusado'
              AND cp.aprovacao_motivo IS DISTINCT FROM left(NULLIF(btrim(p_motivo), ''), {MOTIVO_MAXIMO})));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.personalizacao_decidir(jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personalizacao_decidir(jsonb, text, text) TO authenticated;
"""

POLICIES = """
DROP POLICY IF EXISTS conteudo_personalizado_aprovado_sel ON public.conteudo_personalizado;
CREATE POLICY conteudo_personalizado_aprovado_sel ON public.conteudo_personalizado
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    aprovacao = 'aprovado'
    OR classe_id IN (SELECT public.app_classes_do_professor())
  );

CREATE OR REPLACE FUNCTION public.app_personalizacao_aprovada(
  p_classe bigint,
  p_topico bigint,
  p_conteudo bigint,
  p_perfil text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  -- INVOKER de propósito: quem pergunta só enxerga os registros que a própria RLS deixa
  -- (aprovados, das turmas dele). Como DEFINER, qualquer sessão saberia se existe material
  -- aprovado em qualquer turma.
  SELECT EXISTS (
    SELECT 1
      FROM public.conteudo_personalizado cp
     WHERE cp.classe_id = p_classe
       AND cp.topico_id = p_topico
       AND cp.conteudo_id IS NOT DISTINCT FROM p_conteudo
       AND cp.aprovacao = 'aprovado'
       AND (
         NULLIF(btrim(p_perfil), '') IS NULL
         OR replace(lower(btrim(cp.brainhex_profile_key)), 'socialiser', 'socializer')
            = replace(lower(btrim(p_perfil)), 'socialiser', 'socializer')
       )
  )
$fn$;

REVOKE ALL ON FUNCTION public.app_personalizacao_aprovada(bigint, bigint, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_personalizacao_aprovada(bigint, bigint, bigint, text) TO authenticated;

DROP POLICY IF EXISTS cards_personalizados_aprovado_sel ON public.cards_personalizados;
CREATE POLICY cards_personalizados_aprovado_sel ON public.cards_personalizados
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    classe_id IN (SELECT public.app_classes_do_professor())
    OR public.app_personalizacao_aprovada(
      classe_id, topico_id, conteudo_id, metadata ->> 'brainhex_profile_key'
    )
  );
"""

# `trailup_progresso_percurso` como está em produção (lida em 10/11/2026; não estava no Alembic).
PERCURSO_FILTRO_ANTES = "AND cp.brainhex_profile_key=al.perfil_ativo"
PERCURSO_FILTRO_DEPOIS = "AND cp.brainhex_profile_key=al.perfil_ativo AND cp.aprovacao='aprovado'"

PERCURSO_ORIGINAL = """
CREATE OR REPLACE FUNCTION public.trailup_progresso_percurso(p_aluno uuid, p_classe bigint)
 RETURNS TABLE(topico_id bigint, total bigint, feitos bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH manifestos AS (
    SELECT DISTINCT ON (m.topico_id, cp.conteudo_id)
      m.*, cp.conteudo_id
    FROM personalizacao_percurso m
    JOIN conteudo_personalizado cp ON cp.id=m.personalizacao_id
    JOIN alunos al ON al.id=m.aluno_id
    WHERE m.aluno_id=p_aluno AND m.classe_id=p_classe
      AND cp.classe_id=m.classe_id AND cp.topico_id=m.topico_id
      AND (cp.aluno_id=p_aluno OR cp.aluno_id IS NULL)
      AND cp.brainhex_profile_key=al.perfil_ativo
    ORDER BY m.topico_id, cp.conteudo_id, m.updated_at DESC, m.personalizacao_id DESC
  ), itens AS (
    SELECT m.topico_id, coalesce(pip.percentual_concluido, 0)>=100 OR
      position('concl' IN lower(coalesce(pip.status,'')))>0 AS feito
    FROM manifestos m
    CROSS JOIN LATERAL (SELECT DISTINCT jsonb_array_elements_text(m.item_keys) AS chave) k
    LEFT JOIN personalizacao_item_progresso pip ON pip.aluno_id=m.aluno_id
      AND pip.personalizacao_id=m.personalizacao_id AND pip.item_key=k.chave
    WHERE left(k.chave,6)<>'slide:'
    UNION ALL
    -- Compatibilidade com clientes antigos, apenas onde não há manifesto.
    SELECT pip.topico_id, coalesce(pip.percentual_concluido,0)>=100 OR
      position('concl' IN lower(coalesce(pip.status,'')))>0
    FROM personalizacao_item_progresso pip
    JOIN conteudo_personalizado cp ON cp.id=pip.personalizacao_id
    JOIN alunos al ON al.id=pip.aluno_id
    WHERE pip.aluno_id=p_aluno AND pip.classe_id=p_classe
      AND cp.classe_id=pip.classe_id AND cp.topico_id=pip.topico_id
      AND (cp.aluno_id=p_aluno OR cp.aluno_id IS NULL)
      AND cp.brainhex_profile_key=al.perfil_ativo AND left(pip.item_key,6)<>'slide:'
      AND NOT EXISTS (SELECT 1 FROM manifestos m WHERE m.topico_id=pip.topico_id
        AND (m.conteudo_id IS NOT DISTINCT FROM cp.conteudo_id))
  )
  SELECT itens.topico_id, count(*), count(*) FILTER (WHERE feito)
    FROM itens GROUP BY itens.topico_id;
$function$;
"""


def percurso_novo() -> str:
    """O percurso só com material aprovado: as duas leituras de `conteudo_personalizado`."""
    achadas = PERCURSO_ORIGINAL.count(PERCURSO_FILTRO_ANTES)
    if achadas != 2:
        raise RuntimeError(f"esperava 2 ocorrências de {PERCURSO_FILTRO_ANTES!r}, achei {achadas}")
    return PERCURSO_ORIGINAL.replace(PERCURSO_FILTRO_ANTES, PERCURSO_FILTRO_DEPOIS)


# --- aviso de material novo: o corpo vem da 20261105_01, com três trocas conferidas -------------

AVISO_TROCAS = (
    (
        "OR NEW.status IS NULL OR NEW.status = 'processando_midias' THEN",
        "OR NEW.status IS NULL OR NEW.status = 'processando_midias'\n"
        "     OR NEW.aprovacao IS DISTINCT FROM 'aprovado' THEN",
    ),
    (
        "IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN",
        "IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status\n"
        "     AND OLD.aprovacao IS NOT DISTINCT FROM NEW.aprovacao THEN",
    ),
    (
        "AND cp.status = 'pronto'\n",
        "AND cp.status = 'pronto'\n            AND cp.aprovacao = 'aprovado'\n",
    ),
)

TRIGGER_AVISO = "trg_conteudo_personalizado_novo_material"

AVISO_GATILHO_ORIGINAL = f"""
DROP TRIGGER IF EXISTS {TRIGGER_AVISO} ON public.conteudo_personalizado;
CREATE TRIGGER {TRIGGER_AVISO}
  AFTER INSERT OR UPDATE OF status ON public.conteudo_personalizado
  FOR EACH ROW
  WHEN (NEW.topico_id IS NOT NULL AND NEW.status IS DISTINCT FROM 'processando_midias')
  EXECUTE FUNCTION public.notificacoes_novo_material_produzir();
"""

AVISO_GATILHO_NOVO = f"""
DROP TRIGGER IF EXISTS {TRIGGER_AVISO} ON public.conteudo_personalizado;
CREATE TRIGGER {TRIGGER_AVISO}
  AFTER INSERT OR UPDATE OF status, aprovacao ON public.conteudo_personalizado
  FOR EACH ROW
  WHEN (
    NEW.topico_id IS NOT NULL
    AND NEW.status IS DISTINCT FROM 'processando_midias'
    AND NEW.aprovacao = 'aprovado'
  )
  EXECUTE FUNCTION public.notificacoes_novo_material_produzir();
"""


def _aviso_original() -> str:
    """`notificacoes_novo_material_produzir` como a `20261105_01` a deixou."""
    caminho = Path(__file__).with_name("20261105_01_novo_material_no_perfil_da_tela.py")
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {caminho.name}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo.funcao_nova()


def aviso_novo() -> str:
    funcao = _aviso_original()
    for antes, depois in AVISO_TROCAS:
        achadas = funcao.count(antes)
        if achadas != 1:
            raise RuntimeError(f"esperava uma ocorrência de {antes!r}, achei {achadas}")
        funcao = funcao.replace(antes, depois)
    return funcao


RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(colunas())
    op.execute(SEM_CONTROLE)
    op.execute(GATILHO)
    op.execute(RPC)
    op.execute(POLICIES)
    op.execute(percurso_novo())
    op.execute(aviso_novo())
    op.execute(AVISO_GATILHO_NOVO)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(AVISO_GATILHO_ORIGINAL)
    op.execute(_aviso_original())
    op.execute(PERCURSO_ORIGINAL)
    op.execute("DROP POLICY IF EXISTS cards_personalizados_aprovado_sel ON public.cards_personalizados")
    op.execute(
        "DROP FUNCTION IF EXISTS public.app_personalizacao_aprovada(bigint, bigint, bigint, text)"
    )
    op.execute(
        "DROP POLICY IF EXISTS conteudo_personalizado_aprovado_sel ON public.conteudo_personalizado"
    )
    op.execute("DROP FUNCTION IF EXISTS public.personalizacao_decidir(jsonb, text, text)")
    op.execute(
        "DROP TRIGGER IF EXISTS trg_conteudo_personalizado_aprovacao ON public.conteudo_personalizado"
    )
    op.execute("DROP FUNCTION IF EXISTS public.fn_conteudo_personalizado_aprovacao()")
    op.execute("DROP FUNCTION IF EXISTS public.fn_personalizacao_sem_controle(jsonb)")
    op.execute("DROP INDEX IF EXISTS public.conteudo_personalizado_pendente_idx")
    op.execute(
        """
ALTER TABLE public.conteudo_personalizado
  DROP CONSTRAINT IF EXISTS conteudo_personalizado_aprovacao_motivo_chk,
  DROP CONSTRAINT IF EXISTS conteudo_personalizado_aprovacao_chk,
  DROP COLUMN IF EXISTS conteudo_versao,
  DROP COLUMN IF EXISTS aprovacao_motivo,
  DROP COLUMN IF EXISTS aprovacao_em,
  DROP COLUMN IF EXISTS aprovacao_por,
  DROP COLUMN IF EXISTS aprovacao;
"""
    )
    op.execute(RELOAD)
