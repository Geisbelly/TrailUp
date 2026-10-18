"""notas_fila() passa a reconhecer a atividade dissertativa pelos apelidos e pelo tipo em branco

`20261016_04` escreveu o filtro como `a.tipo = 'essay'`, literal. O console **não** usa esse
literal como única verdade: `formatoDaQuestao()` (frontend) trata `'essay'`, `'dissertativa'`,
`'questao'`, `'texto'`, vazio e NULL todos como dissertação, e o editor desenha os cinco casos
com o rótulo "Dissertação". Resultado: o professor cria uma atividade que a tela chama de
dissertação, o aluno responde, e a fila de correção fica vazia — sem erro em lugar nenhum,
porque a função simplesmente não casa a linha.

O caso de NULL não é hipotético: `saveActivity` (topicsApi.ts) grava `tipo: params.tipo || null`,
então atividade salva sem formato escolhido fica com `tipo` NULL. A única atividade em produção
hoje é exatamente essa — `tipo` nulo.

O caso dos apelidos vinha do `GenerateTrailDialog`, que inseria `tipo` cru do modelo
(`AiAtividade.tipo` é `string` livre) nas duas colunas. Isso foi corrigido no mesmo PR, pelo lado
da escrita, então linha nova já nasce no vocabulário de quatro valores. Esta migration é para o
que já está gravado e para o NULL, que o editor continua produzindo de propósito.

**O que esta migration deliberadamente NÃO faz:** espelhar o `return "essay"` final de
`formatoDaQuestao`. Lá o desconhecido cai em dissertação porque a tela precisa desenhar alguma
coisa; aqui isso arrastaria `'missao'` e `'video'` para a fila de correção do professor. Por isso
a lista é explícita, e `'missao'` fica fora — é o único ponto em que as duas regras divergem de
propósito, e o teste `test_migration_notas_fila_tipo.py` trava essa diferença.

Forma do predicado: `lower(coalesce(nullif(btrim(a.tipo), ''), 'essay')) IN (...)`. O `coalesce`
garante valor não-nulo antes do `IN`, então não há três-valores vazando para o JOIN como
desconhecido — a armadilha que `20261018_02` corrigiu nas questões. O `nullif(btrim(...), '')`
põe vazio e só-espaços no mesmo caminho do NULL, porque `formatoDaQuestao('')` também dá
dissertação; a primeira versão deste predicado tratava só o NULL e deixava o vazio de fora, o que
contrariava esta mesma docstring. (`tipo` é `text` nullable, conferido em produção; não é enum,
então não precisa de cast.)

Os 14 casos (os quatro apelidos, com e sem caixa/espaço, NULL, vazio, só-espaços, mais missao,
video, quiz, true_false, fill_blank e um "aberta" qualquer) foram rodados no Postgres de produção
contra as duas formas do predicado antes de escrever isto.

O resto da função é idêntico à de `20261016_04`.

Revision ID: 20261018_05
Revises: 20261018_04
Create Date: 2026-10-18
"""

from alembic import op

revision = "20261018_05"
down_revision = "20261018_04"
branch_labels = None
depends_on = None


# O único trecho que muda entre as duas versões é esta condição no JOIN de `atividades`.
FILTRO_NOVO = """AND lower(coalesce(nullif(btrim(a.tipo), ''), 'essay')) IN ('essay', 'dissertativa', 'questao', 'texto')"""
FILTRO_ANTIGO = """AND a.tipo = 'essay'"""


def _sql(filtro: str) -> str:
    return (
        r"""
CREATE OR REPLACE FUNCTION public.notas_fila(p_classe_id bigint)
RETURNS TABLE (
  aluno_id uuid,
  aluno_nome text,
  atividade_id bigint,
  topico_id bigint,
  titulo text,
  enunciado text,
  gabarito text,
  resposta text,
  entregue_em timestamptz,
  prazo timestamptz,
  pontuacao_maxima numeric,
  pontuacao_obtida numeric,
  avaliado_em timestamptz,
  feedback text
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_classe_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'Turma não encontrada ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ca.aluno_id,
         coalesce(al.nome, '')::text,
         a.id::bigint,
         a.topico_id::bigint,
         a.titulo::text,
         coalesce(q.enunciado, a.descricao, '')::text,
         q.resposta_correta::text,
         ult.resposta::text,
         ult.criado_em::timestamptz,
         a.data_entrega::timestamptz,
         coalesce(aa.pontuacao_maxima, a.pontuacao_maxima)::numeric,
         aa.pontuacao_obtida::numeric,
         nullif(aa.avaliacao_metadata #>> '{professor,avaliado_em}', '')::timestamptz,
         aa.avaliacao_metadata #>> '{professor,feedback}'
    FROM public.classe_aluno ca
    JOIN public.topicos t ON t.classe_id = ca.classe_id
    JOIN public.atividades a ON a.topico_id = t.id
     """
        + filtro
        + r"""
    LEFT JOIN public.alunos al ON al.id = ca.aluno_id
    LEFT JOIN public.atividade_aluno aa ON aa.aluno_id = ca.aluno_id AND aa.atividade_id = a.id
    LEFT JOIN LATERAL (
      SELECT q1.enunciado, q1.resposta_correta
        FROM public.questoes q1
       WHERE q1.atividade_id = a.id
       ORDER BY q1.id
       LIMIT 1
    ) q ON true
    LEFT JOIN LATERAL (
      SELECT qa.resposta, qa.criado_em
        FROM public.questao_aluno qa
       WHERE qa.aluno_id = ca.aluno_id AND qa.atividade_id = a.id
       ORDER BY qa.criado_em DESC NULLS LAST, qa.id DESC
       LIMIT 1
    ) ult ON true
   WHERE ca.classe_id = p_classe_id
     AND (ult.resposta IS NOT NULL
          OR (a.data_entrega IS NOT NULL AND a.data_entrega::timestamptz < now()))
   ORDER BY a.id, al.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.notas_fila(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notas_fila(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
"""
    )


def upgrade() -> None:
    op.execute(_sql(FILTRO_NOVO))


def downgrade() -> None:
    op.execute(_sql(FILTRO_ANTIGO))
