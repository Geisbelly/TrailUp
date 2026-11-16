"""Girando em falso: aluno que repete a atividade e não chega ao acerto mínimo

`prof.estagnado` (`20261031_05`) mede **tempo** sem avanço num tópico. Faltava o outro lado: o aluno
que **tenta**, várias vezes, e não sai do lugar. É o *wheel-spinning* de Beck e Gong (2013), adaptado
de 10 oportunidades de prática para 3 tentativas da atividade inteira
(`docs/analises/2026-11-15-metricas-de-uso-mercado-e-literatura.md`, P4).

## O que entra

- **`vw_metricas_girando_em_falso`**: uma linha por aluno × atividade em que o aluno tem
  **3 ou mais tentativas corrigidas** e a **melhor** ficou **abaixo de 70%**. Traz o fato e a data:
  quantas tentativas, a melhor, a última.
- **`vw_metricas_girando_em_falso_atividade`**: por atividade, quantos alunos tentaram e quantos
  estão girando em falso.
- A chave `prof.girando_em_falso` no catálogo.

## Definições

- **Tentativa corrigida:** `respondida_em` e `acertos_percentual` preenchidos. Atividade só com
  questão aberta, sem percentual, não entra: sem nota não dá para dizer que o aluno não chegou.
- **Sai do estado na primeira tentativa com 70% ou mais**, porque a conta usa a melhor.
- **70%** é ponto de partida, a recalibrar com dado de turma real.

## Quem lê

Só o professor dono. As duas views são `security_invoker` **e** filtram por
`app_classes_do_professor()`: a policy de `atividade_tentativas` deixa o aluno ler as próprias
tentativas, e sem o filtro ele leria o próprio rótulo. A spec de métricas (§6.2) não deixa mostrar
esse sinal ao aluno nem somá-lo a inatividade para formar um "crítico".

Consequência: `service_role` e a API (sem `auth.uid()`) leem zero linhas nessas views. Quem
precisar do dado fora do console lê `atividade_tentativas` direto.

Sem `%` no SQL (o SQL offline do Alembic o dobra).

## Downgrade

Derruba as duas views e remove a chave.

Revision ID: 20261115_05
Revises: 20261115_04
Create Date: 2026-11-15
"""

from alembic import op

revision = "20261115_05"
down_revision = "20261115_04"
branch_labels = None
depends_on = None

TENTATIVAS_MINIMAS = 3
ACERTO_MINIMO = 70

VIEWS = rf"""
CREATE VIEW public.vw_metricas_girando_em_falso WITH (security_invoker = on) AS
SELECT t.classe_id,
       t.atividade_id,
       t.aluno_id,
       count(*) AS tentativas,
       max(t.acertos_percentual) AS melhor_percentual,
       max(t.respondida_em) AS ultima_tentativa_em
  FROM public.atividade_tentativas t
 WHERE t.respondida_em IS NOT NULL
   AND t.acertos_percentual IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = t.classe_id)
 GROUP BY t.classe_id, t.atividade_id, t.aluno_id
HAVING count(*) >= {TENTATIVAS_MINIMAS}
   AND max(t.acertos_percentual) < {ACERTO_MINIMO};

CREATE VIEW public.vw_metricas_girando_em_falso_atividade WITH (security_invoker = on) AS
WITH por_aluno AS (
  SELECT t.classe_id,
         t.atividade_id,
         t.aluno_id,
         count(*) AS tentativas,
         max(t.acertos_percentual) AS melhor_percentual
    FROM public.atividade_tentativas t
   WHERE t.respondida_em IS NOT NULL
     AND t.acertos_percentual IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = t.classe_id)
   GROUP BY t.classe_id, t.atividade_id, t.aluno_id
)
SELECT p.classe_id,
       p.atividade_id,
       count(*) AS alunos_que_tentaram,
       count(*) FILTER (WHERE p.tentativas >= {TENTATIVAS_MINIMAS} AND p.melhor_percentual < {ACERTO_MINIMO})
         AS alunos_girando_em_falso
  FROM por_aluno p
 GROUP BY p.classe_id, p.atividade_id;

COMMENT ON VIEW public.vw_metricas_girando_em_falso IS
  'Aluno x atividade com {TENTATIVAS_MINIMAS} ou mais tentativas corrigidas e a melhor abaixo de {ACERTO_MINIMO}. So o professor dono le; nunca mostrar ao aluno.';
COMMENT ON VIEW public.vw_metricas_girando_em_falso_atividade IS
  'Por atividade: quantos alunos tentaram e quantos estao girando em falso. So o professor dono le.';

REVOKE ALL ON public.vw_metricas_girando_em_falso, public.vw_metricas_girando_em_falso_atividade FROM anon;
GRANT SELECT ON public.vw_metricas_girando_em_falso, public.vw_metricas_girando_em_falso_atividade TO authenticated;
"""

CATALOGO = """
INSERT INTO public.metricas_catalogo
  (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)
VALUES
  ('prof.girando_em_falso', 'Girando em falso',
   'Alunos com 3 ou mais tentativas corrigidas na mesma atividade e a melhor abaixo de 70 por cento.',
   '{professor}', 'contagem', 'estado atual', 'vw_metricas_girando_em_falso',
   'ninguém com 3 tentativas corrigidas', 'nenhuma', '{}')
ON CONFLICT (chave) DO UPDATE SET
  nome = EXCLUDED.nome, descricao = EXCLUDED.descricao, publico = EXCLUDED.publico, unidade = EXCLUDED.unidade,
  janela = EXCLUDED.janela, fonte = EXCLUDED.fonte, nulo_significa = EXCLUDED.nulo_significa,
  requer_validacao = EXCLUDED.requer_validacao, invariantes = EXCLUDED.invariantes;
"""

DOWNGRADE = """
DROP VIEW IF EXISTS public.vw_metricas_girando_em_falso_atividade;
DROP VIEW IF EXISTS public.vw_metricas_girando_em_falso;
DELETE FROM public.metricas_catalogo WHERE chave = 'prof.girando_em_falso';
"""


def upgrade() -> None:
    op.execute(DOWNGRADE.split("DELETE")[0])
    op.execute(VIEWS)
    op.execute(CATALOGO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(DOWNGRADE)
    op.execute("NOTIFY pgrst, 'reload schema'")
