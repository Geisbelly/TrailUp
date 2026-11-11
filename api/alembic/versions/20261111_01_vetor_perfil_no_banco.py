"""O vetor BrainHex com uma regra só no banco (fase 0b do roteiro de diversidade de perfis)

A regra de perfil representativo é a do app (`mobile/src/utils/brainHex.ts`):

    ordem          = afinidade DESC (nulo conta 0), nome ASC
    representativo = afinidade >= 20  OU  (afinidade > 0 E posição <= 2)
    dominante      = 1º da ordem; aluno sem linha em `aluno_perfil` = mastermind

O banco a repetia em cópias (`fn_perfil_da_missao`, o laço de conquista de
`trg_eventos_aluno_after_iud`), e a fila de base nem a seguia: gerava a base do 1º e do 2º de cada
aluno, inclusive do 2º com afinidade 0, e nunca a do 3º representativo — que o aluno pode escolher
como perfil ativo (`selecionarPerfilAtivo`) e então via só o conteúdo do professor.

Três funções, todas `SECURITY INVOKER` (respeitam a RLS de `aluno_perfil` de quem chama; chamadas
de dentro de uma função `SECURITY DEFINER` rodam com o dono dela):

- `app_vetor_perfil(aluno)`: o vetor na ordem, com posição e o marcador de representativo;
- `app_perfis_representativos(aluno)`: os representativos, em ordem (`text[]`, vazio sem perfil);
- `app_perfil_dominante(aluno)`: o 1º, ou `mastermind`.

`fn_perfil_da_missao` passa a usá-las. O resultado não muda: o teste e2e compara a função nova com
o corpo de `20261021_20` em vetores de produção e 60 sorteados. O laço de conquista do gatilho fica
como está — o corpo dele é conferido por md5 contra a produção e reescrevê-lo é outro PR.

Fora daqui, de propósito: o bloco de 2º perfil das coortes (`> 20`, definição do estudo #13), o
cronômetro (`fn_cronometro_ligado` trata aluno sem perfil como seeker, desligado), o desempate por
hash e a renormalização dos vetores legados que não somam 100.

Revision ID: 20261111_01
Revises: 20261110_11
Create Date: 2026-11-11
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261111_01"
down_revision = "20261110_11"
branch_labels = None
depends_on = None


FUNCOES = r"""
CREATE OR REPLACE FUNCTION public.app_vetor_perfil(p_aluno uuid)
RETURNS TABLE(perfil text, afinidade numeric, posicao integer, representativo boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  -- A regra de `rankBrainHexProfiles` + `resolveRepresentativeBrainHexProfiles` do app.
  SELECT v.perfil,
         v.afinidade,
         v.posicao::integer,
         (v.afinidade >= 20 OR (v.afinidade > 0 AND v.posicao <= 2)) AS representativo
    FROM (
      SELECT lower(btrim(p.nome)) AS perfil,
             COALESCE(ap.afinidade, 0)::numeric AS afinidade,
             row_number() OVER (
               ORDER BY COALESCE(ap.afinidade, 0) DESC, lower(btrim(p.nome)) ASC
             ) AS posicao
        FROM public.aluno_perfil ap
        JOIN public.perfil p ON p.id = ap.perfil_id
       WHERE ap.aluno_id = p_aluno
    ) v
   ORDER BY v.posicao;
$function$;

REVOKE ALL ON FUNCTION public.app_vetor_perfil(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_vetor_perfil(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_perfis_representativos(p_aluno uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(array_agg(v.perfil ORDER BY v.posicao) FILTER (WHERE v.representativo), '{}'::text[])
    FROM public.app_vetor_perfil(p_aluno) v;
$function$;

REVOKE ALL ON FUNCTION public.app_perfis_representativos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_perfis_representativos(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.app_perfil_dominante(p_aluno uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  -- `PERFIL_PADRAO` do app: aluno sem linha em `aluno_perfil` conta como mastermind.
  SELECT COALESCE((SELECT v.perfil FROM public.app_vetor_perfil(p_aluno) v WHERE v.posicao = 1), 'mastermind');
$function$;

REVOKE ALL ON FUNCTION public.app_perfil_dominante(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_perfil_dominante(uuid) TO authenticated, service_role;
"""

PERFIL_DA_MISSAO = r"""
CREATE OR REPLACE FUNCTION public.fn_perfil_da_missao(p_aluno uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  -- A regra de `perfilDaMissao` (mobile/src/services/missoes/missaoModel.ts), sem estado do app:
  -- o `perfil_ativo` salvo, se ainda for representativo; senao o 1o representativo; senao NULL.
  -- Representativo vem de `app_perfis_representativos` (20261111_01), a regra unica do vetor.
  SELECT COALESCE(
    (SELECT lower(btrim(a.perfil_ativo))
       FROM public.alunos a
      WHERE a.id = p_aluno
        AND lower(btrim(a.perfil_ativo)) = ANY (public.app_perfis_representativos(p_aluno))),
    (public.app_perfis_representativos(p_aluno))[1]
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_perfil_da_missao(uuid) FROM PUBLIC, anon, authenticated;
"""


def _perfil_da_missao_anterior() -> str:
    """O corpo de `20261021_20`, lido do próprio arquivo para o downgrade nunca divergir dele."""
    caminho = Path(__file__).with_name("20261021_20_missao_diaria_coorte_representativa_e_minutos.py")
    spec = importlib.util.spec_from_file_location("_missao_20261021_20", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo.PERFIL_DA_MISSAO


def upgrade() -> None:
    op.execute(FUNCOES)
    op.execute(PERFIL_DA_MISSAO)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(_perfil_da_missao_anterior())
    op.execute("DROP FUNCTION IF EXISTS public.app_perfis_representativos(uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.app_perfil_dominante(uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.app_vetor_perfil(uuid)")
    op.execute("NOTIFY pgrst, 'reload schema'")
