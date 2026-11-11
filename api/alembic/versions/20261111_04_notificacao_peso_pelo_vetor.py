"""O peso do perfil na ordem das notificações sai dos perfis representativos (fase 3 do roteiro)

Desde a `20261105_04`, a ordem entre pendentes do mesmo aluno é
`GREATEST(prioridade da pendente, base do tipo) + notificacoes_peso_perfil(aluno, tipo)`. O peso vinha
da matriz de Monterrat lida **só no perfil da tela** (`notificacoes_perfil_do_aluno`). Um aluno 90
Socializer que escolheu Mastermind na tela recebia rank antes de amigo_rank, como se o resto do vetor
não existisse.

Agora, com `perfil_peso_modo = representativos` (o valor que esta migration grava):

    peso = soma(afinidade x matriz[perfil]) / soma(afinidade), sobre os perfis representativos

- **Representativo** é a regra única de `app_vetor_perfil` (#1107), a mesma da mistura de material.
- **Perfil que a matriz não lista** conta 0 e puxa a média para baixo, como já contava no perfil da
  tela.
- **Por que não o vetor inteiro:** as matrizes são esparsas, e os 5 perfis de fora pesariam 0 em
  todo tipo. Medido em produção (11/11), o peso do rank cairia de 1,0 para 0,45 num aluno, e todo
  tipo da matriz ficaria abaixo do neutro 0,5 dos tipos sem matriz, invertendo a ordem que a matriz
  existe para dar. Só com os representativos, a escala segue de 0 a 1. Nos 6 alunos de produção, a
  ordem dos 4 tipos com matriz muda para 2.
- **O texto não muda:** voz, guia e nome continuam no perfil da tela. Só a ordem passa a usar o
  vetor.
- **Aluno sem vetor**, chave ausente ou com valor desconhecido: vale o peso de antes, pelo perfil da
  tela. Voltar atrás é `UPDATE notificacoes_config SET valor = 'tela'`.
- `perfil_peso_minimo_pct` segue em 0 (só ordena, não corta; decisão de 05/11). Se o corte voltar,
  lembre que o peso agora tem frações: 0,455, por exemplo, seria cortado por um mínimo de 50.

`app_vetor_perfil` é `SECURITY INVOKER` e aqui é chamada de dentro de uma função `SECURITY DEFINER`,
então roda com o dono, como o resto do motor (o motor roda sem sessão de aluno).

`Socialiser` é traduzido para `socializer`, como em `notificacoes_perfil_do_aluno`: produção grava
`socializer`, mas bancos antigos e os testes do motor grafavam assim.

Revision ID: 20261111_04
Revises: 20261111_03
Create Date: 2026-11-11
"""

from alembic import op

revision = "20261111_04"
down_revision = "20261111_03"
branch_labels = None
depends_on = None


CONFIG = """
INSERT INTO public.notificacoes_config (chave, valor, descricao) VALUES
  ('perfil_peso_modo', 'representativos',
   'De onde sai o peso do perfil na ordem das notificacoes: tela (so o perfil da tela) ou '
   'representativos (media da matriz nos perfis representativos, pela afinidade). Outro valor = tela.')
ON CONFLICT (chave) DO NOTHING;
"""

PESO = r"""
-- Peso do perfil para o tipo, de 0 a 1. Tipo fora da matriz: 0,5 (neutro).
CREATE OR REPLACE FUNCTION public.notificacoes_peso_perfil(p_aluno uuid, p_tipo text)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_texto text := public.notificacoes_cfg_txt('perfil_pesos_' || COALESCE(p_tipo, ''), '');
  v_pesos jsonb;
  v_peso numeric;
BEGIN
  IF v_texto = '' THEN
    RETURN 0.5;
  END IF;
  v_pesos := v_texto::jsonb;

  IF public.notificacoes_cfg_txt('perfil_peso_modo', 'tela') = 'representativos' THEN
    SELECT sum(v.afinidade * LEAST(1, GREATEST(0, COALESCE(
               (v_pesos ->> CASE WHEN v.perfil = 'socialiser' THEN 'socializer' ELSE v.perfil END)::numeric,
               0))))
           / NULLIF(sum(v.afinidade), 0)
      INTO v_peso
      FROM public.app_vetor_perfil(p_aluno) v
     WHERE v.representativo;
    IF v_peso IS NOT NULL THEN
      RETURN LEAST(1, GREATEST(0, v_peso));
    END IF;
    -- Sem vetor: o peso de antes, pelo perfil da tela.
  END IF;

  RETURN LEAST(1, GREATEST(0, COALESCE(
    (v_pesos ->> public.notificacoes_perfil_do_aluno(p_aluno))::numeric, 0)));
EXCEPTION WHEN OTHERS THEN
  RETURN 0.5;  -- matriz ilegível não muda a ordem de ninguém
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_peso_perfil(uuid, text) FROM PUBLIC, anon, authenticated;
"""

# O corpo da `20261105_04`, sem mudança.
PESO_ANTERIOR = r"""
CREATE OR REPLACE FUNCTION public.notificacoes_peso_perfil(p_aluno uuid, p_tipo text)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_pesos text := public.notificacoes_cfg_txt('perfil_pesos_' || COALESCE(p_tipo, ''), '');
BEGIN
  IF v_pesos = '' THEN
    RETURN 0.5;
  END IF;
  RETURN LEAST(1, GREATEST(0, COALESCE(
    (v_pesos::jsonb ->> public.notificacoes_perfil_do_aluno(p_aluno))::numeric, 0)));
EXCEPTION WHEN OTHERS THEN
  RETURN 0.5;  -- matriz ilegível não muda a ordem de ninguém
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_peso_perfil(uuid, text) FROM PUBLIC, anon, authenticated;
"""


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(PESO)


def downgrade() -> None:
    op.execute(PESO_ANTERIOR)
    op.execute("DELETE FROM public.notificacoes_config WHERE chave = 'perfil_peso_modo'")
