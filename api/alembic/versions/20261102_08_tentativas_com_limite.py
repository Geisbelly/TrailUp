"""Toda atividade tem limite de tentativas, e a segunda chance da loja espera a tentativa grátis acabar (#136)

## Por quê

Até aqui, `atividades.tentativas_max` NULL queria dizer "ilimitadas", e era o padrão de toda
atividade. O app, por outro lado, só abria a atividade concluída de novo pela segunda chance da
loja ou pela revisão pedida pelo professor: o limite do console não chegava ao aluno.

## Decisões (02/11, Geisbelly)

1. **Toda atividade tem limite.** NULL deixa de existir: o padrão é 3, como no quiz do estudo UCT.
   O professor continua escolhendo de 1 a 99.
2. **A nova tentativa refaz só as questões erradas**, não a atividade inteira. Isso é do app; o
   banco continua contando uma tentativa por conclusão.
3. **A segunda chance da loja não pode ser usada enquanto houver tentativa grátis**, para o aluno
   não gastar um item comprado no que já é dele.

## O que entra

- `atividades.tentativas_max`: `DEFAULT 3`, as linhas NULL viram 3, e `NOT NULL`. O gatilho
  `trg_atividades_tentativas_padrao` troca NULL pelo padrão em vez de recusar: o console publicado
  antes desta migration manda `tentativas_max: null` sempre que o campo fica vazio, e o salvamento
  do professor não pode quebrar enquanto o espelho estiver atrás.
- `fn_tentativas_livres(aluno, atividade)`: tentativas que o aluno ainda nem abriu. A aberta conta
  como usada.
- `atividade_situacao_tentativas(atividade)`: para o app decidir se mostra "Refazer as questões
  erradas". Devolve o máximo, as respondidas, se há uma aberta e quantas ainda podem ser
  respondidas. Leitura do banco, sem a API.
- `fn_loja_checa_limite` (a regra de limite que `loja_usar` e `loja_usos_permitidos` usam)
  devolve o bloqueio `tem_tentativa_livre` para item de efeito `segunda_chance` enquanto
  `fn_tentativas_livres > 0`. O bloqueio sai antes de a compra ser consumida, e a vitrine de uso
  vê o mesmo bloqueio. O texto vem de `20261020_06` com um trecho a mais, e o downgrade volta a
  ele.

`atividade_iniciar_tentativa` e `atividade_responder_tentativa` não mudam: já conferem
`tentativas_max`, que agora nunca é NULL.

Sem `%` no SQL (o SQL offline do Alembic o dobra).

Revision ID: 20261102_08
Revises: 20261102_07
Create Date: 2026-11-02
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261102_08"
down_revision = "20261102_07"
branch_labels = None
depends_on = None

# O quiz do estudo UCT tinha três tentativas.
TENTATIVAS_PADRAO = 3

PADRAO = f"""
CREATE OR REPLACE FUNCTION public.fn_atividades_tentativas_padrao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- NULL era "ilimitadas". O console de antes desta migration ainda o manda com o campo vazio.
  NEW.tentativas_max := COALESCE(NEW.tentativas_max, {TENTATIVAS_PADRAO});
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_atividades_tentativas_padrao ON public.atividades;
CREATE TRIGGER trg_atividades_tentativas_padrao
  BEFORE INSERT OR UPDATE OF tentativas_max ON public.atividades
  FOR EACH ROW EXECUTE FUNCTION public.fn_atividades_tentativas_padrao();

ALTER TABLE public.atividades ALTER COLUMN tentativas_max SET DEFAULT {TENTATIVAS_PADRAO};
UPDATE public.atividades SET tentativas_max = {TENTATIVAS_PADRAO} WHERE tentativas_max IS NULL;
ALTER TABLE public.atividades ALTER COLUMN tentativas_max SET NOT NULL;
COMMENT ON COLUMN public.atividades.tentativas_max IS
  'Tentativas permitidas por aluno; padrao {TENTATIVAS_PADRAO}, nunca ilimitadas (#136, 20261102_08).';
"""

FUNCOES = r"""
CREATE OR REPLACE FUNCTION public.fn_tentativas_livres(p_aluno uuid, p_atividade bigint)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- A tentativa aberta conta como usada: livre é a que o aluno ainda nem começou.
  SELECT greatest(0, a.tentativas_max - (
           SELECT count(*)::integer FROM public.atividade_tentativas t
            WHERE t.aluno_id = p_aluno AND t.atividade_id = a.id))
    FROM public.atividades a
   WHERE a.id = p_atividade;
$function$;
REVOKE ALL ON FUNCTION public.fn_tentativas_livres(uuid, bigint) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.atividade_situacao_tentativas(p_atividade bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno uuid := auth.uid();
  v_classe bigint;
  v_max integer;
  v_feitas integer;
  v_aberta boolean;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;

  SELECT t.classe_id, a.tentativas_max INTO v_classe, v_max
    FROM public.atividades a JOIN public.topicos t ON t.id = a.topico_id
   WHERE a.id = p_atividade;
  IF v_classe IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.classe_aluno ca WHERE ca.classe_id = v_classe AND ca.aluno_id = v_aluno) THEN
    RAISE EXCEPTION 'sem_matricula' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) FILTER (WHERE respondida_em IS NOT NULL), COALESCE(bool_or(respondida_em IS NULL), false)
    INTO v_feitas, v_aberta
    FROM public.atividade_tentativas
   WHERE aluno_id = v_aluno AND atividade_id = p_atividade;

  RETURN jsonb_build_object(
    'maximo', v_max,
    'feitas', v_feitas,
    'aberta', v_aberta,
    -- A aberta ainda pode ser respondida, então entra aqui.
    'restantes', greatest(0, v_max - v_feitas)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.atividade_situacao_tentativas(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atividade_situacao_tentativas(bigint) TO authenticated;
"""

ANCORA = """BEGIN
  SELECT * INTO v_lim FROM public.fn_loja_limites(p_classe, p_item, p_atividade, p_topico);
"""

TRECHO_TENTATIVA_LIVRE = """BEGIN
  -- Tentativa grátis vem antes do item comprado (#136, 20261102_08): com tentativa sobrando, a
  -- segunda chance seria pagar pelo que já é do aluno.
  IF p_atividade IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.loja_itens i WHERE i.codigo = p_item AND i.efeito = 'segunda_chance')
     AND public.fn_tentativas_livres(p_aluno, p_atividade) > 0 THEN
    RETURN jsonb_build_object('bloqueio', 'tem_tentativa_livre', 'limite', NULL, 'usados', NULL, 'restantes', 0);
  END IF;

  SELECT * INTO v_lim FROM public.fn_loja_limites(p_classe, p_item, p_atividade, p_topico);
"""


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def checa_limite_anterior() -> str:
    """`fn_loja_checa_limite` como a `20261020_06` a deixa (a última que a define)."""
    limites = _modulo("20261020_06_loja_quantidade_e_limites_de_uso.py").LIMITES
    inicio = limites.index("CREATE OR REPLACE FUNCTION public.fn_loja_checa_limite(")
    fim_revoke = "REVOKE ALL ON FUNCTION public.fn_loja_checa_limite(uuid, bigint, text, bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;"
    fim = limites.index(fim_revoke, inicio) + len(fim_revoke)
    return limites[inicio:fim]


def checa_limite_novo() -> str:
    anterior = checa_limite_anterior()
    if anterior.count(ANCORA) != 1:
        raise RuntimeError("fn_loja_checa_limite mudou de forma; revise a 20261102_08")
    return anterior.replace(ANCORA, TRECHO_TENTATIVA_LIVRE, 1)


def upgrade() -> None:
    op.execute(PADRAO)
    op.execute(FUNCOES)
    op.execute(checa_limite_novo())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(checa_limite_anterior())
    op.execute("DROP FUNCTION IF EXISTS public.atividade_situacao_tentativas(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_tentativas_livres(uuid, bigint)")
    op.execute("DROP TRIGGER IF EXISTS trg_atividades_tentativas_padrao ON public.atividades")
    op.execute("DROP FUNCTION IF EXISTS public.fn_atividades_tentativas_padrao()")
    # As linhas que eram NULL ficam com o padrão: não há como saber quais eram.
    op.execute("ALTER TABLE public.atividades ALTER COLUMN tentativas_max DROP NOT NULL")
    op.execute("ALTER TABLE public.atividades ALTER COLUMN tentativas_max DROP DEFAULT")
    op.execute("NOTIFY pgrst, 'reload schema'")
