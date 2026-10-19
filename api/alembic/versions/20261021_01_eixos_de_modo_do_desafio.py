"""Fase 1 dos modos: `consequencia` e `dificuldade` em guilda_desafios, `turma` em formato

Primeira fase de `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`.
Só colunas, CHECKs e chaves de configuração — nenhuma mudança de comportamento. As RPCs
`arena_*` não são tocadas; elas inserem sem citar as colunas novas, então os defaults valem.

Os dez "modos" pedidos (solo, guilda, batalha, treino, rápido, difícil, ranqueada,
competição em grupo…) são quatro eixos ortogonais, e dois já existiam:

    composicao   guilda_desafios.formato   solo | dupla | guilda | turma (novo)
    regra        guilda_desafios.modo      todos | velocidade | precisao
    dificuldade  NOVO                      normal | dificil
    consequencia NOVO                      treino | ranqueada | evento

**`dificuldade` é eixo, não valor de `modo`.** "Difícil" foi definido como quatro coisas ao
mesmo tempo (questão mais difícil, menos tempo, menos tentativas, aposta maior) — um preset
de parâmetros, ortogonal a *como se pontua*. Como valor de `modo` tornaria
difícil-por-velocidade e difícil-por-precisão inexpressáveis.

## O default de `consequencia` é `ranqueada`, e isso foi medido

O spec dizia "na dúvida, não pontua" e propunha `treino` como default. **Está errado, e a
medição mostrou por quê:** `arena_encerrar` já escreve em `eventos_aluno` com os tipos
`desafio_vencido`, `desafio_empate` e `desafio_participou`, e os três têm linha em
`eventos_pontuacao` valendo 12/6/3 pontos e 3/1/0 moedas. A arena **já está ligada para
pontuar** — zero linhas gravadas até hoje só porque ninguém a usou ainda.

Com `treino` como default, a fase 4 (que faz `treino` não pontuar) desligaria a pontuação de
todo desafio existente **em silêncio**. `ranqueada` preserva o comportamento desenhado.

"Na dúvida não pontua" vale para superfície nova, não para coluna acrescentada a uma
superfície que já pontua. `treino` passa a ser escolha explícita de quem cria o desafio.

## `turma` não precisa mexer nas outras constraints

`guilda_desafios_guilda_do_formato` já diz `(formato = 'guilda') = (guilda_id IS NOT NULL)`,
então `formato = 'turma'` exige `guilda_id IS NULL` — que é exatamente o certo para um
desafio da turma inteira. E `guilda_desafios_rival_check` já restringe rival a `formato =
'guilda'`. Só o CHECK da lista muda; as duas regras de coerência continuam valendo de graça.

## Configuração

Seis chaves, `publico = false`. O CLAUDE.md diz que o default de `app_config.publico` é
`false` e que marcar público é decisão: a policy `app_config_sel` é `USING (publico)` para
`anon` **e** `authenticated`, então marcar estas como públicas abriria o parâmetro para quem
não fez login. O cliente recebe os valores efetivos pela RPC do desafio (fase 7), que já é
o caminho autenticado — a superfície de leitura anônima fica como está.

`desafio_dificuldade_min` **não entra nesta fase**: ela pressupõe uma marcação de dificuldade
em `questoes`, que não existe (colunas: id, atividade_id, enunciado, tipo, alternativas,
resposta_correta, midia_url, created_at, nota_estabelecida). A decisão entre acrescentar a
coluna ou usar proxy (a questão que a turma mais errou, via `questao_aluno`) está aberta.

Revision ID: 20261021_01
Revises: 20261020_07
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_01"
down_revision = "20261020_07"
branch_labels = None
depends_on = None


CONSEQUENCIAS = ("treino", "ranqueada", "evento")
DIFICULDADES = ("normal", "dificil")
FORMATOS = ("guilda", "dupla", "solo", "turma")
FORMATOS_ANTES = ("guilda", "dupla", "solo")


def _lista(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'::text" for v in valores)


SQL = f"""
ALTER TABLE public.guilda_desafios
  ADD COLUMN IF NOT EXISTS consequencia text NOT NULL DEFAULT 'ranqueada',
  ADD COLUMN IF NOT EXISTS dificuldade  text NOT NULL DEFAULT 'normal';

COMMENT ON COLUMN public.guilda_desafios.consequencia IS
  'Se o desafio conta para algo. treino nao escreve em eventos_aluno (nao pontua, nao move '
  'rank, nao paga moeda); ranqueada e evento escrevem. Default ranqueada porque arena_encerrar '
  'ja pontuava antes desta coluna existir.';
COMMENT ON COLUMN public.guilda_desafios.dificuldade IS
  'Preset de parametros (tempo, tentativas, aposta). Ortogonal a modo, que e como se pontua: '
  'existe dificil-por-velocidade e dificil-por-precisao. Valores em app_config.';

ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_consequencia_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_consequencia_check
  CHECK (consequencia = ANY (ARRAY[{_lista(CONSEQUENCIAS)}]));

ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_dificuldade_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_dificuldade_check
  CHECK (dificuldade = ANY (ARRAY[{_lista(DIFICULDADES)}]));

-- Só a lista muda. `guilda_desafios_guilda_do_formato` e `_rival_check` continuam valendo e
-- já dão a coerência de `turma` (guilda_id nulo, sem rival) de graça.
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_formato_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_formato_check
  CHECK (formato = ANY (ARRAY[{_lista(FORMATOS)}]));

CREATE INDEX IF NOT EXISTS guilda_desafios_consequencia_idx
  ON public.guilda_desafios (classe_id, consequencia, status);

INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES
  ('desafio_tempo_seg_normal',     '60',  'Segundos por questao no desafio, dificuldade normal.', false),
  ('desafio_tempo_seg_dificil',    '30',  'Segundos por questao no desafio, dificuldade dificil.', false),
  ('desafio_tentativas_normal',    '2',   'Tentativas por questao, dificuldade normal.', false),
  ('desafio_tentativas_dificil',   '1',   'Tentativas por questao, dificuldade dificil.', false),
  ('desafio_aposta_fator_normal',  '1.0', 'Multiplicador de pontos e moedas, dificuldade normal.', false),
  ('desafio_aposta_fator_dificil', '2.0', 'Multiplicador de pontos e moedas, dificuldade dificil. '
                                          'A aposta so vale com piso: ver ranqueada_piso_pontos na fase 4.', false)
ON CONFLICT (chave) DO NOTHING;

NOTIFY pgrst, 'reload schema';
"""


ANTERIOR_SQL = f"""
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_formato_check;
ALTER TABLE public.guilda_desafios ADD CONSTRAINT guilda_desafios_formato_check
  CHECK (formato = ANY (ARRAY[{_lista(FORMATOS_ANTES)}]));

DROP INDEX IF EXISTS public.guilda_desafios_consequencia_idx;

ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_consequencia_check;
ALTER TABLE public.guilda_desafios DROP CONSTRAINT IF EXISTS guilda_desafios_dificuldade_check;
ALTER TABLE public.guilda_desafios DROP COLUMN IF EXISTS consequencia;
ALTER TABLE public.guilda_desafios DROP COLUMN IF EXISTS dificuldade;

DELETE FROM public.app_config WHERE chave IN (
  'desafio_tempo_seg_normal', 'desafio_tempo_seg_dificil',
  'desafio_tentativas_normal', 'desafio_tentativas_dificil',
  'desafio_aposta_fator_normal', 'desafio_aposta_fator_dificil'
);

NOTIFY pgrst, 'reload schema';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(ANTERIOR_SQL)
