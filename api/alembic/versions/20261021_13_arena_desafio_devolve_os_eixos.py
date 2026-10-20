"""Fase 1 do plano: `arena_desafio` devolve os eixos e o preset, para a tela de jogo existir

Primeira fase de `docs/superpowers/specs/2026-10-19-plano-do-que-falta-design.md`.

A tela de jogo precisa de três coisas que `arena_desafio` já quase dá: as questões (dá), a
minha resposta de cada uma (dá) e **quanto tempo e quantas tentativas eu tenho** (não dá).

## Por que vem daqui e não do cliente

`fn_desafio_params_efetivos` existe desde a fase 7 exatamente para traduzir `dificuldade` em
`tempo_seg`, `tentativas` e `aposta_fator` — e ela **não tem EXECUTE para `authenticated`**
(as chaves de `app_config` por trás dela são privadas, e a correção da fase 7 fechou o acesso
direto). Então o cliente não pode consultá-la; só outra função pode.

A alternativa seria o cliente ler os `params` que `guilda_desafio_criar` grava no
`conteudo` da mensagem do chat. Não serve: acopla a tela de jogo ao chat, e qualquer outra
porta de entrada (uma lista de desafios abertos, uma notificação) ficaria sem os parâmetros.
O dado é do DESAFIO, então sai da leitura do desafio.

## O que muda, e o que não

Três chaves a mais no mesmo objeto: `dificuldade`, `consequencia` e `params`. Nada sai, nada
muda de nome — quem já lê `questoes` continua lendo igual.

O resto do corpo é o de hoje, incluindo as duas garantias que importam e que eu não toco:

- exige `me.estado = 'aceito'`, que é a mesma pergunta que `20261021_12` pôs na permissão de
  responder — leitura e escrita concordam sobre quem está no desafio;
- `resposta_correta` só aparece **depois** de existir resposta minha
  (`CASE WHEN r.questao_id IS NULL THEN NULL`). Sem isso a tela de jogo entregaria o gabarito
  junto com a questão.

> `guilda_desafio_questoes` tem RLS ligada e **nenhuma policy**: ler a tabela direto do
> cliente devolve lista vazia em silêncio. É por isso que a tela usa esta RPC
> `SECURITY DEFINER` em vez de montar a consulta — não é atalho, é o único caminho que
> funciona sem abrir a tabela (e abri-la exporia `resposta_correta`).

Revision ID: 20261021_13
Revises: 20261021_12
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_13"
down_revision = "20261021_12"
branch_labels = None
depends_on = None


def _arena_desafio(com_eixos: bool) -> str:
    eixos = (
        """    'dificuldade', d.dificuldade,
    'consequencia', d.consequencia,
    -- `fn_desafio_params_efetivos` nao tem EXECUTE para `authenticated` (fase 7): quem
    -- traduz o preset para o cliente tem de ser outra funcao, e e esta.
    'params', public.fn_desafio_params_efetivos(d.dificuldade),
"""
        if com_eixos
        else ""
    )
    return f"""
CREATE OR REPLACE FUNCTION public.arena_desafio(p_desafio_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', d.id,
    'formato', d.formato,
    'modo', d.modo,
    'status', d.status,
{eixos}    'meu_estado', me.estado,
    'minha_equipe', me.equipe,
    'questoes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'ordem', dq.ordem,
               'questao_id', dq.questao_id,
               'enunciado', q.enunciado,
               'tipo', q.tipo,
               'alternativas', q.alternativas,
               'midia_url', q.midia_url,
               'minha_resposta', r.resposta,
               'correta', r.correta,
               'tempo_ms', r.tempo_ms,
               'resposta_correta',
                 CASE WHEN r.questao_id IS NULL THEN NULL
                      ELSE q.resposta_correta END
             ) ORDER BY dq.ordem)
        FROM public.guilda_desafio_questoes dq
        JOIN public.questoes q ON q.id = dq.questao_id
        LEFT JOIN public.guilda_desafio_respostas r
               ON r.desafio_id = dq.desafio_id
              AND r.questao_id = dq.questao_id
              AND r.aluno_id = auth.uid()
       WHERE dq.desafio_id = d.id
    ), '[]'::jsonb)
  )
  FROM public.guilda_desafios d
  JOIN public.desafio_participantes me
    ON me.desafio_id = d.id AND me.aluno_id = auth.uid()
 WHERE d.id = p_desafio_id AND me.estado = 'aceito';
$function$;
"""


RELOAD = "\nNOTIFY pgrst, 'reload schema';\n"


def upgrade() -> None:
    op.execute(_arena_desafio(com_eixos=True))
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(_arena_desafio(com_eixos=False))
    op.execute(RELOAD)
