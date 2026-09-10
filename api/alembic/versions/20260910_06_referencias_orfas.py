"""a referencia diz o que e', e a orfa que sobrar deixa de valer ponto

Censo em producao, `eventos_aluno` inteiro:

| destino                                  | eventos | pontos |
|------------------------------------------|---------|--------|
| recuperavel (progresso do aluno confirma)|       9 |     32 |
| irrecuperavel                            |      72 |    128 |

Sao 66 ids de referencia que nao existem em `atividades`. Deles, 10 existem em
`conteudos` -- mas **id coincidente nao e' prova**: dois deles (201 e 202) sao
conteudo das classes 57 e 58, turmas em que o aluno nem esta matriculado. Foi
coincidencia de faixa de id, e reescrever aqueles dois teria dado pontos numa
turma que o aluno nunca abriu.

**A regra de recuperacao e' evidencia, nao coincidencia.** So reescreve quando o
proprio `conteudo_aluno` do aluno confirma progresso naquele conteudo. Isso
aceita 174, 177, 178 e 179 (classe 32, com progresso) e recusa 201 e 202.

**Por que havia orfa fabricada.** `_sanitize_reference` montava a referencia com
o prefixo tirado do TIPO do evento e o id vindo da referencia: um `content:174`
num `atividade_concluida` virava `atividade:174`. Nao existe atividade 174 --
174 e' conteudo --, entao a view nunca resolvia a classe e os pontos morriam.
O id e' a parte confiavel; o prefixo do tipo e' palpite.

Duas correcoes coordenadas:

1. **A view e a funcao de resolucao passam a olhar a FORMA da referencia**, e
   caem para o prefixo do tipo so' quando a referencia nao declara nada
   (`122`, cru). E' o mesmo principio que `classe:` e `conquista:` ja usavam.
2. **O sanitizador para de sobrescrever prefixo declarado** (no codigo, fora
   desta migracao).

**`atividade_concluida` do id 174 fica de fora da recuperacao, de proposito.** O
aluno ja tem `conteudo_concluido` -> `conteudo:174`: reescrever pagaria o mesmo
ato duas vezes, por dois tipos de evento. O `NOT EXISTS` do backfill recusa
recuperar alvo que ja tem conclusao paga.

**A orfa que sobra passa a valer 0.** Referencia que nada resolve nao pode ser
atribuida a rank algum -- ja valia 0 em todo rank, e o `valor` gravado dizia o
contrario. Com a pontuacao aparecendo nas metricas, um razao que soma 128 pontos
invisiveis e' divergencia esperando para ser relatada. Nenhuma linha e' apagada:
o evento continua sendo historico.

A regra da orfa mora no gatilho de valor, e nao so' no backfill. Nao e' zelo: a
`20260909_05` instalou um `BEFORE UPDATE OF valor, tipo` que recalcula o valor
pela tabela de pontuacao, e sem o ramo no gatilho o `SET valor = 0` era desfeito
linha por linha -- a `20260910_04` cobria so' os tipos de CONCLUSAO, e
`atividade_revisada` (o volume das orfas) passava batido. A propria migracao
pegou isso na primeira execucao: "referencia orfa ainda pagando: 66".

O que a regra **nao** faz: impedir que a orfa apareca depois. Ela nasce quase
sempre de exclusao POSTERIOR -- conteudo regerado apaga atividade --, e o valor
gravado envelhece junto. O rank nao se engana com isso (a view resolve ao vivo);
o que fica garantido e' que o razao nao contradiga o rank em nenhuma escrita.
Fechar a causa de vez exigiria congelar a classe no evento (uma coluna
`classe_id` resolvida no INSERT), que e' mudanca de modelo e decisao separada.

Revision ID: 20260910_06
Revises: 20260910_05
Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_06"
down_revision = "20260910_05"
branch_labels = None
depends_on = None


# vocabulario declarado -> entidade. Espelha `_PREFIXOS_CONHECIDOS` em
# `app/repositories/evento.py`: as duas grafias apontam para a mesma tabela, e o
# cliente usa uma ou outra dependendo do caminho.
PREFIXOS = {
    "topico": "topico",
    "topic": "topico",
    "conteudo": "conteudo",
    "content": "conteudo",
    "atividade": "atividade",
    "activity": "atividade",
    "classe": "classe",
    "class": "classe",
    "conquista": "conquista",
}

# Entidade deduzida do TIPO -- pista de ultimo recurso, para referencia crua.
TIPOS = (("topico", "topico"), ("conteudo", "conteudo"), ("atividade", "atividade"))


def _entidade_sql(referencia: str, tipo: str, recuo: str) -> str:
    """A entidade que a referencia declara; senao, a que o tipo sugere."""
    declarado = "\n".join(
        f"{recuo}        WHEN '{grafia}' THEN '{entidade}'"
        for grafia, entidade in PREFIXOS.items()
    )
    porTipo = "\n".join(
        f"{recuo}      WHEN starts_with(lower(COALESCE({tipo}, ''::text)), '{prefixo}')"
        f" THEN '{entidade}'"
        for prefixo, entidade in TIPOS
    )
    return (
        f"COALESCE(\n"
        f"{recuo}    CASE WHEN position(':' in {referencia}) > 0 THEN\n"
        f"{recuo}      CASE lower(split_part({referencia}, ':', 1))\n"
        f"{declarado}\n"
        f"{recuo}        ELSE NULL::text\n"
        f"{recuo}      END\n"
        f"{recuo}    END,\n"
        f"{recuo}    CASE\n"
        f"{porTipo}\n"
        f"{recuo}      ELSE NULL::text\n"
        f"{recuo}    END\n"
        f"{recuo}  )"
    )


# Usada pelo gatilho de conquistas. A view NAO a chama: `SET search_path` impede
# inlining, e por linha de evento isso custaria caro numa view lida a cada
# abertura do rank. A duplicacao da regra e' deliberada, e o teste
# `test_a_view_e_a_funcao_usam_a_mesma_regra` prende as duas juntas.
FUNCAO_RESOLVE = f"""
CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_resolve_classe_id(
  p_tipo text,
  p_referencia text
)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH ref AS (
    SELECT public.fn_eventos_aluno_referencia_id(p_referencia) AS ref_id,
           TRIM(BOTH FROM COALESCE(p_referencia, ''::text))    AS bruta
  ), alvo AS (
    SELECT ref.ref_id,
           {_entidade_sql("ref.bruta", "p_tipo", "         ")} AS entidade
      FROM ref
  )
  SELECT COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id)
  FROM alvo
  LEFT JOIN public.topicos t    ON alvo.entidade = 'topico'    AND t.id = alvo.ref_id
  LEFT JOIN public.conteudos c  ON alvo.entidade = 'conteudo'  AND c.id = alvo.ref_id
  LEFT JOIN public.topicos t_c  ON t_c.id = c.topico_id
  LEFT JOIN public.atividades a ON alvo.entidade = 'atividade' AND a.id = alvo.ref_id
  LEFT JOIN public.topicos t_a  ON t_a.id = a.topico_id
  LEFT JOIN public.classe cl    ON alvo.entidade = 'classe'    AND cl.id = alvo.ref_id;
$fn$;
"""


VIEW_RANK = f"""
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas AS
 WITH referencias_normalizadas AS (
         SELECT e.aluno_id,
            e.tipo,
            COALESCE(e.valor, 0::numeric) AS valor,
            TRIM(BOTH FROM COALESCE(e.referencia, ''::text)) AS referencia_bruta,
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM e.referencia), ''::text) IS NULL THEN NULL::bigint
                    WHEN TRIM(BOTH FROM e.referencia) ~ '^\\d+$'::text
                      THEN TRIM(BOTH FROM e.referencia)::bigint
                    WHEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2) ~ '^\\d+$'::text
                      THEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2)::bigint
                    ELSE NULL::bigint
                END AS referencia_id,
            -- A referencia diz o que ela e'; o tipo do evento e' palpite, e vale
            -- so' quando ela nao declara nada. Confiar no tipo fabricava orfa:
            -- `content:174` num evento de atividade virava `atividade:174`, e
            -- nao existe atividade 174.
            {_entidade_sql(
                "TRIM(BOTH FROM COALESCE(e.referencia, ''::text))", "e.tipo", "           "
            )} AS entidade
           FROM eventos_aluno e
        ), eventos_por_classe AS (
         SELECT e.aluno_id,
            COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id, ca_conq.classe_id) AS classe_id,
            sum(e.valor) AS pontuacao
           FROM referencias_normalizadas e
             LEFT JOIN topicos t    ON e.entidade = 'topico'    AND t.id = e.referencia_id
             LEFT JOIN conteudos c  ON e.entidade = 'conteudo'  AND c.id = e.referencia_id
             LEFT JOIN topicos t_c  ON t_c.id = c.topico_id
             LEFT JOIN atividades a ON e.entidade = 'atividade' AND a.id = e.referencia_id
             LEFT JOIN topicos t_a  ON t_a.id = a.topico_id
             LEFT JOIN classe cl    ON e.entidade = 'classe'    AND cl.id = e.referencia_id
             -- `conquista:<id>` nao aponta para classe alguma, e nao poderia:
             -- `conquistas.escopo` e' `comum` ou `perfil`. O premio vale em toda
             -- classe onde o aluno compete -- este join e' o unico que multiplica
             -- linhas, de proposito, e o `sum` por (aluno, classe) conta o premio
             -- inteiro em cada uma.
             LEFT JOIN classe_aluno ca_conq
               ON e.entidade = 'conquista' AND ca_conq.aluno_id = e.aluno_id
          WHERE COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id, ca_conq.classe_id) IS NOT NULL
          GROUP BY e.aluno_id,
                   (COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id, ca_conq.classe_id))
        ), base AS (
         SELECT r.id AS rank_id,
            r.classe_id,
            ca.aluno_id,
            rt.criterio,
                CASE rt.criterio
                    WHEN 'percentual'::text THEN COALESCE(ca."porcentagemConcluida", 0::numeric)
                    WHEN 'pontuacao'::text THEN COALESCE(epc.pontuacao, 0::numeric)
                    WHEN 'tempo'::text THEN COALESCE(ca."tempoGastoMin", 0::numeric)
                    ELSE 0::numeric
                END AS pontuacao
           FROM ranks r
             JOIN rank_tipo rt ON rt.id = r.tipo_id
             JOIN classe_aluno ca ON ca.classe_id = r.classe_id
             LEFT JOIN eventos_por_classe epc
               ON epc.classe_id = r.classe_id AND epc.aluno_id = ca.aluno_id
        ), ordenado AS (
         SELECT b.rank_id,
            b.classe_id,
            b.aluno_id,
            b.pontuacao,
            dense_rank() OVER (PARTITION BY b.rank_id ORDER BY b.pontuacao DESC, b.aluno_id) AS posicao
           FROM base b
        )
 SELECT o.rank_id,
    o.classe_id,
    o.posicao,
    a.id AS id_aluno,
    a.nome AS nome_aluno,
    o.pontuacao,
    -- Nao e' progresso na trilha: e' quanto o aluno tem em relacao ao primeiro
    -- colocado. O lider da 100 por construcao.
    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric)
          * 100::numeric, 2) AS percentual_do_lider,
        CASE
            WHEN o.posicao = 1 THEN 'ouro'::text
            WHEN o.posicao = 2 THEN 'prata'::text
            WHEN o.posicao = 3 THEN 'bronze'::text
            ELSE NULL::text
        END AS medalha
   FROM ordenado o
     JOIN alunos a ON a.id = o.aluno_id;
"""


# Evidencia, nao coincidencia: so' reescreve quando o progresso do PROPRIO aluno
# confirma que ele abriu aquele conteudo. Sem isso, 201 e 202 (conteudo das
# classes 57 e 58) teriam dado pontos em turma que o aluno nunca abriu.
RECUPERA = """
UPDATE public.eventos_aluno e
   SET referencia = 'conteudo:' || alvo.rid::text
  FROM (
    SELECT ev.id,
           split_part(TRIM(BOTH FROM ev.referencia), ':', 2)::bigint AS rid,
           ev.aluno_id,
           ev.tipo
      FROM public.eventos_aluno ev
     WHERE starts_with(ev.tipo, 'atividade')
       AND ev.referencia IS NOT NULL
       AND split_part(TRIM(BOTH FROM ev.referencia), ':', 2) ~ '^\\d+$'
       AND NOT EXISTS (
         SELECT 1 FROM public.atividades a
          WHERE a.id = split_part(TRIM(BOTH FROM ev.referencia), ':', 2)::bigint)
  ) alvo
 WHERE alvo.id = e.id
   -- O aluno tem progresso nesse conteudo: a referencia era conteudo com o
   -- prefixo trocado.
   AND EXISTS (
     SELECT 1 FROM public.conteudo_aluno ca
      WHERE ca.aluno_id = alvo.aluno_id AND ca.conteudo_id = alvo.rid)
   -- Mas nao recupera alvo que ja tem conclusao paga: o mesmo ato pago por dois
   -- tipos de evento seria pontuar duas vezes a mesma coisa.
   AND NOT (
     public.fn_evento_de_conclusao(alvo.tipo)
     AND EXISTS (
       SELECT 1 FROM public.eventos_aluno pago
        WHERE pago.aluno_id = alvo.aluno_id
          AND public.fn_evento_de_conclusao(pago.tipo)
          AND pago.referencia = 'conteudo:' || alvo.rid::text
          AND COALESCE(pago.valor, 0) > 0));
"""


# A regra da orfa tem de morar no gatilho, e nao so' no UPDATE abaixo.
#
# A `20260909_05` instalou um `BEFORE UPDATE OF valor, tipo` que recalcula
# `NEW.valor` a partir da tabela de pontuacao. Sem o ramo aqui, o `SET valor = 0`
# do backfill era desfeito linha por linha -- e a `20260910_04` so' cobria os
# tipos de CONCLUSAO, entao `atividade_revisada` (que e' o volume das orfas)
# passava batido. Foi o que a propria migracao pegou: "referencia orfa ainda
# pagando: 66".
#
# O corpo e' repetido da `20260910_04` de proposito: cada migracao e' um
# retrato, e aquela ja esta aplicada.
#
# Isto NAO impede a orfa de aparecer depois -- ela nasce quase sempre de exclusao
# posterior, e o valor gravado envelhece junto. O rank nao se engana (a view
# resolve ao vivo); o que a regra garante e' que o razao nao contradiga o rank
# em nenhuma escrita.
GATILHO = """
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- Creditado tem valor de quem concede: presenca e participacao vem da RPC,
  -- o premio de conquista vem de `conquistas.pontos_recompensa`.
  IF public.fn_evento_creditado(NEW.tipo) THEN
    RETURN NEW;
  END IF;

  -- Para todo o resto, o que o cliente mandou em `valor` e' descartado.
  NEW.valor := public.fn_pontos_do_evento(NEW.tipo);

  IF public.fn_evento_de_conclusao(NEW.tipo) THEN
    -- Conclusao sem referencia nao pode ser atribuida a rank algum.
    IF NULLIF(TRIM(BOTH FROM COALESCE(NEW.referencia, '')), '') IS NULL THEN
      NEW.valor := 0;
      RETURN NEW;
    END IF;

    -- Concluir de novo nao paga de novo. A linha E gravada -- o cliente faz
    -- `.insert().select().single()` e um RETURN NULL o quebraria. No UPDATE a
    -- comparacao e' "existe linha ANTERIOR com a mesma chave": comparar por
    -- existencia acharia a propria vizinha e zeraria as duas.
    IF EXISTS (
      SELECT 1
        FROM public.eventos_aluno e
       WHERE e.aluno_id = NEW.aluno_id
         AND e.tipo = NEW.tipo
         AND e.referencia = NEW.referencia
         AND (
           TG_OP = 'INSERT'
           OR (COALESCE(e.criado_em, 'epoch'::timestamp), e.id)
              < (COALESCE(NEW.criado_em, 'epoch'::timestamp), NEW.id)
         )
    ) THEN
      NEW.valor := 0;
    END IF;
  END IF;

  -- Referencia que nada resolve nao chega a rank algum. Consulta so' quando ha
  -- ponto em jogo: evento de valor zero (abrir tela, ciclo da IA) nao paga a
  -- busca, e sao a maioria absoluta das linhas.
  IF COALESCE(NEW.valor, 0) > 0
     AND NEW.referencia IS NOT NULL
     AND public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia) IS NULL THEN
    NEW.valor := 0;
  END IF;

  RETURN NEW;
END;
$fn$;
"""


# O que sobrou nao pode ser atribuido a rank algum. Ja valia 0 em todo rank; o
# `valor` gravado e' que dizia o contrario.
ZERA_ORFAS = """
UPDATE public.eventos_aluno e
   SET valor = 0
 WHERE COALESCE(e.valor, 0) <> 0
   AND NOT public.fn_evento_creditado(e.tipo)
   AND e.referencia IS NOT NULL
   AND public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia) IS NULL;
"""


CONFERE = """
DO $$
DECLARE
  v_orfa_pagando bigint;
  v_recuperados  bigint;
BEGIN
  -- A regra nova tem de valer para os dois lados.
  IF public.fn_eventos_aluno_resolve_classe_id('atividade_revisada', 'conteudo:174') IS NULL THEN
    RAISE EXCEPTION 'a resolucao por forma da referencia nao esta valendo';
  END IF;

  IF public.fn_eventos_aluno_resolve_classe_id('conteudo_concluido', 'atividade:999999999')
     IS NOT NULL THEN
    RAISE EXCEPTION 'referencia inexistente passou a resolver classe';
  END IF;

  -- Nenhuma orfa pagando.
  SELECT count(*) INTO v_orfa_pagando
    FROM public.eventos_aluno e
   WHERE COALESCE(e.valor, 0) <> 0
     AND NOT public.fn_evento_creditado(e.tipo)
     AND e.referencia IS NOT NULL
     AND public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia) IS NULL;

  IF v_orfa_pagando > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'referencia orfa ainda pagando: ' || v_orfa_pagando::text;
  END IF;

  -- E nenhuma orfa recuperada aponta para classe onde o aluno nao esta.
  SELECT count(*) INTO v_recuperados
    FROM public.eventos_aluno e
   WHERE starts_with(e.tipo, 'atividade')
     AND starts_with(COALESCE(e.referencia, ''), 'conteudo:')
     AND NOT EXISTS (
       SELECT 1
         FROM public.classe_aluno ca
        WHERE ca.aluno_id = e.aluno_id
          AND ca.classe_id = public.fn_eventos_aluno_resolve_classe_id(e.tipo, e.referencia));

  IF v_recuperados > 0 THEN
    RAISE EXCEPTION USING MESSAGE =
      'referencia recuperada para classe sem matricula: ' || v_recuperados::text;
  END IF;
END $$;
"""


def upgrade() -> None:
    op.execute(FUNCAO_RESOLVE)
    op.execute(VIEW_RANK)
    # O gatilho antes do backfill: e' ele que faz o `SET valor = 0` sobreviver.
    op.execute(GATILHO)
    # `RECUPERA` mexe em `referencia`, que nao esta no `UPDATE OF` do gatilho --
    # entao a linha recuperada mantem o valor que ja tinha, e passa a resolver.
    op.execute(RECUPERA)
    op.execute(ZERA_ORFAS)
    op.execute(CONFERE)


def downgrade() -> None:
    # A funcao volta a resolver so' pelo prefixo do TIPO. A view continua com a
    # regra nova de proposito: voltar atras nela faria os pontos recuperados
    # desaparecerem outra vez, e o valor zerado das orfas nao volta -- eram
    # pontos que rank nenhum contava.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_resolve_classe_id(
          p_tipo text,
          p_referencia text
        )
        RETURNS bigint
        LANGUAGE sql
        STABLE
        SET search_path TO 'public', 'pg_temp'
        AS $fn$
          WITH ref AS (
            SELECT public.fn_eventos_aluno_referencia_id(p_referencia) AS ref_id
          )
          SELECT COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id)
          FROM ref
          LEFT JOIN public.topicos t
            ON starts_with(lower(COALESCE(p_tipo, ''::text)), 'topico') AND t.id = ref.ref_id
          LEFT JOIN public.conteudos c
            ON starts_with(lower(COALESCE(p_tipo, ''::text)), 'conteudo') AND c.id = ref.ref_id
          LEFT JOIN public.topicos t_c ON t_c.id = c.topico_id
          LEFT JOIN public.atividades atv
            ON starts_with(lower(COALESCE(p_tipo, ''::text)), 'atividade') AND atv.id = ref.ref_id
          LEFT JOIN public.topicos t_a ON t_a.id = atv.topico_id;
        $fn$;
        """
    )
