"""Conta de demonstração volta ao vetor BrainHex medido, sem o empate em 10 que a travou

## O estado

A conta de demonstração (`demo@trailup.app`, a mesma do #1044) tem os 7 perfis com afinidade
10,00. Medido em produção em 20/11 (`READ ONLY`), é o único aluno do banco com o vetor todo igual, e
ele não veio de quiz nem do código:

- mastermind e conqueror valiam **85** e **60** em 10/09 (medidos no `28f92cea`) e hoje valem 10 com
  `atualizado_em` de 2025. O único gravador da API (`PerfilRepository.atualizar_afinidades`) carimba
  `atualizado_em`, e `aluno_perfil` não tem gatilho: a troca foi feita fora do código;
- as outras 5 linhas nasceram em 06/11, entre 20:35 e 20:36, uma a cada ~13 s, 8 minutos depois do
  merge do #1044. O default da coluna é 0, então o 10 foi digitado. O #1044 diz que "as linhas em
  `aluno_perfil` não mudam": a escolha entre os 7 perfis é só na tela;
- não há medida em `aluno_perfil_medida` para essa conta.

O empate não é neutro. Os representativos desempatam por nome, então achiever passou a dominar a
conta, o gatilho reabriu as conquistas de achiever, e, somado à I13, cada evento dela abortou de
06/11 até a `20261120_01`.

## O que faz

Volta mastermind a 85 e conqueror a 60, e põe as outras 5 em **0**, sem apagar:

- **0 em vez de apagar.** Com afinidade 0 o perfil nunca é representativo (`af >= 20` ou
  `af > 0` entre os dois primeiros), que é o efeito de não ter a linha; e as 7 linhas mantêm a
  invariante I14 ("vetor BrainHex completo") satisfeita para a conta.
- **Guarda.** Só age se o vetor da conta ainda for exatamente 7 linhas em 10,00. Se alguém já mexeu,
  não faz nada. Rodar de novo também não faz nada.
- A conta é achada pelo id, com o e-mail conferido na mesma linha: se o id não for o de
  `demo@trailup.app`, não faz nada.

## Downgrade

Não desfaz. Voltar ao empate traria de volta o dominante errado.

Revision ID: 20261120_05
Revises: 20261120_04
Create Date: 2026-11-20
"""

from alembic import op

revision = "20261120_05"
down_revision = "20261120_04"
branch_labels = None
depends_on = None

CONTA = "b49f2e21-a6f9-4c8d-9533-5a32bb219754"
EMAIL = "demo@trailup.app"
MEDIDO = {"mastermind": 85, "conqueror": 60}  # `28f92cea`, 10/09

RESTAURA = f"""
DO $migracao$
DECLARE
  v_aluno uuid;
BEGIN
  SELECT a.id INTO v_aluno
    FROM public.alunos a
   WHERE a.id = '{CONTA}'::uuid
     AND lower(a.email) = '{EMAIL}';
  IF v_aluno IS NULL THEN
    RETURN;
  END IF;

  -- Guarda: só o empate de 06/11, exatamente como medido em 20/11.
  IF (SELECT count(*) FROM public.aluno_perfil WHERE aluno_id = v_aluno) <> 7
     OR EXISTS (SELECT 1 FROM public.aluno_perfil WHERE aluno_id = v_aluno AND afinidade <> 10) THEN
    RETURN;
  END IF;

  UPDATE public.aluno_perfil ap
     SET afinidade = CASE lower(p.nome)
                       WHEN 'mastermind' THEN {MEDIDO["mastermind"]}
                       WHEN 'conqueror' THEN {MEDIDO["conqueror"]}
                       ELSE 0
                     END,
         atualizado_em = now()
    FROM public.perfil p
   WHERE p.id = ap.perfil_id
     AND ap.aluno_id = v_aluno;
END;
$migracao$;
"""


def upgrade() -> None:
    op.execute(RESTAURA)


def downgrade() -> None:
    pass
