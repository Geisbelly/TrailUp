"""Turma de demonstração da pesquisa: tópicos publicados como na turma-modelo

`pesquisa_preparar_avaliador` (`20261123_01`) copia a turma-modelo com `duplicar_classe`, e desde a
`20261110_10` todo tópico copiado nasce `rascunho`: decisão de produto, para o professor revisar o
que duplicou antes de o aluno ver. Na turma de demonstração isso deixava a trilha invisível para o
aluno de teste, e as tarefas do roteiro feitas como aluno (estudar a trilha, ver o jogo) não teriam
o que mostrar.

A correção fica na função da pesquisa, não em `duplicar_classe`: para o professor que duplica a
própria turma, o rascunho continua sendo o comportamento certo. Depois da cópia, cada tópico recebe
a `publicacao` e o `publicar_em` do tópico correspondente da turma-modelo. `duplicar_classe` não
devolve o mapa de ids, então o par é feito por `nome` e `ordem`, que ela copia sem mudar. Tópico da
modelo em rascunho continua em rascunho na cópia: quem decide o que o avaliador vê é a turma-modelo.

Avaliador já preparado não é retocado aqui (a função é idempotente e devolve cedo para ele). Se
algum tiver sido preparado com a `20261123_01` sozinha, publique a trilha da turma dele pelo console.

Publicar não regera personalização: `trg_topicos_class_delta_job` não olha `publicacao`
(`20261110_10`).
"""

from alembic import op

revision = "20261123_02"
down_revision = "20261123_01"
branch_labels = None
depends_on = None

SQL = r"""
CREATE OR REPLACE FUNCTION public.pesquisa_preparar_avaliador(
  p_email text,
  p_nome text,
  p_instituicao text,
  p_professor uuid,
  p_aluno uuid,
  p_aluno_email text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_existente public.pesquisa_avaliador%ROWTYPE;
  v_modelo_txt text;
  v_modelo bigint;
  v_dono uuid;
  v_claims text;
  v_sub text;
  v_nova bigint;
  v_nome text := btrim(coalesce(p_nome, ''));
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' OR p_professor IS NULL OR p_aluno IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'E-mail, nome, professor e aluno de teste são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  -- Idempotente: a planilha pode mandar o mesmo avaliador de novo (gatilho e clique juntos).
  SELECT * INTO v_existente FROM public.pesquisa_avaliador WHERE lower(email) = lower(btrim(p_email));
  IF FOUND THEN
    RETURN jsonb_build_object('ja_existia', true, 'classe_id', v_existente.classe_id,
                              'situacao', v_existente.situacao);
  END IF;

  SELECT valor INTO v_modelo_txt FROM public.app_config WHERE chave = 'pesquisa_classe_modelo_id';
  IF v_modelo_txt IS NULL OR v_modelo_txt !~ '^[0-9]{1,18}$' THEN
    RAISE EXCEPTION 'Configure app_config.pesquisa_classe_modelo_id com o id da turma-modelo.'
      USING ERRCODE = '22023';
  END IF;
  v_modelo := v_modelo_txt::bigint;

  SELECT professor_id INTO v_dono FROM public.classe WHERE id = v_modelo;
  IF v_dono IS NULL THEN
    RAISE EXCEPTION 'A turma-modelo % não existe ou não tem professor.', v_modelo USING ERRCODE = '22023';
  END IF;

  -- INSERT já liberado: um UPDATE de liberado esbarraria em professor_block_self_approve.
  INSERT INTO public.professor (id, nome, descricao, instituicao, liberado)
  VALUES (p_professor, v_nome, 'Avaliador(a) da pesquisa com professores',
          nullif(btrim(coalesce(p_instituicao, '')), ''), true);

  -- duplicar_classe confere a posse por auth.uid(): durante a cópia, as claims são as do dono da
  -- turma-modelo. Local à transação (is_local = true) e restauradas em seguida.
  v_claims := current_setting('request.jwt.claims', true);
  v_sub := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_dono::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_dono::text, true);
  v_nova := public.duplicar_classe(v_modelo);
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  UPDATE public.classe
     SET professor_id = p_professor,
         descricao = 'Turma de demonstração – ' || v_nome
   WHERE id = v_nova;

  -- A cópia nasce em rascunho (decisão de produto da 20261110_10 para as funções de duplicar), e o
  -- aluno de teste não veria a trilha. Aqui a cópia mostra cada tópico como a turma-modelo mostra.
  -- duplicar_classe não devolve o mapa de ids: o par é por nome e ordem, que ela copia como estão.
  UPDATE public.topicos n
     SET publicacao = m.publicacao,
         publicar_em = m.publicar_em
    FROM public.topicos m
   WHERE n.classe_id = v_nova
     AND m.classe_id = v_modelo
     AND m.nome = n.nome
     AND m.ordem IS NOT DISTINCT FROM n.ordem;

  INSERT INTO public.pesquisa_avaliador (email, nome, instituicao, professor_id, aluno_teste_id,
                                         aluno_teste_email, classe_id)
  VALUES (lower(btrim(p_email)), v_nome, nullif(btrim(coalesce(p_instituicao, '')), ''), p_professor,
          p_aluno, lower(btrim(p_aluno_email)), v_nova);

  RETURN jsonb_build_object('ja_existia', false, 'classe_id', v_nova, 'situacao', 'conta_criada');
END;
$function$;
"""

# Volta ao corpo da 20261123_01, sem a publicação dos tópicos.
DOWNGRADE_SQL = r"""
CREATE OR REPLACE FUNCTION public.pesquisa_preparar_avaliador(
  p_email text,
  p_nome text,
  p_instituicao text,
  p_professor uuid,
  p_aluno uuid,
  p_aluno_email text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $function$
DECLARE
  v_existente public.pesquisa_avaliador%ROWTYPE;
  v_modelo_txt text;
  v_modelo bigint;
  v_dono uuid;
  v_claims text;
  v_sub text;
  v_nova bigint;
  v_nome text := btrim(coalesce(p_nome, ''));
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' OR p_professor IS NULL OR p_aluno IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'E-mail, nome, professor e aluno de teste são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  -- Idempotente: a planilha pode mandar o mesmo avaliador de novo (gatilho e clique juntos).
  SELECT * INTO v_existente FROM public.pesquisa_avaliador WHERE lower(email) = lower(btrim(p_email));
  IF FOUND THEN
    RETURN jsonb_build_object('ja_existia', true, 'classe_id', v_existente.classe_id,
                              'situacao', v_existente.situacao);
  END IF;

  SELECT valor INTO v_modelo_txt FROM public.app_config WHERE chave = 'pesquisa_classe_modelo_id';
  IF v_modelo_txt IS NULL OR v_modelo_txt !~ '^[0-9]{1,18}$' THEN
    RAISE EXCEPTION 'Configure app_config.pesquisa_classe_modelo_id com o id da turma-modelo.'
      USING ERRCODE = '22023';
  END IF;
  v_modelo := v_modelo_txt::bigint;

  SELECT professor_id INTO v_dono FROM public.classe WHERE id = v_modelo;
  IF v_dono IS NULL THEN
    RAISE EXCEPTION 'A turma-modelo % não existe ou não tem professor.', v_modelo USING ERRCODE = '22023';
  END IF;

  -- INSERT já liberado: um UPDATE de liberado esbarraria em professor_block_self_approve.
  INSERT INTO public.professor (id, nome, descricao, instituicao, liberado)
  VALUES (p_professor, v_nome, 'Avaliador(a) da pesquisa com professores',
          nullif(btrim(coalesce(p_instituicao, '')), ''), true);

  -- duplicar_classe confere a posse por auth.uid(): durante a cópia, as claims são as do dono da
  -- turma-modelo. Local à transação (is_local = true) e restauradas em seguida.
  v_claims := current_setting('request.jwt.claims', true);
  v_sub := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_dono::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_dono::text, true);
  v_nova := public.duplicar_classe(v_modelo);
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  UPDATE public.classe
     SET professor_id = p_professor,
         descricao = 'Turma de demonstração – ' || v_nome
   WHERE id = v_nova;

  INSERT INTO public.pesquisa_avaliador (email, nome, instituicao, professor_id, aluno_teste_id,
                                         aluno_teste_email, classe_id)
  VALUES (lower(btrim(p_email)), v_nome, nullif(btrim(coalesce(p_instituicao, '')), ''), p_professor,
          p_aluno, lower(btrim(p_aluno_email)), v_nova);

  RETURN jsonb_build_object('ja_existia', false, 'classe_id', v_nova, 'situacao', 'conta_criada');
END;
$function$;
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    op.execute(DOWNGRADE_SQL)
